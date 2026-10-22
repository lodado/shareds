// Minimal PNG codec for sprite work: writes RGBA8, reads gray/RGB/indexed/alpha at 1–16 bits, no interlace.
import { Buffer } from 'node:buffer'
import { deflateSync, inflateSync } from 'node:zlib'

// Checked from the header before inflating, so a tiny file cannot expand into gigabytes.
const MAX_PIXELS = 4096 * 4096
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xFFFFFFFF
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** Encodes `{ width, height, data }` (RGBA, 4 bytes per pixel) as an 8-bit RGBA PNG. */
export function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function predict(type, a, b, c) {
  if (type === 0) return 0
  if (type === 1) return a
  if (type === 2) return b
  if (type === 3) return (a + b) >> 1
  if (type === 4) return paeth(a, b, c)
  throw new Error(`unsupported PNG filter type ${type}`)
}

function unfilter(raw, rowBytes, height, bpp) {
  const out = Buffer.alloc(rowBytes * height)
  // Bytes before the first pixel or above the first row read as 0, as the PNG spec defines.
  const at = (index, inside) => (inside ? out[index] : 0)
  for (let y = 0; y < height; y++) {
    const type = raw[y * (rowBytes + 1)]
    const src = y * (rowBytes + 1) + 1
    const dst = y * rowBytes
    for (let x = 0; x < rowBytes; x++) {
      const a = at(dst + x - bpp, x >= bpp)
      const b = at(dst - rowBytes + x, y > 0)
      const c = at(dst - rowBytes + x - bpp, x >= bpp && y > 0)
      out[dst + x] = (raw[src + x] + predict(type, a, b, c)) & 0xFF
    }
  }
  return out
}

function readChunks(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file')
  const found = { idat: [], palette: null, trns: null, header: null }
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'IEND') break
    if (type === 'IHDR') {
      found.header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      }
    }
    if (type === 'PLTE') found.palette = data
    if (type === 'tRNS') found.trns = data
    if (type === 'IDAT') found.idat.push(data)
  }
  if (!found.header) throw new Error('PNG has no IHDR chunk')
  return found
}

function makeSampler(rows, rowBytes, depth, channels) {
  const max = (1 << Math.min(depth, 8)) - 1
  return (x, y, channel) => {
    const row = y * rowBytes
    if (depth === 16) return rows[row + (x * channels + channel) * 2]
    if (depth === 8) return rows[row + x * channels + channel]
    const bit = x * depth
    return (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max
  }
}

function transparentRgb(trns, color, depth) {
  if (!trns || color === 3) return null
  // tRNS for gray/RGB stores 16-bit samples; compare against the same scale the sampler returns.
  const read = (i) => (depth === 16 ? trns[i * 2] : trns.readUInt16BE(i * 2))
  return color === 0 ? [read(0)] : [read(0), read(1), read(2)]
}

/** Decodes a non-interlaced PNG into `{ width, height, data }` with RGBA bytes. */
export function decodePng(buffer) {
  const { header, idat, palette, trns } = readChunks(buffer)
  const { width, height, depth, color, interlace } = header
  const channels = CHANNELS[color]
  if (!channels || !DEPTHS[color].includes(depth)) throw new Error(`unsupported PNG color type ${color}/${depth}`)
  if (interlace !== 0) throw new Error('interlaced PNG is not supported; re-export without interlacing')
  if (color === 3 && !palette) throw new Error('indexed PNG has no PLTE chunk')
  if (width === 0 || height === 0) throw new Error('PNG has no pixels (0 width or height)')
  if (width * height > MAX_PIXELS) throw new Error(`PNG is ${width}×${height}; images above ${MAX_PIXELS} pixels are refused`)
  const bitsPerPixel = channels * depth
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8)
  const rawBytes = (rowBytes + 1) * height
  const rows = unfilter(inflateSync(Buffer.concat(idat), { maxOutputLength: rawBytes }), rowBytes, height, Math.max(1, bitsPerPixel >> 3))
  const sample = makeSampler(rows, rowBytes, depth, channels)
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1
  const keyed = transparentRgb(trns, color, depth)
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const values = Array.from({ length: channels }, (_, ch) => sample(x, y, ch))
      data.set(toRgba(values, { color, scale, palette, trns, keyed }), (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

function paletteAlpha(trns, index) {
  if (!trns || index >= trns.length) return 255
  return trns[index]
}

function toRgba(values, { color, scale, palette, trns, keyed }) {
  if (color === 3) {
    const i = values[0]
    return [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2], paletteAlpha(trns, i)]
  }
  const matches = keyed !== null && keyed.every((v, i) => v === values[i])
  if (color === 0) {
    const g = Math.round(values[0] * scale)
    return [g, g, g, matches ? 0 : 255]
  }
  if (color === 4) return [values[0], values[0], values[0], values[1]]
  if (color === 2) return [values[0], values[1], values[2], matches ? 0 : 255]
  return values
}
