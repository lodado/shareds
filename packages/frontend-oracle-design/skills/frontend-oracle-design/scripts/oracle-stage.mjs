#!/usr/bin/env node

// lock 전 단계 기계 — 인터뷰·모델·검사·Draft를 건너뛰고 lock으로 가는 길을 스크립트로 막는다.
// DISCOVERING → MODELED → CHECKED → DRAFTED → ORACLE_READY(lock이 성공하면 lock이 쓴다). 한 걸음씩만 앞으로 가고, 걸음마다
// 이미 있는 검사를 부른다: 패키지 구조(validate --stage model), 파생·교차검증 처분(derive + cross-check 관문),
// 카드 재생성 비교(check-card). 패키지 바이트가 바뀌면 기록은 낡은 것이다 — rewind로 되돌아가 다시 걷는다.
// 패키지가 없는 손으로 쓴 카드는 이 기계를 거치지 않는다. 이 기록은 손으로 써도 통과하지 못한다는 보증이 아니라(원장과 같은
// 자기 신고다), 단계를 건너뛰는 가장 쉬운 길을 닫는다 — 위조는 hook이 stage.json 직접 쓰기를 막고 리뷰가 본다.

import { spawnSync } from 'node:child_process'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { elapsedLabel, sha256, withDirectoryLock } from './oracle-fs.mjs'
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

function moved(record, stage, digest, evidence, timing = {}) {
  const iterations = record.iterations
  return {
    ...record,
    stage,
    ...(record.verificationProfile === 'contract/v1' ? { cardSha256: digest } : { packageSha256: digest }),
    iterations: { ...iterations, inputs: { ...iterations.inputs, stage: { digest: digest ?? sha256(evidence), round: iterations.round } } },
    history: [...record.history, { stage, ...(record.verificationProfile === 'contract/v1' ? { cardSha256: digest } : { packageSha256: digest }), evidence, iterationRound: iterations.round, at: now(), ...timing }],
  }
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
  return binding
}

