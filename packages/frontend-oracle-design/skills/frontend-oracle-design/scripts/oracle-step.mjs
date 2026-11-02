/**
 * oracle-step.mjs — the one command the controller runs: `oracle-step.mjs --dir <oracle dir>`.
 *
 * It reads the phase line `status --brief` prints (the Delivery run once run-state.json exists, else the authoring
 * stage) and runs the `next:` command itself when it is mechanical (AUTO), assembling every argument from the oracle
 * directory and the ledger; then it reads the phase line again and repeats. It stops with one instruction when the next
 * step is the agent's work (a file to write, a reviewer to dispatch, a choice between files), the user's approval or
 * decision, or a refusal. At DRAFTED it runs the read-only card lints before it prints the reviews, the approval and the
 * lock in order. It never runs lock, extend, init, rewind, budget or `walk --reason`. Besides the reports/
 * folder for the test reports it names, it writes only what the commands it runs write. At most MAX_AUTO_STEPS
 * commands per call; a refusal, or a phase line already seen in this call, stops it.
 *
 *   oracle-step.mjs --dir <dir> [--label <label> -- <test command>] [--findings <file>] [--intersect <file>]
 *                   [--task-id <id>] [--intersect-task-id <id>] [--blind-task-id <id>]
 *
 * `--label … -- <command>` names the test command of a label the ledger has never run; `--findings`/`--intersect` pick
 * the saved reviewer returns when more than one answers the packet; a task id names the reviewer task that returned a
 * saved file, and wins over the host's receipts.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { TRUSTED_ADAPTERS } from './oracle-adapters.mjs'
import { HOST_RECEIPTS_FILE, reviewOutputDigest } from './oracle-fs.mjs'
import { nextCommandOf, nextOf } from './oracle-next.mjs'
import { canonicalReviewPoints, deliveryBrief, requiredLabelsNotPassing, sameDigests } from './oracle-run.mjs'
import { briefStatus, dispatchedSinceLastRewind, STAGE_FILE } from './oracle-stage.mjs'

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
export const MAX_AUTO_STEPS = 8
/**
 * The next commands step runs itself. Each is the model's next event and decides nothing the user owns: begin opens
 * the stage record, walk runs the authoring gates, red/green/exec run the tests and record what they show, close makes
 * the packet and binds the reviewer returns the agent saved, guide and report only read. Every other next is printed.
 */
export const AUTO = new Set(['begin', 'walk', 'red', 'green', 'exec', 'close', 'guide', 'report'])
/** The script and subcommand each AUTO next runs. */
export const AUTO_COMMAND = Object.freeze({
  begin: ['oracle-stage.mjs', 'begin'], walk: ['oracle-cycle.mjs', 'walk'], red: ['oracle-run.mjs', 'red'], green: ['oracle-run.mjs', 'green'],
  exec: ['oracle-run.mjs', 'exec'], close: ['oracle-run.mjs', 'close'], guide: ['oracle-run.mjs', 'guide'], report: ['oracle-run.mjs', 'close'],
})
const REASONS = '<review-finding|gate-failure|user-answer|source-change>'

const exists = (path) => stat(path).then(() => true, () => false)
const rel = (path) => relative(process.cwd(), path) || '.'
/** A word as a shell reads it: quoted when it has anything but path characters. */
const QUOTED_QUOTE = String.raw`'\''`
const sh = (text) => (/^[\w./@:+=,%-]+$/.test(text) ? text : `'${text.replaceAll("'", QUOTED_QUOTE)}'`)
const q = (path) => sh(rel(path))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readJson = (path) => readFile(path, 'utf8').then(JSON.parse).catch(() => null)
/** The phase and its next command — what `status --brief` says before its status fields. */
export const phaseOf = (line) => line.split('\n')[0].split(' · ').slice(0, 2).join(' · ')
const rerun = (directory) => `oracle-step.mjs --dir ${q(directory)}`
/** A printed command, every path relative and quoted; `replace` swaps the value after a flag. */
function commandText(call, replace = {}) {
  const args = call.args.map((arg, index) => replace[call.args[index - 1]] ?? arg)
  return [call.script, ...args.map((arg) => (isAbsolute(arg) ? q(arg) : sh(arg)))].join(' ')
}
/** Where the agent reads what to do when step cannot tell. */
const readNext = (directory, phase) =>
  phase.kind === 'stage' ? `oracle-stage.mjs status --brief --dir ${q(directory)}` : `oracle-run.mjs guide --dir ${q(directory)}`

/** The table key a phase line names. A directory with spaces is swapped for one word, so the table's `--dir \S+` still matches. */
export function nextKey(line, directory) {
  const forms = [directory, rel(directory)].filter((form) => /\s/.test(form)).sort((left, right) => right.length - left.length)
  return nextCommandOf(forms.reduce((text, form) => text.replaceAll(sh(form), 'ORACLE_DIR').replaceAll(form, 'ORACLE_DIR'), line))
}

/** The phase line and what it is read from: the Delivery run once init wrote run-state.json, else the authoring stage. */
export async function readPhase(directory) {
  if (await exists(join(directory, 'run-state.json'))) {
    const brief = await deliveryBrief(directory)
    return { kind: 'delivery', ...brief, key: nextKey(brief.line, directory) }
  }
  const line = await briefStatus(directory)
  return { kind: 'stage', line, key: nextKey(line, directory) }
}

const runsOf = (ledger) => ledger.filter((entry) => (entry.type ?? 'run') === 'run')
const action = (phase, to) => phase.status.nextActions.find((item) => item.to === to)
const notPassing = (phase) => requiredLabelsNotPassing(phase.state, runsOf(phase.ledger), new Set(phase.status.staleOrMissingRuns))
function historyRun(phase, name) {
  const entry = [...(phase.state.history ?? [])].reverse().find((item) => item.state === name)
  return entry ? runsOf(phase.ledger).find((run) => run.runId === entry.runId) : null
}
function evidenceOf(directory, phase) {
  const entry = [...(phase.state.history ?? [])].reverse().find((item) => item.evidence)
  return entry ? resolve(directory, entry.evidence) : join(directory, 'evidence.json')
}

