/**
 * oracle-step.mjs — the one command the controller runs: `oracle-step.mjs --dir <oracle dir>`.
 *
 * Before the lock it evaluates the authoring graph (oracle-stage.mjs) on the files as they are: the deterministic nodes
 * in order — Formal: package, model, card (projected into oracle.md, its hand-written sections kept); Contract: the
 * user's confirmation, the card — with the independent reviews between them. It prints the first failing node's issues,
 * or the reviews to dispatch (it writes their inputs outside the repository and names where each return is saved), or,
 * when every node passes, the approval and the lock. Editing is free: nothing advances or rewinds, and the lock judges
 * the whole graph again. Each review kind runs at most REVIEW_ROUNDS rounds; the same issues coming back on a third
 * edited state stop it (NEEDS_DECISION). `--check` lists every failing node at once and changes nothing in the oracle
 * directory (it may fill the model receipt cache, which only spares the lock the same model check).
 *
 * After the lock it reads the phase line `status --brief` prints (the Delivery run once run-state.json exists) and runs
 * the `next:` command itself when it is mechanical (AUTO), assembling every argument from the oracle directory and the
 * ledger; then it reads the phase line again and repeats. It stops with one instruction when the next step is the
 * agent's work (a file to write, a reviewer to dispatch, a choice between files), the user's approval or decision, or a
 * refusal. It never runs lock or init, and spends no budget by hand: the ledger shows each spend. Besides stage.json,
 * the projected card and the reports/ folder for the test reports it names, it writes only what the commands it runs
 * write. At most MAX_AUTO_STEPS commands per call; a refusal, or a phase line already seen in this call, stops it.
 *
 *   oracle-step.mjs --dir <dir> [--check] [--label <label> -- <test command>] [--findings <file>] [--intersect <file>]
 *                   [--task-id <id>] [--intersect-task-id <id>] [--blind-task-id <id>]
 *
 * A label the ledger has never run runs its test files named for it under the scan root (labelStem), `repo-test` the
 * package.json test script; `--label … -- <command>` names the command of tests named otherwise. Before close cites a
 * run it runs the GREEN command on the current bytes when no pass of it came after GREEN. `--findings`/`--intersect` pick
 * the saved reviewer returns when more than one answers the packet; a task id names the reviewer task that returned a
 * saved file, and wins over the host's receipts.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { forbiddenArgument, TRUSTED_ADAPTERS } from './oracle-adapters.mjs'
import { cardOf, cardOfRule, cardText } from './oracle-cards.mjs'
import { HOST_RECEIPTS_FILE, reviewOutputDigest } from './oracle-fs.mjs'
import { nextCommandOf, nextOf } from './oracle-next.mjs'
import { canonicalReviewPoints, deliveryBrief, requiredLabelsNotPassing, sameDigests } from './oracle-run.mjs'
import { markdownLines, sectionLines } from './oracle-space.mjs'
import {
  bindingOf, briefStatus, evaluateGraph, filesDigest, GRAPH, issuesDigest, lockTodos, phaseLine, readStage, recordCheck, REVIEW_ROUNDS,
  REVIEW_STOP_NEXT, reviewRounds, roundKinds, SAME_ISSUES_STOP, sameIssuesRun, STOP_NEXT,
} from './oracle-stage.mjs'

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
export const MAX_AUTO_STEPS = 8
/**
 * The next commands step runs itself. Each is the model's next event and decides nothing the user owns: red/green/exec
 * run the tests and record what they show, close makes the packet and binds the reviewer returns the agent saved, guide
 * and report only read. Every other next is printed.
 */
export const AUTO = new Set(['red', 'green', 'exec', 'close', 'guide', 'report'])
/** The script and subcommand each AUTO next runs. */
export const AUTO_COMMAND = Object.freeze({
  red: ['oracle-run.mjs', 'red'], green: ['oracle-run.mjs', 'green'],
  exec: ['oracle-run.mjs', 'exec'], close: ['oracle-run.mjs', 'close'], guide: ['oracle-run.mjs', 'guide'], report: ['oracle-run.mjs', 'close'],
})

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

/**
 * A label's tests are the test files named for it under the scan root, `<name>.<stem>.test.<ext>` or `<stem>.test.<ext>`:
 * the stem is the label without its grade, or a stack label's short stem (fast-check runs the generated `*.oracle.test.*`).
 */
const LABEL_STEMS = { 'fast-check': 'oracle', 'world-conformance': 'world', 'bend-proof': 'proof', 'bend-adequacy': 'adequacy', 'type-contract': 'type', 'contract-cases': 'cases' }
export const labelStem = (label) => {
  const base = label.replace(/:(?:reported|exit)$/, '')
  return LABEL_STEMS[base] ?? base
}
const TEST_FILE = /^(.+)\.(?:test|spec)\.[cm]?[jt]sx?$/
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage'])
function namedFor(name, stem) {
  const prefix = TEST_FILE.exec(name)?.[1]
  return prefix !== undefined && (prefix === stem || ['.', '-', '_'].some((separator) => prefix.endsWith(`${separator}${stem}`)))
}

/** The test files under `folder` named for `stem`; dependency, build and dot folders are skipped. */
async function stemFiles(folder, stem, found = []) {
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const path = join(folder, entry.name)
    const skipped = entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name)
    if (entry.isDirectory() && !skipped) await stemFiles(path, stem, found)
    if (entry.isFile() && namedFor(entry.name, stem)) found.push(path)
  }
  return found
}

