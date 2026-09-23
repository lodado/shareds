import type { GameRules } from '../config/game-rules.ts'
import type { Entity, GameStatus, Pose, World } from './ecs/components.ts'
import { createWorld } from './ecs/create-world.ts'
import { stepWorld } from './ecs/step-world.ts'
import { createFixedStepDriver } from './runtime/fixed-step-driver.ts'

export type PauseReason = 'user' | 'hidden' | 'context-lost'

export type SessionCommand =
  | { type: 'start'; runId?: number }
  | { type: 'drop'; runId?: number }
  | { type: 'restart' }

export interface HudSnapshot {
  readonly runId: number
  readonly status: GameStatus
  readonly score: number
  readonly combo: number
  readonly paused: boolean
  /** Only a user pause can be resumed from the HUD; hidden or context-lost pauses clear themselves. */
  readonly userPaused: boolean
  /** Increments per rule event so the HUD can replay a flash for equal consecutive kinds. */
  readonly lastEvent: { readonly kind: 'placed' | 'perfect' | 'failed'; readonly seq: number } | null
}

export interface RenderBlock {
  readonly id: Entity
  readonly kind: 'placed' | 'moving' | 'falling'
  readonly x: number
  readonly y: number
  readonly z: number
  readonly w: number
  readonly h: number
  readonly d: number
  readonly tint: number
}

export interface GameSession {
  dispatch: (command: SessionCommand) => void
  advance: (elapsedMs: number) => void
  pause: (reason: PauseReason) => void
  resume: (reason: PauseReason) => void
  getSnapshot: () => HudSnapshot
  subscribe: (listener: () => void) => () => void
  renderFrame: () => RenderBlock[]
  dispose: () => void
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export function createGameSession(rules: GameRules): GameSession {
  let world: World = createWorld(rules)
  let runId = 1
  let eventSeq = 0
  let lastEvent: HudSnapshot['lastEvent'] = null
  // Poses are replaced, never mutated, so a shallow Map copy is a complete previous frame.
  let previousPoses = new Map<Entity, Pose>(world.pose)
  const driver = createFixedStepDriver(rules.stepMs, rules.maxCatchUpSteps)
  const pauseReasons = new Set<PauseReason>()
  const listeners = new Set<() => void>()
  // The first wall delta after a resume spans the pause (rAF stops in hidden tabs); it is not play time.
  let discardNextDelta = false
  let disposed = false
  let snapshot = readSnapshot()

  function readSnapshot(): HudSnapshot {
    return {
      runId,
      status: world.status,
      score: world.score,
      combo: world.combo,
      paused: pauseReasons.size > 0,
      userPaused: pauseReasons.has('user'),
      lastEvent,
    }
  }

  function publish(): void {
    const next = readSnapshot()
    const same =
      next.runId === snapshot.runId &&
      next.status === snapshot.status &&
      next.score === snapshot.score &&
      next.combo === snapshot.combo &&
      next.paused === snapshot.paused &&
      next.userPaused === snapshot.userPaused &&
      next.lastEvent === snapshot.lastEvent
    if (same) return
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  function drainEvents(): void {
    for (const event of world.events) {
      eventSeq += 1
      const kind = event.kind === 'placed' && event.perfect ? 'perfect' : event.kind
      lastEvent = { kind, seq: eventSeq }
    }
    world.events = []
  }

  function restart(): void {
    runId += 1
    world = createWorld(rules)
    previousPoses = new Map(world.pose)
    lastEvent = null
    discardNextDelta = false
    driver.reset()
    publish()
  }

  return {
    dispatch(command) {
      if (disposed) return
      if (command.type === 'restart') {
        restart()
        return
      }
      // Input from an earlier run, or while paused, must not act on the current run later.
      if (command.runId !== undefined && command.runId !== runId) return
      if (pauseReasons.size > 0) return
      world.commands.push({ type: command.type })
    },
    advance(elapsedMs) {
      if (disposed || pauseReasons.size > 0) return
      if (discardNextDelta) {
        discardNextDelta = false
        return
      }
      const steps = driver.advance(elapsedMs)
      for (let i = 0; i < steps; i += 1) {
        previousPoses = new Map(world.pose)
        stepWorld(world, rules, rules.stepMs / 1000)
        drainEvents()
      }
      if (steps > 0) publish()
    },
    pause(reason) {
      if (disposed || pauseReasons.has(reason)) return
      pauseReasons.add(reason)
      publish()
    },
    resume(reason) {
      if (disposed || !pauseReasons.delete(reason)) return
      if (pauseReasons.size === 0) {
        driver.reset()
        discardNextDelta = true
      }
      publish()
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    renderFrame() {
      const alpha = driver.alpha()
      const blocks: RenderBlock[] = []
      for (const [id, pose] of world.pose) {
        const size = world.size.get(id)
        if (!size) continue
        const from = previousPoses.get(id) ?? pose
        const kind = world.moving.has(id) ? 'moving' : world.falling.has(id) ? 'falling' : 'placed'
        blocks.push({
          id,
          kind,
          x: lerp(from.x, pose.x, alpha),
          y: lerp(from.y, pose.y, alpha),
          z: lerp(from.z, pose.z, alpha),
          ...size,
          tint: world.tint.get(id) ?? 0,
        })
      }
      return blocks
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
