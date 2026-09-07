# Changeability matched-pair pilot — 2026-09-07

## Result: tie, not a demonstrated improvement

Two isolated executor agents applied the same synthetic maintenance tasks under the baseline and revised criteria. A separate reviewer received source snapshots, diffs, tests, and the predeclared rubric **without** condition assignments, criteria, or executor decisions. The reviewer returned **PASS (tie)** before assignments were disclosed in this report.

| Observation                                 | run-a: baseline                                       | run-b: revised                                        |
| ------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| SDK v1 → v2 and collapsed-label change      | 5/5 contract tests pass                               | 5/5 contract tests pass                               |
| SDK v2 → v3 amount representation follow-up | 5/5 contract tests pass                               | 5/5 contract tests pass                               |
| New source modules / wrappers               | None                                                  | None                                                  |
| Follow-up source scope                      | One amount-conversion expression in `status-view.mjs` | One amount-conversion expression in `status-view.mjs` |
| Independent toggle changed during follow-up | No                                                    | No                                                    |
| Blind assessment                            | Proportionate direct edit; preserved contracts        | Proportionate direct edit; preserved contracts        |

The revised criteria did not provoke unnecessary abstraction in these cases, but **this pilot does not demonstrate lower change cost or superiority over the baseline**. Both variants chose a direct local update rather than introducing a mapper/adapter. This therefore does not exercise a case where a newly permitted adapter is actually necessary. The two-stage sequence is one observation per condition, not independent repeated samples.

## Protocol and evidence

- `seed/`: identical initial source, validated against SDK v1 and original copy (5/5). The seed fails the requested v2/copy contracts, so the task is not vacuous.
- `task.md`: identical stage-1 task except each executor's isolated directory path. SDK instability is a declared **synthetic** fixture history, not evidence from a production project.
- `stage-2.md`: same follow-up delivered only after both stage-1 outputs were frozen. Only the settled amount payload changes; no policy or legacy support is requested.
- `rubric.md`: fixed before either executor ran. Behavior, proportionate boundaries, no speculative abstractions, and actual follow-up locality; no universal numeric score.
- `results/manifest.json`: baseline revision, exact criteria/test hashes, role settings and controller exit codes. Baseline is `484d71255e9ad7f6107e57937f83465e23e781aa`; revised criteria are the source files shipped with this change. Both agents used the same installed `executor` role, no model/effort overrides, no dependencies, and no delegation.
- `results/run-*/stage-*/`: unmodified source snapshots, executor decisions, raw executor and controller test output, and unified diffs between frozen source snapshots (portable path labels).
- Log preservation: whitespace-only blank lines in captured output were emptied to satisfy Git whitespace checks; all other stdout/stderr is retained. Test results were not rewritten.
- `results/verify-stage1.test.mjs`: exact controller test used during stage 1. `verify.test.mjs` adds v3 for stage 2/replay. Executors could read but not change tests; controller byte checks verified task, tests and criteria remained unchanged.
- `results/stage2-red.json` and per-run `stage2-red.log`: each archived v2 implementation fails the new v3 contract before modification.
- `results/blind-review.md`: independent assessment issued before unblinding. The reviewer inspected all four snapshots and controller logs and freshly reran both stage-2 contracts. The controller independently reran all four snapshots.

The controller independently reran all four final snapshot tests: **20 passing test executions** across two stages and two conditions. These are five repeated contract checks per run, not 20 independent experiments. Tests cover loading/amount display, audit/subscription counts, approved error distinctions, unexpected-error identity, idempotent cleanup, late events, and immutable toggle behavior.

## Replay the verified artifacts

From the repository root, with the supported Node version installed:

```sh
node --test packages/frontend-oracle-design/skills/scripts/changeability-pilot.test.mjs
```

This is also included in the plugin's normal `test` script. It verifies the v1 seed, its expected v2 failure, each successful v2/v3 snapshot, the expected v3 failure before the follow-up, and the unchanged toggle. Nested child tests remove `NODE_TEST_CONTEXT` so Node cannot silently skip them as recursive runs.

To repeat the **live-agent** experiment rather than replay artifacts: create two fresh directories from `seed/`, provide the baseline/revised reference trees verified against the manifest, copy `task.md` and the stage-1 test (as `verify.test.mjs`), and use the same executor-role settings and directory-only ownership instructions. Preserve raw outputs, then deliver `stage-2.md` and the v3 test only after both first stages are archived. Give a separate reviewer only the frozen code/tests/rubric; disclose the assignment after its report. New outcomes may differ. Never overwrite these historical snapshots with a new run.

## Limits

- One matched pair on a small JavaScript UI model, not a representative React/Next application or a statistical benchmark.
- Native agent model identity/token usage were not independently attested; role and override configuration were matched. Shared executor instructions may reduce differences attributable to the reference text.
- Isolation and blinding were procedural read-scope instructions, not OS-enforced security boundaries. No claims of cryptographically blinded execution.
- No elapsed-time, token-cost, bug-rate, or general change-cost improvement is inferred from line/file counts or test durations.
- Malformed SDK payloads and unknown rejection codes are outside the declared fixture contract and remain unverified, as the reviewer notes. No browser, render lifecycle, real network, or React E2E claims.
- No scalar quality threshold or additional gate was added to product Oracle delivery. These replay tests preserve this pilot's behavior evidence, not semantic proof that an architecture is universally best.
