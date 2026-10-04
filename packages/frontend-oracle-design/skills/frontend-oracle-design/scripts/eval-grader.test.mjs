import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const evalDirectory = join(skillDirectory, 'evals')
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
          lane: 'oracle',
          status: 'OUT_OF_SCOPE',
          loadedNodes: ['common'],
          ceremony: [],
          labels: [],
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
        status: 'OUT_OF_SCOPE',
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
      ['RISK_MISMATCH', 'POLICY_INVENTION', 'RESULT_ERRORS'],
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
        'mandatory-verification',
        'bend-cross-verification',
        'adequacy',
        'card-policy-sources',
        'card-risk-grill',
        'bva',
        'card-format',
        'card-interaction-sweep',
        'card-case-space',
        'role-case-space-inputs',
        'role-space-discovery',
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
        'discovery',
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
      lane: 'oracle',
      status: 'OUT_OF_SCOPE',
      loadedNodes: ['common'],
      ceremony: [],
      labels: [],
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
      lane: 'oracle',
      status: 'OUT_OF_SCOPE',
      loadedNodes: ['common'],
      ceremony: [],
      labels: [],
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
      lane: 'oracle',
      status: 'OUT_OF_SCOPE',
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
    ['MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD', 'LOADED_NODES_MISMATCH'],
  )

  const invalidPath = await tempFile(
    t,
    'invalid-consumed.json',
    JSON.stringify({
      caseId: 'fod-bb-01',
      risk: ['Low'],
      lane: 1,
      status: null,
      loadedNodes: 'common',
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
    lane: 'oracle',
    status: 'OUT_OF_SCOPE',
    loadedNodes: ['common'],
    ceremony: [],
    labels: [],
    policyInvention: false,
    falseReviewVerified: false,
    toolCalls: 1,
    tokens: 10,
    runtimeMs: 20,
    errors: ['runner failed after emitting a partial result'],
  }
  const path = await tempFile(
    t,
    'duplicate-errors.jsonl',
    `${JSON.stringify(resultRecord)}\n${JSON.stringify(resultRecord)}\n`,
  )

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
        lane: 'oracle',
        status: 'OUT_OF_SCOPE',
        loadedNodes: ['common'],
        ceremony: [],
        labels: [],
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
    lane: 'oracle',
    status: 'OUT_OF_SCOPE',
    loadedNodes: ['common'],
    ceremony: [],
    labels: [],
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
  const corpusSize = JSON.parse(await readFile(join(evalDirectory, 'blackbox-corpus.json'), 'utf8')).cases.length
  assert.equal(missingReport.total, corpusSize)
  assert.equal(missingReport.cases.filter((entry) => entry.failures[0]?.code === 'MISSING_CASE').length, corpusSize - 1)

  const duplicatePath = await tempFile(t, 'duplicate.json', JSON.stringify([result, result]))
  const duplicate = run(duplicatePath, '--allow-partial')
  assert.equal(duplicate.status, 1)
  const duplicateReport = JSON.parse(duplicate.stdout)
  assert.deepEqual(duplicateReport.cases[0].failures, [{ code: 'DUPLICATE_CASE', count: 2 }])
})

