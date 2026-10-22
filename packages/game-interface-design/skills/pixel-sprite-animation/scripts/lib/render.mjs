// Raster outputs: frames, sheet, GIF previews, the review contact sheet, Aseprite-style JSON and credits.
import { feelSequence } from './feel.mjs'
import { encodeGif } from './gif.mjs'
import { hasKey, rgbOf, TRANSPARENT } from './spec.mjs'

const UNKNOWN_RGB = [255, 0, 255]
const WHITE = [255, 255, 255]
const END_HOLD_MS = 300
const CONTACT_MAX_EDGE = 1200
const CONTACT_GAP = 8
const CONTACT_LABEL = 14
// Image rows per frame: checkerboard, dark background, silhouette, onion skin (the bar sits below).
const CONTACT_ROWS = 4
const SHEET_BG = [168, 168, 176]
const DARK_BG = [24, 22, 32]
const LIGHT_BG = [242, 242, 242]
const SILHOUETTE = [30, 30, 40]
const ONION = [255, 170, 170]
const PHASE_RGB = {
  'anticipation': [59, 130, 246],
  'travel': [6, 182, 212],
  'smear': [217, 70, 239],
  'impact': [239, 68, 68],
  'follow-through': [245, 158, 11],
  'recovery': [34, 197, 94],
  'hold': [71, 85, 105],
  'idle': [20, 184, 166],
  'cycle': [20, 184, 166],
  'effect': [168, 85, 247],
}
// 3×5 digit glyphs, row-major, drawn for frame index and duration labels.
const DIGITS = [
  '111101101101111',
  '010110010010111',
  '111001111100111',
  '111001111001111',
  '101101111001001',
  '111100111001111',
  '111100111101111',
  '111001010010010',
  '111101111101111',
  '111101111001111',
]

class Raster {
  constructor(width, height, rgb = null) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height * 4)
    if (rgb) this.fill(0, 0, width, height, rgb)
  }

  fill(x0, y0, w, h, rgb) {
    for (let y = Math.max(0, y0); y < Math.min(this.height, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.width, x0 + w); x++) this.data.set([...rgb, 255], (y * this.width + x) * 4)
    }
  }

  blit(src, x0, y0) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const from = (y * src.width + x) * 4
        const inside = x0 + x >= 0 && y0 + y >= 0 && x0 + x < this.width && y0 + y < this.height
        if (inside && src.data[from + 3] > 0) this.data.set(src.data.subarray(from, from + 4), ((y0 + y) * this.width + x0 + x) * 4)
      }
    }
  }
}

function keyRgb(palette, key) {
  if (!hasKey(palette, key) || !palette[key]) return UNKNOWN_RGB
  return rgbOf(palette[key])
}

/** One frame as RGBA; `pad`, `dx`/`dy` and `flash` serve the feel preview, `pixels` picks a layer. */
export function frameRaster(frame, palette, options = {}) {
  const { scale = 1, pad = 0, dx = 0, dy = 0, flash = false, tint = null, pixels = frame.pixels } = options
  const raster = new Raster((frame.w + 2 * pad) * scale, (frame.h + 2 * pad) * scale)
  pixels.forEach((key, i) => {
    if (key === TRANSPARENT) return
    const x = (i % frame.w) + pad + dx
    const y = Math.floor(i / frame.w) + pad + dy
    raster.fill(x * scale, y * scale, scale, scale, tint ?? (flash ? WHITE : keyRgb(palette, key)))
  })
  return raster
}

export const frameFile = (index, id) => `${String(index).padStart(2, '0')}-${id}.png`

export function sheetRaster(spec, frames) {
  const [w, h] = spec.canvas
  const sheet = new Raster(w * frames.length, h)
  frames.forEach((f, i) => sheet.blit(frameRaster(f, spec.palette), i * w, 0))
  return sheet
}

function gifOf(rasters, delays) {
  const lookup = new Map()
  const palette = [[0, 0, 0]]
  const frames = rasters.map((raster, n) => {
    const indices = new Uint8Array(raster.width * raster.height)
    for (let i = 0; i < indices.length; i++) {
      if (raster.data[i * 4 + 3] === 0) continue
      const rgb = [...raster.data.subarray(i * 4, i * 4 + 3)]
      const key = rgb.join(',')
      if (!lookup.has(key)) {
        lookup.set(key, palette.length)
        palette.push(rgb)
      }
      indices[i] = lookup.get(key)
    }
    return { indices, delayCs: Math.max(2, Math.round(delays[n] / 10)) }
  })
  return encodeGif({ width: rasters[0].width, height: rasters[0].height, palette, frames })
}

function endHold(spec, delays) {
  if (spec.loop) return delays
  return delays.map((ms, i) => (i === delays.length - 1 ? ms + END_HOLD_MS : ms))
}

export function previewGif(spec, frames) {
  const rasters = frames.map((f) => frameRaster(f, spec.palette, { scale: spec.scale }))
  return gifOf(rasters, endHold(spec, frames.map((f) => f.ms)))
}

