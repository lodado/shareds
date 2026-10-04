# Graph orchestration: explicit request only

Only on explicit graph-loop request invoke `$agent-graph-engineering`. Verify the selected workflow's
resolved profile, current-stage role inputs and full same-profile dependency closure before execution.
An installed workflow is not automatically authorized for every profile. Unknown/mismatched workflow
or unavailable graph verifier is FAIL, never fallback to a different profile's entry/procedures.
Without graph opt-in use existing sequential gates, supported role delegation remains discretionary.

Graph Controller owns node execution/edge selection only. Source policy, approval, lock, ledger,
state transitions and shared budgets remain with existing runtime. Workers execute only assigned
current-node scope and return declared outputs, never choose edges, self-approve or issue receipts.
Graph verifier adjudicates strict edge matches, joins and maxSteps, not verification success or budgets.
Preserve append-only events and actual pre-ledger errors without fabricated runIds. Post-init policy
gaps record actual NEEDS_DECISION, impossible judgment actual-cause FAIL. ALREADY_SATISFIED is
zero-production, accepted GREEN is recorded once and resumes without duplicate transitions.
High independent reviewers see only permitted own inputs, never each other's findings. Controller
records actual matching receipts and re-verifies final snapshots before review acceptance. Pending
visual evidence remains resumable IMPLEMENTED_GREEN, never a new state or certified observation PASS.
Do not recursively invoke either controller inside nodes. Actual human confirmation gates still wait
for actual answers, graph execution cannot approve on the user's behalf or waive source/RED authority.
