import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { repairHunks } from './oracle-iterations.mjs'
import { compileBend } from './oracle-model.mjs'
import { NEXT_LINES, nextCommandOf } from './oracle-next.mjs'
import { bindReviewDocument, runAsync, strictReviewPacketArgs, workspace } from './oracle-run.cases.mjs'
import { AUTO, AUTO_COMMAND, stepPlan } from './oracle-step.mjs'
import { installedBend } from './oracle-test-bend.mjs'
import { toPlain } from './oracle-types.mjs'

// The delivery fixture models the Delivery run of oracle-run.mjs: its run state, the facts its guards read and the
// commands that change them. These cases prove its laws with the kernel and drive the real CLI along traces that
// cover every (run state, VALID_RED recorded, command, outcome) the model reaches, checking each step against the
// model. oracle-stage-machine.test.mjs registers them next to the stage machine.
const DELIVERY = fileURLToPath(new URL('../../../test-fixtures/delivery/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...CHILD_ENV } = process.env

const oracleModel = (...args) =>
  spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), ...args], { encoding: 'utf8', env: CHILD_ENV, maxBuffer: 1 << 26 })

async function provenLaws(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const cells = oracleModel('prove', '--dir', DELIVERY, '--timeout-ms', '300000')
  assert.equal(cells.status, 0, cells.stderr)
  const proven = JSON.parse(cells.stdout)
  assert.equal(proven.status, 'proven', `${proven.stdout}${proven.stderr}`)
  assert.deepEqual(proven.cells, { generated: [{ law: 'spend_monotone', cases: 3 }], skipped: [], temporaryCopy: true })

  // 11,664 states of the type × 17 commands; the proof has an arm per state of the type and per reached cell
  const reach = oracleModel('prove-reach', '--model', join(DELIVERY, 'MODEL.bend'), '--prefix', 'Del', '--safe', 'safe', '--max-cells', '300000', '--timeout-ms', '600000')
  assert.equal(reach.status, 0, reach.stderr)
  const reached = JSON.parse(reach.stdout)
  assert.equal(reached.status, 'proven', reach.stdout.slice(0, 2000))
  assert.deepEqual({ domain: reached.domain, reachable: reached.reachable, diameter: reached.diameter }, {
    domain: { states: 11664, events: 17, cells: 198288 },
    reachable: 1335,
    diameter: 20,
  })
}

// ---- the model against oracle-run.mjs

const STATE = {
  ORACLE_READY: 'AtReady',
  VALID_RED: 'AtRed',
  IMPLEMENTED_GREEN: 'AtGreen',
  REVIEW_VERIFIED: 'AtVerified',
  PARTIAL_VERIFIED: 'AtPartial',
  NEEDS_DECISION: 'AtDecision',
  FAIL: 'AtFail',
}
// each error code the commands report, by the model's refusal class
const WHY = {
  TRANSITION_NOT_ALLOWED: 'NotAllowed',
  HOLDS_OPEN: 'HoldsMismatch',
  NO_OPEN_HOLDS: 'HoldsMismatch',
  RUN_NOT_FOUND: 'RunMissing',
  RUN_NOT_RED: 'NotRed',
  RUN_NOT_GREEN: 'NotGreen',
  PRODUCTION_TOUCHED_BEFORE_RED: 'ProdTouched',
  SNAPSHOT_STALE: 'Stale',
  REVIEW_RUN_STALE: 'Stale',
  FLAKINESS_GATE: 'Flaky',
  REVIEW_RERUN_REQUIRED: 'Rerun',
  REVIEW_PACKET_REQUIRED: 'PacketMissing',
  REVIEW_PACKET_INVALID: 'PacketMissing',
  REVIEWER_EVIDENCE_INVALID: 'ReceiptMissing',
  EVIDENCE_STALE: 'EvidenceStale',
  BUDGET_EXHAUSTED: 'Exhausted',
  REVIEW_PACKET_STATE: 'WrongState',
  REVIEW_RECEIPT_STATE: 'WrongState',
  MISSING_REASON: 'NoReason',
}
/**
 * The model events each `next:` command of oracle-next.mjs NEXT_LINES runs in one call, per model: `delivery`
 * (test-fixtures/delivery), `lap` (test-fixtures/review-lap, from the state, since `close` picks its own steps) and
 * `graph` (test-fixtures/stage, the authoring graph). A `marker` names a step no model event stands for: a read (`guide`
 * lists the blocker and its fix, `close --check-report` checks the final report in a closed state), the user's
 * decision, or the hand-off to the Delivery run. Every next the replays reach matches exactly one entry.
 */
