# Frontend Oracle role modularization design

Date: 2026-10-04
Status: Approved in the conversation on 2026-10-04. The user asked to proceed with the displayed 1+4 proposal.
Baseline: c8bd27b, frontend-oracle-design 0.82.0.

## Intent

Reduce the monolithic Oracle operator context and maintenance coupling by extracting role skills, following the existing `$test` delegation boundary. Preserve all product-policy, approval, evidence, lock, budget and ledger semantics. This is a structural refactor, not permission to simplify verification.

## Approved architecture

One existing plugin exports five named skill directories:

- `frontend-oracle-design`: controller. Scope/mode/resume, explicit skill invocation, human questions and approval, runtime transitions, shared budgets, receipts, evidence freshness and truthful final reporting.
- `oracle-intake`: sources, Outcome Brief, scope/risk/capability investigation, Space discovery questions and source-bound answers. No model/test/product edits or approval.
- `oracle-author`: source-bound model package and independent analyst inputs, Bend/adequacy/cross-check, projected Draft and its manual sections, verification realization plan, interaction sweep and semantic delta. Conditional post-GREEN closure produces evidence/candidates, not policy decisions.
- `oracle-implement`: implementation decisions and scoped production changes after valid lock and RED. No changed expectations, policy, lock or self-approval.
- `oracle-review`: contract cold read, reverse-impossible, source-aware and delivery review modes with the existing independent-context requirements. Findings only, no product edits, receipts or approval.

Reuse external `$test`, `frontend-system-design` reference guidance, explicit `frontend-visual-qa`, and graph opt-in via `agent-graph-engineering`. No new contract-only skill, explorer, graph engine, ledger, delivery state, mandatory artifact or dependency.

## Layout

The canonical core and all existing runtime resources live together at:
`packages/frontend-oracle-design/skills/frontend-oracle-design/`.
The four specialist entries are siblings under `skills/`.
Keep one copy of scripts, canonical reference nodes, evals and generated bundles. Retarget existing hooks, scripts, generators, imports, fixed-depth package version lookups and tracked documentation atomically with relocation. Do not preserve a second flat `skills/SKILL.md` that hosts could discover as a duplicate.

Initial reference ownership can remain inside the core. Split mixed operating instructions into role-scoped reference documents rather than duplicating their content in every entry. Cross-role references use sibling skill paths, while canonical reference-graph paths remain confined to the core's references directory.

## Invariants

- Preserve existing Oracle scope exceptions, unsupported-domain handling and all-risk mandatory verification.
- Default Design-only must not write or execute consumer tests or edit production.
- Confirm Space discovery axes before modeling. Model-first means package -> proof/adequacy -> generated card, not independently rewritten expected outcomes.
- No lock, consumer tests or production/dependency edits before the applicable human confirmation.
- Before target test writes, explicitly invoke `$test`. A test skill's standalone Low exemption never waives an existing Oracle run's rules.
- Only an accepted VALID_RED permits ordinary production edits. ALREADY_SATISFIED permits zero-production verification only.
- The controller owns transition intent. Existing composite commands may already advance the single runtime, so read acceptance back and never double-transition.
- Locks, source hashes, target snapshots, budget identity and evidence freshness continue to be enforced by the existing scripts.
- Policy/harness/product budgets remain the same shared budgets, not one budget per skill.
- Holds, visual pending, NEEDS_DECISION and FAIL preserve their current semantics.
- Source-aware analyst, cold-read reviewer and High reviewers keep their original blinded inputs and independent contexts. Skill switching in a shared context does not create independence.
- Fresh specialists cannot inherit a parent's assumed nodes from a continued bundle.
- Specialist direct invocation with missing prerequisites returns to the controller. It does not fabricate state, approval, a runId or a fallback process.

## Loading and size

The core entry targets 80-140 lines. Intake targets 100-150, author 180-240, implement/review 120-180. These are ceilings/direction, not a reason to add filler. A concise complete entry below the range is acceptable.

Remove stage-specific procedure from the always-loaded controller entry. Each role owns its procedure and conditionally loads applicable canonical reference nodes. Preserve mandatory manual conditions as well as typed routes. In particular split interview access from unrelated card-authoring detail where it is safe, rather than adding an entry that transitively rereads every old phase.

Changes to loading must be checked against relevant reader ownership, mandatory obligations and old behavior assertions. Do not claim total token savings from entry size alone.

## Failure routing

- POLICY_GAP -> controller human decision, intake/author as needed, new revision when required.
- EVIDENCE_GAP -> test or independent reviewer according to the missing evidence.
- HARNESS_DEFECT -> `$test`, permitted locator/fixture/barrier changes and shared harness budget.
- PRODUCT_DEFECT -> implement only after applicable RED checks.
- ENVIRONMENT_DEFECT -> FAIL with the observed cause.
- NON_ORACLE_OPINION -> record, never new policy or a blocker.

## Acceptance

1. Plugin discovery finds exactly five named skill entries and no flat duplicate. Each entry's local links exist and shared runtime is single-copy.
2. The controller links and explicitly invokes all four roles and `$test`; role entry size and prohibitions are checked.
3. Existing state transitions, pre-lock stages, report validation, generated-card integrity, High independence, holds, visual-pending resume and shared budgets keep their tests and runtime enforcement.
4. Existing real public reference/protocol/generator interfaces work after relocation, including unknown facts, manual dependencies and reviewer-only nodes.
5. Test-first coverage catches absent modular entries and broken layout before implementation. The complete Oracle suite, affected sibling suites, generated checks, lint and repository test command are exercised and failures are reported accurately.
6. Fresh-context role pressure checks exercise direct invocation without approval/RED and independent review input restrictions. They supplement, not replace, real CLI and integration checks.
7. Root entry/context scope is measured before/after. Missing actual host end-to-end or token comparison is a limitation, not a claimed improvement.
8. Metadata is bumped together to 0.83.0. Commit only this work. Push only the verified intended commits and never force-push. Refresh user-scope plugin installs only after successful push, sync all five Jcode directories without deleting local-only files, and compare installed content with repository source.

## Preserved user work

Do not edit or commit pre-existing untracked files:
`docs/frontend-oracle-design-beginner-guide.md`,
`docs/reviews/2026-10-01-frontend-oracle-design-astra-review.md`,
`docs/reviews/2026-10-01-frontend-oracle-design-improvement-plan.md`,
`output/`, and `test.bend`.

No new GitNexus index, dependency installation, policy feature or unrelated cleanup is in scope.
