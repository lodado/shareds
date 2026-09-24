#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  assertSnapshotUnchanged,
  isPathInside,
  sha256,
  snapshotRegularFile,
} from './oracle-fs.mjs'

const verifyScript = join(dirname(fileURLToPath(import.meta.url)), 'oracle-verify.mjs')

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function fail(code) {
  return (message) => new CliError(code, message)
}

function parseOptions(args) {
  const options = { sources: [], deps: [] }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = args[index + 1]
    if (!['--oracle', '--lock', '--source', '--dep'].includes(flag) || !value) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${flag}`, 2)
    }
    if (flag === '--source') options.sources.push(value)
    else if (flag === '--dep') options.deps.push(value)
    else options[flag.slice(2)] = value
    index += 1
  }
  return options
}

/** landmine 스윕 대상 패키지의 설치 버전을 lock에 고정한다 — 드리프트는 verify sources가 감지한다. */
async function installedDependencies(rootDirectory, names) {
  const dependencies = []
  for (const name of [...new Set(names)].sort()) {
    const packagePath = resolve(rootDirectory, 'node_modules', name, 'package.json')
    let version
    try {
      version = JSON.parse(await readFile(packagePath, 'utf8')).version
    } catch (error) {
      throw new CliError('DEP_UNRESOLVED', `Cannot resolve installed version of ${name}: ${error.message}`)
    }
    if (typeof version !== 'string' || version === '') {
      throw new CliError('DEP_UNRESOLVED', `${name} has no version in its package.json`)
    }
    dependencies.push({ name, version })
  }
  return dependencies
}

function sameDependencies(left = [], right = []) {
  if (left.length !== right.length) return false
  const byName = (first, second) => {
    if (first.name < second.name) return -1
    if (first.name > second.name) return 1
    return 0
  }
  const sortedLeft = [...left].sort(byName)
  const sortedRight = [...right].sort(byName)
  return sortedLeft.every((entry, index) => entry.name === sortedRight[index].name && entry.version === sortedRight[index].version)
}

function repositoryRoot(lockDirectory) {
  const marker = `${sep}.ai${sep}oracles${sep}`
  const index = lockDirectory.indexOf(marker)
  return index === -1 ? lockDirectory : lockDirectory.slice(0, index)
}

function portablePath(from, to) {
  return relative(from, to).split(sep).join('/')
}

function comparePath(first, second) {
  if (first.path < second.path) return -1
  if (first.path > second.path) return 1
  return 0
}

function sameEntries(left, right) {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort(comparePath)
  const sortedRight = [...right].sort(comparePath)
  return sortedLeft.every((entry, index) => entry.path === sortedRight[index].path && entry.sha256 === sortedRight[index].sha256)
}

function sameWitnesses(left = [], right = []) {
  const key = (entries) => JSON.stringify([...entries].map(({ ref, sha256: digest }) => [ref, digest]).sort())
  return key(left) === key(right)
}

function assertManifest(manifest, lockDirectory) {
  const validEntry = (entry) => entry && typeof entry.path === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256)
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.algorithm !== 'sha256' ||
    !validEntry(manifest.oracle) ||
    !Array.isArray(manifest.sources) ||
    !manifest.sources.every(validEntry)
  ) {
    throw new CliError('LOCK_INVALID', 'Lock manifest does not match schema version 1')
  }
  if (manifest.witnesses !== undefined) {
    const validRef = (entry) => typeof entry.path === 'string' && !isAbsolute(entry.path) && String(entry.ref).startsWith(`${entry.path}#L`)
    const validBlock = (entry) => Number.isInteger(entry.lines) && entry.lines > 0 && /^[a-f0-9]{64}$/.test(entry.sha256)
    const validWitness = (entry) => Boolean(entry) && validRef(entry) && validBlock(entry)
    if (!Array.isArray(manifest.witnesses) || !manifest.witnesses.every(validWitness)) {
      throw new CliError('LOCK_INVALID', 'Lock manifest does not match schema version 1')
    }
  }
  if (manifest.dependencies !== undefined) {
    const validDependency = (entry) =>
      entry && typeof entry.name === 'string' && entry.name !== '' && typeof entry.version === 'string' && entry.version !== ''
    if (!Array.isArray(manifest.dependencies) || !manifest.dependencies.every(validDependency)) {
      throw new CliError('LOCK_INVALID', 'Lock manifest does not match schema version 1')
    }
  }
  if (manifest.oracle.path !== 'oracle.md' || isAbsolute(manifest.oracle.path) || resolve(lockDirectory, manifest.oracle.path) !== join(lockDirectory, 'oracle.md')) {
    throw new CliError(
      'LOCK_INVALID',
      `Lock Oracle must be the oracle.md sibling; source-lock-missing: alternate Oracle paths are not authoritative for ${manifest.sources
        .map(({ path }) => path)
        .join(', ')}`,
    )
  }
  for (const entry of manifest.sources) {
    if (isAbsolute(entry.path)) throw new CliError('LOCK_INVALID', 'Lock source paths must be relative')
  }
  if (manifest.sources.some((entry, index) => index > 0 && comparePath(manifest.sources[index - 1], entry) >= 0)) {
    throw new CliError('LOCK_INVALID', 'Lock source paths must be unique and sorted')
  }
}

