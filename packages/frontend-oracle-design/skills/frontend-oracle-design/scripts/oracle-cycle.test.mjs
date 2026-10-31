import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { bendFiles } from './oracle-cycle.mjs'

const FIXTURE = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...INHERITED_ENV } = process.env
const CHILD_ENV = { ...INHERITED_ENV, ORACLE_LINT_CACHE: 'off' }

async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-cycle-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(FIXTURE, root, { recursive: true })
  const directory = join(root, '.ai', 'oracles', 'stale-search')
  await mkdir(directory, { recursive: true })
  await cp(join(FIXTURE, 'oracle.package.json'), join(directory, 'oracle.package.json'))
  return { root, directory }
}

const cycle = (root, ...args) => {
  const child = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-cycle.mjs'), ...args], { cwd: root, encoding: 'utf8', env: CHILD_ENV })
  return { status: child.status, stderr: child.stderr, result: child.stdout ? JSON.parse(child.stdout) : null }
}
const stage = (root, ...args) => spawnSync(process.execPath, [join(SCRIPTS, 'oracle-stage.mjs'), ...args], { cwd: root, encoding: 'utf8', env: CHILD_ENV })

test('bendFiles finds Bend sources the package registers under repo:', async (t) => {
  const { root, directory } = await repository(t)
  const files = await bendFiles(directory, root)
  assert.ok(files.includes(join(root, 'MODEL.bend')))
  assert.ok(files.includes(join(root, 'LAWS.bend')))
})

test('fast checks Bend and the model-stage package in one call', async (t) => {
  const { root, directory } = await repository(t)
  const { status, result } = cycle(root, 'fast', '--dir', directory)
  assert.equal(status, 0, JSON.stringify(result))
  assert.deepEqual(result.steps.map(({ step }) => step), ['oracle-model check', 'oracle-package validate'])
})

test('fast names the broken Bend file and the next step', async (t) => {
  const { root, directory } = await repository(t)
  await writeFile(join(root, 'MODEL.bend'), `${await readFile(join(root, 'MODEL.bend'), 'utf8')}\ndef broken() -> Nat:\n  undefinedName\n`)
  const { status, result } = cycle(root, 'fast', '--dir', directory)
  assert.equal(status, 1)
  assert.equal(result.failed.code, 'BEND_CHECK')
  assert.match(JSON.stringify(result.failed.detail), /MODEL\.bend/)
  assert.match(result.failed.next, /fix the Bend file/)
})

test('walk refuses a missing stage and a stale stage without a reason', async (t) => {
  const { root, directory } = await repository(t)
  assert.equal(cycle(root, 'walk', '--dir', directory, '--to', 'MODELED').result.failed.code, 'STAGE_MISSING')
  assert.equal(stage(root, 'begin', '--dir', directory).status, 0)
  const walked = cycle(root, 'walk', '--dir', directory, '--to', 'MODELED')
  assert.equal(walked.status, 0, JSON.stringify(walked.result))
  assert.equal(walked.result.stage, 'MODELED')
  const path = join(directory, 'oracle.package.json')
  const pkg = JSON.parse(await readFile(path, 'utf8'))
  pkg.intent.actor = `${pkg.intent.actor} (edited)`
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`)
  assert.equal(cycle(root, 'walk', '--dir', directory, '--to', 'MODELED').result.failed.code, 'STAGE_STALE')
  const rewalked = cycle(root, 'walk', '--dir', directory, '--to', 'MODELED', '--reason', 'gate-failure')
  assert.equal(rewalked.status, 0, JSON.stringify(rewalked.result))
  assert.deepEqual(rewalked.result.steps.slice(-2).map(({ step }) => step), ['oracle-stage rewind', 'oracle-stage advance'])
  assert.equal(rewalked.result.stage, 'MODELED')
})

test('walk rejects an unknown target or reason as usage', async (t) => {
  const { root, directory } = await repository(t)
  assert.match(cycle(root, 'walk', '--dir', directory, '--to', 'ORACLE_READY').stderr, /^USAGE:/)
  assert.match(cycle(root, 'walk', '--dir', directory, '--reason', 'because').stderr, /^USAGE:/)
})
