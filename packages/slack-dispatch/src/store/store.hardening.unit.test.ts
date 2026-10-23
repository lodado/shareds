import type { Store, StoreOptions } from './store'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { STAGES } from '../machine/machine'
import { REDACTED } from './redact'
import {
  applyEvent,
  closeStore,
  createItems,
  getItem,
  isLatestCard,
  issueCard,
  itemKeyOf,
  listEvents,
  logEvent,
  openStore,
} from './store'

const THREAD = 'slack:C1:1730000000.000100'

const opened: Store[] = []
const directories: string[] = []

function remember(store: Store): Store {
  opened.push(store)
  return store
}

const memoryStore = (): Store => remember(openStore(':memory:'))

function fileStore(options: StoreOptions = {}, name = 'state.db'): { store: Store; path: string } {
  let dir = directories.at(-1)
  if (dir === undefined) {
    dir = mkdtempSync(join(tmpdir(), 'slack-dispatch-hardening-'))
    directories.push(dir)
  }
  const path = join(dir, name)
  return { store: remember(openStore(path, options)), path }
}

afterEach(() => {
  for (const store of opened.splice(0)) {
    try {
      closeStore(store)
    } catch {
      // already closed by the test
    }
  }
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const failLogsOf = (store: Store, condition: string): void => {
  store.db.exec(
    `CREATE TRIGGER log_down BEFORE INSERT ON events WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'log down'); END`,
  )
}

// built at run time so no token-shaped literal sits in the source
const botToken = ['xoxb', '1234567890', 'abcdefABCDEF'].join('-')

describe('applyEvent and createItems as one transaction each', () => {
  it('to be a stage change that is undone when its log row cannot be written, with the failure logged apart', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const key = itemKeyOf(THREAD, 'web-app')
    failLogsOf(store, "NEW.type = 'triage'")
    expect(() => applyEvent(store, key, { type: 'triage', handled: false, confident: false })).toThrow('log down')
    expect(getItem(store, key)?.stage).toBe('ingested')
    const rows = listEvents(store)
    expect(rows.map((row) => [row.kind, row.type])).toEqual([
      ['item_created', 'item_created'],
      ['system', 'apply_failed'],
    ])
    expect(JSON.parse(rows[1]?.payload ?? '{}')).toMatchObject({ itemKey: key, error: 'log down' })
  })

  it('to be no item and no log row at all when the request fails halfway', () => {
    const store = memoryStore()
    failLogsOf(store, "NEW.payload LIKE '%docs%'")
    expect(() => createItems(store, THREAD, ['web-app', 'docs'])).toThrow('log down')
    expect(getItem(store, itemKeyOf(THREAD, 'web-app'))).toBeUndefined()
    expect(listEvents(store)).toEqual([])
  })

  it('to be both errors reported when the change and the record of the failure both fail', () => {
    const { store, path } = fileStore({ busyTimeoutMs: 20 })
    createItems(store, THREAD, ['web-app'])
    const holder = remember(openStore(path, { busyTimeoutMs: 20 }))
    holder.db.exec('BEGIN IMMEDIATE')
    let caught: unknown
    try {
      applyEvent(store, itemKeyOf(THREAD, 'web-app'), { type: 'abort' })
    } catch (error) {
      caught = error
    }
    holder.db.exec('ROLLBACK')
    if (!(caught instanceof AggregateError)) throw new Error('expected an AggregateError', { cause: caught })
    expect(caught.message).toBe(`could not apply an event to ${itemKeyOf(THREAD, 'web-app')} and could not log it`)
    expect(caught.errors.map((error: unknown) => (error instanceof Error ? error.message : String(error)))).toEqual([
      'database is locked',
      'database is locked',
    ])
    expect(getItem(store, itemKeyOf(THREAD, 'web-app'))?.stage).toBe('ingested')
  })
})

describe('openStore as the settings that keep the log trustworthy', () => {
  it('to be a database that checks foreign keys', () => {
    const store = memoryStore()
    expect(store.db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(() => logEvent(store, { itemKey: 'ghost#web-app', kind: 'system', type: 'x' })).toThrow(
      'FOREIGN KEY constraint failed',
    )
  })

  it('to be a file database in WAL mode with the busy timeout that was asked for', () => {
    const { store } = fileStore({ busyTimeoutMs: 20 })
    expect(store.db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
    expect(store.db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 20 })
  })

  it.each([[-1], [1.5], [60_001], [Number.NaN]])('to be refused for a busy timeout of %s', (value) => {
    expect(() => openStore(':memory:', { busyTimeoutMs: value })).toThrow(
      'busyTimeoutMs must be an integer from 0 to 60000',
    )
  })

  it('to be a second process opening the same file without trying to create the tables again', () => {
    const { store, path } = fileStore()
    createItems(store, THREAD, ['web-app'])
    const second = remember(openStore(path))
    expect(second.db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
    expect(getItem(second, itemKeyOf(THREAD, 'web-app'))?.stage).toBe('ingested')
  })

  it('to be a store whose stage list and event kinds are enforced by the tables', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const key = itemKeyOf(THREAD, 'web-app')
    for (const stage of STAGES) store.db.prepare('UPDATE items SET stage = ? WHERE key = ?').run(stage, key)
    expect(() => store.db.prepare("UPDATE items SET stage = 'bogus' WHERE key = ?").run(key)).toThrow(
      'CHECK constraint failed',
    )
    expect(() =>
      store.db.exec("INSERT INTO events (ts, kind, type, payload) VALUES ('t', 'bogus', 'x', '{}')"),
    ).toThrow('CHECK constraint failed')
  })
})

describe('the append-only log as something INSERT OR REPLACE cannot rewrite', () => {
  it('to be refused and leave the original row as it was', () => {
    const store = memoryStore()
    const id = logEvent(store, { kind: 'system', type: 'original' })
    expect(() =>
      store.db
        .prepare(
          "INSERT OR REPLACE INTO events (id, ts, kind, type, payload) VALUES (?, 't', 'system', 'forged', '{}')",
        )
        .run(id),
    ).toThrow('events is append-only')
    expect(listEvents(store).map((row) => row.type)).toEqual(['original'])
  })
})

describe('logEvent as a place where no secret may land', () => {
  it('to be a type and a reason with the secret replaced', () => {
    const store = memoryStore()
    logEvent(store, { kind: 'system', type: `post ${botToken}`, reason: `Bearer ${'a'.repeat(20)}` })
    expect(listEvents(store).map((row) => [row.type, row.reason])).toEqual([[`post ${REDACTED}`, REDACTED]])
  })

  it.each([
    ['a newline', '\n'],
    ['a tab', '\t'],
    ['a carriage return', '\r'],
    ['a form feed', '\f'],
  ])('to be an authorization header split by %s still replaced', (_name, space) => {
    const store = memoryStore()
    logEvent(store, { kind: 'system', type: 'x', payload: { error: `Authorization: Bearer${space}${'a'.repeat(20)}` } })
    expect(listEvents(store)[0]?.payload).toBe(`{"error":"Authorization: ${REDACTED}"}`)
  })

  it('to be secrets replaced in nested objects and lists, and in keys of the text as a whole', () => {
    const store = memoryStore()
    logEvent(store, {
      kind: 'system',
      type: 'x',
      payload: { list: [{ deep: `use ${botToken} now` }], hook: 'https://hooks.slack.com/services/T000/B000/abcdef' },
    })
    expect(listEvents(store)[0]?.payload).toBe(`{"list":[{"deep":"use ${REDACTED} now"}],"hook":"https://${REDACTED}"}`)
  })

  it('to be a token used as an object key replaced too', () => {
    const store = memoryStore()
    logEvent(store, { kind: 'system', type: 'x', payload: { [botToken]: 1 } })
    expect(listEvents(store)[0]?.payload).toBe(`{"${REDACTED}":1}`)
  })

  it('to be a base64 Basic credential replaced but the words "basic authentication" kept', () => {
    const store = memoryStore()
    logEvent(store, {
      kind: 'system',
      type: 'x',
      payload: {
        a: 'Authorization: Basic dXNlcjpwYXNzMTIz',
        b: 'basic authentication is off',
        c: 'sent Basic YWJjZDEyMzQ= twice',
      },
    })
    expect(listEvents(store)[0]?.payload).toBe(
      `{"a":"${REDACTED}","b":"basic authentication is off","c":"sent ${REDACTED} twice"}`,
    )
  })
})

describe('logEvent as a payload that cannot be written as plain JSON', () => {
  it.each([
    ['a bigint inside an object', { n: 12n }, '{"n":"12"}'],
    ['a function inside an object', { run: () => 1 }, '{"run":"[function]"}'],
    ['a function by itself', () => 1, '"[function]"'],
    ['a symbol by itself', Symbol('x'), '"[symbol]"'],
    ['undefined', undefined, '{}'],
    ['null', null, '{}'],
  ])('to be stored as a marker or a string for %s', (_name, payload, stored) => {
    const store = memoryStore()
    logEvent(store, { kind: 'system', type: 'x', payload })
    expect(listEvents(store)[0]?.payload).toBe(stored)
  })

  it('to be a marker for a payload that refers to itself', () => {
    const store = memoryStore()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    logEvent(store, { kind: 'system', type: 'x', payload: loop })
    expect(listEvents(store)[0]?.payload).toBe('"[unserializable payload]"')
  })
})

describe('createItems as keys that could collide', () => {
  it.each([
    ['a thread key with the separator', 'a#b', ['c']],
    ['a repo name with the separator', 'a', ['b#c']],
  ])('to be refused for %s', (_name, thread, repos) => {
    const store = memoryStore()
    expect(() => createItems(store, thread, repos)).toThrow('threadKey and repo names must not contain "#"')
    expect(listEvents(store)).toEqual([])
  })

  it('to be one item per thread and repo, enforced by the table too', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const insert = store.db.prepare(
      "INSERT INTO items (key, thread_key, repo, stage, source, task, meta, created_at, updated_at) VALUES (?, ?, ?, 'ingested', 'mention', '', '{}', 't', 't')",
    )
    expect(() => insert.run('another-key', THREAD, 'web-app')).toThrow('UNIQUE constraint failed')
  })
})

describe('listEvents as a read with bounds', () => {
  it.each([[0], [-1], [10_001], [1.5], [Number.NaN]])('to be refused for a limit of %s', (limit) => {
    expect(() => listEvents(memoryStore(), { limit })).toThrow('limit must be an integer from 1 to 10000')
  })

  it.each([[-1], [1.5], [Number.NaN]])('to be refused for an afterId of %s', (afterId) => {
    expect(() => listEvents(memoryStore(), { afterId })).toThrow('afterId must be an integer of 0 or more')
  })

  it('to be accepted at the largest limit and read back with typed kinds', () => {
    const store = memoryStore()
    logEvent(store, { kind: 'inbound', type: 'slack_payload' })
    expect(listEvents(store, { limit: 10_000 }).map((row) => row.kind)).toEqual(['inbound'])
  })
})

describe('isLatestCard as a check that is tied to the item it is asked about', () => {
  it('to be false when the item has the card of another thread with the same repo name', () => {
    const store = memoryStore()
    createItems(store, 'slack:C1:1', ['web-app'])
    createItems(store, 'slack:C1:2', ['web-app'])
    const first = issueCard(store, itemKeyOf('slack:C1:1', 'web-app'), 'plan')
    expect(isLatestCard(store, itemKeyOf('slack:C1:2', 'web-app'), 'plan', first)).toBe(false)
  })
})
