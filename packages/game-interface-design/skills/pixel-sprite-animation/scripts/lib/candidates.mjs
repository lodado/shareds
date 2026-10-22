// Base candidates: read or download the listed PNGs, measure them, and lay them out on one board for a pick.
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { UsageError } from './errors.mjs'
import { detectScale, downscale, opaqueColors } from './import.mjs'
import { licenseClass } from './license.mjs'
import { decodePng, encodePng } from './png.mjs'
import { candidateBoard } from './render.mjs'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 20_000
const ID = /^[\w-]+$/
const TEXT_FIELDS = ['page', 'author', 'license', 'note']
const RESERVED_IDS = new Set(['candidates'])
// Lists the files the last run wrote, so a rerun replaces only those and never a file someone else put there.
const RUN_MANIFEST = '.pixel-sprite-candidates.json'

const isText = (value) => typeof value === 'string' && value.trim().length > 0

function sourceErrors(entry, i) {
  const [hasUrl, hasPath] = [entry.url !== undefined, entry.path !== undefined]
  if (hasUrl === hasPath) return [`[${i}]: give exactly one of url or path`]
  if (hasUrl && (!isText(entry.url) || !/^https?:\/\//i.test(entry.url))) return [`[${i}].url: http or https only`]
  if (hasPath && !isText(entry.path)) return [`[${i}].path: non-empty string`]
  return []
}

function idErrors(entry, i, ids) {
  const id = typeof entry.id === 'string' ? entry.id : ''
  if (!ID.test(id)) return [`[${i}].id: letters, digits, _ or -`]
  const key = id.toLowerCase()
  if (RESERVED_IDS.has(key)) return [`[${i}].id: "${id}" is the board's file name`]
  if (ids.has(key)) return [`[${i}].id: duplicate "${id}" (ids compare without case)`]
  ids.add(key)
  return []
}

function entryErrors(entry, i, ids) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [`[${i}]: expected an object`]
  const textErrors = TEXT_FIELDS.filter((key) => entry[key] !== undefined && typeof entry[key] !== 'string').map((key) => `[${i}].${key}: string`)
  return [...idErrors(entry, i, ids), ...sourceErrors(entry, i), ...textErrors]
}

/** A JSON array of `{ id, url | path, page?, author?, license?, note? }`; paths resolve from the manifest. */
function loadManifest(file) {
  if (!existsSync(file)) throw new UsageError(`manifest not found: ${file}`)
  let entries
  try {
    entries = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new UsageError(`${file}: not valid JSON (${error.message})`)
  }
  if (!Array.isArray(entries) || entries.length === 0) throw new UsageError(`${file}: expected a non-empty JSON array of candidates`)
  const ids = new Set()
  const errors = entries.flatMap((entry, i) => entryErrors(entry, i, ids))
  if (errors.length > 0) throw new UsageError(`${file}:\n  ${errors.join('\n  ')}`)
  return entries
}

const tooLarge = (maxBytes) => new Error(`larger than ${Math.round(maxBytes / 1024)} KB; pick a smaller sheet or crop it first`)

function downloadError(error, timeoutMs) {
  if (error.name === 'TimeoutError') return new Error(`no response within ${timeoutMs / 1000} s`)
  const detail = error.cause?.message
  if (!detail) return new Error(`download failed: ${error.message}`)
  return new Error(`download failed: ${error.message} (${detail})`)
}

// Plain GET: no cookies or auth headers. One timer covers the headers and the body, and the body is read
// only up to `maxBytes`.
async function readBody(response, maxBytes) {
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`HTTP ${response.status}`)
  }
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel()
    throw tooLarge(maxBytes)
  }
  const chunks = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.length
    if (size > maxBytes) throw tooLarge(maxBytes)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function download(url, { maxBytes, timeoutMs }) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return await readBody(response, maxBytes)
  } catch (error) {
    if (error.message.startsWith('HTTP ') || error.message.startsWith('larger than')) throw error
    throw downloadError(error, timeoutMs)
  }
}