/** A test command as the agent typed it: `node` becomes this node, and the trusted adapter that matches it reports. */
function typedCommand(command) {
  const typed = command[0] === 'node' ? [process.execPath, ...command.slice(1)] : command
  const adapter = Object.keys(TRUSTED_ADAPTERS).find((name) => TRUSTED_ADAPTERS[name].matches(typed, { execPath: process.execPath }))
  return { command: typed, adapter: adapter ?? null, cwd: process.cwd(), note: '' }
}

/** The command that runs `label`: the one given to step for it, else the latest run of that label in the ledger. */
function sourceOf(phase, label, given) {
  if (given.command && given.label === label) return typedCommand(given.command)
  const run = runsOf(phase.ledger).findLast((entry) => entry.label === label)
  return run ? { command: run.command, adapter: run.adapter ?? null, cwd: run.cwd, note: run.env?.note ?? '' } : null
}

/**
 * A label without `:exit` is graded on a reported run: a command no trusted adapter reports (`npm test`) would pass
 * exit-only and the transition would refuse it as REQUIRED_LABEL_GRADE. Step says so instead of spending the run.
 */
function unreported(directory, label, source) {
  if (label.endsWith(':exit') || source.adapter) return null
  const shown = source.command.map((word) => (word === process.execPath ? 'node' : word)).join(' ')
  return { say: `${label} is graded on a reported run and \`${shown}\` reports no test results to the oracle: rerun ${rerun(directory)} --label ${label} -- <node --test <test files> | npx vitest run <test files>>` }
}

/** A path `<stem>-<n>.<extension>` in `folder` that does not exist yet — a trusted adapter refuses an existing report. */
async function freshPath(folder, stem, extension, start) {
  let n = start
  while (await exists(join(folder, `${stem}-${n}.${extension}`))) n += 1
  return join(folder, `${stem}-${n}.${extension}`)
}

/** One exec, red or green call with the label's recorded command, adapter, working directory and environment note. */
async function testCall(directory, phase, sub, label, source, extra, index) {
  const flags = ['--dir', directory, '--label', label]
  // a `:exit` label is graded on the exit code alone: a reported run of it is refused REQUIRED_LABEL_GRADE
  if (source.adapter && !label.endsWith(':exit')) {
    const stem = `step-${label.replaceAll(/[^\w.-]+/g, '-')}`
    const report = await freshPath(join(directory, 'reports'), stem, TRUSTED_ADAPTERS[source.adapter].extension, runsOf(phase.ledger).length + index + 1)
    flags.push('--adapter', source.adapter, '--report', report)
  }
  if (source.note) flags.push('--env-note', source.note)
  return { script: 'oracle-run.mjs', args: [sub, ...flags, ...extra, '--', ...source.command], cwd: await workingDirectory(source.cwd), label }
}

/** The run's recorded working directory while it exists — the recorded command's relative paths resolve there. */
async function workingDirectory(cwd) {
  if (cwd && (await exists(cwd))) return cwd
  return process.cwd()
}

function askCommand(directory, labels) {
  const label = labels.length === 1 ? labels[0] : `<${labels.join('|')}>`
  return `write or fix the tests, then rerun: ${rerun(directory)} --label ${label} -- <the command that runs them>`
}

/** exec calls for `labels`, or the instruction naming a label step has no command for. */
async function labelCalls(directory, phase, labels, given) {
  const calls = []
  for (const label of labels) {
    const source = sourceOf(phase, label, given)
    if (!source) return { say: askCommand(directory, [label]) }
    const graded = unreported(directory, label, source)
    if (graded) return graded
    calls.push(await testCall(directory, phase, 'exec', label, source, [], calls.length))
  }
  return { calls }
}

/** The evidence row a refreshed or first RED cites: a test row whose test failed in the freshest failing run, else the first test row. */
async function redRow(evidence, phase, packet) {
  const rows = Object.entries((await readJson(evidence))?.rows ?? {}).filter(([, row]) => row.kind === 'test')
  const tests = runsOf(phase.ledger).find((run) => run.runId === packet.candidateRuns[0])?.tests ?? []
  const failed = new Set(tests.filter((test) => test.status === 'failed').map((test) => test.name))
  return (rows.find(([, entry]) => failed.has(entry.name)) ?? rows[0])?.[0] ?? null
}

// a card with a Formal Model or an Adequacy derives these labels at init (oracle-run.mjs profileLabels): its RED runs a Formal adapter
const FORMAL_LABELS = new Set(['bend-proof:reported', 'bend-adequacy:reported'])

/**
 * A Formal run's first RED waits for the adapter-pre-red review (delivery/red.md step 4): after the lock, before RED is
 * accepted, while a harness repair is still free. Its record is a journal.md line naming the mode and the lock digest.
 */
async function preRedReviewMissing(directory, phase) {
  if (phase.state.state !== 'ORACLE_READY' || !(phase.state.requiredLabels ?? []).some((label) => FORMAL_LABELS.has(label))) return false
  const journal = await readFile(join(directory, 'journal.md'), 'utf8').catch(() => '')
  return !journal.split('\n').some((line) => line.includes('adapter-pre-red') && line.includes(phase.state.lockSha256))
}

