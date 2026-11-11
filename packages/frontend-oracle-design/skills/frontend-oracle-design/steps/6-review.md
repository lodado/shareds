# Step 6 — Review

Goal: one independent reading of the delivery, then the report. The model was read before the approval
([step 2](2-proof.md)); this reading is the second and last.

Start one reviewer in a fresh context on the latest model (in Claude Code an Agent with `model: "opus"`). Give it
paths, not your conclusions: the SPEC, the adapter, the product diff, the hand tests, `run.jsonl`, and this
checklist. The reviewer first reruns `fod.mjs run green <id>` itself.

Checklist:

- The adapter observes the product and maps every event; it re-implements no product logic.
- The product diff stays inside the `product` globs, and nothing listed in 범위 밖 or 이어받는 규칙 changed.
- The product keeps its rules where the model has no event: a caller that omits an optional callback, a
  dependency that throws before it returns a promise.
- Each `모델 밖` rule has a hand test that asserts an exact observable value.

The reviewer returns all findings once, ordered blocker, major, minor, nit, each with `file:line`, a failure
scenario and a fix. Apply every finding and rerun the affected command; there is no further round. The one
exception: a fix that would edit the SPEC or the Bend files restarts approval, so only a blocker gets it. List
the others as proposals in the report.

What a fix needs again:

- Product files only: `run green`.
- The adapter: no new approval. Set the product fix aside
  ([step 5, Setting the fix aside](5-green.md#setting-the-fix-aside)), `run red`, restore it, `run green`.
- The SPEC or the Bend files (a blocker): as for the adapter, with `prove`, ask, `approve` and `gen` before
  `run red`.
- A hand test: `run red` does not record hand tests, so run that test itself with the fix set aside and keep its
  failure line for the report, then restore the fix and `run green`.

Run with the fix still in place, the tests usually pass at `run red`, and RED proves nothing.

## Report

```text
<id>: GREEN
규칙 → 법칙: R1 → <law>, R2 → <law>, R3 → 모델 밖 (손 테스트 <name>)
증명: <proof.json laws>, 공간 <n> traces
생성 테스트: <cover> cover + <W> W-method + <S> order + <B> bug + fast-check <runs> runs
RED: <failing names from run.jsonl>
GREEN: <command> (<date>)
리뷰: 모델 <verdict> · 배달 <verdict>, <model>
남은 것: <proposals or none>
```
