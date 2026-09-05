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

```bash
node <skill-dir>/scripts/oracle-run.mjs exec \
  --dir .ai/oracles/<oracle-id> \
  --label red:list \
  --report .ai/oracles/<oracle-id>/red-list.json \
  -- <targeted-test-command>
```

```bash
node <skill-dir>/scripts/oracle-verify.mjs red \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --map .ai/oracles/<oracle-id>/evidence.json \
  --ledger .ai/oracles/<oracle-id>/runs.jsonl \
  --run r-001 \
  --row O1
```

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to VALID_RED \
  --run r-001 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --row O1
```

If there is no other work between the run and the transition, `oracle-run.mjs red` records the exec·verify·transition
above in one call with the same verification — see [`ledger.md`](ledger.md) for the flag format.

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
the verifier will check is fixed before production is touched.

A file registered with `--harness-path` can be changed until a reported RED is recorded with those
bytes. If it is changed again after `VALID_RED`, completion is blocked with `HARNESS_BUDGET_REQUIRED`
when the harness budget is unused, and with `HARNESS_RED_REQUIRED` when a new reported RED→GREEN with
the changed bytes has not been run. Do not register a production file as a harness to route around the
ordering gate.

If the requested behavior is already GREEN, do not force a production change or manufacture a RED.
Record the evidence that the existing implementation satisfies the card and transition with
`--to IMPLEMENTED_GREEN --reason ...`. This path passes only when there has been no production change
since `ORACLE_READY`. High risk separately confirms test sensitivity with `$test`'s mutation stage.