function preRedReview(directory, phase, given) {
  const again = given.command ? ` --label ${given.label} -- ${given.command.map(sh).join(' ')}` : ''
  return [
    'before the first RED, dispatch $oracle-review in adapter-pre-red mode in a fresh context with the locked Terms and observations,',
    'the adapter, the generated and hand-written tests and the product paths they call (run oracle-projection.mjs verify-generated --file <generated test> on each generated file first);',
    `repair harness defects now (free before VALID_RED), then add a ${q(join(directory, 'journal.md'))} line naming adapter-pre-red,`,
    `lock sha256:${phase.state.lockSha256}, its findings and the reviewed file hashes, and rerun ${rerun(directory)}${again}`,
  ].join(' ')
}

async function planRed(directory, phase, given) {
  const evidence = evidenceOf(directory, phase)
  if (!(await exists(evidence))) return { say: `write ${q(evidence)} mapping each card row to its test ({"schemaVersion":1,"rows":{"O1":{"kind":"test","name":"<test name>"}}}), then rerun ${rerun(directory)}` }
  const labels = phase.state.requiredLabels ?? []
  const red = historyRun(phase, 'VALID_RED') ?? runsOf(phase.ledger).findLast((run) => run.exitCode !== 0 && run.grade === 'reported')
  const label = given.label ?? red?.label ?? (labels.length === 1 ? labels[0] : null)
  const source = label ? sourceOf(phase, label, given) : null
  if (!source) return { say: askCommand(directory, labels) }
  const graded = unreported(directory, label, source)
  if (graded) return graded
  if (await preRedReviewMissing(directory, phase)) return { say: preRedReview(directory, phase, given) }
  const packet = action(phase, 'VALID_RED')
  const extra = ['--evidence', evidence]
  if (packet?.requires.includes('--row')) {
    const row = await redRow(evidence, phase, packet)
    if (!row) return { say: `${q(evidence)} maps no row to a test: add one, then rerun ${rerun(directory)}` }
    extra.push('--row', row)
  }
  return { calls: [await testCall(directory, phase, 'red', label, source, extra, 0)] }
}

/** The latest run of `label` after VALID_RED that failed on exactly the current production and test bytes. */
function failedOnTheseBytes(phase, red, label) {
  const runs = runsOf(phase.ledger)
  const now = phase.status.currentSnapshot ?? {}
  const failed = runs.slice(runs.indexOf(red) + 1).findLast((run) => run.label === label && run.exitCode !== 0)
  // harnessSha256 is a per-file digest map in the ledger and the snapshot: compared as the CLI compares it
  if (!failed || failed.productionSha256 !== now.productionSha256 || !sameDigests(failed.harnessSha256 ?? {}, now.harnessSha256 ?? {})) return null
  return failed
}

async function planGreen(directory, phase, given) {
  const red = historyRun(phase, 'VALID_RED')
  if (red && phase.status.currentSnapshot?.productionSha256 === red.productionSha256)
    return { say: `implement the production change so the RED tests pass (a test edit after VALID_RED needs a harness budget spend), then rerun ${rerun(directory)}` }
  const label = red?.label ?? given.label
  const failed = red && failedOnTheseBytes(phase, red, label)
  if (failed) return { say: `${failed.runId} failed on these bytes: edit production so the RED tests pass, then rerun ${rerun(directory)}` }
  const source = label ? sourceOf(phase, label, given) : null
  if (!source) return { say: askCommand(directory, phase.state.requiredLabels ?? []) }
  const graded = unreported(directory, label, source)
  if (graded) return graded
  // GREEN checks every required label on these bytes; the others run first, GREEN's own command last
  const others = await labelCalls(directory, phase, notPassing(phase).filter((name) => name !== label), given)
  if (others.say) return others
  const green = await testCall(directory, phase, 'green', label, source, ['--evidence', evidenceOf(directory, phase)], others.calls.length)
  return { calls: [...others.calls, green] }
}

function planExec(directory, phase, given) {
  const labels = notPassing(phase)
  return labelCalls(directory, phase, labels.length > 0 ? labels : [historyRun(phase, 'IMPLEMENTED_GREEN')?.label].filter(Boolean), given)
}

/** The JSON files in the oracle directory and its folders — packets and saved reviewer returns are found by content, not by name. */
async function documents(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !relative(directory, path).split('/').some((part) => part.startsWith('.')))
    .sort()
  const read = await Promise.all(paths.map(async (path) => ({ path, doc: await readJson(path) })))
  return read.filter(({ doc }) => doc && typeof doc === 'object')
}

/**
 * The reviewer tasks the host recorded returning `doc`: receipts written after `since` (the round's start) by a task
 * not in `excluded` (already bound in the ledger or in this close). Equal returns — every clear review — share a digest.
 */
async function hostCandidates(directory, doc, since, excluded) {
  const digest = reviewOutputDigest(doc)
  const raw = await readFile(join(directory, HOST_RECEIPTS_FILE), 'utf8').catch(() => '')
  const fresh = (receipt) => !since || (typeof receipt.at === 'string' && receipt.at > since)
  const agents = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((receipt) => receipt.kind === digest?.kind && receipt.sha256 === digest?.sha256 && fresh(receipt) && !excluded.has(receipt.agentId))
    .map((receipt) => receipt.agentId)
  return [...new Set(agents)]
}

/** The one task the host recorded for a saved return, or the instruction asking the agent to name it. */
async function taskFor(directory, { path, doc }, flag, context) {
  const candidates = await hostCandidates(directory, doc, context.since, context.excluded)
  if (candidates.length === 1) return { task: candidates[0] }
  if (candidates.length > 1)
    return { say: `${q(path)} equals the returns of ${candidates.join(', ')}, which the host cannot tell apart: rerun ${rerun(directory)} ${flag} <the task that returned this file>` }
  return { say: `the host recorded no reviewer for ${q(path)}: rerun ${rerun(directory)} ${flag} <the reviewer task that returned it>` }
}

/** The revision the packet reviews: the last round's while its bytes stand or after the last round (a repair closes on it), else the current bytes. */
function packetRevision(last, current) {
  if (!last) return current
  if (last.targetRevision === current || last.scope?.exhausted) return last.targetRevision
  return current
}

