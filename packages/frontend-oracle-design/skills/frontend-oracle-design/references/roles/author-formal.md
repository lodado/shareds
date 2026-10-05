# Formal-only model package and projected Draft authoring

Allowed writes are assigned unlocked model package/model/proof files, projected Draft/manual sections,
existing source-linked decisions, journal and PLAN.md. Conditional closure writes only authorized existing
evidence/candidate outputs, never locked package/model bytes. Use the controller's runtime/ledger,
never an independent role ledger. Missing closure dispatch/current Delivery packet returns to controller.

Prerequisites: approved source identities, human-confirmed discovery axes, controller-selected mode
and scoped task. Missing prerequisites return to the controller. No policy approval, lock, runtime
transition, target test write or production edit is authorized here. Re-read disk at every stage.

## Model first, card second

1. Unconditionally read [`bend-cross-verification.md`](../bend-cross-verification.md) before Draft/lock,
   in every lane and risk. Bend is mandatory, not applicability-gated and needs no separate user request.
   Read [`adequacy.md`](../adequacy.md) for source goals, Terms, Adequacy and independent analyst inputs.
   `scripts/ensure-bend.mjs` reuses or installs the checksum-pinned CLI. A failed install is a mandatory
   verification failure, never skipped or downgraded. Re-read Bend before proof execution and GREEN/review.
2. Put the cells the sources leave open in front of the user before writing the model, not while writing
   it. The [Space discovery](space-discovery-formal.md) answers must be confirmed before any Bend; the
   first response's one `yes` confirms them with the provisional Draft. After it, write and prove the
   model; only proof counterexamples and new axes return as follow-up questions. A changed
   axis or candidate returns there through the controller, never silently becomes an agent decision.
   When the user named the card path, the provisional Draft written there moves to
   `provisional-draft.md` in the same folder before `project-card` writes the projected card.
3. Write the model package from sources, starting from
   [`model-package.example.json`](../model-package.example.json), never from MODEL.bend or a hand-written
   card. Use package-authoring and model-authoring reference routes with their dependencies.
   Write Terms, the finite world, assumptions/owners/falsifiers and source goals from confirmed axes.
   Read [`card/case-space.md`](../card/case-space.md) and [input families](case-space-inputs-formal.md) to decide
   all seven input families, inherited dispositions and possible cases. Unknown combinations stay in.
4. Use supported, authorized native delegation with capacity for an independent model analyst.
   Prepare `oracle-adequacy.mjs model-input --package` and pass only that path's permitted source-bound
   inputs. Keep analyst input independence from the candidate model/author conclusions as adequacy
   specifies. A same-context role switch does not create independence. Report a concrete reason for any
   sequential fallback. Later proof/behavior checks may run concurrently on stable isolated inputs when
   the host supports it. Approval, VALID_RED and final adjudication remain serial. This is not graph opt-in.
5. Write the Bend world, behavior model and laws according to stack applicability. Read
   [`model-patterns.md`](../model-patterns.md) while writing/revising MODEL, LAWS or PROOF, especially retries,
   delays, staleness, error kinds, remounts and request counts: time as events, attempts, error sum types,
   and separate request/fetch/effect counts, not one collapsed event.
6. Run `oracle-package.mjs derive` and `oracle-adequacy.mjs check --package` until each counterexample is
   resolved or becomes an Open question. Read [`discovery.md`](../discovery.md) before
   `oracle-discovery.mjs cross-check --package` and bring each candidate back to the interview.
   New-axis/cross-term uses the A/B question and silent-decision uses the policy question.
7. Run `oracle-package.mjs project-card`. Rows, axes and formal sections are projected, never
   hand-written a second time. The model package is the source of generated card regions, not vice versa.
   Tools prove the locked laws, enumerate model space and check product correspondence only at the
   applicable approved stage; plans/generated tests are not executed consumer evidence.
   `scripts/oracle-model.mjs` proves locked laws, generates oracle space from the locked model and checks
   product correspondence, recorded in Formal Model. `scripts/oracle-adequacy.mjs` checks coordinates and
   rows against source goals in Terms/Adequacy. `scripts/oracle-package.mjs` derives axes and projects the
   card, and `scripts/oracle-projection.mjs` generates fast-check conformance tests from that model.
   Consumer test generation/writes belong to the explicitly invoked $test role only after approval/lock,
   not to this pre-lock authoring role.

The controller walks `scripts/oracle-stage.mjs`: begin, then advance --to MODELED | CHECKED | DRAFTED
once each gate passes. Return actual artifacts and gate results for those transitions.
oracle-lock.mjs create refuses a package oracle that is not at DRAFTED on the same package bytes,
and only that script path's stage runtime writes stage.json. The lock still runs card lint itself,
so a hand-written record skips no check. Authoring never fabricates stage acceptance.

## Complete the Draft, without rewriting generated policy

Read [`card/policy-sources.md`](../card/policy-sources.md), [`card/risk-grill.md`](../card/risk-grill.md),
[`bva.md`](../bva.md), [`card/card-format.md`](../card/card-format.md),
[`card/interaction-sweep.md`](../card/interaction-sweep.md) and card/case-space with dependencies.
Keep every surviving Grill question as an Open question, candidate rows plus a recommendation.
Add source-backed BVA, then sweep new × inherited × runtime interactions after drafting rows and before
showing the Draft. Every needs-decision cell/frame cites an Open question. Resolve every needs-evidence
cell by investigation in the same pass; only needs-decision reaches the user.

