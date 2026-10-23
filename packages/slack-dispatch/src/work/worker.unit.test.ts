import type { Agent, AgentCall, AgentResult } from '../agent/claude'
import type { Run } from '../exec/exec'
import type { ItemEvent } from '../machine/machine'
import type { QaInput, QaOutcome } from '../qa/qa'
import type { ItemMeta, Store } from '../store/store'
import type { WorkerConfig } from './worker'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentAborted } from '../agent/claude'
import { CommandError } from '../exec/exec'
import { worktreeNameFor } from '../orca/worktree'
import {
  applyEvent,
  closeStore,
  createItems,
  getItem,
  itemKeyOf,
  listEvents,
  logEvent,
  openStore,
} from '../store/store'
import {
  beginRun,
  cardAt,
  countActiveRuns,
  endRun,
  getWorkspace,
  listRuns,
  pendingInstruction,
  RESTARTED_DETAIL,
  saveWorkspace,
  setPlan,
  setPrUrl,
  spentOnItem,
  STOPPED_DETAIL,
} from '../store/work'
import { createWorker, retriesLeft } from './worker'

const OWNER = 'UOWNER'
const PR_URL = 'https://github.com/acme/web-app/pull/7'
const THREAD = 'dm:D1:100.1'

const CONFIG: WorkerConfig = {
  maxTotal: 3,
  maxPerRepo: 1,
  maxCostPerItemUsd: 5,
  planBudgetUsd: 1,
  buildBudgetUsd: 2,
  qaBudgetUsd: 1,
  planTimeoutMs: 1000,
  buildTimeoutMs: 2000,
  maxAttempts: 2,
  prEnabled: false,
  ownSetup: true,
  baseOverrides: {},
}

// The time the worker sees, in milliseconds; a test moves it to let a pause pass.
const clock = { now: 1_000_000 }

const opened: Store[] = []
const temporaryDirs: string[] = []
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  clock.now = 1_000_000
  for (const store of opened.splice(0)) closeStore(store)
})

const ok = (text: string, costUsd = 0.3): AgentResult => ({ ok: true, text, costUsd, subtype: 'success' })

interface Rig {
  store: Store
  worker: ReturnType<typeof createWorker>
  calls: AgentCall[]
  commands: string[]
  posted: { text: string; blocks: readonly unknown[] | undefined; channel: string; threadTs: string | undefined }[]
  qaInputs: QaInput[]
  // Every command and agent call, in the order they happened.
  order: string[]
  openDmCalls: () => number
  // How many times the Slack thread of an item was read.
  threadReads: () => number
}

interface RigOptions {
  config?: Partial<WorkerConfig>
  agent?: (call: AgentCall, index: number) => Promise<AgentResult>
  failCommand?: string
  dirty?: boolean
  noRepo?: string
  postFails?: boolean
  // Posting to this channel fails; every other channel works.
  failChannel?: string
  // What `git merge-base` prints: the commit the branch started from.
  mergeBase?: string
  // The branch has no upstream (the host deleted it after the merge): comparing with it fails.
  noUpstream?: boolean
  // The agent left no commit on top of the base.
  noCommit?: boolean
  // The branch the worktree is on after the agent ran; the worktree's own branch when not given.
  branchNow?: string
  // Runs when a command whose line contains the text is started, before it answers.
  onCommand?: { includes: string; run: (line: string) => void }
  // Runs inside the n-th post to Slack (counted from 0), before it answers.
  onPost?: { index: number; run: () => void }
  // How many times opening the DM channel fails before it works.
  openDmFailures?: number
  // What Visual QA answers; skipped when not given.
  qa?: (input: QaInput) => Promise<QaOutcome>
}

// What the commands of orca, git and gh print in the rig, as far as the worker reads them.
function commandOutput(line: string, args: readonly string[], options: RigOptions): string {
  if (line.includes('worktree create')) {
    const name = args[args.indexOf('--name') + 1] ?? 'x'
    const worktree = { id: `r::/wt/${name}`, path: `/wt/${name}`, branch: `refs/heads/${name}` }
    return JSON.stringify({ result: { worktree } })
  }
  if (line.startsWith('orca terminal create')) {
    const terminal = { handle: 'term_5b70a478-6623-408a-8919-d4eced9eb295', title: 'x' }
    return JSON.stringify({ result: { terminal } })
  }
  if (line.includes('merge-base')) return `${options.mergeBase ?? ''}\n`
  if (line.includes('symbolic-ref')) return `${options.branchNow ?? 'dispatch-a'}\n`
  if (line.includes('status --porcelain')) return options.dirty ? ' M a.ts\n' : ''
  if (line.includes('rev-list')) {
    // `@{upstream}..HEAD` is the unpushed-work check of a cleanup; `<base>..HEAD` is the commit check of a build.
    const nothingNew = line.includes('@{upstream}') || options.noCommit === true
    return nothingNew ? '0\n' : '1\n'
  }
  if (line.includes('pr create')) return `${PR_URL}\n`
  return ''
}

function rig(options: RigOptions = {}): Rig {
  const store = openStore(':memory:')
  opened.push(store)
  const calls: AgentCall[] = []
  const commands: string[] = []
  const posted: Rig['posted'] = []
  const qaInputs: QaInput[] = []
  const order: string[] = []
  let openDmCalls = 0
  let threadReads = 0
  const run: Run = (file, args) => {
    const line = `${file} ${args.join(' ')}`
    commands.push(line)
    order.push(line)
    if (options.onCommand !== undefined && line.includes(options.onCommand.includes)) options.onCommand.run(line)
    if (options.failCommand !== undefined && line.includes(options.failCommand)) {
      return Promise.reject(new CommandError(file, 1, 'it failed'))
    }
    if (options.noUpstream === true && line.includes('@{upstream}')) {
      return Promise.reject(new CommandError(file, 128, 'no upstream configured'))
    }
    return Promise.resolve({ stdout: commandOutput(line, args, options), stderr: '' })
  }
  const agent: Agent = (call) => {
    calls.push(call)
    order.push('<agent>')
    return (options.agent ?? (() => Promise.resolve(ok('the plan'))))(call, calls.length - 1)
  }
  const worker = createWorker({
    store,
    run,
    agent,
    ownerId: OWNER,
    config: { ...CONFIG, ...options.config },
    slack: {
      openDm: () => {
        openDmCalls += 1
        const failuresLeft = options.openDmFailures ?? 0
        if (openDmCalls <= failuresLeft) return Promise.reject(new Error('conversations.open failed'))
        return Promise.resolve('D1')
      },
      postMessage: (args) => {
        if (options.postFails) return Promise.reject(new Error('slack is down'))
        if (options.failChannel === args.channel) return Promise.reject(new Error('not_in_channel'))
        if (options.onPost?.index === posted.length) options.onPost.run()
        posted.push({ text: args.text, blocks: args.blocks, channel: args.channel, threadTs: args.threadTs })
        return Promise.resolve({ channel: args.channel, ts: `${posted.length}.5` })
      },
    },
    repoPath: (repo) => Promise.resolve(repo === options.noRepo ? undefined : `/repos/${repo}`),
    loadThread: () => {
      threadReads += 1
      return Promise.resolve('thread text')
    },
    newSessionId: () => '11111111-1111-4111-8111-111111111111',
    qa: (input) => {
      qaInputs.push(input)
      return (options.qa ?? (() => Promise.resolve({ status: 'skipped', reason: 'UI 파일 변경 없음', costUsd: 0 })))(
        input,
      )
    },
    now: () => clock.now,
  })
  return {
    store,
    worker,
    calls,
    commands,
    order,
    posted,
    qaInputs,
    openDmCalls: () => openDmCalls,
    threadReads: () => threadReads,
  }
}

