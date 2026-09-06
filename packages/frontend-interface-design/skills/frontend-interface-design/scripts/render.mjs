#!/usr/bin/env node
// Renders one HTML file or URL across viewport × color-scheme cells with Playwright, runs the
// deterministic design metrics in-page (metrics-core.js + metrics-browser.js) and writes
// <out>/metrics.json plus one full-page PNG per cell. The script carries no dependency of its own:
// Playwright is resolved at runtime from --playwright, FID_PLAYWRIGHT_DIR, the current working
// directory or this file's directory, in that order. The exit code is 0 even when every gate
// fails — grading is a separate step (evals/grade-results.mjs) — and 2 when Playwright is missing.
import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const CORE_SCRIPT = join(scriptDirectory, 'metrics-core.js')
const BROWSER_SCRIPT = join(scriptDirectory, 'metrics-browser.js')
const USAGE =
  'USAGE: render.mjs --in <html file | http(s) url> --out <dir> [--viewports 375,1280] [--themes light,dark] [--lang ko|en] [--source <dir>] [--playwright <dir>] [--executable-path <chromium>] [--impeccable]'
const THEMES = new Set(['light', 'dark'])
const URL_PATTERN = /^https?:\/\//i
const SOURCE_EXTENSIONS = new Set(['.css', '.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.html'])
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.git'])
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
// A token block is the :root / .dark / [data-theme] rule that *defines* tokens; its literals are the tokens themselves.
const TOKEN_BLOCK_SELECTOR = /(?:^|[\s;{}>"'`])((?::root|\.dark|html\.dark|\[data-theme[^\]]*\])[^{}]*)\{/
const COLOR_LITERAL = /(?:^|[\s:(,'"[=])(?:#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab)\()/gi
const FONT_FAMILY_LITERAL = /font-?family\s*:\s*(?!var\()/gi
const RADIUS_DECLARATION = /border-?radius\s*:\s*([^;{}\n]*)/gi
const PX_VALUE = /\b\d+(?:\.\d+)?px\b/
const TAILWIND_RADIUS = /rounded-\[\d+(?:\.\d+)?px\]/g
const TOKEN_REFERENCE = /var\(\s*--[\w-]+/g
const MAX_FIELDS = [
  'contrastFailures',
  'horizontalOverflow',
  'emojiGlyphs',
  'tinyText',
  'smallTapTargets',
  'longLines',
  'textNodes',
  'hangulTextNodes',
  'contrastChecked',
  'contrastSkipped',
]
const IMPECCABLE_TIMEOUT_MS = 180_000

export const DEFAULTS = Object.freeze({ viewports: [375, 1280], themes: ['light', 'dark'], lang: 'en', height: 900 })

const SETTERS = {
  '--in': (options, value) => {
    options.in = value
  },
  '--out': (options, value) => {
    options.out = value
  },
  '--viewports': (options, value) => {
    options.viewports = parseViewports(value)
  },
  '--themes': (options, value) => {
    options.themes = parseThemes(value)
  },
  '--lang': (options, value) => {
    options.lang = value
  },
  '--source': (options, value) => {
    options.source = value
  },
  '--playwright': (options, value) => {
    options.playwright = value
  },
  '--executable-path': (options, value) => {
    options.executablePath = value
  },
}

function round(value, digits = 4) {
  return Math.round(value * 10 ** digits) / 10 ** digits
}

export function parseViewports(text) {
  const viewports = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
  if (viewports.length === 0 || viewports.some((width) => !Number.isSafeInteger(width) || width < 200)) {
    throw new Error(`INVALID_VIEWPORTS: ${text}`)
  }
  return viewports
}

export function parseThemes(text) {
  const themes = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (themes.length === 0 || themes.some((theme) => !THEMES.has(theme))) throw new Error(`INVALID_THEMES: ${text}`)
  return themes
}

export function parseArgs(argv) {
  const options = {
    in: null,
    out: null,
    viewports: [...DEFAULTS.viewports],
    themes: [...DEFAULTS.themes],
    lang: DEFAULTS.lang,
    source: null,
    playwright: null,
    executablePath: null,
    impeccable: false,
  }
  let index = 0
  while (index < argv.length) {
    const arg = argv[index]
    if (arg === '--impeccable') {
      options.impeccable = true
      index += 1
      continue
    }
    const setter = SETTERS[arg]
    if (!setter) throw new Error(`UNKNOWN_OPTION: ${arg}\n${USAGE}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`MISSING_VALUE: ${arg}\n${USAGE}`)
    setter(options, value)
    index += 2
  }
  if (!options.in || !options.out) throw new Error(USAGE)
  return options
}

export function isUrl(input) {
  return URL_PATTERN.test(input)
}

export function toPageUrl(input) {
  return isUrl(input) ? input : pathToFileURL(resolve(input)).href
}

function packageVersion(entry) {
  try {
    return createRequire(entry)(join(dirname(entry), 'package.json')).version ?? null
  } catch {
    return null
  }
}

/**
 * Finds a Playwright package without depending on one: --playwright <dir>, FID_PLAYWRIGHT_DIR, the
 * current working directory, then this script's own directory, each tried for `playwright` and
 * `playwright-core`. Returns { chromium: null, tried } when nothing resolves.
 */
export async function resolvePlaywright({ playwrightDir = null, env = process.env, cwd = process.cwd() } = {}) {
  const bases = [playwrightDir, env.FID_PLAYWRIGHT_DIR, cwd, scriptDirectory].filter(Boolean)
  const tried = []
  for (const base of bases) {
    const requireFrom = createRequire(join(resolve(base), 'noop.js'))
    for (const name of ['playwright', 'playwright-core']) {
      let entry
      try {
        entry = requireFrom.resolve(name)
      } catch {
        tried.push(`${name} from ${resolve(base)}`)
        continue
      }
      const module = await import(pathToFileURL(entry).href)
      const chromium = module.chromium ?? module.default?.chromium ?? null
      if (chromium) return { chromium, source: `${name} from ${resolve(base)}`, version: packageVersion(entry), tried }
      tried.push(`${name} from ${resolve(base)} (no chromium export)`)
    }
  }
  return { chromium: null, source: null, version: null, tried }
}

/** One cell per viewport × theme: emulate the color scheme, wait for network idle and fonts, collect, screenshot. */
export async function renderCells({ chromium, executablePath, url, out, viewports, themes, lang }) {
  // --no-sandbox: the harness runs in containers and CI images where Chromium's user namespace
  // sandbox is unavailable; the pages rendered here are the run's own files, never untrusted sites.
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  })
  const cells = {}
  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
        const key = `${viewport}-${theme}`
        const page = await browser.newPage({ viewport: { width: viewport, height: DEFAULTS.height } })
        try {
          await page.emulateMedia({ colorScheme: theme })
          await page.goto(url, { waitUntil: 'networkidle' })
          await page.evaluate(() => document.fonts.ready.then(() => document.fonts.status))
          await page.addScriptTag({ path: CORE_SCRIPT })
          await page.addScriptTag({ path: BROWSER_SCRIPT })
          const collected = await page.evaluate((options) => globalThis.__fidCollect(options), { lang })
          const screenshot = join(out, `${key}.png`)
          await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
          cells[key] = { viewportWidth: viewport, theme, screenshot, ...collected }
        } catch (error) {
          cells[key] = { viewportWidth: viewport, theme, error: error.message }
        } finally {
          await page.close()
        }
      }
    }
    return { cells, browserVersion: browser.version() }
  } finally {
    await browser.close()
  }
}

/** Worst cell wins: max for every defect count, union for font families, min for keep-all coverage. */
export function aggregateMetrics(cells) {
  const rendered = Object.values(cells).filter((cell) => cell && !cell.error)
  const max = (field) => rendered.reduce((highest, cell) => Math.max(highest, Number(cell[field]) || 0), 0)
  const fontFamilies = [...new Set(rendered.flatMap((cell) => cell.fontFamilies ?? []))].sort()
  const coverages = rendered.map((cell) => cell.hangulKeepAllCoverage).filter((value) => typeof value === 'number')
  const aggregate = { cells: Object.keys(cells).length, renderedCells: rendered.length }
  for (const field of MAX_FIELDS) aggregate[field] = max(field)
  aggregate.fontFamilies = fontFamilies
  aggregate.fontFamilyCount = fontFamilies.length
  aggregate.hangulKeepAllCoverage = coverages.length ? Math.min(...coverages) : null
  return aggregate
}

export function isTokenFile(name) {
  return name === 'tokens.css' || name.endsWith('.tokens.css')
}

/** Removes comments and every :root / .dark / [data-theme] block so token definitions are not counted as literals. */
export function stripTokenBlocks(text) {
  let source = text.replace(BLOCK_COMMENT, '')
  while (true) {
    const match = TOKEN_BLOCK_SELECTOR.exec(source)
    if (!match) return source
    const open = match.index + match[0].length - 1
    const start = open - match[1].length
    let depth = 0
    let end = open
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1
      else if (source[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    source = source.slice(0, start) + source.slice(end + 1)
  }
}

/** Counts literal colors, font-family declarations and px radii versus var(--token) references in one file's text. */
export function scanSourceText(text) {
  const source = stripTokenBlocks(text)
  const colors = [...source.matchAll(COLOR_LITERAL)].length
  const fontFamilies = [...source.matchAll(FONT_FAMILY_LITERAL)].length
  const radii =
    [...source.matchAll(RADIUS_DECLARATION)].filter((match) => PX_VALUE.test(match[1])).length +
    [...source.matchAll(TAILWIND_RADIUS)].length
  const tokenReferences = [...source.matchAll(TOKEN_REFERENCE)].length
  return { colors, fontFamilies, radii, literalValues: colors + fontFamilies + radii, tokenReferences }
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...(await listSourceFiles(path)))
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(path)
    }
  }
  return files.sort()
}

/** Scans a directory (or one file) for token discipline: literal values versus var(--token) references. */
export async function scanSource(root) {
  const target = resolve(root)
  const info = await stat(target)
  const files = info.isDirectory() ? await listSourceFiles(target) : [target]
  const totals = {
    directory: target,
    files: 0,
    skipped: [],
    colors: 0,
    fontFamilies: 0,
    radii: 0,
    literalValues: 0,
    tokenReferences: 0,
    literalRatio: 0,
  }
  for (const file of files) {
    if (isTokenFile(basename(file))) {
      totals.skipped.push(file)
      continue
    }
    const counts = scanSourceText(await readFile(file, 'utf8'))
    totals.files += 1
    for (const key of ['colors', 'fontFamilies', 'radii', 'literalValues', 'tokenReferences']) totals[key] += counts[key]
  }
  const total = totals.literalValues + totals.tokenReferences
  totals.literalRatio = total ? round(totals.literalValues / total) : 0
  return totals
}

function execute(command, args, { cwd = process.cwd(), timeoutMs = 120_000 } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, shell: process.platform === 'win32' })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code, stdout, stderr, timedOut })
    })
  })
}

/** `impeccable detect --json` prints a findings array on stdout (4.0.x); tolerate a wrapped { findings } too. */
export function parseImpeccableOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim())
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.findings)) return parsed.findings
    return null
  } catch {
    return null
  }
}

export function summarizeImpeccable(findings, { exitCode, engine, runtimeMs }) {
  const byRule = {}
  const bySeverity = {}
  const byCategory = {}
  let advisory = 0
  for (const finding of findings) {
    const rule = finding?.antipattern ?? finding?.rule ?? 'unknown'
    const severity = finding?.severity ?? 'unknown'
    byRule[rule] = (byRule[rule] ?? 0) + 1
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1
    const category = finding?.category ?? 'unknown'
    byCategory[category] = (byCategory[category] ?? 0) + 1
    if (severity === 'advisory' || finding?.advisory === true) advisory += 1
  }
  return {
    available: true,
    engine,
    exitCode,
    runtimeMs,
    findings: findings.length,
    primary: findings.length - advisory,
    advisory,
    byRule,
    bySeverity,
    byCategory,
  }
}

/**
 * Runs `npx --yes impeccable detect --json --no-config <input>`. Files use the static HTML engine
 * (16 of 61 rules for non-HTML sources), URLs the bundled browser engine. Unavailable never fails
 * the render: the result says { available: false, reason } instead.
 */
export async function runImpeccable(input, { viewport = DEFAULTS.viewports[0] } = {}) {
  const url = isUrl(input)
  const args = ['--yes', 'impeccable', 'detect', '--json', '--no-config']
  if (url) args.push('--viewport', `${viewport}x${DEFAULTS.height}`)
  args.push(url ? input : resolve(input))
  const startedAt = Date.now()
  let result
  try {
    result = await execute('npx', args, { timeoutMs: IMPECCABLE_TIMEOUT_MS })
  } catch (error) {
    return { available: false, reason: `SPAWN_FAILED: ${error.message}` }
  }
  const runtimeMs = Date.now() - startedAt
  if (result.timedOut) return { available: false, reason: `TIMEOUT after ${IMPECCABLE_TIMEOUT_MS}ms` }
  const findings = parseImpeccableOutput(result.stdout)
  if (!findings) {
    return { available: false, reason: `UNPARSEABLE_OUTPUT (exit ${result.code}): ${result.stderr.trim().slice(-300)}` }
  }
  let engine = 'regex'
  if (url) engine = 'browser'
  else if (extname(input).toLowerCase() === '.html') engine = 'static-html'
  return summarizeImpeccable(findings, { exitCode: result.code, engine, runtimeMs })
}

function impeccableSummary(impeccable) {
  if (!impeccable) return 'off'
  if (!impeccable.available) return 'unavailable'
  return String(impeccable.findings)
}

export function summaryLine(metrics) {
  const { aggregate, source } = metrics
  const coverage = aggregate.hangulKeepAllCoverage === null ? 'n/a' : aggregate.hangulKeepAllCoverage.toFixed(2)
  const literal = source ? source.literalRatio.toFixed(2) : 'n/a'
  const impeccable = impeccableSummary(metrics.impeccable)
  return [
    `rendered ${aggregate.renderedCells}/${aggregate.cells} cells`,
    `contrast ${aggregate.contrastFailures}`,
    `overflow ${aggregate.horizontalOverflow}`,
    `fonts ${aggregate.fontFamilyCount}`,
    `emoji ${aggregate.emojiGlyphs}`,
    `tiny ${aggregate.tinyText}`,
    `tap ${aggregate.smallTapTargets}`,
    `long ${aggregate.longLines}`,
    `keep-all ${coverage}`,
    `literal ${literal}`,
    `impeccable ${impeccable}`,
  ].join(' · ')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const playwright = await resolvePlaywright({ playwrightDir: options.playwright })
  if (!playwright.chromium) {
    process.stderr.write(
      `PLAYWRIGHT_NOT_FOUND: run \`npm i playwright-core\` in any directory and pass --playwright <that dir> (or set FID_PLAYWRIGHT_DIR); for the browser run \`npx playwright install chromium\` there or pass --executable-path <chromium binary>. Tried: ${playwright.tried.join(', ')}\n`,
    )
    process.exitCode = 2
    return
  }
  const out = resolve(options.out)
  await mkdir(out, { recursive: true })
  const executablePath = options.executablePath ?? process.env.FID_CHROMIUM_EXECUTABLE ?? null
  const { cells, browserVersion } = await renderCells({
    chromium: playwright.chromium,
    executablePath,
    url: toPageUrl(options.in),
    out,
    viewports: options.viewports,
    themes: options.themes,
    lang: options.lang,
  })
  const aggregate = aggregateMetrics(cells)
  const source = options.source ? await scanSource(options.source) : null
  const impeccable = options.impeccable ? await runImpeccable(options.in, { viewport: options.viewports[0] }) : null
  const metrics = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: isUrl(options.in) ? options.in : resolve(options.in),
    lang: options.lang,
    renderer: { playwright: playwright.source, playwrightVersion: playwright.version, chromium: browserVersion, executablePath },
    errors: Object.entries(cells)
      .filter(([, cell]) => cell.error)
      .map(([key, cell]) => `${key}: ${cell.error}`),
    viewports: cells,
    aggregate,
    source,
    impeccable,
  }
  const metricsPath = join(out, 'metrics.json')
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`)
  process.stdout.write(`${summaryLine(metrics)} → ${metricsPath}\n`)
  if (aggregate.renderedCells === 0) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`RENDER_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
