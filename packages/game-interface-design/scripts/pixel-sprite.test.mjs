import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

import { collectCandidates } from '../skills/pixel-sprite-animation/scripts/lib/candidates.mjs'
import { feelReport, feelSequence } from '../skills/pixel-sprite-animation/scripts/lib/feel.mjs'
import { encodeGif } from '../skills/pixel-sprite-animation/scripts/lib/gif.mjs'
import { colorReport, detectScale, downscale, importFrames, medianCut, sliceSheet, snapImage } from '../skills/pixel-sprite-animation/scripts/lib/import.mjs'
import { licenseClass } from '../skills/pixel-sprite-animation/scripts/lib/license.mjs'
import { lintSprite } from '../skills/pixel-sprite-animation/scripts/lib/lint.mjs'
import { decodePng, encodePng } from '../skills/pixel-sprite-animation/scripts/lib/png.mjs'
import { contactLayout, contactSheet, creditsText, previewGif, sheetJson } from '../skills/pixel-sprite-animation/scripts/lib/render.mjs'
import { bboxLines, bodyRows, diffFrames, showFrame } from '../skills/pixel-sprite-animation/scripts/lib/show.mjs'
import { composeFrames, normalizeSpec, transformPart, validateSpec } from '../skills/pixel-sprite-animation/scripts/lib/spec.mjs'

// Risk: Low — offline pure helpers, a local file-writing CLI and a loopback HTTP server for candidate
// downloads; thresholds are tested at their boundaries.
const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const SKILL = path.join(PACKAGE, 'skills/pixel-sprite-animation')
const CLI = path.join(SKILL, 'scripts/pixel-sprite.mjs')
const EXAMPLE = path.join(SKILL, 'examples/knight-slash/sprite.json')
mkdirSync(path.join(PACKAGE, '.test-tmp'), { recursive: true })
const TMP = mkdtempSync(path.join(PACKAGE, '.test-tmp', 'pixel-sprite-'))
after(() => rmSync(TMP, { recursive: true, force: true }))

const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: PACKAGE, encoding: 'utf8' })
const BLANK = '........'
// 8×8 test figure: a closed 1-px outline around a 2-wide body, feet on row 7 (22 opaque pixels).
const STAND = ['........', '...kk...', '..kssk..', '..kssk..', '..kssk..', '..kkkk..', '..k..k..', '..k..k..']
// The upper body leans 1 px forward: 10 of 27 silhouette pixels change (37%), under the 55% gap rule.
const LEAN = ['........', '....kk..', '...kssk.', '...kssk.', '...kssk.', '...kkkk.', '..k..k..', '..k..k..']

// Row-major fill of an 8×8 grid, so overlap ratios can be set exactly: shape(4, 'kkk') paints cells 4–6.
function shape(start, keys) {
  const cells = Array.from({ length: 64 }).fill('.')
  for (let i = 0; i < keys.length; i++) cells[start + i] = keys[i]
  return Array.from({ length: 8 }, (_, y) => cells.slice(y * 8, y * 8 + 8).join(''))
}

function spec(overrides = {}) {
  return {
    version: 1,
    name: 'test',
    canvas: [8, 8],
    palette: { '.': null, 'k': '#101018', 's': '#7080b0', 'w': '#f0f0f0', 'y': '#ffe060' },
    actor: 'player',
    kind: 'action',
    frames: [
      { id: 'a', phase: 'anticipation', ms: 50, tags: ['key'], rows: STAND },
      { id: 'b', phase: 'anticipation', ms: 50, rows: STAND },
      { id: 'c', phase: 'impact', ms: 80, tags: ['key'], rows: LEAN },
      { id: 'd', phase: 'recovery', ms: 100, rows: STAND },
    ],
    ...overrides,
  }
}

function lint(raw) {
  const errors = validateSpec(raw)
  assert.deepEqual(errors, [], 'fixture spec must be structurally valid')
  const normalized = normalizeSpec(raw)
  return lintSprite(normalized, composeFrames(normalized))
}

const ruleIds = (findings) => findings.map((f) => f.rule)
const errorsOf = (raw) => ruleIds(lint(raw).errors)
const warningsOf = (raw) => ruleIds(lint(raw).warnings)
const composed = (raw) => composeFrames(normalizeSpec(raw))
const frameRows = (frame) => Array.from({ length: frame.h }, (_, y) => frame.pixels.slice(y * frame.w, (y + 1) * frame.w).join(''))

// --- PNG fixtures written independently of the encoder: any color type, any filter per row.
function filterRow(type, row, prev, bpp) {
  const above = prev ?? row.map(() => 0)
  return row.map((value, x) => {
    const left = x >= bpp ? row[x - bpp] : 0
    const upLeft = x >= bpp ? above[x - bpp] : 0
    const predictors = [0, left, above[x], (left + above[x]) >> 1, paethOf(left, above[x], upLeft)]
    return (value - predictors[type] + 256) & 0xFF
  })
}

function paethOf(a, b, c) {
  const p = a + b - c
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function writePng({ width, height, color, depth = 8, rows, plte, trns, filters = [0] }) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = depth
  header[9] = color
  const bpp = Math.max(1, ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color] * depth) >> 3)
  const raw = rows.flatMap((row, y) => {
    const type = filters[y % filters.length]
    return [type, ...filterRow(type, row, rows[y - 1], bpp)]
  })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    ...(plte ? [pngChunk('PLTE', Buffer.from(plte))] : []),
    ...(trns ? [pngChunk('tRNS', Buffer.from(trns))] : []),
    pngChunk('IDAT', deflateSync(Buffer.from(raw))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// A PNG whose header claims `width`×`height` but whose data is tiny: the decoder must judge it from the header.
function headerOnlyPng(width, height) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// --- GIF reader used only to check the encoder: header, delays, transparency and LZW pixels.
function lzwDecode(bytes, minCodeSize, count) {
  const clear = 1 << minCodeSize
  let codeSize = minCodeSize + 1
  let table = []
  const reset = () => {
    table = Array.from({ length: clear + 2 }, (_, i) => [i])
    codeSize = minCodeSize + 1
  }
  reset()
  const out = []
  let bit = 0
  let previous = null
  const read = () => {
    let code = 0
    for (let i = 0; i < codeSize; i++, bit++) code |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i
    return code
  }
  for (let code = read(); out.length < count && code !== clear + 1; code = read()) {
    if (code === clear) {
      reset()
      previous = null
    } else {
      const entry = code < table.length ? table[code] : [...previous, previous[0]]
      out.push(...entry)
      if (previous) table.push([...previous, entry[0]])
      if (table.length === 1 << codeSize && codeSize < 12) codeSize++
      previous = entry
    }
  }
  return out
}

// Joins the length-prefixed sub-blocks starting at `offset`; returns the bytes and the offset after the terminator.
function subBlockData(buffer, offset) {
  const data = []
  let at = offset
  while (buffer[at] !== 0) {
    data.push(...buffer.subarray(at + 1, at + 1 + buffer[at]))
    at += buffer[at] + 1
  }
  return { data, next: at + 1 }
}

function readGif(buffer) {
  assert.equal(buffer.toString('ascii', 0, 6), 'GIF89a')
  const width = buffer.readUInt16LE(6)
  const height = buffer.readUInt16LE(8)
  let offset = 13 + 3 * (1 << ((buffer[10] & 7) + 1))
  const frames = []
  let control = null
  let loops = false
  while (buffer[offset] !== 0x3B) {
    const isExtension = buffer[offset] === 0x21
    const label = buffer[offset + 1]
    if (isExtension && label === 0xF9) control = { delayCs: buffer.readUInt16LE(offset + 4), transparent: buffer[offset + 3] & 1 }
    if (isExtension && label === 0xFF) loops = buffer.toString('ascii', offset + 3, offset + 14) === 'NETSCAPE2.0'
    const { data, next } = subBlockData(buffer, isExtension ? offset + 2 : offset + 11)
    if (!isExtension) frames.push({ ...control, indices: lzwDecode(data, buffer[offset + 10], width * height) })
    offset = next
  }
  return { width, height, loops, frames }
}

describe('PNG codec as the reader and writer of sprite frames', () => {
  it('to be byte-identical after an RGBA round trip', () => {
    const data = Uint8Array.from({ length: 3 * 2 * 4 }, (_, i) => (i * 37) % 256)
    const decoded = decodePng(encodePng({ width: 3, height: 2, data }))
    assert.deepEqual({ ...decoded, data: [...decoded.data] }, { width: 3, height: 2, data: [...data] })
  })

  it('to be the same RGBA for RGB rows written with every filter type', () => {
    const rows = [
      [10, 20, 30, 200, 100, 50],
      [11, 22, 33, 199, 98, 47],
      [0, 0, 0, 255, 255, 255],
      [5, 250, 5, 250, 5, 250],
      [90, 80, 70, 60, 50, 40],
    ]
    const png = writePng({ width: 2, height: 5, color: 2, rows, filters: [0, 1, 2, 3, 4] })
    const expected = rows.flatMap((r) => [r[0], r[1], r[2], 255, r[3], r[4], r[5], 255])
    assert.deepEqual([...decodePng(png).data], expected)
  })

  it('to be palette colors with tRNS alpha for a 2-bit indexed image', () => {
    // Four 2-bit pixels in one byte: indices 0, 1, 2, 3.
    const png = writePng({
      width: 4,
      height: 1,
      color: 3,
      depth: 2,
      rows: [[0b00011011]],
      plte: [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255],
      trns: [0],
    })
    assert.deepEqual([...decodePng(png).data], [0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255])
  })

  it('to be expanded gray for 1-bit grayscale and gray+alpha', () => {
    const gray1 = writePng({ width: 2, height: 1, color: 0, depth: 1, rows: [[0b10000000]] })
    assert.deepEqual([...decodePng(gray1).data], [255, 255, 255, 255, 0, 0, 0, 255])
    const grayAlpha = writePng({ width: 1, height: 1, color: 4, rows: [[128, 64]] })
    assert.deepEqual([...decodePng(grayAlpha).data], [128, 128, 128, 64])
  })

  it('to be the high byte of each 16-bit RGBA sample', () => {
    const png = writePng({ width: 1, height: 1, color: 6, depth: 16, rows: [[0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xFF, 0xFF]] })
    assert.deepEqual([...decodePng(png).data], [0x12, 0x56, 0x9A, 0xFF])
  })

  it('to be a clear error for interlaced and non-PNG input', () => {
    const png = writePng({ width: 1, height: 1, color: 2, rows: [[1, 2, 3]] })
    png[8 + 8 + 12] = 1
    assert.throws(() => decodePng(png), /interlaced PNG is not supported/)
    assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG file/)
  })

  it('to be refused from the header when it has no pixels or more than 4096×4096', () => {
    assert.throws(() => decodePng(headerOnlyPng(0, 0)), /PNG has no pixels/)
    assert.throws(() => decodePng(headerOnlyPng(5000, 5000)), /images above 16777216 pixels are refused/)
    assert.equal(decodePng(writePng({ width: 1, height: 1, color: 6, rows: [[1, 2, 3, 255]] })).width, 1)
  })

  it('to be refused when the compressed data inflates past what the header allows', () => {
    const bomb = headerOnlyPng(1, 1)
    const idat = bomb.indexOf('IDAT') - 4
    const chunk = pngChunk('IDAT', deflateSync(Buffer.alloc(1_000_000)))
    const forged = Buffer.concat([bomb.subarray(0, idat), chunk, pngChunk('IEND', Buffer.alloc(0))])
    assert.throws(() => decodePng(forged), /larger than|Cannot create/)
  })
})

describe('GIF encoder as the preview writer', () => {
  it('to be decodable frames with their delays, transparency and an infinite loop', () => {
    const indices = [Uint8Array.from([0, 1, 1, 2, 2, 2]), Uint8Array.from([2, 2, 1, 1, 0, 0])]
    const gif = encodeGif({
      width: 3,
      height: 2,
      palette: [
        [0, 0, 0],
        [255, 0, 0],
        [0, 0, 255],
      ],
      frames: indices.map((frame, i) => ({ indices: frame, delayCs: [5, 13][i] })),
    })
    const decoded = readGif(gif)
    assert.equal(decoded.loops, true)
    assert.deepEqual(
      decoded.frames.map((f) => ({ delayCs: f.delayCs, transparent: f.transparent, indices: f.indices })),
      [
        { delayCs: 5, transparent: 1, indices: [0, 1, 1, 2, 2, 2] },
        { delayCs: 13, transparent: 1, indices: [2, 2, 1, 1, 0, 0] },
      ],
    )
  })

  it('to be lossless when the LZW table fills and clears on a 256-color frame', () => {
    let seed = 7
    const indices = Uint8Array.from({ length: 96 * 96 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % 256
    })
    const palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, i])
    const decoded = readGif(encodeGif({ width: 96, height: 96, palette, frames: [{ indices, delayCs: 10 }] }))
    assert.deepEqual(decoded.frames[0].indices, [...indices])
  })
})

