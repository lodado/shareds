// What the worker keeps besides the item itself: the runs it started, the workspace each item is worked in, and the
// place each card was posted. Like the item store, every change is one transaction; runs, workspaces and pull
// request addresses are also logged.

import type { Card } from '../machine/machine.ts'
import type { RunEvent, RunState } from '../run/run.ts'
import type { RunKind } from './schema.ts'
import type { Row, Store } from './store.ts'
import { isRunState, runTransition } from '../run/run.ts'
import { isRunKind } from './schema.ts'
import { integer, inTransaction, logEvent, text, textOrNull, timestamp } from './store.ts'

export interface RunRow {
  id: number
  itemKey: string
  kind: RunKind
  state: RunState
  costUsd: number
  detail: string
  startedAt: string
  finishedAt: string | null
}

export interface WorkspaceRow {
  itemKey: string
  sessionId: string
  path: string
  branch: string
  baseRef: string
  plan: string
  prUrl: string | null
}

// What the caller knows before the run starts. `free` is not here: the store decides it from the runs it holds.
export interface Admission {
  registered: boolean
  allowed: boolean
  valid: boolean
}

// The detail of a run that ended because the owner stopped it, and of one that a restart called off. Neither is a
// failed try: they do not use up the retry budget and are not shown to an agent as a failure.
export const STOPPED_DETAIL = 'stopped by the owner'
export const RESTARTED_DETAIL = 'the worker restarted'

const RUN_COLUMNS = 'id, item_key, kind, state, cost_usd, detail, started_at, finished_at'

function toRunRow(row: Row): RunRow {
  const state = text(row, 'state')
  if (!isRunState(state)) throw new Error(`run ${integer(row, 'id')} has unknown state ${state}`)
  const kind = text(row, 'kind')
  if (!isRunKind(kind)) throw new Error(`run ${integer(row, 'id')} has unknown kind ${kind}`)
  const cost = row.cost_usd
  return {
    id: integer(row, 'id'),
    itemKey: text(row, 'item_key'),
    kind,
    state,
    costUsd: typeof cost === 'number' ? cost : 0,
    detail: text(row, 'detail'),
    startedAt: text(row, 'started_at'),
    finishedAt: textOrNull(row, 'finished_at'),
  }
}

