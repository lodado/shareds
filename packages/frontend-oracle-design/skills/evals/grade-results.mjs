#!/usr/bin/env node
// Grades a results artifact against blackbox-corpus.json. The unit of grading is (caseId, variant):
// each variant of a fixture (an A/B arm such as baseline/compressed, default variant when absent) is
// graded as its own line. Within one variant a fixture may appear once, or k times with distinct
// `replicateId`s (run-live.mjs --replicates k). Replicates are graded independently: the variant
// passes only when every replicate passes (pass^k, the reliability view) and `passAtK` records
// whether any replicate passed (pass@k, the capability view). Repeats without distinct replicateIds
// are still DUPLICATE_CASE — an artifact must say that it meant to repeat. When replicate counts
// differ across variants/cases the aggregate carries replicateCounts so unequal k is visible, and
// metrics.variants reports each non-default variant separately — cross-variant numbers are never
// silently pooled.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const evalDirectory = dirname(fileURLToPath(import.meta.url))
const corpusPath = join(evalDirectory, 'blackbox-corpus.json')
const metricsSchemaPath = join(evalDirectory, 'metrics-schema.json')
const ROUTING_FAILURES = new Set([
  'RISK_MISMATCH',
  'LANE_MISMATCH',
  'STATUS_MISMATCH',
  'ROUTE_MISMATCH',
  'LOADED_NODES_MISMATCH',
])

class EvalInputError extends Error {}

function asSet(value) {
  return new Set(Array.isArray(value) ? value : [])
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function caseIdOf(result) {
  return isRecord(result) ? result.caseId : null
}

function replicateIdOf(result) {
  if (!isRecord(result)) return null
  if (typeof result.replicateId !== 'string' || !result.replicateId) return null
  return result.replicateId
}

function variantOf(result) {
  if (!isRecord(result)) return null
  if (typeof result.variant !== 'string' || !result.variant) return null
  return result.variant
}

/** Every entry carries its own replicateId and no two share one — otherwise the repeats are duplicates. */
function distinctReplicates(entries) {
  const ids = entries.map(replicateIdOf)
  return ids.every(Boolean) && new Set(ids).size === ids.length
}

function gradeFixture(matching, fixture, metricsSchema) {
  if (matching.length === 1) {
    const graded = gradeCase(matching[0], fixture, metricsSchema)
    const replicateId = replicateIdOf(matching[0])
    if (replicateId) graded.replicates = [{ replicateId, pass: graded.pass, failures: graded.failures }]
    return graded
  }
  if (!distinctReplicates(matching)) {
    const graded = gradeCase(matching[0], fixture, metricsSchema)
    graded.failures.push({ code: 'DUPLICATE_CASE', count: matching.length })
    graded.routingPass = false
    graded.pass = false
    return graded
  }
  const replicates = matching.map((result) => {
    const graded = gradeCase(result, fixture, metricsSchema)
    return { replicateId: replicateIdOf(result), pass: graded.pass, routingPass: graded.routingPass, failures: graded.failures }
  })
  const passedCount = replicates.filter((entry) => entry.pass).length
  return {
    caseId: fixture.id,
    variant: variantOf(matching[0]),
    pass: passedCount === replicates.length,
    passAtK: passedCount > 0,
    routingPass: replicates.every((entry) => entry.routingPass),
    k: replicates.length,
    passedReplicates: passedCount,
    failures: replicates.flatMap((entry) =>
      entry.failures.map((failure) => ({ ...failure, replicateId: entry.replicateId })),
    ),
    replicates: replicates.map(({ replicateId, pass, failures }) => ({ replicateId, pass, failures })),
  }
}

function numericMetric(result, field) {
  if (!isRecord(result)) return 0
  if (!Number.isSafeInteger(result[field]) || result[field] < 0) return 0
  return result[field]
}

function arrayMetric(result, field) {
  if (!isRecord(result)) return 0
  const value = result[field]
  if (!Array.isArray(value)) return 0
  return value.length
}

function booleanMetric(result, field) {
  if (!isRecord(result)) return 0
  return result[field] ? 1 : 0
}

function compareSet(actual, expected, missingCode, unexpectedCode, tolerated = []) {
  const actualSet = asSet(actual)
  const expectedSet = asSet(expected)
  const toleratedSet = asSet(tolerated)
  const missing = [...expectedSet].filter((value) => !actualSet.has(value))
  // A declared node exception is optional, never forbidden: the case may stop before that read.
  const unexpected = [...actualSet].filter((value) => !expectedSet.has(value) && !toleratedSet.has(value))
  const failures = []
  if (missing.length || unexpected.length) {
    failures.push({ code: missing.length ? missingCode : unexpectedCode, missing, unexpected })
  }
  return failures
}

async function readResults(path) {
  const text = await readFile(path, 'utf8')
  const trimmed = text.trim()
  if (!trimmed) throw new EvalInputError('BLANK_JSONL: results artifact is empty')
  if (path.endsWith('.jsonl')) {
    const lines = text.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    return lines.map((line, index) => {
      if (!line.trim()) throw new EvalInputError(`BLANK_JSONL: line ${index + 1} is empty`)
      try {
        return JSON.parse(line)
      } catch {
        throw new EvalInputError(`MALFORMED_JSONL: line ${index + 1} is not valid JSON`)
      }
    })
  }
  const parsed = JSON.parse(trimmed)
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.results)) return parsed.results
  return [parsed]
}