describe('frame composition as base → rows → layers → ops → patch', () => {
  it('to be a clockwise turn that carries the pivot pixel along', () => {
    const { grid, pivot } = transformPart(['ab', 'cd', 'ef'], [1, 2], 90)
    assert.deepEqual(grid.map((r) => r.join('')), ['eca', 'fdb'])
    assert.deepEqual(pivot, [0, 1])
    assert.equal(grid[pivot[1]][pivot[0]], 'f')
  })

  it('to be mirrored before turning when flip and rot are combined', () => {
    const { grid, pivot } = transformPart(['ab', 'cd'], [0, 0], 90, 'x')
    assert.deepEqual(grid.map((r) => r.join('')), ['db', 'ca'])
    assert.equal(grid[pivot[1]][pivot[0]], 'a')
  })

  it('to be a layer placed by its pivot, with outline-free parts marked exempt', () => {
    const raw = spec({
      parts: { blade: { pivot: [0, 1], outline: false, rows: ['.w', 'ww'] } },
      frames: [{ id: 'a', phase: 'idle', ms: 100, layers: [{ part: 'blade', at: [3, 4] }] }],
      kind: 'idle',
    })
    const [frame] = composed(raw)
    assert.deepEqual(frameRows(frame).slice(3, 5), ['....w...', '...ww...'])
    assert.equal(frame.exempt[4 * 8 + 3], 1)
  })

  it('to be a patch that keeps spaces and erases dots on top of a base frame', () => {
    const raw = spec({
      kind: 'idle',
      frames: [
        { id: 'a', phase: 'idle', ms: 100, rows: STAND },
        { id: 'b', phase: 'idle', ms: 120, base: 'a', patch: [{ at: [2, 2], rows: ['. w'] }] },
      ],
    })
    assert.equal(frameRows(composed(raw)[1])[2], '...swk..')
  })

  it('to be a move that clears its source and pastes only opaque pixels', () => {
    const raw = spec({
      kind: 'idle',
      frames: [
        { id: 'a', phase: 'idle', ms: 100, rows: ['ww......', '.w......', ...Array.from({ length: 6 }).fill(BLANK)] },
        { id: 'b', phase: 'idle', ms: 120, base: 'a', ops: [{ op: 'move', rect: [0, 0, 2, 2], by: [1, 0] }] },
      ],
    })
    // The rect's transparent corner is not pasted, so the shifted shape keeps its hole.
    assert.deepEqual(frameRows(composed(raw)[1]).slice(0, 2), ['.ww.....', '..w.....'])
  })

  it('to be copy, flip, recolor and erase acting only inside their rects', () => {
    const base = ['kw......', 's.......', ...Array.from({ length: 6 }).fill(BLANK)]
    const after = (ops) => frameRows(composed(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: base, ops }] }))[0]).slice(0, 2)
    assert.deepEqual(after([{ op: 'copy', rect: [0, 0, 2, 2], by: [4, 0] }]), ['kw..kw..', 's...s...'])
    assert.deepEqual(after([{ op: 'flip', rect: [0, 0, 2, 2], axis: 'x' }]), ['wk......', '.s......'])
    assert.deepEqual(after([{ op: 'recolor', from: 'k', to: '.' }]), ['.w......', 's.......'])
    assert.deepEqual(after([{ op: 'recolor', rect: [1, 0, 1, 1], from: 'k', to: 's' }]), ['kw......', 's.......'])
    assert.deepEqual(after([{ op: 'erase', rect: [0, 1, 1, 1] }]), ['kw......', '........'])
  })

  it('to be ops that run after layers and count pixels pushed off the canvas', () => {
    const raw = spec({
      kind: 'idle',
      parts: { dot: { rows: ['w'] } },
      frames: [{ id: 'a', phase: 'idle', ms: 100, layers: [{ part: 'dot', at: [6, 0] }], ops: [{ op: 'move', rect: [6, 0, 1, 1], by: [3, 0] }] }],
    })
    const [frame] = composed(raw)
    assert.equal(frame.clipped, 1)
    assert.equal(frame.pixels.includes('w'), false)
    assert.deepEqual(warningsOf(raw).filter((r) => r === 'H4'), ['H4'])
  })

  it('to be no H4 when the moved pixel stays on the canvas', () => {
    const raw = spec({
      kind: 'idle',
      parts: { dot: { rows: ['w'] } },
      frames: [{ id: 'a', phase: 'idle', ms: 100, layers: [{ part: 'dot', at: [6, 0] }], ops: [{ op: 'move', rect: [6, 0, 1, 1], by: [1, 0] }] }],
    })
    assert.deepEqual([composed(raw)[0].clipped, warningsOf(raw).filter((r) => r === 'H4')], [0, []])
  })

  it('to be H4 for a drawn patch key past the edge but not for an erasing dot there', () => {
    const patched = (rows) => composed(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND, patch: [{ at: [7, 0], rows }] }] }))[0]
    assert.deepEqual([patched(['.w']).clipped, patched(['w.']).clipped], [1, 0])
  })

  it('to be H4 for a flip whose rect mirrors a drawn pixel past the edge', () => {
    const row = ['......w.', ...Array.from({ length: 7 }).fill(BLANK)]
    const flipped = (rect) => spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: row, ops: [{ op: 'flip', rect, axis: 'x' }] }] })
    // Rect x 6–9: the pixel at x 6 lands on x 9, outside the 8-wide canvas. Rect x 4–7 keeps it at x 5.
    assert.deepEqual(lint(flipped([6, 0, 4, 1])).warnings.map((f) => f.message), ['1 pixel(s) fell outside the canvas from ops[0] flip (1)'])
    assert.deepEqual([composed(flipped([4, 0, 4, 1]))[0].clipped, frameRows(composed(flipped([4, 0, 4, 1]))[0])[0]], [0, '.....w..'])
  })
})

describe('spec validation as the structural gate before lint', () => {
  it('to be one message per structural defect, including missing actor and bad op fields', () => {
    const raw = spec({
      actor: null,
      frames: [
        { id: 'a', phase: 'anticipation', ms: 50, rows: STAND, base: 'a' },
        { id: 'a', phase: 'wiggle', ms: 0, ops: [{ op: 'move', rect: [0, 0, 0, 1] }] },
      ],
    })
    assert.deepEqual(validateSpec(raw), [
      'actor: one of player, enemy, neutral',
      'frames[0]: use either rows or base, not both',
      'frames[0].base: id of an earlier frame',
      'frames[1].id: duplicate "a"',
      'frames[1].phase: one of anticipation, travel, smear, impact, follow-through, recovery, hold, idle, cycle, effect',
      'frames[1].ms: integer 1–10000',
      'frames[1].ops[0].rect: [x, y, w, h] integers with w, h > 0',
      'frames[1].ops[0].by: [dx, dy] integers',
    ])
  })

  it('to be feel.reduced values that are whole, non-negative and no larger than the full effect', () => {
    const full = { hitstop: { ms: 83, scope: 'presentation' }, shake: { px: 2, ms: 120 }, flash: { frames: 1 } }
    const reduced = (values) => validateSpec(spec({ feel: { ...full, reduced: values } }))
    assert.deepEqual(reduced({ hitstopMs: 83, shakePx: 0, flashFrames: 1 }), [])
    assert.deepEqual(reduced({ hitstopMs: 84, shakePx: -1, flashFrames: 0.5, glowPx: 0 }), [
      'feel.reduced.hitstopMs: 84 exceeds the full hitstop.ms 83',
      'feel.reduced.shakePx: whole number >= 0',
      'feel.reduced.flashFrames: whole number >= 0',
      'feel.reduced.glowPx: one of hitstopMs, shakePx, flashFrames',
    ])
    assert.deepEqual(validateSpec(spec({ feel: { reduced: { shakePx: 1 } } })), ['feel.reduced.shakePx: 1 exceeds the full shake.px 0'])
  })

  it('to be volumeRef naming a frame, rootMotion with typed fields, and typed generator provenance', () => {
    assert.deepEqual(validateSpec(spec({ volumeRef: 'c', rootMotion: { dx: 6, liftPx: 10, curve: 'ease-out' } })), [])
    assert.deepEqual(validateSpec(spec({ volumeRef: 'z', rootMotion: { dx: '6' } })), [
      'volumeRef: id of a frame',
      'rootMotion: { dx?, dy?, liftPx? numbers; curve?, frames?, note? strings }',
    ])
    const source = (extra) => validateSpec(spec({ sources: [{ name: 'gen', author: 'me', license: 'plan terms', url: '', ...extra }] }))
    assert.deepEqual([source({ prompt: 'knight slash', seed: 42 }), source({ prompt: 3, seed: [1] })], [
      [],
      ['sources[0].prompt: string', 'sources[0].seed: string or number'],
    ])
  })

  it('to be inherited object keys rejected as unknown thresholds and reduced effects', () => {
    assert.deepEqual(validateSpec(spec({ thresholds: { constructor: 1, reason: 'x' } })), ['thresholds.constructor: unknown threshold'])
    assert.deepEqual(validateSpec(spec({ feel: { reduced: { toString: 0 } } })), ['feel.reduced.toString: one of hitstopMs, shakePx, flashFrames'])
  })
})

describe('hygiene rules as pixel gates', () => {
  it('to be H1 for a key missing from the palette and clean when every key is known', () => {
    const rows = [...STAND.slice(0, 7), '..q..k..']
    assert.deepEqual(errorsOf(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows }] })), ['H1'])
    assert.deepEqual(errorsOf(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND }] })), [])
  })

  it('to be H2 one color past maxColors and clean at the limit', () => {
    assert.deepEqual(errorsOf(spec({ maxColors: 1 })).filter((r) => r === 'H2'), ['H2'])
    assert.deepEqual(errorsOf(spec({ maxColors: 2 })).filter((r) => r === 'H2'), [])
  })

  it('to be H3 for a missing row or a short column, and clean at canvas size', () => {
    const one = (rows) => lint(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows }] })).errors
    assert.deepEqual(one(STAND.slice(1)).map((f) => [f.rule, f.message]), [['H3', 'rows: 7 rows, canvas has 8']])
    const narrow = [...STAND.slice(0, 2), '..kssk.', ...STAND.slice(3)]
    assert.deepEqual(one(narrow).map((f) => [f.rule, f.message]), [['H3', 'rows[2]: 7 columns, canvas has 8']])
    assert.deepEqual(one(STAND), [])
  })

  it('to be H5 for a floating pixel except in smear frames, fx frames and effect sprites', () => {
    const dusty = ['y.......', ...STAND.slice(1)]
    assert.deepEqual(warningsOf(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: dusty }] })), ['H5'])
    assert.deepEqual(warningsOf(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, tags: ['fx'], rows: dusty }] })), [])
    assert.deepEqual(warningsOf(spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms: 100, rows: dusty }] })), [])
    const [a, b, c, d] = spec().frames
    const smear = spec({ frames: [a, b, { id: 's', phase: 'smear', ms: 33, rows: dusty }, c, d] })
    assert.deepEqual([...errorsOf(smear), ...warningsOf(smear)], [])
  })

  it('to be H6 above 10% non-outline edge, cleared by outlineAlt or an outline-free part', () => {
    // 2 of 16 edge pixels (12.5%) are light, just over the 10% limit.
    const open = ['........', '...ww...', '..kssk..', '..kssk..', '..kssk..', '..kkkk..', '..k..k..', '..k..k..']
    const base = { kind: 'idle', outline: 'k' }
    assert.deepEqual(warningsOf(spec({ ...base, frames: [{ id: 'a', phase: 'idle', ms: 100, rows: open }] })), ['H6'])
    assert.deepEqual(warningsOf(spec({ ...base, outlineAlt: ['w'], frames: [{ id: 'a', phase: 'idle', ms: 100, rows: open }] })), [])
    const parts = { cap: { outline: false, rows: ['ww'] } }
    const layered = [{ id: 'a', phase: 'idle', ms: 100, rows: STAND, layers: [{ part: 'cap', at: [3, 1] }] }]
    assert.deepEqual(warningsOf(spec({ ...base, parts, frames: layered })), [])
    for (const tag of ['fx', 'flash']) {
      assert.deepEqual(warningsOf(spec({ ...base, frames: [{ id: 'a', phase: 'idle', ms: 100, tags: [tag], rows: open }] })), [], tag)
    }
  })

  it('to be H6 clean at exactly 10% of the edge and flagged just above it', () => {
    // A 7×5 box has 20 edge pixels; 2 light ones are 10%, 3 are 15%.
    const box = (top) => [BLANK, BLANK, top, 'ksssssk.', 'ksssssk.', 'ksssssk.', 'kkkkkkk.', BLANK]
    const edge = (top) => warningsOf(spec({ kind: 'idle', outline: 'k', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: box(top) }] }))
    assert.deepEqual([edge('kwwkkkk.'), edge('kwwwkkk.')], [[], ['H6']])
  })

  it('to be H7 when grounded feet leave the baseline, unless airborne or fx', () => {
    const lifted = [...STAND.slice(1), BLANK]
    const frames = (tags) => [{ id: 'a', phase: 'idle', ms: 100, tags, rows: lifted }]
    assert.deepEqual(errorsOf(spec({ kind: 'idle', baseline: 7, frames: frames([]) })), ['H7'])
    assert.deepEqual(errorsOf(spec({ kind: 'idle', baseline: 7, frames: frames(['airborne']) })), [])
    assert.deepEqual(errorsOf(spec({ kind: 'idle', baseline: 7, frames: frames(['fx']) })), [])
  })

  it('to be H8 for an empty frame unless it is tagged blank', () => {
    const empty = Array.from({ length: 8 }).fill(BLANK)
    const raw = (tags) => spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms: 100, tags, rows: empty }] })
    assert.deepEqual(errorsOf(raw([])), ['H8'])
    assert.deepEqual(errorsOf(raw(['blank'])), [])
  })
})

