# Step 5 — GREEN

Goal: the product passes the same tests that failed at RED.

1. Take the first failing case: the shortest trace, or fast-check's shrunk counterexample with its seed.
2. Change the product (only files in the SPEC's `product` globs) to make that case pass. For code structure and
   placement, follow `$frontend-system-design`.
3. Run `fod.mjs run green <id>`. Repeat from 1 until it prints `ok run`.

The generated tests, the adapter and the test command stay exactly as they were at RED. When a failing case
shows the model is wrong and the product is right by the sources, go back to step 1: changing a rule is the
user's decision, so send step 2's message again, then set the fix aside as below. Approved with the fix in
place, the tests usually pass at RED, and RED proves nothing.

## Setting the fix aside

1. Save every product file the fix touched, new ones included: `tar -cf .ai/oracles/<id>/fix.tar <files>`.
2. Return them to their content before the fix: `git checkout -- <file>` when the fix is uncommitted,
   `git checkout <commit before the fix> -- <file>` when it is committed, and `rm <file>` for a file the fix
   created (it is safe in `fix.tar`).
3. Run `prove`, ask, `approve`, `gen` and `run red`.
4. Restore the fix with `tar -xf .ai/oracles/<id>/fix.tar`, delete `fix.tar`, and `run green`.

| Code                    | Fix                                                                      |
| ----------------------- | ------------------------------------------------------------------------ |
| `GREEN_NO_RED`          | record RED first (step 4)                                                |
| `GREEN_COMMAND_CHANGED` | run green with the command RED recorded (the printed fix gives it)       |
| `GREEN_TESTS_CHANGED`   | restore the generated tests and the adapter to their RED content         |
| `GREEN_TESTS_NOT_RUN`   | the command passed without running a `[MODEL]` test: make it run `out`   |
| `GREEN_FAILED`          | fix the product for the first listed case (or install the named package) |

Next: [step 6](6-review.md).
