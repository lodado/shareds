# Automatic Bend formal model path for applicable Oracle work

Bend closes the defined problem space mathematically, fast-check attacks the real implementation and
the edges of that space, and the counterexamples they find widen the problem space itself.

Within the Oracle lane, assess applicability before Draft/lock without waiting for the user to say
"Bend". Automatically select this path for a pure calculation or deterministic state transition with
a meaningful invariant (for example bounded quantities, monetary conservation, stale responses, or
legal state transitions) whose domain fits Bend's `Nat`, `U32`, `Bool` and finite datatypes. A domain
that needs negative numbers, 64-bit values, strings or a provable floating-point result is not
eligible (Bend's F32 is axiomatic): record that reason and continue normal Oracle verification. Also
load it for an explicit Bend request. Start with one small core, not the whole UI; do not model copy,
CSS, trivial formatting, or external I/O alone. An explicit request outside the provable scope needs
an explanation, not a fake proof.

This adds a verification technique inside the existing card, lock, ledger and review — not a second
orchestrator, approval, card or delivery state. Oracle owns approved policy and transitions; `$test`
owns behavior tests and judgment. Low does not load this node. Automatic selection authorizes only
the pinned install in §1, never policy approval or bypassing the existing gates.

The chain is: source text → card policies and rows → a reference model and laws locked with the card
→ a generated oracle space → the product observed on that space. AI proposes every link; `bend`,
`oracle-model.mjs`, the card lint, the lock and the runner judge them. Keep apart what each check
establishes: structured is not faithful, type-checked is not proven, proven about the model is not
proven about the product, and a finite space checked is not every run.

## 1. Scope and capability before Draft/lock

- Identify the actual module/export, input domain, numeric representation/overflow, invalid-input
  behavior, state transitions, and external assumptions. Each assumption must trace to approved
  policy or remain an Open question; narrowing inputs just to make a proof pass changes policy.
- Run `scripts/ensure-bend.mjs` before drafting the model, in Delivery capability discovery and in
  Design-only. It reuses a pinned-version Bend already on PATH or under `BEND_HOME`/`~/.bend`;
  otherwise it downloads the GitHub release, checks it against the sha256 pinned in the script and
  unpacks it into the skill's own cache. It never pipes `curl` to a shell or edits PATH and shell
  files. Call the absolute path it prints with `BEND_NO_TELEMETRY=1`. Read `bend guide` before
  writing Bend; Bend 2 is not the old HVM runtime.
- When `ensure-bend.mjs` fails (offline, sandbox, unsupported platform, checksum mismatch), an
  automatically selected path records the printed code, drafts no `## Formal Model` and continues
  with normal Oracle verification; an explicit Bend request is `ENVIRONMENT_DEFECT` → `FAIL`. Never
  replace a proof with tests silently or call a tool failure "not applicable".
- Keep UI, browser, network, foreign code and uncontrolled time/randomness outside the pure model and
  name the Oracle rows that check them. An assumption about an external effect is not a proof of it.

## 2. From source text to a locked model

Write the card first: sourced `P*` policies and `O*` rows as usual. When native delegation is
supported, authorized and has capacity, dispatch one read-only model analyst with only the file
`scripts/oracle-adequacy.mjs model-input` derives — the Outcome Brief, the source text, the hazards
and the authoring rules, never the card's rows. It proposes the laws and environment assumptions; for
a finite world, the record, assumptions and goals of [`adequacy.md`](adequacy.md), whose check then
compares the two readings mechanically. The Controller maps each law to existing `P*`/`I*`/`O*` rows
and does not edit the analyst's output; a disagreement is an Open question. Agreement between agents
is not approval. Without delegation, independent contexts or capacity, record the concrete
limitation and run sequentially — never claim independence that did not occur.

Then formalize a small core as three tracked files in the `formal/` directory next to the code they
model (placement below), inside the scan root and outside the Oracle directory:

- `MODEL.bend` — the reference behavior: a state and a message datatype, `<Prefix>.init()`,
  `<Prefix>.step(s, m)`, `<Prefix>.observe(s)` (only what the contract observes, not internal
  bookkeeping) and the environment `<Prefix>.next(history)`: every message the environment can
  produce after `history`.
- `LAWS.bend` — imports the model and states each approved law as an open claim.
- `PROOF.bend` — imports `./LAWS.bend` and proves each law with `def Laws.<name>`. It is a proof
  candidate: never locked, freely repaired, and never a place to restate laws.

Translate precisely and record what is not translated. Check numbers and units, negation, "every"
versus "some", temporal order, "may" versus "must", and request count versus effect count: "sends one
HTTP request" and "the save takes effect once" are different laws, and a disabled button proves
neither. A policy the source leaves open — for example which id a retry uses after a timeout whose
server result is unknown — is a `Q*` and `NEEDS_DECISION`, never a guess inside the model.

The environment is where coverage is lost. `next` lists every event the environment can produce,
including user actions the product must reject or ignore; those stay in the space and their expected
observation is "unchanged". Exclude only events the environment itself cannot produce, citing the
source (a response cannot precede its request). Never drop an event because a correct product would
prevent it, never deliver responses in issue order only, never feed only valid input, and never let
an environment assumption restate the product obligation under test — report that circle as a
`POLICY_GAP`. The rebuttal reviewer treats `next` exclusions and `Out of scope` like `impossible`.

Add the section to the card:

```markdown
## Formal Model

- Model: S2
- Laws: S3
- Prefix: Search
- Bound: 4
- Observation: `Search.observe` is the request id whose results the list shows, 0 when none
- Out of scope: cancellation, retry, duplicate responses, a response before its request (S1)
- Not formalized: none
- Conformance row: O4

| Law              | Kind    | Cites       |
| ---------------- | ------- | ----------- |
| stale_ignored    | safety  | P2 O2       |
| latest_applied   | effect  | P3 O3       |
| latest_reachable | witness | P1 P3 O1 O3 |
```

`Model`/`Laws` are approved, non-implementation `repo:<path>.bend` Source Registry entries. `safety`
says something never happens, `effect` that a required outcome happens, and `witness` is an `exs`
law showing that outcome is reachable from `init`. The conformance row is the one `O*` row whose
evidence is the conformance run. `oracle-verify.mjs card` checks the section: required fields, a
bound of 1..8, law rows that match `LAWS.bend` both ways, citations of real `P*`/`O*`/`D*`/`I*`, a
witness for every policy with an effect law and at least one effect law (safety laws alone are
satisfied by a model that does nothing), every policy either formalized or listed under
`Not formalized`, laws that import the locked model, every transitively imported local file
registered as a source, and no foreign, `@unsafe` or hub-imported code. It checks links, not
meaning; whether a law says what its policy says is review-owned. A model with several allowed
observations for one prefix is not supported yet — list those policies under `Not formalized`.

## 3. Pre-lock checks: consistency, reachability and the space

Before showing the Draft, run and report both:

```sh
node <skill-dir>/scripts/oracle-model.mjs prove --dir <model-dir> --require <law>...
node <skill-dir>/scripts/oracle-model.mjs space --model <model-dir>/MODEL.bend --prefix Search --bound 4
```

`prove` runs `bend PROOF.bend --verdict` without a shell under a timeout and returns `proven`, `open`
(a `?TODO` or a law without a def), `unsafe`, `failed` (with the failing law), `timeout` or
`unavailable`, plus the command, exit status, raw output, law list and input digests. Only exit 0,
no signal and an exact `ALL PROOFS CHECK` line is `proven`; it refuses a `PROOF.bend` that does not
import `./LAWS.bend` or laws missing a required name before running. `proven` here means the model
satisfies every law — so the laws are jointly satisfiable — and each witness scenario is reachable.

`space` compiles `MODEL.bend` with `bend -o` into a temporary module and enumerates every trace of up
to `Bound` messages from `init` that `next` allows; each prefix's `observe` value is the expected
observation. Case IDs hash the trace, so the same model, bound and generator version give the same
cases and `spaceDigest`; no time or runId enters them. A budget stop keeps the explored cases and
reports `complete: false` — never trim cases to finish.

Lock only when `prove` is `proven` and the space is complete; show the case count and the traces for
the required scenarios with the law statements. `open`/`failed` means the model, laws or proof need
work or a question; `timeout`/`unavailable` follows the §1 failure rule. The user approves the laws,
environment, bound and observation line as part of the card. Lock with `--source` for `MODEL.bend`,
`LAWS.bend` and every local file they import. A later change to any of them is a new revision with
reconfirmation, never an in-place relock. Design-only stops here at `ORACLE_READY` with the card and
the three `.bend` files; it writes no target test or production code.

## 4. Delivery: RED, conformance and the proof label

`init` refuses a card with `## Formal Model` unless `--required-label bend-proof:reported` is
registered (`FORMAL_PROOF_LABEL_REQUIRED`). Through the approved `$test` flow, write in the target
repository's existing `node:test` harness:

- a proof check that calls `proveLaws({ dir, bin })` from `<skill-dir>/scripts/oracle-model.mjs` and
  asserts `status === 'proven'`, run through the ledger with `--label bend-proof:reported`;
- a conformance test that calls `loadModel` and `enumerateSpace` with the card's bound, asserts
  `space.complete`, and registers one test per case named `[<conformance row>] [<case id>] <label>`
  asserting `conformCase(space, entry, adapter).status === 'pass'`. The adapter maps each model
  message to the product's input and the product's observable state to the model's observation, as
  the card's Observation line says; it throws on an unknown message or state. Map these tests to the
  conformance row in `evidence.json`.

Invoke the pinned executable that `ensure-bend.mjs` printed. Do not invent a `bend` trusted adapter or
forge a reporter; a direct CLI run is `exit-only` evidence. Once their inputs are stable, launch the
proof run and the conformance/behavior runs as separate ledger-backed executions in one scheduling
batch and wait for both; each keeps its own label, runId and report path and shares no mutable
fixture. If the host cannot run them concurrently, record why and run sequentially. `VALID_RED` is a conformance case whose
product observation differs from the model's (for example the late-response trace), under `$test`'s
predicates; a compile error, `adapter-error`, missing tool or proof failure is not `VALID_RED`. Then
change product code only. A failing case returns `caseId`, `label`, `step`, `event`, `expected`,
`observed` and the `spaceDigest` — fix the product, the proof candidate or, as harness repair under
the existing budget, the adapter's mechanics; never the locked model, laws, bound, environment or
observation meaning, and never skip a case. GREEN needs both labels' runs fresh for the current
snapshot; a proof run is never reused as product evidence and an earlier GREEN never covers new
product bytes.

If the product itself runs Bend-generated code, run the conformance on that generated artifact and
its calling boundary; a proof of an unused model verifies nothing about the product.

### Formal Oracle Projection — generated conformance tests

Instead of hand-writing the conformance test, generate it from the locked model with
`scripts/oracle-projection.mjs`. Every piece except the adapter is derived from Bend, so the test adds no
second meaning: inputs come from the Bend types, expected values from the compiled model, judgments
from compiled relation defs. The generated file starts `AUTO-GENERATED — DO NOT EDIT`, ships the
compiled model beside it (the product's CI needs no Bend), and carries the SHA-256 of every model
source: a changed source fails the file with `STALE_GENERATED_TESTS` until it is regenerated.

#### Placement — everything formal lives in one `formal/` next to the code it models

Put every file of the Bend path in one `__test__/formal/` directory at the narrowest architecture unit
the model covers, following the test-locality rule of `$test` and [`fsd.md`](fsd.md):

```
features/feed-infinite-scroll/
  model/
    feed-pagination.ts              product code — the pure transition under test
    __test__/formal/
      MODEL.bend  LAWS.bend  PROOF.bend  World.bend   authored, locked (PROOF is free)
      feed.adapter.mjs              the boundary — written by the AI, reviewed
      feed.model.mjs                generated: compiled model
      feed.oracle.test.mjs          generated: conformance test
.ai/oracles/<id>/formal/            run evidence: ADEQUACY.bend/.json, REPLAY.bend/.json
```

- A model of one segment's logic goes in that segment's `__test__/formal/`; a model spanning several
  segments of a slice goes in the slice's `__test__/formal/`; shared pure logic in the nearest shared
  unit's. Outside FSD, next to the modeled file; an explicit repository convention wins.
- Moving or deleting the slice moves or deletes its model, laws, adapter and generated tests with it,
  and `__test__` keeps them out of the production bundle. No slice imports another slice's `formal/`,
  the same direction rule as the layers.
- Run `emit-*` with `--adapter` and `--out` both pointing at that `formal/` directory. Only run
  evidence stays under `.ai/oracles/<id>/formal/`: it belongs to one revision, not to the code. A
  sampled fast-check failure prints its seed and path; replay the shrunk counterexample with `--out`
  there so the record survives the test log.

#### The adapter — written by the AI, reviewed

The adapter is the one piece not derived from Bend, so it is the one piece that must be reviewed. The
AI writes it from the card's Terms `Path` column, Observation line and the model's types — not from
the expected results — during the harness step, then it passes two gates before its tests count:

- Machine: every generated test asserts the adapter's output has the Bend type's shape; `emit-state`
  asserts the round trip `project(concretize(s)) == s` on every state; an unmapped event, command or
  product state throws (never a default); `conform` reports `residue` from `snapshot`.
- Review: the existing independent review reads the adapter against the card, using this checklist —
  each model event or command maps to exactly the product call its term's `Path` names; each
  observation is read through the product path its term names (no test double, no internal field the
  Path does not name); no product logic or expected value is re-implemented in the adapter; unknown
  inputs throw; the residue fields are each recorded in Terms or raised as candidates. A finding is a
  harness defect and goes through the existing harness-repair budget; it never changes the locked
  model, laws or observation meaning.

- `emit-trace --model --prefix --bound --adapter --out --row [--runs N --max-length L]` (differential):
  every trace up to the bound with each prefix's expected observation, then, with `--runs`, fast-check
  traces longer than the bound. fast-check draws choice indices and the model's `next(history)` picks
  the event, so no trace the environment forbids is generated and shrinking yields shorter, earlier
  choices. The adapter is the one above (`init`, `step`, `observe`).
- `emit-state --model --prefix --state <Type> --command <Type> (--relation <def>)... [--differential]`
  (property): every state·command pair of the Bend types, or a fast-check sample when the domain is
  above `--threshold` (default 256) or infinite (`--nat-max`, `--list-max` bound the sample and are
  printed in its scope). Each pair goes through `concretize` → `step` → `project`; the round trip
  `project(concretize(s)) == s` is asserted every time, and each relation
  `<Prefix>.<R>(s, c, t) -> Bool` judges the projected result. A relation must be stated by a law in
  `LAWS.bend`; declare them in the Formal Model as `- State:`, `- Command:`, `- Relations:` (lint
  `formal-relation-*`). Relations may accept several results for one input, which the differential
  mode cannot express.
- Values are the compiled Bend runtime shape (Bool is a boolean, Nat a BigInt, List `Con`/`Nil` cells,
  data `{$: <constructor>, ...fields}`); only the adapter converts to product values.
- Name the generated tests' row in `evidence.json` as for a hand-written conformance test; run them
  through `oracle-run.mjs exec`. Report `formal: proven` for the model and
  `conformance: tested` (exhaustive N / sampled M runs, seed) for the product — never proven.
- A failure prints the step or the pair; a sampled failure also prints fast-check's seed, path and
  shrunk counterexample. Replay it with
  `oracle-projection.mjs replay --model --prefix --trace <json> [--observed <json> | --adapter] [--out <dir>]`
  (`--out` keeps `REPLAY.bend`, re-checkable in place, and `REPLAY.json` with the trace, observations,
  verdict and law):
  `outside-space` (the environment forbids an event — the model missed it too; reopen the problem
  definition, never force it into the nearest event), `implementation-defect` (the model predicts a
  different observation — reproduce it as `VALID_RED`) or `model-agrees` (if it is still a bug, the
  specification is wrong — `POLICY_GAP`). The expected observation or the allowed events are re-checked
  by the kernel as a law, so a compiled-JS miscalculation cannot pass as a verdict. After a new
  revision, the counterexample is closed only when it replays inside the space and is judged.
- `oracle-model.mjs conform` also reports `residue` when the adapter exports `snapshot(state)`: product
  fields that change while the observation stays the same. Record each in `## Terms` as not observed,
  with a reason, or raise it as a candidate axis.

## 5. What was established, and trust limits

Report each guarantee with its target, method and scope, separately:

- laws proven about the reference model, for every value of its types, by `bend --verdict`;
- the declared space enumerated in full (or incomplete, with the budget stop), traces up to `Bound`;
- the product observed and matched to the model on every prefix of those traces, through the adapter;
- not established: a formal correspondence between model and product, events listed out of scope,
  browser or network behavior, or unstated intent.

`--verdict` rechecks with a kernel that has a Lean proof; it does not prove the translation, the JS
backend that `space` runs, foreign I/O or compiler behavior. Keep `-o PROOF.bendtt` if the kernel
input needs inspecting. A digest detects change, not truth. The runner enforces labels, snapshots
and row evidence; it does not read Bend laws, so independent review compares the laws, `next`,
`Out of scope`, the adapter and the counterexamples against the policies. Classify before repair:
policy conflict → `POLICY_GAP`; missing proof or conformance evidence → `EVIDENCE_GAP`; a
demonstrated product mismatch → `PRODUCT_DEFECT`; tool or adapter failure → the environment/harness
route. Failing to construct a proof alone does not demonstrate a product defect.

## Official references

Checked against Bend v2.0.34, the version `scripts/ensure-bend.mjs` pins; a version bump updates its
checksums and this page together.

- [Laws, proofs and trust boundary](https://github.com/bendlang/bend/blob/v2.0.34/guide/GUIDE.md#laws-and-proofs)
- [JS module output of non-IO defs](https://github.com/bendlang/bend/blob/v2.0.34/guide/GUIDE.md#io-and-concurrency)
- [CLI verdict and exit behavior](https://github.com/bendlang/bend/blob/v2.0.34/bend2/main.ts)
- [Language limitations](https://github.com/bendlang/bend/blob/v2.0.34/README.md#limitations)
