import type { Card, ItemEvent, Outcome, Stage } from '../machine/machine.ts'
import type { Analysis } from '../triage/analysis.ts'
import type { EventKind, ItemSource } from './schema.ts'
import { DatabaseSync } from 'node:sqlite'
import { decide, INITIAL_STAGE, isStage, nextStage, STAGES } from '../machine/machine.ts'
import { readAnalysis } from '../triage/analysis.ts'
import { redact } from './redact.ts'
import { isEventKind, isItemSource, SCHEMA, SCHEMA_VERSION } from './schema.ts'

export interface Store {
  readonly db: DatabaseSync
  readonly now: () => Date
}

export interface StoreOptions {
  now?: () => Date
  // How long a writer waits for another one before it gives up. Tests shorten it.
  busyTimeoutMs?: number
}

export interface ItemRow {
  key: string
  threadKey: string
  repo: string
  stage: Stage
  source: ItemSource
  task: string
  meta: ItemMeta
  createdAt: string
  updatedAt: string
}

// What a digest entry needs besides the key and the repo. Every field is optional because a DM item has no thread
// to link and a mention may not say why it was routed where it was.
export interface ItemMeta {
  summary?: string
  url?: string
  route?: string
  urgent?: boolean
  // What the cheapest model made of the thread, once it was asked.
  analysis?: Analysis
}

export interface NewItemOptions {
  // Defaults to a mention: work somebody else asked for, which waits for a digest approval.
  source?: ItemSource
  // The owner's task for each repo (from a DM prompt), keyed by repo name.
  tasks?: Readonly<Record<string, string>>
  // What the digest shows about each repo's item, keyed by repo name.
  meta?: Readonly<Record<string, ItemMeta>>
}

export interface EventRow {
  id: number
  ts: string
  itemKey: string | null
  kind: EventKind
  type: string
  stageBefore: string | null
  stageAfter: string | null
  outcome: string | null
  reason: string | null
  payload: string
}

export interface Applied {
  eventId: number
  before: Stage
  after: Stage
  outcome: Outcome
}

export interface LogEntry {
  itemKey?: string | null
  kind: EventKind
  type: string
  payload?: unknown
  stageBefore?: Stage | null
  stageAfter?: Stage | null
  outcome?: Outcome['kind'] | null
  reason?: string | null
}

export class UnknownItemError extends Error {
  readonly itemKey: string

  constructor(itemKey: string) {
    super(`unknown item ${itemKey}`)
    this.name = 'UnknownItemError'
    this.itemKey = itemKey
  }
}

const DEFAULT_BUSY_TIMEOUT_MS = 5000
const MAX_BUSY_TIMEOUT_MS = 60_000
const DEFAULT_EVENT_LIMIT = 1000
const MAX_EVENT_LIMIT = 10_000

export type Row = Record<string, unknown>

export function text(row: Row, column: string): string {
  const value = row[column]
  if (typeof value !== 'string') throw new Error(`column ${column} is not text`)
  return value
}

export function textOrNull(row: Row, column: string): string | null {
  const value = row[column]
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`column ${column} is not text`)
  return value
}

export function integer(row: Row, column: string): number {
  const value = row[column]
  if (typeof value !== 'number' && typeof value !== 'bigint') throw new Error(`column ${column} is not a number`)
  return Number(value)
}

const redactOrNull = (value: string | null | undefined): string | null => (value ? redact(value) : null)

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// A key is `thread#repo`; neither part may contain the separator, or two different pairs could share a key.
export const itemKeyOf = (threadKey: string, repo: string): string => `${threadKey}#${repo}`

// BEGIN IMMEDIATE takes the write lock up front, so two writers never interleave inside one item's change.
export function inTransaction<T>(store: Store, work: () => T): T {
  store.db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    store.db.exec('COMMIT')
    return result
  } catch (error) {
    // SQLite rolls some failures back by itself; ROLLBACK would then fail and hide the real error.
    if (store.db.isTransaction) store.db.exec('ROLLBACK')
    throw error
  }
}

