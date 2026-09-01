---
name: frontend-oracle-design
description: Use when the user explicitly requests an Oracle contract or graph-orchestrated delivery loop, or when medium/high-risk frontend behavior or approved visual intent has unresolved policy that must be locked before implementation. Typical cases are mutations, async ordering, duplicate submits, destructive actions, payments, permissions, or data-integrity boundaries. Do not auto-invoke for low-risk copy/token/isolated CSS, straightforward regression fixes inside already approved behavior, screenshot/browser QA, or FSD folder advice alone.
---

# Frontend Oracle Design

Frontend Oracle is not an implementation generator. It is a delivery/evidence harness that preserves
approved frontend behavior and visual intent as `Outcome Brief → Source Registry → contract rows →
revision lock → ledger state transitions`. References own the detailed rules; this file is the
operator map.

## Entry — always first

1. **The first tool call is a Read of exactly one lane entry node.** If risk is Low, read
   [`lanes/low-fast-path.md`](references/lanes/low-fast-path.md); otherwise read
   [`common.md`](references/common.md). Repo exploration, answer drafting, any other tool call, and
   any other reference load all come after it.
2. **Print the lane header as the first line of the response.** Writing body text without the
   header is a violation.

   ```text
   risk=<Low|Medium|High> lane=<low-fast-path|oracle> nodes=[node ids actually Read]
   ```

   `nodes` lists only the nodes **actually Read** — never nodes you merely plan to read.

3. Requests that only **explain in words** a plan, design, file structure, or types are inside this
   procedure too. "Already known", "the spec is detailed enough", and "no code changes" are not
   skip reasons.

Lane routing:

- **Low fast path** loads [`lanes/low-fast-path.md`](references/lanes/low-fast-path.md) alone and
  loads no other reference nodes. It performs only existing repo verification — no card, lock, or
  run artifacts. A policy question, a new contract, an architecture/public API or state-transition
  decision, or visual identity work disqualifies Low immediately and escalates to the Oracle lane.
- An explicit Oracle request or Medium/High starts from [`common.md`](references/common.md). Risk
  taxonomy, authority priority, policy sources, and feedback routing are canonical in `common.md`.
- For requests that only need general architecture or FSD (Feature-Sliced Design) folder advice, do
  not auto-invoke this skill on its own.

## Invariants

### Document-driven progress

- At the start of each stage, re-read disk, not conversation memory. `journal.md` is append-only
  stage rationale and is not duplicated into `implementation-decision.md`. The journal is neither a
  policy source nor a lock target; when it conflicts with the card, the card wins.

### TDD and judgment tools

- Oracle owns only the `Outcome Brief`, `Source Registry`, approved contracts, revision locks, and
  state transitions. `$test` owns test writing and judgment, `$frontend-visual-qa` owns screenshots
  and direct browser runs, `$frontend-system-design` owns per-feature implementation options.
- Production code, existing tests, and browser observation are investigation evidence, not policy
  sources. Unresolved policy is `POLICY_GAP` → `NEEDS_DECISION`.
- New cards and semantically changed revisions are re-confirmed with the user via the Draft Oracle
  and its delta. Before that confirmation: no lint, lock, tests, or production edits. A policy
  change is a new revision, never an in-place edit of a locked file.
- Lint the card with `scripts/oracle-verify.mjs card`, then lock it with `scripts/oracle-lock.mjs`.
  The revision lock is auto-verified immediately before each stage. No relocking to pass a
  mismatch.
- TDD default: `ORACLE_READY` → write and run tests → record
  `oracle-run.mjs transition --to VALID_RED` → classify `VALID_RED`; no production writing or
  editing before that. Immediately before writing test files, explicitly load and invoke the
  `$test` skill by name; if it cannot be invoked, `FAIL`.
- Judgment commands run through `scripts/oracle-run.mjs exec`. Results are recorded in the
  append-only ledger and reports cite runIds instead of free-form claims. Never report an execution
  that is not in the ledger as passing. When a transition immediately follows an execution, the
  `red`·`green` subcommands bundle exec and transition into one call; independent judgment execs
  and read-only investigation run as parallel tool calls in one message, not separate turns.
