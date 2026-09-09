# Lifecycle adaptation — conditional inception and single-card work units

Read only in the Oracle lane, before selecting investigation breadth/depth for unclear
existing-system ownership, cross-boundary scope, or single-card milestone grouping. A small change
with known owners and sufficient approved sources does not need this node. Low keeps its exclusive
fast path. If investigation discovers one of these conditions later, load here before replanning.

## Select work, not a weaker guarantee

Risk in [common.md](common.md) sets the minimum evidence, independently of task size. Use uncertainty,
affected owners, dependencies and reversibility to choose the breadth and depth of investigation.
Do not add another risk score, lifecycle state, approval gate or mandatory planning artifact.

| Evidence at intake | Adaptation |
| --- | --- |
| Approved sources and existing owners already cover the change | Reuse them; explain the relevant choice in a sentence instead of producing a second design |
| Existing-system owners or document/code agreement are unclear | Investigate only the affected journey and its state, API, side effects and verification owners |
| A public boundary or shared owner changes | Load the applicable architecture/type/backend references under their existing conditions |
| Several outcomes share a policy, state owner or side effect | Keep one Oracle; consider its existing non-overlapping milestones |
| Independent cards would be needed | Propose boundaries and unresolved integration obligations; do not promise aggregate completion |

The reference graph's load conditions and the canonical confirmation, lock, RED/GREEN and review
contracts remain the floor. A short High-risk change still gets High-risk evidence; an omitted
investigation stage cannot waive a required reference or gate. Never import an upstream profile's
review-disabling option.

Before presenting a plan or Draft, read [card/case-space.md](card/case-space.md) with its dependencies
and emit its test-space briefing. For a complex change, append the chosen stages, their reasons,
existing input/output locations and justified omissions to `journal.md`; for a small one, use a
sentence. Do not fill a fixed checklist for its own sake. The journal is append-only rationale, not
policy, approval, a lock target or a second ledger. Re-read the real source and run artifacts on
resume rather than treating a prior plan as current evidence.

## Brownfield evidence boundary

Trace the changed user journey to the actual state owner, API/side effects, shared types and
verification location. Reuse the relevant approved architecture document; do not reverse-engineer
the whole repository or create a document at every component.

Keep these distinctions in the investigation rationale, with actual paths/symbols/source locations:

- **Observed as-is:** what code, tests or browser evidence currently do.
- **Approved to-be:** what accepted sources require, referencing Source Registry entries.
- **Unknown:** missing evidence or unresolved policy, including disagreements between the two.

Resolve evidence gaps by investigation. A document/code disagreement does not authorize making
current behavior the expected result. Apply [common.md](common.md)'s feedback classification;
outcome-changing uncertainty belongs in the Draft's Open questions or the existing branch-killing
question path, not in an invented fixture. A new public boundary, policy or side-effect scope goes
through the existing source and confirmation gates. Record observations in the journal, not as
new approved statements in an architecture document.

## Small delivery units without another orchestrator

For one small outcome, use one card without a Unit document. For a larger card, reuse
[`--milestone`](card/confirmation-lock.md#run-artifact-initialization) only for non-overlapping
test-owned rows. A Unit is an outcome/ownership boundary, not a folder or component count.
Milestones group verification; they do not create per-unit states, reset budgets, authorize writes
before `VALID_RED`, or replace the card's required impact and integration evidence.

Name the row owning a cross-boundary claim and its real verification target in the existing
[Verification realization plan](card/card-format.md#verification-realization-plan). Component-level
GREEN is not proof of a combined journey; avoid assigning the same assertion to several tests.
Detailed implementation choices still belong in `implementation-decision.md` after `VALID_RED`.

This adaptation supports single-card milestones, not a multi-card scheduler or aggregate terminal
state. If the scope cannot safely fit one card, present the proposed split and missing integration
contract; do not silently descope the request, auto-launch Team, or report independent GREENs as
whole-feature completion. Future multi-card delivery needs approved revision dependencies,
integration ownership and evidence in an owning Oracle, not mutable `done` rows in a journal.

## Confirmation and lifecycle limits

Fold outcome-changing choices into the existing Draft/delta confirmation. Investigation and
equivalent technical choices inside approved scope do not introduce another confirmation.
Follow [card/confirmation-lock.md](card/confirmation-lock.md): Design-only stops after its confirmed
card is locked; when Delivery is known initially, finalize the necessary architecture/backend/local
source set before the final lock and init. New source/policy requirements after a Design-only lock
need a confirmed new revision, not an expanded old lock.

Inception and Construction are explanatory perspectives over these existing procedures.
Neither the plan nor independent AI review substitutes for the user's approval or human outcome
review. `REVIEW_VERIFIED` does not mean deployed or operationally successful. Operations automation,
new telemetry, deployment and rollback authority are outside this adaptation; continue to use the
existing escape records and feedback routing for observed defects.

## Methodology references

Selectively adapted from AWS's [AI-DLC introduction](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/)
and [adaptive workflows](https://aws.amazon.com/blogs/devops/open-sourcing-adaptive-workflows-for-ai-driven-development-life-cycle-ai-dlc/)
(reviewed 2026-09-09). Their adaptive breadth/depth, short work cycles and persistent-context
principles are implementation guidance, not product policy sources or a claim of full AWS workflow
conformance. These links explain the design; they do not require a network fetch on each run.
