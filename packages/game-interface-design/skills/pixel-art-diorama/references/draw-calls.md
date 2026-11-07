# Draw calls

A box scene costs one draw call per box, twice when it casts shadows. The worked example measured
1,335–1,595 calls per frame before this pass and 105–125 after.

## Measure first

- `renderer.info.autoReset = false`, `info.reset()` at frame start; read `info.render.calls` and
  `triangles` through the debug hook.
- A frame probe wraps `requestAnimationFrame` before the page loads and times each callback; the
  interval between frames shows the GPU side. In headless SwiftShader the callback CPU was about
  1 ms while frames came every 29–33 ms: the GPU side, not JavaScript, was the limit.

| View (headless SwiftShader) | Calls before → after | Frame CPU (ms) | Frame interval (ms) |
| --------------------------- | -------------------- | -------------- | ------------------- |
| Follow camera, day          | 1,335 → 105          | 1.10 → 0.45    | 33.6 → 28.2         |
| Whole yard, day             | 1,595 → 125          | 1.39 → 0.49    | 29.2 → 23.1         |
| Whole yard, night           | 1,595 → 125          | 1.30 → 0.47    | 29.4 → 23.6         |
| Stage scrolled off screen   | 1,595 → not drawn    | 28.6 → 0.05    | 28.8 → 8.3          |

SwiftShader is a CPU rasterizer: these numbers rank changes, they do not predict a phone.

## 1. Bake what never changes

`bakeStatic(group)` merges the meshes under a group into one mesh per material + shadow flags +
attribute set, in the group's own space. A bucket of one mesh is left alone. Hidden meshes, instanced
meshes, meshes with children and live nodes are skipped; each live node is baked inside itself, so a
swing still swings as one piece. A copy with a negative determinant (a mirrored mesh) has its triangle
winding reversed, or its faces are culled as back faces.

Run it after everything that reads positions at build time (the lights read the pylon heads). Mark
live, with `markLive`, everything that changes after build. In the worked example:

| Builder | Live nodes                                                    | Why                                     |
| ------- | ------------------------------------------------------------- | --------------------------------------- |
| court   | floor; each cage side's upper group                           | material swap; cutaway visibility       |
| school  | upper floors; door hinge; clock hand pivots; scoreboard; flag | visibility; rotation; texture; vertices |
| island  | swing pivots                                                  | rotation                                |
| crowd   | none (bodies and heads are already `InstancedMesh`)           | skipped by type                         |

A new moving thing without `markLive` keeps moving in memory while its baked copy stands still on
screen. Lamp faces only change their material's colour, so they bake fine.

```ts
// src/widgets/diorama-stage/lib/bake.ts
import { BufferAttribute, type BufferGeometry, InstancedMesh, type Material, Matrix4, Mesh, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Marks a node whose transform, visibility, material or geometry changes after the
 * scene is built. `bakeStatic` keeps it as is and merges only inside it.
 */
export function markLive<T extends Object3D>(node: T): T {
  node.userData.live = true
  return node
}

interface Bucket {
  material: Material
  castShadow: boolean
  receiveShadow: boolean
  meshes: Mesh[]
}

const isPlainMesh = (o: Object3D): o is Mesh & { material: Material } =>
  o instanceof Mesh && !(o instanceof InstancedMesh) && !Array.isArray(o.material) && o.children.length === 0

const signature = (g: BufferGeometry) =>
  Object.entries(g.attributes)
    .map(([name, a]) => `${name}:${a.itemSize}`)
    .sort()
    .join(',')

/** Swaps the 2nd and 3rd corner of every triangle so a mirrored copy keeps its front faces. */
function flipWinding(g: BufferGeometry): void {
  for (const a of Object.values(g.attributes)) {
    // the copies come from toNonIndexed/clone of plain geometries, never interleaved
    if (!(a instanceof BufferAttribute)) continue
    const n = a.itemSize
    const arr = a.array
    for (let t = 0; t + 2 < a.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i = (t + 1) * n + k
        const j = (t + 2) * n + k
        const tmp = arr[i]!
        arr[i] = arr[j]!
        arr[j] = tmp
      }
    }
  }
}

/**
 * Merges the static meshes under `root` into one mesh per material and shadow flags,
 * in `root`'s own space. A bucket with a single mesh is left alone. Hidden meshes,
 * instanced meshes, meshes with children and live nodes are not merged; each live
 * node gets the same treatment inside itself. Returns the merged geometries, which
 * the caller owns and disposes.
 */
export function bakeStatic(root: Object3D): BufferGeometry[] {
  root.updateMatrixWorld(true)
  const owned: BufferGeometry[] = []
  bakeInto(root, owned)
  return owned
}

function bakeInto(root: Object3D, owned: BufferGeometry[]): void {
  const buckets = new Map<string, Bucket>()
  const lives: Object3D[] = []
  const walk = (node: Object3D) => {
    for (const c of node.children) {
      if (c.userData.live) {
        lives.push(c)
        continue
      }
      if (!c.visible) continue
      if (isPlainMesh(c)) {
        const key = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}|${signature(c.geometry)}`
        let b = buckets.get(key)
        if (!b) {
          b = {
            material: c.material,
            castShadow: c.castShadow,
            receiveShadow: c.receiveShadow,
            meshes: [],
          }
          buckets.set(key, b)
        }
        b.meshes.push(c)
      }
      walk(c)
    }
  }
  walk(root)

  const toRoot = new Matrix4().copy(root.matrixWorld).invert()
  const rel = new Matrix4()
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue
    const parts = b.meshes.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
      g.clearGroups()
      rel.multiplyMatrices(toRoot, m.matrixWorld)
      g.applyMatrix4(rel)
      if (rel.determinant() < 0) flipWinding(g)
      return g
    })
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    if (!merged) continue
    const mesh = new Mesh(merged, b.material)
    mesh.castShadow = b.castShadow
    mesh.receiveShadow = b.receiveShadow
    mesh.name = 'baked'
    for (const m of b.meshes) m.removeFromParent()
    root.add(mesh)
    owned.push(merged)
  }

  for (const live of lives) bakeInto(live, owned)
}
```

```ts
// src/widgets/diorama-stage/lib/__test__/bake.unit.test.ts
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'

