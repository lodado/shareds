import { join } from 'node:path'
import { classify, limitVerdict } from './gate.mjs'
import {
  assertConsistent,
  currentScreen,
  FILES,
  handledKeys,
  loadRun,
  pendingGate,
  unexploredOf,
  usedActions,
} from './state.mjs'
import { appendJsonl, pad, withRunLock } from './store.mjs'

const suggestion = (candidate, needsContext) => ({
  action: candidate.action,
  role: candidate.role,
  id: candidate.id,
  label: candidate.label,
  actionKey: candidate.key,
  ...(needsContext && { needsContext: true }),
})

/** Shortest route over recorded transitions that the gate would still allow, from `start` to a goal screen. */
function route(state, start, isGoal, used) {
  const screens = new Map(state.screens.map((screen) => [screen.id, screen]))
  const viable = (edge) => !limitVerdict(state, screens.get(edge.from), edge.action.type, edge.actionKey, used)
  const queue = [{ screenId: start, steps: [] }]
  const seen = new Set([start])
  while (queue.length > 0) {
    const { screenId, steps } = queue.shift()
    if (steps.length > 0 && isGoal(screenId)) return { to: screenId, steps }
    for (const edge of state.transitions.filter(
      (item) => item.from === screenId && !seen.has(item.to) && viable(item),
    )) {
      seen.add(edge.to)
      const { type, ...rest } = edge.action
      queue.push({
        screenId: edge.to,
        steps: [...steps, { action: type, ...rest, actionKey: edge.actionKey, transitionId: edge.id }],
      })
    }
  }
  return null
}

/** Candidates the content rules block are logged once as blocked gates; confirm-only ones wait for dialog text. */
async function previewBlocked(state, handled) {
  let issued = state.gates.length
  let recorded = 0
  const waiting = new Set()
  for (const screen of state.screens) {
    for (const candidate of unexploredOf(state, screen, handled)) {
      const verdict = classify({
        action: candidate.action,
        label: candidate.label,
        id: candidate.id,
        role: candidate.role,
      })
      if (verdict?.category === 'context-required') waiting.add(`${screen.id}|${candidate.key}`)
      if (!verdict || verdict.category === 'context-required') continue
      issued += 1
      recorded += 1
      handled.add(`${screen.id}|${candidate.key}`)
      await appendJsonl(join(state.dir, FILES.gates), {
        kind: 'gate',
        gateId: `G-${pad(issued, 4)}`,
        at: new Date().toISOString(),
        screenId: screen.id,
        action: candidate.action,
        label: candidate.label,
        role: candidate.role,
        id: candidate.id,
        actionKey: candidate.key,
        decision: 'blocked',
        category: verdict.category,
        reason: verdict.reason,
        humanAction: verdict.humanAction,
        source: 'preview',
      })
    }
  }
  return { recorded, waiting }
}

async function plan(runDir, limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer')
  const state = await loadRun(runDir)
  const { run } = state
  assertConsistent(state)
  const here = currentScreen(state)
  const used = usedActions(state) + (pendingGate(state) ? 1 : 0)
  const budget = { used, max: run.maxActions, remaining: run.maxActions - used }

  const handled = handledKeys(state)
  const { recorded, waiting } = await previewBlocked(state, handled)
  const base = { current: here.id, budget, recordedBlocked: recorded }
  const open = (screen) => screen.depth < run.maxDepth && unexploredOf(state, screen, handled).length > 0
  if (budget.remaining <= 0) return { ...base, done: true, reason: 'budget-spent', candidates: [], route: null }
  if (open(here)) {
    const candidates = unexploredOf(state, here, handled)
      .slice(0, limit)
      .map((candidate) => suggestion(candidate, waiting.has(`${here.id}|${candidate.key}`)))
    return { ...base, done: false, candidates, route: null }
  }
  const goals = new Set(state.screens.filter(open).map((screen) => screen.id))
  const found = route(state, here.id, (screenId) => goals.has(screenId), used)
  if (found) return { ...base, done: false, candidates: [], route: found }
  // Unexplored screens exist but no allowed recorded transition leads there: navigate (back, relaunch) and observe.
  if (goals.size > 0) return { ...base, done: false, candidates: [], route: null, unreachable: [...goals] }
  return { ...base, done: true, reason: 'frontier-empty', candidates: [], route: null }
}

/**
 * What to do next. Candidates the content rules would block are logged as blocked gates here (once each), so
 * the human-action list in the report is complete without the agent gating them one by one.
 */
export const next = (runDir, { limit = 10 } = {}) => withRunLock(runDir, () => plan(runDir, limit))
