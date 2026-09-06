import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  aggregateMetrics,
  DEFAULTS,
  isTokenFile,
  isUrl,
  parseArgs,
  parseImpeccableOutput,
  parseThemes,
  parseViewports,
  scanSource,
  scanSourceText,
  stripTokenBlocks,
  summarizeImpeccable,
  summaryLine,
  toPageUrl,
} from '../skills/frontend-interface-design/scripts/render.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const renderScript = join(packageDirectory, 'skills/frontend-interface-design/scripts/render.mjs')

async function tempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fid-render-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

test('parseArgs reads every option, applies defaults and rejects unknown or valueless options', () => {
  const options = parseArgs([
    '--in',
    'page.html',
    '--out',
    'shots',
    '--viewports',
    '320, 1440',
    '--themes',
    'dark',
    '--lang',
    'ko',
    '--source',
    'src',
    '--impeccable',
  ])
  assert.deepEqual(options, {
    in: 'page.html',
    out: 'shots',
    viewports: [320, 1440],
    themes: ['dark'],
    lang: 'ko',
    source: 'src',
    playwright: null,
    executablePath: null,
    impeccable: true,
  })

  const defaults = parseArgs(['--in', 'https://example.test/', '--out', 'o'])
  assert.deepEqual(defaults.viewports, DEFAULTS.viewports)
  assert.deepEqual(defaults.themes, DEFAULTS.themes)
  assert.equal(defaults.lang, DEFAULTS.lang)
  assert.equal(defaults.impeccable, false)

  assert.throws(() => parseArgs(['--out', 'o']), /USAGE/)
  assert.throws(() => parseArgs(['--in', 'a', '--out', 'o', '--bogus', '1']), /UNKNOWN_OPTION: --bogus/)
  assert.throws(() => parseArgs(['--in', '--out', 'o']), /MISSING_VALUE: --in/)
  assert.throws(() => parseViewports('100,1280'), /INVALID_VIEWPORTS/)
  assert.throws(() => parseViewports(''), /INVALID_VIEWPORTS/)
  assert.throws(() => parseThemes('sepia'), /INVALID_THEMES/)
  assert.deepEqual(parseThemes(' light , dark '), ['light', 'dark'])
})

test('file inputs become file urls and http inputs pass through', () => {
  assert.equal(isUrl('https://example.test/page'), true)
  assert.equal(isUrl('HTTP://example.test'), true)
  assert.equal(isUrl('./index.html'), false)
  assert.equal(toPageUrl('https://example.test/page'), 'https://example.test/page')
  assert.match(toPageUrl('index.html'), /^file:\/\/\/.*index\.html$/)
})

test('aggregateMetrics takes the worst cell for counts, the union of fonts and the lowest keep-all coverage', () => {
  const cells = {
    '375-light': {
      viewportWidth: 375,
      theme: 'light',
      contrastFailures: 0,
      horizontalOverflow: 1,
      emojiGlyphs: 2,
      tinyText: 0,
      smallTapTargets: 3,
      longLines: 0,
      textNodes: 40,
      hangulTextNodes: 10,
      contrastChecked: 38,
      contrastSkipped: 2,
      fontFamilies: ['Pretendard', 'sans-serif'],
      hangulKeepAllCoverage: 1,
    },
    '1280-light': {
      viewportWidth: 1280,
      theme: 'light',
      contrastFailures: 4,
      horizontalOverflow: 0,
      emojiGlyphs: 0,
      tinyText: 1,
      smallTapTargets: 0,
      longLines: 2,
      textNodes: 41,
      hangulTextNodes: 10,
      contrastChecked: 41,
      contrastSkipped: 0,
      fontFamilies: ['Inter', 'Pretendard'],
      hangulKeepAllCoverage: 0.8,
    },
    '1280-dark': { viewportWidth: 1280, theme: 'dark', error: 'net::ERR_FAILED' },
  }

  const aggregate = aggregateMetrics(cells)
  assert.equal(aggregate.cells, 3)
  assert.equal(aggregate.renderedCells, 2)
  assert.equal(aggregate.contrastFailures, 4)
  assert.equal(aggregate.horizontalOverflow, 1)
  assert.equal(aggregate.emojiGlyphs, 2)
  assert.equal(aggregate.tinyText, 1)
  assert.equal(aggregate.smallTapTargets, 3)
  assert.equal(aggregate.longLines, 2)
  assert.equal(aggregate.textNodes, 41)
  assert.deepEqual(aggregate.fontFamilies, ['Inter', 'Pretendard', 'sans-serif'])
  assert.equal(aggregate.fontFamilyCount, 3)
  assert.equal(aggregate.hangulKeepAllCoverage, 0.8)

  const none = aggregateMetrics({ '375-light': { error: 'boom' } })
  assert.equal(none.renderedCells, 0)
  assert.equal(none.hangulKeepAllCoverage, null)
  assert.deepEqual(none.fontFamilies, [])
})

