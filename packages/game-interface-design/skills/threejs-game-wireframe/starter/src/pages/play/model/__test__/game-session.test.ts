import assert from 'node:assert/strict'
import test from 'node:test'

import { GAME_RULES } from '../../config/game-rules.ts'
import { createGameSession } from '../game-session.ts'
import type { GameSession } from '../game-session.ts'

const STEP = GAME_RULES.stepMs

function started(): GameSession {
  const session = createGameSession(GAME_RULES)
  session.dispatch({ type: 'start' })
  session.advance(STEP)
  return session
}

const movingX = (session: GameSession): number | undefined => session.renderFrame().find((b) => b.kind === 'moving')?.x

test('delta splitting does not change the simulated result', () => {
  const whole = started()
  const split = started()
  // Same 480 ms of wall time, every delta inside the catch-up limit.
  for (let i = 0; i < 6; i += 1) whole.advance(80)
  for (let i = 0; i < 48; i += 1) split.advance(10)
  const a = whole.renderFrame().find((b) => b.kind === 'moving')
  const b = split.renderFrame().find((b) => b.kind === 'moving')
  assert.ok(a && b)
  assert.equal(a.x.toFixed(9), b.x.toFixed(9))
})

test('zero, negative and non-finite deltas do nothing', () => {
  const session = started()
  const before = movingX(session)
  for (const delta of [0, -16, Number.NaN, Number.POSITIVE_INFINITY]) session.advance(delta)
  assert.equal(movingX(session), before)
})

test('a long stall is clamped to the catch-up limit', () => {
  const clamped = started()
  const stepped = started()
  clamped.advance(10_000)
  for (let i = 0; i < GAME_RULES.maxCatchUpSteps; i += 1) stepped.advance(STEP)
  assert.equal(movingX(clamped)?.toFixed(9), movingX(stepped)?.toFixed(9))
})

test('snapshot keeps its reference when nothing changed and replaces it on change', () => {
  const session = started()
  const first = session.getSnapshot()
  session.advance(STEP)
  assert.equal(session.getSnapshot(), first)
  session.pause('user')
  const paused = session.getSnapshot()
  assert.notEqual(paused, first)
  assert.equal(paused.paused, true)
  assert.equal(first.paused, false)
})

test('pause reasons are independent: user resume does not resume a hidden tab', () => {
  const session = started()
  session.pause('hidden')
  session.pause('user')
  session.resume('user')
  assert.equal(session.getSnapshot().paused, true)
  const before = movingX(session)
  session.advance(200)
  assert.equal(movingX(session), before)
  session.resume('hidden')
  assert.equal(session.getSnapshot().paused, false)
})

test('input while paused is discarded, not replayed after resume', () => {
  const session = started()
  session.pause('user')
  session.dispatch({ type: 'drop' })
  session.resume('user')
  session.advance(STEP)
  assert.equal(session.getSnapshot().score, 0)
  assert.equal(session.getSnapshot().status, 'playing')
})

test('input tagged with a previous run is ignored after restart', () => {
  const session = started()
  const oldRun = session.getSnapshot().runId
  session.dispatch({ type: 'restart' })
  assert.equal(session.getSnapshot().runId, oldRun + 1)
  assert.equal(session.getSnapshot().status, 'ready')
  session.dispatch({ type: 'start', runId: oldRun })
  session.advance(STEP)
  assert.equal(session.getSnapshot().status, 'ready')
})

test('restart discards the old world, events and queued input', () => {
  const session = started()
  session.dispatch({ type: 'drop' })
  session.advance(STEP)
  assert.equal(session.getSnapshot().status, 'failed')
  session.dispatch({ type: 'restart' })
  const snapshot = session.getSnapshot()
  assert.deepEqual(
    { ...snapshot, runId: 0 },
    { runId: 0, status: 'ready', score: 0, combo: 0, paused: false, userPaused: false, lastEvent: null },
  )
  assert.equal(session.renderFrame().filter((b) => b.kind !== 'placed').length, 0)
})

test('two sessions do not share world state', () => {
  const a = started()
  const b = createGameSession(GAME_RULES)
  a.dispatch({ type: 'drop' })
  a.advance(STEP)
  assert.equal(a.getSnapshot().status, 'failed')
  assert.equal(b.getSnapshot().status, 'ready')
  assert.equal(b.renderFrame().length, 1)
})

test('subscribers are notified on change and not after unsubscribe or dispose', () => {
  const session = started()
  let calls = 0
  const unsubscribe = session.subscribe(() => {
    calls += 1
  })
  session.pause('user')
  assert.equal(calls, 1)
  unsubscribe()
  session.resume('user')
  assert.equal(calls, 1)
  session.subscribe(() => {
    calls += 1
  })
  session.dispose()
  session.dispose()
  session.pause('user')
  session.dispatch({ type: 'restart' })
  assert.equal(calls, 1)
})

test('render interpolation stays between the previous and current pose', () => {
  const session = started()
  session.advance(STEP)
  const settled = movingX(session)
  session.advance(STEP / 2)
  const mid = movingX(session)
  session.advance(STEP / 2)
  const next = movingX(session)
  assert.ok(settled !== undefined && mid !== undefined && next !== undefined)
  assert.ok(mid >= Math.min(settled, next) && mid <= Math.max(settled, next))
})

test('the first delta after resume spans the pause and is not simulated', () => {
  const session = started()
  session.advance(STEP / 2)
  session.pause('hidden')
  session.resume('hidden')
  const before = movingX(session)
  session.advance(1000)
  assert.equal(movingX(session), before)
  // Rendering lags one step behind simulation, so two steps are needed to see movement.
  session.advance(STEP * 2)
  assert.notEqual(movingX(session), before)
})

test('restart after a resume does not swallow the new run first step', () => {
  const session = started()
  session.pause('hidden')
  session.resume('hidden')
  session.dispatch({ type: 'restart' })
  session.dispatch({ type: 'start' })
  session.advance(STEP)
  assert.equal(session.getSnapshot().status, 'playing')
})

test('a system pause is not something the user can resume', () => {
  const session = started()
  session.pause('context-lost')
  assert.deepEqual([session.getSnapshot().paused, session.getSnapshot().userPaused], [true, false])
  session.pause('user')
  assert.equal(session.getSnapshot().userPaused, true)
  session.resume('user')
  assert.deepEqual([session.getSnapshot().paused, session.getSnapshot().userPaused], [true, false])
  session.resume('context-lost')
  assert.equal(session.getSnapshot().paused, false)
})
