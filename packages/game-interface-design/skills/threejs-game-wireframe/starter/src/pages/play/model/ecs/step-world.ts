import type { GameRules } from '../../config/game-rules.ts'
import type { Axis, Entity, World } from './components.ts'
import { addFalling, addMoving, despawn, spawnBlock } from './create-world.ts'
import { extentOf, overlapAlong, withCoord, withExtent } from './spatial-components.ts'

/**
 * The single place that fixes system order. `__docs__/architecture.md` mirrors this list.
 * 1 commands → 2 movement → 3 drop resolution (structural change, score, failure) → 4 spawn → 5 debris.
 */
export function stepWorld(world: World, rules: GameRules, dt: number): void {
  const drop = consumeCommands(world, rules)
  moveSystem(world, rules, dt)
  if (drop) resolveDropSystem(world, rules)
  spawnSystem(world, rules)
  fallingSystem(world, rules, dt)
}

function consumeCommands(world: World, rules: GameRules): boolean {
  const commands = world.commands
  world.commands = []
  let drop = false
  for (const command of commands) {
    if (command.type === 'start' && world.status === 'ready') {
      world.status = 'playing'
      spawnSystem(world, rules)
    }
    // Several taps inside one fixed step still drop one block.
    if (command.type === 'drop' && world.status === 'playing') drop = true
  }
  return drop
}

function moveSystem(world: World, rules: GameRules, dt: number): void {
  for (const [id, moving] of world.moving) {
    const pose = world.pose.get(id)
    if (!pose) continue
    let next = pose[moving.axis] + moving.dir * moving.speed * dt
    if (Math.abs(next) > rules.travel) {
      next = Math.sign(next) * rules.travel * 2 - next
      moving.dir = moving.dir === 1 ? -1 : 1
    }
    world.pose.set(id, withCoord(pose, moving.axis, next))
  }
}

function resolveDropSystem(world: World, rules: GameRules): void {
  const [id, moving] = world.moving.entries().next().value ?? []
  const pose = id === undefined ? undefined : world.pose.get(id)
  const size = id === undefined ? undefined : world.size.get(id)
  const below = world.topId === null ? undefined : world.pose.get(world.topId)
  if (id === undefined || !moving || !pose || !size || !below) return
  world.moving.delete(id)
  const axis = moving.axis
  const extent = extentOf(size, axis)
  const overlap = overlapAlong(pose[axis], below[axis], extent)

  if (overlap.kept <= 0) {
    addFalling(world, id, { vy: 0 })
    world.status = 'failed'
    world.combo = 0
    world.events.push({ kind: 'failed' })
    return
  }
  const perfect = overlap.cut <= rules.perfectTolerance
  if (perfect) {
    world.pose.set(id, withCoord(pose, axis, below[axis]))
  } else {
    world.pose.set(id, withCoord(pose, axis, overlap.keptCenter))
    world.size.set(id, withExtent(size, axis, overlap.kept))
    spawnDebris(world, id, axis, overlap.cutCenter, overlap.cut)
  }
  world.placed.add(id)
  world.topId = id
  world.score += 1
  world.combo = perfect ? world.combo + 1 : 0
  world.events.push({ kind: 'placed', perfect })
}

function spawnDebris(world: World, source: Entity, axis: Axis, center: number, cut: number): void {
  const pose = world.pose.get(source)
  const size = world.size.get(source)
  if (!pose || !size) return
  const debris = spawnBlock(world, withCoord(pose, axis, center), withExtent(size, axis, cut), world.tint.get(source) ?? 0)
  addFalling(world, debris, { vy: 0 })
}

function spawnSystem(world: World, rules: GameRules): void {
  if (world.status !== 'playing' || world.moving.size > 0 || world.topId === null) return
  const below = world.pose.get(world.topId)
  const size = world.size.get(world.topId)
  if (!below || !size) return
  const axis: Axis = world.score % 2 === 0 ? 'x' : 'z'
  const pose = withCoord({ ...below, y: below.y + rules.blockHeight }, axis, -rules.travel)
  const id = spawnBlock(world, pose, size, world.score + 1)
  addMoving(world, id, { axis, dir: 1, speed: rules.startSpeed + world.score * rules.speedPerBlock })
}

function fallingSystem(world: World, rules: GameRules, dt: number): void {
  for (const [id, falling] of world.falling) {
    const pose = world.pose.get(id)
    if (!pose) continue
    falling.vy -= rules.debrisGravity * dt
    const y = pose.y + falling.vy * dt
    if (y < rules.debrisFloor) despawn(world, id)
    else world.pose.set(id, { ...pose, y })
  }
}
