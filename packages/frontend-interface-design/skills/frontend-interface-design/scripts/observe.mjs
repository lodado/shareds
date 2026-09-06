#!/usr/bin/env node
// Observes one public page in a real browser and prints the design facts a Reference Pack may call
// `observed`: font families and roles, the type scale, colour roles, radii, the spacing rhythm and
// the top-level layout slots. It never stores copy, image URLs, logos or CSS from the page — only
// aggregate values and structure — because the pack is evidence about layout and rhythm, not a copy
// of the site. Playwright is resolved the same way render.mjs resolves it, so no new dependency.
// Exit 2 when Playwright is missing or the page could not be observed (403, bot wall, timeout):
// a failed observation must degrade to `unverified`, never to an invented value.
import { realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { DEFAULTS, resolvePlaywright } from './render.mjs'

const USAGE =
  'USAGE: observe.mjs --url <https url> [--out <file.json>] [--device mobile|desktop] [--viewport <px>] [--theme light|dark] [--wait <ms>] [--playwright <dir>] [--executable-path <chromium>]'
const DEVICES = { mobile: 390, desktop: 1440 }
const TOP_N = 12

export function parseArgs(argv) {
  const options = {
    url: null,
    out: null,
    device: 'desktop',
    viewport: null,
    theme: 'light',
    wait: 1500,
    playwright: null,
    executablePath: null,
  }
  const setters = {
    '--url': (value) => {
      options.url = value
    },
    '--out': (value) => {
      options.out = value
    },
    '--device': (value) => {
      if (!DEVICES[value]) throw new Error(`INVALID_DEVICE: ${value}`)
      options.device = value
    },
    '--viewport': (value) => {
      options.viewport = Number.parseInt(value, 10)
    },
    '--theme': (value) => {
      if (value !== 'light' && value !== 'dark') throw new Error(`INVALID_THEME: ${value}`)
      options.theme = value
    },
    '--wait': (value) => {
      options.wait = Number.parseInt(value, 10)
    },
    '--playwright': (value) => {
      options.playwright = value
    },
    '--executable-path': (value) => {
      options.executablePath = value
    },
  }
  for (let index = 0; index < argv.length; index += 2) {
    const setter = setters[argv[index]]
    if (!setter) throw new Error(`UNKNOWN_OPTION: ${argv[index]}\n${USAGE}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`MISSING_VALUE: ${argv[index]}\n${USAGE}`)
    setter(value)
  }
  if (!options.url) throw new Error(USAGE)
  if (!/^https?:\/\//i.test(options.url)) throw new Error(`NOT_A_URL: ${options.url}`)
  assertPublicUrl(options.url)
  options.viewport ??= DEVICES[options.device]
  return options
}

const PRIVATE_HOST =
  /^(?:localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i

/**
 * A Reference Pack records a *public* page. Credentials in the URL mean the observation is of a
 * logged-in view, and a private host means it is not public at all — neither may become evidence.
 */
export function assertPublicUrl(input) {
  const url = new URL(input)
  if (url.username || url.password) throw new Error('CREDENTIALS_IN_URL: a pack records public pages only')
  if (PRIVATE_HOST.test(url.hostname)) throw new Error(`NOT_A_PUBLIC_HOST: ${url.hostname}`)
  return url
}

/** Sorted [value, count] pairs, most frequent first — the shape every observed table uses. */
export function rank(counts, limit = TOP_N) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

/** Interactive pairs come back as JSON strings so they can be tallied; expand them into named fields. */
export function rankPairs(counts, limit = TOP_N) {
  return rank(counts, limit).map(({ value, count }) => ({ ...JSON.parse(value), count }))
}

/**
 * Runs inside the page. Returns aggregates only: no text content, no URLs, no class names, no CSS
 * rules. Serialised as a string because it is injected with page.evaluate.
 */
/* c8 ignore start -- executed in the browser, not in the node test process */
function collectInPage() {
  const nodes = [...document.querySelectorAll('body *')].filter((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
  const tally = (map, key) => {
    if (key === undefined || key === null || key === '') return
    map[key] = (map[key] ?? 0) + 1
  }
  const fontFamilies = {}
  const typeScale = {}
  const textColors = {}
  const surfaceColors = {}
  const radii = {}
  const spacing = {}
  const interactiveColors = {}
  const imageRatios = {}
  let maxFontSize = 0
  let displayFont = null

  for (const element of nodes) {
    const style = getComputedStyle(element)
    const hasOwnText = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
    )
    const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim()
    if (hasOwnText) {
      tally(fontFamilies, family)
      const size = Number.parseFloat(style.fontSize)
      tally(
        typeScale,
        `${Math.round(size)}px/${style.fontWeight}/${
          style.lineHeight === 'normal' ? 'normal' : `${Math.round(Number.parseFloat(style.lineHeight))}px`
        }/${style.letterSpacing === 'normal' ? '0' : style.letterSpacing}`,
      )
      tally(textColors, style.color)
      if (size > maxFontSize) {
        maxFontSize = size
        displayFont = family
      }
    }
    const rect = element.getBoundingClientRect()
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && rect.width * rect.height > 4000)
      tally(surfaceColors, style.backgroundColor)
    for (const corner of new Set([style.borderTopLeftRadius, style.borderBottomRightRadius]))
      if (corner && corner !== '0px') tally(radii, corner)
    for (const value of [style.gap, style.rowGap, style.paddingTop, style.paddingLeft])
      if (value && value !== '0px' && value !== 'normal') tally(spacing, value)
    const tag = element.tagName.toLowerCase()
    if (tag === 'button' || (tag === 'a' && style.backgroundColor !== 'rgba(0, 0, 0, 0)'))
      // Structured, not "X on Y": that phrasing reads backwards and a pack quoting it can attach a
      // count to the wrong button. background and foreground are named.
      tally(interactiveColors, JSON.stringify({ background: style.backgroundColor, foreground: style.color }))
    if (tag === 'img' && rect.width > 80 && rect.height > 40)
      tally(imageRatios, (rect.width / rect.height).toFixed(2))
  }

  const slotOf = (element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') ?? null,
      heading: element.querySelector('h1,h2,h3') ? element.querySelector('h1,h2,h3').tagName.toLowerCase() : null,
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      display: style.display,
      columns: style.gridTemplateColumns === 'none' ? null : style.gridTemplateColumns.split(' ').length,
      children: element.children.length,
      position: style.position,
    }
  }
  // Frameworks wrap the page in layout <div>s. Drill through any single visible child that owns
  // nearly the whole document height until the children are the real content bands.
  const drill = (root) => {
    let node = root
    for (let depth = 0; depth < 8; depth += 1) {
      const visible = [...node.children].filter((child) => {
        const rect = child.getBoundingClientRect()
        return rect.height > 0 && rect.width > 0
      })
      if (visible.length !== 1 || visible[0].getBoundingClientRect().height < node.getBoundingClientRect().height * 0.8)
        return node
      node = visible[0]
    }
    return node
  }
  const main = drill(document.querySelector('main') ?? document.body)
  const bands = [...main.children].filter((child) => child.getBoundingClientRect().height > 40)
  const slots = [
    ...[...document.querySelectorAll('header, [role="banner"], body nav')].slice(0, 2).map(slotOf),
    ...bands.slice(0, 14).map(slotOf),
    ...[...document.querySelectorAll('footer, [role="contentinfo"]')].slice(0, 1).map(slotOf),
  ]

  return {
    documentHeight: Math.round(document.documentElement.scrollHeight),
    lang: document.documentElement.lang || null,
    fontFamilies,
    displayFont,
    maxFontSize: Math.round(maxFontSize),
    typeScale,
    textColors,
    surfaceColors,
    interactiveColors,
    radii,
    spacing,
    imageRatios,
    slots,
    contentWidth: Math.round(main.getBoundingClientRect().width),
  }
}
/* c8 ignore stop */

/** Turns the raw in-page tallies into the ranked tables a pack quotes, plus the observation header. */
export function summarize(raw, { url, viewport, device, theme, status }) {
  return {
    url,
    device,
    viewportWidth: viewport,
    theme,
    httpStatus: status,
    observedAt: new Date().toISOString().slice(0, 10),
    method: 'browser-observed',
    lang: raw.lang,
    documentHeight: raw.documentHeight,
    contentWidth: raw.contentWidth,
    fontFamilies: rank(raw.fontFamilies),
    displayFont: raw.displayFont,
    maxFontSize: raw.maxFontSize,
    typeScale: rank(raw.typeScale),
    textColors: rank(raw.textColors, 8),
    surfaceColors: rank(raw.surfaceColors, 8),
    interactiveColors: rankPairs(raw.interactiveColors, 6),
    radii: rank(raw.radii, 8),
    spacing: rank(raw.spacing, 10),
    imageRatios: rank(raw.imageRatios, 6),
    slots: raw.slots,
  }
}

export async function observe(options) {
  const playwright = await resolvePlaywright({ playwrightDir: options.playwright })
  if (!playwright.chromium) throw new Error(`PLAYWRIGHT_NOT_FOUND. Tried: ${playwright.tried.join(', ')}`)
  const executablePath = options.executablePath ?? process.env.FID_CHROMIUM_EXECUTABLE ?? null
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  })
  try {
    const page = await browser.newPage({
      viewport: { width: options.viewport, height: DEFAULTS.height },
      colorScheme: options.theme,
    })
    const response = await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    const status = response?.status() ?? 0
    if (status >= 400) throw new Error(`BLOCKED_OR_MISSING: HTTP ${status} for ${options.url}`)
    await page.waitForTimeout(options.wait)
    const raw = await page.evaluate(collectInPage)
    if (raw.slots.length === 0) throw new Error(`EMPTY_DOM: ${options.url} rendered no slots (SPA shell or bot wall)`)
    return summarize(raw, { url: options.url, viewport: options.viewport, device: options.device, theme: options.theme, status })
  } finally {
    await browser.close()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const observation = await observe(options)
  const json = `${JSON.stringify(observation, null, 2)}\n`
  if (options.out) {
    await mkdir(dirname(resolve(options.out)), { recursive: true })
    await writeFile(resolve(options.out), json)
    process.stderr.write(
      `observed ${options.url} @${options.viewport}px: ${observation.slots.length} slots, ${observation.fontFamilies.length} font families → ${options.out}\n`,
    )
  } else {
    process.stdout.write(json)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`OBSERVE_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