/** The reviewer returns close takes: those that answer the written packet, or the previous round's before the next packet is written. */
function reviewerReturns(docs, packetBytes, packetRev, last) {
  const answers = ({ doc }) => Array.isArray(doc.findings)
  if (packetBytes) return docs.filter((item) => answers(item) && item.doc.packetSha256 === sha256(packetBytes) && item.doc.targetRevision === packetRev)
  return last ? docs.filter((item) => answers(item) && item.doc.targetRevision === last.targetRevision) : []
}

/** The returns to bind: the ones the agent named, else all that were found when they are as many as the risk needs (or none yet). */
async function chosenReturns(directory, found, given, needed, targets) {
  if (given.findings) {
    const paths = [given.findings, given.intersect].filter(Boolean).map((path) => resolve(path))
    return { returns: await Promise.all(paths.map(async (path) => ({ path, doc: (await readJson(path)) ?? {} }))) }
  }
  if (found.length === 0 || found.length === needed) return { returns: found }
  const list = found.map(({ path }) => q(path)).join(', ')
  if (found.length > needed) {
    const flags = needed === 2 ? '--findings <file> --intersect <file>' : '--findings <file>'
    return { say: `${found.length} saved reviewer returns answer the review and close takes ${needed}: ${list}; rerun ${rerun(directory)} ${flags} naming the ones to bind` }
  }
  const other = found[0].path === targets.intersect ? targets.findings : targets.intersect
  return { say: `${found.length} of ${needed} reviewer returns are saved: ${list}; save the other reviewer's return unchanged as ${q(other)}, then rerun ${rerun(directory)}` }
}

/** --findings/--intersect with their task ids, or the instruction naming a task step cannot find. */
async function reviewerArgs(directory, returns, packetWritten, given, context) {
  const args = []
  const excluded = new Set(context.excluded)
  for (const [index, item] of returns.entries()) {
    const [flag, taskFlag, givenTask] = index === 0 ? ['--findings', '--task-id', given.taskId] : ['--intersect', '--intersect-task-id', given.intersectTaskId]
    args.push(flag, item.path)
    if (!packetWritten || item.doc.orchestrationReceipt) continue
    // a task id the agent names wins over the receipts: equal returns cannot be told apart by digest
    const found = givenTask ? { task: givenTask } : await taskFor(directory, item, taskFlag, { since: context.since, excluded })
    if (found.say) return found
    excluded.add(found.task)
    args.push(taskFlag, found.task)
  }
  return { args }
}

/** A new round's packet must not carry the decision the last round read: after a repair the reviewers need the new one. */
async function staleDecision(directory, docs, decision, last, packetRev) {
  if (!last || packetRev === last.targetRevision) return null
  const previous = docs.find(({ doc }) => doc.reviewScope && doc.targetSnapshot?.worktreeSha256 === last.targetRevision)?.doc
  if (previous?.implementationDecision?.sha256 !== sha256(await readFile(decision, 'utf8'))) return null
  return { say: `the code changed since the last review round and ${q(decision)} is the one that round read: update it with what the repair changed and why, then rerun ${rerun(directory)}` }
}

/** The blind mapping flags when its return is saved, or the instruction naming its task. */
async function blindArgs(directory, targets, given, excluded) {
  if (!(await exists(targets.blindMap))) return { args: [] }
  const found = given.blindTaskId ? { task: given.blindTaskId } : await taskFor(directory, { path: targets.blindMap, doc: await readJson(targets.blindMap) }, '--blind-task-id', { since: null, excluded })
  if (found.say) return found
  return { args: ['--blind-map', targets.blindMap, '--blind-reviewer', 'blind-mapper', '--blind-task-id', found.task] }
}

/** close at IMPLEMENTED_GREEN with every argument a person would assemble, taken from the oracle directory and the ledger. */
export async function closeCall(directory, phase, given = {}) {
  const packetAction = action(phase, 'REVIEW_VERIFIED')
  const run = packetAction?.candidateRuns[0]
  if (!run) return { say: `no fresh passing run to cite: run oracle-run.mjs guide --dir ${q(directory)} --to REVIEW_VERIFIED` }
  const decision = join(directory, 'implementation-decision.md')
  if (!(await exists(decision))) return { say: `write ${q(decision)} (what the implementation changed and why; the reviewers read it), then rerun ${rerun(directory)}` }
  const rev = phase.status.currentSnapshot.worktreeSha256
  const last = phase.ledger.findLast((entry) => entry.type === 'review-round')
  const packetRev = packetRevision(last, rev)
  const docs = await documents(directory)
  const stem = `packet-${packetRev.slice(0, 12)}`
  const packet = docs.find(({ doc }) => doc.reviewScope && doc.targetSnapshot?.worktreeSha256 === packetRev)?.path ?? join(directory, `${stem}.json`)
  const packetBytes = await readFile(packet).catch(() => null)
  const stale = packetBytes ? null : await staleDecision(directory, docs, decision, last, packetRev)
  if (stale) return stale
  const targets = {
    packet,
    freshPacket: packetBytes ? await freshPath(directory, stem, 'json', 2) : null,
    report: join(directory, 'final-report.md'),
    blindInput: join(directory, `blind-input-${rev.slice(0, 12)}.json`),
    blindMap: join(directory, `blind-map-${rev.slice(0, 12)}.json`),
    findings: join(directory, `findings-${packetRev.slice(0, 12)}.json`),
    intersect: join(directory, `intersect-${packetRev.slice(0, 12)}.json`),
  }
  const args = ['close', '--dir', directory, '--packet', packet, '--decision', decision, ...canonicalReviewPoints.flatMap(({ path }) => ['--review-point', path]),
    '--run', run, '--evidence', evidenceOf(directory, phase), '--blind-input', targets.blindInput, '--check-report', targets.report]
  const chosen = await chosenReturns(directory, reviewerReturns(docs, packetBytes, packetRev, last), given, phase.state.risk === 'high' ? 2 : 1, targets)
  if (chosen.say) return chosen
  const round = phase.ledger.findLast((entry) => entry.type === 'review-round' && entry.targetRevision === packetRev)
  const bound = new Set(phase.ledger.filter((entry) => entry.type === 'review-receipt').map((entry) => entry.taskId))
  const reviewers = await reviewerArgs(directory, chosen.returns, Boolean(packetBytes), given, { since: round?.at ?? null, excluded: bound })
  if (reviewers.say) return reviewers
  const blind = await blindArgs(directory, targets, given, bound)
  if (blind.say) return blind
  args.push(...reviewers.args, ...blind.args)
  const mutation = (packetAction.requires ?? []).filter((flag) => flag.startsWith('--mutation-'))
  if (mutation.length > 0) {
    const shown = [commandText({ script: 'oracle-run.mjs', args }), ...mutation.map((flag) => `${flag} <${flag.slice(2)}>`)].join(' ')
    return { say: `High risk: record a mutation run (production with the guard removed, the review command unchanged), then run ${shown}` }
  }
  return { calls: [{ script: 'oracle-run.mjs', args }], targets }
}