function shapeFailures(result, metricsSchema) {
  if (!isRecord(result)) return [{ code: 'INVALID_RESULT' }]

  const failures = []
  for (const field of metricsSchema.required) {
    if (!Object.hasOwn(result, field)) failures.push({ code: 'MISSING_FIELD', field })
  }
  for (const [field, definition] of Object.entries(metricsSchema.properties)) {
    if (!Object.hasOwn(result, field)) continue
    if (definition.type === 'string' && typeof result[field] !== 'string') {
      failures.push({ code: 'INVALID_FIELD', field })
    }
    if (definition.type === 'boolean' && typeof result[field] !== 'boolean') {
      failures.push({ code: 'INVALID_FIELD', field })
    }
    if (
      definition.type === 'integer' &&
      (!Number.isSafeInteger(result[field]) ||
        result[field] < (definition.minimum ?? 0) ||
        result[field] > (definition.maximum ?? Number.MAX_SAFE_INTEGER))
    ) {
      failures.push({ code: 'INVALID_FIELD', field })
    }
    if (
      definition.type === 'number' &&
      (!Number.isFinite(result[field]) ||
        result[field] < (definition.minimum ?? -Infinity) ||
        result[field] > (definition.maximum ?? Infinity))
    ) {
      failures.push({ code: 'INVALID_FIELD', field })
    }
    if (
      definition.type === 'array' &&
      (!Array.isArray(result[field]) ||
        (definition.items?.type === 'string' && !result[field].every((entry) => typeof entry === 'string')))
    ) {
      failures.push({ code: 'INVALID_FIELD', field })
    }
  }
  return failures
}

