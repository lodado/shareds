// In-page design metrics collector. Requires metrics-core.js (globalThis.__fidMetrics) to be
// injected first; render.mjs injects both and calls globalThis.__fidCollect({ lang }). Plain
// script on purpose (page.addScriptTag), so no import/export. Every count is over *visible* text
// nodes and elements: display:none, visibility:hidden, opacity:0, sr-only clips and collapsed
// boxes are skipped, so the numbers describe what a viewer can see at this viewport.
;(function defineCollector(root) {
  'use strict'

  const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'META', 'LINK', 'SVG'])
  const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, [role="button"]'
  const LINE_SELECTOR = 'p, li, dd, blockquote'
  const LONG_LINE_CHARS = 80
  const TINY_TEXT_PX = 12
  const TAP_TARGET_PX = 24
  const SAMPLE_LIMIT = 5
  const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 }
  const WHITE = { r: 255, g: 255, b: 255, a: 1 }
  const HIDDEN_CLIP = /^rect\(0px(?:,? 0px){3}\)$/
  const HIDDEN_CLIP_PATH = /^inset\((?:50|100)%/

  function snippet(text) {
    const compact = text.replace(/\s+/g, ' ').trim()
    return compact.length > 40 ? `${compact.slice(0, 40)}…` : compact
  }

  function pushSample(list, entry) {
    if (list.length < SAMPLE_LIMIT) list.push(entry)
  }

  function rgbString(color) {
    return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`
  }

  /** The resolved system Canvas color: white by default, dark when the page opts into color-scheme: dark. */
  function canvasColor(metrics) {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;background-color:Canvas;'
    document.body.append(probe)
    const parsed = metrics.parseCssColor(getComputedStyle(probe).backgroundColor)
    probe.remove()
    if (parsed && parsed.a > 0) return parsed
    return WHITE
  }

  function collect(options) {
    const metrics = root.__fidMetrics
    if (!metrics) throw new Error('metrics-core.js must be injected before metrics-browser.js')
    const settings = options || {}
    const lang = settings.lang || document.documentElement.lang || null
    const styles = new Map()
    const visibility = new Map()
    const canvas = canvasColor(metrics)
    const counters = {
      textNodes: 0,
      contrastChecked: 0,
      contrastSkipped: 0,
      contrastFailures: 0,
      hangulTextNodes: 0,
      hangulKeepAllNodes: 0,
      emojiGlyphs: 0,
      tinyText: 0,
      smallTapTargets: 0,
      longLines: 0,
    }
    const samples = { contrastFailures: [], emojiGlyphs: [], tinyText: [], smallTapTargets: [], longLines: [] }
    const families = new Set()

    function styleOf(element) {
      const cached = styles.get(element)
      if (cached) return cached
      const computed = getComputedStyle(element)
      styles.set(element, computed)
      return computed
    }

    function isVisible(element) {
      if (!element || element.nodeType !== 1) return false
      const cached = visibility.get(element)
      if (cached !== undefined) return cached
      let visible = !SKIPPED_TAGS.has(element.tagName.toUpperCase())
      if (visible) {
        const style = styleOf(element)
        visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse' &&
          Number.parseFloat(style.opacity) > 0 &&
          !HIDDEN_CLIP.test(style.clip) &&
          !HIDDEN_CLIP_PATH.test(style.clipPath)
      }
      if (visible && element.parentElement) visible = isVisible(element.parentElement)
      visibility.set(element, visible)
      return visible
    }

    /**
     * Effective background under an element: the nearest ancestor with an opaque background-color,
     * with translucent layers composited on the way up and the system canvas at the root. null when
     * a background-image is hit before an opaque layer — the color under the text is then unknown.
     */
    function backgroundOf(element) {
      let top = TRANSPARENT
      for (let node = element; node; node = node.parentElement) {
        const style = styleOf(node)
        if (style.backgroundImage && style.backgroundImage !== 'none') return null
        const layer = metrics.parseCssColor(style.backgroundColor)
        if (!layer) return null
        if (layer.a > 0) top = metrics.compositeOver(top, layer)
        if (layer.a >= 1) return top
      }
      return metrics.compositeOver(top, canvas)
    }

    function measureContrast(parent, style, text, fontSize) {
      const foreground = metrics.parseCssColor(style.color)
      if (!foreground || foreground.a === 0) {
        counters.contrastSkipped += 1
        return
      }
      const background = backgroundOf(parent)
      if (!background) {
        counters.contrastSkipped += 1
        return
      }
      const ratio = metrics.contrastRatio(foreground, background)
      const minimum = metrics.wcagMinimum(metrics.isLargeText(fontSize, style.fontWeight))
      counters.contrastChecked += 1
      if (ratio < minimum) {
        counters.contrastFailures += 1
        pushSample(samples.contrastFailures, {
          text: snippet(text),
          ratio: Math.round(ratio * 100) / 100,
          minimum,
          color: style.color,
          background: rgbString(background),
        })
      }
    }

    function walkText() {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue
        if (!text || !text.trim()) continue
        const parent = node.parentElement
        if (!parent || !isVisible(parent)) continue
        range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        counters.textNodes += 1
        const style = styleOf(parent)
        const fontSize = Number.parseFloat(style.fontSize)
        families.add(metrics.firstFontFamily(style.fontFamily))
        if (fontSize < TINY_TEXT_PX) {
          counters.tinyText += 1
          pushSample(samples.tinyText, { text: snippet(text), fontSize })
        }
        if (metrics.hasHangul(text)) {
          counters.hangulTextNodes += 1
          if (style.wordBreak === 'keep-all') counters.hangulKeepAllNodes += 1
        }
        if (metrics.hasEmoji(text)) {
          counters.emojiGlyphs += 1
          pushSample(samples.emojiGlyphs, { text: snippet(text) })
        }
        measureContrast(parent, style, text, fontSize)
      }
    }

    /** WCAG 2.5.8 inline exception: a link inside running text is sized by the line, not by itself. */
    function isInlineTextLink(element, style) {
      if (element.tagName !== 'A' || style.display !== 'inline') return false
      const parent = element.parentElement
      if (!parent) return false
      const surrounding = (parent.textContent || '').replace(element.textContent || '', '').trim()
      return surrounding.length > 0
    }

    function measureTapTargets() {
      for (const element of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
        if (!isVisible(element)) continue
        const style = styleOf(element)
        if (isInlineTextLink(element, style)) continue
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        if (rect.width < TAP_TARGET_PX || rect.height < TAP_TARGET_PX) {
          counters.smallTapTargets += 1
          pushSample(samples.smallTapTargets, {
            tag: element.tagName.toLowerCase(),
            text: snippet(
              element.textContent || element.getAttribute('aria-label') || element.getAttribute('type') || '',
            ),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          })
        }
      }
    }

    function measureLongLines() {
      for (const element of document.querySelectorAll(LINE_SELECTOR)) {
        if (!isVisible(element) || element.querySelector(LINE_SELECTOR)) continue
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
        // A block shorter than the limit cannot produce a long line however wide it is.
        if (text.length <= LONG_LINE_CHARS) continue
        const rect = element.getBoundingClientRect()
        const fontSize = Number.parseFloat(styleOf(element).fontSize)
        const chars = metrics.approxCharsPerLine(rect.width, fontSize)
        if (chars > LONG_LINE_CHARS) {
          counters.longLines += 1
          pushSample(samples.longLines, {
            tag: element.tagName.toLowerCase(),
            text: snippet(text),
            charsPerLine: Math.round(chars),
            width: Math.round(rect.width),
          })
        }
      }
    }

    walkText()
    measureTapTargets()
    measureLongLines()

    const fontFamilies = [...families].filter(Boolean).sort()
    return {
      schemaVersion: 1,
      lang,
      viewport: { width: root.innerWidth, height: root.innerHeight },
      textNodes: counters.textNodes,
      contrastChecked: counters.contrastChecked,
      contrastSkipped: counters.contrastSkipped,
      contrastFailures: counters.contrastFailures,
      horizontalOverflow: document.documentElement.scrollWidth > root.innerWidth + 1 ? 1 : 0,
      fontFamilies,
      fontFamilyCount: fontFamilies.length,
      hangulTextNodes: counters.hangulTextNodes,
      hangulKeepAllCoverage:
        counters.hangulTextNodes > 0
          ? Math.round((counters.hangulKeepAllNodes / counters.hangulTextNodes) * 10000) / 10000
          : null,
      emojiGlyphs: counters.emojiGlyphs,
      tinyText: counters.tinyText,
      smallTapTargets: counters.smallTapTargets,
      longLines: counters.longLines,
      samples,
    }
  }

  root.__fidCollect = collect
})(globalThis)
