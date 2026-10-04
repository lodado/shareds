---
name: oracle-review
description: Use when frontend-oracle-design dispatches contract cold-read, reverse-impossible, source-aware or independent delivery review. Enforces each mode's blinded inputs and returns findings only, never approval, receipts or edits.
allowed-tools:
  - Bash
---

# Oracle Review

## Entry and prerequisites

After activation, first Read [`common.md`](../frontend-oracle-design/references/common.md).
Print `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]` first, listing actual reads only.
Read [`mandatory-verification.md`](../frontend-oracle-design/references/mandatory-verification.md)
and [loading rules](../frontend-oracle-design/references/roles/loading.md).
Fresh reviewers load their own dependencies. A parent's continued bundle is not already-read context.
These procedural references are not permission to inspect task artifacts excluded by the selected mode.

The [controller](../frontend-oracle-design/SKILL.md) supplies the review mode and its exact raw inputs.
Required independence is an independent context, not a role switch in a context that saw the authoring.
Missing prerequisites return to `$frontend-oracle-design`. Never fabricate state, runId, approval,
receipts or a fallback process. Report a same-context limitation only where the existing contract permits
that fallback. It never satisfies High independent-context requirements by relabeling the reviewer.

## Select exactly the dispatched review mode

Read the matching section of [review procedure](../frontend-oracle-design/references/roles/review.md).
Do not load other modes' task inputs or a whole controller/author operating manual.

| Mode               | Permitted task inputs and result                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract cold-read | Card bytes alone, no repo path, conversation, rationale or intended reading. Five questions per row, one root and cheapest falsifying first nail.                          |
| Reverse-impossible | Extracted impossible dispositions and the canonical witness falsifier table, in a second context-free review. Counterexample disagreements become needs-decision.          |
| Source-aware       | Verbatim user messages and approved source excerpts plus affected card decisions. Audit each to linked P/O/D, Open question or justified N/A.                              |
| Delivery           | Current generated review packet, locked artifacts/raw ledger evidence and applicable reference file links. Verify snapshot binding, all required axes and actual evidence. |

The independent model analyst remains the author's source-bound analyst path, not a cold-card review
with extra model inputs. Source-aware review supplements, never replaces, card-only cold-read and reverse
review. Skill switching cannot remove information already seen.

## Findings, not approval

For Delivery, read applicable review nodes with their graph dependencies in this independent context.
Use exact raw `review-packet --review-point` inputs, never pasted criteria or an author's conclusion.
Respect High two-sample independence and actual mutation/revert/re-GREEN evidence.
Required stack evidence, visuals, holds and policy sources do not gain Low exemptions.
Do not repair a packet, browse unrelated task context in a blind mode, or infer evidence from a label alone.

Return mode, input identities, independence/fallback limits, linked findings and classifications,
actual missing evidence, proposed falsifying observations and references actually read. Preserve raw
review inputs and results for the controller. The controller drives/records the first nail and its result,
adjudicates findings, issues receipts and performs transitions. Your return is not runtime acceptance.

Never edit production/product code, consumer tests, policy, models or locks.
Never approve the card or delivery, issue receipts, perform runtime transitions or spend separate budgets.
Report POLICY_GAP for human decision, EVIDENCE_GAP for actual missing mappings/evidence,
HARNESS_DEFECT for permitted $test repair, and environment failure with its observed cause.
NON_ORACLE_OPINION is recorded with rationale, never new policy or a blocker.