async function snapshot(path, code, options = {}) {
  return snapshotRegularFile(path, { label: 'file', fail: fail(code), ...options })
}

async function assertUnchanged(file, code, options = {}) {
  return assertSnapshotUnchanged(file, { label: 'file', fail: fail(code), ...options })
}

async function readManifest(lockPath, lockDirectory, code = 'LOCK_INVALID', base) {
  const lockSnapshot = await snapshot(lockPath, code, { allowHardlinks: false, base })
  let manifest
  try {
    manifest = JSON.parse(lockSnapshot.bytes.toString('utf8'))
  } catch (error) {
    throw new CliError('LOCK_INVALID', `Cannot read lock manifest: ${error.message}`)
  }
  assertManifest(manifest, lockDirectory)
  return { manifest, lockSnapshot }
}

async function existingLock(lockPath, lockDirectory, rootDirectory) {
  const state = await lstat(lockPath).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw new CliError('LOCK_INVALID', `Cannot stat lock manifest: ${error.message}`)
  })
  if (!state) return null
  return readManifest(lockPath, lockDirectory, 'LOCK_INVALID', rootDirectory)
}

function lintFailure(result, fallback) {
  const detail =
    result.stderr ||
    result.error?.message ||
    (result.signal ? `CARD_LINT_FAILED: oracle-verify card terminated by ${result.signal}` : '') ||
    `CARD_LINT_FAILED: ${fallback}`
  const [code, ...message] = detail.split(': ')
  return new CliError(code.trim(), message.join(': ').trim() || fallback)
}