const TO_PLANNING: ItemEvent[] = [{ type: 'triage', handled: false, confident: true }]
const TO_IMPLEMENTING: ItemEvent[] = [
  ...TO_PLANNING,
  { type: 'plan_ready', current: true },
  { type: 'approve', owner: true, card: 'plan', fresh: true },
]

function item(store: Store, repo: string, events: readonly ItemEvent[], n = 1): string {
  const thread = `${THREAD}${n}`
  createItems(store, thread, [repo], {
    source: 'dm',
    tasks: { [repo]: 'Fix it' },
    meta: { [repo]: { summary: 'Fix it', url: 'https://x.test/t' } },
  })
  const key = itemKeyOf(thread, repo)
  for (const event of events) applyEvent(store, key, event)
  return key
}

// An item with more in its meta than `item` gives: what the owner chose, or what the digest showed.
function itemWithMeta(store: Store, repo: string, events: readonly ItemEvent[], extra: ItemMeta): string {
  const thread = `${THREAD}7`
  // A mention, like the items a digest build starts from.
  createItems(store, thread, [repo], { meta: { [repo]: { summary: 'Fix it', url: 'https://x.test/t', ...extra } } })
  const key = itemKeyOf(thread, repo)
  for (const event of events) applyEvent(store, key, event)
  return key
}

// An item whose plan was approved, with a worktree, ready for its build.
function approvedInWorktree(r: Rig): string {
  const key = item(r.store, 'web-app', TO_IMPLEMENTING)
  saveWorkspace(r.store, key, {
    sessionId: '11111111-1111-4111-8111-111111111111',
    path: '/wt/a',
    branch: 'dispatch-a',
    baseRef: 'origin/develop',
  })
  setPlan(r.store, key, 'the plan')
  return key
}

const stageOf = (store: Store, key: string): string | undefined => getItem(store, key)?.stage

// The agent is called a few awaits after tick() returns, so a test that needs it running waits for the call.
async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
  }
  expect(condition()).toBe(true)
}

async function settle(r: Rig): Promise<void> {
  await r.worker.tick()
  await r.worker.idle()
}

function buttonIds(blocks: readonly unknown[] | undefined): string[] {
  return JSON.stringify(blocks ?? []).match(/item\.\w+:\d+/g) ?? []
}

describe('worker as an item that waits in planning', () => {
  it('to be planned: a worktree made from develop, a plan card posted, the item in planned', async () => {
    const r = rig()
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('planned')
    const workspace = getWorkspace(r.store, key)
    expect(workspace).toMatchObject({
      baseRef: 'origin/develop',
      plan: 'the plan',
      sessionId: '11111111-1111-4111-8111-111111111111',
    })
    expect(workspace?.path.startsWith('/wt/dispatch-')).toBe(true)
    expect(r.calls).toHaveLength(1)
    expect(r.calls[0]).toMatchObject({
      cwd: workspace?.path,
      mode: 'plan',
      model: 'opusplan',
      resume: false,
      maxBudgetUsd: 1,
    })
    expect(r.calls[0]?.prompt).toContain('repository web-app (branch base: origin/develop)')
    expect(r.posted).toHaveLength(1)
    expect(r.posted[0]?.text).toBe('플랜: web-app')
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual(['item.approve_plan:1', 'item.reject:1'])
    expect(listRuns(r.store, key)).toMatchObject([
      { kind: 'plan', state: 'succeeded', costUsd: 0.3, detail: 'planned' },
    ])
    expect(r.commands.filter((c) => c.includes('workspace-status'))).toHaveLength(1)
  })

  it('to be failed with a retry card when the agent stops', async () => {
    const r = rig({
      agent: () => Promise.resolve({ ok: false, text: '', costUsd: 1, subtype: 'error_max_budget_usd' }),
    })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key)[0]).toMatchObject({
      state: 'failed',
      costUsd: 1,
      detail: 'the agent stopped (error_max_budget_usd)',
    })
    expect(r.posted[0]?.text).toBe('실패: web-app')
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual(['item.retry:0'])
  })

  it('to be failed when the agent answers with an empty plan', async () => {
    const r = rig({ agent: () => Promise.resolve(ok('  \n')) })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key)[0]?.detail).toBe('the agent made no plan')
  })

  it('to be failed with the reason when the repo is not registered in Orca', async () => {
    const r = rig({ noRepo: 'web-app' })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key)[0]?.detail).toBe('the repo web-app is not registered in Orca')
    expect(r.calls).toStrictEqual([])
  })

  it('to be failed when Slack is down while the plan card is posted', async () => {
    const r = rig({ postFails: true })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listEvents(r.store, { itemKey: key }).some((event) => event.type === 'notify_failed')).toBe(true)
    // The plan was written and paid for before the post failed: the run says so and the plan is kept for a retry.
    expect(listRuns(r.store, key)[0]).toMatchObject({ state: 'succeeded', costUsd: 0.3, detail: 'planned' })
    expect(getWorkspace(r.store, key)?.plan).toBe('the plan')
  })

  it('to be branched from main when the repo has no develop', async () => {
    const r = rig({ failCommand: 'refs/remotes/origin/develop' })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(getWorkspace(r.store, key)?.baseRef).toBe('origin/main')
  })

  it('to be branched from the base the owner chose for that repo', async () => {
    const r = rig({ config: { baseOverrides: { 'web-app': 'stage' } } })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(getWorkspace(r.store, key)?.baseRef).toBe('origin/stage')
  })
})

// An agent that works until it is stopped.
const hangAgent: NonNullable<RigOptions['agent']> = (call) =>
  new Promise((_resolve, reject) => {
    if (call.signal?.aborted === true) {
      reject(new AgentAborted())
      return
    }
    call.signal?.addEventListener('abort', () => {
      reject(new AgentAborted())
    })
  })

describe('worker as an owner who stops or changes a plan that is being made', () => {
  const hang = hangAgent

  it('to be a run that ended as stopped, with no card and no failure, when the agent is aborted', async () => {
    const r = rig({ agent: hang })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await r.worker.tick()
    r.worker.abort(key)
    await r.worker.idle()
    expect(stageOf(r.store, key)).toBe('planning')
    expect(listRuns(r.store, key)[0]).toMatchObject({ state: 'failed', detail: STOPPED_DETAIL })
    expect(r.posted).toStrictEqual([])
    expect(retriesLeft(r.store, key, { maxAttempts: 1, maxCostPerItemUsd: 100 })).toBe(true)
  })

  it('to be made again by the next tick, from the owner request, in the same session', async () => {
    const r = rig({ agent: (_call, index) => Promise.resolve(ok(index === 0 ? 'first plan' : 'second plan')) })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    applyEvent(r.store, key, { type: 'revise', owner: true })
    logEvent(r.store, { itemKey: key, kind: 'inbound', type: 'revise_text', payload: { text: 'make it blue' } })
    expect(stageOf(r.store, key)).toBe('planning')
    await settle(r)
    expect(r.calls[1]?.prompt).toContain('asks for a change: make it blue')
    expect(r.calls[1]).toMatchObject({ resume: true, sessionId: '11111111-1111-4111-8111-111111111111' })
    expect(getWorkspace(r.store, key)?.plan).toBe('second plan')
    expect(stageOf(r.store, key)).toBe('planned')
    expect(r.posted).toHaveLength(2)
  })

  it('to be dropped without a card when the request arrives while the answer is already on its way', async () => {
    let release: (result: AgentResult) => void = (_result) => undefined
    const r = rig({
      agent: () =>
        new Promise((resolve) => {
          release = resolve
        }),
    })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await r.worker.tick()
    await until(() => r.calls.length === 1)
    r.worker.abort(key)
    release(ok('old plan'))
    await r.worker.idle()
    expect(r.posted).toStrictEqual([])
    expect(getWorkspace(r.store, key)?.plan).toBe('')
    expect(listRuns(r.store, key)[0]).toMatchObject({ state: 'failed', detail: STOPPED_DETAIL, costUsd: 0.3 })
  })

  it('to be aborted for every running job on stop', async () => {
    const r = rig({ agent: hang })
    const a = item(r.store, 'web-app', TO_PLANNING, 1)
    const b = item(r.store, 'api-server', TO_PLANNING, 2)
    await r.worker.tick()
    await until(() => r.calls.length === 2)
    r.worker.stop()
    await r.worker.idle()
    expect([a, b].map((key) => listRuns(r.store, key)[0]?.detail)).toStrictEqual([STOPPED_DETAIL, STOPPED_DETAIL])
  })
})

