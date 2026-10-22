// A file the user hands over mid-task: analyze it, snap it to the spec palette and merge it into the spec.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { UsageError } from './errors.mjs'
import { detectScale, downscale, KEYS, NEAR_COLOR, opaqueColors, redmean, snapImage, sourceEntry, toHex } from './import.mjs'
import { decodePng } from './png.mjs'
import { rgbOf, SpecError, TRANSPARENT, validateSpec } from './spec.mjs'

const ROLES = ['base', 'frame', 'part']
const ID = /^[\w-]+$/
const SOURCE_FIELDS = ['license', 'author', 'url', 'prompt', 'seed']

function readSpec(file) {
  if (!existsSync(file)) throw new UsageError(`spec file not found: ${file}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const errors = validateSpec(raw)
  if (errors.length > 0) throw new SpecError(errors)
  return raw
}

function scaleOf(image, factor, file) {
  if (factor !== 'auto') return factor
  try {
    return detectScale(image)
  } catch (error) {
    throw new Error(`${file}: ${error.message}`)
  }
}

function checkOptions({ role, id, at, after }) {
  if (!ROLES.includes(role)) throw new UsageError(`attach needs --as ${ROLES.join('|')}`)
  if (id !== undefined && !ID.test(id)) throw new UsageError('--id: letters, digits, _ or -')
  if (at !== undefined && role !== 'base') throw new UsageError('--at only applies to --as base')
  if (after !== undefined && role !== 'frame') throw new UsageError('--after only applies to --as frame')
}

// Colors with no palette entry within NEAR_COLOR get the next free key, up to the spec's maxColors.
function extendPalette(entries, image, alpha, maxColors) {
  const grown = [...entries]
  const added = []
  const used = new Set(entries.map((e) => e.key))
  const counted = [...opaqueColors([{ image }], alpha)].toSorted((a, b) => b[1] - a[1])
  for (const [text] of counted) {
    const rgb = text.split(',').map(Number)
    if (grown.some((e) => redmean(rgb, e.rgb) < NEAR_COLOR)) continue
    const key = [...KEYS].find((k) => !used.has(k))
    if (grown.length >= maxColors || key === undefined) throw new Error(`the file needs more colors than maxColors ${maxColors}; merge shades first (colors <png>) or raise maxColors`)
    used.add(key)
    grown.push({ key, rgb })
    added.push({ key, hex: toHex(rgb) })
  }
  return { entries: grown, added }
}

function snapped(image, raw, { alpha, paletteExtend }) {
  const entries = Object.entries(raw.palette)
    .filter(([key, hex]) => key !== TRANSPARENT && typeof hex === 'string')
    .map(([key, hex]) => ({ key, rgb: rgbOf(hex) }))
  const first = snapImage(image, entries, alpha)
  const lossy = first.maxError >= NEAR_COLOR
  if (!lossy) return { snap: first, added: [], refusal: null }
  if (!paletteExtend) {
    return { snap: first, added: [], refusal: `refusing a lossy snap: worst color error ${first.maxError} (24 or more means the palette lacks a color); pass --palette-extend to add the missing colors` }
  }
  const grown = extendPalette(entries, image, alpha, raw.maxColors ?? 16)
  return { snap: snapImage(image, grown.entries, alpha), added: grown.added, refusal: null }
}

function upsertSource(raw, options, id) {
  const name = options.source ?? `file-${id}`
  const fields = Object.fromEntries(SOURCE_FIELDS.filter((k) => options[k] !== undefined).map((k) => [k, options[k]]))
  raw.sources ??= []
  const existing = raw.sources.find((s) => s.name === name)
  if (existing) Object.assign(existing, fields)
  else raw.sources.push(sourceEntry({ source: name, ...fields }))
  return name
}

function uniqueFrameId(raw, wanted) {
  const taken = new Set(raw.frames.map((f) => f.id))
  if (wanted !== undefined) {
    if (taken.has(wanted)) throw new UsageError(`frame id "${wanted}" is already in the spec; pick another --id`)
    return wanted
  }
  let n = raw.frames.length
  while (taken.has(`f${String(n).padStart(2, '0')}`)) n++
  return `f${String(n).padStart(2, '0')}`
}

const placeholder = (id, source, rows) => ({ id, phase: 'hold', ms: 100, source, rows })

function mergeBase(raw, rows, options) {
  if (options.at === undefined) {
    const id = uniqueFrameId(raw, options.id ?? 'base')
    raw.frames.unshift(placeholder(id, upsertSource(raw, options, id), rows))
    return { id, action: `inserted base frame ${id} (rows) at the start` }
  }
  const frame = raw.frames.find((f) => f.id === options.at)
  if (!frame) throw new UsageError(`--at: no frame "${options.at}"; frames: ${raw.frames.map((f) => f.id).join(', ')}`)
  frame.rows = rows
  delete frame.base
  frame.source = upsertSource(raw, options, frame.id)
  return { id: frame.id, action: `replaced the rows of frame ${frame.id}; its layers, ops and patches still apply on top` }
}

function mergeFrame(raw, rows, options) {
  const id = uniqueFrameId(raw, options.id)
  const index = options.after === undefined ? raw.frames.length : raw.frames.findIndex((f) => f.id === options.after) + 1
  if (index === 0) throw new UsageError(`--after: no frame "${options.after}"; frames: ${raw.frames.map((f) => f.id).join(', ')}`)
  raw.frames.splice(index, 0, placeholder(id, upsertSource(raw, options, id), rows))
  return { id, action: `inserted frame ${id} (placeholder hold, 100 ms: retime it) at position ${index}` }
}

function mergePart(raw, rows, options, file) {
  const id = options.id ?? path.basename(file, '.png').toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')
  raw.parts ??= {}
  if (Object.hasOwn(raw.parts, id)) throw new UsageError(`part "${id}" is already in the spec; pick another --id`)
  const width = rows[0].length
  raw.parts[id] = { pivot: [Math.floor(width / 2), rows.length - 1], source: upsertSource(raw, options, id), rows }
  return { id, action: `added part ${id} with its pivot at center-bottom; place it with a layer` }
}

/**
 * Merges a PNG into the spec file in place (the previous file is kept as `<spec>.bak`). `base` writes the
 * rows of the first or `--at` frame, `frame` inserts a placeholder frame, `part` adds a part. The pixels
 * snap to the spec palette; a snap that would change colors visibly is refused unless `paletteExtend`
 * adds them. `dryRun` analyzes and reports without writing.
 */
export function attachFile(specFile, pngFile, options) {
  checkOptions(options)
  const { role, alpha = 128, factor = 'auto', dryRun = false } = options
  const raw = readSpec(specFile)
  const original = decodePng(readFileSync(pngFile))
  const scale = scaleOf(original, factor, pngFile)
  const image = downscale(original, scale)
  const colors = opaqueColors([{ image }], alpha).size
  if (colors === 0) throw new Error(`every pixel has alpha below ${alpha}; check the file, or lower --alpha`)
  const analysis = { size: [original.width, original.height], upscale: scale, nativeSize: [image.width, image.height], colors }
  const [cw, ch] = raw.canvas
  if (role !== 'part' && (image.width !== cw || image.height !== ch)) {
    throw new UsageError(`${image.width}×${image.height} does not match the ${cw}×${ch} canvas; crop it with import --grid, or attach it as a part`)
  }
  const { snap, added, refusal } = snapped(image, raw, { alpha, paletteExtend: options.paletteExtend })
  const report = { maxError: snap.maxError, offPalette: snap.offPalette, semiAlpha: snap.semiAlpha }
  if (refusal && !dryRun) throw new Error(refusal)
  if (refusal) return { analysis, report, added, refusal, written: false }
  for (const { key, hex } of added) raw.palette[key] = hex
  const merge = { base: mergeBase, frame: mergeFrame, part: mergePart }[role]
  const { id, action } = merge(raw, snap.rows, options, pngFile)
  if (!dryRun) {
    copyFileSync(specFile, `${specFile}.bak`)
    writeFileSync(specFile, `${JSON.stringify(raw, null, 2)}\n`)
  }
  return { analysis, report, added, refusal: null, id, action, written: !dryRun }
}