const WITNESS_REF = /^([^#]+)#L(\d+)(?:-L?(\d+))?$/

/** 카드의 `impossible … code(path#La-Lb)` witness ref — 판정 공간 IR에서 읽는다(카드를 다시 파싱하지 않는다). */
function codeWitnessRefs(candidate, cwd) {
  if (!candidate.bytes.includes('code(')) return []
  const derived = spawnSync(process.execPath, [verifyScript, 'card', '--ir', '--oracle', candidate.path], { cwd, encoding: 'utf8' })
  if (derived.status !== 0) throw lintFailure(derived, 'oracle-verify card --ir failed')
  const refs = JSON.parse(derived.stdout)
    .map((record) => record.disposition)
    .filter((disposition) => disposition.type === 'impossible' && disposition.witness?.kind === 'code')
    .map((disposition) => disposition.witness.ref)
    .filter((ref) => WITNESS_REF.test(ref))
  return [...new Set(refs)].sort()
}

function witnessBlock(content, ref) {
  const [, , from, to] = ref.match(WITNESS_REF)
  return content.split('\n').slice(Number(from) - 1, Number(to ?? from)).join('\n')
}

/** witness 파일을 스냅샷 레포에 복사하고 인용 블록을 해시한다. 레포 밖·링크·없는 파일은 건너뛴다 — lint가 보고한다. */
async function stageWitnesses(refs, rootDirectory, repoRoot) {
  const witnesses = []
  for (const ref of refs) {
    const path = ref.match(WITNESS_REF)[1]
    const file = await snapshot(resolve(rootDirectory, path), 'INPUT_UNREADABLE', {
      allowHardlinks: false,
      base: rootDirectory,
    }).catch(() => null)
    if (!file) continue
    const snapshotPath = join(repoRoot, portablePath(rootDirectory, file.realPath))
    await mkdir(dirname(snapshotPath), { recursive: true })
    await writeFile(snapshotPath, file.bytes)
    const block = witnessBlock(file.bytes.toString('utf8'), ref)
    witnesses.push({ ref, path, lines: block.split('\n').length, sha256: sha256(block) })
  }
  return witnesses
}

/**
 * 카드를 레포 안 원래 상대 경로에 둔 스냅샷에서 lint한다 — code() witness가 스냅샷 레포 루트를 기준으로 풀린다.
 * create는 witness 파일을 복사해 실재를 검사하고, verify는 manifest에 고정된 블록을 믿는다(`lockedWitnesses`).
 * 구현 중 witness 코드가 바뀐 것은 매 exec의 lint 실패가 아니라 GREEN의 WITNESS_INVALIDATED로 드러난다.
 */
async function assertCardLintSnapshot(oracle, sources, rootDirectory, lockedWitnesses = null) {
  const snapshotRoot = await mkdtemp(join(tmpdir(), 'oracle-lock-snapshot-'))
  const repoRoot = join(snapshotRoot, 'repo')
  try {
    await mkdir(repoRoot, { recursive: true })

    const sourcePaths = []
    for (const source of sources) {
      const repoPath = portablePath(rootDirectory, source.realPath)
      if (!isPathInside(rootDirectory, source.realPath) || isAbsolute(repoPath)) {
        throw new CliError('SOURCE_CHANGED', 'Source must stay under the repository root')
      }
      const snapshotPath = join(repoRoot, repoPath)
      await mkdir(dirname(snapshotPath), { recursive: true })
      await writeFile(snapshotPath, source.bytes)
      sourcePaths.push(portablePath(repoRoot, snapshotPath))
    }

    // 출처 뒤에 쓴다 — 같은 경로의 출처가 있어도 lint 대상은 잠글 카드 바이트다
    const candidatePath = join(repoRoot, portablePath(rootDirectory, oracle.realPath))
    await mkdir(dirname(candidatePath), { recursive: true })
    await writeFile(candidatePath, oracle.bytes)
    const candidate = { path: portablePath(repoRoot, candidatePath), bytes: oracle.bytes.toString('utf8') }

    const refs = codeWitnessRefs(candidate, repoRoot)
    if (lockedWitnesses && lockedWitnesses.map((entry) => entry.ref).sort().join('\n') !== refs.join('\n')) {
      throw new CliError('LOCK_INVALID', 'Lock witness records do not match the code() witnesses the card cites')
    }
    const witnesses = lockedWitnesses ? [] : await stageWitnesses(refs, rootDirectory, repoRoot)

    const args = [verifyScript, 'card', '--oracle', candidate.path]
    if (lockedWitnesses) args.push('--locked')
    for (const source of sourcePaths.length > 0 ? sourcePaths : ['']) args.push('--source', source)
    const linted = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
    if (linted.status !== 0) throw lintFailure(linted, 'oracle-verify card failed')
    return witnesses
  } finally {
    await rm(snapshotRoot, { recursive: true, force: true })
  }
}

/**
 * GREEN·REVIEW 직전: 잠긴 `impossible` witness 블록이 아직 그 파일 어딘가에 그대로 있는가. 위쪽 줄 삽입으로 번호만
 * 밀린 블록은 살아 있다. 사라진 ref 목록을 돌려준다 — 판정 주장이 기대던 코드를 구현이 바꿨다는 뜻이다.
 */
export async function invalidatedWitnesses(lockPath) {
  const lockDirectory = await realpath(dirname(resolve(lockPath)))
  const rootDirectory = await realpath(repositoryRoot(lockDirectory))
  const { manifest } = await readManifest(resolve(lockPath), lockDirectory, 'LOCK_INVALID', rootDirectory)
  const invalidated = []
  for (const witness of manifest.witnesses ?? []) {
    const file = await snapshot(resolve(rootDirectory, witness.path), 'INPUT_UNREADABLE', {
      allowHardlinks: false,
      base: rootDirectory,
    }).catch(() => null)
    const lines = file ? file.bytes.toString('utf8').split('\n') : []
    let found = false
    for (let start = 0; !found && start + witness.lines <= lines.length; start += 1) {
      found = sha256(lines.slice(start, start + witness.lines).join('\n')) === witness.sha256
    }
    if (!found) invalidated.push(witness.ref)
  }
  return invalidated
}

export async function createLock(options) {
  if (!options.oracle || !options.lock) throw new CliError('USAGE', 'create requires --oracle and --lock', 2)
  const lockPath = resolve(options.lock)
  const lockDirectory = dirname(lockPath)
  const canonicalLockDirectory = await realpath(lockDirectory).catch((error) => {
    throw new CliError('ORACLE_PATH_INVALID', `Cannot resolve Oracle directory: ${error.message}`)
  })
  const rootDirectory = await realpath(repositoryRoot(lockDirectory)).catch((error) => {
    throw new CliError('ORACLE_PATH_INVALID', `Cannot resolve repository root: ${error.message}`)
  })
  const oraclePath = resolve(options.oracle)
  const canonicalOracle = await realpath(oraclePath).catch((error) => {
    throw new CliError('ORACLE_PATH_INVALID', `Cannot resolve Oracle: ${error.message}`)
  })
  const expectedOracle = join(canonicalLockDirectory, 'oracle.md')
  if (canonicalOracle !== expectedOracle || !isPathInside(rootDirectory, canonicalOracle)) {
    throw new CliError('ORACLE_PATH_INVALID', 'Oracle must be the in-repository oracle.md sibling of its lock')
  }

  const presentLock = await existingLock(lockPath, lockDirectory, rootDirectory)
  const sourceInputs = [...new Set(options.sources)]
  if (sourceInputs.some(isAbsolute)) throw new CliError('INPUT_UNREADABLE', 'Sources must be repository-relative')
  const sourcePaths = sourceInputs.map((path) => resolve(rootDirectory, path))
  const oracleSnapshot = await snapshot(oraclePath, 'INPUT_UNREADABLE', {
    allowHardlinks: false,
    base: rootDirectory,
  })
  const sourceSnapshots = await Promise.all(
    sourcePaths.map((path) => snapshot(path, 'INPUT_UNREADABLE', { allowHardlinks: false, base: rootDirectory })),
  )
  const witnesses = await assertCardLintSnapshot(oracleSnapshot, sourceSnapshots, rootDirectory)

  const dependencies = await installedDependencies(rootDirectory, options.deps ?? [])
  const manifest = {
    algorithm: 'sha256',
    oracle: { path: 'oracle.md', sha256: oracleSnapshot.sha256 },
    schemaVersion: 1,
    sources: sourceSnapshots
      .map((source) => ({ path: portablePath(canonicalLockDirectory, source.realPath), sha256: source.sha256 }))
      .sort(comparePath),
    ...(dependencies.length > 0 ? { dependencies } : {}),
    ...(witnesses.length > 0 ? { witnesses } : {}),
  }
  await assertUnchanged(oracleSnapshot, 'INPUT_UNREADABLE', { allowHardlinks: false, base: rootDirectory })
  for (const source of sourceSnapshots) {
    await assertUnchanged(source, 'INPUT_UNREADABLE', { allowHardlinks: false, base: rootDirectory })
  }

  let finalLock
  if (presentLock) {
    if (presentLock.manifest.oracle.sha256 !== manifest.oracle.sha256) throw new CliError('ORACLE_CHANGED', 'Existing lock belongs to different Oracle bytes')
    if (!sameEntries(presentLock.manifest.sources, manifest.sources)) throw new CliError('SOURCE_CHANGED', 'Existing lock belongs to different source bytes')
    if (!sameDependencies(presentLock.manifest.dependencies, manifest.dependencies)) throw new CliError('SOURCE_CHANGED', 'Existing lock belongs to a different dependency set')
    if (!sameWitnesses(presentLock.manifest.witnesses, manifest.witnesses)) throw new CliError('SOURCE_CHANGED', 'Existing lock belongs to different witnessed code')
    finalLock = await assertUnchanged(presentLock.lockSnapshot, 'LOCK_INVALID', {
      allowHardlinks: false,
      base: rootDirectory,
    })
  } else {
    await mkdir(lockDirectory, { recursive: true })
    try {
      await writeFile(lockPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const racedLock = await readManifest(lockPath, lockDirectory, 'LOCK_INVALID', rootDirectory)
      if (
        racedLock.manifest.oracle.sha256 !== manifest.oracle.sha256 ||
        !sameEntries(racedLock.manifest.sources, manifest.sources) ||
        !sameDependencies(racedLock.manifest.dependencies, manifest.dependencies) ||
        !sameWitnesses(racedLock.manifest.witnesses, manifest.witnesses)
      ) {
        throw new CliError('LOCK_INVALID', 'Lock manifest appeared with different contents')
      }
      finalLock = await assertUnchanged(racedLock.lockSnapshot, 'LOCK_INVALID', {
        allowHardlinks: false,
        base: rootDirectory,
      })
    }
    finalLock ??= await snapshot(lockPath, 'LOCK_INVALID', { allowHardlinks: false, base: rootDirectory })
  }
  process.stdout.write(`ORACLE_LOCKED sha256:${manifest.oracle.sha256} manifest-sha256:${finalLock.sha256}\n`)
}

async function verifyEntry(lockDirectory, rootDirectory, entry, changedCode) {
  const path = resolve(lockDirectory, entry.path)
  if (!isPathInside(rootDirectory, path)) throw new CliError('LOCK_INVALID', 'Lock entry escapes the repository root')
  const file = await snapshot(path, changedCode, { allowHardlinks: false, base: rootDirectory })
  if (file.sha256 !== entry.sha256) throw new CliError(changedCode, `${entry.path} no longer matches the lock`)
  return file
}

export async function verifyLock(options, hooks = {}) {
  if (!options.lock || options.oracle || options.sources.length > 0 || (options.deps?.length ?? 0) > 0) throw new CliError('USAGE', 'verify requires only --lock', 2)
  const lockPath = resolve(options.lock)
  const lockDirectory = dirname(lockPath)
  const canonicalLockDirectory = await realpath(lockDirectory).catch((error) => {
    throw new CliError('LOCK_INVALID', `Cannot resolve Oracle directory: ${error.message}`)
  })
  const rootDirectory = await realpath(repositoryRoot(canonicalLockDirectory)).catch((error) => {
    throw new CliError('LOCK_INVALID', `Cannot resolve repository root: ${error.message}`)
  })
  const { manifest, lockSnapshot } = await readManifest(lockPath, canonicalLockDirectory, 'LOCK_INVALID', rootDirectory)
  const oracleSnapshot = await verifyEntry(canonicalLockDirectory, rootDirectory, manifest.oracle, 'ORACLE_CHANGED')
  const sourceSnapshots = []
  for (const source of manifest.sources) sourceSnapshots.push(await verifyEntry(canonicalLockDirectory, rootDirectory, source, 'SOURCE_CHANGED'))
  await assertCardLintSnapshot(oracleSnapshot, sourceSnapshots, rootDirectory, manifest.witnesses ?? [])
  await hooks.beforeFinalUnchangedAssertions?.()
  await assertUnchanged(oracleSnapshot, 'ORACLE_CHANGED', { allowHardlinks: false, base: rootDirectory })
  for (const source of sourceSnapshots) {
    await assertUnchanged(source, 'SOURCE_CHANGED', { allowHardlinks: false, base: rootDirectory })
  }
  await assertUnchanged(lockSnapshot, 'LOCK_MANIFEST_CHANGED', { allowHardlinks: false, base: rootDirectory })
  process.stdout.write(`ORACLE_VERIFIED sha256:${manifest.oracle.sha256} manifest-sha256:${lockSnapshot.sha256}\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)
  if (command === 'create') await createLock(options)
  else if (command === 'verify') await verifyLock(options)
  else throw new CliError('USAGE', 'Expected create or verify', 2)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
