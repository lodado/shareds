// The worker's jobs for an item that reviews somebody else's pull request. They follow the stages of any item: the
// review is the plan step, the fix is the build step, and the merge happens while the item waits in pr_open. The owner
// approved in advance (the request, a button or a command), so the worker sends the approval itself, as it does for a
// build started from the digest. Every step that reaches GitHub reads the pull request again first; what the agents
// say is their word, and what code can check (branch, clean tree, the commit to merge) is checked here.

import type { AgentResult } from '../agent/claude.ts'
import type { DigestMessage } from '../digest/digest.ts'
import type { QaOutcome } from '../qa/qa.ts'
import type { PrInfo, Review, ReviewGate, ReviewMeta } from '../review/review.ts'
import type { ItemRow } from '../store/store.ts'
import type { WorkspaceRow } from '../store/work.ts'
import type { RunInfo, WorkerDeps } from './worker.ts'
import { AgentAborted, DEFAULT_MODEL } from '../agent/claude.ts'
import { extractJson, fixPrompt, parseBuildResult, parseQaRoutes, parseQaSpec, reviewPrompt } from '../agent/prompts.ts'
import { buildReviewReport } from '../cards/cards.ts'
import { NO_HOOKS } from '../github/github.ts'
import { createWorktree, installDependencies, worktreeNameFor } from '../orca/worktree.ts'
import {
  cutKeepingLines,
  eligibility,
  mergeLockOf,
  mergeStep,
  parseReview,
  parseUnfixed,
  readStoredReview,
  remainingBlockers,
  remoteMatches,
  REPORT_LIMIT,
} from '../review/review.ts'
import { clip } from '../slack/blocks.ts'
import { redact } from '../store/redact.ts'
import { applyEvent, getItem, logEvent, setReview } from '../store/store.ts'
import { endRun, getWorkspace, listRuns, saveWorkspace, setBaseRef, setPlan, setPrUrl } from '../store/work.ts'

// What the review jobs reach GitHub with. Injected, so the tests drive them with fakes.
export interface ReviewGithub {
  readPr: (prUrl: string) => Promise<PrInfo>
  readGate: (prUrl: string) => Promise<ReviewGate>
  // Approves exactly this commit of the pull request: a later push needs a review of its own.
  approve: (review: ReviewMeta, headOid: string) => Promise<void>
  merge: (prUrl: string, headOid: string) => Promise<void>
  push: (worktreePath: string, head: string) => Promise<void>
  ownerLogin: () => Promise<string>
}

// The parts of the worker the review jobs share with the other jobs.
export interface ReviewKit {
  deps: WorkerDeps
  post: (message: DigestMessage) => Promise<string>
  notifyOwner: (item: ItemRow, text: string) => Promise<void>
  failRun: (info: RunInfo, result: AgentResult | undefined, reason: string) => Promise<void>
  syncBoard: (itemKey: string) => Promise<void>
  checkVisually: (
    info: RunInfo,
    workspace: WorkspaceRow,
    result: AgentResult,
    asked: { routes: readonly string[]; spec: string | null },
  ) => Promise<QaOutcome>
  showLive: (itemKey: string, path: string) => Promise<string | undefined>
  hideLive: (itemKey: string, handle: string | undefined) => Promise<void>
  assertActive: (info: RunInfo) => void
  // The merges in progress, shared with the buttons: the owner cannot call off an item while it is being merged.
  locks: Set<string>
}

// CI gets this long to show up after a push before the checks are read, and this long to finish.
const REVIEW_SETTLE_MS = 5 * 60_000
const REVIEW_MAX_WAIT_MS = 6 * 60 * 60_000
// How often an approved pull request is asked about while it waits for CI.
export const REVIEW_CHECK_MS = 2 * 60_000
// More diff than this is cut: the agent reads the files themselves for the rest.
const DIFF_LIMIT = 150_000
const REASON_LIMIT = 500
const COMMIT = /^[0-9a-f]{40}$/
// Said whenever a review stops after the bot approved: the approval is not taken back.
const APPROVAL_KEPT = '. 내 승인은 PR에 남아 있어요.'

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const sessionStarted = (kit: ReviewKit, itemKey: string): boolean =>
  listRuns(kit.deps.store, itemKey).some((run) => run.costUsd > 0)

