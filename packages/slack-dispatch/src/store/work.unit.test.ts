import type { Store } from './store'
import { afterEach, describe, expect, it } from 'vitest'
import { applyEvent, closeStore, createItems, issueCard, itemKeyOf, listEvents, logEvent, openStore } from './store'
import {
  activeRun,
  beginRun,
  cancelOrphanRuns,
  cardAt,
  cleanupKeys,
  countActiveRuns,
  endRun,
  getWorkspace,
  hasLogged,
  listRuns,
  pendingInstruction,
  RESTARTED_DETAIL,
  saveWorkspace,
  setCardSlackRef,
  setPlan,
  setPrUrl,
  spentOnItem,
  STOPPED_DETAIL,
} from './work'

const THREAD = 'slack:C1:1730000000.000100'
const ADMITTED = { registered: true, allowed: true, valid: true }

const opened: Store[] = []
function memoryStore(): Store {
  const store = openStore(':memory:')
  opened.push(store)
  return store
}

afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

function item(store: Store, repo: string, thread = THREAD): string {
  createItems(store, thread, [repo])
  return itemKeyOf(thread, repo)
}

describe('beginRun as the first run of an item', () => {
  it('to be running and the only active run of the item', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const run = beginRun(store, key, 'plan', ADMITTED)
    expect(run).toMatchObject({ itemKey: key, kind: 'plan', state: 'running', costUsd: 0, finishedAt: null })
    expect(activeRun(store, key)?.id).toBe(run.id)
  })

  it('to be rejected and never active when the item already has a run in progress', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const first = beginRun(store, key, 'plan', ADMITTED)
    const second = beginRun(store, key, 'build', ADMITTED)
    expect(second).toMatchObject({ state: 'rejected', detail: 'not admitted' })
    expect(activeRun(store, key)?.id).toBe(first.id)
    expect(countActiveRuns(store)).toBe(1)
  })

  it.each([
    ['unregistered', { registered: false, allowed: true, valid: true }],
    ['not allowed', { registered: true, allowed: false, valid: true }],
    ['invalid', { registered: true, allowed: true, valid: false }],
  ])('to be rejected when the run is %s', (_name, admission) => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    expect(beginRun(store, key, 'plan', admission).state).toBe('rejected')
    expect(activeRun(store, key)).toBeUndefined()
  })

  it('to be logged as one run event', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const run = beginRun(store, key, 'plan', ADMITTED)
    const logged = listEvents(store, { itemKey: key }).filter((event) => event.kind === 'run')
    expect(logged.map((event) => event.type)).toStrictEqual(['plan_running'])
    expect(JSON.parse(logged[0]?.payload ?? '{}')).toMatchObject({ runId: run.id })
  })
})

describe('endRun as a run that was admitted', () => {
  it('to be succeeded with its cost when it finished cleanly', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const run = beginRun(store, key, 'plan', ADMITTED)
    const ended = endRun(store, run.id, { type: 'finish', ok: true, valid: true }, { costUsd: 0.32, detail: 'planned' })
    expect(ended).toMatchObject({ state: 'succeeded', costUsd: 0.32, detail: 'planned' })
    expect(ended.finishedAt).not.toBeNull()
    expect(activeRun(store, key)).toBeUndefined()
  })

  it('to be failed when the output was not valid', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const run = beginRun(store, key, 'plan', ADMITTED)
    expect(endRun(store, run.id, { type: 'finish', ok: true, valid: false }).state).toBe('failed')
  })

  it('to be failed when it was cancelled while running', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const run = beginRun(store, key, 'plan', ADMITTED)
    expect(endRun(store, run.id, { type: 'cancel' }, { detail: 'owner cancelled' })).toMatchObject({
      state: 'failed',
      detail: 'owner cancelled',
    })
  })

  it('to be unchanged when a late finish arrives after the run ended', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const run = beginRun(store, key, 'plan', ADMITTED)
    const cancelled = endRun(store, run.id, { type: 'cancel' })
    const late = endRun(store, run.id, { type: 'finish', ok: true, valid: true }, { costUsd: 9 })
    expect(late).toStrictEqual(cancelled)
    expect(spentOnItem(store, key)).toBe(0)
  })

  it('to be an error for a run that does not exist', () => {
    const store = memoryStore()
    expect(() => endRun(store, 99, { type: 'cancel' })).toThrow('unknown run 99')
  })

  it('to be startable again once the earlier run ended', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const first = beginRun(store, key, 'plan', ADMITTED)
    endRun(store, first.id, { type: 'finish', ok: true, valid: true })
    expect(beginRun(store, key, 'build', ADMITTED).state).toBe('running')
    expect(listRuns(store, key).map((run) => run.state)).toStrictEqual(['succeeded', 'running'])
  })
})

