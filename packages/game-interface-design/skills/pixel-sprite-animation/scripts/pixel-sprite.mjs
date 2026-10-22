#!/usr/bin/env node
// Pixel sprite harness: compose a sprite spec, gate it with deterministic lint, and write review/engine outputs.
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { attachFile } from './lib/attach.mjs'
import { renderBlender } from './lib/blender.mjs'
import { collectCandidates } from './lib/candidates.mjs'
import { UsageError } from './lib/errors.mjs'
import { feelReport } from './lib/feel.mjs'
import { colorReport, importFrames, NEAR_COLOR, parseRange } from './lib/import.mjs'
import { lintSprite } from './lib/lint.mjs'
import { encodePng } from './lib/png.mjs'
import {
  contactSheet,
  creditsText,
  frameFile,
  frameRaster,
  previewFeelGif,
  previewGif,
  sheetJson,
  sheetRaster,
} from './lib/render.mjs'
import { bboxLines, bodyRows, diffFrames, showFrame } from './lib/show.mjs'
import { composeFrames, loadSpec, SpecError } from './lib/spec.mjs'

const USAGE = `usage (run from the skill folder):
  node scripts/pixel-sprite.mjs build <spec.json> [--out <dir>] [--draft] [--cols N]
  node scripts/pixel-sprite.mjs lint <spec.json> [--json]
  node scripts/pixel-sprite.mjs show <spec.json> (<frameId> [--diff | --rows] | --bbox)
  node scripts/pixel-sprite.mjs import <png...> --out <spec.json> --actor player|enemy|neutral
      [--palette auto:N|<file.json>] [--alpha 0-255] [--grid WxH (--row R [--cols a-b] | --cells r:c,...)]
      [--downscale N|auto] [--diff-base first|previous] [--diff-chain] [--name <name>] [--kind action|cycle|idle|effect]
      [--source <name> [--license <text>] [--author <name>] [--url <url>] [--prompt <text>] [--seed <seed>]] [--force]
  node scripts/pixel-sprite.mjs colors <png...> [--alpha 0-255]
  node scripts/pixel-sprite.mjs attach <spec.json> <png> --as base|frame|part [--id <name>] [--at <frameId>]
      [--after <frameId>] [--downscale auto|N] [--alpha 0-255] [--palette-extend] [--dry-run]
      [--source <name>] [--license <text>] [--author <name>] [--url <url>] [--prompt <text>] [--seed <seed>]
  node scripts/pixel-sprite.mjs candidates <manifest.json> --out <dir> [--force]
  node scripts/pixel-sprite.mjs blender (<file.blend> | --demo) --out <dir> [--size WxH] [--frames a-b]
      [--camera <name>] [--bin <path>] [--outline]`
const BOOLEAN_FLAGS = new Set(['json', 'diff', 'rows', 'bbox', 'force', 'demo', 'outline', 'draft', 'diff-chain', 'dry-run', 'palette-extend'])
const OUTPUTS = 'frames/, sheet.png, sheet.json, preview.gif, preview-feel.gif, contact.png, lint.json, feel.json, credits.txt'
// Lists the frame files the last build wrote, so a rebuild removes only those and never a file someone else put there.
const BUILD_MANIFEST = '.pixel-sprite-build.json'
const SOURCE_FLAGS = ['license', 'author', 'url', 'prompt', 'seed']

export function parseArgs(argv) {
  const positional = []
  const flags = {}
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    const name = arg.slice(2)
    const takesValue = arg.startsWith('--') && !BOOLEAN_FLAGS.has(name)
    if (takesValue && (i + 1 >= argv.length || argv[i + 1].startsWith('--'))) throw new UsageError(`--${name} needs a value`)
    if (!arg.startsWith('--')) positional.push(arg)
    else flags[name] = takesValue ? argv[i + 1] : true
    i += takesValue ? 2 : 1
  }
  return { positional, flags }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

// Plain file names only: a hand-edited manifest must not reach outside frames/.
function previousFrameFiles(out) {
  const file = path.join(out, BUILD_MANIFEST)
  if (!existsSync(file)) return []
  try {
    const { frames } = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(frames) ? frames.filter((name) => typeof name === 'string' && name === path.basename(name) && name.endsWith('.png')) : []
  } catch {
    return []
  }
}

