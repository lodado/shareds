import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderReferenceRoute, routeReferences } from './oracle-reference-route.mjs'

const GRAPH = JSON.parse(readFileSync(new URL('../references/reference-graph.json', import.meta.url), 'utf8'))
const SCRIPT = fileURLToPath(new URL('./oracle-reference-route.mjs', import.meta.url))
const UNKNOWN = { architectureBoundaryChange: 'unknown', backendBoundaryChange: 'unknown', performanceClaim: 'unknown' }
const FALSE = { architectureBoundaryChange: false, backendBoundaryChange: false, performanceClaim: false }

function node(id, extra = {}) {
  return { id, path: `references/${id}.md`, when: `${id} prose condition`, requires: [], ...extra }
}

function fixture() {
  return {
    nodes: [
      node('base'),
      node('review', { loader: 'reviewer', requires: ['base'] }),
      node('tool', { loader: 'script' }),
      node('selected', {
        requires: ['base', 'review', 'tool'],
        route: { at: ['scope-decision'], if: { eq: ['architectureBoundaryChange', true] } },
      }),
      node('excluded', { route: { at: ['scope-decision'], if: false } }),
      node('external', { loader: 'graph-tooling', route: { at: ['protocol-inspection'], if: true } }),
    ],
    bundles: [],
  }
}

test('reference routing as conservative three-valued selection to include unknown and exclude false', () => {
  const cases = [
    [{}, 'unknown'],
    [{ architectureBoundaryChange: 'unknown' }, 'unknown'],
    [{ architectureBoundaryChange: true }, 'matched'],
  ]
  for (const [facts, reason] of cases) {
    const result = routeReferences(fixture(), { point: 'scope-decision', facts })
    assert.equal(result.schemaVersion, 1)
    assert.equal(result.authority, 'advisory')
    assert.equal(result.coverage, 'partial')
    assert.equal(result.point, 'scope-decision')
    assert.deepEqual(result.facts, { ...UNKNOWN, ...facts })
    assert.deepEqual(result.agent, [
      { id: 'base', path: 'references/base.md', reason: 'dependency', requires: [] },
      { id: 'selected', path: 'references/selected.md', reason, requires: ['base', 'review', 'tool'] },
    ])
    assert.deepEqual(result.reviewer, [
      { id: 'review', path: 'references/review.md', reason: 'dependency', requires: ['base'] },
    ])
    assert.deepEqual(result.external, [{ id: 'tool', path: 'references/tool.md', reason: 'dependency', requires: [] }])
  }
  const excluded = routeReferences(fixture(), { point: 'scope-decision', facts: FALSE })
  assert.deepEqual([excluded.agent, excluded.reviewer, excluded.external], [[], [], []])
})

test('uncompiled conditions as explicit manual remainder to remain visible after dependency selection', () => {
  const result = routeReferences(fixture(), { point: 'scope-decision' })
  assert.deepEqual(result.manualConditions, {
    agent: [{ id: 'base', path: 'references/base.md', when: 'base prose condition', requires: [], loader: 'agent' }],
    reviewer: [
      {
        id: 'review',
        path: 'references/review.md',
        when: 'review prose condition',
        requires: ['base'],
        loader: 'reviewer',
      },
    ],
    external: [
      { id: 'tool', path: 'references/tool.md', when: 'tool prose condition', requires: [], loader: 'script' },
    ],
  })
})

test('manual includes and dependency edges as explicit reasons to override direct-route exclusion', () => {
  const graph = fixture()
  graph.nodes.find((entry) => entry.id === 'selected').requires.push('excluded')
  const result = routeReferences(graph, { point: 'scope-decision', facts: FALSE, include: ['selected'] })
  assert.deepEqual(
    result.agent.map(({ id, reason }) => [id, reason]),
    [
      ['base', 'dependency'],
      ['excluded', 'dependency'],
      ['selected', 'manual'],
    ],
  )
  const external = routeReferences(graph, { point: 'protocol-inspection', facts: FALSE })
  assert.deepEqual(external.external, [
    { id: 'external', path: 'references/external.md', reason: 'matched', requires: [] },
  ])
  const manual = routeReferences(graph, { point: 'protocol-inspection', include: ['external', 'external'] })
  assert.deepEqual(manual.external, [
    { id: 'external', path: 'references/external.md', reason: 'manual', requires: [] },
  ])
})

