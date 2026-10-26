// The cards the owner decides on after the digest: the plan, the finished PR, and a failure. Like the digest, only
// pure functions live here — what a click does belongs to the interaction handler.

import type { ActionElement, Block, DigestMessage } from '../digest/digest.ts'
import { clip, escapeMrkdwn, firstAction, fitText, matchAction, sourceLink } from '../slack/blocks.ts'

type ItemAction = 'approve_plan' | 'reject' | 'merge' | 'retry' | 'cancel'

// Slack limits: 3000 characters per section, 150 per button value.
const SECTION_TEXT_LIMIT = 3000
const VALUE_LIMIT = 150
const TITLE_LIMIT = 100
// The report shares its section with a line above it.
const REPORT_LIMIT = 2500

// Shown between the plan and the buttons, because a reply in the thread is the only way to ask for a change.
const REVISE_HINT =
  '*✏️ 플랜을 고치고 싶으면* 이 메시지의 *스레드에 답글*로 지시를 적어 주세요. 같은 세션이 플랜을 고쳐서 새 카드로 다시 보내요.'

const ITEM_ACTIONS: ReadonlySet<string> = new Set(['approve_plan', 'reject', 'merge', 'retry', 'cancel'])

const ACTION_PATTERN = /^item\.(approve_plan|reject|merge|retry|cancel):(\d+)$/

const section = (text: string): Block => ({ type: 'section', text: { type: 'mrkdwn', text } })

const context = (text: string): Block => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] })

function button(
  action: ItemAction,
  cardId: number,
  itemKey: string,
  label: string,
  style?: 'primary' | 'danger',
): ActionElement {
  if (itemKey.length > VALUE_LIMIT) throw new RangeError(`item key is longer than ${VALUE_LIMIT}`)
  return {
    type: 'button',
    action_id: `item.${action}:${cardId}`,
    text: { type: 'plain_text', text: label },
    ...(style ? { style } : {}),
    value: itemKey,
  }
}

// The part of the text that fits a section once it is escaped for Slack, cut at whole lines. Escaping makes text
// longer, so the cut is made on the raw text and shortened until the escaped form fits.
function fitEscaped(text: string, limit: number): string {
  let room = limit
  for (;;) {
    const shown = fitText(text, room)
    const overflow = escapeMrkdwn(shown).length - limit
    if (overflow <= 0 || room <= 0) return shown
    room -= overflow
  }
}

// What the owner is shown of a plan or a report. The pull request body is cut the same way, so nothing the owner
// did not see gets published.
export const shownPlan = (plan: string): string => fitEscaped(plan, SECTION_TEXT_LIMIT)

export const shownReport = (report: string): string => fitEscaped(report, REPORT_LIMIT)

export interface PlanCardInput {
  itemKey: string
  cardId: number
  repo: string
  plan: string
  threadUrl: string
}

export function buildPlanCard(input: PlanCardInput): DigestMessage {
  const title = `플랜: ${clip(input.repo, TITLE_LIMIT)}`
  const source = sourceLink(input.threadUrl)
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    section(escapeMrkdwn(shownPlan(input.plan))),
    section(REVISE_HINT),
    {
      type: 'actions',
      block_id: `plan:${input.cardId}`,
      elements: [
        button('approve_plan', input.cardId, input.itemKey, '승인하고 구현 시작', 'primary'),
        button('reject', input.cardId, input.itemKey, '기각', 'danger'),
      ],
    },
    ...(source === '' ? [] : [context(source)]),
  ]
  return { text: title, blocks }
}

export interface DirectStartCardInput {
  itemKey: string
  cardId: number
  repo: string
  // The plan the owner read in the digest, which is what gets built.
  plan: string
  threadUrl: string
  // Where the work happens, shown so the owner can open it.
  path: string
  branch: string
}

const PROGRESS_HINT = '진행 상황이 궁금하면 이 메시지의 스레드에 답글로 물어보세요. 끝나면 DM에 새 메시지로 알려드려요.'

