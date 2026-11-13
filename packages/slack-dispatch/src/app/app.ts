// Puts the parts together: the socket listens for the owner, the worker plans and builds, and a polling job finds new
// mentions. Every outside thing (Slack, the programs, the agent, the clock) is passed in, so the same code runs in
// the real service and in the tests that drive it with fakes.

import type { Agent } from '../agent/claude.ts'
import type { Config } from '../config/config.ts'
import type { Run } from '../exec/exec.ts'
import type { IngestDeps } from '../ingest/ingest.ts'
import type { InteractDeps } from '../interact/interact.ts'
import type { IssueTrackerPort } from '../ports/issue-tracker.ts'
import type { RunQa } from '../qa/qa.ts'
import type { SlackClient } from '../slack/client.ts'
import type { Connect } from '../socket/socket.ts'
import type { Store } from '../store/store.ts'
import type { WorkerConfig } from '../work/worker.ts'
import type { StatusServer, StatusSnapshot } from './status.ts'
import {
  approvePr,
  mergePr,
  pushToPrBranch,
  readGate,
  readLogin,
  readPrInfo,
  readPrState,
  readReviewGate,
} from '../github/github.ts'
import { createSqliteItemRepository } from '../infra/sqlite-item-repository.ts'
import { catchUp } from '../ingest/catch-up.ts'
import { ingestMentions } from '../ingest/ingest.ts'
import { listRepos } from '../orca/repos.ts'
import { createReviewDetector } from '../review/detect.ts'
import { startSocket } from '../socket/socket.ts'
import { lastSystemEventAt, logEvent, stageCounts } from '../store/store.ts'
import { cancelOrphanRuns, countActiveRuns, getWorkspace } from '../store/work.ts'
import { ingestIssues, loadIssueText, parseIssueSourceKey } from '../usecases/ingest-issues.ts'
import { createWorker, retriesLeft } from '../work/worker.ts'
import { createReviewClassifier, createSplitAgent, createTriageAgent } from './agents.ts'
import { dispatchEnvelope } from './dispatch.ts'
import { createSerial, every } from './loop.ts'
import { describeError, startStatusServer } from './status.ts'
import { loadThreadText } from './threads.ts'

export interface AppDeps {
  config: Config
  ownerId: string
  slack: SlackClient
  run: Run
  agent: Agent
  store: Store
  newSessionId: () => string
  now: () => Date
  baseBranches: Readonly<Record<string, string>>
  channelRepos: () => Record<string, string[]>
  // The issue tracker whose issues assigned to the owner are listed with the mentions. Left out, none are.
  issueTracker?: IssueTrackerPort
  // Which repos a tracker project is about, read again at every poll.
  projectRepos?: () => Record<string, string[]>
  // A folder with nothing in it, where the agent that cuts DM prompts runs.
  scratchDir: string
  // Looks at the pages a build changed before its pull request is opened.
  qa: RunQa
  // The port of the read-only status address on this machine; null for none.
  statusPort?: number | null
  connect?: Connect
  // How often the worker looks for something to start.
  tickMs?: number
  log?: (event: string, detail?: unknown) => void
}

export interface App {
  // Resolves once Slack said hello on the socket.
  ready: Promise<void>
  // The port the status address listens on, or null when it is off or the port was taken.
  statusPort: number | null
  // Stops the loops, the socket and the agents, and waits for the jobs to end.
  stop: () => Promise<void>
}

const DEFAULT_TICK_MS = 3000
const DAY_MS = 86_400_000

function workerConfig(
  config: Pick<Config, 'prEnabled' | 'ownSetup'>,
  baseOverrides: Readonly<Record<string, string>>,
): WorkerConfig {
  return {
    maxTotal: 3,
    maxPerRepo: 1,
    // All the runs of one item together. Three times what it was (8 and 5), at the owner's request: a build in a large
    // repository runs its whole test suite more than once.
    maxCostPerItemUsd: 24,
    planBudgetUsd: 2,
    buildBudgetUsd: 15,
    qaBudgetUsd: 1,
    planTimeoutMs: 15 * 60_000,
    // A repository's own test run can take a quarter of an hour; the money cap, not the clock, is what limits a build.
    buildTimeoutMs: 90 * 60_000,
    maxAttempts: 3,
    prEnabled: config.prEnabled,
    ownSetup: config.ownSetup,
    baseOverrides,
  }
}