// Read the version inside the write lock: two processes that open a new file at the same moment must not both
// try to create the tables.
function ensureSchema(store: Store): void {
  inTransaction(store, () => {
    const row = store.db.prepare('PRAGMA user_version').get()
    const current = row ? integer(row, 'user_version') : 0
    if (current === SCHEMA_VERSION) return
    if (current !== 0) throw new Error(`store schema version ${current} is not ${SCHEMA_VERSION}`)
    store.db.exec(SCHEMA)
    store.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })
}

export function openStore(path: string, options: StoreOptions = {}): Store {
  const busyTimeout = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS
  if (!Number.isInteger(busyTimeout) || busyTimeout < 0 || busyTimeout > MAX_BUSY_TIMEOUT_MS) {
    throw new RangeError(`busyTimeoutMs must be an integer from 0 to ${MAX_BUSY_TIMEOUT_MS}`)
  }
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    // Without this, INSERT OR REPLACE deletes the old row without firing the append-only delete trigger.
    db.exec('PRAGMA recursive_triggers = ON')
    db.exec(`PRAGMA busy_timeout = ${busyTimeout}`)
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
    const store: Store = { db, now: options.now ?? (() => new Date()) }
    ensureSchema(store)
    return store
  } catch (error) {
    db.close()
    throw error
  }
}

export function closeStore(store: Store): void {
  store.db.close()
}

export const timestamp = (store: Store): string => store.now().toISOString()

