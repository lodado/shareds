import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const { Linter } = createRequire(new URL('../../../../package.json', import.meta.url))('eslint')

const fixtureUrl = new URL('../evals/contextual-review-fixtures.json', import.meta.url)
const load = async () => JSON.parse(await (await import('node:fs/promises')).readFile(fixtureUrl, 'utf8'))

async function runFixture(fixture) {
  const root = await mkdtemp(join(tmpdir(), 'contextual-review-'))
  for (const [path, source] of Object.entries(fixture.files)) {
    const target = join(root, path)
    await writeFile(target, source)
  }
  try {
    const mod = await import(`${pathToFileURL(join(root, fixture.entry)).href}?fixture=${fixture.id}`)
  if (fixture.runtime.action === 'search') {
    try { return await mod.search(async () => { throw new Error('synthetic API failure') }) } catch { return { kind: 'error' } }
  }
  if (fixture.runtime.action === 'reverse') {
    const state = { sequence: 0, value: 'initial' }
    const controller = mod.createController(state)
    controller.accept('latest', 2)
    controller.accept('stale', 1)
    return { value: state.value }
  }
  if (fixture.runtime.action === 'save') {
    let count = 0; mod.save(() => { count += 1 }, { id: 1 }); return { count }
  }
  if (fixture.runtime.action === 'saveTwice') {
    let count = 0; const seen = new Set(); mod.save(() => { count += 1 }, { id: 1 }, seen); mod.save(() => { count += 1 }, { id: 1 }, seen); return { count }
  }
  if (fixture.runtime.action === 'render') return mod.render(mod.getUser())
  if (fixture.runtime.action === 'load') { let count = 0; await mod.loadAll(async () => { count += 1 }, [1, 1]); return { count } }
  if (fixture.runtime.action === 'modes') return mod.modes()
  if (fixture.runtime.action === 'ownership') {
    return {
      success: mod.submit({ name: ' Ada ' }),
      failure: mod.submit({ name: '' }),
    }
  }
    throw new Error(`unknown synthetic action: ${fixture.runtime.action}`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('O16 contextual review fixtures expose defects and counterexamples', async () => {
  const corpus = await load()
  assert.match(corpus.purpose, /Synthetic development fixtures/)
  assert.equal(corpus.cases.length, 14)
  for (const pairId of new Set(corpus.cases.map((entry) => entry.pairId))) {
    const pair = corpus.cases.filter((entry) => entry.pairId === pairId)
    assert.deepEqual(pair.map((entry) => entry.disposition).sort(), ['mustAllow', 'mustPrevent'])
    const prevented = pair.find((entry) => entry.disposition === 'mustPrevent')
    const allowed = pair.find((entry) => entry.disposition === 'mustAllow')
    assert.equal(allowed.counterexampleOf, prevented.id)
    if (pairId !== 'ownership-boundary') {
      assert.notDeepEqual(await runFixture(prevented), await runFixture(allowed))
    }
    for (const entry of pair) {
      assert.equal(entry.origin, 'synthetic-fixture')
      assert.equal(entry.manualReviewOnly, true)
      assert.ok(Object.keys(entry.files).length >= 2)
      assert.ok(entry.requiredContext.length >= 2)
      assert.deepEqual(await runFixture(entry), entry.runtime.expected)
    }
  }

  const ownership = corpus.cases.filter((entry) => entry.pairId === 'ownership-boundary')
  assert.deepEqual(await runFixture(ownership.find((entry) => entry.disposition === 'mustPrevent')), await runFixture(ownership.find((entry) => entry.disposition === 'mustAllow')))
  assert.equal(ownership[0].files['contract.md'], ownership[1].files['contract.md'])
  assert.equal(ownership[0].files['implementation-decision.md'], ownership[1].files['implementation-decision.md'])
  const lint = new Linter()
  const lintConfig = {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-restricted-imports': ['error', { paths: [{ name: './domain.mjs', message: 'UI delegates through the approved interaction owner.' }] }] },
  }
  for (const entry of ownership) {
    const result = lint.verify(entry.files['ui.mjs'], lintConfig)
    if (entry.disposition === 'mustPrevent') {
      assert.equal(result.some((message) => message.fatal), false)
      assert.ok(result.some((message) => message.ruleId === 'no-restricted-imports'))
    } else assert.equal(result.length, 0)
  }
})

test('O17 contextual evaluation distinguishes structural evidence from unrun model evaluation', async () => {
  const corpus = await load()
  const projected = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../evals/evals.json', import.meta.url), 'utf8'))
  const projectedCases = projected.evals.filter((entry) => entry.category === 'contextual-review-fixture')
  assert.equal(projectedCases.length, corpus.cases.length)
  assert.ok(projectedCases.every((entry) => entry.prompt.includes('Inspect the readable files')))
  assert.ok(projectedCases.every((entry) => !entry.prompt.includes('expectedFinding')))
  assert.equal(corpus.liveEvaluation.status, 'NOT_RUN')
  assert.match(corpus.liveEvaluation.reason, /No approved isolated/)
  assert.equal(corpus.liveEvaluation.costTime, 'unmeasured')
  assert.equal(corpus.liveEvaluation.attempted, 0)
  assert.equal(corpus.liveEvaluation.completed, 0)
  assert.equal(corpus.liveEvaluation.availableCases, 14)
  assert.deepEqual(Object.keys(corpus.liveEvaluation.metrics), ['actionableFindings', 'falsePositives', 'duplicates', 'missingEvidence', 'knownDefectMisses', 'filesRead', 'inputBytes', 'cost', 'time', 'tokens'])
  assert.equal(Object.values(corpus.liveEvaluation.metrics).every((value) => value === 'unmeasured'), true)
  for (const entry of corpus.cases) {
    const projectedCase = projectedCases.find((candidate) => candidate.name === entry.id)
    assert.deepEqual(projectedCase.files, [])
    for (const [path, content] of Object.entries(entry.files)) {
      assert.equal(projectedCase.prompt.includes(`File: ${path}`), true)
      assert.equal(projectedCase.prompt.includes(content), true)
    }
    assert.equal(projectedCase.prompt.includes(entry.expectedFinding), false)
  }
  assert.equal(corpus.cases.every((entry) => entry.origin === 'synthetic-fixture'), true)
  assert.equal(corpus.cases.every((entry) => entry.manualReviewOnly === true), true)
})
