// What the cheapest model makes of one new mention, shown to the owner in the digest so the item can be judged
// without opening the thread. The model's answer is untrusted: every field is checked and cut here.

import { clip } from '../slack/blocks.ts'

export interface Analysis {
  // The original post in a few short lines, one per line.
  request: string
  cause: string
  // How it could be fixed, one step per line.
  plan: string
  // Whether the model thinks this is worth an automatic change. Only an exact `true` counts.
  recommend: boolean
  why: string
}

// A paragraph in the digest is 2 to 4 short lines. The three paragraphs, escaped for Slack (a `<` becomes four
// characters), can still be longer than a section: the digest then drops lines of the request and the cause, never of
// the plan.
const MAX_LINES = 4
const LINE_LIMIT = 70
const WHY_LIMIT = 80
// A bullet or a number the model put in front of a line; the digest adds its own.
const LINE_MARK = /^(?:[-*•·]|\d+[.)])\s+/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Paragraph = 'request' | 'cause' | 'plan'

// The bullets and numbers in front of a line, however many the model stacked ("- 1. foo").
function withoutMarks(line: string): string {
  let rest = line.trim()
  while (LINE_MARK.test(rest)) rest = rest.replace(LINE_MARK, '').trim()
  return rest
}

// A list of lines, or one text with line breaks (an analysis stored by an older version is one line).
function paragraphLines(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : [value]
  return parts
    .flatMap((part) => (typeof part === 'string' ? part.split('\n') : []))
    .map((line) => clip(withoutMarks(line), LINE_LIMIT))
    .filter((line) => line !== '')
    .slice(0, MAX_LINES)
}

function required(raw: Record<string, unknown>, name: Paragraph): string {
  const lines = paragraphLines(raw[name])
  if (lines.length === 0) throw new Error(`the analysis has no ${name}`)
  return lines.join('\n')
}

export function parseAnalysis(raw: unknown): Analysis {
  if (!isRecord(raw)) throw new Error('the analysis is not an object')
  return {
    request: required(raw, 'request'),
    cause: required(raw, 'cause'),
    plan: required(raw, 'plan'),
    recommend: raw.recommend === true,
    why: typeof raw.why === 'string' ? clip(raw.why, WHY_LIMIT) : '',
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
