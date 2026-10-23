// The digest DM: every item that is new since the last digest, one section per item with what was asked, the likely
// cause, a plan and a recommendation, and a check box on it. The recommended ones arrive already checked, so the
// owner only has to uncheck what they do not want. Pure functions only — sending the message and reading the click
// belong to the worker.

import type { Analysis } from '../triage/analysis.ts'
import { clip, escapeMrkdwn, firstAction, fitText, matchAction } from '../slack/blocks.ts'

export interface DigestEntry {
  itemKey: string
  repo: string
  summary: string
  threadUrl: string
  // Which routing rule picked the repo, so the owner can judge the suggestion.
  route: string
  urgent: boolean
  // What the cheapest model made of the thread; missing when it could not be asked or failed.
  analysis?: Analysis
}

interface PlainText {
  type: 'plain_text'
  text: string
}

interface MarkdownText {
  type: 'mrkdwn'
  text: string
}

interface CheckboxOption {
  text: MarkdownText
  value: string
}

interface Checkboxes {
  type: 'checkboxes'
  action_id: string
  options: CheckboxOption[]
  // The options that are checked when the message arrives.
  initial_options?: CheckboxOption[]
}

export type ActionElement =
  | Checkboxes
  | { type: 'button'; action_id: string; text: PlainText; style?: 'primary' | 'danger'; value: string }

export type Block =
  | { type: 'header'; text: PlainText }
  | { type: 'section'; text: MarkdownText; block_id?: string; accessory?: Checkboxes }
  | { type: 'context'; elements: MarkdownText[] }
  | { type: 'actions'; block_id: string; elements: ActionElement[] }

export interface DigestMessage {
  // Shown in notifications and by clients that cannot render blocks.
  text: string
  blocks: Block[]
}

// Slack limits: 50 blocks per message (a header, one per item, the buttons and a note make 43 at most), 3000
// characters per section, 150 per option value.
export const MAX_ENTRIES_PER_DIGEST = 40
const OPTION_VALUE_LIMIT = 150
const SECTION_TEXT_LIMIT = 3000
const REPO_SHOWN = 40
const ROUTE_SHOWN = 60
const SUMMARY_SHOWN = 300

const ACTION_PATTERN = /^digest\.(plan_selected|plan_all|reject_rest):(\d+)$/
const PICK_PREFIX = 'digest.pick:'

type DigestAction = 'plan_selected' | 'plan_all' | 'reject_rest'

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size))
  return out
}

// Items of one repo sit together, in the order the repos first appeared.
function groupedByRepo(entries: readonly DigestEntry[]): DigestEntry[] {
  const groups = new Map<string, DigestEntry[]>()
  for (const entry of entries) groups.set(entry.repo, [...(groups.get(entry.repo) ?? []), entry])
  return [...groups.values()].flat()
}

function recommendation(analysis: Analysis): string {
  const mark = analysis.recommend ? 'O' : 'X'
  return analysis.why === '' ? mark : `${mark} — ${escapeMrkdwn(analysis.why)}`
}

function bodyLines(entry: DigestEntry): string[] {
  const { analysis } = entry
  if (analysis === undefined) {
    return [
      `*요청사항:* ${escapeMrkdwn(clip(entry.summary, SUMMARY_SHOWN))}`,
      '_분석을 못 했어요. 원본을 확인해 주세요._',
      '*구현 추천:* X',
    ]
  }
  return [
    `*요청사항:* ${escapeMrkdwn(analysis.request)}`,
    `*원인:* ${escapeMrkdwn(analysis.cause)}`,
    `*개선 플랜:* ${escapeMrkdwn(analysis.plan)}`,
    `*구현 추천:* ${recommendation(analysis)}`,
  ]
}

function headLine(entry: DigestEntry, number: number): string {
  const urgent = entry.urgent ? ' :rotating_light:' : ''
  // An item without a thread (the owner's own DM) has nothing to link to.
  const link = entry.threadUrl === '' ? '' : `  <${entry.threadUrl}|원본 쓰레드>`
  const route = entry.route === '' ? '' : `  _${escapeMrkdwn(clip(entry.route, ROUTE_SHOWN))}_`
  return `*${number}. ${escapeMrkdwn(clip(entry.repo, REPO_SHOWN))}*${urgent}${link}${route}`
}

function checkedWhenRecommended(entry: DigestEntry, option: CheckboxOption): { initial_options?: CheckboxOption[] } {
  if (entry.analysis?.recommend !== true) return {}
  return { initial_options: [option] }
}