/** Composes, lints and writes every output; returns the lint report and output directory. */
export function buildSprite(specFile, outDir, { cols = 6 } = {}) {
  const spec = loadSpec(specFile)
  const frames = composeFrames(spec)
  const report = lintSprite(spec, frames)
  const out = path.resolve(outDir ?? path.join(path.dirname(specFile), 'out', spec.name))
  const framesDir = path.join(out, 'frames')
  mkdirSync(framesDir, { recursive: true })
  for (const name of previousFrameFiles(out)) rmSync(path.join(framesDir, name), { force: true })
  const written = frames.map((f, i) => {
    const name = frameFile(i, f.id)
    writeFileSync(path.join(framesDir, name), encodePng(frameRaster(f, spec.palette)))
    return name
  })
  writeJson(path.join(out, BUILD_MANIFEST), { frames: written })
  writeFileSync(path.join(out, 'sheet.png'), encodePng(sheetRaster(spec, frames)))
  writeJson(path.join(out, 'sheet.json'), sheetJson(spec, frames))
  writeFileSync(path.join(out, 'preview.gif'), previewGif(spec, frames))
  writeFileSync(path.join(out, 'preview-feel.gif'), previewFeelGif(spec, frames))
  writeFileSync(path.join(out, 'contact.png'), encodePng(contactSheet(spec, frames, { cols })))
  writeJson(path.join(out, 'lint.json'), report)
  writeJson(path.join(out, 'feel.json'), feelReport(spec, frames))
  writeFileSync(path.join(out, 'credits.txt'), creditsText(spec, frames))
  return { spec, report, out }
}

function finding(f, label) {
  const where = f.frame ? ` [${f.frame}]` : ''
  const tail = f.reason ? ` — waived: ${f.reason}` : ` → ${f.fix}`
  return `  ${label} ${f.rule}${where} ${f.message}${tail}`
}

function verdict(report, draft) {
  if (draft) return 'DRAFT (not deliverable until a build without --draft passes)'
  return report.ok ? 'PASS' : 'FAIL'
}

export function summarize(spec, report, { draft = false } = {}) {
  const { metrics, errors, warnings, waived } = report
  const timing = `startup ${metrics.startupMs} ms, travel ${metrics.travelMs} ms, contact at ${metrics.timeToContactMs} ms`
  const lines = [
    `${spec.name}: ${metrics.frames} frames, ${metrics.totalMs} ms, ${timing}, ${metrics.colorsUsed}/${spec.maxColors} colors`,
    ...errors.map((f) => finding(f, 'ERROR ')),
    ...warnings.map((f) => finding(f, 'WARN  ')),
    ...waived.map((f) => finding(f, 'WAIVED')),
    `RESULT: ${verdict(report, draft)} — ${errors.length} error(s), ${warnings.length} warning(s), ${waived.length} waived`,
  ]
  return lines.join('\n')
}

// Whole numbers in [min, max]; `fallback` when the flag is absent.
function integerFlag(flags, name, { min = 0, max = Infinity, fallback } = {}) {
  if (flags[name] === undefined) return fallback
  const value = Number(flags[name])
  if (!Number.isInteger(value) || value < min || value > max) {
    const range = max === Infinity ? `${min} or more` : `${min}–${max}`
    throw new UsageError(`--${name} expects a whole number, ${range}`)
  }
  return value
}

// Exit 0 only when nothing is left to fix: no errors and no unwaived warnings. --draft always exits 0
// after writing outputs (an invalid spec still exits 2), so Stage 2–3 iterations can read the contact sheet.
function runBuild({ positional, flags }) {
  const [specFile] = positional
  if (!specFile) throw new UsageError('build needs <spec.json>')
  const { spec, report, out } = buildSprite(specFile, flags.out, { cols: integerFlag(flags, 'cols', { min: 1, fallback: 6 }) })
  console.log(summarize(spec, report, { draft: flags.draft }))
  console.log(`outputs: ${out} (${OUTPUTS})`)
  console.log(`review: Read ${path.join(out, 'contact.png')} and answer the visual checklist`)
  if (flags.draft) return 0
  return report.ok ? 0 : 1
}

function runLint({ positional, flags }) {
  const [specFile] = positional
  if (!specFile) throw new UsageError('lint needs <spec.json>')
  const spec = loadSpec(specFile)
  const report = lintSprite(spec, composeFrames(spec))
  console.log(flags.json ? JSON.stringify(report, null, 2) : summarize(spec, report))
  return report.ok ? 0 : 1
}

function showOne(frames, frameId, flags) {
  const frame = frames.find((f) => f.id === frameId)
  if (!frame) throw new UsageError(`no frame "${frameId}"; frames: ${frames.map((f) => f.id).join(', ')}`)
  if (flags.rows) return bodyRows(frame)
  if (!flags.diff) return showFrame(frame)
  const base = frames.find((f) => f.id === frame.base)
  if (!base) return `frame ${frameId} has no base; --diff compares a frame's body with the body of its base`
  return diffFrames(base, frame).text
}

