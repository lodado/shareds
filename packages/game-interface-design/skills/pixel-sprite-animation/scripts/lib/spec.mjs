// Sprite spec v1: structural validation, defaults, and frame composition
// (base body → rows → body layers → ops → body patches → fx layers → fx patches).
import { existsSync, readFileSync } from 'node:fs'

import { UsageError } from './errors.mjs'

const PHASES = [
  'anticipation',
  'travel',
  'smear',
  'impact',
  'follow-through',
  'recovery',
  'hold',
  'idle',
  'cycle',
  'effect',
]
const TAGS = ['key', 'squash', 'stretch', 'airborne', 'flash', 'fx', 'blank']
const ANCHORS = ['bottom', 'center', 'top']
const DEFAULT_THRESHOLDS = {
  gap: 0.55,
  keyIoU: 0.85,
  volume: 0.25,
  identity: 0.6,
  startupMs: 100,
  telegraphMs: 300,
  contactMs: 250,
}
const REDUCED = { hitstopMs: ['hitstop', 'ms'], shakePx: ['shake', 'px'], flashFrames: ['flash', 'frames'] }
const ACTORS = ['player', 'enemy', 'neutral']
const KINDS = ['action', 'cycle', 'idle', 'effect']
const OPS = ['move', 'copy', 'flip', 'recolor', 'erase', 'scale']
const NAME = /^[a-z0-9][a-z0-9-]*$/
const FRAME_ID = /^[\w-]+$/
const HEX = /^#[0-9a-f]{6}$/i
export const TRANSPARENT = '.'

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
// Own keys only, so names like "constructor" never count as palette keys, parts or frames.
export const hasKey = (object, key) => isObject(object) && typeof key === 'string' && Object.hasOwn(object, key)
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max
const isIntList = (v, length) => Array.isArray(v) && v.length === length && v.every((n) => Number.isInteger(n))
const isPoint = (v) => isIntList(v, 2)
const isRect = (v) => isIntList(v, 4) && v[2] > 0 && v[3] > 0
const isRows = (v) => Array.isArray(v) && v.length > 0 && v.every((r) => typeof r === 'string')
const isText = (v) => typeof v === 'string' && v.trim().length > 0
const isHex = (v) => typeof v === 'string' && HEX.test(v)
const isFxFlag = (v) => v === undefined || typeof v === 'boolean'
const isPatch = (v) => isObject(v) && isPoint(v.at) && isRows(v.rows) && isFxFlag(v.fx)
const isSize = (v) => isIntList(v, 2) && v.every((n) => n > 0 && n <= 4096)
const isWaiver = (v) => isObject(v) && isText(v.rule)
const isShake = (v) => isObject(v) && typeof v.px === 'number' && v.px >= 0 && isInt(v.ms, 0, 5000)

export class SpecError extends Error {
  constructor(errors) {
    super(`invalid sprite spec:\n- ${errors.join('\n- ')}`)
    this.errors = errors
  }
}

export function rgbOf(hex) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
}

function paletteErrors(palette) {
  if (!isObject(palette)) return ['palette: expected an object of single-character keys']
  return Object.entries(palette).flatMap(([key, value]) => {
    if (key.length !== 1 || key === ' ') return [`palette["${key}"]: keys are single non-space characters`]
    if (key === TRANSPARENT) return value === null ? [] : ['palette["."]: "." is always transparent; map it to null']
    return isHex(value) ? [] : [`palette["${key}"]: expected "#rrggbb"`]
  })
}

function optionalErrors(spec) {
  const [w, h] = spec.canvas
  const keys = isObject(spec.palette) ? spec.palette : {}
  const checks = [
    [spec.maxColors === undefined || isInt(spec.maxColors, 1, 256), 'maxColors: integer 1–256'],
    [spec.loop === undefined || typeof spec.loop === 'boolean', 'loop: boolean'],
    [spec.baseline === undefined || isInt(spec.baseline, 0, h - 1), `baseline: row 0–${h - 1}`],
    [spec.outline === undefined || (spec.outline !== TRANSPARENT && hasKey(keys, spec.outline)), 'outline: a palette key'],
    [
      spec.outlineAlt === undefined || (Array.isArray(spec.outlineAlt) && spec.outlineAlt.every((k) => hasKey(keys, k))),
      'outlineAlt: palette keys',
    ],
    [spec.scale === undefined || isInt(spec.scale, 1, 16), 'scale: integer 1–16'],
    [spec.fps === undefined || isInt(spec.fps, 1, 240), 'fps: integer 1–240'],
    [w <= 256 && h <= 256, 'canvas: at most 256×256'],
  ]
  return checks.filter(([ok]) => !ok).map(([, message]) => message)
}

