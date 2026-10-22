// Text views for authoring: the composed frame with rulers, its body changes against its base, bounding boxes, rows.
import { TRANSPARENT } from './spec.mjs'

const UNCHANGED = '·'
const PER_LINE = 8

function rulerLines(w) {
  const tens = Array.from({ length: w }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ')).join('')
  const ones = Array.from({ length: w }, (_, x) => String(x % 10)).join('')
  const marks = Array.from({ length: w }, (_, x) => (x % 5 === 0 ? '|' : ' ')).join('')
  return [`     ${tens}`, `     ${ones}`, `     ${marks}`]
}

// Rows on multiples of 5 carry a "-" tick so coordinates can be read without counting.
function gridLines(cells, w) {
  const lines = []
  for (let y = 0; y * w < cells.length; y++) {
    const tick = y % 5 === 0 ? '-' : ' '
    lines.push(`${String(y).padStart(3)}${tick} ${cells.slice(y * w, (y + 1) * w).join('')}`)
  }
  return [...rulerLines(w), ...lines]
}

export function showFrame(frame) {
  return [`frame ${frame.id} (${frame.phase}, ${frame.ms} ms)`, ...gridLines(frame.pixels, frame.w)].join('\n')
}

/**
 * The single bounding-box patch that turns `previous` into `current` (arrays of palette keys, row-major,
 * `w` wide): changed cells carry the new key ("." erases), unchanged ones a space. Null when nothing changed.
 */
export function diffPatch(previous, current, w) {
  const changed = current.flatMap((key, i) => (previous[i] === key ? [] : [i]))
  if (changed.length === 0) return null
  const xs = changed.map((i) => i % w)
  const ys = changed.map((i) => Math.floor(i / w))
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
  const [x1, y1] = [Math.max(...xs), Math.max(...ys)]
  const rows = Array.from({ length: y1 - y0 + 1 }, (_, dy) =>
    Array.from({ length: x1 - x0 + 1 }, (_, dx) => {
      const i = (y0 + dy) * w + x0 + dx
      return previous[i] === current[i] ? ' ' : current[i]
    }).join(''),
  )
  return { at: [x0, y0], rows }
}

/**
 * Body changes from the frame's `base` to the frame (effects excluded), a changed-cells grid, and the
 * single patch that rebuilds the frame's body from the base body without its layers or ops.
 */
export function diffFrames(base, current) {
  const changes = []
  current.body.forEach((key, i) => {
    if (base.body[i] !== key) changes.push({ x: i % current.w, y: Math.floor(i / current.w), from: base.body[i], to: key })
  })
  const header = `frame ${current.id} vs base ${base.id}: ${changes.length} body pixel(s) changed (${TRANSPARENT} = transparent; fx not compared)`
  if (changes.length === 0) return { changes, text: header }
  const describe = (c) => `${c.x},${c.y} ${c.from}→${c.to}`
  const listed = []
  for (let i = 0; i < changes.length; i += PER_LINE) listed.push(`  ${changes.slice(i, i + PER_LINE).map(describe).join('  ')}`)
  const cells = current.body.map((key, i) => (base.body[i] === key ? UNCHANGED : key))
  const patch = JSON.stringify(diffPatch(base.body, current.body, current.w))
  const text = [header, ...listed, 'changed cells:', ...gridLines(cells, current.w), `as one body patch on base ${base.id}:`, patch]
  return { changes, text: text.join('\n') }
}

/** Body bounding box per frame (`x0,y0–x1,y1 w×h`), or "empty". */
export function bboxLines(frames) {
  return frames.map((f) => {
    const drawn = f.body.flatMap((key, i) => (key === TRANSPARENT ? [] : [[i % f.w, Math.floor(i / f.w)]]))
    if (drawn.length === 0) return `${f.id}: empty`
    const xs = drawn.map(([x]) => x)
    const ys = drawn.map(([, y]) => y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    return `${f.id}: ${x0},${y0}–${x1},${y1} ${x1 - x0 + 1}×${y1 - y0 + 1}`
  })
}

/** The composed body as a JSON `rows` array, ready to paste when promoting a frame to a key frame. */
export function bodyRows(frame) {
  return JSON.stringify(Array.from({ length: frame.h }, (_, y) => frame.body.slice(y * frame.w, (y + 1) * frame.w).join('')))
}
