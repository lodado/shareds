import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { sha256 } from './oracle-fs.mjs'
import { assertReadyToLock, markLocked, readStage } from './oracle-stage.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const FIXTURE = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const PAGINATION = fileURLToPath(new URL('../../../test-fixtures/pagination/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...CHILD_ENV } = process.env
const node = (cwd, script, args) =>
  spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', env: CHILD_ENV })

/** 패키지 경로의 오라클: 저장소 루트에 Bend 파일, `.ai/oracles/stale-search/`에 패키지(카드는 project-card가 만든다). */
async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(FIXTURE, root, { recursive: true })
  const directory = join(root, '.ai', 'oracles', 'stale-search')
  await mkdir(directory, { recursive: true })
  await cp(join(FIXTURE, 'oracle.package.json'), join(directory, 'oracle.package.json'))
  return { root, directory }
}

const stage = (root, directory, command, to) =>
  node(root, 'oracle-stage.mjs', [command, '--dir', directory, ...(to ? ['--to', to] : [])])
const lock = (root, directory) =>
  node(root, 'oracle-lock.mjs', ['create', '--oracle', join(directory, 'oracle.md'), '--lock', join(directory, 'oracle.lock.json')])

test('request-only Contract begin binds profile before card exists and rejects a later legacy card', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-contract-begin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'contract')
  const started = node(root, 'oracle-stage.mjs', ['begin', '--dir', directory, '--profile', 'contract/v1'])
  assert.equal(started.status, 0, started.stderr)
  const bytes = await readFile(join(directory, 'stage.json'))
  assert.equal(JSON.parse(bytes).verificationProfile, 'contract/v1')
  assert.equal(JSON.parse(bytes).cardSha256, null)
  await writeFile(join(directory, 'oracle.md'), '# Legacy card\n')
  const refused = stage(root, directory, 'advance', 'CHECKED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^PROFILE_MISMATCH:/)
  assert.deepEqual(await readFile(join(directory, 'stage.json')), bytes)
})

test('a package oracle cannot be locked without a stage record, before DRAFTED, or on package bytes that changed after it', async (t) => {
  const { root, directory } = await repository(t)

  const missing = lock(root, directory)
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /^STAGE_MISSING: /)

  assert.equal(stage(root, directory, 'begin').status, 0)
  const early = lock(root, directory)
  assert.equal(early.status, 1)
  assert.match(early.stderr, /^STAGE_NOT_DRAFTED: the oracle is at DISCOVERING/)

  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
  const modeled = lock(root, directory)
  assert.match(modeled.stderr, /^STAGE_NOT_DRAFTED: the oracle is at MODELED/)

  // a hand-written card has no package, so it does not pass through the stage machine
  const handWritten = await mkdtemp(join(tmpdir(), 'oracle-stage-hand-'))
  t.after(() => rm(handWritten, { recursive: true, force: true }))
  const plain = join(handWritten, '.ai', 'oracles', 'plain')
  await mkdir(plain, { recursive: true })
  await assertReadyToLock(plain)
})

test('the stage machine moves one step at a time, never writes ORACLE_READY by hand, and refuses a stale or forward rewind', async (t) => {
  const { root, directory } = await repository(t)
  const missing = stage(root, directory, 'advance', 'MODELED')
  assert.match(missing.stderr, /^STAGE_MISSING: /)

  assert.equal(stage(root, directory, 'begin').status, 0)
  assert.match(stage(root, directory, 'begin').stderr, /^STAGE_EXISTS: /)
  assert.match(stage(root, directory, 'advance', 'CHECKED').stderr, /^STAGE_SKIP: DISCOVERING can only advance to MODELED, not CHECKED/)
  assert.match(stage(root, directory, 'advance', 'DRAFTED').stderr, /^STAGE_SKIP: /)
  assert.match(stage(root, directory, 'advance', 'ORACLE_READY').stderr, /^STAGE_LOCK_ONLY: /)

  const modeled = stage(root, directory, 'advance', 'MODELED')
  assert.equal(modeled.status, 0, modeled.stderr)
  assert.equal(JSON.parse(modeled.stdout).stage, 'MODELED')
  assert.equal((await readStage(directory)).stage, 'MODELED')

  // the package changed after MODELED — the record is stale until the oracle walks back and forward again
  const packagePath = join(directory, 'oracle.package.json')
  await writeFile(packagePath, `${await readFile(packagePath, 'utf8')}\n`)
  assert.match(stage(root, directory, 'advance', 'CHECKED').stderr, /^STAGE_STALE: oracle\.package\.json changed after MODELED/)
  assert.equal(JSON.parse(stage(root, directory, 'status').stdout).stale, true)

  assert.match(stage(root, directory, 'rewind', 'CHECKED').stderr, /^STAGE_REWIND: /)
  assert.equal(stage(root, directory, 'rewind', 'DISCOVERING').status, 0)
  assert.equal(JSON.parse(stage(root, directory, 'status').stdout).stage, 'DISCOVERING')
  assert.equal(stage(root, directory, 'advance', 'MODELED').status, 0)
})