function runShow({ positional, flags }) {
  const [specFile, frameId] = positional
  if (!specFile || (!frameId && !flags.bbox)) throw new UsageError('show needs <spec.json> and <frameId>, or --bbox')
  const frames = composeFrames(loadSpec(specFile))
  console.log(flags.bbox ? bboxLines(frames).join('\n') : showOne(frames, frameId, flags))
  return 0
}

function sliceOptions(flags) {
  if (!flags.grid) return {}
  const grid = flags.grid.toLowerCase().split('x').map(Number)
  if (grid.length !== 2 || !grid.every((n) => Number.isInteger(n) && n > 0)) throw new UsageError('--grid expects WxH')
  if (flags.cells) {
    const cells = flags.cells.split(',').map((cell) => cell.split(':').map(Number))
    if (!cells.every((cell) => cell.length === 2 && cell.every((n) => Number.isInteger(n) && n >= 0)))
      throw new UsageError('--cells expects row:col pairs of whole numbers, e.g. 0:1,2:3')
    return { grid, cells }
  }
  if (flags.row === undefined) throw new UsageError('--grid needs --row R or --cells r:c,...')
  return { grid, row: integerFlag(flags, 'row'), cols: flags.cols ? parseRange(flags.cols) : undefined }
}

function downscaleFlag(value) {
  if (value === undefined) return 1
  if (value === 'auto') return 'auto'
  const factor = Number(value)
  if (!Number.isInteger(factor) || factor < 1) throw new UsageError('--downscale expects a whole number or auto')
  return factor
}

function diffBaseFlag(flags) {
  const base = flags['diff-base'] ?? (flags['diff-chain'] ? 'previous' : undefined)
  if (base !== undefined && !['first', 'previous'].includes(base)) throw new UsageError('--diff-base expects first or previous')
  if (flags['diff-chain'] && base !== 'previous') throw new UsageError('--diff-chain is --diff-base previous; pass only one')
  return base
}

function sourceFlags(flags) {
  const given = SOURCE_FLAGS.filter((name) => flags[name] !== undefined)
  if (given.length > 0 && !flags.source) throw new UsageError(`--${given.join(', --')} describe --source <name>; pass it too`)
  return Object.fromEntries(given.map((name) => [name, flags[name]]))
}

function runImport({ positional, flags }) {
  if (positional.length === 0 || !flags.out) throw new UsageError('import needs <png...> and --out <spec.json>')
  if (!flags.actor) throw new UsageError('import needs --actor player|enemy|neutral (it sets which timing gates apply)')
  const name = flags.name ?? path.basename(flags.out, '.json').toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')
  const diffBase = diffBaseFlag(flags)
  const { spec, report } = importFrames(positional, {
    ...sliceOptions(flags),
    ...sourceFlags(flags),
    out: flags.out,
    force: flags.force,
    alpha: integerFlag(flags, 'alpha', { max: 255, fallback: 128 }),
    factor: downscaleFlag(flags.downscale),
    diffBase,
    palette: flags.palette,
    source: flags.source,
    name,
    kind: flags.kind,
    actor: flags.actor,
  })
  writeJson(flags.out, spec)
  for (const r of report)
    console.log(`${r.id} ${r.file}#${r.cell}: ×${r.factor} downscale, maxError ${r.maxError}, offPalette ${r.offPalette}, semiAlpha ${r.semiAlpha}`)
  console.log(`wrote ${flags.out}: ${spec.frames.length} frame(s) at ${spec.canvas.join('×')}, ${Object.keys(spec.palette).length - 1} colors`)
  if (diffBase === 'previous') console.log('chained: editing one frame\'s patch moves every later frame; use --diff-base first for independent patches')
  console.log('next: retime phases/ms, fill the sources license, then build')
  return 0
}

const COLOR_LINES = 32

function runColors({ positional, flags }) {
  if (positional.length === 0) throw new UsageError('colors needs <png...>')
  const alpha = integerFlag(flags, 'alpha', { max: 255, fallback: 128 })
  const { pixels, colors, clusters, unclustered } = colorReport(positional, alpha)
  const pct = (count) => `${((count / pixels) * 100).toFixed(1)}%`
  const lines = [
    `${colors.length} opaque color(s) over ${pixels} pixel(s) (alpha ≥ ${alpha}), most used first:`,
    ...colors.slice(0, COLOR_LINES).map((c) => `  ${c.hex}  ${String(c.count).padStart(6)}  ${pct(c.count)}`),
    ...(colors.length > COLOR_LINES ? [`  … ${colors.length - COLOR_LINES} more`] : []),
    `near duplicates (redmean < ${NEAR_COLOR}; usually one palette key):${clusters.length === 0 ? ' none' : ''}`,
    ...clusters.map((group) => `  ${group.join(' ~ ')}`),
    ...(unclustered > 0 ? [`  (${unclustered} least used colors not checked)`] : []),
  ]
  console.log(lines.join('\n'))
  return 0
}

