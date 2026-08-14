import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-lock.mjs')

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-lock-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  const oracle = join(directory, 'oracle.md')
  const source = join(directory, 'prd.md')
  const lock = join(directory, 'oracle.lock.json')
  await writeFile(oracle, '# Oracle\n')
  await writeFile(source, '# Requirement\n')

  return { lock, oracle, source }
}

test('creates and verifies an exact-byte lock', async (t) => {
  const { lock, oracle, source } = await fixture(t)

  const created = run(
    'create',
    '--oracle',
    oracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(created.status, 0, created.stderr)

  const manifest = JSON.parse(await readFile(lock, 'utf8'))
  const firstLock = await readFile(lock, 'utf8')
  assert.equal(manifest.schemaVersion, 1)
  assert.match(manifest.oracle.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(manifest.sources.map(({ path }) => path), ['prd.md'])

  const recreated = run(
    'create',
    '--oracle',
    oracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(recreated.status, 0, recreated.stderr)
  assert.equal(await readFile(lock, 'utf8'), firstLock)

  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 0, verified.stderr)
})

test('rejects changed Oracle and source bytes', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const created = run(
    'create',
    '--oracle',
    oracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(created.status, 0, created.stderr)

  await writeFile(oracle, '# Changed Oracle\n')
  const changedOracle = run('verify', '--lock', lock)
  assert.equal(changedOracle.status, 1)
  assert.match(changedOracle.stderr, /ORACLE_CHANGED/)

  await writeFile(oracle, '# Oracle\n')
  await writeFile(source, '# Changed Requirement\n')
  const changedSource = run('verify', '--lock', lock)
  assert.equal(changedSource.status, 1)
  assert.match(changedSource.stderr, /SOURCE_CHANGED/)
})

test('refuses to overwrite a changed existing lock', async (t) => {
  const { lock, oracle, source } = await fixture(t)
  const created = run(
    'create',
    '--oracle',
    oracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(created.status, 0, created.stderr)
  const originalLock = await readFile(lock, 'utf8')

  await writeFile(oracle, '# Changed Oracle\n')
  const changedOracle = run(
    'create',
    '--oracle',
    oracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(changedOracle.status, 1)
  assert.match(changedOracle.stderr, /ORACLE_CHANGED/)
  assert.equal(await readFile(lock, 'utf8'), originalLock)

  await writeFile(oracle, '# Oracle\n')
  await writeFile(source, '# Changed Requirement\n')
  const changedSource = run(
    'create',
    '--oracle',
    oracle,
    '--lock',
    lock,
    '--source',
    source,
  )
  assert.equal(changedSource.status, 1)
  assert.match(changedSource.stderr, /SOURCE_CHANGED/)
  assert.equal(await readFile(lock, 'utf8'), originalLock)
})

test('rejects an invalid lock manifest', async (t) => {
  const { lock } = await fixture(t)
  await writeFile(lock, '{invalid')

  const verified = run('verify', '--lock', lock)
  assert.equal(verified.status, 1)
  assert.match(verified.stderr, /LOCK_INVALID/)
})
