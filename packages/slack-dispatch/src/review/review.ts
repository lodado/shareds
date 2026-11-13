// A pull request somebody asked the owner to review: which links name one, whether it may be reviewed by the service,
// what the review agent found, and whether the result may be merged. Pure functions only: what GitHub, Slack and the
// agent say comes in as text and is checked here, field by field, before anything acts on it.

import { clip } from '../slack/blocks.ts'

export interface PrRef {
  // https://github.com/<owner>/<repo>/pull/<number>, without anything after the number, in lower case: GitHub ignores
  // the case of the names, so one pull request has one address.
  url: string
  owner: string
  repo: string
  number: number
}

// The owner and repo parts GitHub allows, so the parts are safe to put into a path or a command.
const PR_LINK = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/i

export function parsePrUrl(link: string): PrRef | null {
  const match = PR_LINK.exec(link.trim())
  if (match === null) return null
  const [, owner = '', repo = '', digits = ''] = match.map((part) => part.toLowerCase())
  if (owner.startsWith('.') || repo.startsWith('.')) return null
  const number = Number(digits)
  if (!Number.isSafeInteger(number) || number <= 0) return null
  return { url: `https://github.com/${owner}/${repo}/pull/${number}`, owner, repo, number }
}

// The pull requests the links name, in order, without repeats.
export function prLinksIn(links: readonly string[]): PrRef[] {
  const seen = new Set<string>()
  return links.flatMap((link) => {
    const ref = parsePrUrl(link)
    if (ref === null || seen.has(ref.url)) return []
    seen.add(ref.url)
    return [ref]
  })
}

type PrStateName = 'OPEN' | 'MERGED' | 'CLOSED' | 'UNKNOWN'

const STATE_BY_NAME: Readonly<Record<string, PrStateName>> = { OPEN: 'OPEN', MERGED: 'MERGED', CLOSED: 'CLOSED' }

// A state GitHub did not say, or one this code does not know, is UNKNOWN: it is neither open nor done.
function prStateOf(value: unknown): PrStateName {
  if (typeof value !== 'string' || !Object.hasOwn(STATE_BY_NAME, value)) return 'UNKNOWN'
  return STATE_BY_NAME[value] ?? 'UNKNOWN'
}

export interface PrInfo {
  url: string
  state: PrStateName
  isDraft: boolean
  author: string
  // Logins of the people asked to review; a team asked to review is not a person and is left out.
  reviewRequests: string[]
  isCrossRepository: boolean
  headRefName: string
  headRefOid: string
  baseRefName: string
  title: string
  body: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '')

function loginOf(value: unknown): string {
  return isRecord(value) ? stringOf(value.login) : ''
}

// The fields `gh pr view --json` prints for PR_INFO_FIELDS. A field that is missing or of the wrong type reads as the
// value that lets the least through: unknown state, a draft, from a fork.
export function parsePrInfo(json: string): PrInfo {
  const data: unknown = JSON.parse(json)
  if (!isRecord(data)) throw new Error('gh pr view: the answer is not an object')
  const requests: unknown[] = Array.isArray(data.reviewRequests) ? data.reviewRequests : []
  return {
    url: stringOf(data.url),
    state: prStateOf(data.state),
    isDraft: data.isDraft !== false,
    author: loginOf(data.author),
    reviewRequests: requests.map(loginOf).filter((login) => login !== ''),
    isCrossRepository: data.isCrossRepository !== false,
    headRefName: stringOf(data.headRefName),
    headRefOid: stringOf(data.headRefOid),
    baseRefName: stringOf(data.baseRefName),
    title: stringOf(data.title),
    body: stringOf(data.body),
  }
}

export const PR_INFO_FIELDS =
  'url,state,isDraft,author,reviewRequests,isCrossRepository,headRefName,headRefOid,baseRefName,title,body'

const BRANCH_CHARS = /^[\w./-]{1,200}$/

// A branch name that git reads as a name and nothing else: no option, no range, no way up the folder tree.
function isBranchName(name: string): boolean {
  if (!BRANCH_CHARS.test(name)) return false
  if (name.startsWith('-') || name.startsWith('/') || name.startsWith('.')) return false
  if (name.endsWith('/') || name.endsWith('.')) return false
  return !name.includes('..') && !name.includes('//')
}
const COMMIT = /^[0-9a-f]{40}$/