describe('worker as an approved plan that waits in implementing', () => {
  function building(r: Rig, n = 1): string {
    const key = item(r.store, 'web-app', TO_IMPLEMENTING, n)
    saveWorkspace(r.store, key, {
      sessionId: '11111111-1111-4111-8111-111111111111',
      path: '/wt/a',
      branch: 'dispatch-a',
      baseRef: 'origin/develop',
    })
    setPlan(r.store, key, 'the plan')
    beginRun(r.store, key, 'plan', { registered: true, allowed: true, valid: true })
    endRun(r.store, listRuns(r.store, key)[0]?.id ?? 0, { type: 'finish', ok: true, valid: true }, { costUsd: 0.3 })
    return key
  }

  it('to be a local commit in shadow mode: item in pr_open, no push, a card with only a discard button', async () => {
    const r = rig({ agent: () => Promise.resolve(ok('Changed it.\nlint PASS\nRESULT: PASS')) })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(r.calls[0]).toMatchObject({ mode: 'build', resume: true, cwd: '/wt/a', maxBudgetUsd: 2 })
    expect(r.commands.some((c) => c.includes('push') || c.includes('pr create'))).toBe(false)
    expect(r.posted[0]?.text).toBe('구현 완료: web-app')
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual(['item.cancel:0'])
    expect(getWorkspace(r.store, key)?.prUrl).toBeNull()
    expect(listRuns(r.store, key).at(-1)).toMatchObject({ kind: 'build', state: 'succeeded', detail: 'built' })
  })

  it('to be pushed and opened as a pull request against the base branch when PRs are enabled', async () => {
    const r = rig({ config: { prEnabled: true }, agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(getWorkspace(r.store, key)?.prUrl).toBe(PR_URL)
    const create = r.commands.find((c) => c.startsWith('gh pr create')) ?? ''
    expect(create).toContain('--base develop --head dispatch-a')
    expect(create).toContain('Requested in Slack: https://x.test/t')
    expect(r.commands).toContain('git -C /wt/a push --set-upstream origin dispatch-a')
    expect(r.posted[0]?.text).toBe('PR 준비됨: web-app')
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual(['item.merge:0', 'item.cancel:0'])
  })

  it('to be failed, with nothing pushed, when the report says FAIL', async () => {
    const r = rig({
      config: { prEnabled: true },
      agent: () => Promise.resolve(ok('tests red\nRESULT: FAIL tests are red')),
    })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)?.detail).toBe('tests are red')
    expect(r.commands.some((c) => c.includes('push'))).toBe(false)
  })

  it('to be failed when the report has no verdict', async () => {
    const r = rig({ agent: () => Promise.resolve(ok('all done, trust me')) })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)?.detail).toBe('the report has no RESULT line')
  })

  it('to be failed when the agent itself stopped, even if its text says PASS', async () => {
    const r = rig({
      agent: () => Promise.resolve({ ok: false, text: 'RESULT: PASS', costUsd: 2, subtype: 'error_max_turns' }),
    })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)).toMatchObject({ detail: 'the agent stopped (error_max_turns)', costUsd: 2 })
  })

  it('to be failed, with the commit kept, when the pull request cannot be opened', async () => {
    const r = rig({
      config: { prEnabled: true },
      failCommand: 'pr create',
      agent: () => Promise.resolve(ok('RESULT: PASS')),
    })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)).toMatchObject({ state: 'failed', costUsd: 0.3 })
    expect(getWorkspace(r.store, key)?.prUrl).toBeNull()
    // The commit stays where it is: nothing removed the worktree or moved the branch.
    expect(r.commands.filter((command) => /worktree rm|reset|checkout|branch -D/.test(command))).toStrictEqual([])
    expect(r.commands).toContain('git -C /wt/a push --set-upstream origin dispatch-a')
  })

  it('to be planned again from the failure, then built without it once the new plan is approved', async () => {
    const answers = [ok('RESULT: FAIL lint failed'), ok('1. fix the lint error first'), ok('RESULT: PASS')]
    const r = rig({ agent: (_call, index) => Promise.resolve(answers[index] ?? ok('')) })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    applyEvent(r.store, key, { type: 'retry', owner: true, allowed: true })
    await settle(r)
    expect(stageOf(r.store, key)).toBe('planned')
    expect(r.calls[1]?.mode).toBe('plan')
    expect(r.calls[1]?.prompt).toContain('Make a new plan that avoids that failure.')
    expect(r.calls[1]?.prompt).toContain('\nlint failed\n</thread>')
    applyEvent(r.store, key, { type: 'approve', owner: true, card: 'plan', fresh: true })
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(r.calls[2]?.mode).toBe('build')
    expect(r.calls[2]?.prompt).not.toContain('lint failed')
    expect(r.calls[2]?.prompt).not.toContain('The last try failed')
  })
})

describe('worker as many items at once', () => {
  it('to be at most three runs at a time across repos', async () => {
    const r = rig({ agent: hangAgent })
    for (const [n, repo] of ['a', 'b', 'c', 'd'].entries()) item(r.store, repo, TO_PLANNING, n + 1)
    await r.worker.tick()
    expect(countActiveRuns(r.store)).toBe(3)
    await until(() => r.calls.length === 3)
    r.worker.stop()
    await r.worker.idle()
    expect(r.calls).toHaveLength(3)
  })

  it('to be one run at a time in the same repo, the second one on the next tick', async () => {
    const r = rig()
    const a = item(r.store, 'web-app', TO_PLANNING, 1)
    const b = item(r.store, 'web-app', TO_PLANNING, 2)
    await r.worker.tick()
    await r.worker.idle()
    expect([stageOf(r.store, a), stageOf(r.store, b)]).toStrictEqual(['planned', 'planning'])
    await settle(r)
    expect(stageOf(r.store, b)).toBe('planned')
  })

  it('to be a single run for an item however many ticks come while it works', async () => {
    const r = rig({ agent: hangAgent })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await r.worker.tick()
    await r.worker.tick()
    await r.worker.tick()
    await until(() => r.calls.length === 1)
    expect(listRuns(r.store, key)).toHaveLength(1)
    r.worker.stop()
    await r.worker.idle()
    expect(r.calls).toHaveLength(1)
  })

  it('to be failed without calling the agent when the item already spent its money', async () => {
    const r = rig({ config: { maxCostPerItemUsd: 1 } })
    const key = item(r.store, 'web-app', TO_PLANNING)
    const run = beginRun(r.store, key, 'plan', { registered: true, allowed: true, valid: true })
    endRun(r.store, run.id, { type: 'finish', ok: true, valid: true }, { costUsd: 2 })
    expect(spentOnItem(r.store, key)).toBe(2)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(r.calls).toStrictEqual([])
    expect(r.posted[0]?.text).toBe('실패: web-app')
  })
})

