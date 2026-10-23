// The text of the Slack thread an item came from, shaped for an agent prompt.

import type { SlackClient } from '../slack/client.ts'
import type { ItemRow } from '../store/store.ts'
import { cleanSlackText } from '../slack/text.ts'

const THREAD_KEY = /^slack:([^:]+):(\d+\.\d+)$/
const MAX_THREAD_CHARS = 8000
const MAX_REPLIES = 200

export function parseThreadKey(threadKey: string): { channelId: string; threadTs: string } | null {
  const match = THREAD_KEY.exec(threadKey)
  const channelId = match?.[1]
  const threadTs = match?.[2]
  if (channelId === undefined || threadTs === undefined) return null
  return { channelId, threadTs }
}

// Whole messages only, oldest first, from the first 200 replies; what does not fit the prompt is left out and said so.
export async function loadThreadText(slack: Pick<SlackClient, 'threadReplies'>, item: ItemRow): Promise<string> {
  const where = parseThreadKey(item.threadKey)
  if (item.source !== 'mention' || where === null) return ''
  const replies = await slack.threadReplies(where.channelId, where.threadTs, MAX_REPLIES)
  const lines: string[] = []
  let used = 0
  for (const reply of replies) {
    const line = `[${reply.user ?? 'bot'}] ${cleanSlackText(reply.text)}`
    if (used + line.length + 1 > MAX_THREAD_CHARS) {
      lines.push('… (이후 메시지 생략)')
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}
