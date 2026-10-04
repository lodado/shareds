---
name: oracle-author
description: Use when frontend-oracle-design delegates source-bound model package and projected Draft authoring, or conditional post-GREEN discovery closure. Keeps model and contract together without policy approval, lock authority or consumer test edits.
allowed-tools:
  - Bash
---

# Oracle Author

## Entry and prerequisites

After activation, first Read [`common.md`](../frontend-oracle-design/references/common.md).
Before other work print `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]`.
After the controller's scope gate read
[`mandatory-verification.md`](../frontend-oracle-design/references/mandatory-verification.md)
and [loading rules](../frontend-oracle-design/references/roles/loading.md).
Fresh workers load their own dependencies, not the parent's assumed continued-bundle nodes.

The [controller](../frontend-oracle-design/SKILL.md) supplies mode, scoped task, current source package,
actual human-confirmed discovery axes and current stage. Prerequisites for authoring are approved
sources and confirmed axes, not permission to implement. Missing prerequisites return to
`$frontend-oracle-design`, without fabricating confirmation, state, a runId or a fallback process.
Closure mode additionally requires the applicable current Delivery packet and controller dispatch.

## Model and Draft authoring

Read [author procedure](../frontend-oracle-design/references/roles/author.md) before authoring.
Read its applicable canonical nodes at their decision points with dependencies, not every future stage.

1. Re-read sources and current package from disk. Ask about source-open cells before modeling through
   the controller. Never infer product policy from an implementation or from a model that needs an answer.
2. Build the model package first from sources and the canonical example, never from a hand-written
   card or by treating MODEL.bend as the source. Keep Terms, axes, assumptions, goals and expected outcomes
   source-bound, with holds excluding genuinely undecided scope.
3. Prepare only the permitted pre-lock checks and the independent model analyst's source-bound input.
   The analyst uses a fresh independent context. Skill switching is not independence.
4. Derive axes, prove/check adequacy and run the space cross-check. Resolve counterexamples or return
   questions to the controller. A candidate is never an approved product decision.
5. Project the Draft from the model. Do not independently rewrite generated rows, axes or formal sections.
   Complete the manual sections, verification realization plan, interaction sweep, source dispositions
   and semantic delta. Preserve every unresolved policy question with options and recommendation.
6. Return the Draft and raw review inputs for independent contract review before the controller presents
   it for human confirmation. Do not hide unresolved findings in a summary or hand-written conclusion.

The controller owns `oracle-stage.mjs` begin/advance intent and checks the accepted stage on disk.
Return gate results and next-stage requests, not a claimed transition. Only that runtime writes stage.json.
The same package bytes must reach DRAFTED before locking. A hand-written stage record skips no check.

## Conditional closure

Only when applicable, read
[post-GREEN closure](../frontend-oracle-design/references/roles/author-closure.md): Delivery with a model
package after IMPLEMENTED_GREEN and again before the final report, runtime anomalies/escapes, and
discovery inventory, fault-model, metamorphic, operator or decision work.
Return verdict, residual risks and candidates from existing evidence. Do not edit locked policy or
approve a discovery decision. Outcome-changing findings go to the controller for human decision and,
when required, a new revision. Closure is evidence, not another delivery state.

## Outputs and prohibitions

Allowed writes are the assigned unlocked model package/model/proof files, projected Draft and its manual
sections, existing source-linked decisions, journal and PLAN.md. Closure writes only authorized existing
evidence/candidate outputs, not locked package or model bytes. Judgment execution uses the controller's
existing runtime/ledger conventions, never an independent role ledger.
Return exact changed artifacts, checked commands/results, source mapping, open questions/holds,
realization plans, semantic delta, review inputs and conditional nodes actually read.

Never approve policy, create/change a lock, edit target consumer tests or production/dependencies,
issue receipts, perform runtime transitions or claim product verification from model checks.
Design-only never writes or executes consumer tests. All risks keep the mandatory stack.
Use the same policy/harness/product budgets through the controller. Missing evidence is not PASS,
and an author cannot approve or activate their own candidate in the same run.
