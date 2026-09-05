#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { appendFile, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { devNull } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { forbiddenArgument, isTrustedAdapter, TRUSTED_ADAPTER_NAMES, trustedAdapter } from './oracle-adapters.mjs'
import {
  assertSnapshotUnchanged,
  sha256 as fsSha256,
  isPathInside,
  pathsShareIdentity,
  snapshotRegularFile,
  stableStringify,
  ZERO_DIGEST,
} from './oracle-fs.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const lockScript = join(scriptDirectory, 'oracle-lock.mjs')
const verifyScript = join(scriptDirectory, 'oracle-verify.mjs')
// reference-graph.json이 `항상`으로 선언한 리뷰 포인트 — packet에 빠지면 reviewer가 판정 기준 없이 읽는다.
const canonicalReviewPoints = [
  { name: 'review-checklist.md', path: resolve(scriptDirectory, '../references/review-checklist.md') },
  { name: 'changeability.md', path: resolve(scriptDirectory, '../references/changeability.md') },
]

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
  'mutation-run',
  'mutation-row',
  'reason',
  'spend',
  'output',
  'decision',
  'review-point',
  'packet',
  'revision',
  'runtime',
  'model',
  'capability-context',
  'adapter',
  'role',
  'reviewer',
  'task-id',
]

const BOOLEAN_FLAGS = new Set(['json'])

const REQUIRED_CONSECUTIVE_PASSES = { low: 1, medium: 2, high: 3 }

const BUDGET_LIMITS = { policy: 2, harness: 2, product: 3 }

const TRANSITIONS = {
  ORACLE_READY: ['VALID_RED', 'IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'],
  VALID_RED: ['VALID_RED', 'IMPLEMENTED_GREEN', 'NEEDS_DECISION', 'FAIL'],
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

const SNAPSHOT_CONCURRENCY = 32

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

/** 거절 코드마다 다음 합법 행동 한 줄 — green-review.md·red.md·ledger.md의 처방 표와 같은 내용이다. */
const NEXT_ACTIONS = {
  ORACLE_CHANGED: 'discard the RED·GREEN·review evidence, show the card diff, and return to NEEDS_DECISION — never relock',
  SOURCE_CHANGED: 'discard the evidence, show the source diff, and confirm a new revision — never relock',
  LOCK_MANIFEST_CHANGED: 'discard the evidence and confirm a new revision with the changed source set — never relock',
  LOCK_INVALID: 'FAIL — the determinism judgment is impossible; do not substitute LLM judgment',
  RUN_NOT_GREEN: 'produce an actually passing run with `exec --label <label>` and cite that runId',
  RUN_NOT_RED: 'the cited run must fail on the mapped row — write the test, run `red --row <row>`',
  EVIDENCE_REQUIRED: 'generate `oracle-verify.mjs evidence-scaffold --oracle <card> > evidence.json`, fill the slots, pass --evidence',
  EVIDENCE_MISSING_ROWS: 'regenerate the scaffold from the locked card and fill only the values',
  EVIDENCE_NOT_IN_RUN: 'attach the reporter (`--adapter node-test --report <path>`) and re-run; never invent a test name',
  EVIDENCE_UNVERIFIABLE: 'the run is exit-only — re-run with `--adapter node-test --report <path>`',
  RED_EVIDENCE_MISSING: 'run the mapped test with `--adapter node-test --report <path>` so the failing name is recorded',
  RED_EVIDENCE_UNVERIFIABLE: 'an exit-only or setup failure is not RED — re-run with the reporter and a failing mapped row',
  REQUIRED_RUN_MISSING: 're-run every declared required label with `exec --label <label>` and cite the latest pass',
  FLAKINESS_GATE: 're-run the same command unchanged until consecutive passes reach the risk count; a failure is HARNESS_DEFECT',
  TEST_WEAKENED: 'restore the tests to the RED baseline — assertion count, expected-value literals, no forbidden tokens',
  PRODUCTION_TOUCHED_BEFORE_RED: 'revert the production files, write the tests first, record VALID_RED with `red`',
  HARNESS_BUDGET_REQUIRED: '`budget --spend harness --reason ...`, then a new reported RED→GREEN with the changed harness bytes',
  HARNESS_RED_REQUIRED: 'run a new reported RED→GREEN with the changed harness bytes',
  MILESTONE_RED_MISSING: 'run a reported `red:<name>` for every milestone before the global VALID_RED',
  MUTATION_EVIDENCE_REQUIRED: 'after GREEN, run the guard-removed failing run, restore, re-GREEN, and pass --mutation-run/--mutation-row',
  MUTATION_EVIDENCE_INVALID: 'the mutation must fail on the mapped row and the production digest must return exactly before review',
  REVIEW_PACKET_REQUIRED: 'generate `review-packet` and hand the reviewer its path',
  REVIEW_PACKET_STALE: 'the input changed since the packet — regenerate `review-packet`, never edit it',
  REVIEW_RERUN_REQUIRED: 're-run the GREEN command after applying findings and cite the new run',
  SNAPSHOT_STALE: 'bytes changed since GREEN — re-run the required labels and cite the new runs',
  REVIEW_RUN_STALE: 're-run the cited command against the current bytes',
  FINDINGS_BLOCKING: 'fix the PRODUCT_DEFECT findings and re-verify, or route a POLICY_GAP to NEEDS_DECISION',
  FINDINGS_INVALID: 'findings must use the six classifications and cite real card rows — regenerate the findings file',
  REVIEWER_NOT_INDEPENDENT: 'High risk needs two artifacts from different reviewerIds',
  BUDGET_EXHAUSTED: 'report FAIL with the last actual failure — never route around via another budget',
  TRANSITION_NOT_ALLOWED: 'run `status --json` and take one of nextLegalActions',
  STATE_INVALID: 'run `init` if this oracle never entered Delivery; otherwise do not edit state files — recover from the ledger with `status --json`',
  STATE_LEDGER_DIVERGENCE: 'do not edit state files — run `status --json` and recover from the ledger',
  ADAPTER_COMMAND_INVALID: 'drop the --test-reporter arguments — `--adapter node-test` injects the reporter itself',
  REPORT_MISSING: 'pass `--report <path>` and let the adapter write it',
  REPORT_STALE: 'the report predates the run — re-run with a fresh --report path',
  REPORT_PATH_EXISTS: 'choose a new --report path; an existing file cannot vouch for this run',
  RUN_ARTIFACTS_EXIST: 'a new revision gets a new <oracle-id> directory — never re-init to reset the baseline',
  ORACLE_DIR_INVALID: 'pass --dir as <repository>/.ai/oracles/<oracle-id> — an existing directory inside the scan root',
}

/** 인수 오류에는 처방이 없다 — 상태 조회 안내도 오해를 낳는다. */
const NO_NEXT_ACTION = new Set(['USAGE', 'INPUT_UNREADABLE'])

function nextActionLine(code, options) {
  if (NO_NEXT_ACTION.has(code)) return ''
  if (NEXT_ACTIONS[code]) return `next: ${NEXT_ACTIONS[code]}\n`
  let directory = ''
  if (options?.dir) directory = ` --dir ${options.dir}`
  return `next: run \`oracle-run.mjs status${directory} --json\` and take one of nextLegalActions\n`
}

function parseOptions(args) {
  const options = { command: null, requiredLabels: [], harnessPaths: [], milestones: [], reviewPoints: [] }

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]

    if (flag === '--') {
      options.command = args.slice(index + 1)
      break
    }

    const name = flag.startsWith('--') ? flag.slice(2) : ''
    if (BOOLEAN_FLAGS.has(name)) {
      options[name] = true
      continue
    }
    const value = args[index + 1]

    if (!FLAG_NAMES.includes(name) || value === undefined) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${flag}`, 2)
    }

    if (name === 'required-label') options.requiredLabels.push(value)
    else if (name === 'harness-path') options.harnessPaths.push(value)
    else if (name === 'milestone') options.milestones.push(value)
    else if (name === 'review-point') options.reviewPoints.push(value)
    else options[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
    index += 1
  }

  return options
}

function portablePath(from, to) {
  return relative(from, to).split(sep).join('/')
}

function commonAncestor(left, right) {
  const target = resolve(right)
  let candidate = resolve(left)
  while (candidate !== target && !isPathInside(candidate, target)) {
    const parent = dirname(candidate)
    if (parent === candidate) return candidate
    candidate = parent
  }
  return candidate
}

function sha256(value) {
  return fsSha256(value)
}

function isTestPath(path) {
  const segments = path.split('/')
  const name = segments.at(-1)

  return (
    segments.some((segment) => TEST_PATH_SEGMENTS.has(segment)) ||
    /\.(?:test|spec)\.[a-z]+$/.test(name) ||
    /\.test-d\.tsx?$/.test(name) ||
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
    if (!isReportedFailingRun(run)) {
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

/** 기대값 리터럴의 multiset. toBe(1)→toBe(2)처럼 개수는 같고 값만 바꾼 약화를 잡는다. */
const EXPECTED_LITERAL = String.raw`(-?\d+(?:\.\d+)?|'[^'\n]*'|"[^"\n]*"|true|false|null|undefined)`
const EXPECTED_LITERAL_PATTERNS = [
  new RegExp(String.raw`\.(?:toBe|toEqual|toStrictEqual|toHaveBeenCalledTimes|toHaveLength|toHaveTextContent|toHaveValue)\(\s*${EXPECTED_LITERAL}\s*\)`, 'g'),
  new RegExp(String.raw`assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\([^,\n]+,\s*${EXPECTED_LITERAL}\s*\)`, 'g'),
]

function expectedLiterals(content) {
  const literals = {}
  for (const pattern of EXPECTED_LITERAL_PATTERNS) {
    for (const match of content.matchAll(pattern)) literals[match[1]] = (literals[match[1]] ?? 0) + 1
  }
  return literals
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
    literals: expectedLiterals(content),
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
  const paths = (await listFiles(root)).filter((path) => !path.startsWith(excludedPrefix)).sort()
  const entries = Array.from({ length: paths.length })
  let cursor = 0
  const workers = Array.from({ length: Math.min(SNAPSHOT_CONCURRENCY, paths.length) }, async () => {
    while (cursor < paths.length) {
      const index = cursor
      cursor += 1
      const path = paths[index]

      try {
        const file = await snapshotRegularFile(join(root, path), {
          base: root,
          allowHardlinks: false,
          label: `worktree file ${path}`,
        })
        entries[index] = [path, file.sha256]
      } catch (error) {
        throw new CliError('WORKTREE_SNAPSHOT_INVALID', error.message)
      }
    }
  })
  await Promise.all(workers)

  return Object.fromEntries(entries.filter(Boolean))
}

function changedPaths(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])

  return [...paths].filter((path) => before[path] !== after[path]).sort()
}

function productionSha256(worktree, harnessPaths = []) {
  const production = Object.entries(worktree).filter(([path]) => !isTestPath(path) && !harnessPaths.includes(path))
  return sha256(JSON.stringify(production))
}

function statePath(directory) {
  return join(directory, 'run-state.json')
}

