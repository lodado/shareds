import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

import {
  generatedBlockEnd,
  generatedBlockStart,
  isGeneratedBlockCurrent,
  renderGeneratedBlock,
  replaceGeneratedBlock,
} from './generate-workflow-docs.mjs'

const graph = {
  nodes: [{ id: 'one' }, { id: 'two' }, { id: 'three' }],
  edges: [{}, {}],
  fallback: [{}],
  terminals: [{}, {}],
}

test('renders workflow documentation counts from the graph', () => {
  const output = renderGeneratedBlock(graph)

  assert.match(output, /노드\n3개, 엣지 2개, fallback 1개, terminal 2개/)
  assert.match(output, /DEFINE.*LOCK.*PROVE.*BUILD.*REVIEW.*CERTIFY/s)
})

test('replaces only the marked generated block and detects stale content', () => {
  const rendered = renderGeneratedBlock(graph)
  const readme = `before\n${generatedBlockStart}\nstale\n${generatedBlockEnd}\nafter\n`
  const updated = replaceGeneratedBlock(readme, rendered)

  assert.equal(updated, `before\n${rendered}\nafter\n`)
  assert.equal(isGeneratedBlockCurrent(updated, graph), true)
  assert.equal(isGeneratedBlockCurrent(readme, graph), false)
})