describe('countActiveRuns as the concurrency cap input', () => {
  it('to be counted over all repos and per repo', () => {
    const store = memoryStore()
    beginRun(store, item(store, 'web-app', 'slack:C1:1'), 'plan', ADMITTED)
    beginRun(store, item(store, 'web-app', 'slack:C1:2'), 'plan', ADMITTED)
    beginRun(store, item(store, 'api-server', 'slack:C1:3'), 'plan', ADMITTED)
    expect([
      countActiveRuns(store),
      countActiveRuns(store, 'web-app'),
      countActiveRuns(store, 'api-server'),
    ]).toStrictEqual([3, 2, 1])
    expect(countActiveRuns(store, 'unknown')).toBe(0)
  })
})

describe('spentOnItem as the cost cap input', () => {
  it('to be the sum over every run of the item and nothing of another item', () => {
    const store = memoryStore()
    const key = item(store, 'web-app', 'slack:C1:1')
    const other = item(store, 'web-app', 'slack:C1:2')
    const first = beginRun(store, key, 'plan', ADMITTED)
    endRun(store, first.id, { type: 'finish', ok: true, valid: true }, { costUsd: 0.25 })
    const second = beginRun(store, key, 'build', ADMITTED)
    endRun(store, second.id, { type: 'finish', ok: true, valid: true }, { costUsd: 0.5 })
    endRun(store, beginRun(store, other, 'plan', ADMITTED).id, { type: 'cancel' })
    expect([spentOnItem(store, key), spentOnItem(store, other)]).toStrictEqual([0.75, 0])
  })
})

describe('cancelOrphanRuns as a worker that restarted', () => {
  const CHARGE = { plan: 2, build: 5 }

  it('to be every run in progress called off and nothing else touched', () => {
    const store = memoryStore()
    const busy = item(store, 'web-app', 'slack:C1:1')
    const done = item(store, 'web-app', 'slack:C1:2')
    beginRun(store, busy, 'plan', ADMITTED)
    endRun(store, beginRun(store, done, 'plan', ADMITTED).id, { type: 'finish', ok: true, valid: true })
    expect(cancelOrphanRuns(store, CHARGE)).toBe(1)
    expect(listRuns(store, busy)[0]).toMatchObject({ state: 'failed', detail: RESTARTED_DETAIL })
    expect(listRuns(store, done)[0]?.state).toBe('succeeded')
    expect(cancelOrphanRuns(store, CHARGE)).toBe(0)
  })

  it('to be charged the most the run could have spent, by its kind, so that a crash loop reaches the cap', () => {
    const store = memoryStore()
    const planning = item(store, 'web-app', 'slack:C1:1')
    const building = item(store, 'api-server', 'slack:C1:2')
    beginRun(store, planning, 'plan', ADMITTED)
    beginRun(store, building, 'build', ADMITTED)
    cancelOrphanRuns(store, CHARGE)
    expect([spentOnItem(store, planning), spentOnItem(store, building)]).toStrictEqual([2, 5])
  })
})

