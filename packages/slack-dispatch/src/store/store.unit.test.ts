import type { Store } from './store'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { redact, REDACTED } from './redact'
import {
  applyEvent,
  closeStore,
  createItems,
  getItem,
  isLatestCard,
  issueCard,
  itemKeyOf,
  listEvents,
  listOpenItems,
  logEvent,
  openStore,
  UnknownItemError,
} from './store'

const THREAD = 'slack:C1:1730000000.000100'
const OWNER_APPROVES_ASSIGN = { type: 'approve', owner: true, card: 'assign', fresh: true } as const

// A clock that moves one second per call, so a row's time says which write came first.
function steppingClock(): () => Date {
  let seconds = -1
  return () => {
    seconds += 1
    return new Date(Date.UTC(2026, 9, 23, 0, 0, seconds))
  }
}

const opened: Store[] = []
function memoryStore(): Store {
  const store = openStore(':memory:', { now: steppingClock() })
  opened.push(store)
  return store
}

afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function tableNames(store: Store): string[] {
  const rows = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
  return rows.map((row) => String(row.name))
}

describe('openStore as a new database', () => {
  it('to be the seven tables of schema version 1', () => {
    const store = memoryStore()
    expect(tableNames(store)).toEqual(['cards', 'digest_items', 'digests', 'events', 'items', 'runs', 'workspaces'])
    expect(store.db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
  })

  it('to be refused when the file carries another schema version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slack-dispatch-store-'))
    try {
      const path = join(dir, 'state.db')
      const first = openStore(path)
      first.db.exec('PRAGMA user_version = 99')
      closeStore(first)
      expect(() => openStore(path)).toThrow('store schema version 99 is not 1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('to be reopened with its rows still there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slack-dispatch-store-'))
    try {
      const path = join(dir, 'state.db')
      const first = openStore(path)
      createItems(first, THREAD, ['web-app'])
      closeStore(first)
      const second = openStore(path)
      opened.push(second)
      expect(getItem(second, itemKeyOf(THREAD, 'web-app'))?.stage).toBe('ingested')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('createItems as one request that names several repos', () => {
  it('to be one ingested item per repo, each with an item_created log row', () => {
    const store = memoryStore()
    const created = createItems(store, THREAD, ['web-app', 'api-server', 'docs'])
    expect(created).toEqual([
      { key: `${THREAD}#web-app`, created: true },
      { key: `${THREAD}#api-server`, created: true },
      { key: `${THREAD}#docs`, created: true },
    ])
    expect(getItem(store, `${THREAD}#api-server`)).toEqual({
      key: `${THREAD}#api-server`,
      threadKey: THREAD,
      repo: 'api-server',
      stage: 'ingested',
      source: 'mention',
      task: '',
      meta: {},
      createdAt: '2026-10-23T00:00:02.000Z',
      updatedAt: '2026-10-23T00:00:02.000Z',
    })
    expect(listEvents(store).map((row) => [row.itemKey, row.kind, row.stageAfter])).toEqual([
      [`${THREAD}#web-app`, 'item_created', 'ingested'],
      [`${THREAD}#api-server`, 'item_created', 'ingested'],
      [`${THREAD}#docs`, 'item_created', 'ingested'],
    ])
  })

  it('to be nothing new when the same request arrives again', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const again = createItems(store, THREAD, ['web-app', 'api-server'])
    expect(again).toEqual([
      { key: `${THREAD}#web-app`, created: false },
      { key: `${THREAD}#api-server`, created: true },
    ])
    expect(listEvents(store)).toHaveLength(2)
  })

  it.each([
    ['an empty thread key', '', ['web-app'], 'threadKey must not be empty'],
    ['no repos', THREAD, [], 'repos must be a non-empty list of distinct names'],
    ['an empty repo name', THREAD, ['web-app', ''], 'repos must be a non-empty list of distinct names'],
    ['a repeated repo', THREAD, ['web-app', 'web-app'], 'repos must be a non-empty list of distinct names'],
  ])('to be refused for %s', (_name, thread, repos, message) => {
    const store = memoryStore()
    expect(() => createItems(store, thread, repos)).toThrow(message)
    expect(listEvents(store)).toEqual([])
  })
})

describe('applyEvent as an event for one item', () => {
  it('to be a move that updates the stage and logs the before, the after and the outcome', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const key = itemKeyOf(THREAD, 'web-app')
    const triaged = applyEvent(store, key, { type: 'triage', handled: false, confident: true })
    expect(triaged).toMatchObject({ before: 'ingested', after: 'planning', outcome: { kind: 'moved', to: 'planning' } })
    expect(getItem(store, key)?.stage).toBe('planning')
    const row = listEvents(store, { itemKey: key }).at(-1)
    expect(row).toMatchObject({
      kind: 'item_event',
      type: 'triage',
      stageBefore: 'ingested',
      stageAfter: 'planning',
      outcome: 'moved',
      reason: null,
      payload: '{"type":"triage","handled":false,"confident":true}',
    })
  })

  it('to be a refusal that keeps the stage and the update time, and is logged with its reason', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const key = itemKeyOf(THREAD, 'web-app')
    const before = getItem(store, key)
    const result = applyEvent(store, key, { ...OWNER_APPROVES_ASSIGN, owner: false })
    expect(result.outcome).toEqual({ kind: 'refused', reason: 'not_owner' })
    expect(getItem(store, key)).toEqual(before)
    expect(listEvents(store, { itemKey: key }).at(-1)).toMatchObject({
      type: 'approve',
      stageBefore: 'ingested',
      stageAfter: 'ingested',
      outcome: 'refused',
      reason: 'not_owner',
    })
  })

  it('to be an accepted event that stays, logged as stayed', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const key = itemKeyOf(THREAD, 'web-app')
    applyEvent(store, key, { type: 'triage', handled: false, confident: true })
    const result = applyEvent(store, key, { type: 'revise', owner: true })
    expect(result.outcome).toEqual({ kind: 'stayed' })
    expect(listEvents(store, { itemKey: key }).at(-1)).toMatchObject({
      outcome: 'stayed',
      reason: null,
      stageAfter: 'planning',
    })
  })

  it('to be an error for an item that does not exist, logged without an item key', () => {
    const store = memoryStore()
    expect(() => applyEvent(store, 'nope#web-app', { type: 'abort' })).toThrow(UnknownItemError)
    const [row] = listEvents(store)
    expect(row).toMatchObject({ itemKey: null, kind: 'system', type: 'apply_failed' })
    expect(JSON.parse(row?.payload ?? '{}')).toMatchObject({
      itemKey: 'nope#web-app',
      error: 'unknown item nope#web-app',
    })
  })

  it('to be an error and an untouched item for an event of an unknown type', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    const key = itemKeyOf(THREAD, 'web-app')
    const wire: unknown = JSON.parse('{"type":"launch"}')
    // @ts-expect-error the event is deliberately not an ItemEvent
    expect(() => applyEvent(store, key, wire)).toThrow('unknown item event {"type":"launch"}')
    expect(getItem(store, key)?.stage).toBe('ingested')
    expect(listEvents(store).at(-1)).toMatchObject({ kind: 'system', type: 'apply_failed' })
  })

  it('to be the three outcomes of one request: approved, rejected, revised, each on its own item', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app', 'api-server', 'docs'])
    const one = itemKeyOf(THREAD, 'web-app')
    const two = itemKeyOf(THREAD, 'api-server')
    const three = itemKeyOf(THREAD, 'docs')
    for (const item of [one, two, three]) {
      applyEvent(store, item, { type: 'triage', handled: false, confident: true })
      applyEvent(store, item, { type: 'plan_ready', current: true })
    }
    applyEvent(store, one, { type: 'approve', owner: true, card: 'plan', fresh: true })
    applyEvent(store, two, { type: 'reject', owner: true })
    applyEvent(store, three, { type: 'revise', owner: true })
    expect([one, two, three].map((item) => getItem(store, item)?.stage)).toEqual([
      'implementing',
      'declined',
      'planning',
    ])
    // a plan that answers an older request is refused as stale, and nothing else moved
    expect(applyEvent(store, three, { type: 'plan_ready', current: false }).outcome).toEqual({
      kind: 'refused',
      reason: 'stale',
    })
    expect(getItem(store, three)?.stage).toBe('planning')
  })
})