function readLocal(file, maxBytes) {
  if (!existsSync(file)) throw new Error(`file not found: ${file}`)
  if (statSync(file).size > maxBytes) throw tooLarge(maxBytes)
  return readFileSync(file)
}

// Upscale factor (null when the blocks are not a clean integer grid) and the colors of the native-size image.
function measure(image) {
  try {
    const upscale = detectScale(image)
    const native = downscale(image, upscale)
    return { upscale, native, colors: opaqueColors([{ image: native }], 128).size }
  } catch (error) {
    return { upscale: null, scaleNote: error.message, native: image, colors: opaqueColors([{ image }], 128).size }
  }
}

async function loadCandidate(entry, { root, out, maxBytes, timeoutMs }) {
  const bytes = entry.url ? await download(entry.url, { maxBytes, timeoutMs }) : readLocal(path.resolve(root, entry.path), maxBytes)
  const image = decodePng(bytes)
  const file = `${entry.id}.png`
  writeFileSync(path.join(out, file), bytes)
  const { upscale, scaleNote, native, colors } = measure(image)
  return {
    record: {
      file,
      size: [image.width, image.height],
      upscale,
      ...(scaleNote ? { scaleNote } : {}),
      nativeSize: [native.width, native.height],
      colors,
    },
    native,
  }
}

function previousOutputs(out) {
  const file = path.join(out, RUN_MANIFEST)
  if (!existsSync(file)) return []
  try {
    const { files } = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(files) ? files.filter((name) => typeof name === 'string' && name === path.basename(name)) : []
  } catch {
    return []
  }
}

// Outputs may replace only files an earlier run wrote (or anything, with `force`); never the manifest itself.
function checkOutputs(names, out, manifestFile, force) {
  const mine = new Set(previousOutputs(out))
  const refused = names.filter((name) => {
    const target = path.join(out, name)
    if (target === manifestFile) return true
    return !force && existsSync(target) && !mine.has(name)
  })
  if (refused.length > 0) throw new UsageError(`would overwrite files this command did not write: ${refused.join(', ')}; use another --out, rename the ids, or pass --force`)
}

/**
 * Loads every manifest entry into `out` (`<id>.png` copies, `candidates.json`, `candidates.png`). A failed
 * entry keeps its row with `error` and an empty board cell; the rest still load. Files from an earlier run
 * that no longer load are removed; files it did not write are never touched.
 */
export async function collectCandidates(manifestFile, outDir, { maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS, force = false } = {}) {
  const entries = loadManifest(manifestFile)
  const out = path.resolve(outDir)
  const outputs = [...entries.map((entry) => `${entry.id}.png`), 'candidates.json', 'candidates.png']
  checkOutputs(outputs, out, path.resolve(manifestFile), force)
  mkdirSync(out, { recursive: true })
  const options = { root: path.dirname(path.resolve(manifestFile)), out, maxBytes, timeoutMs }
  const results = await Promise.all(
    entries.map(async (entry) => {
      const meta = { id: entry.id, source: entry.url ?? entry.path, page: entry.page ?? '', author: entry.author ?? '', license: entry.license ?? '', licenseClass: licenseClass(entry.license), note: entry.note ?? '' }
      try {
        const { record, native } = await loadCandidate(entry, options)
        return { row: { ...meta, ...record }, image: native }
      } catch (error) {
        return { row: { ...meta, error: error.message }, image: null }
      }
    }),
  )
  const rows = results.map(({ row }, index) => ({ index, ...row }))
  const written = rows.flatMap((row) => (row.error ? [] : [row.file]))
  for (const stale of previousOutputs(out).filter((name) => !written.includes(name))) rmSync(path.join(out, stale), { force: true })
  writeFileSync(path.join(out, 'candidates.json'), `${JSON.stringify(rows, null, 2)}\n`)
  const board = candidateBoard(results.map(({ row, image }) => ({ image, licenseClass: row.licenseClass })))
  writeFileSync(path.join(out, 'candidates.png'), encodePng(board))
  writeFileSync(path.join(out, RUN_MANIFEST), `${JSON.stringify({ files: [...written, 'candidates.json', 'candidates.png'] }, null, 2)}\n`)
  return { out, rows }
}
