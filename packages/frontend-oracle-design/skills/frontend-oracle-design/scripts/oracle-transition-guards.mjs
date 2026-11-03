import { sha256, stableStringify } from './oracle-fs.mjs'

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

const isRun = (entry) => (entry.type ?? 'run') === 'run'
const exitedNonZero = (entry) => Number.isInteger(entry.exitCode) && entry.exitCode !== 0

/** One test binding: the registered harness bytes, every test file's bytes and the evidence mapping VALID_RED freezes. */
export function harnessIdentity(harness, tests, evidence) {
  return sha256(stableStringify({ harness: harness ?? {}, tests: tests ?? {}, evidence: evidence ?? null }))
}

/**
 * The test binding a VALID_RED or GREEN entry rests on: a refresh binds its own harness; a GREEN on a changed harness
 * rests on the run it cites, over the bound tests.
 */
function bindingOf(entry, bound, runs) {
  const harness = entry.state === 'VALID_RED' ? entry.stateDelta?.harnessAtValidRed : runs.get(entry.evidenceRunId)?.harnessSha256
  return harnessIdentity(harness, bound?.tests, bound?.evidenceSha256)
}

/** The free and the counted test bindings of the transitions, and the first VALID_RED (its ledger index and production). */
function testBindings(ledger, transitions, runs) {
  const free = new Set()
  const bindings = new Set()
  let first = null
  let bound = null
  let from = null
  for (const entry of transitions) {
    const refresh = from === 'VALID_RED'
    from = entry.state
    if (entry.state !== 'VALID_RED' && entry.state !== 'IMPLEMENTED_GREEN') continue
    if (entry.state === 'VALID_RED') bound = entry.stateDelta?.testBindings ?? null
    const identity = bindingOf(entry, bound, runs)
    const entered = entry.state === 'VALID_RED' && !refresh
    if (entered) first ??= { at: ledger.indexOf(entry), production: runs.get(entry.evidenceRunId)?.productionSha256 ?? null }
    if (entered && !bindings.has(identity)) free.add(identity)
    if (!entered && first && !free.has(identity)) bindings.add(identity)
  }
  return { free, bindings, first }
}

/** Whether a test binding costs no harness spend: a free one, or one the ledger already counted (a re-bind). */
export function bindingCounted(ledger, identity) {
  const { bindings, free } = ledgerSpend(ledger)
  return free.has(identity) || bindings.has(identity)
}

/**
 * The failing runs after GREEN that are no fix round: the review probes. A run on a production some earlier run passed
 * on failed on its tests (a round-2 reproduction runs on the reviewed production), and a run on production that the
 * next run on other bytes restores to the production before it is a mutation (the guard removed, then put back).
 */
function reviewProbes(ledger) {
  const greenAt = ledger.findIndex((entry) => entry.type === 'transition' && entry.state === 'IMPLEMENTED_GREEN')
  const probes = new Set()
  if (greenAt === -1) return probes
  const runs = ledger.map((entry, at) => ({ entry, at })).filter(({ entry }) => isRun(entry))
  const passed = new Set()
  for (const [index, { entry, at }] of runs.entries()) {
    const production = entry.productionSha256
    if (at > greenAt && exitedNonZero(entry) && !entry.worker) {
      const before = runs.slice(0, index).findLast((run) => run.entry.productionSha256 !== production)
      const next = runs.slice(index + 1).find((run) => run.entry.productionSha256 !== production)
      const restored = Boolean(before && next) && next.entry.productionSha256 === before.entry.productionSha256
      if (passed.has(production) || restored) probes.add(entry)
    }
    if (entry.exitCode === 0) passed.add(production)
  }
  return probes
}

/**
 * Budget spend read off the ledger: no command spends a budget. policy counts the NEEDS_DECISION → ORACLE_READY
 * resumes. harness counts the test bindings that a VALID_RED refresh (VALID_RED → VALID_RED: it cites a failed run on
 * the changed tests) or a GREEN on a changed harness (it rests on a failed RED with that harness) rested on; one binding
 * counts once. A VALID_RED entered from another state (the first one, and one after a resume, which the policy budget
 * bounds) binds for free. product counts the implementation worker dispatches and the production states that runs
 * failed on after the first VALID_RED, one fix round each, leaving out the VALID_RED production, the workers' own and
 * the review probes after GREEN (reviewProbes: a mutation run, a reproduction run), which are meant to fail.
 * Old ledgers' explicit `budget` entries still replay in oracle-run.mjs, and each class keeps the larger count.
 */
export function ledgerSpend(ledger) {
  const runEntries = ledger.filter(isRun)
  const runs = new Map(runEntries.map((entry) => [entry.runId, entry]))
  const transitions = ledger.filter((entry) => entry.type === 'transition')
  const { free, bindings, first } = testBindings(ledger, transitions, runs)
  const workers = runEntries.filter((entry) => entry.worker?.kind === 'implementation')
  const workerProduction = new Set(workers.map((entry) => entry.productionSha256))
  const probes = reviewProbes(ledger)
  const failedAfterRed = ledger.slice(first ? first.at : ledger.length).filter((entry) => isRun(entry) && !entry.worker && exitedNonZero(entry) && !probes.has(entry))
  const rounds = new Set(failedAfterRed.map((entry) => entry.productionSha256))
  for (const production of [first?.production, ...workerProduction]) rounds.delete(production)
  const policy = transitions.filter((entry) => entry.state === 'ORACLE_READY').length
  return { spent: { policy, harness: bindings.size, product: workers.length + rounds.size }, bindings, free }
}
