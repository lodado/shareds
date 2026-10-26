// The part that does the work. Each tick looks at the store: an item in `planning` gets a plan, an item in
// `implementing` gets built, and a finished or declined item gets its worktree cleaned up. What to start, how much
// it may cost, whether a plan is still current and whether a build left a commit are all decided by code; the agent
// only writes the plan and the change, and its own report is taken as its word. Items run in parallel, within the
// caps.

import type { Agent, AgentModel, AgentResult } from '../agent/claude.ts'
import type { BuildInput } from '../agent/prompts.ts'
import type { DigestMessage } from '../digest/digest.ts'
import type { Run } from '../exec/exec.ts'
import type { PrState } from '../github/github.ts'
import type { QaOutcome, RunQa } from '../qa/qa.ts'
import type { SlackClient } from '../slack/client.ts'
import type { ItemRow, Store } from '../store/store.ts'
import type { WorkspaceRow } from '../store/work.ts'
import { AgentAborted, DEFAULT_MODEL } from '../agent/claude.ts'
import {
  buildPrompt,
  parseBuildResult,
  parseQaRoutes,
  parseQaSpec,
  planPrompt,
  replanPrompt,
  revisePrompt,
} from '../agent/prompts.ts'
import {
  buildDirectStartCard,
  buildFailedCard,
  buildPlanCard,
  buildPrCard,
  shownPlan,
  shownReport,
} from '../cards/cards.ts'
import { openPr, pushBranch } from '../github/github.ts'
import {
  closeLiveView,
  commitProblem,
  createWorktree,
  installDependencies,
  openLiveView,
  removeWorktree,
  resolveBaseBranch,
  setWorkspaceStatus,
  statusForStage,
  worktreeNameFor,
} from '../orca/worktree.ts'
import { clip, escapeMrkdwn } from '../slack/blocks.ts'
import { redact } from '../store/redact.ts'
import { applyEvent, getItem, issueCard, listItems, logEvent } from '../store/store.ts'
import {
  beginRun,
  cleanupKeys,
  countActiveRuns,
  endRun,
  getWorkspace,
  listRuns,
  pendingInstruction,
  RESTARTED_DETAIL,
  saveWorkspace,
  setCardSlackRef,
  setPlan,
  setPrUrl,
  spentOnItem,
  STOPPED_DETAIL,
} from '../store/work.ts'

export interface WorkerConfig {
  maxTotal: number
  maxPerRepo: number
  // Money one item may spend over all its runs. A run gets at most what is left of it.
  maxCostPerItemUsd: number
  planBudgetUsd: number
  buildBudgetUsd: number
  // At most what Visual QA may spend on one item.
  qaBudgetUsd: number
  planTimeoutMs: number
  buildTimeoutMs: number
  // Failed runs an item may have before the owner can no longer retry it.
  maxAttempts: number
  // Whether a finished build is pushed and opened as a pull request. Off: the work stays a local commit.
  prEnabled: boolean
  // Whether the plan and the build run with the owner's own claude setup (skills, CLAUDE.md, plugins, hooks, MCP).
  ownSetup: boolean
  // Per-repo base branch, for a repo that does not branch from develop, main or master.
  baseOverrides: Readonly<Record<string, string>>
}

export interface WorkerDeps {
  store: Store
  // Starts orca, git and gh.
  run: Run
  agent: Agent
  slack: Pick<SlackClient, 'openDm' | 'postMessage'>
  ownerId: string
  config: WorkerConfig
  // Where the repo lives on this machine, or undefined when Orca does not know it.
  repoPath: (repo: string) => Promise<string | undefined>
  // The text of the thread an item came from, cleaned; empty for a DM item.
  loadThread: (item: ItemRow) => Promise<string>
  newSessionId: () => string
  // Looks at the pages a build changed before its pull request is opened.
  qa: RunQa
  // Milliseconds since the epoch, for the pause between two tries to clean up.
  now: () => number
  // Where a pull request stands on the host; it can be merged or closed there without this service.
  prState: (prUrl: string) => Promise<PrState>
}

export interface Worker {
  // Starts what can start now. Returns once the jobs are launched, not when they are done.
  tick: () => Promise<void>
  // Stops the agent working on the item, if any.
  abort: (itemKey: string) => void
  // Resolves when no job is running.
  idle: () => Promise<void>
  stop: () => void
}

