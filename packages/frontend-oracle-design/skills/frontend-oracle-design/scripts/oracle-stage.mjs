#!/usr/bin/env node

// 작성 그래프 — 잠그기 전 "어디까지 왔나"는 저장하지 않고 부를 때마다 파일에서 계산한다. 결정적 노드를 순서대로 평가한다:
// Formal은 패키지(model 단계 완결), 모델(파생·교차검증·적정성·증명·법칙, 같은 입력의 통과는 영수증), 카드(생성 영역 재생성
// 비교와 lock의 Draft lint), Contract는 승인(User Confirmation과 엄격한 Space)과 카드 lint. 판정은 새로 하지 않고 기존 검사를
// 부른다. 위치 이름(DISCOVERING~DRAFTED)은 처음 실패하는 노드에서 나오고, 리뷰 노드는 oracle-step.mjs가 그 사이에 끼운다.
// 잠금(oracle-lock.mjs create)이 유일한 확정이다: 기록한 단계를 믿지 않고 지금 바이트로 결정적 노드를 모두 다시 돈다.
// stage.json은 잠금 기록(ORACLE_READY와 잠근 바이트의 digest), 프로필(hook이 읽는다), oracle-step.mjs가 남기는 최근 검사
// (반복 감지)와 리뷰 라운드만 든다. 0.126 기록의 단계·라운드·되감기는 읽지만 위치에 쓰지 않는다. 직접 쓰기는 hook이 막는다.

