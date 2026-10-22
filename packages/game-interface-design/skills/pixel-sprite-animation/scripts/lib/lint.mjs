// Deterministic sprite gates. Each rule returns findings; warnings can be waived with a reason, errors cannot.
// Body metrics read `frame.body` (fx layers and patches excluded); palette rules read the rendered `frame.pixels`.
import { licenseClass } from './license.mjs'
import { hasKey, TRANSPARENT } from './spec.mjs'

const ACTION_PHASES = new Set(['anticipation', 'travel', 'smear', 'impact', 'follow-through', 'recovery', 'hold'])
const AFTER_IMPACT = new Set(['follow-through', 'recovery', 'hold'])
const IN_FLIGHT = new Set(['travel', 'smear'])
const SCOPES = new Set(['presentation', 'simulation'])
const OUTLINE_GAP = 0.1
const MIN_IMPACT_HOLD_MS = 60
const GIF_MIN_MS = 20
const FLASH_LIMIT = 3
const HITSTOP_RANGE = [33, 200]
const ORDER_FIX = 'order after contact: impact, follow-through/hold, recovery, then hold'

const error = (rule, frame, message, fix) => ({ rule, severity: 'error', frame, message, fix })
const warning = (rule, frame, message, fix) => ({ rule, severity: 'warning', frame, message, fix })
const pct = (ratio) => `${Math.round(ratio * 100)}%`
const isText = (v) => typeof v === 'string' && v.trim().length > 0

// Smear, effect, flash and blank frames are allowed to break silhouette, palette and spacing continuity.
const isSpecial = (f) => f.phase === 'smear' || ['fx', 'flash', 'blank'].some((t) => f.tags.has(t))

function opaqueMask(pixels) {
  return pixels.map((key) => key !== TRANSPARENT)
}

function countTrue(mask) {
  return mask.reduce((n, on) => n + (on ? 1 : 0), 0)
}

function overlap(a, b) {
  let union = 0
  let both = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) union++
    if (a[i] && b[i]) both++
  }
  return { union, both, changed: union - both }
}

function histogram(pixels) {
  const counts = new Map()
  for (const key of pixels) if (key !== TRANSPARENT) counts.set(key, (counts.get(key) ?? 0) + 1)
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1
  return new Map([...counts].map(([key, n]) => [key, n / total]))
}

function colorIntersection(a, b) {
  const ha = histogram(a.body)
  const hb = histogram(b.body)
  let shared = 0
  for (const [key, share] of ha) shared += Math.min(share, hb.get(key) ?? 0)
  return shared
}

function neighbors(frame, x, y, diagonal) {
  const steps = diagonal
    ? [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy])).filter(([dx, dy]) => dx || dy)
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
  return steps.map(([dx, dy]) => {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= frame.w || ny >= frame.h) return TRANSPARENT
    return frame.body[ny * frame.w + nx]
  })
}

function pairs(ctx) {
  const { frames, spec } = ctx
  const list = frames.slice(1).map((frame, i) => [frames[i], frame])
  if (spec.loop && frames.length > 1) list.push([frames.at(-1), frames[0]])
  return list
}

const pixelLabel = (frame, i) => `${i % frame.w},${Math.floor(i / frame.w)}=${frame.body[i]}`
const clipLabel = (clip) => `${clip.source} (${clip.count})`

function baselineFinding(frame, baseline) {
  const lowest = frame.body.findLastIndex((key) => key !== TRANSPARENT)
  if (lowest < 0) return []
  const row = Math.floor(lowest / frame.w)
  if (row === baseline) return []
  // Below the baseline every pixel past it is wrong; above it the lowest row is the one that floats.
  const offending = frame.body
    .map((key, i) => ({ key, i, y: Math.floor(i / frame.w) }))
    .filter(({ key, y }) => key !== TRANSPARENT && (row > baseline ? y > baseline : y === row))
    .slice(0, 3)
    .map(({ i }) => pixelLabel(frame, i))
    .join(' ')
  const fix = 'keep grounded feet on the baseline or tag the frame airborne'
  return [error('H7', frame.id, `lowest body pixel row ${row}, baseline ${baseline}: ${offending}`, fix)]
}

