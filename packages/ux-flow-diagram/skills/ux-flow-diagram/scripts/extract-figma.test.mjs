import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- standalone plugin regression tests.
import test from 'node:test'
import { buildExtractionCode, extractFigma } from './extract-figma.mjs'
import { normalizeFigma } from './normalize.mjs'
import { compareFlows } from './render.mjs'

function fixture() {
  const node = (id, type, parent) => {
    const item = { id, name: id, type, parent, children: [], reactions: [] }
    parent?.children.push(item)
    return item
  }
  const page = node('page', 'PAGE')
  const section = node('section', 'SECTION', page)
  const screen = node('screen', 'FRAME', section)
  const nested = node('nested', 'FRAME', screen)
  const hotspot = node('hotspot', 'RECTANGLE', nested)
  const other = node('other', 'FRAME', page)
  page.flowStartingPoints = [{ nodeId: screen.id, name: 'Main flow' }, { nodeId: other.id, name: 'Other flow' }]
  hotspot.reactions = [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'SET_VARIABLE', variableId: 'ready', variableValue: { type: 'BOOLEAN', value: true } }, { type: 'CONDITIONAL', conditionalBlocks: [{ condition: { value: 'ready' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'other' }] }] }] }]
  const lookup = new Map([page, section, screen, nested, hotspot, other].map((item) => [item.id, item]))
  let calls = 0
  const figma = { currentPage: page, fileKey: 'fixture', getNodeByIdAsync: async (id) => { calls += 1; return lookup.get(id) || null } }
  return { figma, page, screen, hotspot, lookup, get calls() { return calls } }
}

test('nested hotspots, sections, ordered actions and starts normalize end to end without writes', async () => {
  const data = fixture()
  const snapshot = await extractFigma(data.figma)
  assert.equal(snapshot.nodes.find((node) => node.id === 'hotspot').screenId, 'screen')
  assert.equal(snapshot.startingPoints.length, 2)
  assert.equal(snapshot.coverage.status, 'complete')
  const ir = normalizeFigma(snapshot)
  assert.equal(ir.interactions[0].from, 'screen')
  assert.deepEqual(ir.interactions[0].actions.map((action) => action.type), ['set-variable', 'conditional'])
  assert.equal(data.figma.currentPage, data.page)
  assert.equal(data.hotspot.reactions[0].actions.length, 2)
})

test('scoped starts and other-page nested destination retain real screen and page', async () => {
  const data = fixture()
  const page = { id: 'p2', name: 'Second', type: 'PAGE' }
  const frame = { id: 'f2', name: 'Destination', type: 'FRAME', parent: page }
  const child = { id: 'd2', name: 'Inner', type: 'FRAME', parent: frame }
  data.lookup.set('d2', child)
  data.hotspot.reactions[0].actions = [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'd2' }]
  const snapshot = await extractFigma(data.figma, { nodeId: 'screen' })
  assert.equal(snapshot.startingPoints.length, 1)
  assert.equal(snapshot.nodes.find((node) => node.id === 'd2').page, 'Second')
  assert.equal(snapshot.nodes.find((node) => node.id === 'f2').inScope, false)
  assert.equal(normalizeFigma(snapshot).edges[0].to, 'f2')
  assert.equal(normalizeFigma(snapshot).edges[0].resolution, 'out-of-scope')
})

test('disjoint extraction roots cannot be compared as additions and deletions', async () => {
  const { figma } = fixture()
  const before = normalizeFigma(await extractFigma(figma, { nodeId: 'screen' }))
  const after = normalizeFigma(await extractFigma(figma, { nodeId: 'other' }))
  assert.deepEqual(before.source.scope, { nodeId: 'screen' })
  assert.deepEqual(after.source.scope, { nodeId: 'other' })
  assert.equal(compareFlows(before, after).automaticMatch, false)
})

test('budgets stop traversal, serialization and destination lookups explicitly', async () => {
  const data = fixture()
  assert.equal((await extractFigma(data.figma, { maxNodes: 2 })).coverage.status, 'partial')
  const limited = await extractFigma(data.figma, { maxActions: 2 })
  assert.notEqual(limited.coverage.status, 'complete')
  assert.ok(limited.coverage.limitations.some((value) => /serialization budget/.test(value)))
  data.hotspot.reactions[0].actions = ['missing1', 'missing2'].map((destinationId) => ({ type: 'NODE', navigation: 'NAVIGATE', destinationId }))
  const before = data.calls
  const targets = await extractFigma(data.figma, { maxDestinations: 1 })
  assert.equal(data.calls - before, 1)
  assert.equal(Object.values(targets.resolutions).filter((value) => value === 'missing').length, 1)
  assert.equal(targets.coverage.status, 'partial')
})

test('unreadable reactions, missing capability and missing root never become an empty complete scan', async () => {
  const data = fixture()
  Object.defineProperty(data.hotspot, 'reactions', { get() { throw new Error('Access denied') } })
  assert.equal((await extractFigma(data.figma)).coverage.status, 'partial')
  const noCapability = { currentPage: { id: 'page', name: 'Page', type: 'PAGE', children: [], flowStartingPoints: [] } }
  assert.equal((await extractFigma(noCapability)).coverage.status, 'unavailable')
  assert.equal((await extractFigma(data.figma, { nodeId: 'missing' })).coverage.status, 'unavailable')
})

test('generated MCP code runs the same implementation and safely serializes options', async () => {
  const data = fixture()
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const direct = await extractFigma(data.figma, { nodeId: 'screen' })
  const generated = await new AsyncFunction('figma', buildExtractionCode({ nodeId: 'screen' }))(data.figma)
  assert.deepEqual(generated, direct)
  const invalid = await new AsyncFunction('figma', buildExtractionCode({ nodeId: '";throw new Error("injection");//' }))(data.figma)
  assert.equal(invalid.coverage.status, 'unavailable')
  assert.throws(() => buildExtractionCode({ maxNodes: Infinity }))
})
