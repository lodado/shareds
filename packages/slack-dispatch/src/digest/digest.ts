// The digest DM: every item that is new since the last digest, one section per item with what was asked, the likely
// cause, a plan and a recommendation, and a check box on it. The recommended ones arrive already checked, so the
// owner only has to uncheck what they do not want. Under the items the owner picks a model and either starts the
// usual plan step or builds the plan shown here at once. Pure functions only — sending the message and reading the
// click belong to the worker.

import type { AgentModel } from '../agent/claude.ts'
import type { Analysis } from '../triage/analysis.ts'
import { DEFAULT_MODEL, isAgentModel } from '../agent/claude.ts'
import { clip, escapeMrkdwn, firstAction, fitText, matchAction, repoLabel, sourceLink } from '../slack/blocks.ts'

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

interface ModelOption {
  text: PlainText
  value: AgentModel
}

interface ModelSelect {
  type: 'static_select'
  action_id: string
  placeholder: PlainText
  options: ModelOption[]
  initial_option: ModelOption
}

export type ActionElement =
  | Checkboxes
  | ModelSelect
  | { type: 'button'; action_id: string; text: PlainText; style?: 'primary' | 'danger'; value: string }

export type Block =
  | { type: 'header'; text: PlainText }
  | { type: 'section'; text: MarkdownText; block_id?: string; accessory?: Checkboxes }
  | { type: 'context'; elements: MarkdownText[] }
  | { type: 'actions'; block_id: string; elements: ActionElement[] }
  | {
      type: 'input'
      block_id: string
      optional: true
      label: PlainText
      hint: PlainText
      element: { type: 'plain_text_input'; action_id: string; multiline: true; max_length: number; placeholder: PlainText }
    }

export interface DigestMessage {
  // Shown in notifications and by clients that cannot render blocks.
  text: string
  blocks: Block[]
}

// Slack limits: 50 blocks per message (a header, one per item, the plan box, the buttons and a note make 44 at most),
// 3000 characters per section, 150 per option value.
export const MAX_ENTRIES_PER_DIGEST = 40
const OPTION_VALUE_LIMIT = 150
const SECTION_TEXT_LIMIT = 3000
const REPO_SHOWN = 40
const ROUTE_SHOWN = 60
const SUMMARY_SHOWN = 300

const ACTION_PATTERN = /^digest\.(plan_selected|build_selected|plan_all|reject_rest):(\d+)$/
const PICK_PREFIX = 'digest.pick:'
const MODEL_PREFIX = 'digest.model:'
const OWN_PLAN_PREFIX = 'digest.ownplan:'
// The most the owner's own plan may hold; Slack's own limit for a text box is 3000.
export const OWN_PLAN_LIMIT = 3000

type DigestAction = 'plan_selected' | 'build_selected' | 'plan_all' | 'reject_rest'

// The short name of a model in a message to the owner.
export const MODEL_NAME: Readonly<Record<AgentModel, string>> = {
  opusplan: '자동',
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
}

// What each model choice means, in the words the owner reads in the menu.
const MODEL_LABEL: Readonly<Record<AgentModel, string>> = {
  opusplan: '자동 (플랜 Opus, 구현 Sonnet)',
  opus: 'Opus (플랜과 구현 모두)',
  sonnet: 'Sonnet (플랜과 구현 모두)',
  haiku: 'Haiku (플랜과 구현 모두)',
}

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

// A paragraph is a label and its lines, each as a bullet, so the owner can read the item at a glance.
function paragraph(label: string, text: string, maxLines = Number.POSITIVE_INFINITY): string[] {
  return [
    `*${label}*`,
    ...text
      .split('\n')
      .slice(0, maxLines)
      .map((line) => `• ${escapeMrkdwn(line)}`),
  ]
}

// How many lines of the request and of the cause an item shows, from all to the least. The plan is never cut: it is
// what a build at once builds, so the owner must have seen all of it.
const SHOWN_LINES: readonly { request: number; cause: number }[] = [
  { request: 4, cause: 4 },
  { request: 3, cause: 4 },
  { request: 2, cause: 4 },
  { request: 1, cause: 4 },
  { request: 1, cause: 3 },
  { request: 1, cause: 2 },
  { request: 1, cause: 1 },
]