- Delivery state transitions are recorded only via `scripts/oracle-run.mjs transition`. Iteration
  budgets are counted by `oracle-run.mjs budget`. Card-row evidence goes into `evidence.json` and
  is checked against actual run results with `scripts/oracle-verify.mjs evidence`.
- Forbidden: weakening assertions, `test.skip`, arbitrary sleeps, adopting current browser behavior
  as the expected value, inventing states·transitions·policies not on the card.

## Reference loading — graph

References are nodes declared in [`reference-graph.json`](references/reference-graph.json), which
owns each node's `when` as the canonical load condition. The bullets below restate those conditions
because this file is what gets read at runtime — they are a projection of the graph, kept in sync by
`skill-contract.test.mjs`, not a duplicate to collapse.

A lane reads the same node set in the same order every run, and reading them as separate calls
changes the prompt prefix each time and loses the cache. `bundles/` holds those node sets pre-joined
in dependency-first order — `card-lane`, `delivery-lane`, `types-lane`, `frontend-lane` — generated
from the graph by `scripts/generate-reference-bundles.mjs`. Reading a bundle is optional and equals
reading its nodes: same bytes, one call, stable prefix. When a base bundle's nodes are already in
this context, prefer the matching `-continued` continuation bundle (`delivery-lane-continued`,
`types-lane-continued`): it delivers the same lane node set minus the overlap already read, and its
header names the assumed nodes. Base plus continuation equals the full lane read once; without the
base in context, read the full lane bundle instead. It is a delivery mechanism, never an
authority, so **the lane header still reports the node ids, not the bundle id**, and a node outside
any bundle is still read directly. Never hand-edit `bundles/` — edit the reference and regenerate;
`--check` fails the build on drift.

Read `when` as the decision point, not the deliverable stage. If applicability is ambiguous, load.
Whether to skip a load is not a judgment call. The read instructions inlined into each step of
"Mode selection" own execution order; do not defer to this section to proceed through a step.

- Only when a graph-orchestrated delivery loop is explicitly requested: load and invoke the
  installed `$agent-graph-engineering` skill by name, read
  [`graph-orchestration.md`](references/graph-orchestration.md) in full, then execute the bundled
  workflow.
- Card writing: [`card/policy-sources.md`](references/card/policy-sources.md),
  [`card/risk-grill.md`](references/card/risk-grill.md), [`bva.md`](references/bva.md),
  [`card/card-format.md`](references/card/card-format.md),
  [`card/interaction-sweep.md`](references/card/interaction-sweep.md) — after drafting contract
  rows and before showing the Draft, the disposition sweep of new×inherited×runtime interactions,
  [`card/case-space.md`](references/card/case-space.md) — declaring the dimension space and
  dispositioning the machine-generated frames of `scripts/oracle-frames.mjs`,
  [`card/confirmation-lock.md`](references/card/confirmation-lock.md).
- Delivery: right after entering Delivery, explicitly load and invoke the installed `$test` skill
  by name; [`delivery/ledger.md`](references/delivery/ledger.md),
  [`delivery/red.md`](references/delivery/red.md),
  [`delivery/implementation-decision.md`](references/delivery/implementation-decision.md),
  [`delivery/green-review.md`](references/delivery/green-review.md),
  [`subagent-review.md`](references/subagent-review.md). Review criteria are not pasted into
  prompts — pass only the reference files matching the diff via `review-packet --review-point`.
- Implementation decisions: [`changeability.md`](references/changeability.md),
  [`frontend/authoring.md`](references/frontend/authoring.md),
  [`frontend/decisions.md`](references/frontend/decisions.md),
  [`frontend/quality.md`](references/frontend/quality.md). For React architecture boundary, state
  ownership, or public API changes:
  [`architecture-contract.md`](references/architecture-contract.md).