// A run below this is not worth starting: claude would stop before it did anything.
const MIN_RUN_BUDGET_USD = 0.25
// What a run the owner stopped is charged, as a part of its budget: what it cost is unknown, and a revise loop must
// still run into the spending cap.
const STOPPED_CHARGE = 0.25
const CLEANUP_RETRY_MS = 5 * 60_000
// How often an open pull request is asked about. Only the items waiting in pr_open are, so this stays a few calls.
const PR_CHECK_MS = 10 * 60_000
const BRANCH_PREFIX = /^origin\//
const TITLE_LENGTH = 70
const REASON_LENGTH = 500

type Kind = 'plan' | 'build'

// Everything a running job needs to know about itself.
interface RunInfo {
  item: ItemRow
  kind: Kind
  runId: number
  budget: number
  signal: AbortSignal
  // Set as soon as the agent has answered, so every way out of the job charges what the run really cost.
  costUsd?: number
  // A run that starts no agent and so cannot cost anything: even its failure is charged nothing.
  free?: boolean
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const isRealFailure = (run: { state: string; detail: string }): boolean =>
  run.state === 'failed' && run.detail !== STOPPED_DETAIL && run.detail !== RESTARTED_DETAIL

const remainingBudget = (store: Store, itemKey: string, config: WorkerConfig): number =>
  config.maxCostPerItemUsd - spentOnItem(store, itemKey)

// A retry needs a failed item to have tries left and enough money left for a run to start.
export function retriesLeft(
  store: Store,
  itemKey: string,
  config: Pick<WorkerConfig, 'maxAttempts' | 'maxCostPerItemUsd'>,
): boolean {
  const failed = listRuns(store, itemKey).filter(isRealFailure)
  const remaining = config.maxCostPerItemUsd - spentOnItem(store, itemKey)
  return failed.length < config.maxAttempts && remaining >= MIN_RUN_BUDGET_USD
}

// What went wrong since the last plan that worked: the failure a new plan or build has to avoid. Older failures and
// runs the owner stopped are not shown to an agent.
function lastFailure(store: Store, itemKey: string): string {
  const runs = listRuns(store, itemKey)
  const lastPlan = runs.findLast((run) => run.kind === 'plan' && run.state === 'succeeded')
  const since = runs.filter((run) => run.id > (lastPlan?.id ?? 0) && isRealFailure(run))
  return since.at(-1)?.detail ?? ''
}

// What went wrong in the last build of an item that builds the plan from the digest. Such an item has no plan step that
// takes the failure in, so the next build is told directly.
function lastBuildFailure(store: Store, itemKey: string): string {
  const failed = listRuns(store, itemKey).filter((run) => run.kind === 'build' && isRealFailure(run))
  return failed.at(-1)?.detail ?? ''
}

const modelOf = (item: ItemRow): AgentModel => item.meta.model ?? DEFAULT_MODEL

// The owner started the item with "build now": the plan is the one the owner typed, or else the one the digest showed.
const digestPlanOf = (item: ItemRow): string | undefined =>
  item.meta.direct === true ? (item.meta.ownPlan ?? item.meta.analysis?.plan) : undefined

// A session exists once an earlier run of the item was billed; before that there is nothing to resume. The runner
// switches by itself if the session on disk says otherwise.
const sessionStarted = (store: Store, itemKey: string): boolean =>
  listRuns(store, itemKey).some((run) => run.costUsd > 0)

interface Job {
  controller: AbortController
  done: Promise<void>
}

interface Ctx {
  deps: WorkerDeps
  jobs: Map<string, Job>
  channel: () => Promise<string>
  // When an item whose worktree could not be removed may be tried again.
  cleanupRetryAt: Map<string, number>
  // When an item with an open pull request may be asked about next.
  prCheckAt: Map<string, number>
}

async function post(ctx: Ctx, message: DigestMessage): Promise<string> {
  const channel = await ctx.channel()
  const sent = await ctx.deps.slack.postMessage({ channel, text: message.text, blocks: message.blocks })
  return `${sent.channel}:${sent.ts}`
}

// Keeps Orca's board in step with the item. The board is a convenience, so a failure is logged and nothing more.
async function syncBoard(ctx: Ctx, itemKey: string): Promise<void> {
  const item = getItem(ctx.deps.store, itemKey)
  const workspace = getWorkspace(ctx.deps.store, itemKey)
  const status = item === undefined ? undefined : statusForStage(item.stage)
  if (workspace === undefined || status === undefined) return
  try {
    await setWorkspaceStatus(ctx.deps.run, workspace.path, status)
  } catch (error) {
    logEvent(ctx.deps.store, {
      itemKey,
      kind: 'system',
      type: 'board_sync_failed',
      payload: { error: errorText(error) },
    })
  }
}

async function ensureWorkspace(ctx: Ctx, item: ItemRow): Promise<WorkspaceRow> {
  const { store, run, config } = ctx.deps
  const existing = getWorkspace(store, item.key)
  if (existing !== undefined) return existing
  const repoPath = await ctx.deps.repoPath(item.repo)
  if (repoPath === undefined) throw new Error(`the repo ${item.repo} is not registered in Orca`)
  const baseRef = await resolveBaseBranch(run, repoPath, config.baseOverrides[item.repo])
  const url = item.meta.url ?? ''
  const worktree = await createWorktree(run, {
    repoPath,
    name: worktreeNameFor(item.key),
    baseRef,
    comment: url === '' ? undefined : `Slack: ${url}`,
  })
  return saveWorkspace(store, item.key, {
    sessionId: ctx.deps.newSessionId(),
    path: worktree.path,
    branch: worktree.branch,
    baseRef,
  })
}

// Tells the owner an item failed. The item is already marked failed, so a Slack outage only costs the message.
async function tellFailed(ctx: Ctx, item: ItemRow, reason: string): Promise<void> {
  const { store, config } = ctx.deps
  const card = buildFailedCard({
    itemKey: item.key,
    repo: item.repo,
    reason: clip(reason, REASON_LENGTH),
    canRetry: retriesLeft(store, item.key, config),
  })
  try {
    await post(ctx, card)
  } catch (error) {
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'notify_failed', payload: { error: errorText(error) } })
  }
}

