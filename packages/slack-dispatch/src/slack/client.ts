// The part of the Slack Web API this bot uses, on the built-in fetch. Answers are checked for their shape before
// anything else sees them, and no error ever carries a token.

export interface SlackTokens {
  // Reads what the owner can see (mentions, threads). Never used to write.
  user: string
  // Writes the DMs.
  bot: string
  // Opens the Socket Mode connection.
  app: string | null
}

export interface SlackMessage {
  ts: string
  threadTs: string | null
  user: string | null
  text: string
  botId: string | null
}

export interface MentionMatch {
  channelId: string
  channelName: string
  ts: string
  // The root of the thread the message is in; the message itself when it is not a reply.
  threadTs: string
  text: string
  permalink: string
  user: string | null
}

export class SlackApiError extends Error {
  readonly method: string
  readonly code: string

  constructor(method: string, code: string) {
    super(`slack ${method} failed: ${code}`)
    this.name = 'SlackApiError'
    this.method = method
    this.code = code
  }
}

interface PostArgs {
  channel: string
  text: string
  blocks?: readonly unknown[]
  threadTs?: string
}

export interface SlackClient {
  authUserId: () => Promise<string>
  searchMentions: (query: string, maxPages?: number) => Promise<MentionMatch[]>
  threadReplies: (channelId: string, threadTs: string, limit?: number) => Promise<SlackMessage[]>
  openDm: (userId: string) => Promise<string>
  postMessage: (args: PostArgs) => Promise<{ channel: string; ts: string }>
  updateMessage: (args: PostArgs & { ts: string }) => Promise<void>
  socketUrl: () => Promise<string>
}

export interface SlackClientOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
}

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export function parseMessage(raw: unknown): SlackMessage | null {
  if (!isRecord(raw)) return null
  const ts = asString(raw.ts)
  if (ts === null) return null
  return {
    ts,
    threadTs: asString(raw.thread_ts),
    user: asString(raw.user),
    text: asString(raw.text) ?? '',
    botId: asString(raw.bot_id),
  }
}

// A reply's permalink carries the thread it belongs to; the root message's does not.
function rootOf(permalink: string, ts: string): string {
  try {
    return new URL(permalink).searchParams.get('thread_ts') ?? ts
  } catch {
    return ts
  }
}

export function parseMatch(raw: unknown): MentionMatch | null {
  if (!isRecord(raw) || !isRecord(raw.channel)) return null
  const ts = asString(raw.ts)
  const channelId = asString(raw.channel.id)
  const permalink = asString(raw.permalink)
  if (ts === null || channelId === null || permalink === null) return null
  return {
    channelId,
    channelName: asString(raw.channel.name) ?? channelId,
    ts,
    threadTs: rootOf(permalink, ts),
    text: asString(raw.text) ?? '',
    permalink,
    user: asString(raw.user),
  }
}

const DEFAULT_RETRIES = 3
const SEARCH_PAGE_SIZE = 100
const DEFAULT_SEARCH_PAGES = 3

function requestInit(token: string, params: Json, asJson: boolean): RequestInit {
  if (asJson) {
    return {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(params),
    }
  }
  const fields = Object.entries(params).map(([key, value]): [string, string] => [key, String(value)])
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }
}

// How long Slack asked us to wait; one second when it did not say.
function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'))
  if (!Number.isFinite(seconds) || seconds <= 0) return 1000
  return seconds * 1000
}

async function readAnswer(method: string, response: Response): Promise<Json> {
  if (!response.ok) throw new SlackApiError(method, `http_${response.status}`)
  const data: unknown = await response.json()
  if (!isRecord(data)) throw new SlackApiError(method, 'bad_response')
  if (data.ok !== true) throw new SlackApiError(method, asString(data.error) ?? 'unknown_error')
  return data
}

export function createSlackClient(tokens: SlackTokens, options: SlackClientOptions = {}): SlackClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const maxRetries = options.maxRetries ?? DEFAULT_RETRIES

  async function call(method: string, token: string, params: Json, asJson = false): Promise<Json> {
    const url = `https://slack.com/api/${method}`
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(url, requestInit(token, params, asJson))
      if (response.status !== 429) return readAnswer(method, response)
      if (attempt >= maxRetries) throw new SlackApiError(method, 'rate_limited')
      await sleep(retryAfterMs(response))
    }
  }

  const needString = (method: string, value: unknown): string => {
    if (typeof value !== 'string') throw new SlackApiError(method, 'bad_response')
    return value
  }

  return {
    async authUserId() {
      const data = await call('auth.test', tokens.user, {})
      return needString('auth.test', data.user_id)
    },

    async searchMentions(query, maxPages = DEFAULT_SEARCH_PAGES) {
      const found: MentionMatch[] = []
      for (let page = 1; page <= maxPages; page += 1) {
        const data = await call('search.messages', tokens.user, {
          query,
          count: SEARCH_PAGE_SIZE,
          page,
          sort: 'timestamp',
          sort_dir: 'desc',
        })
        const messages = isRecord(data.messages) ? data.messages : {}
        const matches: unknown[] = Array.isArray(messages.matches) ? messages.matches : []
        found.push(...matches.flatMap((match) => parseMatch(match) ?? []))
        const pages = isRecord(messages.paging) ? Number(messages.paging.pages) : 1
        if (page >= pages) break
      }
      return found
    },

    async threadReplies(channelId, threadTs, limit = 50) {
      const data = await call('conversations.replies', tokens.user, { channel: channelId, ts: threadTs, limit })
      const messages: unknown[] = Array.isArray(data.messages) ? data.messages : []
      return messages.flatMap((message) => parseMessage(message) ?? [])
    },

    async openDm(userId) {
      const data = await call('conversations.open', tokens.bot, { users: userId })
      const channel = isRecord(data.channel) ? data.channel : {}
      return needString('conversations.open', channel.id)
    },

    async postMessage({ channel, text, blocks, threadTs }) {
      const data = await call(
        'chat.postMessage',
        tokens.bot,
        { channel, text, ...(blocks ? { blocks } : {}), ...(threadTs ? { thread_ts: threadTs } : {}) },
        true,
      )
      return { channel: needString('chat.postMessage', data.channel), ts: needString('chat.postMessage', data.ts) }
    },

    async updateMessage({ channel, ts, text, blocks }) {
      await call('chat.update', tokens.bot, { channel, ts, text, ...(blocks ? { blocks } : {}) }, true)
    },

    async socketUrl() {
      if (tokens.app === null) throw new SlackApiError('apps.connections.open', 'no_app_token')
      const data = await call('apps.connections.open', tokens.app, {})
      return needString('apps.connections.open', data.url)
    },
  }
}
