#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const lockScript = join(dirname(fileURLToPath(import.meta.url)), 'oracle-lock.mjs')
const verifyScript = join(dirname(fileURLToPath(import.meta.url)), 'oracle-verify.mjs')

const FLAG_NAMES = [
  'dir',
  'lock',
  'risk',
  'scan-root',
  'required-label',
  'harness-path',
  'milestone',
  'label',
  'report',
  'env-note',
  'to',
  'run',
  'row',
  'evidence',
  'findings',
  'intersect',
  'reason',
  'spend',
]

const REQUIRED_CONSECUTIVE_PASSES = { low: 1, medium: 2, high: 3 }

const BUDGET_LIMITS = { policy: 2, harness: 2, product: 3 }

const TRANSITIONS = {
  ORACLE_READY: ['VALID_RED', 'IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'],
  VALID_RED: ['IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'],
  IMPLEMENTED_GREEN: ['REVIEW_VERIFIED', 'NEEDS_DECISION', 'FAIL'],
  REVIEW_VERIFIED: ['NEEDS_DECISION', 'FAIL'],
  NEEDS_DECISION: ['ORACLE_READY', 'FAIL'],
  FAIL: [],
}

const TEST_PATH_SEGMENTS = new Set(['__test__', '__tests__', '__mocks__', '__snapshots__'])

const ASSERTION_TOKENS = ['expect(', 'assert.', 'assert(']

/** 기존 테스트에서 새로 늘어나면 약화로 보는 토큰. 감소·유지는 통과한다. */
const WEAKENING_TOKENS = [
  'test.skip',
  'it.skip',
  'describe.skip',
  '.only(',
  'waitForTimeout(',
  'toBeTruthy(',
  'toBeFalsy(',
  '.first()',
  '.nth(',
  'setTimeout(',
  'maxDiffPixels',
  'maxDiffPixelRatio',
  'threshold',
]

