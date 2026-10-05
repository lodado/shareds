# Formal-only intake procedure

Read only for source/risk/capability investigation. The controller retains questions, approval and
runtime transitions. Common authority and mandatory verification apply at every risk and in both modes.

## Sources and outcome

1. Read [`card/policy-sources.md`](../card/policy-sources.md) with common before writing Outcome Brief.
   Separate requested mechanism from intended outcome. Without a KPI, invent no numbers.
2. Investigate approved specs, PRD, acceptance criteria, design system and Figma; pin exact
   location/frame/version. Classify product-policy, mandatory-constraint, project-constraint and
   implementation-reference. On conflict with a mandatory constraint never downgrade it: NEEDS_DECISION.
   Conflicting external standards or inaccessible required material also require NEEDS_DECISION.
3. Judge risk and investigate policy sources. The lane header's risk is finalized here.
   Before selecting investigation breadth/depth for unclear existing-system ownership, cross-boundary
   scope or single-card milestone grouping, read
   [`lifecycle-adaptation.md`](../lifecycle-adaptation.md) with dependencies. Known owners and sufficient
   approved sources for a small change do not require that conditional node. Reuse existing artifacts.
4. After source investigation and before writing the plan or Draft, read
   [Space discovery](space-discovery-formal.md) with dependencies. Propose axes and counterexamples for the
   controller's first response, beside its provisional Draft, and freeze actual answers before any Bend.
   Put the cells the sources leave open in front of the user before writing the model, not while writing it. Unanswerable axes stop with the
   first question. A question that blocks only part is recorded as a hold by the author, not erased.
5. Run scope that shares no Term, state or file as parallel slices under lifecycle-adaptation when
   supported and authorized. This does not move implementation decisions ahead of VALID_RED or waive
   source/confirmation gates. Return concrete limitations rather than assuming host delegation support.

## Capability discovery, before Draft or initialization

For Delivery only, after risk and source investigation and before Draft/lock/init/test work, perform
the capability discovery in [`delivery/ledger.md`](../delivery/ledger.md). This is an investigation
result, not runtime readiness or VALID_RED evidence. Do not reject a runner from its package name alone.
Inspect the actual scripts, runner configuration and supported reporter path, including the visual
producer capability required by the applicable rows. Record supported | unsupported | unknown.
A package name alone is not evidence; unknown must be investigated rather than treated as unsupported.
Low Delivery loads this check too. Unsupported producer capability does not remove or N/A the row.

Design-only checks tool readiness under mandatory verification without executing consumer tests.
Record actual availability, installed versions and proposed missing dependencies for the Draft.
Do not install target dependencies or edit configuration. The Draft must identify package, version
and owning package.json for each required approval item. Failed approved mandatory tool preparation
is a verification failure, not a low-risk exemption or silent downgrade.

## Conditional scope decisions

Use the scope-decision router from [loading](loading-formal.md), with inspected facts and conservative unknowns.
The router does not replace these manual conditions or the author's corresponding decision-time reads.

- Before new UI, redesigns or visible layout/palette/type/copy/motion/responsive/identity changes, read
  [`visual-design.md`](../visual-design.md). Record behavior-only, local or identity-shaping scope.
  Local and identity-shaping require Design Change Confirmation on the card, obtained by the controller.
- For React architecture boundary, state ownership or public API decisions read
  [`architecture-contract.md`](../architecture-contract.md). For backend/full-stack/DB/data-access
  scope read [`backend.md`](../backend.md). Final source decisions precede the final Delivery lock.
- Feature-Sliced Design repos or approved adoption, before proposing, designing, or reviewing adoption,
  domain boundaries, slice ownership, public APIs, dependencies or folders: read [`fsd.md`](../fsd.md).
  Start with domain responsibility/invariants, then layers/slices/segments; record public seam and
  change walkthrough in the existing architecture document, even with no folder moves.
- With a performance requirement or improvement claim, read [`performance.md`](../performance.md).
- If intake must choose a frontend means or type/state boundary rather than just identify its existence,
  read [`frontend/decisions.md`](../frontend/decisions.md), and for async/ordering/duplicate-submit/retry/
  multi-step rows or client state/exported Props/shared API/trust boundaries also
  [`types/state-ladder.md`](../types/state-ladder.md), [`types/authoring.md`](../types/authoring.md),
  [`types/api-surface.md`](../types/api-surface.md) and
  [`types/advanced-contracts.md`](../types/advanced-contracts.md) with dependencies before the decision.
  Once per repo or when tsconfig/TS version/witness inclusion/checker changes read
  [`type-environment.md`](../type-environment.md). No implementation choice overrides sources.
- If the frontend-system-design skill is installed, read only its references while keeping Oracle
  intake and control. Every choice is a policy candidate; anything not mapped to an approved source or
  user answer is POLICY_GAP → NEEDS_DECISION. Recommendations are implementation options and never
  precede Oracle's orchestration. General architecture or FSD folder advice alone does not auto-invoke Oracle.
- For unclear purpose/task, cross-boundary impact, unexplained task failure, material dismissal,
  conflicting new evidence or repeated escapes, use card/policy-sources' conditional problem-definition
  review. Low follows the same conditions. Missing a card row does not itself mean NON_ORACLE_OPINION.

Return precise source identities, approved facts versus assumptions, risk/capability findings,
axis proposals/actual answers, open questions and applicable nodes. No model/test/product edits,
approval, receipts or runtime transitions are authorized by this procedure.
