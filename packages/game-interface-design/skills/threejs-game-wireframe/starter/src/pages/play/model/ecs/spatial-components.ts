import type { Axis, Pose, Size } from './components.ts'

export const extentOf = (size: Size, axis: Axis): number => (axis === 'x' ? size.w : size.d)

export function withExtent(size: Size, axis: Axis, extent: number): Size {
  return axis === 'x' ? { ...size, w: extent } : { ...size, d: extent }
}

export function withCoord(pose: Pose, axis: Axis, value: number): Pose {
  return { ...pose, [axis]: value }
}

export interface Overlap {
  kept: number
  keptCenter: number
  cut: number
  cutCenter: number
}

// Overlap of a dropped span against the span below along one axis; kept <= 0 is a miss.
export function overlapAlong(center: number, below: number, extent: number): Overlap {
  const offset = center - below
  const kept = extent - Math.abs(offset)
  const cut = Math.abs(offset)
  const edge = below + (Math.sign(offset) * extent) / 2
  return {
    kept,
    keptCenter: below + offset / 2,
    cut,
    cutCenter: edge + (Math.sign(offset) * cut) / 2,
  }
}