/** 값이 커지면 약화인 허용치. 토큰 수가 그대로여도 상향을 잡는다. */
const TOLERANCE_TOKENS = ['maxDiffPixels', 'maxDiffPixelRatio', 'threshold']

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache'])

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function parseOptions(args) {
  const options = { command: null, requiredLabels: [], harnessPaths: [], milestones: [] }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]

    if (flag === '--') {
      options.command = args.slice(index + 1)
      break
    }

    const name = flag.startsWith('--') ? flag.slice(2) : ''
    const value = args[index + 1]

    if (!FLAG_NAMES.includes(name) || value === undefined) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${flag}`, 2)
    }

    if (name === 'required-label') options.requiredLabels.push(value)
    else if (name === 'harness-path') options.harnessPaths.push(value)
    else if (name === 'milestone') options.milestones.push(value)
    else options[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
    index += 1
  }

  return options
}

function portablePath(from, to) {
  return relative(from, to).split(sep).join('/')
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isTestPath(path) {
  const segments = path.split('/')
  const name = segments.at(-1)

  return (
    segments.some((segment) => TEST_PATH_SEGMENTS.has(segment)) ||
    /\.(test|spec)\.[a-z]+$/.test(name) ||
    name.endsWith('.snap')
  )
}

async function validateHarnessPaths(root, values) {
  const rootRealPath = await realpath(root).catch((error) => {
    throw new CliError('HARNESS_PATH_INVALID', `Cannot read scan root: ${error.message}`)
  })
  const paths = []

  for (const value of values) {
    const path = value.trim()
    const hasPattern = ['*', '?', '[', ']', '{', '}'].some((token) => path.includes(token))
    if (!path || isAbsolute(path) || path.includes('\\') || hasPattern) {
      throw new CliError('HARNESS_PATH_INVALID', `${value}: expected an exact relative file path`)
    }

    const absolute = resolve(root, path)
    const portable = portablePath(root, absolute)
    if (!portable || portable === '..' || portable.startsWith('../')) {
      throw new CliError('HARNESS_PATH_INVALID', `${value}: path must stay inside the scan root`)
    }

    let details
    try {
      details = await Promise.all([stat(absolute), realpath(absolute)])
    } catch (error) {
      throw new CliError('HARNESS_PATH_INVALID', `${value}: ${error.message}`)
    }

    const [metadata, real] = details
    const realRelative = relative(rootRealPath, real)
    if (
      !metadata.isFile() ||
      realRelative === '..' ||
      realRelative.startsWith(`..${sep}`) ||
      isAbsolute(realRelative)
    ) {
      throw new CliError('HARNESS_PATH_INVALID', `${value}: expected a file inside the scan root`)
    }

    if (!paths.includes(portable)) paths.push(portable)
  }

  return paths
}

function selectedDigests(snapshot, paths) {
  return Object.fromEntries(paths.map((path) => [path, snapshot[path] ?? null]))
}

function sameDigests(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function contractRowIds(card) {
  return [...card.matchAll(/^\|\s*([OD]\d+)\s*\|/gm)].map((match) => match[1])
}

function parseMilestones(values, availableRows) {
  const names = new Set()
  const claimedRows = new Set()

  return values.map((value) => {
    const separator = value.indexOf(':')
    const name = value.slice(0, separator).trim()
    const rows = value
      .slice(separator + 1)
      .split(',')
      .map((row) => row.trim())
      .filter(Boolean)

    if (separator < 1 || !/^[a-z0-9][a-z0-9_-]*$/.test(name) || rows.length === 0 || names.has(name)) {
      throw new CliError('MILESTONE_INVALID', `${value}: expected unique name:O1,O2`)
    }

    for (const row of rows) {
      if (!availableRows.includes(row)) throw new CliError('MILESTONE_INVALID', `${value}: unknown row ${row}`)
      if (claimedRows.has(row))
        throw new CliError('MILESTONE_INVALID', `${row}: row belongs to more than one milestone`)
      claimedRows.add(row)
    }
    names.add(name)
    return { name, rows }
  })
}

function requiredMilestoneRuns(milestones, ledger) {
  return milestones.map((milestone) => {
    let index = -1
    for (let candidate = 0; candidate < ledger.length; candidate += 1) {
      if (ledger[candidate].label === `red:${milestone.name}`) index = candidate
    }
    if (index < 0) {
      throw new CliError(
        'MILESTONE_RED_MISSING',
        `${milestone.name}: expected reported run labeled red:${milestone.name}`,
      )
    }

    const run = ledger[index]
    if (run.exitCode === 0 || run.grade !== 'reported' || !run.tests?.some((test) => test.status === 'failed')) {
      throw new CliError('MILESTONE_RED_INVALID', `${run.runId}: red:${milestone.name} must be a reported failing run`)
    }
    return { ...milestone, index, run }
  })
}

function countOccurrences(content, token) {
  return content.split(token).length - 1
}

function highestTolerance(content, token) {
  const values = [...content.matchAll(new RegExp(`${token}\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)`, 'g'))].map((match) =>
    Number(match[1]),
  )

  return values.length > 0 ? Math.max(...values) : null
}

function measureTestFile(content) {
  const banned = {}
  for (const token of WEAKENING_TOKENS) {
    const count = countOccurrences(content, token)
    if (count > 0) banned[token] = count
  }

  const tolerances = {}
  for (const token of TOLERANCE_TOKENS) {
    const highest = highestTolerance(content, token)
    if (highest !== null) tolerances[token] = highest
  }

  return {
    sha256: sha256(content),
    assertions: ASSERTION_TOKENS.reduce((total, token) => total + countOccurrences(content, token), 0),
    banned,
    tolerances,
  }
}

async function walkFiles(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  const found = []

  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      found.push(...(await walkFiles(root, path)))
    } else if (entry.isFile()) {
      found.push(path)
    }
  }

  return found
}

async function listFiles(root) {
  const git = spawnSync('git', ['-C', root, 'ls-files', '-c', '-o', '--exclude-standard', '-z'])

  if (git.status === 0) {
    return git.stdout.toString('utf8').split('\0').filter(Boolean)
  }

  return walkFiles(root)
}

async function snapshot(root, excludedPrefix) {
  const paths = (await listFiles(root)).filter((path) => !path.startsWith(excludedPrefix))
  const entries = {}

  for (const path of paths.sort()) {
    try {
      entries[path] = sha256(await readFile(join(root, path)))
    } catch {
      // 읽을 수 없는 항목(심볼릭 링크, 경합 중 삭제)은 비교 대상에서 제외한다.
    }
  }

  return entries
}

function changedPaths(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])

  return [...paths].filter((path) => before[path] !== after[path]).sort()
}

function statePath(directory) {
  return join(directory, 'run-state.json')
}

function ledgerPath(directory) {
  return join(directory, 'runs.jsonl')
}

async function readState(directory) {
  try {
    return JSON.parse(await readFile(statePath(directory), 'utf8'))
  } catch (error) {
    throw new CliError('STATE_INVALID', `Cannot read run state: ${error.message}`)
  }
}

async function writeState(directory, state) {
  await writeFile(statePath(directory), `${JSON.stringify(state, null, 2)}\n`)
}

async function readLedger(directory) {
  try {
    const raw = await readFile(ledgerPath(directory), 'utf8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new CliError('LEDGER_INVALID', `Cannot read run ledger: ${error.message}`)
  }
}

/** ledger에는 run과 budget이 함께 쌓인다. 판정은 run 항목만 센다. */
async function readRuns(directory) {
  return (await readLedger(directory)).filter((entry) => (entry.type ?? 'run') === 'run')
}

async function appendLedger(directory, record) {
  await appendFile(ledgerPath(directory), `${JSON.stringify(record)}\n`)
}

function verifyLock(directory, state) {
  const lock = resolve(directory, state.lock)
  const verified = spawnSync(process.execPath, [lockScript, 'verify', '--lock', lock], { encoding: 'utf8' })

  if (verified.status !== 0) {
    const [code, ...message] = (verified.stderr || 'LOCK_INVALID: oracle-lock verify failed').split(': ')
    throw new CliError(code.trim(), message.join(': ').trim() || 'oracle-lock verify failed')
  }

  return verified.stdout.trim().replace('ORACLE_VERIFIED sha256:', '')
}

async function lockedOraclePath(directory, state) {
  const lock = resolve(directory, state.lock)
  const manifest = await readFile(lock, 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      throw new CliError('LOCK_INVALID', `Cannot read locked Oracle path: ${error.message}`)
    })

  if (!manifest?.oracle?.path) throw new CliError('LOCK_INVALID', 'Lock manifest has no Oracle path')
  return resolve(dirname(lock), manifest.oracle.path)
}

function runVerifier(args) {
  const verified = spawnSync(process.execPath, [verifyScript, ...args], { encoding: 'utf8' })

  if (verified.status !== 0) {
    const [code, ...message] = (verified.stderr || 'VERIFY_FAILED: oracle-verify failed').split(': ')
    throw new CliError(code.trim(), message.join(': ').trim() || 'oracle-verify failed')
  }

  return verified.stdout.trim()
}

function fingerprint(options) {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    tz: process.env.TZ ?? '',
    locale: process.env.LC_ALL ?? process.env.LANG ?? '',
    note: options.envNote ?? '',
  }
}

function fromJestReport(parsed) {
  return parsed.testResults.flatMap((file) =>
    (file.assertionResults ?? []).map((result) => ({
      name: result.fullName || result.title,
      status: result.status,
    })),
  )
}

function fromPlaywrightReport(suites, ancestors = []) {
  return suites.flatMap((suite) => {
    const titles = [...ancestors, suite.title].filter(Boolean)

    return [
      ...(suite.specs ?? []).map((spec) => ({
        name: [...titles, spec.title].join(' > '),
        status: spec.ok ? 'passed' : 'failed',
      })),
      ...fromPlaywrightReport(suite.suites ?? [], titles),
    ]
  })
}

function fromNodeReport(raw) {
  const tests = []

  for (const line of raw.split('\n').filter(Boolean)) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    if (event?.type === 'test:pass') tests.push({ name: event.data?.name, status: 'passed' })
    else if (event?.type === 'test:fail') tests.push({ name: event.data?.name, status: 'failed' })
  }

  return tests
}

function parseReport(raw) {
  try {
    const parsed = JSON.parse(raw)

    if (Array.isArray(parsed?.testResults)) return { tests: fromJestReport(parsed) }
    if (Array.isArray(parsed?.suites)) return { tests: fromPlaywrightReport(parsed.suites) }

    return { error: 'Unrecognized reporter shape' }
  } catch {
    const tests = fromNodeReport(raw)
    return tests.length > 0 ? { tests } : { error: 'Unrecognized reporter shape' }
  }
}

async function readReport(path) {
  if (!path) return { tests: null, error: null }

  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    return { tests: null, error: error.message }
  }

  const parsed = parseReport(raw)
  return { tests: parsed.tests ?? null, error: parsed.error ?? null }
}

async function initialize(options) {
  if (!options.dir || !options.lock) {
    throw new CliError('USAGE', 'init requires --dir and --lock', 2)
  }

  const directory = resolve(options.dir)
  const scanRoot = resolve(options.scanRoot ?? process.cwd())
  const risk = options.risk ?? 'medium'

  if (!REQUIRED_CONSECUTIVE_PASSES[risk]) {
    throw new CliError('USAGE', `Unknown risk: ${risk}`, 2)
  }

  const harnessPaths = await validateHarnessPaths(scanRoot, options.harnessPaths)

  await mkdir(directory, { recursive: true })

  // run-state를 지우고 다시 init해 기준선·예산을 되살리는 우회를 막는다.
  // append-only ledger가 남아 있으면 이 oracle-id의 판정은 이미 시작된 것이다.
  if ((await readLedger(directory)).length > 0) {
    throw new CliError(
      'RUN_ARTIFACTS_EXIST',
      `${portablePath(process.cwd(), ledgerPath(directory))} already records runs for this oracle — start a new <oracle-id> directory for a new revision`,
    )
  }

  const requiredLabels = [...new Set(options.requiredLabels.map((label) => label.trim()).filter(Boolean))]
  if (requiredLabels.length === 0) {
    throw new CliError(
      'REQUIRED_LABEL_REQUIRED',
      'init requires at least one --required-label from the repository checks',
    )
  }

  const state = {
    schemaVersion: 2,
    lock: portablePath(directory, resolve(options.lock)),
    scanRoot: portablePath(directory, scanRoot),
    risk,
    requiredLabels,
    milestones: [],
    harnessPaths,
    harnessAtValidRed: null,
    harnessBudgetAtValidRed: null,
    state: 'ORACLE_READY',
    history: [],
    budgets: Object.fromEntries(Object.entries(BUDGET_LIMITS).map(([name, limit]) => [name, { limit, spent: 0 }])),
    snapshot: {},
    testFiles: null,
    envDrift: [],
  }

  const revision = verifyLock(directory, state)
  const oracle = await readFile(await lockedOraclePath(directory, state), 'utf8')
  state.milestones = parseMilestones(options.milestones, contractRowIds(oracle))
  state.snapshot = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const untrackedHarness = harnessPaths.filter((path) => !(path in state.snapshot))
  if (untrackedHarness.length > 0) {
    throw new CliError(
      'HARNESS_PATH_INVALID',
      `harness path is outside the tracked scan snapshot: ${untrackedHarness.join(', ')}`,
    )
  }
  // oracle:nondeterminism 상태 이력은 실제 시각을 기록한다
  state.history.push({ state: 'ORACLE_READY', runId: null, reason: null, runCount: 0, at: new Date().toISOString() })

  try {
    await writeFile(statePath(directory), `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    throw new CliError(
      'RUN_ARTIFACTS_EXIST',
      'Run state already exists — start a new <oracle-id> directory for a new revision',
    )
  }

  process.stdout.write(`RUN_STATE_INITIALIZED sha256:${revision} state:ORACLE_READY\n`)
}

