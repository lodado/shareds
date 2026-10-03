// Shared pure blockers for advisory packets and authoritative checks. The runner still obtains
// fresh inputs under its transition lock; a prior advisory result is never an acceptance receipt.
function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a nonnegative safe integer`)
}

export function reviewHoldBlocker(to, holdCount) {
  count(holdCount, 'holdCount')
  if (to === 'REVIEW_VERIFIED' && holdCount > 0) return 'HOLDS_OPEN'
  if (to === 'PARTIAL_VERIFIED' && holdCount === 0) return 'NO_OPEN_HOLDS'
  return null
}

export function redRefreshBlocker({ from, to, spent, baseline }) {
  if (to !== 'VALID_RED' || from !== 'VALID_RED') return null
  count(spent, 'harness spent')
  count(baseline, 'harness baseline')
  return spent <= baseline ? 'HARNESS_BUDGET_REQUIRED' : null
}