const hygieneRules = {
  H1({ frames, spec }) {
    return frames.flatMap((f) => {
      const unknown = [...new Set(f.pixels)].filter((k) => k !== TRANSPARENT && !hasKey(spec.palette, k))
      if (unknown.length === 0) return []
      const listed = unknown.map((k) => JSON.stringify(k)).join(', ')
      return [error('H1', f.id, `unknown palette key(s) ${listed}`, 'add the key to palette or fix the grid')]
    })
  },
  H2({ frames, spec }) {
    const used = usedColors(frames, spec)
    if (used.size <= spec.maxColors) return []
    return [error('H2', undefined, `${used.size} colors used, maxColors is ${spec.maxColors}`, 'merge near-duplicate shades into shared ramps')]
  },
  H3({ frames }) {
    return frames.flatMap((f) => f.sizeErrors.map((e) => error('H3', f.id, e, 'make every rows grid exactly canvas-sized')))
  },
  H4({ frames }) {
    return frames
      .filter((f) => f.clipped > 0)
      .map((f) => {
        const sources = f.clippedBy.map(clipLabel).join(', ')
        return warning('H4', f.id, `${f.clipped} pixel(s) fell outside the canvas from ${sources}`, 'move that part/op/patch inward or enlarge the canvas')
      })
  },
  H5({ frames, spec }) {
    if (spec.kind === 'effect') return []
    return frames
      .filter((f) => f.phase !== 'smear' && !f.tags.has('fx'))
      .flatMap((f) => {
        const dust = []
        f.body.forEach((key, i) => {
          const x = i % f.w
          const y = Math.floor(i / f.w)
          if (key !== TRANSPARENT && neighbors(f, x, y, true).every((n) => n === TRANSPARENT)) dust.push(`${x},${y}`)
        })
        if (dust.length === 0) return []
        return [warning('H5', f.id, `${dust.length} floating pixel(s) at ${dust.slice(0, 5).join(' ')}`, 'connect or delete stray pixels')]
      })
  },
  H6({ frames, spec }) {
    if (!spec.outline) return []
    const allowed = new Set([spec.outline, ...spec.outlineAlt])
    return frames
      .filter((f) => !isSpecial(f))
      .flatMap((f) => {
        let border = 0
        let gaps = 0
        f.body.forEach((key, i) => {
          if (key === TRANSPARENT || f.exempt[i]) return
          if (!neighbors(f, i % f.w, Math.floor(i / f.w), false).includes(TRANSPARENT)) return
          border++
          if (!allowed.has(key)) gaps++
        })
        if (border === 0 || gaps / border <= OUTLINE_GAP) return []
        return [warning('H6', f.id, `${pct(gaps / border)} of the silhouette edge is not an outline color`, 'close the outline or add sel-out shades to outlineAlt')]
      })
  },
  H7({ frames, spec }) {
    if (spec.baseline === undefined) return []
    return frames
      .filter((f) => !['airborne', 'fx', 'blank'].some((t) => f.tags.has(t)))
      .flatMap((f) => baselineFinding(f, spec.baseline))
  },
  H8({ frames }) {
    return frames
      .filter((f) => !f.tags.has('blank') && f.pixels.every((k) => k === TRANSPARENT))
      .map((f) => error('H8', f.id, 'frame is empty', 'draw the frame or tag it blank'))
  },
}

function preContactOrder(f, beforeWindUp, moving) {
  if (beforeWindUp) return error('M2', f.id, `${f.phase} before the first anticipation`, 'start the action with its wind-up')
  if (f.phase === 'anticipation' && moving)
    return error('M2', f.id, 'anticipation after travel or smear', 'keep the wind-up frames together before take-off')
  if (AFTER_IMPACT.has(f.phase)) return error('M2', f.id, `${f.phase} before the impact`, 'move it after the contact pose')
  return null
}

