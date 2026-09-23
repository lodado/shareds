import type { GameRules } from '../../config/game-rules.ts'
import type { Entity, Falling, Moving, Pose, Size, World } from './components.ts'

// ponytail: Map-per-component world; swap to Miniplex or bitECS when queries or entity counts grow.
export function createWorld(rules: GameRules): World {
  const world: World = {
    nextId: 1,
    pose: new Map(),
    size: new Map(),
    tint: new Map(),
    moving: new Map(),
    placed: new Set(),
    falling: new Map(),
    commands: [],
    events: [],
    status: 'ready',
    topId: null,
    score: 0,
    combo: 0,
  }
  const base = spawnBlock(world, { x: 0, y: 0, z: 0 }, { w: rules.baseSize, h: rules.blockHeight, d: rules.baseSize }, 0)
  world.placed.add(base)
  world.topId = base
  return world
}

export function spawnBlock(world: World, pose: Pose, size: Size, tint: number): Entity {
  const id = world.nextId++
  world.pose.set(id, pose)
  world.size.set(id, size)
  world.tint.set(id, tint)
  return id
}

export function addMoving(world: World, id: Entity, moving: Moving): void {
  world.moving.set(id, moving)
}

export function addFalling(world: World, id: Entity, falling: Falling): void {
  world.falling.set(id, falling)
}

export function despawn(world: World, id: Entity): void {
  world.pose.delete(id)
  world.size.delete(id)
  world.tint.delete(id)
  world.moving.delete(id)
  world.placed.delete(id)
  world.falling.delete(id)
}
