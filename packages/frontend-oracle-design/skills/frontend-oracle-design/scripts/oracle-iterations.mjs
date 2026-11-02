import { Buffer } from 'node:buffer'
import { sha256 } from './oracle-fs.mjs'

export class IterationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** One full pass and one confirmation pass. The Delivery ledger persists it. */
export function iterationBudget(value, legacyRound = 1) {
  if (value === undefined) return { round: legacyRound, limit: 2, inputs: {}, approvals: [] }
  if (!value || !Number.isSafeInteger(value.round) || value.round < 1 ||
      !Number.isSafeInteger(value.limit) || value.limit < 2 ||
      !value.inputs || typeof value.inputs !== 'object' || Array.isArray(value.inputs) ||
      !Array.isArray(value.approvals) || Object.values(value.inputs).some((input) =>
        !input || !/^[a-f0-9]{64}$/.test(input.digest) || !Number.isSafeInteger(input.round) ||
        input.round < 1 || input.round > value.round)) {
    throw new IterationError('ITERATION_INVALID', 'invalid persisted iteration budget')
  }
  return value
}

export function assertIterationAvailable(budget) {
  if (budget.round > budget.limit) {
    throw new IterationError('ITERATION_BUDGET_EXHAUSTED',
      `round ${budget.round} exceeds ${budget.limit}; stop at NEEDS_DECISION with remaining findings. No reset, new revision or full review without explicit user approval`)
  }
}

/** Different reviewers share the current repair batch. Re-changing an already reviewed input starts another batch. */
export function observeIteration(value, kind, digest, { force = false } = {}) {
  const budget = iterationBudget(value)
  assertIterationAvailable(budget)
  const prior = budget.inputs[kind]
  if (!force && prior?.digest === digest) return budget
  const round = prior?.round === budget.round ? budget.round + 1 : budget.round
  const next = { ...budget, round, inputs: { ...budget.inputs, [kind]: { digest, round } } }
  assertIterationAvailable(next)
  return next
}

export function iterationStatus(value) {
  const budget = iterationBudget(value)
  return { round: budget.round, limit: budget.limit, mode: budget.round === 1 ? 'full' : 'confirm-fixes',
    exhausted: budget.round > budget.limit }
}

export function assertReviewIterationEvent(event) {
  const budget = iterationBudget(event.iterations)
  const valid = event.type === 'review-extension' ? budget.approvals.length > 0 :
    event.type === 'review-round' && /^[a-f0-9]{64}$/.test(event.targetRevision) &&
    event.snapshot && sha256(JSON.stringify(event.snapshot)) === event.targetRevision &&
    event.scope?.round === budget.round && event.scope?.limit === budget.limit &&
    event.scope?.mode === iterationStatus(budget).mode && Array.isArray(event.scope?.previousFindings)
  if (!valid || typeof event.at !== 'string' || !event.at) {
    throw new IterationError('ITERATION_INVALID', 'invalid review iteration ledger event')
  }
}

/** Delivery review ends at the confirm-fixes round: no review-packet opens a round past it. */
export const REVIEW_ROUND_LIMIT = 2

const SECURITY_CATEGORIES = ['security', 'permission', 'data-loss']

const GIT_ESCAPES = { n: '\n', t: '\t' }

/** A path as git prints it: C-quoted when it holds unusual bytes (`"b/\\303\\251.mjs"`), with its `b/` side prefix. */
function gitPath(raw) {
  const quoted = /^"(.*)"$/.exec(raw.trim())
  const path = quoted
    ? quoted[1].replace(/((?:\\[0-7]{3})+)|\\(.)/g, (_, octal, char) =>
      octal ? Buffer.from(octal.split('\\').slice(1).map((digits) => Number.parseInt(digits, 8))).toString('utf8') : (GIT_ESCAPES[char] ?? char))
    : raw.trim()
  return path === '/dev/null' ? null : path.replace(/^b\//, '')
}

// how each line of a unified diff moves the parse: `next` is the new-side number of the next context or added line
const DIFF_STEP = {
  file: ({ line }) => ({ path: gitPath(line.slice(4)), next: 0 }),
  '@': ({ path, line, mark }) => {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!hunk) return { path, next: 0 }
    const from = Number(hunk[1])
    if (hunk[2] !== '0') return { path, next: from }
    if (path) mark(path, Math.max(from, 1), from + 1)
    return { path, next: from + 1 }
  },
  '+': ({ path, next, mark }) => {
    if (path && next > 0) mark(path, next, next)
    return { path, next: next > 0 ? next + 1 : 0 }
  },
  ' ': ({ path, next }) => ({ path, next: next > 0 ? next + 1 : 0 }),
}

function lineKind(previous, line) {
  if (previous.startsWith('--- ') && line.startsWith('+++ ')) return 'file'
  return line.slice(0, 1)
}

/**
 * The new-side lines a unified diff adds, per path: each `+` line inside a hunk (context lines do not count), and for a
 * hunk that only deletes, the lines on both sides of the gap. A file header is the `+++` line right after a `---` line.
 */
export function repairHunks(diff) {
  const hunks = new Map()
  const mark = (path, from, to) => hunks.set(path, [...(hunks.get(path) ?? []), [from, to]])
  let cursor = { path: null, next: 0 }
  let previous = ''
  for (const line of String(diff ?? '').split('\n')) {
    const kind = lineKind(previous, line)
    previous = line
    cursor = DIFF_STEP[kind]?.({ ...cursor, line, mark }) ?? cursor
  }
  return hunks
}

