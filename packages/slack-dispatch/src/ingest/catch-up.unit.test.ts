import type { MentionMatch, SlackMessage } from '../slack/client'
import type { Store } from '../store/store'
import type { IngestDeps, IngestSlack, SkippedThread } from './ingest'
import { afterEach, describe, expect, it } from 'vitest'
import { closeStore, listItems, openStore } from '../store/store'
import { catchUp, describeSkipped } from './catch-up'

const OWNER = 'U_OWNER'
// Yesterday began at this moment, in the owner's time.
const DAY = new Date(2026, 9, 22, 0, 0, 0)
const DAY_SECONDS = Math.floor(DAY.getTime() / 1000)
const at = (hours: number): string => `${DAY_SECONDS + hours * 3600}.000100`

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function mention(hours: number, overrides: Partial<MentionMatch> = {}): MentionMatch {
  return {
    channelId: 'C1',
    channelName: 'dev-web',
    ts: at(hours),
    threadTs: at(hours),
    text: `<@${OWNER}> look at thread ${hours}`,
    permalink: `https://example.slack.com/archives/C1/p${hours}`,
    user: 'U_OTHER',
    ...overrides,
  }
}

interface Posted {
  text: string
  threadTs: string | undefined
  blocks: boolean
}

function setup(
  matches: MentionMatch[],
  replies: Record<string, SlackMessage[] | Error> = {},
): { deps: IngestDeps; posted: Posted[] } {
  const store = openStore(':memory:')
  opened.push(store)
  const posted: Posted[] = []
  const slack: IngestSlack = {
    searchMentions: () => Promise.resolve(matches),
    threadReplies: (channel, ts) => {
      const answer = replies[`${channel}:${ts}`] ?? []
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
    },
    openDm: () => Promise.resolve('D_OWNER'),
    postMessage: (args) => {
      posted.push({ text: args.text, threadTs: args.threadTs, blocks: args.blocks !== undefined })
      return Promise.resolve({ channel: args.channel, ts: `${posted.length}.5` })
    },
  }
  return {
    deps: {
      store,
      slack,
      ownerId: OWNER,
      route: { knownRepos: ['web-app'], channelRepos: { 'dev-web': ['web-app'] } },
    },
    posted,
  }
}

const skipped = (reason: SkippedThread['reason'], n = 1): SkippedThread => ({
  url: `https://example.slack.com/archives/C1/p${n}`,
  summary: `Thread ${n}`,
  reason,
})

describe('describeSkipped as the list of threads left out of the digest', () => {
  it('to be a count, then one line per thread with its link and the reason', () => {
    expect(
      describeSkipped('10/22', [
        skipped('bot', 1),
        skipped('answered', 2),
        skipped('unreadable', 3),
        skipped('known', 4),
      ]),
    ).toBe(
      [
        '10/22에 목록에서 뺀 쓰레드 4개',
        '• <https://example.slack.com/archives/C1/p1|Thread 1> — 봇이 올린 알림',
        '• <https://example.slack.com/archives/C1/p2|Thread 2> — 이미 직접 답함',
        '• <https://example.slack.com/archives/C1/p3|Thread 3> — 읽을 권한이 없는 대화',
        '• <https://example.slack.com/archives/C1/p4|Thread 4> — 이전 알림에 이미 있음',
      ].join('\n'),
    )
  })

  it('to be a line without a link when the thread has no address, and a note when it has no text', () => {
    expect(describeSkipped('10/22', [{ url: '', summary: '', reason: 'bot' }])).toBe(
      '10/22에 목록에서 뺀 쓰레드 1개\n• (내용 없음) — 봇이 올린 알림',
    )
  })

  it('to be a text that cannot make a link, a mention or a channel call', () => {
    const text = describeSkipped('10/22', [
      { url: 'https://x.test/t', summary: '<!channel> a|b <@U1> & more', reason: 'bot' },
    ])
    expect(text).toContain('<https://x.test/t|&lt;!channel&gt; a b &lt;@U1&gt; &amp; more>')
    expect(text).not.toContain('<!channel>')
  })

  it('to be whole lines within 3500 characters, with the rest counted', () => {
    const many = Array.from({ length: 200 }, (_, i) => skipped('bot', i + 1))
    const text = describeSkipped('10/22', many)
    expect(text.length).toBeLessThanOrEqual(3500)
    expect(text.split('\n').at(-1)).toMatch(/^… 외 \d+개$/)
    expect(
      text
        .split('\n')
        .slice(1, -1)
        .every((line) => line.endsWith('— 봇이 올린 알림')),
    ).toBe(true)
  })
})