export function previewFeelGif(spec, frames) {
  const steps = feelSequence(spec, frames)
  const pad = Math.max(0, ...steps.map((s) => Math.max(Math.abs(s.dx), Math.abs(s.dy))))
  const rasters = steps.map((s) =>
    frameRaster(frames[s.index], spec.palette, { scale: spec.scale, pad, dx: s.dx, dy: s.dy, flash: s.flash }),
  )
  return gifOf(rasters, endHold(spec, steps.map((s) => s.ms)))
}

function drawNumber(raster, value, x0, y0, size) {
  ;[...String(value)].forEach((digit, n) => {
    const glyph = DIGITS[Number(digit)]
    for (let i = 0; i < 15; i++) {
      if (glyph[i] === '1') raster.fill(x0 + (n * 4 + (i % 3)) * size, y0 + Math.floor(i / 3) * size, size, size, [30, 30, 40])
    }
  })
}

function checker(width, height, size) {
  const raster = new Raster(width, height)
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const light = ((x + y) / size) % 2 === 0
      raster.fill(x, y, size, size, light ? [242, 242, 242] : [217, 217, 217])
    }
  }
  return raster
}

/**
 * Picks the largest cell scale (up to `maxScale`) that keeps the sheet within `CONTACT_MAX_EDGE`, so a
 * viewer that downsizes long edges to 1200 px still shows whole sprite pixels. `cols` frames per row.
 */
export function contactLayout(w, h, count, cols, maxScale) {
  const columns = Math.max(1, Math.min(cols, count))
  const blocks = Math.ceil(count / columns)
  const measure = (c) => {
    const bar = Math.max(6, c * 2)
    const blockH = CONTACT_LABEL + 4 + CONTACT_ROWS * (h * c + CONTACT_GAP) + bar + CONTACT_GAP
    const width = columns * (w * c + CONTACT_GAP) + CONTACT_GAP
    return { c, bar, blockH, columns, blocks, width, height: CONTACT_GAP + blocks * blockH }
  }
  for (let c = maxScale; c > 1; c--) {
    const layout = measure(c)
    if (Math.max(layout.width, layout.height) <= CONTACT_MAX_EDGE) return layout
  }
  return measure(1)
}

/**
 * Review sheet, `cols` frames per row (default 6). Each frame shows its index/ms label, the frame on a
 * checkerboard and on a dark background, its body silhouette (fx excluded), an onion skin (previous body
 * tinted under the current frame) and a duration bar colored by phase.
 */
export function contactSheet(spec, frames, { cols = 6 } = {}) {
  const [w, h] = spec.canvas
  const layout = contactLayout(w, h, frames.length, cols, Math.min(spec.scale, 8))
  const { c, bar, blockH, columns } = layout
  const [cellW, cellH] = [w * c, h * c]
  const sheet = new Raster(layout.width, layout.height, SHEET_BG)
  const maxMs = Math.max(...frames.map((f) => f.ms))
  frames.forEach((f, i) => {
    const x = CONTACT_GAP + (i % columns) * (cellW + CONTACT_GAP)
    const top = CONTACT_GAP + Math.floor(i / columns) * blockH
    const rowY = (n) => top + CONTACT_LABEL + 4 + n * (cellH + CONTACT_GAP)
    drawNumber(sheet, i, x, top, 2)
    drawNumber(sheet, f.ms, x + cellW - String(f.ms).length * 8, top, 2)
    sheet.blit(checker(cellW, cellH, c * 2), x, rowY(0))
    sheet.blit(frameRaster(f, spec.palette, { scale: c }), x, rowY(0))
    sheet.fill(x, rowY(1), cellW, cellH, DARK_BG)
    sheet.blit(frameRaster(f, spec.palette, { scale: c }), x, rowY(1))
    sheet.fill(x, rowY(2), cellW, cellH, LIGHT_BG)
    sheet.blit(frameRaster(f, spec.palette, { scale: c, tint: SILHOUETTE, pixels: f.body }), x, rowY(2))
    sheet.fill(x, rowY(3), cellW, cellH, LIGHT_BG)
    const previous = i > 0 ? frames[i - 1] : spec.loop && frames.at(-1)
    if (previous && previous !== f)
      sheet.blit(frameRaster(previous, spec.palette, { scale: c, tint: ONION, pixels: previous.body }), x, rowY(3))
    sheet.blit(frameRaster(f, spec.palette, { scale: c }), x, rowY(3))
    sheet.fill(x, rowY(4), cellW, bar, [208, 208, 208])
    sheet.fill(x, rowY(4), Math.max(c, Math.round((f.ms / maxMs) * cellW)), bar, PHASE_RGB[f.phase])
  })
  return sheet
}

