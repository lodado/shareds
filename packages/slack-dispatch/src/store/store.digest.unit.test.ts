import type { Store } from './store'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyEvent,
  closeStore,
  createDigest,
  createItems,
  digestItems,
  getItem,
  itemKeyOf,
  listEvents,
  listItems,
  openStore,
  pendingForDigest,
  setAnalysis,
  setDigestSlackRef,
  UnknownItemError,
} from './store'

const THREAD = 'slack:C1:1730000000.000100'

const opened: Store[] = []
function memoryStore(): Store {
  const store = openStore(':memory:')
  opened.push(store)
  return store
}

afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

const key = (repo: string, thread = THREAD): string => itemKeyOf(thread, repo)

// A mention that triage could not route by rule: it waits for the owner as `notified`.
function unsureMention(store: Store, thread: string, repo: string): string {
  createItems(store, thread, [repo])
  applyEvent(store, key(repo, thread), { type: 'triage', handled: false, confident: false })
  return key(repo, thread)
}

describe('createItems as work that came from a mention or from the owner DM', () => {
  it('to be a mention with no task unless said otherwise', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    expect(getItem(store, key('web-app'))).toMatchObject({ source: 'mention', task: '' })
  })

  it('to be a DM item that keeps the task of its own repo', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app', 'api-server'], {
      source: 'dm',
      tasks: { 'web-app': 'Fix the footer link', 'api-server': 'Add a rate limit' },
    })
    expect([key('web-app'), key('api-server')].map((itemKey) => getItem(store, itemKey))).toMatchObject([
      { source: 'dm', task: 'Fix the footer link' },
      { source: 'dm', task: 'Add a rate limit' },
    ])
    expect(listEvents(store)[0]).toMatchObject({
      kind: 'item_created',
      payload: `{"threadKey":"${THREAD}","repo":"web-app","source":"dm","task":"Fix the footer link"}`,
    })
  })

  it('to be an empty task for a repo the DM did not give one', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app', 'docs'], { source: 'dm', tasks: { 'web-app': 'Fix it' } })
    expect(getItem(store, key('docs'))?.task).toBe('')
  })

  it('to be refused when a task names a repo that is not in the request, with nothing created', () => {
    const store = memoryStore()
    expect(() => createItems(store, THREAD, ['web-app'], { source: 'dm', tasks: { docs: 'Write it' } })).toThrow(
      'a task names docs, which is not one of the repos',
    )
    expect(listItems(store)).toEqual([])
  })

  it('to be an existing item left as it was when the same request arrives again', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'], { source: 'dm', tasks: { 'web-app': 'First' } })
    createItems(store, THREAD, ['web-app'], { source: 'dm', tasks: { 'web-app': 'Second' } })
    expect(getItem(store, key('web-app'))?.task).toBe('First')
  })

  it('to be refused by the table for a source it does not know', () => {
    const store = memoryStore()
    expect(() =>
      store.db.exec(
        "INSERT INTO items (key, thread_key, repo, stage, source, task, meta, created_at, updated_at) VALUES ('k', 't', 'r', 'ingested', 'rumor', '', '{}', 't', 't')",
      ),
    ).toThrow('CHECK constraint failed')
  })
})

describe('listItems as the items in one stage, oldest first', () => {
  it('to be filtered by stage and ordered by arrival', () => {
    const store = memoryStore()
    createItems(store, 'slack:C1:1', ['a'])
    createItems(store, 'slack:C1:2', ['b'])
    applyEvent(store, key('b', 'slack:C1:2'), { type: 'triage', handled: true, confident: false })
    expect(listItems(store).map((item) => item.key)).toEqual(['slack:C1:1#a', 'slack:C1:2#b'])
    expect(listItems(store, { stage: 'skipped' }).map((item) => item.key)).toEqual(['slack:C1:2#b'])
    expect(listItems(store, { stage: 'merged' })).toEqual([])
  })

  it('to be refused for a limit outside 1 to 10000', () => {
    expect(() => listItems(memoryStore(), { limit: 0 })).toThrow('limit must be an integer from 1 to 10000')
  })
})