import { spawnSync } from 'node:child_process'
import { lstat, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { elapsedLabel, repositoryRoot, sha256, stableStringify, withDirectoryLock } from './oracle-fs.mjs'
import { readCardProfile, resolveProfileBinding } from './oracle-profile.mjs'
import { isEmptyCell, markdownLines, sectionLines } from './oracle-space.mjs'

export const STAGES = ['DISCOVERING', 'MODELED', 'CHECKED', 'DRAFTED', 'ORACLE_READY']
export const AUTHORING_STAGES = Object.freeze({
  'formal-bend/v1': Object.freeze([...STAGES]),
  'contract/v1': Object.freeze(['DISCOVERING', 'CHECKED', 'DRAFTED', 'ORACLE_READY']),
})
export const STAGE_FILE = 'stage.json'
// 컨트롤러가 보여 주는 6단계 — 작성 위치와 Delivery 상태(run-state.json) 위의 보기일 뿐 상태 기계가 아니다.
// 진행 한 줄(두 스크립트의 status --brief, guide)이 이 표 하나를 같이 쓴다.
export const PHASES = Object.freeze(['Intake', 'Model', 'Card review and lock', 'RED', 'GREEN', 'Review and close'])
const PHASE_OF_STATE = Object.freeze({
  DISCOVERING: 2,
  MODELED: 2,
  CHECKED: 2,
  DRAFTED: 3,
  ORACLE_READY: 4,
  VALID_RED: 5,
  IMPLEMENTED_GREEN: 6,
  REVIEW_VERIFIED: 6,
  PARTIAL_VERIFIED: 6,
  NEEDS_DECISION: 6,
  FAIL: 6,
})

/** `phase N/6 <name> · next: <command>` — 작성 기록이 없으면(첫 step 전) Intake다. */
export function phaseLine(state, next) {
  const index = state === null ? 1 : PHASE_OF_STATE[state]
  if (!index) throw new Error(`no phase for state ${state}`)
  return `phase ${index}/${PHASES.length} ${PHASES[index - 1]} · next: ${next}`
}

/**
 * 그래프 — 프로필마다 순서대로. 결정적 노드는 실패할 때의 위치 이름(label)을 갖고, 리뷰 노드(review)는 독립 리뷰어의
 * 반환을 기다린다(잠금은 리뷰를 확인하지 않는다). 리뷰는 입력 digest마다 한 라운드다. 조건부 리뷰(conditional: source-aware)는
 * card/policy-sources.md의 계기가 정하므로 저장된 첫 반환이 연다 — 그 전에는 oracle-step.mjs가 조건과 함께 이름만 댄다.
 */
export const GRAPH = Object.freeze({
  'formal-bend/v1': Object.freeze([
    { id: 'package', label: 'DISCOVERING' },
    { id: 'model-analyst', review: true },
    { id: 'model', label: 'MODELED' },
    { id: 'card', label: 'CHECKED' },
    { id: 'cold-read', review: true },
    { id: 'reverse-impossible', review: true },
    { id: 'source-aware', review: true, conditional: true },
  ]),
  'contract/v1': Object.freeze([
    { id: 'cold-read', review: true },
    { id: 'source-aware', review: true, conditional: true },
    { id: 'confirmation', label: 'DISCOVERING' },
    { id: 'card', label: 'CHECKED' },
  ]),
})
// status가 라운드를 보이는 리뷰 종류 — 번역표 리뷰는 그래프 노드가 아니라 모델 노드의 문제(cross-check-unreviewed)가 부른다
const ROUND_KINDS = ['model-analyst', 'translation', 'cold-read', 'reverse-impossible', 'source-aware']
// 리뷰 종류마다 라운드 상한 — 라운드는 새 입력 digest에 대해 저장된 반환 하나다(같은 digest는 라운드를 더하지 않는다)
export const REVIEW_ROUNDS = 2
// 같은 실패 목록이 고친 파일 상태 세 개에서 연달아 나오면 oracle-step.mjs가 멈추고 사용자에게 넘긴다(새 상한이 아니라 감지)
export const SAME_ISSUES_STOP = 3
// 반복 감지에 쓰는 최근 검사 수
const CHECK_LIMIT = 20

const PACKAGE_FILE = 'oracle.package.json'
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const packageScript = join(SCRIPTS, 'oracle-package.mjs')
const verifyScript = join(SCRIPTS, 'oracle-verify.mjs')

// 기록의 시각 — 판정에는 쓰지 않고, 위치별 리드타임과 진행 한 줄만 이것으로 계산한다
const now = () => new Date().toISOString() // oracle:nondeterminism 기록은 실제 시각을 남긴다

class StageError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

/** 스키마 버전 1의 객체이고, 단계가 있으면 아는 이름이다. */
function isRecord(record) {
  if (record === null || typeof record !== 'object' || record.schemaVersion !== 1) return false
  return record.stage === undefined || STAGES.includes(record.stage)
}

/**
 * stage.json — 없으면 null. 스키마 버전과 잠금 기록(stage가 있으면 단계 이름)만 확인한다. 0.126 기록의 iterations·rewinds·
 * dispatches·history는 그대로 읽히고 위치 계산에 쓰이지 않는다.
 */
export async function readStage(directory) {
  let record
  try {
    record = JSON.parse(await readFile(join(directory, STAGE_FILE), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new StageError('STAGE_INVALID', `${STAGE_FILE} cannot be read: ${error.message}`)
  }
  if (!isRecord(record)) throw new StageError('STAGE_INVALID', `${STAGE_FILE} does not match schema version 1`)
  if (record.verificationProfile !== undefined) resolveProfileBinding({ bindings: [{ artifact: 'stage', profile: record.verificationProfile }] })
  if (!Array.isArray(record.history)) record.history = []
  return record
}

async function writeStage(directory, record) {
  const target = join(directory, STAGE_FILE)
  const staging = `${target}.${process.pid}.tmp`
  await writeFile(staging, `${JSON.stringify(record, null, 2)}\n`)
  await rename(staging, target)
}

const packageBytes = (directory) => readFile(join(directory, PACKAGE_FILE)).catch(() => null)

const cardBytes = (directory) => readFile(join(directory, 'oracle.md')).catch((error) => {
  if (error.code === 'ENOENT') return null
  throw error
})

async function bindingAt(directory, record, requestedProfile) {
  const card = await cardBytes(directory)
  const bindings = []
  if (card) bindings.push({ artifact: 'card', profile: readCardProfile(card.toString('utf8')) })
  if (record) bindings.push({ artifact: 'stage', profile: record.verificationProfile })
  if (!bindings.length && requestedProfile === undefined) bindings.push({ artifact: 'stage', profile: null })
  return resolveProfileBinding({ requestedProfile, bindings })
}

/** 이 오라클의 프로필 바인딩 — 카드와 기록이 말하는 것. 그래프는 Contract가 아니면 Formal이다. */
export async function bindingOf(directory, requestedProfile) {
  return bindingAt(directory, await readStage(directory), requestedProfile)
}

const graphProfile = (binding) => (binding.profile === 'contract/v1' ? 'contract/v1' : 'formal-bend/v1')

// ---- 결정적 노드

/** 한 번의 평가가 나눠 쓰는 것 — 저장소 루트(`repo:` 출처를 푸는 자리)와 한 번만 읽는 패키지. */
function graphContext(directory, binding, timeoutMs) {
  return { directory, root: pinRoot(directory), binding, profile: graphProfile(binding), timeoutMs }
}

async function loadedPackage(context) {
  if (!context.loaded) {
    const { loadPackage } = await import('./oracle-package.mjs')
    context.loaded = await loadPackage(join(context.directory, PACKAGE_FILE), { root: context.root }).catch((error) => ({ error: error.message }))
  }
  return context.loaded
}

function runScript(script, args, cwd) {
  const child = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { status: child.status, output: `${child.stdout ?? ''}${child.stderr ?? ''}`.trim(), stdout: child.stdout ?? '' }
}

const firstOutputLine = (output) => output.split('\n')[0]

/** 카드 lint가 찍는 문제, 첫 줄 뒤에 한 줄씩 — `--draft`가 사용자 답을 기다린다고 한 것(pending)은 따로 둔다. */
function lintLines(output) {
  const lines = output.split('\n').slice(1).filter((line) => /^ {2}\S/.test(line))
  return {
    issues: lines.filter((line) => !line.startsWith('  pending ')).map((line) => line.trim()),
    pending: lines.filter((line) => line.startsWith('  pending ')).map((line) => line.trim().replace(/^pending /, '')),
  }
}

/**
 * 카드 파일의 Draft lint — 잠금이 oracle.md를 lint하듯 저장소 루트에서(`--root`로 사본도 `code()` 증인과 출처를 저장소에서 푼다).
 * issues는 고칠 것, pending은 사용자의 답(승인·출처)이 정하는 것이다.
 */
function draftLint(card, root) {
  const linted = runScript(verifyScript, ['card', '--oracle', card, '--draft', '--root', root], root)
  const { issues, pending } = lintLines(linted.output)
  if (linted.status === 0 || issues.length > 0 || pending.length > 0) return { issues, pending }
  return { issues: [`card-lint: ${firstOutputLine(linted.output)}`], pending }
}

/** 저장소 밖 임시 폴더에서 `work(folder)`, 그 뒤 폴더를 지운다. */
async function inScratch(work) {
  const scratch = await mkdtemp(join(tmpdir(), 'oracle-graph-'))
  try {
    return await work(scratch)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** 생성 영역만 있고 투영이 옮기는 손으로 쓴 절은 없는 카드. */
function generatedOnly(text, generatedBlock) {
  const found = generatedBlock(text)
  if (!found.present || found.malformed) return null
  const title = text.split('\n')[0]
  return [title, '', text.slice(found.start, found.end), '', '## User Confirmation', '', '- Status: pending', '- Source: none yet', ''].join('\n')
}

/**
 * `issues` 중 손으로 쓴 절만 내는 것 — 생성 영역만으로도 나는 문제는 패키지에서 온다(또는 규칙이 받는 손 줄: 출처 있는 N/A,
 * Interaction sweep). 손으로 쓴 절만 내는 문제는 oracle.md의 생성 표식 밖에서 고친다.
 */
async function handWrittenOf(text, issues, root) {
  if (issues.length === 0) return []
  const { generatedBlock } = await import('./oracle-package.mjs')
  const bare = generatedOnly(text, generatedBlock)
  if (bare === null) return []
  const fromRegion = new Set(
    await inScratch(async (scratch) => {
      await writeFile(join(scratch, 'oracle.md'), bare)
      return draftLint(join(scratch, 'oracle.md'), root).issues
    }),
  )
  return issues.filter((issue) => !fromRegion.has(issue))
}

/** check-card — 카드의 생성 영역이 패키지에서 다시 만든 것과 같은가(저장소 루트 기준 상대 경로로 투영과 같은 표기). */
function checkCard(context, card) {
  const { directory, root } = context
  const checked = runScript(packageScript, ['check-card', '--package', relative(root, join(directory, PACKAGE_FILE)), '--card', relative(root, card)], root)
  if (checked.status === 0) return []
  try {
    const issues = JSON.parse(checked.stdout.trim().split('\n').at(-1)).issues
    if (Array.isArray(issues) && issues.length > 0) return issues
  } catch {
    // not the JSON line: the first line says why
  }
  return [`check-card: ${firstOutputLine(checked.output)}`]
}

/** 패키지에서 카드를 투영한다 — oracle.md가 있으면 그 손으로 쓴 절을 그대로 둔다. */
function projectCard(context, out) {
  const { directory, root } = context
  const projected = runScript(packageScript, ['project-card', '--package', relative(root, join(directory, PACKAGE_FILE)), '--out', relative(root, out)], root)
  return projected.status === 0 ? null : `card-projection: ${firstOutputLine(projected.output)}`
}

/** The package fields a node waits for, as `package-todo` issues naming their set command (oracle-schema.mjs). */
async function nodeTodoIssues(loaded, node) {
  const { nodeTodos, todoIssue } = await import('./oracle-schema.mjs')
  return nodeTodos(loaded.raw, node).map(todoIssue)
}

const NODE_EVALUATORS = {
  /**
   * 패키지 — 규칙 표(oracle-schema.mjs)의 model 단계: 아직 정하지 않은 필드(todo)는 결정 순서의 set 명령으로, 정한 필드는 그
   * 행의 판정으로, 비동기 칸까지. Space discovery 기록(S4)의 Case space 문법도 여기서 본다 — 값은 S4에서 패키지로 흐른다.
   */
  async package(context) {
    if (!(await packageBytes(context.directory))) return { issues: [`package-missing: oracle-step.mjs writes the ${PACKAGE_FILE} skeleton; fill it with oracle-package.mjs set`] }
    const loaded = await loadedPackage(context)
    if (loaded.error) return { issues: [`package-unreadable: ${loaded.error}`] }
    const { packageIssues, sourcePath } = await import('./oracle-package.mjs')
    const { isTodo, SPACE_DISCOVERY_FILE, spaceRecordIssues } = await import('./oracle-schema.mjs')
    // the registered S4; while spaceDiscovery is still the skeleton's todo, the S4 skeleton beside it; a version 1 package has none
    const record = loaded.pkg.spaceDiscovery
      ? sourcePath(loaded, loaded.pkg.spaceDiscovery)
      : isTodo(loaded.raw.spaceDiscovery) && join(context.directory, SPACE_DISCOVERY_FILE)
    const recordText = record ? await readFile(record, 'utf8').catch(() => null) : null
    return { issues: [...spaceRecordIssues(recordText), ...packageIssues(loaded.raw, { stage: 'model', gate: true })] }
  },
  /** 모델 — 앞 노드가 막혔으면(--check, 잠금) Bend 없이 아는 교차검증 문제만, 아니면 전체(modelCheck: 문제와 통과의 근거). */
  async model(context, { blocked }) {
    const loaded = await loadedPackage(context)
    if (loaded.error) return { issues: [] }
    const todos = await nodeTodoIssues(loaded, 'model')
    if (todos.length > 0) return { issues: todos }
    if (!blocked) return modelCheck(context, loaded)
    const { crossCheckReadiness } = await import('./oracle-discovery.mjs')
    return { issues: await crossCheckReadiness(loaded).catch(() => []) }
  },
  /**
   * 카드 — project가 `write`면 oracle.md에 다시 투영하고(손으로 쓴 절은 그대로), `scratch`면 임시 사본에 투영해 lint만 한다.
   * `none`은 지금 oracle.md를 본다(잠금). check-card와 Draft lint, 그 중 손으로 쓴 절만 내는 문제, 사용자 답을 기다리는 항목.
   */
  async card(context, { project, blocked }) {
    const card = join(context.directory, 'oracle.md')
    const loaded = await packageBytes(context.directory) ? await loadedPackage(context) : { error: 'no package' }
    const todos = loaded.error ? [] : await nodeTodoIssues(loaded, 'card')
    if (todos.length > 0) return { issues: todos }
    if (project === 'write') {
      const failed = projectCard(context, card)
      if (failed) return { issues: [failed] }
    }
    const current = await readFile(card, 'utf8').catch(() => null)
    const issues = current === null ? ['card-missing: oracle-step.mjs projects oracle.md once the package and the model pass'] : checkCard(context, card)
    if (project === 'none') return { issues }
    // --check: the Draft lint of the card a projection would give now, hand-written sections kept
    if (project === 'scratch') {
      const { packageIssues } = await import('./oracle-package.mjs')
      if (blocked && (loaded.error || packageIssues(loaded.raw, { stage: 'project' }).length > 0)) return { issues }
      return inScratch(async (scratch) => {
        const copy = join(scratch, 'oracle.md')
        if (current !== null) await writeFile(copy, current)
        const failed = projectCard(context, copy)
        if (failed) return { issues: [...issues, failed] }
        const linted = draftLint(copy, context.root)
        const text = await readFile(copy, 'utf8')
        return { issues: [...new Set([...issues, ...linted.issues])], handWritten: current === null ? [] : await handWrittenOf(text, linted.issues, context.root), pending: linted.pending }
      })
    }
    if (issues.length > 0) return { issues }
    const linted = draftLint(card, context.root)
    return { issues: linted.issues, handWritten: await handWrittenOf(current, linted.issues, context.root), pending: linted.pending }
  },
  /** Contract 승인 — 실제 사용자 확인과 그 출처, 그리고 엄격한 Space(`card --case-space`). */
  async confirmation(context) {
    const card = await cardBytes(context.directory)
    if (!card) return { issues: ['card-missing: write oracle.md with the Contract card'] }
    const confirmation = sectionLines(markdownLines(card.toString('utf8')), 'User Confirmation')
    const source = confirmation.find((line) => /^- Source:/i.test(line.trim()))?.split(':').slice(1).join(':').trim()
    const issues = []
    if (!confirmation.some((line) => /^- Status:\s*approved\s*$/i.test(line.trim())) || !source || isEmptyCell(source))
      issues.push('user-confirmation: show the user the whole card and record their approval: ## User Confirmation with - Status: approved and - Source: <their response>')
    const checked = runScript(verifyScript, ['card', '--oracle', join(context.directory, 'oracle.md'), '--case-space'], process.cwd())
    if (checked.status !== 0) issues.push(...contractLint(checked.output))
    return { issues }
  },
}

/** Contract 카드 lint의 문제 — 줄이 없으면 첫 줄. */
function contractLint(output) {
  const { issues, pending } = lintLines(output)
  const all = [...issues, ...pending]
  return all.length > 0 ? all : [`card-lint: ${firstOutputLine(output)}`]
}

/** Contract 카드 — 전체 카드 lint(`oracle-verify.mjs card`). */
async function contractCard(context) {
  if (!(await cardBytes(context.directory))) return { issues: [] }
  const checked = runScript(verifyScript, ['card', '--oracle', join(context.directory, 'oracle.md')], process.cwd())
  return { issues: checked.status === 0 ? [] : contractLint(checked.output) }
}

/** 노드 하나 — 문제 목록(비면 통과)과 카드의 손으로 쓴 절·사용자 답 항목. */
export async function evaluateNode(context, id, options = {}) {
  if (context.profile === 'contract/v1' && id === 'card') return contractCard(context)
  return NODE_EVALUATORS[id](context, options)
}

/**
 * 그래프의 결정적 노드를 순서대로 평가한다. `deep`이면 앞 노드가 실패해도 입력이 있는 노드를 모두 돈다(oracle-step.mjs
 * --check, 잠금) — 아니면 처음 실패한 노드에서 멈춘다. label은 처음 실패한 노드의 위치, 모두 통과하면 DRAFTED다.
 */
export async function evaluateGraph(directory, { binding, deep = false, project = 'none', timeoutMs } = {}) {
  const resolved = binding ?? (await bindingOf(directory))
  const context = graphContext(directory, resolved, timeoutMs)
  const nodes = []
  for (const node of GRAPH[context.profile].filter(({ review }) => !review)) {
    const blocked = nodes.some(({ issues }) => issues.length > 0)
    if (blocked && !deep) break
    nodes.push({ id: node.id, label: node.label, ...(await evaluateNode(context, node.id, { project, blocked })) })
  }
  return { binding: resolved, profile: context.profile, context, nodes, label: nodes.find(({ issues }) => issues.length > 0)?.label ?? 'DRAFTED' }
}

const numbered = (issues) => issues.map((issue, index) => `${index + 1}) ${issue}`).join('; ')

/** 노드의 실패 목록 한 줄 — 잠금의 거절이 쓴다. */
export function nodeIssuesText(nodes) {
  return nodes
    .filter(({ issues }) => issues.length > 0)
    .map(({ id, issues }) => `${id}: ${numbered(issues)}`)
    .join(' · ')
}

/**
 * 모델 노드 — 파생, 교차검증, 잠그기 전 적정성·증명·법칙. 같은 입력으로 이미 통과했으면 영수증으로 넘어간다(checkedReceipt).
 * 파생이 실패하면 그것만, 아니면 교차검증·적정성·증명의 문제를 한꺼번에 낸다. 통과하면 무엇을 판정했는지(evidence)를 함께 낸다.
 */
async function modelCheck(context, loaded) {
  const { timeoutMs } = context
  const packagePath = join(context.directory, PACKAGE_FILE)
  const { ensureBend } = await import('./ensure-bend.mjs')
  const { crossCheckIssues } = await import('./oracle-discovery.mjs')
  const { derivePackage } = await import('./oracle-package.mjs')
  const { readReceipt } = await import('./oracle-lock.mjs')
  const { bin } = await ensureBend()
  // 키를 못 만들면(읽을 수 없는 입력 등) 영수증 없이 돈다 — 그 실패는 아래 검사가 제 문장으로 알린다
  const receipt = await checkedReceipt(loaded, bin).catch(() => null)
  const remembered = receipt ? await readReceipt(receipt) : null
  if (remembered) return { issues: [], evidence: `${remembered}; receipt: these exact inputs passed before` }
  const { derived } = await derivePackage(loaded, { bin, timeoutMs })
  if (derived.status !== 'derived') {
    const why = (derived.diagnostics ?? []).slice(0, 3).map((entry) => entry.message ?? entry.code).filter(Boolean)
    return { issues: [['derive returned', derived.status, ...(why.length > 0 ? [`(${why.join('; ')})`] : [])].join(' ')] }
  }
  const crossCheck = await crossCheckIssues({ loaded, bin, timeoutMs })
  // 모델만으로 아는 결함은 잠그기 전에 막는다 — 잠근 뒤에 라벨 런이 알려 주면 그 모델은 고칠 수 없고 새 revision이 든다
  const { preLockIssues } = await import('./oracle-adequacy.mjs')
  const adequacy = await preLockIssues({ package: packagePath, bin, cwd: loaded.root, timeoutMs })
  const proof = await preLockProof({ ...(await behaviorFiles(loaded)), bin, timeoutMs })
  const issues = [...crossCheck, ...adequacy.issues, ...proof.issues]
  if (issues.length > 0) return { issues }
  const verdict = adequacy.checked ? `adequacy found no refuted check or unsatisfiable setting over ${adequacy.worlds} worlds` : `adequacy not judged (${adequacy.reason})`
  const evidence = [`derive ${derived.digest}`, 'cross-check settled', verdict, ...proof.notes].join('; ')
  if (receipt && settledByBytes(derived, adequacy) && proof.settled) await rememberChecked(receipt, loaded, bin, evidence)
  return { issues: [], evidence }
}

/** 행동 모델의 MODEL.bend·LAWS.bend 경로, 법칙 행 이름, 공간 범위 — 법칙 파일이 없는 패키지(세계만)는 laws가 null이다. */
async function behaviorFiles(loaded) {
  const { sourcePath } = await import('./oracle-package.mjs')
  const behavior = loaded.pkg.behavior ?? {}
  const path = (id) => (id ? sourcePath(loaded, id) : null)
  return { model: path(behavior.model), laws: path(behavior.laws), required: (behavior.lawRows ?? []).map(({ name }) => name), bound: behavior.bound }
}

// 커널·컴파일러가 돌지 못한 것 — 바이트가 아니라 환경이 정한다
const UNDECIDED_PROOF = new Set(['timeout', 'unavailable'])
const UNDECIDED_LAWS = new Set(['BEND_UNAVAILABLE', 'MODEL_TIMEOUT'])
// 막는 문장에는 첫 칸만 싣는다 — 전부는 laws가 보고한다
const LISTED_ISSUES = 1
const NO_CHECK = Object.freeze({ issues: [], notes: [], settled: true })
const noted = (note, settled = true) => ({ issues: [], notes: [note], settled })
const failing = (issue) => ({ issues: [issue], notes: [], settled: true })
const firstLine = (text) => String(text).split('\n')[0]
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`
const moreThan = (count, listed) => (count > listed ? ` and ${count - listed} more` : '')

/**
 * 잠그기 전 증명 — LAWS.bend 옆 PROOF.bend를 커널로 검사하고(prove), LAWS.bend가 쓴 칸 법칙
 * `R(s, c, step(s, c))`와 trace 법칙 `I(run(t, init()))`을 모델의 모든 칸에서 계산한다(laws). 막는 것은 바이트가 정하는
 * 결함뿐이다: 증명하지 못한 law(failed·open·unsafe), 승인한 관계가 깨지는 칸, 공간이 닿는 상태에서 trace 법칙을 깨는 걸음.
 * 자유·빈 칸과 공간이 닿지 않는 귀납 반례(그 law가 아니라 더 센 불변식을 PROOF.bend가 쓴다)는 보고다. Bend가 돌지 못하면
 * undecided — 막지도 영수증으로 기억하지도 않는다(settled: false). 법칙 파일이나 PROOF.bend가 없으면 그 검사는 없다.
 */
export async function preLockProof({ model, laws, required = [], bound, bin, timeoutMs }) {
  const lawsText = laws ? await readFile(laws, 'utf8').catch(() => null) : null
  if (!model || lawsText === null) return NO_CHECK
  // LAWS.bend의 import는 절대 경로로 풀어 모델 파일과 비교한다
  const paths = { model: resolve(model), laws: resolve(laws) }
  const checked = [await lawChecks({ ...paths, lawsText, bound, bin, timeoutMs }), await proofCheck({ laws: paths.laws, required, bin, timeoutMs })]
  return {
    issues: checked.flatMap(({ issues }) => issues),
    notes: checked.flatMap(({ notes }) => notes),
    settled: checked.every(({ settled }) => settled),
  }
}

async function proofCheck({ laws, required, bin, timeoutMs }) {
  const directory = dirname(laws)
  const present = await stat(join(directory, 'PROOF.bend')).then(() => true, () => false)
  if (!present) return noted('prove not judged (no PROOF.bend beside LAWS.bend)')
  const { proveLaws } = await import('./oracle-model.mjs')
  // closure를 읽지 못한 것(없는 import)도 바이트의 결함이다
  const result = await proveLaws({ dir: directory, bin, require: required, timeoutMs }).catch((error) => ({
    status: 'failed',
    reason: `${error.code ?? 'PROVE_FAILED'}: ${error.message}`,
  }))
  if (result.status === 'proven') return noted(`prove proven (${provenLaws(result)})`)
  if (UNDECIDED_PROOF.has(result.status)) return noted(`prove undecided (${result.status}: ${result.reason})`, false)
  const detail = proofDetail(result)
  return failing(detail.length > 0 ? `prove ${result.status} (${detail.join('; ')})` : `prove ${result.status}`)
}

function provenLaws(result) {
  const generated = result.cells?.generated?.length ?? 0
  const laws = plural(result.laws.length, 'law')
  return generated > 0 ? `${laws}, ${generated} by generated cell proofs` : laws
}

/** 증명하지 못한 까닭 — 커널이 멈춘 자리, 거절 이유, 칸 증명을 만들지 못한 law, 알려진 고칠 방법. */
function proofDetail(result) {
  const skipped = (result.cells?.skipped ?? []).map(({ law, reason }) => `${law} ${reason}`)
  return [
    result.failedAt && `at ${result.failedAt}`,
    result.reason,
    skipped.length > 0 && `no def and no generated cell proof: ${skipped.join(', ')}`,
    result.hint,
  ].filter(Boolean)
}

/**
 * LAWS.bend의 law 블록 — `for` 묶음과 주장 한 줄(`#` 주석은 뗀다). 본문이 묶음과 주장 한 줄이 아니면(exs, 여러 줄) claim이
 * null이다. law 이름은 scanBendSource처럼 점을 허용한다.
 */
function lawBlocks(text) {
  const lines = text.split('\n')
  return lines.flatMap((line, index) => {
    if (!/^law\s+[\w.]+\s*:/.test(line)) return []
    let end = index + 1
    while (end < lines.length && (lines[end].startsWith(' ') || lines[end].trim() === '')) end += 1
    const body = lines
      .slice(index + 1, end)
      .map((entry) => entry.split('#')[0].trim())
      .filter(Boolean)
    const binders = body.flatMap((entry) => {
      const binder = entry.match(/^for\s+[+-]?(\w+)\s*:\s*(\S.*)$/)
      return binder ? [{ name: binder[1], type: binder[2].trim() }] : []
    })
    const claims = body.filter((entry) => entry.startsWith('{'))
    const single = claims.length === 1 && body.length === binders.length + 1
    return [{ binders, claim: single ? claims[0] : null }]
  })
}

const CLAIM_TRUE = String.raw`\s*==\s*True\{\}\s*:\s*Bool\s*\}$`
const aliased = (type, alias) => type.match(new RegExp(String.raw`^${alias}\.(\w+)$`))?.[1] ?? null

/** 칸 법칙 `for s: A.S`, `for c: A.C`, `{A.P.R(s, c, A.P.step(s, c)) == True{} : Bool}` → 관계 R과 (P, S, C). */
function cellLaw({ binders, claim }, alias) {
  if (binders.length !== 2) return null
  const [state, command] = binders.map(({ type }) => aliased(type, alias))
  if (!state || !command) return null
  const [s, c] = binders.map(({ name }) => name)
  const call = String.raw`^\{\s*${alias}\.(\w+)\.(\w+)\(\s*${s}\s*,\s*${c}\s*,\s*${alias}\.\1\.step\(\s*${s}\s*,\s*${c}\s*\)\s*\)`
  const match = claim.match(new RegExp(call + CLAIM_TRUE))
  return match ? { prefix: match[1], state, command, relation: match[2] } : null
}

/** trace 법칙 `for t: List<A.C>`, `{A.P.I(A.P.run(t, A.P.init())) == True{} : Bool}` → 불변식 I. 상태 타입은 `P.init`의 반환이다. */
function traceLaw({ binders, claim }, alias, initOf) {
  if (binders.length !== 1) return null
  const command = binders[0].type.match(new RegExp(String.raw`^List<${alias}\.(\w+)>$`))?.[1]
  if (!command) return null
  const t = binders[0].name
  const call = String.raw`^\{\s*${alias}\.(\w+)\.(\w+)\(\s*${alias}\.\1\.run\(\s*${t}\s*,\s*${alias}\.\1\.init\(\s*\)\s*\)\s*\)`
  const match = claim.match(new RegExp(call + CLAIM_TRUE))
  const state = match ? initOf(match[1]) : null
  // run: 닿은 귀납 반례를 이 law의 fold로 다시 접는다
  return state ? { prefix: match[1], state, command, invariant: match[2], run: 'run' } : null
}

/**
 * laws가 계산할 법칙 — MODEL.bend를 부르는 별칭으로 쓴 칸 법칙은 (P, S, C)마다 관계 묶음 하나로, trace 법칙은 불변식
 * 하나로 모은다. 다른 모양의 law(구체 생성자, 가정 묶음, exs)는 PROOF.bend만 본다 — 몇 개를 계산했는지(computed / of)를 함께 준다.
 */
async function lawTargets({ model, laws, lawsText }) {
  const { defSignature } = await import('./oracle-types.mjs')
  const source = await readFile(model, 'utf8')
  const initOf = (prefix) => defSignature(source, `${prefix}.init`)?.returns.replace(/^\w+\./, '') ?? null
  const aliases = [...lawsText.matchAll(/^import\s+(\.{1,2}\/\S+)\s+as\s+(\w+)/gm)]
    .filter(([, file]) => resolve(dirname(laws), file) === model)
    .map(([, , alias]) => alias)
  const blocks = lawBlocks(lawsText)
  const matched = blocks
    .filter(({ claim }) => claim !== null)
    .map((block) => aliases.flatMap((alias) => [cellLaw(block, alias), traceLaw(block, alias, initOf)]).filter(Boolean))
    .filter((targets) => targets.length > 0)
  const found = matched.flat()
  const groups = new Map()
  for (const { relation, ...cell } of found.filter((target) => target.relation)) {
    const key = [cell.prefix, cell.state, cell.command].join('\0')
    if (!groups.has(key)) groups.set(key, { ...cell, relations: [] })
    groups.get(key).relations.push(relation)
  }
  return {
    source,
    targets: [...groups.values(), ...found.filter((target) => target.invariant)],
    computed: matched.length,
    of: blocks.length,
  }
}

/**
 * laws — 컴파일한 모델 하나로 대상마다 lawReport를 부른다. Nat·List는 패키지의 공간 범위(bound)에서 자르므로 반례는 그
 * 범위 안의 구체 값이다.
 */
async function lawChecks({ model, laws, lawsText, bound, bin, timeoutMs }) {
  const { source, targets, computed, of } = await lawTargets({ model, laws, lawsText })
  if (of === 0) return NO_CHECK
  // 계산하지 않은 law(다른 모양)는 prove만 본다 — 몇 개인지 문장에 남긴다
  const coverage = `laws computed ${computed} of ${plural(of, 'law')}`
  if (targets.length === 0) return noted(coverage)
  const { compileBend, compiledReach } = await import('./oracle-model.mjs')
  let compiled
  try {
    compiled = await compileBend({ entry: model, bin, timeoutMs })
  } catch (error) {
    const undecided = UNDECIDED_LAWS.has(error.code)
    return noted(`laws ${undecided ? 'undecided' : 'not judged'} (${error.code}: ${firstLine(error.message)})`, !undecided)
  }
  const bounded = Number.isSafeInteger(bound) && bound >= 1
  const { lawReport } = await import('./oracle-laws.mjs')
  const context = {
    run: (target, reach) => lawReport({ source, exported: compiled.exported, ...target, bounds: bounded ? { nat: bound, list: bound } : {}, reach }),
    bound,
    reach: bounded ? spaceReach({ entry: model, targets, bound, bin, compiled, compiledReach }) : null,
  }
  const judged = targets.map((target) => judgeTarget(target, context))
  return { issues: judged.flatMap(({ issues }) => issues), notes: [coverage, ...judged.flatMap(({ notes }) => notes)], settled: true }
}

/**
 * 불변식이 있으면 같은 컴파일 결과로 같은 범위의 공간이 닿는 상태를 연다(다시 컴파일하지 않으므로 환경 실패가 여기서 나지
 * 않는다). init·step·next·observe가 다 있어야 한다 — 없으면 닿는지 모른다.
 */
function spaceReach({ entry, targets, bound, bin, compiled, compiledReach }) {
  const traced = targets.find((target) => target.invariant)
  if (!traced) return null
  const reach = compiledReach({ entry, prefix: traced.prefix, bin, compiled, bound })
  if (!reach) return null
  let reached = null
  return { prefix: traced.prefix, reach: () => (reached ??= reach()) }
}

function reachOf(reach, target) {
  if (!target.invariant || reach === null) return null
  return reach.prefix === target.prefix ? reach.reach : null
}

/** 대상 하나의 lawReport → 막는 결함 또는 보고. 서명·도메인·비용 오류는 그 대상을 판정하지 않았다는 보고다. */
function judgeTarget(target, { run, bound, reach }) {
  let report
  try {
    report = run(target, reachOf(reach, target))
  } catch (error) {
    const name = target.invariant ? `${target.prefix}.${target.invariant}` : `${target.prefix} ${target.state}×${target.command}`
    return noted(`laws not judged for ${name} (${error.code ?? 'LAWS_FAILED'}: ${firstLine(error.message)})`)
  }
  if (report.counterexampleCount > 0) {
    const named = report.counterexamples
      .slice(0, LISTED_ISSUES)
      .map(({ relation, state, command, after }) => `${relation} is false at ${state} ${command} (step gives ${after})`)
    return failing(`laws counterexample: ${named.join(', ')}${moreThan(report.counterexampleCount, named.length)}`)
  }
  const cut = report.bounded ? ` with Nat and List cut at ${bound}` : ''
  if (report.invariant) return invariantVerdict(report.invariant, cut)
  const { pinnedCount, freeCount, emptyCount } = report.strength
  return noted(
    `laws: no counterexample to ${plural(report.relations.length, 'relation')} over ${report.domain.cells} cells${cut}; pinned ${pinnedCount}, free ${freeCount}, empty ${emptyCount} (report only)`,
  )
}

/**
 * 귀납 반례 — 공간이 그 상태에 닿고, 닿은 trace에 그 사건을 이어 law의 run으로 접어도 불변식이 깨지면 trace 법칙의
 * 결함이다(lawReport가 목록 밖까지 전부 센다). 닿지 않으면 보고다: law의 술어는 흔히 귀납적이지 않고, PROOF.bend가 그보다
 * 센 불변식으로 증명한다.
 */
function invariantVerdict({ def, states, ctiCount, reach, reachedCount = 0, firstReached = null }, cut) {
  if (reachedCount > 0) {
    const { state, command, after, reached } = firstReached
    return failing(
      `laws: ${def} breaks at a reached state: ${state} ${command} gives ${after}, reached by [${reached.join(', ')}]${moreThan(reachedCount, LISTED_ISSUES)}`,
    )
  }
  if (ctiCount === 0) return noted(`laws: ${def} has no counterexample to induction over ${states} states${cut}`)
  const unreached = reach === null ? 'reach not computed' : `none breaks the law on a trace reached at bound ${reach.bound}`
  return noted(`laws: ${def} has ${plural(ctiCount, 'counterexample')} to induction, ${unreached} (report only)`)
}

/**
 * 키의 바이트만으로 이 판정 문장이 다시 나오는가. 판정하지 못한 이유가 환경이면(Bend 실행 실패 → not-run) 같은 바이트도
 * 다음엔 판정될 수 있고, 파생이 조용히 덜 돈 경우(모델을 못 읽음, 세계 수를 못 셈)는 문장의 digest가 바이트의 것이 아니다.
 * 무한 필드·세계 상한(unknown)은 바이트가 정하므로, 파생과 적정성이 같은 이유를 댈 때만 남긴다.
 */
function settledByBytes(derived, adequacy) {
  if (derived.diagnostics?.some(({ code }) => code === 'behavior-unread' || code === 'order-unchecked')) return false
  if (adequacy.checked) return derived.worlds?.status === 'enumerated'
  return adequacy.status === 'unknown' && derived.worlds?.status === 'unknown' && derived.worlds.reason === adequacy.reason
}

/**
 * 모델 노드의 영수증 — 파생·교차검증·적정성·증명·법칙은 패키지와 그 Bend 파일(전이 import 포함), LAWS.bend 옆 PROOF.bend와 그
 * import, 패키지가 등록한 `repo:` 출처, 하네스, node, bend만 읽는다. 그 바이트가 모두 같으면 같은 판정이 나오므로, 통과한 조합은 판정 문장과 함께 기억해 다음
 * oracle-step.mjs와 잠금이 같은 판정(큰 모델에서는 Bend 열거)을 다시 돌지 않는다. 위치·규칙은 카드 lint 영수증과 같다(ORACLE_LINT_CACHE, `off`면 끔).
 * 실패는 남기지 않는다. `stamp`는 키에 들지 않는 파일 표식(크기·시각·inode)으로, 판정 전후를 비교하는 데만 쓴다 — 링크 자신과
 * 그 대상을 둘 다 잰다(키는 대상의 바이트를 해시하므로, 대상만 바꿨다 되돌려도 드러나야 한다).
 */
async function checkedReceipt(loaded, bin) {
  const { harnessDigest, receiptDirectory } = await import('./oracle-lock.mjs')
  const directory = receiptDirectory()
  if (!directory) return null
  const { inputs, sources, proof, stamp } = await checkedInputs(loaded, { proof: true })
  const key = sha256(stableStringify({ gate: 'CHECKED', harness: await harnessDigest(), node: process.version, bend: bin, inputs, sources, proof }))
  return { directory, key, stamp }
}

/**
 * 모델 노드가 읽는 입력 — 패키지와 그 Bend 파일(전이 import 포함), 등록한 `repo:` 출처의 digest, 그리고 그 파일들의 표식.
 * `proof`면 PROOF.bend와 그 import도 잰다(영수증과 파일 상태): PROOF.bend는 잠그지 않는 증명 후보라 잠금의 고정에 들지 않는다.
 */
async function checkedInputs(loaded, { proof = false } = {}) {
  const { packageInputs, sourcePath } = await import('./oracle-package.mjs')
  const portable = (path) => relative(loaded.root, path).split('\\').join('/')
  const inputs = await packageInputs(loaded)
  const sources = []
  const paths = inputs.map(({ path }) => resolve(loaded.root, path))
  for (const { id } of loaded.pkg.sources ?? []) {
    const path = sourcePath(loaded, id)
    if (!path) continue
    const bytes = await readFile(path).catch(() => null)
    sources.push([portable(path), bytes === null ? null : sha256(bytes)])
    paths.push(path)
  }
  const proven = proof ? await proofInputs(loaded) : null
  if (proven) paths.push(...proven.paths)
  const stamps = []
  const mark = (entry) => entry && [entry.size, entry.mtimeMs, entry.ctimeMs, entry.ino]
  for (const path of [...new Set(paths)].sort()) {
    // 없는 파일은 표식 없음(null)으로 남는다 — 생기거나 사라지면 전후가 달라진다
    const [link, target] = await Promise.all([lstat(path).catch(() => null), stat(path).catch(() => null)])
    stamps.push([portable(path), mark(link), mark(target)])
  }
  const proofDigests = proven ? { proof: proven.inputs.map(({ path, sha256: digest }) => [portable(path), digest]) } : {}
  return { inputs, sources, ...proofDigests, stamp: stableStringify(stamps) }
}

/** LAWS.bend 옆 PROOF.bend와 그 import closure — 없는 PROOF.bend는 digest 없이 표식(null)만 잰다(생기면 드러난다). */
async function proofInputs(loaded) {
  const { laws } = await behaviorFiles(loaded)
  if (!laws) return { inputs: [], paths: [] }
  const entry = join(dirname(laws), 'PROOF.bend')
  const present = await stat(entry).then(() => true, () => false)
  if (!present) return { inputs: [], paths: [entry] }
  const { bendInputs } = await import('./oracle-model.mjs')
  // closure를 읽을 수 없으면(없는 import) PROOF.bend의 바이트만 잰다 — 그 결함은 증명이 알린다
  const inputs = await bendInputs(entry).catch(async () => [{ path: entry, sha256: sha256(await readFile(entry, 'utf8')) }])
  return { inputs, paths: inputs.map(({ path }) => path) }
}

/**
 * 모델 입력의 고정 — 모델 노드가 판정하는 입력(checkedInputs)의 digest. 잠금이 기록한다(inputsSha256). `proof`면 PROOF.bend와
 * 그 import도 넣는다: 파일 상태 digest가 Bend 편집을 보는 길이고, 증명만 고쳐도 새 파일 상태다(잠금의 고정에는 들지 않는다).
 * `repo:` 출처는 저장소 루트 기준이라 오라클 디렉터리(`<root>/.ai/oracles/<id>`)에서 루트를 얻는다: lock이 다른 cwd에서 불러도
 * 같은 파일을 잰다. 그 밖의 자리는 노드와 같이 cwd다.
 */
async function checkedPin(directory, { proof = false } = {}) {
  const { loadPackage } = await import('./oracle-package.mjs')
  const loaded = await loadPackage(join(directory, PACKAGE_FILE), { root: pinRoot(directory) })
  const { inputs, sources, proof: proven } = await checkedInputs(loaded, { proof })
  return sha256(stableStringify({ inputs, sources, ...(proof ? { proof: proven } : {}) }))
}

function pinRoot(directory) {
  const root = repositoryRoot(directory)
  return root === directory ? process.cwd() : root
}

/**
 * 판정이 도는 동안 입력이 바뀌었으면(고쳤다가 되돌린 것까지) 그 판정은 키의 바이트가 낸 것이 아니다 — 패키지를 다시 읽어 키와
 * 파일 표식을 다시 재고, 둘 다 같을 때만 영수증을 남긴다.
 */
async function rememberChecked(receipt, loaded, bin, evidence) {
  const { loadPackage } = await import('./oracle-package.mjs')
  const { writeReceipt } = await import('./oracle-lock.mjs')
  // 다시 잴 수 없으면 남기지 않는다 — 다음 검사가 다시 돌 뿐이다
  const again = await loadPackage(loaded.path, { root: loaded.root }).then((reloaded) => checkedReceipt(reloaded, bin)).catch(() => null)
  if (again?.key !== receipt.key || again.stamp !== receipt.stamp) return
  // 영수증은 속도를 위한 캐시다 — 쓸 수 없는 위치(읽기 전용 tmpdir, 샌드박스)는 다음 검사가 다시 돌게 둘 뿐이다
  await writeReceipt(receipt, evidence).catch(() => {})
}

// ---- 잠금

/** 잠근 뒤의 걸음이 막혔을 때 — 계약이 틀렸으니 사용자가 출처를 고치고 새 run으로 시작한다. */
export const REVISE_NEXT = 'NEEDS_DECISION: the user rewrites the sources, then oracle-step.mjs --dir <new run dir>'

const lockedDigests = (record, contract) =>
  contract ? { cardSha256: record.cardSha256 } : { packageSha256: record.packageSha256, ...(record.inputsSha256 ? { inputsSha256: record.inputsSha256 } : {}) }

const pinOf = (directory, options) => checkedPin(directory, options).catch(() => null)

const stepHint = (directory) => `run oracle-step.mjs --dir ${relative(process.cwd(), directory) || '.'} and do what NEXT FOR YOU says`

/** Formal 패키지가 없는 오라클 — 명시 Formal이면 거절, 손으로 쓴 카드(프로필 없음)는 해당 없다. */
function withoutPackage(binding) {
  if (binding.kind === 'explicit') throw new StageError('STAGE_NO_PACKAGE', 'Explicit Formal requires oracle.package.json')
  return { ...binding, judged: {} }
}

/**
 * 잠근 기록의 digest — 잠근 바이트(Formal은 패키지, Contract는 카드)가 바뀌었으면 새 revision이다. lock 파일이 있는 재잠금과
 * verify는 그 digest를 그대로 받고, 그 밖에는 null(판정할 차례). verify는 잠근 기록만 받는다.
 */
function lockedDigest(directory, record, { contract, bytes, present, verify }) {
  if (record?.stage !== 'ORACLE_READY') {
    if (verify) throw new StageError(record ? 'STAGE_STALE' : 'STAGE_MISSING', `the oracle is not locked — ${stepHint(directory)}`)
    return null
  }
  if ((contract ? record.cardSha256 : record.packageSha256) !== sha256(bytes ?? ''))
    throw new StageError('STAGE_STALE', `${contract ? 'the approved card' : PACKAGE_FILE} changed after the lock — ${REVISE_NEXT}`)
  if (!present && !verify) return null
  return lockedDigests(record, contract)
}

/** 지금 바이트로 결정적 노드를 모두 돈다 — 하나라도 실패하면 거절, 도는 동안 바뀌었으면 다시. 통과하면 판정한 digest. */
/**
 * The todos a lock refuses: a locked package never changes, so what Delivery closure reads (product, faultModel) and
 * every other todo is decided or removed before the lock, never found after GREEN. Unreadable bytes: the graph says so.
 */
export async function lockTodos(pkg) {
  const { todoEntries } = await import('./oracle-schema.mjs')
  try {
    return todoEntries(JSON.parse(pkg)).map(({ pointer }) => pointer)
  } catch {
    return []
  }
}

async function judgedFiles(directory, binding, { contract, pkg, card, timeoutMs }) {
  const left = contract ? [] : await lockTodos(pkg)
  if (left.length > 0)
    throw new StageError('STAGE_GATE', `a locked package holds no todo: set or remove (set <pointer> null) ${left.join(', ')} — ${stepHint(directory)}`)
  const pin = contract ? null : await pinOf(directory)
  const { nodes } = await evaluateGraph(directory, { binding, deep: true, timeoutMs })
  if (nodes.some(({ issues }) => issues.length > 0))
    throw new StageError('STAGE_GATE', `the lock judged the current files: ${nodeIssuesText(nodes)} — ${stepHint(directory)}`)
  const [pkgAfter, cardAfter] = await Promise.all([packageBytes(directory), cardBytes(directory)])
  const pinAfter = contract ? null : await pinOf(directory)
  if (sha256(pkgAfter ?? '') !== sha256(pkg ?? '') || sha256(cardAfter ?? '') !== sha256(card ?? '') || pinAfter !== pin)
    throw new StageError('STAGE_STALE', 'the files changed while the lock judged them — run the lock again')
  if (contract) return { cardSha256: sha256(card ?? '') }
  return { packageSha256: sha256(pkg), ...(pin ? { inputsSha256: pin } : {}), cardSha256: card && sha256(card) }
}

/**
 * lock 관문 — 잠금이 유일한 확정이다. 같은 바이트로 이미 잠근 기록(ORACLE_READY)은 lock 파일이 있으면(`present`, 재잠금)
 * 그 digest만 비교하고, 그 밖에는 지금 바이트로 결정적 노드를 모두 돈다(기록한 단계를 믿지 않는다). `verify`는 잠근 기록만
 * 받는다. 패키지 없는 손으로 쓴 카드(프로필 없음)는 해당 없다. 돌려주는 judged는 잠금이 스냅숏과 비교하고 기록에 남기는 digest다.
 */
export async function assertReadyToLock(directory, requestedProfile, { present = false, verify = false, timeoutMs } = {}) {
  const record = await readStage(directory)
  const binding = await bindingAt(directory, record, requestedProfile)
  const contract = binding.profile === 'contract/v1'
  const [pkg, card] = await Promise.all([packageBytes(directory), cardBytes(directory)])
  if (!contract && !pkg) return withoutPackage(binding)
  const locked = lockedDigest(directory, record, { contract, bytes: contract ? card : pkg, present, verify })
  return { ...binding, judged: locked ?? (await judgedFiles(directory, binding, { contract, pkg, card, timeoutMs })) }
}

// 0.126까지의 기록이 진행을 적던 필드 — 위치는 이제 파일에서 계산하므로 다음 쓰기에서 떨어진다(이력과 디스패치는 남는다)
const PROGRESS_FIELDS = ['stage', 'packageSha256', 'cardSha256', 'inputsSha256', 'meaningSha256', 'iterations', 'rewinds', 'rewindAllowance']

function withoutProgress(record) {
  const kept = { ...record }
  for (const field of PROGRESS_FIELDS) delete kept[field]
  return kept
}

/** lock이 만들어진 뒤 기록을 ORACLE_READY로 — 잠근 바이트의 digest와 프로필. 기록이 없으면 만든다. 패키지 없는 손 카드는 남기지 않는다. */
export async function markLocked(directory, { binding } = {}) {
  const judged = binding?.judged ?? {}
  const contract = binding?.profile === 'contract/v1'
  const digest = contract ? { cardSha256: judged.cardSha256 } : { packageSha256: judged.packageSha256, ...(judged.inputsSha256 ? { inputsSha256: judged.inputsSha256 } : {}) }
  if (!(contract ? digest.cardSha256 : digest.packageSha256)) return
  await withDirectoryLock(directory, 'stage', async () => {
    const record = await readStage(directory)
    if (record?.stage === 'ORACLE_READY') return
    const base = withoutProgress(record ?? { schemaVersion: 1, history: [] })
    await writeStage(directory, {
      ...base,
      ...(binding.kind === 'explicit' ? { verificationProfile: binding.profile } : {}),
      stage: 'ORACLE_READY',
      ...digest,
      history: [...base.history, { stage: 'ORACLE_READY', ...digest, evidence: 'lock', at: now() }],
    })
  })
}

// ---- oracle-step.mjs가 남기는 검사

/**
 * 지금 파일 상태 — 패키지, 모델 노드가 읽는 입력(Bend closure와 등록한 출처, LAWS.bend 옆 PROOF.bend와 그 import), 카드의
 * digest. 고치지 않고 다시 돌면 같고, 증명만 고쳐도 달라진다(반복 감지와 진행 한 줄이 그 편집을 본다).
 */
export async function filesDigest(directory) {
  const [pkg, card] = await Promise.all([packageBytes(directory), cardBytes(directory)])
  const inputs = pkg ? await pinOf(directory, { proof: true }) : null
  return sha256(stableStringify({ package: pkg && sha256(pkg), inputs, card: card && sha256(card) }))
}

/** 실패 목록의 digest — 실패한 노드와 그 문제. 모두 통과하면 null(반복 감지는 실패만 센다). */
export function issuesDigest(nodes) {
  const failed = nodes.filter(({ issues }) => issues.length > 0).map(({ id, issues }) => [id, issues])
  return failed.length > 0 ? sha256(stableStringify(failed)) : null
}

/** 최근 검사 끝에서 같은 실패 목록이 연달아 나온 서로 다른 파일 상태 수 — SAME_ISSUES_STOP이면 멈출 때다. */
export function sameIssuesRun(checks = []) {
  const last = checks.at(-1)
  if (!last?.issues) return 0
  const files = new Set()
  for (let index = checks.length - 1; index >= 0 && checks[index].issues === last.issues; index -= 1) files.add(checks[index].files)
  return files.size
}

/**
 * 한 리뷰 종류의 라운드 — 반환이 저장된 서로 다른 입력 digest 수: 검사가 기록한 것과 reviews/에 있는 반환 파일(기록 전에
 * 고쳐도 저장한 반환은 라운드다). digest는 파일 이름처럼 앞 12자로 비교한다.
 */
export async function reviewRounds(directory, record, kind) {
  const names = await readdir(join(directory, 'reviews')).catch(() => [])
  return new Set([
    ...(record?.reviews ?? []).filter((entry) => entry.kind === kind).map((entry) => entry.digest.slice(0, 12)),
    ...names.filter((name) => name.startsWith(`${kind}-`)).map((name) => name.slice(kind.length + 1, kind.length + 13)),
  ]).size
}

/**
 * oracle-step.mjs 한 번의 결과를 남긴다 — 기록이 없으면 만들고(명시 프로필이면 hook이 읽는 그 이름), 위치가 바뀌면 이력에 한 줄,
 * (파일 상태, 실패 목록)이 바뀌면 검사에 한 줄(같으면 마지막 줄의 다음 걸음만 고친다), 저장된 리뷰 반환은 (종류, digest)마다
 * 한 줄. 잠근 기록은 건드리지 않는다.
 */
export async function recordCheck(directory, { binding, label, files, issues, next, reviews = [] }) {
  return withDirectoryLock(directory, 'stage', async () => {
    const found = await readStage(directory)
    if (found?.stage === 'ORACLE_READY') return found
    const record = withoutProgress(found ?? { schemaVersion: 1, history: [] })
    if (binding.kind === 'explicit') record.verificationProfile = binding.profile
    const at = now()
    if (record.history.at(-1)?.stage !== label) record.history = [...record.history, { stage: label, evidence: 'step', at }]
    const checks = record.checks ?? []
    const last = checks.at(-1)
    const same = last?.files === files && last?.issues === issues
    record.checks = [...(same ? checks.slice(0, -1) : checks), { files, issues, label, next, at: same ? last.at : at }].slice(-CHECK_LIMIT)
    for (const review of reviews) {
      const known = record.reviews ?? []
      if (!known.some((entry) => entry.kind === review.kind && entry.digest === review.digest)) record.reviews = [...known, { kind: review.kind, digest: review.digest, at }]
    }
    await writeStage(directory, record)
    return record
  })
}

// ---- 진행 한 줄

/** 같은 실패가 세 번 고친 뒤에도 돌아왔을 때의 다음 걸음 — 사용자의 결정이다. */
export const STOP_NEXT = 'NEEDS_DECISION: the same issues came back after three edits: stop and report them to the user'

/** 검사가 남긴 다음 걸음(step·lock·stop)의 명령. */
function nextCommand(key, dir) {
  if (key === 'lock') return `oracle-lock.mjs create --oracle ${dir}/oracle.md --lock ${dir}/oracle.lock.json --source <approved-source>`
  if (key === 'stop') return STOP_NEXT
  return `oracle-step.mjs --dir ${dir}`
}

/** 잠근 바이트가 바뀌었나 — 패키지(Contract는 카드), 잠글 때의 모델 입력 고정, lock이 묶은 카드. */
async function lockDrift(directory, record, binding) {
  const contract = binding.profile === 'contract/v1'
  const [pkg, card] = await Promise.all([packageBytes(directory), cardBytes(directory)])
  const digest = contract ? record.cardSha256 : record.packageSha256
  if (digest && digest !== sha256((contract ? card : pkg) ?? '')) return true
  if (!contract && record.inputsSha256 && pkg && (await pinOf(directory)) !== record.inputsSha256) return true
  const manifest = await readFile(join(directory, 'oracle.lock.json'), 'utf8').then(JSON.parse, () => null)
  return Boolean(manifest?.oracle?.sha256 && card && manifest.oracle.sha256 !== sha256(card))
}

/** 잠근 뒤의 다음 걸음 — 바뀐 바이트는 새 revision, init을 했으면 run 쪽 한 줄, 아니면 init. */
function lockedNext(dir, drift, initialized) {
  if (drift) return REVISE_NEXT
  if (initialized) return `oracle-run.mjs status --brief --dir ${dir}`
  return `oracle-run.mjs init --dir ${dir} --lock ${dir}/oracle.lock.json --scan-root <scan-root> --required-label <repo-check>`
}

/** 그 위치에 들어온 뒤 지난 시간 — 이력에 시각이 없으면 null. */
function sinceLabel(history, label, nowMs) {
  const entered = [...history].reverse().find((entry, index, all) => entry.stage === label && all[index + 1]?.stage !== label)
  if (!entered?.at) return null
  return `${elapsedLabel(entered.at, nowMs)} at ${label}`
}

/**
 * 진행 한 줄 — 판정을 다시 돌지 않고 마지막 oracle-step.mjs 검사에서 읽는다: 위치, 그 위치에 머문 시간, 다음 명령. 그 뒤에 파일이
 * 바뀌었으면 다음은 oracle-step.mjs다. 잠근 뒤에는 init(이미 했으면 run 쪽 한 줄), 잠근 바이트가 바뀌었으면 새 revision이다.
 */
export async function briefStatus(directory, nowMs = Date.now()) {
  const dir = relative(process.cwd(), directory) || '.'
  const record = await readStage(directory)
  if (!record) return phaseLine(null, nextCommand('step', dir))
  const binding = await bindingAt(directory, record)
  if (record.stage === 'ORACLE_READY') {
    const drift = await lockDrift(directory, record, binding)
    const initialized = await stat(join(directory, 'run-state.json')).then(() => true, () => false)
    return [phaseLine('ORACLE_READY', lockedNext(dir, drift, initialized)), `locked ${graphProfile(binding)}`, drift ? 'STALE: the locked bytes changed after the lock' : null].filter(Boolean).join(' · ')
  }
  const last = record.checks?.at(-1)
  // 0.126 기록은 검사 없이 단계만 적었다 — 첫 step 전까지 그 이름을 보이고, 다음은 파일을 판정하는 step이다
  if (!last) return phaseLine(record.stage ?? null, nextCommand('step', dir))
  const current = last.files === (await filesDigest(directory))
  return [
    phaseLine(last.label, nextCommand(current ? last.next : 'step', dir)),
    `${last.label} ${graphProfile(binding)}`,
    sinceLabel(record.history, last.label, nowMs),
    current ? null : 'files changed since the last check',
  ].filter(Boolean).join(' · ')
}

async function status(directory) {
  const record = await readStage(directory)
  if (!record) return { stage: null }
  const binding = await bindingAt(directory, record)
  const last = record.checks?.at(-1)
  return {
    stage: record.stage === 'ORACLE_READY' ? 'ORACLE_READY' : last?.label ?? record.stage ?? null,
    ...(binding.kind === 'explicit' ? { verificationProfile: binding.profile } : {}),
    current: record.stage === 'ORACLE_READY' ? !(await lockDrift(directory, record, binding)) : Boolean(last) && last.files === (await filesDigest(directory)),
    sameIssues: sameIssuesRun(record.checks),
    reviews: Object.fromEntries(await Promise.all(ROUND_KINDS.map(async (kind) => [kind, await reviewRounds(directory, record, kind)]))),
    history: record.history,
  }
}

const USAGE = 'usage: oracle-stage.mjs status --dir <.ai/oracles/<id>> [--brief]  (oracle-step.mjs runs the authoring graph; oracle-lock.mjs create locks it)'

function parse(args) {
  const options = {}
  let index = 0
  while (index < args.length) {
    const [name, value] = [args[index], args[index + 1]]
    if (name === '--brief') options.brief = true
    else if (name === '--dir' && value !== undefined) options.dir = value
    else throw new StageError('USAGE', `Unknown or incomplete option: ${name}\n${USAGE}`, 2)
    index += name === '--dir' ? 2 : 1
  }
  return options
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parse(args)
  if (command !== 'status' || !options.dir) throw new StageError('USAGE', USAGE, 2)
  // cwd는 realpath로 보고된다(macOS /var → /private/var) — 같은 표기로 저장소 루트 기준 상대 경로를 만든다
  const directory = await realpath(resolve(options.dir)).catch(() => resolve(options.dir))
  process.stdout.write(options.brief ? `${await briefStatus(directory)}\n` : `${JSON.stringify(await status(directory))}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const cliError = error instanceof StageError ? error : new StageError(error.code ?? 'STAGE_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  })
}
