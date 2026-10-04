---
name: oracle-intake
description: Source-bound intake and finite Space discovery delegated by either supported controller using its already resolved verification profile.
allowed-tools:
  - Bash
---

# Oracle Intake

## Entry prerequisites

First tool call after activation is Read [common](../frontend-oracle-design/references/common.md),
even if the controller read it earlier. Use Read without offset or limit for required reference bodies.
Print `risk=<Low|Medium|High> lane=oracle nodes=[actual node IDs]` first, only actually Read nodes.
Read [verification-common](../frontend-oracle-design/references/verification-common.md) and
[loading](../frontend-oracle-design/references/roles/loading.md). Fresh workers load their own dependencies.
Controller supplies outcome, mode, scope, source identities and already resolved profile: `formal-bend/v1`
or `contract/v1`. Bare invocation, unknown profile or missing prerequisites returns to the appropriate
controller without any profile default. Never read a different controller's entry to bootstrap authority.

## Current-stage procedure

Before source inspection or any preliminary brief, finish current-stage reads in the same turn:
[intake](../frontend-oracle-design/references/roles/intake.md),
[source priority](../frontend-oracle-design/references/common.md#policy-sources),
[Space discovery](../frontend-oracle-design/references/roles/space-discovery.md),
[input families](../frontend-oracle-design/references/roles/case-space-inputs.md),
[BVA](../frontend-oracle-design/references/bva.md), and selected-profile source/risk/requirements guidance.
Use the profile-aware router to choose only current-stage additions, not future authoring procedures.
Re-read actual sources and disk. Return Outcome Brief/Source Registry, approved facts versus assumptions,
risk/capability findings, axes provenance, verbatim actual answers, questions and next controller action.
Controller asks questions and obtains confirmation. Capability discovery is not runtime readiness.
Allowed writes are assigned existing source/discovery records, journal and PLAN.md.
Never edit model artifacts, target tests, product code or dependencies, approve policy, change lock,
issue receipts or perform runtime transitions. Missing evidence is not PASS. Use shared budgets only.