Before drafting, run `scripts/oracle-dimensions.mjs --path <touched files>` and
`scripts/oracle-verify.mjs card --repo-policies`. Dimension candidates, side-effect inventory and sibling
card policies sharing a surface are counterparts to disposition, never rows to copy.
Disposition each applicability candidate (action-repeat, request-lifecycle, response-order,
owner-lifetime, server-boundary, data-value) with a source and mapped dimension, non-application reason,
or Open-question ID. This catches declared-model omissions, not all real interactions. It never invents
cursor expiry or retry policy where the contract is silent.

A projected card's Case space comes from the world, Coverage: model, no frames. A legacy card without
a model package declares dimensions, runs `scripts/oracle-frames.mjs --oracle` and dispositions every
emitted frame under recommended options. Read
[`card/case-space-frames.md`](../card/case-space-frames.md) only for that legacy path or full-product opt-in.
A Coverage: full-product card follows the existing opt-in rather than claiming an unbounded proof.
The raw Cartesian candidates, generated frames and actual executable tests are distinct sets.

Follow the phase order: outcome → risk → data/architecture → API → concurrency/async → state → visual →
performance/ops. A question goes ahead of the provisional Draft only when its answer changes the lane,
the actor or the side-effect class; axis discovery rides the provisional Draft. A requested one-question-at-a-time interview runs without a round cap. This does not change
Delivery's shared policy budget. Before presenting the Draft, request the conditional source-aware fresh
review in card/policy-sources and merge unresolved policy findings into Open questions. It supplements
card-only cold-read and reverse-impossible review, never replaces them.

The first substantive Draft or detailed design response includes verification design, not merely
unit/integration/e2e labels or tool names. Show Case space choices and constraints, connect outcome-changing
interactions and temporal paths to contract rows, and explain real target, controlled boundary, completion
barrier, observations and method for each core failure mechanism. Use card/card-format's verification
realization plan and cold-read criteria and the existing case-space contract. Plans/examples are not
execution evidence. First means user-reviewable Draft, not a short progress preamble. This applies to Low
too, but never authorizes consumer tests or production in Design-only, or replaces generation/approval.
Tool preparation follows mandatory verification and target dependency rules. Missing dependencies identify
package, version and owning package.json as a Draft approval item. Prefer the network test boundary the
repo already uses. If MSW is installed or its adoption is approved, keep handlers/example data at the
nearest owner, no root concentration. Never silently add test-only dependencies.

## Conditional design loads

- With an exposed type boundary, read type-fest/TypeScript guidance and compiler witness path before
  Draft/lock. Before async/ordering/duplicate-submit/retry/multi-step O\* rows, or client state/exported
  Props/shared-package API/trust-boundary type changes, read
  [`types/state-ladder.md`](../types/state-ladder.md) together with
  [`frontend/decisions.md`](../frontend/decisions.md), plus [`types/authoring.md`](../types/authoring.md)
  and [`types/api-surface.md`](../types/api-surface.md). If an existing query/router/form owns the state,
  do not create a new status union, never a member per screen. Paging/empty computed from a neighbor
  and owned flag is derived state, not state.
- With that guidance load [`types/advanced-contracts.md`](../types/advanced-contracts.md): adoption is
  compiler-witness-gated, real type-fest consumer and witnesses mandatory at an exposed boundary.
  Once per repo, or when tsconfig/TS version/witness inclusion/checker changes, read
  [`type-environment.md`](../type-environment.md). No unrelated compiler or dependency changes.
- Before choosing implementation means even in design, read frontend/decisions and
  [`changeability.md`](../changeability.md). For React architecture boundary/state ownership/public API
  changes read [`architecture-contract.md`](../architecture-contract.md); backend/full-stack/DB/data-access
  changes read [`backend.md`](../backend.md). Finalize outcome-changing source decisions before lock.
- Before UI-shaping work read [`visual-design.md`](../visual-design.md), record behavior-only/local/
  identity-shaping scope and Design Change Confirmation. No Design Intent proceeds without confirmation.
- For Feature-Sliced Design repos or approved adoption, before proposing, designing, or reviewing FSD
  adoption/domain boundaries/slice ownership/public APIs/dependencies/folders, read [`fsd.md`](../fsd.md).
  Domain responsibilities/invariants precede layers/slices/segments. Record seam and change walkthrough
  in the existing architecture document, including boundary changes with no folder moves.
- For a performance requirement or improvement claim, read [`performance.md`](../performance.md).
- If frontend-system-design is installed, read only its references while keeping Oracle intake and
  control. Every choice is a policy candidate. Without an approved source/answer, POLICY_GAP →
  NEEDS_DECISION. Implementation options never precede Oracle's orchestration.
- Conditional problem-definition review (unclear purpose/task, cross-boundary impact, unexplained task
  failure, material dismissal, conflicting evidence or repeated escapes) uses card/policy-sources at
  that decision point, including Low. Do not treat absent rows as automatic NON_ORACLE_OPINION.

## Holds and handoff

Keep the existing case-space hold semantics: model/laws/card/tests cover only what no open hold blocks.
A partial policy question does not stop independent scope, but no test or production code touches held
rows. Ask all open holds in one batch after model work. Actual answers become resolved with an approved
authoritative S\*, candidates are promoted/scoped out/rejected, and a new revision adds blocked rows.
If nothing remains modelable, stop for decision. The author does not approve its own answer or candidate.
Return new cards in full and existing revisions as semantic delta, preserving all open questions/raw
review inputs. The controller obtains independent reviews, drives the nail, presents the Draft, records
human confirmation and creates the lock. Design-only writes/executes no consumer tests or production.
