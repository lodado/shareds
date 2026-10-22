// License classes for sources and base candidates. Matching is on the license text the author typed.
const OPEN = [
  /(?<![\w-])cc[\s-]?0(?![\w-])/i,
  /(?<![\w-])public[\s-]?domain(?![\w-])/i,
  /(?<![\w-])(?:pd|mit)(?![\w-])/i,
  /(?<![\w-])(?:own|original)[\s-]work(?![\w-])/i,
  /(?<![\w-])self[\s-]?made(?![\w-])/i,
]
const NEGATED = /\b(?:not|no|non|never|isn't)\s+(?:an?\s+)?$/i
const UNKNOWN_TERMS = /\b(?:all[\s-]rights[\s-]reserved|personal[\s-]use|non[\s-]?free)\b/i
const RESTRICTED = [/\bcc[\s-]?by[\s-]?(?:nc|nd)\b/i, /\bnon[\s-]?commercial\b/i, /\bno[\s-]?derivat/i]
const COPYLEFT = [/\bcc[\s-]?by[\s-]?sa\b/i, /\b(?:share[\s-]?alike|copyleft)\b/i, /(?<![\w-])[al]?gpl/i]
const ATTRIBUTION = /\b(?:cc[\s-]?by|oga[\s-]?by|attribution)\b/i
const GENERATOR = /\b(?:generator|generated|subscription|pixellab|retro[\s-]?diffusion)\b/i

// An open token counts only when nothing negates it right before ("not CC0").
function isOpen(text) {
  return OPEN.some((re) => {
    const match = re.exec(text)
    return match !== null && !NEGATED.test(text.slice(0, match.index))
  })
}

/** "open" | "attribution" | "copyleft" | "restricted" | "generator" | "unknown". */
export function licenseClass(text) {
  if (typeof text !== 'string' || text.trim().length === 0 || UNKNOWN_TERMS.test(text)) return 'unknown'
  if (RESTRICTED.some((re) => re.test(text))) return 'restricted'
  if (COPYLEFT.some((re) => re.test(text))) return 'copyleft'
  if (isOpen(text)) return 'open'
  if (ATTRIBUTION.test(text)) return 'attribution'
  return GENERATOR.test(text) ? 'generator' : 'unknown'
}
