import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const corpusPath = join(skillDirectory, 'evals/blackbox-corpus.json')
const metricsPath = join(skillDirectory, 'evals/metrics-schema.json')
const referenceGraphPath = join(skillDirectory, 'references/reference-graph.json')

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

const expectedCategoryCounts = {
  'low-copy-css': 2,
  'submit-order-retry': 3,
  'visual-local-identity': 2,
  'policy-source': 2,
  'already-satisfied': 1,
}

function countBy(items, key) {
  const counts = Object.fromEntries(Object.keys(expectedCategoryCounts).map((category) => [category, 0]))
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1
  return counts
}

test('black-box corpus contains the agreed ten smoke cases by category', async () => {
  const corpus = await readJson(corpusPath)

  assert.equal(corpus.version, 1)
  assert.equal(corpus.cases.length, 10)
  assert.deepEqual(countBy(corpus.cases, 'category'), expectedCategoryCounts)
})

test('black-box corpus gives every case a mechanically gradable expectation', async () => {
  const corpus = await readJson(corpusPath)

  for (const fixture of corpus.cases) {
    assert.match(fixture.id, /^fod-bb-\d{2}$/)
    assert.equal(typeof fixture.prompt, 'string')
    assert.notEqual(fixture.prompt.trim(), '')
    assert.ok(['Low', 'Medium', 'High'].includes(fixture.expected.risk), `${fixture.id} risk`)
    assert.ok(['low-fast-path', 'oracle'].includes(fixture.expected.lane), `${fixture.id} lane`)
    assert.equal(typeof fixture.expected.status, 'string', `${fixture.id} status`)
    assert.ok(fixture.expected.loadedNodes.length > 0, `${fixture.id} loadedNodes`)
    assert.ok(fixture.expected.forbiddenCeremony.length > 0, `${fixture.id} forbiddenCeremony`)
    assert.ok(fixture.expected.requiredLabels.length > 0, `${fixture.id} requiredLabels`)
  }
})

test('low fast-path cases forbid Oracle ceremony and load only the lane node', async () => {
  const corpus = await readJson(corpusPath)
  const lowCases = corpus.cases.filter((fixture) => fixture.expected.lane === 'low-fast-path')

  assert.equal(lowCases.length, 2)
  for (const fixture of lowCases) {
    assert.deepEqual(fixture.expected.loadedNodes, ['low-fast-path'])
    assert.ok(fixture.expected.forbiddenCeremony.includes('oracle-card'))
    assert.ok(fixture.expected.forbiddenCeremony.includes('revision-lock'))
    assert.ok(fixture.expected.forbiddenCeremony.includes('run-ledger'))
  }
})

test('Oracle-lane cases require evidence labels that match their risk shape', async () => {
  const corpus = await readJson(corpusPath)
  const oracleCases = corpus.cases.filter((fixture) => fixture.expected.lane === 'oracle')

  assert.equal(oracleCases.length, 8)
  for (const fixture of oracleCases) {
    assert.ok(fixture.expected.loadedNodes.includes('common'), `${fixture.id} common`)
    assert.ok(fixture.expected.loadedNodes.includes('card-policy-sources'), `${fixture.id} policy sources`)
    if (fixture.expected.status !== 'NEEDS_DECISION') {
      assert.ok(fixture.expected.requiredLabels.includes('card-lint'), `${fixture.id} card lint`)
    }
  }
  assert.ok(
    oracleCases
      .filter((fixture) => fixture.category === 'submit-order-retry')
      .every((fixture) => fixture.expected.requiredLabels.includes('valid-red')),
  )
  assert.ok(
    oracleCases
      .filter((fixture) => fixture.category === 'policy-source')
      .every((fixture) => fixture.expected.requiredLabels.includes('source-registry-fk')),
  )
})

test('metrics schema captures routing, invention, review, cost, runtime and errors', async () => {
  const schema = await readJson(metricsPath)

  assert.deepEqual(schema.required, [
    'caseId',
    'risk',
    'lane',
    'status',
    'loadedNodes',
    'ceremony',
    'labels',
    'policyInvention',
    'falseReviewVerified',
    'toolCalls',
    'tokens',
    'runtimeMs',
    'errors',
  ])
  assert.equal(schema.hostedEvalDependency, false)
  assert.equal(schema.properties.routingAccuracy.type, 'number')
  assert.equal(schema.properties.routingAccuracy.minimum, 0)
  assert.equal(schema.properties.routingAccuracy.maximum, 1)
  assert.equal(schema.properties.policyInvention.type, 'boolean')
  assert.equal(schema.properties.falseReviewVerified.type, 'boolean')
  assert.equal(schema.properties.loadedNodes.items.type, 'string')
  assert.equal(schema.properties.ceremony.items.type, 'string')
  assert.equal(schema.properties.labels.items.type, 'string')
  assert.equal(schema.properties.errors.items.type, 'string')
})

test('policy-source cases stop before card lint and lock ceremony', async () => {
  const corpus = await readJson(corpusPath)
  const policyCases = corpus.cases.filter((fixture) => fixture.category === 'policy-source')

  assert.equal(policyCases.length, 2)
  for (const fixture of policyCases) {
    assert.equal(fixture.expected.status, 'NEEDS_DECISION')
    assert.ok(
      !fixture.expected.loadedNodes.includes('card-confirmation-lock'),
      `${fixture.id} should not reach lock docs`,
    )
    assert.ok(
      !fixture.expected.requiredLabels.includes('card-lint'),
      `${fixture.id} should not lint an unconfirmed card`,
    )
    assert.ok(fixture.expected.forbiddenCeremony.includes('revision-lock'))
  }
})

