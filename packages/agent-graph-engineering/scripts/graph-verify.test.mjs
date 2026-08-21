import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  enforceRuntimeBounds,
  GraphValidationError,
  selectTransitions,
  TransitionError,
  validateGraph,
} from '../skills/agent-graph-engineering/scripts/graph-verify.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const script = join(packageDirectory, 'skills/agent-graph-engineering/scripts/graph-verify.mjs')

function graph() {
  return {
    id: 'sample',
    outcome: 'Ship a verified change.',
    stopCondition: 'The review passes.',
    entry: 'plan',
    terminals: ['complete', 'failed'],
    maxSteps: 12,
    context: ['request'],
    nodes: [
      {
        id: 'plan',
        kind: 'agent',
        owner: 'planner',
        task: 'Create a bounded implementation plan.',
        input: ['request'],
        output: ['status', 'plan'],
        writeScope: [],
        dispatch: 'one',
      },
      {
        id: 'implement',
        kind: 'agent',
        owner: 'executor',
        task: 'Implement the approved plan.',
        input: ['plan'],
        output: ['status', 'artifacts'],
        writeScope: ['packages/app/**'],
        retryLimit: 1,
        dispatch: 'one',
      },
      {
        id: 'review',
        kind: 'agent',
        owner: 'code-reviewer',
        task: 'Review the implementation evidence.',
        input: ['artifacts'],
        output: ['status', 'findings'],
        writeScope: [],
        dispatch: 'one',
      },
      { id: 'complete', kind: 'terminal', task: 'Finish successfully.', input: [], output: [], writeScope: [] },
      { id: 'failed', kind: 'terminal', task: 'Finish with failure.', input: [], output: [], writeScope: [] },
    ],
    edges: [
      { from: 'plan', to: 'implement', when: { field: 'status', equals: 'success' } },
      { from: 'plan', to: 'failed', when: { field: 'status', equals: 'failure' } },
      { from: 'implement', to: 'review', when: { field: 'status', equals: 'success' } },
      { from: 'implement', to: 'failed', when: { field: 'status', equals: 'failure' } },
      { from: 'review', to: 'complete', when: { field: 'status', equals: 'pass' } },
      { from: 'review', to: 'implement', when: { field: 'status', equals: 'changes' } },
      { from: 'review', to: 'failed', when: { field: 'status', equals: 'failure' } },
    ],
  }
}

test('validates a bounded graph and selects one structured transition', () => {
  const value = graph()

  assert.equal(validateGraph(value), value)
  assert.deepEqual(selectTransitions(value, 'review', { status: 'changes' }), ['implement'])
  assert.deepEqual(selectTransitions(value, 'complete', {}), [])
})

test('rejects dangling edges and conditions on undeclared output fields', () => {
  const value = graph()
  value.edges.push({ from: 'missing', to: 'complete', when: 'always' })
  value.edges.push({ from: 'plan', to: 'complete', when: { field: 'verdict', equals: 'pass' } })

  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError &&
      error.issues.some(({ code }) => code === 'EDGE_SOURCE_UNKNOWN') &&
      error.issues.some(({ code }) => code === 'EDGE_FIELD_UNDECLARED'),
  )
})

test('rejects unreachable nodes and nodes without a terminal path', () => {
  const value = graph()
  value.nodes.push({
    id: 'orphan',
    kind: 'tool',
    task: 'Remain unreachable for this validation case.',
    input: [],
    output: ['status'],
    writeScope: [],
  })
  value.edges = value.edges.filter(({ from }) => from !== 'implement')

  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError &&
      error.issues.some(({ code }) => code === 'NODE_UNREACHABLE') &&
      error.issues.some(({ code }) => code === 'TERMINAL_UNREACHABLE_FROM_NODE'),
  )
})

test('rejects ambiguous single dispatch and permits explicit fan-out', () => {
  const value = graph()
  value.edges.push({ from: 'plan', to: 'complete', when: { field: 'status', equals: 'success' } })

  assert.throws(
    () => selectTransitions(value, 'plan', { status: 'success' }),
    (error) => error instanceof TransitionError && error.code === 'AMBIGUOUS_TRANSITION',
  )

  value.nodes.find(({ id }) => id === 'plan').dispatch = 'all'
  assert.deepEqual(selectTransitions(value, 'plan', { status: 'success' }), ['implement', 'complete'])
})

test('rejects immediate fan-out agents with overlapping write scopes', () => {
  const value = graph()
  value.nodes.find(({ id }) => id === 'plan').dispatch = 'all'
  value.nodes.push({
    id: 'implement-child',
    kind: 'agent',
    owner: 'executor',
    task: 'Write to an overlapping child scope.',
    input: ['plan'],
    output: ['status'],
    writeScope: ['packages/app/auth/**'],
    dispatch: 'one',
  })
  value.edges.push({ from: 'plan', to: 'implement-child', when: { field: 'status', equals: 'success' } })
  value.edges.push({ from: 'implement-child', to: 'complete', when: 'always' })

  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError && error.issues.some(({ code }) => code === 'PARALLEL_WRITE_CONFLICT'),
  )
})

test('requires a positive global step bound', () => {
  const value = graph()
  value.maxSteps = 0

  assert.throws(
    () => validateGraph(value),
    (error) => error instanceof GraphValidationError && error.issues.some(({ code }) => code === 'MAX_STEPS_INVALID'),
  )
})

