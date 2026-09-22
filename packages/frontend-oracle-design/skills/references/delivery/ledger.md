# Delivery — authority·schedule·adjudication command ledger

## Authority and entry conditions

Immediately before writing a test file, explicitly load and invoke the installed `$test` skill by
name to activate the full SKILL.md text and the adjudication contract. Do not substitute merely
referring to the file, and if it cannot be found, `FAIL`. Follow `$test`'s Oracle gate·test
authoring·execution·`VALID_RED` verdict·correction budget exactly as they are. Delivery nodes only
add production implementation and self-feedback. When modifying frontend production, also read all of
[`frontend/decisions.md`](../frontend/decisions.md)·[`frontend/authoring.md`](../frontend/authoring.md).

**TDD first.** After `ORACLE_READY`, write and run tests first; writing or modifying production
before securing `VALID_RED` is forbidden.

- Medium/High risk requires an `ORACLE_READY` card. The Low fast path is used only for easily
  reversible changes inside an already approved contract with no new policy·card — the lane contract
  is [`lanes/low-fast-path.md`](../lanes/low-fast-path.md).
- A new card and a revision whose meaning changed are locked only after the Draft and delta are
  re-confirmed with the user, regardless of risk.
- Read the target repo's `AGENTS.md`, `CLAUDE.md`, test scripts, adjacent tests, and required
  architecture documents before modifying production.
- Only when the React architecture boundary·state ownership·public API changes, complete the explicit
  document approval and the Oracle local-source lock of
  [`architecture-contract.md`](../architecture-contract.md). If an existing approved document permits
  the change exactly, record only the path and the source hash.
- Preserve existing worktree changes and do not modify unrelated files.

## Compressed schedule

## Delivery capability discovery — before expensive artifacts

When Delivery is explicit at intake, after risk and source investigation and before writing the
Draft, lock, init, or tests, inspect the target repository's package scripts, actual runner configuration, required
verification boundary, and the trusted reporter path available to the Oracle. Record a short journal
entry with the checked paths/commands, `supported | unsupported | unknown`, evidence, and remaining
investigation or the existing `ENVIRONMENT_DEFECT` reason. A package name alone is not evidence that a
runner is supported; a configured dependency is not enough without an executable reporter path.

This discovery is not runtime readiness, a reported run, `VALID_RED`, a lock, or permission to skip
the existing RED/GREEN/evidence gates. Resolve `unknown` by reading more; do not turn it into
`unsupported`. If the actual path is structurally unsupported, report the concrete incompatibility
early as `ENVIRONMENT_DEFECT` → `FAIL`. Never promote `exit-only` to reported evidence; a separately
approved runner change still has to satisfy the trusted adapter contract. Design-only and Low
skip this discovery entirely; visual tool availability remains a separate explicit-visual-QA concern.

When entering Delivery after Design-only, perform the same investigation alongside the `$test`
availability check before any new lock, init, or test writing. Do not recreate an already approved
Draft merely to claim the check happened earlier, and do not extend an existing revision lock.

Bundle the `policy`, `architecture`, `evidence`, `naming`, `review` questions into one intake.
Before the lock, independent read-only investigations may run in parallel, but create the final lock
once after every outcome-changing decision is finished. Draft Oracle user approval is a serial gate.
screenshot·direct-browser execution is owned by the separate `$frontend-visual-qa` that the user
explicitly requested.

Production is not modified before `VALID_RED`. This contract does not force whether the subsequent
implementation is performed directly by the current agent, delegated, or parallelized. Regardless of
the execution method chosen, run targeted GREEN once against the combined production.

After targeted GREEN, run root test·lint·format and the independent review in parallel. Each `exec`
creates its runId reservation atomically, so there is no runId collision even in parallel. Do not
split these independent runs into separate turns; throw them together as parallel tool calls in one
message. After all results have joined and valid findings are reflected, run the final verify once
serially. Treating any single result as completion is forbidden.

## Adjudication commands run through the ledger

Every adjudication run goes through the bundled `oracle-run.mjs exec`. `exec` verifies the lock
immediately before running and leaves runId·exit code·reporter result·env fingerprint·provenance in an
append-only ledger. provenance holds the skill version, optional runtime/model, lock/worktree/production
snapshot, and capability context. Do not store the raw prompt; if needed, put only a hash or
sanitized metadata into `--capability-context`. A run that is not in the ledger is not evidence.

```bash
node <skill-dir>/scripts/oracle-run.mjs exec \
  --dir .ai/oracles/<oracle-id> --label red-1 \
  --report <reporter-output-path> \
  --runtime codex --model '<model-or-host>' \
  --capability-context '<sanitized-json-or-hash>' \
  -- <actual test command of the repo>
```

