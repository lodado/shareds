---
name: test
description: Use when writing, executing, or auditing deterministic frontend behavior tests — new or changed behavior, regression reproduction, async flows with loading, errors, retry, duplicate submits or out-of-order responses. Screenshot comparison and direct-browser QA belong to the separate frontend-visual-qa skill.
allowed-tools:
  - Bash
---

# $test — spec-based test creation·execution·verification

This skill turns approved behavior rules into test code and runs it.
**It makes no product policy judgment** — when a policy question comes up, stop and ask it; in a
frontend-oracle-design run it becomes a `Q*` question in the run's `SPEC.md`.

Screenshot comparison and QA where a person enters the browser directly are delegated to
`$frontend-visual-qa`. This skill owns only deterministic unit·component·integration·Playwright
behavior tests, and it does not create a visual baseline or issue `BROWSER_VERIFIED`.

## Exit states (one of four)

| State    | Meaning                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| GREEN    | Every rule's tests pass + the repo's required verification passes                         |
| RED      | A rule violation satisfying the predicates below — report as a product bug, keep the test |
| QUESTION | **Unresolved policy only** — list the open questions with a recommended answer each, stop |
| FAIL     | The rules cannot be judged because of environment·harness·tooling·budget problems         |

Environment·harness problems (server cannot start, tooling missing, chromium not installed, etc.) are not
a QUESTION — finish with a FAIL report that states the cause.

## Step 0: Where the expectations come from

- Low risk (static display, pure synchronous helper) proceeds with the expectation written in the
  request — record the risk and reason in one line.
- Behavior with state·order·count·permission·money risk needs written rules first. If the task has no
  approved rules, start with the `frontend-oracle-design` skill; its `.ai/oracles/<id>/SPEC.md` rules
  (`R*`) are then the expectations.
- Even when the test is called directly, read all of [`references/bva.md`](references/bva.md).
- The rules' expected results and side-effect counts are **immutable**. What this skill can decide is
  only the locator·fixture·waiting method·observation layer.

### Design-to-test handoff

Reuse what the approved spec says about the real target, controllable premises, boundary values and
observation surface to build the harness. The rules stay the sole owners of the expectations. Missing
tool choices, locators, fixtures, and equivalent waiting methods are implementation decisions; changing
an expected result, a side-effect count, or which conditions are excluded is a spec change and goes back
to the spec's owner. A harness limitation is FAIL, not permission to change the expectation. A planned
or illustrative helper is not a verified utility.

## Step 1: Investigate target·conventions

Read the target file and the neighboring tests. **The target repo's AGENTS.md/CLAUDE.md, test
scripts, and neighboring test conventions take precedence**, and when a repo-specific test skill is
actually found, delegate to it. Production code is only investigation material for the public surface·wiring, not the source of expected
results.

Before creating a new test file, look for an existing test that verifies the same rule and user
observation result. **If a usable existing test exists, reuse it.** However, it must be able to assert
the expected result·forbidden result·side-effect count exactly and to keep test independence and the
ownership boundary. Only when it cannot, add a new test to the nearest owner.

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

For async tests, read [`references/async-testing.md`](references/async-testing.md) for conditional harness guidance.

- **Every rule** is the standard. Per rule, assert the expected result + the forbidden result + the
  side-effect count.
- In a frontend-oracle-design run, rules covered by the Bend model are owned by the tests
  `fod.mjs gen <id>` generated from it — do not write a second test for them. Write tests by hand only
  for the rules the spec marks `모델 밖`: vitest for component and integration observations, Playwright
  when the observation needs a real browser (layout, scroll, focus, IntersectionObserver, real timers).
  The spec's `test` command must run them.
- Location: apply the locality rules above first. In FSD, put a slice-crossing scenario in
  `<slice>/__test__/*.scenario.spec.ts` and a segment unit·component test in that
  `<segment>/__test__/*.unit.test.ts(x)`. If not FSD, `*.scenario.test.tsx` next to the component,
  `*.unit.test.ts` next to a pure helper, and page flows follow the repo's Playwright conventions.