function candidateLine(row) {
  const head = `${row.index}  ${row.id}  ${row.author || 'unknown author'}  ${row.licenseClass}`
  if (row.error) return `${head}  ERROR: ${row.error}`
  const native = row.upscale > 1 ? ` (×${row.upscale} → ${row.nativeSize.join('×')})` : ''
  const scale = row.upscale === null ? ' (no clean integer scale)' : native
  return `${head}  ${row.size.join('×')}${scale}  ${row.colors} colors`
}

async function runCandidates({ positional, flags }) {
  if (positional.length !== 1 || !flags.out) throw new UsageError('candidates needs <manifest.json> and --out <dir>')
  const { out, rows } = await collectCandidates(positional[0], flags.out, { force: flags.force })
  console.log(['index  id  author  license class  size  colors', ...rows.map(candidateLine)].join('\n'))
  console.log(`board: Read ${path.join(out, 'candidates.png')}; data: ${path.join(out, 'candidates.json')}`)
  return rows.some((row) => !row.error) ? 0 : 1
}

function runAttach({ positional, flags }) {
  if (positional.length !== 2) throw new UsageError('attach needs <spec.json> and <png>')
  const [specFile, pngFile] = positional
  const result = attachFile(specFile, pngFile, {
    ...Object.fromEntries(SOURCE_FLAGS.filter((name) => flags[name] !== undefined).map((name) => [name, flags[name]])),
    role: flags.as,
    id: flags.id,
    at: flags.at,
    after: flags.after,
    source: flags.source,
    alpha: integerFlag(flags, 'alpha', { max: 255, fallback: 128 }),
    factor: downscaleFlag(flags.downscale ?? 'auto'),
    paletteExtend: flags['palette-extend'],
    dryRun: flags['dry-run'],
  })
  const { analysis, report } = result
  const scale = analysis.upscale > 1 ? ` (×${analysis.upscale} → ${analysis.nativeSize.join('×')})` : ''
  console.log(`${pngFile}: ${analysis.size.join('×')}${scale}, ${analysis.colors} opaque colors, maxError ${report.maxError}, offPalette ${report.offPalette}, semiAlpha ${report.semiAlpha}`)
  const extended = result.added.map((c) => `${c.key}=${c.hex}`)
  if (extended.length > 0) console.log(`palette extended: ${extended.join(' ')}`)
  if (result.refusal) {
    console.log(`dry run: ${result.refusal}`)
    return 0
  }
  console.log(`${flags['dry-run'] ? 'dry run, nothing written: would have ' : ''}${result.action}`)
  if (!result.written) return 0
  console.log(`wrote ${specFile} (previous file kept as ${specFile}.bak)`)
  const spec = loadSpec(specFile)
  console.log(summarize(spec, lintSprite(spec, composeFrames(spec)), { draft: true }))
  console.log(`next: show ${specFile} ${result.id}`)
  return 0
}

function runBlender({ positional, flags }) {
  if (!flags.out) throw new UsageError('blender needs --out <dir>')
  const files = renderBlender({
    file: positional[0],
    demo: flags.demo,
    out: flags.out,
    size: flags.size,
    frames: flags.frames,
    camera: flags.camera,
    bin: flags.bin,
    outline: flags.outline,
  })
  console.log(`rendered ${files.length} frame(s):`)
  for (const file of files) console.log(`  ${file}`)
  console.log('next: import exactly these files with --palette auto:N or an existing spec palette')
  return 0
}

const COMMANDS = { build: runBuild, lint: runLint, show: runShow, import: runImport, colors: runColors, attach: runAttach, candidates: runCandidates, blender: runBlender }

function commandFor(name) {
  if (typeof name !== 'string' || !Object.hasOwn(COMMANDS, name)) return null
  return COMMANDS[name]
}

export async function main(argv) {
  const [command, ...rest] = argv
  const run = commandFor(command)
  if (!run) {
    console.error(USAGE)
    return 2
  }
  try {
    return await run(parseArgs(rest))
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n${USAGE}`)
      return 2
    }
    if (error instanceof SpecError || error instanceof SyntaxError) {
      console.error(error.message)
      return 2
    }
    console.error(`ERROR: ${error.message}`)
    return 1
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
