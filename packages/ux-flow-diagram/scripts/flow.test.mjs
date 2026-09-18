import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- standalone plugin regression tests.
import test from 'node:test'
import { analyzeFlow } from '../skills/ux-flow-diagram/scripts/analyze.mjs'
import { normalizeFigma, normalizeFlow, validateFlow, walkActions } from '../skills/ux-flow-diagram/scripts/normalize.mjs'
import { compareFlows, renderMarkdown, renderMermaid } from '../skills/ux-flow-diagram/scripts/render.mjs'

const fixtureURL = new URL('../skills/ux-flow-diagram/evals/fixtures.json', import.meta.url)
const cases = JSON.parse(await readFile(fixtureURL, 'utf8'))
const flow = (name) => analyzeFlow(normalizeFigma(cases.find((item) => item.name === name).snapshot))

for (const item of cases) {
  test(`fixture: ${item.name}`, () => {
    const ir = analyzeFlow(normalizeFigma(item.snapshot))
    assert.equal(validateFlow(ir), true)
    for (const [key, value] of Object.entries(item.statistics || {})) assert.equal(ir.statistics[key], value, key)
    for (const type of item.issues || []) assert.ok(ir.issues.some((issue) => issue.type === type), type)
    for (const type of item.absentIssues || []) assert.ok(!ir.issues.some((issue) => issue.type === type), type)
    assert.ok(renderMarkdown(ir).includes('# UX Flow'))
    assert.ok(renderMermaid(ir).startsWith('flowchart LR'))
  })
}

test('sequential mutations and nested conditional actions retain order, branch paths and provenance', () => {
  const ir = flow('nested-actions')
  const actions = ir.interactions[0].actions
  assert.deepEqual(actions.map((action) => action.type), ['set-variable', 'conditional', 'set-variable-mode'])
  assert.equal(actions[1].branches[0].actions[0].type, 'conditional')
  assert.ok(ir.edges.filter((edge) => edge.category === 'product-navigation').every((edge) => edge.branchPath.length))
  assert.ok(ir.edges.every((edge) => edge.evidenceRefs.length && edge.actionPath))
  assert.ok(renderMermaid(ir).includes('conditional'))
})

test('exact mode refuses absent reactions and unavailable extraction is not an empty prototype', () => {
  const empty = cases.find((item) => item.name === 'no-prototype').snapshot
  assert.throws(() => normalizeFigma(empty, { mode: 'exact' }), /exact/i)
  const ir = normalizeFigma({ ...empty, coverage: { status: 'unavailable', limitations: ['Permission denied'] } })
  assert.equal(ir.coverage.status, 'unavailable')
  assert.ok(!ir.coverage.limitations.some((text) => text.includes('No prototype reactions')))
})

test('partial extraction never upgrades unresolved targets or unreachable screens into confirmed defects', () => {
  const snapshot = structuredClone(cases.find((item) => item.name === 'unreachable').snapshot)
  snapshot.coverage.status = 'partial'
  snapshot.coverage.limitations = ['Node budget reached']
  const ir = analyzeFlow(normalizeFigma(snapshot))
  assert.ok(!ir.issues.some((issue) => issue.type === 'unreachable'))
  assert.ok(ir.coverage.limitations.length)
})

test('all interactions survive display filters and labels cannot inject Mermaid syntax', () => {
  const ir = flow('component')
  ir.nodes[0].name = 'A " \' (x) [y] : / & <script>\nclick n0 "javascript:alert(1)"'
  const basic = renderMermaid(ir)
  const detail = renderMermaid(ir, { includeComponentInteractions: true })
  assert.ok(!basic.includes('component-state'))
  assert.ok(detail.includes('component-state'))
  assert.ok(!basic.includes('<script>'))
  assert.ok(!basic.includes('\nclick '))
  assert.ok(basic.includes('#34;'))
  assert.equal(ir.edges.length, 1)
})