describe('worker as the cleanup of finished work', () => {
  function withWorkspace(r: Rig, events: readonly ItemEvent[]): string {
    const key = item(r.store, 'web-app', events)
    saveWorkspace(r.store, key, { sessionId: 's', path: '/wt/a', branch: 'dispatch-a', baseRef: 'origin/develop' })
    return key
  }

  it('to be forced off for a declined item, and only once', async () => {
    const r = rig({ dirty: true })
    const key = withWorkspace(r, [...TO_PLANNING, { type: 'reject', owner: true }])
    await settle(r)
    await settle(r)
    expect(r.commands.filter((c) => c.includes('worktree rm'))).toStrictEqual([
      'orca worktree rm --worktree path:/wt/a --force --json',
    ])
    expect(listEvents(r.store, { itemKey: key }).filter((event) => event.type === 'workspace_removed')).toHaveLength(1)
  })

  it('to be kept, and told once, for a merged item that still has unsaved work', async () => {
    const r = rig({ dirty: true })
    const key = withWorkspace(r, [
      ...TO_IMPLEMENTING,
      { type: 'built', ok: true },
      { type: 'merge', owner: true, ci: true, review: true },
    ])
    await settle(r)
    await settle(r)
    expect(r.commands.some((c) => c.includes('worktree rm'))).toBe(false)
    const kept = listEvents(r.store, { itemKey: key }).filter((event) => event.type === 'workspace_kept')
    expect(kept).toHaveLength(1)
    expect(JSON.parse(kept[0]?.payload ?? '{}')).toMatchObject({ reason: 'there are uncommitted changes' })
  })

  it('to be removed for a merged item although the host deleted its branch: the work is in the merged pull request', async () => {
    const r = rig({ noUpstream: true })
    withWorkspace(r, [
      ...TO_IMPLEMENTING,
      { type: 'built', ok: true },
      { type: 'merge', owner: true, ci: true, review: true },
    ])
    await settle(r)
    expect(r.commands.filter((c) => c.includes('worktree rm'))).toStrictEqual([
      'orca worktree rm --worktree path:/wt/a --json',
    ])
  })

  it('to be removed for a merged item when everything is saved', async () => {
    const r = rig()
    withWorkspace(r, [
      ...TO_IMPLEMENTING,
      { type: 'built', ok: true },
      { type: 'merge', owner: true, ci: true, review: true },
    ])
    await settle(r)
    expect(r.commands.filter((c) => c.includes('worktree rm'))).toStrictEqual([
      'orca worktree rm --worktree path:/wt/a --json',
    ])
  })

  it('to be skipped for a declined item that never got a workspace', async () => {
    const r = rig()
    item(r.store, 'web-app', [...TO_PLANNING, { type: 'reject', owner: true }])
    await settle(r)
    expect(r.commands).toStrictEqual([])
  })

  it('to be logged, not thrown, when the removal fails', async () => {
    const r = rig({ failCommand: 'worktree rm' })
    const key = withWorkspace(r, [...TO_PLANNING, { type: 'reject', owner: true }])
    await expect(settle(r)).resolves.toBeUndefined()
    expect(listEvents(r.store, { itemKey: key }).some((event) => event.type === 'cleanup_failed')).toBe(true)
  })
})

describe('retriesLeft as the budget of a failed item', () => {
  it('to be spent by failed runs but not by runs the owner stopped', () => {
    const r = rig()
    const key = item(r.store, 'web-app', TO_PLANNING)
    const fail = (detail: string): void => {
      const run = beginRun(r.store, key, 'plan', { registered: true, allowed: true, valid: true })
      endRun(r.store, run.id, { type: 'finish', ok: false, valid: true }, { detail })
    }
    fail('boom')
    expect(retriesLeft(r.store, key, { maxAttempts: 2, maxCostPerItemUsd: 100 })).toBe(true)
    const stopped = beginRun(r.store, key, 'plan', { registered: true, allowed: true, valid: true })
    endRun(r.store, stopped.id, { type: 'cancel' }, { detail: STOPPED_DETAIL })
    expect(retriesLeft(r.store, key, { maxAttempts: 2, maxCostPerItemUsd: 100 })).toBe(true)
    fail('boom again')
    expect(retriesLeft(r.store, key, { maxAttempts: 2, maxCostPerItemUsd: 100 })).toBe(false)
  })
})

const ADMITTED = { registered: true, allowed: true, valid: true }

// An item whose plan was approved, with the workspace and a plan run behind it.
function approved(r: Rig, n = 1, path = '/wt/a'): string {
  const key = item(r.store, 'web-app', TO_IMPLEMENTING, n)
  saveWorkspace(r.store, key, {
    sessionId: '11111111-1111-4111-8111-111111111111',
    path,
    branch: 'dispatch-a',
    baseRef: 'origin/develop',
  })
  setPlan(r.store, key, 'the plan')
  const run = beginRun(r.store, key, 'plan', ADMITTED)
  endRun(r.store, run.id, { type: 'finish', ok: true, valid: true }, { costUsd: 0.3 })
  return key
}

const pass = (): Promise<AgentResult> => Promise.resolve(ok('Done.\nRESULT: PASS'))

describe('worker as the owner who asks for a change while the plan card is being posted', () => {
  it('to be a plan the machine refuses as stale, made again at once from the request', async () => {
    let key = ''
    const r = rig({
      agent: (_call, index) => Promise.resolve(ok(index === 0 ? 'old plan' : 'new plan')),
      onPost: {
        index: 0,
        run: () => {
          applyEvent(r.store, key, { type: 'revise', owner: true })
          logEvent(r.store, { itemKey: key, kind: 'inbound', type: 'revise_text', payload: { text: 'make it blue' } })
          r.worker.abort(key)
        },
      },
    })
    key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('planning')
    expect(listEvents(r.store, { itemKey: key }).find((event) => event.type === 'plan_ready')).toMatchObject({
      outcome: 'refused',
      reason: 'stale',
    })
    await settle(r)
    expect(stageOf(r.store, key)).toBe('planned')
    expect(r.calls[1]?.prompt).toContain('asks for a change: make it blue')
    expect(getWorkspace(r.store, key)?.plan).toBe('new plan')
    expect(r.posted.map((message) => message.text)).toStrictEqual(['플랜: web-app', '플랜: web-app'])
  })

  it('to be a request the next plan still answers: the refused plan did not use it up', async () => {
    let key = ''
    const r = rig({
      onPost: {
        index: 0,
        run: () => {
          applyEvent(r.store, key, { type: 'revise', owner: true })
          logEvent(r.store, { itemKey: key, kind: 'inbound', type: 'revise_text', payload: { text: 'bigger' } })
        },
      },
    })
    key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('planning')
    expect(pendingInstruction(r.store, key)?.text).toBe('bigger')
  })
})

describe('worker as the owner who calls an item off while its pull request is made', () => {
  it('to be a declined item with no merge card when the reject comes during gh pr create', async () => {
    let key = ''
    const r = rig({
      config: { prEnabled: true },
      agent: pass,
      onCommand: {
        includes: 'gh pr create',
        run: () => {
          applyEvent(r.store, key, { type: 'reject', owner: true })
          r.worker.abort(key)
        },
      },
    })
    key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('declined')
    expect(r.posted.map((message) => message.text)).not.toContain('PR 준비됨: web-app')
    const stopped = listEvents(r.store, { itemKey: key }).find((event) => event.type === 'built_after_stop')
    expect(JSON.parse(stopped?.payload ?? '{}')).toStrictEqual({ prUrl: PR_URL })
  })

  it('to be no pull request at all when the reject comes during the push', async () => {
    let key = ''
    const r = rig({
      config: { prEnabled: true },
      agent: pass,
      onCommand: {
        includes: 'push',
        run: () => {
          applyEvent(r.store, key, { type: 'reject', owner: true })
          r.worker.abort(key)
        },
      },
    })
    key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('declined')
    expect(r.commands.some((command) => command.includes('pr create'))).toBe(false)
    expect(listRuns(r.store, key).at(-1)).toMatchObject({ state: 'failed', detail: STOPPED_DETAIL })
  })
})

