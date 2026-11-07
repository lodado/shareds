# Camera

## Placement

- Orthographic, so far things do not shrink: the diorama look. The frustum is `±halfHeight × aspect`
  by `±halfHeight`; camera modes are half-heights in metres (worked example: follow 11, whole yard 33,
  close 5.5) eased with `1 − e^(−5 dt)`.
- Elevation 31°, azimuth `45° + k·90°` measured from +z toward +x seen from above. The camera sits at
  `target + dir × distance` with `dir = (sin az·cos el, sin el, cos az·cos el)`.
- Rotation eases the short way round (`1 − e^(−7 dt)`, snapping below 0.001 rad) and is instant
  under `prefers-reduced-motion`.
- Keep `near`/`far` tight (worked example: distance 90, far 190). Depth precision is spread over that
  range, and the outline and the floor offsets both depend on it.

## Texel snapping

When the camera follows the ball, a target between two pixels makes every static object shimmer by
one pixel (pixel crawl). Each frame: place the camera once, read its right and up axes from
`matrixWorld`, project the target onto them, round both to whole texels
(`texel = 2 × halfHeight / lowResHeight`), move the target by the rounding error along those two axes
only, and place the camera again. Depth is left alone, so near/far do not drift. The test compares
screen-grid coordinates, not world points: depth is deliberately not snapped.

## Cutaway

`nearSides(az)` lists the walls whose outward normal points at the camera (`n · dir > 0`; edge-on walls
stay up). Those cage sides drop to a 0.6 m kickboard, and when north is near the school hides its upper
floors. Only visibility changes, never geometry, so this costs nothing per frame.

```ts
// src/widgets/diorama-stage/model/camera.ts
import { COURT } from '../../../shared/config'
import { clamp, type Vec2 } from '../../../shared/lib'

export type CameraMode = 'tv' | 'yard' | 'close'
export type CageSide = 'north' | 'south' | 'west' | 'east'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const CAMERA_MODES: readonly CameraMode[] = ['tv', 'yard', 'close']
export const CAMERA_LABELS: Record<CameraMode, string> = {
  tv: 'TV follow',
  yard: 'Whole yard',
  close: 'Close-up',
}

export const ELEVATION = (31 * Math.PI) / 180
const TAU = Math.PI * 2

/** Half the visible height of the orthographic frustum, metres. */
export const VIEW_HALF_HEIGHT: Record<CameraMode, number> = {
  tv: 11,
  yard: 33,
  close: 5.5,
}

const wrap = (a: number) => ((a % TAU) + TAU) % TAU

/** Azimuth for a rotation step: 45° + step·90°, any integer step. */
export function azimuthForStep(step: number): number {
  const k = ((step % 4) + 4) % 4
  return ((45 + k * 90) * Math.PI) / 180
}

/** Unit vector from the target toward the camera. */
export function cameraDirection(azimuth: number, elevation = ELEVATION): Vec3 {
  const c = Math.cos(elevation)
  return {
    x: Math.sin(azimuth) * c,
    y: Math.sin(elevation),
    z: Math.cos(azimuth) * c,
  }
}

const SIDE_NORMALS: readonly [CageSide, number, number][] = [
  ['east', 1, 0],
  ['north', 0, -1],
  ['south', 0, 1],
  ['west', -1, 0],
]

/** Cage sides whose outside faces the camera, alphabetical. Edge-on sides stay up. */
export function nearSides(azimuth: number): CageSide[] {
  const dx = Math.sin(azimuth)
  const dz = Math.cos(azimuth)
  return SIDE_NORMALS.filter(([, nx, nz]) => nx * dx + nz * dz > 1e-9).map(([s]) => s)
}

/** Eases `current` toward `target` the short way round; instant under reduced motion. */
export function easeAngle(current: number, target: number, dt: number, reduced: boolean): number {
  if (reduced) return target
  let diff = wrap(target - current)
  if (diff > Math.PI) diff -= TAU
  if (Math.abs(diff) < 0.001) return target
  const k = 1 - Math.exp(-dt * 7)
  return current + diff * k
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

/**
 * Moves `p` so its components along the camera's right and up axes are whole texels.
 * The depth component is left alone.
 */
export function snapToTexel(p: Vec3, right: Vec3, up: Vec3, texel: number): Vec3 {
  const r = dot(p, right)
  const u = dot(p, up)
  const dr = Math.round(r / texel) * texel - r
  const du = Math.round(u / texel) * texel - u
  return {
    x: p.x + right.x * dr + up.x * du,
    y: p.y + right.y * dr + up.y * du,
    z: p.z + right.z * dr + up.z * du,
  }
}

/** Where each camera mode wants to look, given the ball. */
export function followTarget(mode: CameraMode, ball: Vec2): Vec3 {
  switch (mode) {
    case 'yard':
      // aimed below the grass so the rock underside of the island is in frame too
      return { x: 0, y: -6, z: -3 }
    case 'close':
      return { x: ball.x, y: 0, z: ball.z }
    case 'tv':
      return {
        x: clamp(ball.x * 0.45, -COURT.halfWidth / 2, COURT.halfWidth / 2),
        y: 0,
        z: clamp(ball.z * 0.8, -COURT.halfLength, COURT.halfLength),
      }
  }
}
```

