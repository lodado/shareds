import type { ItemEvent } from '../machine/machine'
import type { Store } from '../store/store'
import type { InteractDeps } from './interact'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyEvent,
  closeStore,
  createDigest,
  createItems,
  getItem,
  issueCard,
  itemKeyOf,
  listEvents,
  openStore,
} from '../store/store'
import { setCardSlackRef } from '../store/work'
import { describeQueue, handleInteractive, handleMessage } from './interact'

const OWNER = 'UOWNER'
const OTHER = 'UOTHER'
const HEAD = '0123456789abcdef0123456789abcdef01234567'
const DM = 'D1'

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
})

interface Posted {
  channel: string
  text: string
  threadTs: string | undefined
}

interface Harness {
  deps: InteractDeps
  store: Store
  posted: Posted[]
  aborted: string[]
  merged: string[]
  // The commit each merge was pinned to, in order.
  pinned: string[]
}

interface Overrides {
  split?: InteractDeps['splitPrompt']
  gate?: { ci: boolean; review: boolean }
  checkGate?: InteractDeps['checkGate']
  mergePr?: InteractDeps['mergePr']
  retries?: boolean
}

function harness(overrides: Overrides = {}): Harness {
  const store = openStore(':memory:')
  opened.push(store)
  const posted: Posted[] = []
  const aborted: string[] = []
  const merged: string[] = []
  const pinned: string[] = []
  const deps: InteractDeps = {
    store,
    ownerId: OWNER,
    slack: {
      postMessage: (args) => {
        posted.push({ channel: args.channel, text: args.text, threadTs: args.threadTs })
        return Promise.resolve({ channel: args.channel, ts: `${posted.length}.1` })
      },
    },
    knownRepos: () => ['web-app', 'api-server'],
    splitPrompt: overrides.split ?? (() => Promise.resolve({ tasks: [] })),
    checkGate:
      overrides.checkGate ??
      (() => Promise.resolve({ ...(overrides.gate ?? { ci: true, review: true }), headOid: HEAD })),
    mergePr:
      overrides.mergePr ??
      ((item, headOid) => {
        merged.push(item.key)
        pinned.push(headOid)
        return Promise.resolve()
      }),
    retriesLeft: () => overrides.retries ?? true,
    abortWork: (itemKey) => {
      aborted.push(itemKey)
    },
    locks: new Set(),
  }
  return { deps, store, posted, aborted, merged, pinned }
}

const thread = (n: number): string => `slack:C1:1730000000.00000${n}`
const key = (repo: string, n = 1): string => itemKeyOf(thread(n), repo)

function advance(store: Store, itemKey: string, events: readonly ItemEvent[]): void {
  for (const event of events) applyEvent(store, itemKey, event)
}

const TO_PLANNING: ItemEvent[] = [{ type: 'triage', handled: false, confident: true }]
const TO_NOTIFIED: ItemEvent[] = [{ type: 'triage', handled: false, confident: false }]
const TO_PLANNED: ItemEvent[] = [
  { type: 'triage', handled: false, confident: true },
  { type: 'plan_ready', current: true },
]
const TO_PR_OPEN: ItemEvent[] = [
  ...TO_PLANNED,
  { type: 'approve', owner: true, card: 'plan', fresh: true },
  { type: 'built', ok: true },
]

// A mention waiting in a digest, like ingest leaves it.
function waiting(store: Store, repo: string, n = 1): string {
  createItems(store, thread(n), [repo], { meta: { [repo]: { summary: `summary ${repo} ${n}` } } })
  advance(store, key(repo, n), TO_NOTIFIED)
  return key(repo, n)
}

function digestClick(action: string, digestId: number, picked: readonly string[], user = OWNER): unknown {
  return {
    type: 'block_actions',
    user: { id: user },
    container: { channel_id: DM, message_ts: '9.9' },
    actions: [{ action_id: `digest.${action}:${digestId}`, value: String(digestId) }],
    state: {
      values: {
        block: {
          [`digest.pick:${digestId}:0`]: { type: 'checkboxes', selected_options: picked.map((value) => ({ value })) },
        },
      },
    },
  }
}

function itemClick(action: string, cardId: number, itemKey: string, user = OWNER): unknown {
  return {
    type: 'block_actions',
    user: { id: user },
    container: { channel_id: DM, message_ts: '8.8' },
    actions: [{ action_id: `item.${action}:${cardId}`, value: itemKey }],
  }
}