async function failItem(ctx: Ctx, itemKey: string, reason: string): Promise<void> {
  const { store } = ctx.deps
  const item = getItem(store, itemKey)
  if (item === undefined) return
  // A plan that cannot be made is called off; a build that cannot be finished reports that it did not succeed.
  const event = item.stage === 'planning' ? ({ type: 'abort' } as const) : ({ type: 'built', ok: false } as const)
  applyEvent(store, itemKey, event)
  await tellFailed(ctx, item, reason)
}

// Ends the run as failed and fails the item. A run that cost nothing the agent reported (a timeout, a crash) is
// charged its whole budget, because what it spent is unknown.
function chargedFor(info: RunInfo, result: AgentResult | undefined): number {
  if (info.free === true) return 0
  const known = result?.costUsd ?? info.costUsd ?? 0
  return known > 0 ? known : info.budget
}

async function failRun(ctx: Ctx, info: RunInfo, result: AgentResult | undefined, reason: string): Promise<void> {
  const costUsd = chargedFor(info, result)
  endRun(ctx.deps.store, info.runId, { type: 'finish', ok: false, valid: true }, { costUsd, detail: reason })
  await failItem(ctx, info.item.key, reason)
}

// The prompt for a plan: the first plan, one that answers the owner's requests, or one that avoids the last failure.
function planText(ctx: Ctx, item: ItemRow, workspace: WorkspaceRow, thread: string): string {
  const { store } = ctx.deps
  const asked = pendingInstruction(store, item.key)
  if (asked !== undefined) return revisePrompt(asked.text, thread)
  if (workspace.plan !== '') return replanPrompt(thread, lastFailure(store, item.key))
  return planPrompt({
    repo: item.repo,
    base: workspace.baseRef,
    thread,
    task: item.task,
    ownPlan: item.meta.ownPlan ?? '',
  })
}

async function finishPlan(ctx: Ctx, info: RunInfo, result: AgentResult, answeredRequest: number): Promise<void> {
  const { store } = ctx.deps
  const { item, signal } = info
  // The plan answers an older request when the owner stopped it or asked for another change while it was written.
  const outdated = (): boolean => signal.aborted || (pendingInstruction(store, item.key)?.id ?? 0) !== answeredRequest
  if (outdated()) {
    endRun(store, info.runId, { type: 'cancel' }, { costUsd: result.costUsd, detail: STOPPED_DETAIL })
    return
  }
  setPlan(store, item.key, result.text)
  endRun(store, info.runId, { type: 'finish', ok: true, valid: true }, { costUsd: result.costUsd, detail: 'planned' })
  const cardId = issueCard(store, item.key, 'plan')
  const ref = await post(
    ctx,
    buildPlanCard({ itemKey: item.key, cardId, repo: item.repo, plan: result.text, threadUrl: item.meta.url ?? '' }),
  )
  setCardSlackRef(store, cardId, ref)
  // Posting took time. If a request came meanwhile the machine refuses this plan as stale and the item plans again.
  applyEvent(store, item.key, { type: 'plan_ready', current: !outdated() })
  await syncBoard(ctx, item.key)
}