describe('motion rules as timing and pose gates', () => {
  it('to be clean for the fixture action', () => {
    const report = lint(spec())
    assert.deepEqual({ errors: report.errors, warnings: report.warnings, ok: report.ok }, { errors: [], warnings: [], ok: true })
  })

  it('to be M1 for uniform timing: an error in actions, a warning in idles, nothing in cycles', () => {
    const even = (kind, phase) => spec({ kind, frames: ['a', 'b'].map((id) => ({ id, phase, ms: 100, rows: STAND })) })
    assert.deepEqual(errorsOf(even('action', 'anticipation')).filter((r) => r === 'M1'), ['M1'])
    assert.deepEqual(warningsOf(even('idle', 'idle')), ['M1'])
    assert.deepEqual([...errorsOf(even('cycle', 'cycle')), ...warningsOf(even('cycle', 'cycle'))], [])
  })

  it('to be M2 for a missing impact, a late anticipation and a smear that leads nowhere', () => {
    const base = spec().frames
    const noImpact = spec({ frames: base.map((f) => ({ ...f, phase: f.phase === 'impact' ? 'hold' : f.phase })) })
    assert.deepEqual(lint(noImpact).errors.map((f) => [f.rule, f.message]), [['M2', 'no impact frame']])
    const late = spec({ frames: [...base, { id: 'e', phase: 'anticipation', ms: 30, rows: STAND }] })
    assert.deepEqual(lint(late).errors.map((f) => [f.rule, f.frame]), [['M2', 'e']])
    const smear = spec({ frames: [base[0], base[2], { id: 's', phase: 'smear', ms: 33, rows: LEAN }, base[3]] })
    assert.deepEqual(lint(smear).errors.map((f) => [f.rule, f.frame]), [['M2', 's']])
  })

  it('to be M2 for a foreign phase, a contact without wind-up and a hold before contact, and clean in order', () => {
    const [a, b, c, d] = spec().frames
    const m2 = (frames) => lint(spec({ frames })).errors.filter((f) => f.rule === 'M2').map((f) => [f.frame, f.message])
    assert.deepEqual(m2([a, b, c, { ...d, phase: 'idle' }]), [['d', 'phase idle does not belong in an action']])
    assert.deepEqual(m2([c, d]), [['c', 'no anticipation before the first impact']])
    assert.deepEqual(m2([a, { id: 'h', phase: 'hold', ms: 40, rows: STAND }, c, d]), [['h', 'hold before the impact']])
    assert.deepEqual(m2([a, b, c, d]), [])
  })

  it('to be M3 one millisecond past the player startup budget and clean at 100 ms', () => {
    const at = (ms) => spec({ frames: [{ ...spec().frames[0], ms: 50 }, { ...spec().frames[1], ms }, ...spec().frames.slice(2)] })
    assert.deepEqual(errorsOf(at(50)), [])
    assert.deepEqual(errorsOf(at(51)), ['M3'])
  })

  it('to be M3 for an enemy telegraph under 300 ms and clean at 300 ms', () => {
    const at = (ms) => spec({ actor: 'enemy', frames: [{ ...spec().frames[0], ms: 150 }, { ...spec().frames[1], ms }, ...spec().frames.slice(2)] })
    assert.deepEqual(errorsOf(at(149)), ['M3'])
    assert.deepEqual(errorsOf(at(150)), [])
  })

  it('to be no M3 for a neutral actor whose wind-up would fail the player budget', () => {
    const slow = (actor) => spec({ actor, frames: spec().frames.map((f) => (f.id === 'a' ? { ...f, ms: 450 } : f)) })
    assert.deepEqual([errorsOf(slow('player')), errorsOf(slow('neutral'))], [['M3'], []])
  })

  it('to be M4 for a teleport between frames but not across a smear', () => {
    const far = ['......kk', '......kk', ...Array.from({ length: 6 }).fill(BLANK)]
    const near = ['kk......', 'kk......', ...Array.from({ length: 6 }).fill(BLANK)]
    const pair = (phase) => spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms: 60, rows: near }, { id: 'b', phase, ms: 90, rows: far }] })
    assert.deepEqual(lint(pair('effect')).warnings.map((f) => [f.rule, f.frame]), [['M4', 'a→b']])
    assert.deepEqual(warningsOf(pair('smear')).filter((r) => r === 'M4'), [])
  })

  it('to be M4 clean at exactly 55% of the silhouette and flagged at 60%', () => {
    // 14 cells against 15 cells sharing 9: 11 of 20 change (55%); against 14 cells sharing 8: 12 of 20 (60%).
    const step = (next) =>
      warningsOf(spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms: 60, rows: shape(0, 'k'.repeat(14)) }, { id: 'b', phase: 'effect', ms: 90, rows: next }] }))
    assert.deepEqual([step(shape(5, 'k'.repeat(15))), step(shape(6, 'k'.repeat(14)))], [[], ['M4']])
  })

  it('to be M5 when wind-up and contact share one silhouette, and clean for distinct poses', () => {
    const frames = spec().frames.map((f) => ({ ...f, rows: STAND }))
    // b→c is the last wind-up against the contact; a→c are consecutive `key` frames.
    assert.deepEqual(lint(spec({ frames })).warnings.map((f) => [f.rule, f.frame]), [
      ['M5', 'b→c'],
      ['M5', 'a→c'],
    ])
    assert.deepEqual(warningsOf(spec()).filter((r) => r === 'M5'), [])
  })

  it('to be M5 at exactly 85% shared silhouette and clean at 80%', () => {
    // 18 cells against 19 cells sharing 17 of 20 (85%); against 18 cells sharing 16 of 20 (80%).
    const keys = (next) =>
      warningsOf(
        spec({
          kind: 'effect',
          frames: [
            { id: 'a', phase: 'effect', ms: 60, tags: ['key'], rows: shape(0, 'k'.repeat(18)) },
            { id: 'b', phase: 'effect', ms: 90, tags: ['key'], rows: next },
          ],
        }),
      )
    assert.deepEqual([keys(shape(1, 'k'.repeat(19))), keys(shape(2, 'k'.repeat(18)))], [['M5'], []])
  })

  // A w×h block of fill on the ground row; `extra` widens its top row.
  const areaBlock = (w, h, extra = '') => [
    ...Array.from({ length: 8 - h }).fill(BLANK),
    ...Array.from({ length: h }, (_, y) => ('s'.repeat(w) + (y === 0 ? extra : '')).padEnd(8, '.')),
  ]

  it('to be M6 only when a squash frame changes area by more than 25%', () => {
    // A 4×5 block (20 px) against 5×5 (25 px, exactly +25%) and 5×5 plus one pixel (26 px, +30%).
    const squash = (rows) =>
      spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: areaBlock(4, 5) }, { id: 'b', phase: 'idle', ms: 120, tags: ['squash'], rows }] })
    assert.deepEqual(warningsOf(squash(areaBlock(5, 5))), [])
    assert.deepEqual(warningsOf(squash(areaBlock(5, 5, 's'))), ['M6'])
  })

  it('to be M6 measured against volumeRef instead of the first plain frame', () => {
    // a is 20 px, r is 25 px; the 26 px squash is +30% against a but +4% against r.
    const frames = [
      { id: 'a', phase: 'idle', ms: 100, rows: areaBlock(4, 5) },
      { id: 'r', phase: 'idle', ms: 110, rows: areaBlock(5, 5) },
      { id: 'b', phase: 'idle', ms: 120, tags: ['squash'], rows: areaBlock(5, 5, 's') },
    ]
    assert.deepEqual([warningsOf(spec({ kind: 'idle', frames })), warningsOf(spec({ kind: 'idle', volumeRef: 'r', frames }))], [['M6'], []])
  })

  it('to be M7 when contact plus hitstop shows for under 60 ms', () => {
    const contact = (ms) => spec({ frames: spec().frames.map((f) => (f.id === 'c' ? { ...f, ms } : f)) })
    assert.deepEqual(warningsOf(contact(59)), ['M7'])
    assert.deepEqual(warningsOf(contact(60)), [])
  })

  it('to be M7 counting hitstop toward the contact hold: 40 + 19 ms flagged, 40 + 20 ms clean', () => {
    const held = (ms) =>
      warningsOf(
        spec({
          frames: spec().frames.map((f) => (f.id === 'c' ? { ...f, ms: 40 } : f)),
          feel: { hitstop: { ms, scope: 'presentation' }, reduced: {} },
        }),
      ).filter((r) => r === 'M7')
    assert.deepEqual([held(19), held(20)], [['M7'], []])
  })

  it('to be M8 at four flashes in one second and clean at three', () => {
    const flashes = (count) =>
      spec({
        kind: 'effect',
        frames: Array.from({ length: count }, (_, i) => [
          { id: `f${i}`, phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
          { id: `g${i}`, phase: 'effect', ms: 150 + i, rows: STAND },
        ])
          .flat()
          .concat([{ id: 'rest', phase: 'effect', ms: 1000, rows: STAND }]),
      })
    assert.deepEqual(errorsOf(flashes(3)), [])
    assert.deepEqual(errorsOf(flashes(4)), ['M8'])
  })

  it('to be M8 when feel.flash at contact adds the fourth flash in a second', () => {
    const frames = [
      { id: 'f0', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
      { id: 'g0', phase: 'effect', ms: 150, rows: STAND },
      { id: 'f1', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
      { id: 'g1', phase: 'effect', ms: 151, rows: STAND },
      { id: 'f2', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
      { id: 'hit', phase: 'impact', ms: 152, rows: STAND },
      { id: 'rest', phase: 'effect', ms: 1000, rows: STAND },
    ]
    // Tagged flashes start at 0, 200 and 401 ms; the contact flash would add a fourth at 451 ms.
    const flash = (count) => errorsOf(spec({ kind: 'effect', frames, feel: { flash: { frames: count }, reduced: {} } }))
    assert.deepEqual([flash(0), flash(1)], [[], ['M8']])
  })

  it('to be M8 across the loop seam when a short loop repeats its flashes', () => {
    // Flashes start at 0 and 100 ms; a 400 ms loop puts four starts inside one second, a 1200 ms loop two.
    const looped = (restMs) =>
      errorsOf(
        spec({
          kind: 'effect',
          frames: [
            { id: 'f0', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
            { id: 'g0', phase: 'effect', ms: 50, rows: STAND },
            { id: 'f1', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
            { id: 'rest', phase: 'effect', ms: restMs, rows: STAND },
          ],
        }),
      )
    assert.deepEqual([looped(250), looped(1050)], [['M8'], []])
  })

  it('to be one flash, not two, when a flash-tagged contact frame also gets feel.flash', () => {
    // Tagged flashes start at 0 and 200 ms; the flash-tagged contact at 401 ms and feel.flash share that instant.
    const frames = [
      { id: 'f0', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
      { id: 'g0', phase: 'effect', ms: 150, rows: STAND },
      { id: 'f1', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
      { id: 'g1', phase: 'effect', ms: 151, rows: STAND },
      { id: 'hit', phase: 'impact', ms: 152, tags: ['flash'], rows: STAND },
      { id: 'g2', phase: 'effect', ms: 50, rows: STAND },
      { id: 'f3', phase: 'effect', ms: 50, tags: ['flash'], rows: STAND },
      { id: 'rest', phase: 'effect', ms: 1000, rows: STAND },
    ]
    // With f3 flashing too, starts at 0, 200, 401 and 603 ms are four in one second.
    const flashFrames = (list) => errorsOf(spec({ kind: 'effect', frames: list, feel: { flash: { frames: 1 }, reduced: {} } }))
    assert.deepEqual(flashFrames(frames.map((f) => (f.id === 'f3' ? { ...f, tags: [] } : f))), [])
    assert.deepEqual(flashFrames(frames), ['M8'])
  })

  it('to be M11 when a player waits more than 250 ms of travel and smear after the wind-up', () => {
    const [a, b, c, d] = spec().frames
    const flight = (ms) => spec({ frames: [a, b, { id: 'go', phase: 'smear', ms: 50, rows: LEAN }, { id: 'air', phase: 'travel', ms, rows: LEAN }, c, d] })
    assert.deepEqual([warningsOf(flight(200)), lint(flight(201)).warnings.map((f) => [f.rule, f.frame, f.message])], [
      [],
      [['M11', 'c', '251 ms of travel and smear before contact exceeds 250 ms']],
    ])
    assert.deepEqual(warningsOf(spec({ actor: 'enemy', frames: [{ ...a, ms: 300 }, b, { id: 'air', phase: 'travel', ms: 400, rows: LEAN }, c, d] })), [])
    const normalized = normalizeSpec(flight(201))
    const composedFrames = composeFrames(normalized)
    // Contact starts after 50 + 50 ms of wind-up, a 50 ms smear and 201 ms of travel.
    assert.deepEqual([lintSprite(normalized, composedFrames).metrics.timeToContactMs, feelReport(normalized, composedFrames).timeToContactMs], [351, 351])
  })

  it('to be M9 under one 60 fps tick and under the 20 ms GIF floor', () => {
    const timed = (ms) => spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms, rows: STAND }, { id: 'b', phase: 'effect', ms: 100, rows: STAND }] })
    assert.deepEqual(lint(timed(16)).warnings.map((f) => f.message), ['16 ms is shorter than one 17 ms tick'])
    assert.deepEqual(lint(timed(17)).warnings.map((f) => f.message), ['17 ms is under the 20 ms GIF minimum'])
    assert.deepEqual(warningsOf(timed(20)), [])
  })

  it('to be M10 when a neighbor shares under 60% of the color histogram', () => {
    const recolored = STAND.map((row) => row.replaceAll('s', 'w').replaceAll('k', 'y'))
    const drift = spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND }, { id: 'b', phase: 'idle', ms: 130, rows: recolored }] })
    assert.deepEqual(lint(drift).warnings.map((f) => [f.rule, f.frame]), [['M10', 'a→b'], ['M10', 'b→a']])
    // One recolored pixel keeps 21 of 22 pixels' colors (95%), well above 60%.
    const touched = [...STAND.slice(0, 2), '..kswk..', ...STAND.slice(3)]
    const kept = spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND }, { id: 'b', phase: 'idle', ms: 130, rows: touched }] })
    assert.deepEqual(warningsOf(kept), [])
  })

  it('to be M10 clean at exactly 60% shared colors and flagged at 50%', () => {
    // Ten outline cells against six outline + four fill (60%) and five + five (50%).
    const pair = (next) =>
      warningsOf(spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms: 60, rows: shape(0, 'k'.repeat(10)) }, { id: 'b', phase: 'effect', ms: 90, rows: next }] }))
    assert.deepEqual([pair(shape(0, 'kkkkkkssss')), pair(shape(0, 'kkkkksssss'))], [[], ['M10']])
  })
})

