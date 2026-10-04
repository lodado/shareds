---
name: oracle-intake
description: Use when frontend-oracle-design delegates source investigation, Outcome Brief, risk/capability investigation, or Space discovery. Returns source-bound proposals and answers to the controller, never approval or implementation authority.
allowed-tools:
  - Bash
---

# Oracle Intake

## Entry and prerequisites

After activation, the first tool call is a Read of
[`common.md`](../frontend-oracle-design/references/common.md), before exploration or other reference loads.
Print `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]` first.
Only actually Read nodes belong in the header. This applies to explanation and plan-only work too.

The [controller](../frontend-oracle-design/SKILL.md) supplies the requested outcome, mode,
known sources, scope and existing run location when one exists. A new intake need not have a lock.
Missing prerequisites or an unclassified direct invocation return to `$frontend-oracle-design`.
Do not fabricate an approval, source, runId, runtime state or fallback workflow.

After the controller's scope gate, read
[`mandatory-verification.md`](../frontend-oracle-design/references/mandatory-verification.md)
and [loading rules](../frontend-oracle-design/references/roles/loading.md).
Fresh workers load their own dependencies. The parent's continued-bundle assumptions are not inherited.
Common authority, mandatory verification and shared budgets apply at every risk, including Low.

## Procedure

Read [intake procedure](../frontend-oracle-design/references/roles/intake.md) at investigation start.

1. Re-read current sources and run documents from disk. Establish Outcome Brief and Source Registry,
   separating approved policy and mandatory/project constraints from implementation observations.
2. Finalize source-backed risk and investigate actual tool/runner capabilities for the selected mode.
   Read conditional scope guidance at the decision point, not later when writing code.
3. Before a detailed plan or any model, read
   [Space discovery](../frontend-oracle-design/references/roles/space-discovery.md) with its dependencies.
   Propose axes with provenance and A/B counterexamples. Return questions to the controller to ask.
4. Record only actual human answers verbatim, distinguish Unknown and Assumption, and freeze confirmed
   axes in the existing source artifact. The controller owns human questions and confirmation.
5. Return new-axis, cross-term, silent-decision and sufficiency candidates to that same interview.
   An unanswered question that leaves no modelable scope is `NEEDS_DECISION`, not assumed consent.

## Allowed outputs and limits

Allowed writes are the existing Outcome Brief, Source Registry, source investigation/discovery records,
stage journal and PLAN.md within the assigned scope. No new mandatory artifact is introduced.
Return source locations/versions, outcome, risk, capability results, proposed or confirmed axes,
verbatim answers, open questions, conditional references actually read and the next controller action.
Clearly label a proposal versus a human-confirmed answer. Capability discovery is not runtime readiness.

Never write or edit a model, target test, production/product code or dependency configuration.
Never approve policy, create or change a lock, issue a receipt or perform a runtime transition.
Do not spend a separate role budget. Report findings through common feedback routing to the controller:
policy gaps require a human decision, evidence gaps require investigation, and an observed environment
failure is reported with its actual cause. No absent evidence is a PASS.