// The plan the owner approved from the digest is the plan: no agent writes another, and the item goes straight on to its
// build. Nothing is billed, so a stop costs nothing either.
async function directPlanJob(ctx: Ctx, info: RunInfo, plan: string): Promise<void> {
  const { store } = ctx.deps
  const { item } = info
  info.costUsd = 0
  info.free = true
  const workspace = await ensureWorkspace(ctx, item)
  if (info.signal.aborted) throw new AgentAborted()
  setPlan(store, item.key, plan)
  endRun(store, info.runId, { type: 'finish', ok: true, valid: true }, { costUsd: 0, detail: 'plan from the digest' })
  applyEvent(store, item.key, { type: 'plan_ready', current: true })
  const started = applyEvent(store, item.key, { type: 'approve', owner: true, card: 'plan', fresh: true })
  // The owner may have called the item off while the workspace was made: the machine refused both events.
  if (started.outcome.kind !== 'moved') return
  await announceDirectStart(ctx, item, workspace, plan)
  await syncBoard(ctx, item.key)
}

// The card of a build that starts at once: the plan, where it runs, and the button that stops it. Replies under it
// answer with the progress, like under a plan card. Only a convenience for the owner, so a Slack outage is logged.
async function announceDirectStart(ctx: Ctx, item: ItemRow, workspace: WorkspaceRow, plan: string): Promise<void> {
  const { store } = ctx.deps
  const cardId = issueCard(store, item.key, 'plan')
  try {
    const ref = await post(
      ctx,
      buildDirectStartCard({
        itemKey: item.key,
        cardId,
        repo: item.repo,
        plan,
        threadUrl: item.meta.url ?? '',
        path: workspace.path,
        branch: workspace.branch,
      }),
    )
    setCardSlackRef(store, cardId, ref)
  } catch (error) {
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'notify_failed', payload: { error: errorText(error) } })
  }
}

async function planJob(ctx: Ctx, info: RunInfo): Promise<void> {
  const { store, agent, config } = ctx.deps
  const { item } = info
  const digestPlan = digestPlanOf(item)
  if (digestPlan !== undefined) {
    await directPlanJob(ctx, info, digestPlan)
    return
  }
  const workspace = await ensureWorkspace(ctx, item)
  const thread = await ctx.deps.loadThread(item)
  const answeredRequest = pendingInstruction(store, item.key)?.id ?? 0
  const result = await agent({
    cwd: workspace.path,
    prompt: planText(ctx, item, workspace, thread),
    sessionId: workspace.sessionId,
    resume: sessionStarted(store, item.key),
    mode: 'plan',
    model: modelOf(item),
    maxBudgetUsd: info.budget,
    timeoutMs: config.planTimeoutMs,
    signal: info.signal,
    ownSetup: config.ownSetup,
  })
  info.costUsd = result.costUsd
  if (!result.ok || result.text.trim() === '') {
    const reason = result.ok ? 'the agent made no plan' : `the agent stopped (${result.subtype}) ${result.text}`.trim()
    await failRun(ctx, info, result, reason)
    return
  }
  await finishPlan(ctx, info, result, answeredRequest)
}

function sourceLine(item: ItemRow): string {
  const url = item.meta.url ?? ''
  return url === '' ? '' : `Requested in Slack: ${url}\n\n`
}

interface QaNote {
  // One line for the card and the pull request.
  line: string
  // The reviewer's report, empty when QA was skipped.
  detail: string
}

function qaNote(qa: Exclude<QaOutcome, { status: 'failed' }>): QaNote {
  if (qa.status === 'skipped') return { line: `Visual QA 건너뜀: ${qa.reason}.`, detail: '' }
  return { line: `Visual QA 통과 (스크린샷 ${qa.shots}장).`, detail: qa.report }
}

// Only what the owner was shown in Slack goes into the pull request, so a long plan cannot publish a tail nobody read.
function prBody(item: ItemRow, workspace: WorkspaceRow, report: string, qa: QaNote): string {
  const review = qa.detail === '' ? '' : `\n${shownReport(qa.detail)}`
  return `${sourceLine(item)}## Plan\n${shownPlan(workspace.plan)}\n\n## Report\n${shownReport(
    report,
  )}\n\n## Visual QA\n${qa.line}${review}`
}