// Before contact: anticipation+ → (travel | smear)* → impact.
function preContactFindings(frames, firstImpact) {
  const before = frames.slice(0, firstImpact).filter((f) => ACTION_PHASES.has(f.phase))
  const firstAntic = before.findIndex((f) => f.phase === 'anticipation')
  if (firstAntic < 0) return [error('M2', frames[firstImpact].id, 'no anticipation before the first impact', 'add a wind-up pose before contact')]
  let moving = false
  return before.flatMap((f, i) => {
    const finding = preContactOrder(f, i < firstAntic, moving)
    // Flight before the wind-up is already reported; only flight after it closes the wind-up.
    if (i > firstAntic && IN_FLIGHT.has(f.phase)) moving = true
    return finding ? [finding] : []
  })
}

// After contact: impact* → (follow-through | hold)* → recovery* → hold*. Stages only move forward.
const STAGES = { 'impact': [0], 'follow-through': [1], 'hold': [1, 3], 'recovery': [2] }

function postContactFindings(frames, firstImpact) {
  let stage = 0
  return frames.slice(firstImpact + 1).flatMap((f) => {
    if (!ACTION_PHASES.has(f.phase)) return []
    if (f.phase === 'anticipation' || IN_FLIGHT.has(f.phase)) {
      const fix = f.phase === 'anticipation' ? 'use follow-through, recovery or hold after contact' : 'past contact use follow-through; leave flight to engine root motion'
      return [error('M2', f.id, `${f.phase} after the impact`, fix)]
    }
    const next = STAGES[f.phase].find((s) => s >= stage)
    if (next === undefined) return [error('M2', f.id, `${f.phase} out of order after the impact`, ORDER_FIX)]
    stage = next
    return []
  })
}

function phaseOrderFindings(frames, firstImpact) {
  const foreign = frames
    .filter((f) => !ACTION_PHASES.has(f.phase))
    .map((f) => error('M2', f.id, `phase ${f.phase} does not belong in an action`, 'use anticipation, travel, smear, impact, follow-through, recovery or hold'))
  if (firstImpact < 0) return [...foreign, error('M2', undefined, 'no impact frame', 'mark the contact pose as phase impact')]
  return [...foreign, ...preContactFindings(frames, firstImpact), ...postContactFindings(frames, firstImpact)]
}

/** Milliseconds of one phase before the first impact (the whole action when there is no impact). */
export function phaseMs(frames, firstImpact, phase) {
  const window = firstImpact < 0 ? frames : frames.slice(0, firstImpact)
  return window.filter((f) => f.phase === phase).reduce((sum, f) => sum + f.ms, 0)
}

export const startupMs = (frames, firstImpact) => phaseMs(frames, firstImpact, 'anticipation')

/** Milliseconds from the first frame to the start of the first impact; null without an impact. */
export function timeToContact(frames, firstImpact) {
  if (firstImpact < 0) return null
  return frames.slice(0, firstImpact).reduce((sum, f) => sum + f.ms, 0)
}

function usedColors(frames, spec) {
  const keys = new Set(frames.flatMap((f) => f.pixels.filter((k) => k !== TRANSPARENT && hasKey(spec.palette, k))))
  return new Set([...keys].map((k) => spec.palette[k].toLowerCase()))
}

