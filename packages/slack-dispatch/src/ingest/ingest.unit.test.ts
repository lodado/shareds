import type { MentionMatch, SlackMessage } from '../slack/client'
import type { Store } from '../store/store'
import type { IngestDeps, IngestSlack } from './ingest'
import { afterEach, describe, expect, it } from 'vitest'
import { SlackApiError } from '../slack/client'
import { applyEvent, closeStore, getItem, listEvents, listItems, openStore } from '../store/store'
import { ingestMentions } from './ingest'

const OWNER = 'U_OWNER'
const SINCE = new Date(1_700_000_000_000)
const SECONDS = Math.floor(SINCE.getTime() / 1000)
const at = (offset: number): string => `${SECONDS + offset}.000100`

const route = { knownRepos: ['web-app', 'api-server'], channelRepos: { 'dev-web': ['web-app'] } }

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function mention(offset: number, overrides: Partial<MentionMatch> = {}): MentionMatch {
  return {
    channelId: 'C1',
    channelName: 'general',
    ts: at(offset),
    threadTs: at(offset),
    text: `<@${OWNER}> please look at this`,
    permalink: `https://example.slack.com/archives/C1/p${offset}`,
    user: 'U_OTHER',
    ...overrides,
  }
}

function message(offset: number, user: string, text: string): SlackMessage {
  return { ts: at(offset), threadTs: null, user, text, botId: null }
}

interface Posted {
  channel: string
  text: string
  blocks: readonly unknown[] | undefined
}

interface Fake {
  slack: IngestSlack
  posted: Posted[]
  searches: string[]
  failPost: { on: boolean }
}

// A Slack that finds the given mentions, answers thread reads from `threads`, and keeps what was posted.
function fakeSlack(matches: MentionMatch[], threads: Record<string, SlackMessage[] | Error> = {}): Fake {
  const posted: Posted[] = []
  const searches: string[] = []
  const failPost = { on: false }
  const slack: IngestSlack = {
    searchMentions: (query) => {
      searches.push(query)
      return Promise.resolve(matches)
    },
    threadReplies: (channelId, threadTs) => {
      const answer = threads[`${channelId}:${threadTs}`]
      if (answer instanceof Error) return Promise.reject(answer)
      return Promise.resolve(answer ?? [])
    },
    openDm: () => Promise.resolve('D_OWNER'),
    postMessage: ({ channel, text, blocks }) => {
      if (failPost.on) return Promise.reject(new Error('slack is down'))
      posted.push({ channel, text, blocks })
      return Promise.resolve({ channel, ts: `99.${posted.length}` })
    },
  }
  return { slack, posted, searches, failPost }
}

function setup(fake: Fake): IngestDeps {
  const store = openStore(':memory:')
  opened.push(store)
  return { store, slack: fake.slack, ownerId: OWNER, route }
}

const real = { since: SINCE, dryRun: false }

