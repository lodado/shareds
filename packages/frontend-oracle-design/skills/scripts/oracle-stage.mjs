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
import { sha256 } from './oracle-fs.mjs'

export const STAGES = ['DISCOVERING', 'MODELED', 'CHECKED', 'DRAFTED', 'ORACLE_READY']
export const STAGE_FILE = 'stage.json'
const PACKAGE_FILE = 'oracle.package.json'
const packageScript = join(fileURLToPath(new URL('.', import.meta.url)), 'oracle-package.mjs')

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
  return record
}

async function writeStage(directory, record) {
  const target = join(directory, STAGE_FILE)
  const staging = `${target}.${process.pid}.tmp`
  await writeFile(staging, `${JSON.stringify(record, null, 2)}\n`)
  await rename(staging, target)
}

const packageBytes = (directory) => readFile(join(directory, PACKAGE_FILE)).catch(() => null)

function moved(record, stage, digest, evidence) {
  return {
    ...record,
    stage,
    packageSha256: digest,
    history: [...record.history, { stage, packageSha256: digest, evidence }],
  }
}

/**
 * lock 관문 — 패키지 경로의 오라클은 DRAFTED에서만, 기록한 것과 같은 패키지 바이트로만 잠긴다. 이미 ORACLE_READY인 같은
 * 패키지의 재잠금(멱등)은 통과한다. 패키지가 없으면(손으로 쓴 카드) 해당 없다.
 */
export async function assertReadyToLock(directory) {
  const bytes = await packageBytes(directory)
  if (!bytes) return
  const record = await readStage(directory)
  if (!record) {
    throw new StageError(
      'STAGE_MISSING',
      `${PACKAGE_FILE} exists but there is no ${STAGE_FILE} — oracle-stage.mjs begin, then advance through MODELED, CHECKED and DRAFTED before the lock`,
    )
  }
  if (!['DRAFTED', 'ORACLE_READY'].includes(record.stage))
    throw new StageError('STAGE_NOT_DRAFTED', `the oracle is at ${record.stage}; the lock needs DRAFTED`)
  if (record.packageSha256 !== sha256(bytes))
    throw new StageError('STAGE_STALE', `${PACKAGE_FILE} changed after ${record.stage} — oracle-stage.mjs rewind, then advance again`)
}

/** lock이 만들어진 뒤 기록을 ORACLE_READY로 옮긴다. 패키지 경로가 아니면 아무것도 하지 않는다. */
export async function markLocked(directory) {
  const bytes = await packageBytes(directory)
  const record = bytes ? await readStage(directory) : null
  if (!record || record.stage === 'ORACLE_READY') return
  await writeStage(directory, moved(record, 'ORACLE_READY', sha256(bytes), 'lock'))
}

async function gate(directory, target, { timeoutMs } = {}) {
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
    return `derive ${derived.digest}; cross-check settled`
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

async function begin(directory) {
  if (!(await packageBytes(directory))) throw new StageError('STAGE_NO_PACKAGE', `${PACKAGE_FILE} is not in ${directory}`)
  if (await readStage(directory)) throw new StageError('STAGE_EXISTS', `${STAGE_FILE} already exists — use rewind to revisit a stage`)
  const record = { schemaVersion: 1, stage: 'DISCOVERING', packageSha256: null, history: [{ stage: 'DISCOVERING', packageSha256: null, evidence: 'begin' }] }
  await mkdir(directory, { recursive: true })
  await writeStage(directory, record)
  return record
}

async function advance(directory, target, options) {
  const record = await readStage(directory)
  if (!record) throw new StageError('STAGE_MISSING', `no ${STAGE_FILE} — run begin first`)
  if (target === 'ORACLE_READY') throw new StageError('STAGE_LOCK_ONLY', 'ORACLE_READY is written by oracle-lock.mjs create, not by advance')
  const next = STAGES[STAGES.indexOf(record.stage) + 1]
  if (target !== next) throw new StageError('STAGE_SKIP', `${record.stage} can only advance to ${next ?? 'nothing'}, not ${target}`)
  const bytes = await packageBytes(directory)
  if (!bytes) throw new StageError('STAGE_NO_PACKAGE', `${PACKAGE_FILE} is not in ${directory}`)
  if (record.packageSha256 && record.packageSha256 !== sha256(bytes))
    throw new StageError('STAGE_STALE', `${PACKAGE_FILE} changed after ${record.stage} — rewind, then advance again`)
  const evidence = await gate(directory, target, options)
  const result = moved(record, target, sha256(bytes), evidence)
  await writeStage(directory, result)
  return result
}

/** DISCOVERING으로 돌아가면 패키지 바이트의 고정을 푼다 — 모델 단계부터 다시 검사하며 새로 고정한다. */
function rewoundDigest(target, bytes) {
  if (target === 'DISCOVERING' || !bytes) return null
  return sha256(bytes)
}

async function rewind(directory, target) {
  const record = await readStage(directory)
  if (!record) throw new StageError('STAGE_MISSING', `no ${STAGE_FILE} — run begin first`)
  if (!STAGES.includes(target) || target === 'ORACLE_READY' || STAGES.indexOf(target) > STAGES.indexOf(record.stage))
    throw new StageError('STAGE_REWIND', `rewind goes back to DISCOVERING, MODELED, CHECKED or DRAFTED at or before ${record.stage}`)
  const bytes = await packageBytes(directory)
  const result = moved(record, target, rewoundDigest(target, bytes), 'rewind')
  await writeStage(directory, result)
  return result
}

async function status(directory) {
  const record = await readStage(directory)
  if (!record) return { stage: null }
  const bytes = await packageBytes(directory)
  return { stage: record.stage, stale: Boolean(record.packageSha256) && (!bytes || record.packageSha256 !== sha256(bytes)), history: record.history }
}

function parse(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '')
    if (!['dir', 'to', 'timeout-ms'].includes(name) || args[index + 1] === undefined)
      throw new StageError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    options[name] = args[index + 1]
  }
  return options
}

const USAGE = `usage:
  oracle-stage.mjs begin --dir <.ai/oracles/<id>>
  oracle-stage.mjs advance --dir <dir> --to MODELED|CHECKED|DRAFTED [--timeout-ms <n>]
  oracle-stage.mjs rewind --dir <dir> --to DISCOVERING|MODELED|CHECKED|DRAFTED
  oracle-stage.mjs status --dir <dir>`

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parse(args)
  if (!options.dir || !['begin', 'advance', 'rewind', 'status'].includes(command)) throw new StageError('USAGE', USAGE, 2)
  // cwd는 realpath로 보고된다(macOS /var → /private/var) — 같은 표기로 저장소 루트 기준 상대 경로를 만든다
  const directory = await realpath(resolve(options.dir)).catch(() => resolve(options.dir))
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  let result
  if (command === 'begin') result = await begin(directory)
  else if (command === 'advance') result = await advance(directory, options.to, { timeoutMs })
  else if (command === 'rewind') result = await rewind(directory, options.to)
  else result = await status(directory)
  process.stdout.write(`${JSON.stringify(command === 'status' ? result : { stage: result.stage, evidence: result.history.at(-1).evidence })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const cliError = error instanceof StageError ? error : new StageError(error.code ?? 'STAGE_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  })
}
