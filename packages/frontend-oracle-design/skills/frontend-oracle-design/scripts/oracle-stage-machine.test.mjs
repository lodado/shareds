import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { sha256 } from './oracle-fs.mjs'
import { compileBend } from './oracle-model.mjs'
import { assertReadyToLock, assertRelockPinned, inputsPin, markLocked, readStage } from './oracle-stage.mjs'
import { installedBend } from './oracle-test-bend.mjs'
import { parseBendTypes, toPlain, typeIR, valuesOf } from './oracle-types.mjs'

// The stage fixture models the authoring stage record of oracle-stage.mjs. These tests prove its laws with the kernel,
// check that the laws pin every cell, and drive the real stage commands from every stage the model reaches to see that
// each event ends where the model says.
const STAGE = fileURLToPath(new URL('../../../test-fixtures/stage/', import.meta.url))
const SEARCH = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...INHERITED_ENV } = process.env
// no CHECKED receipt from another test or run passes a gate for these runs
const CHILD_ENV = { ...INHERITED_ENV, ORACLE_LINT_CACHE: 'off' }
const PROOF_IMPORTS = 'import Base\nimport ./MODEL.bend as M\nimport ./LAWS.bend as Laws\n'

const oracleModel = (...args) =>
  spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), ...args], { encoding: 'utf8', env: CHILD_ENV, maxBuffer: 1 << 26 })

const relationNames = async () =>
  [...(await readFile(join(STAGE, 'MODEL.bend'), 'utf8')).matchAll(/^def Run\.(R_\w+)\(/gm)].map((match) => match[1])

test('[bend] the stage laws are proven by the kernel, every cell proof generated in a temporary copy', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  assert.equal(await readFile(join(STAGE, 'PROOF.bend'), 'utf8'), PROOF_IMPORTS)
  const laws = [...(await readFile(join(STAGE, 'LAWS.bend'), 'utf8')).matchAll(/^law (\w+):/gm)].map((match) => match[1])
  // one law per relation of the model, in the same order
  assert.deepEqual(laws, (await relationNames()).map((name) => name.slice(2)))
  const before = (await readdir(STAGE)).sort()
  const run = oracleModel('prove', '--dir', STAGE, '--timeout-ms', '300000')
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout)
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  // 120 states × 28 events per law
  assert.deepEqual(result.cells, { generated: laws.map((law) => ({ law, cases: 3360 })), skipped: [], temporaryCopy: true })
  assert.deepEqual((await readdir(STAGE)).sort(), before)
})

test('[bend] laws pins all 3360 cells of the stage machine with no counterexample, and the space closes within 6 events', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const relations = await relationNames()
  const model = join(STAGE, 'MODEL.bend')
  const relationArgs = relations.flatMap((name) => ['--relation', name])
  const run = oracleModel('laws', '--model', model, '--prefix', 'Run', '--state', 'Run', '--command', 'Msg', ...relationArgs, '--max-evals', '12000000')
  assert.equal(run.status, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.status, 'ok')
  assert.deepEqual(report.domain, { states: 120, commands: 28, cells: 3360 })
  assert.equal(report.counterexampleCount, 0)
  const { pinnedCount, freeCount, emptyCount, marginal } = report.strength
  assert.deepEqual({ pinnedCount, freeCount, emptyCount }, { pinnedCount: 3360, freeCount: 0, emptyCount: 0 })
  // the four safety relations follow from the others and pin nothing of their own; every other relation pins a cell
  const safety = new Set(['R_advance_never_locks', 'R_ready_only_by_lock', 'R_rewind_never_forward', 'R_advance_one_step'])
  for (const name of relations) {
    const pins = marginal[`Run.${name}`]
    assert.ok(safety.has(name) ? pins === 0 : pins > 0, `${name} pins ${pins} cells`)
  }

  const space = oracleModel('space', '--model', model, '--prefix', 'Run', '--bound', '2')
  assert.equal(space.status, 0, space.stderr)
  const { cover } = JSON.parse(space.stdout)
  // every reachable state takes every event; the longest shortest trace is DRAFTED, lock, a package edit, lock again
  assert.deepEqual(
    { status: cover.status, configurations: cover.configurations, pairs: cover.pairs, diameter: cover.diameter },
    { status: 'closed', configurations: 81, pairs: 81 * 28, diameter: 6 },
  )
})

