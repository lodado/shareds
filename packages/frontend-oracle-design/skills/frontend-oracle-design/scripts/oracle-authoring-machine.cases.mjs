import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { compileBend } from './oracle-model.mjs'
import { NEXT_COMMANDS, nextCommandOf, stepPlanDifference } from './oracle-run-machine.cases.mjs'
import { installedBend } from './oracle-test-bend.mjs'
import { toPlain } from './oracle-types.mjs'

// The stage fixture (test-fixtures/stage) models the authoring graph oracle-step.mjs evaluates and the lock that judges
// it, for both profiles. These cases load its model in JavaScript and drive the real oracle-step.mjs and oracle-lock.mjs
// along traces that cover every (state view, event, exit, view after) the model reaches: a stale-search package for
// Formal and the toggle card for Contract. oracle-stage-machine.test.mjs proves the laws with the kernel, registers these
// cases and shares the workspace helpers below.
const STAGE = fileURLToPath(new URL('../../../test-fixtures/stage/', import.meta.url))
const SEARCH = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const CONTRACT = fileURLToPath(new URL('../../../test-fixtures/contract-v1/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...INHERITED_ENV } = process.env
// no CHECKED receipt from another test or run passes a node for these runs
export const CHILD_ENV = { ...INHERITED_ENV, ORACLE_LINT_CACHE: 'off' }

// ---- the stale-search workspace the authoring commands run in

export const PACKAGE_DIR = join('.ai', 'oracles', 'stale-search')
// the World.bend row a broken model flips: adequacy refutes a goal when the newer answer is forbidden
export const WORLD_ROW = '      Race.imp(n, Race.isNew(f))\n'
export const FORBIDDING_ROW = '      Race.imp(n, Bool.not(Race.isNew(f)))\n'
// a hand-written card section the Draft lint refuses (Formal), the auto-TC line the Contract lint needs
const SWEEP = '\n## Interaction sweep\n\nno pairs yet\n'
const LOADING_NA = /^- N\/A: loading:.*\n/m
// the toggle card's one source, which the template places where the location names it
const CONTRACT_SOURCE = 'repo:packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md#v1'
const PENDING = '- Status: pending\n- Source: none yet — record the approving user response here after the Draft is confirmed'
export const APPROVED = '- Status: approved\n- Source: the user approved the whole card in the chat'

export function runNode(cwd, script, args, env = CHILD_ENV) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(SCRIPTS, script), ...args], { cwd, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

export async function pool(items, size, work) {
  const results = Array.from({ length: items.length })
  let next = 0
  // after one worker throws, the others take no new item: the test is failing and its workspaces are being removed
  let failed = false
  const worker = async () => {
    while (next < items.length && !failed) {
      const index = next
      next += 1
      try {
        results[index] = await work(items[index], index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  return results
}

/**
 * A repository with the stale-search package under `.ai/oracles/` (its self source S5 pointing at that file, so the lock
 * snapshots it), the card projected from it and approved, no stage record; and the toggle Contract fixture where its
 * card's source names it.
 */
export async function template(root) {
  const base = join(root, 'template')
  await cp(SEARCH, base, { recursive: true })
  await cp(CONTRACT, join(base, 'packages', 'frontend-oracle-design', 'test-fixtures', 'contract-v1'), { recursive: true })
  const directory = join(base, PACKAGE_DIR)
  await mkdir(directory, { recursive: true })
  const original = JSON.parse(await readFile(join(SEARCH, 'oracle.package.json'), 'utf8'))
  const own = { ...original, sources: original.sources.map((source) => (source.self ? { ...source, location: `repo:${PACKAGE_DIR}/oracle.package.json` } : source)) }
  await writeFile(join(directory, 'oracle.package.json'), `${JSON.stringify(own, null, 2)}\n`)
  const projected = await runNode(base, 'oracle-package.mjs', ['project-card', '--package', join(PACKAGE_DIR, 'oracle.package.json'), '--out', join(PACKAGE_DIR, 'oracle.md')])
  assert.equal(projected.status, 0, projected.stderr)
  const draft = await readFile(join(directory, 'oracle.md'), 'utf8')
  assert.ok(draft.includes(PENDING))
  const card = draft.replace(PENDING, APPROVED)
  await writeFile(join(directory, 'oracle.md'), card)
  return {
    base,
    package: own,
    card,
    world: await readFile(join(SEARCH, 'World.bend'), 'utf8'),
    contract: await readFile(join(CONTRACT, 'oracle.md'), 'utf8'),
  }
}

// ---- the model, read in JavaScript

const listItems = (list) => {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}
const keyOf = (value) => JSON.stringify(toPlain(value))

async function loadModel(bin) {
  const { exported } = await compileBend({ entry: join(STAGE, 'MODEL.bend'), bin })
  const call =
    (name) =>
    (...args) =>
      exported[`Graph.${name}`](...args.map((argument) => structuredClone(argument)))
  const enabled = call('enabled')
  return { init: call('init'), step: call('step'), decide: call('decide'), hint: call('hint'), label: call('label'), enabled: (state) => listItems(enabled(state)) }
}

function reachable(model) {
  const seen = new Map()
  const queue = [model.init()]
  while (queue.length > 0) {
    const state = queue.shift()
    const key = keyOf(state)
    if (seen.has(key)) continue
    seen.set(key, state)
    for (const message of model.enabled(state)) queue.push(model.step(state, message))
  }
  return [...seen.values()]
}

const exitOf = (model, state, message) => toPlain(model.decide(state, message)).$
/** What a state shows: its kind, whether the last check is of these files, the label and the next. */
function viewOf(model, state) {
  const plain = toPlain(state)
  return `${plain.$}|${plain.seen?.$ ?? '-'}|${toPlain(model.label(state)).$}|${toPlain(model.hint(state)).$}`
}
/** One coverage item per cell: the view before, the event and its exit, the view after. */
const itemOf = (model, state, message) => `${viewOf(model, state)}|${keyOf(message)}|${exitOf(model, state, message)}|${viewOf(model, model.step(state, message))}`

/** The shortest path from `start` to a cell whose item is still uncovered, ending with that cell's event. */
function nearestUncovered(model, start, left) {
  const frontier = [[start, []]]
  const visited = new Set()
  while (frontier.length > 0) {
    const [state, path] = frontier.shift()
    const key = keyOf(state)
    if (visited.has(key)) continue
    visited.add(key)
    for (const message of model.enabled(state)) {
      if (left.has(itemOf(model, state, message))) return [...path, message]
      frontier.push([model.step(state, message), [...path, message]])
    }
  }
  return null
}

/** Traces from init that cover every reachable item: each walks to the nearest uncovered item until none is left or it is `cap` long. */
function coveringTraces(model, states, cap = 40) {
  const items = new Set(states.flatMap((state) => model.enabled(state).map((message) => itemOf(model, state, message))))
  const left = new Set(items)
  const traces = []
  while (left.size > 0) {
    let state = model.init()
    const trace = []
    for (let path = nearestUncovered(model, state, left); path && trace.length < cap; path = nearestUncovered(model, state, left)) {
      for (const message of path) {
        left.delete(itemOf(model, state, message))
        state = model.step(state, message)
        trace.push(message)
      }
    }
    traces.push(trace)
  }
  return { items: items.size, traces }
}

// ---- the model against the CLI

const LABEL = { LDiscovering: 'DISCOVERING', LModeled: 'MODELED', LChecked: 'CHECKED', LDrafted: 'DRAFTED' }
// the NEXT_COMMANDS entry `status --brief` names next, by the model's hint
const NEXT = { HStep: 'step', HLock: 'lock', HStop: 'stop', HInit: 'init', HRevise: 'revise' }
const RUN = { K0: 0, K1: 1, K2: 2, K3: 3 }
const ROUNDS = { NoRound: 0, Saved1: 1, Stale1: 1, Saved2: 2, Stale2: 2 }

/**
 * What `oracle-stage.mjs status` shows in a model state: no record before the first step, the label of a check of these
 * files, the run of the same issues (the record keeps it after an edit that leaves them; another issue list starts
 * over), the review rounds (Formal: the analyst and the card review, its cold read and reverse-impossible in one return;
 * Contract: cold-read).
 */
function wantedRecord(model, state) {
  const plain = toPlain(state)
  if (plain.$ === 'Blank' || plain.seen?.$ === 'Never') return { stage: null }
  if (plain.$ === 'Locked') return { stage: 'ORACLE_READY', current: true }
  if (plain.$ === 'Drifted') return { stage: 'ORACLE_READY', current: false }
  const record = { current: plain.seen.$ === 'Now' }
  if (record.current) record.stage = LABEL[toPlain(model.label(state)).$]
  if (plain.seen.$ !== 'Moved') record.sameIssues = RUN[plain.seen.run.$]
  const formal = plain.$ === 'FormalAt'
  record.reviews = { 'model-analyst': formal ? ROUNDS[plain.a.$] : 0, 'card-review': formal ? ROUNDS[plain.c.$] : 0, 'cold-read': formal ? 0 : ROUNDS[plain.c.$] }
  return record
}

// the record counts every distinct file state of the run; the model stops counting at SAME_ISSUES_STOP
const observedField = (status, key, wanted) => {
  if (key === 'reviews') return Object.fromEntries(Object.keys(wanted.reviews).map((kind) => [kind, status.reviews?.[kind]]))
  return key === 'sameIssues' ? Math.min(status.sameIssues, 3) : status[key]
}
const observedRecord = (status, wanted) => Object.fromEntries(Object.keys(wanted).map((key) => [key, observedField(status, key, wanted)]))

const RETURN = /saved unchanged as (\S+?\.(?:md|json))\b/g
const returnText = (path) => (path.endsWith('.json') ? '{"candidates": []}\n' : '# review\n\nno findings\n')

/**
 * The CLI side of each model event in one workspace. Every edit writes bytes never written before (a counter in a
 * comment, a source's jurisdiction or the approval's source line), so no file state comes back.
 */
function authoringCommands(repo, fixture, env) {
  const directory = join(repo, PACKAGE_DIR)
  const files = { package: join(directory, 'oracle.package.json'), card: join(directory, 'oracle.md'), world: join(repo, 'World.bend') }
  const session = { counter: 0, contract: false, approved: false, approval: 0, note: 0, broken: { package: false, bend: false, card: false } }
  const count = () => (session.counter += 1)
  const node = (script, args) => runNode(repo, script, args, env)
  const step = (...args) => node('oracle-step.mjs', ['--dir', PACKAGE_DIR, ...args])
  const status = async () => JSON.parse((await node('oracle-stage.mjs', ['status', '--dir', PACKAGE_DIR])).stdout)

  // the package: a broken one names a risk that is none; S1's jurisdiction moves, which the analyst and the card read
  // (the sources stay, so the files digest still covers the Bend files they name)
  const writePackage = async () => {
    const at = count()
    const { intent, sources } = fixture.package
    const moved = sources.map((source) => (source.id === 'S1' ? { ...source, jurisdiction: `${source.jurisdiction} (edit ${at})` } : source))
    const pkg = { ...fixture.package, sources: moved, ...(session.broken.package ? { intent: { ...intent, risk: 'Unknown' } } : {}) }
    await writeFile(files.package, `${JSON.stringify(pkg, null, 2)}\n`)
  }
  const writeWorld = async () => {
    const world = session.broken.bend ? fixture.world.replace(WORLD_ROW, FORBIDDING_ROW) : fixture.world
    await writeFile(files.world, `${world}# edit ${count()}\n`)
  }
  // Formal: the hand-written lines between the generated region and the User Confirmation, which a projection keeps
  const writeFormalCard = async () => {
    const text = await readFile(files.card, 'utf8')
    const at = text.indexOf('\n## User Confirmation')
    const before = text.slice(0, at)
    const note = before.indexOf('<!-- edit ')
    const head = note === -1 ? before : before.slice(0, note)
    await writeFile(files.card, `${head.trimEnd()}\n\n<!-- edit ${count()} -->\n${session.broken.card ? SWEEP : ''}${text.slice(at)}`)
  }
  // Contract: the toggle card, its confirmation approved or pending, its auto-TC loading line kept or removed
  const writeContractCard = async () => {
    const edit = `(edit ${session.approval})`
    const confirmation = session.approved ? `- Status: approved\n- Source: the user approved the whole card ${edit}` : `- Status: pending\n- Source: none yet ${edit}`
    const text = fixture.contract.replace(/- Status: approved\n- Source: .*/, confirmation)
    await writeFile(files.card, `${session.broken.card ? text.replace(LOADING_NA, '') : text}\n<!-- edit ${session.note} -->\n`)
  }
  const flip = (part, how) => {
    if (how === 'Fixes') session.broken[part] = false
    if (how === 'Breaks') session.broken[part] = true
  }
  const done = { status: 0, stdout: '', stderr: '' }
  return {
    Start: async ({ prof }) => {
      session.contract = prof.$ === 'Contract'
      if (session.contract) await writeContractCard()
      else {
        await writeFile(files.package, `${JSON.stringify(fixture.package, null, 2)}\n`)
        await writeFile(files.card, fixture.card)
      }
      return done
    },
    Step: () => step(),
    Check: () => step('--check'),
    // the returns the last step asked for, when the files are still the ones it checked: step again on the same files
    // (a check of these files changes nothing), save each return it names, then the step after them
    Save: async () => {
      if ((await status()).current) {
        const asked = await step()
        for (const [, path] of asked.stdout.matchAll(RETURN)) await writeFile(join(repo, path), returnText(path))
      }
      return step()
    },
    // every `repo:` source the oracle registers: the package's (Formal), the card's policy file (Contract)
    Lock: async () => {
      const pkg = await readFile(files.package, 'utf8').then(JSON.parse, () => null)
      // a skeleton written by a step on a blank folder still holds its sources as a todo
      const registered = session.contract ? [{ location: CONTRACT_SOURCE }] : [pkg?.sources ?? []].flat().filter((source) => !source?.todo)
      const sources = registered.map((source) => /^repo:([^#]+)/.exec(source.location ?? '')?.[1]).filter(Boolean)
      const lock = ['create', '--oracle', join(PACKAGE_DIR, 'oracle.md'), '--lock', join(PACKAGE_DIR, 'oracle.lock.json')]
      return node('oracle-lock.mjs', [...lock, ...sources.flatMap((path) => ['--source', path])])
    },
    Edit: async ({ part, how }) => {
      if (part.$ === 'PkgFile') {
        flip('package', how.$)
        await writePackage()
      } else if (part.$ === 'BendFiles') {
        flip('bend', how.$)
        await writeWorld()
      } else if (part.$ === 'CardText') {
        flip('card', how.$)
        if (session.contract) {
          session.note = count()
          await writeContractCard()
        } else await writeFormalCard()
      } else {
        if (how.$ === 'Fixes') session.approved = true
        if (how.$ === 'Breaks') session.approved = false
        session.approval = count()
        await writeContractCard()
      }
      return done
    },
  }
}

/**
 * The phase line against the model: it names the model's next, and once per model state oracle-step.mjs plans the same
 * entry and the model accepts the events the table gives it (a lock it names is taken).
 */
async function phaseLineDifference(model, state, brief, directory, checked) {
  const command = nextCommandOf(brief)
  const wanted = NEXT[toPlain(model.hint(state)).$]
  if (command !== wanted) return { phaseLine: brief, wanted }
  const key = keyOf(state)
  if (checked.has(key)) return null
  checked.add(key)
  const refused = (NEXT_COMMANDS[command].graph?.() ?? []).find((event) => event.$ === 'Lock' && exitOf(model, state, event) !== 'Exit0')
  if (refused) return { phaseLine: brief, refused: 'Lock' }
  const planned = await stepPlanDifference(directory, command)
  return planned ? { phaseLine: brief, ...planned } : null
}

/** Replay one trace; after every event the exit, the record and the phase line must be what the model says. */
async function replayTrace(model, fixture, repo, trace, env, checked) {
  await cp(fixture.base, repo, { recursive: true })
  const directory = join(repo, PACKAGE_DIR)
  // no package and no card: the model's Blank
  await rm(join(directory, 'oracle.package.json'))
  await rm(join(directory, 'oracle.md'))
  const commands = authoringCommands(repo, fixture, env)
  let state = model.init()
  for (const [index, message] of trace.entries()) {
    const plain = toPlain(message)
    const where = { step: index, event: keyOf(message), after: trace.slice(0, index).map(keyOf).join(' ') }
    const result = await commands[plain.$](plain)
    const exit = exitOf(model, state, message)
    if ((result.status === 0) !== (exit === 'Exit0'))
      return [{ ...where, exit: result.status, wanted: exit, output: `${result.stdout}${result.stderr}`.slice(-600) }]
    state = model.step(state, message)
    const [status, brief] = await Promise.all([
      runNode(repo, 'oracle-stage.mjs', ['status', '--dir', PACKAGE_DIR], env),
      runNode(repo, 'oracle-stage.mjs', ['status', '--brief', '--dir', PACKAGE_DIR], env),
    ])
    const wanted = wantedRecord(model, state)
    const observed = observedRecord(JSON.parse(status.stdout), wanted)
    if (!isDeepStrictEqual(observed, wanted)) return [{ ...where, observed, wanted, output: `${result.stdout}${result.stderr}`.slice(-600) }]
    const phase = await phaseLineDifference(model, state, brief.stdout.trim(), directory, checked)
    if (phase) return [{ ...where, ...phase }]
  }
  return []
}

async function conformance(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const model = await loadModel(bin)
  const states = reachable(model)
  // the states prove-reach reaches (test-fixtures/stage/README.md)
  assert.equal(states.length, 730)
  const { items, traces } = coveringTraces(model, states)
  assert.deepEqual({ items, traces: traces.length, events: traces.flat().length }, { items: 253, traces: 19, events: 393 })
  const root = await mkdtemp(join(tmpdir(), 'oracle-authoring-machine-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fixture = await template(root)
  // receipts of this test only: a model state the traces share is judged once
  const env = { ...CHILD_ENV, ORACLE_LINT_CACHE: join(root, 'receipts') }
  await mkdir(env.ORACLE_LINT_CACHE)
  const checked = new Set()
  const differences = await pool(traces, 6, (trace, index) => replayTrace(model, fixture, join(root, `trace-${index}`), trace, env, checked))
  assert.deepEqual(differences.flat(), [])
  t.diagnostic(`${traces.length} traces, ${traces.flat().length} events; phase line checked against the table on ${checked.size} model states`)
}

export const authoringMachineCases = [
  ['[bend] oracle-step.mjs and oracle-lock.mjs answer every (view, event, exit, view after) the authoring graph model reaches the way the model does', conformance],
]
