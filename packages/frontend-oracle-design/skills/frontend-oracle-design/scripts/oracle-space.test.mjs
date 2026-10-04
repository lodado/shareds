import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fullProductFixture } from '../../../test-fixtures/full-product/fixture.mjs'
import { generateFromDocument } from './oracle-frames.mjs'
import { auditFullProduct, auditIdCoverage, fullProductRecords } from './oracle-space.mjs'

const card = readFileSync(new URL('../../../test-fixtures/full-product/oracle.md', import.meta.url), 'utf8')

function audit(text) {
  return auditFullProduct(text, generateFromDocument(text))
}

test('space audit preserves the complete legacy twelve-case report without mutating its inputs', () => {
  const generated = generateFromDocument(card)
  const before = structuredClone(generated)
  const expected = {
    coverage: 'full-product',
    dimensionRevision: generated.dimensionRevision,
    constraintRevision: generated.constraintRevision,
    dimensions: [
      { id: 'navigation', values: ['next', 'previous'], source: 'S1' },
      { id: 'ordering', values: ['single', 'duplicate', 'late'], source: 'S1' },
      { id: 'history', values: ['fresh', 'prior'], source: 'S1' },
    ],
    N_raw: 12, N_valid: 12, N_excluded: 0, N_unresolved: 0, N_scenarios: 12,
    N_executed_unique: null, N_passed_unique: null,
    missing: [], extra: [], duplicate: [], malformed: [], 'stale-mapping': [],
    excluded: [], unresolved: [], questions: [], issues: [],
    ready: true, execution: 'not-run',
    limitation: 'Declared-model completeness only; source relevance and assertion semantics require review.',
  }
  assert.deepEqual(auditFullProduct(card, generated), expected)
  assert.deepEqual(auditFullProduct(card, generated), expected, 'same inputs remain deterministic')
  assert.deepEqual(generated, before)
})

test('coverage compares identities rather than equal counts', () => {
  assert.deepEqual(auditIdCoverage(['A', 'B'], ['A', 'A', 'C']), {
    missing: ['B'], extra: ['C'], duplicate: ['A'],
  })
})

test('coverage retains encounter order and each excess occurrence for legacy diagnostics', () => {
  assert.deepEqual(auditIdCoverage(['B', 'A', 'B', 'D'], ['C', 'A', 'C', 'C', 'E']), {
    missing: ['B', 'D'], extra: ['C', 'E'], duplicate: ['C', 'C'],
  })
  assert.deepEqual(auditIdCoverage([], []), { missing: [], extra: [], duplicate: [] })
})

test('full-product records parse JSON and dispositions while ignoring fenced decoy tables', () => {
  const fixture = fullProductFixture()
  const records = fullProductRecords(fixture.render())
  assert.equal(records.length, 12)
  assert.deepEqual(records[0], {
    id: fixture.records[0].frame,
    disposition: { type: 'covered', rows: ['O1'], subrefs: [], reason: null, text: 'covered(O1)' },
    tuple: fixture.records[0].tuple,
    scenario: fixture.records[0].scenario,
  })
  const invalid = structuredClone(fixture.records)
  invalid[0].tuple = null
  invalid[0].scenario = null
  assert.equal(fullProductRecords(fixture.render(invalid))[0].tuple, null)
  assert.equal(fullProductRecords(fixture.render(invalid))[0].scenario, null)
  assert.deepEqual(fullProductRecords(`\`\`\`markdown\n## Frame dispositions\n| Frame | Disposition | Tuple | Scenario |\n| Ffake | covered(O1) | {} | {} |\n\`\`\`\n${fixture.render()}`), records)
  assert.deepEqual(fullProductRecords('## Frame dispositions\n| Frame | Disposition | Tuple | Scenario |\n| Fbad | covered(O1) | not-json | not-json |')[0], {
    id: 'Fbad', disposition: records[0].disposition, tuple: null, scenario: null,
  })
})

