import type { Agent, AgentCall, AgentResult } from '../agent/claude'
import type { Run } from '../exec/exec'
import type { MentionMatch, SlackClient, SlackMessage } from '../slack/client'
import type { Store } from '../store/store'
import type { App } from './app'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config/config'
import { FakeConnection } from '../socket/testing'
import {
  applyEvent,
  closeStore,
  createItems,
  getItem,
  itemKeyOf,
  listEvents,
  listItems,
  openStore,
} from '../store/store'
import { beginRun, getWorkspace, listRuns } from '../store/work'
import { createApp } from './app'

const OWNER = 'UOWNER'
const NOW = new Date(2026, 9, 23, 12, 0, 0)
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)

interface Posted {
  channel: string
  text: string
  threadTs: string | undefined
  blocks: readonly unknown[] | undefined
}

interface Rig {
  store: Store
  app: App
  connection: FakeConnection
  posted: Posted[]
  agentCalls: AgentCall[]
  commands: string[]
  statusPort: number | null
}

const apps: App[] = []
const stores: Store[] = []

afterEach(async () => {
  for (const app of apps.splice(0)) await app.stop()
  for (const store of stores.splice(0)) closeStore(store)
  vi.useRealTimers()
})

interface RigOptions {
  mentions?: MentionMatch[]
  // Makes the search for mentions fail with this error.
  searchError?: Error
  replies?: SlackMessage[]
}

const ANALYSIS = {
  request: '푸터 링크가 깨졌어요',
  cause: 'footer.tsx의 href 오타',
  plan: 'href를 고쳐요',
  recommend: true,
  why: '작은 수정',
}

function answerFor(call: AgentCall): AgentResult {
  // The reading of a new mention is a Haiku call that names a repository; the splitting of a DM prompt does not.
  if (call.model === 'haiku' && call.prompt.includes('Repository:')) {
    return { ok: true, text: JSON.stringify(ANALYSIS), costUsd: 0.05, subtype: 'success' }
  }
  if (call.model === 'haiku') {
    const tasks = [{ repo: 'web-app', task: 'Fix the footer link' }]
    return { ok: true, text: JSON.stringify({ tasks }), costUsd: 0.05, subtype: 'success' }
  }
  const text = call.mode === 'build' ? 'Changed the footer.\nRESULT: PASS' : '1. edit footer.tsx\n2. add a test'
  return { ok: true, text, costUsd: 0.4, subtype: 'success' }
}

async function rig(options: RigOptions = {}): Promise<Rig> {
  vi.useFakeTimers({ now: NOW })
  const store = openStore(':memory:')
  stores.push(store)
  const posted: Posted[] = []
  const agentCalls: AgentCall[] = []
  const commands: string[] = []
  const slack: SlackClient = {
    authUserId: () => Promise.resolve(OWNER),
    searchMentions: () =>
      options.searchError === undefined ? Promise.resolve(options.mentions ?? []) : Promise.reject(options.searchError),
    threadReplies: () => Promise.resolve(options.replies ?? []),
    openDm: () => Promise.resolve('D1'),
    postMessage: (args) => {
      posted.push({ channel: args.channel, text: args.text, threadTs: args.threadTs, blocks: args.blocks })
      return Promise.resolve({ channel: args.channel, ts: `${posted.length}.5` })
    },
    updateMessage: () => Promise.resolve(),
    socketUrl: () => Promise.resolve('wss://example.test/socket'),
  }
  const run: Run = (file, args) => {
    const line = `${file} ${args.join(' ')}`
    commands.push(line)
    if (line.startsWith('orca repo list')) {
      const repos = [{ displayName: 'web-app', path: '/repos/web-app' }]
      return Promise.resolve({ stdout: JSON.stringify({ result: { repos } }), stderr: '' })
    }
    if (line.includes('symbolic-ref')) return Promise.resolve({ stdout: 'dispatch-a\n', stderr: '' })
    if (line.includes('rev-list')) return Promise.resolve({ stdout: '1\n', stderr: '' })
    if (line.includes('worktree create')) {
      const worktree = { id: 'r::/wt/a', path: '/wt/a', branch: 'refs/heads/dispatch-a' }
      return Promise.resolve({ stdout: JSON.stringify({ result: { worktree } }), stderr: '' })
    }
    return Promise.resolve({ stdout: '', stderr: '' })
  }
  const agent: Agent = (call) => {
    agentCalls.push(call)
    return Promise.resolve(answerFor(call))
  }
  let connection: FakeConnection | undefined
  const app = await createApp({
    config: { ...loadConfig({}, '/h'), ownerId: OWNER },
    ownerId: OWNER,
    slack,
    run,
    agent,
    store,
    newSessionId: () => '33333333-3333-4333-8333-333333333333',
    now: () => NOW,
    baseBranches: {},
    channelRepos: () => ({ 'dev-web': ['web-app'] }),
    scratchDir: '/scratch',
    qa: () => Promise.resolve({ status: 'skipped', reason: 'UI 파일 변경 없음', costUsd: 0 }),
    statusPort: 0,
    connect: () => {
      connection = new FakeConnection()
      return connection
    },
    tickMs: 1000,
  })
  apps.push(app)
  await vi.advanceTimersByTimeAsync(0)
  if (connection === undefined) throw new Error('the socket never connected')
  connection.receive({ type: 'hello' })
  await app.ready
  return { store, app, connection, posted, agentCalls, commands, statusPort: app.statusPort }
}