function dm(text: string, extra: Record<string, unknown> = {}): unknown {
  return {
    type: 'event_callback',
    event: { type: 'message', channel_type: 'im', user: OWNER, channel: DM, ts: '100.1', text, ...extra },
  }
}

const stageOf = (store: Store, itemKey: string): string | undefined => getItem(store, itemKey)?.stage

describe('handleInteractive as a click on a digest', () => {
  it('to be a plan started for the ticked item only', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app', 1)
    const b = waiting(store, 'api-server', 2)
    const id = createDigest(store, [a, b])
    await handleInteractive(deps, digestClick('plan_selected', id, [a]))
    expect([stageOf(store, a), stageOf(store, b)]).toStrictEqual(['planning', 'notified'])
    expect(posted).toStrictEqual([{ channel: DM, text: '플랜 시작 1개', threadTs: '9.9' }])
  })

  it('to be unmoved by a tick for an item that is in another digest', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app', 1)
    const b = waiting(store, 'api-server', 2)
    const first = createDigest(store, [a])
    createDigest(store, [b])
    await handleInteractive(deps, digestClick('plan_selected', first, [a, b]))
    expect([stageOf(store, a), stageOf(store, b)]).toStrictEqual(['planning', 'notified'])
    expect(posted[0]?.text).toBe('플랜 시작 1개')
    const logged = listEvents(store).find((event) => event.type === 'digest_plan_selected')
    expect(JSON.parse(logged?.payload ?? '{}')).toMatchObject({ selected: [a], ignored: 1 })
  })

  it('to be a plan for every waiting item on plan_all, and a note for the one with no repo', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app', 1)
    const b = waiting(store, 'unrouted', 2)
    const id = createDigest(store, [a, b])
    await handleInteractive(deps, digestClick('plan_all', id, []))
    expect([stageOf(store, a), stageOf(store, b)]).toStrictEqual(['planning', 'notified'])
    expect(posted[0]?.text).toBe('플랜 시작 1개, 레포를 못 정해서 대기 1개 (DM으로 레포를 알려주세요)')
  })

  it('to be a hint and no change when nothing was ticked', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app')
    const id = createDigest(store, [a])
    await handleInteractive(deps, digestClick('plan_selected', id, []))
    expect(stageOf(store, a)).toBe('notified')
    expect(posted[0]?.text).toBe('고른 항목이 없어요. 체크박스로 항목을 고른 뒤 눌러주세요.')
  })

  it('to be a settled count, not a second move, when the same click arrives twice', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app')
    const id = createDigest(store, [a])
    await handleInteractive(deps, digestClick('plan_selected', id, [a]))
    await handleInteractive(deps, digestClick('plan_selected', id, [a]))
    expect(stageOf(store, a)).toBe('planning')
    expect(posted.map((message) => message.text)).toStrictEqual([
      '플랜 시작 1개',
      '플랜 시작 0개, 이미 처리된 항목 1개',
    ])
  })

  it('to be a message for a digest that does not exist', async () => {
    const { deps, posted } = harness()
    await handleInteractive(deps, digestClick('plan_all', 404, []))
    expect(posted[0]?.text).toBe('알 수 없는 목록이에요.')
  })

  it('to be only the unticked waiting items declined on reject_rest', async () => {
    const { deps, store, posted } = harness()
    const keep = waiting(store, 'web-app', 1)
    const drop = waiting(store, 'api-server', 2)
    const sent = waiting(store, 'web-app', 3)
    const id = createDigest(store, [keep, drop, sent])
    await handleInteractive(deps, digestClick('plan_selected', id, [sent]))
    await handleInteractive(deps, digestClick('reject_rest', id, [keep]))
    expect([stageOf(store, keep), stageOf(store, drop), stageOf(store, sent)]).toStrictEqual([
      'notified',
      'declined',
      'planning',
    ])
    expect(posted.at(-1)?.text).toBe('기각 1개')
  })
})

describe('handleInteractive as a tick in a check box of the digest', () => {
  it('to be let through without a log row, a reply or a change', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app')
    const id = createDigest(store, [a])
    const before = listEvents(store).length
    await handleInteractive(deps, {
      type: 'block_actions',
      user: { id: OWNER },
      container: { channel_id: DM, message_ts: '9.9' },
      actions: [{ action_id: `digest.pick:${id}:0`, type: 'checkboxes' }],
    })
    expect(listEvents(store)).toHaveLength(before)
    expect(posted).toStrictEqual([])
    expect(stageOf(store, a)).toBe('notified')
  })
})

