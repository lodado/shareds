# Step 4 — RED

Goal: evidence that the generated tests catch the problem on the product as it is now.

1. Rules marked `모델 밖` get a hand-written test now, following `$test`; the SPEC's `test` command must run it.
   A hand test never awaits a promise the unfixed product may leave pending; it settles its own deferreds.
2. Run `fod.mjs run red <id>` (or `run red <id> -- <command>` for a different runner invocation). It records the
   failing test names in `run.jsonl` only when a generated test (its name starts with `[MODEL]`) fails. GREEN
   later must run the same command.

Until RED is recorded the product files of the SPEC stay as they were at approval; the guard hook refuses writes
to them. Adapter and harness fixes are free before RED. To abandon the run, `fod.mjs drop <id>` releases the
hook (`RUN_MISSING` when no such run exists); an approval older than 24 hours without RED no longer blocks either.

| Code                     | Fix                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `RUN_TESTS_STALE`        | the generated files changed or the approval moved: rerun `gen`                                                                                 |
| `RED_PRODUCT_CHANGED`    | set the changes aside and restore the approved content ([step 5](5-green.md#setting-the-fix-aside)), rerun                                     |
| `RED_PASSED`             | the generated tests pass on the unfixed product (hand tests do not count): add the bug trace to `BUGS.json` and rerun `gen`, or back to step 1 |
| `RED_NOT_A_TEST_FAILURE` | no generated test ran (syntax, import, environment, a missing package, a command that skips `out`): fix the harness or install the package     |
| `RED_DONE`               | RED is already recorded for this approval and these tests: go to step 5                                                                        |
| `RUN_TIMEOUT`            | not finished in 5 minutes (RED or GREEN): a test awaits a promise that never settles; settle it from the test                                  |

One exception to "a generated test fails": in a new feature the adapter imports a product module that does not
exist yet. That `Cannot find module` is a valid RED only when every missing path is inside the SPEC's `product`
globs and the file that imports it is the adapter, a generated test or a product file. Any other missing module,
or one only a hand test imports, is a broken harness.

Next: [step 5](5-green.md).