- Types and state: before async·ordering·duplicate-submit·retry·multi-step `O*` rows, or client
  state·exported Props·shared/package API·trust boundary type changes, read
  [`types/state-ladder.md`](references/types/state-ladder.md),
  [`types/authoring.md`](references/types/authoring.md),
  [`types/api-surface.md`](references/types/api-surface.md),
  [`frontend/decisions.md`](references/frontend/decisions.md). Read [`state-ladder.md`](references/types/state-ladder.md) together with [`frontend/decisions.md`](references/frontend/decisions.md).
  If an existing query·router·form owns the state, do not create a new `status` union.
- always with state-ladder during type work — loading unconditional, adoption via compiler witness packet gate →
  [`types/advanced-contracts.md`](references/types/advanced-contracts.md). Once per
  repo, or when tsconfig·TS version changes:
  [`references/type-environment.md`](references/type-environment.md).
- UI-shaping: before new UI, redesigns, or visible layout/palette/type/copy/motion/responsive/
  identity changes, read [`references/visual-design.md`](references/visual-design.md). Record the
  `behavior-only`·`local`·`identity-shaping` scope and the Design Change Confirmation. For
  `RELATIONAL`·`JUDGMENT` rows or UI-shaping interactions, leave one browser journey using an
  existing repo/installed tool. With no tool available or the user declined, and no locked
  source-backed N/A, the run can reach `IMPLEMENTED_GREEN` only and `REVIEW_VERIFIED` is blocked.
- Feature-Sliced Design repos (or approved adoption) + before proposing, designing, or reviewing
  FSD adoption or folder structure: [`references/fsd.md`](references/fsd.md). Before
  backend·full-stack·DB·data-access changes: [`backend.md`](references/backend.md). With a
  performance requirement or improvement claim:
  [`references/performance.md`](references/performance.md).
- Prefer the network test boundary the repo already uses. If MSW is installed or its adoption is
  approved, keep handlers and example data at the nearest owner — no root concentration. Never
  silently add test-only dependencies.
- If the `frontend-system-design` skill is installed, read only its references while keeping Oracle
  intake and control. Every choice is a policy candidate; anything that cannot be mapped to an
  approved source or user answer is `POLICY_GAP` → `NEEDS_DECISION`. Document recommendations are
  implementation options and never precede Oracle's orchestration.
- Hook Encapsulation only when the approved architecture chose `orchestration-only`. Existing
  equivalent rules first; no dependency installs or lint config changes.
- Screenshot comparison and direct browser QA run only on explicit request, by invoking the
  separate `$frontend-visual-qa` skill by name. This skill creates no separate browser completion
  state.
- The only producer that can turn a visual PASS into certifiable evidence for Oracle review is a
  trusted `oracle-run --adapter node-test` run whose locked test drives Playwright and emits a
  schema-v3 artifact. A standalone Playwright adapter is unsupported. Browser MCP may collect
  observation artifacts, but they are pending·non-verifying and never produce a PASS.

## Mode selection

### Design-only — default

When only cards, requirements, policy decisions, or test contracts are requested:

1. Read [`common.md`](references/common.md) and
   [`card/policy-sources.md`](references/card/policy-sources.md) → write the `Outcome Brief`.
   Without a KPI, invent no numbers.
2. Investigate approved specs·PRD·acceptance criteria·design system·Figma; pin the exact
   location·frame·version.
3. Classify sources as `product-policy`·`mandatory-constraint`·`project-constraint`·
   `implementation-reference`. On conflict with a mandatory constraint, never downgrade it —
   `NEEDS_DECISION`.
4. Conflicting external standards or inaccessible required material → `NEEDS_DECISION`.
5. For visible UI changes, record the `behavior-only`·`local`·`identity-shaping` scope via
   `visual-design.md`. `local`·`identity-shaping` require a Design Change Confirmation recorded on
   the card.
