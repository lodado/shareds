import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SOURCE_SKILLS = fileURLToPath(new URL('../', import.meta.url))
const SOURCE_CARD = new URL('../../test-fixtures/full-product/oracle.md', import.meta.url)

async function sandbox(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'oracle-protocol-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const skills = join(root, 'skills')
  await cp(SOURCE_SKILLS, skills, { recursive: true })
  const working = join(root, 'workspace')
  await mkdir(working)
  const directory = join(working, '.ai', 'oracles', 'sample')
  const protocolPath = join(skills, 'references', 'delivery.protocol.json')
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const run = (args, script = 'oracle-run.mjs') =>
    spawnSync(process.execPath, [join(skills, 'scripts', script), ...args], { cwd: working, env, encoding: 'utf8' })
  return { directory, protocolPath, run, working }
}

async function initialize(fixture) {
  const { directory, run, working } = fixture
  await mkdir(directory, { recursive: true })
  const oracle = join(directory, 'oracle.md')
  const lock = join(directory, 'oracle.lock.json')
  const scanRoot = join(working, 'packages')
  await mkdir(scanRoot)
  await writeFile(oracle, await readFile(SOURCE_CARD, 'utf8'))
  const locked = run(['create', '--oracle', oracle, '--lock', lock], 'oracle-lock.mjs')
  assert.equal(locked.status, 0, locked.stderr)
  const initialized = run([
    'init',
    '--dir',
    directory,
    '--lock',
    lock,
    '--scan-root',
    scanRoot,
    '--required-label',
    'behavior',
  ])
  assert.equal(initialized.status, 0, initialized.stderr)
}

async function editProtocol(fixture, edit) {
  const document = JSON.parse(await readFile(fixture.protocolPath, 'utf8'))
  edit(document)
  await writeFile(fixture.protocolPath, JSON.stringify(document))
}

test('protocol obligations as one guide and transition input to enforce changed flags in both', async (t) => {
  const fixture = await sandbox(t)
  await initialize(fixture)
  const { directory, run } = fixture
  const executed = run([
    'exec',
    '--dir',
    directory,
    '--label',
    'inspection',
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(executed.status, 0, executed.stderr)
  const ledger = (await readFile(join(directory, 'runs.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const runId = ledger.findLast((entry) => entry.type === 'run').runId
  const args = [
    'transition',
    '--dir',
    directory,
    '--to',
    'VALID_RED',
    '--run',
    runId,
    '--evidence',
    'evidence.json',
    '--row',
    'O1',
  ]
  const baseline = run(args)
  assert.equal(baseline.status, 1)
  assert.equal(baseline.stderr.includes('EVIDENCE_REQUIRED'), false, baseline.stderr)

  await editProtocol(fixture, (document) => {
    document.targets.VALID_RED.obligations.find((entry) => entry.id === 'red-evidence').flags.push('--reason')
  })
  const guide = run(['guide', '--dir', directory, '--to', 'VALID_RED', '--json'])
  assert.equal(guide.status, 0, guide.stderr)
  assert.deepEqual(JSON.parse(guide.stdout).action.requires, ['--run', '--evidence', '--reason', '--row'])
  const denied = run(args)
  assert.equal(denied.status, 1)
  assert.match(denied.stderr, /EVIDENCE_REQUIRED/)
  const supplied = run([...args, '--reason', 'required by the copied protocol'])
  assert.equal(supplied.status, baseline.status)
  assert.equal(supplied.stderr, baseline.stderr)
})

test('protocol edges as one status and transition input to reject a removed transition', async (t) => {
  const fixture = await sandbox(t)
  await initialize(fixture)
  await editProtocol(fixture, (document) => {
    document.transitions.ORACLE_READY = ['IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL']
  })
  const { directory, run } = fixture
  const status = run(['status', '--dir', directory, '--json'])
  assert.equal(status.status, 0, status.stderr)
  assert.deepEqual(JSON.parse(status.stdout).nextLegalActions, ['IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'])
  const before = await readFile(join(directory, 'run-state.json'), 'utf8')
  const denied = run(['transition', '--dir', directory, '--to', 'VALID_RED'])
  assert.equal(denied.status, 1)
  assert.match(denied.stderr, /TRANSITION_NOT_ALLOWED/)
  assert.equal(await readFile(join(directory, 'run-state.json'), 'utf8'), before)
})

test('invalid protocol as pre-dispatch validation to refuse initialization without workspace writes', async (t) => {
  const fixture = await sandbox(t)
  await editProtocol(fixture, (document) => {
    document.language = 'arbitrary-javascript'
  })
  const denied = fixture.run(['init', '--dir', fixture.directory, '--lock', join(fixture.working, 'missing.lock.json')])
  assert.equal(denied.status, 1)
  assert.match(denied.stderr, /Invalid delivery protocol: unsupported language/)
  assert.deepEqual(await readdir(fixture.working), [])
})