describe('saveWorkspace as the place an item is worked in', () => {
  const workspace = {
    sessionId: 'c0ffee00-0000-4000-8000-000000000001',
    path: '/w/a',
    branch: 'slack/a',
    baseRef: 'origin/develop',
  }

  it('to be saved with an empty plan and no pull request', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    expect(saveWorkspace(store, key, workspace)).toStrictEqual({
      itemKey: key,
      ...workspace,
      plan: '',
      prUrl: null,
    })
  })

  it('to be made once: a second save for the item is refused and changes nothing', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    saveWorkspace(store, key, workspace)
    setPlan(store, key, 'Change the footer link')
    expect(() => saveWorkspace(store, key, { ...workspace, path: '/w/b' })).toThrow('UNIQUE')
    expect(getWorkspace(store, key)).toMatchObject({ path: '/w/a', plan: 'Change the footer link' })
  })

  it('to be undefined for an item that has none', () => {
    const store = memoryStore()
    expect(getWorkspace(store, item(store, 'web-app'))).toBeUndefined()
  })

  it('to be an error to set the plan or the PR of an item without a workspace', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    expect(() => setPlan(store, key, 'x')).toThrow(`item ${key} has no workspace`)
    expect(() => setPrUrl(store, key, 'https://example.test/pr/1')).toThrow(`item ${key} has no workspace`)
  })

  it('to be logged when the PR is recorded', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    saveWorkspace(store, key, workspace)
    setPrUrl(store, key, 'https://example.test/pr/1')
    expect(getWorkspace(store, key)?.prUrl).toBe('https://example.test/pr/1')
    expect(listEvents(store, { itemKey: key }).map((event) => event.type)).toStrictEqual([
      'item_created',
      'workspace_saved',
      'pr_recorded',
    ])
  })
})

describe('cardAt as a reply under a card DM', () => {
  it('to be the card, flagged latest only while no newer card of its kind exists', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    applyEvent(store, key, { type: 'triage', handled: false, confident: true })
    const first = issueCard(store, key, 'plan')
    setCardSlackRef(store, first, 'D1:1.1')
    expect(cardAt(store, 'D1:1.1')).toStrictEqual({ id: first, itemKey: key, kind: 'plan', latest: true })
    const second = issueCard(store, key, 'plan')
    setCardSlackRef(store, second, 'D1:2.2')
    expect([cardAt(store, 'D1:1.1')?.latest, cardAt(store, 'D1:2.2')?.latest]).toStrictEqual([false, true])
  })

  it('to be a different freshness per kind', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    const assign = issueCard(store, key, 'assign')
    setCardSlackRef(store, assign, 'D1:1.1')
    issueCard(store, key, 'plan')
    expect(cardAt(store, 'D1:1.1')?.latest).toBe(true)
  })

  it('to be undefined for a place no card was posted at and an error for an unknown card', () => {
    const store = memoryStore()
    expect(cardAt(store, 'D1:9.9')).toBeUndefined()
    expect(() => setCardSlackRef(store, 42, 'D1:1.1')).toThrow('unknown card 42')
  })
})

describe('hasLogged as a one-time job that must not run twice', () => {
  it('to be true only for a type that was logged for that item', () => {
    const store = memoryStore()
    const key = item(store, 'web-app', 'slack:C1:1')
    const other = item(store, 'web-app', 'slack:C1:2')
    logEvent(store, { itemKey: key, kind: 'system', type: 'workspace_removed' })
    expect([hasLogged(store, key, 'workspace_removed'), hasLogged(store, other, 'workspace_removed')]).toStrictEqual([
      true,
      false,
    ])
    expect(hasLogged(store, key, 'workspace_kept')).toBe(false)
  })
})

