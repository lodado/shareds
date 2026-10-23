import type { SlackTokens } from './client'
import { describe, expect, it } from 'vitest'
import { createSlackClient, parseMatch, parseMessage, SlackApiError } from './client'

// built at run time so no token-shaped literal sits in the source
const tokens: SlackTokens = {
  user: ['xoxp', 'user', 'secret'].join('-'),
  bot: ['xoxb', 'bot', 'secret'].join('-'),
  app: ['xapp', 'app', 'secret'].join('-'),
}

interface Seen {
  url: string
  authorization: string | null
  contentType: string | null
  body: string
}

interface Answer {
  status?: number
  headers?: Record<string, string>
  json: unknown
}

// A fetch that answers from a list, in order, and remembers what it was asked.
function fakeFetch(answers: Answer[]): { fetchImpl: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = []
  const queue = [...answers]
  const fetchImpl: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    seen.push({
      url: String(input),
      authorization: headers.get('Authorization'),
      contentType: headers.get('Content-Type'),
      body: String(init?.body),
    })
    const answer = queue.shift()
    if (answer === undefined) throw new Error('the fake fetch ran out of answers')
    return Promise.resolve(
      new Response(JSON.stringify(answer.json), { status: answer.status ?? 200, headers: answer.headers }),
    )
  }
  return { fetchImpl, seen }
}

const ok = (extra: Record<string, unknown> = {}): Answer => ({ json: { ok: true, ...extra } })

const noSleep = (): Promise<void> => Promise.resolve()

// A sleep that does not wait but remembers how long it was asked to.
function recordingSleep(waits: number[]): (ms: number) => Promise<void> {
  return (ms) => {
    waits.push(ms)
    return Promise.resolve()
  }
}

describe('createSlackClient as the reader of what the owner can see', () => {
  it('to be the user id the user token belongs to', async () => {
    const { fetchImpl, seen } = fakeFetch([ok({ user_id: 'U1' })])
    const client = createSlackClient(tokens, { fetchImpl })
    expect(await client.authUserId()).toBe('U1')
    expect(seen).toEqual([
      {
        url: 'https://slack.com/api/auth.test',
        authorization: `Bearer ${tokens.user}`,
        contentType: 'application/x-www-form-urlencoded',
        body: '',
      },
    ])
  })

  it('to be the mentions found, each with the root of its thread', async () => {
    const match = (ts: string, permalink: string) => ({
      channel: { id: 'C1', name: 'dev-web' },
      ts,
      text: `hi ${ts}`,
      permalink,
      user: 'U2',
    })
    const { fetchImpl, seen } = fakeFetch([
      ok({
        messages: {
          matches: [
            match('200.1', 'https://x.slack.com/archives/C1/p2001?thread_ts=100.1&cid=C1'),
            match('300.1', 'https://x.slack.com/archives/C1/p3001'),
          ],
          paging: { pages: 1 },
        },
      }),
    ])
    const found = await createSlackClient(tokens, { fetchImpl }).searchMentions('<@U9> after:2026-10-22')
    expect(found).toEqual([
      {
        channelId: 'C1',
        channelName: 'dev-web',
        ts: '200.1',
        threadTs: '100.1',
        text: 'hi 200.1',
        permalink: 'https://x.slack.com/archives/C1/p2001?thread_ts=100.1&cid=C1',
        user: 'U2',
      },
      {
        channelId: 'C1',
        channelName: 'dev-web',
        ts: '300.1',
        threadTs: '300.1',
        text: 'hi 300.1',
        permalink: 'https://x.slack.com/archives/C1/p3001',
        user: 'U2',
      },
    ])
    expect(seen[0]?.authorization).toBe(`Bearer ${tokens.user}`)
    expect(new URLSearchParams(seen[0]?.body)).toMatchObject(
      new URLSearchParams({
        query: '<@U9> after:2026-10-22',
        count: '100',
        page: '1',
        sort: 'timestamp',
        sort_dir: 'desc',
      }),
    )
  })

  it('to be every page, up to the page limit', async () => {
    const page = (ts: string, pages: number) =>
      ok({
        messages: {
          matches: [{ channel: { id: 'C1' }, ts, permalink: `https://x.slack.com/p${ts}` }],
          paging: { pages },
        },
      })
    const { fetchImpl, seen } = fakeFetch([page('1.1', 5), page('2.1', 5), page('3.1', 5)])
    const found = await createSlackClient(tokens, { fetchImpl }).searchMentions('q', 3)
    expect(found.map((entry) => entry.ts)).toEqual(['1.1', '2.1', '3.1'])
    expect(seen.map((entry) => new URLSearchParams(entry.body).get('page'))).toEqual(['1', '2', '3'])
  })

  it('to be a channel id used as the name when Slack gave none, and broken entries left out', async () => {
    const { fetchImpl } = fakeFetch([
      ok({
        messages: {
          matches: [
            { channel: { id: 'C7' }, ts: '1.1', permalink: 'https://x.slack.com/p11' },
            { channel: { id: 'C7' }, ts: '2.1' },
            { ts: '3.1', permalink: 'https://x.slack.com/p31' },
            'nonsense',
          ],
          paging: { pages: 1 },
        },
      }),
    ])
    const found = await createSlackClient(tokens, { fetchImpl }).searchMentions('q')
    expect(found.map((entry) => [entry.ts, entry.channelName])).toEqual([['1.1', 'C7']])
  })

  it('to be the messages of a thread, with who wrote them and whether a bot did', async () => {
    const { fetchImpl, seen } = fakeFetch([
      ok({
        messages: [
          { ts: '1.1', thread_ts: '1.1', user: 'U1', text: 'root' },
          { ts: '1.2', bot_id: 'B1', text: 'bot says' },
          { text: 'no ts' },
        ],
      }),
    ])
    const replies = await createSlackClient(tokens, { fetchImpl }).threadReplies('C1', '1.1', 20)
    expect(replies).toEqual([
      { ts: '1.1', threadTs: '1.1', user: 'U1', text: 'root', botId: null },
      { ts: '1.2', threadTs: null, user: null, text: 'bot says', botId: 'B1' },
    ])
    expect(new URLSearchParams(seen[0]?.body)).toMatchObject(
      new URLSearchParams({ channel: 'C1', ts: '1.1', limit: '20' }),
    )
    expect(seen[0]?.authorization).toBe(`Bearer ${tokens.user}`)
  })
})