async function git(kit: ReviewKit, path: string, args: readonly string[]): Promise<string> {
  const { stdout } = await kit.deps.run('git', ['-C', path, ...args])
  return stdout
}

const remoteRef = (branch: string): string => `refs/remotes/origin/${branch}`
const fetchSpec = (branch: string): string => `+refs/heads/${branch}:${remoteRef(branch)}`

// The worktree of the review, at the pull request's newest commit. A new one is made from the repo Orca knows, after
// checking that its origin is the pull request's repo: the fixes are pushed there. Every try starts from the pull
// request as it is now, so an earlier try's local commits are dropped.
async function prepareWorkspace(kit: ReviewKit, item: ItemRow, review: ReviewMeta): Promise<WorkspaceRow> {
  const { store, run } = kit.deps
  let workspace = getWorkspace(store, item.key)
  if (workspace === undefined) {
    const repoPath = await kit.deps.repoPath(item.repo)
    if (repoPath === undefined) throw new Error(`the repo ${item.repo} is not registered in Orca`)
    const origin = await git(kit, repoPath, ['remote', 'get-url', 'origin'])
    if (!remoteMatches(origin, review.slug)) throw new Error(`the origin of ${item.repo} is not ${review.slug}`)
    await git(kit, repoPath, ['fetch', 'origin', fetchSpec(review.base)])
    const worktree = await createWorktree(run, {
      repoPath,
      name: worktreeNameFor(item.key),
      baseRef: `origin/${review.base}`,
      comment: `PR: ${review.prUrl}`,
    })
    workspace = saveWorkspace(store, item.key, {
      sessionId: kit.deps.newSessionId(),
      path: worktree.path,
      branch: worktree.branch,
      baseRef: `origin/${review.base}`,
    })
  }
  await git(kit, workspace.path, ['fetch', 'origin', fetchSpec(review.head), fetchSpec(review.base)])
  await git(kit, workspace.path, ['reset', '--hard', remoteRef(review.head)])
  const head = (await git(kit, workspace.path, ['rev-parse', 'HEAD'])).trim()
  if (!COMMIT.test(head)) throw new Error('git rev-parse printed no commit')
  setBaseRef(store, item.key, head)
  return { ...workspace, baseRef: head }
}

async function diffOf(kit: ReviewKit, workspace: WorkspaceRow, review: ReviewMeta): Promise<string> {
  const range = `${remoteRef(review.base)}...HEAD`
  const stat = await git(kit, workspace.path, ['diff', '--stat', range])
  const full = await git(kit, workspace.path, ['diff', range])
  const shown = full.length <= DIFF_LIMIT ? full : `${full.slice(0, DIFF_LIMIT)}\n… (diff가 길어 여기서 잘랐어요)`
  return `${stat.trim()}\n\n${shown}`
}

// A pull request that was merged or closed before the review began is not a failure: there is nothing left to do.
async function giveUp(kit: ReviewKit, info: RunInfo, review: ReviewMeta, pr: PrInfo): Promise<void> {
  const { store } = kit.deps
  endRun(store, info.runId, { type: 'cancel' }, { costUsd: 0, detail: `the pull request is ${pr.state}` })
  if (applyEvent(store, info.item.key, { type: 'reject', owner: true }).outcome.kind !== 'moved') return
  await kit.syncBoard(info.item.key)
  await kit.notifyOwner(
    info.item,
    `리뷰하기 전에 PR이 이미 ${pr.state === 'MERGED' ? '머지됐어요' : '닫혔어요'}: ${review.prUrl}`,
  )
}