describe('the event log as an append-only record', () => {
  it('to be a table that refuses an update and a delete', () => {
    const store = memoryStore()
    logEvent(store, { kind: 'system', type: 'boot' })
    expect(() => store.db.exec("UPDATE events SET type = 'edited'")).toThrow('events is append-only')
    expect(() => store.db.exec('DELETE FROM events')).toThrow('events is append-only')
    expect(listEvents(store).map((row) => row.type)).toEqual(['boot'])
  })

  it('to be a payload with every secret replaced before it reaches the disk', () => {
    const store = memoryStore()
    // built at run time so no token-shaped literal sits in the source
    const botToken = ['xoxb', '1234567890', 'abcdefABCDEF'].join('-')
    logEvent(store, {
      kind: 'inbound',
      type: 'slack_payload',
      payload: { token: botToken, header: `Bearer ${'a'.repeat(20)}` },
    })
    const [row] = listEvents(store)
    expect(row?.payload).toBe(`{"token":"${REDACTED}","header":"${REDACTED}"}`)
  })

  it('to be listed in order, after an id, up to a limit and only for one item', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app', 'api-server'])
    const web = itemKeyOf(THREAD, 'web-app')
    applyEvent(store, web, { type: 'triage', handled: true, confident: false })
    applyEvent(store, web, { type: 'abort' })
    const all = listEvents(store)
    expect(all.map((row) => row.id)).toEqual([1, 2, 3, 4])
    expect(listEvents(store, { itemKey: web }).map((row) => row.type)).toEqual(['item_created', 'triage', 'abort'])
    expect(listEvents(store, { afterId: 2 }).map((row) => row.id)).toEqual([3, 4])
    expect(listEvents(store, { limit: 2 }).map((row) => row.id)).toEqual([1, 2])
  })
})

