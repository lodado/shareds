import type { SlackMessage } from '../slack/client'
import type { Store } from '../store/store'
import { afterEach, describe, expect, it } from 'vitest'
import { closeStore, createItems, getItem, itemKeyOf, openStore } from '../store/store'
import { loadThreadText, parseThreadKey } from './threads'

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

const message = (ts: string, user: string | null, text: string): SlackMessage => ({
  ts,
  threadTs: null,
  user,
  text,
  botId: user === null ? 'B1' : null,
})

function itemOf(threadKey: string, source: 'mention' | 'dm') {
  const store = openStore(':memory:')
  opened.push(store)
  createItems(store, threadKey, ['web-app'], { source })
  const item = getItem(store, itemKeyOf(threadKey, 'web-app'))
  if (item === undefined) throw new Error('the item was not created')
  return item
}

describe('parseThreadKey as the address of a Slack thread', () => {
  it('to be the channel and the thread timestamp of a slack key', () => {
    expect(parseThreadKey('slack:C0123:1730000000.000100')).toStrictEqual({
      channelId: 'C0123',
      threadTs: '1730000000.000100',
    })
  })

  it('to be the tagging message as well when the key of a later tag names it', () => {
    expect(parseThreadKey('slack:C0123:1730000000.000100:1730000500.000200')).toStrictEqual({
      channelId: 'C0123',
      threadTs: '1730000000.000100',
      taggedTs: '1730000500.000200',
    })
  })

  it.each(['dm:D1:100.1', 'slack:C1', 'slack:C1:abc', 'slack:C1:1.1:extra', ''])('to be null for %j', (key) => {
    expect(parseThreadKey(key)).toBeNull()
  })
})

describe('loadThreadText as the thread an agent reads', () => {
  it('to be one cleaned line per message, in the order Slack gave them', async () => {
    const item = itemOf('slack:C1:1.1', 'mention')
    const slack = {
      threadReplies: (channel: string, ts: string) => {
        expect([channel, ts]).toStrictEqual(['C1', '1.1'])
        return Promise.resolve([
          message('1.1', 'U1', 'the footer <https://x.test|link> is broken'),
          message('1.2', null, 'bot note'),
        ])
      },
    }
    const text = await loadThreadText(slack, item)
    expect(text.split('\n')).toHaveLength(2)
    expect(text.startsWith('[U1] ')).toBe(true)
    expect(text).toContain('\n[bot] bot note')
    expect(text).not.toContain('<https://x.test|link>')
  })

  it('to be empty, without asking Slack, for an item the owner typed in a DM', async () => {
    const item = itemOf('dm:D1:100.1', 'dm')
    const slack = {
      threadReplies: () => Promise.reject(new Error('must not be called')),
    }
    expect(await loadThreadText(slack, item)).toBe('')
  })

  it('to be cut at whole messages with a note when the thread is long', async () => {
    const item = itemOf('slack:C1:1.1', 'mention')
    const long = 'x'.repeat(3000)
    const replies = [message('1.1', 'U1', long), message('1.2', 'U2', long), message('1.3', 'U3', long)]
    const text = await loadThreadText({ threadReplies: () => Promise.resolve(replies) }, item)
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines.at(-1)).toBe('… (이후 메시지 생략)')
    expect(text.length).toBeLessThanOrEqual(8000)
  })

  it('to keep the root and the message that tagged the owner, marked, when that message is late in a long thread', async () => {
    const item = itemOf('slack:C1:1.1:9.9', 'mention')
    const filler = 'y'.repeat(1500)
    const replies = [
      message('1.1', 'U1', 'the root request'),
      ...Array.from({ length: 8 }, (_, index) => message(`2.${index}`, 'U2', filler)),
      message('9.9', 'U9', 'please fix the footer too'),
    ]
    const text = await loadThreadText({ threadReplies: () => Promise.resolve(replies) }, item)
    expect(text.startsWith('[U1] the root request')).toBe(true)
    expect(text).toContain('▶ [U9] please fix the footer too')
    expect(text).toMatch(/… \(중간 \d+개 생략\)/)
    expect(text.length).toBeLessThanOrEqual(8100)
  })

  it('to mark the tagging message of the first item too, from the permalink in its meta', async () => {
    const store = openStore(':memory:')
    opened.push(store)
    createItems(store, 'slack:C1:1.1', ['web-app'], {
      meta: { 'web-app': { url: 'https://x.slack.com/archives/C1/p1730000010000100?thread_ts=1.1' } },
    })
    const item = getItem(store, itemKeyOf('slack:C1:1.1', 'web-app'))
    if (item === undefined) throw new Error('the item was not created')
    const replies = [message('1.1', 'U1', 'root'), message('1730000010.000100', 'U2', 'ask')]
    const text = await loadThreadText({ threadReplies: () => Promise.resolve(replies) }, item)
    expect(text).toBe('[U1] root\n▶ [U2] ask')
  })

  it('to say how many middle messages were left out, not only the tail', async () => {
    const item = itemOf('slack:C1:1.1:9.9', 'mention')
    const filler = 'y'.repeat(3000)
    const replies = [
      message('1.1', 'U1', 'root'),
      message('2.1', 'U2', filler),
      message('2.2', 'U2', filler),
      message('2.3', 'U2', filler),
      message('9.9', 'U9', 'tagged'),
    ]
    const text = await loadThreadText({ threadReplies: () => Promise.resolve(replies) }, item)
    // The neighbours of the tagged message get room first, so the earliest filler is the one left out.
    const shape = text.split('\n').map((line) => (line.startsWith('[U2]') ? '[U2]' : line))
    expect(shape).toStrictEqual(['[U1] root', '… (중간 1개 생략)', '[U2]', '[U2]', '▶ [U9] tagged'])
  })
})