function gradeCase(result, fixture, metricsSchema) {
  const expected = fixture.expected
  const failures = shapeFailures(result, metricsSchema)
  const actual = isRecord(result) ? result : {}

  if (actual.risk !== expected.risk)
    failures.push({ code: 'RISK_MISMATCH', expected: expected.risk, actual: actual.risk })
  if (actual.lane !== expected.lane)
    failures.push({ code: 'LANE_MISMATCH', expected: expected.lane, actual: actual.lane })
  if (actual.status !== expected.status) {
    failures.push({ code: 'STATUS_MISMATCH', expected: expected.status, actual: actual.status })
  }
  if (expected.route && actual.route !== expected.route) {
    failures.push({ code: 'ROUTE_MISMATCH', expected: expected.route, actual: actual.route })
  }
  failures.push(
    ...compareSet(
      actual.loadedNodes,
      expected.loadedNodes,
      'LOADED_NODES_MISMATCH',
      'LOADED_NODES_MISMATCH',
      (expected.nodeExceptions ?? []).map((entry) => entry.node),
    ),
  )

  const ceremony = asSet(actual.ceremony)
  const forbidden = (expected.forbiddenCeremony ?? []).filter((item) => ceremony.has(item))
  if (forbidden.length) failures.push({ code: 'FORBIDDEN_CEREMONY', forbidden })

  const labels = compareSet(actual.labels, expected.requiredLabels, 'MISSING_LABEL', 'UNEXPECTED_LABEL')
  failures.push(...labels)
  if (actual.policyInvention) failures.push({ code: 'POLICY_INVENTION' })
  if (actual.falseReviewVerified) failures.push({ code: 'FALSE_REVIEW_VERIFIED' })
  if (Array.isArray(actual.errors) && actual.errors.length) failures.push({ code: 'RESULT_ERRORS', errors: actual.errors })

  return {
    caseId: actual.caseId,
    pass: failures.length === 0,
    routingPass: !failures.some((failure) => ROUTING_FAILURES.has(failure.code)),
    failures,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const allowPartial = args.includes('--allow-partial')
  const artifact = args.find((arg) => arg !== '--allow-partial')
  if (!artifact) {
    process.stderr.write('USAGE: grade-results.mjs [--allow-partial] <results.json|results.jsonl>\n')
    process.exitCode = 2
    return
  }

  const [corpus, metricsSchema, results] = await Promise.all([
    JSON.parse(await readFile(corpusPath, 'utf8')),
    JSON.parse(await readFile(metricsSchemaPath, 'utf8')),
    readResults(artifact),
  ])

  if (results.length === 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          authority: allowPartial ? 'NON_AUTHORITATIVE_PARTIAL' : 'AUTHORITATIVE_FULL_CORPUS',
          authoritative: !allowPartial,
          total: 1,
          passed: 0,
          failed: 1,
          cases: [{ caseId: null, pass: false, routingPass: false, failures: [{ code: 'EMPTY_RESULTS' }] }],
          metrics: {
            routingAccuracy: 0,
            passAllK: null,
            passAtK: null,
            replicatedCases: 0,
            replicateCounts: [],
            policyInvention: 0,
            falseReviewVerified: 0,
            toolCalls: 0,
            tokens: 0,
            runtimeMs: 0,
            errors: 0,
          },
        },
        null,
        2,
      )}\n`,
    )
    process.exitCode = 1
    return
  }

  const fixtures = new Map(corpus.cases.map((fixture) => [fixture.id, fixture]))
  if (fixtures.size !== corpus.cases.length) throw new EvalInputError('DUPLICATE_FIXTURE_ID')
  // Grading unit is (caseId, variant): variants are independent arms and never share a replicate pool.
  const byGroup = new Map()
  for (const result of results) {
    const key = `${caseIdOf(result)}\u0000${variantOf(result) ?? ''}`
    const entries = byGroup.get(key) ?? []
    entries.push(result)
    byGroup.set(key, entries)
  }
  const groupKeys = [...byGroup.keys()]
  const variantsOfCase = (caseId) =>
    groupKeys.filter((key) => key.startsWith(`${caseId}\u0000`)).map((key) => key.slice(caseId.length + 1))

  const selectedFixtures = allowPartial
    ? [...new Set(results.map((result) => caseIdOf(result)))].map((caseId) => fixtures.get(caseId)).filter(Boolean)
    : corpus.cases
  const cases = selectedFixtures.flatMap((fixture) => {
    const variants = variantsOfCase(fixture.id)
    if (variants.length === 0) {
      return [{ caseId: fixture.id, pass: false, routingPass: false, failures: [{ code: 'MISSING_CASE' }] }]
    }
    return variants.map((variant) => {
      const matching = byGroup.get(`${fixture.id}\u0000${variant}`) ?? []
      const graded = gradeFixture(matching, fixture, metricsSchema)
      if (variant) graded.variant = variant
      return graded
    })
  })
  for (const result of results) {
    const fixture = fixtures.get(caseIdOf(result))
    if (!fixture)
      cases.push({
        caseId: caseIdOf(result),
        pass: false,
        routingPass: false,
        failures: shapeFailures(result, metricsSchema).length
          ? shapeFailures(result, metricsSchema)
          : [{ code: 'UNKNOWN_CASE' }],
      })
  }
  const passed = cases.filter((entry) => entry.pass).length
  const replicated = cases.filter((entry) => Number.isInteger(entry.k) && entry.k > 1)
  // Unequal k across replicated lines is legal but must be visible, not silently pooled.
  const replicateCounts = [...new Set(replicated.map((entry) => entry.k))].sort((left, right) => left - right)
  const variantMetrics = {}
  for (const entry of cases) {
    if (!entry.variant) continue
    const bucket = (variantMetrics[entry.variant] ??= { total: 0, passed: 0, routingPassed: 0 })
    bucket.total += 1
    if (entry.pass) bucket.passed += 1
    if (entry.routingPass) bucket.routingPassed += 1
  }
  const checkedAdd = (left, right) => {
    if (!Number.isSafeInteger(left + right)) throw new EvalInputError('AGGREGATE_OVERFLOW')
    return left + right
  }
  const totals = results.reduce(
    (sum, result) => ({
      toolCalls: checkedAdd(sum.toolCalls, numericMetric(result, 'toolCalls')),
      tokens: checkedAdd(sum.tokens, numericMetric(result, 'tokens')),
      runtimeMs: checkedAdd(sum.runtimeMs, numericMetric(result, 'runtimeMs')),
      errors: checkedAdd(sum.errors, arrayMetric(result, 'errors')),
      policyInvention: checkedAdd(sum.policyInvention, booleanMetric(result, 'policyInvention')),
      falseReviewVerified: checkedAdd(sum.falseReviewVerified, booleanMetric(result, 'falseReviewVerified')),
    }),
    { toolCalls: 0, tokens: 0, runtimeMs: 0, errors: 0, policyInvention: 0, falseReviewVerified: 0 },
  )
  const report = {
    authority: allowPartial ? 'NON_AUTHORITATIVE_PARTIAL' : 'AUTHORITATIVE_FULL_CORPUS',
    authoritative: !allowPartial,
    total: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
    metrics: {
      routingAccuracy: cases.length ? cases.filter((entry) => entry.routingPass).length / cases.length : 0,
      // pass^k over the cases that were actually replicated; 1 when nothing was replicated is not claimed.
      passAllK: replicated.length ? replicated.filter((entry) => entry.pass).length / replicated.length : null,
      passAtK: replicated.length ? replicated.filter((entry) => entry.passAtK).length / replicated.length : null,
      replicatedCases: replicated.length,
      replicateCounts,
      ...(Object.keys(variantMetrics).length ? { variants: variantMetrics } : {}),
      policyInvention: totals.policyInvention,
      falseReviewVerified: totals.falseReviewVerified,
      toolCalls: totals.toolCalls,
      tokens: totals.tokens,
      runtimeMs: totals.runtimeMs,
      errors: totals.errors,
    },
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exitCode = 1
  if (!allowPartial && report.failed === 0) process.exitCode = 0
}

main().catch((error) => {
  process.stderr.write(`EVAL_GRADER_FAILED: ${error.message}\n`)
  process.exitCode = 2
})
