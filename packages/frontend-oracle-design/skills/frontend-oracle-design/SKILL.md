---
name: frontend-oracle-design
description: Use for frontend behavior that can go wrong in state, order, count, permission or money when the user asks to fix, build, design or plan it, even with no code yet: bug reports whose correct behavior is not written down (double charge on double click, stale or out-of-order responses, submit after session expiry, tenant cache leaks); mutations, async loading, pagination, caching, destructive actions, payments, permissions or gates; requests whose sources conflict or leave the rule open (PRD vs legal memo); a new `.ai/oracles/<id>/` path or an existing Oracle run under `.ai/oracles/<id>/` (its state moves only through this skill's scripts; a `contract/v1` run belongs to frontend-contract-design); explicit Oracle or graph-orchestrated delivery requests. Medium/high risk. Do not auto-invoke for low-risk copy/token/isolated CSS, visual-only work, straightforward regression fixes inside already approved behavior that has no Oracle run, screenshot/browser QA, or FSD folder advice alone.
allowed-tools:
  - Bash
---

# Frontend Oracle Design

Fixed verification profile: `formal-bend/v1`. Select before authoring and preserve it across card,
stage, lock, run, worker packet and receipt. No downgrade or fallback to another profile.
One canonical runtime and shared budgets serve both controllers and all roles.

## Entry: always first

After activation the first tool call is Read [common](references/common.md), before other references
or exploration, even for explanation/design-only work. Use Read without offset or limit for required
reference bodies, bounded source-code reads. Print `risk=<Low|Medium|High> lane=oracle nodes=[actual node IDs]`
first. Include only nodes actually Read. Read [verification-common](references/verification-common.md),
[loading](references/roles/loading.md) and the current-stage Formal requirements.
Before any source investigation or Outcome Brief invoke [`$oracle-intake`](../oracle-intake/SKILL.md),
including preliminary/read-only investigation. Do not defer invocation or reads to a later turn.
If reads/invocation are unavailable, stop and return the blocker, not a substitute brief.

Scope without behavioral state/order/count/permission/effect stops OUT_OF_SCOPE, not a fake contract.
Unsupported outcome-changing scope is NEEDS_DECISION, not a skipped verification obligation.
Formal-specific scope, mandatory stack and original entry obligations are owned by
[Formal controller requirements](references/controller-entry-formal.md).

## Mode selection and explicit role invocation

Design-only is default. Delivery needs an explicit implementation/self-verification/review request.
Read [controller](references/roles/controller.md) and [Formal coordination](references/roles/controller-formal.md)
only for the current stage, not every future phase.

1. Invoke `$oracle-intake` for sources, risk/capability and confirmed Space axes.
2. Invoke [`$oracle-author`](../oracle-author/SKILL.md) after approved-source/axis prerequisites.
   Its selected Formal procedures own specialized authoring and checks.
3. Invoke [`$oracle-review`](../oracle-review/SKILL.md) in independent review contexts with permitted inputs.
   Preserve findings, drive the falsifying nail, obtain actual human approval, then lint/lock through tools.
4. Design-only never writes/executes consumer tests or edits production/dependencies.
5. Explicit Delivery invokes `$test` before tests and uses the current `oracle-run.mjs guide` and ledger.
   Only accepted VALID_RED permits [`$oracle-implement`](../oracle-implement/SKILL.md) production work.
   ALREADY_SATISFIED is zero-production verification only.
6. Record GREEN once, dispatch independent Delivery review, rerun on final snapshots and apply conditional
   selected-profile closure. Controller alone records transitions/receipts through existing tools.
7. Before final reporting read [reporting](references/roles/reporting.md) and
   [Formal reporting](references/roles/reporting-formal.md). Cite actual artifacts/runIds and residual limits.

Missing prerequisites return to this controller. Never fabricate approval/state/runIds, bypass rejected
transitions or relock to pass mismatches. Shared policy 2, harness 2, product 3 budgets apply across roles.
Graph orchestration and direct visual QA remain explicit opt-ins, not new runtime states or policy authority.