const motionRules = {
  M1({ frames, spec }) {
    if (frames.length < 2 || new Set(frames.map((f) => f.ms)).size > 1) return []
    const message = `every frame lasts ${frames[0].ms} ms`
    const fix = 'hold key poses longer and pass fast frames quickly'
    if (spec.kind === 'action') return [error('M1', undefined, message, fix)]
    return spec.kind === 'idle' ? [warning('M1', undefined, message, fix)] : []
  },
  M2({ frames, spec, firstImpact }) {
    if (spec.kind !== 'action') return []
    return phaseOrderFindings(frames, firstImpact)
  },
  // Only anticipation counts: travel and smear time is the move itself, reported as travelMs.
  M3({ frames, spec, firstImpact, t }) {
    if (spec.kind !== 'action' || spec.actor === 'neutral') return []
    const ms = startupMs(frames, firstImpact)
    if (spec.actor === 'player' && ms > t.startupMs)
      return [error('M3', undefined, `player startup ${ms} ms exceeds ${t.startupMs} ms`, 'shorten or merge anticipation frames; move weight into the smear')]
    if (spec.actor === 'enemy' && ms < t.telegraphMs)
      return [error('M3', undefined, `enemy telegraph ${ms} ms is under ${t.telegraphMs} ms`, 'hold the wind-up longer so the player can react')]
    return []
  },
  M4(ctx) {
    return pairs(ctx).flatMap(([a, b]) => {
      if (isSpecial(a) || isSpecial(b)) return []
      const { union, changed } = overlap(opaqueMask(a.body), opaqueMask(b.body))
      const ratio = union === 0 ? 0 : changed / union
      if (ratio <= ctx.t.gap) return []
      return [warning('M4', `${a.id}→${b.id}`, `${pct(ratio)} of the silhouette changes in one step`, 'add an in-between frame, or a take-off/arrival smear')]
    })
  },
  M5({ frames, spec, firstImpact, t }) {
    const checks = []
    const lastAntic = frames.slice(0, Math.max(firstImpact, 0)).findLast((f) => f.phase === 'anticipation')
    if (spec.kind === 'action' && lastAntic) checks.push([lastAntic, frames[firstImpact]])
    const keys = frames.filter((f) => f.tags.has('key'))
    keys.slice(1).forEach((f, i) => {
      if (!checks.some(([a, b]) => a === keys[i] && b === f)) checks.push([keys[i], f])
    })
    return checks.flatMap(([a, b]) => {
      const { union, both } = overlap(opaqueMask(a.body), opaqueMask(b.body))
      const iou = union === 0 ? 1 : both / union
      if (iou < t.keyIoU) return []
      return [warning('M5', `${a.id}→${b.id}`, `key poses share ${pct(iou)} of their silhouette`, 'push the poses apart: lean, reach, or change the line of action')]
    })
  },
  // `volumeRef` picks the reference frame when generated frames vary in area; else the first plain frame.
  M6({ frames, spec, t }) {
    const bent = (f) => f.tags.has('squash') || f.tags.has('stretch')
    const plain = frames.find((f) => !bent(f) && !isSpecial(f))
    const ref = spec.volumeRef === undefined ? plain : frames.find((f) => f.id === spec.volumeRef)
    if (!ref) return []
    const refArea = countTrue(opaqueMask(ref.body))
    return frames.filter(bent).flatMap((f) => {
      const change = Math.abs(countTrue(opaqueMask(f.body)) - refArea) / Math.max(refArea, 1)
      if (change <= t.volume) return []
      return [warning('M6', f.id, `area changes ${pct(change)} against ${ref.id}`, 'widen when you flatten, narrow when you stretch')]
    })
  },
  M7({ frames, spec, firstImpact }) {
    if (spec.kind !== 'action' || firstImpact < 0) return []
    const hold = frames[firstImpact].ms + (spec.feel.hitstop?.ms ?? 0)
    if (hold >= MIN_IMPACT_HOLD_MS) return []
    return [warning('M7', frames[firstImpact].id, `contact is visible for ${hold} ms`, 'hold the impact frame or add hitstop')]
  },
  // A flash-tagged contact frame and feel.flash at the same instant are one flash, not two.
  M8({ frames, spec, firstImpact }) {
    const starts = new Set()
    let clock = 0
    frames.forEach((f, i) => {
      if (f.tags.has('flash') && !frames[i - 1]?.tags.has('flash')) starts.add(clock)
      if (i === firstImpact && (spec.feel.flash?.frames ?? 0) > 0) starts.add(clock)
      clock += f.ms
    })
    const events = [...starts, ...[...starts].map((s) => s + clock)].sort((a, b) => a - b)
    const worst = Math.max(0, ...events.map((s) => events.filter((e) => e >= s && e < s + 1000).length))
    if (worst <= FLASH_LIMIT) return []
    return [error('M8', undefined, `${worst} flashes within one second`, 'flash at most 3 times per second')]
  },
  M9({ frames, tickMs }) {
    return frames.flatMap((f) => {
      if (f.ms < tickMs) return [warning('M9', f.id, `${f.ms} ms is shorter than one ${Math.round(tickMs)} ms tick`, 'use at least one logic tick')]
      if (f.ms < GIF_MIN_MS) return [warning('M9', f.id, `${f.ms} ms is under the 20 ms GIF minimum`, 'use 20 ms or more')]
      return []
    })
  },
  // After the wind-up the player still waits through travel and smear before the hit lands.
  M11({ frames, spec, firstImpact, t }) {
    if (spec.kind !== 'action' || spec.actor !== 'player' || firstImpact < 0) return []
    const flight = phaseMs(frames, firstImpact, 'travel') + phaseMs(frames, firstImpact, 'smear')
    if (flight <= t.contactMs) return []
    return [warning('M11', frames[firstImpact].id, `${flight} ms of travel and smear before contact exceeds ${t.contactMs} ms`, 'shorten the flight, or waive it for a deliberate lunge or jump')]
  },
  M10(ctx) {
    return pairs(ctx).flatMap(([a, b]) => {
      if (isSpecial(a) || isSpecial(b)) return []
      const shared = colorIntersection(a, b)
      if (shared >= ctx.t.identity) return []
      return [warning('M10', `${a.id}→${b.id}`, `frames share only ${pct(shared)} of their colors`, 'keep the character palette and proportions; redraw drift reads as a different sprite')]
    })
  },
}

