# Full-product completeness — 0.49.0 maintenance

## Approved change plan

User approved the Gates A–D maintenance plan in this conversation. This changes the skill's
generator and audit harness, not a consumer pagination policy. No cursor API, display retention,
duplicate-request behavior, or consumer test/production edit is approved by this maintenance.

1. Reproduce missing/duplicate dispositions and non-unique execution mapping with the existing
   Node test runner before changing the verifier.
2. Reuse Case space, Frame dispositions, contract rows, evidence.json and ledger/lock gates.
   Add an explicit full-product contract; preserve existing t-way behavior for legacy cards.
3. Require applicability per declared boundary; deterministic raw tuples and revisions; GWT per
   decided tuple; unique reporter cases bound to the current ledger revision in Delivery.
4. Verify negative mutations, then all package tests/lint and generated-reference consistency.
5. Regenerate bundles, bump plugin manifests, commit/push only task-owned files, update the three
   local skill installations without overwriting unrelated runtime state.

## Root causes

- Rule noncompliance: invented policy, cursor narrowing, estimated scenario counts and unsupported
  coverage claims already violate source/approval and case-space reporting rules.
- Rule gap: family dispositions do not enumerate candidate applicability for each action/event/
  async boundary; t-way coverage is not a full-product execution contract.
- Verifier gap: Frame dispositions were inserted into a Set without duplicate detection; named
  frame evidence did not require distinct reporter cases or tuple-specific GWT/revision binding.

## Reproduction and results (2026-09-14)

Before the verifier change, the duplicate-disposition regression failed with
`AssertionError: CARD_LINT_OK 9 rows; 0 !== 1`: the bad card was accepted. The added full-product
tests also failed before the new audit path and execution report existed.

Actual CLI mutation results, using the same generated 2×3×2 fixture:

| Input                                      | Exit            | Raw | Scenarios | Excluded | Unresolved | Missing | Duplicate | Structurally ready |
| ------------------------------------------ | --------------- | --- | --------- | -------- | ---------- | ------- | --------- | ------------------ |
| complete                                   | 0               | 12  | 12        | 0        | 0          | 0       | 0         | true               |
| delete one frame                           | 1               | 12  | 11        | 0        | 0          | 1       | 0         | false              |
| delete one, duplicate another (12 records) | 1               | 12  | 11        | 0        | 0          | 1       | 1         | false              |
| restore                                    | 0               | 12  | 12        | 0        | 0          | 0       | 0         | true               |
| three C1 exclusions, one Q1                | 0 (Draft audit) | 12  | 8         | 3        | 1          | 0       | 0         | false              |

Local outputs: `/tmp/oracle-completeness-{complete,missing,missing-duplicate,restored,mixed}.json`
and corresponding `.md` cards; summary `/tmp/oracle-completeness-mutations.json`.
These are actual local run artifacts, not required permanent paths. Reproduce from the committed
fixture rather than trusting an old report.

The positive reporter integration uses the real generator → card lint/lock/init →
`oracle-run exec --adapter node-test` → ledger → `oracle-verify evidence` path. One parameterized
function produces **12 independently named passed cases**, not 12 functions/files. Its assertions
verify exact fixture tuple/event traces; it does **not** prove a real pagination UI's Then.
The fixture's approval is explicitly synthetic, never consumer authorization.

Independent review found two additional model-level holes: a sequential-only trace could claim
response-order/owner coverage, and a repeat after completion could claim pending repetition.
`sequenceWitness` now rejects both; their mutations remain runnable regressions. Extra `PATH*`
prefixes and null constraints also fail closed.

Fresh validation:

- Targeted generators/verifier/bundle/skill-contract suites: 199 passed, 0 failed.
- Reporter integration and RED mapping-freeze tests: 2 passed, 0 failed.
- Root lint: 6 tasks passed; 3 existing warnings, 0 errors in the Oracle package.
- `node --check` on changed runtime scripts: passed.
- Full runner suite after integration: 101 passed, 0 failed.
- The first package-wide run passed 381/383; only the deliberately stale bundles failed before
  regeneration. The regenerated bundle/contract suites then passed; commit/push hooks also run
  the repository-wide test command rather than bypassing it.
- Final bounded security review found no actionable blockers; assertion semantics remain outside
  its static-review claim.

## Runnable full-product and mixed mapping examples

The complete product, exact canonical IDs, both revisions, GWT and source/row links are in
`packages/frontend-oracle-design/test-fixtures/full-product/oracle.md`.

```sh
S=packages/frontend-oracle-design/skills/scripts
C=packages/frontend-oracle-design/test-fixtures/full-product/oracle.md
node "$S/oracle-frames.mjs" --oracle "$C" --json
node "$S/oracle-verify.mjs" card --case-space --oracle "$C"
node --test --test-name-pattern='full-product:|duplicate dispositions' "$S/oracle-verify.test.mjs"
node --test --test-name-pattern='full-product:|PATH·시퀀스' "$S/oracle-run.test.mjs"
```

`fixture.mjs` exports `fullProductFixture(baseCard?, mutateModel?)`, returning generated frames,
records and `render(records?)`. The regression suite demonstrates all three treatments with the
same helper: `covered(O1)` and a GWT; `impossible: C1 … — constraint(S1)` and an applicable
`{id, when, source, mechanism, falsifier}`; `needs-decision: Q1 …` with no scenario expectation.
The mixed example's C1 predicate is `navigation=previous AND history=fresh`, not “empty data”:
empty data by itself never excludes a tuple with prior history. Q1 remains visible and blocks
ordinary card lint/lock. `12 = 8 + 3 + 1` does not replace the empty missing/duplicate sets.

## Change surface and release

- Source references and SKILL operator routing; generated card bundle, not hand-edited bundles.
- Existing dimensions miner, frames generator, card/evidence verifier, and RED evidence digest.
- Existing Node test suites plus one reusable synthetic fixture and its complete generated card.
- Plugin/package/marketplace version 0.49.0; no new dependency or delivery state.
- Unrelated `.omx/` runtime changes are excluded from the commit.

## Limits

Completeness is relative to the declared boundaries, candidates, dimensions and constraints.
Source relevance and whether Then is actually proved by assertions still require semantic review.
Machine IDs/counts are not proof that the declared model contains every real-world behavior.
