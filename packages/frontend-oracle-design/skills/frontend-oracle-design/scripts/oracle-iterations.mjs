import process from 'node:process'
import { sha256, stableStringify } from './oracle-fs.mjs'

export class IterationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** One full pass and one confirmation pass. Callers persist this in their existing stage or ledger. */
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

/** Highest authoring limit a standing delegation ("don't ask, handle it") can grant; past it the user is asked. */
export const DELEGATED_ROUND_CAP = 5

/**
 * No approval in any phase opens a round past this, one past the delegation cap; there is no override. A limit stored
 * above it before the ceiling existed stays usable; only further extensions are refused.
 */
export const ROUND_CEILING = 6

/** The ceiling in force: tests may lower it (ORACLE_ROUND_CEILING, from the delegation cap up), never raise it. */
export function roundCeiling() {
  const lowered = Number(process.env.ORACLE_ROUND_CEILING)
  if (!Number.isSafeInteger(lowered) || lowered < DELEGATED_ROUND_CAP || lowered >= ROUND_CEILING) return ROUND_CEILING
  return lowered
}

/** A source reference records human authority, it does not authenticate it. Never manufacture this document. */
export function extendIterations(value, approval, phase) {
  const budget = iterationBudget(value)
  if (approval?.decision === 'delegated-rounds') return delegateRounds(budget, approval, phase)
  const round = Math.max(budget.round, budget.limit) + 1
  if (round > roundCeiling()) {
    throw new IterationError('ITERATION_CEILING_REACHED',
      `round ${round} is past the ceiling of ${roundCeiling()} review rounds: the contract itself is wrong. Stop at NEEDS_DECISION; the user rewrites the sources and a new run id starts at round 1`)
  }
  if (approval?.decision !== 'approve-one-more-round' || approval.phase !== phase || approval.round !== round ||
      typeof approval.source !== 'string' || !approval.source.trim() ||
      typeof approval.reason !== 'string' || !approval.reason.trim()) {
    const delegation = phase === 'authoring' ? `, or a recorded standing delegation (decision delegated-rounds, upTo at most ${DELEGATED_ROUND_CAP})` : ''
    throw new IterationError('ITERATION_APPROVAL_REQUIRED',
      `requires the user's explicit approval of ${phase} round ${round}: decision, phase, round, source and reason${delegation}`)
  }
  const digest = sha256(stableStringify(approval))
  if (budget.approvals.some((entry) => entry.digest === digest)) {
    throw new IterationError('ITERATION_APPROVAL_REUSED', 'an approval grants exactly one additional round')
  }
  return { ...budget, limit: round, approvals: [...budget.approvals, { ...approval, digest }] }
}

/** The user's own standing delegation raises the authoring limit once, up to the cap; it never covers a policy change. */
function delegateRounds(budget, approval, phase) {
  if (budget.approvals.some((entry) => entry.decision === 'delegated-rounds')) {
    throw new IterationError('ITERATION_APPROVAL_REUSED', 'a standing delegation is recorded once per revision; past it, ask the user for one more round')
  }
  if (phase !== 'authoring' || approval.phase !== 'authoring' || !Number.isSafeInteger(approval.upTo) ||
      approval.upTo <= budget.limit || approval.upTo > DELEGATED_ROUND_CAP ||
      typeof approval.source !== 'string' || !approval.source.trim() ||
      typeof approval.reason !== 'string' || !approval.reason.trim()) {
    throw new IterationError('ITERATION_APPROVAL_REQUIRED',
      `a standing delegation raises authoring rounds above the current limit ${budget.limit} and at most to ${DELEGATED_ROUND_CAP}: decision delegated-rounds, phase authoring, upTo, source (the user's words) and reason`)
  }
  const digest = sha256(stableStringify(approval))
  return { ...budget, limit: approval.upTo, approvals: [...budget.approvals, { ...approval, digest }] }
}