// Never throws because of the shape of a payload: whatever cannot be written as JSON is replaced by a marker,
// since losing the log row would lose the record of what happened. Secrets are removed from every string value
// before it is escaped into JSON, then once more from the whole text.
function serialize(payload: unknown): string {
  try {
    const json = JSON.stringify(payload ?? {}, (_key, value: unknown) => {
      if (typeof value === 'bigint') return value.toString()
      if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`
      return typeof value === 'string' ? redact(value) : value
    })
    return redact(json)
  } catch {
    return JSON.stringify('[unserializable payload]')
  }
}

export function logEvent(store: Store, entry: LogEntry): number {
  const result = store.db
    .prepare(
      `INSERT INTO events (ts, item_key, kind, type, stage_before, stage_after, outcome, reason, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      timestamp(store),
      entry.itemKey ?? null,
      entry.kind,
      redact(entry.type),
      entry.stageBefore ?? null,
      entry.stageAfter ?? null,
      entry.outcome ?? null,
      redactOrNull(entry.reason),
      serialize(entry.payload),
    )
  return Number(result.lastInsertRowid)
}

// One request that names several repos becomes several items. Running it twice creates nothing new.
export function createItems(
  store: Store,
  threadKey: string,
  repos: readonly string[],
  options: NewItemOptions = {},
): { key: string; created: boolean }[] {
  if (threadKey === '') throw new Error('threadKey must not be empty')
  if (repos.length === 0 || repos.includes('') || new Set(repos).size !== repos.length) {
    throw new Error('repos must be a non-empty list of distinct names')
  }
  if (threadKey.includes('#') || repos.some((repo) => repo.includes('#'))) {
    throw new Error('threadKey and repo names must not contain "#"')
  }
  const tasks = options.tasks ?? {}
  const stray = Object.keys(tasks).find((repo) => !repos.includes(repo))
  if (stray !== undefined) throw new Error(`a task names ${stray}, which is not one of the repos`)
  const metas = options.meta ?? {}
  const source = options.source ?? 'mention'
  return inTransaction(store, () =>
    repos.map((repo) => {
      const key = itemKeyOf(threadKey, repo)
      const now = timestamp(store)
      const task = Object.hasOwn(tasks, repo) ? tasks[repo] ?? '' : ''
      const result = store.db
        .prepare(
          'INSERT OR IGNORE INTO items (key, thread_key, repo, stage, source, task, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(key, threadKey, repo, INITIAL_STAGE, source, task, serialize(metas[repo] ?? {}), now, now)
      const created = Number(result.changes) === 1
      if (created) {
        logEvent(store, {
          itemKey: key,
          kind: 'item_created',
          type: 'item_created',
          payload: { threadKey, repo, source, task },
          stageAfter: INITIAL_STAGE,
        })
      }
      return { key, created }
    }),
  )
}

function applyInTransaction(store: Store, itemKey: string, event: ItemEvent): Applied {
  const row = store.db.prepare('SELECT stage FROM items WHERE key = ?').get(itemKey)
  if (!row) throw new UnknownItemError(itemKey)
  const before = text(row, 'stage')
  if (!isStage(before)) throw new Error(`item ${itemKey} has unknown stage ${before}`)
  const outcome = decide(before, event)
  const after = nextStage(before, outcome)
  if (after !== before) {
    store.db.prepare('UPDATE items SET stage = ?, updated_at = ? WHERE key = ?').run(after, timestamp(store), itemKey)
  }
  const eventId = logEvent(store, {
    itemKey,
    kind: 'item_event',
    type: event.type,
    payload: event,
    stageBefore: before,
    stageAfter: after,
    outcome: outcome.kind,
    reason: outcome.kind === 'refused' ? outcome.reason : null,
  })
  return { eventId, before, after, outcome }
}

// The decision, the stage change and the log row are one transaction, and every event is logged — a refused
// one with its reason too — so nothing a sender did is ever silently dropped.
export function applyEvent(store: Store, itemKey: string, event: ItemEvent): Applied {
  try {
    return inTransaction(store, () => applyInTransaction(store, itemKey, event))
  } catch (error) {
    // The transaction rolled back, so the failure is recorded on its own. The row has no item key because the
    // key may not exist.
    try {
      logEvent(store, {
        kind: 'system',
        type: 'apply_failed',
        payload: { itemKey, event, error: errorMessage(error) },
      })
    } catch (logError) {
      // The change and its record both failed; say so instead of letting one hide the other.
      throw new AggregateError([error, logError], `could not apply an event to ${itemKey} and could not log it`)
    }
    throw error
  }
}

// A card is fresh while no newer card of the same kind was sent for the same item.
export function issueCard(store: Store, itemKey: string, kind: Card): number {
  const result = store.db
    .prepare('INSERT INTO cards (item_key, kind, created_at) VALUES (?, ?, ?)')
    .run(itemKey, kind, timestamp(store))
  return Number(result.lastInsertRowid)
}

// The id must belong to this item and this kind, so the freshness of one item's card can never vouch for
// another's.
export function isLatestCard(store: Store, itemKey: string, kind: Card, cardId: number): boolean {
  const latest = store.db.prepare('SELECT MAX(id) AS id FROM cards WHERE item_key = ? AND kind = ?').get(itemKey, kind)
  return latest !== undefined && latest.id !== null && integer(latest, 'id') === cardId
}

const ITEM_COLUMNS = 'key, thread_key, repo, stage, source, task, meta, created_at, updated_at'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Only the known fields with the right type are kept, so a damaged or hand-edited row cannot put anything else into
// a message.
function parseMeta(json: string): ItemMeta {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) return {}
  const { summary, url, route, urgent, analysis } = parsed
  const read = readAnalysis(analysis)
  return {
    ...(typeof summary === 'string' ? { summary } : {}),
    ...(typeof url === 'string' ? { url } : {}),
    ...(typeof route === 'string' ? { route } : {}),
    ...(typeof urgent === 'boolean' ? { urgent } : {}),
    ...(read === undefined ? {} : { analysis: read }),
  }
}

function toItemRow(row: Row): ItemRow {
  const key = text(row, 'key')
  const stage = text(row, 'stage')
  if (!isStage(stage)) throw new Error(`item ${key} has unknown stage ${stage}`)
  const source = text(row, 'source')
  if (!isItemSource(source)) throw new Error(`item ${key} has unknown source ${source}`)
  return {
    key,
    threadKey: text(row, 'thread_key'),
    repo: text(row, 'repo'),
    stage,
    source,
    task: text(row, 'task'),
    meta: parseMeta(text(row, 'meta')),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  }
}

// Keeps what the cheapest model made of an item next to its other digest fields.
export function setAnalysis(store: Store, itemKey: string, analysis: Analysis): void {
  inTransaction(store, () => {
    const row = store.db.prepare('SELECT meta FROM items WHERE key = ?').get(itemKey)
    if (!row) throw new UnknownItemError(itemKey)
    let current: unknown
    try {
      current = JSON.parse(text(row, 'meta'))
    } catch {
      current = {}
    }
    const meta = { ...(isRecord(current) ? current : {}), analysis }
    store.db
      .prepare('UPDATE items SET meta = ?, updated_at = ? WHERE key = ?')
      .run(serialize(meta), timestamp(store), itemKey)
    logEvent(store, { itemKey, kind: 'system', type: 'analysis_saved', payload: { recommend: analysis.recommend } })
  })
}

export function getItem(store: Store, itemKey: string): ItemRow | undefined {
  const row = store.db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE key = ?`).get(itemKey)
  return row ? toItemRow(row) : undefined
}

function checkLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENT_LIMIT) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_EVENT_LIMIT}`)
  }
}

// Oldest first, so a long list is worked through in the order the work arrived.
export function listItems(store: Store, filter: { stage?: Stage; limit?: number } = {}): ItemRow[] {
  const limit = filter.limit ?? DEFAULT_EVENT_LIMIT
  checkLimit(limit)
  const rows =
    filter.stage === undefined
      ? store.db.prepare(`SELECT ${ITEM_COLUMNS} FROM items ORDER BY created_at, key LIMIT ?`).all(limit)
      : store.db
          .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE stage = ? ORDER BY created_at, key LIMIT ?`)
          .all(filter.stage, limit)
  return rows.map(toItemRow)
}

// How many items are in each stage, with a zero for a stage nothing is in.
export function stageCounts(store: Store): Map<Stage, number> {
  const counts = new Map<Stage, number>(STAGES.map((stage) => [stage, 0]))
  for (const row of store.db.prepare('SELECT stage, COUNT(*) AS n FROM items GROUP BY stage').all()) {
    const stage = text(row, 'stage')
    if (isStage(stage)) counts.set(stage, integer(row, 'n'))
  }
  return counts
}

// The items in any of these stages, oldest first. Finished items are left out in SQL, so a long history cannot push
// the open ones past the limit.
export function listOpenItems(store: Store, stages: readonly Stage[], limit = DEFAULT_EVENT_LIMIT): ItemRow[] {
  checkLimit(limit)
  if (stages.length === 0) return []
  const marks = stages.map(() => '?').join(', ')
  return store.db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE stage IN (${marks}) ORDER BY created_at, key LIMIT ?`)
    .all(...stages, limit)
    .map(toItemRow)
}