const feelRules = {
  F1({ spec }) {
    const ms = spec.feel.hitstop?.ms ?? 0
    if (ms === 0 || (ms >= HITSTOP_RANGE[0] && ms <= HITSTOP_RANGE[1])) return []
    return [warning('F1', undefined, `hitstop ${ms} ms is outside 33–200 ms`, 'use 2–12 ticks at 60 fps, scaled by hit weight')]
  },
  F2({ spec }) {
    const hitstop = spec.feel.hitstop
    if (!hitstop || hitstop.ms === 0 || SCOPES.has(hitstop.scope)) return []
    return [error('F2', undefined, 'hitstop has no scope', 'set hitstop.scope to "presentation" or "simulation"')]
  },
  F3({ spec }) {
    const px = spec.feel.shake?.px
    if (px === undefined || Number.isInteger(px)) return []
    return [error('F3', undefined, `shake ${px} px is not a whole pixel`, 'round shake to whole pixels at the sprite scale')]
  },
  F4({ spec }) {
    const { hitstop, shake, flash, reduced } = spec.feel
    const intense = [hitstop?.ms, shake?.px, flash?.frames].some((amount) => (amount ?? 0) > 0)
    if (!intense || reduced) return []
    return [error('F4', undefined, 'hitstop/shake/flash without a reduced-effect alternative', 'add feel.reduced that keeps the hit readable')]
  },
}

const LICENSE_FINDINGS = {
  copyleft: (name) => warning('L2', name, `source "${name}" is copyleft — check before commercial release`, 'confirm share-alike terms fit the release, then waive with the reason'),
  generator: (name) => warning('L2', name, `source "${name}" has plan-dependent commercial terms`, 'check the generator plan allows this use, then waive with the reason'),
  restricted: (name) => error('L2', name, `source "${name}" is NonCommercial or NoDerivatives, which a modified commercial game cannot use`, 'pick an asset with an open or attribution license'),
  unknown: (name) => error('L2', name, `source "${name}" has an unrecognized license`, 'name the license (CC0, CC-BY, CC-BY-SA, MIT, own work or the generator terms)'),
}

