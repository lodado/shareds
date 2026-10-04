---
name: oracle-implement
description: Implement scoped production behavior for either supported controller after matching immutable lock and accepted VALID_RED.
allowed-tools:
  - Bash
---

# Oracle Implement

## Entry prerequisites

First tool call after activation is Read [common](../frontend-oracle-design/references/common.md).
Print `risk=<Low|Medium|High> lane=oracle nodes=[actual node IDs]` first, listing only actually Read nodes.
Required references use Read without offset or limit. Read
[verification-common](../frontend-oracle-design/references/verification-common.md) and
[loading](../frontend-oracle-design/references/roles/loading.md). Fresh workers load their own dependencies.
Controller supplies already resolved `formal-bend/v1` or `contract/v1`, scoped files/rows, approved
immutable lock/sources, snapshot and accepted VALID_RED. Re-read actual disk evidence. Missing prerequisites,
bare role or unknown profile returns to appropriate controller, never defaults a profile or reads another
controller's entry. Revision mismatch stops and preserves evidence, never relocks to pass.
ALREADY_SATISFIED is zero-production verification only, never edit authority. Held rows receive no edits.

## Current-stage procedure and outputs

Read [implementation](../frontend-oracle-design/references/roles/implement.md), then profile-aware router
current-stage additions and applicable conditional boundary guidance, not future review/report procedures.
Implement minimally within assigned scope, record responsibility/alternatives/rationale and perform bounded
simplification after first relevant pass within shared budget. Reverification reflects final bytes.
Return harness/test corrections to `$test` through controller. Never weaken assertions or invent policy.
Return exact changed paths/rows, implementation decision, evidence identities, scanner observations as
pending/non-verifying, findings and next action. No expected-outcome, policy, card, source, lock or test edits.
Never approve policy, install unauthorized dependencies, self-approve, issue receipts or perform transitions.
Only controller records acceptance via tools, using actual fresh evidence and shared budgets.