describe('worker as a build that the agent says passed', () => {
  it('to be failed when the agent made no commit', async () => {
    const r = rig({ agent: pass, noCommit: true })
    const key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)?.detail).toBe('the agent made no commit')
    expect(r.posted.map((message) => message.text)).toStrictEqual(['실패: web-app'])
  })

  it('to be failed when the agent moved to another branch, where nothing would be pushed', async () => {
    const r = rig({ agent: pass, branchNow: 'chore/footer' })
    const key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)?.detail).toBe('the agent left the branch dispatch-a')
  })

  it('to be failed when changes were left uncommitted', async () => {
    const r = rig({ agent: pass, dirty: true })
    const key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)?.detail).toBe('the agent left uncommitted changes in the worktree')
  })

  it('to be delivered without a second push or pull request when an earlier try already opened one', async () => {
    const r = rig({ config: { prEnabled: true }, agent: pass })
    const key = approved(r)
    setPrUrl(r.store, key, PR_URL)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(r.commands.some((command) => command.includes('push') || command.includes('pr create'))).toBe(false)
    expect(JSON.stringify(r.posted[0]?.blocks)).toContain(`<${PR_URL}|PR 열기>`)
  })

  it('to be a pull request body with only the plan and report the owner was shown, and not the thread', async () => {
    const longPlan = Array.from({ length: 400 }, (_, i) => `step ${i}`).join('\n')
    const r = rig({ config: { prEnabled: true }, agent: () => Promise.resolve(ok('Report.\nRESULT: PASS')) })
    const key = approved(r)
    setPlan(r.store, key, longPlan)
    await settle(r)
    const create = r.commands.find((command) => command.startsWith('gh pr create')) ?? ''
    expect(create).toContain('step 0')
    expect(create).toContain('… (이하 생략)')
    expect(create).not.toContain('step 399')
    expect(create).not.toContain('thread text')
  })
})

describe('worker as the money an item may spend', () => {
  function spend(r: Rig, key: string, costUsd: number): void {
    const run = beginRun(r.store, key, 'plan', ADMITTED)
    endRun(r.store, run.id, { type: 'finish', ok: true, valid: true }, { costUsd })
  }

  it('to be a run that gets no more than what is left of the cap', async () => {
    const r = rig()
    const key = item(r.store, 'web-app', TO_PLANNING)
    spend(r, key, 4.5)
    await settle(r)
    expect(r.calls[0]?.maxBudgetUsd).toBe(0.5)
  })

  it('to be a failed item, with no agent run, when less than a run is left', async () => {
    const r = rig()
    const key = item(r.store, 'web-app', TO_PLANNING)
    spend(r, key, 4.9)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(r.calls).toStrictEqual([])
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual([])
  })

  it('to be a retry button only while there are tries and money left', async () => {
    const r = rig({ agent: () => Promise.resolve({ ok: false, text: '', costUsd: 0.1, subtype: 'error_max_turns' }) })
    const key = item(r.store, 'web-app', TO_PLANNING)
    spend(r, key, 4.5)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual(['item.retry:0'])
    spend(r, key, 0.3)
    expect(retriesLeft(r.store, key, CONFIG)).toBe(false)
  })

  it('to be charged its whole budget when a failed run reports no cost', async () => {
    const r = rig({
      agent: () => Promise.resolve({ ok: false, text: 'timed out', costUsd: 0, subtype: 'process_failed' }),
    })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(listRuns(r.store, key)[0]?.costUsd).toBe(1)
    expect(spentOnItem(r.store, key)).toBe(1)
  })

  it('to be charged a part of its budget when the owner stopped it, so a revise loop meets the cap', async () => {
    const r = rig({ agent: hangAgent })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await r.worker.tick()
    await until(() => r.calls.length === 1)
    r.worker.abort(key)
    await r.worker.idle()
    expect(listRuns(r.store, key)[0]).toMatchObject({ detail: STOPPED_DETAIL, costUsd: 0.25 })
  })

  it('to be charged what the agent reported when it had answered before it was stopped', async () => {
    let release: (result: AgentResult) => void = (_result) => undefined
    const r = rig({
      agent: () =>
        new Promise((resolve) => {
          release = resolve
        }),
    })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await r.worker.tick()
    await until(() => r.calls.length === 1)
    r.worker.abort(key)
    release(ok('late plan', 0.6))
    await r.worker.idle()
    expect(listRuns(r.store, key)[0]).toMatchObject({ detail: STOPPED_DETAIL, costUsd: 0.6 })
  })

  it('to be a failure that does not use up the tries when it is a run the owner stopped or a restart called off', () => {
    const r = rig()
    const key = item(r.store, 'web-app', TO_PLANNING)
    for (const detail of [STOPPED_DETAIL, RESTARTED_DETAIL, STOPPED_DETAIL]) {
      const run = beginRun(r.store, key, 'plan', ADMITTED)
      endRun(r.store, run.id, { type: 'cancel' }, { detail })
    }
    expect(retriesLeft(r.store, key, { maxAttempts: 1, maxCostPerItemUsd: 100 })).toBe(true)
  })
})

describe('worker as Slack that cannot be reached for a moment', () => {
  it('to be able to post again after one failed attempt to open the DM channel', async () => {
    const r = rig({ openDmFailures: 1 })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(r.openDmCalls()).toBe(2)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(r.posted.map((message) => message.text)).toStrictEqual(['실패: web-app'])
  })
})

describe('worker as a worktree that cannot be removed', () => {
  it('to be tried again only after a pause, with one log row per try', async () => {
    const r = rig({ failCommand: 'worktree rm' })
    const key = item(r.store, 'web-app', [...TO_PLANNING, { type: 'reject', owner: true }])
    saveWorkspace(r.store, key, { sessionId: 's', path: '/wt/a', branch: 'b', baseRef: 'origin/develop' })
    const failures = (): number =>
      listEvents(r.store, { itemKey: key }).filter((event) => event.type === 'cleanup_failed').length
    await settle(r)
    await settle(r)
    await settle(r)
    expect(failures()).toBe(1)
    clock.now += 5 * 60_000
    await settle(r)
    expect(failures()).toBe(2)
  })
})

describe('worker as the first time an item gets a worktree', () => {
  it('to be commented with the Slack thread it came from', async () => {
    const r = rig()
    item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    const create = r.commands.find((command) => command.includes('worktree create')) ?? ''
    expect(create).toContain('--comment Slack: https://x.test/t')
    expect(create).not.toContain('--reference')
  })
})

const QA_PASSED: QaOutcome = { status: 'passed', reason: '', report: 'Looks right.', shots: 4, costUsd: 0.4 }

