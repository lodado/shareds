// PNG frames (renders, sheet cells, cleaned generator output) → palette-locked spec draft for the same gates.
import { existsSync, readFileSync } from 'node:fs'
import { UsageError } from './errors.mjs'
import { decodePng } from './png.mjs'
import { diffPatch } from './show.mjs'
import { rgbOf, TRANSPARENT } from './spec.mjs'

const UNZOOM_HINT = 'unzoom it in the generator first, or pass --downscale N'
// Redmean distance under which two shades usually belong to one palette key; import maxError uses the same scale.
export const NEAR_COLOR = 24
const CLUSTER_LIMIT = 256

export const KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
export const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** Perceptual "redmean" RGB distance; 0 means an exact palette match. */
export function redmean(a, b) {
  const rMean = (a[0] + b[0]) / 2
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db)
}

function widestBox(boxes) {
  let best = { index: -1, range: 0, channel: 0 }
  boxes.forEach((box, index) => {
    if (box.length < 2) return
    for (let channel = 0; channel < 3; channel++) {
      const values = box.map((c) => c.rgb[channel])
      const range = Math.max(...values) - Math.min(...values)
      if (range > best.range) best = { index, range, channel }
    }
  })
  return best
}

/** Median cut over weighted colors (`Map<"r,g,b", count>`); returns at most `count` RGB triples. */
export function medianCut(colors, count) {
  const boxes = [[...colors].map(([key, weight]) => ({ rgb: key.split(',').map(Number), weight }))]
  while (boxes.length < count) {
    const { index, channel } = widestBox(boxes)
    if (index < 0) break
    const box = boxes[index].toSorted((a, b) => a.rgb[channel] - b.rgb[channel])
    const half = box.reduce((sum, c) => sum + c.weight, 0) / 2
    let seen = 0
    const cut = Math.min(box.length - 1, Math.max(1, box.findIndex((c) => (seen += c.weight) >= half) + 1))
    boxes.splice(index, 1, box.slice(0, cut), box.slice(cut))
  }
  return boxes.map((box) => {
    const total = box.reduce((sum, c) => sum + c.weight, 0)
    return [0, 1, 2].map((ch) => Math.round(box.reduce((sum, c) => sum + c.rgb[ch] * c.weight, 0) / total))
  })
}

function cropImage(image, x0, y0, w, h) {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * image.width + x0) * 4
    data.set(image.data.subarray(from, from + w * 4), y * w * 4)
  }
  return { width: w, height: h, data }
}

// "a-b" → [a, ..., b]; "r:c,r:c" → pairs. Used by --cols and --cells.
export function parseRange(text) {
  const [a, b = a] = text.split('-').map(Number)
  if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) throw new UsageError(`bad range "${text}"; use a-b`)
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

/** Cuts sheet cells: `grid` [w, h] with `row` (+ optional `cols`), or explicit `cells` [[row, col], ...]. */
export function sliceSheet(image, { grid, row, cols, cells }) {
  if (!grid) return [image]
  const [cw, ch] = grid
  const columns = Math.floor(image.width / cw)
  const picks = cells ?? (cols ?? Array.from({ length: columns }, (_, c) => c)).map((c) => [row, c])
  return picks.map(([r, c]) => {
    if ((r + 1) * ch > image.height || (c + 1) * cw > image.width) throw new Error(`cell ${r}:${c} is outside the ${image.width}×${image.height} sheet`)
    return cropImage(image, c * cw, r * ch, cw, ch)
  })
}

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))

// Pixel indices `a` and `b` match; fully transparent pixels match whatever RGB an exporter left behind them.
function samePixel(data, a, b) {
  if (data[a * 4 + 3] === 0 && data[b * 4 + 3] === 0) return true
  return [0, 1, 2, 3].every((c) => data[a * 4 + c] === data[b * 4 + c])
}

// Lengths of same-color runs that touch neither edge, across rows and columns; edge runs may be cut short.
function interiorRuns(image) {
  const { width, height, data } = image
  const runs = []
  const scan = (count, length, at) => {
    for (let line = 0; line < count; line++) {
      let start = 0
      for (let i = 1; i <= length; i++) {
        if (i < length && samePixel(data, at(line, i), at(line, i - 1))) continue
        if (start > 0 && i < length) runs.push(i - start)
        start = i
      }
    }
  }
  scan(height, width, (y, x) => y * width + x)
  scan(width, height, (x, y) => y * width + x)
  return runs
}