function startOfDay(now: Date, daysBack: number): Date {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  return new Date(day.getTime() - daysBack * DAY_MS)
}

// The pass looks back this far past the last good one, so a tag that Slack's search showed late is not missed.
const CATCH_UP_OVERLAP_MS = 10 * 60_000
// And never further than this, so a machine that was off for a month does not read a month of tags at once.
const MAX_CATCH_UP_DAYS = 7
// A pause between two good passes longer than this is told to the owner.
const GAP_NOTICE_MS = 30 * 60_000
const POLL_RETRY_FROM_MS = 30_000

// From which moment a pass has to look for tags: the start of today (or of the days the owner asked for), or earlier when
// the last good pass was before that, as after a night with the machine off.
export function pollSince(now: Date, ingestDays: number, lastGood: Date | null): Date {
  const wanted = startOfDay(now, ingestDays)
  if (lastGood === null) return wanted
  const floor = startOfDay(now, MAX_CATCH_UP_DAYS)
  const resume = new Date(Math.max(lastGood.getTime() - CATCH_UP_OVERLAP_MS, floor.getTime()))
  return resume.getTime() < wanted.getTime() ? resume : wanted
}

const pad = (n: number): string => String(n).padStart(2, '0')
const momentText = (at: Date): string =>
  `${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}`

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// The status address is a convenience: a port that is taken must not keep the service from running.
async function startStatus(
  deps: AppDeps,
  log: (event: string, detail?: unknown) => void,
  snapshot: () => StatusSnapshot,
): Promise<StatusServer | null> {
  const port = deps.statusPort ?? null
  if (port === null) return null
  try {
    return await startStatusServer({ port, snapshot })
  } catch (error) {
    log('status_server_failed', errorText(error))
    return null
  }
}

