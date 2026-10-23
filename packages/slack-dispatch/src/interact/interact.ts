// What the owner does in Slack — a click on a digest or card, or a DM — turned into item events. Everything that
// arrives is untrusted: the sender is checked first, then every id in the payload against what the store holds, and
// only then does an event reach the state machine, which has the last word. Agents are injected, so this module
// starts none by itself.

import type { AgentModel } from '../agent/claude.ts'
import type { Gate } from '../github/github.ts'
import type { CatchUp } from '../ingest/catch-up.ts'
import type { ItemEvent, Stage } from '../machine/machine.ts'
import type { SlackClient } from '../slack/client.ts'
import type { ItemRow, Store } from '../store/store.ts'
import { parseItemAction } from '../cards/cards.ts'
import { isSelectionClick, MODEL_NAME, parseDigestAction } from '../digest/digest.ts'
import { decide, isStage } from '../machine/machine.ts'
import { clip, escapeMrkdwn } from '../slack/blocks.ts'
import { describeSplit, validateSplit } from '../split/split.ts'
import { redact } from '../store/redact.ts'
import {
  applyEvent,
  createItems,
  digestItems,
  getItem,
  isLatestCard,
  listOpenItems,
  logEvent,
  setRunChoice,
} from '../store/store.ts'
import { cardAt, getWorkspace, listRuns, spentOnItem } from '../store/work.ts'

type InteractSlack = Pick<SlackClient, 'postMessage'>

export interface InteractDeps {
  store: Store
  slack: InteractSlack
  ownerId: string
  knownRepos: () => readonly string[]
  // The cheap agent that cuts a DM prompt into per-repo tasks. Its answer is checked by validateSplit.
  splitPrompt: (prompt: string, repos: readonly string[]) => Promise<unknown>
  // CI and review state of the item's PR, as the host reports it now.
  checkGate: (item: ItemRow) => Promise<Gate>
  // Lands the PR. Called only after the state machine would allow the merge.
  // `headOid` is the commit the gate was read for; the merge must be of that commit.
  mergePr: (item: ItemRow, headOid: string) => Promise<void>
  // Whether a failed item may be tried again within the budget.
  retriesLeft: (itemKey: string) => boolean
  // Stops the agent that is working on the item, if any.
  abortWork: (itemKey: string) => void
  // Looks at one past day (0 is today, 1 is yesterday) and sends what it finds; resolves when it is done.
  catchUp: (daysAgo: number) => Promise<CatchUp>
  // Things being done right now (the merge of one item), so a second click cannot repeat them.
  locks: Set<string>
  // Milliseconds since the epoch, for how long a run has been going.
  now: () => number
}

interface Where {
  channel: string
  threadTs: string
}