describe('catchUp as a look at one past day', () => {
  it('to be only the threads of that day: the ones before and after it are not looked at', async () => {
    const { deps } = setup([mention(-3), mention(5), mention(26)])
    const result = await catchUp(deps, DAY)
    expect(result.summary).toMatchObject({ mentions: 1, threads: 1, created: 1 })
    expect(result.day).toBe('10/22')
    expect(listItems(deps.store).map((item) => item.key)).toStrictEqual([`slack:C1:${at(5)}#web-app`])
  })

  it('to be a digest for the new item and a reply under it for the threads left out, with the reason of each', async () => {
    const answered = mention(6)
    const bot = mention(7)
    const { deps, posted } = setup([mention(5), answered, bot], {
      [`C1:${answered.threadTs}`]: [
        { ts: answered.ts, threadTs: null, user: 'U_OTHER', text: 'hi', botId: null },
        { ts: at(6.5), threadTs: null, user: OWNER, text: 'on it', botId: null },
      ],
      [`C1:${bot.threadTs}`]: [{ ts: bot.ts, threadTs: null, user: null, text: 'alert', botId: 'B1' }],
    })
    const result = await catchUp(deps, DAY)
    expect(result.summary).toMatchObject({ created: 1, handledByOwner: 1, skippedBots: 1 })
    expect(posted).toHaveLength(2)
    expect(posted[0]).toMatchObject({ blocks: true })
    expect(posted[0]?.threadTs).toBeUndefined()
    // The reply goes under the digest message, which was the first one posted.
    expect(posted[1]?.threadTs).toBe('1.5')
    expect(posted[1]?.text.split('\n')[0]).toBe('10/22에 목록에서 뺀 쓰레드 2개')
    expect(posted[1]?.text).toContain('이미 직접 답함')
    expect(posted[1]?.text).toContain('봇이 올린 알림')
  })

  it('to be a list on its own, not in a thread, when nothing is new', async () => {
    const bot = mention(7)
    const { deps, posted } = setup([bot], {
      [`C1:${bot.threadTs}`]: [{ ts: bot.ts, threadTs: null, user: null, text: 'alert', botId: 'B1' }],
    })
    const result = await catchUp(deps, DAY)
    expect(result.summary.sent).toStrictEqual([])
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ blocks: false })
    expect(posted[0]?.threadTs).toBeUndefined()
  })

  it('to be nothing sent at all when nothing tagged the owner that day', async () => {
    const { deps, posted } = setup([])
    const result = await catchUp(deps, DAY)
    expect(result.summary).toMatchObject({ threads: 0, created: 0 })
    expect(posted).toStrictEqual([])
  })

  it('to be a thread that was listed before shown as such, not made into a second item', async () => {
    const { deps, posted } = setup([mention(5)])
    await catchUp(deps, DAY)
    posted.length = 0
    const again = await catchUp(deps, DAY)
    expect(again.summary).toMatchObject({ created: 0, alreadyKnown: 1 })
    expect(posted).toHaveLength(1)
    expect(posted[0]?.text).toContain('이전 알림에 이미 있음')
    expect(listItems(deps.store)).toHaveLength(1)
  })
})

describe('describeSkipped as the list of what was left out', () => {
  const thread = (n: number, summary: string): SkippedThread => ({
    url: `https://example.slack.com/archives/C1/p${n}`,
    summary,
    reason: 'bot',
  })

  it('to be within the limit of a message even with the closing lines, whatever the number of threads', () => {
    const many = Array.from({ length: 200 }, (_unused, n) => thread(n, 'x'.repeat(60)))
    const text = describeSkipped('10/22', many, { failed: 3, cut: 7 })
    expect(text.length).toBeLessThanOrEqual(3500)
    expect(text).toContain('… 외 ')
    expect(text).toContain('• 읽다가 실패한 쓰레드 3개 (로그에 남았어요)')
    expect(text).toContain('• 하루에 100개까지만 봐서 못 본 쓰레드 7개')
  })

  it('to be without closing lines when everything was looked at', () => {
    const text = describeSkipped('10/22', [thread(1, 'a')])
    expect(text.split('\n')).toHaveLength(2)
  })
})

describe('catchUp as threads that were not looked at', () => {
  it('to be told in the list, which is sent although nothing was left out for another reason', async () => {
    const broken = mention(7)
    const { deps, posted } = setup([broken], { [`C1:${broken.threadTs}`]: new Error('ratelimited') })
    const result = await catchUp(deps, DAY)
    expect(result.summary.failedThreads).toBe(1)
    expect(posted).toHaveLength(1)
    expect(posted[0]?.text).toContain('• 읽다가 실패한 쓰레드 1개 (로그에 남았어요)')
    expect(posted[0]?.threadTs).toBeUndefined()
  })

  it('to be told how many were beyond the limit of a day', async () => {
    const matches = Array.from({ length: 103 }, (_unused, n) =>
      mention(n % 20, { threadTs: `${DAY_SECONDS + n}.000100`, ts: `${DAY_SECONDS + n}.000100` }),
    )
    const { deps, posted } = setup(matches)
    const result = await catchUp(deps, DAY)
    expect(result.summary).toMatchObject({ threads: 100, cutThreads: 3 })
    expect(posted.at(-1)?.text).toContain('• 하루에 100개까지만 봐서 못 본 쓰레드 3개')
  })

  it('to be a list on its own, not under the digest of an earlier pass, when this pass made no item', async () => {
    const first = mention(5)
    const run = setup([first])
    await catchUp(run.deps, DAY)
    // The same day again: the thread is known now, so nothing new is made and the list says why.
    const again = await catchUp(run.deps, DAY)
    expect(again.summary.created).toBe(0)
    const lists = run.posted.filter((message) => message.text.includes('목록에서 뺀 쓰레드'))
    expect(lists.at(-1)?.text).toContain('이전 알림에 이미 있음')
    expect(lists.at(-1)?.threadTs).toBeUndefined()
  })
})