- Write test names in the describe `as`, it `to be` pattern:
  `describe('<target> as <situation·role>')`, `it('to be <observable expected result>')`. e.g.)
  `describe('CheckoutButton as a form with a submit in flight')` +
  `it('to be exactly one POST /orders')`. Start the name with the rule id it owns, `[R3] …`.
- Value selection is grounded in the spec's boundary values (bva.md) — arbitrary values are forbidden,
  and comment when the reason is not self-evident.
- Assertions take exact values·counts: `toBe(1)`, `error.code`. `toBeTruthy`·`>0` is forbidden.
- Only what is observable: rendered UI, input values, public callbacks, network requests (count·payload),
  URL, focus, a11y attributes (role·name·aria). Inspecting internal state·hook calls·dispatch is forbidden.
  Copying production conditionals·formulas is forbidden.
- For loading·race, the test controls the completion moment with a deferred **pending barrier**
  (the bva.md pattern). Arbitrary sleep is forbidden.
- **Every assertion has exactly one owning test — re-executing a behavior is fine, re-owning its
  assertion is not.** Duplicating a rule's expected values into a second test is a defect, not extra
  safety: when the policy changes, two owners drift apart. Prefer relation assertions derived from the
  rules (filter then clear returns the original list, loaded count is monotonic, a repeated identical
  query issues no new request) over one-off expected values.
- When the order of events or responses matters and no generated model test covers it, a fast-check
  sequence test is **required**: `fc.commands` against a model, or `fc.scheduler` shuffling promise
  resolution order — combined with the deferred pending barrier. It judges only against the rules and
  never re-owns a single rule's expected values. If fast-check is neither installed nor approved, verify
  the orders with hand-enumerated deferred orderings and record why.
- When an exported shared/package API type is the target of this change, put a `.test-d.ts(x)` witness on
  each bva.md type boundary axis. The axes are set by the relations the rules close, and only one misuse
  goes on the line after `@ts-expect-error`. Keep witnesses non-overlapping and split a surface when it
  becomes hard to review; case count is a complexity signal, not a fixed quota.

Playwright rules (no exceptions):

1. Selectors `role` > `text` > `data-testid` > CSS (last resort, a reason comment is required)
2. `waitForTimeout` is forbidden — wait for an element·network condition or release the barrier
3. Each test can run independently — running it alone with `test.only` also passes
4. Next.js Image: `toBeAttached` only when DOM presence is the contract. When display·load is the contract,
   visible after scroll into view or `naturalWidth > 0`
5. `test.skip` + a reason only for what cannot be judged at any layer — first consider moving layers
   (unit/API)