function ledgerPath(directory) {
  return join(directory, 'runs.jsonl')
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function assertLedgerSchema(entry) {
  if (
    !entry ||
    entry.schemaVersion !== 3 ||
    !isDigest(entry.digest) ||
    !isDigest(entry.previousDigest) ||
    typeof entry.type !== 'string'
  ) {
    throw new Error('invalid schema-v3 ledger record')
  }
  const strings = (fields) => fields.every((field) => typeof entry[field] === 'string' && entry[field])
  if (entry.type === 'init') {
    if (entry.state !== 'ORACLE_READY' || !entry.stateDelta || !strings(['at'])) throw new Error('invalid init event')
  } else if (entry.type === 'run') {
    const validTests =
      entry.tests === null ||
      (Array.isArray(entry.tests) &&
        entry.tests.length > 0 &&
        entry.tests.every(
          (test) =>
            test &&
            typeof test.name === 'string' &&
            test.name &&
            ['passed', 'failed', 'pending', 'skipped', 'todo', 'cancelled', 'flaky', 'expected-failure'].includes(
              test.status,
            ),
        ))
    const invalid = []
    if (!strings(['runId', 'label', 'oracleSha256', 'at'])) invalid.push('identity')
    if (!isDigest(entry.oracleSha256)) invalid.push('oracle')
    if (!isDigest(entry.lockManifestSha256)) invalid.push('manifest')
    if (!isDigest(entry.worktreeSha256)) invalid.push('worktree')
    if (!isDigest(entry.productionSha256)) invalid.push('production')
    if (
      !Array.isArray(entry.command) ||
      entry.command.length === 0 ||
      typeof entry.command[0] !== 'string' ||
      !entry.command[0] ||
      !entry.command.every((part) => typeof part === 'string')
    ) {
      invalid.push('command')
    }
    if (entry.adapter !== null && !isTrustedAdapter(entry.adapter)) invalid.push('adapter')
    if (!['reported', 'exit-only'].includes(entry.grade)) invalid.push('grade')
    if (entry.exitCode !== null && !Number.isInteger(entry.exitCode)) invalid.push('exitCode')
    if (entry.signal !== null && typeof entry.signal !== 'string') invalid.push('signal')
    if (!validTests) invalid.push('tests')
    if (entry.grade === 'reported' && (!isTrustedAdapter(entry.adapter) || !Array.isArray(entry.tests))) {
      invalid.push('reported')
    }
    if (invalid.length > 0) throw new Error(`invalid run event ${entry.runId ?? '<unknown>'}: ${invalid.join(',')}`)
  } else if (entry.type === 'budget') {
    if (
      !strings(['budget', 'reason', 'changeDigest', 'at']) ||
      !isDigest(entry.changeDigest) ||
      !Number.isInteger(entry.spent)
    )
      throw new Error('invalid budget event')
  } else if (entry.type === 'transition') {
    if (!strings(['state', 'at']) || !entry.stateDelta || typeof entry.stateDelta !== 'object')
      throw new Error('invalid transition event')
  } else if (entry.type === 'review-receipt') {
    if (
      !strings(['receiptId', 'role', 'reviewerId', 'taskId', 'at']) ||
      entry.adapter !== 'controller' ||
      !['packetSha256', 'targetRevision', 'outputSha256', 'findingsSha256', 'oracleSha256'].every((field) =>
        isDigest(entry[field]),
      )
    ) {
      throw new Error('invalid review receipt event')
    }
  } else if (entry.type === 'checkpoint') {
    if (!isDigest(entry.prefixSha256) || entry.previousDigest !== ZERO_DIGEST || !strings(['at']))
      throw new Error('invalid checkpoint event')
  } else {
    throw new Error('unknown ledger event type')
  }
}

function evidencePathFor(directory, state) {
  const evidenceEntry = [...(state.history ?? [])].reverse().find((entry) => entry.evidence)
  if (evidenceEntry?.evidence) return resolve(directory, evidenceEntry.evidence)
  return join(directory, 'evidence.json')
}

async function readState(directory) {
  try {
    return JSON.parse(await readFile(statePath(directory), 'utf8'))
  } catch (error) {
    throw new CliError('STATE_INVALID', `Cannot read run state: ${error.message}`)
  }
}

async function writeState(directory, state) {
  const path = statePath(directory)
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`)
  await rename(temp, path)
}

async function readLedger(directory) {
  try {
    const present = await lstat(ledgerPath(directory)).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!present) return []
    const ledger = await snapshotRegularFile(ledgerPath(directory), {
      base: directory,
      allowHardlinks: false,
      label: 'run ledger',
      fail: (message) => new CliError('LEDGER_INVALID', message),
    })
    const raw = ledger.bytes.toString('utf8')
    if (raw !== '' && !raw.endsWith('\n')) throw new Error('truncated JSONL record')
    const entries =
      raw === ''
        ? []
        : raw
            .slice(0, -1)
            .split('\n')
            .map((line) => {
              if (!line) throw new Error('blank JSONL record')
              return JSON.parse(line)
            })
    const runIds = new Set()
    const receiptIds = new Set()
    const checkpointIndex = entries.findIndex((entry) => entry?.schemaVersion === 3 && entry.type === 'checkpoint')
    if (checkpointIndex > 0) {
      const prefix = `${raw.split('\n').slice(0, checkpointIndex).join('\n')}\n`
      if (entries.slice(0, checkpointIndex).some((entry) => entry?.schemaVersion === 3)) {
        throw new Error('legacy prefix contains schema-v3 records')
      }
      if (entries[checkpointIndex].prefixSha256 !== sha256(prefix)) throw new Error('legacy checkpoint digest mismatch')
    } else if (checkpointIndex !== 0 && entries.some((entry) => entry?.schemaVersion !== 3)) {
      throw new Error('schema-v2 ledger requires migrate-ledger')
    }
    let previousDigest = ZERO_DIGEST
    const chainedEntries = entries.slice(Math.max(checkpointIndex, 0))
    for (const [index, entry] of chainedEntries.entries()) {
      assertLedgerSchema(entry)
      if (entry.previousDigest !== previousDigest) {
        throw new Error(`schema-v3 digest chain is invalid at ${index}:${entry.type}`)
      }
      const { digest, ...unsigned } = entry
      if (sha256(stableStringify(unsigned)) !== digest) throw new Error(`digest mismatch at ${index}:${entry.type}`)
      previousDigest = digest
      if (entry.type === 'run') {
        if (runIds.has(entry.runId)) throw new Error(`duplicate runId: ${entry.runId}`)
        runIds.add(entry.runId)
      }
      if (entry.type === 'review-receipt') {
        if (receiptIds.has(entry.receiptId)) throw new Error(`duplicate review receipt: ${entry.receiptId}`)
        receiptIds.add(entry.receiptId)
      }
    }
    return entries
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
  return withDirectoryLock(directory, 'ledger', async () => {
    const entries = await readLedger(directory)
    const previousDigest = entries.at(-1)?.digest ?? ZERO_DIGEST
    const chained = { ...record, schemaVersion: 3, previousDigest }
    chained.digest = sha256(stableStringify(chained))
    await appendFile(ledgerPath(directory), `${JSON.stringify(chained)}\n`)
    return chained
  })
}

async function migrateLedger(options) {
  if (!options.dir) throw new CliError('USAGE', 'migrate-ledger requires --dir', 2)
  const directory = resolve(options.dir)
  await withDirectoryLock(directory, 'state', async () => {
    const source = await snapshotRegularFile(ledgerPath(directory), {
      base: directory,
      allowHardlinks: false,
      label: 'legacy run ledger',
      fail: (message) => new CliError('LEDGER_INVALID', message),
    })
    const raw = source.bytes.toString('utf8')
    if (!raw || !raw.endsWith('\n'))
      throw new CliError('LEDGER_MIGRATION_INVALID', 'legacy ledger must be complete JSONL')
    const lines = raw.slice(0, -1).split('\n')
    if (lines.some((line) => !line))
      throw new CliError('LEDGER_MIGRATION_INVALID', 'legacy ledger contains blank records')
    try {
      lines.forEach((line) => JSON.parse(line))
    } catch (error) {
      throw new CliError('LEDGER_MIGRATION_INVALID', `legacy ledger is malformed: ${error.message}`)
    }
    const state = await readState(directory)
    if (state.schemaVersion !== 2)
      throw new CliError('LEDGER_MIGRATION_INVALID', 'only active schema-v2 state may migrate')
    const checkpoint = {
      schemaVersion: 3,
      type: 'checkpoint',
      prefixSha256: source.sha256,
      previousDigest: ZERO_DIGEST,
      at: new Date().toISOString(),
    }
    checkpoint.digest = sha256(stableStringify(checkpoint))
    await appendFile(ledgerPath(directory), `${JSON.stringify(checkpoint)}\n`)
    state.schemaVersion = 3
    state.ledgerHead = checkpoint.digest
    await writeState(directory, state)
  })
}

function replayState(state, ledger) {
  for (const entry of ledger) {
    if (entry.type === 'budget') {
      const budget = state.budgets?.[entry.budget]
      if (!budget) continue
      budget.spent = Math.max(budget.spent ?? 0, entry.spent ?? 0)
      if (entry.changeDigest && !(budget.digests ?? []).includes(entry.changeDigest)) {
        budget.digests = [...(budget.digests ?? []), entry.changeDigest]
      }
      if (entry.reason && !(budget.reasons ?? []).includes(entry.reason)) {
        budget.reasons = [...(budget.reasons ?? []), entry.reason]
      }
    }
    if (entry.type === 'transition') {
      const recorded = (state.history ?? []).some(
        (history) =>
          history.ledgerDigest === entry.digest ||
          (history.state === entry.state && history.runId === (entry.evidenceRunId ?? null) && history.at === entry.at),
      )
      if (recorded) continue
      if (!entry.stateDelta || typeof entry.stateDelta !== 'object') {
        throw new CliError('STATE_LEDGER_DIVERGENCE', 'transition event has no complete state delta')
      }
      Object.assign(state, entry.stateDelta)
      state.state = entry.state
      state.history ??= []
      state.history.push({
        state: entry.state,
        runId: entry.evidenceRunId ?? null,
        reason: entry.reason ?? null,
        row: entry.row ?? null,
        evidence: entry.evidence ?? null,
        findings: entry.findings ?? null,
        packet: entry.packet ?? null,
        runCount: entry.runCount ?? 0,
        at: entry.at,
        ledgerDigest: entry.digest,
      })
    }
  }
  return state
}

async function readConsistentState(directory) {
  const state = await readState(directory)
  const ledger = await readLedger(directory)
  const head = ledger.at(-1)?.digest ?? ZERO_DIGEST
  if (state.ledgerHead) {
    const anchor = ledger.findIndex((entry) => entry.digest === state.ledgerHead)
    if (anchor < 0) {
      throw new CliError('STATE_LEDGER_DIVERGENCE', 'run-state ledger head is not present in the validated ledger')
    }
    // Runs and budgets may legitimately follow the last materialized state.
    // Only unapplied transitions need a complete replay delta.
    const transitions = ledger.slice(anchor + 1).filter((entry) => entry.type === 'transition')
    if (transitions.some((entry) => !entry.stateDelta || typeof entry.stateDelta !== 'object')) {
      throw new CliError('STATE_LEDGER_DIVERGENCE', 'ledger transition has no replayable state delta')
    }
  }
  const replayed = replayState(state, ledger)
  replayed.ledgerHead = head
  return replayed
}

async function reserveRunId(directory, label = null) {
  const reservations = join(directory, '.run-ids')
  await mkdir(reservations, { recursive: true })
  let number = (await readRuns(directory)).length + 1

  for (;;) {
    const runId = `r-${String(number).padStart(3, '0')}`
    try {
      await writeFile(
        join(reservations, runId),
        `${JSON.stringify({ runId, label, state: 'started', at: new Date().toISOString() })}\n`,
        { flag: 'wx' },
      )
      return runId
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      number += 1
    }
  }
}

async function finishRunId(directory, runId) {
  const path = join(directory, '.run-ids', runId)
  const started = await readFile(path, 'utf8')
    .then(JSON.parse)
    .catch(() => ({ runId }))
  await writeFile(
    path,
    `${JSON.stringify({ ...started, state: 'finished', finishedAt: new Date().toISOString() })}
`,
  )
}

function verifyLock(directory, state) {
  const lock = resolve(directory, state.lock)
  let manifestSha256
  try {
    manifestSha256 = sha256(readFileSync(lock))
  } catch (error) {
    throw new CliError('LOCK_INVALID', `Cannot read lock manifest: ${error.message}`)
  }

  if (state.lockManifestSha256 && state.lockManifestSha256 !== manifestSha256) {
    throw new CliError('LOCK_MANIFEST_CHANGED', 'Lock manifest bytes no longer match run state')
  }

  const verified = spawnSync(process.execPath, [lockScript, 'verify', '--lock', lock], { encoding: 'utf8' })

  if (verified.status !== 0) {
    const [code, ...message] = (verified.stderr || 'LOCK_INVALID: oracle-lock verify failed').split(': ')
    throw new CliError(code.trim(), message.join(': ').trim() || 'oracle-lock verify failed')
  }

  const receipt = verified.stdout.trim().match(/^ORACLE_VERIFIED sha256:([a-f0-9]{64}) manifest-sha256:([a-f0-9]{64})$/)
  if (!receipt) throw new CliError('LOCK_INVALID', 'oracle-lock verify returned an invalid receipt')
  if (receipt[2] !== manifestSha256) {
    throw new CliError('LOCK_MANIFEST_CHANGED', 'Verified manifest bytes do not match the runner snapshot')
  }

  return {
    oracleSha256: receipt[1],
    lockManifestSha256: receipt[2],
  }
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

async function skillMetadata() {
  try {
    const pkg = JSON.parse(await readFile(join(dirname(lockScript), '..', '..', 'package.json'), 'utf8'))
    return { version: pkg.version ?? null }
  } catch {
    return { version: process.env.npm_package_version ?? null }
  }
}

function gitProvenance(root) {
  const options = { encoding: 'utf8' }
  const commit = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], options)
  const dirty = spawnSync('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=normal'], options)
  return {
    commit: commit.status === 0 ? commit.stdout.trim() : null,
    dirty: dirty.status === 0 ? dirty.stdout.trim() !== '' : null,
  }
}

async function findProjectFile(start, names) {
  let directory = resolve(start)
  for (;;) {
    for (const name of names) {
      const path = join(directory, name)
      const metadata = await stat(path).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
      if (metadata?.isFile()) return path
    }
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

async function provenance(options, state, revision, worktree) {
  const scanRoot = resolve(options.dir, state.scanRoot)
  const git = gitProvenance(scanRoot)
  const lockfilePath = await findProjectFile(scanRoot, [
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
  ])
  const packagePath = await findProjectFile(scanRoot, ['package.json'])
  let declaredPackageManager = null
  if (packagePath) {
    declaredPackageManager = await readFile(packagePath, 'utf8')
      .then(JSON.parse)
      .then((manifest) => manifest.packageManager ?? null)
      .catch(() => null)
  }
  return {
    skill: await skillMetadata(),
    runtime: options.runtime ?? null,
    model: options.model ?? null,
    targetSnapshot: {
      lockSha256: revision.oracleSha256,
      lockManifestSha256: revision.lockManifestSha256,
      worktreeSha256: sha256(JSON.stringify(worktree)),
      productionSha256: productionSha256(worktree, state.harnessPaths),
    },
    commit: options.revision ?? git.commit,
    dirty: git.dirty,
    lockfile: lockfilePath
      ? { path: portablePath(scanRoot, lockfilePath), sha256: sha256(await readFile(lockfilePath)) }
      : null,
    packageManager: {
      declared: declaredPackageManager,
      userAgent: process.env.npm_config_user_agent ?? null,
    },
    runtimeContextSha256: sha256(
      stableStringify({
        runtime: options.runtime ?? null,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        capabilityContext: options.capabilityContext ?? null,
      }),
    ),
  }
}

async function reportSignature(path) {
  if (!path) return null
  const metadata = await lstat(path).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
  if (!metadata) return null
  const snapshot = await snapshotRegularFile(path, {
    label: 'reporter artifact',
    fail: (message) => new CliError('REPORT_PATH_PROTECTED', message),
  })
  return {
    dev: snapshot.dev,
    ino: snapshot.ino,
    size: snapshot.size,
    sha256: snapshot.sha256,
    snapshot,
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

function playwrightTestStatus(test) {
  if (test?.status === 'skipped' || test?.expectedStatus === 'skipped') return 'skipped'
  if (test?.status === 'flaky') return 'flaky'
  if (test?.status === 'expected' && test?.expectedStatus === 'failed') return 'expected-failure'
  if (
    test?.status === 'expected' &&
    test?.expectedStatus === 'passed' &&
    test.results?.some((result) => result.status === 'passed')
  ) {
    return 'passed'
  }
  return 'failed'
}

function playwrightSpecStatus(tests) {
  const statuses = tests.map(playwrightTestStatus)
  if (statuses.length === 0) return 'failed'
  if (statuses.every((status) => status === 'passed')) return 'passed'
  return statuses.find((status) => status !== 'passed') ?? 'failed'
}

function fromPlaywrightReport(suites, ancestors = []) {
  return suites.flatMap((suite) => {
    const titles = [...ancestors, suite.title].filter(Boolean)

    return [
      ...(suite.specs ?? []).map((spec) => {
        return {
          name: [...titles, spec.title].join(' > '),
          // Playwright's aggregate `ok` hides skipped, expected-failure and
          // flaky attempts. Evidence accepts only actual clean project passes.
          status: playwrightSpecStatus(spec.tests ?? []),
        }
      }),
      ...fromPlaywrightReport(suite.suites ?? [], titles),
    ]
  })
}

function fromNodeReport(raw, cleanCommand = false) {
  const tests = []
  let complete = false
  const lines = raw.split('\n')
  if (lines.at(-1) !== '') return { error: 'Node reporter output is truncated' }
  for (const line of lines.slice(0, -1)) {
    if (!line) return { error: 'Node reporter output contains a blank event' }
    let event
    try {
      event = JSON.parse(line)
    } catch {
      return { error: 'Node reporter output contains malformed JSON' }
    }
    if (event?.type === 'test:complete' && event?.data?.summary === true) {
      complete = true
      continue
    }
    if (!['test:pass', 'test:fail'].includes(event?.type) || event?.data?.test !== true) {
      return { error: 'Node reporter output contains an unknown event' }
    }
    const status = event.data.status
    if (
      typeof event.data.name !== 'string' ||
      !event.data.name ||
      !['passed', 'failed', 'skipped', 'todo', 'cancelled'].includes(status)
    ) {
      return { error: 'Node reporter output has an invalid terminal test event' }
    }
    tests.push({ name: event.data.name, status })
  }
  if ((complete || cleanCommand) && tests.length > 0) return { tests }
  return { error: 'Node reporter output lacks completion or terminal tests' }
}

function parsedReport(tests) {
  return tests.length > 0 ? { tests } : { error: 'Reporter contained no tests' }
}

function parseReport(raw, cleanCommand = false) {
  if (raw.trim() === '') return { error: 'Reporter contained no tests' }
  try {
    const parsed = JSON.parse(raw)

    if (Array.isArray(parsed?.testResults)) return parsedReport(fromJestReport(parsed))
    if (Array.isArray(parsed?.suites)) return parsedReport(fromPlaywrightReport(parsed.suites))
    if (parsed?.type?.startsWith('test:')) {
      const node = fromNodeReport(raw, cleanCommand)
      return node.tests ? parsedReport(node.tests) : node
    }

    return { error: 'Unrecognized reporter shape' }
  } catch {
    const node = fromNodeReport(raw, cleanCommand)
    return node.tests ? parsedReport(node.tests) : node
  }
}

function reportNonPassing(tests) {
  return tests.find((test) => test.status !== 'passed') ?? null
}

function hasParsedTests(run) {
  return Array.isArray(run.tests) && run.tests.length > 0
}

function reportGrade(adapter, report) {
  // 신뢰 등급은 오라클이 리포터와 목적지를 소유한 실행에만 준다. 파싱된 JSON은
  // 진단 재료일 뿐 출처 보증이 아니다 — 실행된 명령 자신이 그 파일을 쓸 수 있다.
  if (!isTrustedAdapter(adapter)) return 'exit-only'
  if (!hasParsedTests(report)) return 'exit-only'
  return 'reported'
}

function hasFailedTests(run) {
  return run.tests?.some((test) => test.status === 'failed') ?? false
}

function hasOnlyPassedTests(run) {
  return hasParsedTests(run) && run.tests.every((test) => test.status === 'passed')
}

function isCompletedReportedRun(run) {
  return Number.isInteger(run.exitCode) && !run.signal && run.grade === 'reported' && hasParsedTests(run)
}

function isReportedFailingRun(run) {
  return isCompletedReportedRun(run) && run.exitCode !== 0 && hasFailedTests(run)
}

function isReportedPassingRun(run) {
  return isCompletedReportedRun(run) && run.exitCode === 0 && hasOnlyPassedTests(run)
}

function isReviewPacketShape(value) {
  return Boolean(value?.lockVerification && value?.targetSnapshot && value?.oracle && Array.isArray(value?.ledger))
}

async function testEvidenceDigest(path) {
  let document
  try {
    document = JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch (error) {
    throw new CliError('EVIDENCE_INVALID', `Cannot read test evidence bindings: ${error.message}`)
  }
  // 행뿐 아니라 PATH*·Order 시퀀스 매핑도 RED 시점에 얼린다 — 얼리지 않으면 GREEN 직전에
  // 통과하는 아무 테스트 이름으로 갈아끼울 수 있고, 그건 행 매핑에 이미 막아둔 바로 그 이동이다.
  const testNames = (entries) =>
    Object.fromEntries(
      Object.entries(entries ?? {})
        .filter(([, entry]) => entry?.kind === 'test')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, { kind: 'test', name: entry.name }]),
    )

  const sequenceBinding = (entry) => {
    if (entry?.kind !== 'test') return null
    return { kind: 'test', name: entry.name }
  }

  const bindings = {
    rows: testNames(document?.rows),
    paths: testNames(document?.paths),
    frames: testNames(document?.frames),
    sequence: sequenceBinding(document?.sequence),
  }
  return sha256(stableStringify(bindings))
}

async function readReport(path, before, cleanCommand = false) {
  if (!path) return { tests: null, error: null }

  const after = await reportSignature(path)
  if (!after) {
    return { tests: null, error: `${path}: reporter artifact was not written`, fatalCode: 'REPORT_MISSING' }
  }

  let raw
  try {
    await assertSnapshotUnchanged(after.snapshot, {
      label: 'reporter artifact',
      fail: (message) => new CliError('REPORT_STALE', message),
    })
    raw = after.snapshot.bytes.toString('utf8')
  } catch (error) {
    return { tests: null, error: error.message }
  }

  const parsed = parseReport(raw, cleanCommand)
  if (
    before &&
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.sha256 === after.sha256
  ) {
    return { tests: null, error: `${path}: reporter artifact was not rewritten by this run`, fatalCode: 'REPORT_STALE' }
  }
  if (parsed.tests) {
    const nonPassing = reportNonPassing(parsed.tests)
    if (nonPassing) {
      return {
        tests: parsed.tests,
        error: `${nonPassing.name ?? 'unnamed test'} is ${nonPassing.status}`,
        fatalCode: 'REPORT_NONPASSING',
      }
    }
  }
  return {
    tests: parsed.tests ?? null,
    error: parsed.error ?? null,
    fatalCode: parsed.error === 'Reporter contained no tests' ? 'REPORT_EMPTY' : undefined,
  }
}

async function assertReportPathAllowed(directory, state, value) {
  if (!value) return
  const report = resolve(value)
  const lock = resolve(directory, state.lock)
  const protectedPaths = [statePath(directory), ledgerPath(directory), lock, evidencePathFor(directory, state)]
  const reserved = join(directory, '.run-ids')
  if (isPathInside(reserved, report) || protectedPaths.includes(report)) {
    throw new CliError('REPORT_PATH_PROTECTED', '--report cannot target Oracle state artifacts')
  }
  for (const protectedPath of protectedPaths) {
    if (await pathsShareIdentity(report, protectedPath)) {
      throw new CliError('REPORT_PATH_PROTECTED', '--report cannot alias an Oracle state artifact')
    }
  }
  const metadata = await lstat(report).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
  if (metadata?.isSymbolicLink()) {
    throw new CliError('REPORT_PATH_PROTECTED', '--report must not be a symbolic link')
  }
}

async function initialize(options) {
  if (!options.dir || !options.lock) {
    throw new CliError('USAGE', 'init requires --dir and --lock', 2)
  }

  const directory = resolve(options.dir)
  const scanRoot = resolve(options.scanRoot ?? process.cwd())
  const risk = options.risk ?? 'medium'

  const scanRootReal = await realpath(scanRoot).catch((error) => {
    throw new CliError('ORACLE_DIR_INVALID', `Cannot resolve scan root: ${error.message}`)
  })
  const directoryReal = await realpath(directory).catch((error) => {
    throw new CliError('ORACLE_DIR_INVALID', `Cannot resolve Oracle directory: ${error.message}`)
  })
  const repositoryRoot = commonAncestor(dirname(directoryReal), scanRootReal)
  const oracleParent = join(repositoryRoot, '.ai', 'oracles')
  const oracleId = relative(oracleParent, directoryReal)
  if (isPathInside(scanRootReal, directoryReal) || isPathInside(directoryReal, scanRootReal)) {
    throw new CliError('ORACLE_DIR_OVERLAP', '--dir and --scan-root must be disjoint')
  }
  if (
    !oracleId ||
    oracleId === '..' ||
    oracleId.startsWith(`..${sep}`) ||
    oracleId.includes(sep) ||
    dirname(directoryReal) !== oracleParent
  ) {
    throw new CliError('ORACLE_DIR_INVALID', '--dir must be exactly <repository>/.ai/oracles/<oracle-id>')
  }

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
      `${portablePath(
        process.cwd(),
        ledgerPath(directory),
      )} already records runs for this oracle — start a new <oracle-id> directory for a new revision`,
    )
  }

  const requiredLabels = [...new Set(options.requiredLabels.map((label) => label.trim()).filter(Boolean))]
  if (requiredLabels.length === 0) {
    throw new CliError(
      'REQUIRED_LABEL_REQUIRED',
      'init requires at least one --required-label from the repository checks',
    )
  }
  for (const label of requiredLabels) {
    if (label.includes(':') && !/^.+:(?:reported|exit)$/.test(label)) {
      throw new CliError('REQUIRED_LABEL_INVALID', `${label}: expected <label>:reported or <label>:exit`)
    }
  }

  const state = {
    schemaVersion: 3,
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
  state.lockSha256 = revision.oracleSha256
  state.lockManifestSha256 = revision.lockManifestSha256
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
  const initializedAt = new Date().toISOString()
  state.history.push({ state: 'ORACLE_READY', runId: null, reason: null, runCount: 0, at: initializedAt })

  try {
    await writeFile(statePath(directory), `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    throw new CliError(
      'RUN_ARTIFACTS_EXIST',
      'Run state already exists — start a new <oracle-id> directory for a new revision',
    )
  }
  const initialized = await appendLedger(directory, {
    type: 'init',
    state: 'ORACLE_READY',
    stateDelta: { state: state.state, history: state.history },
    at: initializedAt,
  })
  state.ledgerHead = initialized.digest
  await writeState(directory, state)

  process.stdout.write(`RUN_STATE_INITIALIZED sha256:${revision.oracleSha256} state:ORACLE_READY\n`)
}

