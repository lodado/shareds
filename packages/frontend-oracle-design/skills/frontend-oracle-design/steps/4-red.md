# Step 4 — RED

Goal: evidence that the generated tests catch the problem on the product as it is now.

1. Rules marked `모델 밖` get a hand-written test now, following `$test`; the SPEC's `test` command must run it.
2. Run `fod.mjs run red <id>` (or `run red <id> -- <command>` for a different runner invocation). It records the
   failing test names in `run.jsonl` only when a generated test (its name starts with `[MODEL]`) fails. GREEN
   later must run the same command.

Until RED is recorded the product files of the SPEC stay as they were at approval; the guard hook refuses writes
to them. Adapter and harness fixes are free before RED. To abandon the run, `fod.mjs drop <id>` releases the
hook (`RUN_MISSING` when no such run exists); an approval older than 24 hours without RED no longer blocks either.

| Code                     | Fix                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RUN_TESTS_STALE`        | the generated files changed or the approval moved: rerun `gen`                                                                                                                                           |
| `RED_PRODUCT_CHANGED`    | set the listed changes aside and restore the approved content ([step 5, Setting the fix aside](5-green.md#setting-the-fix-aside)), then rerun                                                            |
| `RED_PASSED`             | the generated tests pass on the unfixed product (a failing hand test alone does not count): put the real bug trace in `BUGS.json` and rerun `gen`, or the model does not forbid the bug — back to step 1 |
| `RED_NOT_A_TEST_FAILURE` | no generated test ran: the command failed before any test (syntax, import, environment), a package is missing, or the command does not run `out`. Fix the harness or the adapter, or install the package |
| `RED_DONE`               | RED is already recorded for this approval: go to step 5                                                                                                                                                  |

One exception to "a generated test fails": in a new feature the adapter imports a product module that does not
exist yet. That `Cannot find module` is a valid RED only when the missing path is inside the SPEC's `product`
globs; any other missing module is a broken harness.

Next: [step 5](5-green.md).
