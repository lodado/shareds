---
name: test
description: Use when writing, executing, or auditing deterministic frontend behavior tests — new or changed behavior, regression reproduction, async flows with loading, errors, retry, duplicate submits or out-of-order responses. Screenshot comparison and direct-browser QA belong to the separate frontend-visual-qa skill.
---

# $test — Oracle-based test creation·execution·verification

This skill translates an approved Oracle Card into test code and runs it.
**It makes no product policy judgment** — when a policy issue comes up, return to
frontend-oracle-design with NEEDS_DECISION.

Screenshot comparison and QA where a person enters the browser directly are delegated to
`$frontend-visual-qa`. This skill owns only deterministic unit·component·integration·Playwright
behavior tests, and it does not create a visual baseline or issue `BROWSER_VERIFIED`.

## Exit states (one of four)

| State          | Meaning                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| GREEN          | All of the card's tests pass + the repo's required verification passes                                  |
| VALID_RED      | A contract violation satisfying the predicates below — report as a product bug, keep the test           |
| NEEDS_DECISION | **Unresolved policy only** — print the full card + open questions + spent budget, then return to oracle |
| FAIL           | The contract cannot be judged because of environment·harness·tooling·budget problems                    |

Environment·harness problems (server cannot start, tooling missing, chromium not installed, etc.) are not
NEEDS_DECISION — finish with a FAIL report that states the cause.

## Step 0: Oracle gate

- Only Low risk (static display, pure synchronous helper) proceeds without a card — record the risk and reason in one line.
- Everything else needs an ORACLE_READY card first. If there is none, start with the `frontend-oracle-design` skill.
- Even when the test is called directly, read all of [`references/bva.md`](references/bva.md).
- When implementation·self-improvement·independent subagent review are also requested, the Delivery
  mode of `frontend-oracle-design` is the orchestrator. This skill keeps the authority to judge tests.
- The card's policy·Then·Never·side-effect count is **immutable**. What this skill can decide is only
  the locator·fixture·waiting method·observation layer.

## Step 1: Investigate target·conventions

Read the target file and the neighboring tests. **The target repo's AGENTS.md/CLAUDE.md, test
scripts, and neighboring test conventions take precedence**, and when a repo-specific test skill is
actually found, delegate to it. Production code is only investigation material for the public surface·wiring, not the source of expected
results.

Before creating a new test file, look for an existing test that verifies the same Oracle row and user
observation result. **If a usable existing test exists, reuse it.** However, it must be able to assert
Then·Never·side-effect count exactly and to keep test independence and the ownership boundary. Only when
it cannot, add a new test to the nearest owner.

In an FSD repo, test locality is also treated as an architecture contract. Unless the repo explicitly
forces a different location, do not create tests in a central `tests/`·`e2e/` outside the slice.

- scenario·Playwright tests that cut across several `model`·`api`·`hooks`·`ui` and routes:
  `<slice>/__test__/`
- unit·component tests confined to one segment or one production module:
  that `model|api|hooks|ui/__test__/`
- shared layer tests: the nearest `__test__/` of that shared unit

Choose the narrowest common architecture unit that the test verifies. Do not move the test alone so that
ownership splits from production, and make the test follow along when a slice is deleted·moved.

## Step 2: Write the tests

- **Every row** of the card matrix is the standard. Per row, assert Then + Never + the side-effect count.
- Location: apply the locality rules above first. In FSD, put a slice-crossing scenario in
  `<slice>/__test__/*.scenario.spec.ts` and a segment unit·component test in that
  `<segment>/__test__/*.unit.test.ts(x)`. If not FSD, `*.scenario.test.tsx` next to the component,
  `*.unit.test.ts` next to a pure helper, and page flows follow the repo's Playwright conventions.
- Write test names in the describe `as`, it `to be` pattern:
  `describe('<target> as <situation·role>')`, `it('to be <observable expected result>')`. e.g.)
  `describe('CheckoutButton as a form with a submit in flight')` +
  `it('to be exactly one POST /orders')`.
- Value selection is grounded in the card's BVA column — arbitrary values are forbidden, and comment when the reason is not self-evident.
- Assertions take exact values·counts: `toBe(1)`, `error.code`. `toBeTruthy`·`>0` is forbidden.
- Only what is observable: rendered UI, input values, public callbacks, network requests (count·payload),
  URL, focus, a11y attributes (role·name·aria). Inspecting internal state·hook calls·dispatch is forbidden.
  Copying production conditionals·formulas is forbidden.
- For loading·race, the test controls the completion moment with a deferred **pending barrier**
  (the bva.md pattern). Arbitrary sleep is forbidden.