describe('ingestMentions as one polling pass', () => {
  it('to be an item per thread, routed by the GitHub link, and one digest DM that lists them', async () => {
    const first = mention(10, { text: `<@${OWNER}> see <https://github.com/o/api-server/pull/3|the PR>` })
    const second = mention(20, { channelName: 'dev-web', text: `<@${OWNER}> the page is broken` })
    const fake = fakeSlack([first, second], {
      [`C1:${first.threadTs}`]: [
        message(10, 'U_OTHER', `<@${OWNER}> see <https://github.com/o/api-server/pull/3|the PR>`),
      ],
    })
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({
      mentions: 2,
      threads: 2,
      created: 2,
      alreadyKnown: 0,
      handledByOwner: 0,
      skippedUnreadable: 0,
      failedThreads: 0,
    })
    expect(summary.sent).toEqual([{ digestId: 1, count: 2, slackRef: 'D_OWNER:99.1' }])
    const items = listItems(deps.store)
    expect(items.map((item) => [item.repo, item.stage, item.source])).toEqual([
      ['api-server', 'notified', 'mention'],
      ['web-app', 'notified', 'mention'],
    ])
    expect(items[0]?.meta).toMatchObject({
      url: 'https://example.slack.com/archives/C1/p10',
      route: 'GitHub 링크가 가리키는 레포: api-server',
      urgent: false,
    })
    expect(fake.posted).toHaveLength(1)
    expect(fake.posted[0]).toMatchObject({ channel: 'D_OWNER', text: '새 항목 2개' })
  })

  it('to be a search for mentions of the owner from the day before, then filtered to the time asked for', async () => {
    const fake = fakeSlack([mention(-60), mention(5)])
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(fake.searches).toHaveLength(1)
    expect(fake.searches[0]).toMatch(/^<@U_OWNER> after:\d{4}-\d{2}-\d{2}$/)
    expect(summary.mentions).toBe(1)
  })

  it('to be a mention the owner wrote to themselves made an item like any other', async () => {
    const note = mention(5, { user: OWNER, text: `<@${OWNER}> fix the footer link` })
    const deps = setup(fakeSlack([note], { [`C1:${note.threadTs}`]: [message(5, OWNER, note.text)] }))
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ mentions: 1, threads: 1, created: 1, handledByOwner: 0, skippedBots: 0 })
    expect(listItems(deps.store).map((item) => item.stage)).toEqual(['notified'])
  })

  it('to be a second note the owner wrote to themselves in one thread not an answer to the first', async () => {
    const first = mention(5, { user: OWNER })
    const second = mention(9, { user: OWNER, threadTs: first.threadTs })
    const deps = setup(
      fakeSlack([first, second], {
        [`C1:${first.threadTs}`]: [message(5, OWNER, first.text), message(9, OWNER, second.text)],
      }),
    )
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ mentions: 2, threads: 1, created: 1, handledByOwner: 0 })
  })

  it('to be a reply of the owner after their own note still an answer', async () => {
    const note = mention(5, { user: OWNER })
    const deps = setup(
      fakeSlack([note], { [`C1:${note.threadTs}`]: [message(5, OWNER, note.text), message(8, OWNER, 'done already')] }),
    )
    expect(await ingestMentions(deps, real)).toMatchObject({ created: 0, handledByOwner: 1 })
  })

  it('to be a note from a program left out even when it names the owner as its author', async () => {
    const note = mention(5, { user: OWNER })
    const deps = setup(
      fakeSlack([note], {
        [`C1:${note.threadTs}`]: [{ ts: note.ts, threadTs: null, user: OWNER, text: note.text, botId: 'B1' }],
      }),
    )
    expect(await ingestMentions(deps, real)).toMatchObject({ created: 0, skippedBots: 1 })
  })

  it('to be one item for two mentions in the same thread', async () => {
    const root = at(5)
    const fake = fakeSlack([mention(5), mention(9, { threadTs: root })])
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ mentions: 2, threads: 1, created: 1 })
    expect(listItems(deps.store)).toHaveLength(1)
  })

  it('to be a thread the owner already answered skipped and left out of the digest', async () => {
    const answered = mention(10)
    const open = mention(20)
    const fake = fakeSlack([answered, open], {
      [`C1:${answered.threadTs}`]: [message(10, 'U_OTHER', 'help'), message(15, OWNER, 'on it')],
    })
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ created: 1, handledByOwner: 1 })
    expect(getItem(deps.store, `slack:C1:${answered.threadTs}#unrouted`)?.stage).toBe('skipped')
    expect(summary.sent).toEqual([{ digestId: 1, count: 1, slackRef: 'D_OWNER:99.1' }])
  })

  it('to be an owner reply from before the tag not counted as an answer', async () => {
    const tagged = mention(20)
    const fake = fakeSlack([tagged], {
      [`C1:${tagged.threadTs}`]: [message(10, OWNER, 'earlier note'), message(20, 'U_OTHER', 'hi')],
    })
    const deps = setup(fake)
    expect(await ingestMentions(deps, real)).toMatchObject({ created: 1, handledByOwner: 0 })
  })

  it('to be a thread with no clue about the repo kept as unrouted, with the reason shown', async () => {
    const deps = setup(fakeSlack([mention(5)]))
    await ingestMentions(deps, real)
    const [item] = listItems(deps.store)
    expect(item).toMatchObject({ repo: 'unrouted', stage: 'notified' })
    expect(item?.meta.route).toBe('레포를 정할 단서가 없음')
  })

  it('to be an urgent word in the thread marked on the item', async () => {
    const deps = setup(fakeSlack([mention(5, { text: `<@${OWNER}> 배포 실패했어요` })]))
    await ingestMentions(deps, real)
    expect(listItems(deps.store)[0]?.meta.urgent).toBe(true)
  })

  it('to be the same threads on the next pass known already, with no new digest', async () => {
    const fake = fakeSlack([mention(5), mention(15)])
    const deps = setup(fake)
    await ingestMentions(deps, real)
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ created: 0, alreadyKnown: 2, sent: [] })
    expect(fake.posted).toHaveLength(1)
  })

  it('to be a new thread on the next pass listed alone', async () => {
    const matches = [mention(5)]
    const fake = fakeSlack(matches)
    const deps = setup(fake)
    await ingestMentions(deps, real)
    matches.push(mention(30))
    const again = await ingestMentions(deps, real)
    expect(again.sent).toEqual([{ digestId: 2, count: 1, slackRef: 'D_OWNER:99.2' }])
  })

  it('to be a thread that cannot be read counted and logged, while the others go on', async () => {
    const broken = mention(10)
    const fine = mention(20)
    const fake = fakeSlack([broken, fine], { [`C1:${broken.threadTs}`]: new Error('channel_not_found') })
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ created: 1, failedThreads: 1 })
    const failure = listEvents(deps.store).find((row) => row.type === 'thread_failed')
    expect(JSON.parse(failure?.payload ?? '{}')).toMatchObject({ channel: 'general', error: 'channel_not_found' })
  })

  it.each(['missing_scope', 'channel_not_found', 'not_in_channel'])(
    'to be a conversation the token may not read (%s) recorded once as skipped, never failed again',
    async (code) => {
      const direct = mention(10, { channelName: 'U0DIRECT1' })
      const fine = mention(20)
      const fake = fakeSlack([direct, fine], {
        [`C1:${direct.threadTs}`]: new SlackApiError('conversations.replies', code),
      })
      const deps = setup(fake)
      const first = await ingestMentions(deps, real)
      expect(first).toMatchObject({ created: 1, skippedUnreadable: 1, failedThreads: 0 })
      const key = `slack:C1:${direct.threadTs}#unrouted`
      expect(getItem(deps.store, key)).toMatchObject({
        stage: 'skipped',
        meta: { route: '읽을 권한이 없는 대화라 건너뜀', url: direct.permalink },
      })
      const logged = listEvents(deps.store, { itemKey: key }).find((row) => row.type === 'mention_unreadable')
      expect(JSON.parse(logged?.payload ?? '{}')).toMatchObject({ channel: 'U0DIRECT1', code })
      expect(first.sent).toEqual([{ digestId: 1, count: 1, slackRef: 'D_OWNER:99.1' }])

      const again = await ingestMentions(deps, real)
      expect(again).toMatchObject({ created: 0, alreadyKnown: 2, skippedUnreadable: 0, failedThreads: 0 })
      expect(listEvents(deps.store).filter((row) => row.type === 'thread_failed')).toEqual([])
    },
  )

  it('to be a Slack error that may pass counted as failed, to be tried again at the next poll', async () => {
    const limited = mention(10)
    const fake = fakeSlack([limited], {
      [`C1:${limited.threadTs}`]: new SlackApiError('conversations.replies', 'ratelimited'),
    })
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ created: 0, skippedUnreadable: 0, failedThreads: 1 })
    expect(listItems(deps.store)).toEqual([])
  })

  it('to be only as many threads as the cap allows, oldest first', async () => {
    const fake = fakeSlack([mention(30), mention(10), mention(20)])
    const deps = setup(fake)
    const summary = await ingestMentions(deps, { ...real, maxThreads: 2 })
    expect(summary.threads).toBe(2)
    expect(listItems(deps.store).map((item) => item.key)).toEqual([
      `slack:C1:${at(10)}#unrouted`,
      `slack:C1:${at(20)}#unrouted`,
    ])
  })

  it('to be a digest whose DM failed sent again on the next pass, not made twice', async () => {
    const fake = fakeSlack([mention(5)])
    const deps = setup(fake)
    fake.failPost.on = true
    await expect(ingestMentions(deps, real)).rejects.toThrow('slack is down')
    expect(fake.posted).toEqual([])
    fake.failPost.on = false
    const again = await ingestMentions(deps, real)
    expect(again.sent).toEqual([{ digestId: 1, count: 1, slackRef: 'D_OWNER:99.1' }])
    expect(again).toMatchObject({ created: 0, alreadyKnown: 1 })
    expect(fake.posted).toHaveLength(1)
  })

  it('to be every mention found written to the log', async () => {
    const deps = setup(fakeSlack([mention(5)]))
    await ingestMentions(deps, real)
    expect(listEvents(deps.store).map((row) => row.type)).toEqual([
      'item_created',
      'triage',
      'mention_seen',
      'digest_created',
      'digest_sent',
    ])
  })
})