const NEXT_EVENTS = {
  red: { delivery: () => [{ $: 'Exec', pass: false }, { $: 'MarkRed' }] },
  green: { delivery: () => [{ $: 'Exec', pass: true }, { $: 'MarkGreen' }] },
  exec: { delivery: () => [{ $: 'Exec', pass: true }], lap: () => [{ $: 'Exec' }] },
  close: {
    delivery: () => [{ $: 'MakePacket' }, { $: 'Attest' }, { $: 'Review', to: { $: 'ToVerified' }, holds: false }],
    lap: lapClose,
  },
  guide: { marker: 'read' },
  report: { marker: 'read' },
  step: { graph: () => [{ $: 'Step' }] },
  lock: { graph: () => [{ $: 'Lock' }] },
  // the same issues came back after three edits: the user decides
  stop: { marker: 'decision' },
  init: { marker: 'hand-off' },
  revise: { marker: 'decision' },
}
/** The runtime table (oracle-next.mjs, which oracle-step.mjs reads) with the model events of each entry. */
export const NEXT_COMMANDS = Object.fromEntries(Object.entries(NEXT_LINES).map(([key, line]) => [key, { line, ...NEXT_EVENTS[key] }]))
export { nextCommandOf }

/** The table and its events name the same commands. */
function nextEventsCover() {
  assert.deepEqual(Object.keys(NEXT_EVENTS).sort(), Object.keys(NEXT_LINES).sort())
}

const sameCommand = (left, right) => left[0] === right[0] && left[1] === right[1]

/**
 * What oracle-step.mjs would do on a state a replay reached: it names the entry the phase line names, and runs only an
 * AUTO entry's own command (GREEN and a review rerun may first run `exec` for other required labels). Null when so.
 */
export async function stepPlanDifference(directory, wanted) {
  const plan = await stepPlan(directory)
  if (plan.key !== wanted) return { step: plan.key, wanted }
  if (!plan.calls) return null
  const calls = plan.calls.map((call) => [call.script, call.args[0]])
  const own = (call, index) => sameCommand(call, AUTO_COMMAND[plan.key]) || (index < calls.length - 1 && sameCommand(call, AUTO_COMMAND.exec))
  if (AUTO.has(plan.key) && calls.every(own)) return null
  return { step: plan.key, calls }
}

/**
 * The close steps on a lap state: after round 2 with moved bytes it closes the repair on the round-2 packet
 * (PARTIAL_VERIFIED); with the round's packet current and a receipt bound it records the verdict; otherwise it makes
 * the packet when none is current and binds the reviewer's return, taken as clear (a blocking return is the
 * reviewer's verdict, which close reports as FINDINGS_BLOCKING).
 */
function lapClose(s) {
  const verdict = (to) => ({ $: 'Review', to: { $: to } })
  const attest = { $: 'Attest', find: { $: 'Clear' } }
  if (s.round.$ === 'R2' && !s.current) return s.bound ? [verdict('ToPartial')] : [attest, verdict('ToPartial')]
  if (s.round.$ !== 'R0' && s.current) return s.bound ? [verdict('ToVerified')] : [attest, verdict('ToVerified')]
  return [{ $: 'Packet' }, attest, verdict('ToVerified')]
}

/** The first refusal the model gives the events of a next command from `state`, or null when it accepts them all. */
export function nextRefusal(model, state, events) {
  let at = state
  for (const event of events) {
    const outcome = toPlain(model.decide(at, event))
    if (outcome.$ !== 'Took') return `${event.$}:${outcome.why.$}`
    at = model.step(at, event)
  }
  return null
}

// the NEXT_COMMANDS entry of each model hint of the delivery fixture
const DELIVERY_NEXT = { HintRed: 'red', HintGreen: 'green', HintExec: 'exec', HintClose: 'close', HintGuide: 'guide', HintReport: 'report' }

/**
 * The printed next against the model, once per reached model state: it names the model's hint, and the events the
 * table gives it are accepted there (a marker has none). Returns the difference, or null.
 */
function phaseLineDifference(model, state, line, checked) {
  const key = nextCommandOf(line)
  const wanted = DELIVERY_NEXT[toPlain(model.hint(state)).$]
  if (key !== wanted) return { phaseLine: line, wanted, state: toPlain(state) }
  const stateKey = JSON.stringify(toPlain(state))
  if (checked.has(stateKey)) return null
  checked.add(stateKey)
  const entry = NEXT_COMMANDS[key]
  const refused = entry.marker ? null : nextRefusal(model, state, entry.delivery(toPlain(state)))
  return refused ? { phaseLine: line, refused, state: toPlain(state) } : null
}
const RED_TEST = "import test from 'node:test'\ntest('save > pending', () => { throw new Error('expected RED') })\n"
// file edits change no ledger; every other accepted command writes it
const EDITS = new Set(['EditProd', 'EditTest'])
// coverage items the model reaches and the traces that cover them
const ITEMS = 316
const TRACES = 27