describe('pendingForDigest as the mentions that are new to the owner', () => {
  it('to be only an unsure mention that is still waiting', () => {
    const store = memoryStore()
    const waiting = unsureMention(store, 'slack:C1:1', 'web-app')
    createItems(store, 'slack:C1:2', ['api-server'])
    applyEvent(store, key('api-server', 'slack:C1:2'), { type: 'triage', handled: false, confident: true })
    createItems(store, 'slack:C1:3', ['docs'])
    applyEvent(store, key('docs', 'slack:C1:3'), { type: 'triage', handled: true, confident: false })
    createItems(store, 'slack:C1:4', ['web-app'], { source: 'dm', tasks: { 'web-app': 'Do it' } })
    applyEvent(store, key('web-app', 'slack:C1:4'), { type: 'triage', handled: false, confident: false })
    expect(pendingForDigest(store).map((item) => item.key)).toEqual([waiting])
  })

  it('to be oldest first and cut at the limit', () => {
    const store = memoryStore()
    const keys = [1, 2, 3].map((n) => unsureMention(store, `slack:C1:${n}`, 'web-app'))
    expect(pendingForDigest(store).map((item) => item.key)).toEqual(keys)
    expect(pendingForDigest(store, 2).map((item) => item.key)).toEqual(keys.slice(0, 2))
  })
})

describe('createDigest as the list of what the owner is told is new', () => {
  it('to be a digest id, with its items no longer pending and the creation logged', () => {
    const store = memoryStore()
    const first = unsureMention(store, 'slack:C1:1', 'web-app')
    const second = unsureMention(store, 'slack:C1:2', 'web-app')
    const digestId = createDigest(store, [first, second])
    expect(digestId).toBe(1)
    expect(digestItems(store, digestId)).toEqual([first, second])
    expect(pendingForDigest(store)).toEqual([])
    const row = listEvents(store).at(-1)
    expect(row).toMatchObject({ kind: 'outbound', type: 'digest_created' })
    expect(JSON.parse(row?.payload ?? '{}')).toEqual({ digestId: 1, itemKeys: [first, second] })
  })

  it('to be a second digest that holds only what arrived since the first', () => {
    const store = memoryStore()
    const old = unsureMention(store, 'slack:C1:1', 'web-app')
    createDigest(store, [old])
    const fresh = unsureMention(store, 'slack:C1:2', 'web-app')
    expect(pendingForDigest(store).map((item) => item.key)).toEqual([fresh])
    expect(createDigest(store, [fresh])).toBe(2)
    expect(digestItems(store, 1)).toEqual([old])
    expect(digestItems(store, 2)).toEqual([fresh])
  })

  it('to be refused for an item that is already in a digest', () => {
    const store = memoryStore()
    const item = unsureMention(store, 'slack:C1:1', 'web-app')
    createDigest(store, [item])
    expect(() => createDigest(store, [item])).toThrow(`item ${item} is not waiting for a digest`)
  })

  it('to be refused for an item that is not waiting, and nothing is created for the others either', () => {
    const store = memoryStore()
    const waiting = unsureMention(store, 'slack:C1:1', 'web-app')
    createItems(store, 'slack:C1:2', ['api-server'])
    const notTriaged = key('api-server', 'slack:C1:2')
    expect(() => createDigest(store, [waiting, notTriaged])).toThrow(`item ${notTriaged} is not waiting for a digest`)
    expect(digestItems(store, 1)).toEqual([])
    expect(pendingForDigest(store).map((item) => item.key)).toEqual([waiting])
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM digests').get()).toEqual({ n: 0 })
  })

  it.each([
    ['no items', []],
    ['the same item twice', ['x#y', 'x#y']],
  ])('to be refused for %s', (_name, keys) => {
    expect(() => createDigest(memoryStore(), keys)).toThrow('a digest needs a non-empty list of distinct items')
  })

  it('to be an item that stays in at most one digest, enforced by the table too', () => {
    const store = memoryStore()
    const item = unsureMention(store, 'slack:C1:1', 'web-app')
    createDigest(store, [item])
    store.db.prepare('INSERT INTO digests (created_at) VALUES (?)').run('t')
    expect(() => store.db.prepare('INSERT INTO digest_items (digest_id, item_key) VALUES (2, ?)').run(item)).toThrow(
      'UNIQUE constraint failed',
    )
  })
})

