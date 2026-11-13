import { describe, expect, it } from 'vitest'
import { cleanForTerminal, viewEvent, viewStreamLine } from './stream-view'

const ESC = '\u001B'
const BEL = '\u0007'

const assistant = (...content: unknown[]) => ({ type: 'assistant', message: { content } })
const toolResult = (content: unknown, isError = false) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', content, is_error: isError }] },
})

describe('cleanForTerminal as text from a thread or a repo on its way to a terminal', () => {
  it.each([
    ['a colour sequence', `${ESC}[31mred${ESC}[0m`, 'red'],
    ['a tab title set with BEL', `${ESC}]0;owned${BEL}after`, 'after'],
    ['a clipboard write ended by ESC \\', `${ESC}]52;c;ZXZpbA==${ESC}\\after`, 'after'],
    ['the one-byte CSI of C1', '\u009B2Jafter', 'after'],
    ['a two-character escape', `${ESC}cafter`, 'after'],
    ['a sequence cut off at the end', `before${ESC}[31`, 'before'],
    ['a carriage return and a bell', `one\rtwo${BEL}`, 'onetwo'],
  ])('to drop %s', (_name, text, clean) => {
    expect(cleanForTerminal(text)).toBe(clean)
  })

  it('to keep line feeds and letters, and turn a tab into two spaces', () => {
    expect(cleanForTerminal('한글 line\n\tnext')).toBe('한글 line\n  next')
  })
})

describe('viewEvent as what the tab shows of one event of the stream', () => {
  it('to name the start with its model', () => {
    expect(viewEvent({ type: 'system', subtype: 'init', model: 'claude-opus-5-5' })).toStrictEqual([
      '● 시작했어요 (claude-opus-5-5)',
    ])
  })

  it('to show what the agent says line by line, and each tool call with what it is about', () => {
    const event = assistant(
      { type: 'text', text: 'Reading the footer.\n\nThen the test.' },
      { type: 'tool_use', name: 'Read', input: { file_path: 'src/footer.tsx' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test\nsecond line' } },
      { type: 'tool_use', name: 'TodoWrite', input: { todos: [] } },
    )
    expect(viewEvent(event)).toStrictEqual([
      'Reading the footer.',
      'Then the test.',
      '▸ Read src/footer.tsx',
      '▸ Bash pnpm test',
      '▸ TodoWrite',
    ])
  })

  it('to show at most two lines of what a tool gave back, marked when it failed', () => {
    expect(viewEvent(toolResult('one\ntwo\nthree'))).toStrictEqual(['  ↳ one', '  ↳ two'])
    expect(viewEvent(toolResult([{ type: 'text', text: 'no such file' }], true))).toStrictEqual(['  ✗ no such file'])
  })

  it('to end with how the run ended and what it cost', () => {
    expect(viewEvent({ type: 'result', subtype: 'success', total_cost_usd: 0.4567 })).toStrictEqual([
      '■ 끝났어요 (success $0.46)',
    ])
  })

  it('to clean what it shows and cut a long line', () => {
    const [line = ''] = viewEvent(assistant({ type: 'text', text: `${ESC}]0;x${BEL}${'y'.repeat(300)}` }))
    expect(line).toBe(`${'y'.repeat(159)}…`)
  })

  it('to show nothing of the events only the bot reads', () => {
    expect(viewEvent({ type: 'stream_event' })).toStrictEqual([])
    expect(viewEvent('text')).toStrictEqual([])
  })
})

describe('viewStreamLine as one line of the stream file', () => {
  it('to show the event of a JSON line and nothing for a line that is not', () => {
    expect(viewStreamLine(JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd' }))).toStrictEqual([
      '■ 끝났어요 (error_max_budget_usd)',
    ])
    expect(viewStreamLine('{"type":"assi')).toStrictEqual([])
  })
})