// The plan step of a review item: read the pull request and its diff, and let the review agent list what is wrong.
export async function reviewJob(kit: ReviewKit, info: RunInfo, review: ReviewMeta): Promise<void> {
  const { store, agent, config } = kit.deps
  const { item } = info
  // Nothing is spent until the agent starts, so a failure before it (GitHub, git, the worktree) is charged nothing.
  info.free = true
  const [pr, login] = await Promise.all([kit.deps.github.readPr(review.prUrl), kit.deps.github.ownerLogin()])
  if (pr.state === 'MERGED' || pr.state === 'CLOSED') {
    await giveUp(kit, info, review, pr)
    return
  }
  const allowed = eligibility(pr, login)
  if (!allowed.ok) {
    await kit.failRun(info, undefined, allowed.reason)
    return
  }
  const workspace = await prepareWorkspace(kit, item, review)
  const diff = await diffOf(kit, workspace, review)
  info.free = false
  const result = await agent({
    cwd: workspace.path,
    prompt: reviewPrompt({
      repo: item.repo,
      number: review.number,
      title: pr.title,
      head: review.head,
      base: review.base,
      body: pr.body,
      diff,
    }),
    sessionId: workspace.sessionId,
    resume: sessionStarted(kit, item.key),
    mode: 'plan',
    model: item.meta.model ?? DEFAULT_MODEL,
    maxBudgetUsd: info.budget,
    timeoutMs: config.planTimeoutMs,
    signal: info.signal,
    ownSetup: config.ownSetup,
  })
  info.costUsd = result.costUsd
  if (!result.ok) {
    await kit.failRun(info, result, `the review agent stopped (${result.subtype})`)
    return
  }
  let found: Review
  try {
    found = parseReview(extractJson(result.text))
  } catch (error) {
    await kit.failRun(info, result, errorText(error))
    return
  }
  if (info.signal.aborted) throw new AgentAborted()
  setPlan(store, item.key, JSON.stringify(found))
  endRun(store, info.runId, { type: 'finish', ok: true, valid: true }, { costUsd: result.costUsd, detail: 'reviewed' })
  applyEvent(store, item.key, { type: 'plan_ready', current: true })
  // The owner asked for the review and its fixes up front, so the worker approves the plan step's result itself.
  applyEvent(store, item.key, { type: 'approve', owner: true, card: 'plan', fresh: true })
  await kit.syncBoard(item.key)
}

const findingsForPrompt = (review: Review): string =>
  review.findings
    .map((finding) => {
      const where = finding.line === null ? finding.file : `${finding.file}:${finding.line}`
      return `${finding.id}. [${finding.severity}] ${where} - ${finding.issue}\n   fix: ${finding.fix}`
    })
    .join('\n')

interface FixOutcome {
  // The finding ids the fix left, or null when the agent did not say.
  unfixed: number[] | null
  report: string
  // Commits the fix made on top of the pull request.
  commits: number
  qa: QaOutcome | null
}

async function treeProblem(kit: ReviewKit, workspace: WorkspaceRow): Promise<string | undefined> {
  const current = (await git(kit, workspace.path, ['symbolic-ref', '--short', 'HEAD'])).trim()
  if (current !== workspace.branch) return `the agent left the branch ${workspace.branch}`
  const dirty = await git(kit, workspace.path, ['status', '--porcelain'])
  return dirty.trim() === '' ? undefined : 'the agent left uncommitted changes in the worktree'
}

// Why the review must stop before anything reaches the pull request, or empty when it may go on.
function stopReason(review: Review, outcome: FixOutcome): string {
  if (outcome.qa?.status === 'failed') return `Visual QA 실패: ${clip(redact(outcome.qa.reason), REASON_LIMIT)}`
  const left = remainingBlockers(review, outcome.unfixed)
  if (left.length > 0) return `고치지 못한 blocker·major 지적이 ${left.length}개 남았어요`
  // The agent's word that it fixed them is not enough when nothing was committed.
  const must = remainingBlockers(review, null)
  if (outcome.commits === 0 && must.length > 0) return `blocker·major 지적이 ${must.length}개인데 고친 커밋이 없어요`
  return ''
}