describe('issueCard and isLatestCard as the freshness of a button', () => {
  function twoItemsWithCards() {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app', 'api-server'])
    const key = itemKeyOf(THREAD, 'web-app')
    const other = itemKeyOf(THREAD, 'api-server')
    const firstPlan = issueCard(store, key, 'plan')
    const assign = issueCard(store, key, 'assign')
    const secondPlan = issueCard(store, key, 'plan')
    const otherPlan = issueCard(store, other, 'plan')
    return { store, key, other, firstPlan, assign, secondPlan, otherPlan }
  }

  it('to be fresh only for the newest card of the same kind on the same item', () => {
    const { store, key, other, firstPlan, assign, secondPlan, otherPlan } = twoItemsWithCards()
    expect(isLatestCard(store, key, 'plan', firstPlan)).toBe(false)
    expect(isLatestCard(store, key, 'assign', assign)).toBe(true)
    expect(isLatestCard(store, key, 'plan', secondPlan)).toBe(true)
    expect(isLatestCard(store, other, 'plan', otherPlan)).toBe(true)
  })

  it('to be not fresh when the card id is claimed for another item or another kind', () => {
    const { store, key, other, secondPlan, otherPlan } = twoItemsWithCards()
    expect(isLatestCard(store, other, 'plan', secondPlan)).toBe(false)
    expect(isLatestCard(store, key, 'plan', otherPlan)).toBe(false)
    expect(isLatestCard(store, key, 'assign', secondPlan)).toBe(false)
  })

  it('to be not fresh for a card id that does not exist or an item that has no cards', () => {
    const { store, key } = twoItemsWithCards()
    expect(isLatestCard(store, key, 'plan', 404)).toBe(false)
    createItems(store, THREAD, ['docs'])
    expect(isLatestCard(store, itemKeyOf(THREAD, 'docs'), 'plan', 1)).toBe(false)
  })
})