6. Judge risk and investigate policy sources. The lane header's `risk` is finalized here.
7. Read [`card/risk-grill.md`](references/card/risk-grill.md)·[`bva.md`](references/bva.md)·
   [`card/card-format.md`](references/card/card-format.md)·
   [`card/interaction-sweep.md`](references/card/interaction-sweep.md)·
   [`card/case-space.md`](references/card/case-space.md) → write the **Draft Oracle**
   with the needed Grill questions and BVA, then fill the interaction sweep, declare the Case
   space, run `scripts/oracle-frames.mjs --oracle` and disposition every emitted frame — every
   `needs-decision` cell or frame becomes a grill question. Follow the phase order (outcome →
   risk → data·architecture → API → concurrency·async → state → visual → performance·ops); if the
   user asks for a one-question-at-a-time interview, run it without a round cap.
8. Show existing revisions as a semantic delta and new cards in full with open questions, then
   explicitly re-confirm.
9. Before showing the Draft, run the cold-read gate: hand the card bytes alone to a context-free
   reviewer, apply the five questions per row, and collapse both into one root plus the first nail
   that falsifies it cheapest. Drive that nail. Then record the approval's location in
   `User Confirmation`. On a change request, fix the Draft and re-confirm; on no answer,
   `NEEDS_DECISION`.
10. Read [`card/confirmation-lock.md`](references/card/confirmation-lock.md) → after
    `oracle-verify.mjs card` lint passes, create the deterministic revision lock.
11. End at `ORACLE_READY` | `NEEDS_DECISION` | tool failure `FAIL`.
12. Write no tests and no production code.

### Delivery — explicit request only

When implementation, test-based self-verification, and subagent review are explicitly requested:

1. After the Design-only procedure, read [`delivery/ledger.md`](references/delivery/ledger.md) and
   [`delivery/red.md`](references/delivery/red.md). If Delivery was known from the start, defer the
   lock until architecture·backend source decisions are made. Design Intent never proceeds without
   a recorded Design Change Confirmation.
2. For React architecture boundary·state ownership·public API changes check
   `architecture-contract.md`; for backend·DB·data-access changes check `backend.md`.
3. After all outcome-changing decisions including architecture·backend and local source
   finalization: card lint → create the final lock once with the same source set. Never extend an
   existing lock — confirm and lock a new revision.
4. Pin the repo's real required command labels with `oracle-run.mjs init --required-label`,
   creating the run ledger and state files. The revision lock is auto-verified immediately before
   each stage.
5. Invoke the `$test` skill explicitly right before writing test files; write and run tests first.
   Map the reporter's failing test names to card rows; only a run that passes
   `oracle-verify.mjs red` and then records `oracle-run.mjs transition --to VALID_RED` is
   `VALID_RED`.
6. Only `VALID_RED` may edit production: record the implementation decision via
   `delivery/implementation-decision.md`·`frontend/authoring.md`, then minimal implementation →
   GREEN. `ALREADY_SATISFIED` performs zero-production verification only and approves no production
   edits. Either GREEN path records `oracle-run.mjs transition --to IMPLEMENTED_GREEN` exactly once
   first.
7. High risk: the sibling `test` skill's mutation kill·revert·re-GREEN first.
8. The Controller generates raw review input and assignment/dispatch with `oracle-run.mjs review-packet`.
   Reviewers return findings only; the Controller/join creates the `oracle-run.mjs review-receipt`
   ledger event and passes the receipt identity/digest to `oracle-verify.mjs review` and the final
   verify.
9. Terminal: `IMPLEMENTED_GREEN` or `REVIEW_VERIFIED`; unresolved policy after init records
   `oracle-run.mjs transition --to NEEDS_DECISION` with a structured decision and runId. Before
   init, preserve policy evidence and the decision only and create no runId. If judgment is
   impossible, `FAIL` with the actual error.

## Feedback routing

Canonical definitions live in [`common.md`](references/common.md). Record exactly one primary cause
per observation.

| Classification       | Route                                                         |
| -------------------- | ------------------------------------------------------------- |
| `POLICY_GAP`         | print the current card and questions → `NEEDS_DECISION`       |
| `EVIDENCE_GAP`       | add tests·mappings within the locked card scope               |
| `HARNESS_DEFECT`     | repair within `$test` allowances and `budget --spend harness` |
| `PRODUCT_DEFECT`     | production improvement budget after `VALID_RED`               |
| `ENVIRONMENT_DEFECT` | `FAIL` without touching production                            |
| `NON_ORACLE_OPINION` | record only; never blocks policy or completion                |

