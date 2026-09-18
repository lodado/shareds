import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { boundaryEvals } from '../evals/to-skill-creator-evals.mjs'

const skillDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFile(join(skillDirectory, relativePath), 'utf8')
const owners = {
  'assertion-integrity': 'references/delivery/red.md',
  'revision-integrity': 'references/card/confirmation-lock.md',
  'truthful-evidence': 'references/delivery/green-review.md',
  'verified-command': 'references/delivery/ledger.md',
  'authorized-scope': 'references/delivery/ledger.md',
  'independent-progress': 'references/lanes/low-fast-path.md',
}
const workflowStages = new Set([
  'ORACLE_READY',
  'VALID_RED',
  'IMPLEMENTED_GREEN',
  'REVIEW_VERIFIED',
  'writing tests',
  'production implementation',
  'self-feedback',
  'completion report',
  'user confirmation',
  'lock',
  'independent review',
  'Low disqualification',
  'scope carve-out',
  'Delivery capability discovery',
  'adjudication commands',
  'status query and resume',
])

function markdownAnchorExists(source, anchor) {
  const headings = source
    .split('\n')
    .filter((line) => /^#{1,6}[ \t]/.test(line))
    .map((line) =>
      line
        .replace(/^#+[ \t]+/, '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}_ -]/gu, '')
        .replace(/ /g, '-'),
    )
  const explicitAnchors = [...source.matchAll(/<a[ \t]+(?:id|name)=["']([^"']+)["']/gi)].map((match) => match[1])
  return headings.includes(anchor) || explicitAnchors.includes(anchor)
}

function fencedJson(source) {
  const blocks = []
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '```json') continue
    const jsonLines = []
    index += 1
    while (index < lines.length && lines[index].trim() !== '```') {
      jsonLines.push(lines[index])
      index += 1
    }
    try {
      blocks.push(JSON.parse(jsonLines.join('\n')))
    } catch {
      /* unrelated example */
    }
  }
  return blocks
}

function isRuleObject(candidate) {
  return (
    candidate &&
    typeof candidate.id === 'string' &&
    'revision' in candidate &&
    'status' in candidate &&
    'origin' in candidate &&
    'When' in candidate
  )
}

async function readRuleBlocks() {
  const blocks = []
  for (const owner of new Set(Object.values(owners))) {
    for (const candidate of fencedJson(await read(owner))) {
      if (isRuleObject(candidate)) blocks.push({ ...candidate, owner })
    }
  }
  return blocks
}

function assertRuleInventory(blocks) {
  assert.equal(blocks.length, Object.keys(owners).length, 'exactly six guardrail rule objects are registered')
  const ids = blocks.map(({ id }) => id)
  assert.equal(new Set(ids).size, ids.length, 'guardrail IDs are unique')
  assert.deepEqual(ids.sort(), Object.keys(owners).sort(), 'guardrail IDs are the registered six')
  for (const rule of blocks) assert.equal(rule.owner, owners[rule.id], `${rule.id} has the registered owner`)
}

test('execution guardrails are structural contract data, not activation', async () => {
  const rules = await readRuleBlocks()
  assertRuleInventory(rules)
  assert.deepEqual(rules.map(({ id }) => id).sort(), Object.keys(owners).sort())
  for (const rule of rules) {
    assert.equal(rule.revision, 1)
    assert.equal(rule.status, 'proposed')
    assert.equal(rule.origin, 'existing-contract')
    for (const field of ['When', 'DoNot', 'Unless', 'Instead']) {
      assert.equal(typeof rule[field], 'string')
      assert.ok(rule[field].trim())
    }
    assert.ok(Array.isArray(rule.ApplyAt) && rule.ApplyAt.length > 0)
    assert.ok(
      rule.ApplyAt.every((stage) => workflowStages.has(stage)),
      `${rule.id} has unknown ApplyAt stage`,
    )
    assert.ok(Array.isArray(rule.authorityRefs) && rule.authorityRefs.length > 0)
    assert.deepEqual(rule.evidenceRefs, [])
    assert.deepEqual(Object.keys(rule.regressionCases).sort(), ['mustAllow', 'mustPrevent'])
    assert.deepEqual(rule.regressionCases.mustPrevent, [`fod-sem-guard-${rule.id}-prevent`])
    assert.deepEqual(rule.regressionCases.mustAllow, [`fod-sem-guard-${rule.id}-allow`])
  }
})

