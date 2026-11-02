import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { template } from './oracle-authoring-machine.cases.mjs'
import { HOST_RECEIPTS_FILE, reviewOutputDigest } from './oracle-fs.mjs'
import { NEXT_LINES, nextCommandOf } from './oracle-next.mjs'
import { bindReviewDocument, workspace } from './oracle-run.cases.mjs'
import { canonicalReviewPoints, selectedDigests } from './oracle-run.mjs'
import { AUTO, AUTO_COMMAND, closeCall, drive, MAX_AUTO_STEPS, nextKey, planStep, readPhase, render } from './oracle-step.mjs'
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
  begin: 'oracle-stage.mjs begin --dir d',
  walk: 'oracle-cycle.mjs walk --dir d',
  walkReason: 'oracle-cycle.mjs walk --dir d --reason <cause>',
  lock: 'oracle-lock.mjs create --oracle d/oracle.md --lock d/oracle.lock.json --source <approved-source>',
  extend: 'oracle-stage.mjs extend --dir d --approval <explicit-user-approval.json>',
  init: 'oracle-run.mjs init --dir d --lock d/oracle.lock.json --scan-root <scan-root> --required-label <repo-check>',
  revise: 'NEEDS_DECISION: the user rewrites the sources, then oracle-stage.mjs begin --dir <new run dir>',
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
  const quoted = `'${relative(process.cwd(), join(spaced, 'oracle.package.json'))}'`
  assert.ok((await planStep(spaced, { kind: 'stage', line: phaseLine(SAMPLE_NEXT.begin), key: 'begin' })).say.startsWith(`write ${quoted} `))
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

  // a refused walk gate prints its code and the gate's own next action, on one line each
  const walk = { script: 'oracle-cycle.mjs', args: ['walk', '--dir', 'd'] }
  const failed = { step: 'card', code: 'CARD_LINT', detail: 'row O3 cites nothing\nmore', next: 'fix row O3, then rerun walk' }
  const walked = await drive({ directory: 'd', read: () => ({ kind: 'stage', line: line(1) }), plan: () => ({ calls: [walk] }), run: () => ({ status: 1, stdout: JSON.stringify({ ok: false, failed }), stderr: '' }) })
  assert.deepEqual(walked.ran, ['oracle-cycle.mjs walk CARD_LINT'])
  assert.equal(walked.refused, true)
  assert.deepEqual(walked.shown, ['REFUSED CARD_LINT: row O3 cites nothing'])
  assert.equal(walked.say, 'fix row O3, then rerun walk')
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
  const run = (runId, productionSha256) => ({ type: 'run', runId, label: 'behavior', command: ['node', 'x'], exitCode: 1, grade: 'reported', productionSha256, harnessSha256: digests('t1') })
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

async function authoringToLock(t) {
  if (!(await installedBend(t))) return
  const root = await mkdtemp(join(tmpdir(), 'oracle-step-authoring-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const { base } = await template(root)
  const result = step(base, ['--dir', '.ai/oracles/stale-search'])
  assert.equal(result.status, 0, result.stderr)
  const lines = answer(result)
  assert.deepEqual(lines.slice(0, 2), ['ran: oracle-stage.mjs begin ok; oracle-cycle.mjs walk ok', 'phase 3/6 Card review and lock'])
  // the lock is the user's approval: step prints it and does not run it
  assert.match(lines[2], /^NEXT FOR YOU: show the user \.ai\/oracles\/stale-search\/oracle\.md and get explicit approval, then run oracle-lock\.mjs create /)
  assert.equal(JSON.parse(await readFile(join(base, '.ai/oracles/stale-search/stage.json'), 'utf8')).stage, 'DRAFTED')
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

export const stepCases = [
  ['step runs only the AUTO entries of the shared next table; every other next and any unknown line is printed', tableAndAuto],
  ['step stops on a refusal, a refused walk, a line seen before, an empty plan and the step cap; FLAKINESS_GATE goes on only within the cap', loopStops],
  ['step binds a reviewer task from host receipts only when one task after the round is left; a named task wins', hostReceipts],
  ['step binds reviewer returns only when as many answer as the risk needs, and lists them otherwise', returnCounts],
  ['step asks for a new implementation decision before a new review round reuses the last one', staleDecision],
  ['step prints the close with a new packet path for an unwitnessed packet and does not run it', unwitnessedPacket],
  ['step does not rerun GREEN on the bytes a GREEN already failed on', failedGreenBytes],
  ['step binds a saved blind mapping and prints a High risk close with its mutation flags', blindAndMutation],
  ['[bend] step walks a package from no stage record to DRAFTED and prints the lock for the user', authoringToLock],
  ['step takes a Delivery run from ORACLE_READY to a checked report, stopping only for the agent, with the close a person would assemble', deliveryToClose],
  ['a refused command stops step after one run with one action', refusalOnce],
]
