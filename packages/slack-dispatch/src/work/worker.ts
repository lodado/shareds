// The part that does the work. Each tick looks at the store: an item in `planning` gets a plan, an item in
// `implementing` gets built, and a finished or declined item gets its worktree cleaned up. What to start, how much
// it may cost, whether a plan is still current and whether a build left a commit are all decided by code; the agent
// only writes the plan and the change, and its own report is taken as its word. Items run in parallel, within the
// caps.

import type { Agent, AgentResult } from '../agent/claude.ts'
import type { DigestMessage } from '../digest/digest.ts'
import type { Run } from '../exec/exec.ts'
import type { QaOutcome, RunQa } from '../qa/qa.ts'
import type { SlackClient } from '../slack/client.ts'
import type { ItemRow, Store } from '../store/store.ts'
import type { WorkspaceRow } from '../store/work.ts'
import { AgentAborted } from '../agent/claude.ts'
import {
  buildPrompt,
  parseBuildResult,
  parseQaRoutes,
  planPrompt,
  replanPrompt,
  revisePrompt,
} from '../agent/prompts.ts'
import { buildFailedCard, buildPlanCard, buildPrCard, shownPlan, shownReport } from '../cards/cards.ts'
import { openPr, pushBranch } from '../github/github.ts'
import {
  commitProblem,
  createWorktree,
  installDependencies,
  removeWorktree,
  resolveBaseBranch,
  setWorkspaceStatus,
  statusForStage,
  worktreeNameFor,
} from '../orca/worktree.ts'
import { clip } from '../slack/blocks.ts'
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
async function failRun(ctx: Ctx, info: RunInfo, result: AgentResult | undefined, reason: string): Promise<void> {
  const known = result?.costUsd ?? info.costUsd ?? 0
  const costUsd = known > 0 ? known : info.budget
  endRun(ctx.deps.store, info.runId, { type: 'finish', ok: false, valid: true }, { costUsd, detail: reason })
  await failItem(ctx, info.item.key, reason)
}

// The prompt for a plan: the first plan, one that answers the owner's requests, or one that avoids the last failure.
function planText(ctx: Ctx, item: ItemRow, workspace: WorkspaceRow, thread: string): string {
  const { store } = ctx.deps
  const asked = pendingInstruction(store, item.key)
  if (asked !== undefined) return revisePrompt(asked.text, thread)
  if (workspace.plan !== '') return replanPrompt(thread, lastFailure(store, item.key))
  return planPrompt({ repo: item.repo, base: workspace.baseRef, thread, task: item.task })
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

async function planJob(ctx: Ctx, info: RunInfo): Promise<void> {
  const { store, agent, config } = ctx.deps
  const { item } = info
  const workspace = await ensureWorkspace(ctx, item)
  const thread = await ctx.deps.loadThread(item)
  const answeredRequest = pendingInstruction(store, item.key)?.id ?? 0
  const result = await agent({
    cwd: workspace.path,
    prompt: planText(ctx, item, workspace, thread),
    sessionId: workspace.sessionId,
    resume: sessionStarted(store, item.key),
    mode: 'plan',
    model: 'opusplan',
    maxBudgetUsd: info.budget,
    timeoutMs: config.planTimeoutMs,
    signal: info.signal,
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
}

// Visual QA of what the build changed, before anything is pushed. It gets what is left of the item's money.
function checkVisually(
  ctx: Ctx,
  info: RunInfo,
  workspace: WorkspaceRow,
  result: AgentResult,
  routes: readonly string[],
): Promise<QaOutcome> {
  const { store, config } = ctx.deps
  const left = config.maxCostPerItemUsd - spentOnItem(store, info.item.key) - result.costUsd
  return ctx.deps.qa({
    itemKey: info.item.key,
    worktreePath: workspace.path,
    baseRef: workspace.baseRef,
    plan: workspace.plan,
    routes: routes.length > 0 ? routes : ['/'],
    budgetUsd: Math.min(config.qaBudgetUsd, left),
    signal: info.signal,
  })
}

async function buildJob(ctx: Ctx, info: RunInfo): Promise<void> {
  const { store, run, agent, config } = ctx.deps
  const { item } = info
  const workspace = getWorkspace(store, item.key)
  if (workspace === undefined) throw new Error(`item ${item.key} has no workspace`)
  // The worktree has the repository's files but not its installed packages; the build and the QA both need them.
  await installDependencies(run, workspace.path, info.signal)
  const result = await agent({
    cwd: workspace.path,
    prompt: buildPrompt({ branch: workspace.branch, lastFailure: lastFailure(store, item.key) }),
    sessionId: workspace.sessionId,
    resume: true,
    mode: 'build',
    model: 'opusplan',
    maxBudgetUsd: info.budget,
    timeoutMs: config.buildTimeoutMs,
    signal: info.signal,
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
  const qa = await checkVisually(ctx, info, workspace, result, asked.routes)
  info.costUsd = result.costUsd + qa.costUsd
  if (qa.status === 'failed') {
    await failRun(ctx, info, undefined, `Visual QA 실패: ${qa.reason}`)
    return
  }
  try {
    await finishBuild(ctx, info, result, asked.report, qaNote(qa))
  } catch (error) {
    if (error instanceof AgentAborted) throw error
    // The build passed but the push or the pull request did not; the commit is still in the worktree.
    await failRun(ctx, info, undefined, errorText(error))
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

async function cleanOne(ctx: Ctx, item: ItemRow, workspace: WorkspaceRow): Promise<void> {
  const { store, run } = ctx.deps
  try {
    const removal = await removeWorktree(run, workspace.path, { discard: item.stage === 'declined' })
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
  const ctx: Ctx = { deps, jobs: new Map(), channel, cleanupRetryAt: new Map() }
  return {
    async tick() {
      await startReady(ctx, 'planning')
      await startReady(ctx, 'implementing')
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