// Every item made from one thread, whatever repo it was routed to.
export function itemsOfThread(store: Store, threadKey: string): ItemRow[] {
  return store.db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE thread_key = ? ORDER BY created_at, key`)
    .all(threadKey)
    .map(toItemRow)
}

// A mention that is waiting for the owner and has not been listed in any digest yet. Items the owner asked for in
// a DM never wait for a digest, and an item already listed once is never listed again.
const WAITING_FOR_DIGEST = `stage = 'notified' AND source = 'mention' AND key NOT IN (SELECT item_key FROM digest_items)`

export function pendingForDigest(store: Store, limit = 40): ItemRow[] {
  checkLimit(limit)
  return store.db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE ${WAITING_FOR_DIGEST} ORDER BY created_at, key LIMIT ?`)
    .all(limit)
    .map(toItemRow)
}

// Lists these items in a new digest. Every one must still be waiting, so a digest can only hold what is new.
export function createDigest(store: Store, itemKeys: readonly string[]): number {
  if (itemKeys.length === 0 || new Set(itemKeys).size !== itemKeys.length) {
    throw new Error('a digest needs a non-empty list of distinct items')
  }
  return inTransaction(store, () => {
    const waiting = store.db.prepare(`SELECT 1 AS ok FROM items WHERE key = ? AND ${WAITING_FOR_DIGEST}`)
    for (const key of itemKeys) {
      if (!waiting.get(key)) throw new Error(`item ${key} is not waiting for a digest`)
    }
    const created = store.db.prepare('INSERT INTO digests (created_at) VALUES (?)').run(timestamp(store))
    const digestId = Number(created.lastInsertRowid)
    const link = store.db.prepare('INSERT INTO digest_items (digest_id, item_key) VALUES (?, ?)')
    for (const key of itemKeys) link.run(digestId, key)
    logEvent(store, { kind: 'outbound', type: 'digest_created', payload: { digestId, itemKeys } })
    return digestId
  })
}