async function execute(options) {
  if (!options.dir || !options.label || !options.command?.length) {
    throw new CliError('USAGE', 'exec requires --dir, --label and -- <command>', 2)
  }

  const directory = resolve(options.dir)
  const state = await readState(directory)
  const revision = verifyLock(directory, state)

  const executed = spawnSync(options.command[0], options.command.slice(1), { stdio: 'inherit' })

  if (executed.error) {
    throw new CliError('COMMAND_UNRUNNABLE', `Cannot run command: ${executed.error.message}`)
  }

  const report = await readReport(options.report)
  const scanRoot = resolve(directory, state.scanRoot)
  const runId = `r-${String((await readRuns(directory)).length + 1).padStart(3, '0')}`
  const worktree = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const record = {
    type: 'run',
    runId,
    label: options.label,
    command: options.command,
    exitCode: executed.status,
    grade: report.tests ? 'reported' : 'exit-only',
    tests: report.tests,
    reportError: report.error,
    env: fingerprint(options),
    lockSha256: revision,
    worktreeSha256: sha256(JSON.stringify(worktree)),
    harnessSha256: selectedDigests(worktree, state.harnessPaths ?? []),
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  }

  await appendLedger(directory, record)
  process.stdout.write(`RUN_RECORDED ${runId} exit:${record.exitCode} grade:${record.grade}\n`)
}