// The item must still be waiting for its build, and the owner must not have stopped it; checked again before each
// step that cannot be undone.
function assertActive(ctx: Ctx, info: RunInfo): void {
  const stage = getItem(ctx.deps.store, info.item.key)?.stage
  if (info.signal.aborted || stage !== 'implementing') throw new AgentAborted()
}

// Pushes the branch and opens the pull request, when the worker is allowed to. Otherwise the commit stays local.
async function deliver(
  ctx: Ctx,
  info: RunInfo,
  workspace: WorkspaceRow,
  report: string,
  qa: QaNote,
): Promise<string | null> {
  const { store, run, config } = ctx.deps
  if (!config.prEnabled) return null
  // An earlier try got as far as opening the pull request.
  if (workspace.prUrl !== null) return workspace.prUrl
  assertActive(ctx, info)
  await pushBranch(run, workspace.path, workspace.branch)
  assertActive(ctx, info)
  const url = await openPr(run, {
    worktreePath: workspace.path,
    base: workspace.baseRef.replace(BRANCH_PREFIX, ''),
    head: workspace.branch,
    title: `[slack] ${clip(info.item.meta.summary ?? info.item.repo, TITLE_LENGTH)}`,
    body: prBody(info.item, workspace, report, qa),
  })
  setPrUrl(store, info.item.key, url)
  return url
}

// `slack:<channel>:<thread>` is a mention in a channel and `dm:<channel>:<message>` a request typed to the bot; both
// name the thread the owner wrote in.
const ORIGIN_THREAD = /^(?:slack|dm):([A-Z0-9]+):(\d+\.\d+)$/

const urlIsSafeToPost = (url: string): boolean => /^https:\/\/[^\s<>|]+$/.test(url)

// Says in the thread the work came from that it is done, with the link of the pull request. Only fixed words and the
// address are sent: that thread may be read by other people, so nothing the agent wrote goes there. A failure is
// logged and told to the owner, because the bot may not be allowed to write in that channel.
async function replyInOrigin(ctx: Ctx, item: ItemRow, prUrl: string | null): Promise<void> {
  if (prUrl === null || !urlIsSafeToPost(prUrl)) return
  const match = ORIGIN_THREAD.exec(item.threadKey)
  const channel = match?.[1]
  const threadTs = match?.[2]
  if (channel === undefined || threadTs === undefined) return
  const { store, slack } = ctx.deps
  try {
    await slack.postMessage({ channel, text: `구현을 마쳤어요. PR: ${prUrl}`, threadTs })
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'thread_reply_sent', payload: { channel, threadTs } })
  } catch (error) {
    logEvent(store, {
      itemKey: item.key,
      kind: 'system',
      type: 'thread_reply_failed',
      payload: { error: errorText(error) },
    })
    await notifyOwner(
      ctx,
      item,
      `원본 쓰레드에 완료 댓글을 달지 못했어요: ${escapeMrkdwn(clip(redact(errorText(error)), REASON_LENGTH))}`,
    )
  }
}

// A plain message to the owner, for what is not a card. A Slack outage only costs the message.
async function notifyOwner(ctx: Ctx, item: ItemRow, text: string): Promise<void> {
  const { store, slack } = ctx.deps
  try {
    await slack.postMessage({ channel: await ctx.channel(), text })
  } catch (error) {
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'notify_failed', payload: { error: errorText(error) } })
  }
}

async function finishBuild(ctx: Ctx, info: RunInfo, result: AgentResult, report: string, qa: QaNote): Promise<void> {
  const { store } = ctx.deps
  const { item } = info
  const workspace = getWorkspace(store, item.key)
  if (workspace === undefined) throw new Error(`item ${item.key} has no workspace`)
  assertActive(ctx, info)
  const prUrl = await deliver(ctx, info, workspace, report, qa)
  endRun(
    store,
    info.runId,
    { type: 'finish', ok: true, valid: true },
    { costUsd: info.costUsd ?? result.costUsd, detail: 'built' },
  )
  const applied = applyEvent(store, item.key, { type: 'built', ok: true })
  if (applied.outcome.kind !== 'moved') {
    // The owner called the item off while the pull request was being opened; nothing is announced for it.
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'built_after_stop', payload: { prUrl: prUrl ?? '' } })
    return
  }
  await syncBoard(ctx, item.key)
  try {
    await post(ctx, buildPrCard({ itemKey: item.key, repo: item.repo, prUrl, report, qa: qa.line }))
  } catch (error) {
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'notify_failed', payload: { error: errorText(error) } })
  }
  await replyInOrigin(ctx, item, prUrl)
}

