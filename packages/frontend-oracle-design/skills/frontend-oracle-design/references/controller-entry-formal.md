---
name: frontend-oracle-design
description: "Use for frontend behavior that can go wrong in state, order, count, permission or money when the user asks to fix, build, design or plan it, even with no code yet: bug reports whose correct behavior is not written down (double charge on double click, stale or out-of-order responses, submit after session expiry, tenant cache leaks); mutations, async loading, pagination, caching, destructive actions, payments, permissions or gates; requests whose sources conflict or leave the rule open (PRD vs legal memo); a new `.ai/oracles/<id>/` path or an existing Oracle run under `.ai/oracles/<id>/` (its state moves only through this skill's scripts; a `contract/v1` run belongs to frontend-contract-design); explicit Oracle or graph-orchestrated delivery requests. Medium/high risk. Do not auto-invoke for low-risk copy/token/isolated CSS, visual-only work, straightforward regression fixes inside already approved behavior that has no Oracle run, screenshot/browser QA, or FSD folder advice alone."
allowed-tools:
  - Bash
---

# Formal-only controller entry obligations

**Last Updated:** 2026-10-04

Oracle owns Outcome Brief, Source Registry, approved contracts, revision lock and ledger state transitions.
This entry is the controller, not an implementation generator or a substitute for the four role procedures.
One canonical runtime, reference graph and ledger serve all roles. No role has its own budget or state machine.

## Entry: always first

1. **Run `oracle-step.mjs --dir <dir>` first and do what its last line, `NEXT FOR YOU:`, says.** It
   scaffolds an empty folder, and each answer carries the card for its position, so no reference read
   comes before it. The low-fast-path node is legacy-only.
   A reference a card names needs its full body: use Read without offset or limit.
   Keep source-code investigation reads bounded. A prefix or headings alone cannot satisfy a node.