describe('worker as the Visual QA between the build and the pull request', () => {
  const withRoutes = (): Promise<AgentResult> =>
    Promise.resolve(ok('Changed it.\nQA-ROUTES: /settings /billing\nRESULT: PASS'))

  it('to be given the spec the build wrote, with its line left out of the report and the pull request', async () => {
    const withSpec = (): Promise<AgentResult> =>
      Promise.resolve(ok('Changed it.\nQA-SPEC: e2e/footer.spec.ts\nRESULT: PASS'))
    const r = rig({ config: { prEnabled: true }, agent: withSpec, qa: () => Promise.resolve(QA_PASSED) })
    approved(r)
    await settle(r)
    expect(r.qaInputs[0]?.spec).toBe('e2e/footer.spec.ts')
    expect(r.commands.find((line) => line.startsWith('gh pr create')) ?? '').not.toContain('QA-SPEC')
    expect(JSON.stringify(r.posted[0]?.blocks)).not.toContain('QA-SPEC')
  })

  it.each(['../outside.spec.ts', '/etc/x.spec.ts', '--config=x.spec.ts', 'run.sh'])(
    'to be no spec for the line QA-SPEC: %s, which would become an argument of a program',
    async (path) => {
      const bad = (): Promise<AgentResult> => Promise.resolve(ok(`Changed it.\nQA-SPEC: ${path}\nRESULT: PASS`))
      const r = rig({ agent: bad, qa: () => Promise.resolve(QA_PASSED) })
      approved(r)
      await settle(r)
      expect(r.qaInputs[0]?.spec).toBeNull()
    },
  )

  it('to be asked after the build, with the pages the build named, the plan, and what is left of the money', async () => {
    const r = rig({ agent: withRoutes, qa: () => Promise.resolve(QA_PASSED) })
    const key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(r.qaInputs).toHaveLength(1)
    expect(r.qaInputs[0]).toMatchObject({
      itemKey: key,
      worktreePath: '/wt/a',
      baseRef: 'origin/develop',
      plan: 'the plan',
      routes: ['/settings', '/billing'],
      budgetUsd: 1,
    })
  })

  it('to be the home page when the build named no page', async () => {
    const r = rig({ agent: pass, qa: () => Promise.resolve(QA_PASSED) })
    approved(r)
    await settle(r)
    expect(r.qaInputs[0]?.routes).toStrictEqual(['/'])
  })

  it('to be given no more than what is left of the item money', async () => {
    const r = rig({ agent: pass, qa: () => Promise.resolve(QA_PASSED) })
    const key = approved(r)
    const run = beginRun(r.store, key, 'plan', ADMITTED)
    endRun(r.store, run.id, { type: 'finish', ok: true, valid: true }, { costUsd: 3.7 })
    await settle(r)
    // 5 allowed, 0.3 + 3.7 spent before, 0.3 for this build.
    expect(r.qaInputs[0]?.budgetUsd).toBeCloseTo(0.7, 5)
  })

  it('to be a pull request card and a run that both carry the result, with the cost of the build and the review together', async () => {
    const r = rig({ config: { prEnabled: true }, agent: withRoutes, qa: () => Promise.resolve(QA_PASSED) })
    const key = approved(r)
    await settle(r)
    expect(JSON.stringify(r.posted[0]?.blocks)).toContain('Visual QA 통과 (스크린샷 4장).')
    const create = r.commands.find((command) => command.startsWith('gh pr create')) ?? ''
    expect(create).toContain('## Visual QA\nVisual QA 통과 (스크린샷 4장).\nLooks right.')
    expect(create).not.toContain('QA-ROUTES')
    expect(listRuns(r.store, key).at(-1)).toMatchObject({ kind: 'build', state: 'succeeded' })
    expect(listRuns(r.store, key).at(-1)?.costUsd).toBeCloseTo(0.7, 5)
  })

  it('to be said as skipped, with the reason, when no screen changed', async () => {
    const r = rig({ agent: pass })
    approved(r)
    await settle(r)
    expect(JSON.stringify(r.posted[0]?.blocks)).toContain('Visual QA 건너뜀: UI 파일 변경 없음.')
  })

  it('to be a failed item with the reviewer reason, and nothing pushed, when the review fails', async () => {
    const failedQa: QaOutcome = {
      status: 'failed',
      reason: '모바일에서 버튼이 겹침',
      report: 'Overlap.',
      shots: 4,
      costUsd: 0.5,
    }
    const r = rig({ config: { prEnabled: true }, agent: pass, qa: () => Promise.resolve(failedQa) })
    const key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)).toMatchObject({
      state: 'failed',
      detail: 'Visual QA 실패: 모바일에서 버튼이 겹침',
    })
    expect(listRuns(r.store, key).at(-1)?.costUsd).toBeCloseTo(0.8, 5)
    expect(r.commands.some((command) => command.includes('push') || command.includes('pr create'))).toBe(false)
    expect(r.posted.map((message) => message.text)).toStrictEqual(['실패: web-app'])
  })

  it('to be not asked when the build failed, or left no commit', async () => {
    const failing = rig({ agent: () => Promise.resolve(ok('RESULT: FAIL tests are red')) })
    approved(failing)
    await settle(failing)
    const noCommit = rig({ agent: pass, noCommit: true })
    approved(noCommit)
    await settle(noCommit)
    expect([failing.qaInputs, noCommit.qaInputs]).toStrictEqual([[], []])
  })

  it('to be stopped with the item when the owner calls it off during the review', async () => {
    let key = ''
    const r = rig({
      agent: pass,
      qa: () => {
        applyEvent(r.store, key, { type: 'reject', owner: true })
        r.worker.abort(key)
        return Promise.reject(new AgentAborted())
      },
    })
    key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('declined')
    expect(listRuns(r.store, key).at(-1)).toMatchObject({ state: 'failed', detail: STOPPED_DETAIL })
    expect(r.posted).toStrictEqual([])
  })

  it('to be a failed item with the message when the review itself breaks', async () => {
    const r = rig({ agent: pass, qa: () => Promise.reject(new Error('browser is missing')) })
    const key = approved(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).at(-1)?.detail).toBe('browser is missing')
  })
})

describe('worker as the packages a new worktree lacks', () => {
  function worktreeWithLock(): string {
    const dir = mkdtempSync(join(tmpdir(), 'slack-dispatch-wt-'))
    temporaryDirs.push(dir)
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    return dir
  }

  it('to be installed before the agent starts, in the worktree', async () => {
    const dir = worktreeWithLock()
    const r = rig({ agent: pass })
    const key = approved(r, 1, dir)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(r.order.filter((line) => line === '<agent>' || line.startsWith('pnpm install')).slice(0, 2)).toStrictEqual([
      'pnpm install --frozen-lockfile --prefer-offline',
      '<agent>',
    ])
  })

  it('to be a failed item, with no agent run, when the install fails', async () => {
    const dir = worktreeWithLock()
    const r = rig({ agent: pass, failCommand: 'pnpm install' })
    const key = approved(r, 1, dir)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(r.calls).toStrictEqual([])
    expect(listRuns(r.store, key).at(-1)?.detail).toContain('pnpm failed with exit code 1')
  })

  it('to be left alone when the worktree has its packages already', async () => {
    const dir = worktreeWithLock()
    mkdirSync(join(dir, 'node_modules'))
    const r = rig({ agent: pass })
    approved(r, 1, dir)
    await settle(r)
    expect(r.commands.some((command) => command.includes('install'))).toBe(false)
  })
})

describe('worker as the owner own claude setup', () => {
  it('to be used by the plan and by the build, with the same session', async () => {
    const r = rig({
      agent: (_call, index) => Promise.resolve(index === 0 ? ok('the plan') : ok('Done.\nRESULT: PASS')),
    })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    applyEvent(r.store, key, { type: 'approve', owner: true, card: 'plan', fresh: true })
    await settle(r)
    expect(r.calls.map((call) => [call.mode, call.ownSetup])).toStrictEqual([
      ['plan', true],
      ['build', true],
    ])
    expect(r.calls[1]).toMatchObject({ resume: true, sessionId: r.calls[0]?.sessionId })
  })

  it('to be left out of the plan and the build when the owner turned it off', async () => {
    const r = rig({
      config: { ownSetup: false },
      agent: (_call, index) => Promise.resolve(index === 0 ? ok('the plan') : ok('Done.\nRESULT: PASS')),
    })
    const key = item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    applyEvent(r.store, key, { type: 'approve', owner: true, card: 'plan', fresh: true })
    await settle(r)
    expect(r.calls.map((call) => call.ownSetup)).toStrictEqual([false, false])
  })
})