function writeReport(directory, phase, report) {
  const status = `\`Status: ${phase.status.currentState}\``
  return `write ${q(report)}: a ${status} line and the run ids it rests on with their exits (from oracle-run.mjs status --dir ${q(directory)} --json), then rerun ${rerun(directory)}`
}

/** Package sources with a `repo:` location that exist — what `oracle-lock.mjs create` takes as --source — and the scan root they share. */
async function packageSources(directory) {
  const root = directory.includes('/.ai/') ? directory.slice(0, directory.lastIndexOf('/.ai/')) : process.cwd()
  const pkg = await readJson(join(directory, 'oracle.package.json'))
  const paths = (pkg?.sources ?? []).map((source) => /^repo:(.+)$/.exec(source.location ?? '')?.[1]).filter(Boolean)
  const present = []
  for (const path of paths) if (await exists(join(root, path))) present.push(join(root, path))
  const tops = [...new Set(paths.filter((path) => !path.startsWith('.ai/')).map((path) => path.split('/')[0]))]
  return { root, sources: present, scanRoot: tops.length === 1 ? q(join(root, tops[0])) : '<scan-root outside .ai/>' }
}

/**
 * The repository test command's required label. A bare label is graded on a reported run, which only a trusted adapter
 * gives (`node --test`, `vitest run`); any other test script (`npm test` → a bundler, jest…) passes on its exit code, so
 * its label is `:exit`. Guessing a bare label for it made GREEN refuse REQUIRED_LABEL_GRADE after the run passed.
 */
async function repoTestLabel(root) {
  const script = (await readJson(join(root, 'package.json')))?.scripts?.test ?? ''
  if (/\bvitest\b/.test(script)) return { label: 'repo-test', how: 'a reported run: give step `npx vitest run` for it, never watch mode' }
  if (/\bnode\b.*\s--test\b/.test(script)) return { label: 'repo-test', how: 'a reported run: give step `node --test <test files>` for it, not `npm test`' }
  const command = script ? `\`${script}\`` : 'the repository test command'
  return { label: 'repo-test:exit', how: `${command} reports no test results to the oracle, so its exit code is the grade` }
}

/**
 * The DRAFTED card checks step runs itself, both read-only: the lock's Draft lint with each failure placed in the generated
 * region or a hand-written section (oracle-cycle.mjs card-lint), and the repository policy candidates a reviewer reads.
 */
function draftChecks(directory, root) {
  const card = join(directory, 'oracle.md')
  return [
    { script: 'oracle-cycle.mjs', args: ['card-lint', '--dir', directory] },
    { script: 'oracle-verify.mjs', args: ['card', '--oracle', card, '--repo-policies'], cwd: root, label: 'repo-policies' },
  ]
}

/** The `failed` record of an oracle-cycle.mjs result, or null when the output is not its JSON (another check failed). */
function failedOf(result) {
  try {
    return JSON.parse(result.stdout || 'null')?.failed ?? null
  } catch {
    return null
  }
}

const numberedList = (issues) => issues.map((issue, index) => `${index + 1}) ${issue}`).join('; ')

/**
 * A failed DRAFTED lint as one instruction. An issue of the generated region is a package patch (re-projected, so the
 * walk asks for --reason) unless the rule takes a hand-written line; one only the hand-written sections raise is a card
 * edit outside the markers, which check-card does not read: no rewind.
 */
function cardLintSay(directory, result) {
  const failed = failedOf(result)
  if (failed?.code !== 'CARD_LINT_FAILED') return failed?.next ?? `fix the cause above, then rerun ${rerun(directory)}`
  const card = q(join(directory, 'oracle.md'))
  const parts = []
  if (failed.generated.length > 0)
    parts.push(
      `in the package, one patch (re-projected; the walk then asks for --reason gate-failure), or where the rule takes a hand-written line (a sourced N/A, the Interaction sweep) in ${card} outside the generated markers: ${numberedList(failed.generated)}`,
    )
  if (failed.handWritten.length > 0) parts.push(`in ${card} outside the generated markers, no rewind: ${numberedList(failed.handWritten)}`)
  return `the lock would refuse the card: fix ${parts.join('; and ')}; then rerun ${rerun(directory)}`
}

/** The review kinds stage.json lists as dispatched since the last rewind (none before the first stage record). */
async function reviewsSent(directory) {
  const record = await readJson(join(directory, STAGE_FILE))
  if (!Array.isArray(record?.history)) return []
  return dispatchedSinceLastRewind(record)
}

