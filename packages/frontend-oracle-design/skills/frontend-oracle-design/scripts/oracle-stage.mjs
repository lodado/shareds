#!/usr/bin/env node

// lock 전 단계 기계 — 인터뷰·모델·검사·Draft를 건너뛰고 lock으로 가는 길을 스크립트로 막는다.
// DISCOVERING → MODELED → CHECKED → DRAFTED → ORACLE_READY(lock이 성공하면 lock이 쓴다). 한 걸음씩만 앞으로 가고, 걸음마다
// 이미 있는 검사를 부른다: 패키지 구조(validate --stage model), 파생·교차검증 처분(derive + cross-check 관문)과 적정성·
// 증명·법칙, 카드 재생성 비교(check-card). 패키지 바이트가 바뀌면 기록은 낡은 것이다 — rewind로 되돌아가 다시 걷는다.
// CHECKED부터는 관문이 판정한 Bend 파일과 등록한 출처도 고정한다(inputsSha256, 잠그지 않는 PROOF.bend는 빼고) — 패키지를
// 그대로 두고 Bend만 고쳐 다시 투영한 카드가 CHECKED를 다시 돌지 않고 lock까지 가지 않게.
// 패키지가 없는 손으로 쓴 카드는 이 기계를 거치지 않는다. 이 기록은 손으로 써도 통과하지 못한다는 보증이 아니라(원장과 같은
// 자기 신고다), 단계를 건너뛰는 가장 쉬운 길을 닫는다 — 위조는 hook이 stage.json 직접 쓰기를 막고 리뷰가 본다.