// ---- the model against oracle-stage.mjs

const ORDER = ['Discovering', 'Modeled', 'Checked', 'Drafted', 'Ready']
const STAGE_NAME = { Discovering: 'DISCOVERING', Modeled: 'MODELED', Checked: 'CHECKED', Drafted: 'DRAFTED', Ready: 'ORACLE_READY' }
const MODEL_STAGE = Object.fromEntries(Object.entries(STAGE_NAME).map(([model, name]) => [name, model]))
// how the CLI spells each target; a target that names no stage is a name that is no stage, or no --to at all (null),
// which the CLI refuses as usage before it reads the record (see `expected`)
const SPELLINGS = {
  ToDiscovering: ['DISCOVERING'],
  ToModeled: ['MODELED'],
  ToChecked: ['CHECKED'],
  ToDrafted: ['DRAFTED'],
  ToReady: ['ORACLE_READY'],
  ToNothing: ['NOT_A_STAGE', null],
}
const WHY = {
  STAGE_SKIP: 'Skip',
  STAGE_LOCK_ONLY: 'LockOnly',
  STAGE_REWIND: 'Back',
  STAGE_NOT_DRAFTED: 'NotDrafted',
  USAGE: 'Usage',
  STAGE_STALE: 'Stale',
  STAGE_GATE: 'Gate',
}
/** The stages and inputs a trace from init reaches: the ones a stage record on disk can be in. */
function reachedPairs(step, init, messages) {
  const seen = new Map()
  const queue = [init]
  while (queue.length > 0) {
    const state = queue.shift()
    const plain = toPlain(state)
    const key = JSON.stringify(plain)
    if (seen.has(key)) continue
    seen.set(key, plain)
    for (const message of messages) queue.push(step(state, message))
  }
  return [...new Set([...seen.values()].map(({ at, inputs }) => `${at.$}/${inputs.$}`))].sort()
}

/**
 * An advance whose gate fails, set up without touching what the record took: a package that is not model-complete
 * before MODELED took its digest, a World.bend row that breaks adequacy where no pin covers it or the pin is already
 * stale, a card edit. Elsewhere the failing gate cannot be set up, and the cell runs with a passing gate.
 */
function failingGate({ kind, pass, to, at, inputs }) {
  if (kind !== 'Advance' || pass) return null
  if (to === 'ToModeled' && at === 'Discovering') return 'model'
  if (to === 'ToChecked' && (ORDER.indexOf(at) < 2 || inputs !== 'Judged')) return 'world'
  if (to === 'ToDrafted') return 'card'
  return null
}

function runNode(cwd, script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(SCRIPTS, script), ...args], { cwd, env: CHILD_ENV })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

async function pool(items, size, work) {
  const results = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  return results
}

/** A repository with the stale-search package under `.ai/oracles/` and the card projected from it. */
async function template(root) {
  const base = join(root, 'template')
  await cp(SEARCH, base, { recursive: true })
  const directory = join(base, '.ai', 'oracles', 'stale-search')
  await mkdir(directory, { recursive: true })
  await cp(join(SEARCH, 'oracle.package.json'), join(directory, 'oracle.package.json'))
  const projected = await runNode(base, 'oracle-package.mjs', [
    'project-card',
    '--package',
    '.ai/oracles/stale-search/oracle.package.json',
    '--out',
    '.ai/oracles/stale-search/oracle.md',
  ])
  assert.equal(projected.status, 0, projected.stderr)
  const world = await readFile(join(base, 'World.bend'), 'utf8')
  // the row forbids the newer answer being shown: adequacy refutes a goal, so the CHECKED gate fails
  const forbidding = world.replace('      Race.imp(n, Race.isNew(f))\n', '      Race.imp(n, Bool.not(Race.isNew(f)))\n')
  assert.notEqual(forbidding, world)
  const pkg = JSON.parse(await readFile(join(directory, 'oracle.package.json'), 'utf8'))
  return {
    base,
    packageSha256: sha256(await readFile(join(directory, 'oracle.package.json'))),
    pin: await inputsPin(directory),
    forbidding,
    incomplete: JSON.stringify({ ...pkg, sources: [] }),
  }
}

