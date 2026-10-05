# Contract profile requirements

`contract/v1` is selected only by `frontend-contract-design` before authoring. It is not a fallback,
skip flag or reinterpretation of legacy records. The authoritative contract is `oracle.md`, including
`## Verification Profile` with `- Profile: contract/v1`. No new DSL or companion policy package.
Shared source priority, human approval, immutable locks, RED/GREEN, budgets and independent review apply.

At intake read [policy sources](policy-sources.md), [risk grill](risk-grill.md) and [Space](space.md), mine touched
files and show the Pre-plan test-space briefing before any plan or Draft; investigate supported reporters.
At authoring read [Space](space.md) and [authoring](authoring.md). At review read [review](review.md) only in the dispatched context.
Do not load another profile's entry, procedures or verification modules. Unrelated project files are
not grounds for failure. Missing Contract runners/reporters are actual environment failures, not waivers.

Approval precedes CHECKED and its whole-card hash. Preapproval strict checks leave DISCOVERING unchanged.
After actual human confirmation: strict Space check → CHECKED → full unchanged-card lint → DRAFTED →
immutable lock tool → ORACLE_READY. Only the lock tool writes ORACLE_READY. Never create MODELED or a
fake package. Modified CHECKED bytes rewind for rechecking, changed meaning also requires reapproval.

Delivery requires `contract-cases:reported` with actual reported case IDs covering every required
executable frame/scenario, not labels or test counts. Under default t-way coverage these are the
`evidence.json` `frames`/`paths`/`sequence` test names: every `covered()` `F*` frame and every `PATH*` names
one passed test in the same trusted `node-test` or `vitest` reported run, gated by the existing
`EVIDENCE_MISSING_FRAME`/`EVIDENCE_UNKNOWN_FRAME`/`EVIDENCE_MISSING_PATH`/`EVIDENCE_NOT_IN_RUN` checks. Applicable exposed type boundaries require
`type-contract:reported` with actual TypeScript/type-fest consumer witnesses and diagnostics.
Before omitting `type-contract:reported`, require a recorded applicability determination with exact investigated file paths,
a grounded no-boundary rationale and its approved source. Current-stage intake/authoring owns this investigation;
Delivery review checks the actual determination. Unknown applicability requires further investigation;
unavailable required tools are an actual environment failure, not N/A.
Under t-way, an active Async/Order family requires the `evidence.json` `sequence` test (fast-check
or hand-enumerated deferred orderings, `SEQUENCE_EVIDENCE_MISSING` otherwise). For explicit full-product:
When Async/Order is active, require `fast-check:reported` against approved contract invariants,
independent of an exposed type boundary and without Bend comparison. Record a positive actual execution count,
seed, domain, sampling scope, current snapshot and shrink information on failure.
Missing required producer capability is FAIL. No observation-only evidence becomes PASS.
Report `formalVerification: not-performed` honestly, finite contract coverage and type/property limits
separately. Exhaustive declared Space is not proof of all product behavior or source completeness.

For explicit full-product `contract-cases:reported`, each actual reporter case name retains `[<frame ID>]` and contains
exactly one `oracle-case:<base64url JSON>` token. Its decoded object has `id`, `scenario`, `tuple`,
`dimensionRevision` and `constraintRevision`, matching the current locked full-product frame ID,
scenario ID, tuple and revisions. Existing frame-map and row/sequence names must match the actual
unique reporter name. Reject missing, unknown, duplicate or stale observed identities. Metadata
assertions or ordinary test totals cannot replace observed executable case coverage and passed terminals.
Case assertions and producer witnesses/invariants must target the same approved sources as the card.

The reported Node path has exactly two fixed diagnostic request producers, not a generalized backend
registry. Vitest reports actual cases but has no claimed Contract compiler/property producer capability.
Require real registered frozen positive/negative TypeScript harness paths and property-module paths,
relative to the emitting test file's directory and realpath-contained there, registered relative to
the source root and bound to the same current Oracle, manifest, worktree, production, harness and
source-root snapshot as the case run. Meaningful type-fest consumer relations require real positive
success and negative compiler rejection with TS diagnostics. Properties require actual `fc.check`
results, not a companion's promised count or success. Missing producer dependencies/path/setup/timeout
capability is infrastructure failure, never ordinary-test fallback or source-approved product RED.
Actual compiler rejection/property falsification is distinct.

Use the existing status verification summary and `status --check-report <file>`, not a new subcommand
or flag. Check-report requires unique exact `Profile`, `Coverage`, `Executed unique`, `Passed unique`
and `Formal verification` fields in addition to existing state/run/exit checks. Contract reports
`contract/v1`, `t-way <Strength>` (e.g. `t-way 2`) or explicit `full-product`, and `not-performed`;
before execution unique counts are `null` and `executionStatus` is `not-run`. Stale/incomplete evidence must not acquire verified execution counts.
Declared coverage/audit, actual unique execution/pass counts and residual limits remain distinct.
Resolve current-stage named criteria through the [selected-profile loader](../roles/loading.md),
never a hardcoded different-profile target. Existing controller-only approval and receipt authority
are unchanged.
