import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { APPROVED, FORBIDDING_ROW, PACKAGE_DIR, runNode, template, WORLD_ROW } from './oracle-authoring-machine.cases.mjs'
import { HOST_RECEIPTS_FILE, reviewOutputDigest } from './oracle-fs.mjs'
import { NEXT_LINES, nextCommandOf } from './oracle-next.mjs'
import { bindReviewDocument, workspace } from './oracle-run.cases.mjs'
import { canonicalReviewPoints, selectedDigests } from './oracle-run.mjs'
import { AUTO, AUTO_COMMAND, closeCall, drive, MAX_AUTO_STEPS, nextKey, planStep, privateInputRoot, readPhase, render } from './oracle-step.mjs'
import { installedBend } from './oracle-test-bend.mjs'

// oracle-step.mjs drives the commands the phase line names. These cases check that it runs only the AUTO commands of
// the shared table (oracle-next.mjs), that a refusal, a line seen before, an empty plan and the step cap each stop it,
// that it never guesses which reviewer return or task to bind, and that a real run goes from authoring to the agent's
// turn and closes with the arguments a person would assemble. oracle-stage-machine.test.mjs registers them; the model
// replays check step's plan on every state they reach (stepPlanDifference in oracle-run-machine.cases.mjs).
const STEP = fileURLToPath(new URL('oracle-step.mjs', import.meta.url))
const { NODE_TEST_CONTEXT: _parent, ...CHILD_ENV } = process.env
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** One `next:` command per table entry, as the phase line prints it. */
const SAMPLE_NEXT = {
  red: 'oracle-run.mjs red --dir d --label <label> --evidence <evidence> --row <row> -- <command>',
  green: 'oracle-run.mjs green --dir d --label <label> --evidence <evidence> -- <command>',
  exec: 'oracle-run.mjs exec --dir d --label <label> -- <command>',
  close: 'oracle-run.mjs close --dir d --packet <packet> --decision <implementation-decision.md> --review-point <point> --run r-001 --evidence <evidence> --check-report <report>',
  guide: 'oracle-run.mjs guide --dir d --to IMPLEMENTED_GREEN',
  report: 'oracle-run.mjs close --dir d --check-report <report>',
  step: 'oracle-step.mjs --dir d',
  lock: 'oracle-lock.mjs create --oracle d/oracle.md --lock d/oracle.lock.json --source <approved-source>',
  stop: 'NEEDS_DECISION: the same issues came back after three edits: stop and report them to the user',
  init: 'oracle-run.mjs init --dir d --lock d/oracle.lock.json --scan-root <scan-root> --required-label <repo-check>',
  revise: 'NEEDS_DECISION: the user rewrites the sources, then oracle-step.mjs --dir <new run dir>',
}
const phaseLine = (next, tail = ' · stage DRAFTED 4/5') => `phase 3/6 Card review and lock · next: ${next}${tail}`