// Why the pull request may not get the next push or approval, or empty when it may. GitHub is asked again, because
// the review and the fix took minutes, and the head must still be the commit the bot built on or pushed.
async function prChanged(kit: ReviewKit, review: ReviewMeta, expectedHead: string): Promise<string> {
  const [pr, login] = await Promise.all([kit.deps.github.readPr(review.prUrl), kit.deps.github.ownerLogin()])
  if (pr.state === 'MERGED') return '수정하는 동안 PR이 머지됐어요'
  if (pr.state === 'CLOSED') return '수정하는 동안 PR이 닫혔어요'
  const allowed = eligibility(pr, login)
  if (!allowed.ok) return allowed.reason
  return pr.headRefOid === expectedHead ? '' : '수정하는 동안 PR에 다른 커밋이 올라왔어요'
}

// Pushes the fixes and approves, or stops with the reason. Either way the item moves to pr_open with the pull request
// recorded; a stopped one is then declined and the owner told at once, an approved one waits there for its merge.
async function finishFix(
  kit: ReviewKit,
  info: RunInfo,
  workspace: WorkspaceRow,
  review: ReviewMeta,
  found: Review,
  outcome: FixOutcome,
): Promise<void> {
  const { store } = kit.deps
  const { item } = info
  kit.assertActive(info)
  let stop = stopReason(found, outcome)
  let pushed = false
  if (stop === '' && outcome.commits > 0) {
    stop = await prChanged(kit, review, workspace.baseRef)
    if (stop === '') {
      kit.assertActive(info)
      await kit.deps.github.push(workspace.path, review.head)
      pushed = true
    }
  }
  const head = (await git(kit, workspace.path, ['rev-parse', 'HEAD'])).trim()
  if (stop === '') stop = await prChanged(kit, review, head)
  if (stop === '') {
    kit.assertActive(info)
    await kit.deps.github.approve(review, head)
  }
  const unfixed = outcome.unfixed ?? found.findings.map((finding) => finding.id)
  const kept: ReviewMeta = {
    ...review,
    unfixed,
    report: cutKeepingLines(redact(outcome.report), REPORT_LIMIT),
    ...(stop === '' ? { pushedOid: head, pushedAt: kit.deps.now() } : {}),
  }
  setReview(store, item.key, kept)
  setPrUrl(store, item.key, review.prUrl)
  endRun(
    store,
    info.runId,
    { type: 'finish', ok: true, valid: true },
    { costUsd: info.costUsd ?? 0, detail: stop === '' ? 'fixed and approved' : `stopped: ${stop}` },
  )
  if (applyEvent(store, item.key, { type: 'built', ok: true }).outcome.kind !== 'moved') {
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'built_after_stop', payload: { prUrl: review.prUrl } })
    return
  }
  // Declined in the same step, with nothing awaited between: the merge check must never see a stopped review waiting.
  const declined = stop !== '' && applyEvent(store, item.key, { type: 'reject', owner: true }).outcome.kind === 'moved'
  await kit.syncBoard(item.key)
  const where = pushed ? '수정은 PR에 올렸지만 승인하지 않았어요' : '수정은 PR에 올리지 않았어요'
  if (declined) await tellReview(kit, item.key, { merged: false, reason: `${stop} (${where})` })
}