// Work goes on through several awaits, so the clock moves in small steps until what the test needs has happened.
async function until(condition: () => boolean): Promise<void> {
  for (let step = 0; step < 500 && !condition(); step += 1) await vi.advanceTimersByTimeAsync(10)
  expect(condition()).toBe(true)
}

const stageOf = (store: Store, key: string): string | undefined => getItem(store, key)?.stage

function ownerDm(text: string, ts = '100.1'): unknown {
  return {
    envelope_id: `env-${ts}`,
    type: 'events_api',
    payload: { event: { type: 'message', channel_type: 'im', user: OWNER, channel: 'D1', ts, text } },
  }
}

function click(envelopeId: string, actionId: string, value: string, picked: string[] = []): unknown {
  const digestId = /digest\.\w+:(\d+)/.exec(actionId)?.[1] ?? '0'
  return {
    envelope_id: envelopeId,
    type: 'interactive',
    payload: {
      type: 'block_actions',
      user: { id: OWNER },
      container: { channel_id: 'D1', message_ts: '9.9' },
      actions: [{ action_id: actionId, value }],
      state: {
        values: {
          pick: {
            [`digest.pick:${digestId}:0`]: { type: 'checkboxes', selected_options: picked.map((v) => ({ value: v })) },
          },
        },
      },
    },
  }
}

describe('createApp as the owner who types a task in the bot DM', () => {
  it('to be a plan card, then a finished local commit after the approval, without any pull request', async () => {
    const r = await rig()
    r.connection.receive(ownerDm('footer 링크 고쳐줘'))
    const key = itemKeyOf('dm:D1:100.1', 'web-app')
    await until(() => stageOf(r.store, key) === 'planned')

    expect(r.connection.sent).toContain('{"envelope_id":"env-100.1"}')
    expect(r.posted.map((message) => message.text)).toStrictEqual([
      '1개 레포로 나눴어요.\n• web-app: Fix the footer link\n플랜을 만드는 중이에요.',
      '플랜: web-app',
    ])
    expect(r.agentCalls.map((call) => [call.model, call.mode])).toStrictEqual([
      ['haiku', 'text'],
      ['opusplan', 'plan'],
    ])
    expect(getWorkspace(r.store, key)).toMatchObject({ plan: '1. edit footer.tsx\n2. add a test', path: '/wt/a' })

    const planCard = JSON.stringify(r.posted[1]?.blocks)
    expect(planCard).toContain('item.approve_plan:1')
    r.connection.receive(click('env-approve', 'item.approve_plan:1', key))
    await until(() => stageOf(r.store, key) === 'pr_open')

    expect(r.agentCalls.at(-1)).toMatchObject({ mode: 'build', resume: true })
    expect(r.posted.at(-1)?.text).toBe('구현 완료: web-app')
    expect(r.commands.some((command) => command.includes('push') || command.includes('pr create'))).toBe(false)
    expect(listEvents(r.store, { itemKey: key }).map((event) => event.stageAfter)).toContain('pr_open')
  })

  it('to be a plan asked for again when the owner replies under the plan card', async () => {
    const r = await rig()
    r.connection.receive(ownerDm('footer 링크 고쳐줘'))
    const key = itemKeyOf('dm:D1:100.1', 'web-app')
    await until(() => stageOf(r.store, key) === 'planned')
    r.connection.receive({
      envelope_id: 'env-reply',
      type: 'events_api',
      payload: {
        event: {
          type: 'message',
          channel_type: 'im',
          user: OWNER,
          channel: 'D1',
          ts: '200.2',
          thread_ts: '2.5',
          text: '푸터 색도 바꿔줘',
        },
      },
    })
    await until(() => r.agentCalls.length === 3)
    await until(() => r.posted.filter((message) => message.text === '플랜: web-app').length === 2)
    expect(r.agentCalls[2]?.prompt).toContain('asks for a change: 푸터 색도 바꿔줘')
    expect(r.agentCalls[2]).toMatchObject({ resume: true })
    expect(stageOf(r.store, key)).toBe('planned')
  })
})