// Where the digest DM was posted, so a click on it can be matched to the digest later.
export function setDigestSlackRef(store: Store, digestId: number, slackRef: string): void {
  inTransaction(store, () => {
    const result = store.db.prepare('UPDATE digests SET slack_ref = ? WHERE id = ?').run(slackRef, digestId)
    if (Number(result.changes) !== 1) throw new Error(`unknown digest ${digestId}`)
    logEvent(store, { kind: 'outbound', type: 'digest_sent', payload: { digestId, slackRef } })
  })
}

// Digests that were made but whose DM never went out (Slack was down, say). They are sent again before anything new.
export function unsentDigestIds(store: Store): number[] {
  return store.db
    .prepare('SELECT id FROM digests WHERE slack_ref IS NULL ORDER BY id')
    .all()
    .map((row) => integer(row, 'id'))
}

// The items a click on this digest may act on. A click payload is untrusted: only these keys count.
export function digestItems(store: Store, digestId: number): string[] {
  return store.db
    .prepare('SELECT item_key FROM digest_items WHERE digest_id = ? ORDER BY rowid')
    .all(digestId)
    .map((row) => text(row, 'item_key'))
}

function toEventRow(row: Row): EventRow {
  const kind = text(row, 'kind')
  if (!isEventKind(kind)) throw new Error(`event ${integer(row, 'id')} has unknown kind ${kind}`)
  return {
    id: integer(row, 'id'),
    ts: text(row, 'ts'),
    itemKey: textOrNull(row, 'item_key'),
    kind,
    type: text(row, 'type'),
    stageBefore: textOrNull(row, 'stage_before'),
    stageAfter: textOrNull(row, 'stage_after'),
    outcome: textOrNull(row, 'outcome'),
    reason: textOrNull(row, 'reason'),
    payload: text(row, 'payload'),
  }
}

const EVENT_COLUMNS = 'id, ts, item_key, kind, type, stage_before, stage_after, outcome, reason, payload'

export function listEvents(
  store: Store,
  filter: { itemKey?: string; afterId?: number; limit?: number } = {},
): EventRow[] {
  const afterId = filter.afterId ?? 0
  const limit = filter.limit ?? DEFAULT_EVENT_LIMIT
  if (!Number.isInteger(afterId) || afterId < 0) throw new RangeError('afterId must be an integer of 0 or more')
  checkLimit(limit)
  // Two statements, so the per-item one can use the (item_key, id) index.
  const rows =
    filter.itemKey === undefined
      ? store.db.prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE id > ? ORDER BY id LIMIT ?`).all(afterId, limit)
      : store.db
          .prepare(`SELECT ${EVENT_COLUMNS} FROM events WHERE item_key = ? AND id > ? ORDER BY id LIMIT ?`)
          .all(filter.itemKey, afterId, limit)
  return rows.map(toEventRow)
}