test('authority references resolve to graph nodes and optional anchors', async () => {
  const [rules, graph] = await Promise.all([readRuleBlocks(), read('references/reference-graph.json').then(JSON.parse)])
  assertRuleInventory(rules)
  const graphPaths = new Set(graph.nodes.map((node) => node.path))
  for (const rule of rules) {
    assert.ok(rule.authorityRefs.some((reference) => reference.split('#', 1)[0] === rule.owner))
    for (const reference of rule.authorityRefs) {
      const [path, anchor] = reference.split('#')
      assert.ok(graphPaths.has(path), `${rule.id} authority path is not a graph node: ${path}`)
      if (anchor) {
        const source = await read(path)
        assert.equal(markdownAnchorExists(source, anchor), true, `${reference} anchor is not defined in Markdown`)
      }
    }
  }
})

test('rule inventory rejects duplicate, unknown, and misplaced rule objects', async () => {
  const rules = await readRuleBlocks()
  assert.throws(() => assertRuleInventory([...rules, { ...rules[0] }]))
  assert.throws(() =>
    assertRuleInventory(rules.map((rule, index) => (index === 0 ? { ...rule, id: 'unknown-rule' } : rule))),
  )
  assert.throws(() =>
    assertRuleInventory(rules.map((rule, index) => (index === 0 ? { ...rule, owner: rules[1].owner } : rule))),
  )
  assert.equal(markdownAnchorExists('```json\n{"authorityRefs":["missing-anchor"]}\n```', 'missing-anchor'), false)
  assert.equal(markdownAnchorExists('# Green Gate', 'green-gate'), true)
  assert.equal(markdownAnchorExists('# Green Gate', 'gate'), false)
  assert.equal(markdownAnchorExists('# Green Gate', 'g-r-e-e-n-g-a-t-e'), false)
})

test('actual-incident candidates require evidence, while seeds do not claim incidents', async () => {
  const rules = await readRuleBlocks()
  assertRuleInventory(rules)
  const hasEvidence = (rule) => rule.origin !== 'actual-incident' || rule.evidenceRefs.length > 0
  assert.equal(hasEvidence({ ...rules[0], origin: 'actual-incident', evidenceRefs: [] }), false)
  assert.equal(hasEvidence({ ...rules[0], origin: 'actual-incident', evidenceRefs: ['runs.jsonl#run-1'] }), true)
  assert.ok(rules.every((rule) => rule.origin === 'existing-contract' && rule.evidenceRefs.length === 0))
})

test('paired synthetic fixtures project through the existing boundary converter', async () => {
  const rules = await readRuleBlocks()
  assertRuleInventory(rules)
  const boundary = JSON.parse(await read('evals/boundary-cases.json'))
  const projected = boundaryEvals(boundary, 0)
  for (const rule of rules)
    for (const [disposition, suffix] of [
      ['mustPrevent', 'prevent'],
      ['mustAllow', 'allow'],
    ]) {
      const id = `fod-sem-guard-${rule.id}-${suffix}`
      const fixture = boundary.cases.find((entry) => entry.id === id)
      assert.ok(fixture, id)
      assert.equal(fixture.origin, 'synthetic-fixture')
      assert.equal(fixture.guardrailId, rule.id)
      assert.equal(fixture.disposition, disposition)
      assert.equal(fixture.manualReviewOnly, true)
      assert.ok(fixture.prompt && fixture.expected_output)
      assert.ok(fixture.assertions.length >= 2)
      assert.deepEqual(projected.find((entry) => entry.name === id).assertions, fixture.assertions)
    }
})

test('candidate seeds preserve graph ownership and non-activation boundaries', async () => {
  const [rules, graph, skill] = await Promise.all([
    readRuleBlocks(),
    read('references/reference-graph.json').then(JSON.parse),
    read('SKILL.md'),
  ])
  assertRuleInventory(rules)
  const graphPaths = new Set(graph.nodes.map((node) => node.path))
  assert.equal(
    rules.every((rule) => graphPaths.has(rule.owner)),
    true,
  )
  assert.match(skill, /reference-graph\.json/)
  assert.match(skill, /proposed|candidate/i)
  assert.doesNotMatch(skill, /guardrail delivery state machine/i)
})