test('a package that is not model-complete cannot leave DISCOVERING', async (t) => {
  const { root, directory } = await repository(t)
  const packagePath = join(directory, 'oracle.package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  pkg.sources = []
  await writeFile(packagePath, JSON.stringify(pkg))
  assert.equal(stage(root, directory, 'begin').status, 0)
  const refused = stage(root, directory, 'advance', 'MODELED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^STAGE_GATE: package is not model-complete: .*package-sources/)
  assert.equal((await readStage(directory)).stage, 'DISCOVERING')
})

test('DRAFTED opens the lock gate for the package bytes it was recorded on, and the lock moves the record to ORACLE_READY', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const { root, directory } = await repository(t)
  const project = node(root, 'oracle-package.mjs', [
    'project-card',
    '--package',
    '.ai/oracles/stale-search/oracle.package.json',
    '--out',
    '.ai/oracles/stale-search/oracle.md',
  ])
  assert.equal(project.status, 0, project.stderr)

  assert.equal(stage(root, directory, 'begin').status, 0)
  for (const step of ['MODELED', 'CHECKED', 'DRAFTED']) {
    const advanced = stage(root, directory, 'advance', step)
    assert.equal(advanced.status, 0, `${step}: ${advanced.stderr}`)
  }
  await assertReadyToLock(directory)

  // the card no longer matches what the package generates: DRAFTED cannot be reached again
  await writeFile(join(directory, 'oracle.md'), (await readFile(join(directory, 'oracle.md'), 'utf8')).replace('Search', 'Searches'))
  assert.equal(stage(root, directory, 'rewind', 'CHECKED').status, 0)
  const drifted = stage(root, directory, 'advance', 'DRAFTED')
  assert.equal(drifted.status, 1)
  assert.match(drifted.stderr, /^STAGE_GATE: check-card failed/)

  assert.equal(stage(root, directory, 'rewind', 'CHECKED').status, 0)
  assert.equal(node(root, 'oracle-package.mjs', ['project-card', '--package', '.ai/oracles/stale-search/oracle.package.json', '--out', '.ai/oracles/stale-search/oracle.md']).status, 0)
  assert.equal(stage(root, directory, 'advance', 'DRAFTED').status, 0)
  await markLocked(directory)
  assert.equal((await readStage(directory)).stage, 'ORACLE_READY')
  // an idempotent relock of the same bytes still passes the gate; changed bytes do not
  await assertReadyToLock(directory)
  const packagePath = join(directory, 'oracle.package.json')
  await writeFile(packagePath, `${await readFile(packagePath, 'utf8')}\n`)
  await assert.rejects(() => assertReadyToLock(directory), { code: 'STAGE_STALE' })
})

test('MODELED needs every async cell decided when Async is in a version 2 space — the open cells are asked before the model', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-stage-async-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(PAGINATION, root, { recursive: true })
  const directory = join(root, '.ai', 'oracles', 'pagination')
  await mkdir(directory, { recursive: true })
  const packagePath = join(directory, 'oracle.package.json')
  await cp(join(PAGINATION, 'oracle.package.json'), packagePath)
  assert.equal(stage(root, directory, 'begin').status, 0)

  const refused = stage(root, directory, 'advance', 'MODELED')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^STAGE_GATE: package is not model-complete: package-async-cells: Async is in the space/)

  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  const cells = (decision, ref) =>
    Object.fromEntries(
      ['late-success-after-cancel', 'late-failure-after-success', 'older-response-after-newer', 'duplicate-completion', 'lost-response', 'retry-while-pending', 'unmount-before-settle'].map(
        (id) => [id, { decision, ref }],
      ),
    )
  pkg.holds = [{ id: 'H1', question: 'does a late page after a filter change show?', blocks: ['load'], status: 'open' }]
  pkg.asyncCells = [{ operation: 'load page', cells: { ...cells('source', 'S1'), 'late-success-after-cancel': { decision: 'question', ref: 'H1' } } }]
  await writeFile(packagePath, JSON.stringify(pkg, null, 2))
  // the package changed after begin, which pinned nothing yet: MODELED runs its gate on the new bytes
  const modeled = stage(root, directory, 'advance', 'MODELED')
  assert.equal(modeled.status, 0, modeled.stderr)
})

test('a forged DRAFTED record skips no gate: the lock still lints the card against the package', async (t) => {
  const { root, directory } = await repository(t)
  // a host without the hook can write stage.json by hand; the lock re-runs card lint, which regenerates the card from
  // the package and checks the cross-check decisions, so the forgery buys nothing
  const bytes = await readFile(join(directory, 'oracle.package.json'))
  await writeFile(join(directory, 'stage.json'), JSON.stringify({ schemaVersion: 1, stage: 'DRAFTED', packageSha256: sha256(bytes), history: [] }))
  await cp(join(FIXTURE, 'oracle.md'), join(directory, 'oracle.md'))
  const locked = lock(root, directory)
  assert.equal(locked.status, 1)
  assert.doesNotMatch(locked.stderr, /^STAGE_/)
  assert.match(locked.stderr, /^CARD_LINT_FAILED: /)
})
