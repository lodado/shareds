// One polling pass: find the threads that tag the owner, make an item per thread, and tell the owner about the new
// ones in a single digest DM. Everything that can be decided by a rule is decided here, with no agent.

import type { DigestEntry, DigestMessage } from '../digest/digest.ts'
import type { RouteConfig } from '../route/route.ts'
import type { MentionMatch, SlackClient, SlackMessage } from '../slack/client.ts'
import type { ItemRow, Store } from '../store/store.ts'
import type { Analysis } from '../triage/analysis.ts'
import { buildDigest, splitDigest } from '../digest/digest.ts'
import { routeThread } from '../route/route.ts'
import { clip } from '../slack/blocks.ts'
import { SlackApiError } from '../slack/client.ts'
import { cleanSlackText, extractLinks, looksUrgent } from '../slack/text.ts'
import {
  applyEvent,
  createDigest,
  createItems,
  digestItems,
  getItem,
  itemsOfThread,
  logEvent,
  pendingForDigest,
  setAnalysis,
  setDigestSlackRef,
  unsentDigestIds,
} from '../store/store.ts'

export type IngestSlack = Pick<SlackClient, 'openDm' | 'postMessage' | 'searchMentions' | 'threadReplies'>

export interface IngestDeps {
  store: Store
  slack: IngestSlack
  ownerId: string
  route: RouteConfig
  // Reads a new item and says what it asks, why, how to fix it and whether it is worth doing. Left out, the digest
  // shows the plain summary.
  analyze?: (item: ItemRow) => Promise<Analysis>
}

export interface IngestOptions {
  // Only mentions at or after this moment count.
  since: Date
  // And only those before this one, when it is given: a look at one past day.
  until?: Date
  // Do everything except make and send digests. Give it a scratch store: the items it creates stay there.
  dryRun: boolean
  // Automated posts (alerts, reports, reminders) are skipped unless this is set.
  includeBots?: boolean
  maxThreads?: number
}

interface SentDigest {
  digestId: number
  count: number
  slackRef: string
}

// What happened to each thread; every thread ends up in exactly one of these.
interface Counts {
  created: number
  alreadyKnown: number
  handledByOwner: number
  skippedBots: number
  // Threads in a conversation the user token may not read (a direct message, say), recorded once and left alone.
  skippedUnreadable: number
}

// A thread that was found and left out of the digest, with the reason, so the owner can still see that it exists.
export type SkipReason = 'bot' | 'answered' | 'unreadable' | 'known'

export interface SkippedThread {
  url: string
  summary: string
  reason: SkipReason
}

export interface IngestSummary extends Counts {
  // Every thread that was found but is not in a digest of this pass.
  skipped: SkippedThread[]
  mentions: number
  threads: number
  failedThreads: number
  // Threads found beyond the limit of a pass, left for the next one.
  cutThreads: number
  sent: SentDigest[]
  // What would have been sent, in a dry run.
  preview: DigestMessage[]
}

type ThreadOutcome = keyof Counts

const DEFAULT_MAX_THREADS = 30
const SUMMARY_LENGTH = 200
const PENDING_LIMIT = 1000
const UNROUTED = 'unrouted'
const DAY_MS = 86_400_000
// How many items are read by the model at once.
const ANALYZE_CONCURRENCY = 3

const pad = (n: number): string => String(n).padStart(2, '0')
const dateOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const toDigestEntry = (item: ItemRow): DigestEntry => ({
  itemKey: item.key,
  repo: item.repo,
  summary: item.meta.summary ?? item.key,
  threadUrl: item.meta.url ?? '',
  route: item.meta.route ?? '',
  urgent: item.meta.urgent ?? false,
  ...(item.meta.analysis === undefined ? {} : { analysis: item.meta.analysis }),
})

interface Thread {
  channelId: string
  channelName: string
  threadTs: string
  mentions: { ts: string; text: string; permalink: string; user: string | null }[]
}

function groupByThread(matches: readonly MentionMatch[]): Thread[] {
  const threads = new Map<string, Thread>()
  for (const match of matches) {
    const key = `${match.channelId}:${match.threadTs}`
    const thread = threads.get(key) ?? {
      channelId: match.channelId,
      channelName: match.channelName,
      threadTs: match.threadTs,
      mentions: [],
    }
    thread.mentions.push({ ts: match.ts, text: match.text, permalink: match.permalink, user: match.user })
    threads.set(key, thread)
  }
  return [...threads.values()]
}

