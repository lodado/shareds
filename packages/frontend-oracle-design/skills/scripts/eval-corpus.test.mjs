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

/** The run ends at the Entry scope gate: it read common.md and nothing else. */
const endsAtGate = (fixture) => fixture.expected.loadedNodes.length === 1 && fixture.expected.loadedNodes[0] === 'common'

const expectedCategoryCounts = {
  'low-copy-css': 2,
  'submit-order-retry': 3,
  'visual-local-identity': 2,
  'policy-source': 2,
  'already-satisfied': 1,
  'boundary-pressure': 2,
  'scope-gate': 2,
}

function countBy(items, key) {
  const counts = Object.fromEntries(Object.keys(expectedCategoryCounts).map((category) => [category, 0]))
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1
  return counts
}

test('black-box corpus contains the smoke cases by category', async () => {
  const corpus = await readJson(corpusPath)

  assert.equal(corpus.version, 1)
  assert.equal(corpus.cases.length, 14)
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
    // a run that ends at the scope gate runs no verification, so it reports no label at all
    if (endsAtGate(fixture)) assert.deepEqual(fixture.expected.requiredLabels, [], fixture.id)
    else assert.ok(fixture.expected.requiredLabels.length > 0, `${fixture.id} requiredLabels`)
  }
})

test('work with no modelable behavior stops at the scope gate after common.md', async () => {
  const corpus = await readJson(corpusPath)
  const stops = corpus.cases.filter((fixture) => fixture.expected.status === 'OUT_OF_SCOPE')
  // copy and token (Low), local CSS, and the two visual-only redesigns
  assert.deepEqual(
    stops.map((fixture) => fixture.id),
    ['fod-bb-01', 'fod-bb-02', 'fod-bb-06', 'fod-bb-07', 'fod-bb-11', 'fod-bb-14'],
  )
  for (const fixture of stops) {
    assert.equal(fixture.expected.lane, 'oracle')
    assert.deepEqual(fixture.expected.loadedNodes, ['common'], `${fixture.id} stops before the stack`)
    assert.equal(fixture.expected.nodeExceptions, undefined, fixture.id)
    for (const ceremony of ['card-written', 'revision-lock', 'oracle-run-init', 'mandatory-stack-run']) {
      assert.ok(fixture.expected.forbiddenCeremony.includes(ceremony), `${fixture.id} forbids ${ceremony}`)
    }
  }
  // every Low case is a gate stop: Low has no stack-running path of its own
  for (const fixture of corpus.cases.filter((candidate) => candidate.expected.risk === 'Low')) {
    assert.equal(fixture.expected.status, 'OUT_OF_SCOPE', fixture.id)
  }
})

test('a case that passes the gate expects every node the graph loads on every invocation, and a completed Delivery its closure', async () => {
  const [corpus, graph] = await Promise.all([readJson(corpusPath), readJson(referenceGraphPath)])
  // derived from the graph, so a node made mandatory later fails here instead of drifting out of the corpus unnoticed
  const always = graph.nodes.filter((node) => /every invocation/.test(node.when)).map((node) => node.id)
  assert.ok(always.includes('mandatory-verification') && always.includes('bend-cross-verification'))
  assert.equal(always.includes('types-advanced-contracts'), false, 'type nodes follow the exposed type boundary')
  for (const fixture of corpus.cases.filter((candidate) => !endsAtGate(candidate))) {
    const loaded = new Set(fixture.expected.loadedNodes)
    const excepted = new Set((fixture.expected.nodeExceptions ?? []).map((entry) => entry.node))
    for (const id of [...always, 'adequacy']) {
      assert.ok(loaded.has(id) || excepted.has(id), `${fixture.id} neither expects nor excepts ${id}`)
    }
    // nothing a stop before the model stage may skip is excepted without a stop
    if (fixture.expected.status === 'REVIEW_VERIFIED') {
      for (const id of [...always, 'adequacy', 'discovery']) assert.ok(loaded.has(id), `${fixture.id} completes without ${id}`)
    }
  }
})

test('Oracle-lane cases require evidence labels that match their risk shape', async () => {
  const corpus = await readJson(corpusPath)
  const oracleCases = corpus.cases.filter((fixture) => fixture.expected.lane === 'oracle')

  assert.equal(oracleCases.length, 14)
  for (const fixture of oracleCases) {
    assert.ok(fixture.expected.loadedNodes.includes('common'), `${fixture.id} common`)
    if (endsAtGate(fixture)) continue
    assert.ok(fixture.expected.loadedNodes.includes('card-policy-sources'), `${fixture.id} policy sources`)
    assert.ok(fixture.expected.loadedNodes.includes('mandatory-verification'), `${fixture.id} mandatory verification`)
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
      fixture.category === 'submit-order-retry' || /duplicate submit|out-of-order|retry request/i.test(fixture.prompt),
  )
  assert.ok(asyncCases.length > 0)
  for (const fixture of asyncCases) {
    assert.ok(fixture.expected.loadedNodes.includes('types-authoring'), `${fixture.id} types authoring`)
    // the API-surface and advanced-contracts nodes follow an exposed type boundary, so they may be read but are never required
    const optional = new Set((fixture.expected.nodeExceptions ?? []).map((entry) => entry.node))
    assert.ok(optional.has('types-api-surface') && optional.has('types-advanced-contracts'), `${fixture.id} type boundary nodes`)
  }

  // visual-only work has no modelable behavior: it stops at the scope gate instead of waiting for a design confirmation
  const visualOnly = corpus.cases.find((fixture) => fixture.id === 'fod-bb-06')
  assert.equal(visualOnly.expected.status, 'OUT_OF_SCOPE')
  assert.equal(Object.hasOwn(visualOnly.expected, 'statuses'), false)
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
      // retro-metrics는 lock 이후 노드 — REVIEW_VERIFIED에서 run metrics를 남기는 run만 읽는다
      assert.equal(
        fixture.expected.loadedNodes.includes('card-retro-metrics'),
        fixture.expected.status === 'REVIEW_VERIFIED',
        `${fixture.id} retro metrics`,
      )
    }
  }
})

test('only a gate stop declares that its prompt must not auto-invoke the skill', async () => {
  const corpus = await readJson(corpusPath)
  for (const fixture of corpus.cases) {
    const stops = fixture.expected.status === 'OUT_OF_SCOPE'
    assert.equal(fixture.expected.autoInvoke === false, stops, `${fixture.id} autoInvoke must match the gate stop`)
    assert.equal(Object.hasOwn(fixture.expected, 'autoInvoke') && typeof fixture.expected.autoInvoke !== 'boolean', false, fixture.id)
  }
})

test('behavior whose domain Bend cannot represent ends at the gate as NEEDS_DECISION, not as a gate stop', async () => {
  const corpus = await readJson(corpusPath)
  const fixture = corpus.cases.find((candidate) => candidate.id === 'fod-bb-16')
  // the gate classifies it before the stack is read, so it neither loads the stack nor routes the work out
  assert.equal(fixture.expected.status, 'NEEDS_DECISION')
  assert.equal(endsAtGate(fixture), true)
  assert.equal(Object.hasOwn(fixture.expected, 'autoInvoke'), false)
  assert.ok(fixture.expected.forbiddenCeremony.includes('narrowed-requirement'))
})