test('false equality predicates and explicit agent loaders to retain typed boolean semantics', () => {
  const graph = {
    nodes: [
      node('negative', { loader: 'agent', route: { at: ['scope-decision'], if: { eq: ['performanceClaim', false] } } }),
    ],
  }
  const cases = [
    [false, ['matched']],
    [true, []],
    ['unknown', ['unknown']],
  ]
  for (const [performanceClaim, reasons] of cases) {
    const result = routeReferences(graph, { point: 'scope-decision', facts: { performanceClaim } })
    assert.deepEqual(
      result.agent.map(({ reason }) => reason),
      reasons,
    )
  }
})

test('canonical reference graph as six compiled routes to choose the named decision points only', () => {
  const cases = [
    ['scope-decision', { ...FALSE, architectureBoundaryChange: true }, ['common', 'architecture-contract']],
    ['scope-decision', { ...FALSE, backendBoundaryChange: true }, ['backend']],
    ['scope-decision', { ...FALSE, performanceClaim: true }, ['performance']],
    ['model-authoring', FALSE, ['common', 'model-patterns']],
    ['package-authoring', FALSE, ['model-package-example']],
    ['protocol-inspection', FALSE, ['delivery-protocol']],
  ]
  for (const [point, facts, expected] of cases) {
    const result = routeReferences(GRAPH, { point, facts })
    assert.deepEqual(
      result.agent.map(({ id }) => id),
      expected,
    )
    assert.deepEqual([result.reviewer, result.external], [[], []])
  }
})

test('router inputs as a closed vocabulary to reject unknown points facts and includes', () => {
  for (const request of [null, undefined, [], { point: 'scope-decision', extra: true }]) {
    assert.throws(() => routeReferences(fixture(), request), TypeError)
  }
  for (const point of [null, undefined, '', 'unknown', 1])
    assert.throws(() => routeReferences(fixture(), { point }), TypeError)
  for (const facts of [
    null,
    [],
    true,
    { unknown: false },
    { architectureBoundaryChange: null },
    { backendBoundaryChange: 0 },
    { performanceClaim: 'true' },
  ]) {
    assert.throws(() => routeReferences(fixture(), { point: 'scope-decision', facts }), TypeError)
  }
  for (const include of [null, 'base', [null], ['missing']]) {
    assert.throws(() => routeReferences(fixture(), { point: 'scope-decision', include }), TypeError)
  }
})

