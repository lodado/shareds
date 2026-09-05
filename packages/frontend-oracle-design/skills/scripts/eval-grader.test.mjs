import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const grader = join(skillDirectory, 'evals/grade-results.mjs')

async function tempFile(t, name, content) {
  const directory = await mkdtemp(join(tmpdir(), 'fod-eval-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, name)
  await writeFile(path, content)
  return path
}

function run(path, ...options) {
  return spawnSync(process.execPath, [grader, ...options, path], { encoding: 'utf8' })
}

test('allow-partial reports passing diagnostics as explicitly non-authoritative', async (t) => {
  const path = await tempFile(
    t,
    'results.json',
    JSON.stringify({
      results: [
        {
          caseId: 'fod-bb-01',
          risk: 'Low',
          lane: 'low-fast-path',
          status: 'GREEN',
          loadedNodes: ['low-fast-path'],
          ceremony: [],
          labels: ['repo-validation'],
          policyInvention: false,
          falseReviewVerified: false,
          toolCalls: 1,
          tokens: 10,
          runtimeMs: 20,
          errors: [],
        },
      ],
    }),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.authority, 'NON_AUTHORITATIVE_PARTIAL')
  assert.equal(report.authoritative, false)
  assert.equal(report.total, 1)
  assert.equal(report.passed, 1)
  assert.equal(report.failed, 0)
  assert.equal(report.metrics.routingAccuracy, 1)
})

test('grader emits stable per-case failures and aggregate metrics for JSONL results', async (t) => {
  const path = await tempFile(
    t,
    'results.jsonl',
    [
      JSON.stringify({
        caseId: 'fod-bb-01',
        risk: 'Medium',
        lane: 'oracle',
        status: 'GREEN',
        loadedNodes: ['common'],
        ceremony: ['oracle-card'],
        labels: [],
        policyInvention: true,
        falseReviewVerified: false,
        toolCalls: 2,
        tokens: 30,
        runtimeMs: 40,
        errors: ['POLICY_INVENTED'],
      }),
      JSON.stringify({
        caseId: 'fod-bb-08',
        risk: 'High',
        lane: 'oracle',
        status: 'REVIEW_VERIFIED',
        loadedNodes: ['common', 'policy-sources', 'risk-grill', 'bva', 'card-format', 'confirmation-lock'],
        ceremony: ['revision-lock'],
        labels: ['source-registry-fk', 'policy-gap', 'card-lint'],
        policyInvention: false,
        falseReviewVerified: true,
        toolCalls: 3,
        tokens: 50,
        runtimeMs: 60,
        errors: [],
      }),
    ].join('\n'),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.total, 2)
  assert.equal(report.failed, 2)
  assert.deepEqual(
    report.cases.map((entry) => entry.failures.map((failure) => failure.code)),
    [
      [
        'RISK_MISMATCH',
        'LANE_MISMATCH',
        'LOADED_NODES_MISMATCH',
        'FORBIDDEN_CEREMONY',
        'MISSING_LABEL',
        'POLICY_INVENTION',
        'RESULT_ERRORS',
      ],
      ['STATUS_MISMATCH', 'LOADED_NODES_MISMATCH', 'FORBIDDEN_CEREMONY', 'UNEXPECTED_LABEL', 'FALSE_REVIEW_VERIFIED'],
    ],
  )
  assert.equal(report.metrics.policyInvention, 1)
  assert.equal(report.metrics.falseReviewVerified, 1)
  assert.equal(report.metrics.errors, 1)
})

test('grader compares expected route when the corpus declares one', async (t) => {
  const path = await tempFile(
    t,
    'route.json',
    JSON.stringify({
      caseId: 'fod-bb-10',
      risk: 'Medium',
      lane: 'oracle',
      status: 'REVIEW_VERIFIED',
      route: 'valid-red:INVALID_RED→draft-oracle',
      loadedNodes: [
        'common',
        'card-policy-sources',
        'card-risk-grill',
        'bva',
        'card-format',
        'card-interaction-sweep',
        'card-case-space',
        'card-retro-metrics',
        'card-confirmation-lock',
        'delivery-ledger',
        'delivery-red',
        'frontend-decisions',
        'types-state-ladder',
        'types-authoring',
        'types-api-surface',
        'types-advanced-contracts',
        'changeability',
        'frontend-quality',
        'delivery-green-review',
        'subagent-review',
      ],
      ceremony: [],
      labels: ['card-lint', 'existing-evidence', 'already-satisfied', 'green', 'review'],
      policyInvention: false,
      falseReviewVerified: false,
      toolCalls: 1,
      tokens: 10,
      runtimeMs: 20,
      errors: [],
    }),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(
    report.cases[0].failures.map((failure) => failure.code),
    ['ROUTE_MISMATCH'],
  )
})

test('grader makes policy invention and false review verification blocking', async (t) => {
  const path = await tempFile(
    t,
    'guardrails.json',
    JSON.stringify({
      caseId: 'fod-bb-01',
      risk: 'Low',
      lane: 'low-fast-path',
      status: 'GREEN',
      loadedNodes: ['low-fast-path'],
      ceremony: [],
      labels: ['repo-validation'],
      policyInvention: true,
      falseReviewVerified: true,
      toolCalls: 1,
      tokens: 10,
      runtimeMs: 20,
      errors: [],
    }),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(
    report.cases[0].failures.map((failure) => failure.code),
    ['POLICY_INVENTION', 'FALSE_REVIEW_VERIFIED'],
  )
})

test('missing telemetry fields cannot silently pass', async (t) => {
  const path = await tempFile(
    t,
    'missing-telemetry.json',
    JSON.stringify({
      caseId: 'fod-bb-01',
      risk: 'Low',
      lane: 'low-fast-path',
      status: 'GREEN',
      loadedNodes: ['low-fast-path'],
      ceremony: [],
      labels: ['repo-validation'],
    }),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(
    report.cases[0].failures.map((failure) => failure.code),
    ['MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD'],
  )
  assert.equal(report.metrics.routingAccuracy, 1)
})

test('missing or invalid consumed grader fields fail closed', async (t) => {
  const missingPath = await tempFile(
    t,
    'missing-consumed.json',
    JSON.stringify({
      caseId: 'fod-bb-01',
      risk: 'Low',
      lane: 'low-fast-path',
      status: 'GREEN',
      policyInvention: false,
      falseReviewVerified: false,
      toolCalls: 1,
      tokens: 10,
      runtimeMs: 20,
      errors: [],
    }),
  )
  const missing = run(missingPath, '--allow-partial')
  assert.equal(missing.status, 1)
  const missingReport = JSON.parse(missing.stdout)
  assert.deepEqual(
    missingReport.cases[0].failures.map((failure) => failure.code),
    ['MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD', 'LOADED_NODES_MISMATCH', 'MISSING_LABEL'],
  )

  const invalidPath = await tempFile(
    t,
    'invalid-consumed.json',
    JSON.stringify({
      caseId: 'fod-bb-01',
      risk: ['Low'],
      lane: 1,
      status: null,
      loadedNodes: 'low-fast-path',
      ceremony: 'oracle-card',
      labels: 'repo-validation',
      policyInvention: false,
      falseReviewVerified: false,
      toolCalls: 1,
      tokens: 10,
      runtimeMs: 20,
      errors: [],
    }),
  )
  const invalid = run(invalidPath, '--allow-partial')
  assert.equal(invalid.status, 1)
  const invalidReport = JSON.parse(invalid.stdout)
  assert.deepEqual(
    invalidReport.cases[0].failures.map((failure) => failure.code),
    [
      'INVALID_FIELD',
      'INVALID_FIELD',
      'INVALID_FIELD',
      'INVALID_FIELD',
      'INVALID_FIELD',
      'INVALID_FIELD',
      'RISK_MISMATCH',
      'LANE_MISMATCH',
      'STATUS_MISMATCH',
      'LOADED_NODES_MISMATCH',
      'MISSING_LABEL',
    ],
  )
})

test('allow-partial rejects an empty result artifact', async (t) => {
  const path = await tempFile(t, 'empty.json', JSON.stringify([]))

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.authority, 'NON_AUTHORITATIVE_PARTIAL')
  assert.equal(report.authoritative, false)
  assert.deepEqual(report.cases[0].failures, [{ code: 'EMPTY_RESULTS' }])
})

test('grader treats non-object results as case failures instead of crashing', async (t) => {
  const path = await tempFile(t, 'non-object.json', JSON.stringify([null]))

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '')
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.cases[0].failures, [{ code: 'INVALID_RESULT' }])
})

test('rejects result errors and duplicate routing without counting either as a pass', async (t) => {
  const resultRecord = {
    caseId: 'fod-bb-01',
    risk: 'Low',
    lane: 'low-fast-path',
    status: 'GREEN',
    loadedNodes: ['low-fast-path'],
    ceremony: [],
    labels: ['repo-validation'],
    policyInvention: false,
    falseReviewVerified: false,
    toolCalls: 1,
    tokens: 10,
    runtimeMs: 20,
    errors: ['runner failed after emitting a partial result'],
  }
  const path = await tempFile(t, 'duplicate-errors.jsonl', `${JSON.stringify(resultRecord)}\n${JSON.stringify(resultRecord)}\n`)

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.deepEqual([report.total, report.passed, report.failed], [1, 0, 1])
  assert.deepEqual(
    report.cases[0].failures.map((failure) => failure.code),
    ['RESULT_ERRORS', 'DUPLICATE_CASE'],
  )
  assert.equal(report.metrics.errors, 2)
})

test('rejects blank and malformed JSONL with stable machine-readable failure codes', async (t) => {
  const blankPath = await tempFile(t, 'blank.jsonl', '\n')
  const malformedPath = await tempFile(t, 'malformed.jsonl', '{"caseId":\n')

  for (const [path, code] of [
    [blankPath, 'BLANK_JSONL'],
    [malformedPath, 'MALFORMED_JSONL'],
  ]) {
    const result = run(path, '--allow-partial')
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, new RegExp(`^EVAL_GRADER_FAILED: ${code}:`))
  }
})

test('grader flushes large JSON reports before exiting', async (t) => {
  const path = await tempFile(
    t,
    'large.json',
    JSON.stringify(
      Array.from({ length: 700 }, (_, index) => ({
        caseId: `unknown-${index.toString().padStart(3, '0')}-${'x'.repeat(80)}`,
        risk: 'Low',
        lane: 'low-fast-path',
        status: 'GREEN',
        loadedNodes: ['low-fast-path'],
        ceremony: [],
        labels: ['repo-validation'],
        policyInvention: false,
        falseReviewVerified: false,
        toolCalls: 1,
        tokens: 10,
        runtimeMs: 20,
        errors: [],
      })),
    ),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.cases.length, 700)
  assert.equal(report.cases.at(-1).caseId.startsWith('unknown-699-'), true)
})

test('full corpus mode rejects missing and duplicate case results', async (t) => {
  const result = {
    caseId: 'fod-bb-01',
    risk: 'Low',
    lane: 'low-fast-path',
    status: 'GREEN',
    loadedNodes: ['low-fast-path'],
    ceremony: [],
    labels: ['repo-validation'],
    policyInvention: false,
    falseReviewVerified: false,
    toolCalls: 1,
    tokens: 10,
    runtimeMs: 20,
    errors: [],
  }
  const missingPath = await tempFile(t, 'missing.json', JSON.stringify(result))
  const missing = run(missingPath)
  assert.equal(missing.status, 1)
  const missingReport = JSON.parse(missing.stdout)
  assert.equal(missingReport.authority, 'AUTHORITATIVE_FULL_CORPUS')
  assert.equal(missingReport.authoritative, true)
  assert.equal(missingReport.total, 10)
  assert.equal(missingReport.cases.filter((entry) => entry.failures[0]?.code === 'MISSING_CASE').length, 9)

  const duplicatePath = await tempFile(t, 'duplicate.json', JSON.stringify([result, result]))
  const duplicate = run(duplicatePath, '--allow-partial')
  assert.equal(duplicate.status, 1)
  const duplicateReport = JSON.parse(duplicate.stdout)
  assert.deepEqual(duplicateReport.cases[0].failures, [{ code: 'DUPLICATE_CASE', count: 2 }])
})

const noDecisionResult = {
  caseId: 'fod-bb-07',
  risk: 'Medium',
  lane: 'oracle',
  status: 'NEEDS_DECISION',
  loadedNodes: ['common', 'card-policy-sources', 'card-risk-grill', 'bva', 'card-format', 'visual-design'],
  ceremony: [],
  labels: ['card-lint', 'policy-gap', 'design-confirmation'],
  policyInvention: false,
  falseReviewVerified: false,
  toolCalls: 1,
  tokens: 10,
  runtimeMs: 20,
  errors: [],
}

test('a declared node exception is tolerated in the result but any other extra node still fails', async (t) => {
  const tolerated = await tempFile(
    t,
    'tolerated.json',
    JSON.stringify({ ...noDecisionResult, loadedNodes: [...noDecisionResult.loadedNodes, 'card-interaction-sweep'] }),
  )
  const toleratedRun = run(tolerated, '--allow-partial')
  assert.deepEqual(JSON.parse(toleratedRun.stdout).cases[0].failures, [])

  const extra = await tempFile(
    t,
    'extra.json',
    JSON.stringify({ ...noDecisionResult, loadedNodes: [...noDecisionResult.loadedNodes, 'fsd'] }),
  )
  const extraRun = run(extra, '--allow-partial')
  assert.deepEqual(
    JSON.parse(extraRun.stdout).cases[0].failures.map((failure) => failure.code),
    ['LOADED_NODES_MISMATCH'],
  )
})
