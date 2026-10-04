---
name: frontend-oracle-design
description: Use when the user explicitly requests an Oracle contract or graph-orchestrated delivery loop; when the work touches an existing Oracle run under `.ai/oracles/<id>/` (deliver it, resume it, make its card tests pass, review it, or report its state, that run's state moves only through this skill's scripts); or when medium/high-risk frontend behavior has unresolved policy that must be locked before implementation. Typical cases are mutations, async ordering, duplicate submits, destructive actions, payments, permissions, or data-integrity boundaries. Do not auto-invoke for low-risk copy/token/isolated CSS, visual-only work, straightforward regression fixes inside already approved behavior that has no Oracle run, screenshot/browser QA, or FSD folder advice alone.
allowed-tools:
  - Bash
---

# Frontend Oracle Design

**Last Updated:** 2026-10-04

Oracle owns Outcome Brief, Source Registry, approved contracts, revision lock and ledger state transitions.
This entry is the controller, not an implementation generator or a substitute for the four role procedures.
One canonical runtime, reference graph and ledger serve all roles. No role has its own budget or state machine.

## Entry: always first

1. **After the skill loads, the first tool call is a Read of exactly one lane entry node.**
   Read [`common.md`](references/common.md) for every risk. The low-fast-path node is legacy-only.
   The Skill call is activation, not this read. Repo exploration, answer drafting, any other tool call,
   and any other reference load all come after it.
2. **Print the lane header as the first line of the response.** Body text without the header is a violation:
   `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]`.
   List only the nodes **actually Read**, never planned reads or a bundle name.
3. Requests that only **explain in words** a plan, design, file structure or types are inside this procedure too.
   "Already known", "the spec is detailed enough", "no code changes", "write the tests now" and
   "the code already exists" are not skip reasons. Existing code takes the same interview, model,
   Draft and lock before any test is written.
4. **Scope gate, after common and before mandatory verification.** Classify the requested behavior:
   - No modelable state, ordering, counts, permissions, effects or representable calculation (only copy,
     tokens, layout, CSS, animation timing, pure display): stop without card/lock/stack.
     Report `Status: OUT_OF_SCOPE` and route to `$test` for regression, `$frontend-visual-qa` for rendered UI,
     or a plain edit. Ask for a required missing source, never guess it. OUT_OF_SCOPE is not a ledger state.
   - Behavior with a domain Bend cannot represent (floating point, negative numbers, string content,
     time, randomness): unsupported domain, `NEEDS_DECISION`, never narrow the requirement to fit Bend.
   - Mixed: model the stateful part and list the rest as Not formalized/Out of scope with its owner.
     Report that Oracle did not verify it. If the core requirement can only be stated by the unsupported
     part, NEEDS_DECISION. Test whether a state machine can express it, not whether Bend has a native
     type (a string can be abstracted to valid/invalid). When unsure continue investigation, then reassess.
5. All in-scope risks load [`mandatory-verification.md`](references/mandatory-verification.md) before
   investigation choices, Draft/lock. Bend is unconditionally required; type-fest/TypeScript and
   fast-check/world paths follow that contract's applicability, never a role's standalone exemption.
   General architecture or FSD folder advice alone: do not auto-invoke this skill on its own.
6. Read [loading rules](references/roles/loading.md) for reference routing, stage-time dependencies,
   fresh-context and bundle rules, disk/journal discipline and protocol boundaries.

## Mode selection and explicit role invocation

Design-only is the default. Delivery requires an explicit implementation/self-verification/review request.
At entry or resume read current disk state. Read [controller procedure](references/roles/controller.md)
when coordinating the selected stages; read only current-step dependencies, not all future role procedures.

1. Explicitly load and invoke [`$oracle-intake`](../oracle-intake/SKILL.md) for sources, Outcome Brief,
   risk/capability and Space discovery. Controller asks the proposed questions and obtains actual answers.
   Confirm axes and source-open cells before any model. Missing/unsupported sources follow common routing.