describe('ingestMentions as a search for one past day', () => {
  const day = new Date(2026, 9, 22)
  const dayAfter = new Date(2026, 9, 23)

  it('to be a search with both ends, so a day long ago is not looked for among the newest matches only', async () => {
    const fake = fakeSlack([])
    await ingestMentions(setup(fake), { since: day, until: dayAfter, dryRun: false })
    expect(fake.searches).toStrictEqual([`<@${OWNER}> after:2026-10-21 before:2026-10-24`])
  })

  it('to be a search with no upper end when no end was asked for', async () => {
    const fake = fakeSlack([])
    await ingestMentions(setup(fake), { since: day, dryRun: false })
    expect(fake.searches[0]).not.toContain('before:')
  })

  it('to be told how many threads were left beyond the limit of the pass', async () => {
    const fake = fakeSlack([mention(1), mention(2), mention(3)])
    const summary = await ingestMentions(setup(fake), { ...real, maxThreads: 2 })
    expect(summary).toMatchObject({ threads: 2, cutThreads: 1 })
    expect((await ingestMentions(setup(fakeSlack([mention(1)])), real)).cutThreads).toBe(0)
  })
})

describe('ingestMentions as a dry run', () => {
  it('to be the digest it would send, with nothing listed and nothing posted', async () => {
    const fake = fakeSlack([mention(5), mention(15)])
    const deps = setup(fake)
    const summary = await ingestMentions(deps, { ...real, dryRun: true })
    expect(summary.sent).toEqual([])
    expect(summary.preview).toHaveLength(1)
    expect(summary.preview[0]?.text).toBe('새 항목 2개')
    expect(fake.posted).toEqual([])
    expect(deps.store.db.prepare('SELECT COUNT(*) AS n FROM digests').get()).toEqual({ n: 0 })
  })

  it('to be empty when there is nothing new', async () => {
    const deps = setup(fakeSlack([]))
    expect(await ingestMentions(deps, { ...real, dryRun: true })).toMatchObject({ mentions: 0, preview: [], sent: [] })
  })
})

