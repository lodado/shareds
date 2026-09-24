# Delivery — confirm the contract state with tests (`VALID_RED`)

1. Run the bundled `oracle-lock.mjs verify` and record the revision·exit code. `exec`·`transition`
   automatically perform the same verification on every call.
2. Translate every non-N/A row of the card into an observable test and first map the test name onto
   the corresponding row of `evidence.json`. A row maps to an observation, not to a symbol: several
   rows may quote the same test name when one observation covers them, and a test asserts what the
   user can observe. Do not create a production export whose only reason to exist is to give a row
   something to import — if the row is only observable through a module invented for the test, the
   observation tier is wrong, not the code.
3. For the network boundary, prefer the test boundary the repo already uses. If MSW is installed or
   its adoption is approved, use an MSW handler; otherwise use the existing transport seam. Do not
   quietly add a dependency just for tests. Handlers·example data belong in the closest place that
   owns the boundary, and FSD placement follows the `__mocks__/` rule of [`fsd.md`](../fsd.md).
4. Assert each row's `Then`, `Never`, and side-effect kind·count together. Observe request
   count·order in the handler.
5. Actually run the tests with `exec`.
6. If the failure satisfies `$test`'s `VALID_RED` predicate, confirm the reported test failure of the
   designated row with `oracle-verify.mjs red`. Record the transition with that runId·row, and modify
   production only after the transition passes.

If the card is large and milestones were declared at init, run a reported RED with the `red:<name>`
label immediately after writing each bundle. After every bundle has actually failed, quote the last
milestone run with `--run` and transition to the global `VALID_RED`. If even one is missing it is
`MILESTONE_RED_MISSING`, and no independent lock·state is created. A milestone only pulls initial RED
feedback earlier; GREEN·review stay on the existing global gates.

Use the current `status --dir <dir>` action's command. When no work separates execution and
transition, `oracle-run.mjs red` combines exec·verify·transition with identical checks; see
[`ledger.md`](ledger.md).

`RED_EVIDENCE_UNVERIFIABLE`·`RED_EVIDENCE_MISSING` prevent an unrelated compile/setup failure or an
exit-only run from being used as RED. `PRODUCTION_TOUCHED_BEFORE_RED` is machine evidence that
production was touched before the tests — revert the changed files to keep the order and do not route
around it. On Claude Code the plugin's PreToolUse hook (`hooks/hooks.json` →
`scripts/oracle-guard-hook.mjs`) denies such a write before it lands with the same code, and after
`VALID_RED` denies a write that adds a `TEST_WEAKENED` token to a test; the transition gate stays
the authority, and a host without hooks relies on it alone. The transition stores the test file digest·assertion count·expected-value literal multiset
at this point as the GREEN gate baseline: `toBe(1)` → `toBe(2)` keeps the assertion count and still
fails `TEST_WEAKENED`, because the expected values are the card's, not the implementation's. The
frozen evidence mapping covers `rows`, `paths`, `frames`, and `sequence` together, so every name
the verifier will check is fixed before production is touched. Screenshot and ARIA baselines
(`__screenshots__/`, Playwright `<spec file>-snapshots/`, `*.aria.yml`) are test paths too, so a baseline
re-shot after `VALID_RED` is a test change, not a free update.

The bundled reporters record why a failed test failed. `RED_CAUSE_INFRA` rejects a mapped test that
failed on a reference error, a test or hook timeout, or (node:test only) a failing setup hook —
`$test`'s predicate 4, decided by the reporter instead of by reading. A file with broken syntax never
gets this far: it fails collection, so the mapped name is missing. A `TypeError` or a `SyntaxError`
thrown inside the test stays acceptable, because the missing-target exception (`save is not a
function`) and a parse of a malformed response look exactly like them. A throwing vitest hook is
indistinguishable from a test error and is not detected.

`init` registers the runner's own inputs as harness without being asked: every tracked
`vitest`·`playwright`·`jest` config plus each setup file those configs name as a string literal. It
prints them as `HARNESS_AUTO`, names a non-literal setup as `HARNESS_SETUP_UNRESOLVED`, and only
suggests a `vite` config (`HARNESS_SUGGESTED`), because its aliases and plugins are production input
too; register what applies with `--harness-path`. A `retry`, `exclude`, or global mock added after
`VALID_RED` therefore meets the same harness gate as a test edit, and a runner flag that loads another
config or preload must name a registered harness file.

A file registered with `--harness-path` can be changed until a reported RED is recorded with those
bytes. If it is changed again after `VALID_RED`, completion is blocked with `HARNESS_BUDGET_REQUIRED`
when the harness budget is unused, and with `HARNESS_RED_REQUIRED` when a new reported RED→GREEN with
the changed bytes has not been run. Do not register a production file as a harness to route around the
ordering gate.

## As-is — what RED checks per row

When the card carries an `As-is` column ([`card-format.md`](../card/card-format.md#as-is--changing-an-existing-feature)),
the RED run proves each row's delta, not just the one `--row`:

- **kept (`same`)** — do not write a new test. Map the row to the existing test that already asserts
  it and include that test in the RED run; it must pass there (`KEPT_ROW_NOT_PASSING`). If it fails,
  the behavior the card calls existing is not there: the row is new or changed, a `POLICY_GAP`. A
  kept row cannot be the `--row` of the transition (`RED_ROW_KEPT`).
- **changed** — update the existing test that asserts the As-is behavior **in place** so it asserts
  the new `Then`. It must fail in the RED run on its assertion (`CHANGED_ROW_NOT_RED` while it still
  passes on the current code).
- **new** — as before. A new row whose test already passes before implementation is reported as
  `RED_VACUOUS`, not refused (a `Never` row often does); only a mutation can show that test catches
  the change.

`init` records the strength of every existing code test file. Before `VALID_RED` freezes the tests,
an existing test may lose an assertion or an expected-value literal, or be deleted, only in the file
that holds a changed row's test (the reporter records each test's file) or in a file that a changed
row's `As-is` cell names. Anything else is `TEST_WEAKENED_BEFORE_RED`. A behavior change the card
did not declare surfaces at GREEN as a failing existing test in the impact run: that is a
`POLICY_GAP`, and a new revision adds the row as changed. When every row is kept, there is nothing
to turn RED — use `ALREADY_SATISFIED` below.

If the requested behavior is already GREEN, do not force a production change or manufacture a RED.
Record the evidence that the existing implementation satisfies the card and transition with
`--to IMPLEMENTED_GREEN --reason ...`. This path passes only when there has been no production change
since `ORACLE_READY`. High risk separately confirms test sensitivity with `$test`'s mutation stage.
