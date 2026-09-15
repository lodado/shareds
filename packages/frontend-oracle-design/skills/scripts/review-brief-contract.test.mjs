import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package verification intentionally uses node --test.
import test from 'node:test'

const read = async (path) =>
  (await readFile(new URL(`../references/${path}`, import.meta.url), 'utf8')).replace(/\s+/g, ' ')

test('preapproval brief preserves full-card consent and unresolved questions', async () => {
  const card = await read('card/card-format.md')
  assert.match(card, /## Human review brief — before approval/)
  assert.match(card, /Draft, Source Registry, and semantic delta/)
  assert.match(card, /all blockers and Open questions/)
  assert.match(card, /does not replace full card·delta approval/)
  assert.match(card, /no new gate, state, authority, or schema/)
})

test('semantic review remains advisory and distinct from raw independent review', async () => {
  const review = await read('subagent-review.md')
  assert.match(review, /## Semantic review and calibration/)
  assert.match(review, /approved `S\*` → `P\*` → `O\*`\/`D\*`/)
  assert.match(review, /verified facts, unverified heuristics, and unresolved questions/)
  assert.match(review, /does not replace the raw reviewer packet/)
  assert.match(review, /critical\/high findings/)
  assert.match(review, /shadow mode/)
  assert.match(review, /risk-stratified samples classified as normal/)
  assert.match(review, /agent\/browser pass is not evidence of actual user usability/)
})

test('delivery brief keeps all blockers, evidence provenance, and uncertainty', async () => {
  const delivery = await read('delivery/green-review.md')
  assert.match(delivery, /### Human review brief — after implementation/)
  assert.match(delivery, /review-packet.*only after `IMPLEMENTED_GREEN`/)
  assert.match(delivery, /journey\/outcome delta/)
  assert.match(delivery, /all blockers and decision questions/)
  assert.match(delivery, /Missing, unexecuted, pending, or stale evidence is unverified, never PASS/)
  assert.match(delivery, /regenerate the packet and brief/)
  assert.match(delivery, /no new gate, state, authority, or schema/)
  assert.match(delivery, /oracle-run\.mjs review-brief/)
  assert.match(delivery, /ledger-bound reviewer receipts/)
  assert.match(delivery, /stdout-only Markdown.*`--json`/)
  assert.match(delivery, /Exit 0 means the view was generated, not approval or `REVIEW_VERIFIED`/)
})

test('review metrics require measurement and preserve safety gates', async () => {
  const retro = await read('card/retro-metrics.md')
  for (const metric of ['Human Review Effort', 'Escalation Usefulness', 'Semantic Escapes', 'Normal-sample Misses']) {
    assert.match(retro, new RegExp(`\\| ${metric} \\|`))
  }
  assert.match(retro, /No automatic collection is provided/)
  assert.match(retro, /unmeasured, not zero/)
  assert.match(retro, /No metric moves a gate/)
})
