# Independent Subagent Card Review·Improvement

## Purpose and Independence

So that implementers do not give final approval to their own GREEN, an independent reviewer examines
the external criteria, the Oracle Card, and the raw evidence. The reviewer does not set policy or
rewrite the implementation.

Read all of [`changeability.md`](changeability.md) before judging changeability. Use the same
definitions·questions·React examples·counterexamples·trade-offs as the implementer, but do not
promote this reference into product policy or new architecture authority. Independently disprove the
agreement between the raw Implementation Decision's claims and the actual diff.

If the card contains an `identity-shaping` Design Intent, re-read all of
[`visual-design.md`](visual-design.md) and review the approved visual contract under design
jurisdiction as well. Add the `$frontend-visual-qa` artifact of `RELATIONAL` rows as raw input, but
the reviewer does not take over ownership of screenshots or direct browser runs.

The primary agent runs the bundled `oracle-lock.mjs verify` right before the review. On a mismatch,
do not call the reviewer and discard the existing evidence.

Review is LLM judgment, so it wavers even on the same input. Pin it with two devices:

1. Pin the reviewer input as files. Pass the locked card, ledger runId, evidence mapping, and diff
   as-is, and do not insert an intended conclusion·summarized interpretation.
2. High risk runs **two independent reviews with the same input**. For critical and high findings, a
   lone finding that appeared on only one side is also blocking. Only medium and low findings block
   completion when they are the intersection of row·classification·normalized finding content, and a
   finding that appears on only one side is recorded as advisory. Medium risk requires only a single
   review and schema verification. A Medium single review may run on a faster model·lower reasoning
   effort if the surface supports it — the judgment criteria are owned by the review packet files and
   the findings are verified by schema. Do not lower the High risk two-review requirement.

## Review Criteria Priority

For the priority of the review criteria, the authority priority in [`common.md`](common.md) is
canonical — check in the same order from mandatory constraints to the Oracle Card, and observations
of production code·existing headless tests are evidence only, not correct-answer authority.

If Figma is the criterion, confirm the exact file·page·frame·version, and if it is inaccessible do
not substitute guesses·screenshot memory but report it as unverified. If the external criterion and
the Oracle Card conflict, the reviewer does not arbitrarily pick one or modify the code. Leave the
conflict location and the affected card rows as a finding and return to `NEEDS_DECISION`.

## Role Routing

- If native role routing exists, specify the installed `code-reviewer` role.
- Codex collaboration surface: `agent_type: code-reviewer`.
- Claude Agent surface: `subagent_type: code-reviewer`.
- If role routing is not supported, do not impersonate the role with a prompt; use a supported
  independent review surface or report `FAIL`.

For `identity-shaping`, a `JUDGMENT` row, or an intentional visual baseline change, specify the
installed `designer` role separately from the code review above and review the visual contract. For
mixed work, `code-reviewer` takes the technical·behavioral contract and `designer` takes the Design
Intent·`D*` rows. Neither reviewer sets new policy. If the deterministic comparison passes as-is and
both a `JUDGMENT` row and a baseline change are absent, record the additional designer inspection as
N/A with a reason.

## Review Points — Delivered as File Links

Review criteria are not pasted into the reviewer prompt as body text but **delivered as reference
file links.** When the primary agent picks only the criteria files corresponding to the areas the
diff actually touched and registers them into the packet with `--review-point`, only the path and the
SHA-256 digest are recorded in the packet — the reviewer reads **all** of the linked files directly,
and the digest pins which revision of the criteria was read. Summarizing·excerpting the criteria body
into the prompt violates the input-pinning principle.

| Condition (by diff)                       | Review point file                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Always                                    | [`review-checklist.md`](review-checklist.md) — all judgment items                                 |
| Always                                    | [`changeability.md`](changeability.md) — five-axis judgment criteria                              |
| frontend production change                | [`frontend/decisions.md`](frontend/decisions.md)·[`frontend/authoring.md`](frontend/authoring.md) |
| type·state contract creation·change       | [`types/review-criteria.md`](types/review-criteria.md)                                            |
| FSD repo                                  | [`fsd.md`](fsd.md) — the "Common violations" table                                                |
| Design Intent included                    | [`visual-design.md`](visual-design.md) — evidence tiers·Delivery responsibility                   |
| backend·DB·data-access change             | [`backend.md`](backend.md) — boundary·validation sections                                         |
| performance requirement·improvement claim | [`performance.md`](performance.md)                                                                |