const DIGEST_ANALYSIS = {
  request: '푸터 링크 클릭해도 이동 안 함',
  cause: 'footer.tsx의 href 오타',
  plan: 'footer.tsx의 href 수정\n링크 이동 테스트 추가',
  recommend: true,
  why: '작고 분명함',
}

const APPROVE_PLAN: ItemEvent = { type: 'approve', owner: true, card: 'plan', fresh: true }

describe('worker as the model the owner chose in the digest', () => {
  it('to be the model of the plan and of the build, each in its own mode', async () => {
    const r = rig({
      agent: (_call, index) => Promise.resolve(index === 0 ? ok('the plan') : ok('Done.\nRESULT: PASS')),
    })
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, { model: 'sonnet' })
    await settle(r)
    applyEvent(r.store, key, APPROVE_PLAN)
    await settle(r)
    expect(r.calls.map((call) => [call.mode, call.model])).toStrictEqual([
      ['plan', 'sonnet'],
      ['build', 'sonnet'],
    ])
  })

  it('to be plan mode for every model on offer, so a plan never edits files', async () => {
    for (const model of ['opusplan', 'opus', 'sonnet', 'haiku'] as const) {
      const r = rig()
      itemWithMeta(r.store, 'web-app', TO_PLANNING, { model })
      await settle(r)
      expect(r.calls.map((call) => [call.mode, call.model])).toStrictEqual([['plan', model]])
    }
  })

  it('to be opusplan when the owner chose nothing', async () => {
    const r = rig()
    item(r.store, 'web-app', TO_PLANNING)
    await settle(r)
    expect(r.calls[0]?.model).toBe('opusplan')
  })
})