describe('feel and record rules as engine and provenance gates', () => {
  const feel = (value) => spec({ feel: { reduced: { shakePx: 0 }, ...value } })

  it('to be F1 at 32 and 201 ms of hitstop and clean at 33 and 200 ms', () => {
    const at = (ms) => warningsOf(feel({ hitstop: { ms, scope: 'presentation' } }))
    assert.deepEqual([at(32), at(33), at(200), at(201)], [['F1'], [], [], ['F1']])
  })

  it('to be F2, F3 and F4 for an unscoped hitstop, sub-pixel shake and no reduced alternative', () => {
    assert.deepEqual(errorsOf(feel({ hitstop: { ms: 50 } })), ['F2'])
    assert.deepEqual(errorsOf(feel({ shake: { px: 1.5, ms: 80 } })), ['F3'])
    assert.deepEqual(errorsOf(spec({ feel: { shake: { px: 2, ms: 80 } } })), ['F4'])
    assert.deepEqual(errorsOf(feel({ hitstop: { ms: 50, scope: 'simulation' }, shake: { px: 2, ms: 80 } })), [])
  })

  it('to be F4 for hitstop alone and for a contact flash alone', () => {
    assert.deepEqual(errorsOf(spec({ feel: { hitstop: { ms: 50, scope: 'presentation' } } })), ['F4'])
    assert.deepEqual(errorsOf(spec({ feel: { flash: { frames: 1 } } })), ['F4'])
  })

  it('to be L1 for a frame source without a licensed entry', () => {
    const frames = spec().frames.map((f) => ({ ...f, source: 'lpc' }))
    const withSource = (sources) => errorsOf(spec({ frames, sources }))
    assert.deepEqual(withSource(undefined), ['L1', 'L1', 'L1', 'L1'])
    assert.deepEqual(withSource([{ name: 'lpc', author: 'A', license: ' ', url: 'u' }]), ['L1', 'L1', 'L1', 'L1'])
    assert.deepEqual(withSource([{ name: 'lpc', author: 'A', license: 'CC-BY-SA 3.0', url: 'u' }]), [])
  })

  it('to be a feel preview of one flash tick, a hitstop freeze and a decaying whole-pixel shake', () => {
    const raw = spec({
      feel: { hitstop: { ms: 83, scope: 'presentation' }, shake: { px: 2, ms: 120 }, flash: { frames: 1 }, reduced: {} },
    })
    const normalized = normalizeSpec(raw)
    const steps = feelSequence(normalized, composeFrames(normalized)).map((s) => [s.index, s.ms, s.dx, s.dy, s.flash])
    // Contact (frame c, 80 ms) holds 80 + 83 ms: 40 ms shake steps at amplitude 2, 1, 1, then the rest still.
    assert.deepEqual(steps, [
      [0, 50, 0, 0, false],
      [1, 50, 0, 0, false],
      [2, 20, 0, 0, true],
      [2, 40, 2, 0, false],
      [2, 40, -1, 0, false],
      [2, 40, 0, 1, false],
      [2, 43, 0, 0, false],
      [3, 100, 0, 0, false],
    ])
  })

  it('to be credits that name each source with its license, url and frames', () => {
    const raw = spec({
      frames: spec().frames.map((f) => (f.id === 'a' ? { ...f, source: 'lpc' } : f)),
      sources: [
        { name: 'lpc', author: 'LPC contributors', license: 'CC-BY-SA 3.0', url: 'https://example.test/lpc' },
        { name: 'spare', author: 'Someone', license: 'CC0', url: 'https://example.test/spare' },
      ],
    })
    const normalized = normalizeSpec(raw)
    assert.equal(
      creditsText(normalized, composeFrames(normalized)),
      [
        'test credits',
        '- lpc by LPC contributors — CC-BY-SA 3.0 — https://example.test/lpc (frames: a)',
        '- spare by Someone — CC0 — https://example.test/spare (frames: not used by any frame)',
        'frames:',
        '- a: lpc',
        '- b: authored in the spec',
        '- c: authored in the spec',
        '- d: authored in the spec',
        '',
      ].join('\n'),
    )
  })

  it('to be provenance that flows through base chains and placed parts into L1 and credits', () => {
    const [a, , c, d] = spec().frames
    const raw = (sources) =>
      spec({
        parts: { tip: { rows: ['w'], source: 'gen' } },
        sources,
        frames: [{ ...a, source: 'lpc' }, { id: 'b', phase: 'anticipation', ms: 50, base: 'a' }, { ...c, layers: [{ part: 'tip', at: [0, 0] }] }, d],
      })
    assert.deepEqual(lint(raw(undefined)).errors.map((f) => [f.frame, f.message]), [
      ['a', 'source "lpc" has no sources entry with a license'],
      ['b', 'source "lpc" (via base a) has no sources entry with a license'],
      ['c', 'source "gen" (via part tip) has no sources entry with a license'],
    ])
    const licensed = raw([
      { name: 'lpc', author: 'LPC', license: 'CC-BY-SA 3.0', url: 'u1' },
      { name: 'gen', author: 'Generator', license: 'generator plan terms', url: 'u2' },
    ])
    assert.deepEqual(errorsOf(licensed), [])
    const normalized = normalizeSpec(licensed)
    const frameLines = creditsText(normalized, composeFrames(normalized)).split('frames:\n')[1]
    assert.equal(frameLines, '- a: lpc\n- b: lpc (via base a)\n- c: gen (via part tip)\n- d: authored in the spec\n')
  })

  it('to be T0 for a threshold override without a reason', () => {
    assert.deepEqual(errorsOf(spec({ thresholds: { startupMs: 160 } })), ['T0'])
    assert.deepEqual(errorsOf(spec({ thresholds: { startupMs: 160, reason: 'charged heavy attack' } })), [])
  })

  it('to be a waiver that moves a warning aside, W0 without a reason and W1 when stale', () => {
    const contact = spec().frames.map((f) => (f.id === 'c' ? { ...f, ms: 40 } : f))
    const waived = lint(spec({ frames: contact, waivers: [{ rule: 'M7', frame: 'c', reason: 'jab: contact is the next frame' }] }))
    assert.deepEqual(
      [ruleIds(waived.errors), ruleIds(waived.warnings), ruleIds(waived.waived), waived.waived[0].reason],
      [[], [], ['M7'], 'jab: contact is the next frame'],
    )
    assert.deepEqual(errorsOf(spec({ frames: contact, waivers: [{ rule: 'M7' }] })), ['W0'])
    // A stale waiver is an error so it cannot survive delivery.
    const stale = lint(spec({ waivers: [{ rule: 'M4', reason: 'old' }] }))
    assert.deepEqual([ruleIds(stale.errors), ruleIds(stale.warnings), stale.ok], [['W1'], [], false])
  })

  it('to be ok only with zero errors and zero unwaived warnings', () => {
    const warned = lint(spec({ frames: spec().frames.map((f) => (f.id === 'c' ? { ...f, ms: 40 } : f)) }))
    assert.deepEqual([ruleIds(warned.errors), ruleIds(warned.warnings), warned.ok], [[], ['M7'], false])
    assert.equal(lint(spec()).ok, true)
  })
})

describe('travel phase as the airborne or lunge segment between wind-up and contact', () => {
  const [a, b, c, d] = spec().frames
  const jump = [
    { ...a, id: 'crouch', tags: ['key', 'squash'] },
    { id: 'takeoff', phase: 'smear', ms: 33, rows: LEAN },
    { id: 'rise', phase: 'travel', ms: 66, tags: ['airborne'], rows: LEAN },
    { id: 'apex', phase: 'travel', ms: 100, tags: ['airborne'], rows: STAND },
    { id: 'fall', phase: 'smear', ms: 33, rows: LEAN },
    { ...c, id: 'slam' },
    { id: 'squash', phase: 'follow-through', ms: 66, rows: STAND },
    { ...d, id: 'settle' },
    { id: 'rest', phase: 'hold', ms: 140, rows: STAND },
  ]
  const m2 = (frames) => lint(spec({ frames })).errors.filter((f) => f.rule === 'M2').map((f) => [f.frame, f.message])

  it('to be a clean order for wind-up, take-off smear, travel, arrival smear, contact and settle', () => {
    assert.deepEqual([...errorsOf(spec({ frames: jump })), ...warningsOf(spec({ frames: jump }))], [])
  })

  it('to be M2 for travel before the wind-up, wind-up after travel, and flight after contact', () => {
    assert.deepEqual(m2([jump[2], ...jump.slice(0, 2), ...jump.slice(3)]), [['rise', 'travel before the first anticipation']])
    assert.deepEqual(m2([...jump.slice(0, 3), { ...b, id: 'again' }, ...jump.slice(3)]), [['again', 'anticipation after travel or smear']])
    assert.deepEqual(m2([...jump.slice(0, 6), { ...jump[2], id: 'bounce' }, ...jump.slice(6)]), [['bounce', 'travel after the impact']])
    assert.deepEqual(m2([...jump.slice(0, 6), { ...jump[4], id: 'trail' }, ...jump.slice(6)]), [['trail', 'smear after the impact']])
  })

  it('to be M2 when the after-contact stages run backwards', () => {
    const out = (id, phase) => ({ id, phase, ms: 70, rows: STAND })
    assert.deepEqual(m2([...jump.slice(0, 8), out('late', 'follow-through')]), [['late', 'follow-through out of order after the impact']])
    assert.deepEqual(m2([...jump, out('again', 'recovery')]), [['again', 'recovery out of order after the impact']])
    assert.deepEqual(m2([...jump.slice(0, 7), out('second', 'impact'), ...jump.slice(7)]), [['second', 'impact out of order after the impact']])
    assert.deepEqual(m2([...jump.slice(0, 6), out('held', 'impact'), ...jump.slice(6)]), [])
  })

  it('to be M3 counting only anticipation, with travel reported apart in lint and feel.json', () => {
    // An enemy wind-up of 300 ms passes and 299 ms fails however long the travel lasts.
    const enemy = (ms) => spec({ actor: 'enemy', frames: [{ ...jump[0], ms }, ...jump.slice(1)] })
    assert.deepEqual([errorsOf(enemy(299)), errorsOf(enemy(300))], [['M3'], []])
    const normalized = normalizeSpec(spec({ frames: jump }))
    const frames = composeFrames(normalized)
    assert.deepEqual([lintSprite(normalized, frames).metrics.startupMs, lintSprite(normalized, frames).metrics.travelMs], [50, 166])
    assert.deepEqual([feelReport(normalized, frames).startupMs, feelReport(normalized, frames).travelMs], [50, 166])
  })

  it('to be an M4 fix that offers an in-between or a take-off/arrival smear', () => {
    const far = ['......kk', '......kk', ...Array.from({ length: 6 }).fill(BLANK)]
    const near = ['kk......', 'kk......', ...Array.from({ length: 6 }).fill(BLANK)]
    const report = lint(spec({ kind: 'effect', frames: [{ id: 'a', phase: 'effect', ms: 60, rows: near }, { id: 'b', phase: 'travel', ms: 90, rows: far }] }))
    assert.deepEqual(report.warnings.map((f) => f.fix), ['add an in-between frame, or a take-off/arrival smear'])
  })
})

describe('scale op as the rough squash and stretch pass', () => {
  // A 4×4 block resting on row 7, columns 2–5. Nearest-neighbor sampling of a 4-wide source picks
  // columns 0,1,1,2,3,3 for 6 wide and 1,3 for 2 wide, so results are lopsided until cleaned with `patch`.
  const block = [BLANK, BLANK, BLANK, BLANK, '..kkkk..', '..kssk..', '..kssk..', '..kkkk..']
  const scaled = (op) => frameRows(composed(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: block, ops: [op] }] }))[0])

  it('to be a wider, shorter shape on the same ground line when squashed from the bottom', () => {
    assert.deepEqual(scaled({ op: 'scale', rect: [2, 4, 4, 4], size: [6, 3] }).slice(4), ['........', '.kkkkkk.', '.kssskk.', '.kkkkkk.'])
  })

  it('to be a narrower, taller shape that grows upward when stretched from the bottom', () => {
    assert.deepEqual(scaled({ op: 'scale', rect: [2, 4, 4, 4], size: [2, 6] }).slice(2), ['...kk...', '...sk...', '...sk...', '...sk...', '...kk...', '...kk...'])
  })

  it('to be aligned to the top or the center when the anchor says so', () => {
    // Halving the height samples source rows 1 and 3.
    assert.deepEqual(scaled({ op: 'scale', rect: [2, 4, 4, 4], size: [4, 2], anchor: 'top' }).slice(4), ['..kssk..', '..kkkk..', BLANK, BLANK])
    assert.deepEqual(scaled({ op: 'scale', rect: [2, 4, 4, 4], size: [4, 2], anchor: 'center' }).slice(4), [BLANK, '..kssk..', '..kkkk..', BLANK])
  })

  it('to be H4 naming the scale op when the result leaves the canvas', () => {
    const raw = spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: block, ops: [{ op: 'scale', rect: [2, 4, 4, 4], size: [4, 6], anchor: 'top' }] }] })
    assert.deepEqual(lint(raw).warnings.map((f) => f.message), ['8 pixel(s) fell outside the canvas from ops[0] scale (8)'])
  })

  it('to be rejected by validation without a size or with an unknown anchor', () => {
    assert.deepEqual(validateSpec(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: block, ops: [{ op: 'scale', rect: [0, 0, 2, 2], anchor: 'left' }] }] })), [
      'frames[0].ops[0].size: [w, h] positive integers',
      'frames[0].ops[0].anchor: one of bottom, center, top',
    ])
  })
})