2. Explicitly load and invoke [`$oracle-author`](../oracle-author/SKILL.md) after source/axis prerequisites.
   Obtain source-bound package, independent analyst inputs, proof/adequacy/cross-check and projected Draft,
   with manual sections, realization plan, interaction sweep and semantic delta. Controller owns stage intent.
3. Explicitly load and invoke [`$oracle-review`](../oracle-review/SKILL.md) in the required independent
   contexts for card-only cold-read, second reverse-impossible read and conditional source-aware review.
   Drive the first nail and record the result before showing the Draft. Same-context switching is not independence.
4. Present the full new Draft or semantic delta and Open questions. Obtain human confirmation, lint and lock
   through the existing scripts. No lock, target tests, production or dependency edits before confirmation.
   Design-only ends ORACLE_READY, NEEDS_DECISION or tool-failure FAIL. Write/execute no consumer tests or production.
5. For explicit Delivery, explicitly load and invoke `$test` on entry and immediately before target test writes.
   If it cannot be invoked, FAIL. Read delivery/ledger, initialize real required labels and follow the current
   guide. `$test` owns test writing/judgment; its standalone Low exemption never waives this Oracle run's rules.
6. Only after accepted VALID_RED, explicitly load and invoke [`$oracle-implement`](../oracle-implement/SKILL.md)
   for scoped production changes and implementation decisions. ALREADY_SATISFIED is zero-production verification.
   Return harness work to `$test`. Read actual acceptance after composite commands, never double-transition.
7. After accepted IMPLEMENTED_GREEN, invoke `$oracle-author` for applicable discovery closure and
   `$oracle-review` for independent delivery review. Controller issues receipts and records transitions,
   requiring current lock/source hashes/target snapshots, High independence and post-review reruns.
8. Before final reporting invoke applicable closure again, read [reporting](references/roles/reporting.md),
   perform its four artifact-backed checks and report the actual ledger state with runIds, not role claims.

## Controller authority and stop/resume

Only existing scripts advance stages/ledger state. The controller owns transition intent and acceptance
readback, human questions/approval, receipts, evidence freshness and truthful final reporting.
Specialist returns are artifacts/findings, never approval, a fabricated runId or permission to bypass a gate.
Direct invocation with missing prerequisites returns here. Fresh specialists read their own dependencies.

After init/on resume and after each accepted transition, run `oracle-run.mjs guide --dir <dir>`, select a
legal target, then `guide --dir <dir> --to <target>`. Follow only that step's missing primary references
with dependencies, and deliver reviewer references in the independent context. Guide is read-only advice.
A rejected transition advances nothing. Never edit state/evidence or relock to bypass rejection.

Use common.md's Feedback routing and shared budgets: policy 2, harness 2, product 3, not per skill.
POLICY_GAP requires human decision/new revision; EVIDENCE_GAP goes to $test/independent reviewer;
HARNESS_DEFECT goes to $test's permitted repairs; PRODUCT_DEFECT requires applicable RED;
ENVIRONMENT_DEFECT is actual-cause FAIL; NON_ORACLE_OPINION is recorded, never new policy or a blocker.
Open holds exclude held rows and block REVIEW_VERIFIED; use PARTIAL_VERIFIED only after its actual review.
Visual pending/declined without locked source-backed N/A stops resumably at IMPLEMENTED_GREEN.
Policy unresolved after init needs structured NEEDS_DECISION and a real transition/runId, even if the user
forbids questions or card revision. Recording it neither reopens nor edits the locked card.
Before init preserve decision/evidence without inventing a runId. Impossible judgment is FAIL.

Only when a graph-orchestrated loop is explicitly requested, load and invoke `$agent-graph-engineering`
and read [`graph-orchestration.md`](references/graph-orchestration.md) in full before its bundled workflow.
Screenshot comparison and direct browser QA run only on explicit request, by invoking the separate
`$frontend-visual-qa` skill by name. No new browser completion state is introduced.
Optional frontend-system-design references remain implementation options, never policy or replacement control.