describe('createApp as a mention that tags the owner', () => {
  const threadTs = String(NOW_SECONDS - 60)
  const mention: MentionMatch = {
    channelId: 'C1',
    channelName: 'dev-web',
    ts: `${threadTs}.000100`,
    threadTs: `${threadTs}.000100`,
    text: `<@${OWNER}> the footer link is broken`,
    permalink: `https://example.slack.com/archives/C1/p${threadTs}`,
    user: 'UKIM',
  }
  const root: SlackMessage = {
    ts: `${threadTs}.000100`,
    threadTs: null,
    user: 'UKIM',
    text: `<@${OWNER}> the footer link is broken`,
    botId: null,
  }

  it('to be one digest DM, then a plan only for the item the owner ticked', async () => {
    const r = await rig({ mentions: [mention], replies: [root] })
    const key = itemKeyOf(`slack:C1:${mention.threadTs}`, 'web-app')
    await until(() => r.posted.length === 1)
    expect(stageOf(r.store, key)).toBe('notified')
    // The cheapest model read the thread and the repo before the digest went out, and recommended the change.
    expect(r.posted[0]?.text).toBe('새 항목 1개 · 구현 추천 1개')
    expect(r.agentCalls.map((call) => [call.model, call.mode])).toStrictEqual([['haiku', 'plan']])
    expect(r.agentCalls[0]?.cwd).toBe('/repos/web-app')
    const digest = JSON.stringify(r.posted[0]?.blocks)
    expect(digest).toContain('*요청사항:* 푸터 링크가 깨졌어요')
    expect(digest).toContain('*구현 추천:* O — 작은 수정')
    expect(digest).toContain('"initial_options"')

    r.connection.receive(click('env-plan', 'digest.plan_selected:1', '1', [key]))
    await until(() => stageOf(r.store, key) === 'planned')
    expect(r.agentCalls.map((call) => call.mode)).toStrictEqual(['plan', 'plan'])
    expect(r.agentCalls[1]?.model).toBe('opusplan')
    expect(r.agentCalls[1]?.prompt).toContain('<thread>\n[UKIM]')
    expect(r.posted.map((message) => message.text)).toStrictEqual([
      '새 항목 1개 · 구현 추천 1개',
      '플랜 시작 1개',
      '플랜: web-app',
    ])
  })

  it('to be listed once even though every poll finds it again', async () => {
    const r = await rig({ mentions: [mention], replies: [root] })
    await until(() => r.posted.length === 1)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(r.posted.filter((message) => message.text.startsWith('새 항목'))).toHaveLength(1)
    expect(listItems(r.store)).toHaveLength(1)
  })

  it('to be left waiting, with no plan or build run, when nobody clicks', async () => {
    const r = await rig({ mentions: [mention], replies: [root] })
    await until(() => r.posted.length === 1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(r.agentCalls.map((call) => call.model)).toStrictEqual(['haiku'])
    expect(listItems(r.store).map((item) => item.stage)).toStrictEqual(['notified'])
  })
})

describe('createApp as a process that restarts', () => {
  it('to be no run left in progress from the process before', async () => {
    vi.useFakeTimers({ now: NOW })
    const store = openStore(':memory:')
    stores.push(store)
    createItems(store, 'dm:D1:1.1', ['web-app'])
    const key = itemKeyOf('dm:D1:1.1', 'web-app')
    applyEvent(store, key, { type: 'triage', handled: false, confident: false })
    beginRun(store, key, 'plan', { registered: true, allowed: true, valid: true })
    const app = await createApp({
      config: { ...loadConfig({}, '/h'), ownerId: OWNER },
      ownerId: OWNER,
      slack: {
        authUserId: () => Promise.resolve(OWNER),
        searchMentions: () => Promise.resolve([]),
        threadReplies: () => Promise.resolve([]),
        openDm: () => Promise.resolve('D1'),
        postMessage: () => Promise.resolve({ channel: 'D1', ts: '1.1' }),
        updateMessage: () => Promise.resolve(),
        socketUrl: () => Promise.resolve('wss://example.test/socket'),
      },
      run: () => Promise.resolve({ stdout: JSON.stringify({ result: { repos: [] } }), stderr: '' }),
      agent: () => Promise.resolve({ ok: true, text: '', costUsd: 0, subtype: 'success' }),
      store,
      newSessionId: () => 'x',
      now: () => NOW,
      baseBranches: {},
      channelRepos: () => ({}),
      scratchDir: '/scratch',
      qa: () => Promise.resolve({ status: 'skipped', reason: 'UI 파일 변경 없음', costUsd: 0 }),
      connect: () => new FakeConnection(),
    })
    apps.push(app)
    expect(listRuns(store, key)[0]).toMatchObject({ state: 'failed', detail: 'the worker restarted' })
  })
})

describe('createApp as the status address of the running service', () => {
  it('to be a snapshot with the stage counts and the time of the last poll', async () => {
    const r = await rig()
    await vi.advanceTimersByTimeAsync(10)
    vi.useRealTimers()
    const body = await (await fetch(`http://127.0.0.1:${r.statusPort}/status`)).json()
    expect(body).toMatchObject({
      ok: true,
      activeRuns: 0,
      lastPollError: null,
      lastPollAt: NOW.toISOString(),
      stages: { planning: 0, notified: 0 },
    })
  })

  it('to be the last poll error with any secret removed, and the service still running', async () => {
    // built at run time so no token-shaped literal sits in the source
    const botToken = ['xoxb', '1234567890', 'abcdefABCDEF'].join('-')
    const r = await rig({ searchError: new Error(`search failed for ${botToken}`) })
    await vi.advanceTimersByTimeAsync(10)
    vi.useRealTimers()
    const body = await (await fetch(`http://127.0.0.1:${r.statusPort}/status`)).json()
    expect(body).toMatchObject({ lastPollAt: null, lastPollError: 'search failed for [REDACTED]' })
    expect(JSON.stringify(body)).not.toContain('abcdefABCDEF')
  })

  it('to be off when no port is given', async () => {
    vi.useFakeTimers({ now: NOW })
    const store = openStore(':memory:')
    stores.push(store)
    const app = await createApp({
      config: { ...loadConfig({}, '/h'), ownerId: OWNER },
      ownerId: OWNER,
      slack: {
        authUserId: () => Promise.resolve(OWNER),
        searchMentions: () => Promise.resolve([]),
        threadReplies: () => Promise.resolve([]),
        openDm: () => Promise.resolve('D1'),
        postMessage: () => Promise.resolve({ channel: 'D1', ts: '1.1' }),
        updateMessage: () => Promise.resolve(),
        socketUrl: () => Promise.resolve('wss://example.test/socket'),
      },
      run: () => Promise.resolve({ stdout: JSON.stringify({ result: { repos: [] } }), stderr: '' }),
      agent: () => Promise.resolve({ ok: true, text: '', costUsd: 0, subtype: 'success' }),
      store,
      newSessionId: () => 'x',
      now: () => NOW,
      baseBranches: {},
      channelRepos: () => ({}),
      scratchDir: '/scratch',
      qa: () => Promise.resolve({ status: 'skipped', reason: 'UI 파일 변경 없음', costUsd: 0 }),
      connect: () => new FakeConnection(),
    })
    apps.push(app)
    expect(app.statusPort).toBeNull()
  })
})
