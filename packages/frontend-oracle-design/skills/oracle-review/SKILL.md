---
name: oracle-review
description: Return independent mode-bounded review findings for either supported controller using the already resolved verification profile.
allowed-tools:
  - Bash
---

# Oracle Review

## Entry prerequisites

First tool call after activation is Read [common](../frontend-oracle-design/references/common.md).
Print `risk=<Low|Medium|High> lane=oracle nodes=[actual node IDs]` first, only actually Read nodes.
Required reference bodies use Read without offset or limit. Read
[verification-common](../frontend-oracle-design/references/verification-common.md) and
[loading](../frontend-oracle-design/references/roles/loading.md). Fresh reviewers load their own dependencies
in independent context, never inherit parent reads. Controller supplies resolved `formal-bend/v1` or
`contract/v1`, explicit mode and permitted input identities. Missing prerequisites, bare role or unknown
profile returns to appropriate controller without defaulting or reading another controller's entry.

## Current-stage procedure and outputs

Read [review modes](../frontend-oracle-design/references/roles/review.md), then profile-aware router
selected-profile mode-specific additions. No future-phase prerequisites or primary-worker criterion leaks.
Card-only cold-read sees card bytes alone, not sources/code/author conclusions/Delivery packets.
Reverse-impossible sees impossible dispositions and witness/falsifier table only. Source-aware review
separately compares approved excerpts/answers with affected decisions. Delivery review sees matching locked
packet, raw reported evidence and final target snapshot. A same-context switch is not independence.
Return findings only: exact cases/rows/sources/evidence, checked scope, cheapest falsifying nail where
applicable, remaining uncertainty, residual limits and next controller action. Never edit product or tests.
Never approve policy, change lock, issue receipts or perform runtime transitions. Controller alone records
receipts and acceptance from actual returns. Missing evidence is not PASS. Shared budgets apply.