function uniformBlocks(image, k) {
  const { width, height, data } = image
  if (width % k !== 0 || height % k !== 0) return false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!samePixel(data, y * width + x, (y - (y % k)) * width + (x - (x % k)))) return false
    }
  }
  return true
}

/**
 * Largest integer k for which the image is made of aligned, uniform k×k blocks (1 for native pixel art).
 * Throws for upscales it cannot undo exactly: non-integer or mixed scales, or blocks off the grid.
 */
export function detectScale(image) {
  const runs = interiorRuns(image)
  if (runs.length === 0) return 1
  const common = runs.reduce(gcd)
  const shortest = runs.reduce((a, b) => Math.min(a, b))
  if (common === 1) {
    if (shortest >= 2) throw new Error(`every color run is 2+ px but they share no integer scale (non-integer or mixed upscale); ${UNZOOM_HINT}`)
    return 1
  }
  for (let k = common; k >= 2; k--) if (common % k === 0 && uniformBlocks(image, k)) return k
  throw new Error(`looks upscaled ×${common} but is not made of aligned ${common}×${common} blocks; ${UNZOOM_HINT}`)
}

/** Nearest-neighbor downscale for sources upscaled by an integer factor; samples each block's center. */
export function downscale(image, factor) {
  if (factor === 1) return image
  const width = Math.floor(image.width / factor)
  const height = Math.floor(image.height / factor)
  const data = new Uint8Array(width * height * 4)
  const mid = Math.floor(factor / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((y * factor + mid) * image.width + x * factor + mid) * 4
      data.set(image.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

/** Snaps one image to the palette; alpha below `alpha` becomes transparent. */
export function snapImage(image, entries, alpha) {
  let maxError = 0
  let offPalette = 0
  let semiAlpha = 0
  const rows = Array.from({ length: image.height }, (_, y) =>
    Array.from({ length: image.width }, (_, x) => {
      const i = (y * image.width + x) * 4
      const a = image.data[i + 3]
      if (a > 0 && a < 255) semiAlpha++
      if (a < alpha) return TRANSPARENT
      const rgb = [image.data[i], image.data[i + 1], image.data[i + 2]]
      let best = entries[0]
      let distance = Infinity
      for (const entry of entries) {
        const d = redmean(rgb, entry.rgb)
        if (d < distance) {
          best = entry
          distance = d
        }
      }
      if (distance > 0) offPalette++
      maxError = Math.max(maxError, distance)
      return best.key
    }).join(''),
  )
  return { rows, maxError: Math.round(maxError * 10) / 10, offPalette, semiAlpha }
}

/** Opaque colors (`Map<"r,g,b", count>`) across `images` ([{ image }]); alpha below `alpha` is skipped. */
export function opaqueColors(images, alpha) {
  const colors = new Map()
  for (const { image } of images) {
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3] < alpha) continue
      const key = `${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`
      colors.set(key, (colors.get(key) ?? 0) + 1)
    }
  }
  return colors
}

function paletteFor(option, colors) {
  const auto = /^auto:(\d+)$/.exec(option ?? 'auto:16')
  if (auto) {
    const count = Number(auto[1])
    if (count < 1 || count > KEYS.length) throw new UsageError(`auto palette size must be 1–${KEYS.length}`)
    return medianCut(colors, count).map((rgb, i) => ({ key: KEYS[i], rgb }))
  }
  if (!existsSync(option)) throw new UsageError(`--palette expects auto:N or a JSON file with a "palette" object; ${option} not found`)
  const source = JSON.parse(readFileSync(option, 'utf8')).palette ?? {}
  const entries = Object.entries(source)
    .filter(([key, hex]) => key !== TRANSPARENT && typeof hex === 'string')
    .map(([key, hex]) => ({ key, rgb: rgbOf(hex) }))
  if (entries.length === 0) throw new Error(`${option} has no palette colors`)
  return entries
}

// `factor` is a number or "auto"; auto measures the whole file before it is cut into cells.
function loadCells(file, options) {
  const image = decodePng(readFileSync(file))
  let factor = options.factor ?? 1
  if (factor === 'auto') {
    try {
      factor = detectScale(image)
    } catch (error) {
      throw new Error(`${file}: ${error.message}`)
    }
  }
  return sliceSheet(image, options).map((cell, index) => ({ file, cell: index, factor, image: downscale(cell, factor) }))
}