describe('ingestMentions as posts made by programs', () => {
  const botMessage = (offset: number): SlackMessage => ({
    ts: at(offset),
    threadTs: null,
    user: 'U_BOT',
    text: `<@${OWNER}> reminder`,
    botId: 'B1',
  })

  it('to be a post a bot wrote skipped, kept as a known item and left out of the digest', async () => {
    const reminder = mention(10, { user: 'U_BOT' })
    const fake = fakeSlack([reminder, mention(20)], { [`C1:${reminder.threadTs}`]: [botMessage(10)] })
    const deps = setup(fake)
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ created: 1, skippedBots: 1, handledByOwner: 0 })
    const skipped = getItem(deps.store, `slack:C1:${reminder.threadTs}#unrouted`)
    expect(skipped).toMatchObject({ stage: 'skipped' })
    expect(skipped?.meta.route).toBe('봇이 올린 알림이라 건너뜀')
    expect(summary.sent).toEqual([{ digestId: 1, count: 1, slackRef: 'D_OWNER:99.1' }])
  })

  it('to be a skipped bot post known on the next pass, so the thread is not read again', async () => {
    const reminder = mention(10, { user: 'U_BOT' })
    const fake = fakeSlack([reminder], { [`C1:${reminder.threadTs}`]: [botMessage(10)] })
    const deps = setup(fake)
    await ingestMentions(deps, real)
    expect(await ingestMentions(deps, real)).toMatchObject({ skippedBots: 0, alreadyKnown: 1 })
  })

  it('to be a hit with no user at all treated as a program, even when the thread cannot show it', async () => {
    const deps = setup(fakeSlack([mention(10, { user: null })]))
    expect(await ingestMentions(deps, real)).toMatchObject({ created: 0, skippedBots: 1 })
  })

  it('to be a person who tags the owner under a bot post still handled', async () => {
    const root = mention(20, { threadTs: at(10), user: 'U_OTHER' })
    const fake = fakeSlack([root], {
      [`C1:${at(10)}`]: [botMessage(10), message(20, 'U_OTHER', `<@${OWNER}> can you check`)],
    })
    const deps = setup(fake)
    expect(await ingestMentions(deps, real)).toMatchObject({ created: 1, skippedBots: 0 })
  })

  it('to be a bot post handled like any other when the option asks for it', async () => {
    const reminder = mention(10, { user: 'U_BOT' })
    const fake = fakeSlack([reminder], { [`C1:${reminder.threadTs}`]: [botMessage(10)] })
    const deps = setup(fake)
    expect(await ingestMentions(deps, { ...real, includeBots: true })).toMatchObject({ created: 1, skippedBots: 0 })
  })
})