const SKIPPED_REASON: Partial<Record<ThreadOutcome, SkipReason>> = {
  skippedBots: 'bot',
  handledByOwner: 'answered',
  skippedUnreadable: 'unreadable',
  alreadyKnown: 'known',
}

function skippedOf(thread: Thread, reason: SkipReason): SkippedThread {
  const first = thread.mentions[0]
  return { url: first?.permalink ?? '', summary: clip(cleanSlackText(first?.text ?? ''), SUMMARY_LENGTH), reason }
}

function isInWindow(match: MentionMatch, options: IngestOptions): boolean {
  const at = Number(match.ts) * 1000
  return at >= options.since.getTime() && (options.until === undefined || at < options.until.getTime())
}

// Whether the message that tagged the owner was posted by a program. A search hit has no bot flag, but the thread read
// does, and a hit with no user at all is always a program.
function taggedByBot(replies: readonly SlackMessage[], thread: Thread): boolean {
  const first = thread.mentions[0]
  if (first === undefined) return false
  const message = replies.find((reply) => reply.ts === first.ts)
  if (message === undefined) return first.user === null
  return message.botId !== null || message.user === null
}

// Slack answers these when the user token has no right to read the conversation. Waiting would not change that, so the
// thread is written down once instead of failing again at every poll.
const UNREADABLE_CODES: ReadonlySet<string> = new Set(['missing_scope', 'channel_not_found', 'not_in_channel'])

const isUnreadable = (error: unknown): error is SlackApiError =>
  error instanceof SlackApiError && UNREADABLE_CODES.has(error.code)

function skipUnreadable(deps: IngestDeps, thread: Thread, threadKey: string, code: string): ThreadOutcome {
  const { store } = deps
  const first = thread.mentions[0]
  createItems(store, threadKey, [UNROUTED], {
    source: 'mention',
    meta: {
      [UNROUTED]: {
        summary: clip(cleanSlackText(first?.text ?? ''), SUMMARY_LENGTH),
        url: first?.permalink ?? '',
        route: '읽을 권한이 없는 대화라 건너뜀',
        urgent: false,
      },
    },
  })
  const key = `${threadKey}#${UNROUTED}`
  applyEvent(store, key, { type: 'triage', handled: true, confident: false })
  logEvent(store, {
    itemKey: key,
    kind: 'inbound',
    type: 'mention_unreadable',
    payload: { channel: thread.channelName, threadTs: thread.threadTs, code },
  })
  return 'skippedUnreadable'
}

async function ingestThread(deps: IngestDeps, thread: Thread, includeBots: boolean): Promise<ThreadOutcome> {
  const { store, slack, ownerId, route } = deps
  const threadKey = `slack:${thread.channelId}:${thread.threadTs}`
  if (itemsOfThread(store, threadKey).length > 0) return 'alreadyKnown'
  let replies: SlackMessage[]
  try {
    replies = await slack.threadReplies(thread.channelId, thread.threadTs)
  } catch (error) {
    if (!isUnreadable(error)) throw error
    return skipUnreadable(deps, thread, threadKey, error.code)
  }
  const rootText = replies[0]?.text ?? thread.mentions[0]?.text ?? ''
  const allText = [rootText, ...thread.mentions.map((mention) => mention.text)].join('\n')
  const firstMention = Math.min(...thread.mentions.map((mention) => Number(mention.ts)))
  // If the owner already answered in the thread after being tagged, the owner is on it.
  const handled = replies.some((reply) => reply.user === ownerId && Number(reply.ts) > firstMention)
  const fromBot = !includeBots && taggedByBot(replies, thread)
  const found = routeThread(
    { text: cleanSlackText(allText), links: extractLinks(allText), channelName: thread.channelName },
    route,
  )
  const repo = found.repo ?? UNROUTED
  createItems(store, threadKey, [repo], {
    source: 'mention',
    meta: {
      [repo]: {
        summary: clip(cleanSlackText(rootText), SUMMARY_LENGTH),
        url: thread.mentions[0]?.permalink ?? '',
        route: fromBot ? '봇이 올린 알림이라 건너뜀' : found.reason,
        urgent: looksUrgent(allText),
      },
    },
  })
  const key = `${threadKey}#${repo}`
  // Policy: a mention always waits for the owner's approval, however sure the routing is.
  applyEvent(store, key, { type: 'triage', handled: handled || fromBot, confident: false })
  logEvent(store, {
    itemKey: key,
    kind: 'inbound',
    type: 'mention_seen',
    payload: { channel: thread.channelName, threadTs: thread.threadTs, handled, fromBot, repo, reason: found.reason },
  })
  if (fromBot) return 'skippedBots'
  return handled ? 'handledByOwner' : 'created'
}

