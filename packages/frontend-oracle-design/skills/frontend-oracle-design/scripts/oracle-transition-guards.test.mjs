import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

import { ledgerSpend, reviewHoldBlocker } from './oracle-transition-guards.mjs'

test('review holds as shared blockers to distinguish full and partial review without blocking stops', () => {
  for (const [to, count, expected] of [
    ['REVIEW_VERIFIED', 0, null],
    ['REVIEW_VERIFIED', 1, 'HOLDS_OPEN'],
    ['PARTIAL_VERIFIED', 0, 'NO_OPEN_HOLDS'],
    ['PARTIAL_VERIFIED', 1, null],
    ['FAIL', 1, null],
    ['NEEDS_DECISION', 1, null],
    ['VALID_RED', 1, null],
  ])
    assert.equal(reviewHoldBlocker(to, count), expected)
})

test('shared numeric guard inputs to reject invalid data rather than assert satisfaction', () => {
  for (const value of [undefined, null, -1, 0.5, '0', NaN, Infinity]) {
    assert.throws(() => reviewHoldBlocker('REVIEW_VERIFIED', value), TypeError)
  }
})

test('product spend counts fix rounds, not the review probes after GREEN that are meant to fail', () => {
  const run = (runId, productionSha256, exitCode) => ({ type: 'run', runId, productionSha256, exitCode })
  const transition = (state, evidenceRunId) => ({ type: 'transition', state, evidenceRunId })
  const ledger = [
    run('r-001', 'P0', 1),
    transition('VALID_RED', 'r-001'),
    // one fix round before GREEN
    run('r-002', 'P1', 1),
    run('r-003', 'P2', 0),
    transition('IMPLEMENTED_GREEN', 'r-003'),
    // High mutation: the guard removed, then the reviewed production restored
    run('r-004', 'Pm', 1),
    run('r-005', 'P2', 0),
    // round-2 reproduction on the production round 1 reviewed
    run('r-006', 'P2', 1),
    // a review repair that failed, then one that passed
    run('r-007', 'P3', 1),
    run('r-008', 'P4', 0),
  ]
  assert.equal(ledgerSpend(ledger).spent.product, 2)
  // before GREEN nothing is a probe: a failed attempt reverted is still a fix round
  const beforeGreen = [run('r-001', 'P0', 1), transition('VALID_RED', 'r-001'), run('r-002', 'P0', 0), run('r-003', 'P1', 1), run('r-004', 'P0', 0)]
  assert.equal(ledgerSpend(beforeGreen).spent.product, 1)
})