function findRun(ledger, runId) {
  const record = ledger.find((entry) => entry.runId === runId)

  if (!record) {
    throw new CliError('RUN_NOT_FOUND', `${runId} is not recorded in the run ledger`)
  }

  return record
}

function lastEntryFor(state, name) {
  return [...state.history].reverse().find((entry) => entry.state === name) ?? null
}

function assertNoProductionChange(changed, harnessPaths = []) {
  const production = changed.filter((path) => !isTestPath(path) && !harnessPaths.includes(path))

  if (production.length > 0) {
    throw new CliError(
      'PRODUCTION_TOUCHED_BEFORE_RED',
      `production changed before a valid RED:\n  ${production.join('\n  ')}`,
    )
  }
}

function assertConsecutivePasses(
  state,
  ledger,
  run,
  started = lastEntryFor(state, 'VALID_RED')?.runCount ?? lastEntryFor(state, 'ORACLE_READY')?.runCount ?? 0,
) {
  const command = JSON.stringify(run.command)
  const candidates = ledger.slice(started).filter((entry) => JSON.stringify(entry.command) === command)

  let consecutive = 0
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (candidates[index].exitCode !== 0) break
    consecutive += 1
  }

  const required = REQUIRED_CONSECUTIVE_PASSES[state.risk]
  if (consecutive < required) {
    throw new CliError(
      'FLAKINESS_GATE',
      `${state.risk} risk needs required ${required} consecutive passing runs of the same command, found consecutive ${consecutive}`,
    )
  }
}

