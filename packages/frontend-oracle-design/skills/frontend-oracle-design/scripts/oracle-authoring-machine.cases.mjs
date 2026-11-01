import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { sha256 } from './oracle-fs.mjs'
import { compileBend } from './oracle-model.mjs'
import { assertReadyToLock, assertRelockPinned, inputsPin, markLocked } from './oracle-stage.mjs'
import { installedBend } from './oracle-test-bend.mjs'
import { toPlain } from './oracle-types.mjs'

// The authoring fixture models a formal-bend/v1 package from no stage record to ORACLE_READY: the stage record of
// oracle-stage.mjs, the authoring round budget of oracle-iterations.mjs, oracle-cycle.mjs walk and the stage half of
// the lock. These cases prove its laws with the kernel, check that its stage part refines the stage fixture, list the
// guards and commands the reachable graph never tells apart, and drive the real commands along traces that cover every
// (stage, inputs, budget class, command, outcome) the model reaches. oracle-stage-machine.test.mjs registers them and
// shares the stale-search workspace helpers below.
const STAGE = fileURLToPath(new URL('../../../test-fixtures/stage/', import.meta.url))
const AUTHORING = join(STAGE, 'authoring')
const SEARCH = fileURLToPath(new URL('../../../test-fixtures/stale-search/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...INHERITED_ENV } = process.env
// no CHECKED receipt from another test or run passes a gate for these runs
export const CHILD_ENV = { ...INHERITED_ENV, ORACLE_LINT_CACHE: 'off' }
// the authoring model's rewind cap (1) and round ceiling (5): the CLI takes them lowered, never raised
const AUTHORING_ENV = { ...CHILD_ENV, ORACLE_REWIND_CAP: '1', ORACLE_ROUND_CEILING: '5' }
// the rewind cap the replayed CLI runs with: observe() reads the rewind class against it, so the two cannot drift
const REPLAY_CAP = Number(AUTHORING_ENV.ORACLE_REWIND_CAP)

const oracleModel = (...args) =>
  spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), ...args], { encoding: 'utf8', env: CHILD_ENV, maxBuffer: 1 << 26 })

// ---- the stale-search workspace the stage commands run in

export const ORDER = ['Discovering', 'Modeled', 'Checked', 'Drafted', 'Ready']
export const STAGE_NAME = { Discovering: 'DISCOVERING', Modeled: 'MODELED', Checked: 'CHECKED', Drafted: 'DRAFTED', Ready: 'ORACLE_READY' }
export const MODEL_STAGE = Object.fromEntries(Object.entries(STAGE_NAME).map(([model, name]) => [name, model]))
const PACKAGE_DIR = join('.ai', 'oracles', 'stale-search')
// the World.bend row the failing CHECKED gate flips: adequacy refutes a goal when the newer answer is forbidden
const WORLD_ROW = '      Race.imp(n, Race.isNew(f))\n'
const FORBIDDING_ROW = '      Race.imp(n, Bool.not(Race.isNew(f)))\n'

/**
 * An advance whose gate fails, set up without touching what the record took: a package that is not model-complete
 * before MODELED took its digest, a World.bend row that breaks adequacy where no pin covers it or the pin is already
 * stale, a card edit. Elsewhere the failing gate cannot be set up, and the cell runs with a passing gate.
 */
export function failingGate({ kind, pass, to, at, inputs }) {
  if (kind !== 'Advance' || pass) return null
  if (to === 'ToModeled' && at === 'Discovering') return 'model'
  if (to === 'ToChecked' && (ORDER.indexOf(at) < 2 || inputs !== 'Judged')) return 'world'
  if (to === 'ToDrafted') return 'card'
  return null
}

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