// An attribution license is only met by a credit that names the author and links the source.
function attributionFinding(source) {
  if (licenseClass(source.license) !== 'attribution' || (isText(source.author) && isText(source.url))) return []
  return [warning('L2', source.name, `source "${source.name}" needs an author and a url for its credit`, 'fill author and url in sources, or waive with the reason')]
}

const recordRules = {
  // License class of every declared source with a license; L1 already covers a missing one.
  L2({ spec }) {
    return spec.sources
      .filter((s) => isText(s.license))
      .flatMap((s) => [LICENSE_FINDINGS[licenseClass(s.license)]?.(s.name), ...attributionFinding(s)].filter(Boolean))
  },
  // Checks effective sources: the frame's own, its base chain's, and those of the parts it places.
  L1({ frames, spec }) {
    return frames.flatMap((f) =>
      f.sources.flatMap(({ name, via }) => {
        const entry = spec.sources.find((s) => s.name === name)
        if (entry && isText(entry.license)) return []
        const origin = via === 'frame' ? '' : ` (via ${via})`
        return [error('L1', f.id, `source "${name}"${origin} has no sources entry with a license`, 'add { name, author, license, url } to sources')]
      }),
    )
  },
  T0({ spec }) {
    if (spec.thresholdOverrides.length === 0 || isText(spec.thresholds.reason)) return []
    return [error('T0', undefined, `threshold override (${spec.thresholdOverrides.join(', ')}) has no reason`, 'add thresholds.reason')]
  },
}

function waives(waiver, finding) {
  if (!isText(waiver.reason) || waiver.rule !== finding.rule) return false
  return waiver.frame === undefined || waiver.frame === finding.frame
}

function applyWaivers(findings, waivers) {
  const used = new Set()
  const waived = []
  const kept = findings.filter((finding) => {
    if (finding.severity !== 'warning') return true
    const index = waivers.findIndex((w) => waives(w, finding))
    if (index < 0) return true
    used.add(index)
    waived.push({ ...finding, reason: waivers[index].reason })
    return false
  })
  const waiverFindings = waivers.flatMap((w, i) => {
    if (!isText(w.reason)) return [error('W0', w.frame, `waiver for ${w.rule} has no reason`, 'state why the warning is intended')]
    if (used.has(i)) return []
    return [error('W1', w.frame, `waiver for ${w.rule} matches no warning`, 'delete the stale waiver')]
  })
  return { kept: [...kept, ...waiverFindings], waived }
}

function metricsOf(ctx) {
  const { frames, firstImpact, tickMs, spec } = ctx
  const totalMs = frames.reduce((sum, f) => sum + f.ms, 0)
  const colors = usedColors(frames, spec)
  return {
    frames: frames.length,
    totalMs,
    startupMs: startupMs(frames, firstImpact),
    travelMs: phaseMs(frames, firstImpact, 'travel'),
    timeToContactMs: timeToContact(frames, firstImpact),
    colorsUsed: colors.size,
    tickMs: Math.round(tickMs * 100) / 100,
    timeline: frames.map((f) => ({
      id: f.id,
      phase: f.phase,
      ms: f.ms,
      displayedMs: Math.round(Math.round(f.ms / tickMs) * tickMs),
      area: countTrue(opaqueMask(f.body)),
    })),
  }
}

/** Runs every gate on composed frames; `ok` needs zero errors and zero unwaived warnings. */
export function lintSprite(spec, frames) {
  const ctx = {
    spec,
    frames,
    firstImpact: frames.findIndex((f) => f.phase === 'impact'),
    tickMs: 1000 / spec.fps,
    t: spec.thresholds,
  }
  const rules = { ...hygieneRules, ...motionRules, ...feelRules, ...recordRules }
  const findings = Object.values(rules).flatMap((rule) => rule(ctx))
  const { kept, waived } = applyWaivers(findings, spec.waivers)
  const errors = kept.filter((f) => f.severity === 'error')
  const warnings = kept.filter((f) => f.severity === 'warning')
  return { ok: errors.length === 0 && warnings.length === 0, errors, warnings, waived, metrics: metricsOf(ctx) }
}