function harnessRedIndex(state, ledger, started, run, current) {
  if (!state.harnessAtValidRed || sameDigests(state.harnessAtValidRed, current)) return null

  if (state.budgets.harness.spent <= (state.harnessBudgetAtValidRed ?? 0)) {
    throw new CliError('HARNESS_BUDGET_REQUIRED', 'harness changed after VALID_RED — spend harness budget')
  }

  let redIndex = -1
  for (let index = started; index < ledger.length; index += 1) {
    const entry = ledger[index]
    const isReportedRed =
      entry.exitCode !== 0 && entry.grade === 'reported' && entry.tests?.some((test) => test.status === 'failed')
    if (isReportedRed && sameDigests(entry.harnessSha256, current)) redIndex = index
  }

  const greenIndex = ledger.findIndex((entry) => entry.runId === run.runId)
  if (redIndex < 0 || greenIndex <= redIndex) {
    throw new CliError(
      'HARNESS_RED_REQUIRED',
      'harness changed after VALID_RED — record a reported RED with the current harness, then rerun GREEN',
    )
  }

  return redIndex
}

function assertRequiredRuns(state, ledger, started) {
  for (const label of state.requiredLabels ?? []) {
    const latest = ledger
      .slice(started)
      .filter((entry) => entry.label === label)
      .at(-1)

    if (!latest || latest.exitCode !== 0) {
      throw new CliError(
        'REQUIRED_RUN_MISSING',
        `required label "${label}" needs a passing run after the previous state transition`,
      )
    }
  }
}