test('requires an executable task for every node', () => {
  const value = graph()
  delete value.nodes.find(({ id }) => id === 'review').task

  assert.throws(
    () => validateGraph(value),
    (error) => error instanceof GraphValidationError && error.issues.some(({ code }) => code === 'NODE_TASK_INVALID'),
  )
})

test('rejects write scopes outside the target repository', () => {
  const value = graph()
  value.nodes.find(({ id }) => id === 'implement').writeScope = ['../other-repo/**', '/tmp/output/**']

  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError &&
      error.issues.filter(({ code }) => code === 'NODE_WRITE_SCOPE_OUTSIDE_REPO').length === 2,
  )
})

test('rejects node inputs no upstream output or declared context provides', () => {
  const value = graph()
  value.nodes.find(({ id }) => id === 'review').input = ['artifacts', 'reviewPacket']

  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError &&
      error.issues.some(({ code, message }) => code === 'NODE_INPUT_UNSATISFIED' && message.includes('reviewPacket')),
  )

  value.context = ['request', 'reviewPacket']
  assert.equal(validateGraph(value), value)
})

test('detects overlapping write scopes through mid-path glob segments', () => {
  const value = graph()
  value.nodes.find(({ id }) => id === 'plan').dispatch = 'all'
  value.nodes.find(({ id }) => id === 'implement').writeScope = ['packages/*/auth/**']
  value.nodes.push({
    id: 'implement-sibling',
    kind: 'agent',
    owner: 'executor',
    task: 'Write to a concrete scope a glob sibling also covers.',
    input: ['plan'],
    output: ['status'],
    writeScope: ['packages/app/auth/tokens/**'],
    dispatch: 'one',
  })
  value.edges.push({ from: 'plan', to: 'implement-sibling', when: { field: 'status', equals: 'success' } })
  value.edges.push({ from: 'implement-sibling', to: 'complete', when: 'always' })

  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError && error.issues.some(({ code }) => code === 'PARALLEL_WRITE_CONFLICT'),
  )
})

test('accepts repo-relative write scope exclusions and keeps them out of overlap checks', () => {
  const value = graph()
  const implement = value.nodes.find(({ id }) => id === 'implement')
  implement.writeScope = ['**', '!.ai/agent-graphs/**']
  assert.equal(validateGraph(value), value)

  implement.writeScope = ['**', '!../outside/**']
  assert.throws(
    () => validateGraph(value),
    (error) =>
      error instanceof GraphValidationError &&
      error.issues.some(({ code }) => code === 'NODE_WRITE_SCOPE_OUTSIDE_REPO'),
  )
})

test('enforces maxSteps and join readiness from the append-only events ledger', () => {
  const value = graph()
  value.nodes.push(
    {
      id: 'gather',
      kind: 'join',
      join: 'all',
      task: 'Wait for review evidence before completing.',
      input: ['findings'],
      output: ['status'],
      writeScope: [],
    },
    {
      id: 'audit',
      kind: 'agent',
      owner: 'code-reviewer',
      task: 'Provide a second review sample.',
      input: ['artifacts'],
      output: ['status', 'findings'],
      writeScope: [],
    },
  )
  value.nodes.find(({ id }) => id === 'implement').dispatch = 'all'
  value.edges.push(
    { from: 'implement', to: 'audit', when: { field: 'status', equals: 'success' } },
    { from: 'review', to: 'gather', when: { field: 'status', equals: 'pass' } },
    { from: 'audit', to: 'gather', when: 'always' },
    { from: 'gather', to: 'complete', when: { field: 'status', equals: 'ready' } },
  )
  validateGraph(value)

  const completed = (...nodes) => nodes.map((node) => ({ type: 'node.completed', node, status: 'SUCCEEDED' }))

  assert.throws(
    () => enforceRuntimeBounds(value, 'gather', completed('review')),
    (error) => error instanceof TransitionError && error.code === 'JOIN_NOT_READY',
  )
  assert.equal(enforceRuntimeBounds(value, 'gather', completed('review', 'audit', 'gather')), undefined)
  assert.throws(
    () => enforceRuntimeBounds(value, 'plan', completed(...Array.from({ length: 12 }, () => 'plan'))),
    (error) => error instanceof TransitionError && error.code === 'MAX_STEPS_EXCEEDED',
  )
})

test('CLI verifies a graph and deterministically selects the next node', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-graph-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const graphPath = join(directory, 'graph.json')
  const outputPath = join(directory, 'output.json')
  await Promise.all([
    writeFile(graphPath, JSON.stringify(graph())),
    writeFile(outputPath, JSON.stringify({ status: 'success' })),
  ])

  const verified = spawnSync(process.execPath, [script, 'verify', '--graph', graphPath], { encoding: 'utf8' })
  const next = spawnSync(
    process.execPath,
    [script, 'next', '--graph', graphPath, '--node', 'plan', '--output', outputPath],
    { encoding: 'utf8' },
  )

  assert.equal(verified.status, 0, verified.stderr)
  assert.equal(verified.stdout, 'GRAPH_VALID sample\n')
  assert.equal(next.status, 0, next.stderr)
  assert.deepEqual(JSON.parse(next.stdout), { node: 'plan', next: ['implement'] })
})