Budgets: policy 2, harness 2, product 3. On `BUDGET_EXHAUSTED`, `FAIL` with the last actual
failure.

## Delivery states

| State               | Meaning                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `IMPLEMENTED_GREEN` | card tests and required repo verification actually passed                   |
| `REVIEW_VERIFIED`   | tests and required verification re-passed after independent review findings |
| `NEEDS_DECISION`    | outcome-changing policy unresolved — print the current card and questions   |
| `FAIL`              | judgment impossible: environment·harness·tool failure or budget exhausted   |

Delivery's normal completion state is `REVIEW_VERIFIED`. But when `RELATIONAL`·`JUDGMENT` visual
evidence is `pending`, or Visual QA was `declined` with no source-backed N/A revision, the run
stops at the resumable `IMPLEMENTED_GREEN` terminal. On resume, complete the pending visual
evidence and then proceed to review; never claim this intermediate state means `REVIEW_VERIFIED`.

## Verification — before the final report

Four self-checks. Each one names a way this skill has actually been bypassed, so a check that cannot
be answered from artifacts on disk is a `FAIL`, not a judgment call.

1. **The lane header is true.** `nodes` lists the nodes this run actually Read, reconciled against
   the tool calls made — not the nodes the procedure says should have been read.
2. **Every claim cites the ledger.** No execution appears in the report that is absent from
   `runs.jsonl`, and each status word traces to a runId with its label and exit code.
3. **The first nail was driven, not named.** The cold-read gate's root and its falsifying
   observation are both in `journal.md`, with the observation's result.
4. **The recorded state agrees.** `oracle-run.mjs status --json` reports the same terminal state the
   report claims. On disagreement the artifact wins and the report is wrong.

## Final report

The block below is the Oracle lane's report. The Low fast path reports three lines instead — changed
paths, the verification commands with their actual results, and the risk reason — because a card,
lock, ledger, and review it never created cannot be reported on. Padding those fields with N/A is a
report defect.

Three rules decide what reaches the reader:

1. **Lead with the state and the blocker.** The first line is the state and what actually happened.
   When the run did not reach its mode's normal terminal, the second line names the blocking code and
   what would clear it. A blocker discovered at the bottom of a long field is a reporting defect.
2. **Print a group only when it applies; drop it whole when it does not.** Applicability is fixed by
   the table below, not by convenience. Never write a bare `N/A` — when a group that applies has
   nothing to show, give the reason in its place.
3. **Cite each runId once, and never truncate to fit a line.** A long value takes its own list item.

| Group                       | Printed only when                                                    |
| --------------------------- | -------------------------------------------------------------------- |
| Architecture                | an architecture boundary·state ownership·public API actually changed |
| Design, Design confirmation | the visual scope is `local` or `identity-shaping`                    |
| External visual QA          | `$frontend-visual-qa` actually ran                                   |
| Mutation                    | risk is High                                                         |

```text
Status: <state> — <what actually happened, one line>
Blocked: <code> — <what it prevents> · <what would clear it>

**Outcome** actor/context · observable success · achieved result · non-goals

**Decisions**
- Chose <minimal boundary · state ownership · server/client · async · type contract> — sources <S*>
- Rejected <option> — <why>

**Changes**
- <path> — <observable behavior change>

**Verification**
- <label> <runId> exit <n> <grade>
- evidence verify <output> · findings verify <output>
- accessibility · performance — <claim, or the reason it does not apply>

**Risk and recovery** worst regression · what blocks it · reversibility·rollback

**Implementation**
- Round <n> <card rows> — hypothesis, minimal change, result
- Review <role> — findings, applied or not

**Evidence appendix**
- Oracle SHA-256 <digest> · source hashes <...>
- Row mapping <O*/D* → test name>
- Transitions <...> — last state <...>
- Budgets policy <n>/2 · harness <n>/2 · product <n>/3 · ENV_DRIFT <presence>
- Last verify <command> exit <n>
```