function assertSameCommand(expected, actual) {
  if (JSON.stringify(expected.command) !== JSON.stringify(actual.command)) {
    throw new CliError(
      'REVIEW_COMMAND_CHANGED',
      `${actual.runId} must rerun the IMPLEMENTED_GREEN command from ${expected.runId}`,
    )
  }
}

async function assertTestsNotWeakened(state, scanRoot) {
  if (!state.testFiles) return

  const weakened = []

  for (const [path, recorded] of Object.entries(state.testFiles)) {
    let content
    try {
      content = await readFile(join(scanRoot, path), 'utf8')
    } catch {
      weakened.push(`${path}: deleted after VALID_RED`)
      continue
    }

    const current = measureTestFile(content)

    if (current.assertions < recorded.assertions) {
      weakened.push(`${path}: assertions ${recorded.assertions} → ${current.assertions}`)
    }

    for (const [token, count] of Object.entries(current.banned)) {
      const before = recorded.banned[token] ?? 0
      if (count > before) weakened.push(`${path}: ${token} ${before} → ${count}`)
    }

    for (const [token, value] of Object.entries(current.tolerances)) {
      const before = recorded.tolerances?.[token]
      if (before !== undefined && value > before) weakened.push(`${path}: ${token} ${before} → ${value}`)
    }
  }

  if (weakened.length > 0) {
    throw new CliError('TEST_WEAKENED', `tests weakened since VALID_RED:\n  ${weakened.join('\n  ')}`)
  }
}

function envDrift(state, redRun, greenRun) {
  if (!redRun) return null

  const changed = Object.entries(greenRun.env)
    .filter(([key, value]) => redRun.env?.[key] !== value)
    .map(([key, value]) => `${key}: ${redRun.env?.[key] ?? ''} → ${value}`)

  if (changed.length === 0) return null

  return { from: redRun.runId, to: greenRun.runId, changed }
}