For a run that a transition immediately follows, the `red`·`green` subcommands record the exec and the
transition in one call — the verification is identical to the two-step path. Add only `--evidence`
(and `--row` for RED) to the `exec` flags.

```bash
node <skill-dir>/scripts/oracle-run.mjs red \
  --dir .ai/oracles/<oracle-id> --label red-1 \
  --adapter node-test --report <reporter-output-path> \
  --evidence .ai/oracles/<oracle-id>/evidence.json --row O1 \
  -- <actual test command of the repo>
```

- Only a run that passes `--adapter node-test` together with `--report` becomes `grade: reported`.
  This is because the Oracle directly owns and injects the reporter module and the output
  destination, so the command being run cannot forge the result. If the user passes `--test-reporter`
  family arguments directly, it is rejected with `ADAPTER_COMMAND_INVALID`.
- Every other run is `exit-only`. If the vitest·jest `--reporter=json --outputFile` or
  Playwright `--reporter=json` result is passed via `--report`, it is parsed and used for `reportError`
  diagnostics but is not given the `reported` grade — the executed command itself can write
  that file, so the Oracle cannot vouch for its origin.
- An `exit-only` run passes neither the `VALID_RED` transition nor test-name-based evidence
  verification. If a repo that has only non-node:test runners is blocked by this gate, it is
  `ENVIRONMENT_DEFECT` rather than `HARNESS_DEFECT`, and you `FAIL` with the actual cause without
  touching production.
- A node:test repo uses the bundled `scripts/oracle-node-reporter.mjs`. `--test-reporter` is a
  module specifier, so pass it as `./` or an absolute path.
- Record state transitions only with `oracle-run.mjs transition`. The script inspects TDD ordering,
  per-row RED/GREEN evidence, `--required-label` runs, consecutive pass counts, test weakening, the
  review artifact, and the lock, and prints the rejection reason as a code.
- The baseline for adjudicating TDD ordering = the worktree at `init` time. A repo where editor
  cache·agent runtime files keep changing should clean the worktree before `init` or narrow the scope
  to the target package with `--scan-root`. If an unrelated change produces
  `PRODUCTION_TOUCHED_BEFORE_RED`, narrow the scope and start again; do not turn the check off.
- Adjudication scope: a git repo uses `git ls-files -c -o --exclude-standard`, otherwise a
  `node_modules`·build-output exclusion list. **A gitignored path is not counted as a production
  change.** If something is real production but gitignored, clean up `--scan-root` or the ignore
  settings first.

## Status query and resume

Resuming does not invent state with a new command; it recomputes from the existing
lock·`run-state.json`·`runs.jsonl`·budget·evidence. Run it first after a session start or a context
summary.

```bash
node <skill-dir>/scripts/oracle-run.mjs status \
  --dir .ai/oracles/<oracle-id> \
  --json
```

The output holds `currentState`, `currentSnapshot`, `lockStatus`, `staleOrMissingRuns`,
`orphanedRun`, `remainingBudgets`, `blockers`, `nextLegalActions`, `nextActions`. `nextActions` is
the execution packet: one entry per legal transition with `ready`, its `blockers`, the `requires`
flags, the fresh `candidateRuns` that satisfy the run predicate, the `readNodes` worth opening for
that step, and an `example` command. The advertised flags mirror what `transition` actually
requires — resume needs `--run`, skipping RED adds `--reason`, review adds `--packet`/`--revision`,
and escape transitions (`NEEDS_DECISION`/`FAIL`) stay open even when evidence is missing. Pick one
step from the packet instead of re-reading the whole procedure; the packet is not a verdict,
`transition` repeats every check. A stale run is past evidence that
differs from the current lock/worktree/production snapshot and is not reused. `orphanedRun` is a run
that has a `.run-ids` reservation but no ledger completion record. Do not reuse the same runId by
hand; run a new `exec`. State file writes are performed only with temp file + atomic rename and are
never edited directly.

### What this harness cannot adjudicate

- `evidence verify` only looks at whether the quoted test name **actually passed** in that run.
  The validity of the row↔test correspondence is the independent reviewer checklist's responsibility.
- An actor that can delete `run-state.json`·`runs.jsonl` can restart the baseline·budget.
  `init`'s rejection is drift detection, not permission control. Only High risk protects
  `.ai/oracles/**`, the lock SHA, and run IDs with CI artifacts and CODEOWNERS·required review. This
  is not enforced by default for Low/Medium.
- The nondeterministic source scan is based on a known token list — do not use a detection failure as
  evidence of integrity.