describe('handleInteractive as a click from someone who is not the owner', () => {
  it('to be logged and to change and say nothing', async () => {
    const { deps, store, posted } = harness()
    const a = waiting(store, 'web-app')
    const id = createDigest(store, [a])
    await handleInteractive(deps, digestClick('plan_all', id, [a], OTHER))
    expect(stageOf(store, a)).toBe('notified')
    expect(posted).toStrictEqual([])
    expect(listEvents(store).at(-1)).toMatchObject({
      kind: 'inbound',
      type: 'click_refused',
      payload: '{"reason":"not_owner"}',
    })
  })

  it.each([null, 'text', 5, []])('to be ignored for a payload of %j', async (payload) => {
    const { deps, store } = harness()
    await handleInteractive(deps, payload)
    expect(listEvents(store)).toStrictEqual([])
  })
})

describe('handleInteractive as a click on an item card', () => {
  it('to be the build started when the plan card is the latest', async () => {
    const { deps, store, posted } = harness()
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PLANNED)
    const card = issueCard(store, a, 'plan')
    await handleInteractive(deps, itemClick('approve_plan', card, a))
    expect(stageOf(store, a)).toBe('implementing')
    expect(posted[0]?.text).toBe('구현을 시작할게요.')
  })

  it('to be refused as old when a newer plan card exists', async () => {
    const { deps, store, posted } = harness()
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PLANNED)
    const old = issueCard(store, a, 'plan')
    issueCard(store, a, 'plan')
    await handleInteractive(deps, itemClick('approve_plan', old, a))
    expect(stageOf(store, a)).toBe('planned')
    expect(posted[0]?.text).toBe('오래된 카드예요. 가장 최근 플랜 카드에서 눌러주세요.')
  })

  it('to be declined with the agent stopped on reject', async () => {
    const { deps, store, aborted, posted } = harness()
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PLANNED)
    await handleInteractive(deps, itemClick('reject', 0, a))
    expect(stageOf(store, a)).toBe('declined')
    expect(aborted).toStrictEqual([a])
    expect(posted[0]?.text).toBe('기각했어요.')
  })

  it('to be left alone, with the agent not stopped, when a cancel arrives after the item finished', async () => {
    const { deps, store, aborted, posted } = harness()
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, [...TO_PR_OPEN, { type: 'merge', owner: true, ci: true, review: true }])
    await handleInteractive(deps, itemClick('cancel', 0, a))
    expect(stageOf(store, a)).toBe('merged')
    expect(aborted).toStrictEqual([])
    expect(posted[0]?.text).toBe('그대로 두었어요.')
  })

  it('to be merged after the PR was landed when CI and review pass', async () => {
    const { deps, store, merged, posted } = harness()
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PR_OPEN)
    await handleInteractive(deps, itemClick('merge', 0, a))
    expect(merged).toStrictEqual([a])
    expect(stageOf(store, a)).toBe('merged')
    expect(posted[0]?.text).toBe('머지했어요: web-app')
  })

  it('to be unmerged and the PR untouched while CI or review has not passed', async () => {
    const { deps, store, merged, posted } = harness({ gate: { ci: false, review: true } })
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PR_OPEN)
    await handleInteractive(deps, itemClick('merge', 0, a))
    expect(merged).toStrictEqual([])
    expect(stageOf(store, a)).toBe('pr_open')
    expect(posted[0]?.text).toBe('CI나 리뷰가 아직 통과하지 않았어요.')
    expect(listEvents(store, { itemKey: a }).at(-1)).toMatchObject({
      type: 'merge',
      outcome: 'refused',
      reason: 'gate_not_met',
    })
  })

  it('to be still open when landing the PR fails', async () => {
    const { deps, store } = harness({ mergePr: () => Promise.reject(new Error('conflict')) })
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PR_OPEN)
    await expect(handleInteractive(deps, itemClick('merge', 0, a))).rejects.toThrow('conflict')
    expect(stageOf(store, a)).toBe('pr_open')
  })

  it('to be said as not mergeable when the item is not at the PR stage', async () => {
    const { deps, store, merged, posted } = harness()
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, TO_PLANNED)
    await handleInteractive(deps, itemClick('merge', 0, a))
    expect(merged).toStrictEqual([])
    expect(posted[0]?.text).toBe('지금은 머지할 수 없어요.')
  })

  it.each([
    [true, 'planning', '다시 플랜부터 시작할게요.'],
    [false, 'failed', '다시 시도할 수 없어요.'],
  ])('to be %s on retry leaving the item %s', async (retries, stage, message) => {
    const { deps, store, posted } = harness({ retries })
    const a = key('web-app')
    createItems(store, thread(1), ['web-app'])
    advance(store, a, [
      ...TO_PLANNED,
      { type: 'approve', owner: true, card: 'plan', fresh: true },
      { type: 'built', ok: false },
    ])
    await handleInteractive(deps, itemClick('retry', 0, a))
    expect(stageOf(store, a)).toBe(stage)
    expect(posted[0]?.text).toBe(message)
  })

  it('to be logged and unanswered for an item that does not exist', async () => {
    const { deps, store, posted } = harness()
    await handleInteractive(deps, itemClick('reject', 0, 'slack:none#nothing'))
    expect(posted).toStrictEqual([])
    expect(listEvents(store).at(-1)?.type).toBe('click_refused')
  })

  it('to be logged as unknown for a button that is not ours', async () => {
    const { deps, store, posted } = harness()
    await handleInteractive(deps, itemClick('drop_everything', 0, 'x'))
    expect(posted).toStrictEqual([])
    expect(listEvents(store).at(-1)?.type).toBe('click_unknown')
  })
})

