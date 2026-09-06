import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

// metrics-core.js is a plain script (it is injected into the page with addScriptTag), so it is loaded
// for its side effect: it defines globalThis.__fidMetrics.
import '../skills/frontend-interface-design/scripts/metrics-core.js'

const metrics = globalThis.__fidMetrics

function rgb(color, digits = 0) {
  const fix = (value) => Number(value.toFixed(digits))
  return [fix(color.r), fix(color.g), fix(color.b)]
}

test('the metrics core exposes a frozen, versioned api on the global', () => {
  assert.equal(metrics.version, 1)
  assert.ok(Object.isFrozen(metrics))
  for (const name of [
    'parseCssColor',
    'contrastRatio',
    'compositeOver',
    'isLargeText',
    'hasHangul',
    'hasEmoji',
    'approxCharsPerLine',
  ]) {
    assert.equal(typeof metrics[name], 'function', name)
  }
})

test('parseCssColor reads hex, rgb and hsl in legacy and modern syntax', () => {
  assert.deepEqual(metrics.parseCssColor('#fff'), { r: 255, g: 255, b: 255, a: 1 })
  assert.deepEqual(metrics.parseCssColor('#0A0B0C'), { r: 10, g: 11, b: 12, a: 1 })
  assert.equal(Number(metrics.parseCssColor('#00000080').a.toFixed(2)), 0.5)
  assert.deepEqual(metrics.parseCssColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 })
  assert.deepEqual(metrics.parseCssColor('rgba(1, 2, 3, 0.25)'), { r: 1, g: 2, b: 3, a: 0.25 })
  assert.deepEqual(metrics.parseCssColor('rgb(255 0 0 / 50%)'), { r: 255, g: 0, b: 0, a: 0.5 })
  assert.deepEqual(rgb(metrics.parseCssColor('hsl(120 100% 50%)')), [0, 255, 0])
  assert.deepEqual(rgb(metrics.parseCssColor('hsla(0, 100%, 50%, 1)')), [255, 0, 0])
  assert.deepEqual(rgb(metrics.parseCssColor('hsl(240deg 100% 50%)')), [0, 0, 255])
  assert.deepEqual(metrics.parseCssColor('transparent'), { r: 0, g: 0, b: 0, a: 0 })
  assert.deepEqual(metrics.parseCssColor('white'), { r: 255, g: 255, b: 255, a: 1 })
  for (const invalid of ['', 'currentcolor', 'linear-gradient(red, blue)', 'rgb(1 2)', '#12', 42, null]) {
    assert.equal(metrics.parseCssColor(invalid), null, `${invalid} must not parse`)
  }
})

test('oklch and oklab parse into srgb and keep their lightness order', () => {
  const dark = metrics.parseCssColor('oklch(0.3 0.05 230)')
  const light = metrics.parseCssColor('oklch(0.9 0.05 230)')
  assert.ok(dark && light, 'oklch must parse')
  assert.ok(metrics.relativeLuminance(dark) < metrics.relativeLuminance(light))
  assert.ok(metrics.relativeLuminance(metrics.parseCssColor('oklch(50% 0.1 30deg)')) < metrics.relativeLuminance(light))
  assert.deepEqual(rgb(metrics.parseCssColor('oklch(1 0 0)')), [255, 255, 255])
  assert.deepEqual(rgb(metrics.parseCssColor('oklab(0 0 0)')), [0, 0, 0])
  assert.equal(metrics.parseCssColor('oklch(0.6 0.1 30 / 0.5)').a, 0.5)
  assert.deepEqual(rgb(metrics.parseCssColor('color(srgb 1 0 0)')), [255, 0, 0])
  assert.deepEqual(rgb(metrics.parseCssColor('color(display-p3 1 1 1)')), [255, 255, 255])
})

