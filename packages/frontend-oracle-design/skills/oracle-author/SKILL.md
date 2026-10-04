---
name: oracle-author
description: Author source-bound contracts or dispatched closure for either supported controller using the already resolved verification profile.
allowed-tools:
  - Bash
---

# Oracle Author

## Entry prerequisites

First tool call after activation is Read [common](../frontend-oracle-design/references/common.md).
Print `risk=<Low|Medium|High> lane=oracle nodes=[actual node IDs]` first, only actually Read nodes.
Required reference bodies use Read without offset or limit, source-code investigation stays bounded.
Read [verification-common](../frontend-oracle-design/references/verification-common.md) and
[loading](../frontend-oracle-design/references/roles/loading.md). Fresh workers load their own dependencies.
Controller supplies already resolved `formal-bend/v1` or `contract/v1`, mode, scope, approved source
identities and actual human-confirmed axes. Missing prerequisites, bare role or unknown profile returns
to the appropriate controller, never defaults to a profile or reads the other controller's entry.

## Current-stage procedure and outputs

Read [author](../frontend-oracle-design/references/roles/author.md), then use the profile-aware router
for only selected-profile current-stage additions. Do not execute procedures from another profile.
Re-read sources and unlocked artifacts. Return source-linked Draft, permitted profile artifacts,
checks/results, case mappings, realization plans, open questions/holds, semantic delta and raw review inputs.
The controller owns actual human confirmation, stage intent and lock. Author checks are not product runs.
No consumer tests in Design-only. Never approve policy, create/change lock, edit consumer tests,
production or dependencies, issue receipts, perform transitions or self-activate a policy candidate.

Conditional post-GREEN/final or escape closure reads
[closure authority](../frontend-oracle-design/references/roles/author-closure.md) and only the selected
profile's dispatched closure requirements. Return observed evidence, verdict/candidates and residual risks
on current locked bytes. Never edit locked policy to make observations pass. Closure is not a new state.
Use the same shared budgets and feedback routing. Missing evidence is not PASS.