// Runs the lifecycle's start step. An admitted run is stored as running; a refused one is stored as rejected and
// never counts as active, so a second run for the same item can be told apart from one that is in progress.
export function beginRun(store: Store, itemKey: string, kind: RunKind, admission: Admission): RunRow {
  return inTransaction(store, () => {
    const active = store.db.prepare(`SELECT 1 AS ok FROM runs WHERE item_key = ? AND state IN ('requested', 'running')`)
    const state = runTransition('requested', { type: 'start', ...admission, free: active.get(itemKey) === undefined })
    const now = timestamp(store)
    const finished = state === 'running' ? null : now
    const detail = state === 'running' ? '' : 'not admitted'
    const result = store.db
      .prepare(
        'INSERT INTO runs (item_key, kind, state, cost_usd, detail, started_at, finished_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
      )
      .run(itemKey, kind, state, detail, now, finished)
    const id = Number(result.lastInsertRowid)
    logEvent(store, { itemKey, kind: 'run', type: `${kind}_${state}`, payload: { runId: id, admission } })
    return toRunRow(store.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`).get(id) ?? {})
  })
}

export interface RunResult {
  costUsd?: number
  detail?: string
}

// A run that already ended is left as it is: a late finish from a worker that was cancelled changes nothing.
export function endRun(
  store: Store,
  runId: number,
  event: Extract<RunEvent, { type: 'finish' | 'cancel' }>,
  result: RunResult = {},
): RunRow {
  return inTransaction(store, () => {
    const row = store.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`).get(runId)
    if (!row) throw new Error(`unknown run ${runId}`)
    const before = toRunRow(row)
    const after = runTransition(before.state, event)
    if (after === before.state) return before
    store.db
      .prepare('UPDATE runs SET state = ?, cost_usd = ?, detail = ?, finished_at = ? WHERE id = ?')
      .run(after, result.costUsd ?? before.costUsd, result.detail ?? before.detail, timestamp(store), runId)
    logEvent(store, {
      itemKey: before.itemKey,
      kind: 'run',
      type: `${before.kind}_${after}`,
      payload: { runId, costUsd: result.costUsd ?? before.costUsd, detail: result.detail ?? '' },
    })
    return toRunRow(store.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`).get(runId) ?? {})
  })
}

export function activeRun(store: Store, itemKey: string): RunRow | undefined {
  const row = store.db
    .prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE item_key = ? AND state IN ('requested', 'running')`)
    .get(itemKey)
  return row ? toRunRow(row) : undefined
}

export function listRuns(store: Store, itemKey: string): RunRow[] {
  return store.db.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE item_key = ? ORDER BY id`).all(itemKey).map(toRunRow)
}

// How many runs are in progress, overall or in one repo; the worker's concurrency caps read this.
export function countActiveRuns(store: Store, repo?: string): number {
  const row =
    repo === undefined
      ? store.db.prepare(`SELECT COUNT(*) AS n FROM runs WHERE state IN ('requested', 'running')`).get()
      : store.db
          .prepare(
            `SELECT COUNT(*) AS n FROM runs JOIN items ON items.key = runs.item_key
             WHERE runs.state IN ('requested', 'running') AND items.repo = ?`,
          )
          .get(repo)
  return row ? integer(row, 'n') : 0
}

// Money already spent on one item, over all its runs.
export function spentOnItem(store: Store, itemKey: string): number {
  const row = store.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs WHERE item_key = ?').get(itemKey)
  const total = row?.total
  return typeof total === 'number' ? total : 0
}

// After a restart nothing from the old process is still running, so every run left in progress is called off. What
// it cost is unknown, so each is charged `charge` for its kind (the most it could have spent): a crash loop must
// still run into the item's spending cap.
export function cancelOrphanRuns(store: Store, charge: Readonly<Record<RunKind, number>>): number {
  const orphans = store.db
    .prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE state IN ('requested', 'running') ORDER BY id`)
    .all()
    .map(toRunRow)
  for (const run of orphans)
    endRun(store, run.id, { type: 'cancel' }, { costUsd: charge[run.kind], detail: RESTARTED_DETAIL })
  return orphans.length
}

const WORKSPACE_COLUMNS = 'item_key, session_id, path, branch, base_ref, plan, pr_url'

function toWorkspaceRow(row: Row): WorkspaceRow {
  return {
    itemKey: text(row, 'item_key'),
    sessionId: text(row, 'session_id'),
    path: text(row, 'path'),
    branch: text(row, 'branch'),
    baseRef: text(row, 'base_ref'),
    plan: text(row, 'plan'),
    prUrl: textOrNull(row, 'pr_url'),
  }
}

export function getWorkspace(store: Store, itemKey: string): WorkspaceRow | undefined {
  const row = store.db.prepare(`SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE item_key = ?`).get(itemKey)
  return row ? toWorkspaceRow(row) : undefined
}

export type NewWorkspace = Pick<WorkspaceRow, 'sessionId' | 'path' | 'branch' | 'baseRef'>

// Made once, when the first plan of the item starts; every later run of the item reuses it.
export function saveWorkspace(store: Store, itemKey: string, workspace: NewWorkspace): WorkspaceRow {
  return inTransaction(store, () => {
    store.db
      .prepare(
        `INSERT INTO workspaces (item_key, session_id, path, branch, base_ref, plan, pr_url)
         VALUES (?, ?, ?, ?, ?, '', NULL)`,
      )
      .run(itemKey, workspace.sessionId, workspace.path, workspace.branch, workspace.baseRef)
    logEvent(store, { itemKey, kind: 'system', type: 'workspace_saved', payload: workspace })
    return toWorkspaceRow(
      store.db.prepare(`SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE item_key = ?`).get(itemKey) ?? {},
    )
  })
}

export function setPlan(store: Store, itemKey: string, plan: string): void {
  inTransaction(store, () => {
    const result = store.db.prepare('UPDATE workspaces SET plan = ? WHERE item_key = ?').run(plan, itemKey)
    if (Number(result.changes) !== 1) throw new Error(`item ${itemKey} has no workspace`)
  })
}

export function setPrUrl(store: Store, itemKey: string, prUrl: string): void {
  inTransaction(store, () => {
    const result = store.db.prepare('UPDATE workspaces SET pr_url = ? WHERE item_key = ?').run(prUrl, itemKey)
    if (Number(result.changes) !== 1) throw new Error(`item ${itemKey} has no workspace`)
    logEvent(store, { itemKey, kind: 'system', type: 'pr_recorded', payload: { prUrl } })
  })
}

export interface CardRow {
  id: number
  itemKey: string
  kind: Card
  latest: boolean
}

const isCard = (value: string): value is Card => value === 'assign' || value === 'plan'

export function setCardSlackRef(store: Store, cardId: number, slackRef: string): void {
  inTransaction(store, () => {
    const result = store.db.prepare('UPDATE cards SET slack_ref = ? WHERE id = ?').run(slackRef, cardId)
    if (Number(result.changes) !== 1) throw new Error(`unknown card ${cardId}`)
  })
}

// The card that was posted at this place, if any, and whether it is still the latest of its kind for its item.
export function cardAt(store: Store, slackRef: string): CardRow | undefined {
  const row = store.db
    .prepare(
      `SELECT id, item_key, kind,
         id = (SELECT MAX(id) FROM cards AS other WHERE other.item_key = cards.item_key AND other.kind = cards.kind) AS latest
       FROM cards WHERE slack_ref = ?`,
    )
    .get(slackRef)
  if (!row) return undefined
  const kind = text(row, 'kind')
  if (!isCard(kind)) throw new Error(`card ${integer(row, 'id')} has unknown kind ${kind}`)
  return { id: integer(row, 'id'), itemKey: text(row, 'item_key'), kind, latest: integer(row, 'latest') === 1 }
}

// Whether an event of this type was ever logged for the item; the worker uses it to do a one-time job only once.
export function hasLogged(store: Store, itemKey: string, type: string): boolean {
  return (
    store.db.prepare('SELECT 1 AS ok FROM events WHERE item_key = ? AND type = ? LIMIT 1').get(itemKey, type) !==
    undefined
  )
}

function requestText(payload: string): string | undefined {
  const parsed: unknown = JSON.parse(payload)
  if (typeof parsed !== 'object' || parsed === null || !('text' in parsed)) return undefined
  return typeof parsed.text === 'string' ? parsed.text : undefined
}

export interface Instruction {
  // The latest request, which says whether a newer one came while a plan was being made.
  id: number
  // Every request since the last plan, oldest first.
  text: string
}

// What the owner asked to change in the plan and the plan has not answered yet. A plan that moved the item on
// answers all earlier requests; a stale one that was refused answers none.
export function pendingInstruction(store: Store, itemKey: string): Instruction | undefined {
  const rows = store.db
    .prepare(
      `SELECT id, payload FROM events WHERE item_key = ? AND type = 'revise_text'
         AND id > COALESCE(
           (SELECT MAX(id) FROM events WHERE item_key = ? AND type = 'plan_ready' AND outcome = 'moved'), 0)
       ORDER BY id`,
    )
    .all(itemKey, itemKey)
  const asked = rows.flatMap((row) => {
    const request = requestText(text(row, 'payload'))
    return request === undefined ? [] : [{ id: integer(row, 'id'), text: request }]
  })
  const last = asked.at(-1)
  if (last === undefined) return undefined
  return { id: last.id, text: asked.map((request) => request.text).join('\n') }
}

// Items of this stage whose worktree has not been removed or deliberately kept yet. Found in SQL so that old,
// finished items never crowd the new ones out.
export function cleanupKeys(store: Store, stage: 'declined' | 'merged'): string[] {
  return store.db
    .prepare(
      `SELECT items.key AS key FROM items JOIN workspaces ON workspaces.item_key = items.key
       WHERE items.stage = ? AND NOT EXISTS (
         SELECT 1 FROM events WHERE events.item_key = items.key
           AND events.type IN ('workspace_removed', 'workspace_kept'))
       ORDER BY items.created_at, items.key`,
    )
    .all(stage)
    .map((row) => text(row, 'key'))
}