function thresholdErrors(thresholds) {
  if (thresholds === undefined) return []
  if (!isObject(thresholds)) return ['thresholds: expected an object']
  return Object.entries(thresholds).flatMap(([key, value]) => {
    if (key === 'reason') return typeof value === 'string' ? [] : ['thresholds.reason: string']
    if (!hasKey(DEFAULT_THRESHOLDS, key)) return [`thresholds.${key}: unknown threshold`]
    const ratio = ['gap', 'keyIoU', 'volume', 'identity'].includes(key)
    const ok = typeof value === 'number' && value > 0 && (!ratio || value <= 1)
    return ok ? [] : [`thresholds.${key}: ${ratio ? 'number in (0, 1]' : 'positive number'}`]
  })
}

function sourceErrors(sources) {
  if (sources === undefined) return []
  if (!Array.isArray(sources)) return ['sources: expected an array']
  const names = new Set()
  return sources.flatMap((source, i) => {
    if (!isObject(source) || !isText(source.name)) return [`sources[${i}].name: non-empty string`]
    if (names.has(source.name)) return [`sources[${i}].name: duplicate "${source.name}"`]
    names.add(source.name)
    const bad = ['author', 'license', 'url', 'prompt'].filter((k) => source[k] !== undefined && typeof source[k] !== 'string')
    const seedOk = source.seed === undefined || ['string', 'number'].includes(typeof source.seed)
    return [...bad.map((k) => `sources[${i}].${k}: string`), ...(seedOk ? [] : [`sources[${i}].seed: string or number`])]
  })
}

function partErrors(parts) {
  if (parts === undefined) return []
  if (!isObject(parts)) return ['parts: expected an object']
  return Object.entries(parts).flatMap(([name, part]) => {
    const where = `parts.${name}`
    if (!isObject(part) || !isRows(part.rows)) return [`${where}.rows: non-empty array of strings`]
    const errors = []
    if (new Set(part.rows.map((r) => r.length)).size !== 1) errors.push(`${where}.rows: rows must share one width`)
    if (part.pivot !== undefined && !isPoint(part.pivot)) errors.push(`${where}.pivot: [x, y] integers`)
    if (part.outline !== undefined && typeof part.outline !== 'boolean') errors.push(`${where}.outline: boolean`)
    if (part.source !== undefined && !isText(part.source)) errors.push(`${where}.source: non-empty string`)
    return errors
  })
}

const isKeyOrClear = (value, keys) => value === TRANSPARENT || hasKey(keys, value)

// Per-op field checks beyond the rect; each entry is [applies, valid, message].
function opFieldChecks(op, where, keys) {
  return [
    [op.op === 'move' || op.op === 'copy', isPoint(op.by), `${where}.by: [dx, dy] integers`],
    [op.op === 'flip', ['x', 'y'].includes(op.axis), `${where}.axis: "x" or "y"`],
    [op.op === 'scale', isSize(op.size), `${where}.size: [w, h] positive integers`],
    [op.op === 'scale', op.anchor === undefined || ANCHORS.includes(op.anchor), `${where}.anchor: one of ${ANCHORS.join(', ')}`],
    [op.op === 'recolor', isKeyOrClear(op.from, keys), `${where}.from: palette key or "."`],
    [op.op === 'recolor', isKeyOrClear(op.to, keys), `${where}.to: palette key or "."`],
  ]
}

// recolor may omit its rect (whole canvas); every other op needs one.
const rectIsValid = (op) => (op.op === 'recolor' && op.rect === undefined) || isRect(op.rect)

function opErrors(op, where, keys) {
  if (!isObject(op) || !OPS.includes(op.op)) return [`${where}.op: one of ${OPS.join(', ')}`]
  const rect = rectIsValid(op) ? [] : [`${where}.rect: [x, y, w, h] integers with w, h > 0`]
  const fields = opFieldChecks(op, where, keys).filter(([applies, valid]) => applies && !valid)
  return [...rect, ...fields.map(([, , message]) => message)]
}