describe('handleMessage as a DM to the bot', () => {
  it('to be items in planning, one per repo, when the prompt splits cleanly', async () => {
    const { deps, store, posted } = harness({
      split: () =>
        Promise.resolve({
          tasks: [
            { repo: 'web-app', task: 'Fix the footer link' },
            { repo: 'api-server', task: 'Add a rate limit' },
          ],
        }),
    })
    await handleMessage(deps, dm('footer와 rate limit 고쳐줘'))
    const web = itemKeyOf(`dm:${DM}:100.1`, 'web-app')
    const api = itemKeyOf(`dm:${DM}:100.1`, 'api-server')
    expect([stageOf(store, web), stageOf(store, api)]).toStrictEqual(['planning', 'planning'])
    expect(getItem(store, web)).toMatchObject({ source: 'dm', task: 'Fix the footer link' })
    expect(posted).toHaveLength(1)
    expect(posted[0]?.text).toBe(
      '2개 레포로 나눴어요.\n• web-app: Fix the footer link\n• api-server: Add a rate limit\n플랜을 만드는 중이에요.',
    )
  })

  it('to be created once when Slack delivers the same DM again', async () => {
    const { deps, store, posted } = harness({
      split: () => Promise.resolve({ tasks: [{ repo: 'web-app', task: 'Fix it' }] }),
    })
    await handleMessage(deps, dm('fix'))
    await handleMessage(deps, dm('fix'))
    expect(posted).toHaveLength(1)
    expect(listEvents(store).filter((event) => event.kind === 'item_created')).toHaveLength(1)
  })

  it('to be an error reply and no items when the agent fails', async () => {
    const { deps, store, posted } = harness({ split: () => Promise.reject(new Error('budget exceeded')) })
    await handleMessage(deps, dm('do things'))
    expect(posted[0]?.text).toBe('요청을 나누지 못했어요: budget exceeded')
    expect(listEvents(store).filter((event) => event.kind === 'item_created')).toStrictEqual([])
  })

  it('to be an error reply naming what was dropped when no task names a known repo', async () => {
    const { deps, posted } = harness({
      split: () => Promise.resolve({ tasks: [{ repo: 'ghost-repo', task: 'Haunt' }] }),
    })
    await handleMessage(deps, dm('haunt'))
    expect(posted[0]?.text).toBe(
      '요청을 처리하지 못했어요: no task names a known repo\n0개 레포로 나눴어요.\n제외한 항목:\n• ghost-repo (등록되지 않은 레포)',
    )
  })

  it('to be a list of the open items on the 대기 command', async () => {
    const { deps, store, posted } = harness()
    waiting(store, 'web-app', 1)
    await handleMessage(deps, dm(' 대기 '))
    expect(posted[0]?.text).toBe('열려 있는 항목 1개\n• [승인 대기] web-app — summary web-app 1')
  })

  it('to be said as empty when nothing is open', async () => {
    const { deps, posted } = harness()
    await handleMessage(deps, dm('status'))
    expect(posted[0]?.text).toBe('대기 중인 항목이 없어요.')
  })

  it.each([
    ['another person', { user: OTHER }],
    ['a bot', { bot_id: 'B1' }],
    ['an edit', { subtype: 'message_changed' }],
    ['a channel message', { channel_type: 'channel' }],
  ])('to be ignored when it is from %s', async (_name, extra) => {
    const { deps, store, posted } = harness({
      split: () => Promise.resolve({ tasks: [{ repo: 'web-app', task: 'x' }] }),
    })
    await handleMessage(deps, dm('hello', extra))
    expect(posted).toStrictEqual([])
    expect(listEvents(store).filter((event) => event.kind === 'item_created')).toStrictEqual([])
  })

  it('to be ignored when the payload has no event', async () => {
    const { deps, posted } = harness()
    await handleMessage(deps, { type: 'event_callback' })
    await handleMessage(deps, null)
    expect(posted).toStrictEqual([])
  })
})