- Call `oracle-run.mjs budget --spend policy|harness|product --reason ...` on every budget use.
  If `BUDGET_EXHAUSTED`, do not route around it with another budget; report `FAIL`.
  After RED, harness identity includes the frozen test-binding semantics (`rows`, `paths`, `frames`,
  `sequence`) from the selected evidence map as well as the existing test/harness file digest.
  A mapping-only correction counts once; formatting and non-binding notes do not count again.
  Pre-RED file-only identities and unchanged legacy spends remain compatible. An unreadable bound
  map is an error, not a reason to omit it from identity. Spending still requires fresh RED→GREEN
  for changed bindings; it neither increases the two-round limit nor reopens terminal `FAIL`.

## Conditional seed — verified commands

Proposed existing-contract projection, not an incident, approval or extra gate. The linked contracts
already apply; candidate management belongs to `card/retro-metrics.md`, not this stage.

```json
{
  "id": "verified-command",
  "revision": 1,
  "status": "proposed",
  "origin": "existing-contract",
  "When": "A required command, path or option is missing, unknown, or failed to start.",
  "DoNot": "Repeat guessed command names, paths or flags, or describe those attempts as passing verification.",
  "Unless": "A retry has support from inspected scripts/configuration or documented tool help and is allowed by scope and remaining applicable budget. Rerunning the unchanged GREEN command for the required consecutive-pass gate is not guessing.",
  "Instead": "Inspect actual package scripts, runner configuration, installed command help and paths. Run the verified supported command through exec when judging Delivery. Investigate unknown capability; if required judgment remains impossible, report the actual cause as ENVIRONMENT_DEFECT -> FAIL without production changes. Keep successful independent evidence and unverified scope distinct; do not reset or borrow budgets.",
  "ApplyAt": ["Delivery capability discovery", "adjudication commands", "status query and resume"],
  "authorityRefs": [
    "references/delivery/ledger.md#delivery-capability-discovery--before-expensive-artifacts",
    "references/delivery/green-review.md#green-gate",
    "references/common.md#feedback-routing--canonical-classification"
  ],
  "evidenceRefs": [],
  "regressionCases": {
    "mustPrevent": ["fod-sem-guard-verified-command-prevent"],
    "mustAllow": ["fod-sem-guard-verified-command-allow"]
  }
}
```

## Conditional seed — authorized scope

Proposed existing-contract projection, not an incident, approval or extra gate. The linked contracts
already apply; candidate management belongs to `card/retro-metrics.md`, not this stage.

```json
{
  "id": "authorized-scope",
  "revision": 1,
  "status": "proposed",
  "origin": "existing-contract",
  "When": "A recovery or implementation would change files, dependencies, configuration or external state.",
  "DoNot": "Expand beyond the approved request/contract or overwrite unrelated user changes to make the task pass.",
  "Unless": "The necessary change is already within approved scope and the applicable state, source and evidence gates permit it. Existing approval suffices; genuinely new scope needs the existing decision/approval route, and contract meaning changes need a new confirmed revision.",
  "Instead": "Check the current diff, ownership and real scripts/config first; prefer the existing test boundary without adding a dependency. Perform only authorized reversible recovery within budget. Preserve pre-RED production protection and declared harness paths. Stop the affected action for a missing decision, rather than silently installing or reconfiguring; continue only other work the existing state and scope permit.",
  "ApplyAt": ["Delivery capability discovery", "writing tests", "production implementation", "self-feedback"],
  "authorityRefs": [
    "references/delivery/ledger.md#authority-and-entry-conditions",
    "references/delivery/red.md",
    "references/card/confirmation-lock.md#run-artifact-initialization"
  ],
  "evidenceRefs": [],
  "regressionCases": {
    "mustPrevent": ["fod-sem-guard-authorized-scope-prevent"],
    "mustAllow": ["fod-sem-guard-authorized-scope-allow"]
  }
}
```

## Optional task-scoped implementation worker

Use this path when one approved Medium/High implementation task benefits from a fresh context.
It is independent of graph mode. Low, Design-only, `ALREADY_SATISFIED`, and visual-pending resume
keep their existing paths. Do not split one debugging loop across workers or launch concurrent
product writers. The task ends at `IMPLEMENTED_GREEN`; existing independent reviews, High mutation
checks, and receipts still apply before `REVIEW_VERIFIED`.

The existing runner issues the packet, dispatches one worker, collects its submission, reruns
checks, and calls the existing transition validator. A worker's `PASS` or completion narrative
has no authority. There is no extra product state machine or budget ledger.

After `$test` has established `VALID_RED`, save a task specification inside the Oracle directory:

```json
{
  "taskId": "save-pending",
  "goal": "Implement O1 pending behavior without changing its approved tests",
  "rows": ["O1"],
  "writablePaths": ["src/save.ts"],
  "referenceNodes": [],
  "notApplicable": {
    "backend": "No backend or data-access boundary changes"
  },
  "testSkill": "/absolute/path/to/installed/test/SKILL.md",
  "replaySafeLabels": ["behavior", "impact", "lint:exit", "typecheck:exit"]
}
```

