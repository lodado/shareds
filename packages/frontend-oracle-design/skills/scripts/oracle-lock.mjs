#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
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

function portablePath(from, to) {
  return relative(from, to).split(sep).join('/')
}

async function sha256(path) {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

function assertManifest(manifest) {
  const validEntry = (entry) =>
    entry &&
    typeof entry.path === 'string' &&
    /^[a-f0-9]{64}$/.test(entry.sha256)

  if (
    manifest?.schemaVersion !== 1 ||
    manifest.algorithm !== 'sha256' ||
    !validEntry(manifest.oracle) ||
    !Array.isArray(manifest.sources) ||
    !manifest.sources.every(validEntry)
  ) {
    throw new CliError('LOCK_INVALID', 'Lock manifest does not match schema version 1')
  }
}

function sameEntries(left, right) {
  if (left.length !== right.length) return false
  const byPath = (first, second) =>
    first.path < second.path ? -1 : first.path > second.path ? 1 : 0
  const sortedLeft = [...left].sort(byPath)
  const sortedRight = [...right].sort(byPath)

  return sortedLeft.every(
    (entry, index) =>
      entry.path === sortedRight[index].path &&
      entry.sha256 === sortedRight[index].sha256,
  )
}

async function assertExistingLockUnchanged(lockPath, manifest) {
  const existing = await readManifest(lockPath)

  if (
    existing.oracle.path !== manifest.oracle.path ||
    existing.oracle.sha256 !== manifest.oracle.sha256
  ) {
    throw new CliError('ORACLE_CHANGED', 'Existing lock belongs to different Oracle bytes')
  }

  if (!sameEntries(existing.sources, manifest.sources)) {
    throw new CliError('SOURCE_CHANGED', 'Existing lock belongs to different source bytes')
  }
}

async function createLock(options) {
  if (!options.oracle || !options.lock) {
    throw new CliError('USAGE', 'create requires --oracle and --lock', 2)
  }

  const lockPath = resolve(options.lock)
  const lockDirectory = dirname(lockPath)
  const oraclePath = resolve(options.oracle)
  const sourcePaths = [...new Set(options.sources.map((path) => resolve(path)))]

  const sources = await Promise.all(
    sourcePaths.map(async (path) => ({
      path: portablePath(lockDirectory, path),
      sha256: await sha256(path),
    })),
  )
  sources.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )

  const manifest = {
    schemaVersion: 1,
    algorithm: 'sha256',
    oracle: {
      path: portablePath(lockDirectory, oraclePath),
      sha256: await sha256(oraclePath),
    },
    sources,
  }

  await mkdir(lockDirectory, { recursive: true })
  try {
    await writeFile(lockPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    await assertExistingLockUnchanged(lockPath, manifest)
  }
  process.stdout.write(`ORACLE_LOCKED sha256:${manifest.oracle.sha256}\n`)
}

async function readManifest(lockPath) {
  try {
    const manifest = JSON.parse(await readFile(lockPath, 'utf8'))
    assertManifest(manifest)
    return manifest
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError('LOCK_INVALID', `Cannot read lock manifest: ${error.message}`)
  }
}

async function verifyEntry(lockDirectory, entry, changedCode) {
  const path = resolve(lockDirectory, entry.path)
  let actual

  try {
    actual = await sha256(path)
  } catch (error) {
    throw new CliError(changedCode, `Cannot read ${entry.path}: ${error.message}`)
  }

  if (actual !== entry.sha256) {
    throw new CliError(changedCode, `${entry.path} no longer matches the lock`)
  }
}

async function verifyLock(options) {
  if (!options.lock || options.oracle || options.sources.length > 0) {
    throw new CliError('USAGE', 'verify requires only --lock', 2)
  }

  const lockPath = resolve(options.lock)
  const lockDirectory = dirname(lockPath)
  const manifest = await readManifest(lockPath)

  await verifyEntry(lockDirectory, manifest.oracle, 'ORACLE_CHANGED')
  for (const source of manifest.sources) {
    await verifyEntry(lockDirectory, source, 'SOURCE_CHANGED')
  }

  process.stdout.write(`ORACLE_VERIFIED sha256:${manifest.oracle.sha256}\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)

  if (command === 'create') await createLock(options)
  else if (command === 'verify') await verifyLock(options)
  else throw new CliError('USAGE', 'Expected create or verify', 2)
}

try {
  await main()
} catch (error) {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
  process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
  process.exitCode = cliError.exitCode
}
