import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

async function read(relativePath) {
  return readFile(join(skillDirectory, relativePath), 'utf8')
}

test('lifecycle adaptation is an Oracle-only conditional reference node', async () => {
  const graph = JSON.parse(await read('references/reference-graph.json'))
  const node = graph.nodes.find((candidate) => candidate.id === 'lifecycle-adaptation')

  assert.ok(node, 'reference graph declares lifecycle-adaptation')
  assert.equal(node.path, 'references/lifecycle-adaptation.md')
  assert.deepEqual(node.requires, ['common', 'card-policy-sources'])
  assert.match(node.when, /Oracle/i)
  assert.match(node.when, /existing-system ownership|cross-boundary scope|single-card milestone grouping/i)

  const lowLane = graph.lanes.find((lane) => lane.id === 'low-fast-path')
  assert.deepEqual(lowLane.nodes, ['low-fast-path'])
  assert.equal(lowLane.nodes.includes('lifecycle-adaptation'), false)

  const byId = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]))
  const resolvedIds = (bundle) => {
    const ids = new Set()
    const visit = (id) => {
      const node = byId.get(id)
      assert.ok(node, `${bundle.id} references known node ${id}`)
      for (const dependency of node.requires) visit(dependency)
      ids.add(id)
    }
    for (const id of bundle.nodes) visit(id)
    return ids
  }
  for (const bundle of graph.bundles ?? []) {
    assert.equal(
      resolvedIds(bundle).has('lifecycle-adaptation'),
      false,
      `${bundle.id} must not load the conditional node universally`,
    )
  }
})

test('lifecycle eval corpus is exported as forward evals without becoming a runtime grader', async () => {
  const corpus = JSON.parse(await read('evals/blackbox-corpus.json'))
  const heldOut = JSON.parse(await read('evals/held-out.json'))
  const lifecycle = JSON.parse(await read('evals/lifecycle-cases.json'))
  const { toEvals } = await import('../evals/to-skill-creator-evals.mjs')
  const evals = toEvals(corpus, heldOut, lifecycle)
  const graph = JSON.parse(await read('references/reference-graph.json'))
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))

  assert.equal(lifecycle.cases.length, 6)
  assert.equal(new Set(lifecycle.cases.map(({ id }) => id)).size, lifecycle.cases.length)
  for (const entry of lifecycle.cases) {
    assert.ok(entry.expectedConstraints?.length, `${entry.id} expected constraints`)
    assert.ok(entry.forbiddenConstraints?.length, `${entry.id} forbidden constraints`)
    const loaded = new Set(entry.expected.loadedNodes)
    for (const id of loaded) {
      const node = nodes.get(id)
      assert.ok(node, `${entry.id} references declared node ${id}`)
      for (const dependency of node.requires) assert.ok(loaded.has(dependency), `${entry.id} includes ${id}'s dependency ${dependency}`)
    }
  }
  assert.equal(evals.evals.length, corpus.cases.length + heldOut.cases.length + lifecycle.cases.length)
  const forward = evals.evals.slice(corpus.cases.length + heldOut.cases.length)
  assert.deepEqual(forward.map(({ name }) => name), lifecycle.cases.map(({ id }) => id))
  for (const entry of forward) {
    assert.equal(entry.category, 'lifecycle-forward')
    assert.ok(entry.expected_output.includes('Forward lifecycle scenario'))
    assert.ok(entry.assertions.some((assertion) => assertion.includes('Expected constraints:')))
    assert.ok(entry.assertions.some((assertion) => assertion.includes('Forbidden constraints:')))
    assert.ok(entry.assertions.some((assertion) => assertion.includes('semantic reviewer')))
  }
  assert.equal(typeof forward[0].grader, 'undefined')
})