describe('ingestMentions as new items that the cheapest model reads before the digest goes out', () => {
  const yes = {
    request: '푸터 링크 수정 요청',
    cause: 'href 오타',
    plan: 'href를 고쳐요',
    recommend: true,
    why: '작은 수정',
  }
  const no = { ...yes, request: '정책을 물어보는 질문', recommend: false, why: '제품 결정이 필요해요' }

  function withAnalyze(fake: Fake, analyze: IngestDeps['analyze']): IngestDeps {
    return { ...setup(fake), analyze }
  }

  const sentBlocks = (fake: Fake): string => JSON.stringify(fake.posted.flatMap((message) => message.blocks ?? []))

  it('to be each item analysed once, and the digest to carry the analysis with the recommended item checked', async () => {
    const a = mention(10, { channelName: 'dev-web' })
    const b = mention(20, { channelName: 'dev-web' })
    const fake = fakeSlack([a, b])
    const asked: string[] = []
    const deps = withAnalyze(fake, (item) => {
      asked.push(item.key)
      return Promise.resolve(item.key.includes(a.threadTs) ? yes : no)
    })
    const summary = await ingestMentions(deps, real)
    expect(asked).toHaveLength(2)
    expect(summary.sent).toEqual([{ digestId: 1, count: 2, slackRef: 'D_OWNER:99.1' }])
    const blocks = sentBlocks(fake)
    expect(blocks).toContain('• 푸터 링크 수정 요청')
    expect(blocks).toContain('*구현 추천:* X — 제품 결정이 필요해요')
    expect(blocks.match(/"initial_options"/g)).toHaveLength(1)
    expect(getItem(deps.store, asked[0] ?? '')?.meta.analysis).toBeDefined()
  })

  it('to be at most three items read at a time', async () => {
    const matches = [10, 20, 30, 40, 50, 60, 70].map((offset) => mention(offset, { channelName: 'dev-web' }))
    let running = 0
    let peak = 0
    const gates: (() => void)[] = []
    const deps = withAnalyze(fakeSlack(matches), async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise<void>((resolve) => gates.push(resolve))
      running -= 1
      return yes
    })
    const pass = ingestMentions(deps, real)
    for (let round = 0; round < 50 && gates.length < 3; round += 1) await Promise.resolve()
    expect([running, gates.length]).toStrictEqual([3, 3])
    while (gates.length > 0) {
      gates.shift()?.()
      await new Promise<void>((resolve) => {
        setImmediate(resolve)
      })
    }
    await pass
    expect(peak).toBe(3)
  })

  it('to be an item listed without an analysis, recommended as no, when the model fails for it', async () => {
    const a = mention(10, { channelName: 'dev-web' })
    const b = mention(20, { channelName: 'dev-web' })
    const fake = fakeSlack([a, b])
    const deps = withAnalyze(fake, (item) =>
      item.key.includes(a.threadTs) ? Promise.reject(new Error('model is down')) : Promise.resolve(yes),
    )
    const summary = await ingestMentions(deps, real)
    expect(summary.sent).toEqual([{ digestId: 1, count: 2, slackRef: 'D_OWNER:99.1' }])
    const blocks = sentBlocks(fake)
    expect(blocks).toContain('_분석을 못 했어요. 원본을 확인해 주세요._')
    expect(blocks.match(/"initial_options"/g)).toHaveLength(1)
    const failure = listEvents(deps.store).find((row) => row.type === 'analysis_failed')
    expect(JSON.parse(failure?.payload ?? '{}')).toMatchObject({ error: 'model is down' })
  })

  it('to be no model call for an item that was analysed already or that is not waiting for a digest', async () => {
    const handled = mention(10, { channelName: 'dev-web' })
    const fake = fakeSlack([handled], {
      [`C1:${handled.threadTs}`]: [message(10, 'U_OTHER', 'hi'), message(11, OWNER, 'on it')],
    })
    let calls = 0
    const deps = withAnalyze(fake, () => {
      calls += 1
      return Promise.resolve(yes)
    })
    const summary = await ingestMentions(deps, real)
    expect(summary).toMatchObject({ handledByOwner: 1 })
    expect(calls).toBe(0)
    const again = await ingestMentions(deps, real)
    expect(again.sent).toEqual([])
    expect(calls).toBe(0)
  })

  it('to be an item read once, not again, when its digest could not be sent and goes out on the next pass', async () => {
    const fake = fakeSlack([mention(10, { channelName: 'dev-web' })])
    let calls = 0
    const deps = withAnalyze(fake, () => {
      calls += 1
      return Promise.resolve(yes)
    })
    fake.failPost.on = true
    await expect(ingestMentions(deps, real)).rejects.toThrow('slack is down')
    fake.failPost.on = false
    const again = await ingestMentions(deps, real)
    expect(calls).toBe(1)
    expect(again.sent).toEqual([{ digestId: 1, count: 1, slackRef: 'D_OWNER:99.1' }])
    expect(sentBlocks(fake)).toContain('• 푸터 링크 수정 요청')
  })

  it('to be no model call in a dry run, which only shows what would be sent', async () => {
    const fake = fakeSlack([mention(10, { channelName: 'dev-web' })])
    let calls = 0
    const deps = withAnalyze(fake, () => {
      calls += 1
      return Promise.resolve(yes)
    })
    const summary = await ingestMentions(deps, { ...real, dryRun: true })
    expect(calls).toBe(0)
    expect(summary.preview).toHaveLength(1)
  })

  it('to be the plain digest when no analyser is given', async () => {
    const fake = fakeSlack([mention(10, { channelName: 'dev-web' })])
    await ingestMentions(setup(fake), real)
    expect(sentBlocks(fake)).toContain('_분석을 못 했어요. 원본을 확인해 주세요._')
  })
})