Do not register a criteria file whose condition does not apply — the reviewer also follows the graph
loading rules and does not create findings from unrelated criteria. The condition→node mapping is
also declared machine-readably in `reviewPoints` of
[`reference-graph.json`](reference-graph.json).

## Reviewer Input

Pin it with machine-generated input right before the review.

```bash
node <skill-dir>/scripts/oracle-run.mjs review-packet \
  --dir .ai/oracles/<oracle-id> \
  --decision .ai/oracles/<oracle-id>/implementation-decision.md \
  --review-point <skill-dir>/references/review-checklist.md \
  --review-point <skill-dir>/references/changeability.md \
  --review-point <skill-dir>/references/types/review-criteria.md \
  --output .ai/oracles/<oracle-id>/review-input.json
```

The packet holds as raw fields the last lock verify command·exit, the lock manifest, the full Oracle
text, the full locked local source text, run state, ledger, evidence mapping, `targetRevision`,
`targetSnapshot` (worktree·production·harness digest), digests of files changed since init, the git
diff, visual pending, the Implementation Decision's path·sha256·content, and the registered review
points' path·sha256 (links only, without body).
The reviewer checks the claims of `implementation-decision.md` against the actual diff. It does not
add conclusions·intended solutions·favorable summaries. Do not fix the packet by hand; regenerate it
when the input changes. Only external criteria that cannot be held in the lock, such as URLs·Figma,
are delivered separately at the exact revision from the Oracle Registry.

The reviewer directly checks the changed Page/UI component, the micro-hook·pure model source, and the
import·call relations between them in the packet's diff. `JUDGMENT` rows are checked against the
packet's approval criteria·Design Intent together with the designer findings.

The reviewer does not modify code and returns findings only. Modifying·approving policy·baseline is
forbidden, and final baseline approval is left to the user.

Findings are submitted through the schema file below instead of free-form prose and verified by
machine.

```json
{
  "schemaVersion": 2,
  "reviewerRole": "code-reviewer",
  "reviewerId": "code-reviewer:<stable-session-or-agent-id>",
  "packetSha256": "<sha256(review-input.json)>",
  "targetRevision": "<review-input.targetRevision>",
  "changeabilityReview": [
    { "axis": "Readability", "status": "PASS", "evidence": "src/form.tsx:10-30" },
    {
      "axis": "Predictability",
      "status": "FINDING",
      "evidence": "src/fetch-balance.ts:8",
      "findingId": "f-1"
    },
    { "axis": "Cohesion", "status": "N/A", "evidence": "there is no changed ownership boundary" },
    { "axis": "Coupling", "status": "PASS", "evidence": "there is no new public API" },
    { "axis": "Simplicity", "status": "PASS", "evidence": "it reuses the existing platform API" }
  ],
  "findings": [
    {
      "id": "f-1",
      "row": "O3",
      "classification": "PRODUCT_DEFECT",
      "severity": "high",
      "source": "S1",
      "finding": "fetchBalance performs analytics logging that is not evident in its name and return value",
      "evidence": "review-input.json diff:src/fetch-balance.ts:8",
      "fix": "move the analytics logging to a named event boundary"
    }
  ]
}
```

`changeabilityReview` judges the five axes exactly once each as `PASS | FINDING | N/A`. Every
judgment needs path·line or packet field evidence. `FINDING` cites a real ID from the `findings`
below, and `N/A` writes the reason it does not apply into evidence. schema v1 is allowed only for
reading past artifacts. New review verification requires v2, `reviewerRole`, `reviewerId`,
`packetSha256`, and `targetRevision`. The two artifacts of High risk must have different
`reviewerId`.

