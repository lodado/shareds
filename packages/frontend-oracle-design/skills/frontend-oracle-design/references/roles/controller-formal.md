# Formal-only controller stage coordination

Controller-only procedure. Specialists load their own role procedures, not this whole sequence.
The core entry owns scope and mode. Common prohibitions apply throughout. At each stage re-read disk.

## Phases

Drive the run with `oracle-step.mjs --dir <dir>` and do what its last line, `NEXT FOR YOU:`, says. Before
the lock it checks the files as they are; after it, it runs the mechanical next command (red, green, exec,
close, guide, report) with every argument filled. It stops for a file to write, a reviewer to dispatch, or
the user's approval or decision.

Six phases group the stage and Delivery states: a view, not new states, budgets or gates. Start each
Progress message (common's table) and every answer to a progress question with the line from
`oracle-stage.mjs status --dir <dir> --brief` before init or `oracle-run.mjs status --dir <dir> --brief`
after it (`guide` opens with the same phase): `phase N/6 <name> · next: <command>`, then the newly
established fact. Save each review's return unchanged where step names it.
Where the host sets effort per dispatch (Claude Code's Agent `effort`), cap execution roles (a worker
running given commands, packet assembly, a repair spelled out by exact findings) at `high`, never above
the session's; author, analyst, every reviewer and the blind mapper keep the session's effort and their
own model rules (subagent-review, discovery).

A refusal prints its code and next step and advances nothing, nor does a role return; never edit state,
evidence or stage.json, or relock, to pass one.
Use common's feedback classifications and Delivery's shared policy 2, harness 2, product 3 budgets,
never per role: `init` sets the caps and `oracle-run.mjs` reads each spend off the ledger (a resume after
NEEDS_DECISION, a new test binding after VALID_RED, a failing production state), so no command spends one
and the same change never counts twice. Harness repairs remain
within $test allowances. Exhaustion is FAIL with the last actual failure, its decision preserved.
Check confirmation-lock on revision mismatch. In Delivery only, check delivery/ledger before an uncertain
command or scope-changing recovery; delivery/red before test/harness correction on RED-to-GREEN;
delivery/green-review before reporting completion with missing or failed evidence. These are existing
load conditions, not an extra approval or delivery state. Proposed guardrail seeds are eval metadata,
not runtime instructions. For reusable execution observations, read
[`card/retro-metrics.md`](../card/retro-metrics.md) for candidate review after immediate existing feedback
routing. Load it after lock for escapes and REVIEW_VERIFIED metrics, never while writing the card.
None of those metrics/candidates is a gate. Low follows the same applicable conditions.

## 1. Intake

States: no stage record. Command: $oracle-intake, then `oracle-step.mjs`. Touchpoint: the first
`yes`. Refusal: ask for a source the user has not given, never assume it; hold only separable blocked scope.

Invoke $oracle-intake for approved source investigation and risk/capability discovery, then send the
[first response](../common.md#first-response--one-message-one-confirmation): proposed axes, a provisional
Draft and Open questions under one confirmation, whose actual `yes` precedes any model authoring.
Intake and authoring are not independence roles: below High run them in this controller context
instead of fresh subagents, so references load once. Fresh contexts stay required only where an
independence rule names them (analyst, card review, source-aware, delivery review).

## 2. Model

States: DISCOVERING, MODELED, CHECKED, derived from the files. Command: `oracle-step.mjs --dir <dir>`
(`--check` lists every failing node and changes nothing in the oracle directory). Touchpoint: none. Refusal: step names the first
failing node's issues; fix them and rerun, editing is free and nothing rewinds. The same issues on a third
edited state stop it (NEEDS_DECISION): report them to the user.

Invoke $oracle-author for the source-bound model package, checks and projected Draft with all manual
duties; step projects the card once the package and the model pass. The model check passes
at once on a receipt when the same package, Bend files, registered sources, harness, node and Bend
passed it before (`ORACLE_LINT_CACHE=off` turns receipts off).
It also runs `prove` and `laws` ([bend-proof](../bend-proof.md) forms, Nat and List cut at the bound):
`open`, `failed`, `unsafe`, a false relation cell or a trace law its own `run` breaks from a reachable state
stops it; free cells, unreached counterexamples to induction and other law forms are a report, undecided
when an installed Bend cannot run. Without `PROOF.bend` the proof is not judged; the receipt keys it too.

The model analyst is dispatched when step names it, in a fresh context that is never the author's, and that same
context is continued for its translation review ([discovery](../discovery.md)), not redispatched.
Send every repair of the same revision (review findings, lint or proof failures, a user answer) to
the author context that wrote the package, continued with only the findings and changed inputs
(SendMessage on Claude Code). It already holds its references and re-reads only changed run files.
Dispatch a fresh author only when that context is unavailable or for a new revision; its packet names
the run directory and the open findings. The Delivery test worker is continued the same way.

## 3. Card review and lock

States: DRAFTED. Command: `oracle-lock.mjs create`. Touchpoint: card approval, none under common's
pre-authorized approval. Refusal: `oracle-lock.mjs create` judges every node again on the current package,
Bend files, registered sources and card, refuses when one fails or a file changes while it judges, and only
the scripts write stage.json. The lock still runs card lint itself, so a hand-written
record skips no check; repair a refusal in the author context.

1. Before showing the Draft, run the cold-read gate by invoking $oracle-review in a context-free context
   with card bytes alone first: one card review reads the one input folder step writes outside the run
   directory, the `oracle-review-view.mjs card` reading view plus a byte copy of the card before the rest.
   Apply five questions per row, collapse to one root and its cheapest first nail. Drive that nail and
   record root, falsifying observation and result in journal.md. With the cold read written, the same
   reviewer goes on to run the reverse two-sample read once per card on the impossible dispositions step
   extracts with `scripts/oracle-verify.mjs card --ir`, the witness falsifier table from
   [`card/interaction-sweep.md`](../card/interaction-sweep.md) and the `oracle-adequacy.mjs explore-input`
   file: "one of these is wrong: build the counterexample". One JSON returns both. A disagreement becomes
   needs-decision only when every row lets through a behavior the approved sources forbid or never
   decided; record any other as a proposal. The review role owns the reviewer procedure; do not load it here.
2. When [`card/policy-sources.md`](../card/policy-sources.md)'s trigger applies, obtain a source-aware fresh
   review before the Draft is shown (pre-authorized: before the lock), so its findings become Open questions:
   verbatim user messages/approved excerpts against every affected card decision,
   linked P/O/D, Open question or justified N/A. It supplements, never replaces, the card review.
   If independence is unavailable, record only the contract-permitted
   same-context fallback and limitation. Never claim this satisfies a required independent High review.
   Step names it with the file its return is saved as; once that return is saved it counts rounds.
3. Each review kind gets at most 2 rounds per revision: a return saved for a new input digest; the same
   input saved again adds none. A round-2 confirmation continues the
   round-1 reviewer the same way, with only its finding IDs and the repair diff.
4. Show existing revisions as semantic delta and new cards in full with Open questions. Every surviving
   question carries candidate rows and recommendation, so a single `yes` both answers and confirms.
   `yes` adopts every recommendation and approves the card; `Q<n>=<option>` swaps one option and
   re-confirms only if a new needs-decision appears. Record approval location in User Confirmation.
   A change request requires Draft repair and re-confirmation; no answer means NEEDS_DECISION.
   This re-presents the projected card after proof; only proof counterexamples, new axes or a changed
   meaning since the provisional Draft need a new question. Under common's pre-authorized approval,
   record it without re-presenting when none of them appeared.
5. Read [`card/confirmation-lock.md`](../card/confirmation-lock.md) before confirmation/lock/init.
   Mine the touched files with `scripts/oracle-verify.mjs card --oracle <card> --path <touched files>` (the lock's
   lint does not); `--case-space` is structural preapproval checking only, never user approval. After it
   passes, lock through `scripts/oracle-lock.mjs`. The revision lock is auto-verified immediately before each stage.
   Never relock to pass a mismatch. A policy change is a new revision, never a locked-file edit.

Before confirmation: no lock, no target tests, no production or dependency edits. Only named pre-lock
checks run: prove, space, derive, adequacy check, `card --draft`,
`card --repo-policies`, cross-check, --case-space, frame dispositions and the author's temporary pre-lock
sweep report ([bend-cross-verification](../bend-cross-verification.md)). Model checks and that report are
not consumer tests or product VALID_RED. Tool preparation follows mandatory verification and target
dependency rules.

If Delivery was known from the start, defer the lock until architecture/backend source decisions are
made. Conditional architecture-contract/backend reads belong to the deciding role. Design Intent never
proceeds without recorded Design Change Confirmation. After all outcome-changing architecture/backend
decisions and local source finalization, run that `--path` lint, then create the final lock once with the same source
set. Never extend an existing lock. Confirm and lock a new revision when the source set changes.

## 4. RED

States: ORACLE_READY. Command: `oracle-run.mjs init --scan-root <scan-root> --required-label <repo-check>`,
then `oracle-run.mjs red`. Touchpoint: none. Refusal: follow its next step and delivery/red; tests and
harness stay free to fix until VALID_RED.

Right after entering Delivery, explicitly load and invoke the installed `$test` skill by name and read
[`delivery/ledger.md`](../delivery/ledger.md). Immediately before writing test files, explicitly load
and invoke the `$test` skill by name; if it cannot be invoked, FAIL. Invoking a file is not a skill call.
The test skill owns test writing/judgment. Standalone Low/card exemptions cannot waive an Oracle run.
`init` adds the stack labels the locked card implies (`LABEL_AUTO`); pin the actual target
verification commands with `--required-label`. No label alone proves the evidence.

After init or on resume, run `oracle-run.mjs guide --dir <dir>`, pick a legal target and request
`guide --dir <dir> --to <target>`. Use the current-step guide at entry, resume, and after each transition,
reading its missing primary references with dependencies (reviewer reads stay in the independent
context). Guide is read-only advice, not approval, PASS or transition.
Transition rechecks every gate. Read accepted status after composite commands so an already accepted
target is not recorded twice. The controller owns transition intent, not a second execution engine.

Before tests/RED read [`delivery/red.md`](../delivery/red.md). TDD default: ORACLE_READY → write tests → adapter-pre-red review → run tests
→ `oracle-run.mjs transition --to VALID_RED` → classify VALID_RED. No production writing/editing before
accepted product RED. The ORACLE_READY → IMPLEMENTED_GREEN ALREADY_SATISFIED path is zero-production
verification and approves no production edits.
The adapter-pre-red check runs `$oracle-review` on the locked Terms, adapter/test bytes and inspected
product paths, not a post-GREEN packet; its findings and input identities go in the journal, never a
review-receipt or transition. Follow delivery/red for changed inputs and missing targets.

On Claude Code the PreToolUse hook denies premature production writes, TEST_BEFORE_LOCK test writes
without a lock from that activated session, and weakening tokens in tests after VALID_RED. The transition
gate stays authority and hosts without hooks rely on it alone. The hook records reviewer subagent returns
in host-receipts.jsonl, and Stop checks the final report against the ledger. Hook absence is not an exemption.
When delegating to a subagent, give it the absolute path of the Oracle's worktree, this skill's `scripts/`
directory and every file it may write, inside the Oracle's scan root. The hook finds the lock from the cwd and the target
file's ancestors, so a relative path or another worktree's cwd reads as no lock. Never route around a deny
with shell writes.

## 5. GREEN

States: VALID_RED. Command: `oracle-run.mjs green`. Touchpoint: none. Refusal: a product repair spends
`product`; a test or harness change needs a `harness` spend and a new reported RED→GREEN.

After VALID_RED dispatch $oracle-implement with the current lock/snapshot and scoped task.
Implementation decisions and bounded simplification live in that role. An optional fresh
implementation context uses the existing
[task-scoped worker path](../delivery/ledger.md#optional-task-scoped-implementation-worker), independent
of graph opt-in and never replacing review/mandatory verification.

Judgment commands run through `scripts/oracle-run.mjs exec`. Results are recorded in the append-only
ledger and reports cite runIds instead of free-form claims. Never report an execution that is not in
the ledger as passing; `red`/`green` bundle exec and transition into one call. Independent judgment execs and read-only investigation run as parallel
tool calls in one message, not separate turns, on supported stable inputs. Approval, RED and adjudication
stay serial. Delivery transitions are recorded only via `scripts/oracle-run.mjs transition` or composite
commands invoking that same transition machinery. Iteration budgets are read off the ledger.
Card-row evidence goes into evidence.json and is checked against actual run results with
`scripts/oracle-verify.mjs evidence`. Record IMPLEMENTED_GREEN exactly once; resume from it, never record it again.

## 6. Review and close

States: IMPLEMENTED_GREEN and the end states. Command: `oracle-run.mjs close`. Touchpoint: NEEDS_DECISION
only. Refusal: `CLOSE_PENDING` names the dispatch and flags to add, then rerun; any other code is that
step's own gate.

Read [`delivery/green-review.md`](../delivery/green-review.md) for self-feedback/GREEN.
Re-read [`mandatory-verification.md`](../mandatory-verification.md) and
[`bend-cross-verification.md`](../bend-cross-verification.md) before verification and review.
After GREEN use the review target's guide for High mutation kill/revert/re-GREEN and post-GREEN reruns.
Before contextual packet collection and independent review after implementation/test verification,
read [`subagent-review.md`](../subagent-review.md) for --context selection and snapshot binding.
Close with `oracle-run.mjs close --dir <dir> --packet <packet> --decision
<decision> --review-point <point> --run <runId> --evidence <evidence> --check-report <report>` (High adds
`--mutation-run`·`--mutation-row`; a blind mapping `--blind-input`). In order, each with its own gate, it
runs `oracle-run.mjs review-packet` (only matching criteria via `--review-point`) when the packet is
absent, `review-receipt` for each unbound output naming this packet, the REVIEW_VERIFIED transition
(PARTIAL_VERIFIED with an open hold) and the report check. It never writes reviewer output; the
dispatches are $oracle-review in required fresh contexts and the blind mapper. Reviewers return findings only; no reviewer approves its own return. Never paste criteria
into prompts or replace raw artifacts with a summary. Supporting context never replaces common inputs,
five-axis judgments or independent reviews. Low and Design-only retain mandatory verification;
contextual artifacts remain conditional by mode.

Delivery review runs at most 2 rounds per lock revision. Re-run stack/repo checks on the current snapshot
after findings, and give round 2 a new `--packet` path; the `--findings` that build it are round 1's, so
rerun with round 2's returns in their place. Round 2 continues the round-1 reviewers like card review.
Below High, when every round-1 claim is a cited product defect whose reviewer wrote its reproduction,
written with `reproduce` and failing before the repair, skip that dispatch and close round 2 with
`--closure` (delivery/green-review). There is no round 3. Copy the improvement proposals `close` prints
into the report; repaired round-2 blockers close as PARTIAL_VERIFIED with the repair unreviewed.
Run each reviewer's "reproduction not run" command once, as a job, on the final snapshot; a failure joins
that reviewer's findings.

With a model package, dispatch $oracle-author for conditional discovery closure after IMPLEMENTED_GREEN
and again before final report, and at the anomaly/operator triggers in its entry. Verdict/residual risks
are evidence, not another state or policy decision. Changed policy requires human decision/new revision.
`oracle-run.mjs review-brief` is a read-only evidence index that approves and advances nothing
(delivery/green-review); lead attention briefs with outcome, evidence and decisions.

For RELATIONAL/JUDGMENT rows or UI-shaping interactions, leave one browser journey using an existing
repo/installed tool. No tool or user-declined QA without locked source-backed N/A blocks REVIEW_VERIFIED,
not implementation: stop at IMPLEMENTED_GREEN. The only certifiable visual PASS producer is a
trusted `oracle-run --adapter node-test` run whose locked test drives Playwright and emits schema-v3.
A standalone Playwright adapter is unsupported. Browser MCP observations are pending/non-verifying, never PASS.

| State             | Meaning                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| IMPLEMENTED_GREEN | card tests and required repo verification actually passed                   |
| REVIEW_VERIFIED   | tests and required verification re-passed after independent review findings |
| PARTIAL_VERIFIED  | the same review passed over the locked scope while a hold is still open     |
| NEEDS_DECISION    | outcome-changing policy unresolved, print the current card and questions    |
| FAIL              | judgment impossible: environment/harness/tool failure or budget exhausted   |

Normal Delivery completion is REVIEW_VERIFIED; a resumed visual-pending run completes the evidence, then
review. With an open hold REVIEW_VERIFIED is refused (HOLDS_OPEN):
finish at PARTIAL_VERIFIED after its actual review, report holds and write no test or production code for
held rows. Resolve them in a new revision (NEEDS_DECISION → ORACLE_READY) adding only those rows.
Unresolved policy after init follows the core entry's stop/resume rules: a structured decision and a real
NEEDS_DECISION transition/runId. Impossible judgment is actual-cause FAIL.