async function transition(options) {
  if (!options.dir || !options.to) {
    throw new CliError('USAGE', 'transition requires --dir and --to', 2)
  }

  const directory = resolve(options.dir)
  const state = await readState(directory)
  const allowed = TRANSITIONS[state.state] ?? []

  if (!allowed.includes(options.to)) {
    throw new CliError('TRANSITION_NOT_ALLOWED', `${state.state} cannot move to ${options.to}`)
  }

  verifyLock(directory, state)

  const ledger = await readRuns(directory)
  const scanRoot = resolve(directory, state.scanRoot)
  const notices = []

  if (options.to === 'NEEDS_DECISION' || options.to === 'FAIL') {
    if (!options.reason) throw new CliError('MISSING_REASON', `${options.to} requires --reason`)
  } else {
    if (!options.run) throw new CliError('USAGE', `${options.to} requires --run`, 2)
  }

  const run = options.run ? findRun(ledger, options.run) : null

  if (options.to === 'VALID_RED') {
    const milestones = state.milestones ?? []

    if (!options.evidence || (milestones.length === 0 && !options.row)) {
      throw new CliError(
        'EVIDENCE_REQUIRED',
        milestones.length > 0 ? 'milestone VALID_RED requires --evidence' : 'VALID_RED requires --evidence and --row',
      )
    }

    const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
    assertNoProductionChange(changedPaths(state.snapshot, current), state.harnessPaths)
    const currentHarness = selectedDigests(current, state.harnessPaths ?? [])
    const oracle = await lockedOraclePath(directory, state)

    if (milestones.length > 0) {
      const milestoneRuns = requiredMilestoneRuns(milestones, ledger)
      const last = milestoneRuns.reduce((latest, entry) => (entry.index > latest.index ? entry : latest))
      if (run.runId !== last.run.runId) {
        throw new CliError('MILESTONE_RUN_INVALID', `--run must cite the last milestone RED: ${last.run.runId}`)
      }

      for (const milestone of milestoneRuns) {
        if ((state.harnessPaths ?? []).length > 0 && !sameDigests(milestone.run.harnessSha256, currentHarness)) {
          throw new CliError('HARNESS_RED_REQUIRED', `${milestone.run.runId} predates the current harness bytes`)
        }
        for (const row of milestone.rows) {
          runVerifier([
            'red',
            '--oracle',
            oracle,
            '--map',
            resolve(options.evidence),
            '--ledger',
            ledgerPath(directory),
            '--run',
            milestone.run.runId,
            '--row',
            row,
          ])
        }
      }
    } else {
      if (run.exitCode === 0) {
        throw new CliError('RUN_NOT_RED', `${run.runId} exited 0 — a valid RED needs a failing run`)
      }
      if ((state.harnessPaths ?? []).length > 0 && !sameDigests(run.harnessSha256, currentHarness)) {
        throw new CliError('HARNESS_RED_REQUIRED', 'the selected RED predates the current harness bytes')
      }

      runVerifier([
        'red',
        '--oracle',
        oracle,
        '--map',
        resolve(options.evidence),
        '--ledger',
        ledgerPath(directory),
        '--run',
        run.runId,
        '--row',
        options.row,
      ])
    }

    state.testFiles = {}
    for (const path of Object.keys(current).filter(isTestPath)) {
      state.testFiles[path] = measureTestFile(await readFile(join(scanRoot, path), 'utf8'))
    }
    state.harnessAtValidRed = currentHarness
    state.harnessBudgetAtValidRed = state.budgets.harness.spent
  }

  if (options.to === 'IMPLEMENTED_GREEN') {
    if (run.exitCode !== 0) {
      throw new CliError('RUN_NOT_GREEN', `${run.runId} exited ${run.exitCode} — GREEN needs a passing run`)
    }

    if (!options.evidence) {
      throw new CliError('EVIDENCE_REQUIRED', 'IMPLEMENTED_GREEN requires --evidence')
    }

    if (run.grade !== 'reported') {
      throw new CliError('EVIDENCE_UNVERIFIABLE', `${run.runId} must have a parsed reporter for GREEN`)
    }

    let current = null
    if (state.state === 'ORACLE_READY' || (state.harnessPaths ?? []).length > 0) {
      current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
    }

    if (state.state === 'ORACLE_READY') {
      if (!options.reason) {
        throw new CliError('MISSING_REASON', 'skipping VALID_RED requires --reason with the existing-GREEN evidence')
      }

      assertNoProductionChange(changedPaths(state.snapshot, current), state.harnessPaths)
    }

    let started = lastEntryFor(state, 'VALID_RED')?.runCount ?? lastEntryFor(state, 'ORACLE_READY')?.runCount ?? 0
    if (state.state === 'VALID_RED' && (state.harnessPaths ?? []).length > 0) {
      const currentHarness = selectedDigests(current, state.harnessPaths)
      if (Object.values(currentHarness).some((digest) => digest === null)) {
        throw new CliError('HARNESS_PATH_INVALID', 'a registered harness file no longer exists')
      }
      const redIndex = harnessRedIndex(state, ledger, started, run, currentHarness)
      if (redIndex !== null) started = redIndex + 1
    }
    assertRequiredRuns(state, ledger, started)
    assertConsecutivePasses(state, ledger, run, started)
    await assertTestsNotWeakened(state, scanRoot)
    const evidenceResult = runVerifier([
      'evidence',
      '--oracle',
      await lockedOraclePath(directory, state),
      '--map',
      resolve(options.evidence),
      '--ledger',
      ledgerPath(directory),
      '--run',
      run.runId,
      '--phase',
      'green',
    ])
    const visualPending = evidenceResult.split('\n').find((line) => line.startsWith('VISUAL_EVIDENCE_PENDING '))
    if (visualPending) notices.push(visualPending)

    const redEntry = lastEntryFor(state, 'VALID_RED')
    const drift = envDrift(state, redEntry ? findRun(ledger, redEntry.runId) : null, run)
    if (drift) {
      state.envDrift.push(drift)
      notices.push(`ENV_DRIFT ${drift.from}→${drift.to} ${drift.changed.join(', ')}`)
    }
  }

  if (options.to === 'REVIEW_VERIFIED') {
    if (run.exitCode !== 0) {
      throw new CliError(
        'RUN_NOT_GREEN',
        `${run.runId} exited ${run.exitCode} — review needs a passing re-verification`,
      )
    }

    if (!options.evidence || !options.findings) {
      throw new CliError('EVIDENCE_REQUIRED', 'REVIEW_VERIFIED requires --evidence and --findings')
    }

    if (state.risk === 'high' && !options.intersect) {
      throw new CliError('REVIEW_EVIDENCE_REQUIRED', 'High risk REVIEW_VERIFIED requires --intersect')
    }

    if (run.grade !== 'reported') {
      throw new CliError('EVIDENCE_UNVERIFIABLE', `${run.runId} must have a parsed reporter for review`)
    }

    const greenEntry = lastEntryFor(state, 'IMPLEMENTED_GREEN')
    assertRequiredRuns(state, ledger, greenEntry.runCount)
    assertSameCommand(findRun(ledger, greenEntry.runId), run)

    const oracle = await lockedOraclePath(directory, state)
    runVerifier([
      'evidence',
      '--oracle',
      oracle,
      '--map',
      resolve(options.evidence),
      '--ledger',
      ledgerPath(directory),
      '--run',
      run.runId,
      '--phase',
      'review',
    ])

    const reviewArgs = ['review', '--oracle', oracle, '--file', resolve(options.findings)]
    if (options.intersect) reviewArgs.push('--intersect', resolve(options.intersect))
    runVerifier(reviewArgs)
  }

  state.state = options.to
  state.history.push({
    state: options.to,
    runId: run?.runId ?? null,
    reason: options.reason ?? null,
    row: options.row ?? null,
    evidence: options.evidence ? portablePath(directory, resolve(options.evidence)) : null,
    findings: options.findings ? portablePath(directory, resolve(options.findings)) : null,
    intersect: options.intersect ? portablePath(directory, resolve(options.intersect)) : null,
    runCount: ledger.length,
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  })

  await writeState(directory, state)
  process.stdout.write([`STATE_${options.to} run:${run?.runId ?? 'none'}`, ...notices, ''].join('\n'))
}

