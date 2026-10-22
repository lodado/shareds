// Minimal GIF89a encoder: one global palette, per-frame delay, index-0 transparency, infinite loop.
import { Buffer } from 'node:buffer'

const MAX_CODE = 4096

function le16(value) {
  return [value & 0xFF, (value >> 8) & 0xFF]
}

// LZW in the variable-width form GIF readers expect (same table/width steps as omggif's writer).
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize
  const end = clear + 1
  const out = []
  let bits = 0
  let bitCount = 0
  let codeSize = minCodeSize + 1
  let next = end + 1
  let table = new Map()
  const emit = (code) => {
    bits |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      out.push(bits & 0xFF)
      bits >>>= 8
      bitCount -= 8
    }
  }
  emit(clear)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const known = table.get(key)
    if (known !== undefined) {
      prefix = known
      continue
    }
    emit(prefix)
    if (next === MAX_CODE) {
      emit(clear)
      table = new Map()
      codeSize = minCodeSize + 1
      next = end + 1
    } else {
      if (next >= 1 << codeSize) codeSize++
      table.set(key, next)
      next++
    }
    prefix = k
  }
  emit(prefix)
  emit(end)
  if (bitCount > 0) out.push(bits & 0xFF)
  return out
}

function subBlocks(bytes) {
  const out = []
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255)
    out.push(block.length, ...block)
  }
  out.push(0)
  return out
}

/**
 * `palette`: up to 256 `[r, g, b]` entries, index 0 is transparent.
 * `frames`: `{ indices: Uint8Array(width * height), delayCs }`; each frame replaces the whole canvas.
 */
export function encodeGif({ width, height, palette, frames }) {
  if (palette.length > 256) throw new Error(`GIF palette has ${palette.length} colors; the limit is 256`)
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))))
  const table = Array.from({ length: 1 << bits }, (_, i) => palette[i] ?? [0, 0, 0]).flat()
  const minCodeSize = Math.max(2, bits)
  const screen = [...le16(width), ...le16(height), 0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0]
  const loopForever = [0x21, 0xFF, 0x0B, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0, 0, 0]
  const header = Buffer.from([...Buffer.from('GIF89a', 'ascii'), ...screen, ...table, ...loopForever])
  const images = frames.map(({ indices, delayCs }) => {
    // Disposal 2 (restore to background) keeps transparent pixels from showing the previous frame.
    const control = [0x21, 0xF9, 0x04, (2 << 2) | 1, ...le16(delayCs), 0, 0]
    const descriptor = [0x2C, 0, 0, 0, 0, ...le16(width), ...le16(height), 0, minCodeSize]
    return Buffer.from([...control, ...descriptor, ...subBlocks(lzwEncode(indices, minCodeSize))])
  })
  return Buffer.concat([header, ...images, Buffer.from([0x3B])])
}