```bash
node <skill-dir>/scripts/oracle-verify.mjs findings \
  --file .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md

node <skill-dir>/scripts/oracle-verify.mjs findings \
  --file .ai/oracles/<oracle-id>/findings-a.json \
  --intersect .ai/oracles/<oracle-id>/findings-b.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md

node <skill-dir>/scripts/oracle-verify.mjs review \
  --file .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --packet .ai/oracles/<oracle-id>/review-input.json \
  --revision <targetRevision-from-review-packet> \
  --map .ai/oracles/<oracle-id>/evidence.json

node <skill-dir>/scripts/oracle-verify.mjs review \
  --file .ai/oracles/<oracle-id>/findings-a.json \
  --intersect .ai/oracles/<oracle-id>/findings-b.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --packet .ai/oracles/<oracle-id>/review-input.json \
  --revision <targetRevision-from-review-packet> \
  --map .ai/oracles/<oracle-id>/evidence.json
```

The classification is one of the upstream feedback router's `POLICY_GAP`, `EVIDENCE_GAP`,
`HARNESS_DEFECT`, `PRODUCT_DEFECT`, `ENVIRONMENT_DEFECT`, `NON_ORACLE_OPINION`. Any other
classification or a row ID that is not on the card is rejected as `FINDINGS_INVALID`. A medium/low
finding that does not cite a card row is demoted to `NON_ORACLE_OPINION`. A critical/high finding
without a row may be a global security·permission·data loss problem, so it is not demoted and stays
blocking. `oracle-verify.mjs review` fails with `FINDINGS_BLOCKING` when blocking findings remain.

A violation of an approved repo security·accessibility contract is `PRODUCT_DEFECT`, and if the card
omits that contract it is `POLICY_GAP`. A mere preference is `NON_ORACLE_OPINION` and does not block
completion.
A mismatch with a sourced aesthetic requirement is not a mere preference — if the implementation
differs it is `PRODUCT_DEFECT`, and if the card omitted·distorted it, it is `POLICY_GAP`.

A hidden side effect, a real drift defect risk, or a violation of an approved architecture·public API
boundary is a `PRODUCT_DEFECT` when concrete evidence and a card row exist. If the required
verification is missing it is `EVIDENCE_GAP`, and if an observation result or API shape must be newly
decided it is `POLICY_GAP`. A more preferred naming·folder·abstraction style is `NON_ORACLE_OPINION`
and is not grounds for blocking. Also check whether a mandatory constraint was lowered into a
product·visual preference.

## Reviewer Checklist

The judgment items are owned by [`review-checklist.md`](review-checklist.md). When this file is
registered with `--review-point`, the reviewer reads it directly and the primary agent does not load
its body. Do not transcribe the criteria body into this document or the prompt.

## Finding Improvement

1. The primary agent handles findings through the upstream feedback router. It does not force a fix
   execution style, and minimally fixes only a `PRODUCT_DEFECT` that has evidence.
2. A finding that requires setting new policy is not fixed; return to `NEEDS_DECISION`.
3. After the fix, run the targeted test that reproduces the finding.
4. Re-run the full card tests and the repo mandatory verification.
5. If the user separately requested `$frontend-visual-qa` and an affected artifact exists, return to
   that skill and re-run.
6. If possible, pass the raw re-verification evidence to the same reviewer and confirm only whether
   the finding is resolved.

Separate reviewer and fixer. Do not let the reviewer fix directly and give final approval to their
own fix. The reviewer proposes only one risk and a minimal fix per finding and does not demand a
full refactor in the name of quality. `NON_ORACLE_OPINION` and advisory findings are recorded but
not used as grounds for a fix·policy change. Re-verification also runs through `oracle-run.mjs exec`,
and the `--to REVIEW_VERIFIED` transition is recorded with that runId. `REVIEW_VERIFIED` requires
that no blocking finding exists or that all are resolved and the mandatory re-verification passes.
The card test command to be cited is run again after GREEN, and the remaining mandatory labels are
reused when their digest is unchanged. Pass the reported run and clear findings to
`oracle-run.mjs transition --to REVIEW_VERIFIED --evidence ... --findings ...`. High risk also passes
the second reviewer file with `--intersect`, and records the mutation kill run after GREEN and its
row together with `--mutation-run`·`--mutation-row`.