async function spendBudget(options) {
  if (!options.dir || !options.spend || !options.reason) {
    throw new CliError('USAGE', 'budget requires --dir, --spend and --reason', 2)
  }

  const directory = resolve(options.dir)
  const state = await readState(directory)
  const budget = state.budgets[options.spend]

  if (!budget) {
    throw new CliError('USAGE', `Unknown budget: ${options.spend}`, 2)
  }

  if (budget.spent >= budget.limit) {
    throw new CliError(
      'BUDGET_EXHAUSTED',
      `${options.spend} budget is spent (${budget.spent}/${budget.limit}) — report FAIL with the last real failure`,
    )
  }

  budget.spent += 1
  budget.reasons = [...(budget.reasons ?? []), options.reason]
  await writeState(directory, state)
  await appendLedger(directory, {
    type: 'budget',
    budget: options.spend,
    spent: budget.spent,
    limit: budget.limit,
    reason: options.reason,
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  })

  process.stdout.write(`BUDGET_SPENT ${options.spend} ${budget.spent}/${budget.limit}\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)

  if (command === 'init') await initialize(options)
  else if (command === 'exec') await execute(options)
  else if (command === 'transition') await transition(options)
  else if (command === 'budget') await spendBudget(options)
  else throw new CliError('USAGE', 'Expected init, exec, transition or budget', 2)
}

try {
  await main()
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
  process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
  process.exitCode = cliError.exitCode
}
