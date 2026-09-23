import assert from 'node:assert/strict'
import test from 'node:test'

import { GAME_RULES } from '../../config/game-rules.ts'
import { createWorld } from '../ecs/create-world.ts'
import { stepWorld } from '../ecs/step-world.ts'
import type { World } from '../ecs/components.ts'

const DT = GAME_RULES.stepMs / 1000

function startedWorld(): World {
  const world = createWorld(GAME_RULES)
  world.commands.push({ type: 'start' })
  stepWorld(world, GAME_RULES, DT)
  return world
}

function movingId(world: World): number {
  const [id] = world.moving.keys()
  assert.ok(id !== undefined, 'a moving block exists')
  return id
}

function placeMovingAt(world: World, offset: number): void {
  const id = movingId(world)
  const pose = world.pose.get(id)
  assert.ok(pose)
  // Park the block, then zero its speed so the movement system leaves the offset intact.
  world.pose.set(id, { ...pose, x: offset })
  world.moving.set(id, { axis: 'x', dir: 1, speed: 0 })
  world.commands.push({ type: 'drop' })
  stepWorld(world, GAME_RULES, DT)
}

test('start spawns one moving block above the base', () => {
  const world = startedWorld()
  assert.equal(world.status, 'playing')
  assert.equal(world.moving.size, 1)
  assert.equal(world.pose.get(movingId(world))?.y, GAME_RULES.blockHeight)
})

test('drop before start is ignored', () => {
  const world = createWorld(GAME_RULES)
  world.commands.push({ type: 'drop' })
  stepWorld(world, GAME_RULES, DT)
  assert.equal(world.status, 'ready')
  assert.equal(world.score, 0)
})

test('perfect drop keeps full size, scores and spawns the next block in the same step', () => {
  const world = startedWorld()
  const first = movingId(world)
  placeMovingAt(world, GAME_RULES.perfectTolerance / 2)
  assert.equal(world.score, 1)
  assert.equal(world.combo, 1)
  assert.equal(world.size.get(first)?.w, GAME_RULES.baseSize)
  assert.equal(world.pose.get(first)?.x, 0)
  assert.equal(world.topId, first)
  assert.equal(world.moving.size, 1)
  assert.notEqual(movingId(world), first)
  assert.deepEqual(world.events.at(-1), { kind: 'placed', perfect: true })
})

test('offset drop trims the overhang into falling debris', () => {
  const world = startedWorld()
  const first = movingId(world)
  placeMovingAt(world, 1)
  assert.equal(world.size.get(first)?.w, GAME_RULES.baseSize - 1)
  assert.equal(world.pose.get(first)?.x, 0.5)
  assert.equal(world.combo, 0)
  const debris = [...world.falling.keys()]
  assert.equal(debris.length, 1)
  assert.equal(world.size.get(debris[0] ?? -1)?.w, 1)
  assert.equal(world.pose.get(debris[0] ?? -1)?.x, 2)
})

test('miss fails the run and the missed block falls', () => {
  const world = startedWorld()
  const first = movingId(world)
  placeMovingAt(world, GAME_RULES.baseSize + 0.1)
  assert.equal(world.status, 'failed')
  assert.equal(world.score, 0)
  assert.ok(world.falling.has(first))
  assert.equal(world.moving.size, 0)
  assert.deepEqual(world.events.at(-1), { kind: 'failed' })
})

test('two drops inside one step place exactly one block', () => {
  const world = startedWorld()
  world.commands.push({ type: 'drop' }, { type: 'drop' })
  const id = movingId(world)
  world.pose.set(id, { ...world.pose.get(id)!, x: 0 })
  stepWorld(world, GAME_RULES, DT)
  assert.equal(world.score, 1)
})

test('debris is removed below the floor', () => {
  const world = startedWorld()
  placeMovingAt(world, 1)
  for (let i = 0; i < 600 && world.falling.size > 0; i += 1) stepWorld(world, GAME_RULES, DT)
  assert.equal(world.falling.size, 0)
})