/**
 * What comes after DRAFTED, in order: the card reviews, the touched-file lint, the user's approval, then the lock. A
 * review stage.json lists as dispatched since the last rewind is not named again: a second dispatch of the same card
 * counts as another dispatch, and a repair (a rewind) makes the next one the round-2 review it should be.
 */
async function lockSay(directory) {
  const { sources } = await packageSources(directory)
  const card = q(join(directory, 'oracle.md'))
  const dir = q(directory)
  const sent = new Set(await reviewsSent(directory))
  // the self source of the package is the package file itself: list each path once
  const paths = [...new Set([...sources, join(directory, 'oracle.package.json')])]
  const sourceFlags = paths.map((path) => `--source ${q(path)}`).join(' ')
  const reviews = [
    [
      'cold-read',
      `cold-read: $oracle-review in a fresh context with only \`oracle-review-view.mjs card --oracle ${card}\` and a byte copy of the card, both outside the run directory, registered with oracle-stage.mjs review-input --dir ${dir} --kind cold-read --input <that file> --attempt <dispatch id>;`,
    ],
    [
      'reverse-impossible',
      `reverse-impossible: a second fresh $oracle-review with \`oracle-verify.mjs card --oracle ${card} --ir\` and \`oracle-adequacy.mjs explore-input --card ${card} --output <file outside the repository>\`, registered with --kind reverse-impossible;`,
    ],
    ['source-aware', 'source-aware review when card/policy-sources.md applies (--kind source-aware);'],
  ].filter(([kind]) => !sent.has(kind))
  const steps = [
    ...reviews.map(([, text]) => text),
    'repair findings in the package, rerun this step to lint the repair before any round-2 input;',
    `oracle-verify.mjs card --oracle ${card} --path <files the change touches>;`,
    'show the user the card and get explicit approval;',
    `oracle-lock.mjs create --oracle ${card} --lock ${q(join(directory, 'oracle.lock.json'))} ${sourceFlags}`,
  ]
  const numbered = steps.map((text, index) => `(${index + 1}) ${text}`).join(' ')
  const done = sent.size > 0 ? ` (dispatched since the last rewind, not again: ${[...sent].join(', ')})` : ''
  return `before the user sees ${card}, in order${done}: ${numbered}`
}

/** The preflight's issues as one instruction: all of them in one patch, before the walk records a gate. */
function preflightSay(directory, result) {
  const failed = failedOf(result)
  if (failed?.code !== 'PREFLIGHT_ISSUES') return failed?.next ?? `fix the cause above, then rerun ${rerun(directory)}`
  // before the first projection a rule a hand-written card line satisfies cannot be satisfied: the walk itself projects the card
  const beforeCard = failed.beforeCard
    ? `; if only issues a hand-written card line settles are left (a sourced N/A, the Interaction sweep, an Open question), run oracle-cycle.mjs walk --dir ${q(directory)} yourself: it projects oracle.md, then write those lines there`
    : ''
  return `the walk has not run: fix all ${failed.issues.length} in one package patch (a card-lint issue may instead take a hand-written line in oracle.md outside the generated markers), each refused by a gate after MODELED (repaired after that gate passes, one costs a rewind): ${numberedList(failed.issues)}; then rerun ${rerun(directory)}${beforeCard}`
}

/** Each next of the table: what step runs (`calls`), the one instruction it prints (`say`), and the read-only `checks` it runs first. */
const PLANS = {
  async begin(directory) {
    if ((await exists(join(directory, 'oracle.package.json'))) || (await exists(join(directory, 'oracle.md')))) return { calls: [{ script: 'oracle-stage.mjs', args: ['begin', '--dir', directory] }] }
    return { say: `write ${q(join(directory, 'oracle.package.json'))} with $oracle-intake (sources, requirements, Space discovery), then rerun ${rerun(directory)}` }
  },
  // preflight first: every issue a gate after MODELED would refuse, while a package patch still costs no rewind
  walk: (directory) => ({
    checks: [{ script: 'oracle-cycle.mjs', args: ['preflight', '--dir', directory] }],
    calls: [{ script: 'oracle-cycle.mjs', args: ['walk', '--dir', directory] }],
    failed: (result) => preflightSay(directory, result),
  }),
  walkReason: (directory) => ({ say: `the package or Bend inputs changed after a passed gate: run oracle-cycle.mjs walk --dir ${q(directory)} --reason ${REASONS} naming why` }),
  // the lock is the user's approval: step runs the card lints, then prints the reviews, the approval and the lock in order
  async lock(directory) {
    const { root } = await packageSources(directory)
    return {
      checks: draftChecks(directory, root),
      say: await lockSay(directory),
      failed: (result) => cardLintSay(directory, result),
    }
  },
  extend: (directory) => {
    const approval = q(join(directory, 'explicit-user-approval.json'))
    return { say: `ask the user to approve more authoring rounds, save it as ${approval}, then run oracle-stage.mjs extend --dir ${q(directory)} --approval ${approval}` }
  },
  async init(directory) {
    const { root, scanRoot } = await packageSources(directory)
    const lock = q(join(directory, 'oracle.lock.json'))
    const { label, how } = await repoTestLabel(root)
    return { say: `start the Delivery run: oracle-run.mjs init --dir ${q(directory)} --lock ${lock} --scan-root ${scanRoot} --required-label ${label} (${label}: ${how}), then rerun ${rerun(directory)}` }
  },
  // NEEDS_DECISION is the user's: step names the choice and runs nothing
  revise: () => ({ say: 'NEEDS_DECISION, the user decides: rewrite the sources and start the revision in a new oracle directory (oracle-stage.mjs begin on it), or stop here' }),
  guide: (directory, phase) => ({ calls: [{ script: 'oracle-run.mjs', args: ['guide', '--dir', directory, '--to', /--to (\S+)/.exec(nextOf(phase.line))[1]] }], read: true }),
  async report(directory, phase) {
    const report = join(directory, 'final-report.md')
    if (!(await exists(report))) return { say: writeReport(directory, phase, report) }
    return { calls: [{ script: 'oracle-run.mjs', args: ['close', '--dir', directory, '--check-report', report] }], targets: { report } }
  },
  red: planRed,
  green: planGreen,
  exec: planExec,
  close: closeCall,
}

