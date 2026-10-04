# Formal-only implementation after accepted product RED

A model proof failure, adequacy failure, compiler rejection or broken harness is not product RED.
Missing, stale or invalid lock/source/snapshot/accepted-RED prerequisites return to the controller
without production changes, never fabricate an accepted state or use direct invocation to bootstrap a run.

Read before choosing implementation methods or modifying production after accepted VALID_RED.
Prerequisites are the controller's scoped task, immutable approved lock/source set, current target
snapshot and actual product RED. Missing or stale prerequisites return to the controller with no edits.
ALREADY_SATISFIED allows zero-production verification only. No held row may acquire tests or production.

## Decision and minimal change

Read [`delivery/implementation-decision.md`](../delivery/implementation-decision.md),
[`changeability.md`](../changeability.md), [`frontend/authoring.md`](../frontend/authoring.md),
[`frontend/decisions.md`](../frontend/decisions.md) and [`frontend/quality.md`](../frontend/quality.md)
with their dependencies at the decision point. Record the existing implementation decision and material
[responsibility assignment](../delivery/implementation-decision.md#responsibility-assignment), then
implement minimally. A task-scoped fresh worker still obeys these references and its provided file/row scope.

When explaining material implementation choices, state the choice, current-code rationale, and applied
skill section actually read, with short illustrative type or code examples where useful. Follow
[explanation guidance](../delivery/implementation-decision.md#explain-material-choices) at its normal
load point; this adds no earlier load or approval. Do not turn recommendations into approved policy.

After the first relevant test pass, before final evidence, apply the
[bounded simplification](../delivery/green-review.md#bounded-simplification) in the existing shared product
budget. No deletion is required. Never weaken behavior/tests/constraints or fabricate a new RED for it.
Return current bytes and evidence so the controller can establish a fresh snapshot and packet. A prior
GREEN cannot verify new bytes. The controller records IMPLEMENTED_GREEN exactly once, not the worker.

## Conditional implementation reads

- For React architecture boundary, state ownership or public API changes read
  [`architecture-contract.md`](../architecture-contract.md). Hook Encapsulation only when approved
  architecture chose orchestration-only. Existing equivalent rules first, no dependency installs or lint
  config changes. A profile is not inferred from code shape.
- For backend/full-stack/DB/data-access changes read [`backend.md`](../backend.md).
- With an exposed type boundary use the applicable real type-fest consumer/compiler witnesses, not a
  dummy utility. Before async/ordering/duplicate-submit/retry/multi-step O\* rows, or client state/exported
  Props/shared-package API/trust-boundary type changes, read
  [`types/state-ladder.md`](../types/state-ladder.md) together with frontend/decisions, plus
  [`types/authoring.md`](../types/authoring.md), [`types/api-surface.md`](../types/api-surface.md) and
  [`types/advanced-contracts.md`](../types/advanced-contracts.md). Existing query/router/form state owners
  do not acquire a redundant status union or one member per screen. Computable paging/empty is derived state.
  Once per repo or on tsconfig/TS version/witness inclusion/checker-path changes, read
  [`type-environment.md`](../type-environment.md). New policy/type relations need the controller, not a cast.
- Before new UI, redesign or visible layout/palette/type/copy/motion/responsive/identity changes, read
  [`visual-design.md`](../visual-design.md). Respect behavior-only/local/identity-shaping and the existing
  Design Change Confirmation. UI-shaping cannot silently expand approved scope.
- Feature-Sliced Design repo or approved adoption, before proposing/designing/reviewing adoption, domain
  boundaries, ownership, public APIs, dependencies or folders: read [`fsd.md`](../fsd.md). Begin with domain
  responsibility/invariants, then layers/slices/segments and existing architecture seam/walkthrough.
- For performance requirement or improvement claim read [`performance.md`](../performance.md).
- If frontend-system-design is installed, read only its applicable references as implementation options,
  keeping Oracle intake and control. Every choice is a policy candidate. Unmapped choices are POLICY_GAP,
  returned for NEEDS_DECISION, not permission to modify expected behavior.

## Widgets and scanner observations

Before implement-green touches a card row introducing a dialog, menu, combobox, tabs, listbox, switch,
disclosure, or click target with no native element, read the matching interaction contract from
`@lodado/eslint-plugin-local-rules/contracts/<pattern>.json` (this repo:
packages/eslint-plugin-local-rules/contracts/). Carry guidance.keys, roles and css into the implementation
decision. The same JSON feeds interaction-pattern-contract lint and reviewer widget checks. It reaches
review as shared checklist, not fresh opinion. A contract is guidance, never policy: an uncovered key or
state is POLICY_GAP, not an invented card requirement.

After implement-green touches UI, before review-dispatch, run two design scanners and record their output
as observation artifacts, pending and non-verifying: react-doctor for deterministic interaction/motion/
affordance rules, and the web-design-guidelines skill on changed files if installed. Use the repo's own
react-doctor when available, otherwise the pinned on-the-fly version leaving package.json/lockfile alone:

```sh
npx --yes react-doctor@0.9.14 design <project dir> --scope files --include-untracked --json --no-telemetry
```

--no-telemetry is required; default crash reporting reaches an external service. --scope takes
full/files/changed/lines, never a file list. Keep only findings on paths from
`oracle-run.mjs status --changed-files`. The JSON report records the version that actually ran.
Fix what the card already covers. Anything else is a candidate, never new policy. If install or execution
fails (offline/sandbox), skip the scanner and say so in the report. This conditional scanner fallback does
not waive mandatory verification failures. Screenshots/direct browser QA remain explicit $frontend-visual-qa
work. Scanner or Browser MCP observations never certify PASS.

## Return and recovery

Return exact changes, assigned responsibilities, ledger-bound execution references, scanner observations,
remaining findings and nodes read. Do not edit expected outcomes, policy, source set, lock or tests,
self-approve, issue receipts or perform runtime transitions. Missing evidence returns to $test/reviewer
through the controller. Harness locator/fixture/barrier repairs remain $test work and shared harness budget.
On test/harness correction before GREEN, the controller loads delivery/red. On revision mismatch stop and
return for confirmation-lock handling, never relock. Common classification and budgets remain authoritative.