/** A repository with the stale-search package under `.ai/oracles/`, the card projected from it, and no stage record. */
export async function template(root) {
  const base = join(root, 'template')
  await cp(SEARCH, base, { recursive: true })
  const directory = join(base, PACKAGE_DIR)
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
  const forbidding = world.replace(WORLD_ROW, FORBIDDING_ROW)
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

/** The inputs as the stage record judges them: its package digest, then the pin CHECKED took. */
export async function inputsAgainst(directory, record) {
  const bytes = await readFile(join(directory, 'oracle.package.json'))
  if (record.packageSha256 && record.packageSha256 !== sha256(bytes)) return 'PackageEdited'
  if (ORDER.indexOf(MODEL_STAGE[record.stage]) < 2) return 'Judged'
  // a record without the pin, or a pin that cannot be measured, is stale like a changed pin
  const pin = await inputsPin(directory).catch(() => null)
  return record.inputsSha256 === pin ? 'Judged' : 'BendEdited'
}

export async function lockStage(directory) {
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

// ---- the kernel

async function provenLaws(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const cells = oracleModel('prove', '--dir', AUTHORING, '--timeout-ms', '300000')
  assert.equal(cells.status, 0, cells.stderr)
  const proven = JSON.parse(cells.stdout)
  assert.equal(proven.status, 'proven', `${proven.stdout}${proven.stderr}`)
  assert.deepEqual(proven.cells, {
    generated: [
      { law: 'potential_rises', cases: 1440 },
      { law: 'delegation_raises', cases: 1080 },
    ],
    skipped: [],
    temporaryCopy: true,
  })

  // 25,920 states of the type × 40 commands; the proof has an arm per state of the type and per reached cell
  const reach = oracleModel('prove-reach', '--model', join(AUTHORING, 'MODEL.bend'), '--prefix', 'Auth', '--safe', 'safe', '--max-cells', '1100000', '--timeout-ms', '1800000')
  assert.equal(reach.status, 0, reach.stderr)
  const reached = JSON.parse(reach.stdout)
  assert.equal(reached.status, 'proven', reach.stdout.slice(0, 2000))
  assert.deepEqual(
    { domain: reached.domain, reachable: reached.reachable, diameter: reached.diameter },
    { domain: { states: 25920, events: 40, cells: 1036800 }, reachable: 2527, diameter: 12 },
  )
}

// ---- the model, read in JavaScript

const listItems = (list) => {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}
const keyOf = (value) => JSON.stringify(toPlain(value))
const outcomeOf = (last) => {
  const plain = toPlain(last)
  return plain.$ === 'Took' ? 'Took' : plain.why.$
}

async function loadModels(bin) {
  const { exported } = await compileBend({ entry: join(AUTHORING, 'MODEL.bend'), bin })
  const { exported: stageExported } = await compileBend({ entry: join(STAGE, 'MODEL.bend'), bin })
  const call =
    (table, name) =>
    (...args) =>
      table[name](...args.map((argument) => structuredClone(argument)))
  // every command at any time: Auth.commands lists every value of Msg
  const commands = listItems(call(exported, 'Auth.commands')())
  return {
    init: call(exported, 'Auth.init'),
    step: call(exported, 'Auth.step'),
    decide: call(exported, 'Auth.decide'),
    stale: call(exported, 'Auth.stale'),
    hint: call(exported, 'Auth.hint'),
    enabled: () => commands,
    stageStep: call(stageExported, 'Run.step'),
  }
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

/**
 * One coverage item per cell: the stage and inputs, for review-input the budget class it reads (text and dispatch
 * keys, and whether the round is at the limit), for extend the delegation and the limit, then the command and its
 * outcome.
 */
const BUDGET_READ = {
  Review: ({ budget }) => `|${budget.text.$},${budget.dispatch.$},${budget.round.$.slice(1) === budget.limit.$.slice(1) ? 'full' : 'room'}`,
  Approve: ({ budget }) => `|${budget.delegated},${budget.limit.$}`,
  Delegate: ({ budget }) => `|${budget.delegated},${budget.limit.$}`,
  // a rewind reads the count against the allowance and whether it repeats the last one
  Rewind: ({ back, again }) => `|${back.$},${again}`,
}

function itemOf(model, state, message) {
  const plain = toPlain(state)
  const { at, inputs } = plain
  const read = BUDGET_READ[message.$]?.(plain) ?? ''
  return `${at.$}/${inputs.$}${read}|${keyOf(message)}|${outcomeOf(model.decide(state, message))}`
}

/** The shortest path from `start` to a cell whose item is still uncovered, ending with that cell's command. */
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

const STAGE_MESSAGES = new Set(['Advance', 'Rewind', 'Lock', 'Status', 'Edit'])

/**
 * The stage part refines ../MODEL.bend: on every reached record, every stage command and edit gives the stage, the
 * inputs and the outcome the stage fixture gives, whatever the budget, except that past the rewind allowance a
 * rewind or recheck is refused (REWIND_CAP_REACHED) where the stage fixture has no count.
 */
function refinementGaps(model, states) {
  const gaps = []
  for (const state of states) {
    const { at, inputs } = toPlain(state)
    if (at.$ === 'NoRecord') continue
    for (const message of model.enabled(state).filter(({ $ }) => STAGE_MESSAGES.has($))) {
      const after = toPlain(model.step(state, message))
      // status and edits keep the stage model's last outcome, here Took
      const reference = toPlain(model.stageStep({ $: 'Run', at: { $: at.$ }, inputs: { $: inputs.$ }, last: { $: 'Took' } }, message))
      const wanted = { at: reference.at.$, inputs: reference.inputs.$, outcome: outcomeOf(reference.last) }
      const got = { at: after.at.$, inputs: after.inputs.$, outcome: outcomeOf(model.decide(state, message)) }
      if (got.outcome !== 'RewindCap' && !isDeepStrictEqual(got, wanted)) gaps.push({ state: keyOf(state), message: keyOf(message), got, wanted })
    }
  }
  return gaps
}

/** Commands no reached state tells apart (same outcome and same next state everywhere), as groups of two or more. */
function equivalentCommands(model, states) {
  const groups = new Map()
  for (const message of model.enabled(model.init())) {
    const signature = states.map((state) => `${outcomeOf(model.decide(state, message))}>${keyOf(model.step(state, message))}`).join('|')
    if (!groups.has(signature)) groups.set(signature, [])
    groups.get(signature).push(keyOf(message))
  }
  return [...groups.values()].filter((group) => group.length > 1)
}

/** Every outcome each command kind reaches. */
function outcomesByKind(model, states) {
  const kinds = new Map()
  for (const state of states)
    for (const message of model.enabled(state)) {
      if (!kinds.has(message.$)) kinds.set(message.$, new Set())
      kinds.get(message.$).add(outcomeOf(model.decide(state, message)))
    }
  return Object.fromEntries([...kinds].map(([kind, outcomes]) => [kind, [...outcomes].sort()]))
}

async function modelFacts(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const model = await loadModels(bin)
  const states = reachable(model)
  assert.equal(states.length, 2527)
  assert.deepEqual(refinementGaps(model, states), [])
  // ITERATION_BUDGET_EXHAUSTED reaches review-input only: the guards of advance, rewind, the lock and walk never fire
  // on a record begin wrote (the round never passes the limit), only on a legacy record readStage rebuilds
  assert.deepEqual(outcomesByKind(model, states), {
    Begin: ['Exists', 'Took'],
    Advance: ['Gate', 'LockOnly', 'Missing', 'RewindCap', 'Skip', 'Stale', 'Took'],
    Rewind: ['Back', 'Missing', 'RewindCap', 'Stale', 'Took', 'Usage'],
    Lock: ['Missing', 'NotDrafted', 'Stale', 'Took'],
    Status: ['Took'],
    Edit: ['Took'],
    Review: ['Exhausted', 'Locked', 'Took'],
    Approve: ['ApprovalRequired', 'Ceiling', 'Locked', 'Missing', 'Took'],
    Delegate: ['ApprovalRequired', 'ApprovalReused', 'Locked', 'Missing', 'Took'],
    Walk: ['Missing', 'RewindCap', 'Stale', 'Took'],
  })
  // commands that are the same on every reached state: a target advance never takes, and rewinds that are always refused
  const message = (kind, to, flag) => JSON.stringify({ $: kind, to: { $: to }, [kind === 'Advance' ? 'pass' : 'reason']: flag })
  assert.deepEqual(equivalentCommands(model, states), [
    [message('Advance', 'ToDiscovering', true), message('Advance', 'ToDiscovering', false), message('Advance', 'ToNothing', true), message('Advance', 'ToNothing', false)],
    [message('Advance', 'ToReady', true), message('Advance', 'ToReady', false)],
    ['ToDiscovering', 'ToModeled', 'ToChecked', 'ToDrafted', 'ToReady', 'ToNothing'].map((to) => message('Rewind', to, false)),
    [message('Rewind', 'ToReady', true), message('Rewind', 'ToNothing', true)],
  ])
}

// ---- the model against the CLI

const WHY = {
  STAGE_SKIP: 'Skip',
  STAGE_LOCK_ONLY: 'LockOnly',
  STAGE_REWIND: 'Back',
  STAGE_NOT_DRAFTED: 'NotDrafted',
  USAGE: 'Usage',
  STAGE_STALE: 'Stale',
  STAGE_GATE: 'Gate',
  STAGE_MISSING: 'Missing',
  STAGE_EXISTS: 'Exists',
  ITERATION_BUDGET_EXHAUSTED: 'Exhausted',
  STAGE_LOCKED: 'Locked',
  ITERATION_APPROVAL_REQUIRED: 'ApprovalRequired',
  ITERATION_APPROVAL_REUSED: 'ApprovalReused',
  REWIND_CAP_REACHED: 'RewindCap',
  ITERATION_CEILING_REACHED: 'Ceiling',
}
const SPELLING = { ToDiscovering: 'DISCOVERING', ToModeled: 'MODELED', ToChecked: 'CHECKED', ToDrafted: 'DRAFTED', ToReady: 'ORACLE_READY', ToNothing: 'NOT_A_STAGE' }
// the command `status --brief` names next, by the model's hint
const HINT = {
  HintBegin: /· next: oracle-stage\.mjs begin --dir /,
  HintWalk: /· next: oracle-cycle\.mjs walk --dir \S+ ·/,
  HintWalkReason: /· next: oracle-cycle\.mjs walk --dir \S+ --reason /,
  HintLock: /· next: oracle-lock\.mjs create /,
  HintInit: /· next: oracle-run\.mjs init /,
  HintExtend: /· next: oracle-stage\.mjs extend --dir \S+ --approval /,
  HintRevise: /· next: NEEDS_DECISION: the user rewrites the sources/,
}
const KIND = 'cold-read'
const TEXT_KEY = KIND
const DISPATCH_KEY = `${KIND}:dispatch`
const roundIn = (name) => Number(name.slice(1))

function seenOf(entry, round) {
  if (!entry) return 'Unseen'
  return entry.round === round ? 'ThisRound' : 'EarlierRound'
}

/** Whether the same rewind again is the no-op retry: the last entry is a rewind taken on the package and card as they are. */
async function repeatable(directory, record) {
  const last = record.history.at(-1)
  if (last?.evidence !== 'rewind') return false
  const bytes = (name) => readFile(join(directory, name), 'utf8').catch(() => undefined)
  return last.inputSha256 === sha256(JSON.stringify([await bytes('oracle.package.json'), await bytes('oracle.md')]))
}

/**
 * The model state as the files give it: stage.json (none is NoRecord), the inputs against it, the budget, the
 * rewinds since the allowance was last set (the count minus the allowance plus the replay cap) and the repeatable rewind.
 */
async function observe(directory) {
  const raw = await readFile(join(directory, 'stage.json'), 'utf8').catch(() => null)
  if (raw === null) return { at: 'NoRecord', inputs: 'Judged', budget: null, back: 'B0', again: false, record: null }
  const record = JSON.parse(raw)
  const { round, limit, approvals, inputs } = record.iterations
  return {
    back: `B${(record.rewinds ?? 0) - (record.rewindAllowance ?? REPLAY_CAP) + REPLAY_CAP}`,
    again: await repeatable(directory, record),
    at: MODEL_STAGE[record.stage],
    inputs: await inputsAgainst(directory, record),
    budget: {
      round: `R${round}`,
      limit: `L${limit}`,
      delegated: approvals.some((approval) => approval.decision === 'delegated-rounds'),
      text: seenOf(inputs[TEXT_KEY], round),
      dispatch: seenOf(inputs[DISPATCH_KEY], round),
    },
    record,
  }
}

function expectedOf(model, state, message) {
  const after = toPlain(model.step(state, message))
  const { round, limit, delegated, text, dispatch } = after.budget
  const budget = { round: round.$, limit: limit.$, delegated, text: text.$, dispatch: dispatch.$ }
  return { outcome: outcomeOf(model.decide(state, message)), at: after.at.$, inputs: after.inputs.$, budget: after.at.$ === 'NoRecord' ? null : budget, back: after.back.$, again: after.again }
}

/** The CLI command of each model event in one stale-search workspace. */
function authoringCommands(repo, directory, session) {
  const flip = async (path, change, run) => {
    const before = await readFile(path)
    await writeFile(path, change(before.toString('utf8')))
    try {
      return await run()
    } finally {
      await writeFile(path, before)
    }
  }
  const write = async (name, text) => {
    const path = join(repo, 'inputs', name)
    await mkdir(join(repo, 'inputs'), { recursive: true })
    await writeFile(path, text)
    return path
  }
  const stage = (...args) => runNode(repo, 'oracle-stage.mjs', [args[0], '--dir', directory, ...args.slice(1)], AUTHORING_ENV)
  // the card carries the digest of the Bend inputs: after a Bend edit only a new projection passes check-card, as walk does
  const project = () => runNode(repo, 'oracle-package.mjs', ['project-card', '--package', join(PACKAGE_DIR, 'oracle.package.json'), '--out', join(PACKAGE_DIR, 'oracle.md')], AUTHORING_ENV)
  return {
    Begin: () => stage('begin'),
    Advance: async ({ to, pass }, state) => {
      const run = () => stage('advance', '--to', SPELLING[to.$])
      const failing = failingGate({ kind: 'Advance', pass, to: to.$, at: state.at.$, inputs: state.inputs.$ })
      if (failing === 'model') return flip(join(directory, 'oracle.package.json'), () => session.incomplete, run)
      if (failing === 'world') return flip(join(repo, 'World.bend'), (text) => text.replace(WORLD_ROW, FORBIDDING_ROW), run)
      if (failing === 'card') return flip(join(directory, 'oracle.md'), (text) => text.replace('Search', 'Searches'), run)
      if (to.$ === 'ToDrafted') assert.equal((await project()).status, 0)
      return run()
    },
    Rewind: ({ to, reason }) => stage('rewind', '--to', SPELLING[to.$], ...(reason ? ['--reason', 'review-finding'] : [])),
    Lock: () => lockStage(directory),
    Status: () => stage('status'),
    Edit: async ({ part }) => {
      if (part.$ === 'PackageFile') await appendFile(join(directory, 'oracle.package.json'), '\n')
      else await appendFile(join(repo, 'World.bend'), '\n# edited\n')
      return { status: 0, stdout: '', stderr: '' }
    },
    // other bytes and a new attempt get a number never used before; the same ones repeat the last accepted
    Review: async ({ text, attempt }) => {
      session.counter += 1
      const sent = { text: text ? session.counter : session.text, attempt: attempt ? session.counter : session.attempt }
      const input = await write(`review-${sent.text}.txt`, `${KIND} review input ${sent.text}\n`)
      const result = await stage('review-input', '--kind', KIND, '--input', input, '--attempt', `attempt-${sent.attempt}`)
      if (result.status === 0) Object.assign(session, sent)
      return result
    },
    Approve: async ({ right }, state) => {
      const next = Math.max(roundIn(state.budget.round.$), roundIn(state.budget.limit.$)) + (right ? 1 : 2)
      session.counter += 1
      const document = { decision: 'approve-one-more-round', phase: 'authoring', round: next, source: `user: one more round (${session.counter})`, reason: 'repair the open findings' }
      return stage('extend', '--approval', await write(`approval-${session.counter}.json`, JSON.stringify(document)))
    },
    Delegate: async ({ up }) => {
      session.counter += 1
      const upTo = Number(up.$.slice(2))
      const document = { decision: 'delegated-rounds', phase: 'authoring', upTo, source: `user: handle it (${session.counter})`, reason: 'standing delegation' }
      return stage('extend', '--approval', await write(`approval-${session.counter}.json`, JSON.stringify(document)))
    },
    // walk prints one JSON line; a refused walk names the code of its first failing step
    Walk: async ({ reason }) => {
      const result = await runNode(repo, 'oracle-cycle.mjs', ['walk', '--dir', directory, ...(reason ? ['--reason', 'review-finding'] : [])], AUTHORING_ENV)
      const line = result.stdout.trim().split('\n').at(-1) ?? ''
      if (!line.startsWith('{')) return result
      const report = JSON.parse(line)
      if (report.ok) return { status: 0, stdout: result.stdout, stderr: '' }
      return { status: 1, stdout: result.stdout, stderr: `${report.failed.code}: ${report.failed.detail}` }
    },
  }
}

/** The stage record's own fields as its last history entry has them: what a lost top-level record rebuilds from. */
const STAGE_FIELDS = ['stage', 'packageSha256', 'inputsSha256']
const projection = (entry) => Object.fromEntries(STAGE_FIELDS.map((name) => [name, entry?.[name] ?? null]))
const budgetOf = (record) => {
  if (!record) return null
  const { stage: _stage, ...inputs } = record.iterations.inputs
  return { ...record.iterations, inputs }
}

function sameBytes(before, after) {
  if (before === null || after === null) return before === after
  return before.equals(after)
}

/**
 * What one step did beyond its outcome: a refusal that wrote, a top-level stage record that is not its last history
 * entry. `budgetWithoutHistory` counts accepted writes that changed the budget and added no history entry.
 */
function recordEffects({ observed, before, after, previous, record }) {
  const wrote = !sameBytes(before, after)
  if (observed.outcome !== 'Took' && wrote) return { difference: { refusal: 'wrote' } }
  // the stage, its digest and its pin are always the last history entry's: they rebuild from history
  if (record && !isDeepStrictEqual(projection(record), projection(record.history.at(-1))))
    return { difference: { record: projection(record), history: projection(record.history.at(-1)) } }
  const budgetMoved = wrote && previous !== null && !isDeepStrictEqual(budgetOf(previous), budgetOf(record))
  return { budgetWithoutHistory: budgetMoved && previous.history.length === record.history.length }
}

/** `status --brief` against the model: the next command, the authoring round, the STALE mark. */
function phaseLineDifference(model, state, brief, recorded) {
  const hint = toPlain(model.hint(state)).$
  const { budget } = toPlain(state)
  const round = `authoring round ${roundIn(budget.round.$)}/${roundIn(budget.limit.$)}`
  const stale = toPlain(model.stale(state))
  const line = brief.stdout
  const named = brief.status === 0 && HINT[hint].test(line)
  if (named && (!recorded || line.includes(round)) && line.includes('STALE:') === stale) return null
  return { phaseLine: line || brief.stderr, wanted: { hint, round, stale } }
}

const outcomeOfResult = (result) => {
  if (result.status === 0) return 'Took'
  const code = result.stderr.split(':')[0]
  return WHY[code] ?? `${code} ${result.stderr.slice(0, 300)}`
}

/** Replay one trace; every step must end where the model says. Returns the differences and what the record kept. */
async function replayTrace(model, fixture, repo, trace) {
  await cp(fixture.base, repo, { recursive: true })
  const directory = join(repo, PACKAGE_DIR)
  const recordPath = join(directory, 'stage.json')
  const session = { counter: 0, text: 0, attempt: 0, incomplete: fixture.incomplete }
  const commands = authoringCommands(repo, directory, session)
  const tally = { steps: 0, budgetWithoutHistory: 0 }
  let state = model.init()
  for (const [index, message] of trace.entries()) {
    const plain = toPlain(message)
    const before = await readFile(recordPath).catch(() => null)
    const previous = (await observe(directory)).record
    const result = await commands[plain.$](plain, toPlain(state))
    const now = await observe(directory)
    const observed = { outcome: outcomeOfResult(result), at: now.at, inputs: now.inputs, budget: now.budget, back: now.back, again: now.again }
    const wanted = expectedOf(model, state, message)
    const where = { step: index, event: keyOf(message), after: trace.slice(0, index).map(keyOf).join(' ') }
    if (!isDeepStrictEqual(observed, wanted)) return { differences: [{ ...where, observed, wanted }], tally }
    const after = await readFile(recordPath).catch(() => null)
    const effects = recordEffects({ observed, before, after, previous, record: now.record })
    if (effects.difference) return { differences: [{ ...where, ...effects.difference }], tally }
    if (effects.budgetWithoutHistory) tally.budgetWithoutHistory += 1
    state = model.step(state, message)
    tally.steps += 1
    const brief = await runNode(repo, 'oracle-stage.mjs', ['status', '--brief', '--dir', directory], AUTHORING_ENV)
    const phase = phaseLineDifference(model, state, brief, now.record !== null)
    if (phase) return { differences: [{ ...where, ...phase }], tally }
  }
  return { differences: [], tally }
}

async function conformance(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const model = await loadModels(bin)
  const { items, traces } = coveringTraces(model, reachable(model))
  assert.equal(items, 1470)
  assert.equal(traces.length, 72)
  const root = await mkdtemp(join(tmpdir(), 'oracle-authoring-machine-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fixture = await template(root)
  const results = await pool(traces, 6, (trace, index) => replayTrace(model, fixture, join(root, `trace-${index}`), trace))
  assert.deepEqual(
    results.flatMap(({ differences }) => differences),
    [],
  )
  const steps = results.reduce((sum, { tally }) => sum + tally.steps, 0)
  const budgetWithoutHistory = results.reduce((sum, { tally }) => sum + tally.budgetWithoutHistory, 0)
  assert.equal(steps, traces.flat().length)
  t.diagnostic(`${traces.length} traces, ${steps} steps; ${budgetWithoutHistory} accepted budget changes wrote no history entry`)
  // Finding: the round, limit, approvals and review inputs live only in the top-level record; review-input and extend
  // change them without a history entry, so they cannot be rebuilt from history
  assert.ok(budgetWithoutHistory > 0, 'review-input and extend change the budget without a history entry')
}

/**
 * Recovery outside the model: writeStage writes a temporary file and renames it, so a crash leaves the old record and
 * a stray temporary file that every command ignores. A record that is not JSON stops every stage command, writes
 * nothing, and walk reports it as STAGE_MISSING. Deleting it and running begin again starts a fresh budget.
 */
async function recovery(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-authoring-recovery-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fixture = await template(root)
  const repo = join(root, 'repo')
  await cp(fixture.base, repo, { recursive: true })
  const directory = join(repo, PACKAGE_DIR)
  const recordPath = join(directory, 'stage.json')
  const stage = (...args) => runNode(repo, 'oracle-stage.mjs', [args[0], '--dir', directory, ...args.slice(1)])
  const input = join(repo, 'review.txt')
  const review = async (text, attempt) => {
    await writeFile(input, text)
    return stage('review-input', '--kind', KIND, '--input', input, '--attempt', attempt)
  }
  assert.equal((await stage('begin')).status, 0)
  assert.equal((await review('first', 'a1')).status, 0)
  assert.equal((await review('second', 'a2')).status, 0)
  const valid = await readFile(recordPath)
  assert.deepEqual(JSON.parse(valid.toString('utf8')).iterations.round, 2)

  // a temporary file a crashed write left beside the record is ignored
  await writeFile(`${recordPath}.4242.tmp`, valid.subarray(0, 40))
  const status = await stage('status')
  assert.equal(status.status, 0, status.stderr)
  assert.equal(JSON.parse(status.stdout).iterations.round, 2)
  await unlink(`${recordPath}.4242.tmp`)

  // a torn record: every command refuses with STAGE_INVALID (walk says STAGE_MISSING) and writes nothing
  const torn = valid.subarray(0, Math.floor(valid.length / 2))
  await writeFile(recordPath, torn)
  const refusals = {}
  for (const [name, run] of Object.entries({
    status: () => stage('status'),
    begin: () => stage('begin'),
    advance: () => stage('advance', '--to', 'MODELED'),
    rewind: () => stage('rewind', '--to', 'DISCOVERING', '--reason', 'gate-failure'),
    review: () => review('third', 'a3'),
    walk: async () => {
      const result = await runNode(repo, 'oracle-cycle.mjs', ['walk', '--dir', directory, '--reason', 'gate-failure'])
      return { status: result.status, stderr: `${JSON.parse(result.stdout).failed.code}:` }
    },
  })) {
    const result = await run()
    refusals[name] = result.status === 0 ? 'Took' : result.stderr.split(':')[0]
    assert.ok((await readFile(recordPath)).equals(torn), `${name} wrote the torn record`)
  }
  assert.deepEqual(refusals, {
    status: 'STAGE_INVALID',
    begin: 'STAGE_INVALID',
    advance: 'STAGE_INVALID',
    rewind: 'STAGE_INVALID',
    review: 'STAGE_INVALID',
    walk: 'STAGE_MISSING',
  })

  // Finding: the only way on is deleting the record, and begin then starts round 1 of 2 again
  await unlink(recordPath)
  assert.equal((await stage('begin')).status, 0)
  assert.deepEqual(JSON.parse(await readFile(recordPath, 'utf8')).iterations.round, 1)
}

export const authoringMachineCases = [
  ['[bend] the authoring laws are proven by the kernel: cells, witnesses, and every law on every reached state', provenLaws],
  ['[bend] the authoring model refines the stage model, and its reachable graph names the guards and commands it never tells apart', modelFacts],
  ['[bend] the stage CLI answers every (stage, inputs, budget class, command, outcome) the authoring model reaches the way the model does', conformance],
  ['a torn stage record stops every stage command without a write, and only deleting it goes on, with a fresh budget', recovery],
]