test('space audit rejects missing, duplicate, extra, malformed and stale mappings with legacy messages', async (t) => {
  const fixture = fullProductFixture()
  const first = fixture.records[0].frame
  const cases = [
    ['missing and duplicate at the same count', (r) => { r.shift(); r.push(structuredClone(r[0])) }, (report) => {
      assert.deepEqual(report.missing, [first])
      assert.deepEqual(report.duplicate, [fixture.records[1].frame])
      assert.equal(report.extra.length, 0)
    }],
    ['extra auxiliary-looking ID', (r) => { r.push({ ...r[0], frame: 'PATHbogus' }) }, (report) => {
      assert.deepEqual(report.extra, ['PATHbogus'])
    }],
    ['unknown tuple value', (r) => { r[0].tuple.navigation = 'loading' }, (report) => {
      assert.deepEqual(report.malformed, [`tuple domain: ${first}`])
    }],
    ['valid-domain tuple with stale ID', (r) => { r[0].tuple.navigation = 'previous' }, (report) => {
      assert.deepEqual(report.malformed, [`ID/tuple mismatch: ${first}`])
    }],
    ['legacy list-specific given fields', (r) => { r[0].scenario.given = { enabled: false } }, (report) => {
      assert.ok(report.issues.includes(`scenario: ${first} requires unique sourced GWT, contract rows and realization`))
    }],
    ['legacy null given field', (r) => { r[0].scenario.given.query = null }, (report) => {
      assert.ok(report.issues.some((issue) => issue.startsWith('scenario:')))
    }],
    ['unknown contract row', (r) => { r[0].disposition = 'covered(O999)' }, (report) => {
      assert.ok(report.issues.includes(`disposition: ${first} must use covered, impossible, needs-decision or needs-evidence`))
    }],
    ['unknown scenario source', (r) => { r[0].scenario.sources = ['S999'] }, (report) => {
      assert.ok(report.issues.some((issue) => issue.startsWith('scenario:')))
    }],
    ['unsupported exclusion', (r) => { r[0].disposition = 'impossible: sampling is cheaper — constraint(S1)'; r[0].scenario = null }, (report) => {
      assert.ok(report.issues.includes(`exclusion: ${first} needs an applicable approved constraint, mechanism and falsifier`))
    }],
    ['out-of-order scenario', (r) => { r.find((x) => x.tuple.ordering === 'late').scenario.when.reverse() }, (report) => {
      assert.ok(report.issues.some((issue) => issue.startsWith('sequence:')))
    }],
  ]
  for (const [name, mutate, check] of cases) await t.test(name, () => {
    const records = structuredClone(fixture.records)
    mutate(records)
    const report = audit(fixture.render(records))
    assert.equal(report.ready, false)
    assert.equal(report.execution, 'not-run')
    assert.equal(report.N_executed_unique, null)
    assert.equal(report.N_passed_unique, null)
    check(report)
  })
  const stale = audit(fixture.render().replace(`- Dimension revision: ${fixture.generated.dimensionRevision}`, '- Dimension revision: stale'))
  assert.deepEqual(stale['stale-mapping'], ['Dimension revision'])
  assert.equal(stale.ready, false)
})

test('space audit preserves approved exclusions and unresolved design-only counts', () => {
  const fixture = fullProductFixture(undefined, (model) => {
    model.constraints.push({ id: 'C1', when: { history: 'fresh', navigation: 'previous' }, source: 'S1', mechanism: 'previous requires a prior page', falsifier: 'previous reachable with fresh history' })
  })
  for (const record of fixture.records.filter((r) => r.tuple.history === 'fresh' && r.tuple.navigation === 'previous')) {
    record.disposition = 'impossible: C1 previous is unreachable — constraint(S1)'
    record.scenario = null
  }
  const excluded = audit(fixture.render())
  assert.equal(excluded.N_excluded, 3)
  assert.equal(excluded.N_valid, 9)
  assert.equal(excluded.N_scenarios, 9)
  assert.equal(excluded.ready, true)
  assert.equal(excluded.excluded.length, 3)

  const open = fullProductFixture()
  open.records[0].disposition = 'needs-decision: Q1 choose the API'
  open.records[0].scenario = null
  const unresolved = audit(`${open.render()}\n## Open questions\n\n- Q1: Which API?\n`)
  assert.equal(unresolved.N_unresolved, 1)
  assert.equal(unresolved.N_valid, 11)
  assert.equal(unresolved.N_scenarios, 11)
  assert.deepEqual(unresolved.questions, ['Q1'])
  assert.deepEqual(unresolved.issues, [])
  assert.equal(unresolved.ready, false)
  assert.equal(unresolved.execution, 'not-run')
})

test('space audit accepts generated auxiliary IDs without counting them as full-product scenarios', () => {
  const generated = generateFromDocument(card)
  generated.paths.push({ id: 'PATHauxiliary' })
  const auxiliary = `${card}\n| PATHauxiliary | covered(O1) | null | null |\n`
  const report = auditFullProduct(auxiliary, generated)
  assert.deepEqual(report.extra, [])
  assert.deepEqual(report.missing, [])
  assert.equal(report.N_scenarios, 12)
  assert.equal(report.ready, true)
})

test('neutral Space import graph has no verifier cycle, Formal, Bend, installer or network dependencies', () => {
  function assertNeutralPath(pathname) {
    assert.doesNotMatch(pathname, /\/(?:oracle-verify|oracle-model|oracle-package|oracle-adequacy)\.mjs$/)
    if (pathname.endsWith('.mjs')) {
      assert.ok(!pathname.includes('bend') && !pathname.includes('install'), 'no Bend or installer dependencies')
    }
  }
  for (const pathname of [
    '/oracle-verify.mjs', '/oracle-model.mjs', '/oracle-package.mjs', '/oracle-adequacy.mjs',
    '/neutral/bend-runner.mjs', '/neutral/installer.mjs', '/bend-tools/neutral.mjs', '/install-tools/neutral.mjs',
  ]) assert.throws(() => assertNeutralPath(pathname), assert.AssertionError, pathname)
  for (const pathname of [
    '/oracle-verify-helpers.mjs', '/neutral/module.mjs', '/Bend-tools/neutral.mjs',
    '/install-tools/neutral.MJS', '/neutral/bend.js', '/Oracle-Model.mjs',
  ]) assert.doesNotThrow(() => assertNeutralPath(pathname), pathname)

  const seen = new Set()
  function visit(url) {
    if (seen.has(url.href)) return
    seen.add(url.href)
    assertNeutralPath(url.pathname)
    const source = readFileSync(url, 'utf8')
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2]
      assert.doesNotMatch(specifier, /^(?:https?:|node:(?:https?|net|tls)$)/)
      if (specifier.startsWith('.')) visit(new URL(specifier, url))
    }
  }
  visit(new URL('./oracle-space.mjs', import.meta.url))
  assert.ok(seen.size > 1, 'checks transitive imports, not only the new module')
})