- When an exported shared/package API type is the target of this change, put a `.test-d.ts(x)` witness on
  each bva.md type boundary axis. The axes are set by the relations the card closes, and only one misuse
  goes on the line after `@ts-expect-error`. When it exceeds 30, do not add more cases; raise the API split
  as NEEDS_DECISION — splitting the surface is a policy judgment.

Playwright rules (no exceptions):

1. Selectors `role` > `text` > `data-testid` > CSS (last resort, a reason comment is required)
2. `waitForTimeout` is forbidden — wait for an element·network condition or release the barrier
3. Each test can run independently — running it alone with `test.only` also passes
4. Next.js Image: `toBeAttached` only when DOM presence is the contract. When display·load is the contract,
   visible after scroll into view or `naturalWidth > 0`
5. `test.skip` + a reason only for what cannot be judged at any layer — first consider moving layers
   (unit/API)

When a non-N/A Oracle row is skipped, do not issue `GREEN`.
Verify it at another layer, return to Oracle with a sourced N/A, or report `FAIL`.

## Step 3: Run + mechanical correction (2 times total)

**Actually run** the tests you wrote. Claiming a pass without a run is forbidden.

When running inside the Delivery orchestration of `frontend-oracle-design`, run the judging command
with `scripts/oracle-run.mjs exec`. The run is recorded in the append-only ledger with a runId, and
the run evidence in the report cites that runId. When you also pass the reporter output path (`--report`),
test names and statuses are recorded too, so card row evidence can be cross-checked by machine. Each time
you use one correction, count it with `oracle-run.mjs budget --spend harness --reason ...`.

On FAIL, classify the cause. **Only machinery problems can be corrected** — 2 times total, and
1 time = one bundle of allowed fixes + a rerun of that failure:

- Allowed: a wrong import / supplying a fixture's **missing premise** / a semantically identical locator
  (same role·name kept, resolving to a single element) / connecting the pending barrier / starting the dev server
- Forbidden: weakening an assertion, switching visible→attached, switching to `test.skip`, encoding the
  expected result into a fixture, serializing a race by waiting on the asserted target itself, hiding a
  cardinality error with `first()`/`nth()`

The forbidden items are checked by machine at the GREEN transition. When the assertion count drops
compared with the `VALID_RED` moment or the tokens above newly appear, it is rejected as `TEST_WEAKENED`,
so corrections stay inside the allowed items.

### VALID_RED predicates — issued only when all are satisfied

1. An actual run exits non-zero
2. The failure matches a specific card row's Then/Never violation (e.g. `Expected 1, Received 2`)
3. The target screen·precondition·fixture loaded normally
4. Not an infrastructure cause such as syntax·type·import·server not started·auth·wrong locator·timeout

The case where, at the first RED of a new feature, the public component·route·export the Oracle required
does not yet exist is an exception. When the target path matches the card and you prove that the rest of the
harness — test file·fixture·auth·parent screen — is normal, that non-existence is accepted as `VALID_RED`.
A general missing import/module that is not the card's target is still an infrastructure failure.

Not finding an element that must exist per the contract is a valid RED only when condition 3 is proven first
(the normal TDD RED of an unimplemented feature). Attach the run command and the raw failure output to the report.
**Do not modify production with a RED that does not meet the predicates** — correct it or report FAIL.

When it still FAILs after both corrections are spent, report it as is with the cause — a fake GREEN is forbidden.

## Step 4: High risk mutation (only when applicable)

After GREEN, when it is payment·deletion·saving·permission, pick 1 core guard.
Do not run a mutation in the `VALID_RED` or `FAIL` state.

1. Record the target file's pre-mutation diff/preimage and the mutation hunk.
2. When the hunk overlaps another change, stop the mutation and report the reason.
3. Remove the guard → confirm that the corresponding card row's test dies.
4. **Restore only the modified hunk** with the saved preimage.
5. Confirm the diff after restoring is the same as the pre-mutation state and rerun GREEN.

A mutation is a local source change, not the execution of a live side effect. Do not run it while connected to a
production/live service. A High risk GREEN needs kill·restore·re-GREEN evidence.

## Step 5: Report

```text
state: GREEN | VALID_RED | NEEDS_DECISION | FAIL
card: all-row evidence mapping in the form O1→test name, O2→N/A reason
run: command + PASS/FAIL counts (from the actual output), runId and grade if a ledger was written
correction: used count/2 + details
mutation: kill + restore evidence if High risk, otherwise N/A
remaining: rows not covered and the reason
```
