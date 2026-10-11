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

/** A source reference records human authority, it does not authenticate it. Never manufacture this document. */
export function extendIterations(value, approval, phase) {
  const budget = iterationBudget(value)
  const round = Math.max(budget.round, budget.limit) + 1
  if (approval?.decision !== 'approve-one-more-round' || approval.phase !== phase || approval.round !== round ||
      typeof approval.source !== 'string' || !approval.source.trim() ||
      typeof approval.reason !== 'string' || !approval.reason.trim()) {
    throw new IterationError('ITERATION_APPROVAL_REQUIRED',
      `requires the user's explicit approval of ${phase} round ${round}: decision, phase, round, source and reason; blanket delegation is not approval`)
  }
  const digest = sha256(stableStringify(approval))
  if (budget.approvals.some((entry) => entry.digest === digest)) {
    throw new IterationError('ITERATION_APPROVAL_REUSED', 'an approval grants exactly one additional round')
  }
  return { ...budget, limit: round, approvals: [...budget.approvals, { ...approval, digest }] }
}
