# Step 2 — Proof

Goal: a Bend model of the behavior, a law for every rule, a kernel-checked proof, and the user's one approval.
Read [bend-proof](../references/bend-proof.md) in full before writing Bend; read
[model-patterns](../references/model-patterns.md) when the model has time, retries, error kinds, counters,
collections or identities.

## Write three files beside each other (the SPEC's `model` path)

1. **`MODEL.bend`** — the machine.
   - `type State` (control state plus data in finite classes or counters) and `type Msg` (every event: user
     commands, responses, timers, other tabs).
   - `<Prefix>.init() -> State`, a total `<Prefix>.step(s, m) -> State` (an ignored event is a named outcome,
     never a missing arm), `<Prefix>.observe(s)` (what the screen and the network show) and
     `<Prefix>.next(history) -> List<Msg>` (the events the environment allows next).
   - Each 7-axis row that is not `N/A` lands in the model: Data and Value as finite classes, Async as states and
     response events, Order as what `next` allows, Entry and Data starting conditions as the first events
     `next([])` offers (one per class, so every later order runs from each start), Environment
     as environment events, Platform only when behavior differs. Write the identifiers in the SPEC's
     **모델에서** column in backticks: `` `Pay.Pending` ``.
2. **`LAWS.bend`** — one law per rule, with the rule id in the comment right above it (`# R2: ...`) or as the
   name's prefix (`law r2_late_ignored:`). "Never" is a law over every trace, "can" is an `exs` witness, one step
   is a cell relation; bend-proof's table maps sentences to laws. Rules marked `모델 밖` need no law.
3. **`PROOF.bend`** — proofs of the laws `prove` cannot close alone. Cell laws over finite types are generated;
   every-trace laws need an invariant, its step lemma and one induction (bend-proof, "Every trace").

Never narrow a rule to obtain a proof. A rule the model cannot satisfy is a wrong model or an open policy: fix the
model, or add a question.

## Run `fod.mjs prove <id>`

It checks the SPEC, then reports every problem of the rules ↔ laws, the axes ↔ model identifiers, the Bend check,
the kernel proof, `prove-reach` when the SPEC sets `safe`, and the trace space at `bound` — all at once.

| Code                  | Fix                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODEL_FILE_MISSING`  | write the three files at the SPEC's `model` path                                                                                                                                 |
| `RULE_WITHOUT_LAW`    | add `# R<n>:` above the law that states it, or mark the rule `(모델 밖: <reason>)`                                                                                               |
| `AXIS_NOT_IN_MODEL`   | name the model identifiers for that axis in backticks; each must exist in `MODEL.bend`                                                                                           |
| `PROVE_MODEL_INVALID` | fix the Bend error it prints ([model-patterns](../references/model-patterns.md#bend-check-failures)); `consumed more than once` is the usual first one: mark that parameter `+s` |
| `PROVE_FAILED`        | complete the proof (bend-proof, "Reading a failure"); a counterexample means the model or the law is wrong                                                                       |
| `PROVE_REACH_FAILED`  | the printed trace reaches a state that breaks `safe`: fix `step` or ask whether the rule holds                                                                                   |
| `SPACE_INCOMPLETE`    | lower `bound`, or keep the state finite                                                                                                                                          |
| `APPROVE_PROOF_STALE` | something changed after the proof: rerun `prove`                                                                                                                                 |

## Ask once

When `prove` prints `ok prove`, send the user one message:

```text
<id> 명세와 증명이 끝났습니다. 승인하면 테스트 생성 → RED → 구현 → 리뷰까지 진행합니다.

규칙: R1 … (한 줄씩)
7축: Data … / Value … / Async … / Order … / Entry … / Environment … / Platform …
증명: <proof.json의 laws>, 공간 <space.cases>개 trace(bound <n>)
질문: Q1 … ★ <추천> (답이 없으면 ★로 진행)
바꿀 점이 있으면 알려주세요. 이대로면 "승인"이라고 답해 주세요.
```

Then wait. When the answer changes a rule or a question, edit the SPEC and the Bend files and rerun `prove`; the
user has decided, so do not ask again. Then run `fod.mjs approve <id> --by "<user>"`. Design-only work stops here.

Next: [step 3](3-generate.md).