6. In a repo that uses `playwright-spec-for-ai-agent` (the dependency in `package.json`, a
   `playwright-spec-for-ai-agent.config.*` file, or `@qa-scenario` in neighboring specs), annotate the
   specs the QA agent should judge and explicitly mark the ones it should skip — do not spend QA
   judgment on pure rendering. Read the vocabulary and parsing rules before writing them — they are
   not restated here:
   [docs/reference/annotations.md](https://github.com/lodado/playwright-spec-for-AI-Agent/blob/main/docs/reference/annotations.md),
   worked example [examples/sample-spec.ts](https://github.com/lodado/playwright-spec-for-AI-Agent/blob/main/examples/sample-spec.ts).
   - **Annotate (in scope):** a spec whose behavior touches the network (an API-linked request whose
     count·payload a rule asserts) or a multi-step user scenario (form submit, auth, payment,
     routing/navigation flow). It carries the `@qa-*` annotations: a file-level `// @qa-scenario:`
     plus `// @qa-live-policy:` on each test or an enclosing `test.describe`. Derive the live policy
     from the rules' side effects: observation only → `readonly`, non-destructive interaction →
     `safe-interaction`, mutation·payment·deletion → the matching `blocked-*` policy.
   - **Skip explicitly (out of scope):** a spec that verifies pure rendering only — static display,
     prop→DOM mapping, or snapshot-style checks with **zero network requests, zero state change, and
     no side-effect rule mapped to it**. Mark it with a file-level `// @qa-live-skip: true` (or
     a test-level `// @qa-live-policy: skip`) so the exemption is explicit and auditable; never leave
     it silently unannotated.
   - **Boundary guard:** if a rule carries a side effect (mutation·payment·deletion·request
     count·permission·data integrity), it is never render-only — annotate it in scope even when it
     looks like a plain render. When in doubt whether a spec is pure rendering, annotate it in scope.
     In such a repo, an in-scope spec that is neither annotated nor explicitly `@qa-live-skip` marked
     blocks `GREEN` the same as a skipped rule.

When a rule is skipped, do not issue `GREEN`. Verify it at another layer, ask to drop it from the
spec with a reason, or report `FAIL`.

## Step 3: Run + mechanical correction (2 times total)

**Actually run** the tests you wrote. Claiming a pass without a run is forbidden.

In a frontend-oracle-design run, record the judging runs with `fod.mjs run red <id>` and
`fod.mjs run green <id>`; the script runs the spec's `test` command, keeps the failing test names, and
refuses GREEN when the generated tests or the adapter changed after RED (`GREEN_TESTS_CHANGED`). Cite
those records in the report.

On FAIL, classify the cause. **Only machinery problems can be corrected** — 2 times total, counted from
RED, and 1 time = one bundle of allowed fixes + a rerun of that failure:

- Allowed: a wrong import / supplying a fixture's **missing premise** / a semantically identical locator
  (same role·name kept, resolving to a single element) / connecting the pending barrier / starting the dev server
- Forbidden: weakening an assertion, switching visible→attached, switching to `test.skip`, encoding the
  expected result into a fixture, serializing a race by waiting on the asserted target itself, hiding a
  cardinality error with `first()`/`nth()`

Compare the test diff since RED before claiming GREEN: an assertion count that dropped, an expected-value
literal that changed (`toBe(1)` → `toBe(2)` is a swap, not a fix), or one of the forbidden tokens above
is a weakened test, and the review rejects it.

### RED predicates — issued only when all are satisfied

1. An actual run exits non-zero
2. The failure matches a specific rule's expected-result or forbidden-result violation (e.g. `Expected 1, Received 2`)
3. The target screen·precondition·fixture loaded normally
4. Not an infrastructure cause such as syntax·type·import·server not started·auth·wrong locator·timeout

The case where, at the first RED of a new feature, the public component·route·export the spec requires
does not yet exist is an exception. When the target path matches the spec and you prove that the rest of the
harness — test file·fixture·auth·parent screen — is normal, that non-existence is accepted as RED.
A general missing import/module that is not the spec's target is still an infrastructure failure.

Not finding an element that must exist per the rules is a valid RED only when condition 3 is proven first
(the normal TDD RED of an unimplemented feature). Attach the run command and the raw failure output to the report.
**Do not modify production with a RED that does not meet the predicates** — correct it or report FAIL.

When it still FAILs after both corrections are spent, report it as is with the cause — a fake GREEN is forbidden.

## Step 4: High risk mutation (only when applicable)

After GREEN, when it is payment·deletion·saving·permission, pick 1 core guard.
Do not run a mutation in the RED or `FAIL` state.

1. Record the target file's pre-mutation diff/preimage and the mutation hunk.
2. When the hunk overlaps another change, stop the mutation and report the reason.
3. Remove the guard → confirm that the corresponding rule's test dies.
4. **Restore only the modified hunk** with the saved preimage.
5. Confirm the diff after restoring is the same as the pre-mutation state and rerun GREEN.

A mutation is a local source change, not the execution of a live side effect. Do not run it while connected to a
production/live service. A High risk GREEN needs kill·restore·re-GREEN evidence.

## Step 5: Report

```text
state: GREEN | RED | QUESTION | FAIL
rules: every rule mapped to its owner in the form R1→test name, R2→generated, R3→dropped (reason)
run: command + PASS/FAIL counts (from the actual output), and the fod.mjs run record if there is one
correction: used count/2 + details
mutation: kill + restore evidence if High risk, otherwise N/A
remaining: rules not covered and the reason
```