test('normalization is repeatable and validation rejects dangling references, fabricated exact evidence and stale verification', () => {
  const input = cases[0].snapshot
  assert.deepEqual(normalizeFigma(input), normalizeFigma(input))
  const ir = flow('linear')
  for (const change of [
    (value) => { value.edges[0].to = 'absent' },
    (value) => { value.nodes.push(value.nodes[0]) },
    (value) => { value.edges[0].evidenceRefs = [] },
    (value) => { value.evidence.find((entry) => entry.id === value.edges[0].evidenceRefs[0]).level = 'inferred' },
    (value) => { value.interactions[0].actions[0].type = 'invented' },
    (value) => { value.source.revision = 'new'; value.verification = [{ path: ['A'], kind: 'test', status: 'verified', sourceRevision: 'old', evidenceRefs: [value.evidence[0].id] }] },
  ]) {
    const bad = structuredClone(ir)
    change(bad)
    assert.throws(() => validateFlow(bad))
  }
})

test('codebase and proposed IR remain independent of Figma and static evidence is not runtime verification', () => {
  const ir = flow('linear')
  ir.source = { type: 'codebase', revision: 'sha256:fixture' }
  for (const entry of ir.evidence) {
    entry.sourceKind = 'codebase'
    entry.locator = 'src/create.ts:10-20'
  }
  assert.equal(normalizeFlow(ir).verification.length, 0)
  const proposed = structuredClone(ir)
  proposed.source = { type: 'requirements' }
  proposed.view = 'proposed'
  proposed.mode = 'inferred'
  for (const entry of proposed.evidence) { entry.sourceKind = 'requirements'; entry.level = 'inferred' }
  for (const item of [...proposed.nodes, ...proposed.interactions, ...proposed.edges, ...proposed.flows]) item.evidence = 'inferred'
  for (const interaction of proposed.interactions) walkActions(interaction.actions, (action) => { action.evidence = 'inferred' })
  assert.equal(normalizeFlow(proposed).view, 'proposed')
  assert.ok(renderMarkdown(proposed).includes('Proposed'))
  assert.equal(compareFlows(ir, proposed).automaticMatch, false)
})

test('comparison reports source freshness and never mutates either graph', () => {
  const before = flow('linear')
  before.source.revision = 'before'
  const after = structuredClone(before)
  after.source.revision = 'after'
  after.nodes[0].name = 'Renamed'
  const saved = JSON.stringify(before)
  const diff = compareFlows(before, after)
  assert.ok(diff.changedNodes.includes('A'))
  assert.equal(diff.verificationReusable, false)
  assert.equal(JSON.stringify(before), saved)
})

test('authoritative actions reject missing, duplicate, reclassified and fabricated projections', () => {
  for (const mutate of [
    (ir) => { ir.edges = []; ir.flows.forEach((item) => { item.edgeIds = [] }) },
    (ir) => { ir.edges.push({ ...ir.edges[0], id: 'duplicate' }) },
    (ir) => { ir.edges[0].category = 'component-state' },
    (ir) => { ir.edges[0].branchPath = [{ actionPath: 'fake', index: 99, condition: 'invented' }] },
    (ir) => { ir.edges[0].resolution = 'missing' },
    (ir) => { ir.evidence.push({ id: 'guess', level: 'inferred', sourceKind: 'figma', locator: 'guess' }); ir.interactions[0].actions[0].evidence = 'inferred'; ir.interactions[0].actions[0].evidenceRefs = ['guess'] },
    (ir) => { ir.interactions[0].hotspot.text = 42 },
    (ir) => { ir.nodes[2].semantics = { terminal: 'false', evidence: 'inferred', evidenceRefs: ir.nodes[2].evidenceRefs } },
  ]) {
    const ir = flow('linear')
    mutate(ir)
    assert.throws(() => validateFlow(ir))
  }
})

