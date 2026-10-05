---
name: frontend-contract-design
description: Use when the user explicitly requests a frontend behavior contract without Bend proof (the `contract/v1` profile, source-approved rows, a t-way Case space by default or an explicit full-product opt-in, reported test evidence and independent review), or when the work touches an existing `contract/v1` run under `.ai/oracles/<id>/` (deliver it, resume it, make its card tests pass, review it, or report its state, that run's state moves only through these scripts). Choose it only when the user asks for finite test coverage rather than a formal model; bug reports and features with state, order, count, permission or money risk otherwise belong to frontend-oracle-design. Do not auto-invoke for low-risk copy/token/isolated CSS, visual-only work, straightforward regression fixes inside already approved behavior that has no Oracle run, screenshot/browser QA, FSD folder advice alone, or requests for Bend formal proof (frontend-oracle-design owns those).
allowed-tools:
  - Bash
---

# Frontend Contract Design

Fixed verification profile: `contract/v1`. Select before authoring, preserve across card/stage/lock/run/
worker packet/review receipt. No aliases, fallback or profile override. One canonical runtime and shared
budgets serve both controllers and all roles. Runtime tool paths are under `frontend-oracle-design/scripts`.

## Entry: always first

First tool call after activation is Read [common](../frontend-oracle-design/references/common.md), before
exploration or other references, even for explanation/design-only work. Use Read without offset or limit
for required bodies, source-code reads stay bounded. Print `risk=<Low|Medium|High> lane=oracle nodes=[actual node IDs]`
first, listing only actually Read nodes. Read [verification-common](../frontend-oracle-design/references/verification-common.md),
[loading](../frontend-oracle-design/references/roles/loading.md) and
[Contract requirements](../frontend-oracle-design/references/contract/requirements.md) for the current stage.
Before any source investigation or Outcome Brief invoke [`$oracle-intake`](../oracle-intake/SKILL.md),
including preliminary/read-only work. Do not defer reads or invocation. If unavailable, stop and return
blocker, never a substitute brief. Scope without a behavioral contract stops OUT_OF_SCOPE. Unresolved
outcome-changing sources/capabilities are NEEDS_DECISION or actual-cause FAIL, never guessed approval.
Never read the other controller's entry or profile-specific procedures.

## Mode selection and explicit role invocation

Design-only is default, Delivery requires explicit implementation/self-verification/review request.
Read [controller](../frontend-oracle-design/references/roles/controller.md) only for current coordination.

1. Invoke `$oracle-intake` for source identities, risk/capability and actual human-confirmed finite axes.
2. Invoke [`$oracle-author`](../oracle-author/SKILL.md) with approved sources/axes. Contract authoring owns
   direct `oracle.md`, t-way (or explicit full-product) Space and dispositions, not a new DSL or
   companion policy package.
3. Invoke [`$oracle-review`](../oracle-review/SKILL.md) in independent mode-bounded contexts. Preserve raw
   findings and drive the falsifying nail before presenting full Draft/semantic delta and questions.
4. Obtain actual human approval before CHECKED whole-card hash. Unresolved dispositions block lock.
   Follow selected-profile stage gates on identical approved bytes, only lock tool writes ORACLE_READY.
5. Design-only never writes/executes consumer tests or edits production/dependencies.
6. Explicit Delivery invokes `$test` before tests and follows existing `oracle-run.mjs guide` and ledger.
   Accepted VALID_RED precedes [`$oracle-implement`](../oracle-implement/SKILL.md) production edits.
   ALREADY_SATISFIED is zero-production verification only. Shared budgets are policy 2, harness 2, product 3.
7. Record GREEN once, dispatch independent Delivery review on fresh reported case/type/property evidence,
   rerun after findings on final snapshots. Controller alone records transitions/receipts through tools.
8. Before final reporting read [reporting](../frontend-oracle-design/references/roles/reporting.md) and
   current Contract reporting requirements. Report `formalVerification: not-performed`, finite coverage
   and residual limits honestly. File creation, plans and labels never imply executed PASS.

Missing prerequisites return to this controller. Never fabricate approval/runIds/state, bypass rejected
gates or relock mismatches. Graph orchestration and visual QA remain explicit opt-ins, not new states.