type DigestClick = Extract<ReturnType<typeof parseDigestAction>, { ok: true }>
type ItemClick = Extract<ReturnType<typeof parseItemAction>, { ok: true }>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function asString(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  return value
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const UNROUTED = 'unrouted'
const SUMMARY_LENGTH = 200
const QUEUE_LINES = 40

async function say(deps: InteractDeps, where: Where, text: string): Promise<void> {
  await deps.slack.postMessage({ channel: where.channel, text, threadTs: where.threadTs })
}

// Where a click happened, so the answer goes under the message that was clicked.
function clickedAt(payload: Record<string, unknown>): Where | null {
  const container = recordOrEmpty(payload.container)
  const channel = asString(container.channel_id)
  const threadTs = asString(container.message_ts)
  if (channel === null || threadTs === null) return null
  return { channel, threadTs }
}

const senderOf = (payload: Record<string, unknown>): string | null => asString(recordOrEmpty(payload.user).id)

interface Tally {
  done: number
  settled: number
  needsRepo: number
  // Items asked to build at once that have no plan from the digest, so they start with the usual plan step.
  noPlan: number
}

function tallyText(label: string, tally: Tally, model?: AgentModel): string {
  const modelNote = model === undefined ? '' : ` (모델 ${MODEL_NAME[model]})`
  const parts = [`${label} ${tally.done}개${modelNote}`]
  if (tally.noPlan > 0) parts.push(`분석된 플랜이 없어 플랜부터 시작 ${tally.noPlan}개`)
  if (tally.settled > 0) parts.push(`이미 처리된 항목 ${tally.settled}개`)
  if (tally.needsRepo > 0) parts.push(`레포를 못 정해서 대기 ${tally.needsRepo}개 (DM으로 레포를 알려주세요)`)
  return parts.join(', ')
}

// Applies one event to each item and counts the ones that moved. A refused event is not an error: the item was
// simply no longer where the owner thought it was.
function applyToAll(deps: InteractDeps, items: readonly ItemRow[], event: ItemEvent): Tally {
  const tally: Tally = { done: 0, settled: 0, needsRepo: 0, noPlan: 0 }
  for (const item of items) {
    if (applyEvent(deps.store, item.key, event).outcome.kind === 'moved') tally.done += 1
    else tally.settled += 1
  }
  return tally
}

interface Start {
  model: AgentModel
  // Build the plan the digest showed, without a plan step of its own.
  direct: boolean
}

// An item the router could not place has no repo to plan in, so it keeps waiting.
function planItems(deps: InteractDeps, items: readonly ItemRow[], start: Start): Tally {
  const routable = items.filter((item) => item.repo !== UNROUTED)
  const tally: Tally = { done: 0, settled: 0, needsRepo: items.length - routable.length, noPlan: 0 }
  for (const item of routable) {
    // Without the digest's plan there is nothing to build at once, so that item plans first.
    const hasPlan = item.meta.analysis !== undefined
    // The choice is saved before the event: the worker starts the item as soon as it is planning.
    setRunChoice(deps.store, item.key, { model: start.model, direct: start.direct && hasPlan })
    // An item sits in at most one digest, so the digest the owner clicked is always the latest card for it.
    const moved =
      applyEvent(deps.store, item.key, { type: 'approve', owner: true, card: 'assign', fresh: true }).outcome.kind ===
      'moved'
    if (!moved) tally.settled += 1
    else if (start.direct && !hasPlan) tally.noPlan += 1
    else tally.done += 1
  }
  return tally
}

async function handleDigestClick(
  deps: InteractDeps,
  payload: Record<string, unknown>,
  click: DigestClick,
): Promise<void> {
  const where = clickedAt(payload)
  if (where === null) {
    logEvent(deps.store, { kind: 'inbound', type: 'click_refused', payload: { reason: 'no message' } })
    return
  }
  const keys = digestItems(deps.store, click.digestId)
  if (keys.length === 0) {
    await say(deps, where, '알 수 없는 목록이에요.')
    return
  }
  // Ticks for items that are not in this digest are dropped, whatever the payload says.
  const picked = new Set(click.selected.filter((key) => keys.includes(key)))
  const items = keys.flatMap((key) => getItem(deps.store, key) ?? [])
  const chosen = items.filter((item) => picked.has(item.key))
  logEvent(deps.store, {
    kind: 'inbound',
    type: `digest_${click.action}`,
    payload: { digestId: click.digestId, selected: [...picked], ignored: click.selected.length - picked.size },
  })
  if (click.action === 'plan_all') {
    await say(
      deps,
      where,
      tallyText('플랜 시작', planItems(deps, items, { model: click.model, direct: false }), click.model),
    )
    return
  }
  if (click.action === 'reject_rest') {
    // Only what still waits: an item the owner already sent to planning is not pulled back by this button.
    const rest = items.filter((item) => !picked.has(item.key) && item.stage === 'notified')
    await say(deps, where, tallyText('기각', applyToAll(deps, rest, { type: 'reject', owner: true })))
    return
  }
  if (chosen.length === 0) {
    await say(deps, where, '고른 항목이 없어요. 체크박스로 항목을 고른 뒤 눌러주세요.')
    return
  }
  const direct = click.action === 'build_selected'
  const tally = planItems(deps, chosen, { model: click.model, direct })
  await say(deps, where, tallyText(direct ? '바로 구현' : '플랜 시작', tally, click.model))
}

function refusalText(decision: ReturnType<typeof decide>): string {
  if (decision.kind === 'refused' && decision.reason === 'gate_not_met') return 'CI나 리뷰가 아직 통과하지 않았어요.'
  return '지금은 머지할 수 없어요.'
}

async function landPr(deps: InteractDeps, itemKey: string, where: Where): Promise<void> {
  const before = getItem(deps.store, itemKey)
  if (before === undefined) return
  const gate = await deps.checkGate(before)
  // The owner may have called the item off while the gate was being read, so the stage is read again.
  const item = getItem(deps.store, itemKey) ?? before
  const event = { type: 'merge', owner: true, ci: gate.ci, review: gate.review } as const
  const decision = decide(item.stage, event)
  if (decision.kind !== 'moved') {
    applyEvent(deps.store, item.key, event)
    await say(deps, where, refusalText(decision))
    return
  }
  // Land the PR first: when that fails the item stays open, instead of being recorded as merged while it is not.
  await deps.mergePr(item, gate.headOid)
  applyEvent(deps.store, item.key, event)
  await say(deps, where, `머지했어요: ${item.repo}`)
}

const mergeLock = (itemKey: string): string => `merge:${itemKey}`

// A second click while the first is landing the PR would land it twice.
async function mergeIfAllowed(deps: InteractDeps, item: ItemRow, where: Where): Promise<void> {
  const lock = mergeLock(item.key)
  if (deps.locks.has(lock)) {
    await say(deps, where, '머지를 진행하고 있어요.')
    return
  }
  deps.locks.add(lock)
  try {
    await landPr(deps, item.key, where)
  } finally {
    deps.locks.delete(lock)
  }
}

// The folder and the branch an item is worked in, as lines under a message; nothing when it has no workspace yet.
function workspaceLines(deps: InteractDeps, itemKey: string): string {
  const workspace = getWorkspace(deps.store, itemKey)
  if (workspace === undefined) return ''
  const plain = (text: string): string => text.replaceAll('`', "'")
  return `\n• 작업 위치: \`${plain(workspace.path)}\`\n• 브랜치: \`${plain(workspace.branch)}\``
}

// A build at once has no plan step, so a retry goes straight to the build.
function retryText(item: ItemRow, moved: boolean): string {
  if (!moved) return '다시 시도할 수 없어요.'
  return item.meta.direct === true ? '다시 구현할게요.' : '다시 플랜부터 시작할게요.'
}

function approvePlanText(applied: ReturnType<typeof applyEvent>): string {
  if (applied.outcome.kind === 'moved') return '구현을 시작할게요.'
  if (applied.outcome.kind === 'refused' && applied.outcome.reason === 'stale') {
    return '오래된 카드예요. 가장 최근 플랜 카드에서 눌러주세요.'
  }
  return '이미 처리된 카드예요.'
}

async function handleItemClick(deps: InteractDeps, payload: Record<string, unknown>, click: ItemClick): Promise<void> {
  const where = clickedAt(payload)
  const item = getItem(deps.store, click.itemKey)
  if (where === null || item === undefined) {
    logEvent(deps.store, { kind: 'inbound', type: 'click_refused', payload: { reason: 'unknown item or message' } })
    return
  }
  logEvent(deps.store, {
    itemKey: item.key,
    kind: 'inbound',
    type: `item_${click.action}`,
    payload: { cardId: click.cardId },
  })
  switch (click.action) {
    case 'approve_plan': {
      const fresh = isLatestCard(deps.store, item.key, 'plan', click.cardId)
      const applied = applyEvent(deps.store, item.key, { type: 'approve', owner: true, card: 'plan', fresh })
      // Where the work happens is said up front: the owner can open the folder and watch.
      const place = applied.outcome.kind === 'moved' ? workspaceLines(deps, item.key) : ''
      await say(deps, where, `${approvePlanText(applied)}${place}`)
      return
    }
    case 'reject':
    case 'cancel': {
      if (deps.locks.has(mergeLock(item.key))) {
        await say(deps, where, '머지를 진행하는 중이라 지금은 기각할 수 없어요.')
        return
      }
      const applied = applyEvent(deps.store, item.key, { type: 'reject', owner: true })
      // The agent is stopped only when the item really was called off, not when the click came too late.
      if (applied.outcome.kind === 'moved') deps.abortWork(item.key)
      await say(deps, where, applied.outcome.kind === 'moved' ? '기각했어요.' : '그대로 두었어요.')
      return
    }
    case 'merge':
      await mergeIfAllowed(deps, item, where)
      return
    case 'retry': {
      const applied = applyEvent(deps.store, item.key, {
        type: 'retry',
        owner: true,
        allowed: deps.retriesLeft(item.key),
      })
      await say(deps, where, retryText(item, applied.outcome.kind === 'moved'))
    }
  }
}

// A click payload from Slack. Anything but the owner is logged and nothing else happens.
export async function handleInteractive(deps: InteractDeps, payload: unknown): Promise<void> {
  if (!isRecord(payload)) return
  if (senderOf(payload) !== deps.ownerId) {
    logEvent(deps.store, { kind: 'inbound', type: 'click_refused', payload: { reason: 'not_owner' } })
    return
  }
  // Ticking a check box or choosing a model acts on nothing by itself, so it is neither handled nor logged.
  if (isSelectionClick(payload)) return
  const digest = parseDigestAction(payload)
  if (digest.ok) {
    await handleDigestClick(deps, payload, digest)
    return
  }
  const action = parseItemAction(payload)
  if (action.ok) {
    await handleItemClick(deps, payload, action)
    return
  }
  logEvent(deps.store, {
    kind: 'inbound',
    type: 'click_unknown',
    payload: { digest: digest.error, item: action.error },
  })
}

// Every stage in words, for an owner who asks about an item that may be in any of them.
const STAGE_NAME: Readonly<Record<Stage, string>> = {
  ingested: '접수됨',
  notified: '승인 대기',
  planning: '플랜 작성 중',
  planned: '플랜 확인 대기',
  implementing: '구현 중',
  pr_open: 'PR 머지 대기',
  merged: '머지됨',
  skipped: '건너뜀',
  declined: '기각됨',
  failed: '실패',
}

// The stages in which something runs, and so there is something to wait for.
const WORKING: ReadonlySet<Stage> = new Set(['planning', 'planned', 'implementing'])

const STAGE_LABEL: Partial<Record<Stage, string>> = {
  notified: '승인 대기',
  planning: '플랜 작성 중',
  planned: '플랜 확인 대기',
  implementing: '구현 중',
  pr_open: 'PR 머지 대기',
  failed: '실패',
}

const OPEN_STAGES = Object.keys(STAGE_LABEL).filter(isStage)

export function describeQueue(items: readonly ItemRow[]): string {
  const open = items.flatMap((item) => {
    const label = STAGE_LABEL[item.stage]
    return label === undefined ? [] : [{ item, label }]
  })
  if (open.length === 0) return '대기 중인 항목이 없어요.'
  const lines = open
    .slice(0, QUEUE_LINES)
    .map(({ item, label }) => `• [${label}] ${item.repo} — ${escapeMrkdwn(clip(item.meta.summary ?? item.task, 80))}`)
  const more = open.length > QUEUE_LINES ? [`… 외 ${open.length - QUEUE_LINES}개`] : []
  return [`열려 있는 항목 ${open.length}개`, ...lines, ...more].join('\n')
}

const QUEUE_COMMAND = /^(?:대기|상태|status|list)$/i

const MAX_DAYS_AGO = 30
const DAY_WORDS: Readonly<Record<string, number>> = { 오늘: 0, 어제: 1, 그제: 2, 그저께: 2 }
const DAYS_AGO_COMMAND = /^(\d{1,2})\s*일\s*전$/

// "어제", "그제", "3일 전": which past day the owner wants to see, or null when the text is not such a command.
function daysAgoOf(text: string): number | null {
  const word = Object.hasOwn(DAY_WORDS, text) ? DAY_WORDS[text] : undefined
  if (word !== undefined) return word
  const days = Number(DAYS_AGO_COMMAND.exec(text)?.[1])
  if (!Number.isInteger(days) || days > MAX_DAYS_AGO) return null
  return days
}

async function runCatchUp(deps: InteractDeps, where: Where, daysAgo: number): Promise<void> {
  await say(deps, where, '그날 태그된 쓰레드를 찾는 중이에요. 항목마다 읽어서 정리하느라 몇 분 걸릴 수 있어요.')
  try {
    const { day, summary } = await deps.catchUp(daysAgo)
    const listed =
      summary.created === 0 ? '새로 판단할 항목은 없어요' : `새 항목 ${summary.created}개는 위 목록에 있어요`
    await say(
      deps,
      where,
      `${day}에 태그된 쓰레드 ${summary.threads}개: ${listed}, 뺀 쓰레드 ${summary.skipped.length}개.`,
    )
  } catch (error) {
    await say(deps, where, `찾지 못했어요: ${escapeMrkdwn(redact(errorText(error)))}`)
  }
}

async function startFromPrompt(deps: InteractDeps, where: Where, prompt: string): Promise<void> {
  const repos = deps.knownRepos()
  let result: ReturnType<typeof validateSplit>
  try {
    result = validateSplit(await deps.splitPrompt(prompt, repos), repos)
  } catch (error) {
    await say(deps, where, `요청을 나누지 못했어요: ${errorText(error)}`)
    return
  }
  if (!result.ok) {
    await say(deps, where, `요청을 처리하지 못했어요: ${result.error}\n${describeSplit([], result.dropped)}`)
    return
  }
  // The DM's own timestamp names the request, so a delivery Slack repeats creates nothing twice.
  const threadKey = `dm:${where.channel}:${where.threadTs}`
  const tasks = Object.fromEntries(result.tasks.map(({ repo, task }) => [repo, task]))
  const meta = Object.fromEntries(
    result.tasks.map(({ repo, task }) => [
      repo,
      { summary: clip(task, SUMMARY_LENGTH), url: '', route: 'DM 요청', urgent: false },
    ]),
  )
  const repoNames = result.tasks.map((task) => task.repo)
  const created = createItems(deps.store, threadKey, repoNames, { source: 'dm', tasks, meta })
  const fresh = created.filter((entry) => entry.created)
  // The owner asked for it, so the routing is sure and no digest is needed.
  for (const { key } of fresh) applyEvent(deps.store, key, { type: 'triage', handled: false, confident: true })
  if (fresh.length > 0)
    await say(deps, where, `${describeSplit(result.tasks, result.dropped)}\n플랜을 만드는 중이에요.`)
}

const MINUTE_MS = 60_000

// Where an item stands, for an owner who wrote under its plan card while it is not waiting for a plan change: the
// stage, how long the run has been going, where it works and what it has cost.
function describeProgress(deps: InteractDeps, item: ItemRow): string {
  const label = STAGE_NAME[item.stage]
  const waiting = WORKING.has(item.stage)
  const lines = [
    waiting
      ? `지금은 '${label}' 단계라 플랜을 수정할 수 없어요.`
      : `이 항목은 지금 '${label}' 상태라 플랜을 수정할 수 없어요.`,
  ]
  const running = listRuns(deps.store, item.key).findLast((run) => run.state === 'running')
  if (running !== undefined) {
    const minutes = Math.max(1, Math.round((deps.now() - Date.parse(running.startedAt)) / MINUTE_MS))
    lines.push(`• ${running.kind === 'build' ? '구현' : '플랜'} ${minutes}분째 진행 중`)
  }
  lines.push(`• 지금까지 쓴 비용: $${spentOnItem(deps.store, item.key).toFixed(2)}`)
  const closing = waiting ? '\n끝나면 DM에 새 메시지로 알려드려요.' : ''
  return `${lines.join('\n')}${workspaceLines(deps, item.key)}${closing}`
}

// A reply under a plan card is the owner asking for changes to the plan.
async function reviseFromReply(deps: InteractDeps, where: Where, text: string): Promise<void> {
  const card = cardAt(deps.store, `${where.channel}:${where.threadTs}`)
  if (card?.kind !== 'plan') {
    await say(deps, where, '플랜 카드의 스레드에 답글로 적어주세요.')
    return
  }
  const applied = applyEvent(deps.store, card.itemKey, { type: 'revise', owner: true })
  if (applied.outcome.kind === 'refused') {
    const item = getItem(deps.store, card.itemKey)
    await say(deps, where, item === undefined ? '이 플랜은 지금 수정할 수 없어요.' : describeProgress(deps, item))
    return
  }
  // Kept only for a request the item accepted: a refused one must not come back as an instruction after a retry.
  logEvent(deps.store, {
    itemKey: card.itemKey,
    kind: 'inbound',
    type: 'revise_text',
    payload: { text, cardId: card.id },
  })
  // A plan that is being made now answers an older instruction, so the agent working on it is stopped.
  deps.abortWork(card.itemKey)
  await say(deps, where, '반영해서 플랜을 다시 만들게요.')
}

interface OwnerMessage {
  channel: string
  ts: string
  threadTs: string | null
  text: string
}

// Only the owner's own plain messages count; bots, edits and other people are ignored.
function readMessage(deps: InteractDeps, payload: unknown): OwnerMessage | null {
  const event = recordOrEmpty(recordOrEmpty(payload).event)
  if (event.type !== 'message' || event.channel_type !== 'im') return null
  if (event.subtype !== undefined || event.bot_id !== undefined) return null
  const text = asString(event.text)
  const channel = asString(event.channel)
  const ts = asString(event.ts)
  if (text === null || channel === null || ts === null) return null
  if (asString(event.user) !== deps.ownerId) {
    logEvent(deps.store, { kind: 'inbound', type: 'message_ignored', payload: { reason: 'not_owner' } })
    return null
  }
  return { channel, ts, threadTs: asString(event.thread_ts), text }
}

export async function handleMessage(deps: InteractDeps, payload: unknown): Promise<void> {
  const message = readMessage(deps, payload)
  if (message === null) return
  const { channel, ts, threadTs, text } = message
  logEvent(deps.store, { kind: 'inbound', type: 'owner_message', payload: { channel, ts, threadTs, text } })
  if (threadTs !== null && threadTs !== ts) {
    await reviseFromReply(deps, { channel, threadTs }, text)
    return
  }
  const where = { channel, threadTs: ts }
  if (QUEUE_COMMAND.test(text.trim())) {
    await say(deps, where, describeQueue(listOpenItems(deps.store, OPEN_STAGES)))
    return
  }
  const daysAgo = daysAgoOf(text.trim())
  if (daysAgo !== null) {
    await runCatchUp(deps, where, daysAgo)
    return
  }
  await startFromPrompt(deps, where, text)
}