`writablePaths` contains exact production file paths relative to the scan root, never directories
or globs. Tests, harness inputs, configuration, dependency manifests and Oracle artifacts are
outside this worker's write scope. Expand ambiguous or entangled work through the existing
contract/decision path instead of delegating an unbounded task. An optional `decision` path,
relative to the Oracle directory, supplies the existing implementation decision in full.

`referenceNodes` adds applicable nodes from `reference-graph.json`. The graph marks conditional
implementation inputs; missing applicability decisions load conservatively. `notApplicable`
needs a reason for each omitted conditional node. Dependency closure still wins over an omission.
Do not exclude a node because the parent read it. Each packet delivers full reference bodies,
including dependency nodes, the original Oracle, locked local sources, evidence map, and installed
`test`/BVA skill text. It never uses a continuation bundle or copies parent conversation history.
Review criteria and review skills remain in the separate complete review-packet contract.

Only list `replaySafeLabels` after checking that these commands can safely run again. Use exact
labels from `init`, including any `:exit` or `:reported` suffix, plus the RED label. Every required
label needs an existing `exec` run with its working directory. Older runs without that field need
fresh evidence. Commands with unapproved external effects stay on the existing sequential path.

```sh
node <skill-dir>/scripts/oracle-run.mjs worker-packet   --dir .ai/oracles/<oracle-id> --task .ai/oracles/<oracle-id>/task.json
node <skill-dir>/scripts/oracle-run.mjs worker-run   --dir .ai/oracles/<oracle-id> --packet <printed-packet-path>   --max-budget-usd <approved-positive-limit> --timeout-ms 600000
```

Issuance reserves an ordinary run ID and stores a derived packet under `.worker-tasks/`. Its
reservation pins the packet digest; the packet pins the ledger head, dirty/untracked worktree
snapshot, lock and rule revisions. A new packet does not reset budgets. One dispatch spends one
existing product attempt, even if the worker later fails. Host cost needs a separate explicit
limit; it does not replace Oracle's iteration limits or authorize paid benchmark runs.

### Host support and context evidence

The first transport is the installed Claude Code CLI. It probes `--version` and `--help`, registers
an `oracle-implementation` role using native `--agents`, and starts a new `-p` invocation with
`--no-session-persistence`. Its stdin contains only this task packet. It uses neither resume nor
conversation fork. The ledger records the actual version, invocation, input digest, context mode,
role, output digest, and capability limitations. Acceptance requires an observed successful
`Skill` tool result for `test`, not a worker's claim that it read the skill.

This is evidence about invocation and input transport, not proof of the model's internal context.
Project instructions and host-managed skills can still load. CLI option discovery alone is not a
successful model integration test. Claude Code 2.1.278 exposes the required options; this release's
transport tests use a fake executable and do not make model calls. See the official
[skills context documentation](https://code.claude.com/docs/en/skills#run-skills-in-a-subagent):
`context: fork` starts a skill subagent without conversation history, unlike a conversation fork.
This transport uses neither feature. Codex and jcode retain their existing sequential/native paths;
this command does not claim fresh-context adapters for them. Unsupported options fail before
spending a product attempt. Required independent review never falls back to role-play.

### Acceptance, recovery, and protection limits

The runner binds the submission to the issued task/attempt, checks protected inputs and exact
changed paths, and verifies the candidate through existing trusted `exec` adapters. The worker's
host process remains `exit-only`; only real reporter results can support GREEN. Risk-dependent
consecutive passes and the existing transition validator still decide acceptance. The submission
artifact records the candidate, changed paths, evidence run, blockers and handoff. Handoff text is
unverified narrative, including any instruction-like text in logs or source comments.

A duplicate accepted result is a no-op while its candidate is unchanged. A newer attempt rejects
late older submissions. Recovery can reuse durable, matching check runs after interruption before
acceptance; a missing host completion is `WORKER_INTERRUPTED`, never inferred success or an
automatic repeat of external work. Inspect `status --json`, current artifacts and effects before
issuing another attempt. A process killed while holding a directory lock may need operator
recovery after proving no owner is running; do not delete locks speculatively.

Write/Edit hooks provide pre-tool checks for their matched tools only. Bash and other unrestricted
paths are not filesystem-isolated. This transport detects changed snapshot files and protected
regular Oracle artifacts after execution and rejects acceptance; it cannot prevent every write,
observe transient writes that were restored, or cover arbitrary files outside the scan root and
its normal snapshot exclusions. `readablePaths` is guidance, not an OS access boundary. Processes
with the same filesystem permissions can rewrite artifacts and hashes. Do not claim malicious
forgery resistance, exactly-once external side effects, or a sandbox. If prevention is mandatory,
require an appropriate host boundary rather than use this adapter.
