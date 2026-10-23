// What the cheapest model makes of one new mention, shown to the owner in the digest so the item can be judged
// without opening the thread. The model's answer is untrusted: every field is checked and cut here.

import { clip } from '../slack/blocks.ts'

export interface Analysis {
  // The original post in a line or two.
  request: string
  cause: string
  // How it could be fixed.
  plan: string
  // Whether the model thinks this is worth an automatic change. Only an exact `true` counts.
  recommend: boolean
  why: string
}

// Short enough that the five fields, escaped for Slack (a `<` becomes four characters), still fit one section.
const LIMITS = { request: 150, cause: 180, plan: 250, why: 80 } as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Required = 'request' | 'cause' | 'plan'

function required(raw: Record<string, unknown>, name: Required): string {
  const value = raw[name]
  const text = typeof value === 'string' ? clip(value, LIMITS[name]) : ''
  if (text === '') throw new Error(`the analysis has no ${name}`)
  return text
}

export function parseAnalysis(raw: unknown): Analysis {
  if (!isRecord(raw)) throw new Error('the analysis is not an object')
  return {
    request: required(raw, 'request'),
    cause: required(raw, 'cause'),
    plan: required(raw, 'plan'),
    recommend: raw.recommend === true,
    why: typeof raw.why === 'string' ? clip(raw.why, LIMITS.why) : '',
  }
}

// For an analysis read back from the store: the same checks, but a damaged one is simply missing.
export function readAnalysis(value: unknown): Analysis | undefined {
  try {
    return parseAnalysis(value)
  } catch {
    return undefined
  }
}
