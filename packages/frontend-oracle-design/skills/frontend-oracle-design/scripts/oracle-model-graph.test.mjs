import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { stableStringify } from './oracle-fs.mjs'
import { configurationGraph, enumerateSpace, minimalCover, toPlain, transitionCover } from './oracle-model.mjs'
import { analyzeConfigurations } from './oracle-quotient.mjs'

const list = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
const items = (linked) => {
  const result = []
  for (let cursor = linked; cursor.$ === 'Con'; cursor = cursor.tail) result.push(cursor.head)
  return result
}

// The pre-optimization eager definition is a differential control, not a second production path.
function eagerGraph(model, cap) {
  const allowed = (history) => [...new Map(items(model.next(list(history))).map((event) => [stableStringify(toPlain(event)), event])).values()]
  const nodes = []
  const seen = new Set()
  const visit = (node) => {
    const choices = allowed(node.raw)
    const key = stableStringify({ state: toPlain(node.state), allowed: choices.map(toPlain), ahead: choices.map((event) => allowed([...node.raw, event]).map(toPlain)) })
    if (!seen.has(key)) {
      seen.add(key)
      nodes.push({ ...node, key, observation: toPlain(model.observe(node.state)), allowed: choices, edges: [] })
    }
    return key
  }
  visit({ raw: [], trace: [], state: model.init(), observations: [] })
  let expanded = 0
  let pairs = 0
  for (; expanded < nodes.length && expanded < cap; expanded += 1) {
    const node = nodes[expanded]
    pairs += node.allowed.length
    for (const event of node.allowed) {
      const state = model.step(node.state, event)
      const observation = toPlain(model.observe(state))
      const child = { raw: [...node.raw, event], trace: [...node.trace, toPlain(event)], state, observations: [...node.observations, observation] }
      node.edges.push({ event: toPlain(event), observation, trace: child.trace, observations: child.observations, to: visit(child) })
    }
  }
  return { nodes: nodes.slice(0, expanded), expanded, pairs, capped: nodes.length > expanded ? nodes[expanded].trace.length - 1 : null }
}

function graphShape(graph) {
  const indices = new Map(graph.nodes.map((node, index) => [node.key, index]))
  return {
    ...graph,
    nodes: graph.nodes.map(({ key: _key, edges, ...node }) => ({
      ...node,
      edges: edges.map(({ to, ...edge }) => {
        if (!indices.has(to)) indices.set(to, indices.size)
        return { ...edge, to: indices.get(to) }
      }),
    })),
  }
}

test('configuration graph avoids lookahead when the state already distinguishes every candidate', () => {
  const choices = Array.from({ length: 32 }, (_, n) => ({ $: 'Pick', n: BigInt(n) }))
  let calls = 0
  const graph = configurationGraph({
    init: () => 0n,
    step: (state, event) => state * 32n + event.n + 1n,
    observe: (state) => state,
    next: () => { calls += 1; return list(choices) },
  }, 3)
  assert.equal(graph.expanded, 3)
  assert.equal(graph.pairs, 96)
  assert.equal(graph.capped, 0)
  // Root + each of 96 outgoing edges. The eager implementation makes 3,201 next calls.
  assert.equal(calls, 97)
})

test('configuration graph preserves eager topology, covers and analysis across collisions and caps', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const model = {
      init: () => 0n,
      step: (state, event) => (state * 3n + event.n + BigInt(seed)) % BigInt(1 + seed % 5),
      observe: (state) => state % 2n,
      next: (history) => {
        const past = items(history)
        const phase = (past.length + Number(past.at(-1)?.n ?? 0n) + seed) % 3
        const choices = Array.from({ length: 1 + phase }, (_, n) => ({ $: 'Pick', n: BigInt(n) }))
        if (seed % 2 === 0) choices.push(choices[0])
        if (seed % 3 === 0) choices.reverse()
        return list(choices)
      },
    }
    const space = enumerateSpace(model, { bound: 3 })
    for (const cap of [1, 7, 40]) {
      const expected = eagerGraph(model, cap)
      const actual = configurationGraph(model, cap)
      const label = `seed=${seed} cap=${cap}`
      assert.deepEqual(graphShape(actual), graphShape(expected), label)
      assert.deepEqual(transitionCover(model, space, { graph: actual }), transitionCover(model, space, { graph: expected }), label)
      assert.deepEqual(minimalCover(model, space, { graph: actual }), minimalCover(model, space, { graph: expected }), label)
      assert.deepEqual(analyzeConfigurations(actual), analyzeConfigurations(expected), label)
    }
  }
})