async function tableAndAuto(t) {
  const { default: fc } = await import('fast-check')
  const directory = await mkdtemp(join(tmpdir(), 'oracle-step-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  assert.deepEqual(Object.keys(SAMPLE_NEXT).sort(), Object.keys(NEXT_LINES).sort())
  for (const [key, next] of Object.entries(SAMPLE_NEXT)) {
    assert.equal(nextCommandOf(phaseLine(next)), key, next)
    assert.equal(nextCommandOf(phaseLine(next, '')), key, `${next} at the end of the line`)
    assert.equal(Boolean(AUTO_COMMAND[key]), AUTO.has(key), key)
  }
  // every non-AUTO next, and any line that names no entry, is printed: the plan has no calls
  const line = fc.oneof(
    fc.constantFrom(...Object.values(SAMPLE_NEXT)).map((next) => phaseLine(next)),
    fc.string().map((text) => phaseLine(text)),
  )
  await fc.assert(
    fc.asyncProperty(line, async (text) => {
      const key = nextCommandOf(text)
      if (AUTO.has(key)) return
      const plan = await planStep(directory, { kind: 'stage', line: text, key })
      assert.equal(plan.calls, undefined, text)
      assert.equal(typeof plan.say, 'string')
    }),
  )
  // the decision is the user's and an unknown line is shown as printed: neither is told as a command to run
  const revise = await planStep(directory, { kind: 'stage', line: phaseLine(SAMPLE_NEXT.revise), key: 'revise' })
  assert.match(revise.say, /^NEEDS_DECISION, the user decides: /)
  assert.equal(revise.say.includes('<'), false, revise.say)
  const odd = phaseLine('oracle-run.mjs packet.example --dir d <x>')
  const unknown = await planStep(directory, { kind: 'delivery', line: odd, key: nextCommandOf(odd) })
  assert.deepEqual(unknown.shown, [odd])
  assert.match(unknown.say, /^step does not know this next step: read oracle-run\.mjs guide --dir \S+ and do what it names$/)
  // a directory with spaces still names its entry, and printed paths are quoted
  const spaced = join(directory, 'my oracle')
  assert.equal(nextKey(phaseLine(`oracle-run.mjs exec --dir ${spaced} --label <label> -- <command>`), spaced), 'exec')
  const quoted = `'${relative(process.cwd(), spaced)}'`
  assert.ok((await planStep(spaced, { kind: 'stage', line: phaseLine(SAMPLE_NEXT.step), key: 'step' })).say.startsWith(`run oracle-step.mjs --dir ${quoted} `))
}

const line = (n) => `phase 5/6 GREEN · next: oracle-run.mjs exec --dir d${n} --label <label> -- <command> · run r-00${n}`
const call = { script: 'oracle-run.mjs', args: ['exec', '--dir', 'd', '--label', 'behavior', '--', 'x'], label: 'behavior' }

/** A fake command that always answers `result`, and how often it ran. */
function counted(result) {
  let runs = 0
  return {
    run: () => {
      runs += 1
      return result
    },
    count: () => runs,
  }
}

async function loopStops() {
  // a refusal stops the loop after one command: the rest of the plan does not run, and its next: line is the action
  let runs = 0
  const refused = await drive({
    directory: 'd',
    read: () => ({ line: line(1), ledger: [] }),
    plan: () => ({ calls: [call, call] }),
    run: () => {
      runs += 1
      return { status: 1, stdout: '', stderr: 'RUN_NOT_GREEN: r-002 did not pass\nnext: fix the code, then rerun green\n' }
    },
  })
  assert.equal(runs, 1)
  assert.deepEqual(refused.ran, ['oracle-run.mjs exec behavior RUN_NOT_GREEN'])
  assert.equal(refused.refused, true)
  assert.deepEqual(refused.shown, ['REFUSED RUN_NOT_GREEN: r-002 did not pass'])
  assert.equal(refused.say, 'fix the code, then rerun green')

  // a command that succeeds but leaves the phase where it was stops the loop
  const passing = counted({ status: 0, stdout: '', stderr: '' })
  const still = await drive({ directory: 'd', read: () => ({ line: line(1), ledger: [] }), plan: () => ({ calls: [call] }), run: passing.run })
  assert.equal(passing.count(), 1)
  assert.match(still.say, /^the phase did not move after oracle-run\.mjs exec behavior/)

  // a line that comes back (A, B, A) stops at its return, not at the cap
  const swinging = counted({ status: 0, stdout: '', stderr: '' })
  const swung = await drive({ directory: 'd', read: () => ({ line: line(swinging.count() % 2), ledger: [] }), plan: () => ({ calls: [call] }), run: swinging.run })
  assert.equal(swinging.count(), 2)
  assert.match(swung.say, /^the phase came back to a line it had after oracle-run\.mjs exec behavior/)

  // a line that keeps moving stops at the cap
  const moving = counted({ status: 0, stdout: '', stderr: '' })
  const capped = await drive({ directory: 'd', read: () => ({ line: line(moving.count()), ledger: [] }), plan: () => ({ calls: [call] }), run: moving.run })
  assert.equal(moving.count(), MAX_AUTO_STEPS)
  assert.match(capped.say, new RegExp(`^${MAX_AUTO_STEPS} commands ran`))

  // an empty plan runs nothing and says so
  const idle = counted({ status: 0, stdout: '', stderr: '' })
  const empty = await drive({ directory: 'd', read: () => ({ line: line(1), ledger: [] }), plan: () => ({ calls: [] }), run: idle.run })
  assert.equal(idle.count(), 0)
  assert.deepEqual(empty.ran, [])
  assert.match(empty.say, /^step found nothing to run/)

  // FLAKINESS_GATE asks for the same run again: it goes on while each refusal records a run, within the cap
  const flaky = counted({ status: 1, stdout: '', stderr: 'FLAKINESS_GATE: medium risk needs 2\n' })
  const gated = await drive({ directory: 'd', read: () => ({ line: line(1), ledger: Array.from({ length: flaky.count() }) }), plan: () => ({ calls: [call] }), run: flaky.run })
  assert.equal(flaky.count(), MAX_AUTO_STEPS)
  assert.match(gated.say, /commands ran/)
  // the commands step ran are one line: eight runs, the phase, a refusal and the instruction stay within a dozen lines
  assert.equal(render({ ...gated, shown: ['a', 'b', 'c'] }).split('\n').length, 6)
}

const CLEAR = {
  schemaVersion: 2, reviewer: 'code-reviewer', reviewerRole: 'code-reviewer', reviewerId: 'primary-code-reviewer',
  changeabilityReview: ['Readability', 'Predictability', 'Cohesion', 'Coupling', 'Simplicity'].map((axis) => ({ axis, status: 'PASS', evidence: 'review packet' })),
  findings: [],
}
const BLOCKING = { ...CLEAR, findings: [{ severity: 'high', title: 'double submit', evidence: 'src/save.mjs:1' }] }
const REV = 'a'.repeat(64)
const OLD = 'b'.repeat(64)

/**
 * An oracle directory at IMPLEMENTED_GREEN as close sees it — the packet for REV written in round `round` (started at
 * 10:00), the reviewer returns saved, the host receipts given — and the phase step reads there.
 */
async function closeFixture(t, { risk = 'low', returns = [], receipts = [], ledger = [], decision = 'the repair\n', packets = [REV] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'oracle-step-close-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'implementation-decision.md'), decision)
  for (const [index, rev] of packets.entries()) {
    const packet = { schemaVersion: 2, reviewScope: { round: index + 1 }, targetSnapshot: { worktreeSha256: rev }, implementationDecision: { sha256: sha256(decision) } }
    await writeFile(join(dir, `packet-${index + 1}.json`), JSON.stringify(packet))
  }
  const packetSha = sha256(await readFile(join(dir, `packet-${packets.length}.json`)))
  for (const [index, document] of returns.entries()) await writeFile(join(dir, `return-${index + 1}.json`), JSON.stringify({ ...document, packetSha256: packetSha, targetRevision: REV }))
  const host = receipts.map(([agentId, document, at]) => `${JSON.stringify({ agentId, ...reviewOutputDigest(document), at })}\n`).join('')
  if (receipts.length > 0) await writeFile(join(dir, HOST_RECEIPTS_FILE), host)
  const phase = {
    kind: 'delivery', key: 'close', line: phaseLine(SAMPLE_NEXT.close),
    state: { risk, history: [] },
    ledger: [...ledger, { type: 'review-round', targetRevision: REV, at: '2026-11-02T10:00:00.000Z' }],
    status: { currentState: 'IMPLEMENTED_GREEN', currentSnapshot: { worktreeSha256: REV }, nextActions: [{ to: 'REVIEW_VERIFIED', candidateRuns: ['r-009'], requires: [], blockers: [] }] },
  }
  return { dir, phase, returnPath: (n) => join(dir, `return-${n}.json`) }
}
const flagValue = (args, flag) => args[args.indexOf(flag) + 1]

async function hostReceipts(t) {
  // High risk, round 2: round 1 bound A (clear) and B; C and D both return clear, so all three clear receipts share a
  // digest. A is bound and older than the round; C and D cannot be told apart, so step names them and picks neither.
  const earlier = '2026-11-02T09:00:00.000Z'
  const later = '2026-11-02T10:30:00.000Z'
  const round2 = await closeFixture(t, {
    risk: 'high', returns: [CLEAR, CLEAR],
    receipts: [['A', CLEAR, earlier], ['B', BLOCKING, earlier], ['C', CLEAR, later], ['D', CLEAR, later]],
    ledger: [{ type: 'review-round', targetRevision: OLD, at: '2026-11-02T08:00:00.000Z' }, { type: 'review-receipt', taskId: 'A' }, { type: 'review-receipt', taskId: 'B' }],
  })
  const ambiguous = await closeCall(round2.dir, round2.phase)
  assert.equal(ambiguous.calls, undefined)
  assert.match(ambiguous.say, /equals the returns of C, D, which the host cannot tell apart: rerun .* --task-id <the task that returned this file>$/)
  const named = await closeCall(round2.dir, round2.phase, { taskId: 'C', intersectTaskId: 'D' })
  assert.deepEqual([flagValue(named.calls[0].args, '--task-id'), flagValue(named.calls[0].args, '--intersect-task-id')], ['C', 'D'])
  // naming only the first leaves one candidate for the second
  const half = await closeCall(round2.dir, round2.phase, { taskId: 'D' })
  assert.deepEqual([flagValue(half.calls[0].args, '--task-id'), flagValue(half.calls[0].args, '--intersect-task-id')], ['D', 'C'])

  // Low risk: an old matching receipt comes first in the file, but only the one after the round's start is this return's
  const low = await closeFixture(t, { returns: [CLEAR], receipts: [['A', CLEAR, earlier], ['C', CLEAR, later]] })
  assert.equal(flagValue((await closeCall(low.dir, low.phase)).calls[0].args, '--task-id'), 'C')
  // the task the agent names wins over the receipts
  assert.equal(flagValue((await closeCall(low.dir, low.phase, { taskId: 'X' })).calls[0].args, '--task-id'), 'X')
}

async function returnCounts(t) {
  // more returns answer the packet than the risk needs: step lists them all and binds none
  const many = await closeFixture(t, { returns: [CLEAR, BLOCKING, CLEAR] })
  const listed = await closeCall(many.dir, many.phase, {})
  assert.equal(listed.calls, undefined)
  assert.match(listed.say, /^3 saved reviewer returns answer the review and close takes 1: /)
  for (const n of [1, 2, 3]) assert.ok(listed.say.includes(relative(process.cwd(), many.returnPath(n))), listed.say)
  // the agent names the one to bind
  const picked = await closeCall(many.dir, many.phase, { findings: many.returnPath(2), taskId: 'review-2' })
  assert.equal(flagValue(picked.calls[0].args, '--findings'), many.returnPath(2))
  assert.equal(picked.calls[0].args.includes('--intersect'), false)
  // High risk with one of two saved: step names the other's path and does not run close with one
  const few = await closeFixture(t, { risk: 'high', returns: [CLEAR] })
  assert.match((await closeCall(few.dir, few.phase, { taskId: 'review-1' })).say, /^1 of 2 reviewer returns are saved: .*save the other reviewer's return unchanged as \S*intersect-a{12}\.json/)
}

async function staleDecision(t) {
  // round 1 reviewed OLD; the repair moved the bytes to REV, whose packet is not written yet
  const repaired = await closeFixture(t, { packets: [OLD], decision: 'first try\n' })
  repaired.phase.ledger = [{ type: 'review-round', targetRevision: OLD, at: '2026-11-02T10:00:00.000Z' }]
  const asked = await closeCall(repaired.dir, repaired.phase)
  assert.equal(asked.calls, undefined)
  assert.match(asked.say, /^the code changed since the last review round and \S+implementation-decision\.md is the one that round read: update it/)
  await writeFile(join(repaired.dir, 'implementation-decision.md'), 'first try\nthe repair: one request in flight\n')
  const next = await closeCall(repaired.dir, repaired.phase)
  assert.equal(next.calls.length, 1)
  assert.equal(flagValue(next.calls[0].args, '--packet'), join(repaired.dir, `packet-${REV.slice(0, 12)}.json`))
}

async function unwitnessedPacket(t) {
  // the CLI refuses a packet made before a passing run: its remedy is the same close with a new --packet path, which
  // step prints (it sends the review out again) and does not run
  const { dir, phase } = await closeFixture(t)
  const plan = await closeCall(dir, phase, { taskId: 'x' })
  const packet = join(dir, 'packet-1.json')
  assert.equal(flagValue(plan.calls[0].args, '--packet'), packet)
  const close = counted({ status: 1, stdout: '', stderr: `REVIEW_PACKET_INVALID: ${packet} was made before a passing run on its bytes\nnext: after \`exec\` on the current bytes, rerun the same close with a new --packet path\n` })
  const stopped = await drive({ directory: dir, read: () => phase, plan: () => plan, run: close.run })
  assert.equal(close.count(), 1)
  assert.equal(stopped.refused, true)
  const fresh = join(dir, `packet-${REV.slice(0, 12)}-2.json`)
  const human = ['oracle-run.mjs', ...plan.calls[0].args.map((arg) => (arg === packet ? fresh : arg)).map((arg) => (arg.startsWith('/') ? relative(process.cwd(), arg) : arg))].join(' ')
  assert.equal(stopped.say, `after an exec on the current bytes if none passed since the last edit, run ${human}`)
}

async function failedGreenBytes(t) {
  // a GREEN that failed on these production and test bytes is not run again until production changes
  const dir = await mkdtemp(join(tmpdir(), 'oracle-step-green-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  // the harness digests are per-file maps, built as the ledger and the status build them: a fresh object each time
  const harness = ['save.test.mjs']
  const digests = (test) => selectedDigests({ 'save.test.mjs': test, 'src/save.mjs': 'ignored' }, harness)
  const run = (runId, productionSha256) => ({ type: 'run', runId, label: 'behavior', command: [process.execPath, '--test', 'x'], adapter: 'node-test', exitCode: 1, grade: 'reported', productionSha256, harnessSha256: digests('t1') })
  const phase = (production, test) => ({
    kind: 'delivery', key: 'green', line: phaseLine(SAMPLE_NEXT.green),
    state: { risk: 'low', requiredLabels: ['behavior'], harnessPaths: harness, history: [{ state: 'VALID_RED', runId: 'r-001' }] },
    ledger: [run('r-001', 'p0'), run('r-002', 'p1')],
    status: { currentSnapshot: { productionSha256: production, harnessSha256: digests(test) }, staleOrMissingRuns: [], nextActions: [] },
  })
  assert.match((await planStep(dir, phase('p1', 't1'))).say, /^r-002 failed on these bytes: edit production so the RED tests pass, then rerun /)
  // a production edit or a test edit after the failed GREEN is new bytes: GREEN runs
  for (const [production, test] of [['p2', 't1'], ['p1', 't2']]) {
    const edited = await planStep(dir, phase(production, test))
    assert.deepEqual(edited.calls?.map((item) => item.args[0]), ['green'], `${production} ${test}`)
  }
}

const LOCKED = 'c'.repeat(64)

/** An ORACLE_READY phase as planRed reads it: `labels` required, an evidence map written, nothing run yet. */
async function readyFixture(t, labels) {
  const dir = await mkdtemp(join(tmpdir(), 'oracle-step-ready-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'evidence.json'), JSON.stringify({ schemaVersion: 1, rows: { O1: { kind: 'test', name: 'save > pending' } } }))
  const phase = {
    kind: 'delivery', key: 'red', line: phaseLine(SAMPLE_NEXT.red),
    state: { state: 'ORACLE_READY', risk: 'low', requiredLabels: labels, lockSha256: LOCKED, history: [] },
    ledger: [],
    status: { staleOrMissingRuns: [], nextActions: [{ to: 'VALID_RED', requires: ['--evidence', '--row'], candidateRuns: [], blockers: [] }] },
  }
  return { dir, phase }
}
const NODE_TEST = ['node', '--test', 'save.test.mjs']

async function preRedReview(t) {
  // a Formal run (its card derived bend-proof/bend-adequacy labels) does not run its first RED before the adapter-pre-red
  // review: step prints the dispatch and the journal record it waits for, and runs nothing
  const formal = await readyFixture(t, ['repo-test', 'bend-proof:reported', 'bend-adequacy:reported', 'fast-check:reported'])
  const given = { label: 'fast-check:reported', command: NODE_TEST }
  const waiting = await planStep(formal.dir, formal.phase, given)
  assert.equal(waiting.calls, undefined)
  assert.match(waiting.say, /^before the first RED, dispatch \$oracle-review in adapter-pre-red mode in a fresh context/)
  assert.ok(waiting.say.includes(`lock sha256:${LOCKED}`), waiting.say)
  assert.match(waiting.say, /--label fast-check:reported -- node --test save\.test\.mjs$/)
  // a journal line for another lock, or one that does not name the mode, is not the record
  await writeFile(join(formal.dir, 'journal.md'), `- adapter-pre-red: no findings, lock sha256:${'d'.repeat(64)}\n- review of lock sha256:${LOCKED}\n`)
  assert.equal((await planStep(formal.dir, formal.phase, given)).calls, undefined)
  await writeFile(join(formal.dir, 'journal.md'), `- adapter-pre-red: no findings, lock sha256:${LOCKED}, adapter sha256:e1\n`)
  const red = await planStep(formal.dir, formal.phase, given)
  assert.deepEqual(red.calls.map((item) => item.args[0]), ['red'])
  // a refreshed RED after VALID_RED and a run without a Formal adapter are not held
  const refresh = await planStep(formal.dir, { ...formal.phase, state: { ...formal.phase.state, state: 'VALID_RED' } }, given)
  assert.deepEqual(refresh.calls.map((item) => item.args[0]), ['red'])
  const plain = await readyFixture(t, ['behavior'])
  assert.deepEqual((await planStep(plain.dir, plain.phase, { label: 'behavior', command: NODE_TEST })).calls.map((item) => item.args[0]), ['red'])
}

async function reportedLabels(t) {
  // a bare label is graded on a reported run: `npm test` under it would pass exit-only and GREEN would refuse it, so step
  // says which command it needs and runs nothing; a `:exit` label takes the same command
  const { dir, phase } = await readyFixture(t, ['behavior', 'repo-test', 'repo-test:exit'])
  for (const label of ['behavior', 'repo-test']) {
    const plan = await planStep(dir, phase, { label, command: ['npm', 'test'] })
    assert.equal(plan.calls, undefined, label)
    assert.match(plan.say, new RegExp(`^${label} is graded on a reported run and \`npm test\` reports no test results to the oracle: rerun .* --label ${label} -- <node --test`))
  }
  const exit = {
    ...phase,
    key: 'exec',
    state: { ...phase.state, state: 'IMPLEMENTED_GREEN', history: [], requiredLabels: ['repo-test:exit'] },
    ledger: [{ type: 'run', runId: 'r-001', label: 'repo-test:exit', command: ['npm', 'test'], adapter: null, exitCode: 1, grade: 'exit-only' }],
    status: { ...phase.status, nextActions: [] },
  }
  const plan = await planStep(dir, exit)
  assert.deepEqual(plan.calls.map((item) => [item.args[0], item.label]), [['exec', 'repo-test:exit']])
  // a `:exit` label given a command a trusted adapter would report runs without the adapter: a reported run of it is
  // refused REQUIRED_LABEL_GRADE, exit-only is its grade
  for (const command of [NODE_TEST, ['npx', 'vitest', 'run']]) {
    const [call] = (await planStep(dir, exit, { label: 'repo-test:exit', command })).calls
    assert.ok(!call.args.includes('--adapter') && !call.args.includes('--report'), call.args.join(' '))
  }
  // a ledger run of a bare label that no adapter reported is not run again either
  exit.ledger = [{ ...exit.ledger[0], label: 'repo-test', grade: 'exit-only', exitCode: 0 }]
  exit.state.requiredLabels = ['repo-test']
  assert.match((await planStep(dir, exit)).say, /^repo-test is graded on a reported run and `npm test` reports/)
}

async function initLabel(t) {
  // init names the repository test label with the grade its command can give: node --test and vitest run report, any
  // other script passes on its exit code alone
  const root = await mkdtemp(join(tmpdir(), 'oracle-step-init-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = join(root, '.ai', 'oracles', 'save')
  await mkdir(dir, { recursive: true })
  const phase = { kind: 'stage', line: phaseLine(SAMPLE_NEXT.init), key: 'init' }
  const cases = [
    ['node --test src/', /--required-label repo-test \(repo-test: a reported run: give step `node --test <test files>`/],
    ['vitest', /--required-label repo-test \(repo-test: a reported run: give step `npx vitest run`/],
    ['react-scripts test', /--required-label repo-test:exit \(repo-test:exit: `react-scripts test` reports no test results/],
  ]
  for (const [script, wanted] of cases) {
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: script } }))
    assert.match((await planStep(dir, phase)).say, wanted, script)
  }
}

async function blindAndMutation(t) {
  // a saved blind mapping is bound with the one task the host recorded for it; High risk's mutation flags are printed
  const mapping = { O1: ['save > pending'] }
  const { dir, phase } = await closeFixture(t, { returns: [CLEAR], receipts: [['C', CLEAR, '2026-11-02T10:30:00.000Z'], ['M', mapping, '2026-11-02T10:31:00.000Z']] })
  await writeFile(join(dir, `blind-map-${REV.slice(0, 12)}.json`), JSON.stringify(mapping))
  const plan = await closeCall(dir, phase)
  assert.deepEqual(plan.calls[0].args.slice(-6), ['--blind-map', join(dir, `blind-map-${REV.slice(0, 12)}.json`), '--blind-reviewer', 'blind-mapper', '--blind-task-id', 'M'])
  phase.status.nextActions[0].requires = ['--mutation-run']
  const high = await closeCall(dir, phase)
  assert.equal(high.calls, undefined)
  assert.match(high.say, /^High risk: record a mutation run .* then run oracle-run\.mjs close --dir .* --blind-task-id M --mutation-run <mutation-run>$/)
}

function step(cwd, args) {
  return spawnSync(process.execPath, [STEP, ...args], { cwd, encoding: 'utf8', env: CHILD_ENV, maxBuffer: 1 << 26 })
}
/** The answer's shape: at most a dozen lines, the instruction last and only once. */
function answer(result) {
  const lines = result.stdout.trimEnd().split('\n')
  assert.ok(lines.length <= 12, result.stdout)
  assert.equal(lines.filter((text) => text.startsWith('NEXT FOR YOU: ')).length, 1, result.stdout)
  assert.ok(lines.at(-1).startsWith('NEXT FOR YOU: '), result.stdout)
  return lines
}

// ---- authoring: the stale-search package and its approved card (oracle-authoring-machine.cases.mjs template), driven
// through oracle-step.mjs as the agent would, with receipts of each test only

const LOCK_SOURCES = (pkg) => pkg.sources.map((source) => /^repo:([^#]+)/.exec(source.location)?.[1]).filter(Boolean)
const RETURN = /saved unchanged as (\S+?\.(?:md|json))\b/g
const savedText = (path) => (path.endsWith('.json') ? '{"candidates": []}\n' : '# review\n\nno findings\n')
const NO_ROUNDS = { 'model-analyst': 0, translation: 0, 'cold-read': 0, 'reverse-impossible': 0, 'source-aware': 0 }
// the source-aware review is named with its condition until a return is saved for it
const OFFER = /when card\/policy-sources\.md's trigger applies, a source-aware review — .*; save its return unchanged as (\S+);/
/** A second round of a review kind: it continues the first reviewer, whose return it names, with the repair diff. */
const confirmFixes = (kind) =>
  `${kind} round 2 \\(confirm-fixes\\) — continue the round-1 reviewer with only its finding IDs \\(\\.ai/oracles/stale-search/reviews/${kind}-[0-9a-f]{12}\\.(?:md|json)\\) and the repair diff, its return saved unchanged as \\S+`
const PENDING_APPROVAL = '- Status: pending\n- Source: none yet'

/** The template in a folder of this test, and receipts of this test only. */
async function authoringFixture(t, name) {
  const root = await mkdtemp(join(tmpdir(), `oracle-step-${name}-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const fixture = await template(root)
  const env = { ...CHILD_ENV, ORACLE_LINT_CACHE: join(root, 'receipts') }
  await mkdir(env.ORACLE_LINT_CACHE)
  return { ...fixture, root, env }
}

/** A copy of the template repository, and the commands an agent runs in it. */
async function authoringRepo(fixture, name = 'repo') {
  const repo = join(fixture.root, name)
  await cp(fixture.base, repo, { recursive: true })
  const dir = join(repo, PACKAGE_DIR)
  const run = (script, args) => runNode(repo, script, args, fixture.env)
  return {
    repo,
    dir,
    run,
    file: (file) => join(dir, file),
    step: (...args) => run('oracle-step.mjs', ['--dir', PACKAGE_DIR, ...args]),
    status: async () => JSON.parse((await run('oracle-stage.mjs', ['status', '--dir', PACKAGE_DIR])).stdout),
    brief: async () => (await run('oracle-stage.mjs', ['status', '--brief', '--dir', PACKAGE_DIR])).stdout.trim(),
    // the lock step printed, run as printed
    lock: (say) => run('oracle-lock.mjs', say.slice(say.indexOf('oracle-lock.mjs create ') + 'oracle-lock.mjs '.length).split(' ')),
    // every return the output asks for, saved where it says
    save: async (stdout, text = savedText) => {
      for (const [, path] of stdout.matchAll(RETURN)) await writeFile(join(repo, path), text(path))
    },
  }
}

/** The card with hand-written lines between its generated region and the User Confirmation. */
function withHandWritten(card, lines) {
  const at = card.indexOf('\n## User Confirmation')
  return `${card.slice(0, at)}\n\n${lines}\n${card.slice(at)}`
}
const SWEEP = '## Interaction sweep\n\nno pairs yet\n'

async function authoringToLock(t) {
  if (!(await installedBend(t))) return
  const fixture = await authoringFixture(t, 'authoring')
  const at = await authoringRepo(fixture)
  // from no stage record every node passes: step asks for the three reviews at once, writes their inputs outside the
  // repository and names where each return is saved
  const first = await at.step()
  assert.equal(first.status, 0, first.stderr)
  const lines = answer(first)
  assert.deepEqual(lines.slice(0, 2), ['ran: package ok; model ok; card ok', 'phase 3/6 Card review and lock'])
  assert.match(lines.at(-1), /^NEXT FOR YOU: dispatch \(1\) the model analyst — .*\(2\) cold-read — .*\(3\) reverse-impossible — .*; repair what they find, then rerun oracle-step\.mjs --dir \.ai\/oracles\/stale-search$/)
  const inputs = [...lines.at(-1).matchAll(/with only (\S+)/g)].map((match) => match[1])
  assert.equal(inputs.length, 3, lines.at(-1))
  assert.ok(inputs.every((path) => !path.startsWith(at.repo) && !path.startsWith('.ai/')), lines.at(-1))
  await at.save(first.stdout)

  // the returns saved: the lock comes last, after the source-aware review when its trigger applies, the touched-file
  // lint and the approval; the package's own file is one of the sources, once
  const ready = answer(await at.step()).at(-1)
  assert.match(ready, OFFER)
  const order = ['(1) when card/policy-sources.md', '(2) oracle-verify.mjs card --oracle', '--path', '(3) show the user', '(4) oracle-lock.mjs create']
  const found = order.map((text) => ready.indexOf(text))
  assert.ok(found.every((index, n) => index > (found[n - 1] ?? -1)), ready)
  assert.equal(ready.split('--source .ai/oracles/stale-search/oracle.package.json').length, 2, ready)
  assert.deepEqual((await at.status()).reviews, { ...NO_ROUNDS, 'model-analyst': 1, 'cold-read': 1, 'reverse-impossible': 1 })

  // an issue only a hand-written section raises is fixed in oracle.md outside the markers: no package patch, nothing
  // asked again of the analyst, whose input the card does not feed
  const card = await readFile(at.file('oracle.md'), 'utf8')
  await writeFile(at.file('oracle.md'), withHandWritten(card, SWEEP))
  const swept = await at.step()
  assert.equal(swept.status, 1, swept.stdout)
  const sweptLines = answer(swept)
  assert.match(sweptLines[0], /^ran: package ok; model ok; card \d+ issues$/)
  assert.match(sweptLines.at(-1), /^NEXT FOR YOU: fix in \.ai\/oracles\/stale-search\/oracle\.md outside the generated markers: 1\) sweep-rows: Interaction sweep must include a Pair\/Disposition table; 2\) sweep-policy-missing: P1 .*; then rerun oracle-step\.mjs/)
  assert.ok(!/package|dispatch/.test(sweptLines.at(-1)), sweptLines.at(-1))

  // the card as it was: the saved returns answer it again, and the lock step printed is taken
  await writeFile(at.file('oracle.md'), card)
  const again = answer(await at.step()).at(-1)
  assert.equal(again, ready)
  const locked = await at.lock(again)
  assert.equal(locked.status, 0, locked.stderr)
  assert.equal((await at.status()).stage, 'ORACLE_READY')
  // the lock pins the model inputs, not the proof: a PROOF.bend edit after the lock is no drift
  const proof = join(at.repo, 'PROOF.bend')
  await writeFile(proof, `${await readFile(proof, 'utf8')}\n# edited after the lock\n`)
  assert.equal((await at.status()).current, true)
  // locked: step goes on to the Delivery run, and --check has no authoring graph left to read
  assert.match(answer(await at.step()).at(-1), /^NEXT FOR YOU: start the Delivery run: oracle-run\.mjs init --dir \.ai\/oracles\/stale-search /)
  const check = await at.step('--check')
  assert.equal(check.status, 2)
  assert.match(check.stderr, /--check reads the authoring graph: this oracle is locked/)
}

async function handWrittenLines(t) {
  if (!(await installedBend(t))) return
  // a rule a hand-written card line satisfies (a sourced N/A for the auto test cases) is satisfied there: step names both
  // places, and the line written outside the generated markers survives the next projection
  const fixture = await authoringFixture(t, 'handwritten')
  const at = await authoringRepo(fixture)
  await writeFile(at.file('oracle.package.json'), `${JSON.stringify({ ...fixture.package, notApplicable: [] }, null, 2)}\n`)
  const without = await at.step()
  assert.equal(without.status, 1, without.stdout)
  assert.match(answer(without).at(-1), /^NEXT FOR YOU: dispatch the model analyst — .*; and fix all \d+ in the package \(step projects the card again\), or where the rule takes a hand-written line in oracle\.md outside the generated markers: 1\) missing-auto-tc: /)
  const sourced = '## Outside the policy\n\n- N/A: loading, error, retry, duplicate, empty, cancel and out-of-order are outside this policy (source: S1)\n'
  await writeFile(at.file('oracle.md'), withHandWritten(await readFile(at.file('oracle.md'), 'utf8'), sourced))
  const settled = await at.step()
  assert.equal(settled.status, 0, settled.stdout)
  assert.equal(answer(settled)[0], 'ran: package ok; model ok; card ok')
  assert.ok((await readFile(at.file('oracle.md'), 'utf8')).includes(sourced))
}

async function bClassIncidents(t) {
  if (!(await installedBend(t))) return
  // what cost a registration, a round or a rewind in the 0.126 runs, replayed through step: none costs anything now
  const fixture = await authoringFixture(t, 'incidents')
  const at = await authoringRepo(fixture)
  const rounds = async () => (await at.status()).reviews
  const first = await at.step()
  // a review input built by step or by hand (a preview) registers nothing, and asking again asks the same
  const record = await readFile(at.file('stage.json'))
  for (const name of ['preview-1.md', 'preview-2.md']) {
    const built = await at.run('oracle-adequacy.mjs', ['model-input', '--package', join(PACKAGE_DIR, 'oracle.package.json'), '--output', join(fixture.root, name)])
    assert.equal(built.status, 0, built.stderr)
  }
  assert.deepEqual(await readFile(at.file('stage.json')), record)
  assert.equal((await at.step()).stdout, first.stdout)
  assert.deepEqual(await rounds(), NO_ROUNDS)
  // a return saved again for the same input (a retry, another attempt) adds no round
  await at.save(first.stdout)
  await at.step()
  await at.save(first.stdout, (path) => (path.endsWith('.json') ? '{"candidates": [], "attempt": 2}\n' : '# review\n\nno findings, second attempt\n'))
  await at.step()
  const once = { ...NO_ROUNDS, 'model-analyst': 1, 'cold-read': 1, 'reverse-impossible': 1 }
  assert.deepEqual(await rounds(), once)
  // a Bend source edit (S4, World.bend) moves the card's projection, not the analyst's input: the analyst is not asked
  // again, and the card reviews' second round confirms the first one's fixes
  const world = join(at.repo, 'World.bend')
  const edited = `${fixture.world}# S4 edited\n`
  await writeFile(world, edited)
  const asked = answer(await at.step()).at(-1)
  assert.match(asked, new RegExp(`^NEXT FOR YOU: dispatch \\(1\\) ${confirmFixes('cold-read')} \\(2\\) ${confirmFixes('reverse-impossible')}; `))
  assert.ok(!asked.includes('model analyst'), asked)
  // an edit after DRAFTED that breaks the model, then its fix: the label follows the files, nothing is rewound or spent
  await writeFile(world, edited.replace(WORLD_ROW, FORBIDDING_ROW))
  const broken = await at.step()
  assert.equal(broken.status, 1, broken.stdout)
  assert.match(answer(broken)[0], /^ran: package ok; model \d+ issues?$/)
  assert.equal((await at.status()).stage, 'MODELED')
  await writeFile(world, edited)
  const fixed = await at.step()
  assert.equal(fixed.status, 0, fixed.stdout)
  const after = await at.status()
  assert.deepEqual([after.stage, after.sameIssues, after.reviews], ['DRAFTED', 0, once])
  const kept = JSON.parse(await readFile(at.file('stage.json'), 'utf8'))
  assert.deepEqual(['stage', 'iterations', 'rewinds', 'rewindAllowance'].filter((field) => field in kept), [])
}

/** The issues a refused lock names: the node lines of STAGE_GATE, or the card lint's indented lines. */
function lockIssues(stderr) {
  const head = 'STAGE_GATE: the lock judged the current files: '
  const at = stderr.indexOf(head)
  if (at !== -1) return stderr.slice(at + head.length, stderr.indexOf(' — run oracle-step.mjs', at)).split(' · ')
  return stderr.split('\n').filter((line) => line.startsWith('  ')).map((line) => line.trim())
}

/** Each file of the oracle directory and its digest. */
async function snapshot(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return Promise.all(entries.map(async (entry) => [entry.name, entry.isFile() ? sha256(await readFile(join(directory, entry.name))) : 'folder']))
}

async function checkParity(t) {
  if (!(await installedBend(t))) return
  // --check fails exactly when the lock refuses the same files, names every issue the lock names, and changes nothing in
  // the oracle directory
  const fixture = await authoringFixture(t, 'parity')
  const world = (at, text) => writeFile(join(at.repo, 'World.bend'), text)
  const pkg = (at, change) => writeFile(at.file('oracle.package.json'), `${JSON.stringify(change(structuredClone(fixture.package)), null, 2)}\n`)
  const hazards = (value) => {
    value.hazards['display-vs-commit'] = 'modeled: notAField'
    value.hazards['carry-over'] = 'modeled: ghost'
    return value
  }
  const states = {
    clean: async () => {},
    'stale projection': (at) => world(at, `${fixture.world}# edited\n`),
    'broken model': (at) => world(at, fixture.world.replace(WORLD_ROW, FORBIDDING_ROW)),
    'hand-written sweep': (at) => writeFile(at.file('oracle.md'), withHandWritten(fixture.card, SWEEP)),
    'pending approval': (at) => writeFile(at.file('oracle.md'), fixture.card.replace(APPROVED, PENDING_APPROVAL)),
    hazards: (at) => pkg(at, hazards),
    'broken package': async (at) => {
      await pkg(at, (value) => ({ ...value, intent: { ...value.intent, risk: 'Unknown' } }))
      await world(at, `${fixture.world}# edited\n`)
      await writeFile(at.file('oracle.md'), withHandWritten(fixture.card, SWEEP))
    },
  }
  const lockArgs = ['create', '--oracle', join(PACKAGE_DIR, 'oracle.md'), '--lock', join(PACKAGE_DIR, 'oracle.lock.json'), ...LOCK_SOURCES(fixture.package).flatMap((path) => ['--source', path])]
  const results = await Promise.all(Object.entries(states).map(async ([name, change], index) => {
    const at = await authoringRepo(fixture, `state-${index}`)
    await change(at)
    const before = await snapshot(at.dir)
    const check = await at.step('--check')
    assert.deepEqual(await snapshot(at.dir), before, `${name}: --check wrote`)
    const lock = await at.run('oracle-lock.mjs', lockArgs)
    assert.equal(check.status === 0, lock.status === 0, `${name}:\n${check.stdout}\n${lock.stderr}`)
    for (const issue of lockIssues(lock.stderr)) assert.ok(check.stdout.includes(issue), `${name}: --check does not name ${issue}\n${check.stdout}`)
    return [name, lock.status === 0]
  }))
  // every state but the clean one is refused, so each one compared an issue list
  assert.deepEqual(results.filter(([, accepted]) => accepted).map(([name]) => name), ['clean'])
}

async function stopOnThird(t) {
  if (!(await installedBend(t))) return
  // the same issue list on a third distinct file state stops step with the user's decision and asks for no review; the
  // second does not stop, a step again on the same files adds no state, and a fix starts over
  const fixture = await authoringFixture(t, 'stop')
  const at = await authoringRepo(fixture)
  const edit = (n) => writeFile(at.file('oracle.md'), withHandWritten(fixture.card, `<!-- edit ${n} -->\n\n${SWEEP}`))
  for (const n of [1, 2]) {
    await edit(n)
    for (let again = 0; again < 2; again += 1) {
      const result = await at.step()
      assert.equal(result.status, 1, result.stdout)
      assert.match(answer(result).at(-1), /^NEXT FOR YOU: dispatch the model analyst — .*; and fix in \S+oracle\.md outside the generated markers: 1\) sweep-rows: /)
      assert.equal((await at.status()).sameIssues, n)
    }
  }
  await edit(3)
  const stopped = await at.step()
  assert.equal(stopped.status, 1, stopped.stdout)
  const next = answer(stopped).at(-1)
  assert.match(next, /^NEXT FOR YOU: NEEDS_DECISION: the same issues came back after three edits: stop and report them to the user: 1\) sweep-rows: /)
  assert.ok(!next.includes('dispatch'), next)
  assert.equal(nextCommandOf(await at.brief()), 'stop')
  await writeFile(at.file('oracle.md'), fixture.card)
  const fixed = await at.step()
  assert.equal(fixed.status, 0, fixed.stdout)
  assert.equal((await at.status()).sameIssues, 0)
}

async function noThirdRound(t) {
  if (!(await installedBend(t))) return
  // a review kind runs at most two rounds, the second confirming the first one's fixes: the source-aware review is named
  // with its condition until its first return is saved, then counted like the card reviews; after returns saved for two
  // card versions, a third version goes to the lock without asking for any of them again, and the lock takes it
  const fixture = await authoringFixture(t, 'rounds')
  const at = await authoringRepo(fixture)
  const note = (n) => writeFile(at.file('oracle.md'), withHandWritten(fixture.card, `<!-- edit ${n} -->`))
  await at.save((await at.step()).stdout)
  const offered = OFFER.exec(answer(await at.step()).at(-1))
  assert.ok(offered)
  await writeFile(join(at.repo, offered[1]), savedText(offered[1]))
  const opened = answer(await at.step()).at(-1)
  assert.match(opened, /every check passes; in order: \(1\) oracle-verify\.mjs card /)
  assert.ok(!opened.includes('source-aware'), opened)
  await note(1)
  const second = await at.step()
  const kinds = ['cold-read', 'reverse-impossible', 'source-aware'].map((kind, index) => `\\(${index + 1}\\) ${confirmFixes(kind)}`)
  assert.match(answer(second).at(-1), new RegExp(`^NEXT FOR YOU: dispatch ${kinds.join(' ')}; repair what they find`))
  await at.save(second.stdout)
  assert.match(answer(await at.step()).at(-1), /every check passes; in order: \(1\) oracle-verify\.mjs card /)
  await note(2)
  const third = answer(await at.step()).at(-1)
  assert.match(third, /every check passes; in order: \(1\) oracle-verify\.mjs card /)
  assert.ok(!/dispatch|source-aware/.test(third), third)
  assert.deepEqual((await at.status()).reviews, { ...NO_ROUNDS, 'model-analyst': 1, 'cold-read': 2, 'reverse-impossible': 2, 'source-aware': 2 })
  assert.equal(nextCommandOf(await at.brief()), 'lock')
  const locked = await at.lock(third)
  assert.equal(locked.status, 0, locked.stderr)
}

const PAGINATION = fileURLToPath(new URL('../../../test-fixtures/pagination/', import.meta.url))

async function translationRounds(t) {
  if (!(await installedBend(t))) return
  // the translation reviewer disputes a mapping in each round; the agent fixes it and records the digest the reviewer
  // read, as step says: the stale record is still a round, so the second review confirms the fixes and the third table
  // goes to the user, never to a third review
  const root = await mkdtemp(join(tmpdir(), 'oracle-step-translation-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(PAGINATION, root, { recursive: true })
  const dir = join(root, '.ai', 'oracles', 'pagination')
  await mkdir(dir, { recursive: true })
  const pkg = JSON.parse(await readFile(join(PAGINATION, 'oracle.package.json'), 'utf8'))
  const cells = Object.fromEntries(['late-success-after-cancel', 'late-failure-after-success', 'older-response-after-newer', 'duplicate-completion', 'lost-response', 'retry-while-pending', 'unmount-before-settle'].map((id) => [id, { decision: 'source', ref: 'S1' }]))
  pkg.asyncCells = [{ operation: 'load page', cells }]
  delete pkg.crossCheck.reviewedBy
  const writePackage = () => writeFile(join(dir, 'oracle.package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  await writePackage()
  const env = { ...CHILD_ENV, ORACLE_LINT_CACHE: join(root, 'receipts') }
  await mkdir(env.ORACLE_LINT_CACHE)
  const asked = async () => {
    const result = await runNode(root, 'oracle-step.mjs', ['--dir', join('.ai', 'oracles', 'pagination')], env)
    assert.equal(result.status, 1, result.stdout)
    return answer(result).at(-1)
  }
  const recordIt = /record it: oracle-package\.mjs set --dir \S+ \/crossCheck\/reviewedBy '\{"agent":"<reviewer>","inputDigest":"([0-9a-f]{64})"\}'/
  const first = await asked()
  assert.match(first, /dispatch the translation review — the analyst \(never the model's author\) with only \S+\/mapping-input\.md; fix the mappings it disputes, then record it: /)
  let read = recordIt.exec(first)[1]
  // disputed: the declared record is fixed, then the review recorded with the digest it read
  const dispute = async (n) => {
    await writeFile(join(root, 'space-discovery.md'), `${await readFile(join(root, 'space-discovery.md'), 'utf8')}\nRevision note ${n}.\n`)
    pkg.crossCheck.reviewedBy = { agent: 'test reviewer', inputDigest: read }
    await writePackage()
  }
  await dispute(1)
  const second = await asked()
  assert.match(second, /the translation review round 2 \(confirm-fixes\) — continue the round-1 reviewer with only the mappings it disputed and the repair diff; fix what it still disputes, then record it: /)
  assert.ok(!second.includes('mapping-input.md'), second)
  assert.notEqual(recordIt.exec(second)[1], read)
  read = recordIt.exec(second)[1]
  await dispute(2)
  const third = await asked()
  assert.match(third, /the translation table changed after its 2 reviews: ask the user how to settle the mappings, never a third review/)
  assert.ok(!/translation review|mapping-input\.md/.test(third), third)
  assert.equal(JSON.parse((await runNode(root, 'oracle-stage.mjs', ['status', '--dir', join('.ai', 'oracles', 'pagination')], env)).stdout).reviews.translation, 2)
}

async function proofEditsStop(t) {
  if (!(await installedBend(t))) return
  // PROOF.bend is not locked, but the model node proves it: an edit of the proof alone is a new file state, so a check
  // recorded before it is no longer current, and a proof that keeps failing the same way stops step on the third edit
  const fixture = await authoringFixture(t, 'proof')
  const at = await authoringRepo(fixture)
  const proof = join(at.repo, 'PROOF.bend')
  const original = await readFile(proof, 'utf8')
  await at.save((await at.step()).stdout)
  await at.step()
  assert.equal(nextCommandOf(await at.brief()), 'lock')
  await writeFile(proof, `${original}\n# a comment\n`)
  assert.match(await at.brief(), /next: oracle-step\.mjs .* · files changed since the last check$/)
  // the witness trace stops before the response, so the kernel rejects it the same way after every edit
  const broken = original.replace('([M.Issue{}, M.Respond{1n}], {==})', '([M.Issue{}], {==})')
  assert.notEqual(broken, original)
  for (const n of [1, 2]) {
    await writeFile(proof, `${broken}\n# repair attempt ${n}\n`)
    const result = await at.step()
    assert.equal(result.status, 1, result.stdout)
    assert.equal(answer(result)[0], 'ran: package ok; model 1 issue')
    assert.equal((await at.status()).sameIssues, n)
  }
  await writeFile(proof, `${broken}\n# repair attempt 3\n`)
  const stopped = await at.step()
  assert.equal(stopped.status, 1, stopped.stdout)
  assert.match(answer(stopped).at(-1), /^NEXT FOR YOU: NEEDS_DECISION: the same issues came back after three edits: stop and report them to the user: 1\) prove failed/)
}

async function lockNamesPackage(t) {
  if (!(await installedBend(t))) return
  // the lock line names the oracle's own package even when its self source names another file (here the copy at the
  // repository root): the printed lock is refused before anything is locked, where a lock without the package would be
  // taken and Delivery init would refuse it (PACKAGE_UNLOCKED) only after the card is immutable
  const fixture = await authoringFixture(t, 'self')
  const at = await authoringRepo(fixture)
  const original = JSON.parse(await readFile(join(at.repo, 'oracle.package.json'), 'utf8'))
  assert.ok(original.sources.some((source) => source.self && source.location === 'repo:oracle.package.json#v1'))
  await writeFile(at.file('oracle.package.json'), `${JSON.stringify(original, null, 2)}\n`)
  await at.save((await at.step()).stdout)
  const ready = answer(await at.step()).at(-1)
  assert.equal(ready.split('--source .ai/oracles/stale-search/oracle.package.json').length, 2, ready)
  const refused = await at.lock(ready)
  assert.equal(refused.status, 1, refused.stdout)
  assert.match(refused.stderr, /source-lock-unregistered: \S+\/\.ai\/oracles\/stale-search\/oracle\.package\.json: --source is not referenced by Source Registry/)
  await assert.rejects(readFile(at.file('oracle.lock.json')), { code: 'ENOENT' })
}

async function legacyRecords(t) {
  if (!(await installedBend(t))) return
  // a 0.126 stage.json at each stage loads: status shows its stage until the first step, step judges the files and keeps
  // the profile, the history and the dispatches while it drops the counters that moved the stage; a locked one stays
  // locked
  const fixture = await authoringFixture(t, 'legacy')
  const at = '2026-11-01T10:00:00.000Z'
  const packageSha256 = sha256(await readFile(join(fixture.base, PACKAGE_DIR, 'oracle.package.json')))
  const legacy = (stage, extra = {}) => ({
    schemaVersion: 1,
    stage,
    packageSha256: stage === 'DISCOVERING' ? null : packageSha256,
    iterations: { round: 2, limit: 3, extended: 0 },
    rewinds: 1,
    rewindAllowance: 10,
    dispatches: [{ kind: 'model-analyst', attempt: 'analyst-1', at }],
    history: [{ stage: 'DISCOVERING', packageSha256: null, evidence: 'begin', at }, ...(stage === 'DISCOVERING' ? [] : [{ stage, packageSha256, evidence: 'walk', iterationRound: 1, at }])],
    ...extra,
  })
  const loads = async (name, record, setup = async () => {}) => {
    const repo = await authoringRepo(fixture, name)
    await setup(repo)
    await writeFile(repo.file('stage.json'), `${JSON.stringify(record, null, 2)}\n`)
    const status = await repo.status()
    assert.equal(status.stage, record.stage, name)
    return repo
  }
  await Promise.all(['DISCOVERING', 'MODELED', 'CHECKED', 'DRAFTED'].map(async (stage) => {
    const record = legacy(stage)
    const repo = await loads(stage, record)
    assert.equal(nextCommandOf(await repo.brief()), 'step', stage)
    const stepped = await repo.step()
    assert.equal(stepped.status, 0, stepped.stdout)
    assert.equal((await repo.status()).stage, 'DRAFTED', stage)
    const written = JSON.parse(await readFile(repo.file('stage.json'), 'utf8'))
    assert.deepEqual(['stage', 'packageSha256', 'iterations', 'rewinds', 'rewindAllowance'].filter((field) => field in written), [], stage)
    assert.deepEqual([written.dispatches, written.history.slice(0, record.history.length)], [record.dispatches, record.history], stage)
  }))
  // a Contract record keeps its profile
  const contract = await loads('contract', legacy('CHECKED', { verificationProfile: 'contract/v1', packageSha256: null, cardSha256: null }), async (repo) => {
    await rm(repo.file('oracle.package.json'))
    await writeFile(repo.file('oracle.md'), fixture.contract)
  })
  assert.equal((await contract.step()).status, 0)
  assert.deepEqual([(await contract.status()).stage, (await contract.status()).verificationProfile], ['DRAFTED', 'contract/v1'])
  // a locked record of 0.126 is locked: step goes on to the Delivery run and --check refuses
  const ready = await loads('ready', legacy('ORACLE_READY'))
  assert.equal((await ready.status()).current, true)
  assert.match(answer(await ready.step()).at(-1), /^NEXT FOR YOU: start the Delivery run: oracle-run\.mjs init /)
  assert.equal((await ready.step('--check')).status, 2)
}

async function contractThroughStep(t) {
  // contract/v1 through the same entry: cold-read first, then the user's confirmation (with the source-aware review
  // named before it), then the card lint; --check lists both at once and changes nothing in the oracle directory; the
  // printed lock names the card's source and is taken
  const fixture = await authoringFixture(t, 'contract')
  const at = await authoringRepo(fixture)
  await rm(at.file('oracle.package.json'))
  await writeFile(at.file('oracle.md'), fixture.contract.replace(/- Status: approved\n- Source: .*/, PENDING_APPROVAL))
  const first = await at.step()
  assert.equal(first.status, 1, first.stdout)
  const lines = answer(first)
  assert.deepEqual(lines.slice(0, 2), ['ran: confirmation 1 issue', 'phase 2/6 Model'])
  assert.match(
    lines.at(-1),
    /^NEXT FOR YOU: dispatch cold-read — .*, its return saved unchanged as \S+; and when card\/policy-sources\.md's trigger applies, a source-aware review — .*; save its return unchanged as \S+; and fix all 1 in \S+oracle\.md: 1\) user-confirmation: show the user the whole card/,
  )
  await at.save(first.stdout)
  assert.match(answer(await at.step()).at(-1), /^NEXT FOR YOU: when card\/policy-sources\.md's trigger applies, a source-aware review — .*; and fix all 1 in \S+oracle\.md: 1\) user-confirmation: /)
  const before = await snapshot(at.dir)
  const check = await at.step('--check')
  assert.equal(check.status, 1, check.stdout)
  assert.match(check.stdout, /^confirmation: 1\) user-confirmation: /m)
  assert.match(check.stdout, /^card: 1\) user-confirmation-status: /m)
  assert.deepEqual(await snapshot(at.dir), before)
  // the approval is not part of what cold-read read: no new round, and the lock is next
  await writeFile(at.file('oracle.md'), fixture.contract)
  const ready = await at.step()
  assert.equal(ready.status, 0, ready.stdout)
  const next = answer(ready).at(-1)
  assert.match(next, /^NEXT FOR YOU: every check passes; in order: \(1\) oracle-verify\.mjs card --oracle \S+ --path <files the change touches>; \(2\) oracle-lock\.mjs create --oracle \S+ --lock \S+ --source packages\/frontend-oracle-design\/test-fixtures\/contract-v1\/policy\.md$/)
  assert.deepEqual((await at.status()).reviews, { ...NO_ROUNDS, 'cold-read': 1 })
  const locked = await at.lock(next)
  assert.equal(locked.status, 0, locked.stderr)
  assert.match(answer(await at.step()).at(-1), /^NEXT FOR YOU: start the Delivery run: oracle-run\.mjs init /)
}

const SAVE_TEST = "import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { save } from './src/save.mjs'\ntest('save > pending', () => assert.ok(save > 0))\n"

async function deliveryToClose(t) {
  const fixture = await workspace(t, { risk: 'low', initialFiles: { 'src/save.mjs': 'export const save = 0\n', 'save.test.mjs': SAVE_TEST } })
  const { root, oracleDirectory: dir } = fixture
  const state = async () => JSON.parse(await readFile(join(dir, 'run-state.json'), 'utf8')).state

  // the first RED needs the test command once; step assembles the rest and stops at the implementation
  const asked = step(root, ['--dir', dir])
  assert.equal(asked.status, 0, asked.stderr)
  assert.match(answer(asked).at(-1), /--label behavior -- <the command that runs them>$/)
  const red = step(root, ['--dir', dir, '--label', 'behavior', '--', 'node', '--test', join(root, 'save.test.mjs')])
  assert.equal(red.status, 0, red.stderr)
  assert.deepEqual(answer(red).slice(0, 2), ['ran: oracle-run.mjs red behavior ok', 'phase 5/6 GREEN'])
  assert.match(answer(red).at(-1), /^NEXT FOR YOU: implement the production change/)
  assert.equal(await state(), 'VALID_RED')

  // GREEN reruns the RED command from the ledger, the review needs one run after GREEN, close writes the packet and
  // waits for the reviewer
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = 1\n')
  const green = step(root, ['--dir', dir])
  assert.equal(green.status, 0, green.stderr)
  const greenLines = answer(green)
  assert.deepEqual(greenLines.slice(0, 2), ['ran: oracle-run.mjs green behavior ok; oracle-run.mjs exec behavior ok; oracle-run.mjs close CLOSE_PENDING', 'phase 6/6 Review and close'])
  assert.match(greenLines[2], /^WAITING CLOSE_PENDING: waiting for reviewer output: --findings$/)
  assert.equal(await state(), 'IMPLEMENTED_GREEN')
  const saved = /save its return unchanged as (\S+);/.exec(greenLines.at(-1))
  assert.ok(saved, greenLines.at(-1))
  const findings = join(root, saved[1])

  // the reviewer's return, saved where step said; without a host receipt step asks for its task id
  const phase = await readPhase(dir)
  const packet = (await closeCall(dir, phase)).targets.packet
  const bytes = await readFile(packet)
  const worktree = JSON.parse(bytes.toString('utf8')).targetSnapshot.worktreeSha256
  await writeFile(findings, JSON.stringify(CLEAR))
  bindReviewDocument(findings, sha256(bytes), worktree)
  assert.match(answer(step(root, ['--dir', dir])).at(-1), /--task-id <the reviewer task that returned it>$/)

  // the close step assembles is the one a person would type from the run's files: the packet close wrote, the run the
  // status names, a blind input named for the reviewed bytes; the CLI accepting it is the step run after
  const assembled = await closeCall(dir, await readPhase(dir), { taskId: 'review-1' })
  const run = phase.status.nextActions.find((item) => item.to === 'REVIEW_VERIFIED').candidateRuns[0]
  assert.deepEqual(assembled.calls[0].args, [
    'close', '--dir', dir, '--packet', packet, '--decision', join(dir, 'implementation-decision.md'),
    ...canonicalReviewPoints.flatMap(({ path }) => ['--review-point', path]),
    '--run', run, '--evidence', join(dir, 'evidence.json'), '--blind-input', join(dir, `blind-input-${worktree.slice(0, 12)}.json`), '--check-report', join(dir, 'final-report.md'),
    '--findings', findings, '--task-id', 'review-1',
  ])
  const reviewed = step(root, ['--dir', dir, '--task-id', 'review-1'])
  assert.equal(reviewed.status, 0, reviewed.stderr)
  assert.match(answer(reviewed).at(-1), /^NEXT FOR YOU: write \S+final-report\.md: a `Status: REVIEW_VERIFIED` line/)
  assert.equal(await state(), 'REVIEW_VERIFIED')

  await writeFile(join(dir, 'final-report.md'), `Status: REVIEW_VERIFIED\nGREEN ${run} exit 0\n`)
  const closed = step(root, ['--dir', dir])
  assert.equal(closed.status, 0, closed.stdout)
  assert.match(answer(closed).at(-1), /^NEXT FOR YOU: done: REVIEW_VERIFIED is recorded/)
}

async function refusalOnce(t) {
  // a RED command that passes: red is refused once, one run is recorded, and step prints one action
  const fixture = await workspace(t, { risk: 'low', initialFiles: { 'src/save.mjs': 'export const save = 1\n', 'save.test.mjs': SAVE_TEST } })
  const { root, oracleDirectory: dir } = fixture
  const result = step(root, ['--dir', dir, '--label', 'behavior', '--', 'node', '--test', join(root, 'save.test.mjs')])
  assert.equal(result.status, 1, result.stdout)
  const lines = answer(result)
  assert.equal(lines.filter((text) => text.startsWith('ran: ')).length, 1, result.stdout)
  assert.match(lines[0], /^ran: oracle-run\.mjs red behavior [A-Z_]+$/)
  const ledger = (await readFile(join(dir, 'runs.jsonl'), 'utf8')).split('\n').filter(Boolean).map((text) => JSON.parse(text))
  assert.equal(ledger.filter((entry) => entry.type === 'run').length, 1)
}

async function scaffoldFirst(t) {
  // a blank oracle folder: step writes the package skeleton and the S4 skeleton, records no stage and names the first set
  const root = await mkdtemp(join(tmpdir(), 'oracle-step-scaffold-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = join(root, '.ai', 'oracles', 'save-retry')
  await mkdir(dir, { recursive: true })
  const first = step(root, ['--dir', dir])
  assert.equal(first.status, 0, first.stdout)
  assert.match(answer(first).at(-1), /settle the Space discovery record \S+ with the user .* decide the \d+ open package fields of \S+ in order with oracle-package\.mjs set --dir \S+ <pointer> <value>; first: set \/sources <value> — /)
  const bytes = await readFile(join(dir, 'oracle.package.json'))
  const pkg = JSON.parse(bytes)
  assert.deepEqual([pkg.id, pkg.intent.risk], ['save-retry', { todo: 'the risk the user accepted', oneOf: ['Low', 'Medium', 'High'] }])
  const record = await readFile(join(dir, 'sources', 'space-discovery.md'), 'utf8')
  assert.match(record, /^\| Family \| Dimension \| Choices \|\n\| --- \| --- \| --- \|\n\| Data \| todo \| todo \|$/m)
  assert.doesNotMatch(record, /^## State Model/m)
  assert.deepEqual((await readdir(dir)).sort(), ['oracle.package.json', 'sources'], 'a blank folder gets no stage record')
  // the untouched skeleton is still blank: --check and a second step write nothing
  for (const args of [['--check'], []]) {
    const again = step(root, ['--dir', dir, ...args])
    assert.equal(again.status, 0, again.stdout)
    assert.deepEqual(await readFile(join(dir, 'oracle.package.json')), bytes)
  }
  assert.deepEqual((await readdir(dir)).sort(), ['oracle.package.json', 'sources'])
}

/** Review inputs go under a private per-user folder: a planted link or a folder open to others is refused, not written into. */
async function privateInputs() {
  const base = await mkdtemp(join(tmpdir(), 'oracle-private-'))
  const planted = await mkdtemp(join(tmpdir(), 'oracle-planted-'))
  const elsewhere = await mkdtemp(join(tmpdir(), 'oracle-elsewhere-'))
  try {
    const root = await privateInputRoot(base)
    assert.equal(await privateInputRoot(base), root)
    const info = await lstat(root)
    assert.equal(info.isDirectory(), true)
    if (typeof process.getuid === 'function') assert.equal(info.mode & 0o077, 0)
    await symlink(elsewhere, join(planted, basename(root)))
    await assert.rejects(privateInputRoot(planted), /is not a private folder of this user/)
    assert.deepEqual(await readdir(elsewhere), [])
    if (typeof process.getuid === 'function') {
      await chmod(root, 0o777)
      await assert.rejects(privateInputRoot(base), /is not a private folder of this user/)
    }
  } finally {
    await Promise.all([base, planted, elsewhere].map((path) => rm(path, { recursive: true, force: true })))
  }
}

export const stepCases = [
  ['review inputs go under a private per-user folder; a planted link or a folder open to others is refused', privateInputs],
  ['a blank oracle folder gets the package and Space discovery skeletons from step, and nothing else', scaffoldFirst],
  ['step runs only the AUTO entries of the shared next table; every other next and any unknown line is printed', tableAndAuto],
  ['step stops on a refusal, a line seen before, an empty plan and the step cap; FLAKINESS_GATE goes on only within the cap', loopStops],
  ['step binds a reviewer task from host receipts only when one task after the round is left; a named task wins', hostReceipts],
  ['step binds reviewer returns only when as many answer as the risk needs, and lists them otherwise', returnCounts],
  ['step asks for a new implementation decision before a new review round reuses the last one', staleDecision],
  ['step prints the close with a new packet path for an unwitnessed packet and does not run it', unwitnessedPacket],
  ['step does not rerun GREEN on the bytes a GREEN already failed on', failedGreenBytes],
  ['step binds a saved blind mapping and prints a High risk close with its mutation flags', blindAndMutation],
  ['step holds a Formal first RED until the journal records the adapter-pre-red review of this lock', preRedReview],
  ['step does not run a bare label with a command no trusted adapter reports; a :exit label takes it', reportedLabels],
  ['step names the repository test label with the grade its test script can give', initLabel],
  ['[bend] step takes a package from no stage record to the reviews, then to a lock it prints and the lock takes; a hand-written issue is fixed in oracle.md alone', authoringToLock],
  ['[bend] a sourced N/A written outside the generated markers settles the auto test cases and survives the projection', handWrittenLines],
  ['[bend] each 0.126 incident that cost a registration, a round or a rewind costs nothing through step', bClassIncidents],
  ['[bend] step --check fails exactly when the lock refuses, names every issue the lock names and changes nothing in the oracle directory', checkParity],
  ['[bend] the same issues on a third distinct file state stop step with no review asked; the second does not', stopOnThird],
  ['[bend] no review kind is asked for a third round, the second confirms the fixes, and source-aware opens with its first return', noThirdRound],
  ['[bend] a translation review recorded against a mapping fixed after its dispute is a round: the third table goes to the user', translationRounds],
  ['[bend] a PROOF.bend edit alone is a new file state: a proof failing the same way stops step on the third edit', proofEditsStop],
  ['[bend] the lock line names the oracle package even when its self source names another file: refused before the lock, not at init', lockNamesPackage],
  ['[bend] a 0.126 stage.json at each stage loads with its stage, and step relabels it from the files', legacyRecords],
  ['contract/v1 goes from a pending card to its lock and the Delivery run through oracle-step.mjs', contractThroughStep],
  ['step takes a Delivery run from ORACLE_READY to a checked report, stopping only for the agent, with the close a person would assemble', deliveryToClose],
  ['a refused command stops step after one run with one action', refusalOnce],
]
