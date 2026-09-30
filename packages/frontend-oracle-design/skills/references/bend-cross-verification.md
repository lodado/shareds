# Mandatory Bend formal model path for every Oracle work

Bend closes the defined problem space mathematically, fast-check attacks the real implementation and
the edges of that space, and the counterexamples they find widen the problem space itself.

Every Oracle run—Low, Medium, High, Design-only and Delivery—uses this path; do not gate it on
applicability or an explicit request. Model the smallest pure core when the product contains one, and
represent unsupported values or effects explicitly in the model boundary and Terms rather than
dropping them. Bend does not make strings, negative values, 64-bit values, floating point, UI, CSS,
I/O, time or randomness disappear: unsupported or unresolved scope is `NEEDS_DECISION`, and a missing
tool or failed proof is `FAIL`. Never narrow the approved problem merely to obtain a proof.

This is a mandatory verification technique inside the existing card, lock, ledger and review—not a
second orchestrator, approval, card or delivery state. Oracle owns approved policy and transitions;
`$test` owns behavior tests and judgment. It never bypasses confirmation, lock, ledger or review.

The chain is model-first: source text → the author's reading and an independent reading → a Bend world,
behavior model and laws → axes, observations and event orders derived from the model → counterexamples
that refine them → a card projected from the model for the user to approve → a lock → tests generated
from the same model against the real product. AI proposes every link; `bend`, `oracle-model.mjs`,
`oracle-package.mjs`, `oracle-adequacy.mjs`, the card lint, the lock and the runner judge them. Keep
apart what each check establishes: structured is not faithful, type-checked is not proven, proven about
the model is not proven about the product, a finite space checked is not every run, and a card that
agrees with its own model is not thereby faithful to the source.

Authority stays where it was. The source text, approved policy and mandatory constraints decide what
must hold; the model and laws express that meaning; derived axes and the card show the formalized
meaning and its scope; tests and runs are evidence about the product; independent review judges the
reading, the modeling, the adapter and the evidence links. A requirement that is hard to prove is never
narrowed to fit Bend, and a phenomenon the model cannot express is never declared harmless.

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
- `ensure-bend.mjs` provides Bend only. `bend --verdict` builds its Lean kernel on first use and needs
  the Lean toolchain Bend names (Lean v4.34.0 for Bend 2.0.34, via elan); installing it follows the same
  environment rules. Without it every proof and adequacy verdict is `unavailable`.
- When `ensure-bend.mjs` fails (offline, sandbox, unsupported platform, checksum mismatch), record the
  printed code as `ENVIRONMENT_DEFECT` → `FAIL`; draft no incomplete `## Formal Model` and do not
  continue as if mandatory verification passed. Never replace a proof with tests silently or call a
  tool failure “not applicable”.
- Keep UI, browser, network, foreign code and uncontrolled time/randomness outside the pure model and
  name the Oracle rows that check them. An assumption about an external effect is not a proof of it.

## 2. From source text to a locked model — model-first

The card is no longer written first. Work enters through the **model package**
(`oracle.package.json`, in the `formal/` directory next to the modeled code, placement below): one JSON
file that names the sources and records the author's reading, read by every tool that previously parsed
the card. Its `repo:` locations resolve from the repository root, exactly like the card's Source
Registry, so the same string names the same file in the package, the projected card and its locked copy.

| Stage   | Package content the tools require                                                                                  | Command                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| model   | sources (verbatim, located), the Outcome reading, the world record and its terms, goals with their author, hazards | `oracle-package.mjs validate --stage model` |
| project | policies, contract predicates named by model symbol, notApplicable, family exclusions, behavior model and law rows | `oracle-package.mjs validate`               |

The model stage needs no card, no `O*` row and no contract: the analyst and the adequacy check start from
the sources alone. Contract predicates are Bend defs named by symbol (`Race.staleNeverShown`); the
card projection gives them `O*` IDs, and a `row` pin in the package keeps an ID stable across revisions
so evidence never moves to a different meaning. Never create empty `O*` rows, placeholder policies or a
pending approval to get past the model stage.