async function execute(options) {
  if (!options.dir || !options.label || !options.command?.length) {
    throw new CliError('USAGE', 'exec requires --dir, --label and -- <command>', 2)
  }
  const wrapperStartedAt = Date.now() // oracle:nondeterminism wrapper 소요 시간 계측

  const directory = resolve(options.dir)
  const state = await readConsistentState(directory)
  const revision = verifyLock(directory, state)
  await assertReportPathAllowed(directory, state, options.report)
  if (options.adapter && !isTrustedAdapter(options.adapter)) {
    throw new CliError('ADAPTER_INVALID', `--adapter must be one of ${TRUSTED_ADAPTER_NAMES.join(', ')}`)
  }
  const adapter = trustedAdapter(options.adapter)
  if (adapter) {
    if (!options.report) throw new CliError('REPORT_REQUIRED', `${options.adapter} adapter requires --report`)
    if (!adapter.matches(options.command, { execPath: process.execPath })) {
      throw new CliError('ADAPTER_COMMAND_INVALID', adapter.expectation)
    }
    if (forbiddenArgument(adapter, options.command)) {
      throw new CliError('ADAPTER_COMMAND_INVALID', `${options.adapter} adapter owns reporter and destination options`)
    }
  }
  const reportBefore = await reportSignature(options.report)
  if (options.adapter && reportBefore) {
    throw new CliError('REPORT_PATH_EXISTS', 'trusted adapter reports must use a new destination')
  }
  const runId = await reserveRunId(directory, options.label)
  if (adapter && reportBefore) {
    throw new CliError('REPORT_PATH_PROTECTED', `${options.adapter} adapter requires a new final report path`)
  }
  const protectedBefore = await Promise.all(
    [statePath(directory), resolve(directory, state.lock), evidencePathFor(directory, state)].map((path) =>
      reportSignature(path),
    ),
  )
  let command = options.command
  let adapterDestination = null
  let adapterEnv = null
  if (adapter) {
    const reportDirectory = join(directory, '.runner-reports')
    await mkdir(reportDirectory, { recursive: true })
    adapterDestination = join(reportDirectory, `${runId}.${adapter.extension}`)
    // 배타 생성. 이미 있으면 실패한다 — 목적지는 오라클만 만든다.
    await writeFile(adapterDestination, '', { flag: 'wx' })
    const built = adapter.build(options.command, {
      reporter: join(scriptDirectory, adapter.reporter),
      destination: adapterDestination,
    })
    command = built.command
    adapterEnv = built.env
  }
  const commandStartedAt = Date.now() // oracle:nondeterminism 명령 소요 시간 계측
  const executed = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    ...(adapterEnv ? { env: { ...process.env, ...adapterEnv } } : {}),
  })
  const commandMs = Date.now() - commandStartedAt // oracle:nondeterminism 명령 소요 시간 계측

  if (executed.error) {
    throw new CliError('COMMAND_UNRUNNABLE', `Cannot run command: ${executed.error.message}`)
  }

  if (adapterDestination && executed.status !== null) await rename(adapterDestination, resolve(options.report))
  const report = await readReport(options.report, reportBefore, executed.status !== null && !executed.signal)
  for (let index = 0; index < protectedBefore.length; index += 1) {
    if (protectedBefore[index])
      await assertSnapshotUnchanged(protectedBefore[index].snapshot, { label: 'Oracle artifact' })
  }
  const scanRoot = resolve(directory, state.scanRoot)
  const worktree = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const record = {
    type: 'run',
    runId,
    label: options.label,
    command: options.command,
    adapter: options.adapter ?? null,
    exitCode: executed.status,
    signal: executed.signal ?? null,
    grade: reportGrade(options.adapter, report),
    tests: report.tests,
    reportError: report.error,
    reportErrorCode: report.fatalCode ?? null,
    env: fingerprint(options),
    lockSha256: revision.oracleSha256,
    oracleSha256: revision.oracleSha256,
    lockManifestSha256: revision.lockManifestSha256,
    worktreeSha256: sha256(JSON.stringify(worktree)),
    productionSha256: productionSha256(worktree, state.harnessPaths),
    harnessSha256: selectedDigests(worktree, state.harnessPaths ?? []),
    provenance: await provenance(options, state, revision, worktree),
    commandMs,
    wrapperMs: Date.now() - wrapperStartedAt - commandMs, // oracle:nondeterminism wrapper 소요 시간 계측
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  }

  await appendLedger(directory, record)
  await finishRunId(directory, runId)
  if (executed.status === null || executed.signal) {
    throw new CliError('COMMAND_TERMINATED', `${runId} terminated by signal ${executed.signal ?? 'unknown'}`)
  }
  if (report.fatalCode && (executed.status === 0 || report.fatalCode !== 'REPORT_NONPASSING')) {
    throw new CliError(report.fatalCode, report.error)
  }
  process.stdout.write(
    `RUN_RECORDED ${runId} exit:${record.exitCode} grade:${record.grade} commandMs:${record.commandMs} wrapperMs:${record.wrapperMs}\n`,
  )
  return runId
}