export type Eligibility = { ok: true } | { ok: false; reason: string }

const sameLogin = (a: string, b: string): boolean => a !== '' && a.toLowerCase() === b.toLowerCase()

// What has to hold before the service touches a pull request, however the review was asked for.
export function eligibility(info: PrInfo, ownerLogin: string): Eligibility {
  if (info.state !== 'OPEN') return { ok: false, reason: `PR이 열려 있지 않아요 (${info.state})` }
  if (info.isDraft) return { ok: false, reason: '초안(draft) PR이에요' }
  if (info.isCrossRepository) return { ok: false, reason: '포크에서 온 PR이라 수정을 올릴 수 없어요' }
  if (sameLogin(info.author, ownerLogin)) return { ok: false, reason: '내가 올린 PR이에요' }
  if (!isBranchName(info.headRefName) || !isBranchName(info.baseRefName)) {
    return { ok: false, reason: '브랜치 이름을 읽을 수 없어요' }
  }
  if (!COMMIT.test(info.headRefOid)) return { ok: false, reason: 'PR의 마지막 커밋을 알 수 없어요' }
  return { ok: true }
}

// The lock a merge holds on an item, by the worker and by the merge button alike.
export const mergeLockOf = (itemKey: string): string => `merge:${itemKey}`

export const isReviewRequested = (info: PrInfo, ownerLogin: string): boolean =>
  info.reviewRequests.some((login) => sameLogin(login, ownerLogin))

export type ReviewIntent = 'review' | 'build' | 'other'

// The classifier's answer. Only an exact "review" counts; anything else, or an answer that cannot be read, is not one.
export function parseReviewIntent(raw: unknown): ReviewIntent {
  if (!isRecord(raw)) return 'other'
  if (raw.kind === 'review') return 'review'
  if (raw.kind === 'build') return 'build'
  return 'other'
}

// What an item keeps about the pull request it reviews. Written by the service only; read back through readReviewMeta.
export interface ReviewMeta {
  prUrl: string
  // owner/repo
  slug: string
  number: number
  head: string
  base: string
  title: string
  // The owner pressed the button or typed the command: the intent check was skipped.
  manual: boolean
  // The commit the service approved and will merge, once the fixes are pushed.
  pushedOid?: string
  // When the fixes were pushed (ms since the epoch): CI is given time to start before it is read.
  pushedAt?: number
  // The ids of findings the fix left as they were, as the agent reported.
  unfixed?: number[]
  // The fixing agent's report, cut.
  report?: string
}

const TITLE_LIMIT = 200
export const REPORT_LIMIT = 2000