test('every expected loaded node is a canonical reference-graph node', async () => {
  const [corpus, graph] = await Promise.all([readJson(corpusPath), readJson(referenceGraphPath)])
  const nodeIds = new Set(graph.nodes.map((node) => node.id))

  for (const fixture of corpus.cases) {
    for (const nodeId of fixture.expected.loadedNodes) {
      assert.ok(nodeIds.has(nodeId), `${fixture.id} references unknown node ${nodeId}`)
    }
  }
})

test('already-satisfied case uses the explicit graph route into implementation verification', async () => {
  const corpus = await readJson(corpusPath)
  const fixture = corpus.cases.find((candidate) => candidate.category === 'already-satisfied')

  assert.equal(fixture.expected.status, 'REVIEW_VERIFIED')
  assert.equal(fixture.expected.route, 'valid-red:ALREADY_SATISFIED→implement-green')
  assert.ok(fixture.expected.forbiddenCeremony.includes('forced-production-edit'))
  assert.ok(fixture.expected.requiredLabels.includes('review'))
})

test('O13: eval fails on errors duplicates malformed JSONL and missing graph closure', async () => {
  const [corpus, graph] = await Promise.all([readJson(corpusPath), readJson(referenceGraphPath)])
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const caseIds = corpus.cases.map((fixture) => fixture.id)

  assert.equal(new Set(caseIds).size, caseIds.length, 'corpus case IDs must be unique')

  for (const fixture of corpus.cases) {
    const loaded = new Set(fixture.expected.loadedNodes)
    const pending = [...loaded]
    while (pending.length) {
      const nodeId = pending.pop()
      const node = byId.get(nodeId)
      assert.ok(node, `${fixture.id} references unknown node ${nodeId}`)
      for (const required of node.requires) {
        assert.ok(loaded.has(required), `${fixture.id} omits ${required}, required by ${nodeId}`)
        pending.push(required)
      }
    }
  }

  const asyncCases = corpus.cases.filter(
    (fixture) =>
      fixture.category === 'submit-order-retry' ||
      /duplicate submit|out-of-order|retry request/i.test(fixture.prompt),
  )
  assert.ok(asyncCases.length > 0)
  for (const fixture of asyncCases) {
    assert.ok(fixture.expected.loadedNodes.includes('types-authoring'), `${fixture.id} types authoring`)
    assert.ok(fixture.expected.loadedNodes.includes('types-api-surface'), `${fixture.id} types API surface`)
  }

  const visualConfirmation = corpus.cases.find((fixture) => fixture.id === 'fod-bb-06')
  assert.equal(visualConfirmation.expected.status, 'NEEDS_DECISION')
  assert.equal(Object.hasOwn(visualConfirmation.expected, 'statuses'), false)
})

// A lane bundle is the canonical node closure the workflow reads together, so a corpus case that
// enters a lane must expect every node of that lane. frontend-lane has no such trigger node — it is
// gated on an architecture boundary the prompt may not touch — so it stays out of this table.
const laneTriggers = [
  { trigger: 'card-format', bundle: 'card-lane' },
  { trigger: 'types-state-ladder', bundle: 'types-lane' },
  { trigger: 'delivery-ledger', bundle: 'delivery-lane' },
]

test('corpus expectations carry the whole lane bundle unless the case declares an exception', async () => {
  const [corpus, graph] = await Promise.all([readJson(corpusPath), readJson(referenceGraphPath)])
  const bundleNodes = new Map(graph.bundles.map((bundle) => [bundle.id, bundle.nodes]))

  for (const fixture of corpus.cases) {
    const loaded = new Set(fixture.expected.loadedNodes)
    const exceptions = fixture.expected.nodeExceptions ?? []
    const excepted = new Set(exceptions.map((entry) => entry.node))

    for (const entry of exceptions) {
      assert.equal(typeof entry.node, 'string', `${fixture.id} exception node`)
      assert.ok(entry.reason?.trim(), `${fixture.id} exception for ${entry.node} needs a reason`)
      assert.ok(!loaded.has(entry.node), `${fixture.id} excepts ${entry.node} while also loading it`)
    }

    for (const { trigger, bundle } of laneTriggers) {
      if (!loaded.has(trigger)) continue
      for (const nodeId of bundleNodes.get(bundle)) {
        assert.ok(
          loaded.has(nodeId) || excepted.has(nodeId),
          `${fixture.id} enters ${bundle} via ${trigger} but omits ${nodeId} without an exception`,
        )
      }
    }
  }
})

test('an exception may not cover a node the current workflow reads unconditionally in every lane', async () => {
  const corpus = await readJson(corpusPath)
  const reachesTheDraft = corpus.cases.filter((fixture) => fixture.expected.loadedNodes.includes('card-format'))

  assert.ok(reachesTheDraft.length > 0)
  for (const fixture of reachesTheDraft) {
    const excepted = new Set((fixture.expected.nodeExceptions ?? []).map((entry) => entry.node))
    if (excepted.has('card-interaction-sweep')) {
      assert.equal(fixture.expected.status, 'NEEDS_DECISION', `${fixture.id} may skip the sweep only when it stops`)
    } else {
      assert.ok(fixture.expected.loadedNodes.includes('card-case-space'), `${fixture.id} case space`)
      assert.ok(fixture.expected.loadedNodes.includes('card-retro-metrics'), `${fixture.id} retro metrics`)
    }
  }
})