describe('createSlackClient as the writer of the DMs', () => {
  it('to be the DM channel opened with the bot token', async () => {
    const { fetchImpl, seen } = fakeFetch([ok({ channel: { id: 'D1' } })])
    expect(await createSlackClient(tokens, { fetchImpl }).openDm('U9')).toBe('D1')
    expect(seen[0]).toMatchObject({
      url: 'https://slack.com/api/conversations.open',
      authorization: `Bearer ${tokens.bot}`,
      body: 'users=U9',
    })
  })

  it('to be a message sent as JSON with its blocks and thread, and the channel and time it got', async () => {
    const { fetchImpl, seen } = fakeFetch([ok({ channel: 'D1', ts: '5.5' })])
    const sent = await createSlackClient(tokens, { fetchImpl }).postMessage({
      channel: 'D1',
      text: 'hello',
      blocks: [{ type: 'divider' }],
      threadTs: '4.4',
    })
    expect(sent).toEqual({ channel: 'D1', ts: '5.5' })
    expect(seen[0]).toMatchObject({
      url: 'https://slack.com/api/chat.postMessage',
      authorization: `Bearer ${tokens.bot}`,
      contentType: 'application/json; charset=utf-8',
    })
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({
      channel: 'D1',
      text: 'hello',
      blocks: [{ type: 'divider' }],
      thread_ts: '4.4',
    })
  })

  it('to be a message without blocks or thread when none were given', async () => {
    const { fetchImpl, seen } = fakeFetch([ok({ channel: 'D1', ts: '5.5' })])
    await createSlackClient(tokens, { fetchImpl }).postMessage({ channel: 'D1', text: 'plain' })
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ channel: 'D1', text: 'plain' })
  })

  it('to be an update sent as JSON with the time of the message to change', async () => {
    const { fetchImpl, seen } = fakeFetch([ok()])
    await createSlackClient(tokens, { fetchImpl }).updateMessage({
      channel: 'D1',
      ts: '5.5',
      text: 'edited',
      blocks: [],
    })
    expect(seen[0]?.url).toBe('https://slack.com/api/chat.update')
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ channel: 'D1', ts: '5.5', text: 'edited', blocks: [] })
  })

  it('to be the Socket Mode address, asked for with the app token', async () => {
    const { fetchImpl, seen } = fakeFetch([ok({ url: 'wss://example.test/link' })])
    expect(await createSlackClient(tokens, { fetchImpl }).socketUrl()).toBe('wss://example.test/link')
    expect(seen[0]?.authorization).toBe(`Bearer ${tokens.app}`)
  })

  it('to be an error when there is no app token', async () => {
    const { fetchImpl } = fakeFetch([])
    await expect(createSlackClient({ ...tokens, app: null }, { fetchImpl }).socketUrl()).rejects.toThrow(
      'slack apps.connections.open failed: no_app_token',
    )
  })
})