1. **Two readings.** When native delegation is supported, authorized and has capacity, dispatch one
   read-only model analyst with only the file `oracle-adequacy.mjs model-input --package <pkg>` writes:
   the source text verbatim, the hazards and the authoring rules — no Outcome reading, policy sentence,
   term, goal, contract, model file or product code of the author. The analyst writes the world record,
   assumptions and goals of [`adequacy.md`](adequacy.md); the author writes the behavior model and the
   contract predicates. Record each goal's `author` (`analyst` or `controller`). The author never edits
   the analyst's output; a disagreement is an Open question. Without delegation, record the limitation
   and write `author: controller`: the tools then report `independence.evidence: none` and the adequacy
   claim as `self-consistency`, never as an independent reading. Agreement between agents is not approval.
2. **Derive the axes.** `oracle-package.mjs derive --package <pkg>` reads the world record, the behavior
   model's `step`/`observe`/state types and, with Bend, the bounded trace space. It emits one record per
   axis — role (`controllable`, `observable`, `hidden`, `environment`), model symbol, term, source,
   domain (model type, the product domain the terms state or `unstated`, the values enumerated by type or
   by the trace space with its bound), derivation (`structural`, `model-checked`) and limitations — plus
   model-checked **order obligations**: traces that apply the same events in another order and end
   differently (`order-sensitive`) or end alike through different observations (`history-sensitive`,
   which no end-state world can check). A sum type is split per constructor, so a field of one
   constructor is an axis conditional on that constructor, never crossed with the others. Unsupported
   declarations (parameterized types, unreadable constructors, `String`, unbounded domains) are
   diagnostics that make the derivation `incomplete`, never silent omissions. Coordinates and
   Observations are the controllable and observable world fields; they are not listed a second time.
3. **Refine by counterexample.** Run `oracle-adequacy.mjs check --package <pkg>` and the refinement loop
   of [`adequacy.md`](adequacy.md) on the package: a missing observation, a coarse coordinate, a weak
   contract or a product duty stated as an assumption each shows up as a kernel-checked counterexample
   before any card exists.
