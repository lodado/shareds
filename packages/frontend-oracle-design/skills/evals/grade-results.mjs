#!/usr/bin/env node
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
  const byCase = new Map()
  for (const result of results) {
    const caseId = caseIdOf(result)
    const entries = byCase.get(caseId) ?? []
    entries.push(result)
    byCase.set(caseId, entries)
  }

  const selectedFixtures = allowPartial
    ? [...new Set(results.map((result) => caseIdOf(result)))].map((caseId) => fixtures.get(caseId)).filter(Boolean)
    : corpus.cases
  const cases = selectedFixtures.map((fixture) => {
    const matching = byCase.get(fixture.id) ?? []
    if (matching.length === 0) {
      return { caseId: fixture.id, pass: false, routingPass: false, failures: [{ code: 'MISSING_CASE' }] }
    }
    const graded = gradeCase(matching[0], fixture, metricsSchema)
    if (matching.length > 1) {
      graded.failures.push({ code: 'DUPLICATE_CASE', count: matching.length })
      graded.routingPass = false
    }
    graded.pass = graded.failures.length === 0
    return graded
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