// Visual QA of what the build changed, before anything is pushed. It gets what is left of the item's money.
function checkVisually(
  ctx: Ctx,
  info: RunInfo,
  workspace: WorkspaceRow,
  result: AgentResult,
  asked: { routes: readonly string[]; spec: string | null },
): Promise<QaOutcome> {
  const { store, config } = ctx.deps
  const left = config.maxCostPerItemUsd - spentOnItem(store, info.item.key) - result.costUsd
  return ctx.deps.qa({
    itemKey: info.item.key,
    worktreePath: workspace.path,
    baseRef: workspace.baseRef,
    plan: workspace.plan,
    routes: asked.routes.length > 0 ? asked.routes : ['/'],
    spec: asked.spec,
    budgetUsd: Math.min(config.qaBudgetUsd, left),
    signal: info.signal,
  })
}

const COMMIT_ID = /^[0-9a-f]{7,40}$/

// The commit the branch started from. A script of the repository that tests only what changed against a base is given
// this one: the remote branch may have moved, and a base that differs from the branch makes such a script run every
// test. A hint for the agent, so failing to find it is logged and nothing more.
async function startingCommit(ctx: Ctx, itemKey: string, workspace: WorkspaceRow): Promise<string | undefined> {
  try {
    const { stdout } = await ctx.deps.run('git', ['-C', workspace.path, 'merge-base', 'HEAD', workspace.baseRef])
    const commit = stdout.trim()
    if (COMMIT_ID.test(commit)) return commit
    throw new Error('git merge-base printed no commit')
  } catch (error) {
    logEvent(ctx.deps.store, {
      itemKey,
      kind: 'system',
      type: 'base_commit_unknown',
      payload: { error: errorText(error) },
    })
    return undefined
  }
}

// What the owner read next to the plan in the digest. Not the Slack thread: anything written there after the owner's click
// must not reach the agent, and the thread is read again at every try.
function digestContextOf(item: ItemRow): string {
  const analysis = item.meta.analysis
  if (analysis === undefined) return ''
  return `요청사항:\n${analysis.request}\n\n원인:\n${analysis.cause}`
}

// A build that continues the plan's session has the plan and the thread already. One that follows the digest's plan has
// no session yet, so it gets the plan and the thread in its prompt.
async function buildInput(ctx: Ctx, item: ItemRow, workspace: WorkspaceRow): Promise<BuildInput> {
  const { store } = ctx.deps
  const base = await startingCommit(ctx, item.key, workspace)
  const common = { branch: workspace.branch, ...(base === undefined ? {} : { base }) }
  if (digestPlanOf(item) === undefined) {
    return { ...common, lastFailure: lastFailure(store, item.key) }
  }
  return {
    ...common,
    lastFailure: lastBuildFailure(store, item.key),
    direct: { plan: workspace.plan, context: digestContextOf(item) },
  }
}

// A terminal tab in Orca that shows what the build changes. Only a convenience, so a failure is logged and nothing more.
async function showLive(ctx: Ctx, itemKey: string, path: string): Promise<string | undefined> {
  try {
    return await openLiveView(ctx.deps.run, path)
  } catch (error) {
    logEvent(ctx.deps.store, {
      itemKey,
      kind: 'system',
      type: 'live_view_failed',
      payload: { error: errorText(error) },
    })
    return undefined
  }
}

// The tab is closed when the build is over: left open it would keep refreshing, and a retry would add a second one.
async function hideLive(ctx: Ctx, itemKey: string, handle: string | undefined): Promise<void> {
  if (handle === undefined) return
  try {
    await closeLiveView(ctx.deps.run, handle)
  } catch (error) {
    logEvent(ctx.deps.store, {
      itemKey,
      kind: 'system',
      type: 'live_view_close_failed',
      payload: { error: errorText(error) },
    })
  }
}