import { spawnSync } from 'node:child_process'
import { lstat, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { elapsedLabel, repositoryRoot, sha256, stableStringify, withDirectoryLock } from './oracle-fs.mjs'
import { assertIterationAvailable, extendIterations, iterationBudget, iterationStatus, observeIteration } from './oracle-iterations.mjs'
import { readCardProfile, resolveProfileBinding } from './oracle-profile.mjs'
import { isEmptyCell, markdownLines, sectionLines } from './oracle-space.mjs'

export const STAGES = ['DISCOVERING', 'MODELED', 'CHECKED', 'DRAFTED', 'ORACLE_READY']
export const AUTHORING_STAGES = Object.freeze({
  'formal-bend/v1': Object.freeze([...STAGES]),
  'contract/v1': Object.freeze(['DISCOVERING', 'CHECKED', 'DRAFTED', 'ORACLE_READY']),
})
export const STAGE_FILE = 'stage.json'
const PACKAGE_FILE = 'oracle.package.json'
const packageScript = join(fileURLToPath(new URL('.', import.meta.url)), 'oracle-package.mjs')
const REVIEW_KINDS = new Set(['model-analyst', 'translation', 'cold-read', 'reverse-impossible', 'source-aware'])
// 되돌린 이유 — oracle-reflect.mjs가 run을 가로질러 같은 원인을 센다. 자유 서술은 note 한 줄로만 붙는다.
export const REWIND_REASONS = Object.freeze(['review-finding', 'gate-failure', 'user-answer', 'source-change'])
const NOTE_LIMIT = 200
// 독립 디스패치 기록은 최근 것만 둔다 — 시간 보고(oracle-reflect --timing)와 진행 한 줄(status --brief)이 읽는다
const DISPATCH_LIMIT = 100
const DETAIL_LIMIT = 80

// 단계 기록의 시각 — 판정에는 쓰지 않고, 단계별 리드타임과 진행 한 줄만 이것으로 계산한다
const now = () => new Date().toISOString() // oracle:nondeterminism 기록은 실제 시각을 남긴다

class StageError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

export async function readStage(directory) {
  let record
  try {
    record = JSON.parse(await readFile(join(directory, STAGE_FILE), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new StageError('STAGE_INVALID', `${STAGE_FILE} cannot be read: ${error.message}`)
  }
  if (record?.schemaVersion !== 1 || !STAGES.includes(record.stage) || !Array.isArray(record.history))
    throw new StageError('STAGE_INVALID', `${STAGE_FILE} does not match schema version 1`)
  if (record.verificationProfile !== undefined) {
    const binding = resolveProfileBinding({ bindings: [{ artifact: 'stage', profile: record.verificationProfile }] })
    if (!AUTHORING_STAGES[binding.profile]?.includes(record.stage)) throw new StageError('STAGE_INVALID', 'stage is not in its bound authoring profile')
  }
  // Old histories remain evidence. Upgrading must not grant eight completed rewinds a fresh allowance.
  record.iterations = iterationBudget(record.iterations, 1 + record.history.filter((entry) => entry.evidence === 'rewind').length)
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

function moved(record, stage, digest, evidence, { inputsSha256, ...timing } = {}) {
  const iterations = record.iterations
  const recorded = record.verificationProfile === 'contract/v1' ? { cardSha256: digest } : { packageSha256: digest }
  // CHECKED가 판정한 입력의 고정은 CHECKED 뒤 단계만 지닌다 — 그 앞으로 되돌아가면 풀린다
  const pinned = inputsSha256 ? { inputsSha256 } : {}
  const result = {
    ...record,
    stage,
    ...recorded,
    ...pinned,
    iterations: { ...iterations, inputs: { ...iterations.inputs, stage: { digest: digest ?? sha256(evidence), round: iterations.round } } },
    history: [...record.history, { stage, ...recorded, ...pinned, evidence, iterationRound: iterations.round, at: now(), ...timing }],
  }
  if (!inputsSha256) delete result.inputsSha256
  return result
}

/**
 * lock 관문 — 패키지 경로의 오라클은 DRAFTED에서만, 기록한 것과 같은 패키지 바이트로만 잠긴다. 이미 ORACLE_READY인 같은
 * 패키지의 재잠금(멱등)은 통과한다. 패키지가 없으면(손으로 쓴 카드) 해당 없다.
 */
export async function assertReadyToLock(directory, requestedProfile) {
  const record = await readStage(directory)
  const binding = await bindingAt(directory, record, requestedProfile)
  if (binding.profile === 'contract/v1') {
    if (!record) throw new StageError('STAGE_MISSING', 'Contract lock requires a DRAFTED stage')
    if (record.stage !== 'ORACLE_READY') assertIterationAvailable(record.iterations)
    if (!['DRAFTED', 'ORACLE_READY'].includes(record.stage)) throw new StageError('STAGE_NOT_DRAFTED', `the oracle is at ${record.stage}; the lock needs DRAFTED`)
    if (record.cardSha256 !== sha256(await cardBytes(directory))) throw new StageError('STAGE_STALE', 'whole approved card changed after CHECKED')
    return binding
  }
  const bytes = await packageBytes(directory)
  if (!bytes) {
    if (binding.kind === 'explicit') throw new StageError('STAGE_NO_PACKAGE', 'Explicit Formal requires oracle.package.json')
    return binding
  }
  if (!record) {
    throw new StageError(
      'STAGE_MISSING',
      `${PACKAGE_FILE} exists but there is no ${STAGE_FILE} — oracle-stage.mjs begin, then advance through MODELED, CHECKED and DRAFTED before the lock`,
    )
  }
  if (record.stage !== 'ORACLE_READY') assertIterationAvailable(record.iterations)
  if (!['DRAFTED', 'ORACLE_READY'].includes(record.stage))
    throw new StageError('STAGE_NOT_DRAFTED', `the oracle is at ${record.stage}; the lock needs DRAFTED`)
  if (record.packageSha256 !== sha256(bytes))
    throw new StageError('STAGE_STALE', `${PACKAGE_FILE} changed after ${record.stage} — oracle-stage.mjs rewind --to <stage> --reason <cause>, then advance again`)
  // 잠근 뒤에는 lock과 카드의 inputs-sha256 표식이 Bend를 지킨다 — 다시 잠그는 ORACLE_READY는 고정을 다시 재지 않는다
  if (record.stage === 'DRAFTED') await assertPinned(directory, record)
  return binding
}

/** lock이 만들어진 뒤 기록을 ORACLE_READY로 옮긴다. 패키지 경로가 아니면 아무것도 하지 않는다. */
export async function markLocked(directory) {
  const record = await readStage(directory)
  if (!record || record.stage === 'ORACLE_READY') return
  const binding = await assertReadyToLock(directory)
  const bytes = binding.profile === 'contract/v1' ? await cardBytes(directory) : await packageBytes(directory)
  if (!bytes) return
  await writeStage(directory, moved(record, 'ORACLE_READY', sha256(bytes), 'lock', { inputsSha256: record.inputsSha256 }))
}

async function gate(directory, target, { timeoutMs, profile } = {}) {
  if (profile === 'contract/v1') {
    const card = (await cardBytes(directory)).toString('utf8')
    const confirmation = sectionLines(markdownLines(card), 'User Confirmation')
    const source = confirmation.find((line) => /^- Source:/i.test(line.trim()))?.split(':').slice(1).join(':').trim()
    if (!confirmation.some((line) => /^- Status:\s*approved\s*$/i.test(line.trim())) || !source || isEmptyCell(source)) {
      throw new StageError('STAGE_GATE', 'Contract CHECKED requires actual user confirmation with approving response source')
    }
    const verifier = fileURLToPath(new URL('./oracle-verify.mjs', import.meta.url))
    const checked = spawnSync(process.execPath, [verifier, 'card', '--oracle', join(directory, 'oracle.md'), ...(target === 'CHECKED' ? ['--case-space'] : [])], { encoding: 'utf8', cwd: process.cwd() })
    if (checked.status !== 0) throw new StageError('STAGE_GATE', (checked.stderr || checked.stdout || checked.error?.message || 'Contract lint failed').trim())
    return target === 'CHECKED' ? 'approved strict Contract Space' : 'whole Contract card lint'
  }
  const packagePath = join(directory, PACKAGE_FILE)
  const { asyncCellIssues, loadPackage, packageIssues } = await import('./oracle-package.mjs')
  // `repo:` 출처는 고정과 같은 저장소 루트에서 푼다 — 관문이 판정한 파일과 고정이 재는 파일이 같아야 한다
  const root = pinRoot(directory)
  const loaded = await loadPackage(packagePath, { root })
  if (target === 'MODELED') {
    const issues = [...packageIssues(loaded.pkg, { stage: 'model' }), ...asyncCellIssues(loaded.pkg, { required: true })]
    if (issues.length > 0) throw new StageError('STAGE_GATE', `package is not model-complete: ${issues.join('; ')}`)
    return 'package validate --stage model'
  }
  if (target === 'CHECKED') return checkedGate(loaded, packagePath, timeoutMs)
  // DRAFTED — 카드의 생성 영역이 패키지에서 다시 만든 것과 같다
  // 카드의 투영 다이제스트가 패키지 경로 표기를 품는다 — 저장소 루트 기준 상대 경로로 project-card한 카드와 같은 표기로 비교한다
  const checked = spawnSync(
    process.execPath,
    [packageScript, 'check-card', '--package', relative(root, packagePath), '--card', relative(root, join(directory, 'oracle.md'))],
    { encoding: 'utf8', cwd: root },
  )
  if (checked.status !== 0)
    throw new StageError('STAGE_GATE', `check-card failed: ${(checked.stdout + checked.stderr).trim().split('\n')[0]}`)
  return 'check-card'
}

/** CHECKED — 파생, 교차검증, 잠그기 전 적정성·증명·법칙. 같은 입력으로 이미 통과했으면 영수증으로 넘어간다(checkedReceipt). */
async function checkedGate(loaded, packagePath, timeoutMs) {
  const { ensureBend } = await import('./ensure-bend.mjs')
  const { crossCheckIssues } = await import('./oracle-discovery.mjs')
  const { derivePackage } = await import('./oracle-package.mjs')
  const { readReceipt } = await import('./oracle-lock.mjs')
  const { bin } = await ensureBend()
  // 키를 못 만들면(읽을 수 없는 입력 등) 영수증 없이 관문을 돈다 — 그 실패는 아래 검사가 제 문장으로 알린다
  const receipt = await checkedReceipt(loaded, bin).catch(() => null)
  const remembered = receipt ? await readReceipt(receipt) : null
  if (remembered) return `${remembered}; receipt: these exact inputs passed before`
  const { derived } = await derivePackage(loaded, { bin, timeoutMs })
  if (derived.status !== 'derived') throw new StageError('STAGE_GATE', `derive returned ${derived.status}`)
  const open = await crossCheckIssues({ loaded, bin, timeoutMs })
  if (open.length > 0) throw new StageError('STAGE_GATE', `cross-check is not settled: ${open.join('; ')}`)
  // 모델만으로 아는 결함은 잠그기 전에 막는다 — 잠근 뒤에 라벨 런이 알려 주면 그 모델은 고칠 수 없고 새 revision이 든다
  const { preLockIssues } = await import('./oracle-adequacy.mjs')
  const adequacy = await preLockIssues({ package: packagePath, bin, cwd: loaded.root, timeoutMs })
  if (adequacy.issues.length > 0)
    throw new StageError(
      'STAGE_GATE',
      `the model has defects the lock would freeze: ${adequacy.issues.join('; ')} — fix them in the package or world, then run oracle-adequacy.mjs check --package for the full report`,
    )
  const verdict = adequacy.checked ? `adequacy found no refuted check or unsatisfiable setting over ${adequacy.worlds} worlds` : `adequacy not judged (${adequacy.reason})`
  const proof = await preLockProof({ ...(await behaviorFiles(loaded)), bin, timeoutMs })
  if (proof.issues.length > 0)
    throw new StageError(
      'STAGE_GATE',
      `the laws or their proof have defects the lock would freeze: ${proof.issues.join('; ')} — fix the model, the law or PROOF.bend, then run oracle-model.mjs laws and prove --dir for the full report`,
    )
  const evidence = [`derive ${derived.digest}`, 'cross-check settled', verdict, ...proof.notes].join('; ')
  if (receipt && settledByBytes(derived, adequacy) && proof.settled) await rememberChecked(receipt, loaded, bin, evidence)
  return evidence
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
 * CHECKED 영수증 — 파생·교차검증·적정성·증명·법칙은 패키지와 그 Bend 파일(전이 import 포함), LAWS.bend 옆 PROOF.bend와 그
 * import, 패키지가 등록한 `repo:` 출처, 하네스, node, bend만 읽는다. 그 바이트가 모두 같으면 같은 판정이 나오므로, 통과한 조합은 판정 문장과 함께 기억해 rewind 뒤 다시 걷는 길에서
 * 같은 관문(큰 모델에서는 Bend 열거)을 다시 돌지 않는다. 위치·규칙은 카드 lint 영수증과 같다(ORACLE_LINT_CACHE, `off`면 끔).
 * 실패는 남기지 않는다. `stamp`는 키에 들지 않는 파일 표식(크기·시각·inode)으로, 관문 전후를 비교하는 데만 쓴다 — 링크 자신과
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
 * CHECKED가 읽는 입력 — 패키지와 그 Bend 파일(전이 import 포함), 등록한 `repo:` 출처의 digest, 그리고 그 파일들의 표식.
 * `proof`면 PROOF.bend와 그 import도 잰다(영수증만): PROOF.bend는 잠그지 않는 증명 후보라 고정에 들지 않는다.
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
  const inputs = await bendInputs(entry)
  return { inputs, paths: inputs.map(({ path }) => path) }
}

/**
 * CHECKED의 고정 — 관문이 판정한 입력(checkedInputs)의 digest. `repo:` 출처는 저장소 루트 기준이라 오라클 디렉터리
 * (`<root>/.ai/oracles/<id>`)에서 루트를 얻는다: lock이 다른 cwd에서 불러도 같은 파일을 잰다. 그 밖의 자리는 관문과 같이 cwd다.
 */
async function checkedPin(directory, root = pinRoot(directory)) {
  const { loadPackage } = await import('./oracle-package.mjs')
  const loaded = await loadPackage(join(directory, PACKAGE_FILE), { root })
  const { inputs, sources, stamp } = await checkedInputs(loaded)
  return { digest: sha256(stableStringify({ inputs, sources })), stamp }
}

function pinRoot(directory) {
  const root = repositoryRoot(directory)
  return root === directory ? process.cwd() : root
}

/** 지금 입력의 고정값 — CHECKED가 기록하는 inputsSha256과 같다. 손으로 만든 stage 기록으로 lock 경계를 시험하는 테스트가 쓴다. */
export async function inputsPin(directory, { root } = {}) {
  return (await checkedPin(directory, root)).digest
}

/**
 * DRAFTED와 그 lock은 CHECKED가 판정한 입력 그대로여야 한다 — 고정이 없으면(0.107.0 전 기록) 판정한 입력을 알 수 없다.
 * CHECKED·DRAFTED는 그 자리에서 CHECKED를 다시 돌면 되고(recheckable), 잠근 기록은 되돌아가 다시 걷는다.
 */
async function assertPinned(directory, record) {
  const next = record.stage === 'ORACLE_READY'
    ? 'rewind --to MODELED --reason <cause> and advance again, or start a new revision'
    : 'advance --to CHECKED to judge the current inputs'
  if (!record.inputsSha256) throw new StageError('STAGE_STALE', `${record.stage} was recorded without the Bend pin (before 0.107.0) — ${next}`)
  const { digest } = await checkedPin(directory).catch((error) => {
    throw new StageError('STAGE_STALE', `the package inputs CHECKED judged cannot be read again: ${error.message}`)
  })
  if (digest !== record.inputsSha256) throw new StageError('STAGE_STALE', `the Bend files or registered sources changed after CHECKED — ${next}`)
}

/**
 * lock 파일 없이 ORACLE_READY를 다시 잠그는 길 — 같은 lock이 있으면 멱등 재잠금이지만, lock을 지우고 다시 만들면 CHECKED가
 * 판정하지 않은 모델을 그 승인과 함께 새로 잠글 수 있다. 그때는 CHECKED의 고정을 다시 잰다.
 */
export async function assertRelockPinned(directory) {
  const record = await readStage(directory)
  if (record?.stage !== 'ORACLE_READY' || (await bindingAt(directory, record)).profile === 'contract/v1' || !(await packageBytes(directory))) return
  await assertPinned(directory, record)
}

/**
 * 관문이 도는 동안 입력이 바뀌었으면(고쳤다가 되돌린 것까지) 그 판정은 키의 바이트가 낸 것이 아니다 — 패키지를 다시 읽어 키와
 * 파일 표식을 다시 재고, 둘 다 같을 때만 영수증을 남긴다.
 */
async function rememberChecked(receipt, loaded, bin, evidence) {
  const { loadPackage } = await import('./oracle-package.mjs')
  const { writeReceipt } = await import('./oracle-lock.mjs')
  // 다시 잴 수 없으면 남기지 않는다 — 다음 advance가 관문을 다시 돌 뿐이다
  const again = await loadPackage(loaded.path, { root: loaded.root }).then((reloaded) => checkedReceipt(reloaded, bin)).catch(() => null)
  if (again?.key !== receipt.key || again.stamp !== receipt.stamp) return
  // 영수증은 속도를 위한 캐시다 — 쓸 수 없는 위치(읽기 전용 tmpdir, 샌드박스)는 다음 advance가 관문을 다시 돌게 둘 뿐이다
  await writeReceipt(receipt, evidence).catch(() => {})
}

async function begin(directory, requestedProfile) {
  const binding = await bindingAt(directory, null, requestedProfile)
  if (binding.profile !== 'contract/v1' && !(await packageBytes(directory))) throw new StageError('STAGE_NO_PACKAGE', `${PACKAGE_FILE} is not in ${directory}`)
  if (await readStage(directory)) throw new StageError('STAGE_EXISTS', `${STAGE_FILE} already exists — use rewind to revisit a stage`)
  const record = { schemaVersion: 1, stage: 'DISCOVERING', packageSha256: null, iterations: iterationBudget(), history: [{ stage: 'DISCOVERING', packageSha256: null, evidence: 'begin', at: now() }] }
  if (binding.kind === 'explicit') {
    record.verificationProfile = binding.profile
    if (binding.profile === 'contract/v1') {
      delete record.packageSha256
      record.cardSha256 = null
      record.history = [{ stage: 'DISCOVERING', cardSha256: null, evidence: 'begin', at: record.history[0].at }]
    }
  }
  await mkdir(directory, { recursive: true })
  await writeStage(directory, record)
  return record
}

async function advance(directory, target, options) {
  const record = await readStage(directory)
  if (!record) throw new StageError('STAGE_MISSING', `no ${STAGE_FILE} — run begin first`)
  assertIterationAvailable(record.iterations)
  if (target === 'ORACLE_READY') throw new StageError('STAGE_LOCK_ONLY', 'ORACLE_READY is written by oracle-lock.mjs create, not by advance')
  const binding = await bindingAt(directory, record, options.requestedProfile)
  const recheck = await rechecks(directory, record, target, binding, options.explanation)
  const contract = binding.profile === 'contract/v1'
  const bytes = contract ? await cardBytes(directory) : await packageBytes(directory)
  if (!bytes) throw new StageError('STAGE_NO_PACKAGE', `${PACKAGE_FILE} is not in ${directory}`)
  const digest = contract ? record.cardSha256 : record.packageSha256
  if (digest && digest !== sha256(bytes))
    throw new StageError('STAGE_STALE', contract ? 'whole approved card changed after CHECKED - rewind --to <stage> --reason <cause>, then advance again' : `${PACKAGE_FILE} changed after ${record.stage} — rewind --to <stage> --reason <cause>, then advance again`)
  const started = performance.now()
  const run = () => gate(directory, target, { ...options, profile: binding.profile })
  const { evidence, inputsSha256 } = contract ? { evidence: await run() } : await pinnedGate(directory, record, target, run)
  if (contract && sha256(await cardBytes(directory)) !== sha256(bytes)) throw new StageError('STAGE_STALE', 'whole Contract card changed during gate')
  const result = moved(record, target, sha256(bytes), evidence, {
    durationMs: Math.round(performance.now() - started),
    inputsSha256,
    ...(recheck ? { recheck: true, ...options.explanation } : {}),
  })
  // 판정한 패키지의 뜻 — 되돌림이 뜻이 같은 수정(출처 위치)인지 가른다
  if (!contract) result.meaningSha256 = meaningOf(bytes)
  await writeStage(directory, result)
  return result
}

/**
 * 패키지의 뜻의 지문 — 출처의 위치(`sources[].location`)만 뺀 나머지다. 위치는 같은 출처를 가리키는 자리라, 옮겨도 행·정책·모델은
 * 그대로다(고정할 출처 바이트는 lock이 따로 잰다). 읽을 수 없으면 null이라 뜻이 같다고 보지 않는다.
 */
function meaningOf(bytes) {
  try {
    const document = JSON.parse(bytes.toString('utf8'))
    if (Array.isArray(document.sources)) document.sources = document.sources.map(withoutLocation)
    return sha256(stableStringify(document))
  } catch {
    return null
  }
}

function withoutLocation(source) {
  if (source === null || typeof source !== 'object') return source
  return { ...source, location: null }
}

/** 판정한 뒤 바뀐 것이 출처 위치뿐인가 — 바이트는 다르고 뜻의 지문은 같다. 지문이 없는 옛 기록은 그렇게 보지 않는다. */
function onlyMetadataChanged(record, bytes) {
  if (!bytes || record.packageSha256 === null || record.packageSha256 === sha256(bytes)) return false
  return record.meaningSha256 !== undefined && record.meaningSha256 === meaningOf(bytes)
}

/** 마지막 되돌림(없으면 시작) 뒤에 보낸 독립 리뷰의 종류 — 그 결과가 돌아왔는지는 기록에 없다. */
function dispatchedSinceLastRewind(record) {
  const lastWalk = [...record.history].reverse().find((entry) => entry.evidence === 'rewind' || entry.evidence === 'begin')
  const since = lastWalk ? Date.parse(lastWalk.at) : 0
  return [...new Set((record.dispatches ?? []).filter((entry) => Date.parse(entry.at) >= since).map((entry) => entry.kind))].sort()
}

/**
 * 그 자리에서 다시 검사 — CHECKED·DRAFTED 기록의 고정이 낡았거나 없으면(0.107.0 전) CHECKED를 다시 돈다. MODELED의 판정은
 * 패키지만 읽어 그대로이고(바뀐 패키지는 advance가 STAGE_STALE로 막는다), 되돌림이 아니어서 저작 라운드를 쓰지 않는다 —
 * 리뷰가 시킨 수리는 그 리뷰 입력이 이미 라운드를 센다.
 */
async function recheckable(directory, record, target, binding) {
  if (target !== 'CHECKED' || binding.profile === 'contract/v1' || !['CHECKED', 'DRAFTED'].includes(record.stage)) return false
  return assertPinned(directory, record).then(() => false, () => true)
}

/**
 * advance의 걸음 — 다음 단계로 가거나(false) CHECKED를 그 자리에서 다시 돈다(true). 그 밖은 STAGE_SKIP이다. 다시 검사는
 * 되돌림처럼 이유를 남길 수 있고(oracle-reflect가 재작업으로 센다), 앞으로 가는 걸음에는 이유가 없다.
 */
async function rechecks(directory, record, target, binding, explanation) {
  const stages = AUTHORING_STAGES[binding.profile] ?? STAGES
  const next = stages[stages.indexOf(record.stage) + 1]
  if (!stages.includes(target)) throw new StageError('STAGE_SKIP', `${record.stage} can only advance to ${next ?? 'nothing'}, not ${target}`)
  const recheck = target !== next && (await recheckable(directory, record, target, binding))
  if (target !== next && !recheck) throw new StageError('STAGE_SKIP', `${record.stage} can only advance to ${next ?? 'nothing'}, not ${target}`)
  if (explanation && !recheck) throw new StageError('USAGE', '--reason belongs to rewind or to advance --to CHECKED judging changed inputs again', 2)
  return recheck
}

/**
 * Formal 관문과 그 고정 — CHECKED는 관문 전후로 입력을 재어 그대로일 때만 그 digest를 고정한다(고쳤다 되돌린 것도 표식으로
 * 드러난다). 관문 전에 못 쟀으면 관문이 제 문장으로 실패를 알리고, 관문이 통과했는데 못 쟀다면 그 측정 오류를 알린다(다시
 * advance해도 같다). DRAFTED는 CHECKED의 고정을 관문 전후로 확인하고 지닌다. MODELED는 Bend를 읽지 않아 고정이 없다.
 */
async function pinnedGate(directory, record, target, run) {
  if (target === 'DRAFTED') {
    await assertPinned(directory, record)
    const evidence = await run()
    await assertPinned(directory, record)
    return { evidence, inputsSha256: record.inputsSha256 }
  }
  if (target !== 'CHECKED') return { evidence: await run() }
  const measure = () => checkedPin(directory).then((pin) => ({ pin }), (error) => ({ error }))
  const before = await measure()
  const evidence = await run()
  if (before.error) throw new StageError('STAGE_STALE', `the inputs CHECKED judged cannot be measured: ${before.error.message}`)
  const after = await measure()
  if (after.error || after.pin.digest !== before.pin.digest || after.pin.stamp !== before.pin.stamp)
    throw new StageError('STAGE_STALE', 'the Bend files or registered sources changed while the CHECKED gate ran — advance again')
  return { evidence, inputsSha256: before.pin.digest }
}

/** DISCOVERING으로 돌아가면 패키지 바이트의 고정을 푼다 — 모델 단계부터 다시 검사하며 새로 고정한다. */
function rewoundDigest(target, bytes) {
  if (target === 'DISCOVERING' || !bytes) return null
  return sha256(bytes)
}

function rewindReason(reason, note) {
  if (!REWIND_REASONS.includes(reason)) throw new StageError('USAGE', `rewind requires --reason ${REWIND_REASONS.join('|')}`, 2)
  if (note !== undefined && (!note.trim() || /[\r\n]/.test(note) || note.length > NOTE_LIMIT))
    throw new StageError('USAGE', `--note is one non-empty line of at most ${NOTE_LIMIT} characters`, 2)
  return note === undefined ? { reason } : { reason, note: note.trim() }
}

async function rewind(directory, target, explanation) {
  const record = await readStage(directory)
  if (!record) throw new StageError('STAGE_MISSING', `no ${STAGE_FILE} — run begin first`)
  const binding = await bindingAt(directory, record)
  const stages = AUTHORING_STAGES[binding.profile] ?? STAGES
  if (!stages.includes(target) || target === 'ORACLE_READY' || stages.indexOf(target) > stages.indexOf(record.stage))
    throw new StageError('STAGE_REWIND', `rewind goes back to DISCOVERING, MODELED, CHECKED or DRAFTED at or before ${record.stage}`)
  const contract = binding.profile === 'contract/v1'
  const bytes = contract ? await cardBytes(directory) : await packageBytes(directory)
  if (contract && target !== 'DISCOVERING' && record.cardSha256 !== sha256(bytes)) throw new StageError('STAGE_STALE', 'changed Contract must rewind to DISCOVERING for approval and strict Space recheck')
  // 바뀐 패키지를 MODELED·CHECKED로 되돌려 기록하면 그 단계의 관문을 건너뛴 채 새 바이트가 통과로 남는다 — 처음부터 다시 걷는다
  if (!contract && target !== 'DISCOVERING' && record.packageSha256 !== (bytes ? sha256(bytes) : null))
    throw new StageError('STAGE_STALE', `${PACKAGE_FILE} changed after ${record.stage} — a changed package walks back to DISCOVERING; only unchanged package bytes resume at ${target}`)
  // MODELED 관문은 Bend를 읽지 않는다 — 바뀐 Bend는 MODELED로 되돌아가 CHECKED를 다시 돈다
  const keepsPin = !contract && (target === 'CHECKED' || target === 'DRAFTED')
  if (keepsPin) await assertPinned(directory, record)
  const inputSha256 = sha256(JSON.stringify([bytes?.toString('utf8'), (await cardBytes(directory))?.toString('utf8')]))
  const previous = record.history.at(-1)
  if (record.stage === target && previous?.evidence === 'rewind' && previous.inputSha256 === inputSha256) return record
  const budget = record.iterations.inputs.stage ? record.iterations : {
    ...record.iterations, inputs: { ...record.iterations.inputs, stage: { digest: sha256('begin'), round: record.iterations.round } },
  }
  // 판정한 뒤 바뀐 것이 출처 위치뿐이면 리뷰가 읽은 뜻은 그대로다 — 저작 라운드를 쓰지 않는다(관문은 DISCOVERING부터 다시 돈다)
  const metadataOnly = !contract && onlyMetadataChanged(record, bytes)
  const iterations = metadataOnly ? budget : observeIteration(budget, 'stage', inputSha256, { force: true })
  const dispatched = explanation.reason === 'review-finding' ? [] : dispatchedSinceLastRewind(record)
  const result = moved({ ...record, iterations }, target, rewoundDigest(target, bytes), 'rewind', { inputsSha256: keepsPin ? record.inputsSha256 : undefined })
  Object.assign(result.history.at(-1), { inputSha256, ...explanation, ...(metadataOnly ? { metadataOnly: true } : {}), ...(dispatched.length > 0 ? { dispatchedBefore: dispatched } : {}) })
  await writeStage(directory, result)
  return result
}

/** 디스패치에 붙이는 모델·effort는 선택이다 — 한 줄짜리 짧은 이름만 받는다. */
function dispatchDetails({ model, effort } = {}) {
  const details = {}
  for (const [name, value] of Object.entries({ model, effort })) {
    if (value === undefined) continue
    if (!value.trim() || /[\r\n]/.test(value) || value.length > DETAIL_LIMIT) throw new StageError('USAGE', `--${name} is one non-empty line of at most ${DETAIL_LIMIT} characters`, 2)
    details[name] = value.trim()
  }
  return details
}

/** Pure review-input builders stay pure; public dispatch commands register their final bytes here. */
export async function recordAuthoringInput(directory, kind, text, attempt, details = {}) {
  if (!REVIEW_KINDS.has(kind)) throw new StageError('USAGE', `unknown review kind: ${kind}`, 2)
  if (attempt !== undefined && !attempt.trim()) throw new StageError('USAGE', '--attempt must name one dispatch', 2)
  const described = dispatchDetails(details)
  return withDirectoryLock(directory, 'stage', async () => {
    const record = await readStage(directory) ?? await begin(directory)
    if (record.stage === 'ORACLE_READY') throw new StageError('STAGE_LOCKED', 'authoring review cannot reopen a locked revision')
    let iterations = observeIteration(record.iterations, kind, sha256(text))
    if (attempt !== undefined) iterations = observeIteration(iterations, `${kind}:dispatch`, sha256(attempt))
    // 같은 디스패치의 재전송은 시각을 다시 찍지 않는다 — 처음 보낸 시각이 그 리뷰의 시작이다
    const seen = attempt === undefined || (record.dispatches ?? []).some((entry) => entry.kind === kind && entry.attempt === attempt)
    const dispatches = seen ? record.dispatches : [...(record.dispatches ?? []), { kind, attempt, at: now(), ...described }].slice(-DISPATCH_LIMIT)
    if (iterations !== record.iterations || dispatches !== record.dispatches) await writeStage(directory, { ...record, iterations, ...(dispatches ? { dispatches } : {}) })
    const result = iterationStatus(iterations)
    if (!record.iterations.inputs[kind]) result.mode = 'full'
    return result
  })
}

async function extend(directory, path) {
  if (!path) throw new StageError('ITERATION_APPROVAL_REQUIRED', 'extend requires --approval <explicit-user-approval.json>')
  const record = await readStage(directory)
  if (!record) throw new StageError('STAGE_MISSING', `no ${STAGE_FILE}`)
  if (record.stage === 'ORACLE_READY') throw new StageError('STAGE_LOCKED', 'an extension cannot unlock an approved revision')
  const approval = JSON.parse(await readFile(resolve(path), 'utf8'))
  const result = { ...record, iterations: extendIterations(record.iterations, approval, 'authoring') }
  await writeStage(directory, result)
  return result
}

/** 기록한 바이트와 지금 바이트가 다르면 그 단계 기록은 낡았다(Contract는 카드, Formal은 패키지와 CHECKED 뒤의 고정 입력). */
async function isStale(directory, record, binding) {
  const contract = binding.profile === 'contract/v1'
  const bytes = contract ? await cardBytes(directory) : await packageBytes(directory)
  const digest = contract ? record.cardSha256 : record.packageSha256
  if (digest && (!bytes || digest !== sha256(bytes))) return true
  if (contract || !['CHECKED', 'DRAFTED'].includes(record.stage)) return false
  return assertPinned(directory, record).then(() => false, () => true)
}

async function status(directory) {
  const record = await readStage(directory)
  if (!record) return { stage: null }
  const binding = await bindingAt(directory, record)
  return { stage: record.stage, ...(binding.kind === 'explicit' ? { verificationProfile: binding.profile } : {}), stale: await isStale(directory, record, binding), iterations: iterationStatus(record.iterations), history: record.history }
}

/**
 * 진행 한 줄 — 사용자가 "언제 끝남"을 묻기 전에 컨트롤러가 찍는다: 지금 단계와 자리, 그 단계에 머문 시간, 저작 예산,
 * 이 단계에서 보낸 독립 디스패치와 경과, 남은 단계. 판정을 대신하지 않는다 — 관문은 advance·lock이 연다.
 */
async function briefStatus(directory, nowMs = Date.now()) {
  const record = await readStage(directory)
  if (!record) return 'stage none · next: oracle-stage.mjs begin'
  const binding = await bindingAt(directory, record)
  const stages = AUTHORING_STAGES[binding.profile] ?? STAGES
  const position = stages.indexOf(record.stage)
  const entered = record.history.at(-1)?.at
  const iterations = iterationStatus(record.iterations)
  const dispatched = (record.dispatches ?? [])
    .filter((entry) => !entered || Date.parse(entry.at) >= Date.parse(entered))
    .map((entry) => `${entry.kind} ${elapsedLabel(entry.at, nowMs)} ago`)
  const remaining = stages.slice(position + 1).map((stage) => (stage === 'ORACLE_READY' ? 'lock' : stage))
  const place = [`stage ${record.stage}`, `${position + 1}/${stages.length}`, binding.profile].filter(Boolean).join(' ')
  return [
    place,
    entered ? `${elapsedLabel(entered, nowMs)} in stage` : null,
    `authoring round ${iterations.round}/${iterations.limit}${iterations.exhausted ? ' exhausted' : ''}`,
    dispatched.length ? `dispatched: ${dispatched.join(', ')}` : null,
    remaining.length ? `next: ${remaining.join(' → ')}` : 'next: oracle-run.mjs init',
    (await isStale(directory, record, binding)) ? 'STALE: the recorded bytes changed since this stage — rewind' : null,
  ].filter(Boolean).join(' · ')
}

const FLAGS = new Set(['brief'])
const VALUED = ['dir', 'to', 'timeout-ms', 'profile', 'kind', 'input', 'approval', 'attempt', 'reason', 'note', 'model', 'effort']

function parse(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]?.replace(/^--/, '')
    if (FLAGS.has(name)) {
      options[name] = true
      continue
    }
    if (!VALUED.includes(name) || args[index + 1] === undefined) throw new StageError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    options[name] = args[index + 1]
    index += 1
  }
  return options
}

const USAGE = `usage:
  oracle-stage.mjs begin --dir <.ai/oracles/<id>>
  oracle-stage.mjs advance --dir <dir> --to MODELED|CHECKED|DRAFTED [--timeout-ms <n>] [--reason <cause> [--note <one line>] when CHECKED judges changed inputs again]
  oracle-stage.mjs rewind --dir <dir> --to DISCOVERING|MODELED|CHECKED|DRAFTED --reason ${REWIND_REASONS.join('|')} [--note <one line>]
  oracle-stage.mjs review-input --dir <dir> --kind <review-kind> --input <raw-input> --attempt <dispatch-id> [--model <id>] [--effort <level>]
  oracle-stage.mjs extend --dir <dir> --approval <explicit-user-approval.json>
  oracle-stage.mjs status --dir <dir> [--brief]`

// 목표 단계(--to)를 받는 걸음
const TARGETED = new Set(['advance', 'rewind'])

/** 걸음에 목표가 없으면 기록을 읽기 전에 사용법 오류다 — 단계가 아닌 이름(STAGE_SKIP)과 다르다. */
function assertTargeted(command, to) {
  if (TARGETED.has(command) && to === undefined) throw new StageError('USAGE', `${command} requires --to <stage>`, 2)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parse(args)
  if (!options.dir || !['begin', 'advance', 'rewind', 'status', 'review-input', 'extend'].includes(command)) throw new StageError('USAGE', USAGE, 2)
  // cwd는 realpath로 보고된다(macOS /var → /private/var) — 같은 표기로 저장소 루트 기준 상대 경로를 만든다
  const directory = await realpath(resolve(options.dir)).catch(() => resolve(options.dir))
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  if (options.brief && command !== 'status') throw new StageError('USAGE', '--brief belongs to status', 2)
  if (command === 'status') {
    process.stdout.write(options.brief ? `${await briefStatus(directory)}\n` : `${JSON.stringify(await status(directory))}\n`)
    return
  }
  if (command === 'review-input') {
    if (!options.input) throw new StageError('USAGE', 'review-input requires --input', 2)
    const iterations = await recordAuthoringInput(directory, options.kind, await readFile(resolve(options.input), 'utf8'), options.attempt, { model: options.model, effort: options.effort })
    process.stdout.write(`${JSON.stringify({ iterations })}\n`)
    return
  }
  assertTargeted(command, options.to)
  const explained = command === 'rewind' || (command === 'advance' && options.reason !== undefined)
  const explanation = explained ? rewindReason(options.reason, options.note) : undefined
  if (command === 'begin') await mkdir(directory, { recursive: true })
  const result = await withDirectoryLock(directory, 'stage', async () => {
    if (command === 'begin') return begin(directory, options.profile)
    if (command === 'advance') return advance(directory, options.to, { timeoutMs, requestedProfile: options.profile, explanation })
    if (command === 'extend') return extend(directory, options.approval)
    return rewind(directory, options.to, explanation)
  })
  // rewind는 기록된 이유를 돌려준다 — 같은 되돌림의 재시도는 처음 이유를 유지하므로 호출자가 그것을 본다(undefined는 출력에서 빠진다)
  const { evidence, reason, metadataOnly, dispatchedBefore } = result.history.at(-1)
  const rewound = command === 'rewind'
  const unsettled = dispatchedBefore ? `reviews dispatched since the last rewind (${dispatchedBefore.join(', ')}) — a rewind drops what they read; check their results are back before changing the package again` : undefined
  process.stdout.write(`${JSON.stringify({ stage: result.stage, evidence, reason: rewound ? reason : undefined, metadataOnly: rewound ? metadataOnly : undefined, warning: rewound ? unsettled : undefined, iterations: iterationStatus(result.iterations) })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const cliError = error instanceof StageError ? error : new StageError(error.code ?? 'STAGE_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  })
}
