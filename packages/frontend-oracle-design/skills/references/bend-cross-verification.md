# Mandatory Bend formal model path for every Oracle work

Bend closes the defined problem space mathematically, fast-check attacks the real implementation and
the edges of that space, and the counterexamples they find widen the problem space itself.

Every Oracle run—Low, Medium, High, Design-only and Delivery—uses this path; do not gate it on
applicability or an explicit request. The world and its adequacy checks are always required; the
behavior model (`MODEL.bend`, `LAWS.bend`, `PROOF.bend`) is required when the Order or Async family is
part of the space and optional when the source excludes both — then the world conformance tests of §4
carry the product evidence. Model the smallest pure core when the product contains one, and
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
(`oracle.package.json`, in the Oracle directory `.ai/oracles/<id>/` beside the card, placement below): one JSON
file that names the sources and records the author's reading, read by every tool that previously parsed
the card. Its `repo:` locations resolve from the repository root, exactly like the card's Source
Registry, so the same string names the same file in the package, the projected card and its locked copy.
Source text that exists only in the conversation is saved verbatim under `.ai/oracles/<id>/sources/`,
never in the product tree.

| Stage   | Package content the tools require                                                                                                                                                            | Command                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| model   | sources (verbatim, located), the Outcome reading, the Space discovery record (`spaceDiscovery`), the world record and its terms, each input family decided, goals with their author, hazards | `oracle-package.mjs validate --stage model` |
| project | policies, contract predicates named by model symbol, notApplicable, the Inherited disposition, behavior model and law rows                                                                   | `oracle-package.mjs validate`               |

The model stage needs no card, no `O*` row and no contract: the analyst and the adequacy check start from
the sources and the axes the user confirmed in the Space discovery interview of
[`card/case-space.md`](card/case-space.md) (`packageVersion: 2`; version 1 is the earlier shape, read as
before). Contract predicates are Bend defs named by symbol (`Race.staleNeverShown`); the
card projection gives them `O*` IDs, and a `row` pin in the package keeps an ID stable across revisions
so evidence never moves to a different meaning. Never create empty `O*` rows, placeholder policies or a
pending approval to get past the model stage. For retries, delays, staleness, error kinds, remounts or
request counts, model them with [`model-patterns.md`](model-patterns.md) instead of folding them into one
event. Start from [`model-package.example.json`](model-package.example.json),
a complete package that passes `validate --stage model`; replace every value. Do not take `cat` of a fixture's
`oracle.package.json` as a template (47KB of discovery records), and do not start from `MODEL.bend` or a
hand-written card: a card without a package has the legacy shape and review rejects it for new work. A package whose touched code exposes no Props, shared
API, state union or trust-boundary type may declare `typeContract: {notApplicable, paths}` — the reason
and the investigated files; it is projected as `## Type Contract` and only then drops the
`type-contract:reported` label.