describe('fx layers and patches as effects kept apart from the body', () => {
  const parts = { spark: { rows: ['y'] } }

  it('to be drawn after ops so a move never carries or erases them', () => {
    const raw = spec({
      kind: 'idle',
      parts,
      frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND, layers: [{ part: 'spark', at: [0, 0], fx: true }], ops: [{ op: 'move', rect: [0, 0, 8, 8], by: [1, 0] }] }],
    })
    const [frame] = composed(raw)
    assert.deepEqual([frame.pixels[0], frame.body[0], frameRows({ ...frame, pixels: frame.body })[2]], ['y', '.', '...kssk.'])
  })

  it('to be an fx patch on top of the body patch and outside the body layer', () => {
    const raw = spec({
      kind: 'idle',
      frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND, patch: [{ at: [0, 0], rows: ['y'], fx: true }, { at: [0, 0], rows: ['w'] }] }],
    })
    const [frame] = composed(raw)
    assert.deepEqual([frame.pixels[0], frame.body[0]], ['y', 'w'])
  })

  it('to be left behind when a later frame bases on this one', () => {
    const raw = spec({
      kind: 'idle',
      parts,
      frames: [
        { id: 'a', phase: 'idle', ms: 100, rows: STAND, layers: [{ part: 'spark', at: [0, 0], fx: true }] },
        { id: 'b', phase: 'idle', ms: 120, base: 'a' },
      ],
    })
    assert.equal(composed(raw)[1].pixels[0], '.')
  })

  it('to be invisible to dust, outline, baseline, gap, key, volume and identity metrics', () => {
    // A stray yellow fx pixel under the baseline at the canvas edge, in every frame, changes no body metric.
    const sparkle = { part: 'spark', at: [7, 7], fx: true }
    const body = spec({ outline: 'k', baseline: 7, parts, frames: spec().frames.map((f) => ({ ...f, layers: [sparkle] })) })
    assert.deepEqual([...errorsOf(body), ...warningsOf(body)], [])
    const empty = Array.from({ length: 8 }).fill(BLANK)
    const fxOnly = spec({ kind: 'effect', parts, frames: [{ id: 'a', phase: 'effect', ms: 100, rows: empty, layers: [{ part: 'spark', at: [3, 3], fx: true }] }] })
    assert.deepEqual(errorsOf(fxOnly), [])
  })

  it('to be counted by H2 like any other drawn color', () => {
    const raw = spec({ maxColors: 2, parts, frames: spec().frames.map((f) => ({ ...f, layers: [{ part: 'spark', at: [0, 0], fx: true }] })) })
    assert.deepEqual(errorsOf(raw).filter((r) => r === 'H2'), ['H2'])
  })
})

describe('lint messages as pointers to the exact pixels and ops', () => {
  it('to be H7 naming the floating row or the pixels below the baseline', () => {
    const lifted = [...STAND.slice(1), BLANK]
    const h7 = (rows, baseline) => lint(spec({ kind: 'idle', baseline, frames: [{ id: 'a', phase: 'idle', ms: 100, rows }] })).errors.map((f) => f.message)
    assert.deepEqual(h7(lifted, 7), ['lowest body pixel row 6, baseline 7: 2,6=k 5,6=k'])
    assert.deepEqual(h7(STAND, 6), ['lowest body pixel row 7, baseline 6: 2,7=k 5,7=k'])
  })

  it('to be H4 naming the layer that clipped', () => {
    const raw = spec({ kind: 'idle', parts: { bar: { rows: ['www'] } }, frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND, layers: [{ part: 'bar', at: [6, 0] }] }] })
    assert.deepEqual(lint(raw).warnings.map((f) => f.message), ['1 pixel(s) fell outside the canvas from layers[0] bar (1)'])
  })
})

describe('contact sheet as a review image that survives a 1200 px downscale', () => {
  it('to be the largest cell scale that keeps the long edge within 1200 px', () => {
    // The knight: 32×32, seven frames, six per row → two blocks at ×4 (824×1164); ×5 would be 1424 tall.
    assert.deepEqual(contactLayout(32, 32, 7, 6, 8), { c: 4, bar: 8, blockH: 578, columns: 6, blocks: 2, width: 824, height: 1164 })
    assert.deepEqual([contactLayout(32, 32, 7, 3, 8).blocks, contactLayout(32, 32, 7, 3, 8).columns], [3, 3])
  })

  it('to be a dark-background row under the checkerboard row', () => {
    const normalized = normalizeSpec(spec())
    const sheet = contactSheet(normalized, composeFrames(normalized))
    const { c } = contactLayout(8, 8, 4, 6, normalized.scale)
    // The top-left pixel of frame 0's second image row is empty canvas, so it shows the dark background.
    const darkY = 8 + 14 + 4 + (8 * c + 8)
    assert.deepEqual([...sheet.data.subarray((darkY * sheet.width + 8) * 4, (darkY * sheet.width + 8) * 4 + 3)], [24, 22, 32])
  })

  it('to be wrapped by --cols on build', () => {
    const out = path.join(TMP, 'knight-cols')
    assert.equal(run('build', EXAMPLE, '--out', out, '--cols', '3').status, 0)
    const png = decodePng(readFileSync(path.join(out, 'contact.png')))
    const layout = contactLayout(32, 32, 7, 3, 8)
    assert.deepEqual([png.width, png.height], [layout.width, layout.height])
    assert.equal(run('build', EXAMPLE, '--out', out, '--cols', '0').status, 2)
  })
})

describe('previews, engine data and credits as build outputs', () => {
  const effect = (overrides) =>
    normalizeSpec(
      spec({
        kind: 'effect',
        frames: [33, 25, 14, 100].map((ms, i) => ({ id: `e${i}`, phase: i === 2 ? 'hold' : 'effect', ms, rows: STAND })),
        ...overrides,
      }),
    )

  it('to be GIF delays rounded to 10 ms with a 20 ms floor and a 300 ms hold on the last one-shot frame', () => {
    const delays = (normalized) => readGif(previewGif(normalized, composeFrames(normalized))).frames.map((f) => f.delayCs)
    assert.deepEqual([delays(effect()), delays(effect({ loop: true }))], [
      [3, 3, 2, 40],
      [3, 3, 2, 10],
    ])
  })

  it('to be a numbered tag when a phase comes back after another phase', () => {
    const normalized = effect()
    assert.deepEqual(sheetJson(normalized, composeFrames(normalized)).meta.frameTags.map((t) => [t.name, t.from, t.to]), [
      ['test', 0, 3],
      ['effect', 0, 1],
      ['hold', 2, 2],
      ['effect-2', 3, 3],
    ])
  })

  it('to be credits that carry a generator prompt and seed', () => {
    const normalized = effect({
      frames: [{ id: 'e0', phase: 'effect', ms: 100, source: 'gen', rows: STAND }],
      sources: [{ name: 'gen', author: 'me', license: 'generator plan terms', url: '', prompt: 'knight slash', seed: 42 }],
    })
    assert.match(creditsText(normalized, composeFrames(normalized)), /- gen by me — generator plan terms — no url \[prompt "knight slash", seed 42\] \(frames: e0\)/)
  })
})

describe('build and lint exit codes as the delivery gate', () => {
  const warnedFile = path.join(TMP, 'warned.json')
  writeFileSync(warnedFile, JSON.stringify(spec({ frames: spec().frames.map((f) => (f.id === 'c' ? { ...f, ms: 40 } : f)) })))

  it('to be exit 1 for an unwaived warning on build and lint', () => {
    assert.deepEqual([run('build', warnedFile, '--out', path.join(TMP, 'warned')).status, run('lint', warnedFile).status], [1, 1])
  })

  it('to be exit 0 with every output and a DRAFT verdict under --draft', () => {
    const out = path.join(TMP, 'draft')
    const result = run('build', warnedFile, '--out', out, '--draft')
    assert.equal(result.status, 0)
    assert.match(result.stdout, /RESULT: DRAFT \(not deliverable until a build without --draft passes\) — 0 error\(s\), 1 warning\(s\)/)
    assert.equal(existsSync(path.join(out, 'contact.png')), true)
  })

  it('to be exit 2 under --draft when the spec itself is invalid', () => {
    const file = path.join(TMP, 'invalid-draft.json')
    writeFileSync(file, JSON.stringify({ version: 1 }))
    assert.equal(run('build', file, '--draft').status, 2)
  })

  it('to be exit 2 for a missing spec file and for a flag whose value is another flag', () => {
    const missing = run('lint', path.join(TMP, 'nope.json'))
    assert.deepEqual([missing.status, missing.stderr.split('\n')[0]], [2, `spec file not found: ${path.join(TMP, 'nope.json')}`])
    const swallowed = run('build', warnedFile, '--out', '--draft')
    assert.deepEqual([swallowed.status, swallowed.stderr.split('\n')[0]], [2, '--out needs a value'])
  })

  it('to be a rebuild that removes only the frame files the previous build wrote', () => {
    const out = path.join(TMP, 'rebuild')
    const framesDir = path.join(out, 'frames')
    assert.equal(run('build', warnedFile, '--out', out, '--draft').status, 0)
    // Named like a harness frame on purpose: only the build manifest decides what a rebuild may delete.
    writeFileSync(path.join(framesDir, '07-mine.png'), 'kept')
    const shorter = path.join(TMP, 'warned-shorter.json')
    writeFileSync(shorter, JSON.stringify(spec({ kind: 'effect', frames: spec().frames.slice(0, 2).map((f) => ({ ...f, phase: 'effect' })) })))
    assert.equal(run('build', shorter, '--out', out, '--draft').status, 0)
    assert.deepEqual(readdirSync(framesDir).sort(), ['00-a.png', '01-b.png', '07-mine.png'])
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, '.pixel-sprite-build.json'), 'utf8')), { frames: ['00-a.png', '01-b.png'] })
  })
})

describe('show as the coordinate and diff view for authoring', () => {
  const frames = composed(spec())

  it('to be the frame under tens, ones and every-5 rulers with ticked row labels', () => {
    const lines = showFrame(frames[0]).split('\n')
    assert.deepEqual(lines.slice(0, 4), ['frame a (anticipation, 50 ms)', '     0       ', '     01234567', '     |    |  '])
    assert.equal(lines[4], '  0- ........')
    assert.equal(lines[9], '  5- ..kkkk..')
  })

  it('to be a printed body patch that rebuilds the frame from its base, with fx left out', () => {
    const raw = spec({
      kind: 'idle',
      parts: { spark: { rows: ['y'] } },
      frames: [
        { id: 'a', phase: 'idle', ms: 100, rows: STAND },
        { id: 'b', phase: 'idle', ms: 120, base: 'a', ops: [{ op: 'move', rect: [2, 1, 4, 4], by: [1, 0] }], layers: [{ part: 'spark', at: [0, 0], fx: true }] },
      ],
    })
    const [a, b] = composed(raw)
    const { changes, text } = diffFrames(a, b)
    assert.match(text, /^frame b vs base a: \d+ body pixel\(s\) changed/)
    assert.equal(changes.length, Number.parseInt(text.split(': ')[1], 10))
    assert.equal(changes.some((c) => c.to === 'y'), false)
    const patch = JSON.parse(text.split('\n').at(-1))
    const replay = composed(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND }, { id: 'r', phase: 'idle', ms: 120, base: 'a', patch: [patch] }] }))
    assert.deepEqual(replay[1].pixels, b.body)
  })

  it('to be the body bounding box of every frame and the body as paste-ready rows', () => {
    const lifted = composed(spec({ kind: 'idle', frames: [{ id: 'a', phase: 'idle', ms: 100, rows: STAND }, { id: 'z', phase: 'idle', ms: 120, tags: ['blank'], rows: Array.from({ length: 8 }).fill(BLANK) }] }))
    assert.deepEqual(bboxLines(lifted), ['a: 2,1–5,7 4×7', 'z: empty'])
    assert.deepEqual(JSON.parse(bodyRows(frames[0])), STAND)
  })
})

