# Step 2 — Proof

Goal: a Bend model of the behavior, a law for every rule, a kernel-checked proof, one independent reading of the
model, and the user's one approval.
Read [bend-proof](../references/bend-proof.md) in full before writing Bend; read
[model-patterns](../references/model-patterns.md) when the model has time, retries, error kinds, counters,
collections or identities.

## Write three files beside each other (the SPEC's `model` path)

1. **`MODEL.bend`** — the machine.
   - `type State` (control state plus data in finite classes or counters) and `type Msg` (every event: user
     commands, responses, timers, other tabs).
   - `<Prefix>.init() -> State`, a total `<Prefix>.step(s, m) -> State` (an ignored event is a named outcome,
     never a missing arm), `<Prefix>.observe(s)` (what the screen and the network show) and
     `<Prefix>.next(+h: +List<Msg>) -> List<Msg>` (the events the environment allows next). A history read
     more than once takes `+` on the parameter and the type, in `next` and in any `run(+ms: +List<Msg>, s)`.
   - Name no type or constructor after one Base already declares (`Done`, `Fail`, `Some`, `None`, `Nil`,
     `Con`, `Result`, `Event`): use `Sent`, `Failed`.
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
the kernel proof, `prove-reach` when the SPEC sets `safe`, the trace space at `bound`, and how far the cell
relations pin the next observation — all at once. Repair a file by editing the reported lines, not by writing it
again.

Each code and its fix:

- `MODEL_FILE_MISSING`: write the three files at the SPEC's `model` path.
- `RULE_WITHOUT_LAW`: add `# R<n>:` above the law that states it, or mark the rule `(모델 밖: <reason>)`.
- `AXIS_NOT_IN_MODEL`: name the model identifiers for that axis in backticks; each must exist in `MODEL.bend`.
- `PROVE_MODEL_INVALID`: fix the Bend error it prints
  ([model-patterns](../references/model-patterns.md#bend-check-failures)); `consumed more than once` is the usual
  first one: mark that parameter `+s`.
- `PROVE_FAILED`: complete the proof (bend-proof, "Reading a failure"); a counterexample means the model or the
  law is wrong.
- `PROVE_REACH_FAILED`: the printed trace reaches a state that breaks `safe`: fix `step` or ask whether the rule
  holds.
- `SPACE_INCOMPLETE`: lower `bound`, or keep the state finite.
- `MODEL_EVENT_NEVER_OFFERED`: let `next` offer that event wherever it can happen (before setup or loading too),
  raise `bound` when it needs a longer trace, or delete the constructor.
- `MODEL_OBSERVES_NOTHING`: `observe` must return what the rules talk about: the shown values, the request count.
- `LAW_DUPLICATE`: two laws say the same thing: make each witness end in the state its own rule produces.
- `LAW_INIT_UNPINNED`: add a law that fixes the start: `observe(init())` equals what the Entry and Data axes
  say, or a witness from `init`.
- `LAW_FRAME_MISSING`: the step keeps a field the cell relations leave open: say in that event's relation that
  the field stays, or add the frame law.
- `APPROVE_PROOF_STALE`: something changed after the proof: rerun `prove`.

## Have the model read before asking

A wrong model found after GREEN costs a new approval and a new RED, so it is read here. After `ok prove` start
one reviewer in a fresh context on the latest model (in Claude Code an Agent with `model: "opus"`). Give it
paths, not your conclusions: the SPEC, the three Bend files, `proof.json`, bend-proof's Reviewer checklist and
this one. While it reads, read [step 3](3-generate.md) and draft the adapter; `gen` waits for the approval.

- Each witness ends in a state only its rule explains.
- `observe` returns what each rule talks about: a count for "once" or "at most N" (it reaches N+1 within
  `bound` instead of stopping at N), the value a call settles with, the error. Each cell `proof.json` counts
  as `strength.free` is a deliberate property relation or a question.
- Every 7-axis value is reachable in the model, or its `N/A` reason holds. `next` offers every event wherever
  the user or the environment could cause it, including before setup is done.

The reviewer returns all findings once, ordered blocker, major, minor, nit, each with `file:line`, a failure
scenario and a fix. Apply every finding and rerun `prove`; one that needs the user's decision becomes a question
in the SPEC. The model is read once per approval.

## Ask once

Then send the user one message:

```text
<id> 명세와 증명이 끝났습니다. 승인하면 테스트 생성 → RED → 구현 → 리뷰까지 진행합니다.

규칙: R1 … (한 줄씩)
7축: Data … / Value … / Async … / Order … / Entry … / Environment … / Platform …
증명: <proof.json의 laws>, 공간 <space.cases>개 trace(bound <n>), 고정 <strength.pinned>칸·자유 <strength.free>칸(strength가 null이거나 skipped가 있으면 생략)
독립 검토: 지적 <수>건 반영, 질문으로 넘김 <수>건
질문: Q1 … ★ <추천> (답이 없으면 ★로 진행)
바꿀 점이 있으면 알려주세요. 이대로면 "승인"이라고 답해 주세요.
```

Then wait. When the answer changes a rule or a question, edit the SPEC and the Bend files and rerun `prove`; the
user has decided, so do not ask again. Then run `fod.mjs approve <id> --by "<user>"`. Design-only work stops here.

Next: [step 3](3-generate.md).
