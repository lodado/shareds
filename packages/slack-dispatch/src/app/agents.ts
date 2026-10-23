// The small agents the service starts on the cheapest model. One cuts a DM prompt into per-repo tasks; the other reads
// a new mention and tells the owner what it asks, why it probably happens, how to fix it and whether it is worth an
// automatic change. Both are bounded, and what they return is checked by the caller.

import type { Agent } from '../agent/claude.ts'
import type { ItemRow } from '../store/store.ts'
import type { Analysis } from '../triage/analysis.ts'
import { extractJson, splitPrompt, triagePrompt } from '../agent/prompts.ts'
import { clip } from '../slack/blocks.ts'
import { parseAnalysis } from '../triage/analysis.ts'

const SPLIT_BUDGET_USD = 0.3
const SPLIT_TIMEOUT_MS = 90_000
const TRIAGE_BUDGET_USD = 0.15
const TRIAGE_TIMEOUT_MS = 120_000
const UNROUTED = 'unrouted'
const FALLBACK_THREAD_CHARS = 600

export interface SmallAgentDeps {
  agent: Agent
  newSessionId: () => string
  // Told what a call cost, whether or not it worked: these runs are not the worker's, so nothing else records them.
  onCost: (what: 'split' | 'triage', costUsd: number) => void
}

// Runs in an empty folder: the request is about other repos, so no repo's files or rules are loaded.
export function createSplitAgent(
  deps: SmallAgentDeps,
  scratchDir: string,
): (prompt: string, repos: readonly string[]) => Promise<unknown> {
  return async (prompt, repos) => {
    const result = await deps.agent({
      cwd: scratchDir,
      prompt: splitPrompt(prompt, repos),
      sessionId: deps.newSessionId(),
      resume: false,
      mode: 'text',
      model: 'haiku',
      maxBudgetUsd: SPLIT_BUDGET_USD,
      timeoutMs: SPLIT_TIMEOUT_MS,
    })
    deps.onCost('split', result.costUsd)
    if (!result.ok) throw new Error(`the splitting agent stopped (${result.subtype})`)
    return extractJson(result.text)
  }
}

// Reads the thread and, for a routed item, the repo's main checkout without changing it. An item that could not be
// routed is judged from the thread alone and is never recommended: there is no repo to plan in.
export function createTriageAgent(
  deps: SmallAgentDeps,
  scratchDir: string,
  repoPath: (repo: string) => Promise<string | undefined>,
  loadThread: (item: ItemRow) => Promise<string>,
): (item: ItemRow) => Promise<Analysis> {
  return async (item) => {
    const path = item.repo === UNROUTED ? undefined : await repoPath(item.repo)
    const thread = await loadThread(item)
    const result = await deps.agent({
      cwd: path ?? scratchDir,
      prompt: triagePrompt(
        path === undefined ? '' : item.repo,
        thread === '' ? clip(item.meta.summary ?? '', FALLBACK_THREAD_CHARS) : thread,
      ),
      sessionId: deps.newSessionId(),
      resume: false,
      mode: path === undefined ? 'text' : 'plan',
      model: 'haiku',
      maxBudgetUsd: TRIAGE_BUDGET_USD,
      timeoutMs: TRIAGE_TIMEOUT_MS,
    })
    deps.onCost('triage', result.costUsd)
    if (!result.ok) throw new Error(`the triage agent stopped (${result.subtype})`)
    const analysis = parseAnalysis(extractJson(result.text))
    if (path !== undefined) return analysis
    return { ...analysis, recommend: false, why: '레포를 정하지 못해서 구현할 수 없어요' }
  }
}
