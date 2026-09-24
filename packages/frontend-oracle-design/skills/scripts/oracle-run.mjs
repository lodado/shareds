#!/usr/bin/env node

import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { appendFile, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { loadGraph, splitDelivery } from './generate-reference-bundles.mjs'
import { forbiddenArgument, injectedPaths, isTrustedAdapter, TRUSTED_ADAPTER_NAMES, trustedAdapter } from './oracle-adapters.mjs'
import { parseCaseSpace } from './oracle-frames.mjs'
import {
  assertSnapshotUnchanged,
  FAILURE_CAUSES,
  sha256 as fsSha256,
  HOST_RECEIPTS_FILE,
  isPathInside,
  isTestPath,
  pathsShareIdentity,
  reviewOutputDigest,
  snapshotRegularFile,
  stableStringify,
  WEAKENING_TOKENS,
  ZERO_DIGEST,
} from './oracle-fs.mjs'
import { invalidatedWitnesses } from './oracle-lock.mjs'
import { snapshotContext } from './oracle-review-context.mjs'
import { claudeWorkerInvocation, parseWorkerSubmission } from './oracle-worker.mjs'
import { spawnGit } from './resolve-executable.mjs'

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
  'blind-map',
  'blind-input',
  'context',
  'task',
  'max-budget-usd',
  'timeout-ms',
  'check-report',
]

const BOOLEAN_FLAGS = new Set(['json', 'changed-files'])

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

const ASSERTION_TOKENS = ['expect(', 'assert.', 'assert(']

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
  BLIND_MAP_REQUIRED:
    'derive `blind-input`, have a reviewer who never saw evidence.json return the test→row mapping, record it with `review-receipt --role blind-mapper`, and pass --blind-input/--blind-map',
  BLIND_INPUT_STALE: 'the revision or the test bytes moved after the blind read — derive `blind-input` again and re-run the blind mapping',
  BLIND_MAP_STALE: 'the evidence mapping changed after the blind read — a stale blind read cannot disprove the new mapping; re-run it',
  BLIND_MAP_RECEIPT_INVALID: 'record the blind mapping with `review-receipt --role blind-mapper` against this input and revision',
  BLIND_INPUT_INVALID: 'generate the blind input with `blind-input` — it carries only the contract rows and the test sources',
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
  RISK_MISMATCH: "drop --risk to use the locked card's Risk — a different risk is a new revision, not an init flag",
  RED_CAUSE_INFRA:
    "repair the test until the mapped row fails on its own assertion — a syntax·reference·timeout·hook failure is not VALID_RED",
  WITNESS_INVALIDATED:
    'the code an `impossible` cell cites changed — return to NEEDS_DECISION, re-disposition that cell against the new code, and lock a new revision',
  DIMENSION_NOT_EXECUTED:
    'the card declares StrictMode — enable it in a registered harness file (`configure({ reactStrictMode: true })`) or render the tests inside <StrictMode>, then record a fresh RED',
  SIDE_EFFECT_UNOWNED:
    'add the row whose side-effect column owns that category (POLICY_GAP), remove the unrequested effect (PRODUCT_DEFECT), or exempt the line with `oracle:side-effect <row|reason>`',
  NONDETERMINISM_FOUND: 'inject the source through a seam, or record `oracle:nondeterminism <reason>` next to the token',
  TEST_ENV_BRANCH:
    'remove the test-environment branch and make the real path pass — a genuine need is exempted with `oracle:test-env <reason>`',
  MUTATION_NOT_TARGETED:
    'mutate only the guard the row owns and run the full GREEN suite — every other test must still pass, so the kill is the row assertion and not a crash',
  MUTATION_ROW_NOT_WEAKEST:
    'mutate a row whose test is shared with another row — that mapping is the weakest evidence and the one a mutation must prove',
  REVIEW_RECEIPT_UNATTESTED:
    'pass the findings exactly as the reviewer subagent returned them — this host recorded every reviewer output in host-receipts.jsonl',
  REPORT_CLAIM_MISMATCH: 'rewrite the report from `status --json` — the ledger wins over the report',
  RED_ROW_KEPT: 'cite a new or changed row with --row — a `same` row passes before implementation by definition',
  CHANGED_ROW_NOT_RED:
    'update the existing test in place so it asserts the new Then — while it still passes on the current code it asserts the As-is behavior',
  KEPT_ROW_NOT_PASSING:
    'include the existing test in the RED run; if it really fails, the behavior is not there — the row is new or changed, which is POLICY_GAP',
  TEST_WEAKENED_BEFORE_RED:
    'restore the existing test — only the file holding a changed row\'s test, or a file that row\'s As-is names, may change its expectations before RED',
  ORACLE_DIR_INVALID: 'pass --dir as <repository>/.ai/oracles/<oracle-id> — an existing directory inside the scan root',
}

/** 인수 오류에는 처방이 없다 — 상태 조회 안내도 오해를 낳는다. */
const NO_NEXT_ACTION = new Set(['USAGE', 'INPUT_UNREADABLE'])