test('graph validation as fail-closed routing to reject malformed and cyclic unused nodes', () => {
  for (const graph of [null, [], {}, { nodes: null }])
    assert.throws(() => routeReferences(graph, { point: 'scope-decision' }), TypeError)
  const mutations = [
    (graph) => {
      graph.nodes.push(graph.nodes[0])
    },
    (graph) => {
      graph.nodes[0].requires = ['missing']
    },
    (graph) => {
      graph.nodes[0].requires = ['base']
    },
    (graph) => {
      graph.nodes[0].requires = ['review']
    },
    (graph) => {
      graph.nodes[0].path = '../outside.md'
    },
    (graph) => {
      graph.nodes[0].path = '/outside.md'
    },
    (graph) => {
      graph.nodes[0].path = ''
    },
    (graph) => {
      graph.nodes[0].path = null
    },
    (graph) => {
      graph.nodes[0].path = 'references/./base.md'
    },
    (graph) => {
      graph.nodes[0].path = 'references/base.md?raw'
    },
    (graph) => {
      graph.nodes[0].path = 'references/base.md#section'
    },
    (graph) => {
      graph.nodes[0].path = 'references\\base.md'
    },
    (graph) => {
      graph.nodes[0].path = 'scripts/base.mjs'
    },
    (graph) => {
      graph.nodes[0].id = ''
    },
    (graph) => {
      graph.nodes[0].when = ''
    },
    (graph) => {
      graph.nodes[0].loader = 'unknown'
    },
    (graph) => {
      graph.nodes[0].loader = null
    },
    // A descriptor without value creates an own undefined property, unlike an omitted loader.
    (graph) => {
      Object.defineProperty(graph.nodes[0], 'loader', { enumerable: true })
    },
    (graph) => {
      graph.nodes[0].requires = 'review'
    },
    (graph) => {
      graph.nodes[0].route = { at: [], if: true }
    },
    (graph) => {
      graph.nodes[0].route = { at: ['unknown'], if: true }
    },
    (graph) => {
      graph.nodes[0].route = { at: ['scope-decision', 'scope-decision'], if: true }
    },
    (graph) => {
      graph.nodes[0].route = { at: ['scope-decision'], if: true, extra: true }
    },
    (graph) => {
      graph.nodes[0].route = { at: ['scope-decision'], if: { eq: ['unknown', true] } }
    },
    (graph) => {
      graph.nodes[0].route = { at: ['scope-decision'], if: { eq: ['performanceClaim', 'true'] } }
    },
    (graph) => {
      graph.nodes[0].route = { at: ['scope-decision'], if: 'globalThis.__routeExecuted = true' }
    },
  ]
  for (const mutate of mutations) {
    const graph = fixture()
    mutate(graph)
    assert.throws(() => routeReferences(graph, { point: 'package-authoring', facts: FALSE }), TypeError)
  }
  assert.equal(Object.hasOwn(globalThis, '__routeExecuted'), false)
})

test('router as read-only advice to preserve inputs and render ownership and reasons', () => {
  const graph = fixture()
  const options = { point: 'scope-decision', facts: { architectureBoundaryChange: true }, include: ['excluded'] }
  const before = structuredClone({ graph, options })
  const result = routeReferences(graph, options)
  assert.deepEqual({ graph, options }, before)
  const rendered = renderReferenceRoute(result)
  assert.match(rendered, /advisory/)
  assert.match(rendered, /partial/)
  for (const text of ['scope-decision', 'selected', 'matched', 'excluded', 'manual', 'reviewer', 'external'])
    assert.equal(rendered.includes(text), true, text)
})

test('router CLI as a read-only interface to honor JSON facts and repeated includes', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'oracle-reference-route-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const factsFile = join(root, 'facts.json')
  await writeFile(factsFile, JSON.stringify(FALSE))
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const run = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--point',
      'scope-decision',
      '--facts',
      factsFile,
      '--include',
      'backend',
      '--include',
      'performance',
      '--json',
    ],
    { cwd: root, env, encoding: 'utf8' },
  )
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(
    JSON.parse(run.stdout),
    routeReferences(GRAPH, { point: 'scope-decision', facts: FALSE, include: ['backend', 'performance'] }),
  )
  assert.deepEqual(await readdir(root), ['facts.json'])
  const textRun = spawnSync(process.execPath, [SCRIPT, '--point', 'protocol-inspection'], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  assert.equal(textRun.status, 0, textRun.stderr)
  assert.equal(textRun.stdout, renderReferenceRoute(routeReferences(GRAPH, { point: 'protocol-inspection' })))
  for (const args of [
    [],
    ['--point'],
    ['--point', 'unknown'],
    ['--point', 'scope-decision', '--unknown'],
    ['--point', 'scope-decision', '--include', 'unknown'],
  ]) {
    const denied = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, env, encoding: 'utf8' })
    assert.equal(denied.status, 1, denied.stderr)
  }
  assert.deepEqual(await readdir(root), ['facts.json'])
})