const listItems = (list) => {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readOr = (path) => readFile(path).catch(() => Buffer.alloc(0))

/** One coverage item per cell: the run state (with the packet of a GREEN visit), whether VALID_RED was ever recorded, the command and its outcome. */
function deliveryItem(s, message, outcome) {
  const at = s.at.packet ? `${s.at.$}.${s.at.packet.$}` : s.at.$
  return `${at}|red:${s.red}|${JSON.stringify(message)}|${outcome}`
}

function loadModel(exported, prefix = 'Del', item = deliveryItem) {
  const call =
    (name) =>
    (...args) =>
      exported[`${prefix}.${name}`](...args.map((argument) => structuredClone(argument)))
  const enabled = call('enabled')
  return { init: call('init'), step: call('step'), decide: call('decide'), hint: call('hint'), enabled: (state) => listItems(enabled(state)), item }
}

function itemOf(model, state, message) {
  const o = toPlain(model.decide(state, message))
  return model.item(toPlain(state), toPlain(message), o.$ === 'Took' ? 'Took' : o.why.$)
}

function reachableItems(model) {
  const items = new Set()
  const seen = new Set()
  const queue = [model.init()]
  while (queue.length > 0) {
    const state = queue.shift()
    const key = JSON.stringify(toPlain(state))
    if (seen.has(key)) continue
    seen.add(key)
    for (const message of model.enabled(state)) {
      items.add(itemOf(model, state, message))
      queue.push(model.step(state, message))
    }
  }
  return { reachable: seen.size, items }
}

/**
 * Progress over the reachable graph (not a kernel proof): how many reached states cannot reach FAIL, and which
 * non-FAIL states cannot reach REVIEW_VERIFIED or PARTIAL_VERIFIED, by run state.
 */
function progress(model) {
  const successors = new Map()
  const at = new Map()
  const queue = [model.init()]
  while (queue.length > 0) {
    const state = queue.shift()
    const key = JSON.stringify(toPlain(state))
    if (successors.has(key)) continue
    at.set(key, toPlain(state).at.$)
    const next = model.enabled(state).map((message) => model.step(state, message))
    successors.set(key, next.map((after) => JSON.stringify(toPlain(after))))
    queue.push(...next)
  }
  const reaching = (goal) => {
    const reached = new Set([...at].filter(([, phase]) => goal.has(phase)).map(([key]) => key))
    for (let grew = true; grew; ) {
      grew = false
      for (const [key, next] of successors) {
        if (reached.has(key) || !next.some((after) => reached.has(after))) continue
        reached.add(key)
        grew = true
      }
    }
    return reached
  }
  const fail = reaching(new Set(['AtFail']))
  const reviewed = reaching(new Set(['AtVerified', 'AtPartial']))
  const stuck = {}
  for (const [key, phase] of at) if (phase !== 'AtFail' && !reviewed.has(key)) stuck[phase] = (stuck[phase] ?? 0) + 1
  return { cannotFail: at.size - fail.size, stuck }
}

/** The shortest path from `start` to a cell whose item is still uncovered, ending with that cell's command. */
function nearestUncovered(model, start, left) {
  const frontier = [[start, []]]
  const visited = new Set()
  while (frontier.length > 0) {
    const [state, path] = frontier.shift()
    const key = JSON.stringify(toPlain(state))
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
function coveringTraces(model, cap = 30) {
  const { reachable, items } = reachableItems(model)
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
  return { reachable, items: items.size, traces }
}

/** The facts of the run state a guard reads, as run-state.json records them. */
async function observe(directory) {
  const state = JSON.parse(await readFile(join(directory, 'run-state.json'), 'utf8'))
  const history = state.history ?? []
  return {
    at: STATE[state.state],
    red: state.harnessAtValidRed != null || history.some((entry) => entry.state === 'VALID_RED'),
    greened: history.some((entry) => entry.state === 'IMPLEMENTED_GREEN'),
    spent: state.budgets.harness.spent,
    resumes: state.budgets.policy.spent,
  }
}

function expectedOf(model, state, message) {
  const outcome = toPlain(model.decide(state, message))
  const after = toPlain(model.step(state, message))
  return {
    outcome: outcome.$ === 'Took' ? 'Took' : outcome.why.$,
    at: after.at.$,
    red: after.red,
    greened: after.greened,
    spent: Number(after.spent.$.slice(-1)),
    resumes: Number(after.resumes.$.slice(-1)),
  }
}

/** The CLI commands of each model event on one Low-risk workspace. */
function deliveryCommands({ root, dir }, session) {
  const evidence = join(dir, 'evidence.json')
  const findings = join(dir, 'findings.json')
  const counter = { report: 0, prod: 0, test: 0, packet: 0, task: 0 }
  const done = { status: 0, stdout: '', stderr: '' }
  const latestRun = async () => {
    const lines = (await readOr(join(dir, 'runs.jsonl'))).toString('utf8').split('\n').filter(Boolean)
    return lines.map((line) => JSON.parse(line)).filter((entry) => entry.type === 'run').at(-1)?.runId ?? 'r-999'
  }
  const transition = async (to, ...rest) => runAsync(['transition', '--dir', dir, '--to', to, '--run', await latestRun(), ...rest])
  const cited = () => (session.packet ? ['--packet', session.packet.path, '--revision', session.packet.revision] : [])
  return {
    Exec: ({ pass }) => {
      counter.report += 1
      const testFile = join(root, pass ? 'oracle-green-fixture.test.mjs' : 'oracle-red-fixture.test.mjs')
      const report = join(dir, `report-${counter.report}.ndjson`)
      return runAsync(['exec', '--dir', dir, '--label', 'behavior', '--adapter', 'node-test', '--report', report, '--', process.execPath, '--test', testFile])
    },
    EditProd: async () => {
      counter.prod += 1
      await writeFile(join(root, 'src', 'save.mjs'), `export const save = ${counter.prod}\n`)
      return done
    },
    EditTest: async () => {
      counter.test += 1
      await writeFile(join(root, 'src', 'extra.test.mjs'), `import assert from 'node:assert'\n${'assert.equal(1, 1)\n'.repeat(counter.test)}`)
      return done
    },
    MarkRed: () => transition('VALID_RED', '--evidence', evidence, '--row', 'O1'),
    MarkGreen: () => transition('IMPLEMENTED_GREEN', '--evidence', evidence, '--reason', 'existing behavior'),
    Review: async ({ to, holds }) => {
      const holdsFile = join(dir, 'oracle.package.json')
      if (holds) await writeFile(holdsFile, JSON.stringify({ holds: [{ id: 'H1', question: 'late success?', blocks: ['O1'], status: 'open' }] }))
      const target = to.$ === 'ToVerified' ? 'REVIEW_VERIFIED' : 'PARTIAL_VERIFIED'
      const result = await transition(target, '--evidence', evidence, '--findings', findings, ...cited())
      await rm(holdsFile, { force: true })
      return result
    },
    MakePacket: async () => {
      counter.packet += 1
      const path = join(dir, `packet-${counter.packet}.json`)
      const result = await runAsync(strictReviewPacketArgs(dir, path))
      if (result.status === 0) {
        const bytes = await readFile(path)
        session.packet = { path, revision: JSON.parse(bytes.toString('utf8')).targetSnapshot.worktreeSha256, sha256: sha256(bytes) }
      }
      return result
    },
    Attest: () => {
      counter.task += 1
      if (session.packet) bindReviewDocument(findings, session.packet.sha256, session.packet.revision)
      const packet = session.packet ? cited() : ['--packet', join(dir, 'no-packet.json'), '--revision', 'none']
      return runAsync(['review-receipt', '--dir', dir, ...packet, '--findings', findings, '--role', 'code-reviewer', '--reviewer', 'primary-code-reviewer', '--task-id', `review-${counter.task}`])
    },
    Stop: ({ to, reason }) =>
      runAsync(['transition', '--dir', dir, '--to', to.$ === 'StopFail' ? 'FAIL' : 'NEEDS_DECISION', ...(reason ? ['--reason', 'stop here'] : [])]),
    Resume: () => transition('ORACLE_READY'),
  }
}

async function deliveryRun(t) {
  const fixture = await workspace(t, { risk: 'low', initialFiles: { 'oracle-red-fixture.test.mjs': RED_TEST } })
  assert.ok(fixture, 'workspace() could not create the temporary Delivery run')
  const dir = fixture.oracleDirectory
  const statePath = join(dir, 'run-state.json')
  // a packet belongs to one GREEN visit: leaving IMPLEMENTED_GREEN drops it
  const session = { packet: null }
  const commands = deliveryCommands({ root: fixture.root, dir }, session)
  const initialState = await readFile(statePath)
  return {
    dir,
    async perform(message) {
      const result = await commands[message.$](message)
      if ((await observe(dir)).at !== 'AtGreen') session.packet = null
      return result
    },
    /** status replayed from the ledger on the run-state.json init wrote — the ledger alone carries every later change. */
    async replayed() {
      const current = await readFile(statePath)
      await writeFile(statePath, initialState)
      try {
        const status = await runAsync(['status', '--dir', dir, '--json'])
        assert.equal(status.status, 0, status.stderr)
        const parsed = JSON.parse(status.stdout)
        return { at: STATE[parsed.currentState], spent: parsed.remainingBudgets.harness.spent, resumes: parsed.remainingBudgets.policy.spent }
      } finally {
        await writeFile(statePath, current)
      }
    },
    brief: () => runAsync(['status', '--dir', dir, '--brief']),
  }
}

/** What one step did beyond its outcome: a rewritten ledger, a refusal that wrote, a state the ledger alone does not give back. */
async function sideEffects(run, message, observed, before) {
  const found = []
  const ledger = await readOr(join(run.dir, 'runs.jsonl'))
  if (!ledger.subarray(0, before.ledger.length).equals(before.ledger)) found.push({ ledger: 'rewritten' })
  if (observed.outcome !== 'Took' && (!ledger.equals(before.ledger) || !(await readOr(join(run.dir, 'run-state.json'))).equals(before.state)))
    found.push({ refusal: 'wrote' })
  if (observed.outcome === 'Took' && !EDITS.has(message.$) && !ledger.equals(before.ledger)) {
    const replayed = await run.replayed()
    if (!isDeepStrictEqual(replayed, { at: observed.at, spent: observed.spent, resumes: observed.resumes })) found.push({ replayed, observed })
  }
  return found
}

/** Replay one trace on the CLI; every step must end where the model says, and the phase line name what the table maps to an accepted event. Returns the differences. */
async function replayTrace(t, model, trace, checked) {
  const run = await deliveryRun(t)
  const differences = []
  let state = model.init()
  for (const [index, message] of trace.entries()) {
    const before = { state: await readOr(join(run.dir, 'run-state.json')), ledger: await readOr(join(run.dir, 'runs.jsonl')) }
    const plain = toPlain(message)
    const result = await run.perform(plain)
    const code = result.stderr.split(':')[0]
    const observed = { outcome: result.status === 0 ? 'Took' : (WHY[code] ?? `${code} ${result.stderr.slice(0, 300)}`), ...(await observe(run.dir)) }
    const wanted = expectedOf(model, state, message)
    const where = { step: index, event: JSON.stringify(plain), after: trace.slice(0, index).map((entry) => JSON.stringify(toPlain(entry))).join(' ') }
    if (!isDeepStrictEqual(observed, wanted)) differences.push({ ...where, observed, wanted })
    for (const effect of await sideEffects(run, plain, observed, before)) differences.push({ ...where, ...effect })
    if (differences.length > 0) return differences
    state = model.step(state, message)
    const phase = await phaseAfter(run, model, state, checked)
    if (phase) return [{ ...where, ...phase }]
  }
  return differences
}

/** The phase line after a step against the model and the table, and on a state seen first, what oracle-step.mjs would run there. */
async function phaseAfter(run, model, state, checked) {
  const brief = await run.brief()
  const line = brief.status === 0 ? brief.stdout.split('\n')[0] : brief.stderr
  const firstVisit = !checked.has(JSON.stringify(toPlain(state)))
  const phase = phaseLineDifference(model, state, line, checked)
  if (phase || !firstVisit) return phase
  const planned = await stepPlanDifference(run.dir, nextCommandOf(line))
  return planned ? { phaseLine: line, ...planned } : null
}

async function pool(items, size, work) {
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

async function conformance(t) {
  nextEventsCover()
  const bin = await installedBend(t)
  if (!bin) return
  const { exported } = await compileBend({ entry: join(DELIVERY, 'MODEL.bend'), bin })
  const model = loadModel(exported)
  const { reachable, items, traces } = coveringTraces(model)
  assert.equal(reachable, 1335)
  assert.equal(items, ITEMS)
  assert.equal(traces.length, TRACES)
  // every reached state can still reach FAIL; 321 cannot reach a reviewed state: ORACLE_READY or NEEDS_DECISION with
  // production touched (the model has no revert, and VALID_RED and GREEN refuse a touched production), NEEDS_DECISION
  // with both resumes spent, and VALID_RED with test edits and both refreshes spent
  assert.deepEqual(progress(model), { cannotFail: 0, stuck: { AtReady: 118, AtDecision: 183, AtRed: 20 } })
  // the phase line after every step names the model's hint; the table's events for it are checked once per model state
  const checked = new Set()
  const differences = (await pool(traces, 6, (trace) => replayTrace(t, model, trace, checked))).flat()
  assert.deepEqual(differences, [])
  t.diagnostic(`phase line checked against the table on ${checked.size} of 1335 reached model states`)
}

// ---- the review lap: IMPLEMENTED_GREEN to a review verdict, with the round and the class of round-2 findings

const LAP = fileURLToPath(new URL('../../../test-fixtures/review-lap/', import.meta.url))

async function provenLapLaws(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const cells = oracleModel('prove', '--dir', LAP, '--timeout-ms', '300000')
  assert.equal(cells.status, 0, cells.stderr)
  const proven = JSON.parse(cells.stdout)
  assert.equal(proven.status, 'proven', `${proven.stdout}${proven.stderr}`)
  assert.deepEqual(proven.cells, { generated: [{ law: 'round_two_split', cases: 16 }, { law: 'note_proposes', cases: 6 }, { law: 'security_every_round', cases: 6 }], skipped: [], temporaryCopy: true })
  const reach = oracleModel('prove-reach', '--model', join(LAP, 'MODEL.bend'), '--prefix', 'Lap', '--safe', 'safe', '--timeout-ms', '300000')
  assert.equal(reach.status, 0, reach.stderr)
  const reached = JSON.parse(reach.stdout)
  assert.equal(reached.status, 'proven', reach.stdout.slice(0, 2000))
  assert.deepEqual({ domain: reached.domain, reachable: reached.reachable, diameter: reached.diameter }, {
    domain: { states: 3072, events: 14, cells: 43008 },
    reachable: 252,
    diameter: 9,
  })
}

// each error code the review lap reports, by the model's refusal class
const LAP_WHY = {
  REVIEW_PACKET_STATE: 'WrongState',
  REVIEW_RECEIPT_STATE: 'WrongState',
  REVIEW_PACKET_INVALID: 'PacketMissing',
  REVIEW_PACKET_REQUIRED: 'PacketMissing',
  REVIEW_FOLLOWUP_REQUIRED: 'Followup',
  REVIEW_ROUNDS_CLOSED: 'Closed',
  NO_OPEN_HOLDS: 'NoHold',
  TRANSITION_NOT_ALLOWED: 'NotAllowed',
  REVIEW_RUN_STALE: 'Stale',
  REVIEW_RERUN_REQUIRED: 'Rerun',
  REVIEW_PACKET_STALE: 'PacketStale',
  REVIEWER_EVIDENCE_INVALID: 'ReceiptMissing',
  FINDINGS_BLOCKING: 'Blocking',
}
// the verifier refuses a packet made before a passing run on its bytes with the same code as an unreadable packet
const lapWhy = (code, stderr) => (stderr.startsWith('REVIEW_PACKET_INVALID: review packet does not target the implementation worktree') ? 'Unwitnessed' : LAP_WHY[code])
const ROUND = { R0: 0, R1: 1, R2: 2 }
// coverage: the stage, round and every review fact but the run freshness and the noted proposal, the command, its outcome
const lapItem = (s, message, outcome) =>
  `${s.at.$}|${s.round.$}|c:${s.current}|b:${s.bound}|k:${s.blocked}|p:${s.prior}|${JSON.stringify(message)}|${outcome}`
const LAP_ITEMS = 617
const LAP_TRACES = 50

/**
 * One finding of the class a model claim names, which names the wrong implementation the locked tests pass; a note names
 * none. Regression lines come from the hunks of the cited packet's repair diff.
 */
function lapFindings(find, hunks) {
  if (find.$ === 'Clear') return []
  const note = { id: 'F1', row: 'O1', severity: 'medium', classification: 'PRODUCT_DEFECT', finding: 'lap finding', evidence: 'seen in the packet', fix: 'adjust it' }
  if (find.$ === 'Note') return [note]
  const base = { ...note, wrongPasses: 'the delivered product passes every row' }
  const kind = find.kind
  if (kind.$ === 'Previous') return [{ ...base, confirm: { class: 'previous', finding: 'F1' } }]
  if (kind.$ === 'Security') return [{ ...base, severity: kind.backed ? 'high' : 'medium', confirm: { class: 'security', category: 'permission' } }]
  if (kind.$ === 'Plain') return [base]
  const [path, spans] = [...hunks][0] ?? ['src/none.mjs', [[1, 1]]]
  return [{ ...base, confirm: { class: 'regression', path, line: kind.inside ? spans[0][0] : spans[0][1] + 50 } }]
}

/** A Low run driven to IMPLEMENTED_GREEN, and the CLI commands of each lap event on it. */
async function lapRun(t) {
  const fixture = await workspace(t, { risk: 'low', git: true, initialFiles: { 'oracle-red-fixture.test.mjs': RED_TEST } })
  assert.ok(fixture, 'git is required for the repair diff')
  const { root, oracleDirectory: dir } = fixture
  const statePath = join(dir, 'run-state.json')
  const initialState = await readFile(statePath)
  const setup = deliveryCommands({ root, dir, lock: fixture.lock }, { packet: null })
  for (const message of [{ $: 'Exec', pass: false }, { $: 'MarkRed' }, { $: 'EditProd' }, { $: 'Exec', pass: true }, { $: 'MarkGreen' }]) {
    const result = await setup[message.$](message)
    assert.equal(result.status, 0, `${message.$}: ${result.stderr}`)
  }
  const template = JSON.parse(await readFile(join(dir, 'findings.json'), 'utf8'))
  // the packet of the latest round (a repeat on the same bytes keeps it) and the findings bound to it
  const lap = { packet: null, findings: null }
  const counter = { report: 0, edit: 0, packet: 0, task: 0 }
  const latestRun = async () => {
    const lines = (await readOr(join(dir, 'runs.jsonl'))).toString('utf8').split('\n').filter(Boolean)
    return lines.map((line) => JSON.parse(line)).filter((entry) => entry.type === 'run').at(-1).runId
  }
  const commands = {
    Exec: () => {
      counter.report += 1
      const report = join(dir, `lap-report-${counter.report}.ndjson`)
      return runAsync(['exec', '--dir', dir, '--label', 'behavior', '--adapter', 'node-test', '--report', report, '--', process.execPath, '--test', join(root, 'oracle-green-fixture.test.mjs')])
    },
    // a repair adds a file and rewrites the one a regression claim on the latest packet cites, so a repair after round 2
    // always touches its blockers' files (the CLI refuses one that does not; the model leaves that out)
    Edit: async () => {
      counter.edit += 1
      const content = `export const retries = ${counter.edit}\nexport const delay = 0\nexport const limit = 2\n`
      await writeFile(join(root, 'src', `repair-${counter.edit}.mjs`), content)
      const [cited] = [...(lap.packet?.hunks ?? new Map()).keys()]
      if (cited) await writeFile(join(root, cited), content)
      return { status: 0, stdout: '', stderr: '' }
    },
    Packet: async () => {
      counter.packet += 1
      const path = join(dir, `lap-packet-${counter.packet}.json`)
      const result = await runAsync([...strictReviewPacketArgs(dir, path), ...(lap.findings ? ['--findings', lap.findings] : [])])
      if (result.status !== 0) return result
      const bytes = await readFile(path)
      const packet = JSON.parse(bytes.toString('utf8'))
      if (packet.targetRevision !== lap.packet?.revision) {
        lap.packet = { path, revision: packet.targetRevision, sha256: sha256(bytes), hunks: repairHunks(packet.reviewScope.repairDiff) }
        lap.findings = null
      }
      return result
    },
    Attest: async ({ find }) => {
      counter.task += 1
      const path = join(dir, `lap-findings-${counter.task}.json`)
      await writeFile(path, JSON.stringify({ ...template, findings: lapFindings(find, lap.packet?.hunks ?? new Map()) }))
      if (lap.packet) bindReviewDocument(path, lap.packet.sha256, lap.packet.revision)
      const cited = lap.packet ? ['--packet', lap.packet.path, '--revision', lap.packet.revision] : ['--packet', join(dir, 'no-packet.json'), '--revision', 'none']
      const result = await runAsync(['review-receipt', '--dir', dir, ...cited, '--findings', path, '--role', 'code-reviewer', '--reviewer', 'primary-code-reviewer', '--task-id', `lap-${counter.task}`])
      if (result.status === 0) lap.findings = path
      return result
    },
    Review: async ({ to }) => {
      const cited = lap.packet ? ['--packet', lap.packet.path, '--revision', lap.packet.revision] : []
      return runAsync(['transition', '--dir', dir, '--to', to.$ === 'ToVerified' ? 'REVIEW_VERIFIED' : 'PARTIAL_VERIFIED', '--run', await latestRun(),
        '--evidence', join(dir, 'evidence.json'), '--findings', lap.findings ?? join(dir, 'findings.json'), ...cited])
    },
    Stop: () => runAsync(['transition', '--dir', dir, '--to', 'NEEDS_DECISION', '--reason', 'stop here']),
  }
  return {
    dir,
    perform: (message) => commands[message.$](message),
    brief: () => runAsync(['status', '--dir', dir, '--brief']),
    /** status --brief on the run-state.json init wrote: the ledger alone must give back the verdict and its record. */
    async replayedBrief() {
      const current = await readFile(statePath)
      await writeFile(statePath, initialState)
      try {
        return await runAsync(['status', '--dir', dir, '--brief'])
      } finally {
        await writeFile(statePath, current)
      }
    },
  }
}

async function observeLap(directory) {
  const state = JSON.parse(await readFile(join(directory, 'run-state.json'), 'utf8'))
  return { state, at: STATE[state.state], round: state.reviewIterations?.inputs?.snapshot?.round ?? 0 }
}

/**
 * The phase line on a lap state, read once per model state (`phases` keeps them): the NEXT_COMMANDS entry it names
 * and, for a command, the model's first refusal of the events the table gives it.
 */
async function lapPhase(run, model, state, phases) {
  const key = JSON.stringify(toPlain(state))
  if (phases.has(key)) return
  phases.set(key, null)
  const brief = await run.brief()
  const line = brief.status === 0 ? brief.stdout.split('\n')[0] : brief.stderr
  const command = nextCommandOf(line)
  const entry = NEXT_COMMANDS[command]
  const planned = await stepPlanDifference(run.dir, command)
  if (planned) phases.set(key, { command: line, planned })
  else if (!entry || !(entry.marker || entry.lap)) phases.set(key, { command: line })
  else phases.set(key, { command, refused: entry.marker ? null : nextRefusal(model, state, entry.lap(toPlain(state))) })
}

/** Replay one lap trace on the CLI; every step must end where the model says, and an accepted verdict must record what the model says. */
async function replayLap(t, model, trace, phases) {
  const run = await lapRun(t)
  let state = model.init()
  await lapPhase(run, model, state, phases)
  for (const [index, message] of trace.entries()) {
    const before = { state: await readOr(join(run.dir, 'run-state.json')), ledger: await readOr(join(run.dir, 'runs.jsonl')) }
    const plain = toPlain(message)
    const result = await run.perform(plain)
    const code = result.stderr.split(':')[0]
    const { state: recorded, ...observed } = { outcome: result.status === 0 ? 'Took' : (lapWhy(code, result.stderr) ?? `${code} ${result.stderr.slice(0, 300)}`), ...(await observeLap(run.dir)) }
    const outcome = toPlain(model.decide(state, message))
    const s = toPlain(state)
    const after = toPlain(model.step(state, message))
    const wanted = { outcome: outcome.$ === 'Took' ? 'Took' : outcome.why.$, at: after.at.$, round: ROUND[after.round.$] }
    const where = { step: index, event: JSON.stringify(plain), after: trace.slice(0, index).map((entry) => JSON.stringify(toPlain(entry))).join(' ') }
    if (!isDeepStrictEqual(observed, wanted)) return [{ ...where, observed, wanted }]
    if (observed.outcome !== 'Took' && (!(await readOr(join(run.dir, 'runs.jsonl'))).equals(before.ledger) || !(await readOr(join(run.dir, 'run-state.json'))).equals(before.state)))
      return [{ ...where, refusal: 'wrote' }]
    const verdict = await verdictDifference(run, s, plain, observed.outcome === 'Took' ? recorded : null)
    if (verdict) return [{ ...where, ...verdict }]
    state = model.step(state, message)
    await lapPhase(run, model, state, phases)
  }
  return []
}

/** An accepted verdict records the proposals exactly when the model noted one, and an unreviewed repair (with its blockers) exactly on PARTIAL_VERIFIED. */
async function verdictDifference(run, s, plain, recorded) {
  if (!recorded || plain.$ !== 'Review') return null
  const entry = recorded.history.at(-1)
  const partial = plain.to.$ === 'ToPartial'
  const record = { proposals: (entry.proposals?.length ?? 0) > 0, unreviewed: entry.unreviewedRepair != null, blockers: (entry.unreviewedRepair?.blockers?.length ?? 0) > 0 }
  const expected = { proposals: s.noted, unreviewed: partial, blockers: partial && s.blocked }
  if (!isDeepStrictEqual(record, expected)) return { record, expected }
  const brief = await run.replayedBrief()
  const lines = { proposals: /\nimprovement proposals \(not fixed, not blocking\): 1\n/.test(brief.stdout), unreviewed: /\nunreviewed repair after round 2: /.test(brief.stdout) }
  return isDeepStrictEqual(lines, { proposals: s.noted, unreviewed: partial }) ? null : { brief: brief.stdout || brief.stderr }
}

async function lapConformance(t) {
  const bin = await installedBend(t)
  if (!bin) return
  const { exported } = await compileBend({ entry: join(LAP, 'MODEL.bend'), bin })
  const model = loadModel(exported, 'Lap', lapItem)
  const { reachable, items, traces } = coveringTraces(model)
  assert.equal(reachable, 252)
  assert.equal(items, LAP_ITEMS)
  assert.equal(traces.length, LAP_TRACES)
  const phases = new Map()
  const differences = (await pool(traces, 6, (trace) => replayLap(t, model, trace, phases))).flat()
  assert.deepEqual(differences, [])
  // the phase line on every lap state a trace visits: the commands it names, and the model's refusals of their events
  const named = {}
  const refused = {}
  for (const phase of phases.values()) {
    named[phase.command] = (named[phase.command] ?? 0) + 1
    if (phase.refused) refused[`${phase.command} → ${phase.refused}`] = (refused[`${phase.command} → ${phase.refused}`] ?? 0) + 1
  }
  assert.deepEqual(named, { exec: 58, close: 39, report: 37 })
  // Finding: `close` is named where the model refuses it. Blocking: the receipt bound to the current packet blocks,
  // which the ledger does not record (receipts keep the findings digest only), so the line cannot tell; close reports
  // FINDINGS_BLOCKING with its fix in the call that binds the receipt. Unwitnessed and Followup are reached only off
  // the line: a packet made by `review-packet` while the line named `exec` (`close` refuses to write such a packet
  // and refuses one before any receipt), or bytes edited while a round-1 packet waited for its reviewer. In every
  // Unwitnessed state the model has a fresh pass (Stale is refused first); the CLI's way out is `close` with a new
  // packet path on the same bytes, which embeds that pass, while the model keeps a repeated packet's witness.
  assert.deepEqual(refused, { 'close → Review:Blocking': 3, 'close → Review:Unwitnessed': 17, 'close → Packet:Followup': 2 })
}

export const deliveryMachineCases = [
  ['[bend] the delivery laws are proven by the kernel: cells, witnesses, and every law on every reached state', provenLaws],
  ['[bend] the CLI answers every (run state, VALID_RED recorded, command, outcome) the model reaches the way the model does', conformance],
  ['[bend] the review-lap laws are proven by the kernel: round-2 classes, no third round, and every law on every reached state', provenLapLaws],
  ['[bend] the CLI answers every (stage, round, review facts, command, outcome) the review-lap model reaches the way the model does', lapConformance],
]