/**
 * Rewrites frames 1..n as `base` + one body patch. "previous" chains each frame to the one before, so an edit
 * to one patch moves every later frame; "first" bases each frame on the first, so every patch stands alone.
 */
function rebase(frames, diffBase, width) {
  if (!diffBase) return frames
  return frames.map((frame, i) => {
    if (i === 0) return frame
    const base = diffBase === 'first' ? frames[0] : frames[i - 1]
    const { rows, ...rest } = frame
    const patch = diffPatch(base.rows.join('').split(''), rows.join('').split(''), width)
    return { ...rest, base: base.id, ...(patch ? { patch: [patch] } : {}) }
  })
}

// One sources entry for --source; license, author and url stay empty strings until filled so L1 can fail.
export function sourceEntry({ source, license = '', author = '', url = '', prompt, seed }) {
  return { name: source, author, license, url, ...(prompt === undefined ? {} : { prompt }), ...(seed === undefined ? {} : { seed }) }
}

/**
 * Builds a spec draft from PNG files. Phases are placeholders ("hold", 100 ms) so the timing and phase
 * gates fail until the agent retimes the frames; `source` stamps provenance for the license gate. `actor`
 * is left out when not given, so the spec stays invalid until someone picks it.
 */
export function importFrames(files, options) {
  const { out, force = false, alpha = 128, source, name = 'imported', kind = 'action', actor } = options
  if (existsSync(out) && !force) throw new Error(`${out} exists; pass --force to overwrite it`)
  const images = files.flatMap((file) => loadCells(file, options))
  if (images.length === 0) throw new Error('no images to import')
  const { width, height } = images[0].image
  const odd = images.find(({ image }) => image.width !== width || image.height !== height)
  if (odd) throw new Error(`${odd.file} cell ${odd.cell} is ${odd.image.width}×${odd.image.height}; expected ${width}×${height}`)
  const colors = opaqueColors(images, alpha)
  if (colors.size === 0) throw new Error(`every imported pixel has alpha below ${alpha}; check the cells, or lower --alpha`)
  const entries = paletteFor(options.palette, colors)
  const report = []
  const drawn = images.map(({ file, cell, factor, image }, i) => {
    const id = `f${String(i).padStart(2, '0')}`
    const snapped = snapImage(image, entries, alpha)
    report.push({ id, file, cell, factor, maxError: snapped.maxError, offPalette: snapped.offPalette, semiAlpha: snapped.semiAlpha })
    return { id, phase: 'hold', ms: 100, ...(source ? { source } : {}), rows: snapped.rows }
  })
  const spec = {
    version: 1,
    name,
    canvas: [width, height],
    palette: Object.fromEntries([[TRANSPARENT, null], ...entries.map((e) => [e.key, toHex(e.rgb)])]),
    maxColors: Math.max(16, entries.length),
    ...(actor ? { actor } : {}),
    kind,
    ...(source ? { sources: [sourceEntry(options)] } : {}),
    frames: rebase(drawn, options.diffBase, width),
  }
  return { spec, report }
}

/**
 * Opaque colors across PNG files, most used first, and clusters of near-duplicate shades (redmean under
 * NEAR_COLOR, linked transitively) that usually belong to one palette key. Clusters cover the 256 most used.
 */
export function colorReport(files, alpha = 128) {
  const counts = opaqueColors(files.map((file) => ({ image: decodePng(readFileSync(file)) })), alpha)
  const colors = [...counts]
    .map(([key, count]) => ({ rgb: key.split(',').map(Number), count }))
    .toSorted((a, b) => b.count - a.count)
  const top = colors.slice(0, CLUSTER_LIMIT)
  const parent = top.map((_, i) => i)
  const root = (i) => {
    let r = i
    while (parent[r] !== r) r = parent[r]
    return r
  }
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) if (redmean(top[i].rgb, top[j].rgb) < NEAR_COLOR) parent[root(j)] = root(i)
  }
  const groups = Map.groupBy(top.map((c, i) => ({ hex: toHex(c.rgb), group: root(i) })), (c) => c.group)
  return {
    pixels: colors.reduce((sum, c) => sum + c.count, 0),
    colors: colors.map((c) => ({ hex: toHex(c.rgb), count: c.count })),
    clusters: [...groups.values()].filter((group) => group.length > 1).map((group) => group.map((c) => c.hex)),
    unclustered: colors.length - top.length,
  }
}
