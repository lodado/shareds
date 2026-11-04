// The text of the Slack thread an item came from, shaped for an agent prompt.

import type { SlackClient } from '../slack/client.ts'
import type { ItemRow } from '../store/store.ts'
import { cleanSlackText } from '../slack/text.ts'

// `slack:<channel>:<thread>`, or `slack:<channel>:<thread>:<tag ts>` for an item made when somebody tagged the owner
// again in a thread that already had one.
const THREAD_KEY = /^slack:([^:]+):(\d+\.\d+)(?::(\d+\.\d+))?$/
// A Slack permalink names the message it points at: `.../p1730000010000100`.
const PERMALINK_TS = /\/p(\d{10})(\d{6})(?:[/?#]|$)/
const MAX_THREAD_CHARS = 8000
const TAGGED_MARK = '▶ '

export interface ThreadAddress {
  channelId: string
  threadTs: string
  // The message that tagged the owner, when the key says which one.
  taggedTs?: string
}

export function parseThreadKey(threadKey: string): ThreadAddress | null {
  const match = THREAD_KEY.exec(threadKey)
  const channelId = match?.[1]
  const threadTs = match?.[2]
  if (channelId === undefined || threadTs === undefined) return null
  const taggedTs = match?.[3]
  return { channelId, threadTs, ...(taggedTs === undefined ? {} : { taggedTs }) }
}

function taggedTsOf(where: ThreadAddress, item: ItemRow): string | undefined {
  if (where.taggedTs !== undefined) return where.taggedTs
  const link = PERMALINK_TS.exec(item.meta.url ?? '')
  const seconds = link?.[1]
  const micros = link?.[2]
  if (seconds === undefined || micros === undefined) return undefined
  return `${seconds}.${micros}`
}

// The order in which messages are given room: the root, the message that tagged the owner, then the ones around it,
// then the rest from the start.
function priority(count: number, tagged: number): number[] {
  const order: number[] = [0]
  if (tagged > 0) {
    order.push(tagged)
    for (let step = 1; step < count; step += 1) order.push(tagged + step, tagged - step)
  }
  for (let index = 1; index < count; index += 1) order.push(index)
  return order.filter((index, place) => index >= 0 && index < count && order.indexOf(index) === place)
}

// Whole messages only, oldest first. When the thread does not fit, the root and the message that tagged the owner come
// first, then their neighbours; what is left out is said where it was left out.
export async function loadThreadText(slack: Pick<SlackClient, 'threadReplies'>, item: ItemRow): Promise<string> {
  const where = parseThreadKey(item.threadKey)
  if (item.source !== 'mention' || where === null) return ''
  const replies = await slack.threadReplies(where.channelId, where.threadTs)
  const taggedTs = taggedTsOf(where, item)
  const tagged = replies.findIndex((reply) => reply.ts === taggedTs)
  const lines = replies.map(
    (reply, index) => `${index === tagged ? TAGGED_MARK : ''}[${reply.user ?? 'bot'}] ${cleanSlackText(reply.text)}`,
  )
  const kept = new Set<number>()
  let used = 0
  for (const index of priority(replies.length, tagged)) {
    const length = (lines[index]?.length ?? 0) + 1
    if (used + length > MAX_THREAD_CHARS) continue
    kept.add(index)
    used += length
  }
  const out: string[] = []
  let skipped = 0
  for (const [index, line] of lines.entries()) {
    if (!kept.has(index)) {
      skipped += 1
      continue
    }
    if (skipped > 0) out.push(`… (중간 ${skipped}개 생략)`)
    skipped = 0
    out.push(line)
  }
  if (skipped > 0) out.push('… (이후 메시지 생략)')
  return out.join('\n')
}