async function buildAndDeliver(ctx: Ctx, info: RunInfo, workspace: WorkspaceRow): Promise<void> {
  const { store, run, agent, config } = ctx.deps
  const { item } = info
  const result = await agent({
    cwd: workspace.path,
    prompt: buildPrompt(await buildInput(ctx, item, workspace)),
    sessionId: workspace.sessionId,
    resume: sessionStarted(store, item.key),
    mode: 'build',
    model: modelOf(item),
    maxBudgetUsd: info.budget,
    timeoutMs: config.buildTimeoutMs,
    signal: info.signal,
    ownSetup: config.ownSetup,
  })
  info.costUsd = result.costUsd
  const verdict = parseBuildResult(result.text)
  if (!result.ok || !verdict.ok) {
    await failRun(ctx, info, result, result.ok ? verdict.reason : `the agent stopped (${result.subtype})`)
    return
  }
  // The report is the agent's word. What code can check is that it really left a commit and a clean tree.
  const problem = await commitProblem(run, workspace.path, workspace.baseRef, workspace.branch)
  if (problem !== undefined) {
    await failRun(ctx, info, result, problem)
    return
  }
  const asked = parseQaRoutes(verdict.report)
  const spec = parseQaSpec(asked.report)
  const qa = await checkVisually(ctx, info, workspace, result, { routes: asked.routes, spec: spec.spec })
  info.costUsd = result.costUsd + qa.costUsd
  if (qa.status === 'failed') {
    await failRun(ctx, info, undefined, `Visual QA 실패: ${qa.reason}`)
    return
  }
  try {
    await finishBuild(ctx, info, result, spec.report, qaNote(qa))
  } catch (error) {
    if (error instanceof AgentAborted) throw error
    // The build passed but the push or the pull request did not; the commit is still in the worktree.
    await failRun(ctx, info, undefined, errorText(error))
  }
}

async function buildJob(ctx: Ctx, info: RunInfo): Promise<void> {
  const { store, run } = ctx.deps
  const { item } = info
  const workspace = getWorkspace(store, item.key)
  if (workspace === undefined) throw new Error(`item ${item.key} has no workspace`)
  // The worktree has the repository's files but not its installed packages; the build and the QA both need them.
  await installDependencies(run, workspace.path, info.signal)
  const live = await showLive(ctx, item.key, workspace.path)
  try {
    await buildAndDeliver(ctx, info, workspace)
  } finally {
    await hideLive(ctx, item.key, live)
  }
}

async function runJob(ctx: Ctx, info: RunInfo): Promise<void> {
  const { store } = ctx.deps
  try {
    await (info.kind === 'plan' ? planJob(ctx, info) : buildJob(ctx, info))
  } catch (error) {
    if (error instanceof AgentAborted) {
      const costUsd = info.costUsd ?? info.budget * STOPPED_CHARGE
      endRun(store, info.runId, { type: 'cancel' }, { costUsd, detail: STOPPED_DETAIL })
      return
    }
    await failRun(ctx, info, undefined, errorText(error))
  }
}

function hasRoom(ctx: Ctx, repo: string): boolean {
  const { store, config } = ctx.deps
  return countActiveRuns(store) < config.maxTotal && countActiveRuns(store, repo) < config.maxPerRepo
}

function launch(ctx: Ctx, item: ItemRow, kind: Kind, budget: number): void {
  const { store } = ctx.deps
  const run = beginRun(store, item.key, kind, { registered: true, allowed: true, valid: true })
  if (run.state !== 'running') return
  const controller = new AbortController()
  const info: RunInfo = { item, kind, runId: run.id, budget, signal: controller.signal }
  const done = runJob(ctx, info)
    .catch((error: unknown) => {
      // A job that crashed must not keep its slot: the run is called off, and the item stays where it was.
      logEvent(store, { itemKey: item.key, kind: 'system', type: 'job_crashed', payload: { error: errorText(error) } })
      endRun(store, run.id, { type: 'cancel' }, { costUsd: info.costUsd ?? budget, detail: 'the job crashed' })
    })
    .finally(() => {
      ctx.jobs.delete(item.key)
    })
  ctx.jobs.set(item.key, { controller, done })
}

async function startOne(ctx: Ctx, item: ItemRow, kind: Kind): Promise<void> {
  const { store, config } = ctx.deps
  const remaining = remainingBudget(store, item.key, config)
  if (remaining < MIN_RUN_BUDGET_USD) {
    await failItem(ctx, item.key, `비용 상한($${config.maxCostPerItemUsd})에 거의 다 왔어요.`)
    return
  }
  if (!hasRoom(ctx, item.repo)) return
  launch(ctx, item, kind, Math.min(kind === 'plan' ? config.planBudgetUsd : config.buildBudgetUsd, remaining))
}

async function startReady(ctx: Ctx, stage: 'planning' | 'implementing'): Promise<void> {
  for (const item of listItems(ctx.deps.store, { stage })) {
    if (!ctx.jobs.has(item.key)) await startOne(ctx, item, stage === 'planning' ? 'plan' : 'build')
  }
}