// Cut to the limit with its line breaks kept: the report is read as lines.
export const cutKeepingLines = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`

export function reviewMetaOf(ref: PrRef, info: PrInfo, manual: boolean): ReviewMeta {
  return {
    prUrl: ref.url,
    slug: `${ref.owner}/${ref.repo}`,
    number: ref.number,
    head: info.headRefName,
    base: info.baseRefName,
    title: clip(info.title, TITLE_LIMIT),
    manual,
  }
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const isCommit = (value: unknown): value is string => typeof value === 'string' && COMMIT.test(value)

const isMoment = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isIdList = (value: unknown): value is number[] => Array.isArray(value) && value.every(isPositiveInteger)

// A damaged entry is no review at all: the item then runs as an ordinary one would, which can push nothing.
export function readReviewMeta(value: unknown): ReviewMeta | undefined {
  if (!isRecord(value)) return undefined
  const ref = parsePrUrl(stringOf(value.prUrl))
  const { head, base, title, manual, pushedOid, pushedAt, unfixed, report } = value
  if (ref === null || ref.url !== value.prUrl || `${ref.owner}/${ref.repo}` !== value.slug) return undefined
  if (ref.number !== value.number || typeof manual !== 'boolean') return undefined
  if (typeof head !== 'string' || !isBranchName(head) || typeof base !== 'string' || !isBranchName(base)) {
    return undefined
  }
  return {
    prUrl: ref.url,
    slug: `${ref.owner}/${ref.repo}`,
    number: ref.number,
    head,
    base,
    title: clip(stringOf(title), TITLE_LIMIT),
    manual,
    ...(isCommit(pushedOid) ? { pushedOid } : {}),
    ...(isMoment(pushedAt) ? { pushedAt } : {}),
    ...(isIdList(unfixed) ? { unfixed } : {}),
    ...(typeof report === 'string' ? { report: cutKeepingLines(report, REPORT_LIMIT) } : {}),
  }
}

const SEVERITIES = ['blocker', 'major', 'minor', 'nit'] as const
type Severity = (typeof SEVERITIES)[number]

export interface Finding {
  id: number
  severity: Severity
  file: string
  line: number | null
  issue: string
  fix: string
}

export interface Review {
  summary: string
  findings: Finding[]
}

const MAX_FINDINGS = 30
const FIELD_LIMIT = 400
const SUMMARY_LIMIT = 600
const SEVERITY_BY_NAME: Readonly<Record<string, Severity>> = Object.fromEntries(SEVERITIES.map((name) => [name, name]))

// A severity the agent made up counts as major: it has to be fixed before a merge, which is the careful side.
function severityOf(value: unknown): Severity {
  if (typeof value !== 'string' || !Object.hasOwn(SEVERITY_BY_NAME, value)) return 'major'
  return SEVERITY_BY_NAME[value] ?? 'major'
}

const lineOf = (value: unknown): number | null => (isPositiveInteger(value) ? value : null)

function findingOf(raw: unknown, id: number): Finding | null {
  if (!isRecord(raw)) return null
  const issue = clip(stringOf(raw.issue).trim(), FIELD_LIMIT)
  if (issue === '') return null
  return {
    id,
    severity: severityOf(raw.severity),
    file: clip(stringOf(raw.file).trim(), FIELD_LIMIT),
    line: lineOf(raw.line),
    issue,
    fix: clip(stringOf(raw.fix).trim(), FIELD_LIMIT),
  }
}

// The review agent's JSON. Ids are given here, in the order of the list, so the fix can name them.
export function parseReview(raw: unknown): Review {
  if (!isRecord(raw) || !Array.isArray(raw.findings)) throw new Error('the review has no findings list')
  const entries: unknown[] = raw.findings
  const findings = entries
    .slice(0, MAX_FINDINGS)
    .map((entry) => findingOf(entry, 0))
    .filter((finding): finding is Finding => finding !== null)
    .map((finding, index) => ({ ...finding, id: index + 1 }))
  return { summary: clip(stringOf(raw.summary).trim(), SUMMARY_LIMIT), findings }
}

// The review as the store keeps it (the plan column of the workspace). One that cannot be read has no findings, and
// the fix step then refuses to go on.
export function readStoredReview(text: string): Review | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed) || !Array.isArray(parsed.findings)) return undefined
    const review = parseReview(parsed)
    return review.findings.length === parsed.findings.length ? review : undefined
  } catch {
    return undefined
  }
}

const UNFIXED_PREFIX = 'UNFIXED:'
const NOTHING_LEFT: ReadonlySet<string> = new Set(['', 'none', '없음', '-'])

export interface Unfixed {
  // null when the agent did not say: every finding then counts as not fixed.
  ids: number[] | null
  report: string
}

// The line the fixing agent writes before its RESULT line: `UNFIXED: none` or `UNFIXED: 2, 5`.
export function parseUnfixed(report: string): Unfixed {
  const lines = report.split('\n')
  const at = lines.findLastIndex((line) => line.trim().startsWith(UNFIXED_PREFIX))
  if (at === -1) return { ids: null, report: report.trim() }
  const value = (lines[at] ?? '').trim().slice(UNFIXED_PREFIX.length).trim()
  const rest = [...lines.slice(0, at), ...lines.slice(at + 1)].join('\n').trim()
  if (NOTHING_LEFT.has(value.toLowerCase())) return { ids: [], report: rest }
  const parts = value.split(/[\s,]+/).filter((part) => part !== '')
  const ids = parts.map(Number)
  if (!isIdList(ids)) return { ids: null, report: rest }
  return { ids: [...new Set(ids)], report: rest }
}

const MUST_FIX: ReadonlySet<Severity> = new Set(['blocker', 'major'])

// The findings that stop a merge: a blocker or a major one the fix did not deal with.
export function remainingBlockers(review: Review, unfixed: number[] | null): Finding[] {
  return review.findings.filter(
    (finding) => MUST_FIX.has(finding.severity) && (unfixed === null || unfixed.includes(finding.id)),
  )
}

type CiState = 'pass' | 'pending' | 'fail'

export interface ReviewGate {
  state: PrStateName
  ci: CiState
  // What GitHub says about the reviews: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or empty when the base branch
  // asks for no review.
  decision: string
  headOid: string
}

const PASSING_CONCLUSIONS: ReadonlySet<string> = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const PENDING_CONTEXT_STATES: ReadonlySet<string> = new Set(['PENDING', 'EXPECTED'])

function checkState(check: unknown): CiState {
  if (!isRecord(check)) return 'fail'
  if (check.__typename === 'StatusContext') {
    if (check.state === 'SUCCESS') return 'pass'
    return PENDING_CONTEXT_STATES.has(stringOf(check.state)) ? 'pending' : 'fail'
  }
  if (check.status !== 'COMPLETED') return 'pending'
  return PASSING_CONCLUSIONS.has(stringOf(check.conclusion)) ? 'pass' : 'fail'
}

function overallCi(states: readonly CiState[]): CiState {
  if (states.includes('fail')) return 'fail'
  if (states.includes('pending')) return 'pending'
  return 'pass'
}

export const REVIEW_GATE_FIELDS = 'state,statusCheckRollup,reviewDecision,headRefOid'

// A failed check outweighs a running one. A pull request with no checks passes: the service waited before it looked,
// and the repository's own checks ran in the fix step.
export function parseReviewGate(json: string): ReviewGate {
  const data: unknown = JSON.parse(json)
  if (!isRecord(data)) throw new Error('gh pr view: the answer is not an object')
  const checks: unknown[] = Array.isArray(data.statusCheckRollup) ? data.statusCheckRollup : []
  return {
    state: prStateOf(data.state),
    ci: overallCi(checks.map(checkState)),
    decision: stringOf(data.reviewDecision),
    headOid: stringOf(data.headRefOid),
  }
}

export type MergeStep =
  | { kind: 'wait' }
  | { kind: 'merge'; headOid: string }
  | { kind: 'merged_on_host' }
  | { kind: 'closed' }
  | { kind: 'stop'; reason: string }

export interface MergeInput {
  gate: ReviewGate
  // The commit the service approved.
  expectedHead: string
  pushedAt: number
  now: number
  // How long CI is given to show up before the checks are read.
  settleMs: number
  // How long CI may run before the service gives up.
  maxWaitMs: number
}

const ACCEPTED_DECISIONS: ReadonlySet<string> = new Set(['APPROVED', ''])

// What to do with an approved pull request now. Merged only when the head is still the approved commit, every check
// passed and GitHub raises no review objection; anything else waits or stops with the reason.
export function mergeStep(input: MergeInput): MergeStep {
  const { gate } = input
  if (gate.state === 'MERGED') return { kind: 'merged_on_host' }
  if (gate.state === 'CLOSED') return { kind: 'closed' }
  if (gate.state !== 'OPEN') return { kind: 'stop', reason: 'PR 상태를 알 수 없어요' }
  if (gate.headOid !== input.expectedHead) return { kind: 'stop', reason: 'PR에 새 커밋이 올라와서 멈췄어요' }
  const waited = input.now - input.pushedAt
  if (waited < input.settleMs) return { kind: 'wait' }
  if (gate.ci === 'fail') return { kind: 'stop', reason: 'CI가 실패했어요' }
  if (gate.ci === 'pending') {
    return waited > input.maxWaitMs ? { kind: 'stop', reason: 'CI가 끝나지 않아 기다리다 멈췄어요' } : { kind: 'wait' }
  }
  if (gate.decision === 'CHANGES_REQUESTED') return { kind: 'stop', reason: '변경 요청 리뷰가 남아 있어요' }
  if (!ACCEPTED_DECISIONS.has(gate.decision)) {
    return { kind: 'stop', reason: `머지에 필요한 승인이 모자라요 (${gate.decision})` }
  }
  return { kind: 'merge', headOid: gate.headOid }
}

// owner/repo as git prints the origin of a clone: https or ssh, with or without .git.
export function remoteMatches(remoteUrl: string, slug: string): boolean {
  const match = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remoteUrl.trim())
  return match?.[1]?.toLowerCase() === slug.toLowerCase()
}