test('contrastRatio follows wcag: black on white is 21, #767676 on white is about 4.54', () => {
  assert.equal(Number(metrics.contrastRatio('#000', '#fff').toFixed(2)), 21)
  assert.equal(Number(metrics.contrastRatio('#fff', '#000').toFixed(2)), 21)
  assert.equal(Number(metrics.contrastRatio('#767676', '#ffffff').toFixed(2)), 4.54)
  assert.equal(Number(metrics.contrastRatio('#fff', '#fff').toFixed(2)), 1)
  // Translucent text is composited on its background before measuring.
  assert.ok(metrics.contrastRatio('rgba(0, 0, 0, 0.5)', '#fff') < metrics.contrastRatio('#000', '#fff'))
  assert.equal(metrics.contrastRatio('nope', '#fff'), null)
})

test('compositeOver blends source-over and keeps a translucent result translucent', () => {
  assert.deepEqual(rgb(metrics.compositeOver('rgba(255, 255, 255, 0.5)', '#000'), 1), [127.5, 127.5, 127.5])
  assert.equal(metrics.compositeOver('rgba(255, 255, 255, 0.5)', '#000').a, 1)
  const stacked = metrics.compositeOver('rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.5)')
  assert.equal(stacked.a, 0.75)
  assert.deepEqual(metrics.compositeOver('transparent', 'transparent'), { r: 0, g: 0, b: 0, a: 0 })
  assert.deepEqual(rgb(metrics.compositeOver({ r: 255, g: 0, b: 0, a: 1 }, '#fff')), [255, 0, 0])
})

test('isLargeText applies the 24px / 18.66px-bold thresholds and wcagMinimum follows it', () => {
  assert.equal(metrics.isLargeText(24, 400), true)
  assert.equal(metrics.isLargeText(23.9, 400), false)
  assert.equal(metrics.isLargeText(18.66, 700), true)
  assert.equal(metrics.isLargeText(18.66, 'bold'), true)
  assert.equal(metrics.isLargeText(18.66, '600'), false)
  assert.equal(metrics.isLargeText(18, 700), false)
  assert.equal(metrics.isLargeText('16px', 'bold'), false)
  assert.equal(metrics.isLargeText(Number.NaN, 700), false)
  assert.equal(metrics.wcagMinimum(true), 3)
  assert.equal(metrics.wcagMinimum(false), 4.5)
})

test('hasHangul and hasEmoji tell korean text and emoji icons from digits, letters and © marks', () => {
  assert.equal(metrics.hasHangul('한글'), true)
  assert.equal(metrics.hasHangul('Hangul 한'), true)
  assert.equal(metrics.hasHangul('abc'), false)
  assert.equal(metrics.hasHangul(''), false)

  for (const emoji of ['🚀', 'go 🚀 now', '❤️', '1️⃣', '©️', '👩‍💻', '🇰🇷'])
    assert.equal(metrics.hasEmoji(emoji), true, `${emoji} is an emoji`)
  for (const text of ['#', '1', 'A', '한글', '© 2026', '™', '*', '', '1.5 × 2'])
    assert.equal(metrics.hasEmoji(text), false, `${text} is not an emoji`)
})

test('approxCharsPerLine and firstFontFamily give the collector its line and family measures', () => {
  assert.equal(metrics.approxCharsPerLine(550, 10), 100)
  assert.equal(Math.round(metrics.approxCharsPerLine(640, 16)), 73)
  assert.equal(metrics.approxCharsPerLine(0, 16), 0)
  assert.equal(metrics.approxCharsPerLine(640, 0), 0)
  assert.equal(metrics.approxCharsPerLine('wide', 16), 0)
  assert.equal(metrics.firstFontFamily('"Pretendard Variable", Pretendard, sans-serif'), 'Pretendard Variable')
  assert.equal(metrics.firstFontFamily("'Inter', sans-serif"), 'Inter')
  assert.equal(metrics.firstFontFamily('sans-serif'), 'sans-serif')
  assert.equal(metrics.firstFontFamily(null), '')
})