// git prints paths from its own root, a reviewer from the scan root: one may carry a folder prefix of the other. A bare
// file name matches only itself, so `index.mjs` never stands for every changed `*/index.mjs`.
export const samePath = (left, right) => {
  const [a, b] = [left, right].map((path) => String(path).split('\\').join('/').replace(/^\.\//, ''))
  if (a === b) return true
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  return shorter.includes('/') && longer.endsWith(`/${shorter}`)
}

/**
 * What a confirm-fixes finding may block as, from its `confirm` claim and evidence the packet already holds:
 * `previous` cites a round-1 claim id, `regression` a path and line inside a repair hunk, `security` a category
 * with critical/high severity and evidence. A claim it cannot back, or no claim, is a `proposal`.
 */
export function confirmClass(finding, scope) {
  const claim = finding?.confirm
  if (claim?.class === 'security') {
    if (SECURITY_CATEGORIES.includes(claim.category) && ['critical', 'high'].includes(finding.severity) && String(finding.evidence ?? '').trim())
      return { class: 'security' }
    return { class: 'proposal', demoted: `security needs category ${SECURITY_CATEGORIES.join('|')} and severity critical|high` }
  }
  if (claim?.class === 'previous') {
    const raised = (scope.previousFindings ?? [])
      .filter((previous) => claim.reviewerId === undefined || previous.reviewerId === claim.reviewerId)
      .flatMap((previous) => (previous.findings ?? []).filter((entry) => entry?.classification !== 'NON_ORACLE_OPINION').map((entry) => entry.id))
    if (typeof claim.finding === 'string' && raised.includes(claim.finding)) return { class: 'previous' }
    return { class: 'proposal', demoted: `${claim.finding ?? '?'} is not a round-1 claim` }
  }
  if (claim?.class === 'regression') return regressionClass(claim, scope)
  if (claim?.class === undefined) return { class: 'proposal' }
  return { class: 'proposal', demoted: `unknown confirm class ${claim.class}` }
}

/**
 * A regression is backed by a line the repair added in the cited file. A repaired file the diff has no lines for (an
 * untracked baseline, no git, a binary file) backs any line of it: the runner cannot tell, so the claim keeps blocking.
 */
function regressionClass(claim, scope) {
  const hunks = [...repairHunks(scope.repairDiff)].filter(([path]) => samePath(path, claim.path))
  const ranges = hunks.flatMap(([, spans]) => spans)
  if (Number.isSafeInteger(claim.line) && ranges.some(([from, to]) => claim.line >= from && claim.line <= to)) return { class: 'regression' }
  const unlined = hunks.length === 0 && (scope.repairPaths ?? []).some((path) => samePath(path, claim.path))
  if (Number.isSafeInteger(claim.line) && unlined) return { class: 'regression' }
  return { class: 'proposal', demoted: `${claim.path ?? '?'}:${claim.line ?? '?'} is not a line the repair added` }
}

/** In a confirm-fixes round only a backed class keeps blocking; every other blocking finding becomes an improvement proposal. */
export function splitConfirmFindings(blocking, scope) {
  if (scope?.mode !== 'confirm-fixes') return { blocking, proposals: null }
  const kept = []
  const proposals = []
  for (const finding of blocking) {
    const verdict = confirmClass(finding, scope)
    if (verdict.class === 'proposal') proposals.push({ ...finding, confirmClass: 'proposal', ...(verdict.demoted ? { demoted: verdict.demoted } : {}) })
    else kept.push({ ...finding, confirmClass: verdict.class })
  }
  return { blocking: kept, proposals }
}

/** The route of each finding class (delivery/green-review.md); a blocking review is answered class by class. */
const FINDING_ROUTES = {
  PRODUCT_DEFECT: 'fix production for the same row, rerun the GREEN labels and close again',
  EVIDENCE_GAP: 'add only the missing tests·evidence within the locked card (a test change after VALID_RED spends harness), rerun and close again',
  HARNESS_DEFECT: 'repair the harness within the shared harness budget, record a fresh RED→GREEN and close again',
  ENVIRONMENT_DEFECT: 'record FAIL with the cause; never touch production',
  POLICY_GAP: 'the card does not decide it: transition to NEEDS_DECISION with the card and the question for the user',
}
/** The remedy a FINDINGS_BLOCKING refusal prints when it does not know the findings. */
export const FINDINGS_BLOCKING_NEXT = `answer each blocking finding by its class — ${Object.entries(FINDING_ROUTES)
  .map(([kind, route]) => `${kind}: ${route}`)
  .join('; ')}`

/** The remedy for these blocking findings: one route per class present, naming its findings, in the routes' order. */
export function blockingRemedy(blocking) {
  const routes = Object.entries(FINDING_ROUTES).flatMap(([kind, route]) => {
    const ids = blocking.filter((finding) => finding.classification === kind).map((finding) => finding.id)
    return ids.length > 0 ? [`${ids.join(', ')} ${kind}: ${route}`] : []
  })
  return routes.length > 0 ? routes.join('; ') : FINDINGS_BLOCKING_NEXT
}