import { bakeStatic, markLive } from '../bake'

const box = new BoxGeometry(1, 1, 1)
const red = new MeshBasicMaterial({ color: '#ff0000' })
const blue = new MeshBasicMaterial({ color: '#0000ff' })

function meshAt(
  parent: Object3D,
  material: Material,
  x: number,
  opts: { cast?: boolean; scale?: [number, number, number] } = {},
): Mesh {
  const m = new Mesh(box, material)
  m.position.set(x, 0, 0)
  if (opts.scale) m.scale.set(...opts.scale)
  m.castShadow = opts.cast ?? false
  parent.add(m)
  return m
}

const meshesOf = (o: Object3D) => o.children.filter((c): c is Mesh => c instanceof Mesh)

/** Triangles whose winding disagrees with their stored vertex normal (would be culled as back faces). */
function inwardTriangles(m: Mesh): number {
  const pos = m.geometry.getAttribute('position')
  const nor = m.geometry.getAttribute('normal')
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const n = new Vector3()
  let bad = 0
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1).sub(a)
    c.fromBufferAttribute(pos, i + 2).sub(a)
    n.fromBufferAttribute(nor, i)
    if (b.cross(c).dot(n) <= 0) bad++
  }
  return bad
}

describe('bakeStatic as a merge of static meshes by bucket', () => {
  it('to be the same mesh object when its bucket holds a single mesh', () => {
    const root = new Group()
    const only = meshAt(root, red, 0)
    bakeStatic(root)
    expect(meshesOf(root)).toEqual([only])
  })

  it("to be one mesh carrying both boxes' triangles when two meshes share a bucket", () => {
    const root = new Group()
    meshAt(root, red, 0)
    meshAt(root, red, 3)
    bakeStatic(root)
    const merged = meshesOf(root)
    expect(merged.length).toBe(1)
    expect(merged[0]!.material).toBe(red)
    // a box is 12 triangles = 36 corners once it is not indexed
    expect(merged[0]!.geometry.getAttribute('position').count).toBe(72)
  })

  it('to be vertices in root space, so a box at x=5 scaled 2 spans x 4..6', () => {
    const root = new Group()
    root.position.set(100, 0, 0) // the root's own placement must not leak into its children
    meshAt(root, red, 5, { scale: [2, 1, 1] })
    meshAt(root, red, -5)
    bakeStatic(root)
    const g = meshesOf(root)[0]!.geometry
    g.computeBoundingBox()
    expect(g.boundingBox!.min.x).toBeCloseTo(-5.5, 9)
    expect(g.boundingBox!.max.x).toBeCloseTo(6, 9)
  })

  it('to be separate meshes when the material or the shadow flag differs', () => {
    const root = new Group()
    meshAt(root, red, 0)
    meshAt(root, red, 1)
    meshAt(root, blue, 2)
    meshAt(root, blue, 3)
    meshAt(root, blue, 4, { cast: true })
    meshAt(root, blue, 5, { cast: true })
    bakeStatic(root)
    const summary = meshesOf(root)
      .map((m) => `${m.material === red ? 'red' : 'blue'}:${m.castShadow}`)
      .sort()
    expect(summary).toEqual(['blue:false', 'blue:true', 'red:false'])
  })

  it('to be the same live node, still a child, with its own meshes merged inside it', () => {
    const root = new Group()
    meshAt(root, red, 0)
    const live = markLive(new Group())
    root.add(live)
    meshAt(live, red, 1)
    meshAt(live, red, 2)
    bakeStatic(root)
    expect(root.children.includes(live)).toBe(true)
    expect(meshesOf(live).length).toBe(1)
    expect(meshesOf(live)[0]!.geometry.getAttribute('position').count).toBe(72)
    // the root's lone red box was not pulled into the live node's bucket
    expect(meshesOf(root).length).toBe(1)
    expect(meshesOf(root)[0]!.geometry).toBe(box)
  })

  it('to be untouched for a hidden mesh and for an instanced mesh', () => {
    const root = new Group()
    const hiddenA = meshAt(root, red, 0)
    const hiddenB = meshAt(root, red, 1)
    hiddenA.visible = hiddenB.visible = false
    const crowd = new InstancedMesh(box, red, 4)
    root.add(crowd)
    bakeStatic(root)
    expect(root.children).toEqual([hiddenA, hiddenB, crowd])
  })

  it('to be front faces still facing out for a mirrored (negative scale) box', () => {
    const root = new Group()
    meshAt(root, red, 0, { scale: [-1, 1, 1] })
    meshAt(root, red, 3)
    bakeStatic(root)
    expect(inwardTriangles(meshesOf(root)[0]!)).toBe(0)
  })
})
```

## 2. One instanced mesh for every doll

Every box of every doll is one instance of a single `InstancedMesh` (the shared unit box, a white toon
material, per-instance colour). The joint hierarchy stays outside the scene as empty `Object3D`s;
after posing, `updateMatrixWorld` on that holder and copy each part's `matrixWorld` into the instance
matrix. Hidden agents get a zero-scale matrix. `frustumCulled = false`: the instances move every frame
and a bounding sphere computed once goes stale. The full `people.ts` is in [scene](scene.md).

```ts
// src/widgets/diorama-stage/lib/__test__/people.unit.test.ts
import { InstancedMesh, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { MatchSim } from '../../../../features/match-sim'
import { MaterialKit } from '../materials'
import { buildPeople } from '../people'

function setup() {
  const sim = new MatchSim({
    seed: 12,
    homeId: 'larks',
    awayId: 'rooks',
    realMinutes: 6,
    surface: 'rubber',
  })
  for (const a of sim.agents) a.visible = true
  const people = buildPeople(new MaterialKit(), sim.agents)
  const dolls = people.group.children[0]
  if (!(dolls instanceof InstancedMesh)) throw new Error('no instanced dolls')
  return { sim, people, dolls, perDoll: dolls.count / sim.agents.length }
}

const m = new Matrix4()
const shown = (dolls: InstancedMesh, from: number, to: number) => {
  let n = 0
  for (let i = from; i < to; i++) {
    dolls.getMatrixAt(i, m)
    if (Math.abs(m.determinant()) > 1e-12) n++
  }
  return n
}
const xAt = (dolls: InstancedMesh, i: number) => {
  dolls.getMatrixAt(i, m)
  return new Vector3().setFromMatrixPosition(m).x
}

describe('buildPeople as one instanced draw for every doll', () => {
  it('to be a single instanced mesh holding a whole number of boxes per agent', () => {
    const { sim, people, dolls, perDoll } = setup()
    expect(people.group.children.length).toBe(1)
    expect(dolls.castShadow).toBe(true)
    expect(dolls.count % sim.agents.length).toBe(0)
    expect(perDoll >= 1).toBe(true)
  })

  it('to be no visible box for a hidden agent and all boxes for the rest', () => {
    const { sim, people, dolls, perDoll } = setup()
    sim.agents[0]!.visible = false
    people.update(0, 0)
    expect(shown(dolls, 0, perDoll)).toBe(0)
    expect(shown(dolls, perDoll, dolls.count)).toBe(dolls.count - perDoll)
  })

  it("to be only that agent's boxes moving, each by the same 10 m, when the agent moves 10 m", () => {
    const { sim, people, dolls, perDoll } = setup()
    // a held pose: the idle sway depends on position and would add its own offset
    sim.agents[1]!.pose = 'kick'
    people.update(0, 0)
    const before = Array.from({ length: dolls.count }, (_, i) => xAt(dolls, i))
    sim.agents[1]!.pos.x += 10
    people.update(0, 0)
    for (let i = 0; i < dolls.count; i++) {
      const moved = i >= perDoll && i < perDoll * 2 ? 10 : 0
      expect(xAt(dolls, i) - before[i]!).toBeCloseTo(moved, 6)
    }
  })
})
```

## 3. Do not draw what nobody sees

On a phone the commentary sits below the stage, and people scroll to read it while the match plays.
An `IntersectionObserver` on the canvas skips `world.render` while it is off screen and keeps
advancing the simulation. A hidden tab already stops `requestAnimationFrame`, so the match pauses
there.

```ts
// src/widgets/diorama-stage/model/use-diorama.ts
import { type MouseEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import type { MatchSim, MatchSnapshot } from '../../../features/match-sim'
import { DioramaWorld, type WorldInfo, type WorldView } from '../lib/world'

export interface DioramaInput extends WorldView {
  sim: MatchSim
  paused: boolean
}

/** Debug and QA handle on `window.__yard` (headless checks drive the match through it). */
export interface YardDebug {
  readonly sim: MatchSim
  setSpeed(multiplier: number): void
  /** Runs up to `seconds` of sim time at once, stopping at the end of the match. */
  simulate(seconds: number): MatchSnapshot
  snapshot(): MatchSnapshot
  info(): WorldInfo
}

declare global {
  interface Window {
    __yard?: YardDebug
  }
}

const viewOf = (i: DioramaInput): WorldView => ({
  surface: i.surface,
  time: i.time,
  mode: i.mode,
  rotation: i.rotation,
  reducedMotion: i.reducedMotion,
})

/**
 * Owns the three world for one canvas: creation, the frame loop (advancing the sim
 * unless paused), resizing, pushing view settings, court clicks and the debug hook.
 */
export function useDiorama(input: DioramaInput): {
  canvasRef: RefObject<HTMLCanvasElement | null>
  failed: string | null
  onCanvasClick: (e: MouseEvent<HTMLCanvasElement>) => void
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const worldRef = useRef<DioramaWorld | null>(null)
  const latest = useRef(input)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    latest.current = input
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let world: DioramaWorld
    try {
      world = new DioramaWorld(canvas, latest.current.sim, viewOf(latest.current))
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'WebGL is not available.')
      return
    }
    worldRef.current = world

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) world.resize(r.width, r.height, window.devicePixelRatio || 1)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    // Off screen (e.g. scrolled down to the commentary on a phone) the match goes on
    // but nothing is drawn.
    let onScreen = true
    const seen = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1]
      if (e) onScreen = e.isIntersecting
    })
    seen.observe(canvas)

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const cur = latest.current
      if (!cur.paused) cur.sim.advance(dt)
      if (onScreen) world.render(dt)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const debug: YardDebug = {
      get sim() {
        return latest.current.sim
      },
      setSpeed(multiplier) {
        latest.current.sim.speed = multiplier
      },
      simulate(seconds) {
        const sim = latest.current.sim
        sim.simulate(seconds, () => sim.finished)
        return sim.store.get()
      },
      snapshot: () => latest.current.sim.store.get(),
      info: () => world.info(),
    }
    window.__yard = debug

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      seen.disconnect()
      world.dispose()
      worldRef.current = null
      if (window.__yard === debug) delete window.__yard
    }
  }, [])

  const { sim, surface, time, mode, rotation, reducedMotion } = input
  useEffect(() => {
    worldRef.current?.setSim(sim)
  }, [sim])
  useEffect(() => {
    worldRef.current?.setView({ surface, time, mode, rotation, reducedMotion })
  }, [surface, time, mode, rotation, reducedMotion])

  const onCanvasClick = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
    const world = worldRef.current
    if (!world) return
    const p = world.pick(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    if (p) latest.current.sim.markPoint(p)
  }, [])

  return { canvasRef, failed, onCanvasClick }
}
```

## 4. Size the shadow map to the frame

With a 270 px tall frame, 1024² over ±40 m is 7.8 cm a texel. The 2048² map drew four times the
shadow pixels with no visible difference.