describe('setDigestSlackRef and digestItems as the way back from a click to a digest', () => {
  it('to be the place the digest was posted, logged as sent', () => {
    const store = memoryStore()
    const digestId = createDigest(store, [unsureMention(store, 'slack:C1:1', 'web-app')])
    setDigestSlackRef(store, digestId, 'D123:1730000001.000200')
    expect(store.db.prepare('SELECT slack_ref FROM digests WHERE id = ?').get(digestId)).toEqual({
      slack_ref: 'D123:1730000001.000200',
    })
    expect(listEvents(store).at(-1)).toMatchObject({
      kind: 'outbound',
      type: 'digest_sent',
      payload: '{"digestId":1,"slackRef":"D123:1730000001.000200"}',
    })
  })

  it('to be refused for a digest that does not exist, with nothing logged', () => {
    const store = memoryStore()
    expect(() => setDigestSlackRef(store, 9, 'D1:1')).toThrow('unknown digest 9')
    expect(listEvents(store)).toEqual([])
  })

  it('to be no items for a digest that does not exist', () => {
    expect(digestItems(memoryStore(), 404)).toEqual([])
  })
})

describe('setAnalysis as what the cheapest model made of an item', () => {
  const analysis = { request: '푸터 링크가 깨짐', cause: 'href 오타', plan: '고친다', recommend: true, why: '작음' }

  it('to be kept next to the other digest fields and read back whole', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'], {
      meta: { 'web-app': { summary: 'Footer link', url: 'https://x.test/t' } },
    })
    setAnalysis(store, key('web-app'), analysis)
    expect(getItem(store, key('web-app'))?.meta).toStrictEqual({
      summary: 'Footer link',
      url: 'https://x.test/t',
      analysis,
    })
  })

  it('to be replaced by a newer analysis and logged without its text', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    setAnalysis(store, key('web-app'), analysis)
    setAnalysis(store, key('web-app'), { ...analysis, recommend: false })
    expect(getItem(store, key('web-app'))?.meta.analysis?.recommend).toBe(false)
    const logged = listEvents(store, { itemKey: key('web-app') }).filter((event) => event.type === 'analysis_saved')
    expect(logged.map((event) => event.payload)).toStrictEqual(['{"recommend":true}', '{"recommend":false}'])
  })

  it('to be an error for an item that does not exist', () => {
    const store = memoryStore()
    expect(() => setAnalysis(store, 'slack:none#nothing', analysis)).toThrow(UnknownItemError)
  })

  it('to be left out of the meta when the stored one is damaged', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    store.db
      .prepare('UPDATE items SET meta = ? WHERE key = ?')
      .run('{"analysis":{"request":"only this"}}', key('web-app'))
    expect(getItem(store, key('web-app'))?.meta).toStrictEqual({})
  })

  it('to be written over a meta that could not be read', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    store.db.prepare('UPDATE items SET meta = ? WHERE key = ?').run('not json', key('web-app'))
    setAnalysis(store, key('web-app'), analysis)
    expect(getItem(store, key('web-app'))?.meta).toStrictEqual({ analysis })
  })

  it('to be made into digest entries together with the item', () => {
    const store = memoryStore()
    createItems(store, THREAD, ['web-app'])
    applyEvent(store, key('web-app'), { type: 'triage', handled: false, confident: false })
    setAnalysis(store, key('web-app'), analysis)
    expect(pendingForDigest(store)[0]?.meta.analysis).toStrictEqual(analysis)
  })
})
