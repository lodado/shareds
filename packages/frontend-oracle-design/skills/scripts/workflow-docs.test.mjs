import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

import {
  generatedBlockEnd,
  generatedBlockStart,
  isGeneratedBlockCurrent,
  referenceBlockEnd,
  referenceBlockStart,
  renderGeneratedBlock,
  renderReferenceBlock,
  replaceGeneratedBlock,
  replaceReferenceBlock,
  updateWorkflowDocs,
} from './generate-workflow-docs.mjs'

const graph = {
  nodes: [{ id: 'one' }, { id: 'two' }, { id: 'three' }],
  edges: [{}, {}],
  fallback: [{}],
  terminals: [{}, {}],
}

const referenceGraph = {
  entry: 'common',
  lanes: [
    { id: 'low-fast-path', when: 'risk=Low', nodes: ['low-fast-path'], exclusive: true, escalation: 'escalate' },
    { id: 'oracle', when: 'medium or high', entry: 'common' },
  ],
  nodes: [
    { id: 'low-fast-path', requires: [] },
    { id: 'common', requires: [] },
    { id: 'card-format', requires: ['common', 'bva'] },
    { id: 'bva', requires: [] },
    { id: 'standalone', requires: [] },
  ],
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

test('renders the reference loading diagram from declared lanes and requires edges', () => {
  const output = renderReferenceBlock(referenceGraph)

  // lane 분기와 승격 경로는 lanes 선언에서 나온다
  assert.match(output, /RISK -->\|"risk=Low"\| low_fast_path/)
  assert.match(output, /low_fast_path -\.->\|"escalate"\| common/)

  // 엣지는 requires 그대로다 — 손으로 그린 엣지를 발명하지 않는다
  assert.match(output, /^ {2}common --> card_format$/m)
  assert.match(output, /^ {2}bva --> card_format$/m)
  assert.doesNotMatch(output, /common --> bva/)

  // requires 대상이 되는 노드도 라벨을 얻는다
  assert.match(output, /^ {2}card_format\["card-format"\]$/m)

  // 어디에도 연결되지 않은 노드는 독립 노드 상자로 모인다
  assert.match(output, /IND\["standalone/)
  assert.doesNotMatch(output, /--> standalone/)
})

test('replaces the reference block independently of the workflow block', () => {
  const rendered = renderReferenceBlock(referenceGraph)
  const readme = `head\n${referenceBlockStart}\nstale\n${referenceBlockEnd}\ntail\n`

  assert.equal(replaceReferenceBlock(readme, rendered), `head\n${rendered}\ntail\n`)
  assert.throws(() => replaceReferenceBlock('no markers', rendered), /missing the reference docs/)
})

test('keeps the published README regenerated from both source graphs', async () => {
  assert.equal(
    await updateWorkflowDocs({ check: true }),
    true,
    'README generated blocks are stale — run workflow-docs:generate',
  )
})