function bodyLines(entry: DigestEntry, shown: { request: number; cause: number }): string[] {
  const { analysis } = entry
  if (analysis === undefined) {
    return [
      ...paragraph('요청사항', clip(entry.summary, SUMMARY_SHOWN)),
      '_분석을 못 했어요. 원본을 확인해 주세요._',
      '*구현 추천:* X',
    ]
  }
  return [
    ...paragraph('요청사항', analysis.request, shown.request),
    ...paragraph('원인', analysis.cause, shown.cause),
    ...paragraph('개선 플랜', analysis.plan),
    `*구현 추천:* ${recommendation(analysis)}`,
  ]
}

function headLine(entry: DigestEntry, number: number): string {
  const urgent = entry.urgent ? ' :rotating_light:' : ''
  const source = sourceLink(entry.threadUrl)
  const link = source === '' ? '' : `  ${source}`
  const route = entry.route === '' ? '' : `  _${escapeMrkdwn(clip(entry.route, ROUTE_SHOWN))}_`
  return `*${number}. ${escapeMrkdwn(clip(repoLabel(entry.repo), REPO_SHOWN))}*${urgent}${link}${route}`
}

function checkedWhenRecommended(entry: DigestEntry, option: CheckboxOption): { initial_options?: CheckboxOption[] } {
  if (entry.analysis?.recommend !== true) return {}
  return { initial_options: [option] }
}