test('stripTokenBlocks removes :root, .dark and [data-theme] blocks and comments but keeps component rules', () => {
  const css = `
/* palette: #ffffff */
:root { --primary: #123456; --radius: 8px; }
.dark { --primary: rgb(1 2 3); }
[data-theme="dark"] .x { color: #000; }
.button { color: var(--primary); border-radius: var(--radius); }
.card { background: #fafafa; }
`
  const stripped = stripTokenBlocks(css)
  assert.doesNotMatch(stripped, /#123456|rgb\(1 2 3\)|#000\b|#ffffff/)
  assert.match(stripped, /\.button \{ color: var\(--primary\)/)
  assert.match(stripped, /#fafafa/)
  assert.equal(isTokenFile('tokens.css'), true)
  assert.equal(isTokenFile('theme.tokens.css'), true)
  assert.equal(isTokenFile('button.css'), false)
})

test('scanSourceText counts literal colors, font families and px radii against var(--token) references', () => {
  const counts = scanSourceText(`
    .a { color: #ff0000; background: hsl(10 20% 30%); font-family: Inter, sans-serif; border-radius: 4px; }
    .b { color: var(--fg); background: var(--bg); font-family: var(--font-sans); border-radius: var(--radius); }
    <div className="rounded-[6px] text-[#abc]">
  `)
  assert.equal(counts.colors, 3)
  assert.equal(counts.fontFamilies, 1)
  assert.equal(counts.radii, 2)
  assert.equal(counts.literalValues, 6)
  assert.equal(counts.tokenReferences, 4)
})

test('scanSource skips tokens.css and :root blocks and reports the literal ratio of a component tree', async (t) => {
  const root = await tempDirectory(t)
  await mkdir(join(root, 'components'), { recursive: true })
  await mkdir(join(root, 'node_modules/dep'), { recursive: true })
  await writeFile(
    join(root, 'tokens.css'),
    ':root { --primary: #123456; --radius: 8px; }\n.dark { --primary: #654321; }\n',
  )
  await writeFile(
    join(root, 'components/styles.css'),
    ':root { --local: #ffffff; }\n.card { color: var(--fg); background: var(--surface); border-radius: var(--radius); }\n',
  )
  await writeFile(
    join(root, 'components/Button.tsx'),
    "export const Button = () => <button style={{ color: '#ff0000', background: 'var(--primary)', borderRadius: 'var(--radius)' }} />\n",
  )
  await writeFile(join(root, 'components/notes.md'), 'color: #abcdef is prose, not source\n')
  await writeFile(join(root, 'node_modules/dep/index.css'), '.dep { color: #000000; }\n')

  const scan = await scanSource(root)
  assert.equal(scan.files, 2)
  assert.deepEqual(scan.skipped, [join(root, 'tokens.css')])
  assert.equal(scan.colors, 1)
  assert.equal(scan.fontFamilies, 0)
  assert.equal(scan.radii, 0)
  assert.equal(scan.literalValues, 1)
  assert.equal(scan.tokenReferences, 5)
  assert.equal(scan.literalRatio, Number((1 / 6).toFixed(4)))

  const single = await scanSource(join(root, 'components/Button.tsx'))
  assert.equal(single.files, 1)
  assert.equal(single.literalRatio, Number((1 / 3).toFixed(4)))
})

test('impeccable output is summarized by rule, severity and category, and garbage is rejected', () => {
  assert.equal(parseImpeccableOutput('not json'), null)
  assert.equal(parseImpeccableOutput('{"nope": 1}'), null)
  assert.deepEqual(parseImpeccableOutput('{"findings": []}'), [])
  const findings = parseImpeccableOutput(
    JSON.stringify([
      { antipattern: 'low-contrast', severity: 'warning', category: 'quality' },
      { antipattern: 'low-contrast', severity: 'warning', category: 'quality' },
      { antipattern: 'emoji-icons', severity: 'advisory', category: 'slop' },
    ]),
  )
  const summary = summarizeImpeccable(findings, { exitCode: 1, engine: 'static-html', runtimeMs: 12 })
  assert.equal(summary.available, true)
  assert.equal(summary.findings, 3)
  assert.equal(summary.primary, 2)
  assert.equal(summary.advisory, 1)
  assert.deepEqual(summary.byRule, { 'low-contrast': 2, 'emoji-icons': 1 })
  assert.deepEqual(summary.bySeverity, { warning: 2, advisory: 1 })
  assert.deepEqual(summary.byCategory, { quality: 2, slop: 1 })
})

test('summaryLine reports every gate metric on one line', () => {
  const line = summaryLine({
    aggregate: {
      cells: 4,
      renderedCells: 4,
      contrastFailures: 1,
      horizontalOverflow: 0,
      fontFamilyCount: 2,
      emojiGlyphs: 0,
      tinyText: 0,
      smallTapTargets: 3,
      longLines: 0,
      hangulKeepAllCoverage: 0.97,
    },
    source: { literalRatio: 0.05 },
    impeccable: { available: false, reason: 'x' },
  })
  assert.equal(
    line,
    'rendered 4/4 cells · contrast 1 · overflow 0 · fonts 2 · emoji 0 · tiny 0 · tap 3 · long 0 · keep-all 0.97 · literal 0.05 · impeccable unavailable',
  )
  assert.match(
    summaryLine({
      aggregate: { cells: 1, renderedCells: 1, hangulKeepAllCoverage: null },
      source: null,
      impeccable: null,
    }),
    /keep-all n\/a · literal n\/a · impeccable off$/,
  )
})

test('render.mjs exits 2 with a PLAYWRIGHT_NOT_FOUND hint when no playwright package resolves', async (t) => {
  const root = await tempDirectory(t)
  const page = join(root, 'index.html')
  await writeFile(page, '<!doctype html><html><body><p>hi</p></body></html>')

  const result = spawnSync(
    process.execPath,
    [renderScript, '--in', page, '--out', join(root, 'out'), '--playwright', join(root, 'nowhere')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, FID_PLAYWRIGHT_DIR: join(root, 'nowhere-either') },
    },
  )
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /^PLAYWRIGHT_NOT_FOUND/)
  assert.equal(await exists(join(root, 'out/metrics.json')), false)
})

test('a real browser renders korean text and reports the emoji and the contrast failure', async (t) => {
  if (!process.env.FID_PLAYWRIGHT_DIR) {
    t.skip('FID_PLAYWRIGHT_DIR is not set: no Playwright module directory to render with')
    return
  }
  const root = await tempDirectory(t)
  const page = join(root, 'index.html')
  await writeFile(
    page,
    [
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>smoke</title>',
      '<style>body{margin:0;font-family:sans-serif;color:#111;background:#fff;word-break:keep-all}main{padding:24px;max-width:640px}',
      '.low{color:#9a9a9a}.btn{display:inline-block;padding:12px 20px;background:#2b6cb0;color:#fff;border-radius:8px}</style></head>',
      '<body><main><h1>한국어 제목입니다</h1>',
      '<p>본문 텍스트가 어절 단위로 줄바꿈되는지 확인합니다. 이 문장은 충분히 길어서 모바일 화면에서 여러 줄로 나뉩니다.</p>',
      '<p><span class="low">낮은 대비 텍스트</span> 옆에 <span>이모지 🚀 아이콘</span></p>',
      '<button class="btn">확인</button></main></body></html>',
    ].join('\n'),
  )
  const out = join(root, 'out')

  const result = spawnSync(
    process.execPath,
    [
      renderScript,
      '--in',
      page,
      '--out',
      out,
      '--lang',
      'ko',
      '--viewports',
      '375,1280',
      '--themes',
      'light',
      '--source',
      root,
    ],
    { cwd: root, encoding: 'utf8', env: process.env },
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /rendered 2\/2 cells/)
  assert.equal(await exists(join(out, '375-light.png')), true)
  assert.equal(await exists(join(out, '1280-light.png')), true)

  const metrics = JSON.parse(await readFile(join(out, 'metrics.json'), 'utf8'))
  assert.equal(metrics.schemaVersion, 1)
  assert.equal(metrics.lang, 'ko')
  assert.deepEqual(metrics.errors, [])
  assert.deepEqual(Object.keys(metrics.viewports), ['375-light', '1280-light'])
  assert.equal(metrics.aggregate.renderedCells, 2)
  assert.equal(metrics.aggregate.emojiGlyphs, 1)
  assert.equal(metrics.aggregate.contrastFailures, 1)
  assert.equal(metrics.aggregate.horizontalOverflow, 0)
  assert.ok(metrics.aggregate.hangulTextNodes >= 4)
  assert.equal(metrics.aggregate.hangulKeepAllCoverage, 1)
  assert.equal(metrics.viewports['375-light'].samples.contrastFailures[0].text, '낮은 대비 텍스트')
  assert.match(metrics.viewports['375-light'].samples.emojiGlyphs[0].text, /🚀/)
  assert.equal(metrics.source.files, 1)
  assert.equal(metrics.impeccable, null)
})
