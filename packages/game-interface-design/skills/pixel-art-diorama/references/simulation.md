# Simulation

The scene only reads it. Everything here is pure TypeScript with no three.js, so a whole match runs
in a unit test without a browser.

## Shape

- A fixed 30 Hz step, independent of the frame rate; real time maps to match time by a speed factor
  (worked example: 6, 12 or 20 real minutes all map to 2,400 match seconds).
- A seeded RNG (mulberry32): the same seed plays the same match, which is what makes the scenario
  test and the screenshots reproducible.
- `window.__yard`-style debug hook: `simulate(seconds)` (stops at the end), `snapshot()`, `info()`.
  Headless checks drive the match through it instead of waiting in real time.

## Coroutines for scripted sequences

Walk-outs, warm-ups, kick-offs, goal celebrations, half-time and the handshake line are generator
functions. A script yields a number (wait seconds; 0 = next tick), a predicate (resume on the first
later tick it is true) or nothing (next tick). The scheduler runs every script one segment per tick;
scripts started during a tick wait for the next one. Put a timeout on every `until`, or a predicate
that never comes true freezes a sequence for good.

Illustration only (the real scripts are in the app's `director.ts`):

```ts
function* celebrate(scorer) {
  yield* walkTo(scorer, cornerFlag) // A* path, then follow it
  yield wait(1.5)
  yield until(() => teammatesArrived())
  crowd.cheer()
  photographer.flash()
}
```

```ts
// src/shared/lib/coroutine.ts
/**
 * What a script may yield:
 * - a number: wait that many seconds (0 = next tick),
 * - a predicate: resume on the first later tick where it returns true,
 * - nothing: resume on the next tick.
 */
export type Instruction = number | (() => boolean) | undefined | void
export type Script = Generator<Instruction, void, void>

export const wait = (seconds: number): Instruction => seconds
export const until = (predicate: () => boolean): Instruction => predicate

export interface Task {
  readonly done: boolean
  cancel(): void
}

interface Entry {
  script: Script
  started: boolean
  waitLeft: number
  predicate: (() => boolean) | null
  done: boolean
}

export class Scheduler {
  private entries: Entry[] = []

  get size(): number {
    return this.entries.length
  }

  /** Queues the script; its first segment runs on the next tick. */
  start(script: Script): Task {
    const entry: Entry = {
      script,
      started: false,
      waitLeft: 0,
      predicate: null,
      done: false,
    }
    this.entries.push(entry)
    return {
      get done() {
        return entry.done
      },
      cancel: () => {
        if (entry.done) return
        entry.done = true
        entry.script.return()
        this.entries = this.entries.filter((e) => e !== entry)
      },
    }
  }

  tick(dt: number): void {
    // Snapshot: scripts started during this tick wait for the next one.
    for (const entry of [...this.entries]) {
      if (entry.done) continue
      if (entry.started) {
        if (entry.predicate) {
          if (!entry.predicate()) continue
          entry.predicate = null
        } else {
          entry.waitLeft -= dt
          if (entry.waitLeft > 1e-9) continue
        }
      }
      entry.started = true
      const result = entry.script.next()
      if (result.done) {
        entry.done = true
        continue
      }
      const ins = result.value
      if (typeof ins === 'function') {
        entry.predicate = ins
      } else {
        entry.waitLeft = typeof ins === 'number' ? ins : 0
      }
    }
    this.entries = this.entries.filter((e) => !e.done)
  }

  /** Cancels every running script. */
  clear(): void {
    for (const entry of this.entries) {
      entry.done = true
      entry.script.return()
    }
    this.entries = []
  }
}
```

## Grid A\*

A 0.5 m grid over the yard with buildings, bleachers and the cage as walls; agents walk from the school
door through the cage gate to the benches. `start == goal` returns `[start]`, a walled-off goal returns
`null`.

```ts
// src/shared/lib/astar.ts
import type { Vec2 } from './vec2'

export interface NavGrid {
  cols: number
  rows: number
  cell: number
  originX: number
  originZ: number
  /** 1 = blocked, row-major (row * cols + col). */
  blocked: Uint8Array
}

export interface NavBounds {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  cell: number
}

export function createNavGrid({ minX, minZ, maxX, maxZ, cell }: NavBounds): NavGrid {
  const cols = Math.ceil((maxX - minX) / cell)
  const rows = Math.ceil((maxZ - minZ) / cell)
  return {
    cols,
    rows,
    cell,
    originX: minX,
    originZ: minZ,
    blocked: new Uint8Array(cols * rows),
  }
}

function fillRect(grid: NavGrid, minX: number, minZ: number, maxX: number, maxZ: number, value: 0 | 1) {
  const c0 = Math.max(0, Math.floor((minX - grid.originX) / grid.cell + 1e-9))
  const r0 = Math.max(0, Math.floor((minZ - grid.originZ) / grid.cell + 1e-9))
  const c1 = Math.min(grid.cols, Math.ceil((maxX - grid.originX) / grid.cell - 1e-9))
  const r1 = Math.min(grid.rows, Math.ceil((maxZ - grid.originZ) / grid.cell - 1e-9))
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) grid.blocked[r * grid.cols + c] = value
}

/** Blocks every cell overlapping [minX, maxX) × [minZ, maxZ). */
export const blockRect = (g: NavGrid, minX: number, minZ: number, maxX: number, maxZ: number) =>
  fillRect(g, minX, minZ, maxX, maxZ, 1)
export const openRect = (g: NavGrid, minX: number, minZ: number, maxX: number, maxZ: number) =>
  fillRect(g, minX, minZ, maxX, maxZ, 0)

function cellOf(g: NavGrid, p: Vec2): number {
  const c = Math.floor((p.x - g.originX) / g.cell)
  const r = Math.floor((p.z - g.originZ) / g.cell)
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1
  return r * g.cols + c
}

export function isBlocked(g: NavGrid, p: Vec2): boolean {
  const i = cellOf(g, p)
  return i < 0 || g.blocked[i] === 1
}

const centre = (g: NavGrid, i: number): Vec2 => ({
  x: g.originX + ((i % g.cols) + 0.5) * g.cell,
  z: g.originZ + (Math.floor(i / g.cols) + 0.5) * g.cell,
})

/** Binary min-heap over (priority, cell). */
class Heap {
  private items: number[] = []
  private prio: number[] = []
  get size() {
    return this.items.length
  }
  push(item: number, p: number) {
    const { items, prio } = this
    items.push(item)
    prio.push(p)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (prio[parent]! <= prio[i]!) break
      ;[items[i], items[parent]] = [items[parent]!, items[i]!]
      ;[prio[i], prio[parent]] = [prio[parent]!, prio[i]!]
      i = parent
    }
  }
  pop(): number {
    const { items, prio } = this
    const top = items[0]!
    const lastI = items.pop()!
    const lastP = prio.pop()!
    if (items.length > 0) {
      items[0] = lastI
      prio[0] = lastP
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && prio[l]! < prio[m]!) m = l
        if (r < items.length && prio[r]! < prio[m]!) m = r
        if (m === i) break
        ;[items[i], items[m]] = [items[m]!, items[i]!]
        ;[prio[i], prio[m]] = [prio[m]!, prio[i]!]
        i = m
      }
    }
    return top
  }
}

/**
 * A* over the grid with 8 neighbours, no corner cutting and an octile heuristic.
 * Returns [start, ...cell centres, goal], [start] when start equals goal, or null
 * when either end is off the grid or blocked, or no route exists.
 */
export function findPath(g: NavGrid, start: Vec2, goal: Vec2): Vec2[] | null {
  if (start.x === goal.x && start.z === goal.z) return [{ ...start }]
  const s = cellOf(g, start)
  const t = cellOf(g, goal)
  if (s < 0 || t < 0 || g.blocked[s] === 1 || g.blocked[t] === 1) return null
  if (s === t) return [{ ...start }, { ...goal }]

  const n = g.cols * g.rows
  const gScore = new Float64Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const tc = t % g.cols
  const tr = Math.floor(t / g.cols)
  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - tc)
    const dz = Math.abs(Math.floor(i / g.cols) - tr)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  const heap = new Heap()
  gScore[s] = 0
  heap.push(s, h(s))

  while (heap.size > 0) {
    const cur = heap.pop()
    if (cur === t) break
    if (closed[cur]) continue
    closed[cur] = 1
    const cc = cur % g.cols
    const cr = Math.floor(cur / g.cols)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        const nc = cc + dx
        const nr = cr + dz
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue
        const ni = nr * g.cols + nc
        if (g.blocked[ni] === 1 || closed[ni]) continue
        if (dx !== 0 && dz !== 0) {
          // no corner cutting: both orthogonal neighbours must be open
          if (g.blocked[cr * g.cols + nc] === 1 || g.blocked[nr * g.cols + cc] === 1) continue
        }
        const step = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1
        const cand = gScore[cur]! + step
        if (cand < gScore[ni]!) {
          gScore[ni] = cand
          from[ni] = cur
          heap.push(ni, cand + h(ni))
        }
      }
    }
  }
  if (from[t] === -1) return null

  const cells: number[] = []
  for (let i = from[t]!; i !== s && i !== -1; i = from[i]!) cells.push(i)
  cells.reverse()
  return [{ ...start }, ...cells.map((i) => centre(g, i)), { ...goal }]
}

export function pathLength(path: readonly Vec2[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z)
  }
  return total
}
```

## Ball motion in closed form

Rolling: `dv/dt = −(a + k·v)` with `a` the surface's rolling deceleration and `k` the air drag, so
distance and time between two speeds have closed forms; the inverse ("what launch speed arrives
`d` metres away still rolling at `vEnd`") is a bisection over that distance. Lobs: a projectile with
linear drag; bisection finds the vertical speed for the requested apex, then the landing time, and
the horizontal speed follows. Agents aim with these, so switching the surface (parquet rolls
farthest, turf shortest; asphalt bounces highest) changes how hard they kick without new AI code.

```ts
// src/entities/ball/model/roll.ts
import { AIR_DRAG, type BallSurfacePhysics } from './surfaces'

/*
 * Pure rolling: dv/dt = -(a + k·v), a = rolling decel, k = air drag.
 *   v(t)  = (v0 + a/k)·e^(-k t) - a/k
 *   x(v)  = (v0 - v)/k - (a/k²)·ln((a + k v0)/(a + k v))   (distance from v0 down to v)
 *   t(v)  = ln((a + k v0)/(a + k v)) / k
 */

const K = AIR_DRAG

export function distanceBetweenSpeeds(v0: number, v1: number, s: BallSurfacePhysics): number {
  if (v0 <= v1) return 0
  const a = s.rollDecel
  return (v0 - v1) / K - (a / (K * K)) * Math.log((a + K * v0) / (a + K * v1))
}

export function timeBetweenSpeeds(v0: number, v1: number, s: BallSurfacePhysics): number {
  if (v0 <= v1) return 0
  const a = s.rollDecel
  return Math.log((a + K * v0) / (a + K * v1)) / K
}

/** Distance a ball rolling at v0 covers before it stops. */
export const rollDistance = (v0: number, s: BallSurfacePhysics): number =>
  v0 <= 0 ? 0 : distanceBetweenSpeeds(v0, 0, s)

/** Speed left after rolling `d` metres from v0 (0 if it stops short). */
export function rollSpeedAfter(v0: number, d: number, s: BallSurfacePhysics): number {
  if (d <= 0) return v0
  if (rollDistance(v0, s) <= d) return 0
  let lo = 0
  let hi = v0
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (distanceBetweenSpeeds(v0, mid, s) > d) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Launch speed that arrives `d` metres away still rolling at `vEnd`. */
export function rollSpeedFor(d: number, vEnd: number, s: BallSurfacePhysics): number {
  if (d <= 0) return vEnd
  let lo = vEnd
  let hi = vEnd + 80
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (distanceBetweenSpeeds(mid, vEnd, s) < d) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
```

```ts
// src/entities/ball/model/lob.ts
import { BALL_RADIUS, GRAVITY } from '../../../shared/config'
import type { Vec3 } from './physics'
import { AIR_DRAG } from './surfaces'

/*
 * Projectile with linear drag k:
 *   x(t)  = vx0 (1 - e^(-kt)) / k
 *   y(t)  = y0 + (vy0 + g/k)(1 - e^(-kt)) / k - g t / k
 *   apex at t* = ln(1 + k vy0 / g) / k
 */

const K = AIR_DRAG
const G = GRAVITY

function heightAt(y0: number, vy0: number, t: number) {
  return y0 + ((vy0 + G / K) * (1 - Math.exp(-K * t))) / K - (G * t) / K
}

const apexTime = (vy0: number) => Math.log(1 + (K * vy0) / G) / K

export interface Lob {
  velocity: Vec3
  flightTime: number
  apexY: number
}

/**
 * Launch velocity that peaks `clearance` metres above the higher of the two ends
 * and comes down on `to` at `targetY` (ball centre height, default: on the ground).
 */
export function solveLob(from: Vec3, to: { x: number; z: number }, clearance: number, targetY = BALL_RADIUS): Lob {
  const apexY = Math.max(from.y, targetY) + clearance
  // vy0 such that the apex reaches apexY (apex height grows monotonically with vy0)
  let lo = 0
  let hi = 60
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (heightAt(from.y, mid, apexTime(mid)) < apexY) lo = mid
    else hi = mid
  }
  const vy0 = (lo + hi) / 2
  const tTop = apexTime(vy0)
  // descending branch: find T > t* with y(T) = targetY
  let t0 = tTop
  let t1 = tTop + 20
  for (let i = 0; i < 80; i++) {
    const mid = (t0 + t1) / 2
    if (heightAt(from.y, vy0, mid) > targetY) t0 = mid
    else t1 = mid
  }
  const T = (t0 + t1) / 2
  const dx = to.x - from.x
  const dz = to.z - from.z
  const scale = K / (1 - Math.exp(-K * T))
  return {
    velocity: { x: dx * scale, y: vy0, z: dz * scale },
    flightTime: T,
    apexY,
  }
}
```

## Decisions (values from the worked example)

- Positions: each role (GK, fixo, two alas, pivot) has an anchor shifted by the ball and by attack or
  defence.
- Carrier: short passes with a lane check first; shot chance by distance 0.95 under 7 m, 0.45 under
  11, 0.18 under 15, 0.08 under 19; rare lobbed crosses. A viewer's call (shoot, square, long, or a
  clicked point) overrides only the carrier's next decision.
- Keeper: save chance `clamp(1.1 − reach·0.28 − max(0, speed − 14)·0.025, 0.15, 0.92)`; 40% of
  parries go wide for a corner.
- Commentary never repeats the same line back to back.

## React boundary

React must not re-render every frame. The world and the sim are created in one effect and stepped in
`requestAnimationFrame`; score, clock, fouls, phase and commentary go out through a tiny external
store that React reads with `useSyncExternalStore`. Settings (surface, time of day, camera) are
React state pushed down with `world.setView()`.

```ts
// src/shared/lib/store.ts
export interface Store<T> {
  get(): T
  set(next: T): void
  subscribe(listener: () => void): () => void
}

/** Minimal external store for useSyncExternalStore; skips identical values. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return
      value = next
      for (const l of [...listeners]) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

```ts
// src/features/match-sim/model/use-match-sim.ts
import { useEffect, useState, useSyncExternalStore } from 'react'

import type { SurfaceId } from '../../../shared/config'
import { MatchSim } from './sim'
import type { MatchSnapshot } from './types'

export interface UseMatchSimOptions {
  seed: number
  homeId: string
  awayId: string
  realMinutes: number
  surface: SurfaceId
}

/**
 * One MatchSim per fixture, length and seed. The surface is switched live on the
 * same match, so it is not part of the key.
 */
export function useMatchSim(options: UseMatchSimOptions): {
  sim: MatchSim
  snapshot: MatchSnapshot
} {
  const { seed, homeId, awayId, realMinutes, surface } = options
  const key = `${seed}|${homeId}|${awayId}|${realMinutes}`
  const [match, setMatch] = useState(() => ({
    key,
    sim: new MatchSim(options),
  }))
  if (match.key !== key) {
    // a new fixture or length starts a new match (state adjusted while rendering, per the React docs)
    setMatch({ key, sim: new MatchSim(options) })
  }
  const { sim } = match
  useEffect(() => {
    sim.setSurface(surface)
  }, [sim, surface])
  const snapshot = useSyncExternalStore(sim.store.subscribe, sim.store.get, sim.store.get)
  return { sim, snapshot }
}
```
