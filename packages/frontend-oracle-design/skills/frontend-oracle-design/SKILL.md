---
name: frontend-oracle-design
description: "Use for frontend behavior that can go wrong in state, order, count, permission or money when the user asks to fix, build, design or plan it, even with no code yet: bug reports whose correct behavior is not written down (double charge on double click, stale or out-of-order responses, submit after session expiry, tenant cache leaks); mutations, async loading, pagination, caching, destructive actions, payments, permissions or gates; requests whose sources conflict or leave the rule open (PRD vs legal memo); a new `.ai/oracles/<id>/` path or an existing Oracle run under `.ai/oracles/<id>/` (its state moves only through this skill's scripts; a `contract/v1` run belongs to frontend-contract-design); explicit Oracle or graph-orchestrated delivery requests. Medium/high risk. Do not auto-invoke for low-risk copy/token/isolated CSS, visual-only work, straightforward regression fixes inside already approved behavior that has no Oracle run, screenshot/browser QA, or FSD folder advice alone."
allowed-tools:
  - Bash
---

# Frontend Oracle Design

Fixed verification profile: `formal-bend/v1`; no downgrade or fallback to another profile. Only its scripts
move state, and the controller alone records each transition.

## Entry: always first

Print `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]` as the literal first line of the
first response, even when it stops. Payment or permission work is High.

- **No Oracle**: nothing modelable in state, order, count, permission or effect (only copy, tokens, layout,
  CSS, motion timing or display). Read [common](references/common.md), then stop `OUT_OF_SCOPE` and route to
  `$test`, `$frontend-visual-qa` or a plain edit. Ask for a missing source; never guess it.
- **Contract**: finite test coverage explicitly asked for without a Bend proof, or a `contract/v1` run,
  belongs to frontend-contract-design. Medium work keeps the Bend model.
- **Oracle**, explanation and design-only work included: before any source investigation or Outcome Brief,
  preliminary or read-only included, run `node <skill dir>/scripts/oracle-step.mjs --dir .ai/oracles/<id>`
  and do what its last line, `NEXT FOR YOU:`, says. It scaffolds an empty folder; read nothing before it.
  Each answer prints its position's card above that line: the rules judged there and the procedure.
  The first card has you invoke [`$oracle-intake`](../oracle-intake/SKILL.md); never defer it.
  If step or an invocation is unavailable, stop and return the blocker, not a substitute brief (one built from
  guessed sources). The request text is `S1`; an empty repo is `no code observation`, never a blocker.

For a reference a card names, Read without offset or limit. Keep source-code reads bounded.

## Mode selection and explicit role invocation

Design-only is the default; Delivery needs an explicit implementation, self-verification or review request.
For mixed work, settle Oracle scope and session-wide activation before dispatching sibling writers
([dispatch ordering](references/controller-entry-formal.md#dispatch-ordering)). The cards name each role as
its phase comes: [`$oracle-author`](../oracle-author/SKILL.md), which invokes [`$bend-proof`](../bend-proof/SKILL.md);
[`$oracle-review`](../oracle-review/SKILL.md) in independent review contexts; `$test` before target tests; and
[`$oracle-implement`](../oracle-implement/SKILL.md) only after accepted VALID_RED. No lock before actual
human approval (common's pre-authorized one counts). Delivery's policy 2, harness 2 and product 3 budgets are
shared across roles. Never fabricate approval, state or runIds, bypass a refused transition or relock to pass
a mismatch. Graph orchestration and direct visual QA stay explicit opt-ins.

Open these only when a card names them: [Formal controller requirements](references/controller-entry-formal.md),
[Formal coordination](references/roles/controller-formal.md), [Formal reporting](references/roles/reporting-formal.md)
and [verification-common](references/verification-common.md).
