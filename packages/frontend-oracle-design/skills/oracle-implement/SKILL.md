---
name: oracle-implement
description: Use when frontend-oracle-design delegates scoped production implementation after a valid immutable lock and accepted VALID_RED. Cannot alter expectations, policy, tests, locks or approval and does not own runtime transitions.
allowed-tools:
  - Bash
---

# Oracle Implement

## Entry and prerequisites

After activation, first Read [`common.md`](../frontend-oracle-design/references/common.md).
Print `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]` before other response text.
Read [`mandatory-verification.md`](../frontend-oracle-design/references/mandatory-verification.md)
and [loading rules](../frontend-oracle-design/references/roles/loading.md) after the controller's scope gate.
Fresh workers load their own dependencies, never inherit assumed nodes from a parent's continued bundle.

The [controller](../frontend-oracle-design/SKILL.md) provides the current approved locked scope,
source hashes, target snapshot, accepted deterministic product VALID_RED and scoped implementation task.
Re-read these prerequisites on disk before writing. A model proof failure, adequacy failure,
compiler rejection or broken harness is not product RED.
Missing, stale or invalid prerequisites return to `$frontend-oracle-design` without production changes.
Do not fabricate an approval, lock, runId or accepted state. Direct invocation cannot bootstrap a run.

ALREADY_SATISFIED permits zero-production verification only. It never grants production edit permission.
Open holds exclude their rows from both test and production changes. A revision mismatch stops the task,
preserves evidence and returns to the controller, never relocks just to pass a mismatch.

## Scoped implementation

Read [implementation procedure](../frontend-oracle-design/references/roles/implement.md) before choosing
the implementation method or modifying production after VALID_RED. Read applicable dependencies at the
decision point, including architecture, backend, type/state, FSD, visual and performance guidance.

1. Re-read approved behavior, actual code and the existing implementation decision. Record material
   responsibility assignment, rationale, alternatives and the applied guidance actually read.
2. Implement minimally within the assigned files/rows and responsibility boundaries. Preserve the locked
   expected outcomes and mandatory constraints. Guidance is not permission to invent missing policy.
3. Return test/harness corrections to `$test` through the controller. Never change an expected result,
   weaken assertions, add suppressions, or quietly install dependencies to obtain GREEN.
4. After the first relevant pass, perform the bounded simplification at its normal load point and within
   the existing shared product budget. Reverification must reflect the final bytes, not a prior snapshot.
5. After UI changes, collect applicable design-scanner observations as pending and non-verifying before
   review dispatch. Do not turn scanner advice into approved policy or certified visual evidence.

## Outputs and prohibitions

Return exact changed paths/rows, implementation decision and responsibility mapping, command/evidence
references from the existing ledger, scanner observations or actual unavailability, remaining findings,
conditional nodes read and the requested next controller action.
Allowed writes are scoped production files and the existing implementation decision/journal/PLAN.md.
Approved dependencies follow the controller's explicit authorized task and project rules, not role discretion.

Never change policy, expected outcomes, the approved card, source set, lock, or consumer tests.
Never self-approve, issue review receipts, perform a runtime transition, or declare final delivery acceptance.
Only the controller records acceptance, using current guide, actual evidence and existing scripts.
All work shares policy 2, harness 2 and product 3 budgets, not one budget per role.
POLICY_GAP returns for human decision/new revision, EVIDENCE_GAP for $test/reviewer evidence,
HARNESS_DEFECT for $test, PRODUCT_DEFECT for applicable accepted RED, ENVIRONMENT_DEFECT for actual-cause
FAIL, and NON_ORACLE_OPINION is recorded without new policy or a completion blocker.
