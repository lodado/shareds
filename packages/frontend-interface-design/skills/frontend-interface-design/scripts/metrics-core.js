// Pure design metrics shared by the in-page collector (metrics-browser.js), render.mjs and the
// Node tests. This is a plain script on purpose: render.mjs injects it with
// page.addScriptTag({ path }) and Node loads it by side-effect import, so it must not use
// import/export. Everything is exposed on globalThis.__fidMetrics.
;(function defineMetricsCore(root) {
  'use strict'

  const HEX = /^#([\da-f]{3,8})$/i
  const COLOR_FUNCTION = /^([a-z-]+)\((.*)\)$/s
  const NUMBER = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/
  const NAMED = {
    transparent: { r: 0, g: 0, b: 0, a: 0 },
    black: { r: 0, g: 0, b: 0, a: 1 },
    white: { r: 255, g: 255, b: 255, a: 1 },
  }
  const WHITE = NAMED.white
  const HANGUL = /\p{Script=Hangul}/u
  const PICTOGRAPHIC = /\p{Extended_Pictographic}/u
  // Typographic symbols that carry Extended_Pictographic but read as text unless VS16 forces
  // emoji presentation: ©, ®, ™. A footer "© 2026" is not an emoji icon.
  const TEXT_SYMBOLS = /^[©®™]$/
  const KEYCAP = /[#*\d]️?⃣/u
  const VARIATION_SELECTOR_16 = '️'
  const WEIGHT_NAMES = { normal: 400, bold: 700, bolder: 700, lighter: 300 }
  // Average glyph advance as a share of the font size, the usual "measure" approximation.
  const AVERAGE_GLYPH_WIDTH = 0.55
  const LARGE_TEXT_PX = 24
  const LARGE_BOLD_TEXT_PX = 18.66
  const CHROMA_PERCENT_SCALE = 0.4

  function clamp01(value) {
    return Math.min(1, Math.max(0, value))
  }

  function parseNumber(token) {
    const match = NUMBER.exec(token)
    if (!match) return null
    return { value: Number(match[1]), unit: match[2] || '' }
  }

  /** Splits color function arguments; legacy comma syntax carries alpha as a fourth value, modern syntax after a slash. */
  function splitArguments(text, legacyAlpha) {
    const tokens = text
      .replace(/\s*\/\s*/g, ' / ')
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
    const slash = tokens.indexOf('/')
    if (slash !== -1) return { values: tokens.slice(0, slash), alpha: tokens[slash + 1] ?? null }
    if (legacyAlpha && tokens.length === 4) return { values: tokens.slice(0, 3), alpha: tokens[3] }
    return { values: tokens, alpha: null }
  }

  function parseAlpha(token) {
    if (token === null || token === undefined) return 1
    if (token === 'none') return 0
    const number = parseNumber(token)
    if (!number) return null
    return clamp01(number.unit === '%' ? number.value / 100 : number.value)
  }

  /** rgb() channel: percentage of 255 or a plain 0–255 number. */
  function parseByte(token) {
    if (token === 'none') return 0
    const number = parseNumber(token)
    if (!number) return null
    const value = number.unit === '%' ? (number.value / 100) * 255 : number.value
    return Math.min(255, Math.max(0, value))
  }

  /** A 0–1 component given as a percentage or a plain number. */
  function parseUnit(token, scale) {
    if (token === 'none') return 0
    const number = parseNumber(token)
    if (!number) return null
    return number.unit === '%' ? (number.value / 100) * scale : number.value
  }

  function parseHue(token) {
    if (token === undefined || token === 'none') return 0
    const number = parseNumber(token)
    if (!number) return null
    if (number.unit === 'rad') return (number.value * 180) / Math.PI
    if (number.unit === 'grad') return number.value * 0.9
    if (number.unit === 'turn') return number.value * 360
    return number.value
  }

  function parseHex(digits) {
    let expanded = digits
    if (digits.length === 3 || digits.length === 4) expanded = [...digits].map((digit) => digit + digit).join('')
    if (expanded.length !== 6 && expanded.length !== 8) return null
    const channel = (offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: expanded.length === 8 ? channel(6) / 255 : 1,
    }
  }

  function hslToRgb(hue, saturation, lightness) {
    const h = ((hue % 360) + 360) % 360
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = lightness - chroma / 2
    let rgb
    if (h < 60) rgb = [chroma, x, 0]
    else if (h < 120) rgb = [x, chroma, 0]
    else if (h < 180) rgb = [0, chroma, x]
    else if (h < 240) rgb = [0, x, chroma]
    else if (h < 300) rgb = [x, 0, chroma]
    else rgb = [chroma, 0, x]
    return rgb.map((component) => (component + m) * 255)
  }

  function gammaToLinear(component) {
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4
  }

  function linearToGamma(component) {
    const value = clamp01(component)
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  }

  function oklabToRgb(lightness, a, b) {
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((component) => linearToGamma(component) * 255)
  }

  function displayP3ToRgb(r, g, b) {
    const [lr, lg, lb] = [r, g, b].map(gammaToLinear)
    const x = 0.4865709486 * lr + 0.2656676932 * lg + 0.1982172852 * lb
    const y = 0.2289745641 * lr + 0.6917385218 * lg + 0.0792869141 * lb
    const z = 0.0451133819 * lg + 1.0439443689 * lb
    return [
      3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z,
      -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z,
      0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z,
    ].map((component) => linearToGamma(component) * 255)
  }

  function withAlpha(rgb, alpha) {
    if (!rgb || rgb.some((component) => !Number.isFinite(component)) || alpha === null) return null
    return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha }
  }

  function parseRgb(values, alpha) {
    if (values.length !== 3) return null
    const rgb = values.map(parseByte)
    if (rgb.includes(null)) return null
    return withAlpha(rgb, parseAlpha(alpha))
  }

  function parseHsl(values, alpha) {
    if (values.length !== 3) return null
    const hue = parseHue(values[0])
    const saturation = parseUnit(values[1], 1)
    const lightness = parseUnit(values[2], 1)
    if (hue === null || saturation === null || lightness === null) return null
    // Modern syntax allows plain numbers for s/l; they still mean percentages.
    const normalize = (value, token) => (token.endsWith('%') ? value : value / 100)
    return withAlpha(
      hslToRgb(hue, clamp01(normalize(saturation, values[1])), clamp01(normalize(lightness, values[2]))),
      parseAlpha(alpha),
    )
  }

  function parseOklch(values, alpha) {
    if (values.length < 2 || values.length > 3) return null
    const lightness = parseUnit(values[0], 1)
    const chroma = parseUnit(values[1], CHROMA_PERCENT_SCALE)
    const hue = parseHue(values[2])
    if (lightness === null || chroma === null || hue === null) return null
    const radians = (hue * Math.PI) / 180
    return withAlpha(
      oklabToRgb(clamp01(lightness), chroma * Math.cos(radians), chroma * Math.sin(radians)),
      parseAlpha(alpha),
    )
  }

  function parseOklab(values, alpha) {
    if (values.length !== 3) return null
    const lightness = parseUnit(values[0], 1)
    const a = parseUnit(values[1], CHROMA_PERCENT_SCALE)
    const b = parseUnit(values[2], CHROMA_PERCENT_SCALE)
    if (lightness === null || a === null || b === null) return null
    return withAlpha(oklabToRgb(clamp01(lightness), a, b), parseAlpha(alpha))
  }

  function parseColorSpace(values, alpha) {
    if (values.length !== 4) return null
    const components = values.slice(1).map((token) => parseUnit(token, 1))
    if (components.includes(null)) return null
    const [r, g, b] = components.map(clamp01)
    switch (values[0]) {
      case 'srgb':
        return withAlpha([r * 255, g * 255, b * 255], parseAlpha(alpha))
      case 'srgb-linear':
        return withAlpha(
          [r, g, b].map((component) => linearToGamma(component) * 255),
          parseAlpha(alpha),
        )
      case 'display-p3':
        return withAlpha(displayP3ToRgb(r, g, b), parseAlpha(alpha))
      default:
        return null
    }
  }

  /**
   * Parses a CSS color into { r, g, b, a } with rgb in 0–255 and alpha in 0–1. Supports hex 3/4/6/8,
   * rgb()/rgba(), hsl()/hsla() (legacy and modern syntax), oklch(), oklab() and color(srgb|srgb-linear|display-p3).
   * Returns null for anything else (keywords other than transparent/black/white, gradients, currentcolor).
   */
  function parseCssColor(input) {
    if (typeof input !== 'string') return null
    const text = input.trim().toLowerCase()
    if (!text) return null
    if (Object.hasOwn(NAMED, text)) return { ...NAMED[text] }
    const hex = HEX.exec(text)
    if (hex) return parseHex(hex[1])
    const call = COLOR_FUNCTION.exec(text)
    if (!call) return null
    const { values, alpha } = splitArguments(call[2], call[1] !== 'color')
    switch (call[1]) {
      case 'rgb':
      case 'rgba':
        return parseRgb(values, alpha)
      case 'hsl':
      case 'hsla':
        return parseHsl(values, alpha)
      case 'oklch':
        return parseOklch(values, alpha)
      case 'oklab':
        return parseOklab(values, alpha)
      case 'color':
        return parseColorSpace(values, alpha)
      default:
        return null
    }
  }

  function toColor(value) {
    if (typeof value === 'string') return parseCssColor(value)
    if (value && typeof value === 'object' && ['r', 'g', 'b'].every((key) => Number.isFinite(value[key]))) {
      return { r: value.r, g: value.g, b: value.b, a: Number.isFinite(value.a) ? value.a : 1 }
    }
    return null
  }

  /** WCAG relative luminance of an opaque color (alpha is ignored; composite first). */
  function relativeLuminance(input) {
    const color = toColor(input)
    if (!color) return null
    const [r, g, b] = [color.r, color.g, color.b].map((channel) => gammaToLinear(clamp01(channel / 255)))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  /** Source-over compositing of a (possibly translucent) foreground on a (possibly translucent) background. */
  function compositeOver(foregroundInput, backgroundInput) {
    const foreground = toColor(foregroundInput)
    const background = toColor(backgroundInput)
    if (!foreground || !background) return null
    const alpha = foreground.a + background.a * (1 - foreground.a)
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const blend = (key) =>
      (foreground[key] * foreground.a + background[key] * background.a * (1 - foreground.a)) / alpha
    return { r: blend('r'), g: blend('g'), b: blend('b'), a: alpha }
  }

  /** WCAG contrast ratio. A translucent background is assumed to sit on white; translucent text is composited on the background. */
  function contrastRatio(foregroundInput, backgroundInput) {
    const foreground = toColor(foregroundInput)
    const background = toColor(backgroundInput)
    if (!foreground || !background) return null
    const opaqueBackground = background.a < 1 ? compositeOver(background, WHITE) : background
    const opaqueForeground = foreground.a < 1 ? compositeOver(foreground, opaqueBackground) : foreground
    const first = relativeLuminance(opaqueForeground)
    const second = relativeLuminance(opaqueBackground)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }

  function fontWeightNumber(value) {
    if (typeof value === 'number') return value
    if (typeof value !== 'string') return 400
    const named = WEIGHT_NAMES[value.trim().toLowerCase()]
    if (named) return named
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 400
  }

  /** WCAG "large text": at least 24px, or at least 18.66px (14pt) and bold. */
  function isLargeText(fontSizePx, fontWeight) {
    const size = Number(fontSizePx)
    if (!Number.isFinite(size)) return false
    return size >= LARGE_TEXT_PX || (size >= LARGE_BOLD_TEXT_PX && fontWeightNumber(fontWeight) >= 700)
  }

  function wcagMinimum(largeText) {
    return largeText ? 3 : 4.5
  }

  function hasHangul(text) {
    return typeof text === 'string' && HANGUL.test(text)
  }

  /**
   * True when the text contains an emoji glyph: any Extended_Pictographic character except the
   * typographic ©/®/™ (unless VS16 forces emoji presentation), plus keycap sequences. Bare digits,
   * '#' and '*' (keycap bases) never count.
   */
  function hasEmoji(text) {
    if (typeof text !== 'string' || !text) return false
    if (KEYCAP.test(text)) return true
    const characters = [...text]
    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index]
      if (!PICTOGRAPHIC.test(character)) continue
      if (TEXT_SYMBOLS.test(character) && characters[index + 1] !== VARIATION_SELECTOR_16) continue
      return true
    }
    return false
  }

  /** Approximate characters per line for a block: width / (fontSize × 0.55). 0 when either side is not positive. */
  function approxCharsPerLine(widthPx, fontSizePx) {
    const width = Number(widthPx)
    const size = Number(fontSizePx)
    if (!(width > 0) || !(size > 0)) return 0
    return width / (size * AVERAGE_GLYPH_WIDTH)
  }

  /** First family of a font-family stack with quotes stripped, e.g. `"Pretendard Variable", sans-serif` → Pretendard Variable. */
  function firstFontFamily(fontFamily) {
    if (typeof fontFamily !== 'string') return ''
    const first = fontFamily.split(',')[0] ?? ''
    return first
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim()
  }

  root.__fidMetrics = Object.freeze({
    version: 1,
    parseCssColor,
    relativeLuminance,
    contrastRatio,
    compositeOver,
    isLargeText,
    fontWeightNumber,
    wcagMinimum,
    hasHangul,
    hasEmoji,
    approxCharsPerLine,
    firstFontFamily,
  })
})(globalThis)