/** A copy of the template whose stage record is at `at`, taken on the template's files, and whose files are then `inputs`. */
async function place(fixture, repo, { at, inputs }, failing) {
  await cp(fixture.base, repo, { recursive: true })
  const directory = join(repo, '.ai', 'oracles', 'stale-search')
  const stage = STAGE_NAME[at]
  const rank = ORDER.indexOf(at)
  const taken = { packageSha256: rank === 0 ? null : fixture.packageSha256, ...(rank >= 2 ? { inputsSha256: fixture.pin } : {}) }
  const record = { schemaVersion: 1, stage, ...taken, history: [{ stage, ...taken, evidence: 'placed by the test' }] }
  await writeFile(join(directory, 'stage.json'), `${JSON.stringify(record)}\n`)
  if (inputs === 'PackageEdited') await appendFile(join(directory, 'oracle.package.json'), '\n')
  if (inputs === 'BendEdited' && failing !== 'world') await appendFile(join(repo, 'World.bend'), '\n# edited after CHECKED\n')
  if (failing === 'model') await writeFile(join(directory, 'oracle.package.json'), fixture.incomplete)
  if (failing === 'world') await writeFile(join(repo, 'World.bend'), fixture.forbidding)
  if (failing === 'card') {
    const card = join(directory, 'oracle.md')
    await writeFile(card, (await readFile(card, 'utf8')).replace('Search', 'Searches'))
  }
  return directory
}

/** The inputs as the stage record judges them: its package digest, then the pin CHECKED took. */
async function inputsAgainst(directory, record) {
  const bytes = await readFile(join(directory, 'oracle.package.json'))
  if (record.packageSha256 && record.packageSha256 !== sha256(bytes)) return 'PackageEdited'
  if (ORDER.indexOf(MODEL_STAGE[record.stage]) < 2) return 'Judged'
  // a record without the pin, or a pin that cannot be measured, is stale like a changed pin
  const pin = await inputsPin(directory).catch(() => null)
  return record.inputsSha256 === pin ? 'Judged' : 'BendEdited'
}

async function lockStage(directory) {
  // the stage calls of oracle-lock.mjs create when no lock file exists yet
  try {
    await assertReadyToLock(directory)
    await assertRelockPinned(directory)
    await markLocked(directory)
    return { status: 0, stderr: '' }
  } catch (error) {
    return { status: 1, stderr: `${error.code}: ${error.message}` }
  }
}

async function command(repo, directory, cell) {
  const target = cell.spelling === null ? [] : ['--to', cell.spelling]
  if (cell.kind === 'Advance') return runNode(repo, 'oracle-stage.mjs', ['advance', '--dir', directory, ...target])
  if (cell.kind === 'Rewind') {
    const reason = cell.reason ? ['--reason', 'review-finding'] : []
    return runNode(repo, 'oracle-stage.mjs', ['rewind', '--dir', directory, ...target, ...reason])
  }
  if (cell.kind === 'Lock') return lockStage(directory)
  if (cell.kind === 'Edit' && cell.part === 'PackageFile') await appendFile(join(directory, 'oracle.package.json'), '\n')
  if (cell.kind === 'Edit' && cell.part === 'BendFiles') await appendFile(join(repo, 'World.bend'), '\n# edited\n')
  return null
}

/** Run one event on a placed record and read where the implementation ended, in the model's terms. */
async function perform(fixture, repo, cell) {
  const directory = await place(fixture, repo, cell, failingGate(cell))
  const recordPath = join(directory, 'stage.json')
  const before = await readFile(recordPath)
  const result = await command(repo, directory, cell)
  const status = await runNode(repo, 'oracle-stage.mjs', ['status', '--dir', directory])
  const kept = (await readFile(recordPath)).equals(before)
  const record = await readStage(directory).catch((error) => ({ unreadable: error.code }))
  if (record.unreadable) return { at: record.unreadable, exit: result?.status ?? status.status, kept }
  const view = { at: MODEL_STAGE[record.stage], inputs: await inputsAgainst(directory, record) }
  if (result === null) return { ...view, stale: JSON.parse(status.stdout).stale, kept }
  if (result.status === 0) return { ...view, outcome: 'Took' }
  const code = result.stderr.split(':')[0]
  return { ...view, outcome: WHY[code] ?? code, kept }
}