/** What step does at a phase line: `calls` it runs itself, or `say`, the one instruction it prints. */
export async function planStep(directory, phase, given = {}) {
  if (Object.hasOwn(PLANS, phase.key)) return { key: phase.key, ...(await PLANS[phase.key](directory, phase, given)) }
  // a line the table does not know: show it as printed and send the agent to the command that explains it
  return { key: phase.key, shown: [phase.line.split('\n')[0].slice(0, 300)], say: `step does not know this next step: read ${readNext(directory, phase)} and do what it names` }
}

/** The plan step would follow on this oracle directory now — what the model replays check against their table. */
export async function stepPlan(directory, given = {}) {
  return planStep(directory, await readPhase(directory), given)
}

function reviewerSay(directory, flags, targets) {
  const parts = []
  if (flags.includes('--findings')) parts.push(`dispatch $oracle-review in a fresh context with ${q(targets.packet)} and save its return unchanged as ${q(targets.findings)}`)
  if (flags.includes('--intersect')) parts.push(`a second $oracle-review in another fresh context, its return saved as ${q(targets.intersect)}`)
  if (flags.includes('--blind-map')) parts.push(`a blind mapper given only ${q(targets.blindInput)}, its return saved as ${q(targets.blindMap)}`)
  return `${parts.join('; ')}; then rerun ${rerun(directory)}`
}

/** The action that answers a refusal: step's own words where it chose the files, else the command's `next:` line. */
function refusalAction(directory, phase, { call, head, walked, lines, targets }) {
  const waiting = /waiting for reviewer output: (.*)/.exec(head)
  if (waiting) return reviewerSay(directory, waiting[1], targets)
  if (head.includes('does not answer')) return reviewerSay(directory, '--findings', targets)
  if (head.includes('final report is not checked yet')) return writeReport(directory, phase, targets.report)
  // the CLI's remedy is a new --packet path; that sends the review out again, so step prints it and does not run it
  if (head.startsWith('REVIEW_PACKET_INVALID') && targets.freshPacket)
    return `after an exec on the current bytes if none passed since the last edit, run ${commandText(call, { '--packet': targets.freshPacket })}`
  if (walked?.code === 'STAGE_STALE') return `run oracle-cycle.mjs walk --dir ${q(directory)} --reason ${REASONS} naming why`
  return walked?.next ?? lines.find((text) => text.startsWith('next: '))?.slice(6) ?? `fix the cause above, then rerun ${rerun(directory)}`
}

/** A walk gate's detail on one line: its text's first line, or the failed checks it lists. */
function firstLine(detail) {
  if (typeof detail === 'string') return detail.split('\n')[0]
  return JSON.stringify(detail)
}

/** A refused command: its first lines and the one action that answers it. */
function refusal(directory, phase, call, result, targets = {}) {
  const walked = call.script === 'oracle-cycle.mjs' ? JSON.parse(result.stdout || 'null')?.failed : null
  const lines = walked ? [`${walked.code}: ${firstLine(walked.detail)}`] : (result.stderr || result.stdout || '').trim().split('\n')
  const head = lines[0] || `exit ${result.status}`
  const say = refusalAction(directory, phase, { call, head, walked, lines, targets })
  // close waits for a reviewer or the report: that is the agent's turn, not a refusal
  const waiting = head.startsWith('CLOSE_PENDING')
  const shown = lines.filter((text) => !text.startsWith('next: ')).slice(0, 2)
  return { refused: !waiting, shown: shown.map((text) => `${waiting ? 'WAITING' : 'REFUSED'} ${text.slice(0, 300)}`), say }
}

const callText = (call) => [call.script, call.args[0], call.label].filter(Boolean).join(' ')
/** ok, or the code a command stopped with (walk reports its failed gate on stdout). */
function outcomeText(result) {
  if (result.status === 0) return 'ok'
  const walked = /"failed":\{"step":"[^"]*","code":"(\w+)"/.exec(result.stdout ?? '')?.[1]
  return walked ?? /^([A-Z][A-Z0-9_]+):/.exec(result.stderr ?? '')?.[1] ?? `exit ${result.status}`
}
const grew = (before, after) => (after.ledger?.length ?? 0) > (before.ledger?.length ?? 0)
// the consecutive-pass gate asks for the same run again: a pass it recorded is progress even when the line stays
const flakinessLeft = (phase) => (phase.status?.nextActions ?? []).some((item) => item.blockers.some((code) => code.startsWith('FLAKINESS_GATE_')))

/** Runs the calls in order until one fails; null when the cap stopped it before a call. */
async function runCalls(calls, run, ran, limit) {
  let last = null
  for (const call of calls) {
    if (ran.length >= limit) return null
    const result = await run(call)
    ran.push(`${callText(call)} ${outcomeText(result)}`)
    last = { call, result }
    if (result.status !== 0) break
  }
  return last
}

/** A read (guide): its blockers and fix lines, and the first fix — or the read itself when it printed none. */
function readStop(directory, call, result) {
  const out = (result.stdout ?? '').split('\n')
  const fixes = out.filter((text) => text.startsWith('fix '))
  const shown = [...out.filter((text) => text.startsWith('blockers:')), ...fixes].slice(0, 3)
  if (fixes.length > 0) return { shown, say: `${fixes[0]}, then rerun ${rerun(directory)}` }
  return { shown, say: `run ${commandText(call)} and clear what it lists, then rerun ${rerun(directory)}` }
}

