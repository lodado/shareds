import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

import { reviewHoldBlocker } from './oracle-transition-guards.mjs'

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