Ask before modelling, not while modelling. A Bend model is total: every (state, event) cell needs an answer, and
a cell the sources leave open surfaces as a question only when its transition is written. Put those cells in front
of the user once, before the author writes `MODEL.bend`. Take them from the analyst's `## State Model` (an empty
cell, or a cell that disagrees with the author's reading) and, for each async operation, from this checklist: a
late success after a timeout, cancel or route exit; a late failure after a success; a response from an older
request after a newer one; a duplicate completion; a lost response whose server effect is unknown; a retry while
one is pending; an unmount before the request settles. Each cell is one of `source` (quote the `S*`), `default`
(an approved project default) or `question`. Record them in the package as `asyncCells: [{operation, cells}]` with
the seven keys `late-success-after-cancel`, `late-failure-after-success`, `older-response-after-newer`,
`duplicate-completion`, `lost-response`, `retry-while-pending`, `unmount-before-settle`; each cell is
`{decision: source | default | n/a, ref: S*}` or `{decision: question, ref: Q* | H*}`. When Async is in a version 2
space, `oracle-stage.mjs advance --to MODELED` refuses a package that leaves any cell undecided. Questions that kill a model branch go out together as one A/B batch;
the rest become holds ([`card/case-space.md`](card/case-space.md#holds--a-question-that-blocks-only-part-of-the-scope)).
A project default is a policy set the user approved once — for example newest request wins, no rollback after a
newer completed mutation, one success notice per logical operation. Save the approved text verbatim as a source
and cite its `S*`; a recommendation the user did not approve is never a default, and a default stays visible on
the card as the policy of the cells it decided.

Design the proof before the first Bend file. For each law write the claim, its quantifier scope (all traces, all
transitions from states that meet a precondition, one fixed trace, or a witness) and the cells and policies it
reads. A law that reads an open cell takes the policy as a model parameter: prove now every law that holds under
each option, and let only the policy-dependent laws wait as holds. Never pick a policy inside the model to make a
law provable — that is a silent decision. Report each result by its scope: a fixed trace is not all traces, and
`exs trace` shows a path exists, not that every run reaches it.

1. **Two readings.** When native delegation is supported, authorized and has capacity, dispatch one
   read-only model analyst with only the file `oracle-adequacy.mjs model-input --package <pkg>` writes outside the repository:
   the source text verbatim, the hazards and the authoring rules — no Outcome reading, policy sentence,
   term, goal, contract, model file or product code of the author. The analyst writes the world record,
   assumptions and goals of [`adequacy.md`](adequacy.md) — and, when the flow has states, its own `## State Model` — in parallel with the author, who writes the behavior model and the contract predicates; run the analyst on the newest model the host can dispatch, from another family when one is as recent. Record each goal's `author` (`analyst` or `controller`). The author never edits
   the analyst's output — `World.bend` is that output byte for byte, with no second copy; a disagreement is an Open question. Without delegation, record the limitation
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
model (placement below), inside the scan root and outside the Oracle directory. Read
[`model-patterns.md`](model-patterns.md) first: define rules, never tables of answers, and state laws
that pin every result.

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
server result is unknown — is a `Q*`, never a guess inside the model. When it blocks only part of the scope,
record it as a hold (`card/case-space.md`) and model the rest; when nothing is left to model, `NEEDS_DECISION`.

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

With a behavior model, run both before showing the Draft and report each as one journal line (status, counts, digest),
never a saved output file; without one, the adequacy check is the pre-lock check:

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
It also reports the transition cover: every configuration the model can reach (its state plus the events the
environment allows) takes every allowed event once, through the shortest trace that reaches it. A finite
model is `closed` — every (configuration, event) pair runs, including those first reached past the bound;
a state that grows without bound is `capped` at the bound with the depth it covered, and fast-check samples
past it. The projected Case space states which. That is the model's possible space; `emit-trace` runs a
minimum cover of it on the product (§ `emit-trace`).

With a behavior model, lock only when `prove` is `proven` and the space is complete; show the case count and the traces for
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
card with a Formal Model; a card without one registers `bend-adequacy:reported`,
`world-conformance:reported` and `type-contract:reported`, and generates its product tests with
`oracle-projection.mjs emit-world (--package <pkg> | --card <oracle.md>) --adapter <world adapter> --out
<formal dir> --row <O*>`: one test per coordinate setting the assumptions allow, judged by the outcomes
the compiled world allows (`violates O*` or `MODEL_GAP`), run under `world-conformance:reported`. For a card projected from a model package, `init` enforces it: it refuses with
`STACK_LABELS_REQUIRED` unless all four are registered and with `PACKAGE_UNLOCKED` unless the lock
covers the package named in the generated region. A legacy card without a generated region keeps the
earlier gates (`FORMAL_PROOF_LABEL_REQUIRED` with a Formal Model, `ADEQUACY_LABEL_REQUIRED` with an
Adequacy section); for it, registering all four remains an operating contract the runner does not
infer. A card that declares `## Type Contract` not applicable registers the other three labels only.
Through the approved `$test` flow, write in the target
repository's existing test runner. Recommend `vitest` with `fast-check`: `vitest` runs TypeScript, JSX
and a per-file `jsdom` environment, so one projected model can drive both the pure core and the real
React component through the adapter, and the bundled vitest reporter records each case. A repository
that already uses `node:test` keeps it. A repository with no runner lists `vitest` and `fast-check`
as one dependency approval item in the Draft, never installed before `yes`. In that runner:

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

The model is the oracle, not the product's design. Write the product by the state ladder
([`types/state-ladder.md`](types/state-ladder.md)): never mirror the model's message union, `step` or
state record as a reducer, transition table or state machine, never extract one so a test can drive
it, and never import the model or its compiled module from product code — the conformance would then
compare the model with itself. The tests reach the product only through the adapter, so the product
keeps the shape the ladder gives it.

### Formal Oracle Projection — generated conformance tests

Instead of hand-writing the conformance test, generate it from the locked model with
`scripts/oracle-projection.mjs`. Every piece except the adapter is derived from Bend, so the test adds no
second meaning: inputs come from the Bend types, expected values from the compiled model, judgments
from compiled relation defs. The generated file starts `AUTO-GENERATED — DO NOT EDIT`, ships the
compiled model beside it (the product's CI needs no Bend), and carries the SHA-256 of every model
source: a changed source fails the file with `STALE_GENERATED_TESTS` until it is regenerated.

#### Placement — laws and tests next to the code, the run in the Oracle directory

Put the Bend files, the adapter and the generated files in one `__test__/formal/` directory at the
narrowest architecture unit the model covers, following the test-locality rule of `$test` and
[`fsd.md`](fsd.md). Nothing else goes there:

```
features/feed-infinite-scroll/
  api/feed-query.ts                 product code — the query owns pages, retries and fetch state
  ui/FeedGrid.tsx                   product code — shaped by the state ladder, not by the model
  __test__/formal/
    MODEL.bend  LAWS.bend  PROOF.bend  World.bend   authored, locked (PROOF is free)
    feed.adapter.tsx                the boundary — drives FeedGrid; written by the AI, reviewed
    feed.model.mjs                  generated: compiled model, imported only by the test
    feed.oracle.test.mjs            generated: conformance test
    BUGS.json                       authored: traces of bugs that happened, beside MODEL.bend
.ai/oracles/<id>/                   the run: card, journal, oracle.package.json, sources/, lock, ledger
```

- A model of one segment's logic goes in that segment's `__test__/formal/`; a model spanning several
  segments of a slice goes in the slice's `__test__/formal/`; shared pure logic in the nearest shared
  unit's. Outside FSD, next to the modeled file; an explicit repository convention wins.
- Moving or deleting the slice moves or deletes its model, laws, adapter and generated tests with it,
  and `__test__` keeps them out of the production bundle. No slice imports another slice's `formal/`,
  the same direction rule as the layers.
- Run `emit-*` with `--adapter` and `--out` both pointing at that `formal/` directory. What belongs to
  one revision, not to the code, stays in `.ai/oracles/<id>/`. A sampled fast-check failure prints its
  seed and path; replay it, and its verdict carries it forward as a `VALID_RED` test, a journal line or
  an Open question. Append an `implementation-defect` trace to `BUGS.json` beside `MODEL.bend` as
  `{ "id": "B<n>", "trace": [...], "note": "..." }` — never an expected value.

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
  `eval`/`vm`), or that imports no product module at all (`react`, `react-dom` and `@testing-library/*`
  are the render harness, not the product), and refuse an adapter that imports one of those without
  exporting `dispose` (`adapter-dispose-missing`): the sampled property runs inside one test, so the
  runner's `afterEach` cleanup never runs between samples. Each generated file re-runs that audit so a
  later edit fails the test. The audit is a static heuristic, not a proof of honesty: an adapter that
  re-implements product logic inline, or hides a model behind an innocent-looking product import, is
  still found only by the review checklist below.
- Review: the existing independent review reads the adapter against the card, using this checklist —
  each model event or command maps to exactly the product call its term's `Path` names; each
  observation is read through the product path its term names (no test double, no internal field the
  Path does not name); no product logic or expected value is re-implemented in the adapter; unknown
  inputs throw; `step` feeds one event and then waits until the screen settles (an `act` flush or the
  deferred barrier releasing), never a fixed sleep tuned to the expected value; `dispose` unmounts and
  restores every client, timer and global the case installed; the residue fields are each recorded in
  Terms or raised as candidates. A finding is a
  harness defect and goes through the existing harness-repair budget; it never changes the locked
  model, laws or observation meaning.

- `emit-trace (--package <pkg> | --model --prefix --bound) --adapter --out --row --runs N [--max-length L]`
  (differential): the minimum cover (`[O*] [T…]`, expectations from the model) — the fewest traces, each
  the shortest legal route to a configuration plus one event, that take every event class, every event class ×
  state class pair and every observed class once, with equivalence classes and boundary values doing the
  folding (a domain of at most five values keeps each value; a wider one keeps low, low+1, one mid value,
  high-1 and high; an array counts by length): a 13-event model whose space is 2,197 traces at bound 3 runs
  tens of traces, not thousands. The model still enumerates the whole space, so write the event alphabet as
  classes — one event per class and the boundary values of a payload, not every value. A defect that needs
  three classes at once is left to the fast-check sample. Each trace in `BUGS.json` beside `MODEL.bend` runs
  as `[O*] [B…]` with the current model's expectation; editing it makes the test stale, and a trace the
  environment no longer allows stops generation (`BUG_OUTSIDE_SPACE`). With `--package` the joint cases of
  `space-cross-check` (`[O*] [J…]`: each declared world value the test sets runs one trace that shows the
  declared behavior values — 4 cases cover the 33 world × behavior pairs of the paging fixture, against 9,120
  runs for the full product; `init(coordinates)` starts the product on that setting and must declare the
  parameter, or the case fails `ADAPTER_JOINT_UNSUPPORTED`; a failure means a product defect or an axis the model
  must take), then N fast-check traces drawn
  longer than the bound; a missing, zero or non-integer `--runs` is refused (`SAMPLING_REQUIRED`).
  fast-check draws choice indices over the full non-negative range and the model's `next(history)`
  picks the event, so every event the environment offers can be drawn (a fixed small index range under
  modulo would give later choices probability zero), no forbidden trace is generated, and shrinking
  yields shorter, earlier choices. The generated test counts what fast-check executed and the length
  each trace actually reached: it prints `{"fastCheck": {requested, executed, beyondBound, longest,
seed}}`, fails if fewer runs executed than requested, and fails if the environment allows traces past
  the bound yet no sample reached one — a drawn array longer than the bound is not a trace past it when
  the environment ends early. Two stages: the first half draws uniformly and counts cover-item hits; the
  second freezes them and weights each event by Σ 1/(1 + hits) of its items (frozen, so shrinking stays
  deterministic). Each run also draws a swarm subset of event kinds. `{"coverage"}` reports zero-hit items,
  Good–Turing and 3/N; up to 8 forbidden-event probes report `ignored`, `unspecified-behavior` or
  `unhandled-event` as POLICY_GAP candidates. Neither fails the test. Longer traces over the same events and assumptions are more cases, not a
  new axis. The adapter is the one above (`init`, `step`, `observe`, optional `dispose`). Pass
  `--runner vitest` in a vitest repository, the recommended runner above.
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
- Both `emit-*` and `replay --adapter` await every adapter call, so a synchronous reducer adapter and
  an async React adapter use the same generated file. Each call must settle within `--case-timeout` ms
  (default 5000) or the case fails with `ADAPTER_TIMEOUT` naming the step; that is a harness failure,
  never `VALID_RED`. `dispose(state)` runs after every case and every sample, pass or fail. A
  `.tsx`/`.jsx` adapter needs `--runner vitest`, and `--environment jsdom` (vitest only) writes the
  `// @vitest-environment` pragma as the file's first line. `oracle-model.mjs conform` and
  `oracle-discovery.mjs` still call the adapter synchronously; run them on the pure core until they
  await too.
- Values are the compiled Bend runtime shape (Bool is a boolean, Nat a BigInt, List `Con`/`Nil` cells,
  data `{$: <constructor>, ...fields}`); only the adapter converts to product values.
- Name the generated tests' row in `evidence.json` as for a hand-written conformance test; run them
  through `oracle-run.mjs exec`. Report `formal: proven` for the model and
  `conformance: tested` (exhaustive N / sampled M runs, seed) for the product — never proven.
- A failure prints the step or the pair; a sampled failure also prints fast-check's seed, path and
  shrunk counterexample. Replay it with
  `oracle-projection.mjs replay --model --prefix --trace <json> [--observed <json> | --adapter]`:
  `outside-space` (the environment forbids an event — the model missed it too; reopen the problem
  definition, never force it into the nearest event), `implementation-defect` (the model predicts a
  different observation — reproduce it as `VALID_RED`) or `model-agrees` (if it is still a bug, the
  specification is wrong — `POLICY_GAP`). The expected observation or the allowed events are re-checked
  by the kernel as a law, so a compiled-JS miscalculation cannot pass as a verdict. After a new
  revision, the counterexample is closed only when it replays inside the space and is judged.
- `oracle-model.mjs conform` also reports `residue` when the adapter exports `snapshot(state)`: product
  fields that change while the observation stays the same. Record each in `## Terms` as not observed,
  with a reason, or raise it as a candidate axis.

#### Writing fast-check tests from a Bend model

Generate first; hand-write only what `emit-*` cannot express, and keep the same rule either way: the
model computes every expected value, fast-check only chooses inputs, the product is reached only
through the adapter.

1. **Pick the mode from the card.** An Order or sequence dimension → `emit-trace` (the model's
   `next(history)` is the environment). A per-step rule over a state·command domain, or several
   allowed results → `emit-state` with relations proven in `LAWS.bend`. `emit-trace` drives the real
   component; `emit-state` needs a pure product function over exactly that domain, so use it only
   where the ladder already produced one (`moveColumn(order, from, to)`), never a reducer written
   for the test.
2. **Write the adapter, not the test.** Map each event to the product call its term's `Path` names,
   read the observation through the product, throw on anything unmapped. For a React component:

   ```tsx
   // feed.adapter.tsx — run with: emit-trace ... --runner vitest --environment jsdom
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
   import { act, render } from '@testing-library/react'
   import { FeedGrid } from '../../ui/FeedGrid'

   const flush = () => act(async () => {})

   export async function init() {
     const net = deferredFetch() // the test owns when each response resolves
     const io = installFakeIntersectionObserver()
     const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
     const ui = render(
       <QueryClientProvider client={client}>
         <FeedGrid />
       </QueryClientProvider>,
     )
     await flush()
     return { ui, net, io, client }
   }

   export async function step(s, event) {
     if (event.$ === 'Enter') s.io.enter(s.ui.getByTestId('feed-sentinel'))
     else if (event.$ === 'Resolve') s.net.resolve(event.id)
     else throw new Error(`unmapped model event ${JSON.stringify(event)}`)
     await flush()
     return s
   }

   export function observe(s) {
     return { $: 'View', items: s.ui.queryAllByRole('article').length }
   }

   export function dispose(s) {
     s.ui.unmount()
     s.client.clear()
     s.io.restore()
     s.net.restore()
   }
   ```

   The model's `Resolve` event, not a timer, decides when a response lands — out-of-order responses
   come from the model's environment, so fast-check explores them with expected values attached.
   `deferredFetch` and `installFakeIntersectionObserver` stand for the repository's own test helpers:
   the pending barrier of [`bva.md`](bva.md) around `fetch`, and an observer the test triggers. The
   adapter receives plain values (a `Nat` is a number) and returns plain values; `observe` reads the
   DOM by role, never component state.

3. **Run it** through `oracle-run.mjs exec` and read the printed `fastCheck` line: `executed` must
   equal the requested runs and `beyondBound` must be positive when the environment allows it.
4. **On failure** copy the shrunk trace into `replay --adapter` before touching code; the verdict
   decides product fix, model revision or `POLICY_GAP`.

Hand-written fast-check, only for what projection cannot express (a property spanning two models, an
oracle that is a card `I*` invariant rather than a Bend def):

- `fc.asyncProperty` + `await fc.assert(..., { numRuns, seed })` with a fixed seed recorded in the
  report; count executed runs and assert the count, as the generated file does.
- Draw indices and let the model choose the event; never write a parallel arbitrary of "valid"
  events — it drifts from the model the first time the model changes.
- Compute the expected value by calling the compiled model, never by restating its rule in the test.
- Clean up inside the property (`try … finally`), not in `afterEach`.
- `fc.scheduler` is for interleavings the model does not name; when the model has the event, drive it
  from the trace instead so the expected value comes with it.
- Fixed sleeps, `toBeTruthy` and `>0` assertions are forbidden here as everywhere ([`bva.md`](bva.md)).

### Attacking the space after GREEN — discovery-driven closure

Conformance shows the product matches the declared space; it cannot show the space is the right one.
With a model package, [`discovery.md`](discovery.md) runs `oracle-discovery.mjs close` after
`IMPLEMENTED_GREEN` and before the final report: the requirement inventory, the declared fault model
(mutants run in child processes), metamorphic relations, the exploration operators and runtime
anomalies attack the space, and every candidate they find goes to a human decision and a new revision.
The closure verdict and its residual-risk list are evidence in the report, not a delivery state.

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