function itemBlock(digestId: number, index: number, entry: DigestEntry): Block {
  if (entry.itemKey.length > OPTION_VALUE_LIMIT) throw new RangeError(`item key is longer than ${OPTION_VALUE_LIMIT}`)
  const option: CheckboxOption = { text: { type: 'mrkdwn', text: '플랜 시작' }, value: entry.itemKey }
  const text = [headLine(entry, index + 1), ...bodyLines(entry)].join('\n')
  return {
    type: 'section',
    block_id: `digest:${digestId}:item:${index}`,
    text: { type: 'mrkdwn', text: fitText(text, SECTION_TEXT_LIMIT) },
    accessory: {
      type: 'checkboxes',
      action_id: `${PICK_PREFIX}${digestId}:${index}`,
      options: [option],
      ...checkedWhenRecommended(entry, option),
    },
  }
}

const button = (
  action: DigestAction,
  digestId: number,
  label: string,
  style?: 'primary' | 'danger',
): ActionElement => ({
  type: 'button',
  action_id: `digest.${action}:${digestId}`,
  text: { type: 'plain_text', text: label },
  ...(style ? { style } : {}),
  value: String(digestId),
})

export function buildDigest(digestId: number, entries: readonly DigestEntry[]): DigestMessage {
  if (entries.length === 0) throw new RangeError('a digest needs at least one entry')
  if (entries.length > MAX_ENTRIES_PER_DIGEST) {
    throw new RangeError(`a digest holds at most ${MAX_ENTRIES_PER_DIGEST} entries; split it first`)
  }
  const urgent = entries.filter((entry) => entry.urgent).length
  const recommended = entries.filter((entry) => entry.analysis?.recommend === true).length
  const urgentNote = urgent > 0 ? ` (긴급 ${urgent}개)` : ''
  const recommendedNote = recommended > 0 ? ` · 구현 추천 ${recommended}개` : ''
  const title = `새 항목 ${entries.length}개${urgentNote}${recommendedNote}`
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    ...groupedByRepo(entries).map((entry, index) => itemBlock(digestId, index, entry)),
    {
      type: 'actions',
      block_id: `digest:${digestId}:decide`,
      elements: [
        button('plan_selected', digestId, '선택한 항목 플랜 시작', 'primary'),
        button('plan_all', digestId, '전체 플랜 시작'),
        button('reject_rest', digestId, '선택 안 한 항목 기각', 'danger'),
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '구현을 추천한 항목은 미리 체크해 두었어요. 체크를 바꾼 뒤 "선택한 항목 플랜 시작"을 누르세요. 고르지 않은 항목은 그대로 대기하고, DM에 "대기"라고 보내면 다시 볼 수 있어요.',
        },
      ],
    },
  ]
  return { text: title, blocks }
}

// More new items than one message holds become several digests, in the order they arrived.
export function splitDigest(entries: readonly DigestEntry[]): DigestEntry[][] {
  return chunk(entries, MAX_ENTRIES_PER_DIGEST)
}

export type ParsedAction =
  | { ok: true; action: DigestAction; digestId: number; selected: string[] }
  | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isDigestAction(value: string): value is DigestAction {
  return value === 'plan_selected' || value === 'plan_all' || value === 'reject_rest'
}

function optionValue(option: unknown): string[] {
  if (!isRecord(option)) return []
  return typeof option.value === 'string' ? [option.value] : []
}

function selectedOptions(element: unknown): string[] {
  if (!isRecord(element) || element.type !== 'checkboxes' || !Array.isArray(element.selected_options)) return []
  return element.selected_options.flatMap(optionValue)
}

// What the owner ticked, read from the message state of this digest only. The values are untrusted: the worker
// must check each one against the items stored for the digest before applying anything.
function pickedItems(payload: Record<string, unknown>, digestId: number): string[] {
  const state = payload.state
  if (!isRecord(state) || !isRecord(state.values)) return []
  const prefix = `${PICK_PREFIX}${digestId}:`
  const picked = Object.values(state.values).flatMap((block) =>
    isRecord(block)
      ? Object.entries(block).flatMap(([actionId, element]) =>
          actionId.startsWith(prefix) ? selectedOptions(element) : [],
        )
      : [],
  )
  return [...new Set(picked)]
}

export function parseDigestAction(payload: unknown): ParsedAction {
  const first = firstAction(payload)
  if (!first.ok) return first
  const matched = matchAction(first.actionId, ACTION_PATTERN, isDigestAction, 'a digest action')
  if (!matched.ok) return matched
  const digestId = Number(matched.id)
  return { ok: true, action: matched.action, digestId, selected: pickedItems(first.payload, digestId) }
}

// A click on a check box only changes what is ticked; the buttons are what act on it. Told apart here so such a click
// can be let through without a log row for each tick.
export function isPickClick(payload: unknown): boolean {
  const first = firstAction(payload)
  return first.ok && first.actionId.startsWith(PICK_PREFIX)
}