describe('createSlackClient as an answer that is not what was asked for', () => {
  it('to be an error with the Slack code, never with a token', async () => {
    const { fetchImpl } = fakeFetch([{ json: { ok: false, error: 'channel_not_found' } }])
    const failure = await createSlackClient(tokens, { fetchImpl })
      .postMessage({ channel: 'D1', text: 'x' })
      .catch((error: unknown) => error)
    if (!(failure instanceof SlackApiError)) throw new Error('expected a SlackApiError', { cause: failure })
    expect(failure.message).toBe('slack chat.postMessage failed: channel_not_found')
    expect([failure.method, failure.code]).toEqual(['chat.postMessage', 'channel_not_found'])
    expect(JSON.stringify(failure)).not.toContain('secret')
    expect(failure.message).not.toContain('secret')
  })

  it.each([
    ['a server error', { status: 500, json: {} }, 'slack auth.test failed: http_500'],
    ['an answer that is not an object', { json: [] }, 'slack auth.test failed: bad_response'],
    ['a failure without a code', { json: { ok: false } }, 'slack auth.test failed: unknown_error'],
    ['a success without the field asked for', { json: { ok: true } }, 'slack auth.test failed: bad_response'],
  ] satisfies [string, Answer, string][])('to be an error for %s', async (_name, answer, message) => {
    const { fetchImpl } = fakeFetch([answer])
    await expect(createSlackClient(tokens, { fetchImpl }).authUserId()).rejects.toThrow(message)
  })
})

describe('createSlackClient as a client that is told to slow down', () => {
  it('to be a wait of as long as Slack asked for, then the answer', async () => {
    const waits: number[] = []
    const { fetchImpl, seen } = fakeFetch([
      { status: 429, headers: { 'Retry-After': '2' }, json: {} },
      ok({ user_id: 'U1' }),
    ])
    const client = createSlackClient(tokens, { fetchImpl, sleep: recordingSleep(waits) })
    expect(await client.authUserId()).toBe('U1')
    expect(waits).toEqual([2000])
    expect(seen).toHaveLength(2)
  })

  it('to be a wait of one second when Slack did not say how long', async () => {
    const waits: number[] = []
    const { fetchImpl } = fakeFetch([{ status: 429, json: {} }, ok({ user_id: 'U1' })])
    await createSlackClient(tokens, { fetchImpl, sleep: recordingSleep(waits) }).authUserId()
    expect(waits).toEqual([1000])
  })

  it('to be an error after the retries are used up', async () => {
    const limited: Answer = { status: 429, headers: { 'Retry-After': '1' }, json: {} }
    const { fetchImpl, seen } = fakeFetch([limited, limited, limited])
    await expect(createSlackClient(tokens, { fetchImpl, sleep: noSleep, maxRetries: 2 }).authUserId()).rejects.toThrow(
      'slack auth.test failed: rate_limited',
    )
    expect(seen).toHaveLength(3)
  })
})

describe('parseMessage and parseMatch as the shapes Slack sends', () => {
  it.each([[null], ['text'], [[]], [{ text: 'no ts' }]])('to be nothing for a message of %j', (raw) => {
    expect(parseMessage(raw)).toBeNull()
  })

  it.each([[null], [{}], [{ channel: 'C1', ts: '1.1', permalink: 'p' }]])('to be nothing for a match of %j', (raw) => {
    expect(parseMatch(raw)).toBeNull()
  })

  it('to be the message itself as the thread root when the permalink is not a link', () => {
    expect(parseMatch({ channel: { id: 'C1' }, ts: '9.9', permalink: 'not a link' })?.threadTs).toBe('9.9')
  })
})
