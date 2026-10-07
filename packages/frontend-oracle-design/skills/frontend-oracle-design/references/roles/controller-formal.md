# Formal-only controller stage coordination

Controller-only procedure. Specialists load their own role procedures, not this whole sequence.
The core entry owns scope and mode. Common prohibitions apply throughout. At each stage re-read disk.

## Draft, review, confirmation and lock

1. Invoke $oracle-intake for approved source investigation and risk/capability discovery, then send the
   first response: proposed axes, a provisional Draft on their recommendations and Open questions under one
   confirmation ([first response](../common.md#first-response--one-message-one-confirmation)). Obtain that
   actual `yes` (axis confirmation) before dispatching any model authoring. A source the user cannot provide is not an agent assumption. Hold only separable blocked scope.
2. Invoke $oracle-author for the source-bound model package, independent analyst inputs, checks and projected
   Draft with all manual duties. Walk the stages with `scripts/oracle-stage.mjs`: `begin`, then
   `advance --to MODELED | CHECKED | DRAFTED` once each gate passes. Read acceptance back.
   `oracle-lock.mjs create` refuses a package oracle that is not at DRAFTED on the same package bytes,
   and only the stage runtime writes stage.json. The lock still runs card lint itself, so a hand-written
   record skips no check. A role return does not advance a stage.
   Send every repair of the same revision (review findings, lint or proof failures, a user answer) to
   the author context that wrote the package, continued with only the findings and changed inputs
   (SendMessage on Claude Code). It already holds its references and re-reads only changed run files.
   Dispatch a fresh author only when that context is unavailable or for a new revision; its packet names
   the run directory and the open findings. The Delivery test worker is continued the same way.
   Reviewers and analysts keep their own independence rules.
3. Before showing the Draft, run the cold-read gate by invoking $oracle-review in a context-free context
   with card bytes alone. Apply five questions per row, collapse to one root and its cheapest first nail.
   Drive that nail and record root, falsifying observation and result in journal.md. In the same gate,
   run the reverse two-sample read once per card: extract impossible dispositions with
   `scripts/oracle-verify.mjs card --ir`, hand them with the witness falsifier table from
   [`card/interaction-sweep.md`](../card/interaction-sweep.md) to a second context-free reviewer.
   Frame it as "one of these is wrong: build the counterexample". Promote every disagreement to needs-decision.
   The matching reviewer procedure is owned by the review role, not loaded into this controller's context.
4. When [`card/policy-sources.md`](../card/policy-sources.md)'s trigger applies, obtain a source-aware fresh
   review before approval: verbatim user messages/approved excerpts against every affected card decision,
   linked P/O/D, Open question or justified N/A. It supplements, never replaces, card-only cold-read and
   reverse-impossible review. If independence is unavailable, record only the contract-permitted
   same-context fallback and limitation. Never claim this satisfies a required independent High review.
5. Show existing revisions as semantic delta and new cards in full with Open questions. Every surviving
   question carries candidate rows and recommendation, so a single `yes` both answers and confirms.
   `yes` adopts every recommendation and approves the card; `Q<n>=<option>` swaps one option and
   re-confirms only if a new needs-decision appears. Record approval location in User Confirmation.
   A change request requires Draft repair and re-confirmation; no answer means NEEDS_DECISION.
   This re-presents the projected card after proof; only proof counterexamples, new axes or a changed
   meaning since the provisional Draft need a new question. Questions go ahead of the Draft only when
   their answer changes the lane, the actor or the side-effect class; discovery axes ride the Draft.
6. Read [`card/confirmation-lock.md`](../card/confirmation-lock.md) before confirmation/lock/init.
   Lint with `scripts/oracle-verify.mjs card --path <touched files>`; `--case-space` is structural
   preapproval checking only, never user approval. After card lint passes, lock through
   `scripts/oracle-lock.mjs`. The revision lock is auto-verified immediately before each stage.
   Never relock to pass a mismatch. A policy change is a new revision, never a locked-file edit.

Before confirmation: no lock, no target tests, no production or dependency edits. Only named pre-lock
checks run: prove, space, derive, adequacy check, `card --repo-policies`, cross-check, --case-space and
frame dispositions. Model checks are not consumer tests or product VALID_RED.
Design-only ends ORACLE_READY, NEEDS_DECISION or tool-failure FAIL, with no test or production writes
and no consumer test execution. Tool preparation follows mandatory verification and target dependency rules.

If Delivery was known from the start, defer the lock until architecture/backend source decisions are
made. Conditional architecture-contract/backend reads belong to the deciding role. Design Intent never
proceeds without recorded Design Change Confirmation. After all outcome-changing architecture/backend
decisions and local source finalization, card lint then create the final lock once with the same source
set. Never extend an existing lock. Confirm and lock a new revision when the source set changes.

## Delivery and evidence

Right after entering Delivery, explicitly load and invoke the installed `$test` skill by name and read
[`delivery/ledger.md`](../delivery/ledger.md). Immediately before writing test files, explicitly load
and invoke the `$test` skill by name; if it cannot be invoked, FAIL. Invoking a file is not a skill call.
The test skill owns test writing/judgment. Standalone Low/card exemptions cannot waive an Oracle run.
Pin real required command labels with `oracle-run.mjs init --required-label`, including applicable
mandatory stack labels and actual target verification commands. No label alone proves the evidence.

After init or on resume, run `oracle-run.mjs guide --dir <dir>`, select a legal target and request
`guide --dir <dir> --to <target>`. Use the current-step guide at entry, resume, and after each transition.
Read missing primary references with dependencies. Reviewer reads belong in the independent context.
Do not load every future step. Guide is read-only advice, not approval, PASS or transition.
Transition rechecks every gate, and rejection recovery remains in delivery/ledger. Never edit state or
evidence to bypass a gate. Read accepted status after composite commands so an already accepted target
is not recorded twice. The controller owns transition intent, not a second execution engine.

Before tests/RED read [`delivery/red.md`](../delivery/red.md). TDD default: ORACLE_READY → write/run tests
→ `oracle-run.mjs transition --to VALID_RED` → classify VALID_RED. No production writing/editing before
accepted product RED. The ORACLE_READY → IMPLEMENTED_GREEN ALREADY_SATISFIED path is zero-production
verification and approves no production edits. After VALID_RED dispatch $oracle-implement with the current
lock/snapshot and scoped task. Implementation decisions and bounded simplification live in that role.
An optional fresh implementation context uses the existing
[task-scoped worker path](../delivery/ledger.md#optional-task-scoped-implementation-worker), independent
of graph opt-in and never replacing review/mandatory verification.

Judgment commands run through `scripts/oracle-run.mjs exec`. Results are recorded in the append-only
ledger and reports cite runIds instead of free-form claims. Never report an execution that is not in
the ledger as passing. When transition immediately follows execution, red/green subcommands bundle exec
and transition into one call. Independent judgment execs and read-only investigation run as parallel
tool calls in one message, not separate turns, on supported stable inputs. Approval, RED and adjudication
stay serial. Delivery transitions are recorded only via `scripts/oracle-run.mjs transition` or composite
commands invoking that same transition machinery. Iteration budgets are counted by `oracle-run.mjs budget`.
Card-row evidence goes into evidence.json and is checked against actual run results with
`scripts/oracle-verify.mjs evidence`. Record IMPLEMENTED_GREEN exactly once; resume from it, never record it again.

On Claude Code the PreToolUse hook denies premature production writes, TEST_BEFORE_LOCK test writes
without a lock from that activated session, and weakening tokens in tests after VALID_RED. The transition
gate stays authority and hosts without hooks rely on it alone. The hook records reviewer subagent returns
in host-receipts.jsonl, and Stop checks the final report against the ledger. Hook absence is not an exemption.

When delegating to a subagent, give it the absolute path of the Oracle's worktree and the absolute path of
every file it may write, inside the Oracle's scan root. The hook finds the lock from the cwd and the target
file's ancestors, so a relative path or another worktree's cwd reads as no lock. Never route around a deny
with shell writes.

## GREEN and independent delivery review

Read [`delivery/green-review.md`](../delivery/green-review.md) for self-feedback/GREEN.
Re-read [`mandatory-verification.md`](../mandatory-verification.md) and
[`bend-cross-verification.md`](../bend-cross-verification.md) before verification and review.
After GREEN use the review target's guide for High mutation kill/revert/re-GREEN, independent review,
Controller-issued review-receipt records and post-GREEN reruns. Reviewers return findings only.
Before contextual packet collection and independent review after implementation/test verification,
read [`subagent-review.md`](../subagent-review.md) for --context selection and snapshot binding.
Generate `oracle-run.mjs review-packet` with only matching criteria reference files via
`review-packet --review-point`; never paste criteria into prompts or replace raw artifacts with a summary.
Supporting context never replaces common inputs, five-axis judgments or independent reviews.
Low and Design-only retain mandatory verification; contextual artifacts remain conditional by mode.
Dispatch $oracle-review in required fresh contexts, issue review-receipt only from actual returned evidence,
and re-run stack/repo checks on the current snapshot after findings. No reviewer approves its own return.

With a model package, dispatch $oracle-author for conditional discovery closure after IMPLEMENTED_GREEN
and again before final report, and at the anomaly/operator triggers in its entry. Verdict/residual risks
are evidence, not another state or policy decision. Changed policy requires human decision/new revision.
After GREEN, oracle-run.mjs review-brief derives a read-only evidence index from current packet and
ledger-bound findings. It never approves policy, proves usability or advances delivery. Read its command
and limitations in delivery/green-review. Lead attention briefs with outcome, evidence and decisions.

For RELATIONAL/JUDGMENT rows or UI-shaping interactions, leave one browser journey using an existing
repo/installed tool. No tool or user-declined QA without locked source-backed N/A blocks REVIEW_VERIFIED,
not implementation: stop at IMPLEMENTED_GREEN. Screenshot comparison and direct browser QA run only on
explicit request by invoking $frontend-visual-qa by name. The only certifiable visual PASS producer is a
trusted `oracle-run --adapter node-test` run whose locked test drives Playwright and emits schema-v3.
A standalone Playwright adapter is unsupported. Browser MCP observations are pending/non-verifying, never PASS.

## Recovery and actual terminal states

Use common's feedback classifications and shared policy 2, harness 2, product 3 budgets, never per role.
Harness repairs remain within $test allowances. Exhaustion is FAIL with the last actual failure.
Check confirmation-lock on revision mismatch. In Delivery only, check delivery/ledger before an uncertain
command or scope-changing recovery; delivery/red before test/harness correction on RED-to-GREEN;
delivery/green-review before reporting completion with missing or failed evidence. These are existing
load conditions, not an extra approval or delivery state. Proposed guardrail seeds are eval metadata,
not runtime instructions. For reusable execution observations, read
[`card/retro-metrics.md`](../card/retro-metrics.md) for candidate review after immediate existing feedback
routing. Load it after lock for escapes and REVIEW_VERIFIED metrics, never while writing the card.
None of those metrics/candidates is a gate. Low follows the same applicable conditions.

| State             | Meaning                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| IMPLEMENTED_GREEN | card tests and required repo verification actually passed                   |
| REVIEW_VERIFIED   | tests and required verification re-passed after independent review findings |
| PARTIAL_VERIFIED  | the same review passed over the locked scope while a hold is still open     |
| NEEDS_DECISION    | outcome-changing policy unresolved, print the current card and questions    |
| FAIL              | judgment impossible: environment/harness/tool failure or budget exhausted   |

Normal Delivery completion is REVIEW_VERIFIED. Visual pending or declined without source-backed N/A
ends resumably at IMPLEMENTED_GREEN. On resume complete pending visual evidence then review, never call
this intermediate state REVIEW_VERIFIED. With an open hold REVIEW_VERIFIED is refused (HOLDS_OPEN):
finish at PARTIAL_VERIFIED after its actual review, report holds and write no test or production code for
held rows. Resolve them in a new revision (NEEDS_DECISION → ORACLE_READY) adding only those rows.
Unresolved policy after init requires a structured decision and NEEDS_DECISION transition/runId even if
the user forbids revising the card or asking questions. Recording it neither reopens nor edits the locked
card. Before init preserve decision/evidence without inventing a runId. Impossible judgment is actual-cause FAIL.