describe('import as the bridge from PNG sources to the same gates', () => {
  const palette = [
    { key: 'k', rgb: [16, 16, 24] },
    { key: 'w', rgb: [240, 240, 240] },
  ]
  const image = (pixels, width) => ({ width, height: pixels.length / width, data: Uint8Array.from(pixels.flat()) })
  // An opaque 8×8 square of gray (40, 40, 40).
  const ONE = path.join(TMP, 'one.png')
  writeFileSync(ONE, encodePng({ width: 8, height: 8, data: Uint8Array.from({ length: 256 }, (_, i) => (i % 4 === 3 ? 255 : 40)) }))

  it('to be nearest-color keys with alpha cut, error and semi-alpha counts', () => {
    const snapped = snapImage(image([[20, 20, 30, 255], [230, 230, 230, 200], [0, 0, 0, 100], [0, 0, 0, 0]], 4), palette, 128)
    assert.deepEqual(snapped.rows, ['kw..'])
    assert.deepEqual([snapped.offPalette, snapped.semiAlpha, snapped.maxError > 0], [2, 2, true])
  })

  it('to be at most N median-cut colors, never more than the image has', () => {
    const colors = new Map([['0,0,0', 5], ['10,0,0', 5], ['250,250,250', 5], ['240,250,250', 5]])
    assert.equal(medianCut(colors, 2).length, 2)
    assert.equal(medianCut(new Map([['1,2,3', 4]]), 8).length, 1)
  })

  it('to be sheet cells by row/cols or explicit cells, and an error past the sheet edge', () => {
    const sheet = image(Array.from({ length: 4 * 2 }, (_, i) => [i, 0, 0, 255]), 4)
    const red = (cells) => cells.map((c) => [...c.data].filter((_, i) => i % 4 === 0))
    assert.deepEqual(red(sliceSheet(sheet, { grid: [2, 1], row: 1, cols: [1] })), [[6, 7]])
    assert.deepEqual(red(sliceSheet(sheet, { grid: [2, 1], cells: [[0, 1], [1, 0]] })), [[2, 3], [4, 5]])
    assert.throws(() => sliceSheet(sheet, { grid: [2, 1], cells: [[2, 0]] }), /outside the 4×2 sheet/)
  })

  it('to be the original pixels after undoing an integer upscale', () => {
    const big = image([[1, 0, 0, 255], [1, 0, 0, 255], [2, 0, 0, 255], [2, 0, 0, 255], [1, 0, 0, 255], [1, 0, 0, 255], [2, 0, 0, 255], [2, 0, 0, 255]], 4)
    assert.deepEqual([...downscale(big, 2).data], [1, 0, 0, 255, 2, 0, 0, 255])
  })

  it('to be a draft whose placeholders and stamped source fail the gates until fixed', () => {
    const out = path.join(TMP, 'draft.json')
    const { spec: draft } = importFrames([ONE, ONE], { out, palette: 'auto:2', source: 'lpc', name: 'draft', actor: 'player' })
    assert.deepEqual(draft.frames.map((f) => [f.phase, f.ms, f.source]), [['hold', 100, 'lpc'], ['hold', 100, 'lpc']])
    assert.deepEqual([...new Set(errorsOf(draft))].sort(), ['L1', 'M1', 'M2'])
    writeFileSync(out, '{}')
    assert.throws(() => importFrames([ONE], { out, palette: 'auto:2' }), /exists; pass --force/)
  })

  it('to be a spec without actor until one is given, so validation names it', () => {
    const { spec: draft } = importFrames([ONE], { out: path.join(TMP, 'no-actor.json'), palette: 'auto:2' })
    assert.deepEqual([Object.hasOwn(draft, 'actor'), validateSpec(draft)], [false, ['actor: one of player, enemy, neutral']])
  })

  it('to be the keys and colors of a palette-only JSON file, and a clear error when it is missing', () => {
    const paletteFile = path.join(TMP, 'palette-only.json')
    writeFileSync(paletteFile, JSON.stringify({ palette: { '.': null, 'g': '#282828', 'q': '#f0f0f0' } }))
    const { spec: draft, report } = importFrames([ONE], { out: path.join(TMP, 'palette-file.json'), palette: paletteFile, actor: 'neutral' })
    assert.deepEqual([draft.palette, draft.frames[0].rows[0], report[0].maxError], [{ '.': null, 'g': '#282828', 'q': '#f0f0f0' }, 'gggggggg', 0])
    assert.throws(() => importFrames([ONE], { out: path.join(TMP, 'palette-missing.json'), palette: path.join(TMP, 'none.json') }), /--palette expects auto:N or a JSON file/)
  })

  it('to be a clear error when every pixel is below the alpha cut', () => {
    const clear = path.join(TMP, 'clear.png')
    writeFileSync(clear, encodePng({ width: 2, height: 2, data: new Uint8Array(16).fill(0) }))
    assert.throws(() => importFrames([clear], { out: path.join(TMP, 'clear.json'), actor: 'neutral' }), /every imported pixel has alpha below 128/)
  })

  it('to be a sources entry carrying license, author, url, prompt and seed', () => {
    const { spec: draft } = importFrames([ONE], {
      out: path.join(TMP, 'licensed.json'),
      palette: 'auto:2',
      actor: 'player',
      source: 'gen',
      license: 'generator plan terms',
      author: 'me',
      url: 'https://example.test/job/1',
      prompt: 'knight slash',
      seed: '42',
    })
    assert.deepEqual(draft.sources, [{ name: 'gen', author: 'me', license: 'generator plan terms', url: 'https://example.test/job/1', prompt: 'knight slash', seed: '42' }])
  })

  it('to be color frequencies with near-duplicate shades grouped', () => {
    // Two near-identical darks (redmean distance about 5) and one far light color.
    const pixels = [[20, 20, 30, 255], [20, 20, 30, 255], [22, 21, 31, 255], [240, 240, 240, 255], [0, 0, 0, 0]]
    const file = path.join(TMP, 'shades.png')
    writeFileSync(file, encodePng(image(pixels, 5)))
    assert.deepEqual(colorReport([file]), {
      pixels: 4,
      colors: [{ hex: '#14141e', count: 2 }, { hex: '#16151f', count: 1 }, { hex: '#f0f0f0', count: 1 }],
      clusters: [['#14141e', '#16151f']],
      unclustered: 0,
    })
  })
})

describe('the pixel-sprite CLI as the harness entry point', () => {
  it('to be exit 0 and every output for the knight-slash example', () => {
    const out = path.join(TMP, 'knight')
    const result = run('build', EXAMPLE, '--out', out)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const files = ['sheet.png', 'sheet.json', 'preview.gif', 'preview-feel.gif', 'contact.png', 'lint.json', 'feel.json', 'credits.txt']
    assert.deepEqual(files.filter((f) => !existsSync(path.join(out, f))), [])
    const sheet = JSON.parse(readFileSync(path.join(out, 'sheet.json'), 'utf8'))
    assert.deepEqual(sheet.frames.map((f) => f.duration), [50, 50, 33, 50, 66, 83, 100])
    assert.deepEqual(sheet.meta.frameTags.map((t) => t.name), ['knight-slash', 'anticipation', 'smear', 'impact', 'follow-through', 'recovery', 'hold'])
    assert.deepEqual([sheet.meta.size, sheet.frames[3].frame], [{ w: 224, h: 32 }, { x: 96, y: 0, w: 32, h: 32 }])
    const png = decodePng(readFileSync(path.join(out, 'sheet.png')))
    assert.deepEqual([png.width, png.height], [224, 32])
    const feel = JSON.parse(readFileSync(path.join(out, 'feel.json'), 'utf8'))
    assert.deepEqual([feel.startupMs, feel.firstActiveIndex, feel.hitstop.frames, feel.shake.px], [100, 3, 5, 2])
    assert.equal(JSON.parse(readFileSync(path.join(out, 'lint.json'), 'utf8')).ok, true)
    assert.equal(readGif(readFileSync(path.join(out, 'preview.gif'))).frames.length, 7)
    assert.match(readFileSync(path.join(out, 'credits.txt'), 'utf8'), /no external sources declared/)
  })

  it('to be exit 1 with outputs still written when an error remains', () => {
    const file = path.join(TMP, 'bad.json')
    writeFileSync(file, JSON.stringify(spec({ frames: spec().frames.map((f) => ({ ...f, ms: 100 })) })))
    const out = path.join(TMP, 'bad-out')
    const result = run('build', file, '--out', out)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /ERROR {2}M1 every frame lasts 100 ms/)
    assert.equal(JSON.parse(readFileSync(path.join(out, 'lint.json'), 'utf8')).ok, false)
  })

  it('to be exit 2 for an invalid spec or an unknown command', () => {
    const file = path.join(TMP, 'invalid.json')
    writeFileSync(file, JSON.stringify({ version: 2 }))
    assert.equal(run('lint', file).status, 2)
    assert.equal(run('paint', file).status, 2)
  })

  it('to be a JSON report from lint --json and base diffs, boxes and rows from show', () => {
    const report = JSON.parse(run('lint', EXAMPLE, '--json').stdout)
    assert.deepEqual([report.ok, report.metrics.frames, report.metrics.startupMs, report.metrics.timeToContactMs], [true, 7, 100, 133])
    assert.match(run('show', EXAMPLE, 'ready', '--diff').stdout, /frame ready has no base; --diff compares a frame's body with the body of its base/)
    assert.match(run('show', EXAMPLE, 'swing', '--diff').stdout, /^frame swing vs base ready: \d+ body pixel\(s\) changed/)
    assert.deepEqual(run('show', EXAMPLE, '--bbox').stdout.trim().split('\n').map((line) => line.split(':')[0]), ['ready', 'windup', 'swing', 'hit', 'follow', 'recover', 'guard'])
    assert.equal(JSON.parse(run('show', EXAMPLE, 'ready', '--rows').stdout).length, 32)
    assert.deepEqual([run('show', EXAMPLE, 'nope').status, run('show', EXAMPLE).status], [2, 2])
  })

  it('to be imported cells from an upscaled sheet that match the original pixels', () => {
    const cell = (shade) => Array.from({ length: 4 * 4 }, (_, i) => (i % 5 === 0 ? [shade, 0, 0, 255] : [0, 0, 0, 0]))
    // A 2×2 grid of 4×4 cells, upscaled ×2 → 16×16 sheet.
    const cells = [[cell(200), cell(100)], [cell(50), cell(250)]]
    const data = new Uint8Array(16 * 16 * 4)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const source = cells[Math.floor(y / 8)][Math.floor(x / 8)][(Math.floor((y % 8) / 2) * 4) + Math.floor((x % 8) / 2)]
        data.set(source, (y * 16 + x) * 4)
      }
    }
    const sheet = path.join(TMP, 'sheet.png')
    writeFileSync(sheet, encodePng({ width: 16, height: 16, data }))
    const out = path.join(TMP, 'sliced.json')
    const result = run('import', sheet, '--grid', '8x8', '--row', '1', '--cols', '0-1', '--downscale', '2', '--palette', 'auto:4', '--source', 'sheet', '--actor', 'player', '--out', out)
    assert.equal(result.status, 0, result.stderr)
    const draft = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual([draft.canvas, draft.frames.length, draft.sources[0].name], [[4, 4], 2, 'sheet'])
    const keyOf = (rgb) => Object.entries(draft.palette).find(([, hex]) => hex === rgb)?.[0]
    assert.deepEqual(draft.frames[0].rows, [0, 1, 2, 3].map((y) => [0, 1, 2, 3].map((x) => (x === y ? keyOf('#320000') : '.')).join('')))
    // --downscale auto finds the same ×2 on the whole sheet and reports it per cell.
    const auto = path.join(TMP, 'sliced-auto.json')
    const detected = run('import', sheet, '--grid', '8x8', '--row', '1', '--cols', '0-1', '--downscale', 'auto', '--palette', 'auto:4', '--actor', 'player', '--out', auto)
    assert.equal(detected.status, 0, detected.stderr)
    assert.match(detected.stdout, /f00 .*sheet\.png#0: ×2 downscale/)
    assert.deepEqual(JSON.parse(readFileSync(auto, 'utf8')).frames.map((f) => f.rows), draft.frames.map((f) => f.rows))
  })

  it('to be exit 2 for import options it cannot use as given', () => {
    const png = path.join(TMP, 'cli-one.png')
    writeFileSync(png, encodePng({ width: 2, height: 2, data: new Uint8Array(16).fill(255) }))
    const out = path.join(TMP, 'cli-bad.json')
    const firstLine = (...args) => {
      const result = run('import', png, '--out', out, ...args)
      return [result.status, result.stderr.split('\n')[0]]
    }
    assert.deepEqual(firstLine(), [2, 'import needs --actor player|enemy|neutral (it sets which timing gates apply)'])
    assert.deepEqual(firstLine('--actor', 'player', '--alpha', '256'), [2, '--alpha expects a whole number, 0–255'])
    assert.deepEqual(firstLine('--actor', 'player', '--alpha', '1.5'), [2, '--alpha expects a whole number, 0–255'])
    assert.deepEqual(firstLine('--actor', 'player', '--grid', '1x1', '--row', 'x'), [2, '--row expects a whole number, 0 or more'])
    assert.deepEqual(firstLine('--actor', 'player', '--grid', '1x1', '--cells', '0:a'), [2, '--cells expects row:col pairs of whole numbers, e.g. 0:1,2:3'])
    assert.deepEqual(firstLine('--actor', 'player', '--license', 'CC0'), [2, '--license describe --source <name>; pass it too'])
    assert.deepEqual(firstLine('--actor', 'player', '--diff-base', 'last'), [2, '--diff-base expects first or previous'])
    assert.equal(existsSync(out), false)
  })

  it('to be a chained import that says edits propagate, and license flags in the sources entry', () => {
    const files = [STAND, LEAN].map((rows, i) => {
      const file = path.join(TMP, `cli-chain-${i}.png`)
      const data = Uint8Array.from(rows.join('').split('').flatMap((key) => (key === '.' ? [0, 0, 0, 0] : [key === 'k' ? 16 : 112, 16, 24, 255])))
      writeFileSync(file, encodePng({ width: 8, height: 8, data }))
      return file
    })
    const out = path.join(TMP, 'cli-chain.json')
    const result = run('import', ...files, '--diff-chain', '--actor', 'player', '--source', 'own', '--license', 'own work', '--author', 'me', '--out', out)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /chained: editing one frame's patch moves every later frame; use --diff-base first for independent patches/)
    const draft = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual([draft.frames[1].base, draft.sources], ['f00', [{ name: 'own', author: 'me', license: 'own work', url: '' }]])
  })

  it('to be color frequencies and near duplicates from the colors command', () => {
    const png = path.join(TMP, 'cli-colors.png')
    writeFileSync(png, encodePng({ width: 2, height: 1, data: Uint8Array.from([20, 20, 30, 255, 22, 21, 31, 255]) }))
    const result = run('colors', png)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trim().split('\n'), [
      '2 opaque color(s) over 2 pixel(s) (alpha ≥ 128), most used first:',
      '  #14141e       1  50.0%',
      '  #16151f       1  50.0%',
      'near duplicates (redmean < 24; usually one palette key):',
      '  #14141e ~ #16151f',
    ])
  })

  it('to be exit 2 when --bin names a program that is not Blender', () => {
    const result = run('blender', '--demo', '--out', path.join(TMP, 'no-blender'), '--bin', path.join(TMP, 'not-blender'))
    assert.deepEqual([result.status, result.stderr.split('\n')[0]], [2, `--bin ${path.join(TMP, 'not-blender')} does not run as Blender (\`${path.join(TMP, 'not-blender')} --version\` failed)`])
  })
})