2. **Print the lane header as the first line of the response.** Body text without the header is a violation:
   `risk=<Low|Medium|High> lane=oracle nodes=[node ids actually Read]`.
   It is the literal first line of the first response even when that response stops (OUT_OF_SCOPE,
   NEEDS_DECISION, a blocker). Risk is common's classification: payment or permission work is High.
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
   - Time, money, negative or decimal values, string content and randomness are axes, not a gate stop:
     time is an Order/Async event (`Tick`/`Expire`), negative/decimal/money/string inputs are Value
     classes, randomness is an environment choice in `next(history)`; see
     [model patterns](model-patterns.md#time-is-an-event). `NEEDS_DECISION` only when the sources leave the
     boundary, precision or duration undecided — the same as any other open policy question.
   - Medium work keeps the Bend model; no risk hands it to the Contract controller. Medium work with an
     event order, async lifecycle or concurrency core models only that core: the first response proposes
     the other input families as `excluded: outside the Medium core`, naming any touched file the family
     was mined from ([case space](card/case-space.md)). The confirming `yes` becomes the S\* their package
     exclusions cite, and their policies stay tested rows (Not formalized). Medium work without such a
     core (form validation, analytics or config injection) models its decision rule: which inputs yield
     which result or effect, and how many times.
   - Mixed: model the stateful part (for Medium, its core or its decision rule) and list the rest as Not formalized/Out of scope with its owner.
     Report that Oracle did not verify it. If the core requirement can only be stated by the unmodelable
     part (UI, CSS, I/O), NEEDS_DECISION. Test whether a state machine can express it, not whether Bend
     has a native type (a string can be abstracted to valid/invalid), and never narrow
     the requirement to fit Bend. When unsure continue investigation, then reassess.
5. All in-scope risks load [`mandatory-verification.md`](mandatory-verification.md) before
   investigation choices, Draft/lock. Bend is unconditionally required; type-fest/TypeScript and
   fast-check/world paths follow that contract's applicability, never a role's standalone exemption.
   General architecture or FSD folder advice alone: do not auto-invoke this skill on its own.
6. Read [loading rules](roles/loading.md) for reference routing, stage-time dependencies,
   fresh-context and bundle rules, disk/journal discipline and protocol boundaries.
7. **Before any source investigation or Outcome Brief** for an in-scope request, complete steps 1–6
   and invoke [`$oracle-intake`](../../oracle-intake/SKILL.md). "First investigation", "preliminary" and
   "read-only" requests are intake work, not a controller-only phase. Do not defer these reads or the
   role invocation until answers arrive or a later turn. If a required read or invocation is unavailable,
   stop and report the blocker instead of producing a substitute brief, axes or interview questions.
   A substitute brief is one built from guessed sources; a brief built from the request text (`S1`)
   is intake work. An empty repository or no code in Design-only is recorded as `no code observation`
   and never blocks intake or the Draft ([common](common.md#the-request-text-is-s1)).

## Dispatch ordering

Before dispatching any write-capable sibling, classify the whole currently requested scope: touched
files, shared state owner, effects and the Oracle slices they belong to. With overlap or unknown ownership,
group the work under one approved Oracle or finish one slice before starting the next; task numbers do
not establish independence. The pre-lock hook observes session-wide activation, not per-task permissions,
so even disjoint paths in one activated session are not automatically safe to dispatch as plain writers.
If further Oracle work appears later, join already-running writers before activating another slice;
preserve their changes and evidence, then reassess scope. If activation already occurred, respect the deny
and resolve the authorized workflow rather than retrying through shell writes, deleting `.ai`, or opening
a new session as a bypass. A scope description is not a write authorization or a replacement for lock/RED.

## Mode selection and explicit role invocation

Design-only is the default. Delivery requires an explicit implementation/self-verification/review request.
At entry or resume read current disk state. Read [controller procedure](roles/controller.md)
when coordinating the selected stages; read only current-step dependencies, not all future role procedures.
Its Formal coordination runs six phases, each with one command and at most one user touchpoint:

1. Intake: explicitly load and invoke [`$oracle-intake`](../../oracle-intake/SKILL.md) for sources, Outcome
   Brief, risk/capability and Space discovery. Its first response's actual `yes`
   ([first response](common.md#first-response--one-message-one-confirmation)) confirms axes and
   source-open cells before any model. Missing/unsupported sources follow common routing.
2. Model: explicitly load and invoke [`$oracle-author`](../../oracle-author/SKILL.md) after source/axis
   prerequisites. First apply common's convergent planning: settle scope and check the highest-risk premise
   before expensive authoring. Controller owns stage intent.
3. Card review and lock: explicitly load and invoke [`$oracle-review`](../../oracle-review/SKILL.md) in the
   required independent contexts; same-context switching is not independence. Each card review gets at
   most 2 rounds per revision; round 2 only confirms round 1's repairs
   ([budget](card/card-format.md#review-round-budget--at-most-2)). There is no round 3.
   Obtain human confirmation (common's pre-authorized approval counts), then lock through the existing scripts.
   No lock, target tests, production or dependency edits before confirmation.
   Design-only ends ORACLE_READY, NEEDS_DECISION or tool-failure FAIL. Write/execute no consumer tests or production;
   the author's temporary pre-lock sweep report ([bend-cross-verification](bend-cross-verification.md)) is not one.
4. RED, explicit Delivery only: explicitly load and invoke `$test` on entry and immediately before target test
   writes; if it cannot be invoked, FAIL. `$test` owns test writing/judgment; its standalone Low exemption never
   waives this Oracle run's rules. Review the Formal adapter in `adapter-pre-red` mode before accepting RED
   ([delivery/red](delivery/red.md)); this is not a Delivery review receipt or a new ledger state.
5. GREEN: only after accepted VALID_RED, explicitly load and invoke [`$oracle-implement`](../../oracle-implement/SKILL.md)
   for scoped production changes. ALREADY_SATISFIED is zero-production verification. Return harness work to `$test`.
6. Review and close: after accepted IMPLEMENTED_GREEN invoke `$oracle-author` for applicable discovery closure and `$oracle-review` for
   independent delivery review. Before final reporting read [reporting](roles/reporting.md),
   perform its four artifact-backed checks and report the actual ledger state with runIds, not role claims.

## Controller authority and stop/resume

Only existing scripts advance stages/ledger state. The controller owns transition intent and acceptance
readback, human questions/approval, receipts, evidence freshness and truthful final reporting.
Specialist returns are artifacts/findings, never approval, a fabricated runId or permission to bypass a gate.
Direct invocation with missing prerequisites returns here. Fresh specialists read their own dependencies.
After init, on resume and after each accepted transition follow the fix lines of the
`guide --dir <dir> --to <target>` step runs when the phase line names it.

Use common.md's Feedback routing and Delivery's shared budgets: policy 2, harness 2, product 3, not per skill.
Policy unresolved after init needs structured NEEDS_DECISION and a real transition/runId, even if the user
forbids questions or card revision. Recording it neither reopens nor edits the locked card.
Before init preserve decision/evidence without inventing a runId. Impossible judgment is FAIL.

Only when a graph-orchestrated loop is explicitly requested, load and invoke `$agent-graph-engineering`
and read [`graph-orchestration.md`](graph-orchestration.md) in full before its bundled workflow.
Screenshot comparison and direct browser QA run only on explicit request, by invoking the separate
`$frontend-visual-qa` skill by name. No new browser completion state is introduced.
Optional frontend-system-design references remain implementation options, never policy or replacement control.