// A build that starts without a plan step has no plan card, and so no button to stop it: this card has one.
export function buildDirectStartCard(input: DirectStartCardInput): DigestMessage {
  const title = `바로 구현 시작: ${clip(input.repo, TITLE_LIMIT)}`
  const source = sourceLink(input.threadUrl)
  const where = `작업 위치: \`${input.path.replaceAll('`', "'")}\`\n브랜치: \`${input.branch.replaceAll('`', "'")}\``
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    section(escapeMrkdwn(shownPlan(input.plan))),
    context(`${where}\n${PROGRESS_HINT}`),
    {
      type: 'actions',
      block_id: `direct:${input.cardId}`,
      elements: [button('reject', input.cardId, input.itemKey, '기각 (구현 중단)', 'danger')],
    },
    ...(source === '' ? [] : [context(source)]),
  ]
  return { text: title, blocks }
}

export interface PrCardInput {
  itemKey: string
  repo: string
  // The pull request, or null when the worker was told not to open one and only committed locally.
  prUrl: string | null
  // What the build reported, as the owner should read it.
  report: string
  // One line on Visual QA: that it passed, or why it was skipped.
  qa: string
}

function prCardBody(input: PrCardInput): { head: string; buttons: ActionElement[]; note: string } {
  if (input.prUrl === null) {
    return {
      head: '로컬 커밋만 만들었어요. PR은 열지 않는 모드예요.',
      buttons: [button('cancel', 0, input.itemKey, '폐기 (워크트리 삭제)', 'danger')],
      note: `${input.qa} 폐기하면 워크트리를 지워요. 커밋은 브랜치에 남을 수 있어요.`,
    }
  }
  return {
    head: `<${input.prUrl}|PR 열기>`,
    buttons: [
      button('merge', 0, input.itemKey, '머지', 'primary'),
      button('cancel', 0, input.itemKey, '기각', 'danger'),
    ],
    note: `${input.qa} 머지는 CI와 리뷰가 통과했을 때만 되고, 기각해도 열린 PR은 GitHub에서 직접 닫아야 해요.`,
  }
}

export function buildPrCard(input: PrCardInput): DigestMessage {
  const title = `${input.prUrl === null ? '구현 완료' : 'PR 준비됨'}: ${clip(input.repo, TITLE_LIMIT)}`
  const body = prCardBody(input)
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    section(`${body.head}\n${escapeMrkdwn(shownReport(input.report))}`),
    { type: 'actions', block_id: `pr:${input.itemKey}`.slice(0, 255), elements: body.buttons },
    context(body.note),
  ]
  return { text: title, blocks }
}

export interface FailedCardInput {
  itemKey: string
  repo: string
  reason: string
  // Whether another try is still within the budget.
  canRetry: boolean
}

// A failed item is left where it is until the owner retries it; there is no way to call it off, because nothing runs.
export function buildFailedCard(input: FailedCardInput): DigestMessage {
  const title = `실패: ${clip(input.repo, TITLE_LIMIT)}`
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    section(escapeMrkdwn(fitEscaped(input.reason, SECTION_TEXT_LIMIT))),
  ]
  if (input.canRetry) {
    blocks.push({
      type: 'actions',
      block_id: `failed:${input.itemKey}`.slice(0, 255),
      elements: [button('retry', 0, input.itemKey, '다시 시도', 'primary')],
    })
  } else {
    blocks.push(context('다시 시도할 수 없어요: 재시도 횟수나 비용 한도를 다 썼어요.'))
  }
  return { text: title, blocks }
}

export type ParsedItemAction =
  | { ok: true; action: ItemAction; cardId: number; itemKey: string }
  | { ok: false; error: string }

const isItemAction = (value: string): value is ItemAction => ITEM_ACTIONS.has(value)

// The value of the button is untrusted, like every part of a click: the handler checks the item it names.
export function parseItemAction(payload: unknown): ParsedItemAction {
  const first = firstAction(payload)
  if (!first.ok) return first
  const matched = matchAction(first.actionId, ACTION_PATTERN, isItemAction, 'an item action')
  if (!matched.ok) return matched
  if (typeof first.value !== 'string' || first.value === '' || first.value.length > VALUE_LIMIT) {
    return { ok: false, error: 'the button has no item' }
  }
  return { ok: true, action: matched.action, cardId: Number(matched.id), itemKey: first.value }
}
