import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

import { redRefreshBlocker, reviewHoldBlocker } from './oracle-transition-guards.mjs'

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

test('RED refresh as a shared budget check to require a strictly newer spend only on reentry', () => {
  for (const [from, to, spent, baseline, expected] of [
    ['VALID_RED', 'VALID_RED', 0, 0, 'HARNESS_BUDGET_REQUIRED'],
    ['VALID_RED', 'VALID_RED', 1, 1, 'HARNESS_BUDGET_REQUIRED'],
    ['VALID_RED', 'VALID_RED', 0, 1, 'HARNESS_BUDGET_REQUIRED'],
    ['VALID_RED', 'VALID_RED', 2, 1, null],
    ['ORACLE_READY', 'VALID_RED', 0, 0, null],
    ['VALID_RED', 'IMPLEMENTED_GREEN', 0, 0, null],
    ['VALID_RED', 'NEEDS_DECISION', 0, 0, null],
  ])
    assert.equal(redRefreshBlocker({ from, to, spent, baseline }), expected)
})

test('shared numeric guard inputs to reject invalid data rather than assert satisfaction', () => {
  for (const value of [undefined, null, -1, 0.5, '0', NaN, Infinity]) {
    assert.throws(() => reviewHoldBlocker('REVIEW_VERIFIED', value), TypeError)
    assert.throws(() => redRefreshBlocker({ from: 'VALID_RED', to: 'VALID_RED', spent: value, baseline: 0 }), TypeError)
    assert.throws(() => redRefreshBlocker({ from: 'VALID_RED', to: 'VALID_RED', spent: 0, baseline: value }), TypeError)
  }
})