function layerErrors(layer, where, parts) {
  if (!isObject(layer) || !hasKey(parts, layer.part)) return [`${where}.part: a key of parts`]
  const errors = []
  if (!isPoint(layer.at)) errors.push(`${where}.at: [x, y] integers`)
  if (layer.rot !== undefined && ![0, 90, 180, 270].includes(layer.rot)) errors.push(`${where}.rot: 0, 90, 180, 270`)
  if (layer.flip !== undefined && !['x', 'y'].includes(layer.flip)) errors.push(`${where}.flip: "x" or "y"`)
  if (!isFxFlag(layer.fx)) errors.push(`${where}.fx: boolean`)
  return errors
}

function listErrors(list, where, each) {
  if (list === undefined) return []
  if (!Array.isArray(list)) return [`${where}: expected an array`]
  return list.flatMap((item, i) => each(item, `${where}[${i}]`))
}

function frameHeaderErrors(frame, where, seen) {
  const validId = typeof frame.id === 'string' && FRAME_ID.test(frame.id)
  const checks = [
    [validId, `${where}.id: letters, digits, _ or -`],
    [!validId || !seen.has(frame.id), `${where}.id: duplicate "${frame.id}"`],
    [PHASES.includes(frame.phase), `${where}.phase: one of ${PHASES.join(', ')}`],
    [isInt(frame.ms, 1, 10000), `${where}.ms: integer 1–10000`],
    [
      frame.tags === undefined || (Array.isArray(frame.tags) && frame.tags.every((t) => TAGS.includes(t))),
      `${where}.tags: subset of ${TAGS.join(', ')}`,
    ],
    [frame.source === undefined || isText(frame.source), `${where}.source: non-empty string`],
  ]
  return checks.filter(([ok]) => !ok).map(([, message]) => message)
}

function frameBodyErrors(frame, where, seen) {
  const checks = [
    [frame.rows === undefined || frame.base === undefined, `${where}: use either rows or base, not both`],
    [frame.rows === undefined || isRows(frame.rows), `${where}.rows: non-empty array of strings`],
    [frame.base === undefined || seen.has(frame.base), `${where}.base: id of an earlier frame`],
  ]
  return checks.filter(([ok]) => !ok).map(([, message]) => message)
}

function frameErrors(frame, i, seen, spec) {
  const where = `frames[${i}]`
  if (!isObject(frame)) return [`${where}: expected an object`]
  const keys = isObject(spec.palette) ? spec.palette : {}
  return [
    ...frameHeaderErrors(frame, where, seen),
    ...frameBodyErrors(frame, where, seen),
    ...listErrors(frame.layers, `${where}.layers`, (layer, at) => layerErrors(layer, at, spec.parts)),
    ...listErrors(frame.ops, `${where}.ops`, (op, at) => opErrors(op, at, keys)),
    ...listErrors(frame.patch, `${where}.patch`, (patch, at) =>
      isPatch(patch) ? [] : [`${at}: { at: [x, y], rows: [...], fx?: boolean }`],
    ),
  ]
}

function feelErrors(feel) {
  if (feel === undefined) return []
  if (!isObject(feel)) return ['feel: expected an object']
  const checks = [
    [feel.hitstop === undefined || (isObject(feel.hitstop) && isInt(feel.hitstop.ms, 0, 2000)), 'feel.hitstop.ms'],
    [feel.shake === undefined || isShake(feel.shake), 'feel.shake: { px >= 0, ms }'],
    [feel.flash === undefined || (isObject(feel.flash) && isInt(feel.flash.frames, 0, 60)), 'feel.flash.frames'],
    [feel.knockbackPx === undefined || typeof feel.knockbackPx === 'number', 'feel.knockbackPx: number'],
    [feel.reduced === undefined || isObject(feel.reduced), 'feel.reduced: object'],
  ]
  const reduced = isObject(feel.reduced) ? reducedErrors(feel) : []
  return [...checks.filter(([ok]) => !ok).map(([, message]) => message), ...reduced]
}

// The reduced-effect variant may only tone the hit down: each value is a whole, non-negative number no
// larger than its full counterpart (a missing full effect counts as 0).
function reducedErrors(feel) {
  return Object.entries(feel.reduced).flatMap(([key, value]) => {
    if (!hasKey(REDUCED, key)) return [`feel.reduced.${key}: one of ${Object.keys(REDUCED).join(', ')}`]
    if (!Number.isInteger(value) || value < 0) return [`feel.reduced.${key}: whole number >= 0`]
    const [effect, field] = REDUCED[key]
    const full = feel[effect]?.[field] ?? 0
    return value <= full ? [] : [`feel.reduced.${key}: ${value} exceeds the full ${effect}.${field} ${full}`]
  })
}