describe('handleMessage as a reply under a plan card', () => {
  function plannedWithCard(h: Harness): string {
    const a = key('web-app')
    createItems(h.store, thread(1), ['web-app'])
    advance(h.store, a, TO_PLANNED)
    setCardSlackRef(h.store, issueCard(h.store, a, 'plan'), `${DM}:50.5`)
    return a
  }

  it('to be the plan asked for again with the text logged and the running agent stopped', async () => {
    const h = harness()
    const a = plannedWithCard(h)
    await handleMessage(h.deps, dm('버튼 색도 바꿔줘', { thread_ts: '50.5' }))
    expect(stageOf(h.store, a)).toBe('planning')
    expect(h.aborted).toStrictEqual([a])
    expect(h.posted[0]?.text).toBe('반영해서 플랜을 다시 만들게요.')
    const logged = listEvents(h.store, { itemKey: a }).find((event) => event.type === 'revise_text')
    expect(JSON.parse(logged?.payload ?? '{}')).toMatchObject({ text: '버튼 색도 바꿔줘' })
  })

  it('to be refused, with the agent left running, when the item is already building', async () => {
    const h = harness()
    const a = plannedWithCard(h)
    advance(h.store, a, [{ type: 'approve', owner: true, card: 'plan', fresh: true }])
    await handleMessage(h.deps, dm('too late', { thread_ts: '50.5' }))
    expect(stageOf(h.store, a)).toBe('implementing')
    expect(h.aborted).toStrictEqual([])
    expect(h.posted[0]?.text).toBe('이 플랜은 지금 수정할 수 없어요.')
  })

  it('to be a hint when the thread is not a plan card', async () => {
    const h = harness()
    await handleMessage(h.deps, dm('hi', { thread_ts: '1.1' }))
    expect(h.posted[0]?.text).toBe('플랜 카드의 스레드에 답글로 적어주세요.')
  })
})

describe('describeQueue as the list the owner asks for', () => {
  it('to be capped at 40 lines with a count of the rest', () => {
    const { store } = harness()
    for (let n = 1; n <= 45; n += 1) waiting(store, 'web-app', n)
    const items = Array.from({ length: 45 }, (_, i) => getItem(store, key('web-app', i + 1))).flatMap(
      (item) => item ?? [],
    )
    const lines = describeQueue(items).split('\n')
    expect(lines[0]).toBe('열려 있는 항목 45개')
    expect(lines).toHaveLength(1 + 40 + 1)
    expect(lines.at(-1)).toBe('… 외 5개')
  })

  it('to be without the items that are finished', () => {
    const { store } = harness()
    const a = waiting(store, 'web-app', 1)
    advance(store, a, [{ type: 'reject', owner: true }])
    const item = getItem(store, a)
    expect(describeQueue(item ? [item] : [])).toBe('대기 중인 항목이 없어요.')
  })
})

// A promise the test settles by hand, to hold a step of the handler open.
function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => undefined
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}