const noDecisionResult = {
  caseId: 'fod-bb-09',
  risk: 'High',
  lane: 'oracle',
  status: 'NEEDS_DECISION',
  loadedNodes: ['common', 'mandatory-verification', 'card-policy-sources', 'card-risk-grill', 'bva', 'card-format'],
  ceremony: [],
  labels: ['source-registry-fk', 'policy-gap'],
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

const passingRecord = {
  caseId: 'fod-bb-01',
  risk: 'Low',
  lane: 'oracle',
  status: 'OUT_OF_SCOPE',
  loadedNodes: ['common'],
  ceremony: [],
  labels: [],
  policyInvention: false,
  falseReviewVerified: false,
  toolCalls: 1,
  tokens: 10,
  runtimeMs: 20,
  errors: [],
}

test('distinct replicateIds grade a fixture as pass^k and record pass@k separately', async (t) => {
  const path = await tempFile(
    t,
    'replicates.jsonl',
    [
      JSON.stringify({ ...passingRecord, replicateId: 'r1' }),
      JSON.stringify({ ...passingRecord, replicateId: 'r2', status: 'NEEDS_DECISION' }),
      JSON.stringify({ ...passingRecord, replicateId: 'r3' }),
    ].join('\n'),
  )

  const result = run(path, '--allow-partial')
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.deepEqual([report.total, report.passed, report.failed], [1, 0, 1])
  const graded = report.cases[0]
  assert.equal(graded.pass, false)
  assert.equal(graded.passAtK, true)
  assert.equal(graded.k, 3)
  assert.equal(graded.passedReplicates, 2)
  assert.deepEqual(
    graded.failures.map((failure) => [failure.code, failure.replicateId]),
    [['STATUS_MISMATCH', 'r2']],
  )
  assert.deepEqual(
    graded.replicates.map((entry) => [entry.replicateId, entry.pass]),
    [
      ['r1', true],
      ['r2', false],
      ['r3', true],
    ],
  )
  assert.equal(report.metrics.passAllK, 0)
  assert.equal(report.metrics.passAtK, 1)
  assert.equal(report.metrics.replicatedCases, 1)
  assert.equal(report.metrics.toolCalls, 3)
})

test('all replicates passing yields pass^k = 1 and a single-record artifact reports no replicate metrics', async (t) => {
  const allPass = await tempFile(
    t,
    'all-pass.jsonl',
    [
      JSON.stringify({ ...passingRecord, replicateId: 'r1' }),
      JSON.stringify({ ...passingRecord, replicateId: 'r2' }),
    ].join('\n'),
  )
  const report = JSON.parse(run(allPass, '--allow-partial').stdout)
  assert.equal(report.passed, 1)
  assert.equal(report.cases[0].pass, true)
  assert.equal(report.metrics.passAllK, 1)

  const single = await tempFile(t, 'single.jsonl', `${JSON.stringify(passingRecord)}\n`)
  const singleReport = JSON.parse(run(single, '--allow-partial').stdout)
  assert.equal(singleReport.metrics.passAllK, null)
  assert.equal(singleReport.metrics.passAtK, null)
  assert.equal(singleReport.metrics.replicatedCases, 0)
})

test('repeats that share or omit a replicateId remain DUPLICATE_CASE', async (t) => {
  const shared = await tempFile(
    t,
    'shared.jsonl',
    [
      JSON.stringify({ ...passingRecord, replicateId: 'r1' }),
      JSON.stringify({ ...passingRecord, replicateId: 'r1' }),
    ].join('\n'),
  )
  assert.deepEqual(JSON.parse(run(shared, '--allow-partial').stdout).cases[0].failures, [
    { code: 'DUPLICATE_CASE', count: 2 },
  ])

  const mixed = await tempFile(
    t,
    'mixed.jsonl',
    [JSON.stringify({ ...passingRecord, replicateId: 'r1' }), JSON.stringify(passingRecord)].join('\n'),
  )
  assert.deepEqual(JSON.parse(run(mixed, '--allow-partial').stdout).cases[0].failures, [
    { code: 'DUPLICATE_CASE', count: 2 },
  ])
})

test('variants are graded as separate arms and never pooled into one number', async (t) => {
  const path = await tempFile(
    t,
    'variants.jsonl',
    [
      JSON.stringify({ ...passingRecord, variant: 'baseline', replicateId: 'r1' }),
      JSON.stringify({ ...passingRecord, variant: 'baseline', replicateId: 'r2' }),
      JSON.stringify({ ...passingRecord, variant: 'compressed', replicateId: 'r1', status: 'NEEDS_DECISION' }),
      JSON.stringify({ ...passingRecord, variant: 'compressed', replicateId: 'r2' }),
    ].join('\n'),
  )

  const report = JSON.parse(run(path, '--allow-partial').stdout)
  assert.equal(report.total, 2)
  const baseline = report.cases.find((entry) => entry.variant === 'baseline')
  const compressed = report.cases.find((entry) => entry.variant === 'compressed')
  assert.equal(baseline.pass, true)
  assert.equal(compressed.pass, false)
  assert.equal(compressed.passAtK, true)
  assert.deepEqual(report.metrics.variants, {
    baseline: { total: 1, passed: 1, routingPassed: 1 },
    compressed: { total: 1, passed: 0, routingPassed: 0 },
  })
})

test('unequal replicate counts stay visible in metrics.replicateCounts', async (t) => {
  const second = {
    ...passingRecord,
    caseId: 'fod-bb-07',
    risk: 'Medium',
    lane: 'oracle',
    status: 'NEEDS_DECISION',
    loadedNodes: ['common', 'card-policy-sources', 'card-risk-grill', 'bva', 'card-format'],
    labels: ['policy-gap', 'source-registry-fk'],
  }
  const path = await tempFile(
    t,
    'unequal.jsonl',
    [
      JSON.stringify({ ...passingRecord, replicateId: 'r1' }),
      JSON.stringify({ ...passingRecord, replicateId: 'r2' }),
      JSON.stringify({ ...second, replicateId: 'r1' }),
      JSON.stringify({ ...second, replicateId: 'r2' }),
      JSON.stringify({ ...second, replicateId: 'r3' }),
    ].join('\n'),
  )

  const report = JSON.parse(run(path, '--allow-partial').stdout)
  assert.deepEqual(report.metrics.replicateCounts, [2, 3])
  assert.equal(report.metrics.replicatedCases, 2)
})

test('a prompt that must not auto-invoke the skill passes when the host never activated it, and only on the natural arm', async (t) => {
  const natural = { ...passingRecord, lane: 'none', status: 'done', loadedNodes: [], skillInvoked: false }
  const grade = async (name, record) => {
    const result = run(await tempFile(t, `${name}.json`, JSON.stringify(record)), '--allow-partial')
    return JSON.parse(result.stdout).cases[0]
  }

  // never activated, loaded nothing: the trigger held, so the routing fields are not graded
  const held = await grade('held', natural)
  assert.equal(held.pass, true, JSON.stringify(held.failures))
  assert.equal(held.routingPass, true)

  // the explicit arm asked for the skill: not activating it is the failure
  assert.equal((await grade('explicit', { ...natural, variant: 'explicit' })).pass, false)
  // activated on a natural prompt: graded as the gate stop it must be, not excused
  assert.equal((await grade('activated', { ...passingRecord, skillInvoked: true })).pass, true)
  assert.equal((await grade('activated-wrong', { ...passingRecord, status: 'GREEN', skillInvoked: true })).pass, false)
  // no activation but the nodes were read anyway: the agent used the skill without the Skill call, so it is graded in full
  assert.equal((await grade('side-door', { ...natural, loadedNodes: ['common', 'mandatory-verification'] })).pass, false)
  // honest checks still bind: an invented policy or a harness error fails the held trigger too
  assert.equal((await grade('invented', { ...natural, policyInvention: true })).pass, false)
  assert.equal((await grade('errored', { ...natural, errors: ['NO_MACHINE_REPORT'] })).pass, false)
  // a case that never declared autoInvoke: false is graded in full even when the skill stayed silent
  const delivery = await grade('delivery', { ...natural, caseId: 'fod-bb-03' })
  assert.equal(delivery.pass, false)
})

test('an optional label is tolerated and never required, while any other extra label still fails', async (t) => {
  const corpus = JSON.parse(await readFile(join(evalDirectory, 'blackbox-corpus.json'), 'utf8'))
  const { expected } = corpus.cases.find((candidate) => candidate.id === 'fod-bb-15')
  assert.ok(expected.optionalLabels.length > 0)
  const record = {
    caseId: 'fod-bb-15',
    risk: expected.risk,
    lane: expected.lane,
    status: expected.status,
    loadedNodes: expected.loadedNodes,
    ceremony: [],
    labels: expected.requiredLabels,
    policyInvention: false,
    falseReviewVerified: false,
    toolCalls: 1,
    tokens: 10,
    runtimeMs: 20,
    errors: [],
  }
  const grade = async (name, labels) => {
    const result = run(await tempFile(t, `${name}.json`, JSON.stringify({ ...record, labels })), '--allow-partial')
    return JSON.parse(result.stdout).cases[0].failures.map((failure) => failure.code)
  }
  assert.deepEqual(await grade('required', expected.requiredLabels), [])
  assert.deepEqual(await grade('optional', [...expected.requiredLabels, expected.optionalLabels[0]]), [])
  assert.deepEqual(await grade('extra', [...expected.requiredLabels, 'made-up-label']), ['UNEXPECTED_LABEL'])
  assert.deepEqual(await grade('missing', expected.requiredLabels.slice(1)), ['MISSING_LABEL'])
})
