#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  assertSnapshotUnchanged,
  isPathInside,
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
  const options = { sources: [] }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    const value = args[index + 1]
    if (!['--oracle', '--lock', '--source'].includes(flag) || !value) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${flag}`, 2)
    }
    if (flag === '--source') options.sources.push(value)
    else options[flag.slice(2)] = value
    index += 1
  }
  return options
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

async function assertCardLintSnapshot(oracle, sources, rootDirectory) {
  const snapshotRoot = await mkdtemp(join(tmpdir(), 'oracle-lock-snapshot-'))
  const repoRoot = join(snapshotRoot, 'repo')
  try {
    const candidatePath = join(snapshotRoot, 'candidate', 'oracle.md')
    await mkdir(repoRoot, { recursive: true })
    await mkdir(dirname(candidatePath), { recursive: true })
    await writeFile(candidatePath, oracle.bytes)

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

    const args = [verifyScript, 'card', '--oracle', '../candidate/oracle.md']
    for (const source of sourcePaths.length > 0 ? sourcePaths : ['']) args.push('--source', source)
    const linted = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
    if (linted.status !== 0) {
      const detail =
        linted.stderr ||
        linted.error?.message ||
        (linted.signal ? `CARD_LINT_FAILED: oracle-verify card terminated by ${linted.signal}` : '') ||
        'CARD_LINT_FAILED: oracle-verify card failed'
      const [code, ...message] = detail.split(': ')
      throw new CliError(code.trim(), message.join(': ').trim() || 'oracle-verify card failed')
    }
  } finally {
    await rm(snapshotRoot, { recursive: true, force: true })
  }
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
  await assertCardLintSnapshot(oracleSnapshot, sourceSnapshots, rootDirectory)

  const manifest = {
    algorithm: 'sha256',
    oracle: { path: 'oracle.md', sha256: oracleSnapshot.sha256 },
    schemaVersion: 1,
    sources: sourceSnapshots
      .map((source) => ({ path: portablePath(canonicalLockDirectory, source.realPath), sha256: source.sha256 }))
      .sort(comparePath),
  }
  await assertUnchanged(oracleSnapshot, 'INPUT_UNREADABLE', { allowHardlinks: false, base: rootDirectory })
  for (const source of sourceSnapshots) {
    await assertUnchanged(source, 'INPUT_UNREADABLE', { allowHardlinks: false, base: rootDirectory })
  }

  let finalLock
  if (presentLock) {
    if (presentLock.manifest.oracle.sha256 !== manifest.oracle.sha256) throw new CliError('ORACLE_CHANGED', 'Existing lock belongs to different Oracle bytes')
    if (!sameEntries(presentLock.manifest.sources, manifest.sources)) throw new CliError('SOURCE_CHANGED', 'Existing lock belongs to different source bytes')
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
      if (racedLock.manifest.oracle.sha256 !== manifest.oracle.sha256 || !sameEntries(racedLock.manifest.sources, manifest.sources)) {
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
  if (!options.lock || options.oracle || options.sources.length > 0) throw new CliError('USAGE', 'verify requires only --lock', 2)
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
  await assertCardLintSnapshot(oracleSnapshot, sourceSnapshots, rootDirectory)
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