function nextActionLine(code, options) {
  if (NO_NEXT_ACTION.has(code)) return ''
  if (NEXT_ACTIONS[code]) return `next: ${NEXT_ACTIONS[code]}\n`
  let directory = ''
  if (options?.dir) directory = ` --dir ${options.dir}`
  return `next: run \`oracle-run.mjs status${directory}\` and choose one of the actions shown\n`
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

/** 소스 코드로 읽을 파일 — 스캔·테스트 강도 측정의 대상. 스크린샷 같은 바이너리는 바이트 digest로만 묶인다. */
const SCANNABLE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/
const RUNNER_CONFIG = /(?:^|\/)(?:vitest|playwright|jest)\.config\.[cm]?[jt]s$|(?:^|\/)vitest\.workspace\.[cm]?[jt]s$/
const VITE_CONFIG = /(?:^|\/)vite\.config\.[cm]?[jt]s$/
const SETUP_KEYS = /\b(?:setupFiles|setupFilesAfterEnv|globalSetup)\s*:\s*(\[[^\]]*\]|(?:require\.resolve\()?['"][^'"]+['"])/g
const SETUP_EXTENSIONS = ['', '.ts', '.js', '.mjs', '.cjs', '.mts', '.tsx', '.jsx']

/**
 * 러너 설정과 setup 파일도 판정 입력이다 — `retry`·`exclude`·전역 mock을 VALID_RED 뒤에 바꾸면 테스트를 건드리지 않고
 * GREEN을 만든다. 추적 중인 설정과 그 설정이 문자열로 적은 setup 파일을 harness로 자동 등록해 기존 harness 게이트에
 * 태운다. 문자열이 아닌 setup 값은 추측하지 않고 알린다.
 */
async function runnerHarnessPaths(root, worktree) {
  const paths = []
  const unresolved = []
  // vite 설정은 alias·plugin 같은 production 입력도 겸하므로 자동으로 얼리지 않고 제안만 한다
  const suggested = Object.keys(worktree).filter((path) => VITE_CONFIG.test(path))
  for (const path of Object.keys(worktree).filter((candidate) => RUNNER_CONFIG.test(candidate))) {
    const content = await readFile(join(root, path), 'utf8')
    paths.push(path)
    const literals = [...content.matchAll(SETUP_KEYS)].flatMap(([, value]) =>
      [...value.matchAll(/'([^']+)'|"([^"]+)"/g)].map(([, single, double]) => (single ?? double).replace(/^<rootDir>\//, '')),
    )
    for (const literal of literals) {
      const base = portablePath(root, resolve(root, dirname(path), literal))
      const found = SETUP_EXTENSIONS.map((extension) => `${base}${extension}`).find((candidate) => candidate in worktree)
      if (found) paths.push(found)
      else unresolved.push(`${path} → ${literal}`)
    }
    if (/\b(?:setupFiles|setupFilesAfterEnv|globalSetup)\s*:\s*(?!['"[]|require\.resolve)/.test(content)) {
      unresolved.push(`${path} → non-literal setup`)
    }
  }
  return { paths: [...new Set(paths)].sort(), unresolved, suggested }
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

/** Outcome Brief `- Risk:`의 첫 단어를 run risk로 읽는다(뒤 사유 허용). 없으면 null — 이 필드 이전에 잠긴 카드다. */
function cardRisk(card) {
  const brief = card.split(/^## /m).find((section) => section.startsWith('Outcome Brief'))
  const risk = brief?.match(/^- Risk:\s*(\w+)/m)?.[1]?.toLowerCase()
  return REQUIRED_CONSECUTIVE_PASSES[risk] ? risk : null
}

/**
 * 잠긴 카드의 Risk가 판정 강도를 정한다 — High 카드를 `--risk medium`으로 돌리면 mutation·3회 통과·blind mapping이
 * 빠진다. `--risk`는 Risk 필드 이전에 잠긴 카드에만 쓰인다.
 */
function resolveRisk(requested, card) {
  const locked = cardRisk(card)
  if (!locked) return requested ?? 'medium'
  if (requested !== undefined && requested !== locked) {
    throw new CliError('RISK_MISMATCH', `--risk ${requested} disagrees with the locked card's Risk: ${locked}`)
  }
  return locked
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
  const git = spawnGit( ['-C', root, 'ls-files', '-c', '-o', '--exclude-standard', '-z'])

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
        ...(entry.workerAttemptId ? { workerAttemptId: entry.workerAttemptId } : {}),
        runId: entry.evidenceRunId ?? null,
        reason: entry.reason ?? null,
        row: entry.row ?? null,
        evidence: entry.evidence ?? null,
        findings: entry.findings ?? null,
        packet: entry.packet ?? null,
        // 멈춤 원인은 원장이 가진 사실이다 — state 쓰기가 끊겨 재생될 때도 잃지 않는다
        ...(entry.lockStop ? { lockStop: entry.lockStop } : {}),
        ...(entry.blindMapping ? { blindMapping: entry.blindMapping } : {}),
        ...(entry.reviewAttestation ? { reviewAttestation: entry.reviewAttestation } : {}),
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

function runVerifier(args, { cwd } = {}) {
  const verified = spawnSync(process.execPath, [verifyScript, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) })

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
  const commit = spawnGit( ['-C', root, 'rev-parse', 'HEAD'], options)
  const dirty = spawnGit( ['-C', root, 'status', '--porcelain=v1', '--untracked-files=normal'], options)
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

function isTerminalTestData(data) {
  const named = typeof data.name === 'string' && data.name !== ''
  const known = ['passed', 'failed', 'skipped', 'todo', 'cancelled', 'flaky'].includes(data.status)
  const cause = data.cause === undefined || FAILURE_CAUSES.includes(data.cause)
  return named && known && cause && (data.file === undefined || typeof data.file === 'string')
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
    if (!isTerminalTestData(event.data)) return { error: 'Node reporter output has an invalid terminal test event' }
    // 원인·파일이 없으면 undefined — 원장 JSON에서 키가 빠진다
    const { name, status, cause, file } = event.data
    tests.push({ name, status, cause, file })
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

/**
 * 블라인드 행↔테스트 매핑이 필요한가 — subagent-review.md의 규칙 그대로다.
 * High은 언제나, Medium은 한 테스트가 여러 행을 지는 N:1 매핑이 있을 때. Low는 해당 없다.
 * 판정 입력은 검증된 런의 risk와 증거 매핑뿐이다 — 호출자가 넘긴 옵션은 판정에 쓰지 않는다.
 */
function blindMappingApplicability(risk, evidence) {
  const tests = Object.entries(evidence?.rows ?? {}).filter(([, entry]) => entry?.kind === 'test')
  const byName = new Map()
  for (const [row, entry] of tests) byName.set(entry.name, [...(byName.get(entry.name) ?? []), row])
  const shared = [...byName.entries()].filter(([, rows]) => rows.length > 1).map(([name]) => name)
  // High은 조건 없이 언제나 요구된다. 테스트 증거가 하나도 없으면 면제가 아니라 증거가 잘못된 것이다 —
  // 그 판정은 호출부가 EVIDENCE_INVALID로 막는다.
  if (risk === 'high') return { required: true, reason: 'high-risk review always runs the blind mapping', shared }
  if (risk === 'medium' && shared.length > 0) {
    return { required: true, reason: `medium risk with rows sharing one test: ${shared.sort().join(', ')}`, shared }
  }
  return { required: false, reason: null, shared }
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
  const testNames = (entries, frameMetadata = false) =>
    Object.fromEntries(
      Object.entries(entries ?? {})
        .filter(([, entry]) => entry?.kind === 'test')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, {
          kind: 'test', name: entry.name,
          ...(frameMetadata ? Object.fromEntries(['tuple', 'scenario', 'dimensionRevision', 'constraintRevision']
            .filter((field) => Object.hasOwn(entry, field)).map((field) => [field, entry[field]])) : {}),
        }]),
    )

  const sequenceBinding = (entry) => {
    if (entry?.kind !== 'test') return null
    return { kind: 'test', name: entry.name }
  }

  const bindings = {
    rows: testNames(document?.rows),
    paths: testNames(document?.paths),
    frames: testNames(document?.frames, true),
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

  if (options.risk !== undefined && !REQUIRED_CONSECUTIVE_PASSES[options.risk]) {
    throw new CliError('USAGE', `Unknown risk: ${options.risk}`, 2)
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
    // 잠긴 카드를 읽은 뒤 resolveRisk가 정한다.
    risk: null,
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
  state.risk = resolveRisk(options.risk, oracle)
  state.milestones = parseMilestones(options.milestones, contractRowIds(oracle))
  state.snapshot = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  // RED 전 기존 테스트 변경을 as-is → to-be로만 허용하는 기준선 — 코드 테스트만 잰다(스크린샷 바이트는 재지 않는다)
  state.testFilesAtInit = {}
  for (const path of Object.keys(state.snapshot).filter((candidate) => isTestPath(candidate) && SCANNABLE.test(candidate))) {
    state.testFilesAtInit[path] = measureTestFile(await readFile(join(scanRoot, path), 'utf8'))
  }
  const runnerHarness = await runnerHarnessPaths(scanRoot, state.snapshot)
  harnessPaths.push(...runnerHarness.paths.filter((path) => !harnessPaths.includes(path)))
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

  process.stdout.write(
    [
      `RUN_STATE_INITIALIZED sha256:${revision.oracleSha256} state:ORACLE_READY`,
      ...runnerHarness.paths.map((path) => `HARNESS_AUTO ${path}`),
      ...runnerHarness.unresolved.map((entry) => `HARNESS_SETUP_UNRESOLVED ${entry} — register it with --harness-path`),
      ...runnerHarness.suggested
        .filter((path) => !harnessPaths.includes(path))
        .map((path) => `HARNESS_SUGGESTED ${path} — register it with --harness-path if it carries the test config`),
      '',
    ].join('\n'),
  )
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
      throw new CliError(
        'ADAPTER_COMMAND_INVALID',
        `${options.adapter} adapter owns reporter and destination options and refuses retry·snapshot-update·leniency flags`,
      )
    }
    const harnessRoot = resolve(directory, state.scanRoot)
    const unregistered = injectedPaths(options.adapter, options.command).filter(
      (value) => !(state.harnessPaths ?? []).includes(portablePath(harnessRoot, resolve(options.cwd ?? process.cwd(), value))),
    )
    if (unregistered.length > 0) {
      throw new CliError(
        'ADAPTER_COMMAND_INVALID',
        `${unregistered.join(', ')}: a preload·config·setup file must be a registered harness path (init --harness-path)`,
      )
    }
  }
  const reportBefore = await reportSignature(options.report)
  if (options.adapter && reportBefore) {
    throw new CliError('REPORT_PATH_EXISTS', 'trusted adapter reports must use a new destination')
  }
  const runId = options.reservedRunId ?? await reserveRunId(directory, options.label)
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
  const controls = options.capture ? await workerControls(directory) : null
  const commandStartedAt = Date.now() // oracle:nondeterminism 명령 소요 시간 계측
  const executed = spawnSync(command[0], command.slice(1), {
    stdio: options.capture ? 'pipe' : 'inherit',
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.capture ? { input: options.capture.input, encoding: 'utf8', timeout: options.capture.timeout, maxBuffer: 16 * 1024 * 1024 } : {}),
    ...(adapterEnv ? { env: { ...process.env, ...adapterEnv } } : {}),
  })
  const commandMs = Date.now() - commandStartedAt // oracle:nondeterminism 명령 소요 시간 계측

  if (executed.error) {
    throw new CliError('COMMAND_UNRUNNABLE', `Cannot run command: ${executed.error.message}`)
  }

  if (controls && !sameDigests(controls, await workerControls(directory))) throw new CliError('WORKER_PROTECTED_CHANGE', 'worker changed Oracle artifacts')
  if (options.capture) await writeFile(options.capture.outputPath, executed.stdout ?? '', { flag: 'wx', mode: 0o600 })
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
    cwd: options.cwd ?? process.cwd(),
    ...(options.worker ? { worker: { ...options.worker, ...(options.capture ? { outputSha256: sha256(executed.stdout ?? '') } : {}) } } : {}),
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

/** 기준선 측정과 비교해 약해진 테스트 — 지워졌거나, assertion·기대값 리터럴이 줄었거나, 금지 토큰·허용치가 늘었다. */
async function weakenedTests(baseline, scanRoot, since) {
  const weakened = []

  for (const [path, recorded] of Object.entries(baseline)) {
    let content
    try {
      content = await readFile(join(scanRoot, path), 'utf8')
    } catch {
      weakened.push({ path, message: `${path}: deleted after ${since}` })
      continue
    }

    const current = measureTestFile(content)
    if (current.sha256 === recorded.sha256) continue
    const found = (message) => weakened.push({ path, message: `${path}: ${message}` })

    if (current.assertions < recorded.assertions) found(`assertions ${recorded.assertions} → ${current.assertions}`)

    for (const [literal, count] of Object.entries(recorded.literals ?? {})) {
      const now = current.literals[literal] ?? 0
      if (now < count) found(`expected literal ${literal} ${count} → ${now}`)
    }

    for (const [token, count] of Object.entries(current.banned)) {
      const before = recorded.banned[token] ?? 0
      if (count > before) found(`${token} ${before} → ${count}`)
    }

    for (const [token, value] of Object.entries(current.tolerances)) {
      const before = recorded.tolerances?.[token]
      if (before !== undefined && value > before) found(`${token} ${before} → ${value}`)
    }
  }

  return weakened
}

async function assertTestsNotWeakened(state, scanRoot) {
  if (!state.testFiles) return
  const weakened = await weakenedTests(state.testFiles, scanRoot, 'VALID_RED')
  if (weakened.length > 0) {
    throw new CliError(
      'TEST_WEAKENED',
      `tests weakened since VALID_RED:\n  ${weakened.map(({ message }) => message).join('\n  ')}`,
    )
  }
}

/**
 * RED가 테스트 강도의 기준선이 되기 전, init 이후 기존 테스트가 약해졌는가. 옛 기대값을 바꿀 수 있는 곳은 바뀌는 행의
 * 테스트가 사는 파일(리포터가 적은 file)과 그 행의 As-is가 경로로 가리킨 파일(옮기거나 지운 옛 테스트)뿐이다.
 * ponytail: 판정 단위가 파일이다 — 바뀌는 행의 파일 안에서는 다른 테스트의 약화가 묻힌다. 필요하면 테스트 블록 단위로.
 */
async function assertExistingTestsNotWeakened(state, scanRoot, deltas, evidenceRows, redRunOf) {
  if (!state.testFilesAtInit) return
  const changed = Object.entries(deltas).filter(([, entry]) => entry.delta === 'changed')
  // 러너는 실경로(/private/var/…)를 적는다 — 스냅샷 키와 같은 기준으로 맞춘다
  const root = await realpath(scanRoot)
  const authorized = new Set()
  for (const [row] of changed) {
    const name = evidenceRows[row]?.name
    for (const test of redRunOf(row).tests ?? []) {
      if (test.name !== name || typeof test.file !== 'string') continue
      authorized.add(portablePath(root, await realpath(test.file).catch(() => resolve(test.file))))
    }
  }
  const weakened = (await weakenedTests(state.testFilesAtInit, scanRoot, 'init')).filter(
    ({ path }) => !authorized.has(path) && !changed.some(([, entry]) => entry.asIs.includes(path)),
  )
  if (weakened.length > 0) {
    throw new CliError(
      'TEST_WEAKENED_BEFORE_RED',
      `existing tests lost strength since init and no changed row accounts for them:\n  ${weakened.map(({ message }) => message).join('\n  ')}`,
    )
  }
}

const STRICT_MODE_ENABLED =
  /<(?:React\.)?StrictMode\b|wrapper:\s*(?:React\.)?StrictMode\b|createElement\(\s*(?:React\.)?StrictMode\b|reactStrictMode\s*:\s*true/

/**
 * init 기준선 바이트를 git HEAD에서 되살린다 — HEAD의 바이트가 init 스냅샷 digest와 같을 때만. 다르면(init 때 이미
 * 더러웠거나 git이 없으면) 기준선이 없는 것으로 두고 파일 전체를 새 줄로 판정한다.
 */
async function writeBaselines(state, scanRoot, paths, baselineRoot) {
  for (const path of paths.filter((candidate) => candidate in state.snapshot)) {
    const shown = spawnGit(['-C', scanRoot, 'show', `HEAD:./${path}`], { maxBuffer: 16 * 1024 * 1024 })
    if (shown.status !== 0 || sha256(shown.stdout) !== state.snapshot[path]) continue
    await mkdir(dirname(join(baselineRoot, path)), { recursive: true })
    await writeFile(join(baselineRoot, path), shown.stdout)
  }
}

/**
 * GREEN이 직접 스캔한다 — 변경된 production 코드의 side-effect 소유·Case space 차원·비결정성·테스트 환경 분기.
 * 파일 목록은 init 기준선과의 diff라서 에이전트가 고르지 않는다. 토큰은 init 이후 새로 생긴 줄만 판정하고, 차원 계열은
 * 파일 단위다. 경로는 scan root 기준이다.
 */
async function assertChangedProductionScanned(state, current, scanRoot, oracle) {
  const changed = changedPaths(state.snapshot, current).filter(
    (path) => path in current && !isTestPath(path) && !(state.harnessPaths ?? []).includes(path) && SCANNABLE.test(path),
  )
  if (changed.length === 0) return
  const baselineRoot = await mkdtemp(join(tmpdir(), 'oracle-scan-baseline-'))
  try {
    await writeBaselines(state, scanRoot, changed, baselineRoot)
    const paths = [...changed.flatMap((path) => ['--path', path]), '--baseline-root', baselineRoot]
    runVerifier(['scan', '--side-effects', '--oracle', oracle, ...paths], { cwd: scanRoot })
    runVerifier(['scan', ...paths], { cwd: scanRoot })
  } finally {
    await rm(baselineRoot, { recursive: true, force: true })
  }
}

/** 카드가 StrictMode를 선언했으면 테스트가 실제로 그 아래에서 돌아야 한다 — 선언만 하고 한 번 렌더하면 r11b #1이 샌다. */
async function assertStrictModeExecuted(state, current, scanRoot, oracleText) {
  let caseSpace = null
  try {
    caseSpace = parseCaseSpace(oracleText)
  } catch {
    return // 잘못된 Case space는 card lint가 lock 전에 막는다
  }
  const declared = caseSpace?.families.some(
    (entry) =>
      entry.family === 'Environment' &&
      !entry.excluded &&
      [entry.dimension, ...(entry.choices ?? []).map((choice) => choice.value)].some((value) =>
        /strict[\s_-]*mode/i.test(value ?? ''),
      ),
  )
  if (!declared) return
  // 이 카드의 테스트(VALID_RED가 얼린 것)와 등록된 harness만 본다 — 레포 어딘가의 다른 테스트나 주석은 증거가 아니다
  const cardTests = Object.keys(state.testBindings?.tests ?? {}).filter((path) => path in current)
  const files = [...new Set([...(state.harnessPaths ?? []), ...cardTests])].filter((path) => SCANNABLE.test(path))
  for (const path of files) {
    const code = (await readFile(join(scanRoot, path), 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
      .join('\n')
    if (STRICT_MODE_ENABLED.test(code)) return
  }
  throw new CliError(
    'DIMENSION_NOT_EXECUTED',
    'the Case space declares StrictMode, but no registered harness file or test renders under <StrictMode> or reactStrictMode: true',
  )
}

async function assertWitnessesHold(directory, state) {
  const invalidated = await invalidatedWitnesses(resolve(directory, state.lock))
  if (invalidated.length > 0) {
    throw new CliError(
      'WITNESS_INVALIDATED',
      `the implementation changed the code these impossible cells cite: ${invalidated.join(', ')}`,
    )
  }
}

/**
 * 호스트 영수증 — hook을 지원하는 호스트에서는 SubagentStop·SubagentHandback이 리뷰어가 실제로 반환한 산출물의 digest를
 * host-receipts.jsonl에 적는다. 그 파일이 있으면 제출한 findings·블라인드 매핑은 서로 다른 서브에이전트의 반환물과 같아야
 * 한다. 파일이 없으면(hook 없는 호스트) 컨트롤러 영수증뿐이며 `self-reported`로 남긴다.
 */
async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function assertHostReceipts(directory, state, artifacts) {
  const raw = await readFile(join(directory, HOST_RECEIPTS_FILE), 'utf8').catch(() => null)
  if (raw === null && state.hostReceipts) {
    throw new CliError('REVIEW_RECEIPT_UNATTESTED', `${HOST_RECEIPTS_FILE} existed at IMPLEMENTED_GREEN and is gone`)
  }
  if (raw === null) return 'self-reported'
  const receipts = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const agents = new Set()
  for (const [label, document] of artifacts) {
    const digest = reviewOutputDigest(document)
    const matching = receipts.filter((receipt) => receipt.kind === digest?.kind && receipt.sha256 === digest?.sha256)
    if (matching.length === 0) {
      throw new CliError('REVIEW_RECEIPT_UNATTESTED', `the ${label} does not match any reviewer output this host recorded`)
    }
    const fresh = matching.find((receipt) => !agents.has(receipt.agentId))
    if (!fresh) {
      throw new CliError('REVIEWER_NOT_INDEPENDENT', `the ${label} came from the same subagent as another review artifact`)
    }
    agents.add(fresh.agentId)
  }
  return 'host'
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

/**
 * 블라인드 매핑 영수증 — `--packet`에는 blind-input을, `--findings`에는 매핑 파일을 준다. 두 바이트를 원장에
 * 직접 묶어, REVIEW_VERIFIED가 "이 입력을 읽고 이 매핑을 낸 작업"을 확인할 수 있게 한다.
 */
async function blindMapReceipt(options, directory, state) {
  const inputSnapshot = await snapshotRegularFile(resolve(options.packet), {
    base: directory,
    allowHardlinks: false,
    label: 'blind mapping input',
    fail: (message) => new CliError('BLIND_INPUT_INVALID', message),
  })
  const input = JSON.parse(inputSnapshot.bytes.toString('utf8'))
  if (input?.schemaVersion !== 1 || input?.targetRevision !== options.revision) {
    throw new CliError('BLIND_INPUT_INVALID', 'blind mapping receipt must cite a `blind-input` for this revision')
  }
  const mapSnapshot = await snapshotRegularFile(resolve(options.findings), {
    base: directory,
    allowHardlinks: false,
    label: 'blind mapping',
    fail: (message) => new CliError('BLIND_MAP_INVALID', message),
  })
  let map
  try {
    map = JSON.parse(mapSnapshot.bytes.toString('utf8'))
  } catch (error) {
    throw new CliError('BLIND_MAP_INVALID', `Cannot read the blind mapping: ${error.message}`)
  }
  if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length === 0) {
    throw new CliError('BLIND_MAP_INVALID', 'the blind mapping must be a non-empty JSON object keyed by test name')
  }
  const revision = verifyLock(directory, state)
  const receiptId = sha256(
    stableStringify({
      inputSha256: inputSnapshot.sha256,
      mapSha256: mapSnapshot.sha256,
      revision: options.revision,
      role: 'blind-mapper',
      reviewerId: options.reviewer,
      taskId: options.taskId,
    }),
  )
  const event = await appendLedger(directory, {
    type: 'review-receipt',
    receiptId,
    // 블라인드 리뷰어는 리뷰 패킷을 읽지 않는다 — packetSha256 자리에는 그가 실제로 읽은 입력을 적는다.
    packetSha256: inputSnapshot.sha256,
    targetRevision: options.revision,
    role: 'blind-mapper',
    reviewerId: options.reviewer,
    taskId: options.taskId,
    outputSha256: inputSnapshot.sha256,
    findingsSha256: mapSnapshot.sha256,
    oracleSha256: revision.oracleSha256,
    adapter: 'controller',
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  })
  state.ledgerHead = event.digest
  await writeState(directory, state)
  process.stdout.write(`BLIND_MAP_RECEIPT ${receiptId} digest:${event.digest}\n`)
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
    // 블라인드 매핑 영수증은 같은 원장 장치를 쓰되 입력이 다르다: 리뷰 패킷이 아니라 blind-input이고,
    // 산출물은 findings가 아니라 `{ "<test name>": "O1" }` 매핑이다. 그래서 판정 findings 스키마를 요구하지 않는다.
    if (options.role === 'blind-mapper') return await blindMapReceipt(options, directory, state)
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
    return undefined
  })
}

/**
 * 드리프트 상태에서 멈춤을 기록할 때 남기는 원인. 기대값은 마지막으로 신뢰된 run-state·manifest의 값이고,
 * 관측값은 지금 실제로 읽히는 바이트다. 관측은 사실 기록일 뿐 검증이 아니다 — 읽을 수 없으면
 * 지어내지 않고 null로 남긴다.
 *
 * 관측도 읽기다. 그래서 나머지 읽기와 **같은** 경로 규칙을 쓴다: snapshotRegularFile로 심볼릭 링크·
 * 하드링크·TOCTOU를 막고 base 밖으로 나가지 않는다. 그리고 드리프트한 manifest가 가리키는 임의 경로를
 * 따라가지 않는다 — 포인터는 신뢰된 digest와 일치하는 manifest에서만 따른다.
 */
async function lockStopCause(directory, state, error) {
  const lockPath = resolve(directory, state.lock)
  const lockDirectory = dirname(lockPath)
  const scanRoot = resolve(directory, state.scanRoot)
  // 잠긴 출처는 저장소 루트 아래에 있다 — oracle-lock·review-packet이 쓰는 것과 같은 경계다.
  const observationRoot = commonAncestor(lockDirectory, scanRoot)

  /** 확립된 스냅샷 규칙으로만 관측한다. 규칙을 못 지키면 사실이 아니라 unavailable이다. */
  const observe = async (path, base) => {
    try {
      const target = resolve(path)
      if (!isPathInside(base, target)) return null
      const snapshot = await snapshotRegularFile(target, { base, allowHardlinks: false, label: 'observed file' })
      // 읽는 도중 바뀐 바이트는 사실로 기록하지 않는다
      await assertSnapshotUnchanged(snapshot, { base, label: 'observed file' })
      return snapshot
    } catch {
      return null
    }
  }

  const lockSnapshot = await observe(lockPath, observationRoot)
  const observedManifestSha256 = lockSnapshot?.sha256 ?? null
  // manifest가 신뢰된 digest와 다르면 그것이 가리키는 경로는 더 이상 신뢰 입력이 아니다.
  // 드리프트한 포인터를 따라가면 공격자가 고른 파일의 digest를 사실로 적게 된다.
  const manifestTrusted = Boolean(
    observedManifestSha256 && state.lockManifestSha256 && observedManifestSha256 === state.lockManifestSha256,
  )
  let manifest = null
  if (manifestTrusted) {
    try {
      manifest = JSON.parse(lockSnapshot.bytes.toString('utf8'))
    } catch {
      manifest = null
    }
  }

  let observedOracleSha256 = null
  if (manifest?.oracle?.path) {
    observedOracleSha256 = (await observe(resolve(lockDirectory, manifest.oracle.path), observationRoot))?.sha256 ?? null
  }
  // 잠긴 출처도 같은 규칙으로 관측한다 — SOURCE_CHANGED의 어떤 출처가 어떻게 어긋났는지 남긴다.
  const observedSources = []
  for (const source of manifest?.sources ?? []) {
    if (typeof source?.path !== 'string' || !isDigest(source.sha256)) continue
    observedSources.push({
      path: source.path,
      expectedSha256: source.sha256,
      observedSha256: (await observe(resolve(lockDirectory, source.path), observationRoot))?.sha256 ?? null,
    })
  }

  return {
    code: error.code ?? 'LOCK_INVALID',
    message: error.message,
    priorState: state.state,
    expectedOracleSha256: state.lockSha256 ?? null,
    expectedManifestSha256: state.lockManifestSha256 ?? null,
    observedManifestSha256,
    // manifest 자체가 드리프트했으면 그 포인터로 얻은 관측은 존재하지 않는다 — 지어내지 않는다
    observedOracleSha256,
    observedSources,
    manifestTrusted,
  }
}

/**
 * 블라인드 매핑 증거 결속. 리뷰어가 읽은 입력이 (a) 승인된 리비전, (b) 그 리비전의 테스트 소스 바이트,
 * (c) 지금 검증 중인 매핑의 digest, (d) 원장에 있는 리뷰어·작업 영수증에 묶여 있는지 확인한다.
 * 입력 결속은 같은 사용자 권한을 가진 악의적 행위자에 대한 증명이 아니다 — 잘못된 리비전·낡은 테스트·
 * 바뀐 매핑·다른 영수증을 거절하는 것까지가 이 검사의 범위다.
 */
/** 정본 파생과 제출된 입력의 키 집합·값이 정확히 같아야 한다 — 여분 문맥은 블라인드성을 깬다. */
const BLIND_INPUT_KEYS = [
  'schemaVersion',
  'targetRevision',
  'oracleSha256',
  'lockManifestSha256',
  'evidenceMappingSha256',
  'testBindingsSha256',
  'blindMappingRequired',
  'contractRows',
  'testSources',
]

async function assertBlindMappingEvidence(directory, state, options, expected) {
  const inputSnapshot = await snapshotRegularFile(resolve(options.blindInput), {
    base: directory,
    allowHardlinks: false,
    label: 'blind mapping input',
    fail: (message) => new CliError('BLIND_INPUT_INVALID', message),
  })
  const mapSnapshot = await snapshotRegularFile(resolve(options.blindMap), {
    base: directory,
    allowHardlinks: false,
    label: 'blind mapping',
    fail: (message) => new CliError('BLIND_MAP_INVALID', message),
  })
  let input
  try {
    input = JSON.parse(inputSnapshot.bytes.toString('utf8'))
  } catch (error) {
    throw new CliError('BLIND_INPUT_INVALID', `Cannot read blind mapping input: ${error.message}`)
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CliError('BLIND_INPUT_INVALID', 'blind mapping input must be a JSON object from `blind-input`')
  }

  const currentEvidenceMappingSha256 = sha256(await readFile(expected.evidencePath))
  if (input.evidenceMappingSha256 !== currentEvidenceMappingSha256) {
    throw new CliError('BLIND_MAP_STALE', 'the evidence mapping changed after the blind input was derived')
  }

  // 제출된 입력을 "검사"하지 않는다 — 지금 신뢰된 값에서 정본을 **다시 파생**해 통째로 대조한다.
  // 그래서 관련 테스트를 빼거나, 계약 행을 고치거나, production 문맥을 끼워 넣은 입력은 통과할 수 없다.
  const canonical = (await deriveBlindInput(directory, state)).document
  const extra = Object.keys(input).filter((key) => !BLIND_INPUT_KEYS.includes(key))
  if (extra.length > 0) {
    throw new CliError('BLIND_INPUT_INVALID', `blind mapping input carries context it must not have: ${extra.join(', ')}`)
  }
  if (stableStringify(input) !== stableStringify(canonical)) {
    const reason = BLIND_INPUT_KEYS.filter((key) => stableStringify(input[key]) !== stableStringify(canonical[key]))
    throw new CliError(
      'BLIND_INPUT_STALE',
      `blind mapping input is not the canonical derivation for this revision (${reason.join(', ') || 'shape'})`,
    )
  }
  // 정본은 지금 검증 중인 리비전·카드·매핑을 가리켜야 한다.
  if (canonical.targetRevision !== expected.targetRevision || canonical.oracleSha256 !== expected.oracleSha256) {
    throw new CliError('BLIND_INPUT_STALE', 'blind mapping input does not target the approved revision')
  }
  if (canonical.lockManifestSha256 !== expected.lockManifestSha256) {
    throw new CliError('BLIND_INPUT_STALE', 'blind mapping input does not match the verified lock manifest')
  }

  // 원장에 있는 리뷰어·작업 영수증 — 식별자를 입력 파일에서 읽지 않는다. 원장 사건이 이 입력 바이트와
  // 이 매핑 바이트를 직접 가리켜야 한다. 그래서 다른 작업의 영수증을 이 매핑에 붙일 수 없다.
  const receiptEvent = expected.ledger.find(
    (entry) =>
      entry.type === 'review-receipt' &&
      entry.role === 'blind-mapper' &&
      entry.outputSha256 === inputSnapshot.sha256 &&
      entry.findingsSha256 === mapSnapshot.sha256,
  )
  if (
    !receiptEvent ||
    receiptEvent.targetRevision !== expected.targetRevision ||
    receiptEvent.oracleSha256 !== expected.oracleSha256 ||
    receiptEvent.adapter !== 'controller'
  ) {
    throw new CliError(
      'BLIND_MAP_RECEIPT_INVALID',
      'the blind mapping requires a ledger receipt bound to this input, this mapping and this revision',
    )
  }
  // 블라인드 리뷰어는 판정 리뷰어와 같을 수 없다 — 리뷰 패킷을 읽은 사람은 이미 evidence.json을 봤다.
  // 작업 식별자도 재사용할 수 없다: 패킷을 읽은 그 작업이 블라인드 읽기까지 겸했다고 주장할 수 없다.
  if (expected.reviewerIds.includes(receiptEvent.reviewerId)) {
    throw new CliError(
      'BLIND_MAP_RECEIPT_INVALID',
      `${receiptEvent.reviewerId} already reviewed with the packet — the blind read needs a reviewer who never saw evidence.json`,
    )
  }
  if ((expected.taskIds ?? []).includes(receiptEvent.taskId)) {
    throw new CliError(
      'BLIND_MAP_RECEIPT_INVALID',
      `${receiptEvent.taskId} is already bound to a packet review — the blind read needs its own task`,
    )
  }
  // 판정에 쓴 두 파일이 그 사이 바뀌지 않았음을 확립된 규칙대로 확인한다.
  for (const [label, snapshotToCheck] of [
    ['blind mapping input', inputSnapshot],
    ['blind mapping', mapSnapshot],
  ]) {
    await assertSnapshotUnchanged(snapshotToCheck, {
      base: directory,
      label,
      fail: (message) => new CliError('BLIND_INPUT_STALE', message),
    })
  }
  return {
    inputSha256: inputSnapshot.sha256,
    mapSha256: mapSnapshot.sha256,
    reviewerId: receiptEvent.reviewerId,
    taskId: receiptEvent.taskId,
  }
}

async function transitionUnderLock(options, directory) {
  const state = await readConsistentState(directory)
  const allowed = TRANSITIONS[state.state] ?? []

  if (!allowed.includes(options.to)) {
    throw new CliError('TRANSITION_NOT_ALLOWED', `${state.state} cannot move to ${options.to}`)
  }

  // NEEDS_DECISION·FAIL은 증거가 아니라 멈춤을 기록하는 탈출 전이다. 카드·출처·manifest가 드리프트하면
  // 성공 진행은 계속 거부하지만, 멈춤까지 막으면 드리프트 처방("NEEDS_DECISION으로 돌아가라") 자체가
  // 도달 불가능해진다. state·ledger 정체성은 이미 readConsistentState가 검증했으므로 여기서는
  // 원인을 기록만 하고, 어떤 relock·재개 권한도 주지 않는다. ledger 손상은 위에서 이미 fail closed다.
  const escaping = options.to === 'NEEDS_DECISION' || options.to === 'FAIL'
  let revision
  let lockStop = null
  try {
    revision = verifyLock(directory, state)
  } catch (error) {
    if (!escaping) throw error
    lockStop = await lockStopCause(directory, state, error)
    revision = { oracleSha256: state.lockSha256 ?? null, lockManifestSha256: state.lockManifestSha256 ?? null }
  }

  const allLedger = await readLedger(directory)
  const ledger = allLedger.filter((entry) => entry.type === 'run')
  const scanRoot = resolve(directory, state.scanRoot)
  const notices = []
  let packetSha256 = null
  let implementationRevision = null
  let blindMapping = null
  let reviewAttestation = null

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
    // 행별 delta — As-is 열이 `same`이면 기존 유지, 글이면 바뀌는 기존 동작. 열이 없는 카드는 전부 새 동작이다
    const deltas = JSON.parse(runVerifier(['card', '--delta', '--oracle', oracle]))
    const deltaOf = (row) => deltas[row]?.delta ?? 'new'
    if (options.row && deltaOf(options.row) === 'kept') {
      throw new CliError('RED_ROW_KEPT', `${options.row} is marked same — its test passes before implementation`)
    }
    const verifyRedRow = (row, runId) => {
      try {
        runVerifier([
          'red',
          '--oracle',
          oracle,
          '--map',
          resolve(options.evidence),
          '--ledger',
          ledgerPath(directory),
          '--run',
          runId,
          '--row',
          row,
        ])
      } catch (error) {
        // 바뀌는 행의 테스트가 지금 코드에서 통과한다면 아직 As-is 동작을 단언하고 있다
        if (error.code === 'RED_EVIDENCE_MISSING' && deltaOf(row) === 'changed') {
          const [detail] = error.message.split('\nnext:')
          throw new CliError('CHANGED_ROW_NOT_RED', `${detail} — the test still asserts the As-is behavior`)
        }
        throw error
      }
    }
    const coveringRun = new Map()
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
          coveringRun.set(row, milestone.run)
          // 기존 유지 행은 RED에서 통과해야 한다 — 아래 delta 검사가 본다
          if (deltaOf(row) !== 'kept') verifyRedRow(row, milestone.run.runId)
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

      verifyRedRow(options.row, run.runId)
    }

    // 행별 RED 기대 — 바뀌는 행은 실패, 기존 유지 행은 통과. 구현 전부터 통과한 새 행은 알리기만 한다(Never 행은 흔히 그렇다)
    const redRunOf = (row) => coveringRun.get(row) ?? run
    const evidenceRows = JSON.parse(await readFile(resolve(options.evidence), 'utf8')).rows ?? {}
    const vacuous = []
    for (const [row, { delta }] of Object.entries(deltas)) {
      const entry = evidenceRows[row]
      if (entry?.kind !== 'test') continue
      const covering = redRunOf(row)
      const observed = (covering.tests ?? []).find((test) => test.name === entry.name)
      if (delta === 'kept' && observed?.status !== 'passed') {
        throw new CliError(
          'KEPT_ROW_NOT_PASSING',
          `${row} is marked same, but "${entry.name}" is ${observed?.status ?? 'missing'} in ${covering.runId} — the behavior the card calls existing is not there`,
        )
      }
      if (delta === 'changed' && row !== options.row && !coveringRun.has(row)) verifyRedRow(row, covering.runId)
      if (delta === 'new' && observed?.status === 'passed') vacuous.push(row)
    }
    if (vacuous.length > 0) {
      notices.push(`RED_VACUOUS ${vacuous.join(', ')} — passed before implementation; only a mutation can show they catch this change`)
    }
    await assertExistingTestsNotWeakened(state, scanRoot, deltas, evidenceRows, redRunOf)

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

    const lockedOracle = await lockedOraclePath(directory, state)
    await assertWitnessesHold(directory, state)
    await assertStrictModeExecuted(state, current, scanRoot, await readFile(lockedOracle, 'utf8'))
    await assertChangedProductionScanned(state, current, scanRoot, lockedOracle)
    // 이 호스트의 hook이 영수증 파일을 만들었는가 — REVIEW는 그 뒤 파일이 사라진 것을 증거 삭제로 본다
    state.hostReceipts = await lstat(join(directory, HOST_RECEIPTS_FILE)).then(
      () => true,
      () => false,
    )
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
    await assertWitnessesHold(directory, state)
    // 리뷰 반영으로 production이 바뀌었을 수 있다 — GREEN과 같은 스캔을 현재 바이트에 다시 건다
    await assertChangedProductionScanned(state, current, scanRoot, oracle)
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
      // 한 행의 가드만 죽인 변이여야 한다 — 모듈 전체를 깨뜨린 변이도 행 테스트는 죽인다. 표적의 증거는 둘 중 하나:
      // 행 테스트가 assertion으로 죽었거나, 다른 행에 매핑된 테스트가 살아 있다.
      const evidenceRows = JSON.parse(await readFile(resolve(options.evidence), 'utf8')).rows ?? {}
      const mutatedName = evidenceRows[options.mutationRow]?.name
      const mutationTests = mutationRun.tests ?? []
      const otherMapped = new Set(
        Object.values(evidenceRows)
          .filter((entry) => entry?.kind === 'test' && entry.name !== mutatedName)
          .map((entry) => entry.name),
      )
      const killedByAssertion = mutationTests.some((test) => test.name === mutatedName && test.cause === 'assertion')
      const otherRowSurvived = mutationTests.some((test) => otherMapped.has(test.name) && test.status === 'passed')
      if (
        mutationTests.length < (greenRun.tests?.length ?? 0) ||
        (!killedByAssertion && otherMapped.size > 0 && !otherRowSurvived)
      ) {
        throw new CliError(
          'MUTATION_NOT_TARGETED',
          `${mutationRun.runId} must run the full GREEN suite (${greenRun.tests?.length ?? 0} tests) and kill the ${options.mutationRow} test on its assertion or while another row's test still passes`,
        )
      }
      // 증거가 가장 약한 행 — 한 테스트를 여러 행이 나눠 쓰면 그 테스트가 각 행을 정말 assert하는지가 가장 덜 증명됐다
      const shared = blindMappingApplicability(state.risk, { rows: evidenceRows }).shared
      const weakest = Object.entries(evidenceRows)
        .filter(([, entry]) => entry?.kind === 'test' && shared.includes(entry.name))
        .map(([row]) => row)
        .sort()
      if (weakest.length > 0 && !weakest.includes(options.mutationRow)) {
        throw new CliError(
          'MUTATION_ROW_NOT_WEAKEST',
          `${options.mutationRow} owns its test alone — mutate one of ${weakest.join(', ')}, whose test is shared`,
        )
      }
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

    // 블라인드 행↔테스트 매핑 — 필요 여부는 검증된 런의 risk와 증거 매핑에서 파생한다. 호출자가 옵션을
    // 빼는 것으로는 우회할 수 없다. 판정은 마지막 게이트인 여기서만 하고, 앞선 단계는 조기에 잠그지 않는다.
    const evidenceDocument = JSON.parse(await readFile(resolve(options.evidence), 'utf8'))
    const intersectDocument = options.intersect
      ? JSON.parse(await readFile(resolve(options.intersect), 'utf8'))
      : null
    const intersectReviewerId = intersectDocument?.reviewerId ?? null
    const intersectTaskId = intersectDocument?.orchestrationReceipt?.taskId ?? null
    blindMapping = blindMappingApplicability(state.risk, evidenceDocument)
    if (blindMapping.required) {
      // High은 무조건 요구된다. 테스트 증거가 하나도 없다면 면제가 아니라 증거가 잘못된 것이다.
      const testRows = Object.values(evidenceDocument?.rows ?? {}).filter((entry) => entry?.kind === 'test')
      if (testRows.length === 0) {
        throw new CliError(
          'EVIDENCE_INVALID',
          'the blind mapping applies but no row maps to a test — an unmapped contract is not an exemption',
        )
      }
      if (!options.blindMap || !options.blindInput) {
        throw new CliError(
          'BLIND_MAP_REQUIRED',
          `${blindMapping.reason} — derive the input with \`blind-input\` and pass --blind-input and --blind-map`,
        )
      }
      blindMapping = {
        ...blindMapping,
        ...(await assertBlindMappingEvidence(directory, state, options, {
          evidencePath: resolve(options.evidence),
          targetRevision: options.revision,
          oracleSha256: revision.oracleSha256,
          lockManifestSha256: revision.lockManifestSha256,
          ledger: allLedger,
          reviewerIds: [findingsDocument?.reviewerId, intersectReviewerId].filter(Boolean),
          taskIds: [findingsDocument?.orchestrationReceipt?.taskId, intersectTaskId].filter(Boolean),
        })),
      }
    }

    const reviewArtifacts = [['findings', findingsDocument]]
    if (intersectDocument) reviewArtifacts.push(['intersect findings', intersectDocument])
    if (blindMapping?.required) reviewArtifacts.push(['blind map', await readJsonFile(resolve(options.blindMap))])
    reviewAttestation = await assertHostReceipts(directory, state, reviewArtifacts)

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
    // 블라인드 매핑 대조는 같은 review 호출에 붙인다 — 같은 패킷 검증을 두 번 하지 않는다.
    if (blindMapping?.required) reviewArgs.push('--blind-map', resolve(options.blindMap))
    runVerifier(reviewArgs)
  }

  state.state = options.to
  const historyEntry = {
    state: options.to,
    ...(options.workerAttemptId ? { workerAttemptId: options.workerAttemptId } : {}),
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
    ...(lockStop ? { lockStop } : {}),
    ...(blindMapping ? { blindMapping } : {}),
    ...(reviewAttestation ? { reviewAttestation } : {}),
    runCount: ledger.length,
    at: new Date().toISOString(), // oracle:nondeterminism ledger는 실제 실행 시각을 기록한다
  }
  state.history.push(historyEntry)

  const transitionEvent = await appendLedger(directory, {
    type: 'transition',
    state: options.to,
    ...(options.workerAttemptId ? { workerAttemptId: options.workerAttemptId } : {}),
    evidenceRunId: run?.runId ?? null,
    reason: options.reason ?? null,
    row: options.row ?? null,
    evidence: historyEntry.evidence,
    findings: historyEntry.findings,
    packet: historyEntry.packet,
    packetSha256: historyEntry.packetSha256,
    targetRevision: historyEntry.targetRevision,
    ...(lockStop ? { lockStop } : {}),
    ...(blindMapping ? { blindMapping } : {}),
    ...(reviewAttestation ? { reviewAttestation } : {}),
    stateDelta: {
      state: options.to,
      testFiles: state.testFiles,
      testBindings: state.testBindings,
      harnessAtValidRed: state.harnessAtValidRed,
      harnessBudgetAtValidRed: state.harnessBudgetAtValidRed,
      envDrift: state.envDrift,
      hostReceipts: state.hostReceipts ?? false,
    },
    runCount: ledger.length,
    at: historyEntry.at,
  })
  historyEntry.ledgerDigest = transitionEvent.digest
  state.ledgerHead = transitionEvent.digest
  await writeState(directory, state)
  // 드리프트 위에서 멈춤을 기록했다는 사실은 조용히 넘어가지 않는다 — 다음 사람이 잠금 상태를 오해하면 안 된다.
  if (lockStop) notices.push(`LOCK_UNVERIFIED ${lockStop.code}`)
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
    const filesDigest = sha256(JSON.stringify(selectedDigests(current, paths.sort())))
    // Before RED there is no frozen evidence binding; keep the existing file-only identity.
    if (!state.testBindings?.evidenceSha256) return filesDigest
    const evidenceDigest = await testEvidenceDigest(evidencePathFor(directory, state))
    // Legacy spends have file-only digests. Preserve their deduplication only while the binding is unchanged.
    if (evidenceDigest === state.testBindings.evidenceSha256 && state.budgets.harness.digests?.includes(filesDigest)) {
      return filesDigest
    }
    return sha256(stableStringify({ filesDigest, evidenceDigest }))
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

    const sourceDigest = await budgetDigest(directory, state, options.spend)
    const digest = options.workerAttemptId ? sha256(stableStringify({ sourceDigest, workerAttemptId: options.workerAttemptId })) : sourceDigest
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
  const listed = spawnGit( ['-C', root, 'ls-files', '-z'], gitOptions)
  if (listed.status !== 0) return `GIT_DIFF_UNAVAILABLE: ${listed.stderr.trim() || 'not a git worktree'}`

  const tracked = new Set(listed.stdout.split('\0').filter(Boolean))
  const head = spawnGit( ['-C', root, 'diff', '--no-ext-diff', '--binary', 'HEAD', '--', ...changed], gitOptions)
  const parts = []

  if (head.status === 0) {
    if (head.stdout.trim()) parts.push(head.stdout.trimEnd())
  } else {
    for (const args of [
      ['diff', '--no-ext-diff', '--binary', '--', ...changed],
      ['diff', '--cached', '--no-ext-diff', '--binary', '--', ...changed],
    ]) {
      const fallback = spawnGit( ['-C', root, ...args], gitOptions)
      if (fallback.status === 0 && fallback.stdout.trim()) parts.push(fallback.stdout.trimEnd())
    }
  }

  for (const path of changed.filter((entry) => !tracked.has(entry))) {
    if (before[path] === undefined && current[path] !== undefined) {
      const addition = spawnGit( ['-C', root, 'diff', '--no-index', '--binary', '--', devNull, path], gitOptions)
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

/**
 * 블라인드 리뷰어 입력 — 리뷰 패킷은 evidence·구현 결정·다른 리뷰 판정을 모두 담으므로 블라인드 입력이 될 수
 * 없다. 그래서 같은 기계장치(잠금 검증·스냅샷·원장)로 **최소 전용 입력**만 파생한다: 카드의 계약 행 본문과
 * 테스트 소스 바이트뿐이다. 어떤 행이 어떤 테스트에 매핑됐는지는 들어가지 않는다.
 *
 * 새 workflow 엔진을 만들지 않는다 — VALID_RED가 이미 얼려 둔 test 바인딩과 GREEN이 검증한 스냅샷을 쓴다.
 */
/**
 * 블라인드 리뷰어 입력의 **정본 파생**. 생산자(`blind-input`)와 검증자(REVIEW_VERIFIED)가 이 함수 하나를
 * 함께 쓴다. 그래서 "리뷰어가 읽었어야 할 것"이 두 곳에서 갈라지지 않는다.
 *
 * 입력은 신뢰된 값에서만 나온다: 잠금이 검증한 카드 바이트, VALID_RED가 얼린 테스트 경로, 등록된 harness
 * 경로. 호출자가 고른 파일 목록은 쓰지 않는다 — 그래서 테스트를 빼거나 production 파일을 끼워 넣을 수 없다.
 */
async function deriveBlindInput(directory, state, { protect } = {}) {
  const revision = verifyLock(directory, state)
  const scanRoot = resolve(directory, state.scanRoot)
  const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const snapshots = []
  const oraclePath = await lockedOraclePath(directory, state)
  const oracleSnapshot = await snapshotPacketFile(oraclePath, directory, 'Oracle', snapshots)
  if (oracleSnapshot.sha256 !== revision.oracleSha256) {
    throw new CliError('BLIND_INPUT_INVALID', 'Oracle bytes do not match the verified lock')
  }
  const evidencePath = evidencePathFor(directory, state)
  const evidenceSnapshot = await snapshotPacketFile(evidencePath, directory, 'evidence map', snapshots)
  const evidence = JSON.parse(evidenceSnapshot.bytes.toString('utf8'))
  // 카드·lock·state·ledger·evidence는 판정의 입력이다 — 산출물이 이들을 덮어써서는 안 된다.
  protect?.(
    new Set([resolve(directory, state.lock), statePath(directory), ledgerPath(directory), oraclePath, evidencePath]),
  )
  const applicability = blindMappingApplicability(state.risk, evidence)

  // 리뷰어가 읽을 것: 잠긴 카드의 계약 행 줄과 얼린 테스트 원문. 두 가지뿐이다.
  const contractRows = oracleSnapshot.bytes
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\|\s*[OD]\d+\s*\|/.test(line))
  // 테스트 소스는 VALID_RED가 얼린 그 파일들이다 — 여기서 새로 고르지 않는다.
  // 스크린샷 기준선은 바이트로만 묶인다 — 이미지를 글자로 풀어 블라인드 입력에 싣지 않는다
  const testPaths = Object.keys(state.testBindings?.tests ?? {})
    .filter((path) => path in current && SCANNABLE.test(path))
    .sort()
  if (testPaths.length === 0) {
    throw new CliError('BLIND_INPUT_INVALID', 'blind mapping needs at least one frozen test source')
  }
  // 최소 의존 파일 — **등록된 harness 경로만**. 임의의 상대 import를 따라가면 production 모듈이 섞여
  // 블라인드성이 깨진다. 완전한 의존성 해석을 주장하지 않는다: 담기는 것은 등록된 harness helper뿐이다.
  const helperPaths = [
    ...new Set((state.harnessPaths ?? []).filter((path) => path in current && !testPaths.includes(path))),
  ].sort()

  const testSources = []
  for (const [path, dependency] of [
    ...testPaths.map((path) => [path, false]),
    ...helperPaths.map((path) => [path, true]),
  ]) {
    const label = dependency ? `test dependency ${path}` : `test source ${path}`
    const fileSnapshot = await snapshotPacketFile(join(scanRoot, path), scanRoot, label, snapshots)
    if (fileSnapshot.sha256 !== current[path]) {
      throw new CliError('BLIND_INPUT_STALE', `${path} changed while the blind input was derived`)
    }
    testSources.push({
      path,
      sha256: fileSnapshot.sha256,
      content: fileSnapshot.bytes.toString('utf8'),
      ...(dependency ? { dependency: true } : {}),
    })
  }

  // 확립된 규칙대로, 파생에 쓴 모든 입력이 그 사이 바뀌지 않았음을 확인한다.
  for (const { label, snapshot: inputSnapshot } of snapshots) {
    await assertSnapshotUnchanged(inputSnapshot, {
      label,
      fail: (message) => new CliError('BLIND_INPUT_STALE', message),
    })
  }

  return {
    revision,
    applicability,
    evidencePath,
    document: {
      schemaVersion: 1,
      targetRevision: sha256(JSON.stringify(current)),
      oracleSha256: revision.oracleSha256,
      lockManifestSha256: revision.lockManifestSha256,
      // 매핑 본문은 넣지 않는다 — 리뷰어가 본 적 없어야 2-sample이 성립한다. digest만 묶는다.
      evidenceMappingSha256: evidenceSnapshot.sha256,
      testBindingsSha256: await testEvidenceDigest(evidencePath),
      // applicability의 사유는 공유 테스트 이름 같은 매핑 힌트를 담으므로 리뷰어 입력에 넣지 않는다.
      blindMappingRequired: applicability.required,
      contractRows,
      testSources,
    },
  }
}

async function blindInput(options) {
  if (!options.dir || !options.output) {
    throw new CliError('USAGE', 'blind-input requires --dir and --output', 2)
  }
  const directory = resolve(options.dir)
  const state = await readConsistentState(directory)
  if (state.state !== 'IMPLEMENTED_GREEN') {
    throw new CliError('BLIND_INPUT_STATE', 'blind mapping input is derived in IMPLEMENTED_GREEN, before review')
  }
  const output = resolve(options.output)
  const outputRelative = relative(directory, output)
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) {
    throw new CliError('BLIND_INPUT_INVALID', '--output must be a file inside the Oracle directory')
  }
  if (outputRelative === '.run-ids' || outputRelative.startsWith(`.run-ids${sep}`)) {
    throw new CliError('BLIND_INPUT_INVALID', '--output cannot be written under .run-ids')
  }
  // 출력이 심볼릭 링크나 그 부모를 통해 디렉터리 밖으로 새지 않게 한다 — review-packet과 같은 규칙이다.
  const [directoryReal, outputParentReal] = await Promise.all([realpath(directory), realpath(dirname(output))]).catch(
    (error) => {
      throw new CliError('BLIND_INPUT_INVALID', `Cannot resolve output directory: ${error.message}`)
    },
  )
  if (!isPathInside(directoryReal, outputParentReal)) {
    throw new CliError('BLIND_INPUT_INVALID', '--output parent must stay inside the Oracle directory')
  }
  const outputMetadata = await lstat(output).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw new CliError('BLIND_INPUT_INVALID', `Cannot inspect output: ${error.message}`)
  })
  if (outputMetadata && (!outputMetadata.isFile() || outputMetadata.isSymbolicLink())) {
    throw new CliError('BLIND_INPUT_INVALID', '--output must be a regular file')
  }

  const derived = await deriveBlindInput(directory, state, {
    fail: (code, message) => new CliError(code, message),
    protect: (paths) => {
      if (paths.has(output)) {
        throw new CliError('BLIND_INPUT_INVALID', '--output cannot overwrite a verification input artifact')
      }
    },
  })
  const document = derived.document
  const temp = join(dirname(output), `.blind-input-${process.pid}-${Date.now()}.tmp`)
  try {
    await writeFile(temp, `${JSON.stringify(document, null, 2)}\n`)
    await rename(temp, output)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
  process.stdout.write(
    `BLIND_INPUT_WRITTEN ${portablePath(directory, output)} required:${document.blindMappingRequired} revision:${document.targetRevision}\n`,
  )
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
  let reviewContext
  if (options.context) {
    const contextSnapshot = await snapshotPacketFile(resolve(options.context), repositoryRoot, 'review context manifest', inputSnapshots)
    const contextPath = contextSnapshot.realPath
    let contextManifest
    try {
      contextManifest = JSON.parse(contextSnapshot.bytes.toString('utf8'))
    } catch (error) {
      throw new CliError('REVIEW_CONTEXT_INVALID', `Cannot read context manifest: ${error.message}`)
    }
    try {
      const selected = await snapshotContext(contextManifest, {
        root: repositoryRoot, oracle: oracleSnapshot.bytes.toString('utf8'),
        lock: manifest, lockDirectory, reviewPoints,
      })
      inputSnapshots.push(...selected.snapshots.map((snapshot) => ({ label: 'context file', snapshot })))
      reviewContext = {
        ...selected.context,
        repositoryRoot: portablePath(directoryReal, repositoryRoot),
        manifest: { path: portablePath(repositoryRoot, contextPath), sha256: contextSnapshot.sha256 },
      }
    } catch (error) {
      throw new CliError('REVIEW_CONTEXT_INVALID', error.message)
    }
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
    ...inputSnapshots.map((input) => input.snapshot.path),
  ])
  const outputReal = join(outputParentReal, basename(output))
  if (protectedPaths.has(output) || inputSnapshots.some(({ snapshot }) => snapshot.realPath === outputReal)) {
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
    ...(reviewContext ? { reviewContext } : {}),
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


// 실행 패킷 — 다음 전이마다 "무엇이 이미 충족됐고, 무엇이 아직 없고, 어떤 run을 인용할 수 있는가"를 기계가
// 계산한다. 모델이 Delivery 절차 전체를 다시 읽고 추론하는 대신 이 목록만 보고 한 걸음을 고른다. 안내는
// transitionUnderLock이 실제로 요구하는 인자·게이트에서 파생해야 하며, 서로 다른 규칙 사본을 유지하지 않는다.
// 판정은 여전히 transition이 한다: 여기서 ready=true여도 transition은 같은 검사를 다시 수행하고 실패할 수 있다.
const PACKET_READ_NODES = {
  VALID_RED: ['delivery-ledger', 'delivery-red'],
  IMPLEMENTED_GREEN: ['delivery-ledger', 'delivery-implementation-decision', 'delivery-green-review'],
  REVIEW_VERIFIED: ['delivery-green-review', 'subagent-review', 'review-checklist'],
  NEEDS_DECISION: [],
  ORACLE_READY: ['card-confirmation-lock'],
  FAIL: [],
}

/** transitionUnderLock 1697–2000행이 실제로 검사하는 인자·전제와 같은 규칙으로 패킷 하나를 만든다. */

function reviewRequiredFlags(risk, blindMapping) {
  const flags = ['--findings', '--packet', '--revision']
  if (risk === 'high') flags.push('--intersect', '--mutation-run', '--mutation-row')
  if (blindMapping?.required) flags.push('--blind-input', '--blind-map')
  return flags
}

function transitionPacket(to, { state, runEntries, staleRunIds, blockers, evidence, blindMapping }) {
  const requires = []
  const packetBlockers = []
  let candidateRuns = []
  const stale = new Set(staleRunIds)
  // NEEDS_DECISION·FAIL은 유효한 state·lock과 --reason만 요구하는 탈출 전이다. 전역 evidence blocker를
  // 상속하면 증거가 없을 때 쓰라고 있는 바로 그 전이를 잘못 잠근다. lock·ledger 손상만 물려받는다.
  const isEscapeTransition = to === 'NEEDS_DECISION' || to === 'FAIL'
  for (const code of blockers) {
    if (isEscapeTransition && (code === 'EVIDENCE_MISSING_ROWS' || code.startsWith('EVIDENCE_'))) continue
    packetBlockers.push(code)
  }

  if (isEscapeTransition) {
    requires.push('--reason')
  } else if (to === 'ORACLE_READY') {
    // NEEDS_DECISION → ORACLE_READY 재개는 transitionUnderLock에서 non-escape라 --run이 필수고 --reason은 받지 않는다.
    requires.push('--run')
    const fresh = runEntries.filter((entry) => !stale.has(entry.runId) && isCompletedReportedRun(entry))
    candidateRuns = fresh.map((entry) => entry.runId).reverse()
  } else {
    requires.push('--run', '--evidence')
    const wantsFailing = to === 'VALID_RED'
    const predicate = wantsFailing ? isReportedFailingRun : isReportedPassingRun
    // 인용 가능한 run: 신선하고 보고서가 파싱된 run을 최신순으로 — 오래된 run을 예시로 권하지 않는다.
    let entries = runEntries.filter((entry) => !stale.has(entry.runId) && predicate(entry))
    if (to === 'REVIEW_VERIFIED') {
      // GREEN 이후의 실제 재실행만 리뷰 인용이 가능하다 (REVIEW_RERUN_REQUIRED와 같은 규칙).
      const greenEntry = lastEntryFor(state, 'IMPLEMENTED_GREEN')
      if (greenEntry) {
        entries = entries.filter((entry, index) => {
          const position = runEntries.findIndex((candidate) => candidate.runId === entry.runId)
          return index >= 0 && position >= greenEntry.runCount
        })
      }
    }
    candidateRuns = entries.map((entry) => entry.runId).reverse()
    if (candidateRuns.length === 0) packetBlockers.push(wantsFailing ? 'NO_FRESH_RED_RUN' : 'NO_FRESH_GREEN_RUN')
    if (evidence.status === 'pending' && evidence.missingRows?.length > 0 && !packetBlockers.includes('EVIDENCE_MISSING_ROWS')) {
      packetBlockers.push('EVIDENCE_MISSING_ROWS')
    }
    if (to === 'VALID_RED') {
      const refreshing = state.state === 'VALID_RED'
      const milestones = state.milestones ?? []
      if (refreshing || milestones.length === 0) requires.push('--row')
      if (refreshing && (state.budgets?.harness?.spent ?? 0) <= (state.harnessBudgetAtValidRed ?? 0)) {
        packetBlockers.push('HARNESS_BUDGET_REQUIRED')
      }
    }
    if (to === 'IMPLEMENTED_GREEN') {
      // ORACLE_READY에서 곧장 GREEN으로 가는 것은 VALID_RED 생략이므로 --reason이 함께 필수다.
      if (state.state === 'ORACLE_READY') requires.push('--reason')
      // 연속 통과 게이트: 같은 명령의 신선한 연속 통과가 부족하면 지금 인용해도 FLAKINESS_GATE다.
      const required = REQUIRED_CONSECUTIVE_PASSES[state.risk] ?? 1
      const satisfied = candidateRuns.some((runId) => {
        try {
          assertConsecutivePasses(state, runEntries, findRun(runEntries, runId))
          return true
        } catch {
          return false
        }
      })
      if (candidateRuns.length > 0 && !satisfied) packetBlockers.push(`FLAKINESS_GATE_${required}_CONSECUTIVE`)
    }
    if (to === 'REVIEW_VERIFIED') {
      requires.push(...reviewRequiredFlags(state.risk, blindMapping))
      // transitionUnderLock이 실제로 쓰는 것과 같은 규칙에서 파생한다 — 규칙 사본을 유지하지 않는다.
      if (blindMapping?.required) {
        // 영수증이 아예 없으면 증거가 없는 것이 확실하다. 있더라도 transition은 결속을 다시 판정한다 —
        // 여기서 blocker가 사라지는 것은 "통과 보장"이 아니라 "이 단계에서 관측 가능한 결손이 없음"이다.
        if (!blindMapping.receiptPresent) packetBlockers.push('BLIND_MAP_REQUIRED')
      }
    }
  }
  return { requires, packetBlockers, candidateRuns }
}

/** REVIEW_VERIFIED 패킷에만 블라인드 매핑 상태를 붙인다 — 다른 전이에는 해당 개념이 없다. */
function blindMappingReport(to, blindMapping) {
  if (to !== 'REVIEW_VERIFIED') return {}
  if (!blindMapping) return {}
  return { blindMapping }
}

function transitionPackets({ state, directory, runEntries, staleRunIds, blockers, evidence, blindMapping }) {
  const dir = portablePath(process.cwd(), directory)
  return (TRANSITIONS[state.state] ?? []).map((to) => {
    const { requires, packetBlockers, candidateRuns } = transitionPacket(to, {
      state,
      runEntries,
      staleRunIds,
      blockers,
      evidence,
      blindMapping,
    })
    const example = [`oracle-run.mjs transition --dir ${dir} --to ${to}`]
    for (const flag of requires) {
      if (flag === '--run') example.push(`--run ${candidateRuns[0] ?? '<runId>'}`)
      else example.push(`${flag} <${flag.slice(2)}>`)
    }
    return {
      to,
      ready: packetBlockers.length === 0,
      blockers: [...new Set(packetBlockers)],
      requires,
      candidateRuns,
      readNodes: PACKET_READ_NODES[to],
      ...blindMappingReport(to, blindMapping),
      example: example.join(' '),
    }
  })
}

/** status가 보고하는 블라인드 매핑 상태 — 게이트와 같은 applicability 규칙에서 파생한다. */
async function blindMappingStatus(directory, state, ledger) {
  if (state.state !== 'IMPLEMENTED_GREEN') return null
  let evidence
  try {
    evidence = JSON.parse(await readFile(evidencePathFor(directory, state), 'utf8'))
  } catch {
    return null
  }
  const applicability = blindMappingApplicability(state.risk, evidence)
  if (!applicability.required) return applicability
  // status는 관측만 한다. 여기서 보이는 것은 "이 리비전을 가리키는 blind-mapper 영수증이 원장에 있는가"뿐이다.
  // 그 영수증이 실제로 제출될 입력·매핑 바이트를 가리키는지, 리뷰어·작업이 독립인지는 transition만 판정한다.
  // 그래서 satisfied라고 말하지 않는다 — 있으면 receiptPresent, 판정은 unknown이다.
  const scanRoot = resolve(directory, state.scanRoot)
  const current = await snapshot(scanRoot, `${portablePath(scanRoot, directory)}/`)
  const targetRevision = sha256(JSON.stringify(current))
  const receiptPresent = ledger.some(
    (entry) => entry.type === 'review-receipt' && entry.role === 'blind-mapper' && entry.targetRevision === targetRevision,
  )
  return { ...applicability, receiptPresent, verified: 'unknown' }
}

function formatReadNode(node) {
  return `${node.id} (${node.path})`
}

async function readStdinText() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const REPORTED_STATES = /^Status:\s*(ORACLE_READY|VALID_RED|IMPLEMENTED_GREEN|REVIEW_VERIFIED|NEEDS_DECISION|FAIL)\b/m

/**
 * 최종 보고의 주장을 원장과 대조한다 — `Status:` 상태어와 인용된 runId·exit code만. 보고서를 쓰는 에이전트의 자기
 * 점검(SKILL.md "Verification — before the final report" 2·4번)을 기계 판정으로 옮긴 것이다.
 */
async function checkReport(state, ledger, source) {
  const text = source === '-' ? await readStdinText() : await readFile(resolve(source), 'utf8')
  const runs = new Map(ledger.filter((entry) => entry.type === 'run').map((entry) => [entry.runId, entry]))
  const problems = []
  const claimed = text.match(REPORTED_STATES)?.[1]
  if (claimed !== state.state) {
    problems.push(claimed ? `it claims ${claimed}, the ledger replays ${state.state}` : 'the report has no `Status: <state>` line')
  }
  const cited = new Set([...text.matchAll(/\b(r-\d{3,})\b/g)].map(([, runId]) => runId))
  for (const runId of cited) if (!runs.has(runId)) problems.push(`${runId} is not in runs.jsonl`)
  // 보고 양식의 `<runId> exit <n>`처럼 붙어 있는 주장만 짝이다 — 산문 속 다른 run의 exit를 끌어오지 않는다
  for (const [, runId, exit] of text.matchAll(/\b(r-\d{3,})\s+exit\s+(-?\d+)/g)) {
    const run = runs.get(runId)
    if (run && run.exitCode !== Number(exit)) problems.push(`${runId} exit ${exit}, the ledger records exit ${run.exitCode}`)
  }
  if (problems.length > 0) throw new CliError('REPORT_CLAIM_MISMATCH', problems.join('; '))
  process.stdout.write(`REPORT_CONSISTENT state:${state.state} runs:${cited.size}\n`)
}

async function reportStatus(options) {
  if (!options.dir) {
    throw new CliError('USAGE', 'status requires --dir', 2)
  }

  const directory = resolve(options.dir)
  const ledger = await readLedger(directory)
  const state = replayState(await readState(directory), ledger)

  if (options.checkReport) {
    await checkReport(state, ledger, options.checkReport)
    return
  }

  // --changed-files: init 기준선 이후 바뀐 경로만 한 줄씩 — 레포의 related-tests 도구에 그대로 먹인다 (impact 라벨)
  if (options['changed-files']) {
    const root = resolve(directory, state.scanRoot)
    const now = await snapshot(root, `${portablePath(root, directory)}/`)
    process.stdout.write(changedPaths(state.snapshot, now).map((path) => `${path}\n`).join(''))
    return
  }
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
  // 마지막 게이트와 같은 규칙으로 블라인드 매핑 필요 여부를 설명한다. 판정은 여전히 transition이 한다.
  const blindMapping = await blindMappingStatus(directory, state, ledger)
  const blockers = []
  if (lockStatus.status !== 'valid') blockers.push(lockStatus.code)
  if (!ledgerValid) blockers.push('LEDGER_CHAIN_INVALID')
  const needsEvidence = ['ORACLE_READY', 'VALID_RED', 'IMPLEMENTED_GREEN'].includes(state.state)
  if (needsEvidence && evidence.status === 'invalid') blockers.push(evidence.code)
  if (needsEvidence && evidence.missingRows?.length > 0) blockers.push('EVIDENCE_MISSING_ROWS')

  const statusResult = {
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
    nextActions: transitionPackets({
      state,
      directory,
      runEntries,
      staleRunIds: staleOrMissingRuns,
      blockers,
      evidence,
      blindMapping,
    }),
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(statusResult, null, 2)}\n`)
    return
  }
  const graph = await loadGraph()
  const lines = [`state: ${statusResult.currentState}`, `blockers: ${statusResult.blockers.join(', ') || 'none'}`]
  for (const action of statusResult.nextActions) {
    const { delivered } = splitDelivery(graph, { id: `status-${action.to}`, nodes: action.readNodes ?? [] })
    const agentNodes = delivered.filter((node) => node.loader !== 'reviewer')
    const reviewerNodes = delivered.filter((node) => node.loader === 'reviewer')
    lines.push(`action: ${action.to}`)
    lines.push(`ready: ${action.ready}`)
    lines.push(`blockers: ${action.blockers.join(', ') || 'none'}`)
    lines.push(`read: ${agentNodes.map(formatReadNode).join(', ') || 'none'}`)
    if (reviewerNodes.length > 0) lines.push(`reviewerReads: ${reviewerNodes.map(formatReadNode).join(', ')}`)
    lines.push(`example: ${action.example}`)
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

async function reviewBrief(options) {
  if (!options.dir || !options.packet || !options.findings || options.output || options.command) {
    throw new CliError(
      'USAGE',
      'review-brief requires --dir --packet --findings [--intersect] [--json]; stdout only',
      2,
    )
  }
  const directory = await realpath(resolve(options.dir))
  const inputs = []
  for (const path of [statePath(directory), ledgerPath(directory)]) {
    await snapshotPacketFile(path, directory, path, inputs)
  }
  const state = await readConsistentState(directory)
  if (state.state !== 'IMPLEMENTED_GREEN') {
    throw new CliError('REVIEW_PACKET_STATE', 'review-brief requires IMPLEMENTED_GREEN; it never advances delivery')
  }
  const revision = verifyLock(directory, state)
  const packetSnapshot = await snapshotPacketFile(resolve(options.packet), directory, 'review packet', inputs)
  const packet = JSON.parse(packetSnapshot.bytes.toString('utf8'))
  if (!isReviewPacketShape(packet) || packet.schemaVersion !== 2) {
    throw new CliError('REVIEW_PACKET_INVALID', 'review-brief requires a schema-v2 review packet')
  }
  const scanRoot = resolve(directory, state.scanRoot)
  const excluded = `${portablePath(scanRoot, directory)}/`
  const assertCurrent = async () => {
    const current = await snapshot(scanRoot, excluded)
    if (
      packet.targetRevision !== sha256(JSON.stringify(current)) ||
      packet.targetSnapshot.worktreeSha256 !== packet.targetRevision ||
      packet.targetSnapshot.productionSha256 !== productionSha256(current, state.harnessPaths) ||
      stableStringify(packet.targetSnapshot.harnessSha256) !==
        stableStringify(selectedDigests(current, state.harnessPaths ?? [])) ||
      packet.targetSnapshot.lockManifestSha256 !== revision.lockManifestSha256
    ) {
      throw new CliError(
        'REVIEW_PACKET_STALE',
        'regenerate the review packet and reviewer findings for the current revision',
      )
    }
  }
  await assertCurrent()
  const oraclePath = await lockedOraclePath(directory, state)
  const evidencePath = evidencePathFor(directory, state)
  const evidenceSnapshot = await snapshotPacketFile(evidencePath, directory, 'evidence map', inputs)
  const evidenceArtifacts = await collectEvidenceArtifacts(directory, evidenceSnapshot, inputs)
  const reviewerFiles = [options.findings, ...(options.intersect ? [options.intersect] : [])]
  const reviewers = []
  for (const path of reviewerFiles) {
    const input = await snapshotPacketFile(resolve(path), directory, 'reviewer findings', inputs)
    reviewers.push({ path: portablePath(directory, input.path), document: JSON.parse(input.bytes.toString('utf8')) })
  }
  const findingArgs = ['--oracle', oraclePath, '--file', resolve(options.findings)]
  if (options.intersect) findingArgs.push('--intersect', resolve(options.intersect))
  try {
    runVerifier([
      'review',
      ...findingArgs,
      '--packet',
      packetSnapshot.path,
      '--revision',
      packet.targetRevision,
      '--map',
      evidencePath,
      '--ledger',
      ledgerPath(directory),
    ])
  } catch (error) {
    // A blocked review is useful navigation, not permission to weaken its gate.
    if (error.code !== 'FINDINGS_BLOCKING') throw error
  }
  const findings = JSON.parse(runVerifier(['findings', ...findingArgs, '--ir']))
  const withSource = (entries) =>
    entries.map((entry) => ({
      ...entry,
      source: reviewers.find(({ document }) => document.findings.some((finding) => finding.id === entry.id)).path,
    }))
  const evidence = JSON.parse(evidenceSnapshot.bytes.toString('utf8'))
  const blindMapping = await blindMappingStatus(directory, state, await readLedger(directory))
  const requiredFlags = reviewRequiredFlags(state.risk, blindMapping)
  const remainingReviewWork = ['Final transition checks and post-GREEN rerun are not evaluated by this view.']
  if (requiredFlags.includes('--intersect')) {
    if (!options.intersect) remainingReviewWork.push('Missing second independent review (--intersect).')
    remainingReviewWork.push('High-risk mutation evidence (--mutation-run, --mutation-row) is not evaluated here.')
  }
  if (blindMapping.required) {
    remainingReviewWork.push(blindMapping.receiptPresent
      ? 'Blind-mapper receipt observed; --blind-input and --blind-map binding/independence remain unverified.'
      : 'Missing blind-mapper receipt; --blind-input and --blind-map remain required.')
  }
  const sections = packet.oracle.content.split(/^##\s+/m)
  const section = (title) =>
    sections
      .find((text) => text.startsWith(`${title}\n`) || text.startsWith(`${title}\r\n`))
      ?.split('\n')
      .slice(1)
      .join('\n')
      .trim() ?? 'Not present; consult the original Oracle.'
  const brief = {
    authority: 'navigation-only',
    packet: {
      path: portablePath(directory, packetSnapshot.path),
      sha256: packetSnapshot.sha256,
      targetRevision: packet.targetRevision,
    },
    outcome: section('Outcome Brief'),
    confirmation: section('User Confirmation'),
    openQuestions: section('Open questions'),
    sources: `${packet.oracle.path}#source-registry`,
    reviewRequirements: {
      risk: state.risk,
      requiredFlags,
      minimumReviewerDocuments: requiredFlags.includes('--intersect') ? 2 : 1,
      suppliedReviewers: reviewers.map(({ path, document }) => ({ path, role: document.reviewerRole, id: document.reviewerId })),
      blindMapping,
      remainingReviewWork,
    },
    blocking: withSource(findings.blocking),
    pending: Object.entries(evidence.rows ?? {})
      .filter(([, entry]) => entry.kind === 'pending')
      .map(([row, entry]) => ({ row, ...entry })),
    advisory: withSource(findings.advisory),
    evidence: { path: portablePath(directory, evidencePath), rows: evidence.rows, artifacts: evidenceArtifacts },
    raw: { oracle: packet.oracle.path, findings: reviewers.map(({ path }) => path), reviewPoints: packet.reviewPoints },
    limitations: [
      'Navigation only: no policy approval, usability proof, or delivery transition.',
      'Pending evidence remains unresolved even when there are no blocking findings.',
      'Existing full-card approval and required independent reviews still apply; exit 0 only means the brief was generated.',
    ],
  }
  await assertCurrent()
  verifyLock(directory, state)
  for (const { label, snapshot: input } of inputs) {
    await assertSnapshotUnchanged(input, {
      label,
      fail: (message) => new CliError('REVIEW_PACKET_INPUT_CHANGED', message),
    })
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`)
    return
  }
  const findingsLines = (entries) =>
    entries.length
      ? entries.map(
          (entry) =>
            `- [${entry.severity}] ${entry.row} ${entry.id} ${entry.classification}: ${entry.finding}\n  Evidence: ${entry.evidence}\n  Proposed action: ${entry.fix}\n  Source: ${entry.source}`,
        )
      : ['- None reported; this is not approval.']
  process.stdout.write(
    [
      '# Human review brief',
      '',
      'Authority: navigation-only',
      ...brief.limitations.map((line) => `- ${line}`),
      '',
      '## User outcome (verbatim)',
      brief.outcome,
      '',
      '## Recorded confirmation / delta (verbatim)',
      brief.confirmation,
      '',
      '## Open questions (verbatim)',
      brief.openQuestions,
      '',
      '## Required review work (not a gate verdict)',
      `- Risk: ${brief.reviewRequirements.risk}; reviewer documents supplied: ${reviewers.length}/${brief.reviewRequirements.minimumReviewerDocuments} minimum`,
      ...brief.reviewRequirements.suppliedReviewers.map((entry) => `- Reviewer: ${entry.role} ${entry.id} (${entry.path})`),
      ...brief.reviewRequirements.remainingReviewWork.map((entry) => `- ${entry}`),
      '',
      '## Blocking findings',
      ...findingsLines(brief.blocking),
      '',
      '## Pending evidence',
      ...brief.pending.map((entry) => `- ${entry.row}: ${JSON.stringify(entry)}`),
      '',
      '## Advisory / heuristic signals',
      ...findingsLines(brief.advisory),
      '',
      '## Evidence references (not usability proof)',
      ...Object.entries(brief.evidence.rows).map(([row, entry]) => `- ${row}: ${JSON.stringify(entry)}`),
      ...brief.evidence.artifacts.map((entry) => `- ${entry.path} sha256:${entry.sha256}`),
      '',
      '## Original inputs',
      `- Packet: ${brief.packet.path} sha256:${brief.packet.sha256}`,
      `- Revision: ${brief.packet.targetRevision}`,
      `- Oracle: ${brief.raw.oracle}`,
      `- Sources: ${brief.sources}`,
      ...brief.raw.findings.map((path) => `- Findings: ${path}`),
      ...brief.raw.reviewPoints.map((entry) => `- Review criteria: ${entry.path} sha256:${entry.sha256}`),
      '',
    ].join('\n'),
  )
}


function workerTaskPath(directory, taskId, attemptId) {
  return join(directory, '.worker-tasks', taskId, `${attemptId}.json`)
}

async function workerFile(path, base) {
  const file = await snapshotRegularFile(await realpath(path), { base, allowHardlinks: false, label: 'worker input' })
  return { path: file.path ?? await realpath(path), sha256: file.sha256, content: file.bytes.toString('utf8') }
}

async function workerControls(directory) {
  const paths = (await walkFiles(directory)).sort()
  return Object.fromEntries(await Promise.all(paths.map(async (path) => {
    const file = await snapshotRegularFile(join(directory, path), { base: directory, allowHardlinks: false })
    return [path, file.sha256]
  })))
}

async function assertWorkerInputs(packet) {
  if (stableStringify(await skillMetadata()) !== stableStringify(packet.skillRevision)) throw new CliError('WORKER_INPUT_STALE', 'skill version changed')
  for (const input of packet.inputs) {
    const current = await workerFile(input.path)
    if (current.sha256 !== input.sha256) throw new CliError('WORKER_INPUT_STALE', input.path)
  }
}

async function workerPacket(options) {
  if (!options.dir || !options.task) throw new CliError('USAGE', 'worker-packet requires --dir and --task', 2)
  const directory = resolve(options.dir)
  await withDirectoryLock(directory, 'worker', async () => {
    const state = await readConsistentState(directory)
    if (state.state !== 'VALID_RED' || state.risk === 'low') {
      throw new CliError('WORKER_STATE_INVALID', 'the optional implementation worker requires Medium/High VALID_RED')
    }
    if (state.budgets.product.spent >= state.budgets.product.limit) throw new CliError('BUDGET_EXHAUSTED', 'no product attempts remain')
    const revision = verifyLock(directory, state)
    const spec = JSON.parse((await workerFile(resolve(options.task))).content)
    const root = resolve(directory, state.scanRoot)
    const oracle = await workerFile(await lockedOraclePath(directory, state))
    const rows = contractRowIds(oracle.content)
    if (!/^[a-z0-9][\w-]{0,79}$/i.test(spec.taskId ?? '') ||
        typeof spec.goal !== 'string' || !spec.goal.trim() ||
        !Array.isArray(spec.rows) || !spec.rows.length || spec.rows.some((row) => !rows.includes(row)) ||
        !Array.isArray(spec.writablePaths) || !spec.writablePaths.length ||
        !Array.isArray(spec.referenceNodes) || typeof spec.testSkill !== 'string') {
      throw new CliError('WORKER_TASK_INVALID', 'taskId, goal, Oracle rows, exact writablePaths, referenceNodes and testSkill are required')
    }
    for (const path of spec.writablePaths) {
      if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..') ||
          path.includes('*') || !isPathInside(root, resolve(root, path)) || isPathInside(directory, resolve(root, path)) ||
          isTestPath(path) || state.harnessPaths?.includes(path) ||
          path.split('/').some((part) => ['.ai', '.git', 'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'].includes(part) || part.startsWith('.env') || /\.(?:pem|key)$/i.test(part) || /config/i.test(part))) {
        throw new CliError('WORKER_SCOPE_INVALID', String(path))
      }
    }
    const testSkill = await workerFile(spec.testSkill).catch(() => {
      throw new CliError('WORKER_SKILL_MISSING', 'the installed test SKILL.md must be readable')
    })
    if (!/^name:\s*test\s*$/m.test(testSkill.content)) throw new CliError('WORKER_SKILL_MISSING', 'testSkill must name the test skill')
    const graphFile = await workerFile(join(scriptDirectory, '../references/reference-graph.json'))
    const graph = JSON.parse(graphFile.content)
    const conditional = graph.nodes.filter((node) => node.implementationInput === 'conditional')
    const omitted = spec.notApplicable ?? {}
    if (!omitted || typeof omitted !== 'object' || Array.isArray(omitted) ||
        Object.entries(omitted).some(([id, reason]) => !conditional.some((node) => node.id === id) || typeof reason !== 'string' || !reason.trim())) {
      throw new CliError('WORKER_TASK_INVALID', 'notApplicable needs a reason for each conditional reference excluded')
    }
    const required = [...new Set([...PACKET_READ_NODES.IMPLEMENTED_GREEN, 'delivery-red',
      ...conditional.filter((node) => !omitted[node.id]).map((node) => node.id), ...spec.referenceNodes])]
    const { delivered } = splitDelivery(graph, { id: 'implementation-task', nodes: required })
    if (delivered.some((node) => node.loader === 'reviewer' || node.loader === 'graph-tooling' || node.id === 'low-fast-path')) {
      throw new CliError('WORKER_TASK_INVALID', 'implementation input cannot switch lanes or replace review')
    }
    const references = await Promise.all(delivered.map(async (node) => ({ id: node.id, ...await workerFile(join(scriptDirectory, '..', node.path)) })))
    const testBva = await workerFile(join(dirname(testSkill.path), 'references/bva.md'))
    const lock = await workerFile(resolve(directory, state.lock))
    const manifest = JSON.parse(lock.content)
    const lockedSources = await Promise.all(manifest.sources.map(async (source) => {
      const file = await workerFile(resolve(dirname(lock.path), source.path))
      if (file.sha256 !== source.sha256) throw new CliError('WORKER_INPUT_STALE', source.path)
      return file
    }))
    const evidence = await workerFile(evidencePathFor(directory, state))
    if (spec.decision && (typeof spec.decision !== 'string' || !isPathInside(directory, resolve(directory, spec.decision)))) throw new CliError('WORKER_SCOPE_INVALID', 'decision must stay inside Oracle artifacts')
    const decisions = spec.decision ? [await workerFile(resolve(directory, spec.decision), directory)] : []
    const ruleNames = (await readdir(scriptDirectory)).filter((name) => name.startsWith('oracle-') && name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    const rules = await Promise.all([...ruleNames, 'generate-reference-bundles.mjs', 'resolve-executable.mjs'].map((name) => workerFile(join(scriptDirectory, name))))
    const entry = await workerFile(join(scriptDirectory, '../SKILL.md'))
    const ledger = await readLedger(directory)
    const runs = ledger.filter((event) => event.type === 'run')
    const red = findRun(runs, lastEntryFor(state, 'VALID_RED').runId)
    const checks = [red, ...state.requiredLabels.filter((label) => label !== red.label).map((label) => runs.findLast((run) => run.label === label))]
    if (!red.cwd || !isReportedFailingRun(red) || checks.some((check) => !check?.cwd)) {
      throw new CliError('WORKER_CHECKS_MISSING', 'record the trusted RED and every required label through current exec before issuing a task')
    }
    if (!Array.isArray(spec.replaySafeLabels) || checks.some((check) => !spec.replaySafeLabels.includes(check.label))) {
      throw new CliError('WORKER_REPLAY_UNAPPROVED', 'explicitly list every approved replay-safe check label; use sequential delivery for unsafe commands')
    }
    const baseline = await snapshot(root, `${portablePath(root, directory)}/`)
    if (!sameDigests(state.testBindings.tests, Object.fromEntries(Object.entries(baseline).filter(([path]) => isTestPath(path))))) {
      throw new CliError('WORKER_INPUT_STALE', 'test sources changed after VALID_RED')
    }
    const attemptId = await reserveRunId(directory, `worker:${spec.taskId}`)
    const packet = {
      schemaVersion: 1, taskId: spec.taskId, attemptId, phase: 'implement-green', role: 'oracle-implementation',
      goal: spec.goal, rows: spec.rows, root,
      baseline: { oracleSha256: revision.oracleSha256, lockManifestSha256: revision.lockManifestSha256,
        ledgerHead: ledger.at(-1).digest, files: baseline },
      scope: { writablePaths: spec.writablePaths, readablePaths: [...new Set([...spec.writablePaths, ...Object.keys(state.testBindings.tests), ...(state.harnessPaths ?? [])])],
        protection: 'post-execution diff and input checks; not a filesystem sandbox' },
      referenceSelection: { notApplicable: omitted, rule: 'unclassified conditional nodes load conservatively; dependency closure always wins' },
      oracle, lockedSources, decisions, references, requiredSkills: [{ name: 'test', ...testSkill }, { name: 'test:bva', ...testBva }],
      inputs: [oracle, lock, ...lockedSources, evidence, ...decisions, graphFile, entry, ...references, testSkill, testBva, ...rules].map(({ path, sha256 }) => ({ path, sha256 })),
      skillRevision: await skillMetadata(), remainingBudgets: Object.fromEntries(Object.entries(state.budgets).map(([key, value]) => [key, value.limit - value.spent])),
      evidence: { redRun: red, ...evidence },
      checks: checks.map(({ label, command, adapter, cwd }) => ({ label, command, adapter, cwd })),
      previousAttempts: runs.filter((run) => run.worker?.taskId === spec.taskId && run.worker.kind === 'implementation')
        .map((run) => ({ runId: run.runId, exitCode: run.exitCode, grade: run.grade, worktreeSha256: run.worktreeSha256 })),
      execution: { contextMode: 'fresh', host: 'claude', model: 'host default; no automatic model escalation', completed: false },
    }
    const path = workerTaskPath(directory, spec.taskId, attemptId)
    await mkdir(dirname(path), { recursive: true })
    if (!isPathInside(await realpath(directory), await realpath(dirname(path)))) throw new CliError('WORKER_SCOPE_INVALID', 'task directory escapes Oracle artifacts')
    const bytes = `${JSON.stringify(packet, null, 2)}\n`
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
    const reservationPath = join(directory, '.run-ids', attemptId)
    const reservation = JSON.parse(await readFile(reservationPath, 'utf8'))
    await writeFile(reservationPath, JSON.stringify({ ...reservation, taskId: spec.taskId, packetSha256: sha256(bytes) }))
    process.stdout.write(`WORKER_PACKET ${path}\n`)
  })
}

async function workerRun(options) {
  if (!options.dir || !options.packet) throw new CliError('USAGE', 'worker-run requires --dir --packet --max-budget-usd', 2)
  const directory = resolve(options.dir)
  await withDirectoryLock(directory, 'worker', async () => {
    const input = await snapshotRegularFile(resolve(options.packet), { base: directory, allowHardlinks: false })
    const packet = JSON.parse(input.bytes.toString('utf8'))
    if (packet.schemaVersion !== 1 || !/^r-\d+$/.test(packet.attemptId ?? '') ||
        !/^[a-z0-9][\w-]{0,79}$/i.test(packet.taskId ?? '') ||
        resolve(options.packet) !== workerTaskPath(directory, packet.taskId, packet.attemptId)) {
      throw new CliError('WORKER_TASK_INVALID', 'use a generated task packet')
    }
    const reservationPath = join(directory, '.run-ids', packet.attemptId)
    const reservation = JSON.parse(await readFile(reservationPath, 'utf8'))
    if (reservation.packetSha256 !== input.sha256 || reservation.taskId !== packet.taskId) throw new CliError('WORKER_INPUT_STALE', 'packet does not match its run reservation')
    await assertWorkerInputs(packet)
    let state = await readConsistentState(directory)
    const revision = verifyLock(directory, state)
    if (revision.oracleSha256 !== packet.baseline.oracleSha256 || revision.lockManifestSha256 !== packet.baseline.lockManifestSha256) {
      throw new CliError('WORKER_INPUT_STALE', 'Oracle revision changed')
    }
    const root = resolve(directory, state.scanRoot)
    if (root !== packet.root) throw new CliError('WORKER_INPUT_STALE', 'scan root changed')
    const current = await snapshot(root, `${portablePath(root, directory)}/`)
    let ledger = await readLedger(directory)
    const completed = state.history.find((entry) => entry.workerAttemptId === packet.attemptId)
    if (completed) {
      const accepted = findRun(ledger.filter((entry) => entry.type === 'run'), completed.runId)
      if (accepted.worktreeSha256 !== sha256(JSON.stringify(current))) throw new CliError('WORKER_INPUT_STALE', 'accepted candidate changed')
      process.stdout.write(`WORKER_ALREADY_ACCEPTED ${packet.attemptId} state:${state.state}\n`)
      return
    }
    if (state.state !== 'VALID_RED') throw new CliError('WORKER_STATE_INVALID', 'implementation needs VALID_RED')
    const siblings = (await readdir(dirname(resolve(options.packet)))).filter((name) => /^r-\d+\.json$/.test(name))
    if (siblings.some((name) => Number(name.slice(2, -5)) > Number(packet.attemptId.slice(2)))) throw new CliError('WORKER_ATTEMPT_STALE', 'a newer attempt supersedes this packet')
    const outputPath = resolve(options.packet).replace(/\.json$/, '.ndjson')
    let worker = ledger.find((event) => event.type === 'run' && event.runId === packet.attemptId)
    if (!worker) {
      if (reservation.workerDispatched) throw new CliError('WORKER_INTERRUPTED', 'no durable completion; do not repeat external work automatically')
      if (packet.baseline.ledgerHead !== ledger.at(-1).digest || !sameDigests(packet.baseline.files, current)) throw new CliError('WORKER_INPUT_STALE', 'baseline changed before dispatch')
      const invocation = claudeWorkerInvocation(packet, Number(options.maxBudgetUsd))
      const timeout = Number(options.timeoutMs ?? 600000)
      if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 3600000) throw new CliError('USAGE', '--timeout-ms must be 1..3600000', 2)
      await spendBudget({ dir: directory, spend: 'product', reason: `implementation worker ${packet.taskId}/${packet.attemptId}`, workerAttemptId: packet.attemptId })
      await writeFile(reservationPath, JSON.stringify({ ...reservation, workerDispatched: true }))
      await execute({ dir: directory, label: `worker:${packet.taskId}`, command: invocation.command,
        runtime: 'claude', cwd: root, reservedRunId: packet.attemptId,
        capture: { input: invocation.input, outputPath, timeout },
        worker: { kind: 'implementation', taskId: packet.taskId, attemptId: packet.attemptId, packetSha256: input.sha256,
          capability: invocation.capability, inputSha256: sha256(invocation.input) } })
      ledger = await readLedger(directory)
      worker = ledger.find((event) => event.type === 'run' && event.runId === packet.attemptId)
    }
    const candidate = await snapshot(root, `${portablePath(root, directory)}/`)
    if (worker.exitCode !== 0 || worker.worktreeSha256 !== sha256(JSON.stringify(candidate)) ||
        worker.worker?.packetSha256 !== input.sha256) throw new CliError('WORKER_RESULT_STALE', 'worker did not finish on this candidate')
    const changed = changedPaths(packet.baseline.files, candidate)
    if (changed.some((path) => !packet.scope.writablePaths.includes(path))) throw new CliError('WORKER_SCOPE_VIOLATION', changed.join(', '))
    await assertWorkerInputs(packet)
    const output = await snapshotRegularFile(outputPath, { base: directory, allowHardlinks: false })
    if (output.sha256 !== worker.worker.outputSha256) throw new CliError('WORKER_RESULT_STALE', 'host transcript changed')
    const submission = parseWorkerSubmission(output.bytes.toString('utf8'), packet)
    const candidateSha256 = worker.worktreeSha256
    let greenRun
    for (const [index, check] of packet.checks.entries()) {
      const count = index === 0 ? REQUIRED_CONSECUTIVE_PASSES[state.risk] : 1
      ledger = await readLedger(directory)
      const reusable = ledger.filter((entry) => entry.type === 'run' && entry.worker?.kind === 'check' &&
        entry.worker.attemptId === packet.attemptId && entry.worker.checkIndex === index &&
        entry.worker.packetSha256 === input.sha256 && entry.cwd === check.cwd &&
        stableStringify(entry.command) === stableStringify(check.command) && entry.adapter === check.adapter &&
        entry.worktreeSha256 === candidateSha256 && entry.exitCode === 0 && !entry.signal &&
        (index !== 0 || isReportedPassingRun(entry)))
      for (let pass = reusable.length; pass < count; pass += 1) {
        const id = await execute({ ...check, dir: directory, report: check.adapter ? `${outputPath}.${index}.${pass}.report` : undefined,
          worker: { kind: 'check', taskId: packet.taskId, attemptId: packet.attemptId, packetSha256: input.sha256, checkIndex: index } })
        const run = findRun(await readRuns(directory), id)
        if (run.worktreeSha256 !== candidateSha256) throw new CliError('WORKER_RESULT_STALE', 'candidate changed during verification')
        if (run.exitCode !== 0 || (index === 0 && !isReportedPassingRun(run))) throw new CliError('RUN_NOT_GREEN', id)
        reusable.push(run)
      }
      if (index === 0) greenRun = reusable.at(-1).runId
    }
    await assertWorkerInputs(packet)
    await writeFile(`${outputPath}.submission.json`, JSON.stringify({
      ...submission, candidateSha256, changedPaths: changed, evidenceRunId: greenRun,
      note: 'Worker handoff is unverified narrative. Only ledger runs and the transition establish acceptance.',
    }, null, 2), { mode: 0o600 })
    await transition({ dir: directory, to: 'IMPLEMENTED_GREEN', run: greenRun, evidence: packet.evidence.path, workerAttemptId: packet.attemptId })
    state = await readConsistentState(directory)
    process.stdout.write(`WORKER_ACCEPTED ${packet.attemptId} state:${state.state}; independent review remains required\n`)
  })
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
  else if (command === 'review-brief') await reviewBrief(options)
  else if (command === 'blind-input') await blindInput(options)
  else if (command === 'worker-packet') await workerPacket(options)
  else if (command === 'worker-run') await workerRun(options)
  else
    throw new CliError(
      'USAGE',
      'Expected init, migrate-ledger, exec, red, green, transition, review-receipt, budget, status, review-packet, review-brief, blind-input, worker-packet or worker-run',
      2,
    )
}

try {
  await main()
} catch (error) {
  const workerCode = /^WORKER_[A-Z_]+:/.exec(error.message ?? '')?.[0].slice(0, -1)
  const cliError = error instanceof CliError ? error : new CliError(workerCode ?? 'INPUT_UNREADABLE', error.message ?? String(error))
  let dirOption
  try {
    dirOption = parseOptions(process.argv.slice(3)).dir
  } catch {
    dirOption = null
  }
  process.stderr.write(`${cliError.code}: ${cliError.message}\n${nextActionLine(cliError.code, { dir: dirOption })}`)
  process.exitCode = cliError.exitCode
}