describe('pendingInstruction as the change the owner asked for and the plan has not answered yet', () => {
  const revise = (store: Store, key: string, text: string): void => {
    logEvent(store, { itemKey: key, kind: 'inbound', type: 'revise_text', payload: { text } })
  }

  it('to be undefined when the owner never asked for a change', () => {
    const store = memoryStore()
    expect(pendingInstruction(store, item(store, 'web-app'))).toBeUndefined()
  })

  it('to be every request since the last plan, oldest first, with the id of the latest', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    revise(store, key, 'first')
    revise(store, key, 'second')
    const asked = pendingInstruction(store, key)
    expect(asked?.text).toBe('first\nsecond')
    const latest = listEvents(store, { itemKey: key }).filter((event) => event.type === 'revise_text')
    expect(asked?.id).toBe(latest.at(-1)?.id)
  })

  it('to be undefined once a plan moved the item on after the request', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    revise(store, key, 'make it blue')
    applyEvent(store, key, { type: 'triage', handled: false, confident: true })
    applyEvent(store, key, { type: 'plan_ready', current: true })
    expect(pendingInstruction(store, key)).toBeUndefined()
    revise(store, key, 'and bigger')
    expect(pendingInstruction(store, key)?.text).toBe('and bigger')
  })

  it('to be kept when the plan that came was refused as stale: it answered nothing', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    applyEvent(store, key, { type: 'triage', handled: false, confident: true })
    revise(store, key, 'make it blue')
    expect(applyEvent(store, key, { type: 'plan_ready', current: false }).outcome.kind).toBe('refused')
    expect(pendingInstruction(store, key)?.text).toBe('make it blue')
  })

  it('to be undefined for a request that has no text', () => {
    const store = memoryStore()
    const key = item(store, 'web-app')
    logEvent(store, { itemKey: key, kind: 'inbound', type: 'revise_text', payload: { text: 5 } })
    expect(pendingInstruction(store, key)).toBeUndefined()
  })
})

describe('cleanupKeys as the worktrees that are still to be dealt with', () => {
  const workspace = { sessionId: 's', path: '/w/a', branch: 'b', baseRef: 'origin/develop' }

  function finished(store: Store, thread: string, stage: 'declined' | 'merged'): string {
    const key = item(store, 'web-app', thread)
    saveWorkspace(store, key, workspace)
    applyEvent(store, key, { type: 'triage', handled: false, confident: true })
    if (stage === 'declined') applyEvent(store, key, { type: 'reject', owner: true })
    else {
      applyEvent(store, key, { type: 'plan_ready', current: true })
      applyEvent(store, key, { type: 'approve', owner: true, card: 'plan', fresh: true })
      applyEvent(store, key, { type: 'built', ok: true })
      applyEvent(store, key, { type: 'merge', owner: true, ci: true, review: true })
    }
    return key
  }

  it('to be the items of the stage that have a workspace and no cleanup logged', () => {
    const store = memoryStore()
    const declined = finished(store, 'slack:C1:1', 'declined')
    finished(store, 'slack:C1:2', 'merged')
    item(store, 'web-app', 'slack:C1:3')
    expect(cleanupKeys(store, 'declined')).toStrictEqual([declined])
  })

  it('to be without an item once its worktree was removed or deliberately kept', () => {
    const store = memoryStore()
    const removed = finished(store, 'slack:C1:1', 'declined')
    const kept = finished(store, 'slack:C1:2', 'declined')
    const pending = finished(store, 'slack:C1:3', 'declined')
    logEvent(store, { itemKey: removed, kind: 'system', type: 'workspace_removed' })
    logEvent(store, { itemKey: kept, kind: 'system', type: 'workspace_kept' })
    expect(cleanupKeys(store, 'declined')).toStrictEqual([pending])
  })

  it('to be found however many finished items came before: the history cannot crowd it out', () => {
    const store = memoryStore()
    for (let n = 1; n <= 30; n += 1) {
      logEvent(store, {
        itemKey: finished(store, `slack:C1:${n}`, 'declined'),
        kind: 'system',
        type: 'workspace_removed',
      })
    }
    const newest = finished(store, 'slack:C1:99', 'declined')
    expect(cleanupKeys(store, 'declined')).toStrictEqual([newest])
  })
})

describe('the details of a run that did not fail', () => {
  it('to be words the worker can tell apart from a failure', () => {
    expect([STOPPED_DETAIL, RESTARTED_DETAIL]).toStrictEqual(['stopped by the owner', 'the worker restarted'])
  })
})
