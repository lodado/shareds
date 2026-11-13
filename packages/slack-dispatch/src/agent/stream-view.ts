// What a terminal tab shows of a running `claude -p --output-format stream-json`: one readable line per thing the agent
// says or does. Everything in the stream can carry text from a Slack thread or a repository, so nothing reaches the
// terminal before its control characters are gone: an escape sequence could otherwise move the cursor, retitle the tab
// or write to the clipboard.

const LINE_LENGTH = 160
const RESULT_LINES = 2

const ESC = 0x1b
const BEL = 0x07
const LINE_FEED = 0x0a
const TAB = 0x09
// The single-character CSI and OSC of the C1 set, which some terminals honour like ESC [ and ESC ].
const C1_CSI = 0x9b
const C1_OSC = 0x9d

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

const isControl = (code: number): boolean => code < 0x20 || (code >= 0x7f && code <= 0x9f)

// Where a CSI sequence ends: its final byte is in @ to ~.
function afterCsi(text: string, from: number): number {
  let index = from
  while (index < text.length) {
    const code = text.charCodeAt(index)
    index += 1
    if (code >= 0x40 && code <= 0x7e) break
  }
  return index
}

// Where an OSC sequence ends: at BEL or at ESC \.
function afterOsc(text: string, from: number): number {
  let index = from
  while (index < text.length) {
    const code = text.charCodeAt(index)
    if (code === BEL) return index + 1
    if (code === ESC) return index + 2
    index += 1
  }
  return index
}

// Where the escape sequence that starts at `at` ends.
function afterEscape(text: string, at: number): number {
  const code = text.charCodeAt(at)
  if (code === C1_CSI) return afterCsi(text, at + 1)
  if (code === C1_OSC) return afterOsc(text, at + 1)
  const next = text[at + 1]
  if (next === '[') return afterCsi(text, at + 2)
  if (next === ']') return afterOsc(text, at + 2)
  return Math.min(text.length, at + 2)
}

// A tab becomes two spaces, a line feed stays, any other control character goes.
function charOut(code: number, char: string): string {
  if (code === TAB) return '  '
  if (code === LINE_FEED) return char
  return isControl(code) ? '' : char
}

const withSpace = (text: string): string => (text === '' ? '' : ` ${text}`)

export function cleanForTerminal(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const code = text.charCodeAt(index)
    if (code === ESC || code === C1_CSI || code === C1_OSC) {
      index = afterEscape(text, index)
      continue
    }
    out += charOut(code, text[index] ?? '')
    index += 1
  }
  return out
}

const clip = (line: string): string => (line.length > LINE_LENGTH ? `${line.slice(0, LINE_LENGTH - 1)}…` : line)

const cleanLines = (text: string): string[] =>
  cleanForTerminal(text)
    .split('\n')
    .map((line) => clip(line.trimEnd()))
    .filter((line) => line !== '')

// The input field that says what a tool call is about.
const SUBJECT_FIELDS = ['file_path', 'command', 'pattern', 'path', 'url', 'description'] as const

function toolLine(block: Record<string, unknown>): string {
  const input = isRecord(block.input) ? block.input : {}
  const subject = SUBJECT_FIELDS.map((name) => textOf(input[name])).find((value) => value !== '') ?? ''
  const first = cleanLines(subject)[0] ?? ''
  return clip(`▸ ${cleanForTerminal(textOf(block.name))}${withSpace(first)}`)
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => (isRecord(part) ? textOf(part.text) : '')).join('\n')
}

function assistantLines(content: readonly unknown[]): string[] {
  return content.flatMap((block): string[] => {
    if (!isRecord(block)) return []
    if (block.type === 'text') return cleanLines(textOf(block.text))
    if (block.type === 'tool_use') return [toolLine(block)]
    return []
  })
}

function toolResultLines(content: readonly unknown[]): string[] {
  return content.flatMap((block): string[] => {
    if (!isRecord(block) || block.type !== 'tool_result') return []
    const mark = block.is_error === true ? '  ✗ ' : '  ↳ '
    return cleanLines(resultText(block.content))
      .slice(0, RESULT_LINES)
      .map((line) => clip(`${mark}${line}`))
  })
}

function finalLine(event: Record<string, unknown>): string {
  const cost = typeof event.total_cost_usd === 'number' ? ` $${event.total_cost_usd.toFixed(2)}` : ''
  const subtype = cleanForTerminal(textOf(event.subtype))
  return `■ 끝났어요 (${subtype === '' ? 'unknown' : subtype}${cost})`
}

// The lines one event of the stream shows; none for the events that only matter to the program reading the stream.
export function viewEvent(event: unknown): string[] {
  if (!isRecord(event)) return []
  const message = isRecord(event.message) ? event.message : {}
  const content = Array.isArray(message.content) ? message.content : []
  if (event.type === 'system' && event.subtype === 'init') {
    const model = cleanForTerminal(textOf(event.model))
    return [model === '' ? '● 시작했어요' : `● 시작했어요 (${model})`]
  }
  if (event.type === 'assistant') return assistantLines(content)
  if (event.type === 'user') return toolResultLines(content)
  if (event.type === 'result') return [finalLine(event)]
  return []
}

// One line of the stream file; a line that is not JSON (cut off, or not from claude) shows nothing.
export function viewStreamLine(line: string): string[] {
  try {
    return viewEvent(JSON.parse(line))
  } catch {
    return []
  }
}