describe('import scale detection and diff chains as the bridge for generator output', () => {
  // Paints an RGBA image from a grid of one-character color names, each cell blown up `k` times.
  const COLORS = { '.': [0, 0, 0, 0], 'r': [200, 0, 0, 255], 'b': [0, 0, 200, 255] }
  const painted = (grid, kx = 1, ky = kx) => {
    const width = grid[0].length * kx
    const height = grid.length * ky
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(COLORS[grid[Math.floor(y / ky)][Math.floor(x / kx)]], (y * width + x) * 4)
    return { width, height, data }
  }
  const art = ['.rr.', 'rbbr', 'rbbr', '.rr.']

  it('to be the integer factor of a clean upscale and 1 for native art', () => {
    assert.deepEqual([detectScale(painted(art, 3)), detectScale(painted(art, 2)), detectScale(painted(['r.b.', '.b.r', 'b.r.', '.r.b']))], [3, 2, 1])
  })

  it('to be a refusal for a non-integer upscale and for blocks off the grid', () => {
    // Columns stretched unevenly (2, 3, 2, 3 px) cannot be undone with one integer factor.
    const uneven = painted(art.map((row) => [...row].map((ch, i) => ch.repeat(i % 2 === 0 ? 2 : 3)).join('')), 1)
    assert.throws(() => detectScale(uneven), /\(non-integer or mixed upscale\); unzoom it in the generator first, or pass --downscale N/)
    // A clean ×2 upscale shifted one pixel right is made of 2-px runs that do not start on the grid.
    const shifted = painted(art.map((row) => `.${row}.`), 2)
    const cropped = { width: shifted.width - 1, height: shifted.height, data: new Uint8Array((shifted.width - 1) * shifted.height * 4) }
    for (let y = 0; y < shifted.height; y++) cropped.data.set(shifted.data.subarray((y * shifted.width + 1) * 4, (y + 1) * shifted.width * 4), y * cropped.width * 4)
    assert.throws(() => detectScale(cropped), /not made of aligned 2×2 blocks/)
  })

  it('to be the same factor when fully transparent pixels carry stray RGB', () => {
    const noisy = painted(art, 2)
    // Exporters leave arbitrary color behind alpha 0; a different RGB on every transparent pixel must not split runs.
    for (let i = 0; i < noisy.data.length; i += 4) if (noisy.data[i + 3] === 0) noisy.data.set([i % 251, (i * 7) % 253, 9, 0], i)
    assert.equal(detectScale(noisy), 2)
  })

  const frameFiles = [art, ['.rr.', 'rbbr', 'rrbr', '.rr.'], ['.rr.', 'rbbr', 'rrbr', '.rr.']].map((grid, i) => {
    const file = path.join(TMP, `chain-${i}.png`)
    writeFileSync(file, encodePng(painted(grid)))
    return file
  })
  const imported = (name, diffBase) => importFrames(frameFiles, { out: path.join(TMP, `${name}.json`), palette: 'auto:2', source: 'gen', actor: 'enemy', diffBase }).spec
  const chainShape = (draft) => draft.frames.map(({ id, base, patch, rows, source }) => [id, base ?? null, patch ?? null, rows?.length ?? null, source])

  it('to be a diff chain that composes back to the same frames, with a base-only frame when nothing changed', () => {
    const plain = imported('plain')
    const chained = imported('chained', 'previous')
    // f01 turns the fill pixel at (1, 2) into the outline color, the key used at frame 0 row 0 column 1.
    const outline = chained.frames[0].rows[0][1]
    assert.deepEqual(chainShape(chained), [
      ['f00', null, null, 4, 'gen'],
      ['f01', 'f00', [{ at: [1, 2], rows: [outline] }], null, 'gen'],
      ['f02', 'f01', null, null, 'gen'],
    ])
    assert.deepEqual(validateSpec(chained), [])
    assert.deepEqual(composed(chained).map((f) => f.pixels), composed(plain).map((f) => f.pixels))
  })

  it('to be every later frame based on the first under diff-base first, each patch standing alone', () => {
    const plain = imported('plain-star')
    const star = imported('star', 'first')
    const outline = star.frames[0].rows[0][1]
    assert.deepEqual(chainShape(star), [
      ['f00', null, null, 4, 'gen'],
      ['f01', 'f00', [{ at: [1, 2], rows: [outline] }], null, 'gen'],
      ['f02', 'f00', [{ at: [1, 2], rows: [outline] }], null, 'gen'],
    ])
    assert.deepEqual(composed(star).map((f) => f.pixels), composed(plain).map((f) => f.pixels))
  })
})

describe('license classes and L2 as the release gate on sources', () => {
  it('to be share-alike before attribution, and generator or unknown terms named as such', () => {
    const texts = ['CC0 1.0', 'public domain', 'own work', 'MIT', 'CC-BY 4.0', 'OGA-BY 3.0', 'CC-BY-SA 3.0', 'GPL 3.0', 'generator plan terms', 'free to use', '']
    assert.deepEqual(texts.map(licenseClass), ['open', 'open', 'open', 'open', 'attribution', 'attribution', 'copyleft', 'copyleft', 'generator', 'unknown', 'unknown'])
  })

  it('to be open only for whole tokens, so a word that merely contains one does not pass', () => {
    const open = ['PD', 'CC-0', 'original work', 'Self-made']
    const not = ['permitted for owners', 'transmit only', 'own', 'original art by others', 'cc0x', 'upd']
    assert.deepEqual(open.map(licenseClass), ['open', 'open', 'open', 'open'])
    assert.deepEqual(not.map(licenseClass), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown'])
  })

  it('to be unknown when a negation sits in front of an open token or the terms reserve every right', () => {
    const texts = ['not CC0', 'no public domain', 'All rights reserved', 'personal use only', 'CC0 for personal use']
    assert.deepEqual(texts.map(licenseClass), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'])
  })

  it('to be restricted for NonCommercial and NoDerivatives, whatever else the text says', () => {
    const texts = ['CC-BY-NC 4.0', 'CC BY-ND 3.0', 'CC-BY-NC-ND', 'CC-BY-NC-SA 4.0', 'Creative Commons NonCommercial', 'no derivatives, CC0 art']
    assert.deepEqual(texts.map(licenseClass), Array.from({ length: 6 }).fill('restricted'))
  })

  it('to be copyleft for GPL versions and generator only for generator words, not plan, terms or ai', () => {
    assert.deepEqual(['GPLv2', 'GPL-3.0+', 'LGPL 2.1', 'AGPLv3'].map(licenseClass), Array.from({ length: 4 }).fill('copyleft'))
    assert.deepEqual(['PixelLab subscription', 'generated with a generator', 'plan terms', 'ai terms', 'plan'].map(licenseClass), ['generator', 'generator', 'unknown', 'unknown', 'unknown'])
  })

  it('to be L2 a warning for copyleft and generator terms, an error for an unknown license, and silent for open ones', () => {
    const frames = spec().frames.map((f) => ({ ...f, source: 'base' }))
    const l2 = (license) => {
      const report = lint(spec({ frames, sources: [{ name: 'base', author: 'A', license, url: 'u' }] }))
      return [...report.errors, ...report.warnings].filter((f) => f.rule === 'L2').map((f) => [f.severity, f.message])
    }
    assert.deepEqual(l2('CC0'), [])
    assert.deepEqual(l2('CC-BY 4.0'), [])
    assert.deepEqual(l2('CC-BY-SA 4.0'), [['warning', 'source "base" is copyleft — check before commercial release']])
    assert.deepEqual(l2('generator plan terms'), [['warning', 'source "base" has plan-dependent commercial terms']])
    assert.deepEqual(l2('free to use'), [['error', 'source "base" has an unrecognized license']])
  })

  it('to be L2 an error for NonCommercial or NoDerivatives that no waiver removes', () => {
    const frames = spec().frames.map((f) => ({ ...f, source: 'base' }))
    const withWaiver = lint(spec({ frames, sources: [{ name: 'base', author: 'A', license: 'CC-BY-NC 4.0', url: 'u' }], waivers: [{ rule: 'L2', frame: 'base', reason: 'we asked' }] }))
    assert.deepEqual(withWaiver.errors.map((f) => [f.rule, f.severity]), [['L2', 'error'], ['W1', 'error']])
    assert.match(withWaiver.errors[0].message, /NonCommercial or NoDerivatives/)
  })

  it('to be L2 a warning when a CC-BY credit lacks its author or url, and a waiver that names one source', () => {
    const frames = spec().frames.map((f) => ({ ...f, source: 'a' }))
    const sources = [{ name: 'a', author: '', license: 'CC-BY 4.0', url: 'u' }, { name: 'b', author: 'B', license: 'CC-BY-SA 4.0', url: 'u' }]
    const report = (waivers) => lint(spec({ frames, sources, waivers }))
    assert.deepEqual(report().warnings.map((f) => [f.rule, f.frame, f.message]), [
      ['L2', 'a', 'source "a" needs an author and a url for its credit'],
      ['L2', 'b', 'source "b" is copyleft — check before commercial release'],
    ])
    const one = report([{ rule: 'L2', frame: 'b', reason: 'share-alike fits this release' }])
    assert.deepEqual([one.warnings.map((f) => f.frame), one.waived.map((f) => f.frame)], [['a'], ['b']])
    const every = report([{ rule: 'L2', reason: 'reviewed' }])
    assert.deepEqual([every.warnings, every.waived.map((f) => f.frame)], [[], ['a', 'b']])
  })
})

describe('base candidates as the license-aware pick board', () => {
  // 4×4 art with transparent corners, upscaled ×2 to 8×8: two opaque colors at native size.
  const ART = ['.kk.', 'kssk', 'kssk', '.kk.']
  const RGBA = { '.': [0, 0, 0, 0], 'k': [16, 16, 24, 255], 's': [112, 128, 176, 255] }
  const artPng = () => {
    const data = new Uint8Array(8 * 8 * 4)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data.set(RGBA[ART[y >> 1][x >> 1]], (y * 8 + x) * 4)
    return encodePng({ width: 8, height: 8, data })
  }
  const dir = path.join(TMP, 'candidates')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'art.png'), artPng())
  const seen = []
  const redirect = (response, location) => {
    response.statusCode = 302
    response.setHeader('location', location)
    return response.end()
  }
  const server = createServer((request, response) => {
    seen.push({ url: request.url, headers: request.headers })
    if (request.url === '/art.png') return response.end(artPng())
    if (request.url === '/page.html') return response.end('<html>not a png</html>')
    if (request.url === '/big.png') return response.end(Buffer.alloc(2000))
    if (request.url === '/chunked.png') {
      response.write(Buffer.alloc(600))
      return response.end(Buffer.alloc(600))
    }
    if (request.url === '/slow.png') return undefined
    if (request.url === '/stall.png') return response.write(Buffer.alloc(10))
    if (request.url === '/to-file') return redirect(response, 'file:///etc/hosts')
    if (request.url === '/to-data') return redirect(response, 'data:image/png;base64,AAAA')
    if (request.url === '/huge.png') return response.end(headerOnlyPng(5000, 5000))
    if (request.url === '/zero.png') return response.end(headerOnlyPng(0, 0))
    response.statusCode = 404
    return response.end()
  })
  let base = ''
  before(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  after(() => {
    server.closeAllConnections()
    server.close()
  })
  const manifest = (name, entries) => {
    const file = path.join(dir, name)
    writeFileSync(file, JSON.stringify(entries))
    return file
  }

  it('to be measured rows, local copies and a board for local and downloaded candidates, each failure kept as its row', async () => {
    const file = manifest('mixed.json', [
      { id: 'local', path: 'art.png', author: 'me', license: 'CC0' },
      { id: 'remote', url: `${base}/art.png`, page: `${base}/`, author: 'A', license: 'CC-BY-SA 4.0' },
      { id: 'html', url: `${base}/page.html`, license: 'CC-BY 4.0' },
      { id: 'big', url: `${base}/big.png`, license: 'CC0' },
      { id: 'chunked', url: `${base}/chunked.png`, license: 'CC0' },
      { id: 'gone', url: `${base}/gone.png` },
      { id: 'slow', url: `${base}/slow.png`, license: 'generator plan terms' },
    ])
    const out = path.join(dir, 'out')
    const { rows } = await collectCandidates(file, out, { maxBytes: 1000, timeoutMs: 300 })
    const measured = { size: [8, 8], upscale: 2, nativeSize: [4, 4], colors: 2 }
    assert.deepEqual(rows.map(({ id, licenseClass: cls, error, size, upscale, nativeSize, colors }) => ({ id, cls, ...(error ? { error } : { size, upscale, nativeSize, colors }) })), [
      { id: 'local', cls: 'open', ...measured },
      { id: 'remote', cls: 'copyleft', ...measured },
      { id: 'html', cls: 'attribution', error: 'not a PNG file' },
      { id: 'big', cls: 'open', error: 'larger than 1 KB; pick a smaller sheet or crop it first' },
      { id: 'chunked', cls: 'open', error: 'larger than 1 KB; pick a smaller sheet or crop it first' },
      { id: 'gone', cls: 'unknown', error: 'HTTP 404' },
      { id: 'slow', cls: 'generator', error: 'no response within 0.3 s' },
    ])
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'candidates.json'), 'utf8')), rows)
    assert.deepEqual(readFileSync(path.join(out, 'remote.png')), artPng())
    assert.equal(existsSync(path.join(out, 'html.png')), false)
    const sent = seen.find((r) => r.url === '/art.png').headers
    assert.deepEqual(['authorization', 'cookie', 'proxy-authorization'].filter((h) => Object.hasOwn(sent, h)), [])
    // Seven cells in rows of six; each cell's strip below the image carries its license class color.
    const board = decodePng(readFileSync(path.join(out, 'candidates.png')))
    const strip = (cell) => {
      const at = ((8 + 14 + 4 + 96 + 4) * board.width + 8 + cell * 104) * 4
      return [...board.data.subarray(at, at + 3)]
    }
    assert.deepEqual([board.width, board.height, strip(0), strip(1), strip(5)], [632, 276, [34, 197, 94], [245, 158, 11], [239, 68, 68]])
  })

  it('to be exit 0 with a pick table from the CLI, exit 1 when nothing loads and exit 2 for a bad manifest', () => {
    const out = path.join(dir, 'cli-out')
    const good = run('candidates', manifest('local.json', [{ id: 'local', path: 'art.png', author: 'me', license: 'CC0' }]), '--out', out)
    assert.equal(good.status, 0, good.stderr)
    assert.deepEqual(good.stdout.split('\n').slice(0, 2), ['index  id  author  license class  size  colors', '0  local  me  open  8×8 (×2 → 4×4)  2 colors'])
    const none = run('candidates', manifest('none.json', [{ id: 'nothing', path: 'missing.png' }]), '--out', out)
    assert.match(none.stdout, /0 {2}nothing {2}unknown author {2}unknown {2}ERROR: file not found: /)
    assert.equal(none.status, 1)
    const entries = [{ id: 'a b', url: 'file:///tmp/x.png', path: 'y.png', note: 3 }, { id: 'candidates', path: 'art.png' }, { id: 'x', path: 'art.png' }, { id: 'x', path: 'art.png' }]
    const bad = run('candidates', manifest('bad.json', entries), '--out', out)
    assert.equal(bad.status, 2)
    assert.deepEqual(bad.stderr.split('\n').slice(1, 6), [
      '  [0].id: letters, digits, _ or -',
      '  [0]: give exactly one of url or path',
      '  [0].note: string',
      '  [1].id: "candidates" is the board\'s file name',
      '  [3].id: duplicate "x" (ids compare without case)',
    ])
  })

  it('to be an error row, not an abort, for redirects to file: or data:, a stalled body and oversized or empty PNGs', async () => {
    const file = manifest('hostile.json', [
      { id: 'tofile', url: `${base}/to-file` },
      { id: 'todata', url: `${base}/to-data` },
      { id: 'stall', url: `${base}/stall.png` },
      { id: 'huge', url: `${base}/huge.png` },
      { id: 'zero', url: `${base}/zero.png` },
      { id: 'fine', path: 'art.png', license: 'CC0' },
    ])
    const { rows } = await collectCandidates(file, path.join(dir, 'hostile-out'), { timeoutMs: 300 })
    assert.match(rows[0].error, /^download failed: fetch failed \(URL scheme must be/)
    assert.match(rows[1].error, /^download failed: /)
    assert.equal(rows[2].error, 'no response within 0.3 s')
    assert.match(rows[3].error, /images above 16777216 pixels are refused/)
    assert.match(rows[4].error, /PNG has no pixels/)
    assert.deepEqual([rows[5].error, rows[5].colors], [undefined, 2])
  })

  it('to be a refusal to overwrite files this command did not write, lifted by --force', async () => {
    const out = path.join(dir, 'guarded')
    mkdirSync(out, { recursive: true })
    writeFileSync(path.join(out, 'local.png'), 'mine')
    const file = manifest('guard.json', [{ id: 'local', path: 'art.png', license: 'CC0' }])
    await assert.rejects(collectCandidates(file, out), /would overwrite files this command did not write: local\.png/)
    assert.equal(readFileSync(path.join(out, 'local.png'), 'utf8'), 'mine')
    await collectCandidates(file, out, { force: true })
    assert.deepEqual(readFileSync(path.join(out, 'local.png')), artPng())
    await collectCandidates(file, out)
  })

  it('to be a refusal to write the board over the manifest itself', async () => {
    const out = path.join(dir, 'self')
    mkdirSync(out, { recursive: true })
    const file = path.join(out, 'candidates.json')
    writeFileSync(file, JSON.stringify([{ id: 'local', path: '../art.png' }]))
    await assert.rejects(collectCandidates(file, out, { force: true }), /would overwrite files this command did not write: candidates\.json/)
    assert.match(readFileSync(file, 'utf8'), /"id": "local"|"id":"local"/)
  })

  it('to be a rerun that removes the copy of an entry that now fails, and only files it wrote', async () => {
    const out = path.join(dir, 'rerun')
    await collectCandidates(manifest('rerun-1.json', [{ id: 'keep', path: 'art.png' }, { id: 'gone', path: 'art.png' }]), out)
    writeFileSync(path.join(out, 'notes.txt'), 'mine')
    const second = await collectCandidates(manifest('rerun-2.json', [{ id: 'keep', path: 'art.png' }, { id: 'gone', path: 'missing.png' }]), out)
    assert.deepEqual([existsSync(path.join(out, 'keep.png')), existsSync(path.join(out, 'gone.png')), existsSync(path.join(out, 'notes.txt'))], [true, false, true])
    assert.equal(second.rows[1].error.startsWith('file not found'), true)
  })

  it('to be a manifest error that names the file for bad JSON, empty paths, and ids that differ only in case', async () => {
    const broken = path.join(dir, 'broken.json')
    writeFileSync(broken, '[{')
    await assert.rejects(collectCandidates(broken, path.join(dir, 'x')), (error) => error.message.startsWith(`${broken}: not valid JSON`))
    const bad = manifest('empty-path.json', [{ id: 'Ab', path: '' }, { id: 'aB', path: 'art.png' }, { id: '../x', path: 'art.png' }])
    await assert.rejects(collectCandidates(bad, path.join(dir, 'x')), (error) => {
      const lines = error.message.split('\n').slice(1).map((line) => line.trim())
      return lines.join('|') === '[0].path: non-empty string|[1].id: duplicate "aB" (ids compare without case)|[2].id: letters, digits, _ or -'
    })
  })
})

