# Step 6 — Review

Goal: one independent reading, then the report.

Start one reviewer in a fresh context on the latest model (in Claude Code an Agent with `model: "opus"`). Give it
paths, not your conclusions: the SPEC, the three Bend files, the adapter, the product diff, `run.jsonl`, and this
checklist. The reviewer first reruns `fod.mjs run green <id>` itself.

Checklist:

- Every rule has a law whose scope matches its words: "never" over every trace, "can" a witness, one step a cell;
  frame laws accompany three-argument relations; no law is copied from `step`.
- Every 7-axis value is reachable in the model, or its `N/A` reason holds for this feature.
- The adapter observes the product and maps every event; it re-implements no product logic.
- The product diff stays inside the `product` globs, and nothing listed in 범위 밖 or 이어받는 규칙 changed.
- Each `모델 밖` rule has a hand test that asserts an exact observable value.

The reviewer returns all findings once, ordered blocker, major, minor, nit, each with `file:line`, a failure
scenario and a fix. Apply every finding, rerun the affected command, and review again only when a blocker or
major was fixed — two rounds at most. After the second, list what remains as proposals in the report.

A fix that only touches product files inside the `product` globs needs `run green` again. A fix that changes the
SPEC, the Bend files or the adapter needs a new approval with the product fix set aside, as in
[step 5, Setting the fix aside](5-green.md#setting-the-fix-aside). Approved with the fix already in place, the
tests usually pass at `run red`, and RED proves nothing.

## Report

```text
<id>: GREEN
규칙 → 법칙: R1 → <law>, R2 → <law>, R3 → 모델 밖 (손 테스트 <name>)
증명: <proof.json laws>, 공간 <n> traces
생성 테스트: <cover> cover + <W> W-method + <S> order + <B> bug + fast-check <runs> runs
RED: <failing names from run.jsonl>
GREEN: <command> (<date>)
리뷰: <verdict>, <rounds> rounds, <model>
남은 것: <proposals or none>
```