/** lock이 만들어진 뒤 기록을 ORACLE_READY로 옮긴다. 패키지 경로가 아니면 아무것도 하지 않는다. */
export async function markLocked(directory) {
  const record = await readStage(directory)
  if (!record || record.stage === 'ORACLE_READY') return
  const binding = await assertReadyToLock(directory)
  const bytes = binding.profile === 'contract/v1' ? await cardBytes(directory) : await packageBytes(directory)
  if (!bytes) return
  await writeStage(directory, moved(record, 'ORACLE_READY', sha256(bytes), 'lock'))
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
  const { asyncCellIssues, loadPackage, packageIssues, derivePackage } = await import('./oracle-package.mjs')
  const loaded = await loadPackage(packagePath, { root: process.cwd() })
  if (target === 'MODELED') {
    const issues = [...packageIssues(loaded.pkg, { stage: 'model' }), ...asyncCellIssues(loaded.pkg, { required: true })]
    if (issues.length > 0) throw new StageError('STAGE_GATE', `package is not model-complete: ${issues.join('; ')}`)
    return 'package validate --stage model'
  }
  if (target === 'CHECKED') {
    const { ensureBend } = await import('./ensure-bend.mjs')
    const { crossCheckIssues } = await import('./oracle-discovery.mjs')
    const { bin } = await ensureBend()
    const { derived } = await derivePackage(loaded, { bin, timeoutMs })
    if (derived.status !== 'derived') throw new StageError('STAGE_GATE', `derive returned ${derived.status}`)
    const open = await crossCheckIssues({ loaded, bin, timeoutMs })
    if (open.length > 0) throw new StageError('STAGE_GATE', `cross-check is not settled: ${open.join('; ')}`)
    // 모델만으로 아는 결함은 잠그기 전에 막는다 — 잠근 뒤에 라벨 런이 알려 주면 그 모델은 고칠 수 없고 새 revision이 든다
    const { preLockIssues } = await import('./oracle-adequacy.mjs')
    const adequacy = await preLockIssues({ package: packagePath, bin, cwd: process.cwd(), timeoutMs })
    if (adequacy.issues.length > 0)
      throw new StageError(
        'STAGE_GATE',
        `the model has defects the lock would freeze: ${adequacy.issues.join('; ')} — fix them in the package or world, then run oracle-adequacy.mjs check --package for the full report`,
      )
    return `derive ${derived.digest}; cross-check settled; ${
      adequacy.checked ? `adequacy found no refuted check or unsatisfiable setting over ${adequacy.worlds} worlds` : `adequacy not judged (${adequacy.reason})`
    }`
  }
  // DRAFTED — 카드의 생성 영역이 패키지에서 다시 만든 것과 같다
  // 카드의 투영 다이제스트가 패키지 경로 표기를 품는다 — 저장소 루트 기준 상대 경로로 project-card한 카드와 같은 표기로 비교한다
  const checked = spawnSync(
    process.execPath,
    [packageScript, 'check-card', '--package', relative(process.cwd(), packagePath), '--card', relative(process.cwd(), join(directory, 'oracle.md'))],
    { encoding: 'utf8', cwd: process.cwd() },
  )
  if (checked.status !== 0)
    throw new StageError('STAGE_GATE', `check-card failed: ${(checked.stdout + checked.stderr).trim().split('\n')[0]}`)
  return 'check-card'
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
  const stages = AUTHORING_STAGES[binding.profile] ?? STAGES
  const next = stages[stages.indexOf(record.stage) + 1]
  if (target !== next) throw new StageError('STAGE_SKIP', `${record.stage} can only advance to ${next ?? 'nothing'}, not ${target}`)
  const contract = binding.profile === 'contract/v1'
  const bytes = contract ? await cardBytes(directory) : await packageBytes(directory)
  if (!bytes) throw new StageError('STAGE_NO_PACKAGE', `${PACKAGE_FILE} is not in ${directory}`)
  const digest = contract ? record.cardSha256 : record.packageSha256
  if (digest && digest !== sha256(bytes))
    throw new StageError('STAGE_STALE', contract ? 'whole approved card changed after CHECKED - rewind --to <stage> --reason <cause>, then advance again' : `${PACKAGE_FILE} changed after ${record.stage} — rewind --to <stage> --reason <cause>, then advance again`)
  const started = performance.now()
  const evidence = await gate(directory, target, { ...options, profile: binding.profile })
  if (contract && sha256(await cardBytes(directory)) !== sha256(bytes)) throw new StageError('STAGE_STALE', 'whole Contract card changed during gate')
  const result = moved(record, target, sha256(bytes), evidence, { durationMs: Math.round(performance.now() - started) })
  await writeStage(directory, result)
  return result
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
  const inputSha256 = sha256(JSON.stringify([bytes?.toString('utf8'), (await cardBytes(directory))?.toString('utf8')]))
  const previous = record.history.at(-1)
  if (record.stage === target && previous?.evidence === 'rewind' && previous.inputSha256 === inputSha256) return record
  const budget = record.iterations.inputs.stage ? record.iterations : {
    ...record.iterations, inputs: { ...record.iterations.inputs, stage: { digest: sha256('begin'), round: record.iterations.round } },
  }
  const iterations = observeIteration(budget, 'stage', inputSha256, { force: true })
  const result = moved({ ...record, iterations }, target, rewoundDigest(target, bytes), 'rewind')
  Object.assign(result.history.at(-1), { inputSha256, ...explanation })
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

/** 기록한 바이트와 지금 바이트가 다르면 그 단계 기록은 낡았다(Contract는 카드, Formal은 패키지). */
async function isStale(directory, record, binding) {
  const contract = binding.profile === 'contract/v1'
  const bytes = contract ? await cardBytes(directory) : await packageBytes(directory)
  const digest = contract ? record.cardSha256 : record.packageSha256
  return Boolean(digest) && (!bytes || digest !== sha256(bytes))
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
  oracle-stage.mjs advance --dir <dir> --to MODELED|CHECKED|DRAFTED [--timeout-ms <n>]
  oracle-stage.mjs rewind --dir <dir> --to DISCOVERING|MODELED|CHECKED|DRAFTED --reason ${REWIND_REASONS.join('|')} [--note <one line>]
  oracle-stage.mjs review-input --dir <dir> --kind <review-kind> --input <raw-input> --attempt <dispatch-id> [--model <id>] [--effort <level>]
  oracle-stage.mjs extend --dir <dir> --approval <explicit-user-approval.json>
  oracle-stage.mjs status --dir <dir> [--brief]`

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
  const explanation = command === 'rewind' ? rewindReason(options.reason, options.note) : undefined
  if (command === 'begin') await mkdir(directory, { recursive: true })
  const result = await withDirectoryLock(directory, 'stage', async () => {
    if (command === 'begin') return begin(directory, options.profile)
    if (command === 'advance') return advance(directory, options.to, { timeoutMs, requestedProfile: options.profile })
    if (command === 'extend') return extend(directory, options.approval)
    return rewind(directory, options.to, explanation)
  })
  // rewind는 기록된 이유를 돌려준다 — 같은 되돌림의 재시도는 처음 이유를 유지하므로 호출자가 그것을 본다(undefined는 출력에서 빠진다)
  const { evidence, reason } = result.history.at(-1)
  process.stdout.write(`${JSON.stringify({ stage: result.stage, evidence, reason: command === 'rewind' ? reason : undefined, iterations: iterationStatus(result.iterations) })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const cliError = error instanceof StageError ? error : new StageError(error.code ?? 'STAGE_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  })
}
