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