```ts
// src/widgets/diorama-stage/model/__test__/camera.unit.test.ts
import { describe, expect, it } from 'vitest'

import { azimuthForStep, easeAngle, followTarget, nearSides, snapToTexel } from '../camera'

const deg = (d: number) => (d * Math.PI) / 180

describe('azimuthForStep as the 90° rotation steps', () => {
  it('to be 45° at step 0 and 135°, 225°, 315° for steps 1–3', () => {
    expect([0, 1, 2, 3].map(azimuthForStep)).toEqual([45, 135, 225, 315].map(deg))
  })

  it('to be the same view for step 4 as step 0, and step -1 as step 3', () => {
    expect(azimuthForStep(4)).toBe(azimuthForStep(0))
    expect(azimuthForStep(-1)).toBe(azimuthForStep(3))
  })
})

describe('nearSides as the cage cutaway', () => {
  it('to be the east and south sides when the camera sits at 45°', () => {
    expect(nearSides(deg(45))).toEqual(['east', 'south'])
  })

  it('to be north and west from 225°', () => {
    expect(nearSides(deg(225))).toEqual(['north', 'west'])
  })

  it('to be only the side faced head-on at 90°, mid-rotation', () => {
    // at exactly 90° the south side is edge-on (dot 0) and stays up
    expect(nearSides(deg(90))).toEqual(['east'])
  })
})

describe('easeAngle as the eased camera rotation', () => {
  it('to be the target at once under reduced motion', () => {
    expect(easeAngle(deg(45), deg(135), 1 / 60, true)).toBe(deg(135))
  })

  it('to be a step toward the target that never passes it', () => {
    const next = easeAngle(deg(45), deg(135), 1 / 60, false)
    expect(next).toBeGreaterThan(deg(45))
    expect(next).toBeLessThan(deg(135))
  })

  it('to be the short way round from 315° to 45° (through 360°)', () => {
    const next = easeAngle(deg(315), deg(45), 1 / 60, false)
    expect(next).toBeGreaterThan(deg(315))
  })

  it('to be the target once within a thousandth of a radian', () => {
    expect(easeAngle(deg(135) - 0.0005, deg(135), 1 / 60, false)).toBe(deg(135))
  })
})

describe("snapToTexel as the camera's pixel grid", () => {
  const right = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 }
  const up = { x: 0, y: 1, z: 0 }
  const texel = 0.1

  it('to be within half a texel of the target on each screen axis', () => {
    const p = { x: 1.234, y: 0.567, z: -3.21 }
    const s = snapToTexel(p, right, up, texel)
    const along = (v: typeof p, a: typeof p) => v.x * a.x + v.y * a.y + v.z * a.z
    expect(Math.abs(along(s, right) - along(p, right))).toBeLessThanOrEqual(texel / 2 + 1e-9)
    expect(Math.abs(along(s, up) - along(p, up))).toBeLessThanOrEqual(texel / 2 + 1e-9)
  })

  it('to be the same snapped point for a move smaller than the grid', () => {
    // depth is left alone on purpose, so compare the snapped screen-grid coordinates
    const screen = (v: { x: number; y: number; z: number }) => [
      Math.round((v.x * right.x + v.y * right.y + v.z * right.z) / texel),
      Math.round((v.x * up.x + v.y * up.y + v.z * up.z) / texel),
    ]
    const a = snapToTexel({ x: 0.02, y: 0, z: 0 }, right, up, texel)
    const b = snapToTexel({ x: 0.03, y: 0, z: 0 }, right, up, texel)
    expect(screen(b)).toEqual(screen(a))
    expect(b.x * right.x + b.z * right.z).toBeCloseTo(a.x * right.x + a.z * right.z, 12)
  })
})

describe("followTarget as each camera mode's aim point", () => {
  const ball = { x: 6, z: 18 }

  it('to be the fixed yard centre in whole-yard mode, whatever the ball does', () => {
    expect(followTarget('yard', ball)).toEqual(followTarget('yard', { x: -6, z: -18 }))
  })

  it('to be on the ball in close-up', () => {
    expect(followTarget('close', ball)).toEqual({ x: 6, y: 0, z: 18 })
  })

  it("to be kept inside the court's length in TV mode", () => {
    const t = followTarget('tv', { x: 0, z: 30 })
    expect(t.z).toBeLessThanOrEqual(20)
  })
})
```

The frame code that uses these (easing, double placement for the snap, cutaway, picking a court point
with a ray against the ground plane) is `render()` and `pick()` in `world.ts`, quoted in
[scene](scene.md).