describe('handleInteractive as the merge button pressed while the merge is going on', () => {
  function prOpen(h: Harness): string {
    const a = key('web-app')
    createItems(h.store, thread(1), ['web-app'])
    advance(h.store, a, TO_PR_OPEN)
    return a
  }

  it('to be pinned to the commit the gate was read for', async () => {
    const h = harness()
    const a = prOpen(h)
    await handleInteractive(h.deps, itemClick('merge', 0, a))
    expect(h.pinned).toStrictEqual([HEAD])
  })

  it('to be landed once when the button is pressed twice', async () => {
    const hold = gate()
    const calls: string[] = []
    const h = harness({
      mergePr: (item) => {
        calls.push(item.key)
        return hold.wait
      },
    })
    const a = prOpen(h)
    const first = handleInteractive(h.deps, itemClick('merge', 0, a))
    await handleInteractive(h.deps, itemClick('merge', 0, a))
    expect(h.posted.map((message) => message.text)).toStrictEqual(['머지를 진행하고 있어요.'])
    hold.open()
    await first
    expect(calls).toStrictEqual([a])
    expect(stageOf(h.store, a)).toBe('merged')
    expect(h.posted.at(-1)?.text).toBe('머지했어요: web-app')
  })

  it('to be unrejectable while the pull request is being landed', async () => {
    const hold = gate()
    const h = harness({ mergePr: () => hold.wait })
    const a = prOpen(h)
    const merging = handleInteractive(h.deps, itemClick('merge', 0, a))
    await handleInteractive(h.deps, itemClick('reject', 0, a))
    expect(stageOf(h.store, a)).toBe('pr_open')
    expect(h.aborted).toStrictEqual([])
    expect(h.posted.map((message) => message.text)).toStrictEqual(['머지를 진행하는 중이라 지금은 기각할 수 없어요.'])
    hold.open()
    await merging
    expect(stageOf(h.store, a)).toBe('merged')
  })

  it('to be possible again after a merge that failed', async () => {
    let attempts = 0
    const h = harness({
      mergePr: () => {
        attempts += 1
        return attempts === 1 ? Promise.reject(new Error('conflict')) : Promise.resolve()
      },
    })
    const a = prOpen(h)
    await expect(handleInteractive(h.deps, itemClick('merge', 0, a))).rejects.toThrow('conflict')
    await handleInteractive(h.deps, itemClick('merge', 0, a))
    expect(stageOf(h.store, a)).toBe('merged')
  })

  it('to be refused, with nothing merged, when the item was called off while the gate was being read', async () => {
    const h = harness()
    const a = prOpen(h)
    h.deps.checkGate = () => {
      applyEvent(h.store, a, { type: 'reject', owner: true })
      return Promise.resolve({ ci: true, review: true, headOid: HEAD })
    }
    await handleInteractive(h.deps, itemClick('merge', 0, a))
    expect(h.merged).toStrictEqual([])
    expect(stageOf(h.store, a)).toBe('declined')
    expect(h.posted[0]?.text).toBe('지금은 머지할 수 없어요.')
  })
})

describe('handleMessage as a reply under a plan card that cannot be revised', () => {
  it('to be not kept as a request: after a retry it must not come back as an instruction', async () => {
    const h = harness()
    const a = key('web-app')
    createItems(h.store, thread(1), ['web-app'])
    advance(h.store, a, [...TO_PLANNED, { type: 'approve', owner: true, card: 'plan', fresh: true }])
    setCardSlackRef(h.store, issueCard(h.store, a, 'plan'), `${DM}:50.5`)
    await handleMessage(h.deps, dm('too late', { thread_ts: '50.5' }))
    expect(h.posted[0]?.text).toBe('이 플랜은 지금 수정할 수 없어요.')
    expect(listEvents(h.store, { itemKey: a }).filter((event) => event.type === 'revise_text')).toStrictEqual([])
  })
})

describe('handleMessage as the 대기 command with a long history', () => {
  it('to be the open item even after more than a thousand finished ones', async () => {
    const h = harness()
    for (let n = 1; n <= 1001; n += 1) {
      createItems(h.store, `slack:C1:${n}`, ['web-app'])
      advance(h.store, itemKeyOf(`slack:C1:${n}`, 'web-app'), [...TO_PLANNING, { type: 'reject', owner: true }])
    }
    // Its key sorts after all the others, so it is last whether or not the clock moved between the creations.
    createItems(h.store, 'slack:C1:zzz-open', ['api-server'], { meta: { 'api-server': { summary: 'the open one' } } })
    advance(h.store, itemKeyOf('slack:C1:zzz-open', 'api-server'), TO_NOTIFIED)
    await handleMessage(h.deps, dm('대기'))
    expect(h.posted[0]?.text).toBe('열려 있는 항목 1개\n• [승인 대기] api-server — the open one')
  })

  it('to be a summary that cannot make a link or a mention', () => {
    const h = harness()
    createItems(h.store, thread(1), ['web-app'], { meta: { 'web-app': { summary: '<!channel> look & see' } } })
    advance(h.store, key('web-app'), TO_NOTIFIED)
    const item = getItem(h.store, key('web-app'))
    expect(describeQueue(item ? [item] : [])).toBe(
      '열려 있는 항목 1개\n• [승인 대기] web-app — &lt;!channel&gt; look &amp; see',
    )
  })
})
