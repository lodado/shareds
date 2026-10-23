import { describe, expect, it } from 'vitest'
import { clip, escapeMrkdwn, firstAction, fitText, matchAction } from './blocks'

const isColor = (value: string): value is 'red' | 'blue' => value === 'red' || value === 'blue'
const PATTERN = /^paint\.(\w+):(\d+)$/

describe('clip as a line that must fit', () => {
  it('to be the text on one line when it fits', () => {
    expect(clip('  a \n  b  ', 10)).toBe('a b')
  })

  it('to be cut to the limit with an ellipsis when it is longer', () => {
    expect(clip('abcdefghij', 5)).toBe('abcd…')
    expect(clip('abcde', 5)).toBe('abcde')
  })
})

describe('firstAction as the button that was pressed', () => {
  it('to be the payload, the action id and the value of the first action', () => {
    const payload = { type: 'block_actions', actions: [{ action_id: 'a:1', value: 'v' }, { action_id: 'b:2' }] }
    expect(firstAction(payload)).toStrictEqual({ ok: true, payload, actionId: 'a:1', value: 'v' })
  })

  it.each([
    ['null', null, 'not a block_actions payload'],
    ['another payload type', { type: 'view_submission' }, 'not a block_actions payload'],
    ['no actions', { type: 'block_actions' }, 'no action in the payload'],
    ['an empty list', { type: 'block_actions', actions: [] }, 'no action in the payload'],
    ['an action without an id', { type: 'block_actions', actions: [{ value: 'v' }] }, 'no action in the payload'],
    ['an id that is not text', { type: 'block_actions', actions: [{ action_id: 5 }] }, 'no action in the payload'],
  ])('to be an error for %s', (_name, payload, error) => {
    expect(firstAction(payload)).toStrictEqual({ ok: false, error })
  })
})

describe('matchAction as the id of a button', () => {
  it('to be the action and the number when the action is a known one', () => {
    expect(matchAction('paint.red:12', PATTERN, isColor, 'a paint action')).toStrictEqual({
      ok: true,
      action: 'red',
      id: '12',
    })
  })

  it.each(['paint.green:1', 'paint.red:x', 'other.red:1', 'paint.red:1:2', ''])('to be an error for %j', (actionId) => {
    expect(matchAction(actionId, PATTERN, isColor, 'a paint action')).toStrictEqual({
      ok: false,
      error: `not a paint action: ${actionId}`,
    })
  })

  it('to be an error whose id is cut to 60 characters', () => {
    const result = matchAction(`x${'y'.repeat(100)}`, PATTERN, isColor, 'a paint action')
    expect(result.ok === false && result.error.length).toBe('not a paint action: '.length + 60)
  })
})

describe('escapeMrkdwn as text that must stay text', () => {
  it('to be the three characters Slack reads as markup, written as entities', () => {
    expect(escapeMrkdwn('a & b <c> <!channel> <@U1> <https://x.test|y>')).toBe(
      'a &amp; b &lt;c&gt; &lt;!channel&gt; &lt;@U1&gt; &lt;https://x.test|y&gt;',
    )
  })

  it('to be escaped once: an entity in the text is not a second level of escaping that unescapes', () => {
    expect(escapeMrkdwn('&lt;')).toBe('&amp;lt;')
  })

  it('to be the text itself when it has none of them', () => {
    expect(escapeMrkdwn('plain *bold* `code`')).toBe('plain *bold* `code`')
  })
})

describe('fitText as text longer than a Slack section', () => {
  it('to be the text itself when it fits', () => {
    expect(fitText('a\nb', 10)).toBe('a\nb')
  })

  it('to be whole lines and a note, never longer than the limit', () => {
    const text = ['alpha', 'bravo', 'charlie', 'delta'].join('\n')
    const fitted = fitText(text, 24)
    expect(fitted).toBe('alpha\nbravo\n… (이하 생략)')
    expect(fitted.length).toBeLessThanOrEqual(24)
  })

  it('to be only the note when not even the first line fits', () => {
    expect(fitText('x'.repeat(100), 20)).toBe('\n… (이하 생략)')
  })
})