async function runFix(
  kit: ReviewKit,
  info: RunInfo,
  workspace: WorkspaceRow,
  found: Review,
): Promise<FixOutcome | null> {
  const { store, agent, config } = kit.deps
  const { item } = info
  const failed = listRuns(store, item.key).filter((run) => run.kind === 'build' && run.state === 'failed')
  info.free = false
  const result = await agent({
    cwd: workspace.path,
    prompt: fixPrompt({
      branch: workspace.branch,
      base: workspace.baseRef,
      findings: findingsForPrompt(found),
      lastFailure: failed.at(-1)?.detail ?? '',
    }),
    sessionId: workspace.sessionId,
    resume: sessionStarted(kit, item.key),
    mode: 'build',
    model: item.meta.model ?? DEFAULT_MODEL,
    maxBudgetUsd: info.budget,
    timeoutMs: config.buildTimeoutMs,
    signal: info.signal,
    ownSetup: config.ownSetup,
    // The pull request's hooks are its author's code: commits made in its worktree do not run them.
    env: NO_HOOKS,
  })
  info.costUsd = result.costUsd
  const verdict = parseBuildResult(result.text)
  if (!result.ok || !verdict.ok) {
    await kit.failRun(info, result, result.ok ? verdict.reason : `the agent stopped (${result.subtype})`)
    return null
  }
  const problem = await treeProblem(kit, workspace)
  if (problem !== undefined) {
    await kit.failRun(info, result, problem)
    return null
  }
  const commits = Number((await git(kit, workspace.path, ['rev-list', '--count', `${workspace.baseRef}..HEAD`])).trim())
  const asked = parseQaRoutes(verdict.report)
  const spec = parseQaSpec(asked.report)
  const unfixed = parseUnfixed(spec.report)
  // Visual QA judges the screens against what was meant to change: here, the findings.
  const qa =
    commits > 0
      ? await kit.checkVisually(info, { ...workspace, plan: findingsForPrompt(found) }, result, {
          routes: asked.routes,
          spec: spec.spec,
        })
      : null
  info.costUsd = result.costUsd + (qa?.costUsd ?? 0)
  return { unfixed: unfixed.ids, report: unfixed.report, commits: Number.isInteger(commits) ? commits : 0, qa }
}

// The build step of a review item: fix every finding, check the tree, look at changed screens, then push and approve.
export async function fixJob(kit: ReviewKit, info: RunInfo, review: ReviewMeta): Promise<void> {
  const { store, run } = kit.deps
  const { item } = info
  // Free until the agent starts, as in the review step.
  info.free = true
  const workspace = getWorkspace(store, item.key)
  if (workspace === undefined) throw new Error(`item ${item.key} has no workspace`)
  const found = readStoredReview(workspace.plan)
  if (found === undefined) {
    await kit.failRun(info, undefined, 'the stored review could not be read')
    return
  }
  let outcome: FixOutcome | null
  if (found.findings.length === 0) {
    info.costUsd = 0
    outcome = { unfixed: [], report: '', commits: 0, qa: null }
  } else {
    // Somebody else's package.json: its install scripts are not run.
    await installDependencies(run, workspace.path, info.signal, undefined, { ignoreScripts: true })
    const live = await kit.showLive(item.key, workspace.path)
    try {
      outcome = await runFix(kit, info, workspace, found)
    } finally {
      await kit.hideLive(item.key, live)
    }
  }
  if (outcome === null) return
  try {
    await finishFix(kit, info, workspace, review, found, outcome)
  } catch (error) {
    if (error instanceof AgentAborted) throw error
    // The fix passed but the push or the approval did not: the commits are still in the worktree.
    await kit.failRun(info, undefined, redact(errorText(error)))
  }
}

const SAFE_LINK = /^https:\/\/[^\s<>|]+$/

// The one message the owner gets about a review that is over.
async function tellReview(
  kit: ReviewKit,
  itemKey: string,
  result: { merged: boolean; reason: string },
): Promise<void> {
  const { store } = kit.deps
  const item = getItem(store, itemKey)
  const review = item?.meta.review
  if (item === undefined || review === undefined) return
  const found = readStoredReview(getWorkspace(store, itemKey)?.plan ?? '') ?? { summary: '', findings: [] }
  const unfixed = review.unfixed ?? found.findings.map((finding) => finding.id)
  const threadUrl = item.meta.url ?? ''
  try {
    await kit.post(
      buildReviewReport({
        repo: item.repo,
        prUrl: review.prUrl,
        title: review.title,
        threadUrl: SAFE_LINK.test(threadUrl) ? threadUrl : '',
        merged: result.merged,
        reason: result.reason,
        summary: found.summary,
        findings: found.findings.map((finding) => ({ ...finding, fixed: !unfixed.includes(finding.id) })),
      }),
    )
  } catch (error) {
    logEvent(store, { itemKey, kind: 'system', type: 'notify_failed', payload: { error: errorText(error) } })
  }
}