// What the host says about the pull request of an item that waits in pr_open. A merge made there (or a close) is the
// fact, so the item follows it: merged items and closed ones are cleaned up like any other. Asked about every ten
// minutes per item, and a failed question is only logged and asked again later.
async function checkPullRequest(ctx: Ctx, item: ItemRow, prUrl: string): Promise<void> {
  const { store } = ctx.deps
  let state: PrState
  try {
    state = await ctx.deps.prState(prUrl)
  } catch (error) {
    logEvent(store, {
      itemKey: item.key,
      kind: 'system',
      type: 'pr_state_failed',
      payload: { error: errorText(error) },
    })
    return
  }
  if (state === 'open') return
  const event =
    state === 'merged'
      ? ({ type: 'merge', owner: true, ci: true, review: true } as const)
      : ({ type: 'reject', owner: true } as const)
  if (applyEvent(store, item.key, event).outcome.kind !== 'moved') return
  logEvent(store, { itemKey: item.key, kind: 'system', type: `pr_${state}_on_host`, payload: { prUrl } })
  await syncBoard(ctx, item.key)
  const said = state === 'merged' ? 'PR이 머지된 걸 확인했어요' : 'PR이 머지 없이 닫힌 걸 확인했어요'
  await notifyOwner(ctx, item, `${said}: ${item.repo}. 워크트리는 정리할게요.`)
}

async function syncPullRequests(ctx: Ctx): Promise<void> {
  const { store } = ctx.deps
  const now = ctx.deps.now()
  for (const item of listItems(store, { stage: 'pr_open' })) {
    const prUrl = getWorkspace(store, item.key)?.prUrl ?? null
    // A build that was only committed locally has no pull request to ask about.
    if (prUrl === null || (ctx.prCheckAt.get(item.key) ?? 0) > now) continue
    ctx.prCheckAt.set(item.key, now + PR_CHECK_MS)
    await checkPullRequest(ctx, item, prUrl)
  }
}

async function cleanOne(ctx: Ctx, item: ItemRow, workspace: WorkspaceRow): Promise<void> {
  const { store, run } = ctx.deps
  try {
    const removal = await removeWorktree(run, workspace.path, {
      discard: item.stage === 'declined',
      merged: item.stage === 'merged',
    })
    ctx.cleanupRetryAt.delete(item.key)
    logEvent(store, {
      itemKey: item.key,
      kind: 'system',
      type: removal.removed ? 'workspace_removed' : 'workspace_kept',
      payload: { path: workspace.path, reason: removal.reason ?? '' },
    })
  } catch (error) {
    // Tried again after a pause, so a program that keeps failing does not add a log row every tick.
    ctx.cleanupRetryAt.set(item.key, ctx.deps.now() + CLEANUP_RETRY_MS)
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'cleanup_failed', payload: { error: errorText(error) } })
  }
}

// A declined item's worktree is thrown away; a merged one is only removed when nothing in it is unsaved.
async function cleanUp(ctx: Ctx, stage: 'declined' | 'merged'): Promise<void> {
  const { store } = ctx.deps
  const due = cleanupKeys(store, stage).filter(
    (key) => !ctx.jobs.has(key) && (ctx.cleanupRetryAt.get(key) ?? 0) <= ctx.deps.now(),
  )
  for (const key of due) {
    const item = getItem(store, key)
    const workspace = getWorkspace(store, key)
    if (item !== undefined && workspace !== undefined) await cleanOne(ctx, item, workspace)
  }
}

export function createWorker(deps: WorkerDeps): Worker {
  let dm: Promise<string> | null = null
  // Only a success is remembered: a failed attempt must not break posting for the rest of the process.
  const channel = (): Promise<string> => {
    dm ??= deps.slack.openDm(deps.ownerId).catch((error: unknown) => {
      dm = null
      throw error
    })
    return dm
  }
  const ctx: Ctx = { deps, jobs: new Map(), channel, cleanupRetryAt: new Map(), prCheckAt: new Map() }
  return {
    async tick() {
      await startReady(ctx, 'planning')
      await startReady(ctx, 'implementing')
      // Before the cleanup, so a pull request merged on the host is cleaned up in the same tick.
      await syncPullRequests(ctx)
      await cleanUp(ctx, 'declined')
      await cleanUp(ctx, 'merged')
    },
    abort(itemKey) {
      ctx.jobs.get(itemKey)?.controller.abort()
    },
    async idle() {
      while (ctx.jobs.size > 0) await Promise.all([...ctx.jobs.values()].map((job) => job.done))
    },
    stop() {
      for (const job of ctx.jobs.values()) job.controller.abort()
    },
  }
}
