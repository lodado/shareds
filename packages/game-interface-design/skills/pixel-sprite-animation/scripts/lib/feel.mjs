// Game-feel numbers for engines (feel.json) and the hit sequence shown in preview-feel.gif.
import { phaseMs, startupMs, timeToContact } from './lint.mjs'

const SHAKE_STEP_MS = 40
const SHAKE_PATTERN = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function phaseRuns(frames) {
  const runs = []
  frames.forEach((f, i) => {
    const last = runs.at(-1)
    if (last?.phase === f.phase) {
      last.to = i
      last.ms += f.ms
    } else {
      runs.push({ phase: f.phase, from: i, to: i, ms: f.ms })
    }
  })
  return runs
}

/** fps-normalized hit parameters; frame counts are rounded to logic ticks. */
export function feelReport(spec, frames) {
  const tickMs = 1000 / spec.fps
  const ticks = (ms) => Math.round(ms / tickMs)
  const firstImpact = frames.findIndex((f) => f.phase === 'impact')
  const { hitstop, shake, flash, knockbackPx, reduced } = spec.feel
  return {
    name: spec.name,
    fps: spec.fps,
    tickMs: Math.round(tickMs * 100) / 100,
    totalMs: frames.reduce((sum, f) => sum + f.ms, 0),
    // Anticipation only (the startup or telegraph budget), then travel, then the moment contact starts.
    startupMs: startupMs(frames, firstImpact),
    travelMs: phaseMs(frames, firstImpact, 'travel'),
    timeToContactMs: timeToContact(frames, firstImpact),
    firstActiveIndex: firstImpact < 0 ? null : firstImpact,
    hitstop: hitstop ? { ms: hitstop.ms, frames: ticks(hitstop.ms), scope: hitstop.scope ?? null } : null,
    shake: shake ? { px: shake.px, ms: shake.ms, frames: ticks(shake.ms) } : null,
    flashFrames: flash?.frames ?? 0,
    // Applied to the target that is hit, not to this sprite.
    knockbackPx: knockbackPx ?? 0,
    reduced: reduced ?? null,
    phases: phaseRuns(frames),
    // Motion the engine applies to the root (travel, tall arcs); the sprite only bakes in-place motion.
    rootMotion: spec.rootMotion ?? null,
  }
}

function baseSteps(spec, frames, tickMs) {
  const firstImpact = frames.findIndex((f) => f.phase === 'impact')
  const flashTicks = spec.feel.flash?.frames ?? 0
  return frames.flatMap((f, index) => {
    if (index !== firstImpact) return [{ index, ms: f.ms, dx: 0, dy: 0, flash: false }]
    const hold = { index, ms: f.ms + (spec.feel.hitstop?.ms ?? 0), dx: 0, dy: 0, flash: false, contact: true }
    if (flashTicks === 0) return [hold]
    return [{ index, ms: Math.max(20, Math.round(flashTicks * tickMs)), dx: 0, dy: 0, flash: true }, hold]
  })
}

/** Steps for the feel preview: flash, hitstop freeze, then whole-pixel shake that decays over `shake.ms`. */
export function feelSequence(spec, frames) {
  const steps = baseSteps(spec, frames, 1000 / spec.fps)
  const px = spec.feel.shake?.px ?? 0
  const window = spec.feel.shake?.ms ?? 0
  const contact = steps.findIndex((s) => s.contact)
  if (contact < 0 || px === 0 || window === 0) return steps
  const out = steps.slice(0, contact)
  let elapsed = 0
  let k = 0
  for (const step of steps.slice(contact)) {
    let left = step.ms
    while (left > 0 && elapsed < window) {
      const ms = Math.min(SHAKE_STEP_MS, left, window - elapsed)
      const amp = Math.max(1, Math.round(px * (1 - elapsed / window)))
      const [ux, uy] = SHAKE_PATTERN[k % SHAKE_PATTERN.length]
      out.push({ ...step, ms, dx: ux * amp, dy: uy * amp })
      left -= ms
      elapsed += ms
      k++
    }
    if (left > 0) out.push({ ...step, ms: left, dx: 0, dy: 0 })
  }
  return out
}
