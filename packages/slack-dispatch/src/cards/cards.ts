// The cards the owner decides on after the digest: the plan, the finished PR, and a failure. Like the digest, only
// pure functions live here — what a click does belongs to the interaction handler.

import type { ActionElement, Block, DigestMessage } from '../digest/digest.ts'
import { clip, escapeMrkdwn, firstAction, fitText, matchAction } from '../slack/blocks.ts'

type ItemAction = 'approve_plan' | 'reject' | 'merge' | 'retry' | 'cancel'

// Slack limits: 3000 characters per section, 150 per button value.
const SECTION_TEXT_LIMIT = 3000
const VALUE_LIMIT = 150
const TITLE_LIMIT = 100
// The report shares its section with a line above it.
const REPORT_LIMIT = 2500

const REVISE_HINT = '고치고 싶은 점은 이 메시지의 스레드에 답글로 적어주세요.'

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
  const source = input.threadUrl === '' ? '' : `<${input.threadUrl}|원본 쓰레드>`
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    section(escapeMrkdwn(shownPlan(input.plan))),
    {
      type: 'actions',
      block_id: `plan:${input.cardId}`,
      elements: [
        button('approve_plan', input.cardId, input.itemKey, '승인하고 구현 시작', 'primary'),
        button('reject', input.cardId, input.itemKey, '기각', 'danger'),
      ],
    },
    context(source === '' ? REVISE_HINT : `${source} · ${REVISE_HINT}`),
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
