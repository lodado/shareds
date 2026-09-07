# Approved follow-up task

Stage 1 is archived. The same SDK now moves to v3: only the settled event payload changes from `{ minorUnits: number }` to `{ amount: { minor: string } }`. `minor` is a signed decimal integer string representing minor currency units (examples: `"1234"`, `"0"`, `"-125"`). No new product policy is needed; all rendered outputs, error distinctions, audit/subscription counts, cause propagation, cleanup and toggle behavior remain unchanged. Other event shapes and `{ cancel }` are unchanged.

Update the current source for v3 only. No v1/v2 compatibility or unrelated changes are requested. Apply the same criteria already supplied. You may retain or revise your boundary choice based on this actual change, but do not inspect other runs or the original repository. Tests/task/criteria are controller-owned; do not edit them. Do not delegate.

Run `SUBJECT_ROOT="$PWD/src" SDK_VERSION=v3 node --test verify.test.mjs`. Save raw output/exit code in `verification.log`, update `decision.md` with what actually changed and the trade-off, and stop. Report the changed source files and observed verification, not a speedup estimate.
