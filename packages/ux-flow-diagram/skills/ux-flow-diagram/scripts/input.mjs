export const DEFAULT_INPUT = Object.freeze({
  analysis: { mode: 'auto' },
  outputs: { markdown: true, mermaid: true, json: true, critique: true, proposedFlow: false, figjam: false },
  options: { includeComponentInteractions: false, includeExternalLinks: true, screenshots: 'auto' },
})

const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com'])
const FIGMA_PATH = /^\/(?:design|file)\/[\w.~-]+(?:[/?#].*)?$/

export function isFigmaUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && FIGMA_HOSTS.has(url.hostname) && FIGMA_PATH.test(url.pathname)
  } catch {
    return false
  }
}

export function normalizeInput(input) {
  return validateInput(input)
}

export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object')
  const keys = { figma: ['url'], scope: ['page', 'section', 'nodeId', 'route'], analysis: ['mode'], outputs: Object.keys(DEFAULT_INPUT.outputs), options: Object.keys(DEFAULT_INPUT.options) }
  for (const key of Object.keys(input)) if (key !== 'source' && !Object.hasOwn(keys, key)) throw new Error(`Unknown input field: ${key}`)
  for (const [name, allowed] of Object.entries(keys)) {
    if (input[name] === undefined) continue
    if (!input[name] || typeof input[name] !== 'object' || Array.isArray(input[name])) throw new Error(`${name} must be an object`)
    for (const key of Object.keys(input[name])) if (!allowed.includes(key)) throw new Error(`Unknown ${name} field: ${key}`)
  }
  const result = {
    ...structuredClone(input), source: input.source ?? (input.figma ? 'figma' : undefined),
    analysis: { ...DEFAULT_INPUT.analysis, ...input.analysis },
    outputs: { ...DEFAULT_INPUT.outputs, ...input.outputs },
    options: { ...DEFAULT_INPUT.options, ...input.options },
  }
  if (!['figma', 'codebase', 'requirements', 'ir'].includes(result.source)) throw new Error('A supported source is required')
  if (result.source === 'figma' && !result.figma) throw new Error('Figma source requires a URL')
  if (result.figma && result.source !== 'figma') throw new Error('Figma URL conflicts with the selected source')
  if (!['auto', 'exact', 'hybrid', 'inferred'].includes(result.analysis.mode)) throw new Error('Unsupported analysis mode')
  for (const [key, value] of Object.entries(result.outputs)) if (typeof value !== 'boolean') throw new Error(`outputs.${key} must be boolean`)
  for (const key of ['includeComponentInteractions', 'includeExternalLinks']) if (typeof result.options[key] !== 'boolean') throw new Error(`options.${key} must be boolean`)
  if (!['auto', 'always', 'never'].includes(result.options.screenshots)) throw new Error('Unsupported screenshots option')
  for (const [key, value] of Object.entries(result.scope || {})) if (typeof value !== 'string' || !value.length) throw new Error(`scope.${key} must be a nonempty string`)
  if (result.figma && !isFigmaUrl(result.figma.url)) throw new Error('Figma URL must use the official figma.com design or file path')
  return result
}