/** What the model says about the same event, in the same terms. */
function expected(model, cell) {
  // a step with no --to is a usage error of the command line, whatever the record: the record and the files stay
  if (cell.spelling === null) return { at: cell.at, inputs: cell.inputs, outcome: 'Usage', kept: true }
  const after = toPlain(model.step(structuredClone(cell.state), structuredClone(cell.message)))
  const view = { at: after.at.$, inputs: after.inputs.$ }
  if (cell.kind === 'Status' || cell.kind === 'Edit') return { ...view, stale: toPlain(model.stale(structuredClone(after))), kept: true }
  if (after.last.$ === 'Took') return { ...view, outcome: 'Took' }
  return { ...view, outcome: after.last.why.$, kept: true }
}

const label = (cell) =>
  [cell.at, cell.inputs, cell.kind, cell.to, cell.spelling === null ? '(no --to)' : cell.spelling, cell.pass ?? cell.reason ?? cell.part]
    .filter((part) => part !== undefined)
    .join(' ')

/**
 * The outcome of a command does not depend on the outcome before it, and status and edits keep it: one `last` per
 * stage and inputs stands for all of them.
 */
function assertLastIsOutput(step, states, messages) {
  for (const state of states) {
    for (const message of messages) {
      const after = toPlain(step(state, message))
      const reference = toPlain(step({ ...state, last: { $: 'Took' } }, message))
      const kept = ['Status', 'Edit'].includes(message.$)
      assert.deepEqual(after, kept ? { ...reference, last: toPlain(state.last) } : reference)
    }
  }
}

/** Every event from every pair, each target that names no stage once per spelling. */
function cellsOf(step, pairs, messages) {
  const cells = []
  for (const pair of pairs) {
    const [at, inputs] = pair.split('/')
    const state = { $: 'Run', at: { $: at }, inputs: { $: inputs }, last: { $: 'Took' } }
    for (const message of messages) {
      const to = message.to?.$
      const cell = { at, inputs, state, message, kind: message.$, to, pass: message.pass, reason: message.reason, part: message.part?.$ }
      // a failing gate that cannot be set up here must not matter here: the model gives both gate results one answer
      if (message.$ === 'Advance' && !message.pass && failingGate(cell) === null)
        assert.deepEqual(toPlain(step(state, message)), toPlain(step(state, { ...message, pass: true })), `${pair} ${to}`)
      for (const spelling of to ? SPELLINGS[to] : [undefined]) cells.push({ ...cell, spelling })
    }
  }
  return cells
}

test('[bend] every stage the model reaches answers every event the way oracle-stage.mjs does', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const entry = join(STAGE, 'MODEL.bend')
  const { exported } = await compileBend({ entry, bin })
  const types = parseBendTypes(await readFile(entry, 'utf8'))
  const messages = valuesOf(typeIR('Msg', types))
  const model = { step: exported['Run.step'], stale: exported['Run.stale'] }
  const step = (state, message) => model.step(structuredClone(state), structuredClone(message))
  assertLastIsOutput(step, valuesOf(typeIR('Run', types)), messages)

  // a record on disk is in one of the twelve pairs a trace reaches; the other 48 pairs of the type are not stage records
  const pairs = reachedPairs(step, exported['Run.init'](), messages)
  assert.deepEqual(pairs, [
    'Checked/BendEdited',
    'Checked/Judged',
    'Checked/PackageEdited',
    'Discovering/Judged',
    'Drafted/BendEdited',
    'Drafted/Judged',
    'Drafted/PackageEdited',
    'Modeled/Judged',
    'Modeled/PackageEdited',
    'Ready/BendEdited',
    'Ready/Judged',
    'Ready/PackageEdited',
  ])

  const cells = cellsOf(step, pairs, messages)
  // 12 pairs × 28 events, with the targets that name no stage spelled two ways
  assert.equal(cells.length, 12 * 32)

  const root = await mkdtemp(join(tmpdir(), 'oracle-stage-machine-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fixture = await template(root)
  const observed = await pool(cells, 4, (cell, index) => perform(fixture, join(root, `cell-${index}`), cell))
  const differ = cells
    .map((cell, index) => ({ cell: label(cell), actual: observed[index], wanted: expected(model, cell) }))
    .filter(({ actual, wanted }) => !isDeepStrictEqual(actual, wanted))
  assert.deepEqual(differ, [])
})