function topLevelRefErrors(spec) {
  const ids = Array.isArray(spec.frames) ? spec.frames.map((f) => f?.id) : []
  const motion = spec.rootMotion
  const motionOk =
    motion === undefined ||
    (isObject(motion) &&
      ['dx', 'dy', 'liftPx'].every((k) => motion[k] === undefined || typeof motion[k] === 'number') &&
      ['curve', 'frames', 'note'].every((k) => motion[k] === undefined || typeof motion[k] === 'string'))
  const checks = [
    [spec.volumeRef === undefined || ids.includes(spec.volumeRef), 'volumeRef: id of a frame'],
    [motionOk, 'rootMotion: { dx?, dy?, liftPx? numbers; curve?, frames?, note? strings }'],
  ]
  return checks.filter(([ok]) => !ok).map(([, message]) => message)
}

/** Returns structural errors; content rules (colors, timing, motion) belong to the linter. */
export function validateSpec(spec) {
  if (!isObject(spec)) return ['spec: expected a JSON object']
  const errors = []
  if (spec.version !== 1) errors.push('version: must be 1')
  if (typeof spec.name !== 'string' || !NAME.test(spec.name)) errors.push('name: lowercase letters, digits and -')
  if (!(Array.isArray(spec.canvas) && spec.canvas.length === 2 && spec.canvas.every((n) => isInt(n, 1, 4096))))
    return [...errors, 'canvas: [width, height] positive integers']
  if (!ACTORS.includes(spec.actor)) errors.push(`actor: one of ${ACTORS.join(', ')}`)
  if (!KINDS.includes(spec.kind)) errors.push(`kind: one of ${KINDS.join(', ')}`)
  errors.push(
    ...paletteErrors(spec.palette),
    ...optionalErrors(spec),
    ...thresholdErrors(spec.thresholds),
    ...sourceErrors(spec.sources),
    ...partErrors(spec.parts),
    ...feelErrors(spec.feel),
    ...topLevelRefErrors(spec),
    ...listErrors(spec.waivers, 'waivers', (w, at) => (isWaiver(w) ? [] : [`${at}.rule: string`])),
  )
  if (!Array.isArray(spec.frames) || spec.frames.length === 0) return [...errors, 'frames: at least one frame']
  const seen = new Set()
  spec.frames.forEach((frame, i) => {
    errors.push(...frameErrors(frame, i, seen, spec))
    if (isObject(frame) && typeof frame.id === 'string') seen.add(frame.id)
  })
  return errors
}

/** Fills defaults after validation; the result is what lint and render read. */
export function normalizeSpec(spec) {
  const loopByKind = spec.kind === 'cycle' || spec.kind === 'idle'
  return {
    ...spec,
    maxColors: spec.maxColors ?? 16,
    loop: spec.loop ?? loopByKind,
    scale: spec.scale ?? 4,
    fps: spec.fps ?? 60,
    thresholds: { ...DEFAULT_THRESHOLDS, ...spec.thresholds },
    thresholdOverrides: Object.keys(spec.thresholds ?? {}).filter((k) => k !== 'reason'),
    sources: spec.sources ?? [],
    parts: spec.parts ?? {},
    feel: spec.feel ?? {},
    waivers: spec.waivers ?? [],
    outlineAlt: spec.outlineAlt ?? [],
  }
}

export function loadSpec(file) {
  if (!existsSync(file)) throw new UsageError(`spec file not found: ${file}`)
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  const errors = validateSpec(spec)
  if (errors.length > 0) throw new SpecError(errors)
  return normalizeSpec(spec)
}

// Applies flip first, then clockwise quarter turns; the pivot moves with its pixel.
export function transformPart(rows, pivot = [0, 0], rot = 0, flip = undefined) {
  let grid = rows.map((row) => [...row])
  let [px, py] = pivot
  if (flip === 'x') {
    grid = grid.map((row) => row.toReversed())
    px = grid[0].length - 1 - px
  }
  if (flip === 'y') {
    grid = grid.toReversed()
    py = grid.length - 1 - py
  }
  for (let turn = 0; turn < rot / 90; turn++) {
    const h = grid.length
    const w = grid[0].length
    const source = grid
    grid = Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => source[h - 1 - x][y]))
    const oldPy = py
    py = px
    px = h - 1 - oldPy
  }
  return { grid, pivot: [px, py] }
}