async function sendDigest(deps: IngestDeps, digestId: number, entries: DigestEntry[]): Promise<SentDigest> {
  const message = buildDigest(digestId, entries)
  const channel = await deps.slack.openDm(deps.ownerId)
  const sent = await deps.slack.postMessage({ channel, text: message.text, blocks: message.blocks })
  const slackRef = `${sent.channel}:${sent.ts}`
  setDigestSlackRef(deps.store, digestId, slackRef)
  return { digestId, count: entries.length, slackRef }
}

function entriesOf(store: Store, keys: readonly string[]): DigestEntry[] {
  return keys.flatMap((key) => {
    const item = getItem(store, key)
    return item ? [toDigestEntry(item)] : []
  })
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// Runs `work` over the items, a few at a time. Each call handles its own failure.
async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(work))
  }
}

// Gives every item that waits for a digest its analysis. One that cannot be analysed is listed without it: the digest
// must still go out, and the owner still sees the plain summary and the thread.
async function analyzePending(deps: IngestDeps): Promise<void> {
  const { store, analyze } = deps
  if (analyze === undefined) return
  const waiting = pendingForDigest(store, PENDING_LIMIT).filter((item) => item.meta.analysis === undefined)
  await inBatches(waiting, ANALYZE_CONCURRENCY, async (item) => {
    try {
      setAnalysis(store, item.key, await analyze(item))
    } catch (error) {
      logEvent(store, {
        itemKey: item.key,
        kind: 'system',
        type: 'analysis_failed',
        payload: { error: errorText(error) },
      })
    }
  })
}

export async function ingestMentions(deps: IngestDeps, options: IngestOptions): Promise<IngestSummary> {
  const { store, slack, ownerId } = deps
  const summary: IngestSummary = {
    mentions: 0,
    threads: 0,
    created: 0,
    alreadyKnown: 0,
    handledByOwner: 0,
    skippedBots: 0,
    skippedUnreadable: 0,
    failedThreads: 0,
    cutThreads: 0,
    skipped: [],
    sent: [],
    preview: [],
  }
  // A past day is asked for with both ends: a search answers the newest 300 matches, so without `before:` a day long ago
  // would be looked for among the matches of every day since.
  const upper = options.until === undefined ? '' : ` before:${dateOf(new Date(options.until.getTime() + DAY_MS))}`
  const query = `<@${ownerId}> after:${dateOf(new Date(options.since.getTime() - DAY_MS))}${upper}`
  const matches = (await slack.searchMentions(query))
    .filter((match) => isInWindow(match, options) && match.user !== ownerId)
    .toSorted((a, b) => Number(a.ts) - Number(b.ts))
  summary.mentions = matches.length
  const grouped = groupByThread(matches)
  const threads = grouped.slice(0, options.maxThreads ?? DEFAULT_MAX_THREADS)
  summary.threads = threads.length
  summary.cutThreads = grouped.length - threads.length

  for (const thread of threads) {
    try {
      const outcome = await ingestThread(deps, thread, options.includeBots ?? false)
      summary[outcome] += 1
      const reason = SKIPPED_REASON[outcome]
      if (reason !== undefined) summary.skipped.push(skippedOf(thread, reason))
    } catch (error) {
      summary.failedThreads += 1
      logEvent(store, {
        kind: 'system',
        type: 'thread_failed',
        payload: { channel: thread.channelName, threadTs: thread.threadTs, error: errorText(error) },
      })
    }
  }

  const pending = (): DigestEntry[] => pendingForDigest(store, PENDING_LIMIT).map(toDigestEntry)
  if (options.dryRun) {
    // The digest the new items would make, with the same builder, but nothing is listed or sent.
    summary.preview = splitDigest(pending()).map((entries) => buildDigest(0, entries))
    return summary
  }
  await analyzePending(deps)
  // A digest whose DM never went out is sent again before anything new is listed.
  for (const digestId of unsentDigestIds(store)) {
    summary.sent.push(await sendDigest(deps, digestId, entriesOf(store, digestItems(store, digestId))))
  }
  for (const entries of splitDigest(pending())) {
    const digestId = createDigest(
      store,
      entries.map((entry) => entry.itemKey),
    )
    summary.sent.push(await sendDigest(deps, digestId, entries))
  }
  return summary
}