export async function createApp(deps: AppDeps): Promise<App> {
  const { store, slack, run, ownerId, config } = deps
  const log = deps.log ?? (() => undefined)
  const reportError = (where: string) => (error: unknown) => {
    log(where, errorText(error))
    try {
      logEvent(store, { kind: 'system', type: `${where}_failed`, payload: { error: errorText(error) } })
    } catch {
      // The log itself is down; the line above is all that is left.
    }
  }

  const settings = workerConfig(config, deps.baseBranches)
  // Nothing from an earlier process is still running, so runs it left in progress are called off first, each charged
  // the most it could have spent.
  cancelOrphanRuns(store, { plan: settings.planBudgetUsd, build: settings.buildBudgetUsd })
  // Orca only lists the repos. Closed, it does not stop the search for tags: the list stays as it was (empty at the
  // start), and the next pass asks again.
  let repos: Awaited<ReturnType<typeof listRepos>> = []
  const refreshRepos = async (): Promise<void> => {
    try {
      repos = await listRepos(run)
    } catch (error) {
      reportError('orca')(error)
    }
  }
  await refreshRepos()
  const repoPath = (name: string): Promise<string | undefined> =>
    Promise.resolve(repos.find((repo) => repo.name === name)?.path)

  const tracker = deps.issueTracker
  // An item from the tracker is read from its issue; one from Slack, from its thread.
  const loadThread = (item: Parameters<typeof loadThreadText>[1], focus?: readonly string[]): Promise<string> => {
    if (tracker === undefined || parseIssueSourceKey(item.threadKey) === null) return loadThreadText(slack, item, focus)
    return loadIssueText(tracker, item.threadKey)
  }
  // The owner's GitHub login, asked once: reviews are refused for the owner's own pull requests and run under this account.
  let login: Promise<string> | null = null
  const ownerLogin = (): Promise<string> => {
    login ??= readLogin(run).catch((error: unknown) => {
      login = null
      throw error
    })
    return login
  }
  // The merges in progress: a button and the worker's own merge of a review hold the same locks.
  const mergeLocks = new Set<string>()
  const worker = createWorker({
    store,
    run,
    agent: deps.agent,
    slack,
    ownerId,
    config: settings,
    repoPath,
    loadThread,
    newSessionId: deps.newSessionId,
    qa: deps.qa,
    now: () => deps.now().getTime(),
    prState: (prUrl) => readPrState(run, prUrl),
    github: {
      readPr: (prUrl) => readPrInfo(run, prUrl),
      readGate: (prUrl) => readReviewGate(run, prUrl),
      approve: (review, headOid) => approvePr(run, review.slug, review.number, headOid),
      merge: (prUrl, headOid) => mergePr(run, prUrl, headOid),
      push: (worktreePath, head) => pushToPrBranch(run, worktreePath, head),
      ownerLogin,
    },
    mergeLocks,
  })

  const prOf = (itemKey: string): string | null => getWorkspace(store, itemKey)?.prUrl ?? null
  const small = {
    agent: deps.agent,
    newSessionId: deps.newSessionId,
    onCost: (what: 'split' | 'triage' | 'review_intent', costUsd: number) => {
      logEvent(store, { kind: 'run', type: `${what}_agent`, payload: { costUsd } })
    },
  }
  const analyze = createTriageAgent(small, deps.scratchDir, repoPath, loadThread)
  const detectReview = createReviewDetector({
    readPr: (prUrl) => readPrInfo(run, prUrl),
    classify: createReviewClassifier(small, deps.scratchDir),
    ownerLogin,
    knownRepos: () => repos.map((repo) => repo.name),
  })
  // One pass over Slack at a time: the regular poll and a look at a past day would otherwise list the same new items twice.
  const serial = createSerial()
  const ingestDeps = (): IngestDeps => ({
    store,
    slack,
    ownerId,
    route: { knownRepos: repos.map((repo) => repo.name), channelRepos: deps.channelRepos() },
    analyze,
    review: detectReview,
    retriesLeft: (itemKey) => retriesLeft(store, itemKey, settings),
  })
  const interact: InteractDeps = {
    store,
    slack,
    ownerId,
    knownRepos: () => repos.map((repo) => repo.name),
    splitPrompt: createSplitAgent(small, deps.scratchDir),
    detectReview,
    checkGate: async (item) => {
      const url = prOf(item.key)
      return url === null ? { ci: false, review: false, headOid: '' } : readGate(run, url)
    },
    mergePr: async (item, headOid) => {
      const url = prOf(item.key)
      if (url === null) throw new Error(`item ${item.key} has no pull request`)
      await mergePr(run, url, headOid)
    },
    retriesLeft: (itemKey) => retriesLeft(store, itemKey, settings),
    abortWork: (itemKey) => {
      worker.abort(itemKey)
    },
    catchUp: (daysAgo) => serial(() => catchUp(ingestDeps(), startOfDay(deps.now(), daysAgo))),
    locks: mergeLocks,
    now: () => deps.now().getTime(),
  }

  const socket = startSocket({
    getUrl: () => slack.socketUrl(),
    onEnvelope: (envelope) => dispatchEnvelope(interact, envelope),
    connect: deps.connect,
    log,
  })

  // Reads the tracker's issues into items. A tracker that is down must not stop the mentions, so it reports and says
  // nothing was created.
  const ingestTrackerIssues = async (since: Date): Promise<number> => {
    if (tracker === undefined) return 0
    try {
      const summary = await ingestIssues(
        {
          tracker,
          items: createSqliteItemRepository(store),
          route: { knownRepos: repos.map((repo) => repo.name) },
          projectRepos: deps.projectRepos?.() ?? {},
        },
        { since },
      )
      return summary.created
    } catch (error) {
      reportError('issue_poll')(error)
      return 0
    }
  }

  // The tracker cannot call in, so it is asked more often than Slack is. A new issue sends its digest right away
  // instead of waiting for the next mention pass.
  const pollIssues = async (): Promise<void> => {
    if (repos.length === 0) await refreshRepos()
    const since = startOfDay(deps.now(), config.ingestDays)
    await serial(async () => {
      if ((await ingestTrackerIssues(since)) > 0) await ingestMentions(ingestDeps(), { since, dryRun: false })
    })
  }

  // What the status address says about polling.
  // `goodAt` is the end of the last pass that read every thread it found; the next pass looks back from there.
  const poll: { at: string | null; error: string | null; failures: number; goodAt: Date | null } = {
    at: null,
    error: null,
    failures: 0,
    goodAt: null,
  }
  // A pause longer than this between two good passes is told to the owner: a few polling intervals, and not less than
  // half an hour, so a slow pass or a short sleep is not taken for a night with the machine off.
  const gapNoticeMs = Math.max(GAP_NOTICE_MS, 3 * config.pollIntervalMs)

  // The owner is told when the service was not polling for a while (the Mac was off or asleep, the network was down),
  // and from when the pass looked again.
  const tellGap = async (from: Date, to: Date, since: Date): Promise<void> => {
    try {
      const channel = await slack.openDm(ownerId)
      const text =
        `${momentText(from)}부터 ${momentText(to)}까지 태그를 확인하지 못했어요 ` +
        `(맥이 꺼졌거나 네트워크가 끊겼을 수 있어요). ${momentText(since)}부터의 태그를 다시 찾아봤어요.`
      await slack.postMessage({ channel, text })
    } catch (error) {
      reportError('gap_notice')(error)
    }
  }

  const pollMentions = async (): Promise<void> => {
    try {
      await refreshRepos()
      const startedAt = deps.now()
      const lastGood = poll.goodAt ?? lastSystemEventAt(store, 'poll_ok')
      const since = pollSince(startedAt, config.ingestDays, lastGood)
      const summary = await serial(async () => {
        // The tracker's issues go in first, so the digest the mention pass sends lists them with the mentions.
        await ingestTrackerIssues(since)
        return ingestMentions(ingestDeps(), { since, dryRun: false })
      })
      poll.at = deps.now().toISOString()
      poll.error = null
      poll.failures = 0
      if (summary.failedThreads > 0) {
        // A thread that could not be read stays inside the window of the next pass.
        logEvent(store, { kind: 'system', type: 'poll_partial', payload: { failedThreads: summary.failedThreads } })
        return
      }
      poll.goodAt = deps.now()
      logEvent(store, { kind: 'system', type: 'poll_ok', payload: {} })
      if (lastGood !== null && startedAt.getTime() - lastGood.getTime() > gapNoticeMs) {
        await tellGap(lastGood, startedAt, since)
      }
    } catch (error) {
      poll.error = describeError(error)
      poll.failures += 1
      throw error
    }
  }

  const stops = [
    every(deps.tickMs ?? DEFAULT_TICK_MS, () => worker.tick(), reportError('worker_tick')),
    every(config.pollIntervalMs, pollMentions, reportError('poll'), { retryFromMs: POLL_RETRY_FROM_MS }),
    ...(tracker === undefined ? [] : [every(config.issuePollIntervalMs, pollIssues, reportError('issue_poll'))]),
  ]

  const startedAt = deps.now().toISOString()
  const statusServer = await startStatus(deps, log, () => ({
    ok: true,
    startedAt,
    stages: Object.fromEntries(stageCounts(store)),
    activeRuns: countActiveRuns(store),
    lastPollAt: poll.at,
    lastPollError: poll.error,
    consecutivePollFailures: poll.failures,
  }))

  return {
    ready: socket.ready,
    statusPort: statusServer?.port ?? null,
    async stop() {
      for (const stopLoop of stops) stopLoop()
      socket.stop()
      worker.stop()
      await worker.idle()
      await statusServer?.stop()
    },
  }
}