function itemBlock(digestId: number, index: number, entry: DigestEntry): Block {
  if (entry.itemKey.length > OPTION_VALUE_LIMIT) throw new RangeError(`item key is longer than ${OPTION_VALUE_LIMIT}`)
  const option: CheckboxOption = { text: { type: 'mrkdwn', text: '플랜 시작' }, value: entry.itemKey }
  const sections = SHOWN_LINES.map((shown) => [headLine(entry, index + 1), ...bodyLines(entry, shown)].join('\n'))
  // The first that fits; the last one is cut only when even the shortest does not fit, which the limits of the lines
  // and of the head make impossible for a plan.
  const text = sections.find((candidate) => candidate.length <= SECTION_TEXT_LIMIT) ?? sections.at(-1) ?? ''
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

const MODELS: readonly AgentModel[] = ['opusplan', 'opus', 'sonnet', 'haiku']

function modelOption(model: AgentModel): ModelOption {
  return { text: { type: 'plain_text', text: MODEL_LABEL[model] }, value: model }
}

const modelSelect = (digestId: number): ModelSelect => ({
  type: 'static_select',
  action_id: `${MODEL_PREFIX}${digestId}`,
  placeholder: { type: 'plain_text', text: '모델 선택' },
  options: MODELS.map(modelOption),
  initial_option: modelOption(DEFAULT_MODEL),
})

const ownPlanInput = (digestId: number): Block => ({
  type: 'input',
  block_id: `digest:${digestId}:ownplan`,
  optional: true,
  label: { type: 'plain_text', text: '내 플랜 (선택)' },
  hint: {
    type: 'plain_text',
    text: '비워두면 에이전트가 알아서 플랜을 만들어요. 적으면 고른 항목 모두에 이 플랜을 따르게 해요.',
  },
  element: {
    type: 'plain_text_input',
    action_id: `${OWN_PLAN_PREFIX}${digestId}`,
    multiline: true,
    max_length: OWN_PLAN_LIMIT,
    placeholder: { type: 'plain_text', text: '예: Header.tsx에 예약 탭 추가, 업로드 팝업은 기존 FileUpload 재사용' },
  },
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
    ownPlanInput(digestId),
    {
      type: 'actions',
      block_id: `digest:${digestId}:decide`,
      elements: [
        modelSelect(digestId),
        button('plan_selected', digestId, '선택한 항목 플랜 시작', 'primary'),
        button('build_selected', digestId, '선택한 항목 바로 구현'),
        button('plan_all', digestId, '전체 플랜 시작'),
        button('reject_rest', digestId, '선택 안 한 항목 기각', 'danger'),
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '구현 추천 항목은 미리 체크해 두었어요. 체크와 모델을 고른 뒤 버튼을 누르세요.\n• 플랜 시작: 플랜 모드로 플랜을 만들고, 확인한 뒤 구현 (내 플랜을 적으면 그걸 따라서)\n• 바로 구현: 내 플랜(없으면 위 개선 플랜)대로 플랜 단계 없이 바로 구현\n고르지 않은 항목은 대기하고, DM에 "대기"라고 보내면 다시 볼 수 있어요.',
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
  | { ok: true; action: DigestAction; digestId: number; selected: string[]; model: AgentModel; ownPlan: string }
  | { ok: false; error: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isDigestAction(value: string): value is DigestAction {
  return value === 'plan_selected' || value === 'build_selected' || value === 'plan_all' || value === 'reject_rest'
}

function optionValue(option: unknown): string[] {
  if (!isRecord(option)) return []
  return typeof option.value === 'string' ? [option.value] : []
}

function selectedOptions(element: unknown): string[] {
  if (!isRecord(element) || element.type !== 'checkboxes' || !Array.isArray(element.selected_options)) return []
  return element.selected_options.flatMap(optionValue)
}

// Every element of the message state whose action id the filter accepts.
function stateElements(payload: Record<string, unknown>, wanted: (actionId: string) => boolean): unknown[] {
  const state = payload.state
  if (!isRecord(state) || !isRecord(state.values)) return []
  return Object.values(state.values).flatMap((block) =>
    isRecord(block) ? Object.entries(block).flatMap(([actionId, element]) => (wanted(actionId) ? [element] : [])) : [],
  )
}

// What the owner ticked, read from the message state of this digest only. The values are untrusted: the worker
// must check each one against the items stored for the digest before applying anything.
function pickedItems(payload: Record<string, unknown>, digestId: number): string[] {
  const prefix = `${PICK_PREFIX}${digestId}:`
  const picked = stateElements(payload, (actionId) => actionId.startsWith(prefix)).flatMap(selectedOptions)
  return [...new Set(picked)]
}

function menuValue(element: unknown): unknown {
  if (!isRecord(element) || !isRecord(element.selected_option)) return undefined
  return element.selected_option.value
}

// The model chosen in the menu; the default when the menu was never touched or holds anything unknown.
function pickedModel(payload: Record<string, unknown>, digestId: number): AgentModel {
  const [element] = stateElements(payload, (actionId) => actionId === `${MODEL_PREFIX}${digestId}`)
  const value = menuValue(element)
  return isAgentModel(value) ? value : DEFAULT_MODEL
}

// What the owner typed in the plan box, trimmed and cut to the limit; empty when the box was left alone.
function pickedOwnPlan(payload: Record<string, unknown>, digestId: number): string {
  const [element] = stateElements(payload, (actionId) => actionId === `${OWN_PLAN_PREFIX}${digestId}`)
  if (!isRecord(element) || typeof element.value !== 'string') return ''
  return element.value.trim().slice(0, OWN_PLAN_LIMIT)
}

export function parseDigestAction(payload: unknown): ParsedAction {
  const first = firstAction(payload)
  if (!first.ok) return first
  const matched = matchAction(first.actionId, ACTION_PATTERN, isDigestAction, 'a digest action')
  if (!matched.ok) return matched
  const digestId = Number(matched.id)
  return {
    ok: true,
    action: matched.action,
    digestId,
    selected: pickedItems(first.payload, digestId),
    model: pickedModel(first.payload, digestId),
    ownPlan: pickedOwnPlan(first.payload, digestId),
  }
}

// A click on a check box or the model menu only changes what is chosen; the buttons are what act on it. Told apart
// here so such a click can be let through without a log row for each change.
export function isSelectionClick(payload: unknown): boolean {
  const first = firstAction(payload)
  return first.ok && (first.actionId.startsWith(PICK_PREFIX) || first.actionId.startsWith(MODEL_PREFIX))
}