describe('attach as the way a user file joins a spec mid-task', () => {
  const RGB = { '.': [0, 0, 0, 0], 'k': [16, 16, 24, 255], 's': [112, 128, 176, 255], 'w': [240, 240, 240, 255], 'r': [200, 0, 0, 255] }
  const pngOf = (name, rows, scale = 1) => {
    const [w, h] = [rows[0].length * scale, rows.length * scale]
    const data = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(RGB[rows[Math.floor(y / scale)][Math.floor(x / scale)]], (y * w + x) * 4)
    const file = path.join(TMP, name)
    writeFileSync(file, encodePng({ width: w, height: h, data }))
    return file
  }
  let counter = 0
  const fresh = () => {
    counter += 1
    const file = path.join(TMP, `attach-${counter}.json`)
    writeFileSync(file, JSON.stringify(spec()))
    return file
  }
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
  const arm = ['wk......', ...Array.from({ length: 7 }).fill(BLANK)]

  it('to be a dry run that reports size, upscale and colors and writes nothing', () => {
    const file = fresh()
    const before = readFileSync(file, 'utf8')
    const result = run('attach', file, pngOf('att-up.png', STAND, 3), '--as', 'frame', '--dry-run')
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /24×24 \(×3 → 8×8\), 2 opaque colors, maxError 0, offPalette 0/)
    assert.match(result.stdout, /dry run, nothing written: would have inserted frame f04/)
    assert.deepEqual([readFileSync(file, 'utf8'), existsSync(`${file}.bak`)], [before, false])
  })

  it('to be a base that replaces the rows of the named frame, with the old file kept as .bak', () => {
    const file = fresh()
    const before = readFileSync(file, 'utf8')
    const result = run('attach', file, pngOf('att-base.png', LEAN), '--as', 'base', '--at', 'a', '--source', 'mine', '--license', 'own work', '--author', 'me')
    assert.equal(result.status, 0, result.stderr)
    const merged = read(file)
    assert.deepEqual([merged.frames[0].rows, merged.frames[0].source, merged.sources], [LEAN, 'mine', [{ name: 'mine', author: 'me', license: 'own work', url: '' }]])
    assert.equal(readFileSync(`${file}.bak`, 'utf8'), before)
    assert.match(result.stdout, /RESULT: DRAFT/)
    assert.equal(run('show', file, 'a').status, 0)
  })

  it('to be a base without --at that becomes a new first rows frame', () => {
    const file = fresh()
    assert.equal(run('attach', file, pngOf('att-base2.png', STAND), '--as', 'base').status, 0)
    const merged = read(file)
    assert.deepEqual([merged.frames[0].id, merged.frames[0].rows, merged.frames.length, merged.sources[0].name], ['base', STAND, 5, 'file-base'])
  })

  it('to be a frame inserted after the named one as a placeholder that carries its source', () => {
    const file = fresh()
    const result = run('attach', file, pngOf('att-frame.png', LEAN), '--as', 'frame', '--after', 'b', '--id', 'extra', '--license', 'CC0', '--url', 'https://example.test/x')
    assert.equal(result.status, 0, result.stderr)
    const merged = read(file)
    assert.deepEqual(merged.frames.map((f) => f.id), ['a', 'b', 'extra', 'c', 'd'])
    assert.deepEqual(merged.frames[2], { id: 'extra', phase: 'hold', ms: 100, source: 'file-extra', rows: LEAN })
    assert.deepEqual(merged.sources, [{ name: 'file-extra', author: '', license: 'CC0', url: 'https://example.test/x' }])
    assert.match(result.stdout, /M2/)
  })

  it('to be a part of any size with its pivot at center-bottom, ready for a layer', () => {
    const file = fresh()
    assert.equal(run('attach', file, pngOf('sword.png', ['.w', 'ww', 'k.']), '--as', 'part', '--source', 'mine', '--license', 'own work').status, 0)
    const merged = read(file)
    assert.deepEqual(merged.parts.sword, { pivot: [1, 2], source: 'mine', rows: ['.w', 'ww', 'k.'] })
    merged.frames[0].layers = [{ part: 'sword', at: [3, 3] }]
    writeFileSync(file, JSON.stringify(merged))
    assert.equal(run('show', file, 'a').status, 0)
  })

  it('to be refused when the snap would be lossy, and extended with --palette-extend', () => {
    const file = fresh()
    const lossy = pngOf('att-red.png', ['rk......', ...Array.from({ length: 7 }).fill(BLANK)])
    const refused = run('attach', file, lossy, '--as', 'frame')
    assert.deepEqual([refused.status, refused.stderr.split('\n')[0].startsWith('ERROR: refusing a lossy snap')], [1, true])
    assert.equal(existsSync(`${file}.bak`), false)
    const dry = run('attach', file, lossy, '--as', 'frame', '--dry-run')
    assert.match(dry.stdout, /dry run: refusing a lossy snap/)
    const extended = run('attach', file, lossy, '--as', 'frame', '--palette-extend')
    assert.equal(extended.status, 0, extended.stderr)
    assert.match(extended.stdout, /palette extended: a=#c80000/)
    assert.deepEqual([read(file).palette.a, read(file).frames.at(-1).rows[0]], ['#c80000', 'ak......'])
  })

  it('to be refused when --palette-extend would pass maxColors', () => {
    const file = fresh()
    writeFileSync(file, JSON.stringify(spec({ maxColors: 4 })))
    const result = run('attach', file, pngOf('att-red2.png', ['rk......', ...Array.from({ length: 7 }).fill(BLANK)]), '--as', 'frame', '--palette-extend')
    assert.match(result.stderr, /needs more colors than maxColors 4/)
    assert.equal(result.status, 1)
  })

  it('to be exit 2 for a size mismatch, a taken id, a missing frame, a missing role and options for another role', () => {
    const file = fresh()
    const png = pngOf('att-misc.png', STAND)
    const first = (...args) => {
      const result = run('attach', file, ...args)
      return [result.status, result.stderr.split('\n')[0]]
    }
    assert.deepEqual(first(pngOf('att-small.png', arm.map((r) => r.slice(0, 4)).slice(0, 4)), '--as', 'frame'), [2, '4×4 does not match the 8×8 canvas; crop it with import --grid, or attach it as a part'])
    assert.deepEqual(first(png, '--as', 'frame', '--id', 'a'), [2, 'frame id "a" is already in the spec; pick another --id'])
    assert.deepEqual(first(png, '--as', 'frame', '--after', 'zz'), [2, '--after: no frame "zz"; frames: a, b, c, d'])
    assert.deepEqual(first(png, '--as', 'base', '--at', 'zz'), [2, '--at: no frame "zz"; frames: a, b, c, d'])
    assert.deepEqual(first(png), [2, 'attach needs --as base|frame|part'])
    assert.deepEqual(first(png, '--as', 'part', '--at', 'a'), [2, '--at only applies to --as base'])
    assert.deepEqual(first(png, '--as', 'frame', '--id', 'bad id'), [2, '--id: letters, digits, _ or -'])
    assert.equal(existsSync(`${file}.bak`), false)
  })

  it('to be a taken part id refused', () => {
    const file = fresh()
    const png = pngOf('gem.png', ['w'])
    assert.equal(run('attach', file, png, '--as', 'part').status, 0)
    assert.equal(run('attach', file, png, '--as', 'part').status, 2)
  })
})

describe('Blender 3D_RIG route as an opt-in local check', () => {
  const enabled = process.env.PIXEL_SPRITE_BLENDER === '1'
  // Skipped unless opted in: CI has no Blender and a real render takes seconds; the codec, import and
  // lint layers it feeds are covered above, so only the Blender invocation itself waits for this run.
  it(
    'to be demo frames that render, import and lint without pixel errors',
    { skip: enabled ? false : 'set PIXEL_SPRITE_BLENDER=1 to render with a local Blender install' },
    () => {
      const frames = path.join(TMP, 'blender')
      // A frame left from an earlier render must not be reported as part of this one.
      mkdirSync(frames, { recursive: true })
      writeFileSync(path.join(frames, 'frame_0009.png'), 'stale')
      const render = run('blender', '--demo', '--out', frames, '--size', '32x32', '--frames', '1-4')
      assert.equal(render.status, 0, render.stdout + render.stderr)
      const pngs = ['0001', '0002', '0003', '0004'].map((n) => path.join(frames, `frame_${n}.png`))
      assert.deepEqual(render.stdout.split('\n').filter((line) => line.startsWith('  ')).map((line) => line.trim()), pngs)
      assert.deepEqual(pngs.map((f) => [decodePng(readFileSync(f)).width, decodePng(readFileSync(f)).height]), Array.from({ length: 4 }, () => [32, 32]))
      const out = path.join(TMP, 'blender.json')
      assert.equal(run('import', ...pngs, '--palette', 'auto:8', '--kind', 'effect', '--actor', 'neutral', '--out', out).status, 0)
      const report = JSON.parse(run('lint', out, '--json').stdout)
      assert.deepEqual(report.errors.filter((f) => ['H1', 'H3', 'H8'].includes(f.rule)), [])
    },
  )
})