describe('worker as an item the owner builds at once from the plan in the digest', () => {
  const direct: ItemMeta = { direct: true, model: 'haiku', analysis: DIGEST_ANALYSIS }
  // The worktree of `itemWithMeta` is made on a branch named after the item; the agent stays on it.
  const branchNow = worktreeNameFor(itemKeyOf(`${THREAD}7`, 'web-app'))

  it('to be planned without an agent: the digest plan is the plan, the item goes on to implementing', async () => {
    const r = rig()
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    expect(r.calls).toHaveLength(0)
    expect(stageOf(r.store, key)).toBe('implementing')
    expect(getWorkspace(r.store, key)?.plan).toBe(DIGEST_ANALYSIS.plan)
    expect(listRuns(r.store, key).map((run) => [run.kind, run.state, run.costUsd])).toStrictEqual([
      ['plan', 'succeeded', 0],
    ])
  })

  it('to be announced by a card with the plan, where it runs and a button that stops it', async () => {
    const r = rig()
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    expect(r.posted).toHaveLength(1)
    expect(r.posted[0]?.text).toBe('바로 구현 시작: web-app')
    const card = JSON.stringify(r.posted[0]?.blocks)
    expect(card).toContain('footer.tsx의 href 수정')
    expect(card).toContain('작업 위치: ')
    expect(buttonIds(r.posted[0]?.blocks)).toStrictEqual(['item.reject:1'])
    // A reply under it is answered with the progress, like a reply under a plan card.
    expect(cardAt(r.store, `${r.posted[0]?.channel}:1.5`)).toMatchObject({ itemKey: key, kind: 'plan' })
  })

  it('to be built even when the card cannot be posted, with the failure logged', async () => {
    const r = rig({ postFails: true })
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('implementing')
    expect(listEvents(r.store, { itemKey: key }).some((event) => event.type === 'notify_failed')).toBe(true)
  })

  it('to be built next with the plan and what the digest showed, a new session and the chosen model', async () => {
    const r = rig({ branchNow, agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    await settle(r)
    expect(r.calls).toHaveLength(1)
    const call = r.calls[0]
    expect(call).toMatchObject({ mode: 'build', model: 'haiku', resume: false, ownSetup: true })
    expect(call?.sessionId).toBe(getWorkspace(r.store, key)?.sessionId)
    expect(call?.prompt).toContain('exactly this text):\nfooter.tsx의 href 수정\n링크 이동 테스트 추가')
    expect(call?.prompt).toContain(
      '<thread>\n요청사항:\n푸터 링크 클릭해도 이동 안 함\n\n원인:\nfooter.tsx의 href 오타\n</thread>',
    )
    expect(stageOf(r.store, key)).toBe('pr_open')
  })

  it('to be built without reading the Slack thread: what was written after the click must not reach the agent', async () => {
    const r = rig({ branchNow, agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    await settle(r)
    expect(r.threadReads()).toBe(0)
    expect(r.calls[0]?.prompt).not.toContain('thread text')
  })

  it('to be charged nothing when it fails: it started no agent, and the later build has no session to resume', async () => {
    const r = rig({ failCommand: 'worktree create' })
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    expect(listRuns(r.store, key).map((run) => [run.state, run.costUsd])).toStrictEqual([['failed', 0]])
    expect(spentOnItem(r.store, key)).toBe(0)
  })

  it('to be stopped for nothing when the owner stops it while the workspace is made', async () => {
    const holder: { r?: Rig; key?: string } = {}
    const r = rig({
      onCommand: {
        includes: 'worktree create',
        run: () => {
          if (holder.r !== undefined && holder.key !== undefined) holder.r.worker.abort(holder.key)
        },
      },
    })
    holder.r = r
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    holder.key = key
    await settle(r)
    expect(listRuns(r.store, key).map((run) => [run.detail, run.costUsd])).toStrictEqual([[STOPPED_DETAIL, 0]])
    expect(r.calls).toHaveLength(0)
  })

  it('to be told what the last build got wrong when the owner retries, and to continue its session', async () => {
    const r = rig({
      branchNow,
      agent: (_call, index) =>
        Promise.resolve(index === 0 ? ok('Tried.\nRESULT: FAIL lint broke', 0.4) : ok('Done.\nRESULT: PASS')),
    })
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('failed')
    applyEvent(r.store, key, { type: 'retry', owner: true, allowed: true })
    await settle(r)
    await settle(r)
    expect(r.calls).toHaveLength(2)
    expect(r.calls[1]?.prompt).toContain('lint broke')
    expect(r.calls[1]).toMatchObject({ mode: 'build', resume: true })
    expect(stageOf(r.store, key)).toBe('pr_open')
  })

  it('to be left alone when the owner calls the item off while its worktree is made', async () => {
    const holder: { store?: Store; key?: string } = {}
    const r = rig({
      onCommand: {
        includes: 'worktree create',
        run: () => {
          if (holder.store !== undefined && holder.key !== undefined) {
            applyEvent(holder.store, holder.key, { type: 'reject', owner: true })
          }
        },
      },
    })
    holder.store = r.store
    holder.key = itemWithMeta(r.store, 'web-app', TO_PLANNING, direct)
    await settle(r)
    await settle(r)
    expect(stageOf(r.store, holder.key)).toBe('declined')
    expect(r.calls).toHaveLength(0)
  })

  it('to be planned the usual way, in plan mode, when the digest gave no plan for the item', async () => {
    const r = rig()
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, { direct: true })
    await settle(r)
    expect(r.calls.map((call) => call.mode)).toStrictEqual(['plan'])
    expect(stageOf(r.store, key)).toBe('planned')
  })

  it('to be planned the usual way for an item that was not started with build now', async () => {
    const r = rig()
    const key = itemWithMeta(r.store, 'web-app', TO_PLANNING, { direct: false, analysis: DIGEST_ANALYSIS })
    await settle(r)
    expect(r.calls.map((call) => call.mode)).toStrictEqual(['plan'])
    expect(stageOf(r.store, key)).toBe('planned')
  })
})

describe('worker as the live view of a build in Orca', () => {
  it('to be a terminal tab in the worktree, opened after the packages are installed and before the agent starts', async () => {
    const r = rig({ agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    approvedInWorktree(r)
    await settle(r)
    const opening = r.order.findIndex((line) => line.startsWith('orca terminal create'))
    expect(opening).toBeGreaterThanOrEqual(0)
    expect(r.order[opening]).toContain('--worktree path:/wt/a --title 구현 진행 보기 --command for i in')
    expect(opening).toBeLessThan(r.order.indexOf('<agent>'))
    // The owner is working in Orca: the tab opens in the background and never takes the focus.
    expect(r.order[opening]).not.toContain('--focus')
    expect(r.order.filter((line) => line.startsWith('orca terminal create'))).toHaveLength(1)
  })

  it('to be closed when the build is over, so it does not keep refreshing and a retry does not add a second one', async () => {
    const r = rig({ agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    approvedInWorktree(r)
    await settle(r)
    const closing = r.order.findIndex((line) => line.startsWith('orca terminal close'))
    expect(r.order[closing]).toBe(
      'orca terminal close --terminal term_5b70a478-6623-408a-8919-d4eced9eb295 --tab --json',
    )
    expect(closing).toBeGreaterThan(r.order.indexOf('<agent>'))
  })

  it('to be closed also when the build fails, and a failure to close is only logged', async () => {
    const failing = rig({ agent: () => Promise.resolve(ok('RESULT: FAIL tests are red')) })
    approvedInWorktree(failing)
    await settle(failing)
    expect(failing.order.some((line) => line.startsWith('orca terminal close'))).toBe(true)
    const stuck = rig({ failCommand: 'terminal close', agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    const key = approvedInWorktree(stuck)
    await settle(stuck)
    expect(stageOf(stuck.store, key)).toBe('pr_open')
    expect(listEvents(stuck.store, { itemKey: key }).some((event) => event.type === 'live_view_close_failed')).toBe(
      true,
    )
  })

  it('to be only a convenience: a build still passes when the tab cannot be opened, and the failure is logged', async () => {
    const r = rig({ failCommand: 'terminal create', agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    const key = approvedInWorktree(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(listEvents(r.store, { itemKey: key }).some((event) => event.type === 'live_view_failed')).toBe(true)
  })
})

describe('worker as the thread the work came from', () => {
  const MENTION = 'slack:C09ABC:1730000000.000100'

  // An item that was asked for in a channel thread and whose plan was approved.
  function building(r: Rig, threadKey = MENTION): string {
    createItems(r.store, threadKey, ['web-app'], {
      meta: { 'web-app': { summary: 'Fix it', url: 'https://x.test/t' } },
    })
    const key = itemKeyOf(threadKey, 'web-app')
    for (const event of TO_IMPLEMENTING) applyEvent(r.store, key, event)
    saveWorkspace(r.store, key, {
      sessionId: '11111111-1111-4111-8111-111111111111',
      path: '/wt/a',
      branch: 'dispatch-a',
      baseRef: 'origin/develop',
    })
    setPlan(r.store, key, 'the plan')
    return key
  }

  const pass = (): Promise<AgentResult> => Promise.resolve(ok('Secret-looking report text.\nRESULT: PASS'))

  it('to be told, in that thread, that the work is done with the link of the pull request', async () => {
    const r = rig({ config: { prEnabled: true }, agent: pass })
    building(r)
    await settle(r)
    expect(r.posted.map((message) => [message.channel, message.threadTs, message.text])).toStrictEqual([
      ['D1', undefined, 'PR 준비됨: web-app'],
      ['C09ABC', '1730000000.000100', `구현을 마쳤어요. PR: ${PR_URL}`],
    ])
  })

  it('to be only fixed words and the address: nothing the agent wrote goes into a thread others may read', async () => {
    const r = rig({ config: { prEnabled: true }, agent: pass })
    building(r)
    await settle(r)
    expect(r.posted[1]?.text).not.toContain('Secret')
    expect(r.posted[1]?.blocks).toBeUndefined()
  })

  it('to be the DM message the owner typed when the request came from a DM', async () => {
    const r = rig({ config: { prEnabled: true }, agent: pass })
    building(r, 'dm:D7:1730000000.000200')
    await settle(r)
    expect(r.posted[1]).toMatchObject({ channel: 'D7', threadTs: '1730000000.000200' })
  })

  it('to be no reply when nothing was pushed, because there is no pull request to point to', async () => {
    const r = rig({ agent: pass })
    building(r)
    await settle(r)
    expect(r.posted.map((message) => message.text)).toStrictEqual(['구현 완료: web-app'])
  })

  it('to be told to the owner, with the build kept, when the thread cannot be written in', async () => {
    const r = rig({ config: { prEnabled: true }, failChannel: 'C09ABC', agent: pass })
    const key = building(r)
    await settle(r)
    expect(stageOf(r.store, key)).toBe('pr_open')
    expect(r.posted.map((message) => message.text)).toStrictEqual([
      'PR 준비됨: web-app',
      '원본 쓰레드에 완료 댓글을 달지 못했어요: not_in_channel',
    ])
    expect(listEvents(r.store, { itemKey: key }).some((event) => event.type === 'thread_reply_failed')).toBe(true)
  })

  it('to be no reply when the stored address could carry markup into the thread', async () => {
    const r = rig({ config: { prEnabled: true }, agent: pass })
    const key = building(r)
    // An address from an earlier try, kept in the workspace: it is used as it is, so it is checked before it is posted.
    setPrUrl(r.store, key, 'https://github.com/acme/web-app/pull/7|<!channel>')
    await settle(r)
    expect(r.posted.map((message) => message.channel)).toStrictEqual(['D1'])
  })

  it('to be no reply for a thread key that names no Slack thread', async () => {
    const r = rig({ config: { prEnabled: true }, agent: pass })
    building(r, 'cli:somewhere')
    await settle(r)
    expect(r.posted.map((message) => message.text)).toStrictEqual(['PR 준비됨: web-app'])
  })
})

describe('worker as the commit a build is told its branch started from', () => {
  const START = '00bae28a9c1d2e3f4a5b6c7d8e9f001122334455'

  it('to be the merge base of the branch and its base, so a script that tests what changed does not run every test', async () => {
    const r = rig({ mergeBase: START, agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    approvedInWorktree(r)
    await settle(r)
    expect(r.commands).toContain('git -C /wt/a merge-base HEAD origin/develop')
    expect(r.calls[0]?.prompt).toContain(`pass ${START}, the commit this branch started from`)
  })

  it('to be left out of the prompt, and logged, when git cannot tell', async () => {
    const r = rig({ failCommand: 'merge-base', agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    const key = approvedInWorktree(r)
    await settle(r)
    expect(r.calls[0]?.prompt).not.toContain('the commit this branch started from')
    expect(listEvents(r.store, { itemKey: key }).some((event) => event.type === 'base_commit_unknown')).toBe(true)
  })

  it.each(['', 'not-a-commit', '--upload-pack=x'])('to be left out of the prompt for the answer %j', async (answer) => {
    const r = rig({ mergeBase: answer, agent: () => Promise.resolve(ok('Done.\nRESULT: PASS')) })
    approvedInWorktree(r)
    await settle(r)
    expect(r.calls[0]?.prompt).not.toContain('the commit this branch started from')
  })
})
