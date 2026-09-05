# Graph orchestration — explicit request only

Only when the user explicitly requests a graph-orchestrated delivery loop, load and invoke the
installed `$agent-graph-engineering` by name and execute
[`oracle-workflow.graph.json`](oracle-workflow.graph.json). Without such a request, the current
agent performs the same contracts·gates·state transitions sequentially — subagent delegation is not
forced and only the agent's discretionary choice is allowed. In graph mode, if the skill or the
graph verifier cannot be found, `FAIL` instead of falling back to sequential execution.

- The Controller owns only Node execution·Edge selection. Product policy·card·lock·ledger·state
  transitions·budgets are still owned by Oracle.
- Copy the bundled graph as-is to the target repo's `.ai/agent-graphs/<oracle-id>/graph.json` and
  append execution events to `events.jsonl` in the same directory, append-only.
- Before execution, check the graph with the bundled `graph-verify.mjs verify`. Each Worker performs
  only the `task` of the current Node and returns the declared output fields as JSON.
- The Worker does not choose the next path. The Controller runs `graph-verify.mjs next` with
  `--events events.jsonl` to activate only the Edge matched by strict equality, and to adjudicate
  `maxSteps` overruns·join readiness by machine.
- Repeated failure paths are owned by the graph `fallback` rather than by an Edge on every Node —
  `POLICY_GAP`·`FAIL`→`run-stopped`, `PRODUCT_DEFECT`→`implement-green`,
  `EVIDENCE_GAP`·`HARNESS_DEFECT`→`evidence-repair`. A Node-specific Edge takes precedence when one
  exists (for example the `HARNESS_DEFECT` self-retry of `valid-red`). The `FAIL`·`POLICY_GAP` of
  `draft-oracle`·`lock-oracle`, which are before the ledger, go to `pre-ledger-stop` through a
  node-specific edge to preserve the classification, decision, and actual error without creating a
  runId. A stop after init is preserved by `run-stopped` with the classification, the actual runId,
  the decision, and the error, normalizing a nullable decision/error explicitly.
- `ENVIRONMENT_DEFECT` and `NON_ORACLE_OPINION` remain finding classifications only and are not
  graph labels. An environment defect leaves the reason in the ledger and is reported as `FAIL`, and
  a review verdict that leaves only opinions is normalized by `review-finalize-standard` or
  `review-finalize-high` to `REVIEW_ACCEPTED`.
- `valid-red` classifies `VALID_RED` only after recording
  `oracle-run.mjs transition --to VALID_RED`. `ALREADY_SATISFIED` does not go back to draft but
  performs only the zero-production verification of the existing implementation evidence at
  `implement-green`; it does not approve production edits. Both GREEN success paths record
  `oracle-run.mjs transition --to IMPLEMENTED_GREEN` exactly once. `INVALID_RED` is not used as a
  graph label.
- Every Node that can emit `POLICY_GAP` outputs a structured `decision`. After init, record
  `oracle-run.mjs transition --to NEEDS_DECISION` with the actual runId and go to `run-stopped`;
  before the ledger, preserve the policy evidence and the decision·error at `pre-ledger-stop` and do
  not invent a runId.
- When visual evidence is `pending`, `implement-green` stops at the resumable `IMPLEMENTED_GREEN`
  terminal. A new graph run detects the persisted `IMPLEMENTED_GREEN` at `draft-oracle` and goes to
  `resume-implemented-green`, verifies the completed visual evidence, and then proceeds only to the
  standard/high review according to risk. This path does not record the GREEN transition again or
  claim `REVIEW_VERIFIED` in advance. A certifiable visual PASS is only a schema-v3 artifact created
  by a locked test of a trusted `oracle-run --adapter node-test` run driving Playwright; a
  standalone Playwright adapter is unsupported. A Browser MCP observation is pending.
- `review-dispatch` normalizes the `reviewPacket` and the Controller-issued
  `reviewAssignments`·`reviewDispatches`. The single `classification` of dispatch all activates only
  `primary-review` when `STANDARD`, and activates the independent `primary-review` and
  `secondary-review` together when `HIGH`. Reviewers do not read each other's results and return
  only finding artifacts. Even when a High-risk reviewer is BLOCKED, both branches arrive at
  `high-review-join` and activate `evidence-repair` only once. The Controller/join calls
  `oracle-run.mjs review-receipt` for both High-risk findings to create two ledger-bound receipts
  containing `packetSha256`, `targetRevision`, `role`, `taskId`, `outputSha256`, `reviewerId`,
  `findingsSha256`, `previousDigest`, and `digest`. The new run record and the receipts state the
  locked `oracleSha256` and `adapter: node-test`. Finalization is split by route so the receipt
  contract is executable on each: `review-finalize-standard` records and verifies the one primary
  receipt it was given, `review-finalize-high` verifies and records the two ledger-bound receipts
  the join produced plus the intersection rule, and neither substitutes for the other. Each performs
  the final verification and the `REVIEW_VERIFIED` transition only on accepted findings. An actual error from a receipt command propagates as `FAIL`,
  and BLOCKED goes to `evidence-repair`.
- The graph `maxSteps` is only a runaway ceiling and does not replace the `oracle-run.mjs budget`
  adjudication.
- Do not call `$frontend-oracle-design` recursively inside a graph Node. Apply only the currently
  loaded contract and the conditional references.
- The `user-confirmation` gate stops at `WAITING_USER` before an explicit answer. Do not skip the
  card·Design Change·architecture confirmation or let the agent approve on the user's behalf.