// red/green은 exec와 상태 전이를 한 CLI 호출로 묶는다 — 게이트·검증은 그대로다.
async function executeThenTransition(options, to) {
  const runId = await execute(options)
  await transition({ ...options, to, run: runId })
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
  currentWorktree = null,
  currentLockManifest = null,
) {
  const command = JSON.stringify(run.command)
  const candidates = ledger
    .slice(started)
    .filter(
      (entry) =>
        JSON.stringify(entry.command) === command &&
        (!currentWorktree || entry.worktreeSha256 === currentWorktree) &&
        (!currentLockManifest || entry.lockManifestSha256 === currentLockManifest),
    )

  let consecutive = 0
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (!isReportedPassingRun(candidates[index])) break
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
    const isReportedRed = isReportedFailingRun(entry)
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

function assertRunFresh(record, currentWorktree, currentProduction, currentHarness, currentLockManifest, code) {
  if (record.lockManifestSha256 !== currentLockManifest) {
    throw new CliError(code, `${record.runId} predates the current lock manifest bytes`)
  }
  if (record.worktreeSha256 !== currentWorktree) {
    throw new CliError(code, `${record.runId} predates the current worktree bytes`)
  }
  if (record.productionSha256 !== currentProduction) {
    throw new CliError(code, `${record.runId} predates the current production bytes`)
  }
  if (!sameDigests(record.harnessSha256 ?? {}, currentHarness ?? {})) {
    throw new CliError(code, `${record.runId} predates the current harness bytes`)
  }
}

// 재사용 판정은 시간이 아니라 bytes다 — lock/worktree/production/harness digest가 모두 현재와 같으면
// 그 label을 다시 돌려도 같은 결과다. 전이 이후 재실행 요구는 변경된 bytes에 대해서만 의미가 있고,
// 그 경우는 아래 assertRunFresh가 SNAPSHOT_STALE로 잡는다.
function assertRequiredRuns(state, ledger, currentWorktree, currentProduction, currentHarness, currentLockManifest) {
  for (const label of state.requiredLabels ?? []) {
    const grade = label.endsWith(':exit') ? 'exit-only' : 'reported'
    const latest = ledger.filter((entry) => entry.label === label).at(-1)

    if (!latest) {
      throw new CliError('REQUIRED_RUN_MISSING', `required label "${label}" has no recorded run`)
    }
    const valid =
      latest.exitCode === 0 &&
      !latest.signal &&
      (grade === 'reported' ? latest.grade === 'reported' && hasOnlyPassedTests(latest) : latest.grade === 'exit-only')
    if (!valid) {
      throw new CliError(
        'REQUIRED_LABEL_GRADE',
        `required label "${label}" needs a passing run for the current snapshot`,
      )
    }
    assertRunFresh(latest, currentWorktree, currentProduction, currentHarness, currentLockManifest, 'SNAPSHOT_STALE')
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

    for (const [literal, count] of Object.entries(recorded.literals ?? {})) {
      const now = current.literals[literal] ?? 0
      if (now < count) weakened.push(`${path}: expected literal ${literal} ${count} → ${now}`)
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
  return await withDirectoryLock(directory, 'state', async () => {
    return transitionUnderLock(options, directory)
  })
}

async function reviewReceipt(options) {
  const required = ['dir', 'packet', 'revision', 'findings', 'role', 'reviewer', 'taskId']
  if (required.some((name) => !options[name])) {
    throw new CliError(
      'USAGE',
      'review-receipt requires --dir --packet --revision --findings --role --reviewer --task-id',
      2,
    )
  }
  const directory = resolve(options.dir)
  await withDirectoryLock(directory, 'state', async () => {
    const state = await readConsistentState(directory)
    if (state.state !== 'IMPLEMENTED_GREEN') {
      throw new CliError('REVIEW_RECEIPT_STATE', 'review receipts may only be created before REVIEW_VERIFIED')
    }
    const packet = await snapshotRegularFile(resolve(options.packet), {
      base: directory,
      allowHardlinks: false,
      label: 'review packet',
      fail: (message) => new CliError('REVIEW_PACKET_INVALID', message),
    })
    const packetDocument = JSON.parse(packet.bytes.toString('utf8'))
    if (packetDocument?.schemaVersion !== 2 || packetDocument?.targetSnapshot?.worktreeSha256 !== options.revision) {
      throw new CliError('REVIEW_REVISION_MISMATCH', 'review receipt revision must match canonical schema-v2 packet')
    }
    const findingsPath = resolve(options.findings)
    const findings = await snapshotRegularFile(findingsPath, {
      base: directory,
      allowHardlinks: false,
      label: 'review findings',
      fail: (message) => new CliError('FINDINGS_INVALID', message),
    })
    const document = JSON.parse(findings.bytes.toString('utf8'))
    if (
      document?.schemaVersion !== 2 ||
      document.reviewerRole !== options.role ||
      document.reviewerId !== options.reviewer
    ) {
      throw new CliError('FINDINGS_INVALID', 'findings reviewer identity must match the receipt')
    }
    if (document.orchestrationReceipt)
      throw new CliError('REVIEW_RECEIPT_EXISTS', 'findings already has an orchestration receipt')
    document.packetSha256 = packet.sha256
    document.targetRevision = options.revision
    const output = { ...document }
    const outputSha256 = sha256(stableStringify(output))
    const receiptId = sha256(
      stableStringify({
        packetSha256: packet.sha256,
        revision: options.revision,
        role: options.role,
        reviewerId: options.reviewer,
        taskId: options.taskId,
        outputSha256,
      }),
    )
    document.orchestrationReceipt = {
      receiptId,
      packetSha256: packet.sha256,
      targetRevision: options.revision,
      role: options.role,
      reviewerId: options.reviewer,
      taskId: options.taskId,
      outputSha256,
    }
    const finalBytes = `${JSON.stringify(document, null, 2)}\n`
    const findingsSha256 = sha256(finalBytes)
    const revision = verifyLock(directory, state)
    const event = await appendLedger(directory, {
      type: 'review-receipt',
      receiptId,
      packetSha256: packet.sha256,
      targetRevision: options.revision,
      role: options.role,
      reviewerId: options.reviewer,
      taskId: options.taskId,
      outputSha256,
      findingsSha256,
      oracleSha256: revision.oracleSha256,
      adapter: 'controller',
      at: new Date().toISOString(),
    })
    const temporary = `${findingsPath}.receipt-${process.pid}-${Date.now()}`
    await writeFile(temporary, finalBytes, { flag: 'wx' })
    await rename(temporary, findingsPath)
    state.ledgerHead = event.digest
    await writeState(directory, state)
    process.stdout.write(`REVIEW_RECEIPT ${receiptId} digest:${event.digest}\n`)
  })
}

async function transitionUnderLock(options, directory) {
  const state = await readConsistentState(directory)
  const allowed = TRANSITIONS[state.state] ?? []

  if (!allowed.includes(options.to)) {
    throw new CliError('TRANSITION_NOT_ALLOWED', `${state.state} cannot move to ${options.to}`)
  }

  const revision = verifyLock(directory, state)

  const allLedger = await readLedger(directory)
  const ledger = allLedger.filter((entry) => entry.type === 'run')
  const scanRoot = resolve(directory, state.scanRoot)
  const notices = []
  let packetSha256 = null
  let implementationRevision = null

  if (options.to === 'NEEDS_DECISION' || options.to === 'FAIL') {
    if (!options.reason) throw new CliError('MISSING_REASON', `${options.to} requires --reason`)
  } else {
    if (!options.run) throw new CliError('USAGE', `${options.to} requires --run`, 2)
  }

  const run = options.run ? findRun(ledger, options.run) : null

  if (options.to === 'VALID_RED') {
    const milestones = state.milestones ?? []
    const refreshingRed = state.state === 'VALID_RED'

    if (!options.evidence || ((refreshingRed || milestones.length === 0) && !options.row)) {
      let message = 'VALID_RED requires --evidence and --row'
      if (!refreshingRed && milestones.length > 0) message = 'milestone VALID_RED requires --evidence'
      throw new CliError('EVIDENCE_REQUIRED', message)
    }
    if (refreshingRed && state.budgets.harness.spent <= (state.harnessBudgetAtValidRed ?? 0)) {
      throw new CliError('HARNESS_BUDGET_REQUIRED', 'refreshing VALID_RED requires a new harness budget spend')
    }

    const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
    const currentHarness = selectedDigests(current, state.harnessPaths ?? [])
    const oracle = await lockedOraclePath(directory, state)
    if (refreshingRed) {
      if (!isReportedFailingRun(run)) {
        throw new CliError('RUN_NOT_RED', `${run.runId} did not report a clean failing test run`)
      }
      assertRunFresh(
        run,
        sha256(JSON.stringify(current)),
        productionSha256(current, state.harnessPaths),
        currentHarness,
        revision.lockManifestSha256,
        'SNAPSHOT_STALE',
      )
    } else {
      assertNoProductionChange(changedPaths(state.snapshot, current), state.harnessPaths)
    }

    if (!refreshingRed && milestones.length > 0) {
      const milestoneRuns = requiredMilestoneRuns(milestones, ledger)
      let last = milestoneRuns[0]
      for (const entry of milestoneRuns.slice(1)) {
        if (entry.index > last.index) last = entry
      }
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
      if (!Number.isInteger(run.exitCode) || run.exitCode === 0 || run.signal) {
        throw new CliError(
          'RUN_NOT_RED',
          `${run.runId} did not report a clean failure — a valid RED needs a failing run`,
        )
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
    state.testBindings = {
      evidenceSha256: await testEvidenceDigest(options.evidence),
      tests: Object.fromEntries(
        Object.keys(current)
          .filter(isTestPath)
          .map((path) => [path, current[path]]),
      ),
    }
  }

  if (options.to === 'IMPLEMENTED_GREEN') {
    if (run.exitCode !== 0 || !hasOnlyPassedTests(run)) {
      throw new CliError('RUN_NOT_GREEN', `${run.runId} did not report a clean pass — GREEN needs a passing run`)
    }

    if (!options.evidence) {
      throw new CliError('EVIDENCE_REQUIRED', 'IMPLEMENTED_GREEN requires --evidence')
    }

    if (run.grade !== 'reported') {
      throw new CliError('EVIDENCE_UNVERIFIABLE', `${run.runId} must have a parsed reporter for GREEN`)
    }

    const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
    const currentWorktree = sha256(JSON.stringify(current))
    const currentProduction = productionSha256(current, state.harnessPaths)
    const currentHarness = selectedDigests(current, state.harnessPaths ?? [])
    assertRunFresh(
      run,
      currentWorktree,
      currentProduction,
      currentHarness,
      revision.lockManifestSha256,
      'SNAPSHOT_STALE',
    )
    await assertTestsNotWeakened(state, scanRoot)
    if (state.testBindings) {
      const currentEvidenceSha256 = await testEvidenceDigest(options.evidence)
      const currentTests = Object.fromEntries(
        Object.keys(current)
          .filter(isTestPath)
          .map((path) => [path, current[path]]),
      )
      if (
        currentEvidenceSha256 !== state.testBindings.evidenceSha256 ||
        !sameDigests(currentTests, state.testBindings.tests)
      ) {
        if (state.budgets.harness.spent <= (state.harnessBudgetAtValidRed ?? 0)) {
          throw new CliError('HARNESS_BUDGET_REQUIRED', 'evidence mapping or test bytes changed after VALID_RED')
        }
        throw new CliError(
          'EVIDENCE_STALE',
          'evidence mapping or test bytes changed after VALID_RED; record a fresh RED',
        )
      }
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
      if (Object.values(currentHarness).includes(null)) {
        throw new CliError('HARNESS_PATH_INVALID', 'a registered harness file no longer exists')
      }
      const redIndex = harnessRedIndex(state, ledger, started, run, currentHarness)
      if (redIndex !== null) started = redIndex + 1
    }
    assertRequiredRuns(state, ledger, currentWorktree, currentProduction, currentHarness, revision.lockManifestSha256)
    assertConsecutivePasses(state, ledger, run, started, currentWorktree, revision.lockManifestSha256)
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
    if (run.exitCode !== 0 || !hasOnlyPassedTests(run)) {
      throw new CliError(
        'RUN_NOT_GREEN',
        `${run.runId} did not report a clean pass — review needs a passing re-verification`,
      )
    }

    if (!options.evidence || !options.findings) {
      throw new CliError('EVIDENCE_REQUIRED', 'REVIEW_VERIFIED requires --evidence and --findings')
    }

    if (state.risk === 'high' && !options.intersect) {
      throw new CliError('REVIEW_EVIDENCE_REQUIRED', 'High risk REVIEW_VERIFIED requires --intersect')
    }

    if (state.risk === 'high' && (!options.mutationRun || !options.mutationRow)) {
      throw new CliError(
        'MUTATION_EVIDENCE_REQUIRED',
        'High risk REVIEW_VERIFIED requires --mutation-run and --mutation-row',
      )
    }

    if (run.grade !== 'reported') {
      throw new CliError('EVIDENCE_UNVERIFIABLE', `${run.runId} must have a parsed reporter for review`)
    }

    const greenEntry = lastEntryFor(state, 'IMPLEMENTED_GREEN')
    const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
    const currentWorktree = sha256(JSON.stringify(current))
    const currentProduction = productionSha256(current, state.harnessPaths)
    const currentHarness = selectedDigests(current, state.harnessPaths ?? [])
    assertRunFresh(
      run,
      currentWorktree,
      currentProduction,
      currentHarness,
      revision.lockManifestSha256,
      'REVIEW_RUN_STALE',
    )
    // 리뷰가 코드를 바꿨으면 digest가 갈려 나머지 label도 재실행된다. 바꾸지 않았어도 인용 run만은
    // GREEN 이후 실제 재실행이어야 REVIEW_VERIFIED가 리뷰한 상태를 한 번은 직접 검증한다.
    if (ledger.findIndex((entry) => entry.runId === run.runId) < greenEntry.runCount) {
      throw new CliError(
        'REVIEW_RERUN_REQUIRED',
        `${run.runId} predates IMPLEMENTED_GREEN — rerun the card test command after review`,
      )
    }
    assertRequiredRuns(state, ledger, currentWorktree, currentProduction, currentHarness, revision.lockManifestSha256)
    const greenRun = findRun(ledger, greenEntry.runId)
    assertSameCommand(greenRun, run)
    implementationRevision = greenRun.worktreeSha256

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
    if (state.risk === 'high') {
      const mutationRun = findRun(ledger, options.mutationRun)
      const mutationIndex = ledger.findIndex((entry) => entry.runId === mutationRun.runId)
      const reviewIndex = ledger.findIndex((entry) => entry.runId === run.runId)
      if (
        mutationIndex < greenEntry.runCount ||
        reviewIndex <= mutationIndex ||
        mutationRun.exitCode === 0 ||
        mutationRun.grade !== 'reported' ||
        !greenRun.productionSha256 ||
        mutationRun.productionSha256 === greenRun.productionSha256 ||
        run.productionSha256 !== greenRun.productionSha256
      ) {
        throw new CliError(
          'MUTATION_EVIDENCE_INVALID',
          `${mutationRun.runId} must change production after GREEN, fail with a reporter, and be exactly restored before review`,
        )
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
        mutationRun.runId,
        '--row',
        options.mutationRow,
      ])
    }

    if (!options.packet || !options.revision) {
      throw new CliError('REVIEW_PACKET_REQUIRED', 'REVIEW_VERIFIED requires --packet and --revision')
    }

    const packetPath = resolve(options.packet)
    const packetRaw = await readFile(packetPath, 'utf8').catch((error) => {
      throw new CliError('REVIEW_PACKET_INVALID', `Cannot read review packet: ${error.message}`)
    })
    const packet = JSON.parse(packetRaw)
    packetSha256 = sha256(packetRaw)
    const packetGreenEntry = [...(packet.state?.history ?? [])]
      .reverse()
      .find((entry) => entry.state === 'IMPLEMENTED_GREEN')
    const packetGreenRun = (packet.ledger ?? []).find((entry) => entry.runId === packetGreenEntry?.runId)
    const targetSnapshot = packet.targetSnapshot
    const packetRevision = targetSnapshot?.worktreeSha256 ?? packetGreenRun?.worktreeSha256
    if (options.revision !== packetRevision) {
      throw new CliError(
        'REVIEW_REVISION_MISMATCH',
        'REVIEW_VERIFIED revision must match the review packet target snapshot',
      )
    }
    if (
      !targetSnapshot ||
      targetSnapshot.lockManifestSha256 !== revision.lockManifestSha256 ||
      packet.state?.lockManifestSha256 !== revision.lockManifestSha256 ||
      targetSnapshot.worktreeSha256 !== currentWorktree ||
      targetSnapshot.productionSha256 !== currentProduction ||
      !sameDigests(targetSnapshot.harnessSha256 ?? {}, currentHarness)
    ) {
      throw new CliError('REVIEW_PACKET_STALE', 'review packet does not target the current snapshot')
    }
    const findingsSnapshot = await snapshotRegularFile(resolve(options.findings), {
      base: directory,
      allowHardlinks: false,
      label: 'review findings',
      fail: (message) => new CliError('FINDINGS_INVALID', message),
    })
    const findingsDocument = JSON.parse(findingsSnapshot.bytes.toString('utf8'))
    const receipt = findingsDocument?.orchestrationReceipt
    const receiptEvent = allLedger.find(
      (entry) =>
        entry.type === 'review-receipt' &&
        entry.receiptId === receipt?.receiptId &&
        entry.packetSha256 === packetSha256 &&
        entry.targetRevision === options.revision &&
        entry.findingsSha256 === findingsSnapshot.sha256,
    )
    if (!receiptEvent) {
      throw new CliError('REVIEWER_EVIDENCE_INVALID', 'review findings require a pre-verification ledger receipt')
    }

    const reviewArgs = [
      'review',
      '--oracle',
      oracle,
      '--file',
      resolve(options.findings),
      '--packet',
      packetPath,
      '--revision',
      packetRevision ?? implementationRevision,
      '--map',
      resolve(options.evidence),
      '--ledger',
      ledgerPath(directory),
    ]
    if (options.intersect) reviewArgs.push('--intersect', resolve(options.intersect))
    runVerifier(reviewArgs)
  }

  state.state = options.to
  const historyEntry = {
    state: options.to,
    runId: run?.runId ?? null,
    reason: options.reason ?? null,
    row: options.row ?? null,
    evidence: options.evidence ? portablePath(directory, resolve(options.evidence)) : null,
    findings: options.findings ? portablePath(directory, resolve(options.findings)) : null,
    packet: options.packet ? portablePath(directory, resolve(options.packet)) : null,
    packetSha256,
    targetRevision: options.revision ?? null,
    intersect: options.intersect ? portablePath(directory, resolve(options.intersect)) : null,
    mutationRunId: options.mutationRun ?? null,
    mutationRow: options.mutationRow ?? null,
    runCount: ledger.length,
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  }
  state.history.push(historyEntry)

  const transitionEvent = await appendLedger(directory, {
    type: 'transition',
    state: options.to,
    evidenceRunId: run?.runId ?? null,
    reason: options.reason ?? null,
    row: options.row ?? null,
    evidence: historyEntry.evidence,
    findings: historyEntry.findings,
    packet: historyEntry.packet,
    packetSha256: historyEntry.packetSha256,
    targetRevision: historyEntry.targetRevision,
    stateDelta: {
      state: options.to,
      testFiles: state.testFiles,
      testBindings: state.testBindings,
      harnessAtValidRed: state.harnessAtValidRed,
      harnessBudgetAtValidRed: state.harnessBudgetAtValidRed,
      envDrift: state.envDrift,
    },
    runCount: ledger.length,
    at: historyEntry.at,
  })
  historyEntry.ledgerDigest = transitionEvent.digest
  state.ledgerHead = transitionEvent.digest
  await writeState(directory, state)
  process.stdout.write([`STATE_${options.to} run:${run?.runId ?? 'none'}`, ...notices, ''].join('\n'))
}

async function withDirectoryLock(directory, name, work) {
  const lock = join(directory, `.lock-${name}`)
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    try {
      await mkdir(lock)
      try {
        return await work()
      } finally {
        await rm(lock, { recursive: true, force: true })
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      await new Promise((resolveLock) => setImmediate(resolveLock))
    }
  }
  throw new CliError('LOCK_BUSY', `${name} lock remained busy`)
}

async function budgetDigest(directory, state, name) {
  const scanRoot = resolve(directory, state.scanRoot)
  const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  if (name === 'harness') {
    let paths = state.harnessPaths ?? []
    if (paths.length === 0) paths = Object.keys(current).filter(isTestPath)
    return sha256(JSON.stringify(selectedDigests(current, paths.sort())))
  }
  if (name === 'policy') return verifyLock(directory, state).lockManifestSha256
  return productionSha256(current, state.harnessPaths)
}

async function spendBudget(options) {
  if (!options.dir || !options.spend || !options.reason) {
    throw new CliError('USAGE', 'budget requires --dir, --spend and --reason', 2)
  }

  const directory = resolve(options.dir)
  await withDirectoryLock(directory, 'state', async () => {
    const state = await readConsistentState(directory)
    const budget = state.budgets[options.spend]

    if (!budget) {
      throw new CliError('USAGE', `Unknown budget: ${options.spend}`, 2)
    }

    const digest = await budgetDigest(directory, state, options.spend)
    if ((budget.digests ?? []).includes(digest)) {
      budget.reasons = [...(budget.reasons ?? []), options.reason]
      await appendLedger(directory, {
        type: 'budget',
        budget: options.spend,
        spent: budget.spent,
        limit: budget.limit,
        reason: options.reason,
        changeDigest: digest,
        duplicate: true,
        at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
      })
      await writeState(directory, state)
      process.stdout.write(`BUDGET_SPENT ${options.spend} ${budget.spent}/${budget.limit}\n`)
      return
    }

    if (budget.spent >= budget.limit) {
      throw new CliError(
        'BUDGET_EXHAUSTED',
        `${options.spend} budget is spent (${budget.spent}/${budget.limit}) — report FAIL with the last real failure`,
      )
    }

    budget.spent += 1
    budget.digests = [...(budget.digests ?? []), digest]
    budget.reasons = [...(budget.reasons ?? []), options.reason]
    await appendLedger(directory, {
      type: 'budget',
      budget: options.spend,
      spent: budget.spent,
      limit: budget.limit,
      reason: options.reason,
      changeDigest: digest,
      at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
    })
    await writeState(directory, state)

    process.stdout.write(`BUDGET_SPENT ${options.spend} ${budget.spent}/${budget.limit}\n`)
  })
}

function gitDiff(root, changed, before, current) {
  if (changed.length === 0) return ''

  const gitOptions = { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  const listed = spawnSync('git', ['-C', root, 'ls-files', '-z'], gitOptions)
  if (listed.status !== 0) return `GIT_DIFF_UNAVAILABLE: ${listed.stderr.trim() || 'not a git worktree'}`

  const tracked = new Set(listed.stdout.split('\0').filter(Boolean))
  const head = spawnSync('git', ['-C', root, 'diff', '--no-ext-diff', '--binary', 'HEAD', '--', ...changed], gitOptions)
  const parts = []

  if (head.status === 0) {
    if (head.stdout.trim()) parts.push(head.stdout.trimEnd())
  } else {
    for (const args of [
      ['diff', '--no-ext-diff', '--binary', '--', ...changed],
      ['diff', '--cached', '--no-ext-diff', '--binary', '--', ...changed],
    ]) {
      const fallback = spawnSync('git', ['-C', root, ...args], gitOptions)
      if (fallback.status === 0 && fallback.stdout.trim()) parts.push(fallback.stdout.trimEnd())
    }
  }

  for (const path of changed.filter((entry) => !tracked.has(entry))) {
    if (before[path] === undefined && current[path] !== undefined) {
      const addition = spawnSync('git', ['-C', root, 'diff', '--no-index', '--binary', '--', devNull, path], gitOptions)
      if ([0, 1].includes(addition.status) && addition.stdout.trim()) parts.push(addition.stdout.trimEnd())
    } else {
      parts.push(`GIT_DIFF_UNAVAILABLE_FOR_UNTRACKED_BASELINE: ${path}`)
    }
  }

  return parts.join('\n')
}

async function snapshotPacketFile(path, root, label, snapshots) {
  try {
    const snapshot = await snapshotRegularFile(path, {
      base: root,
      allowHardlinks: false,
      label,
      fail: (message) => new CliError('REVIEW_PACKET_INPUT_INVALID', message),
    })
    snapshots.push({ label, snapshot })
    return snapshot
  } catch (error) {
    throw new CliError('REVIEW_PACKET_INPUT_INVALID', `${label}: ${error.message}`)
  }
}

async function collectEvidenceArtifacts(directory, evidenceSnapshot, snapshots) {
  const evidence = JSON.parse(evidenceSnapshot.bytes.toString('utf8'))
  const artifacts = []
  const seen = new Set()
  for (const [row, entry] of Object.entries(evidence.rows ?? {})) {
    if (typeof entry?.artifact !== 'string') continue
    const receiptPath = resolve(dirname(evidenceSnapshot.path), entry.artifact)
    const receiptSnapshot = await snapshotPacketFile(receiptPath, directory, `${row} evidence receipt`, snapshots)
    if (entry.sha256 && entry.sha256 !== receiptSnapshot.sha256) {
      throw new CliError('REVIEW_PACKET_INPUT_INVALID', `${row} evidence receipt digest does not match`)
    }
    if (!seen.has(receiptSnapshot.path)) {
      seen.add(receiptSnapshot.path)
      artifacts.push({
        path: portablePath(directory, receiptSnapshot.path),
        sha256: receiptSnapshot.sha256,
        size: receiptSnapshot.size,
        mediaType: 'application/json',
      })
    }
    let receipt
    try {
      receipt = JSON.parse(receiptSnapshot.bytes.toString('utf8'))
    } catch (error) {
      throw new CliError('REVIEW_PACKET_INPUT_INVALID', `${row} evidence receipt is invalid JSON: ${error.message}`)
    }
    const rowReceipt = receipt.rows?.[row]
    const nested = [...(rowReceipt?.journey?.artifacts ?? []), ...(rowReceipt?.artifacts ?? [])]
    for (const artifact of nested) {
      if (typeof artifact?.path !== 'string') {
        throw new CliError('REVIEW_PACKET_INPUT_INVALID', `${row} nested evidence artifact has no path`)
      }
      const nestedPath = resolve(dirname(receiptSnapshot.path), artifact.path)
      const nestedSnapshot = await snapshotPacketFile(
        nestedPath,
        directory,
        `${row} nested evidence artifact`,
        snapshots,
      )
      if (artifact.sha256 !== nestedSnapshot.sha256) {
        throw new CliError('REVIEW_PACKET_INPUT_INVALID', `${row} nested evidence artifact digest does not match`)
      }
      if (!seen.has(nestedSnapshot.path)) {
        seen.add(nestedSnapshot.path)
        artifacts.push({
          path: portablePath(directory, nestedSnapshot.path),
          sha256: nestedSnapshot.sha256,
          size: nestedSnapshot.size,
          mediaType: artifact.mediaType,
        })
      }
    }
  }
  return artifacts.sort((left, right) => left.path.localeCompare(right.path))
}

async function reviewPacket(options) {
  if (!options.dir || !options.output) {
    throw new CliError('USAGE', 'review-packet requires --dir and --output', 2)
  }

  const directory = resolve(options.dir)
  const packetState = await readConsistentState(directory)
  if (packetState.state !== 'IMPLEMENTED_GREEN') {
    throw new CliError('REVIEW_PACKET_STATE', 'review packets may only be created in IMPLEMENTED_GREEN')
  }
  if (!options.decision) {
    throw new CliError('IMPLEMENTATION_DECISION_REQUIRED', 'review-packet requires --decision')
  }
  const output = resolve(options.output)
  const outputRelative = relative(directory, output)
  if (
    !outputRelative ||
    outputRelative === '..' ||
    outputRelative.startsWith(`..${sep}`) ||
    isAbsolute(outputRelative)
  ) {
    throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output must be a file inside the Oracle directory')
  }
  if (outputRelative === '.run-ids' || outputRelative.startsWith(`.run-ids${sep}`)) {
    throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output cannot be written under .run-ids')
  }

  const [directoryReal, outputParentReal] = await Promise.all([realpath(directory), realpath(dirname(output))]).catch(
    (error) => {
      throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', `Cannot resolve output directory: ${error.message}`)
    },
  )
  const packetScanRoot = resolve(directory, packetState.scanRoot)
  const packetScanRootReal = await realpath(packetScanRoot).catch((error) => {
    throw new CliError('REVIEW_PACKET_INPUT_INVALID', `Cannot resolve scan root: ${error.message}`)
  })
  const repositoryRoot = commonAncestor(directoryReal, packetScanRootReal)
  const inputSnapshots = []
  const outputParentRelative = relative(directoryReal, outputParentReal)
  if (
    outputParentRelative === '..' ||
    outputParentRelative.startsWith(`..${sep}`) ||
    isAbsolute(outputParentRelative)
  ) {
    throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output parent must stay inside the Oracle directory')
  }
  const outputMetadata = await lstat(output).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', `Cannot inspect output: ${error.message}`)
  })
  if (outputMetadata && (!outputMetadata.isFile() || outputMetadata.isSymbolicLink())) {
    throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output must be a regular file')
  }

  if (outputMetadata?.isFile()) {
    try {
      if (!isReviewPacketShape(JSON.parse(await readFile(output, 'utf8')))) {
        throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output can only replace an existing review packet')
      }
    } catch (error) {
      if (error instanceof CliError) throw error
      throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output can only replace an existing review packet')
    }
  }

  let decisionPath
  let implementationDecision
  if (options.decision) {
    decisionPath = resolve(options.decision)
    const decisionRelative = relative(directory, decisionPath)
    if (
      !decisionRelative ||
      decisionRelative === '..' ||
      decisionRelative.startsWith(`..${sep}`) ||
      isAbsolute(decisionRelative)
    ) {
      throw new CliError('IMPLEMENTATION_DECISION_INVALID', '--decision must be a file inside the Oracle directory')
    }

    let metadata
    let decisionReal
    try {
      ;[metadata, decisionReal] = await Promise.all([lstat(decisionPath), realpath(decisionPath)])
    } catch (error) {
      throw new CliError('IMPLEMENTATION_DECISION_INVALID', `Cannot read decision: ${error.message}`)
    }

    const decisionRealRelative = relative(directoryReal, decisionReal)
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      decisionRealRelative === '..' ||
      decisionRealRelative.startsWith(`..${sep}`) ||
      isAbsolute(decisionRealRelative)
    ) {
      throw new CliError(
        'IMPLEMENTATION_DECISION_INVALID',
        '--decision must be a regular file inside the Oracle directory',
      )
    }

    const decisionSnapshot = await snapshotPacketFile(
      decisionPath,
      directoryReal,
      'implementation decision',
      inputSnapshots,
    )
    const content = decisionSnapshot.bytes.toString('utf8')
    if (!content.trim()) {
      throw new CliError('IMPLEMENTATION_DECISION_INVALID', '--decision cannot be empty')
    }
    implementationDecision = {
      path: portablePath(directory, decisionPath),
      sha256: sha256(content),
      content,
    }
  }

  const reviewPoints = []
  const seenReviewPoints = new Set()
  if (options.reviewPoints.length === 0) {
    throw new CliError('REVIEW_POINTS_REQUIRED', 'review-packet requires at least one --review-point')
  }
  const canonical = new Map()
  for (const { name, path } of canonicalReviewPoints) {
    const real = await realpath(path).catch((error) => {
      throw new CliError('REVIEW_POINTS_REQUIRED', `Cannot resolve canonical ${name} review point: ${error.message}`)
    })
    canonical.set(real, name)
  }
  for (const point of options.reviewPoints) {
    const pointPath = resolve(point)
    let metadata
    let pointReal
    try {
      ;[metadata, pointReal] = await Promise.all([lstat(pointPath), realpath(pointPath)])
    } catch (error) {
      throw new CliError('REVIEW_POINT_INVALID', `Cannot read review point: ${error.message}`)
    }
    if (seenReviewPoints.has(pointReal)) {
      throw new CliError('REVIEW_POINT_INVALID', `Duplicate review point: ${point}`)
    }
    seenReviewPoints.add(pointReal)

    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new CliError('REVIEW_POINT_INVALID', '--review-point must be a regular file')
    }

    const pointSnapshot = await snapshotPacketFile(pointPath, null, `review point ${point}`, inputSnapshots)
    const content = pointSnapshot.bytes.toString('utf8')
    if (!content.trim()) {
      throw new CliError('REVIEW_POINT_INVALID', '--review-point cannot be empty')
    }
    // 링크만 전달한다 — reviewer가 경로의 파일을 직접 전부 읽고, digest로 어떤
    // revision의 기준을 읽었는지 고정한다. 본문을 packet에 복제하지 않는다.
    reviewPoints.push({
      path: canonical.get(pointReal) ?? portablePath(directory, pointPath),
      sha256: sha256(content),
    })
  }
  for (const [real, name] of canonical) {
    if (!seenReviewPoints.has(real)) {
      throw new CliError('REVIEW_POINTS_REQUIRED', `review-packet requires the canonical ${name} review point`)
    }
  }

  const state = packetState
  const revision = verifyLock(directory, state)
  const lock = resolve(directory, state.lock)
  const lockDirectory = dirname(lock)
  const lockSnapshot = await snapshotPacketFile(lock, directoryReal, 'lock manifest', inputSnapshots)
  if (lockSnapshot.sha256 !== revision.lockManifestSha256) {
    throw new CliError('REVIEW_PACKET_INPUT_INVALID', 'lock manifest changed after verification')
  }
  const manifest = JSON.parse(lockSnapshot.bytes.toString('utf8'))
  const oraclePath = resolve(lockDirectory, manifest.oracle.path)
  const oracleSnapshot = await snapshotPacketFile(oraclePath, directoryReal, 'Oracle', inputSnapshots)
  if (oracleSnapshot.sha256 !== revision.oracleSha256) {
    throw new CliError('REVIEW_PACKET_INPUT_INVALID', 'Oracle bytes do not match the verified lock')
  }
  const evidencePath = evidencePathFor(directory, state)
  const evidenceSnapshot = await snapshotPacketFile(evidencePath, directoryReal, 'evidence map', inputSnapshots)
  let evidence
  try {
    evidence = JSON.parse(evidenceSnapshot.bytes.toString('utf8'))
  } catch (error) {
    throw new CliError('EVIDENCE_INVALID', `Cannot read review evidence: ${error.message}`)
  }

  const protectedPaths = new Set([
    lock,
    statePath(directory),
    ledgerPath(directory),
    oraclePath,
    evidencePath,
    ...(decisionPath ? [decisionPath] : []),
    ...manifest.sources.map((source) => resolve(lockDirectory, source.path)),
  ])
  if (protectedPaths.has(output)) {
    throw new CliError('REVIEW_PACKET_OUTPUT_INVALID', '--output cannot overwrite a review input artifact')
  }

  const scanRoot = packetScanRoot
  const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const changed = changedPaths(state.snapshot, current)
  const changedFiles = changed.map((path) => ({
    path,
    beforeSha256: state.snapshot[path] ?? null,
    afterSha256: current[path] ?? null,
  }))
  const lockedSources = await Promise.all(
    manifest.sources.map(async (source) => {
      const sourceSnapshot = await snapshotPacketFile(
        resolve(lockDirectory, source.path),
        repositoryRoot,
        `locked source ${source.path}`,
        inputSnapshots,
      )
      if (sourceSnapshot.sha256 !== source.sha256) {
        throw new CliError('REVIEW_PACKET_INPUT_INVALID', `locked source ${source.path} digest does not match`)
      }
      return { ...source, content: sourceSnapshot.bytes.toString('utf8') }
    }),
  )
  const targetSnapshot = {
    worktreeSha256: sha256(JSON.stringify(current)),
    productionSha256: productionSha256(current, state.harnessPaths),
    harnessSha256: selectedDigests(current, state.harnessPaths ?? []),
    lockManifestSha256: revision.lockManifestSha256,
  }
  const fullLedger = await readLedger(directory)
  const checkpoint = fullLedger.findIndex((entry) => entry.type === 'checkpoint')
  const ledger = checkpoint >= 0 ? fullLedger.slice(checkpoint) : fullLedger
  const greenEntry = lastEntryFor(state, 'IMPLEMENTED_GREEN')
  const greenRun = greenEntry ? findRun(ledger, greenEntry.runId) : null
  if (!greenRun) throw new CliError('REVIEW_PACKET_STATE', 'IMPLEMENTED_GREEN has no bound run')
  runVerifier([
    'evidence',
    '--oracle',
    oracleSnapshot.path,
    '--map',
    evidenceSnapshot.path,
    '--ledger',
    ledgerPath(directory),
    '--run',
    greenRun.runId,
    '--phase',
    'green',
  ])
  const evidenceArtifacts = await collectEvidenceArtifacts(directoryReal, evidenceSnapshot, inputSnapshots)
  const targetRevision = targetSnapshot.worktreeSha256
  const pending = Object.entries(evidence.rows ?? {})
    .filter(([, entry]) => entry.kind === 'pending')
    .map(([row, entry]) => ({ row, ...entry }))
    .sort((left, right) => left.row.localeCompare(right.row))

  const packet = {
    schemaVersion: 2,
    lockVerification: {
      command: [process.execPath, lockScript, 'verify', '--lock', lock],
      exitCode: 0,
      stdout: `ORACLE_VERIFIED sha256:${revision.oracleSha256} manifest-sha256:${revision.lockManifestSha256}`,
      manifestSha256: revision.lockManifestSha256,
    },
    lock: manifest,
    oracle: {
      ...manifest.oracle,
      content: oracleSnapshot.bytes.toString('utf8'),
    },
    lockedSources,
    state,
    ledger,
    targetRevision,
    evidence,
    evidenceArtifacts,
    targetSnapshot,
    ...(implementationDecision ? { implementationDecision } : {}),
    ...(reviewPoints.length ? { reviewPoints } : {}),
    changedFiles,
    diff: gitDiff(scanRoot, changed, state.snapshot, current),
    pending,
  }

  const temp = join(dirname(output), `.review-packet-${process.pid}-${Date.now()}.tmp`)
  try {
    for (const { label, snapshot: inputSnapshot } of inputSnapshots) {
      await assertSnapshotUnchanged(inputSnapshot, {
        label,
        fail: (message) => new CliError('REVIEW_PACKET_INPUT_CHANGED', message),
      })
    }
    await writeFile(temp, `${JSON.stringify(packet, null, 2)}\n`)
    await rename(temp, output)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
  process.stdout.write(`REVIEW_PACKET_WRITTEN ${portablePath(directory, output)}\n`)
}

async function orphanedRuns(directory, ledger) {
  const reservations = join(directory, '.run-ids')
  const finished = new Set(ledger.filter((entry) => (entry.type ?? 'run') === 'run').map((entry) => entry.runId))
  let entries
  try {
    entries = await readdir(reservations)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  return entries.filter((runId) => !finished.has(runId)).sort()
}

async function evidenceStatus(directory, state, ledger) {
  const evidencePath = evidencePathFor(directory, state)
  try {
    const oraclePath = await lockedOraclePath(directory, state)
    const [oracle, evidence] = await Promise.all([
      readFile(oraclePath, 'utf8'),
      readFile(evidencePath, 'utf8').then(JSON.parse),
    ])
    const rows = contractRowIds(oracle)
    const mapped = new Set(Object.keys(evidence.rows ?? {}))
    const pendingRows = Object.entries(evidence.rows ?? {})
      .filter(([, entry]) => entry?.kind === 'pending')
      .map(([row]) => row)
      .sort()
    const missingRows = rows.filter((row) => !mapped.has(row))
    const evidenceEntry = [...(state.history ?? [])]
      .reverse()
      .find((entry) => entry.state === 'REVIEW_VERIFIED' || entry.state === 'IMPLEMENTED_GREEN')
    if (!evidenceEntry?.runId || missingRows.length > 0) {
      return {
        status: 'pending',
        path: portablePath(directory, evidencePath),
        missingRows,
        pendingRows,
      }
    }
    const evidenceRun = ledger.find((entry) => (entry.type ?? 'run') === 'run' && entry.runId === evidenceEntry.runId)
    if (!evidenceRun) {
      throw new CliError('RUN_NOT_FOUND', `${evidenceEntry.runId} is not recorded in the run ledger`)
    }
    runVerifier([
      'evidence',
      '--oracle',
      oraclePath,
      '--map',
      evidencePath,
      '--ledger',
      ledgerPath(directory),
      '--run',
      evidenceRun.runId,
      '--phase',
      state.state === 'REVIEW_VERIFIED' ? 'review' : 'green',
    ])
    return {
      status: 'verified',
      path: portablePath(directory, evidencePath),
      missingRows,
      pendingRows,
    }
  } catch (error) {
    return {
      status: 'invalid',
      path: portablePath(directory, evidencePath),
      code: error.code ?? 'EVIDENCE_INVALID',
      message: error.message,
    }
  }
}

async function reportStatus(options) {
  if (!options.dir || !options.json) throw new CliError('USAGE', 'status requires --dir and --json', 2)

  const directory = resolve(options.dir)
  const ledger = await readLedger(directory)
  const state = replayState(await readState(directory), ledger)
  const checkpointIndex = ledger.findIndex((entry) => entry.type === 'checkpoint')
  const legacyPrefix = Math.max(checkpointIndex, 0)
  const headDigest = ledger.at(-1)?.digest ?? ZERO_DIGEST
  const verifiedHeadDigest = headDigest
  const ledgerValid = true
  const scanRoot = resolve(directory, state.scanRoot)
  const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const currentSnapshot = {
    worktreeSha256: sha256(JSON.stringify(current)),
    productionSha256: productionSha256(current, state.harnessPaths),
    harnessSha256: selectedDigests(current, state.harnessPaths ?? []),
  }
  let lockStatus
  try {
    const revision = verifyLock(directory, state)
    lockStatus = { status: 'valid', sha256: revision.oracleSha256, manifestSha256: revision.lockManifestSha256 }
  } catch (error) {
    lockStatus = { status: 'invalid', code: error.code ?? 'LOCK_INVALID', message: error.message }
  }
  currentSnapshot.lockManifestSha256 = lockStatus.manifestSha256 ?? null
  const runEntries = ledger.filter((entry) => (entry.type ?? 'run') === 'run')
  const staleOrMissingRuns = runEntries
    .filter(
      (entry) =>
        entry.lockSha256 !== lockStatus.sha256 ||
        entry.lockManifestSha256 !== lockStatus.manifestSha256 ||
        entry.worktreeSha256 !== currentSnapshot.worktreeSha256 ||
        entry.productionSha256 !== currentSnapshot.productionSha256,
    )
    .map((entry) => entry.runId)
  const runIssues = runEntries
    .filter((entry) => entry.reportError || (entry.report && entry.grade === 'exit-only'))
    .map((entry) => ({
      runId: entry.runId,
      label: entry.label,
      reportErrorCode: entry.reportErrorCode ?? null,
      reportError: entry.reportError ?? null,
      grade: entry.grade,
    }))
  const evidence = await evidenceStatus(directory, state, ledger)
  const remainingBudgets = Object.fromEntries(
    Object.entries(state.budgets ?? {}).map(([name, budget]) => [
      name,
      { spent: budget.spent, limit: budget.limit, remaining: Math.max(0, budget.limit - budget.spent) },
    ]),
  )
  const blockers = []
  if (lockStatus.status !== 'valid') blockers.push(lockStatus.code)
  if (!ledgerValid) blockers.push('LEDGER_CHAIN_INVALID')
  const needsEvidence = ['ORACLE_READY', 'VALID_RED', 'IMPLEMENTED_GREEN'].includes(state.state)
  if (needsEvidence && evidence.status === 'invalid') blockers.push(evidence.code)
  if (needsEvidence && evidence.missingRows?.length > 0) blockers.push('EVIDENCE_MISSING_ROWS')

  process.stdout.write(
    `${JSON.stringify(
      {
        currentState: state.state,
        currentSnapshot,
        lockStatus,
        staleOrMissingRuns,
        runIssues,
        evidenceStatus: evidence,
        orphanedRun: await orphanedRuns(directory, ledger),
        remainingBudgets,
        ledgerStatus: {
          status: ledgerValid ? 'valid' : 'invalid',
          headDigest,
          verifiedHeadDigest,
          legacyPrefix,
        },
        blockers,
        nextLegalActions: TRANSITIONS[state.state] ?? [],
      },
      null,
      2,
    )}\n`,
  )
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)

  if (command === 'init') await initialize(options)
  else if (command === 'migrate-ledger') await migrateLedger(options)
  else if (command === 'review-receipt') await reviewReceipt(options)
  else if (command === 'status') await reportStatus(options)
  else if (command === 'exec') await execute(options)
  else if (command === 'red') await executeThenTransition(options, 'VALID_RED')
  else if (command === 'green') await executeThenTransition(options, 'IMPLEMENTED_GREEN')
  else if (command === 'transition') await transition(options)
  else if (command === 'budget') await spendBudget(options)
  else if (command === 'review-packet') await reviewPacket(options)
  else
    throw new CliError(
      'USAGE',
      'Expected init, migrate-ledger, exec, red, green, transition, review-receipt, budget, status or review-packet',
      2,
    )
}

try {
  await main()
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
  let dirOption
  try {
    dirOption = parseOptions(process.argv.slice(3)).dir
  } catch {
    dirOption = undefined
  }
  process.stderr.write(`${cliError.code}: ${cliError.message}\n${nextActionLine(cliError.code, { dir: dirOption })}`)
  process.exitCode = cliError.exitCode
}