/** Whether the loop stops after a call, and with what: done, a read's fix lines, a refusal, or a line seen before. */
function stopAfter(directory, { step, phase, after, seen, call, result }) {
  const closed = /^CLOSED state:(\S+)/m.exec(result.stdout ?? '')
  if (closed) {
    const decision = closed[1] === 'NEEDS_DECISION' ? ' and the decision it needs' : ''
    return { say: `done: ${closed[1]} is recorded and ${q(step.targets.report)} checked; tell the user the outcome${decision}` }
  }
  if (result.status !== 0) {
    if (grew(phase, after) && (result.stderr ?? '').startsWith('FLAKINESS_GATE')) return null
    return refusal(directory, after, call, result, step.targets)
  }
  if (step.read) return readStop(directory, call, result)
  if (!seen.has(phaseOf(after.line)) || (grew(phase, after) && flakinessLeft(after))) return null
  const how = phaseOf(after.line) === phaseOf(phase.line) ? 'did not move' : 'came back to a line it had'
  return { say: `the phase ${how} after ${callText(call)}: read ${readNext(directory, after)} and do what it names` }
}

/**
 * After read-only checks that move no phase: a failed check is the refusal with the plan's own remedy; passing checks
 * go on to the plan's calls, or hand over its instruction led by the repository policy candidates the last check listed.
 */
function checked(directory, phase, step, ran, last) {
  if (!last) return { ran, phase, say: `${ran.length} commands ran, the most one call runs; rerun ${rerun(directory)} to go on` }
  if (last.result.status !== 0) {
    const say = typeof step.failed === 'function' ? step.failed(last.result) : step.failed
    return { ran, phase, ...refusal(directory, phase, last.call, last.result), say }
  }
  if (step.calls) return null
  const candidates = Number(/^REPO_POLICY_CANDIDATES (\d+)/m.exec(last.result.stdout ?? '')?.[1] ?? 0)
  const lead = candidates > 0 ? `disposition the ${candidates} repository policy candidates \`${commandText(last.call)}\` lists as sweep counterparts; then ` : ''
  return { ran, phase, say: `${lead}${step.say}` }
}

/**
 * The loop: plan, run the calls, read the phase line again — until an instruction, a stop, a line already seen in
 * this call, or `limit` commands. Calling step again and again is the agent's loop; step keeps no state between calls.
 */
export async function drive({ directory, read, plan, run, limit = MAX_AUTO_STEPS }) {
  const ran = []
  let phase = await read()
  const seen = new Set([phaseOf(phase.line)])
  for (;;) {
    const step = await plan(phase)
    if (step.checks) {
      const stop = checked(directory, phase, step, ran, await runCalls(step.checks, run, ran, limit))
      if (stop) return stop
    }
    if (step.say) return { ran, phase, say: step.say, shown: step.shown }
    if (step.calls.length === 0) return { ran, phase, say: `step found nothing to run for this next step: read ${readNext(directory, phase)} and do what it names` }
    const last = await runCalls(step.calls, run, ran, limit)
    if (!last) return { ran, phase, say: `${ran.length} commands ran, the most one call runs; rerun ${rerun(directory)} to go on` }
    const after = await read()
    const stop = stopAfter(directory, { step, phase, after, seen, ...last })
    if (stop) return { ran, phase: after, ...stop }
    seen.add(phaseOf(after.line))
    phase = after
  }
}

export function runCall(call) {
  return spawnSync(process.execPath, [join(SCRIPTS, call.script), ...call.args], { cwd: call.cwd ?? process.cwd(), encoding: 'utf8', maxBuffer: 1 << 26 })
}

const FLAGS = {
  '--dir': 'dir', '--label': 'label', '--findings': 'findings', '--intersect': 'intersect',
  '--task-id': 'taskId', '--intersect-task-id': 'intersectTaskId', '--blind-task-id': 'blindTaskId',
}
const USAGE = 'usage: oracle-step.mjs --dir <oracle dir> [--label <label> -- <test command>] [--findings <file>] [--intersect <file>] [--task-id <id>] [--intersect-task-id <id>] [--blind-task-id <id>]'

function parse(argv) {
  const split = argv.indexOf('--')
  const own = split === -1 ? argv : argv.slice(0, split)
  const options = split === -1 ? {} : { command: argv.slice(split + 1) }
  for (let index = 0; index < own.length; index += 2) {
    if (!FLAGS[own[index]] || own[index + 1] === undefined) throw new Error(USAGE)
    options[FLAGS[own[index]]] = own[index + 1]
  }
  if (!options.dir || options.command?.length === 0) throw new Error(USAGE)
  return options
}

/** The printed answer, at most six lines: the commands step ran, the phase, up to three shown lines, and the one instruction last. */
export function render(outcome) {
  const phase = phaseOf(outcome.phase.line).split(' · next:')[0]
  const ran = outcome.ran.length > 0 ? [`ran: ${outcome.ran.join('; ')}`] : []
  return [...ran, phase, ...(outcome.shown ?? []).slice(0, 3), `NEXT FOR YOU: ${outcome.say}`].join('\n')
}

async function main() {
  const given = parse(process.argv.slice(2))
  const directory = resolve(given.dir)
  const outcome = await drive({
    directory,
    read: () => readPhase(directory),
    plan: (phase) => planStep(directory, phase, given),
    run: async (call) => {
      const report = call.args.indexOf('--report')
      if (report !== -1) await mkdir(dirname(call.args[report + 1]), { recursive: true })
      return runCall(call)
    },
  })
  process.stdout.write(`${render(outcome)}\n`)
  process.exitCode = outcome.refused ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? 'STEP_FAILED'}: ${error.message}\n`)
    process.exitCode = 2
  })
}
