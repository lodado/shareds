# Oracle Card — escape record and run metrics

Every device on the card is a bet about where defects hide. The escape record settles the bet: a
defect found after the lock names the cell, frame, landmine, or question that should have caught it,
and the metrics say whether the procedure as a whole is buying anything. Neither is a gate.

## Escape record — `escapes.jsonl`

Record every defect found after the revision lock — a user report, the exploration phase, a
reviewer finding, production — as one JSON line in `.ai/oracles/<id>/escapes.jsonl`. The line is
the machine form of the escaped-bug retro that [`interaction-sweep.md`](interaction-sweep.md) and
[`case-space.md`](case-space.md) require; write it before appending anything to a question bank or
taxonomy.

```json
{
  "symptom": "scroll=0 after filter change",
  "detected_after": "REVIEW_VERIFIED",
  "class": "DIMENSION_MISSING",
  "kind": "undeclared-dimension",
  "should_have_been_caught_by": "sweep:P3×P1",
  "correction": "taxonomy: remount × scroll-owner"
}
```

| Field                        | Values                                                                                                                | Meaning                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `symptom`                    | one line                                                                                                              | what the user or the tool observed — evidence, never the lesson                                                                                                                                            |
| `detected_after`             | `GREEN` · `REVIEW_VERIFIED` · `production`                                                                            | the last state the defect passed through                                                                                                                                                                   |
| `class`                      | `JUDGMENT_ERROR` · `DIMENSION_MISSING` · `INVARIANT_MISSING` · `POLICY_GAP` · `EVIDENCE_GAP` · `HARNESS_DEFECT`       | the lesson. The first three are escape-only classes; the last three reuse the feedback routing of [`common.md`](../common.md)                                                                              |
| `kind`                       | `mis-disposition` · `undeclared-dimension`                                                                            | the Case space verdict of [`case-space.md`](case-space.md). Required for the three escape-only classes: `JUDGMENT_ERROR` is `mis-disposition`, the other two are `undeclared-dimension`; omitted otherwise |
| `should_have_been_caught_by` | `sweep:P3×P1` · `deviation:P1:stopped-early-applied-long` · `frame:F18` · `landmine:<package>:<option>` · `Q2` · `I1` | the existing cell, frame, landmine, question, or invariant that was judged wrong. Naming none means naming a new dimension — put it under `correction` instead                                             |
| `correction`                 | `question-bank:` · `taxonomy:` · `MR:` · `policy:` followed by the fix                                                | where the fix lands                                                                                                                                                                                        |

Rules:

- The class is the lesson; the symptom is evidence. A record that only restates the report keeps
  the harness human-in-the-loop for that one case — the same class of failure returns anywhere a
  person did not point.
- One record per escape. Re-classify by appending a new line, never by editing.
- An escape with `class: POLICY_GAP` still routes to `NEEDS_DECISION` as usual; the record does not
  replace the routing.

## Metrics — direction signals, never gates

Compute from the artifacts on disk. The first tens of cards cannot rank devices; read the values for
direction only and say so wherever they are quoted.

| Metric             | Definition                                                                                                  | Source                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Escape Rate        | escapes with `detected_after` of `REVIEW_VERIFIED` or later ÷ cards that reached `REVIEW_VERIFIED`, rolling | `escapes.jsonl`, `run-state.json`                                                                                                     |
| Question Precision | Open questions and `needs-decision` cells whose answer changed the card bytes ÷ all raised                  | the diff between the Draft and the locked bytes — a new `P*`, a `Then`·`Never` change, a new row counts; a restated answer does not   |
| Oracle Cost        | dispositioned cells + questions raised to the user                                                          | sweep·deviation·frame·landmine tables and Open questions. Self-reported minutes are not a proxy; record wall-clock only when measured |
| Test Duplication   | assertions with two or more owning tests                                                                    | `evidence.json` against the test files; expected 0 under the single-owner rule of `$test`                                             |
| Turns to terminal  | user turns between the request and the reported terminal state                                              | `journal.md`; the final report prints `Turns <n>`                                                                                     |

- No metric moves a gate. A rising Escape Rate raises the sweep·exploration budget; it never lowers
  a lint or skips a review.
- Record the values in `journal.md` at `REVIEW_VERIFIED`; the final report prints only `Turns`.