test('internal overlay swaps are not escape paths, but a reachable close is', () => {
  const snapshot = structuredClone(cases.find((item) => item.name === 'linear').snapshot)
  snapshot.nodes.find((node) => node.id === 'h0').reactions[0].actions[0].navigation = 'OVERLAY'
  snapshot.nodes.find((node) => node.id === 'h1').reactions[0].actions[0].navigation = 'SWAP'
  snapshot.nodes.push({ id: 'h2', name: 'swap back', type: 'RECTANGLE', screenId: 'C', reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'SWAP', destinationId: 'B' }] }] })
  const trapped = analyzeFlow(normalizeFigma(snapshot))
  assert.ok(trapped.issues.some((issue) => issue.type === 'overlay-trap' && issue.affectedNodes.includes('B')))
  snapshot.nodes.at(-1).reactions[0].actions = [{ type: 'CLOSE' }]
  assert.ok(!analyzeFlow(normalizeFigma(snapshot)).issues.some((issue) => issue.type === 'overlay-trap'))
})

test('omitting a projected broken flag cannot erase a confirmed missing destination', () => {
  const ir = flow('broken')
  delete ir.edges[0].brokenDestination
  assert.throws(() => validateFlow(ir), /broken destination/)
})

test('comparison distinguishes unread extraction from deletions and respects page scope', () => {
  const before = flow('linear')
  const after = normalizeFigma({ ...cases[0].snapshot, nodes: [], startingPoints: [], coverage: { status: 'unavailable', limitations: ['No access'] } })
  const diff = compareFlows(before, after)
  assert.deepEqual(diff.removedNodes, [])
  assert.equal(diff.after.coverage.status, 'unavailable')
  assert.ok(diff.unconfirmedMissingNodes.length)
  before.source.pageId = 'one'
  after.source.pageId = 'two'
  assert.equal(compareFlows(before, after).automaticMatch, false)
})

test('CLI produces JSON, Markdown and Mermaid through an installed symlink and refuses overwrite', async () => {
  const { symlink, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'ux-flow-test-'))
  try {
    const snapshot = join(dir, 'snapshot.json')
    await writeFile(snapshot, JSON.stringify(cases[0].snapshot))
    const cli = new URL('../skills/ux-flow-diagram/scripts/cli.mjs', import.meta.url)
    const alias = join(dir, 'flow.mjs')
    await symlink(cli, alias)
    const out = join(dir, 'result')
    execFileSync(process.execPath, [alias, 'normalize', snapshot, out])
    assert.ok(JSON.parse(await readFile(join(out, 'flow.json'))).nodes.length)
    assert.ok((await readFile(join(out, 'flow.md'), 'utf8')).includes('# UX Flow'))
    assert.ok((await readFile(join(out, 'flow.mmd'), 'utf8')).includes('flowchart LR'))
    assert.throws(() => execFileSync(process.execPath, [alias, 'normalize', snapshot, out], { stdio: 'pipe' }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('request options are validated and CLI honors output selection without external writes', async () => {
  const { validateInput } = await import('../skills/ux-flow-diagram/scripts/input.mjs')
  for (const request of [{}, { source: 'figma' }, { source: 'ir', outputs: { figjam: 'yes' } }, { source: 'ir', options: { screenshots: 'sometimes' } }, { source: 'ir', analysis: { mode: 'guess' } }, { source: 'ir', scope: { nodeId: 5 } }, { source: 'codebase', figma: { url: 'https://figma.com/design/Test' } }]) assert.throws(() => validateInput(request))
  const { main } = await import('../skills/ux-flow-diagram/scripts/cli.mjs')
  const { writeFile, readdir } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'ux-flow-options-'))
  try {
    const input = join(dir, 'flow.json')
    const request = join(dir, 'request.json')
    await writeFile(input, JSON.stringify(flow('linear')))
    await writeFile(request, JSON.stringify({ source: 'ir', outputs: { markdown: false, mermaid: false, critique: false } }))
    await main(['render', input, join(dir, 'out'), '--request', request])
    assert.deepEqual(await readdir(join(dir, 'out')), ['flow.json'])
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'out', 'flow.json'))).issues, [])
    await writeFile(request, JSON.stringify({ source: 'ir', outputs: { figjam: true } }))
    await assert.rejects(main(['render', input, join(dir, 'external'), '--request', request]), /agent workflow/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