// Two layers per frame: the body (what metrics judge, and what `base` inherits) and an fx overlay drawn
// on top of it after every op, so ops never erase effects and effects never count as the character.
class Canvas {
  constructor(w, h, from) {
    this.w = w
    this.h = h
    this.body = from ? [...from.body] : Array.from({ length: w * h }).fill(TRANSPARENT)
    this.exempt = from ? Uint8Array.from(from.exempt) : new Uint8Array(w * h)
    this.fx = Array.from({ length: w * h }).fill(TRANSPARENT)
    this.clippedBy = new Map()
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  get(x, y) {
    if (!this.inside(x, y)) return { key: TRANSPARENT, exempt: 0 }
    const i = y * this.w + x
    return { key: this.body[i], exempt: this.exempt[i] }
  }

  // `source` names the layer/op/patch for lint H4 when a pixel lands outside the canvas; reads and
  // in-place edits pass none because they cannot lose pixels.
  set(x, y, key, exempt = 0, source = null) {
    if (!this.inside(x, y)) {
      if (source) this.clippedBy.set(source, (this.clippedBy.get(source) ?? 0) + 1)
      return
    }
    const i = y * this.w + x
    this.body[i] = key
    this.exempt[i] = key === TRANSPARENT ? 0 : exempt
  }

  setFx(x, y, key, source) {
    if (!this.inside(x, y)) {
      if (source) this.clippedBy.set(source, (this.clippedBy.get(source) ?? 0) + 1)
      return
    }
    this.fx[y * this.w + x] = key
  }

  cells([x0, y0, w, h]) {
    return Array.from({ length: w * h }, (_, i) => [x0 + (i % w), y0 + Math.floor(i / w)])
  }
}

function applyRows(canvas, rows, sizeErrors) {
  if (rows.length !== canvas.h) sizeErrors.push(`rows: ${rows.length} rows, canvas has ${canvas.h}`)
  rows.forEach((row, y) => {
    if (row.length !== canvas.w) sizeErrors.push(`rows[${y}]: ${row.length} columns, canvas has ${canvas.w}`)
    for (let x = 0; x < row.length; x++) canvas.set(x, y, row[x])
  })
}

function applyLayer(canvas, layer, parts, source) {
  const part = parts[layer.part]
  const { grid, pivot } = transformPart(part.rows, part.pivot, layer.rot ?? 0, layer.flip)
  const exempt = part.outline === false ? 1 : 0
  grid.forEach((row, y) =>
    row.forEach((key, x) => {
      if (key === TRANSPARENT) return
      const [cx, cy] = [layer.at[0] - pivot[0] + x, layer.at[1] - pivot[1] + y]
      if (layer.fx) canvas.setFx(cx, cy, key, source)
      else canvas.set(cx, cy, key, exempt, source)
    }),
  )
}

// Nearest-neighbor resample of the rect into `size`, horizontally centered on the rect and aligned to
// its bottom, center or top edge. A rough squash/stretch pass; clean the result up with `patch`.
function scaleRect(canvas, op, picked, source) {
  const [x0, y0, w, h] = op.rect
  const [w2, h2] = op.size
  const offsetY = { bottom: h - h2, center: Math.floor((h - h2) / 2), top: 0 }[op.anchor ?? 'bottom']
  const left = x0 + Math.floor((w - w2) / 2)
  for (let ty = 0; ty < h2; ty++) {
    for (let tx = 0; tx < w2; tx++) {
      const sx = Math.min(w - 1, Math.floor(((tx + 0.5) * w) / w2))
      const sy = Math.min(h - 1, Math.floor(((ty + 0.5) * h) / h2))
      const { key, exempt } = picked[sy * w + sx]
      if (key !== TRANSPARENT) canvas.set(left + tx, y0 + offsetY + ty, key, exempt, source)
    }
  }
}

function applyOp(canvas, op, source) {
  if (op.op === 'erase') {
    for (const [x, y] of canvas.cells(op.rect)) canvas.set(x, y, TRANSPARENT)
    return
  }
  if (op.op === 'recolor') {
    const rect = op.rect ?? [0, 0, canvas.w, canvas.h]
    for (const [x, y] of canvas.cells(rect)) {
      const { key, exempt } = canvas.get(x, y)
      if (key === op.from) canvas.set(x, y, op.to, exempt)
    }
    return
  }
  const cells = canvas.cells(op.rect)
  const picked = cells.map(([x, y]) => canvas.get(x, y))
  if (op.op === 'flip') {
    const [x0, y0, w, h] = op.rect
    cells.forEach(([x, y], i) => {
      const mirrorX = op.axis === 'x' ? x0 + w - 1 - (x - x0) : x
      const mirrorY = op.axis === 'y' ? y0 + h - 1 - (y - y0) : y
      // A drawn pixel mirrored past the canvas edge is lost, so it counts toward H4.
      const lost = picked[i].key === TRANSPARENT ? null : source
      canvas.set(mirrorX, mirrorY, picked[i].key, picked[i].exempt, lost)
    })
    return
  }
  // move, scale and copy paste only opaque pixels, like moving a selection over the layer below.
  if (op.op !== 'copy') for (const [x, y] of cells) canvas.set(x, y, TRANSPARENT)
  if (op.op === 'scale') {
    scaleRect(canvas, op, picked, source)
    return
  }
  cells.forEach(([x, y], i) => {
    if (picked[i].key !== TRANSPARENT) canvas.set(x + op.by[0], y + op.by[1], picked[i].key, picked[i].exempt, source)
  })
}

function applyPatch(canvas, patch, source) {
  patch.rows.forEach((row, y) =>
    [...row].forEach((key, x) => {
      if (key === ' ') return
      const [cx, cy] = [patch.at[0] + x, patch.at[1] + y]
      // Erasing outside the canvas loses nothing, so only drawn keys count toward H4.
      const drawn = key === TRANSPARENT ? null : source
      if (patch.fx) canvas.setFx(cx, cy, key, drawn)
      else canvas.set(cx, cy, key, 0, drawn)
    }),
  )
}

// Provenance: the frame's own source, then everything its base chain carries, then the parts it places.
function effectiveSources(frame, spec, base) {
  const found = new Map()
  if (frame.source) found.set(frame.source, 'frame')
  for (const { name } of base?.sources ?? []) if (!found.has(name)) found.set(name, `base ${base.id}`)
  for (const layer of frame.layers ?? []) {
    const name = spec.parts[layer.part]?.source
    if (name && !found.has(name)) found.set(name, `part ${layer.part}`)
  }
  return [...found].map(([name, via]) => ({ name, via }))
}

function composeFrame(frame, spec, base) {
  const [w, h] = spec.canvas
  const canvas = new Canvas(w, h, base)
  const sizeErrors = []
  const layers = (frame.layers ?? []).map((layer, i) => [layer, `layers[${i}] ${layer.part}`])
  const patches = (frame.patch ?? []).map((patch, i) => [patch, `patch[${i}]`])
  if (frame.rows) applyRows(canvas, frame.rows, sizeErrors)
  const ops = (frame.ops ?? []).map((op, i) => [op, `ops[${i}] ${op.op}`])
  for (const [layer, source] of layers.filter(([layer]) => !layer.fx)) applyLayer(canvas, layer, spec.parts, source)
  for (const [op, source] of ops) applyOp(canvas, op, source)
  for (const [patch, source] of patches.filter(([patch]) => !patch.fx)) applyPatch(canvas, patch, source)
  for (const [layer, source] of layers.filter(([layer]) => layer.fx)) applyLayer(canvas, layer, spec.parts, source)
  for (const [patch, source] of patches.filter(([patch]) => patch.fx)) applyPatch(canvas, patch, source)
  const clippedBy = [...canvas.clippedBy].map(([source, count]) => ({ source, count }))
  return {
    id: frame.id,
    phase: frame.phase,
    ms: frame.ms,
    tags: new Set(frame.tags ?? []),
    base: frame.base ?? null,
    source: frame.source,
    sources: effectiveSources(frame, spec, base),
    // `pixels` is what renders (fx on top of the body); metrics read `body`.
    pixels: canvas.body.map((key, i) => (canvas.fx[i] === TRANSPARENT ? key : canvas.fx[i])),
    body: canvas.body,
    exempt: canvas.exempt,
    clipped: clippedBy.reduce((sum, c) => sum + c.count, 0),
    clippedBy,
    sizeErrors,
    w,
    h,
  }
}

/** Composes every frame; `base` inherits an earlier frame's body only, never its effects. */
export function composeFrames(spec) {
  const byId = new Map()
  return spec.frames.map((frame) => {
    const composed = composeFrame(frame, spec, frame.base ? byId.get(frame.base) : undefined)
    byId.set(frame.id, composed)
    return composed
  })
}