// A store whose clock the test moves, so that "a tag after the item was made" can be told from "a tag it covers".
function setupClocked(fake: Fake, clock: { now: Date }): IngestDeps {
  const store = openStore(':memory:', { now: () => clock.now })
  opened.push(store)
  return { store, slack: fake.slack, ownerId: OWNER, route }
}

const clockAt = (offset: number): Date => new Date(SINCE.getTime() + offset * 1000)

// A reply in the thread that started at offset 10, tagging the owner at `offset`.
const replyTag = (offset: number, text: string): MentionMatch =>
  mention(offset, {
    threadTs: at(10),
    text: `<@${OWNER}> ${text}`,
    permalink: `https://example.slack.com/archives/C1/p${offset}?thread_ts=${at(10)}`,
  })

const threadWithReply = (offset: number, text: string): Record<string, SlackMessage[]> => ({
  [`C1:${at(10)}`]: [message(10, 'U_ROOT', 'the original post'), message(offset, 'U_OTHER', `<@${OWNER}> ${text}`)],
})

describe('ingestMentions as the reader of a later tag in a thread it already knows', () => {
  it('to be a new item with the later tag as its summary when the earlier items are over', async () => {
    const matches = [mention(10)]
    const fake = fakeSlack(matches, threadWithReply(500, 'one more thing'))
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, real)
    const [first] = listItems(deps.store)
    if (first === undefined) throw new Error('the first item was not made')
    applyEvent(deps.store, first.key, { type: 'reject', owner: true })

    matches.push(replyTag(500, 'one more thing'))
    clock.now = clockAt(600)
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ created: 1, alreadyKnown: 0, retagged: 0 })
    const items = listItems(deps.store)
    expect(items.map((item) => item.threadKey)).toStrictEqual([`slack:C1:${at(10)}`, `slack:C1:${at(10)}:${at(500)}`])
    expect(items[1]?.stage).toBe('notified')
    expect(items[1]?.meta.summary).toContain('one more thing')
    expect(items[1]?.meta.summary).not.toContain('the original post')

    const third = await ingestMentions(deps, real)
    expect(third).toMatchObject({ created: 0, alreadyKnown: 1, retagged: 0 })
    expect(listItems(deps.store)).toHaveLength(2)
  })

  it('to be one DM, not a second item, when the earlier item is still under way, and told only once', async () => {
    const matches = [mention(10)]
    const fake = fakeSlack(matches, threadWithReply(500, 'any news?'))
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, real)
    const posts = fake.posted.length

    matches.push(replyTag(500, 'any news?'))
    clock.now = clockAt(600)
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ created: 0, retagged: 1 })
    expect(listItems(deps.store)).toHaveLength(1)
    expect(fake.posted).toHaveLength(posts + 1)
    const told = fake.posted.at(-1)
    expect(told?.text).toContain('진행 중인 항목의 쓰레드에서 다시 태그됐어요 (선택 대기)')
    expect(told?.text).toContain('p500?thread_ts=')
    expect(told?.text).toContain('any news?')
    expect(listItems(deps.store)[0]?.meta.seenUntil).toBe(at(500))

    clock.now = clockAt(900)
    const third = await ingestMentions(deps, real)
    expect(third).toMatchObject({ created: 0, retagged: 0, alreadyKnown: 1 })
    expect(fake.posted).toHaveLength(posts + 1)
  })

  it('to be told to nobody in a dry run, which leaves the item as it was', async () => {
    const matches = [mention(10)]
    const fake = fakeSlack(matches, threadWithReply(500, 'any news?'))
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, real)
    const posts = fake.posted.length

    matches.push(replyTag(500, 'any news?'))
    clock.now = clockAt(600)
    const preview = await ingestMentions(deps, { ...real, dryRun: true })
    expect(preview).toMatchObject({ retagged: 1 })
    expect(fake.posted).toHaveLength(posts)
    expect(listItems(deps.store)[0]?.meta.seenUntil).toBe(at(10))
  })

  it('to be a DM again at the next pass when the first one could not be sent', async () => {
    const matches = [mention(10)]
    const fake = fakeSlack(matches, threadWithReply(500, 'any news?'))
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, real)
    const posts = fake.posted.length

    matches.push(replyTag(500, 'any news?'))
    clock.now = clockAt(600)
    fake.failPost.on = true
    const failed = await ingestMentions(deps, real)
    expect(failed).toMatchObject({ failedThreads: 1, retagged: 0 })
    expect(listItems(deps.store)[0]?.meta.seenUntil).toBe(at(10))

    fake.failPost.on = false
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ failedThreads: 0, retagged: 1 })
    expect(fake.posted).toHaveLength(posts + 1)
  })

  it('to be no DM, and no repeat, for a tag a program posted in a thread under way', async () => {
    const matches = [mention(10)]
    const fake = fakeSlack(matches, threadWithReply(500, 'build is red'))
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, real)
    const posts = fake.posted.length

    matches.push({ ...replyTag(500, 'build is red'), user: null })
    clock.now = clockAt(600)
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ created: 0, retagged: 0, alreadyKnown: 1 })
    expect(fake.posted).toHaveLength(posts)
    expect(listItems(deps.store)[0]?.meta.seenUntil).toBe(at(500))
  })

  it('to be a DM, not a second item, for a thread whose item failed and may be tried again', async () => {
    const matches = [mention(10)]
    const fake = fakeSlack(matches, threadWithReply(500, 'any news?'))
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, real)
    const [first] = listItems(deps.store)
    if (first === undefined) throw new Error('the first item was not made')
    deps.store.db.prepare("UPDATE items SET stage = 'failed' WHERE key = ?").run(first.key)

    matches.push(replyTag(500, 'any news?'))
    clock.now = clockAt(600)
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ created: 0, retagged: 1 })
    expect(listItems(deps.store)).toHaveLength(1)
    expect(fake.posted.at(-1)?.text).toContain('(실패, 다시 시도 가능)')
  })

  it('to be the post at the top as the summary when the reply that tagged the owner says next to nothing', async () => {
    const tag = replyTag(20, 'ping')
    const fake = fakeSlack([tag], {
      [`C1:${at(10)}`]: [
        message(10, 'U_ROOT', 'the footer link is broken on mobile'),
        message(20, 'U_OTHER', tag.text),
      ],
    })
    const deps = setup(fake)
    await ingestMentions(deps, real)
    expect(listItems(deps.store)[0]?.meta.summary).toContain('the footer link is broken on mobile')
  })

  it('to be the reply that tagged the owner, not the post at the top, as the summary of a first item', async () => {
    const tag = replyTag(20, 'fix the footer')
    const fake = fakeSlack([tag], {
      [`C1:${at(10)}`]: [message(10, 'U_ROOT', 'the original post'), message(20, 'U_OTHER', tag.text)],
    })
    const deps = setup(fake)
    await ingestMentions(deps, real)
    const summary = listItems(deps.store)[0]?.meta.summary ?? ''
    expect(summary).toContain('fix the footer')
    expect(summary).not.toContain('the original post')
  })
})

describe('ingestMentions as a pass with a limit on the threads it reads', () => {
  it('to be a new thread read even when more than the limit of known threads were found with it', async () => {
    const matches = Array.from({ length: 31 }, (_, index) => mention(index + 1))
    const fake = fakeSlack(matches)
    const clock = { now: clockAt(100) }
    const deps = setupClocked(fake, clock)
    await ingestMentions(deps, { ...real, maxThreads: 100 })

    matches.push(mention(600))
    clock.now = clockAt(700)
    const again = await ingestMentions(deps, real)
    expect(again).toMatchObject({ created: 1, alreadyKnown: 31, cutThreads: 0 })
  })

  it('to be said in the log when threads with something new were left for the next pass', async () => {
    const fake = fakeSlack([mention(10), mention(20), mention(30)])
    const deps = setup(fake)
    const summary = await ingestMentions(deps, { ...real, maxThreads: 2 })
    expect(summary).toMatchObject({ created: 2, cutThreads: 1 })
    const cut = listEvents(deps.store).find((event) => event.type === 'threads_cut')
    expect(cut?.payload).toBe('{"cut":1,"limit":2}')
  })
})
