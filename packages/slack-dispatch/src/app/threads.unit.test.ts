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
})