async function closeWith(kit: ReviewKit, item: ItemRow, merged: boolean, reason: string): Promise<void> {
  const event = merged
    ? ({ type: 'merge', owner: true, ci: true, review: true } as const)
    : ({ type: 'reject', owner: true } as const)
  if (applyEvent(kit.deps.store, item.key, event).outcome.kind !== 'moved') return
  await kit.syncBoard(item.key)
  await tellReview(kit, item.key, { merged, reason })
}

// While an approved review waits in pr_open: merge it once CI passed and the head is still the approved commit, or
// stop with the reason. A question GitHub did not answer is logged and asked again at the next check.
export async function checkReviewMerge(kit: ReviewKit, item: ItemRow, review: ReviewMeta): Promise<void> {
  const { store } = kit.deps
  if (review.pushedOid === undefined || review.pushedAt === undefined) {
    await closeWith(kit, item, false, '승인한 커밋 기록이 없어요')
    return
  }
  let gate: ReviewGate
  try {
    gate = await kit.deps.github.readGate(review.prUrl)
  } catch (error) {
    logEvent(store, {
      itemKey: item.key,
      kind: 'system',
      type: 'pr_state_failed',
      payload: { error: errorText(error) },
    })
    // A GitHub that never answers does not keep the review waiting past the time CI gets.
    if (kit.deps.now() - review.pushedAt > REVIEW_MAX_WAIT_MS) {
      await closeWith(kit, item, false, `GitHub에서 PR 상태를 읽지 못했어요${APPROVAL_KEPT}`)
    }
    return
  }
  const step = mergeStep({
    gate,
    expectedHead: review.pushedOid,
    pushedAt: review.pushedAt,
    now: kit.deps.now(),
    settleMs: REVIEW_SETTLE_MS,
    maxWaitMs: REVIEW_MAX_WAIT_MS,
  })
  switch (step.kind) {
    case 'wait':
      return
    case 'merged_on_host':
      await closeWith(kit, item, true, 'GitHub에서 직접 머지됐어요 (봇이 머지하지 않았어요)')
      return
    case 'closed':
      await closeWith(kit, item, false, 'PR이 머지 없이 닫혔어요')
      return
    case 'stop':
      await closeWith(kit, item, false, `${step.reason}${APPROVAL_KEPT}`)
      return
    case 'merge':
      await mergeHeld(kit, item, review, step.headOid)
  }
}

// The merge itself, while nobody else may call the item off: the owner may have declined it during the GitHub reads.
async function mergeHeld(kit: ReviewKit, item: ItemRow, review: ReviewMeta, headOid: string): Promise<void> {
  const { store } = kit.deps
  const lock = mergeLockOf(item.key)
  if (kit.locks.has(lock) || getItem(store, item.key)?.stage !== 'pr_open') return
  kit.locks.add(lock)
  try {
    try {
      await kit.deps.github.merge(review.prUrl, headOid)
    } catch (error) {
      const reason = clip(redact(errorText(error)), REASON_LIMIT)
      await closeWith(kit, item, false, `머지하지 못했어요: ${reason}${APPROVAL_KEPT}`)
      return
    }
    logEvent(store, { itemKey: item.key, kind: 'system', type: 'review_merged', payload: { headOid } })
    await closeWith(kit, item, true, '')
  } finally {
    kit.locks.delete(lock)
  }
}
