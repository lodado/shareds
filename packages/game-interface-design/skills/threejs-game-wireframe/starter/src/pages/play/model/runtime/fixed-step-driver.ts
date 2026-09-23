// Absorbs float error so 100 ms and ten 10 ms deltas yield the same step count.
const EPSILON_MS = 1e-6

export interface FixedStepDriver {
  /** Returns how many fixed steps the elapsed wall time pays for. */
  advance: (elapsedMs: number) => number
  /** Fraction of the next step already elapsed, for render interpolation only. */
  alpha: () => number
  reset: () => void
}

export function createFixedStepDriver(stepMs: number, maxSteps: number): FixedStepDriver {
  let accumulated = 0
  return {
    advance(elapsedMs) {
      if (!(elapsedMs > 0) || !Number.isFinite(elapsedMs)) return 0
      accumulated += elapsedMs
      const due = Math.floor((accumulated + EPSILON_MS) / stepMs)
      if (due > maxSteps) {
        accumulated = 0
        return maxSteps
      }
      accumulated = Math.max(0, accumulated - due * stepMs)
      return due
    },
    alpha: () => Math.min(1, accumulated / stepMs),
    reset() {
      accumulated = 0
    },
  }
}