describe('redact as the last step before a string is stored', () => {
  const fake = (prefix: string, rest: string): string => [prefix, rest].join('')

  it.each([
    ['a Slack bot token', fake('xoxb-', '1234567890-abcdefABCDEF')],
    ['a Slack user token', fake('xoxp-', '1234567890-abcdefABCDEF')],
    ['a Slack app token', fake('xapp-', '1-A0TESTAPP01-1234567890-abcdef0123')],
    ['a Slack workspace token', fake('xoxa-', '2-1234567890-abcdef')],
    ['a Slack legacy bot token', fake('xoxo-', '1234567890-abcdef')],
    ['a Slack refresh token', fake('xoxr-', '1234567890-abcdef')],
    ['a Slack session token', fake('xoxs-', '1234567890-abcdef')],
    ['a Slack configuration token', fake('xoxe-', '1-abcdefghij1234567890')],
    ['an Anthropic key', fake('sk-ant-', 'api03-abcdefghijklmnop_QRSTUV')],
    ['a GitHub personal token', fake('ghp_', 'a'.repeat(36))],
    ['a GitHub OAuth token', fake('gho_', 'a'.repeat(36))],
    ['a GitHub user token', fake('ghu_', 'a'.repeat(36))],
    ['a GitHub server token', fake('ghs_', 'a'.repeat(36))],
    ['a GitHub refresh token', fake('ghr_', 'a'.repeat(36))],
    ['a fine-grained GitHub token', fake('github_pat_', 'A1b2C3d4E5f6G7h8I9j0K1')],
    ['an authorization header value', 'Bearer abcdefghijklmnop.qrstuv'],
    ['an authorization header value in lower case', 'bearer abcdefghijklmnop.qrstuv'],
    ['an authorization header value in upper case', 'BEARER abcdefghijklmnop.qrstuv'],
  ])('to be %s replaced', (_name, secret) => {
    expect(redact(`before ${secret} after`)).toBe(`before ${REDACTED} after`)
  })

  it('to be text without a secret left as it was', () => {
    const plain = 'planning -> planned for web-app, bearer of bad news'
    expect(redact(plain)).toBe(plain)
  })
})

describe('listOpenItems as the items that are not finished', () => {
  const to = (store: Store, repo: string, thread: string, events: Parameters<typeof applyEvent>[2][]): string => {
    createItems(store, thread, [repo])
    const key = itemKeyOf(thread, repo)
    for (const event of events) applyEvent(store, key, event)
    return key
  }
  const SURE = { type: 'triage', handled: false, confident: true } as const

  it('to be only the items in the stages asked for, oldest first', () => {
    const store = memoryStore()
    const planning = to(store, 'web-app', 'slack:C1:1', [SURE])
    to(store, 'web-app', 'slack:C1:2', [SURE, { type: 'reject', owner: true }])
    const waiting = to(store, 'api', 'slack:C1:3', [{ type: 'triage', handled: false, confident: false }])
    to(store, 'api', 'slack:C1:4', [])
    expect(listOpenItems(store, ['planning', 'notified']).map((item) => item.key)).toStrictEqual([planning, waiting])
  })

  it('to be the open items even when finished ones outnumber the limit', () => {
    const store = memoryStore()
    for (let n = 1; n <= 12; n += 1) to(store, 'web-app', `slack:C1:${n}`, [SURE, { type: 'reject', owner: true }])
    const open = to(store, 'web-app', 'slack:C1:99', [SURE])
    expect(listOpenItems(store, ['planning'], 5).map((item) => item.key)).toStrictEqual([open])
  })

  it('to be nothing for no stages, and an error for a limit that is not valid', () => {
    const store = memoryStore()
    expect(listOpenItems(store, [])).toStrictEqual([])
    expect(() => listOpenItems(store, ['planning'], 0)).toThrow(RangeError)
  })
})
