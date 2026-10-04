# Independent review modes

Use only the dispatched mode and its permitted task inputs. Common/mandatory/loading references define
procedure, not permission to inspect excluded task context. Fresh reviewers load their own dependencies.
Do not inherit a parent's bundle assumptions. Missing inputs return to the controller without invented
approval, state or runId. A same-context skill switch is not an independent context.
Return findings only. Never edit product/production, tests, models, policy or locks, issue receipts,
perform transitions or approve the card/delivery. The controller owns acceptance and human decisions.

## Contract cold-read

Read the Cold-read gate criteria in [`card/card-format.md`](../card/card-format.md), with procedural
dependencies, but receive the card bytes alone as task input. No repo path, conversation, rationale or
intended reading. A forced guess is a card defect, not a reader failure. Apply the five questions per row.
Collapse to one root assumption plus the first nail, the cheapest falsifying observation. Return both,
not a list of opinions. The controller must drive that nail and record the observation/result in journal.md
before presenting the Draft. Do not claim naming the nail proves it was driven.
A same-context read is the fallback, never the target, only where the existing card-format contract allows
it and with its limitation recorded. The author cannot un-see the conversation. A fallback cannot be
presented as actual independence or substitute for High delivery's independent samples.

## Reverse-impossible

In a second context-free review once per card, receive the impossible dispositions extracted with
`scripts/oracle-verify.mjs card --ir` and the witness falsifier table from
[`card/interaction-sweep.md`](../card/interaction-sweep.md). The framing is "one of these is wrong:
build the counterexample". Do not import author rationale to defend an exclusion. Return counterexamples
and disagreements. Every disagreement is promoted to needs-decision, not dismissed as taste.
This reverse two-sample read supplements, never replaces, the card-only cold-read gate.

## Source-aware fresh review

When [`card/policy-sources.md`](../card/policy-sources.md)'s trigger applies before approval, compare
verbatim user messages and approved source excerpts with every affected card decision. Record each item
as a linked P/O/D row, Open question or justified N/A. Preserve the raw source inputs, not an author's
summary. It supplements, never replaces, card-only cold-read and reverse-impossible review.
If independence is unavailable, record the same-context fallback and limitation where that source review
contract permits it. Unresolved policy findings return to the author/controller as Draft Open questions.
Neither reviewer inference nor production observations become product policy authority.

## Delivery review

Before adjudication read [`subagent-review.md`](../subagent-review.md), its dependencies and the applicable
[`review-checklist.md`](../review-checklist.md) in this independent context. The primary agent does not
load reviewer-only criteria. Receive the generated oracle-run.mjs review-packet, raw locked artifacts,
source hashes, target snapshot, ledger, evidence mapping and actual diff. Do not repair packet bytes.
Matching criteria arrive as reference file links via review-packet --review-point, never pasted criteria
or a controller's hand-written conclusion. Conditional --context artifacts remain bound to the snapshot.
Supporting context does not replace common inputs, five-axis judgments or independent reviews.
Follow the exact role-specific raw-input and blind-context restrictions in subagent-review; High's two
samples remain independent, not two passes in one context. Reviewers never issue their own review-receipt.

Re-read [`mandatory-verification.md`](../mandatory-verification.md) and
[`bend-cross-verification.md`](../bend-cross-verification.md) before verification/review. Review all
applicable real proof, type-fest consumer/static witnesses/checker environment, fast-check positive runs
or finite-world correspondence, with actual reported evidence, source mapping and freshness. A label or
successful file generation is insufficient. Read [`adequacy.md`](../adequacy.md) for Terms/Adequacy cards.
Verify required High consecutive GREEN, mutation kill/revert/re-GREEN and post-review reruns from evidence.
Low follows the mandatory verification stack, not a standalone test exemption. Design-only has no
Delivery contextual artifact obligation or implied product test execution.

Conditional review reference reads, all with dependencies and actual applicability:

- Always the graph's review criteria, [`changeability.md`](../changeability.md) and
  [`types/advanced-contracts.md`](../types/advanced-contracts.md), plus mandatory/Bend above.
- Frontend production change: [`frontend/decisions.md`](../frontend/decisions.md),
  [`frontend/authoring.md`](../frontend/authoring.md), [`frontend/quality.md`](../frontend/quality.md).
- Creating/changing a type/state contract: [`types/review-criteria.md`](../types/review-criteria.md).
- React architecture boundary, state ownership or public API change:
  [`architecture-contract.md`](../architecture-contract.md).
- Feature-Sliced Design repo or approved adoption, before reviewing adoption/domain boundaries/ownership/
  public APIs/dependencies/folders: [`fsd.md`](../fsd.md), including boundaries without folder moves.
- Design Intent or UI-shaping interaction: [`visual-design.md`](../visual-design.md). Confirm source-backed
  intent and actual Design Change Confirmation, not reviewer taste.
- Backend/full-stack/DB/data-access change: [`backend.md`](../backend.md).
- Performance requirement or improvement claim: [`performance.md`](../performance.md).
- Interactive widget: matching @lodado/eslint-plugin-local-rules/contracts/<pattern>.json as raw input,
  re-derive findings from diff, never infer semantics from a declared role alone. Guidance is not policy.

RELATIONAL/JUDGMENT visual evidence pending or declined without source-backed N/A blocks REVIEW_VERIFIED.
Only a trusted node-test run with locked Playwright-driving test and schema-v3 artifact certifies visual
PASS, not a standalone Playwright adapter, scanner or Browser MCP observation. Open holds exclude held
rows and block REVIEW_VERIFIED; review only the actual locked scope and return the hold limitation.
Discovery closure verdict and residuals are evidence, never automatic approval or second state machine.

## Findings and handoff

Return input identities, mode, independence/fallback limits, every required axis judgment, classified
findings with source/row/evidence links and raw results. POLICY_GAP goes to human decision/new revision;
EVIDENCE_GAP to actual missing evidence; HARNESS_DEFECT to $test allowances; PRODUCT_DEFECT to applicable
RED-gated implementation; environment failure reports the actual cause; NON_ORACLE_OPINION is recorded,
never a new policy or completion blocker. A missing card row alone does not establish NON_ORACLE_OPINION.
No reviewer can spend a separate budget, fabricate a runId, issue a receipt or return its own approval.