function phaseTags(spec, frames) {
  const tags = [{ name: spec.name, from: 0, to: frames.length - 1, direction: 'forward' }]
  const seen = new Map()
  frames.forEach((f, i) => {
    const last = tags.at(-1)
    if (tags.length > 1 && last.phase === f.phase && last.to === i - 1) {
      last.to = i
      return
    }
    const count = (seen.get(f.phase) ?? 0) + 1
    seen.set(f.phase, count)
    tags.push({ name: count === 1 ? f.phase : `${f.phase}-${count}`, phase: f.phase, from: i, to: i, direction: 'forward' })
  })
  return tags.map(({ name, from, to, direction }) => ({ name, from, to, direction }))
}

/** Aseprite "json-array" sheet data, so engines and Aseprite importers read durations and phase tags. */
export function sheetJson(spec, frames) {
  const [w, h] = spec.canvas
  return {
    frames: frames.map((f, i) => ({
      filename: frameFile(i, f.id),
      frame: { x: i * w, y: 0, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      duration: f.ms,
    })),
    meta: {
      app: 'pixel-sprite (game-interface-design)',
      version: '1',
      image: 'sheet.png',
      format: 'RGBA8888',
      size: { w: w * frames.length, h },
      scale: '1',
      frameTags: phaseTags(spec, frames),
    },
  }
}

const sourceLabel = ({ name, via }) => (via === 'frame' ? name : `${name} (via ${via})`)

/** Declared sources with the frames that use them, then every frame with its effective sources. */
export function creditsText(spec, frames) {
  const anyUsed = frames.some((f) => f.sources.length > 0)
  if (spec.sources.length === 0 && !anyUsed)
    return `${spec.name}: no external sources declared; every frame is authored in the spec.\n`
  const sourceLines = spec.sources.map((s) => {
    const used = frames.filter((f) => f.sources.some((e) => e.name === s.name)).map((f) => f.id)
    const where = used.length > 0 ? used.join(', ') : 'not used by any frame'
    const generated = [s.prompt && `prompt "${s.prompt}"`, s.seed !== undefined && `seed ${s.seed}`].filter(Boolean)
    const extra = generated.length > 0 ? ` [${generated.join(', ')}]` : ''
    return `- ${s.name} by ${s.author || 'unknown author'} — ${s.license || 'NO LICENSE'} — ${s.url || 'no url'}${extra} (frames: ${where})`
  })
  const frameLines = frames.map((f) => {
    const listed = f.sources.length > 0 ? f.sources.map(sourceLabel).join(', ') : 'authored in the spec'
    return `- ${f.id}: ${listed}`
  })
  const declared = sourceLines.length > 0 ? sourceLines.join('\n') : '- no sources declared (lint L1 fails)'
  return `${spec.name} credits\n${declared}\nframes:\n${frameLines.join('\n')}\n`
}

const LICENSE_RGB = {
  open: [34, 197, 94],
  attribution: [59, 130, 246],
  copyleft: [245, 158, 11],
  generator: [168, 85, 247],
  restricted: [127, 29, 29],
  unknown: [239, 68, 68],
}
const BOARD_CELL = 96
const BOARD_COLS = 6

// Whole-number upscale for small images; images larger than the cell keep every n-th pixel instead.
function thumbnail(image) {
  const longest = Math.max(image.width, image.height)
  const step = Math.ceil(longest / BOARD_CELL)
  const scale = step > 1 ? 1 : Math.floor(BOARD_CELL / longest)
  const [w, h] = [Math.ceil(image.width / step), Math.ceil(image.height / step)]
  const thumb = new Raster(w * scale, h * scale)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * step * image.width + x * step) * 4
      if (image.data[at + 3] >= 128) thumb.fill(x * scale, y * scale, scale, scale, [...image.data.subarray(at, at + 3)])
    }
  }
  return thumb
}

/**
 * Candidate board: one cell per candidate with its index, the image scaled by a whole number to fit
 * 96 px on a checkerboard (empty when it failed to load), and a strip colored by license class.
 */
export function candidateBoard(items) {
  const columns = Math.max(1, Math.min(BOARD_COLS, items.length))
  const blockH = CONTACT_LABEL + 4 + BOARD_CELL + 4 + 8 + CONTACT_GAP
  const board = new Raster(
    CONTACT_GAP + columns * (BOARD_CELL + CONTACT_GAP),
    CONTACT_GAP + Math.ceil(items.length / columns) * blockH,
    SHEET_BG,
  )
  items.forEach((item, i) => {
    const x = CONTACT_GAP + (i % columns) * (BOARD_CELL + CONTACT_GAP)
    const top = CONTACT_GAP + Math.floor(i / columns) * blockH
    const cellY = top + CONTACT_LABEL + 4
    drawNumber(board, i, x, top, 2)
    board.blit(checker(BOARD_CELL, BOARD_CELL, 8), x, cellY)
    if (item.image) {
      const thumb = thumbnail(item.image)
      board.blit(thumb, x + Math.floor((BOARD_CELL - thumb.width) / 2), cellY + Math.floor((BOARD_CELL - thumb.height) / 2))
    }
    board.fill(x, cellY + BOARD_CELL + 4, BOARD_CELL, 8, LICENSE_RGB[item.licenseClass] ?? LICENSE_RGB.unknown)
  })
  return board
}