/** vitest for TypeScript, JSX or a file that imports vitest, else node --test; null when the files need both. */
async function runnerOf(files) {
  const runners = new Set()
  for (const path of files) {
    const vitest = /\.(?:[cm]?tsx?|jsx)$/.test(path) || /\bfrom\s+['"]vitest['"]/.test(await readFile(path, 'utf8').catch(() => ''))
    runners.add(vitest ? 'vitest' : 'node-test')
  }
  return runners.size === 1 ? [...runners][0] : null
}

/**
 * The repository test command the repo-test label names (PLANS.init picked its grade from it): the package.json test
 * script when it is node --test or vitest, `npm test` for `repo-test:exit`. A script a shell would expand is the agent's.
 */
async function repoTestSource(root, label) {
  const script = (await readJson(join(root, 'package.json')))?.scripts?.test
  if (typeof script !== 'string' || /[|&;<>$`()\\]/.test(script)) return null
  if (label.endsWith(':exit')) return { command: ['npm', 'test'], adapter: null, cwd: root, note: '' }
  const words = script.trim().split(/\s+/).map((word) => word.replace(/^(['"])(.*)\1$/, '$2'))
  if (words[0] === 'node' && words.includes('--test')) return { command: [process.execPath, ...words.slice(1)], adapter: 'node-test', cwd: root, note: '' }
  if (words[0] !== 'vitest') return null
  return { command: ['npx', 'vitest', 'run', ...words.slice(1).filter((word) => word !== 'run' && word !== '--run')], adapter: 'vitest', cwd: root, note: '' }
}

/** The command of a label the ledger never ran: its named test files, run from the repository with its trusted runner. */
async function derivedSource(directory, phase, label) {
  const { root } = await packageSources(directory)
  if (/^repo-test(?::(?:reported|exit))?$/.test(label)) return repoTestSource(root, label)
  const files = (await stemFiles(resolve(directory, phase.state?.scanRoot ?? '.'), labelStem(label))).sort()
  const runner = files.length > 0 ? await runnerOf(files) : null
  if (!runner) return null
  const paths = files.map((path) => relative(root, path))
  return { command: runner === 'vitest' ? ['npx', 'vitest', 'run', ...paths] : [process.execPath, '--test', ...paths], adapter: runner, cwd: root, note: '' }
}

/** The command that runs `label`: the one given to step for it, the latest run of it in the ledger, else its named files. */
async function sourceOf(directory, phase, label, given) {
  if (given.command && given.label === label) return typedCommand(given.command)
  const run = runsOf(phase.ledger).findLast((entry) => entry.label === label)
  if (run) return { command: run.command, adapter: run.adapter ?? null, cwd: run.cwd, note: run.env?.note ?? '' }
  return derivedSource(directory, phase, label)
}

/**
 * What the CLI would refuse or misgrade, said before the run: a label without `:exit` is graded on a reported run, which
 * only a trusted adapter gives (`npm test` would pass exit-only and the transition refuse REQUIRED_LABEL_GRADE), and the
 * adapter owns the reporter, destination and leniency arguments (ADAPTER_COMMAND_INVALID).
 */
function commandIssue(directory, label, source) {
  if (label.endsWith(':exit')) return null
  const shown = source.command.map((word) => (word === process.execPath ? 'node' : word)).join(' ')
  const again = `rerun ${rerun(directory)} --label ${sh(label)} -- <node --test <test files> | npx vitest run <test files>>`
  if (!source.adapter) return { say: `${label} is graded on a reported run and \`${shown}\` reports no test results to the oracle: ${again}` }
  if (forbiddenArgument(TRUSTED_ADAPTERS[source.adapter], source.command)) return { say: `\`${shown}\` passes reporter, destination or leniency arguments the ${source.adapter} adapter owns: drop them and ${again}` }
  return null
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

/** The labels step finds no test for: the file names it runs, or the command to name for tests named otherwise. */
function scanRootShown(directory, phase) {
  if (!phase.state?.scanRoot) return 'the scan root'
  return q(resolve(directory, phase.state.scanRoot))
}
function askCommand(directory, phase, labels) {
  const where = scanRootShown(directory, phase)
  const named = labels.map((label) => (/^repo-test\b/.test(label) ? `${label}: package.json's test script, node --test or vitest` : `${label}: <name>.${labelStem(label)}.test.<mjs|ts>`))
  return `write the tests in files named for their label under ${where} (${named.join('; ')}), then rerun ${rerun(directory)}; for tests named otherwise rerun ${rerun(directory)} --label <label> -- <the command that runs them>`
}

/** exec calls for `labels`, or the instruction naming a label step has no command for. */
async function labelCalls(directory, phase, labels, given) {
  const calls = []
  for (const label of labels) {
    const source = await sourceOf(directory, phase, label, given)
    if (!source) return { say: askCommand(directory, phase, [label]) }
    const issue = commandIssue(directory, label, source)
    if (issue) return issue
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
  const again = given.command ? ` --label ${sh(given.label)} -- ${given.command.map(sh).join(' ')}` : ''
  return [
    'before the first RED, dispatch $oracle-review in adapter-pre-red mode in a fresh context with the locked Terms and observations,',
    'the adapter, the generated and hand-written tests and the product paths they call (run oracle-projection.mjs verify-generated --file <generated test> on each generated file first);',
    `repair harness defects now (free before VALID_RED), then add a ${q(join(directory, 'journal.md'))} line naming adapter-pre-red,`,
    `lock sha256:${phase.state.lockSha256}, its findings and the reviewed file hashes, and rerun ${rerun(directory)}${again}`,
  ].join(' ')
}

// a RED is a product test failing on its assertion: the conformance labels first, never a proof, adequacy or type check
const RED_FIRST = ['fast-check:reported', 'world-conformance:reported', 'contract-cases:reported']
const NOT_RED = new Set(['bend-proof:reported', 'bend-adequacy:reported', 'type-contract:reported'])
const redCandidates = (labels) => [...RED_FIRST.filter((label) => labels.includes(label)), ...labels.filter((label) => !RED_FIRST.includes(label) && !NOT_RED.has(label))]

/** The RED's label: the one given, VALID_RED's, the last failing reported product run's, else the first candidate step can run. */
async function redLabel(directory, phase, given, labels) {
  const red = historyRun(phase, 'VALID_RED') ?? runsOf(phase.ledger).findLast((run) => run.exitCode !== 0 && run.grade === 'reported' && !NOT_RED.has(run.label))
  if (given.label ?? red?.label) return given.label ?? red.label
  for (const label of redCandidates(labels)) if (await sourceOf(directory, phase, label, given)) return label
  return null
}

async function planRed(directory, phase, given) {
  const evidence = evidenceOf(directory, phase)
  if (!(await exists(evidence))) return { say: `write ${q(evidence)} mapping each card row to its test ({"schemaVersion":1,"rows":{"O1":{"kind":"test","name":"<test name>"}}}), then rerun ${rerun(directory)}` }
  const labels = phase.state.requiredLabels ?? []
  const label = await redLabel(directory, phase, given, labels)
  const source = label ? await sourceOf(directory, phase, label, given) : null
  if (!source) return { say: askCommand(directory, phase, label ? [label] : redCandidates(labels)) }
  const issue = commandIssue(directory, label, source)
  if (issue) return issue
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
    return { say: `implement the production change so the RED tests pass (a test edit after VALID_RED needs a fresh RED, one of the 2 harness spends), then rerun ${rerun(directory)}` }
  const label = red?.label ?? given.label
  const failed = red && failedOnTheseBytes(phase, red, label)
  if (failed) return { say: `${failed.runId} failed on these bytes: edit production so the RED tests pass, then rerun ${rerun(directory)}` }
  const source = label ? await sourceOf(directory, phase, label, given) : null
  if (!source) return { say: askCommand(directory, phase, label ? [label] : phase.state.requiredLabels ?? []) }
  const issue = commandIssue(directory, label, source)
  if (issue) return issue
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

/**
 * The run close cites: the newest fresh pass after GREEN of the GREEN label's own command. Another label's pass is
 * refused (REVIEW_COMMAND_CHANGED), and a packet needs a pass of that command on its bytes (REVIEW_RERUN_REQUIRED).
 */
function citedRun(phase, packetAction) {
  const green = historyRun(phase, 'IMPLEMENTED_GREEN')
  const runs = runsOf(phase.ledger)
  const sameCommand = (runId) => {
    const run = runs.find((entry) => entry.runId === runId)
    return Boolean(green) && run?.label === green.label && JSON.stringify(run.command) === JSON.stringify(green.command)
  }
  return (packetAction?.candidateRuns ?? []).find(sameCommand) ?? null
}

/** No pass to cite: step runs the GREEN command on the current bytes, then plans close again; a failure there is the implementer's. */
async function witnessCall(directory, phase) {
  const green = historyRun(phase, 'IMPLEMENTED_GREEN')
  if (!green) return { say: `no fresh passing run to cite: run oracle-run.mjs guide --dir ${q(directory)} --to REVIEW_VERIFIED` }
  const runs = runsOf(phase.ledger)
  const now = phase.status.currentSnapshot?.worktreeSha256
  const last = runs.slice(runs.indexOf(green) + 1).findLast((run) => run.label === green.label && run.worktreeSha256 === now)
  if (last?.exitCode === 0) return { say: `${last.runId} passed on these bytes and status cites no run for the review: read ${readNext(directory, phase)} and do what it names` }
  if (last) return { say: `${last.runId} failed on these bytes: edit production so the GREEN tests pass, then rerun ${rerun(directory)}` }
  const source = { command: green.command, adapter: green.adapter ?? null, cwd: green.cwd, note: green.env?.note ?? '' }
  return { calls: [await testCall(directory, phase, 'exec', green.label, source, [], 0)], again: true }
}

/** close at IMPLEMENTED_GREEN with every argument a person would assemble, taken from the oracle directory and the ledger. */
export async function closeCall(directory, phase, given = {}) {
  const packetAction = action(phase, 'REVIEW_VERIFIED')
  const run = citedRun(phase, packetAction)
  if (!run) return witnessCall(directory, phase)
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
  // a `repo:` location may name a section (`README.md#policy`): the source the lock snapshots is the file
  const paths = (Array.isArray(pkg?.sources) ? pkg.sources : []).map((source) => /^repo:([^#]+)/.exec(source?.location ?? '')?.[1]).filter(Boolean)
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

const numberedList = (issues) => issues.map((issue, index) => `${index + 1}) ${issue}`).join('; ')
const numberedSteps = (steps) => steps.map((text, index) => `(${index + 1}) ${text}`).join(' ')
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

// ---- authoring: the graph oracle-stage.mjs evaluates on the files as they are, and the reviews between its nodes

/** A path outside the working directory (a review input) printed whole. */
const qa = (path) => sh(path)
/**
 * The folder review inputs are written under: outside the repository, one per user, created 0700, and refused when it
 * is a symbolic link, another user's, or open to group or others (a shared /tmp), so nobody else can swap an input.
 */
export async function privateInputRoot(base = tmpdir()) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  const root = join(base, `oracle-review-inputs-${uid ?? 'user'}`)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const info = await lstat(root)
  const shared = uid !== null && (info.uid !== uid || (info.mode & 0o077) !== 0)
  if (info.isSymbolicLink() || !info.isDirectory() || shared) {
    throw new Error(`${root} is not a private folder of this user (a link, someone else's, or open to others): remove it and run step again`)
  }
  return root
}
/** Where a review's input is written: in the private root, one folder per oracle, review kind and input digest. */
async function inputFolder(directory, kind, digest) {
  const folder = join(await privateInputRoot(), `${basename(directory)}-${kind}-${digest.slice(0, 12)}`)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  return folder
}
// the kinds whose return is JSON: the Formal card review, and reverse-impossible, its candidates' kind before 0.129
const JSON_RETURNS = new Set(['card-review', 'reverse-impossible'])
/** Where the agent saves a review's return unchanged: in the oracle directory, named by the input digest it read. */
export const reviewReturn = (directory, kind, digest) =>
  join(directory, 'reviews', `${kind}-${digest.slice(0, 12)}.${JSON_RETURNS.has(kind) ? 'json' : 'md'}`)

/** The return saved for the input a review reads now: under its kind's name, or an older run's name for the kind. */
async function savedReturn(directory, kind, digest) {
  for (const each of roundKinds(kind)) {
    const path = reviewReturn(directory, each, digest)
    if (await exists(path)) return path
  }
  return null
}

/** The card a card review reads: the user's approval is not part of it, so recording the approval asks for no new round. */
function reviewedCard(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^## User Confirmation\s*$/.test(line))
  if (start === -1) return text
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return [...lines.slice(0, start), ...(end === -1 ? [] : lines.slice(end))].join('\n')
}

const cardDigest = async (directory) => {
  const text = await readFile(join(directory, 'oracle.md'), 'utf8').catch(() => null)
  return text === null ? null : sha256(reviewedCard(text))
}

/** A CLI's stdout saved as a file of the input folder; a failed builder leaves its first line there instead. */
function saveOutput(script, args, cwd) {
  const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 })
  return result.status === 0 ? result.stdout : `${script} ${args[0]} failed: ${(result.stderr || result.stdout).split('\n')[0]}\n`
}

/** The card copies a card read gets: the reading view and a byte copy, both outside the repository. */
async function writeCardCopies(directory, root, folder) {
  const card = join(directory, 'oracle.md')
  await writeFile(join(folder, 'view.md'), saveOutput('oracle-review-view.mjs', ['card', '--oracle', card], root))
  await copyFile(card, join(folder, 'oracle.md'))
  return [join(folder, 'view.md'), join(folder, 'oracle.md')]
}

/**
 * Each review kind: the digest of what it reads (a round is a saved return for a new digest), the input files step
 * writes for its first round, and how that round is dispatched; a second round confirms the first one's fixes
 * (reviewClause). The model analyst reads the sources only, never the model. The Formal card review is one reviewer:
 * the cold read of the card copies alone, written before it opens the reverse-impossible inputs, in one JSON return. A
 * conditional kind (source-aware: whether card/policy-sources.md's trigger applies is the author's call) is named with
 * its condition until a return is saved.
 */
const REVIEW_KINDS = {
  'model-analyst': {
    name: 'the model analyst',
    async text(directory, root) {
      const { modelInput } = await import('./oracle-adequacy.mjs')
      return modelInput({ package: join(directory, 'oracle.package.json'), cwd: root }).catch(() => null)
    },
    async digest(directory, root) {
      const text = await this.text(directory, root)
      return text === null ? null : sha256(text)
    },
    async write(directory, root, folder) {
      await writeFile(join(folder, 'model-input.md'), await this.text(directory, root))
      return [join(folder, 'model-input.md')]
    },
    say: (files, saved) => `the model analyst — $oracle-review in a fresh context with only ${files} (keep writing the model while it runs; join its world, goals and State Model into the package), its return saved unchanged as ${saved}`,
  },
  'card-review': {
    name: 'the card review',
    digest: cardDigest,
    async write(directory, root, folder) {
      const card = join(directory, 'oracle.md')
      const files = [...(await writeCardCopies(directory, root, folder)), join(folder, 'ir.json')]
      await writeFile(files[2], saveOutput('oracle-verify.mjs', ['card', '--oracle', card, '--ir'], root))
      if (/^## Adequacy\s*$/m.test(await readFile(card, 'utf8'))) {
        files.push(join(folder, 'explore-input.md'))
        const built = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-adequacy.mjs'), 'explore-input', '--card', card, '--output', files[3]], { cwd: root, encoding: 'utf8' })
        if (built.status !== 0) await writeFile(files[3], `explore-input failed: ${(built.stderr || built.stdout).split('\n')[0]}\n`)
      }
      return files
    },
    say: (files, saved) =>
      `the card review — $oracle-review in a fresh context with only ${files}: its cold read of view.md and oracle.md alone first, written before it opens the rest for the reverse-impossible attack; its one JSON return ({"coldRead": {"root", "nail", "findings"}, "candidates": [...]}) saved unchanged as ${saved}`,
  },
  'cold-read': {
    name: 'cold-read',
    digest: cardDigest,
    write: writeCardCopies,
    say: (files, saved) => `cold-read — $oracle-review in a fresh context with only ${files}, its return saved unchanged as ${saved}`,
  },
  'source-aware': {
    name: 'source-aware',
    conditional: true,
    digest: cardDigest,
    async write(directory, root, folder) {
      await copyFile(join(directory, 'oracle.md'), join(folder, 'oracle.md'))
      return [join(folder, 'oracle.md')]
    },
    say: (files, saved) =>
      `when card/policy-sources.md's trigger applies, a source-aware review — $oracle-review in a fresh context with only ${files} and the original inputs card/policy-sources.md lists (verbatim user messages, approved source excerpts); save its return unchanged as ${saved}`,
  },
}

/** Whether a saved return names a finding it still holds blocking: a line opening `BLOCKING`, or a JSON `blocking` array. */
async function holdsBlockers(file) {
  const text = await readFile(file, 'utf8').catch(() => '')
  if (!file.endsWith('.json')) return /^[ \t]*(?:[-*][ \t]+)?BLOCKING\b/m.test(text)
  try {
    const blocking = JSON.parse(text)?.blocking
    return Array.isArray(blocking) && blocking.length > 0
  } catch {
    return false
  }
}

/**
 * Why a review ends its rounds at the user's decision: a return saved past REVIEW_ROUNDS, an input changed after the
 * last round (a repair no reviewer read), or a last-round return that still holds a blocker. null while it is open.
 */
async function roundsStop(kind, { saved, file, rounds }) {
  if (rounds > REVIEW_ROUNDS) return `${kind} has ${rounds} saved returns: there is no round ${REVIEW_ROUNDS + 1}, the rounds after ${REVIEW_ROUNDS} are not counted`
  if (rounds < REVIEW_ROUNDS) return null
  if (!saved) return `${kind} ran its ${REVIEW_ROUNDS} rounds and its input changed since: no reviewer read the repair`
  return (await holdsBlockers(file)) ? `${kind} round ${REVIEW_ROUNDS} still holds blocking findings (${q(file)})` : null
}

/**
 * One review node now: its input digest, the rounds it ran (saved returns, recorded or on disk), whether step asks for
 * it, whether it is a conditional review step only names (no return saved for it yet), and why its rounds stop.
 */
async function reviewState(directory, root, record, kind) {
  const digest = await REVIEW_KINDS[kind].digest(directory, root)
  if (!digest) return null
  const file = await savedReturn(directory, kind, digest)
  const saved = file !== null
  const rounds = await reviewRounds(directory, record, kind)
  const offered = Boolean(REVIEW_KINDS[kind].conditional) && rounds === 0
  const stop = offered ? null : await roundsStop(kind, { saved, file, rounds })
  return { kind, digest, saved, file, rounds, offered, stop, wanted: !offered && !saved && rounds < REVIEW_ROUNDS }
}

/**
 * What the lock refuses on the reviews (oracle-stage.mjs judgedFiles): each review kind of the profile, and a
 * conditional one once a return opened it, needs a return saved for its current input, with no stop on its rounds.
 */
export async function reviewGate(directory, profile) {
  return (await gateStates(directory, profile)).flatMap(({ id, state }) => {
    if (!state) return [`${id}: its input cannot be built`]
    if (state.stop) return [state.stop]
    return state.offered || state.saved ? [] : [`${id}: no return saved for its current input (${q(reviewReturn(directory, id, state.digest))})`]
  })
}

/** Where the returns the lock waits for go: each review kind of the profile still open with none for its current input. */
export async function missingReturns(directory, profile) {
  return (await gateStates(directory, profile))
    .filter(({ state }) => state && !state.stop && !state.offered && !state.saved)
    .map(({ id, state }) => reviewReturn(directory, id, state.digest))
}

async function gateStates(directory, profile) {
  const { root } = await packageSources(directory)
  const record = await readStage(directory)
  const states = []
  for (const { id } of GRAPH[profile].filter(({ review }) => review)) states.push({ id, state: await reviewState(directory, root, record, id) })
  return states
}

/** The review nodes that come before `failed` in the graph (all of them when every node passes). */
async function reviewStates(directory, root, record, profile, failed) {
  const order = GRAPH[profile]
  const reach = failed ? order.findIndex(({ id }) => id === failed.id) : order.length
  const states = []
  for (const node of order.slice(0, reach).filter(({ review }) => review)) {
    const state = await reviewState(directory, root, record, node.id)
    if (state) states.push(state)
  }
  return states
}

/**
 * The return a second round continues: the kind's other saved return (an older run's under the kind's old name too), or
 * the path its recorded digest names.
 */
async function roundOneReturn(directory, record, kind, digest) {
  const own = basename(reviewReturn(directory, kind, digest))
  const names = await readdir(join(directory, 'reviews')).catch(() => [])
  const named = (name) => roundKinds(kind).some((each) => name.startsWith(`${each}-`))
  const saved = names.find((name) => named(name) && name !== own && !name.endsWith('.triage.json'))
  if (saved) return join(directory, 'reviews', saved)
  const recorded = (record?.reviews ?? []).find((entry) => entry.kind === kind && entry.digest.slice(0, 12) !== digest.slice(0, 12))
  return recorded ? reviewReturn(directory, kind, recorded.digest) : null
}

/**
 * One review as a clause: round 1 reads its whole input, written outside the repository; round 2 confirms round 1's
 * fixes, so it continues that reviewer with only its finding IDs and the repair diff (card/card-format.md).
 */
async function reviewClause(directory, root, record, { kind, digest, rounds }) {
  const review = REVIEW_KINDS[kind]
  const saved = q(reviewReturn(directory, kind, digest))
  if (rounds > 0) {
    const previous = await roundOneReturn(directory, record, kind, digest)
    return `${review.name} round 2 (confirm-fixes) — continue the round-1 reviewer with only its finding IDs (${previous ? q(previous) : 'its round-1 return'}) and the repair diff, each finding still blocking on a line opening BLOCKING (JSON: a "blocking" array of its IDs), its return saved unchanged as ${saved}`
  }
  const folder = await inputFolder(directory, kind, digest)
  const files = (await review.write(directory, root, folder)).map(qa).join(' and ')
  return review.say(files, saved)
}

/** The reviews step asks for: one clause each, dispatched together. */
async function dispatchSay(directory, root, record, wanted) {
  const parts = []
  for (const state of wanted) parts.push(await reviewClause(directory, root, record, state))
  if (parts.length === 0) return null
  await mkdir(join(directory, 'reviews'), { recursive: true })
  return `dispatch ${parts.length === 1 ? parts[0] : numberedSteps(parts)}`
}

/** A conditional review no saved return has opened (source-aware): named with its condition, before the user's approval. */
async function offerSay(directory, root, record, states) {
  const offered = states.find((state) => state.offered)
  if (!offered) return null
  await mkdir(join(directory, 'reviews'), { recursive: true })
  return reviewClause(directory, root, record, offered)
}

/**
 * The translation review: round 1 reads the mapping input written outside the repository, a reviewer who did not write
 * the model; round 2 confirms round 1's fixes. Its verdict is recorded in the package by hand with the digest the
 * reviewer read. After REVIEW_ROUNDS reviews the table is the user's to settle, recorded as `agent: "user"` with the
 * source of their decision: that record clears the check and is no review round.
 */
async function translationSay(directory, root, record) {
  const { loadPackage } = await import('./oracle-package.mjs')
  const { mappingInput } = await import('./oracle-discovery.mjs')
  const text = await mappingInput({ loaded: await loadPackage(join(directory, 'oracle.package.json'), { root }) }).catch(() => null)
  if (text === null) return null
  const rounds = await reviewRounds(directory, record, 'translation')
  if (rounds >= REVIEW_ROUNDS) return `the translation table changed after its ${REVIEW_ROUNDS} reviews: ask the user how to settle the mappings, never a third review; record their decision (not a review round): oracle-package.mjs set --dir ${q(directory)} /crossCheck/reviewedBy '{"agent":"user","source":"<where the user settled it>","inputDigest":"${sha256(text)}"}'`
  const recordIt = `record it: oracle-package.mjs set --dir ${q(directory)} /crossCheck/reviewedBy '{"agent":"<reviewer>","inputDigest":"${sha256(text)}"}'`
  if (rounds > 0) return `the translation review round 2 (confirm-fixes) — continue the round-1 reviewer with only the mappings it disputed and the repair diff; fix what it still disputes, then ${recordIt}`
  const folder = await inputFolder(directory, 'translation', sha256(text))
  await writeFile(join(folder, 'mapping-input.md'), text)
  return `dispatch the translation review — the analyst (never the model's author) with only ${qa(join(folder, 'mapping-input.md'))}; fix the mappings it disputes, then ${recordIt}`
}

/**
 * The translation review the package records: a round for the digest the reviewer read. A mapping fixed after a dispute
 * leaves that record stale, and it is still the round that ran. The user's own settlement (`agent: "user"`) is no round.
 */
async function translationReviewed(directory) {
  const review = (await readJson(join(directory, 'oracle.package.json')))?.crossCheck?.reviewedBy
  const digest = review?.inputDigest
  if (review?.agent === 'user' || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) return []
  return [{ kind: 'translation', digest }]
}

const TODO = 'package-todo: '

/**
 * A node that waits for undecided package fields: the next one in decision order as its `set` command (the package names
 * them in that order), how many remain, and the node's other issues.
 */
function todoSay(directory, todos, rest) {
  const set = `oracle-package.mjs set --dir ${q(directory)} <pointer> <value>`
  const next = `decide the ${plural(todos.length, 'open package field')} in order with ${set}, which refuses a value with its rule's fix line; next: ${todos[0].slice(TODO.length)}`
  return rest.issues.length > 0 ? `${nodeSay(directory, rest)}; and ${next}` : next
}

/**
 * A failing node as one instruction. A card issue the generated region raises is fixed in the package (step projects
 * the card again) unless the rule takes a hand-written line; one only the hand-written sections raise is an oracle.md
 * edit outside the generated markers.
 */
function nodeSay(directory, node) {
  const todos = node.issues.filter((issue) => issue.startsWith(TODO))
  if (todos.length > 0) return todoSay(directory, todos, { ...node, issues: node.issues.filter((issue) => !issue.startsWith(TODO)) })
  if (node.id === 'card' && node.handWritten?.length > 0) {
    const card = q(join(directory, 'oracle.md'))
    const generated = node.issues.filter((issue) => !node.handWritten.includes(issue))
    const parts = []
    if (generated.length > 0) parts.push(`in the package (step projects the card again), or where the rule takes a hand-written line (a sourced N/A, the Interaction sweep) in ${card} outside the generated markers: ${numberedList(generated)}`)
    parts.push(`in ${card} outside the generated markers: ${numberedList(node.handWritten)}`)
    return `fix ${parts.join('; and ')}`
  }
  const where = {
    package: `the package (${q(join(directory, 'oracle.package.json'))}, oracle-package.mjs set --dir ${q(directory)} <pointer> <value>)`,
    model: 'the package, its Bend files or sources',
    card: 'the package (step projects the card again), or where the rule takes a hand-written line in oracle.md outside the generated markers',
    confirmation: q(join(directory, 'oracle.md')),
  }[node.id] ?? q(join(directory, 'oracle.md'))
  return `fix all ${node.issues.length} in ${where}: ${numberedList(node.issues)}`
}

/** The repository's policy candidates a reviewer reads as sweep counterparts — read-only, before the approval. */
function repoPolicyLead(directory, root) {
  const card = join(directory, 'oracle.md')
  const result = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-verify.mjs'), 'card', '--oracle', card, '--repo-policies'], { cwd: root, encoding: 'utf8' })
  const candidates = Number(/^REPO_POLICY_CANDIDATES (\d+)/m.exec(result.stdout ?? '')?.[1] ?? 0)
  return candidates > 0 ? `disposition the ${candidates} repository policy candidates \`oracle-verify.mjs card --oracle ${q(card)} --repo-policies\` lists as sweep counterparts; then ` : ''
}

/** The card review's candidates triaged once per digest (oracle-adequacy.mjs triage), saved beside its return. */
async function triageLead(directory, root, states) {
  const state = states.find(({ kind, saved }) => kind === 'card-review' && saved)
  if (!state) return ''
  const saved = state.file
  const triaged = saved.replace(/\.json$/, '.triage.json')
  if (!(await exists(triaged))) {
    const args = ['triage', '--card', join(directory, 'oracle.md'), '--candidates', saved]
    const result = spawnSync(process.execPath, [join(SCRIPTS, 'oracle-adequacy.mjs'), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
    if (result.status !== 0) return `the card review's candidates do not triage (${(result.stderr || result.stdout).split('\n')[0]}): save the reviewer's JSON unchanged as ${q(saved)}; then `
    await writeFile(triaged, result.stdout)
  }
  return `record one journal line per candidate ${q(triaged)} triages (a non-covered one goes to the package or the user); then `
}

/** The `repo:` sources a Contract card's Source Registry names that exist: a Contract oracle has no package. */
async function cardSources(directory, root) {
  const text = await readFile(join(directory, 'oracle.md'), 'utf8').catch(() => '')
  const paths = sectionLines(markdownLines(text), 'Source Registry').flatMap((line) => [...line.matchAll(/repo:([^#\s|]+)/g)].map((match) => match[1]))
  const present = []
  for (const path of paths) if (await exists(join(root, path))) present.push(join(root, path))
  return present
}

/**
 * When every node passes and no review waits, in order: the source-aware review while it is only offered (Formal: the
 * approval is in this list), the touched-file lint, the user's approval (Formal: the lock lint waits for these
 * answers), then the lock.
 */
async function lockSay(directory, { pending = [], offer = null } = {}) {
  // every `repo:` source the package registers and the package file itself (Delivery init refuses a lock without it,
  // whatever its self source names) or, for Contract, the card's Source Registry names, each path once
  const { root, sources } = await packageSources(directory)
  const contract = (await bindingOf(directory)).profile === 'contract/v1'
  const card = q(join(directory, 'oracle.md'))
  const paths = [...new Set(contract ? await cardSources(directory, root) : [...sources, join(directory, 'oracle.package.json')])]
  const sourceFlags = paths.length > 0 ? paths.map((path) => `--source ${q(path)}`).join(' ') : '--source <approved-source>'
  const waiting = pending.length > 0 ? ` (the lock waits for: ${pending.join('; ')})` : ''
  // Delivery closure reads these after GREEN and a locked package never changes: they are decided before the lock
  const { nodeTodos, openTodos, todoEntries, todoIssue } = await import('./oracle-schema.mjs')
  const raw = contract ? null : await readJson(join(directory, 'oracle.package.json'))
  const open = new Set(raw ? openTodos(raw).map(({ pointer }) => pointer) : [])
  // a todo whose rule does not apply (behavior with Order and Async excluded, …) is removed: the lock takes none
  const unused = raw ? todoEntries(raw).filter(({ pointer }) => !open.has(pointer)).map(({ pointer }) => `set ${pointer} null`) : []
  const closure = [...(raw ? nodeTodos(raw, 'closure').map((todo) => todoIssue(todo).slice(TODO.length)) : []), ...unused]
  const steps = [
    ...(offer ? [`${offer};`] : []),
    `oracle-verify.mjs card --oracle ${card} --path <files the change touches>;`,
    ...(contract ? [] : [`show the user the card and record their explicit approval in its User Confirmation${waiting};`]),
    ...(closure.length > 0 ? [`a locked package holds no todo — decide what Delivery closure reads and remove what does not apply (oracle-package.mjs set --dir ${q(directory)}): ${closure.join('; ')};`] : []),
    `oracle-lock.mjs create --oracle ${card} --lock ${q(join(directory, 'oracle.lock.json'))} ${sourceFlags}`,
  ]
  return `every check passes; in order: ${numberedSteps(steps)}`
}

const nodeLine = ({ id, issues }) => `${id} ${issues.length === 0 ? 'ok' : plural(issues.length, 'issue')}`
// the oracle's id in a skeleton: the folder's name as a lowercase identifier
const oracleIdOf = (directory) => basename(resolve(directory)).toLowerCase().replaceAll(/[^\w-]+/g, '-').replace(/^[^a-z]+/, '') || 'oracle'

async function skeletonText(directory) {
  const { packageSkeleton } = await import('./oracle-schema.mjs')
  return `${JSON.stringify(packageSkeleton({ id: oracleIdOf(directory) }), null, 2)}\n`
}

/** Blank: no card, and no package or only the skeleton step wrote, untouched — nothing is decided yet. */
async function blankFolder(directory) {
  if (await exists(join(directory, 'oracle.md'))) return false
  const text = await readFile(join(directory, 'oracle.package.json'), 'utf8').catch(() => null)
  return text === null || text === (await skeletonText(directory))
}

/** Scaffold first: the package skeleton, and the Space discovery record's skeleton when the folder has none. */
async function scaffold(directory) {
  const { SPACE_DISCOVERY_FILE, spaceDiscoverySkeleton } = await import('./oracle-schema.mjs')
  const record = join(directory, SPACE_DISCOVERY_FILE)
  await mkdir(dirname(record), { recursive: true })
  if (!(await exists(join(directory, 'oracle.package.json')))) await writeFile(join(directory, 'oracle.package.json'), await skeletonText(directory))
  if (!(await exists(record))) await writeFile(record, spaceDiscoverySkeleton())
}

/** What a blank folder asks: the Space discovery record with the user first, then the package fields in order. */
async function fillSay(directory) {
  const { openTodos, SPACE_DISCOVERY_FILE, todoIssue } = await import('./oracle-schema.mjs')
  const pkg = join(directory, 'oracle.package.json')
  if (!(await exists(pkg))) return `run ${rerun(directory)}: it writes the package skeleton and the Space discovery record to fill`
  const todos = openTodos(JSON.parse(await readFile(pkg, 'utf8')))
  const record = q(join(directory, SPACE_DISCOVERY_FILE))
  return `with $oracle-intake, settle the Space discovery record ${record} with the user (each question and answer verbatim, every Case space row confirmed), then decide the ${plural(todos.length, 'open package field')} of ${q(pkg)} in order with oracle-package.mjs set --dir ${q(directory)} <pointer> <value>; first: ${todoIssue(todos[0]).slice(TODO.length)}; then rerun ${rerun(directory)}`
}

/**
 * A failing node as one instruction: the reviews waiting before it, the translation review its model issues ask for,
 * the source-aware review offered before the Contract approval it waits for, then its issues.
 */
async function failedSay(directory, root, { failed, dispatch, record, recorded, states }) {
  const translation = failed.issues.some((issue) => issue.startsWith('cross-check-unreviewed')) ? await translationSay(directory, root, recorded) : null
  const offer = failed.issues.some((issue) => issue.startsWith('user-confirmation:')) ? await offerSay(directory, root, record, states) : null
  return [dispatch, translation, offer, nodeSay(directory, failed)].filter(Boolean).join('; and ')
}

/** A blank folder's answer: the Formal skeleton step writes waits for the intake. */
async function blankAnswer(directory) {
  return { ran: [], phase: { line: phaseLine(null, rerun(directory)) }, profile: 'formal-bend/v1', position: 'intake', say: await fillSay(directory) }
}

/** A blank folder bound to Contract (`--profile contract/v1` or its stage record) gets no Formal file: the card is first. */
async function contractBlank(directory, profile) {
  return (await bindingOf(directory, profile)).profile === 'contract/v1'
}

function contractBlankAnswer(directory) {
  const card = q(join(directory, 'oracle.md'))
  const say = `with $oracle-intake (the source identities, risk and the finite axes the user confirms) and then $oracle-author, write the Contract card ${card} with its Verification Profile contract/v1 — no package, model or Space discovery record; then rerun ${rerun(directory)}`
  return { ran: [], phase: { line: phaseLine(null, rerun(directory)) }, profile: 'contract/v1', position: 'intake', say }
}

/** A failing node's position: the package shows the intake card while its next todo is one the intake decides. */
async function nodePosition(directory, node) {
  if (node.id !== 'package') return node.id
  const { openTodos } = await import('./oracle-schema.mjs')
  const pkg = await readJson(join(directory, 'oracle.package.json'))
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return 'package'
  const next = openTodos(pkg)[0]
  if (!next) return 'package'
  const card = cardOfRule(next.row?.id)
  return card === 'intake' ? 'intake' : 'package'
}

/** The phase line's next after this call: a stop, another step (a node fails or a review waits), or the lock. */
function nextKeyOf(stop, stuck, failed, wanted) {
  if (stop) return 'stop'
  if (stuck.length > 0) return 'review-stop'
  if (failed || wanted.length > 0) return 'step'
  return 'lock'
}

/**
 * One authoring call: the graph in order, the check recorded (files, issues, label, next) and the one instruction —
 * the reviews waiting before the first failing node with that node's issues, or the reviews after the last node, or
 * the lock. The same issues on a third edited state stop it.
 */
export async function authoringStep(directory, { profile } = {}) {
  if (await blankFolder(directory)) {
    if (await contractBlank(directory, profile)) return contractBlankAnswer(directory)
    await scaffold(directory)
    return blankAnswer(directory)
  }
  const { root } = await packageSources(directory)
  const binding = await bindingOf(directory)
  const graph = await evaluateGraph(directory, { binding, project: 'write' })
  const failed = graph.nodes.find(({ issues }) => issues.length > 0) ?? null
  const record = await readStage(directory)
  const states = await reviewStates(directory, root, record, graph.profile, failed)
  const wanted = states.filter((state) => state.wanted)
  const files = await filesDigest(directory)
  const issues = issuesDigest(graph.nodes)
  const stop = issues !== null && sameIssuesRun([...(record?.checks ?? []), { files, issues, node: failed?.id ?? null }]) >= SAME_ISSUES_STOP
  // a review whose rounds ended unsettled stops before any other instruction: the lock refuses it too
  const stuck = states.map((state) => state.stop).filter(Boolean)
  const next = nextKeyOf(stop, stuck, failed, wanted)
  const reviews = [...states.filter((state) => state.saved), ...(await translationReviewed(directory))]
  const recorded = await recordCheck(directory, { binding, label: graph.label, files, issues, node: failed?.id ?? null, next, reviews })
  const outcome = { ran: graph.nodes.map(nodeLine), phase: { line: phaseLine(graph.label, rerun(directory)) }, profile: graph.profile }
  const shown = failed ? [`FAILED ${failed.id}: ${failed.issues[0].slice(0, 300)}`] : []
  if (stop) return { ...outcome, position: 'decision', refused: true, shown, say: `${STOP_NEXT}: ${numberedList(failed.issues)}` }
  if (stuck.length > 0) return { ...outcome, position: 'decision', refused: true, shown, say: `${REVIEW_STOP_NEXT}: ${numberedList(stuck)}` }
  const dispatch = await dispatchSay(directory, root, record, wanted)
  if (failed) {
    const say = `${await failedSay(directory, root, { failed, dispatch, record, recorded, states })}; then rerun ${rerun(directory)}`
    return { ...outcome, position: await nodePosition(directory, failed), refused: true, shown, say }
  }
  if (dispatch) return { ...outcome, position: 'review', say: `${dispatch}; repair what they find, then rerun ${rerun(directory)}` }
  const pending = graph.nodes.flatMap((node) => node.pending ?? [])
  // Contract recorded the approval at its confirmation node: its lock line names no review that comes before it
  const offer = graph.profile === 'contract/v1' ? null : await offerSay(directory, root, record, states)
  return { ...outcome, position: 'lock', say: `${repoPolicyLead(directory, root)}${await triageLead(directory, root, states)}${await lockSay(directory, { pending, offer })}` }
}

/** A failing node in `--check`: its issues, and how many only the hand-written card sections raise. */
function failingLine({ id, issues, handWritten = [] }) {
  const own = handWritten.length > 0 ? [`(in hand-written card sections only: ${handWritten.length})`] : []
  return [`${id}: ${numberedList(issues)}`, ...own].join(' ')
}

/** `--check`'s instruction: the failing issues in one pass, the user's answers or the reviews the lock waits for, or step. */
function checkSay(directory, count, pending, reviews = []) {
  if (count > 0) return `fix all ${count} in one pass, then run ${rerun(directory)}`
  if (pending.length > 0) return `no node fails; the lock waits for the user: show them the card, record their answer in its User Confirmation, then run ${rerun(directory)}`
  if (reviews.length > 0) return `no node fails; the lock waits for the reviews listed: run ${rerun(directory)} and do what it says`
  return `no node fails: run ${rerun(directory)}`
}

/**
 * `--check`: every deterministic node with its inputs, even after an earlier one fails, on a scratch projection of the
 * card (oracle.md is not written), the answers the lock lint waits for, and the reviews waiting. Changes nothing in the
 * oracle directory (a passing model check may fill the receipt cache), and fails exactly when the lock would refuse
 * these files (a failing node or an answer it waits for).
 */
export async function checkAll(directory, { profile } = {}) {
  if (await blankFolder(directory)) return (await contractBlank(directory, profile)) ? contractBlankAnswer(directory) : blankAnswer(directory)
  const { root } = await packageSources(directory)
  const graph = await evaluateGraph(directory, { binding: await bindingOf(directory), deep: true, project: 'scratch' })
  const failing = graph.nodes.filter(({ issues }) => issues.length > 0)
  const shown = failing.map(failingLine)
  const pending = graph.nodes.flatMap((node) => node.pending ?? [])
  // the lock refuses a package with a todo left (lockTodos); while a node fails, its own todos already say so
  const left = failing.length > 0 || graph.profile === 'contract/v1' ? [] : await lockTodos(await readFile(join(directory, 'oracle.package.json'), 'utf8').catch(() => ''))
  if (left.length > 0) pending.push(`a locked package holds no todo: set or remove ${left.join(', ')}`)
  if (pending.length > 0) shown.push(`lock waits for: ${numberedList(pending)}`)
  const record = await readStage(directory)
  const waiting = (await reviewStates(directory, root, record, graph.profile, null)).filter((state) => state.wanted).map(({ kind }) => kind)
  if (waiting.length > 0) shown.push(`reviews waiting: ${waiting.join(', ')}`)
  // the lock refuses a review with no return for its current input, or whose rounds stopped (reviewGate)
  const reviews = await reviewGate(directory, graph.profile)
  if (reviews.length > 0) shown.push(`lock waits for the reviews: ${numberedList(reviews)}`)
  const count = failing.reduce((total, { issues }) => total + issues.length, 0)
  const say = checkSay(directory, count, pending, reviews)
  const position = failing.length > 0 ? await nodePosition(directory, failing[0]) : 'lock'
  return {
    ran: graph.nodes.map(nodeLine), phase: { line: phaseLine(graph.label, rerun(directory)) }, profile: graph.profile, position,
    refused: count > 0 || pending.length > 0 || reviews.length > 0, shown, shownLimit: shown.length, say,
  }
}

/**
 * Each next of the table: what step runs (`calls`) or the one instruction it prints (`say`). Before the lock step runs
 * the authoring graph itself (authoringStep); these entries are what the phase line names there.
 */
const PLANS = {
  step: (directory) => ({ say: `run ${rerun(directory)} and do what NEXT FOR YOU says` }),
  lock: async (directory) => ({ say: await lockSay(directory) }),
  // NEEDS_DECISION is the user's: step names the choice and runs nothing
  stop: () => ({ say: `${STOP_NEXT}: the issues the last oracle-step.mjs printed` }),
  async init(directory) {
    const { root, scanRoot } = await packageSources(directory)
    const lock = q(join(directory, 'oracle.lock.json'))
    const { label, how } = await repoTestLabel(root)
    return { say: `start the Delivery run: oracle-run.mjs init --dir ${q(directory)} --lock ${lock} --scan-root ${scanRoot} --required-label ${label} (${label}: ${how}), then rerun ${rerun(directory)}` }
  },
  // NEEDS_DECISION is the user's: step names the choice and runs nothing
  revise: () => ({ say: 'NEEDS_DECISION, the user decides: rewrite the sources and start the revision in a new oracle directory (oracle-step.mjs on it), or stop here' }),
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

/** The position each next of the table stops at; exec and guide stop where the phase is, an unknown line recovers. */
const POSITION_OF_KEY = { step: 'recover', lock: 'lock', stop: 'decision', revise: 'decision', init: 'init', report: 'report', red: 'red', green: 'green', close: 'close' }
const PHASE_POSITIONS = { 4: 'red', 5: 'green', 6: 'close' }
/** The Delivery position of a phase line: its phase's step, or recover before Delivery. */
const phasePosition = (phase) => PHASE_POSITIONS[/^phase (\d)\//.exec(phase.line)?.[1]] ?? 'recover'

/** What step does at a phase line: `calls` it runs itself, or `say`, the one instruction it prints, and its position. */
export async function planStep(directory, phase, given = {}) {
  if (Object.hasOwn(PLANS, phase.key)) {
    return { key: phase.key, position: POSITION_OF_KEY[phase.key] ?? phasePosition(phase), ...(await PLANS[phase.key](directory, phase, given)) }
  }
  // a line the table does not know: show it as printed and send the agent to the command that explains it
  const say = `step does not know this next step: read ${readNext(directory, phase)} and do what it names`
  return { key: phase.key, position: 'recover', shown: [phase.line.split('\n')[0].slice(0, 300)], say }
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
function refusalAction(directory, phase, { call, head, lines, targets }) {
  const waiting = /waiting for reviewer output: (.*)/.exec(head)
  if (waiting) return reviewerSay(directory, waiting[1], targets)
  if (head.includes('does not answer')) return reviewerSay(directory, '--findings', targets)
  if (head.includes('final report is not checked yet')) return writeReport(directory, phase, targets.report)
  // the CLI's remedy is a new --packet path; that sends the review out again, so step prints it and does not run it
  if (head.startsWith('REVIEW_PACKET_INVALID') && targets.freshPacket)
    return `after an exec on the current bytes if none passed since the last edit, run ${commandText(call, { '--packet': targets.freshPacket })}`
  return lines.find((text) => text.startsWith('next: '))?.slice(6) ?? `fix the cause above, then rerun ${rerun(directory)}`
}

/** Where a stopped close leaves the agent: the report it waits for, the reviewers it waits for, or a refusal. */
function waitingPosition(waiting, head) {
  if (!waiting) return 'refused'
  return head.includes('final report is not checked yet') ? 'report' : 'close'
}

/** A refused command: its first lines and the one action that answers it. */
function refusal(directory, phase, call, result, targets = {}) {
  const lines = (result.stderr || result.stdout || '').trim().split('\n')
  const head = lines[0] || `exit ${result.status}`
  const say = refusalAction(directory, phase, { call, head, lines, targets })
  // close waits for a reviewer or the report: that is the agent's turn, not a refusal
  const waiting = head.startsWith('CLOSE_PENDING')
  const shown = lines.filter((text) => !text.startsWith('next: ')).slice(0, 2)
  const position = waitingPosition(waiting, head)
  return { refused: !waiting, position, shown: shown.map((text) => `${waiting ? 'WAITING' : 'REFUSED'} ${text.slice(0, 300)}`), say }
}

const callText = (call) => [call.script, call.args[0], call.label].filter(Boolean).join(' ')
/** ok, or the code a command stopped with. */
function outcomeText(result) {
  if (result.status === 0) return 'ok'
  return /^([A-Z][A-Z0-9_]+):/.exec(result.stderr ?? '')?.[1] ?? `exit ${result.status}`
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
function readStop(directory, phase, call, result) {
  const out = (result.stdout ?? '').split('\n')
  const fixes = out.filter((text) => text.startsWith('fix '))
  const shown = [...out.filter((text) => text.startsWith('blockers:')), ...fixes].slice(0, 3)
  const position = phasePosition(phase)
  if (fixes.length > 0) return { shown, position, say: `${fixes[0]}, then rerun ${rerun(directory)}` }
  return { shown, position, say: `run ${commandText(call)} and clear what it lists, then rerun ${rerun(directory)}` }
}

/** Whether the loop stops after a call, and with what: done, a read's fix lines, a refusal, or a line seen before. */
function stopAfter(directory, { step, phase, after, seen, call, result }) {
  const closed = /^CLOSED state:(\S+)/m.exec(result.stdout ?? '')
  if (closed) {
    const decision = closed[1] === 'NEEDS_DECISION' ? ' and the decision it needs' : ''
    return { position: 'done', say: `done: ${closed[1]} is recorded and ${q(step.targets.report)} checked; tell the user the outcome${decision}` }
  }
  if (result.status !== 0) {
    if (grew(phase, after) && (result.stderr ?? '').startsWith('FLAKINESS_GATE')) return null
    return refusal(directory, after, call, result, step.targets)
  }
  if (step.read) return readStop(directory, after, call, result)
  // a recorded run the plan asked for before its own next call (the review's witness, a flaky pass) is progress on the same line
  if (!seen.has(phaseOf(after.line)) || (grew(phase, after) && (flakinessLeft(after) || step.again))) return null
  const how = phaseOf(after.line) === phaseOf(phase.line) ? 'did not move' : 'came back to a line it had'
  return { position: 'recover', say: `the phase ${how} after ${callText(call)}: read ${readNext(directory, after)} and do what it names` }
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
    if (step.say) return { ran, phase, position: step.position ?? phasePosition(phase), say: step.say, shown: step.shown }
    if (step.calls.length === 0) return { ran, phase, position: 'recover', say: `step found nothing to run for this next step: read ${readNext(directory, phase)} and do what it names` }
    const last = await runCalls(step.calls, run, ran, limit)
    if (!last) return { ran, phase, position: phasePosition(phase), say: `${ran.length} commands ran, the most one call runs; rerun ${rerun(directory)} to go on` }
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
  '--task-id': 'taskId', '--intersect-task-id': 'intersectTaskId', '--blind-task-id': 'blindTaskId', '--profile': 'profile',
}
const USAGE = 'usage: oracle-step.mjs --dir <oracle dir> [--profile <profile>] [--check] [--label <label> -- <test command>] [--findings <file>] [--intersect <file>] [--task-id <id>] [--intersect-task-id <id>] [--blind-task-id <id>]'

function parse(argv) {
  const split = argv.indexOf('--')
  const own = split === -1 ? argv : argv.slice(0, split)
  const options = split === -1 ? {} : { command: argv.slice(split + 1) }
  for (let index = 0; index < own.length; index += 2) {
    if (own[index] === '--check') {
      options.check = true
      index -= 1
      continue
    }
    if (!FLAGS[own[index]] || own[index + 1] === undefined) throw new Error(USAGE)
    options[FLAGS[own[index]]] = own[index + 1]
  }
  if (!options.dir || options.command?.length === 0) throw new Error(USAGE)
  return options
}

/**
 * The printed answer: what step ran, the phase, the shown lines (three, or every failing node for `--check`), about six
 * lines of step's own, then the card for the position (oracle-cards.mjs) and the one instruction last. A position or
 * profile without a card throws, so no stop prints without one.
 */
export function render(outcome) {
  const phase = phaseOf(outcome.phase.line).split(' · next:')[0]
  const ran = outcome.ran.length > 0 ? [`ran: ${outcome.ran.join('; ')}`] : []
  const card = cardText(cardOf(outcome.profile, outcome.position))
  return [...ran, phase, ...(outcome.shown ?? []).slice(0, outcome.shownLimit ?? 3), card, `NEXT FOR YOU: ${outcome.say}`].join('\n')
}

/** The profile whose cards a locked run shows: the Delivery run's, else the stage binding's; only Contract differs. */
async function lockedProfile(directory, phase) {
  const profile = phase.kind === 'delivery' ? phase.state.verificationProfile : (await bindingOf(directory)).profile
  return profile === 'contract/v1' ? 'contract/v1' : 'formal-bend/v1'
}

/** Authoring until the lock: no Delivery run yet and no locked stage record. */
async function authoring(directory) {
  if (await exists(join(directory, 'run-state.json'))) return false
  return (await readStage(directory).catch(() => null))?.stage !== 'ORACLE_READY'
}

async function main() {
  const given = parse(process.argv.slice(2))
  const directory = resolve(given.dir)
  const before = await authoring(directory)
  if (given.check && !before) throw new Error('--check reads the authoring graph: this oracle is locked')
  const outcome = before
    ? await (given.check ? checkAll(directory, given) : authoringStep(directory, given))
    : await drive({
      directory,
      read: () => readPhase(directory),
      plan: (phase) => planStep(directory, phase, given),
      run: async (call) => {
        const report = call.args.indexOf('--report')
        if (report !== -1) await mkdir(dirname(call.args[report + 1]), { recursive: true })
        return runCall(call)
      },
    })
  const profile = outcome.profile ?? (await lockedProfile(directory, outcome.phase))
  process.stdout.write(`${render({ ...outcome, profile })}\n`)
  process.exitCode = outcome.refused ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? 'STEP_FAILED'}: ${error.message}\n`)
    process.exitCode = 2
  })
}