4. **Project the card.** `oracle-package.mjs project-card --package <pkg> --out <oracle.md>` writes the
   Outcome Brief, Source Registry, policies with their rows, the Behavior Contract (a `Formal` column
   names each row's def), Case space, Terms, Adequacy, Formal Model and Derived Axes inside an
   `oracle:generated` region whose marker records the input digest (the package and every Bend file it
   reaches, transitively) and the region's own digest. User Confirmation and any further explanation
   stay outside the region. The projector never writes an approval: the approving response is recorded
   in User Confirmation, and approval values in the Source Registry are copied from what the package's
   author recorded. Package strings containing a line break or an HTML comment marker are refused
   (`package-text-unsafe`), so no package value can inject a heading or end the region early. Card lint
   regenerates the region from the package with the installed Bend (never downloading) and compares it
   byte for byte: `card-generated-stale` when the package or a Bend file changed since projection,
   `card-generated-drift` when the inputs match but the region does not (a hand edit, even one that
   recomputed the marker's digest), `card-generated-unverified` when it cannot regenerate (no Bend), and
   `card-generated-missing` when the Source Registry registers a model package but the card has no
   region (stripped markers). A card written entirely by hand without a package is indistinguishable
   from a legacy card; review owns that case.
   Prose columns explain the formal meaning and never override it — whether they agree is review-owned.

Existing cards without a generated region are read and linted exactly as before. That keeps historical
records interpretable; it does not exempt new work from this order. A new card follows the model-first
path, and a legacy run continued under new requirements goes through the source and semantic delta and
a new revision.

Then formalize the behavior as three tracked files in the `formal/` directory next to the code they
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

The projection writes this section from the package's `behavior` (law rows cite policies and contract keys,
which become `O*` IDs); a legacy card carries it by hand:

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
reconfirmation, never an in-place relock. Design-only stops here at `ORACLE_READY` with the card and the three `.bend` files; it performs and
records `prove`, complete `space` and Adequacy checks, plus type-fest/static/fast-check plans and
availability, but writes or executes no target tests or production code. Delivery executes the
consumer checks under the four required labels.

## 4. Delivery: RED, conformance and the proof label

At `init`, register `--required-label bend-proof:reported`, `--required-label bend-adequacy:reported`,
`--required-label type-contract:reported` and `--required-label fast-check:reported` for every
card. For a card projected from a model package, `init` enforces it: it refuses with
`STACK_LABELS_REQUIRED` unless all four are registered and with `PACKAGE_UNLOCKED` unless the lock
covers the package named in the generated region. A legacy card without a generated region keeps the
earlier gates (`FORMAL_PROOF_LABEL_REQUIRED` with a Formal Model, `ADEQUACY_LABEL_REQUIRED` with an
Adequacy section); for it, registering all four remains an operating contract the runner does not
infer.
Through the approved `$test` flow, write in the target
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
  product state throws (never a default); `conform` reports `residue` from `snapshot`. Both `emit-*`
  commands refuse (`ADAPTER_SUSPECT`) an adapter that imports the model, the compiled model, a `.bend`
  file, fast-check or an `oracle-*.mjs` script (query strings and comments do not hide it), that loads
  code the audit cannot read (a computed `import()`, `require`/`createRequire`, a file-system read,
  `eval`/`vm`), or that imports no product module at all; each generated file re-runs that audit so a
  later edit fails the test. The audit is a static heuristic, not a proof of honesty: an adapter that
  re-implements product logic inline, or hides a model behind an innocent-looking product import, is
  still found only by the review checklist below.
- Review: the existing independent review reads the adapter against the card, using this checklist —
  each model event or command maps to exactly the product call its term's `Path` names; each
  observation is read through the product path its term names (no test double, no internal field the
  Path does not name); no product logic or expected value is re-implemented in the adapter; unknown
  inputs throw; the residue fields are each recorded in Terms or raised as candidates. A finding is a
  harness defect and goes through the existing harness-repair budget; it never changes the locked
  model, laws or observation meaning.

- `emit-trace --model --prefix --bound --adapter --out --row --runs N [--max-length L]` (differential):
  every trace up to the bound with each prefix's expected observation, then N fast-check traces drawn
  longer than the bound; a missing, zero or non-integer `--runs` is refused (`SAMPLING_REQUIRED`).
  fast-check draws choice indices over the full non-negative range and the model's `next(history)`
  picks the event, so every event the environment offers can be drawn (a fixed small index range under
  modulo would give later choices probability zero), no forbidden trace is generated, and shrinking
  yields shorter, earlier choices. The generated test counts what fast-check executed and the length
  each trace actually reached: it prints `{"fastCheck": {requested, executed, beyondBound, longest,
seed}}`, fails if fewer runs executed than requested, and fails if the environment allows traces past
  the bound yet no sample reached one — a drawn array longer than the bound is not a trace past it when
  the environment ends early. Longer traces over the same events and assumptions are more cases, not a
  new axis. The adapter is the one above (`init`, `step`, `observe`).
- `emit-state --model --prefix --state <Type> --command <Type> --runs N (--relation <def>)... [--differential]`
  (property): every state·command pair of the Bend types when the domain is at most `--threshold`
  (default 256), and always a separate fast-check property of N runs over the same domain — small
  domains keep their exhaustive check and still sample; the property counts executed runs and fails
  below N. An unbounded Nat or List is refused until `--nat-max`/`--list-max` bound it; the bound is
  printed in the sampled scope and is a test bound, not the product's domain. Each pair goes through `concretize` → `step` → `project`; the round trip
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

`--verdict` needs the Lean kernel it builds on first use (Lean v4.34.0 for Bend 2.0.34). When the kernel
cannot be built, every verdict is `unavailable` — an `ENVIRONMENT_DEFECT`, never a failed or open proof.
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
