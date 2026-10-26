import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { next } from './next.mjs'
import { act, anchor, newRun, screen } from './test-helpers.mjs'

const home = () => screen('Home', ['Settings', 'Pay now'])

test('next as a fresh first screen', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const result = await next(runDir)
  assert.equal(result.current, 'S-001')
  assert.equal(result.done, false)
  assert.deepEqual(
    result.candidates.map((c) => c.label),
    ['Settings'],
  )
  assert.equal(result.recordedBlocked, 1)
  assert.deepEqual(result.budget, { used: 0, max: 60, remaining: 60 })
})

test('next as a blocked candidate seen twice', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await next(runDir)
  const again = await next(runDir)
  assert.equal(again.recordedBlocked, 0)
  const lines = (await readFile(join(runDir, 'gates.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.deepEqual(
    lines.map(({ gateId, decision, category, source }) => ({ gateId, decision, category, source })),
    [{ gateId: 'G-0001', decision: 'blocked', category: 'payment', source: 'preview' }],
  )
})

test('next as a run whose only open action is blocked', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, screen('Settings', []))
  const result = await next(runDir)
  assert.deepEqual({ done: result.done, reason: result.reason }, { done: true, reason: 'frontier-empty' })
})

test('next as a dead end with unexplored actions elsewhere', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Settings', 'Profile']))
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, screen('Settings', []))
  const result = await next(runDir)
  assert.deepEqual(
    { done: result.done, route: result.route, candidates: result.candidates, unreachable: result.unreachable },
    { done: false, route: null, candidates: [], unreachable: ['S-001'] },
  )
})

test('next as a route back through known transitions', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Settings', 'Profile']))
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, screen('Settings', []))
  await act(root, runDir, { action: 'back' }, screen('Home', ['Settings', 'Profile']))
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, screen('Settings', []))
  const result = await next(runDir)
  assert.equal(result.done, false)
  assert.equal(result.current, 'S-002')
  assert.deepEqual(
    result.route.steps.map((s) => s.action),
    ['back'],
  )
  assert.equal(result.route.to, 'S-001')
  assert.deepEqual((await next(runDir, { limit: 1 })).route.to, 'S-001')
})

test('next as a frontier that is empty', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Settings']))
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, screen('Settings', []))
  await act(root, runDir, { action: 'back' }, screen('Home', ['Settings']))
  const result = await next(runDir)
  assert.deepEqual({ done: result.done, reason: result.reason }, { done: true, reason: 'frontier-empty' })
})

test('next as a spent budget', async () => {
  const { root, runDir } = await newRun({ 'max-actions': '1' })
  await anchor(root, runDir, screen('Home', ['Settings', 'Profile']))
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, screen('Settings', []))
  const result = await next(runDir)
  assert.deepEqual(
    { done: result.done, reason: result.reason, remaining: result.budget.remaining },
    { done: true, reason: 'budget-spent', remaining: 0 },
  )
})

test('next as a screen at the depth limit', async () => {
  const { root, runDir } = await newRun({ 'max-depth': '1' })
  await anchor(root, runDir, screen('Home', ['Settings']))
  await act(
    root,
    runDir,
    { action: 'tap', label: 'Settings', id: 'btn-Settings' },
    screen('Settings', ['Notifications']),
  )
  const result = await next(runDir)
  assert.equal(result.candidates.length, 0, 'actions below the depth limit are not suggested')
})

test('next as a run with no first screen', async () => {
  const { runDir } = await newRun()
  await assert.rejects(next(runDir), /observe --anchor/)
})
