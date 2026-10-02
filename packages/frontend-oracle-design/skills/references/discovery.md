# Discovery-driven closure — attack the declared space, absorb what escapes it

The declared oracle space Ω is never the whole world U. This loop does not try to prove Ω = U; it proves a
bounded claim, `ProductComplete(I | Ω, E, F, C)`: the implementation I satisfies the declared space Ω, the
declared exploration operators E no longer find an undecided candidate, the oracle kills the declared
fault model F, and whatever is left is listed as residual risk under the constraints C. It is never "no
bugs" and never "the space is complete".

This is evidence inside the existing card, lock, ledger and review — not a second orchestrator, approval,
ledger or delivery state. `oracle-run.mjs` still owns the delivery states; the closure report is
printed, not kept, and its verdict is derived from those states and the checks below. Nothing a
tool finds enters Ω by itself: a candidate becomes part of the space only through a recorded human
decision and a new revision.

## Where it sits

```text
 package (R*, terms, assumptions, world, behavior, F, metamorphic, operators)   ← model-first, §2 of bend-cross-verification.md
   ↓ project → approve → lock → Delivery: RED → GREEN → review
   ↓
 oracle-discovery.mjs close  ── deterministic verification L1–L5
                             ── exploration operators E → candidates ── Axis Breaker class
                             ── runtime anomalies (L7)
   ↓
 verdict + residual risk  ──  open candidates → human decision → new revision → project → approve → lock
```

Run it in Delivery after `IMPLEMENTED_GREEN` and again before the final report, after any change of the
package, product or adapters, and whenever a runtime anomaly or escape arrives. Design-only uses the
model-level checks (`oracle-adequacy.mjs check --package`, `oracle-package.mjs derive`) and does not
claim closure: several operators run the product.

## What the package declares for it

| Field                | Meaning                                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirements`       | the Requirement Inventory: one `R*` per source sentence, `quote` verbatim from the source location; goals, policies, assumptions, contract rows, N/A lines and `behavior` cite them. A sentence of an approved source that no quote contains is a `requirement-coverage` candidate |
| `assumptions[]`      | the Assumption Registry: owner, falsifier, `evidence`, `riskIfFalse`, `testability` (tested·monitored·untestable), `status` (open·confirmed·refuted)                                                                                                                               |
| `terms[].lifecycle`  | Ubiquitous Language: valid, invalid, transitions, owner, lifetime, invariant (optional; missing ones are reported as known unknowns)                                                                                                                                               |
| `axisOrigins`        | the Oracle Space Registry's non-default origins: `source`, `model`, `counterexample` (a candidate ID), `incident`, `analyst`, `review`, with `ref` and `reason`                                                                                                                    |
| `spaceVersion`       | the registry version; bump it when the axes change (a convention the reviewer checks — the tool reports the derived axes, not their history)                                                                                                                                       |
| `faultModel`         | F: `{id, class, file, find, replace, note}`; `file` is one of `product.files` and `find` occurs exactly once in it; `replace` is inserted literally; classes conditional, boundary, state-transition, permission, retry, timeout, error-suppression, ordering, caching, stale-data |
| `mutationThreshold`  | the required killed ratio over non-equivalent, in-scope mutants (default 1)                                                                                                                                                                                                        |
| `metamorphic`        | `{source, relations: [{id, transform, relation}]}` — Bend defs `T(t: List<Msg>) -> List<Msg>` and `R(a: Obs, b: Obs) -> Bool` — or `n/a: S<n> <reason>`                                                                                                                            |
| `product`            | the trace adapter, the world adapter, the product files the fault model edits, fast-check `runs` and `maxLength`                                                                                                                                                                   |
| `crossCheck`         | version 2: per declared dimension `{world: <field>}` or `{classify: <model def (s, m) -> T>}` with `values` (declared value → world value or constructor), and optionally `stateModel: {phase, step, states, events}`; `declared` defaults to the Space discovery record           |
| `operators`          | per operator: `n/a: S<n> <reason>`, or for a declared operator `modeled: <axis id>`                                                                                                                                                                                                |
| `residue`            | per product field the residue report names: `modeled: <axis id>` or `n/a: S<n> <reason>`                                                                                                                                                                                           |
| `aiRuns`             | recorded AI operator runs: operator, output file, agent, `inputDigest` of the exact input it received and `outputDigest` of the output as recorded                                                                                                                                 |
| `discoveryDecisions` | human decisions on candidates: `promoted` (with the `axis`, goal, contract key or assumption it became), `covered` (`by` the row that already rejects it — AI findings only), `out-of-scope`, `accepted-risk`, `equivalent` (surviving mutants only), `rejected`                   |

Out-of-scope, accepted-risk, promoted and rejected decisions cite an approved source text or an Open
question — never the package itself, a Bend model file or a source whose approval is not `approved`; `n/a`
dispositions follow the same rule. A decision that does not fit its candidate leaves it open: `equivalent`
closes only a surviving mutant, and `covered` only an AI finding (a deterministic operator's evidence is
exactly that no row rejects it). The tool never writes a decision — the same rule as User Confirmation.

## Exploration operators E

`oracle-discovery.mjs catalog` prints the list. Every operator has a recorded status each run: `run`,
`covered`, `not-applicable` (with its source), `vacuous` (nothing to attack), `incomplete` (a budget
stopped it), `not-run`, `undeclared`, `stale` or `invalid`. Only the first four let exploration close. A
source `n/a` replaces only `not-run` and `undeclared`: an operator that ran, was cut short or is invalid
keeps its status, and an AI operator's recorded runs are read whatever its disposition.

| Operator                                                                                   | Layer         | Attacks                                                                                                                                                     | Finds                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirement-coverage`                                                                     | deterministic | sentences of an approved source that no requirement quotes                                                                                                  | `requirement-gap`                                                                                                                                         |
| `space-cross-check`                                                                        | deterministic | the declared space against the Bend space: unmapped or unreached values, pairs split across the world and the behavior model, transitions only one side has | `new-axis`, `cross-term`, `silent-decision`, `assumption-risk`                                                                                            |
| `observation-sufficiency`                                                                  | deterministic | two worlds alike on every coordinate and observation that a goal judges differently                                                                         | `observation-gap`                                                                                                                                         |
| `goal-implication`                                                                         | deterministic | worlds every row allows that break a goal; flipped approved examples; open terms                                                                            | `weak-contract` and others                                                                                                                                |
| `goal-witness`                                                                             | deterministic | a contract that forbids the normal path, or contradicts itself                                                                                              | `vacuous-contract`, `contradiction`                                                                                                                       |
| `assumption-sensitivity`                                                                   | deterministic | "what if false" for each assumption: goals only it supports, worlds only it hides                                                                           | `assumption-risk`, `goal-gap-review`, `assumption-hides-goal`                                                                                             |
| `temporal-order`                                                                           | deterministic | order obligations of the behavior model while the world declares `order-timing` n/a                                                                         | `new-axis`                                                                                                                                                |
| `trace-extension`                                                                          | deterministic | behaviour patterns (event kind × kind of observation change) that exist only past the bound; sampled patterns count as covered                              | `range`                                                                                                                                                   |
| `boundary-perturbation`                                                                    | deterministic | event field values 0 and one past the largest the space uses, where the environment forbids them                                                            | `unspecified-behavior`, `unhandled-event`                                                                                                                 |
| `order-perturbation`                                                                       | deterministic | duplicated, swapped and early events the environment forbids                                                                                                | `unspecified-behavior`, `unhandled-event`                                                                                                                 |
| `projection-residue`                                                                       | deterministic | product state that varies under one observation                                                                                                             | `hidden-state`                                                                                                                                            |
| `world-model-gap`                                                                          | deterministic | product results the world calls impossible                                                                                                                  | `new-axis`                                                                                                                                                |
| `mutation`                                                                                 | deterministic | the declared fault model F, each mutant run in a child process against every check                                                                          | `oracle-weakness`                                                                                                                                         |
| `metamorphic`                                                                              | deterministic | `R(obs(t), obs(T(t)))` on every in-space pair, on the model and on the product                                                                              | `relation-invalid`                                                                                                                                        |
| `dependency-failure`, `latency`, `environment-variation`, `malformed-input`, `concurrency` | declared      | families no generic tool can synthesize                                                                                                                     | `modeled: <axis>` is checked: the axis is an input (a world coordinate or an event) with at least two values; the claim itself is listed as residual risk |
| `ai-explorer`, `cross-agent`                                                               | ai            | breaking the card; hidden assumptions and axes a domain expert adds                                                                                         | triaged candidates                                                                                                                                        |

Perturbations use only events the environment excludes — inside the space the conformance run already
judges them. A changed observation on such an event is behaviour the model says nothing about; it is a
question, not a verdict. Every product check — incident replays included — runs in a fresh child process,
so a second closure in one process never sees a cached product; the mutation children load it through a
resolve hook that swaps one file for its mutant, and the source tree is never edited. Equivalent mutants
are decided, not ignored.

## AI operators — non-deterministic discovery, deterministic record

AI finds; it does not judge. Produce the input with
`oracle-discovery.mjs ai-input --package <pkg> --operator ai-explorer|cross-agent --output <file outside the repository>`, hand
exactly that file to a fresh-context agent, keep its JSON output in the Oracle directory, and record the run in `aiRuns` with the
input's sha256. A run counts only while its input digest matches the current space: a changed space makes
earlier runs `stale`, and closure needs a current run. Every output candidate is triaged mechanically
(`triage`): in-world candidates are judged against the world, the rest become candidates for a decision,
and malformed ones become `invalid-output` candidates instead of disappearing. A stale run still feeds its
findings forward — its candidates are triaged against the current world and stay open until decided, so a
finding never disappears because the space moved: a new fact named like a field that now exists stays a
`new-axis` candidate until a decision promotes it there (a name is not a meaning), and an in-world literal
the current world cannot read becomes `superseded-world`. When several runs report the same finding, one
current run makes it current, whatever the order of the records. Recording runs and decisions leaves both
inputs unchanged, so a decided round stays current. A recorded run whose output is missing, unreadable or
not the one recorded (`outputDigest`) makes the operator `invalid`; drop a record only by deciding its
findings first.
The explorer sees the card; the cross-agent critic sees the source text, the declared axes, the Assumption
Registry and the operator dispositions — never the model package itself. "No new candidate in k recorded runs" is a sampled
statement and is listed as residual risk; it is never exhaustive.

## Space cross-check — the declared space against the Bend space

The Space discovery record keeps the axes the user confirmed as a `## Case space` table (and, when the
flow has states, a `## State Model`), in the grammar of
[`card/case-space-frames.md`](card/case-space-frames.md). `crossCheck` is the translation table: each
declared value becomes a world field value or the constructor a classifier def of the behavior model
returns for a step (`Grid.arrival(s, m) -> Arrival`); `stateModel.phase(s)` and `stateModel.step(s, m)` name
the declared states and events. `space-cross-check` (also `oracle-discovery.mjs cross-check --package
<pkg>`) runs the possible worlds and every trace of the space and the transition cover through it: a
declared value with no counterpart or never produced is `new-axis`; a 2-way pair of a world axis and a behavior axis is covered by a joint case — a setting the assumptions allow,
chosen greedily so that each world value the test sets runs with each behavior value — and is a `cross-term`
only when no joint case can run it (the world field is not one the test sets);
a transition the model takes that the declaration lacks or states otherwise is a `silent-decision`, with a
witness trace. The translation table is an interpretation the agent writes, so the findings are
candidates, never a verdict, and the declared table never becomes a second source of truth. A version-1
package is `not-applicable`; a version-2 package without `crossCheck` is `undeclared` until mapped or
written off with a sourced `n/a`. The same check gates the lock: card lint fails `cross-check-undecided` for
every candidate without a fitting decision, and closure runs the joint cases in its trace conformance.

## Axis Breaker — classifying what was found

| Class                                                                                 | Means                                                                             | Usual decision                                                                                                      |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `observation-gap`, `hidden-state`                                                     | a fact decides a goal but the tests cannot read it                                | promote an observation, or scope it out                                                                             |
| `new-axis`, `range`, `unspecified-behavior`                                           | the failure is not expressible with the current axes, bound or environment        | promote an axis / event, or scope it out                                                                            |
| `weak-contract`, `vacuous-contract`, `contradiction`, `example-flipped`               | the rows say less or other than the goals                                         | strengthen the contract (new revision)                                                                              |
| `oracle-weakness`                                                                     | a declared fault survives every check                                             | promote the observation that kills it, or `equivalent` with the reason                                              |
| `assumption-risk`, `assumption-hides-goal`, `assumption-challenge`, `goal-gap-review` | an assumption carries a goal or hides a product duty                              | test or monitor its falsifier, or turn it into a goal                                                               |
| `relation-invalid`                                                                    | the model breaks a declared metamorphic relation                                  | fix the relation or the model                                                                                       |
| `goal-gap`, `dropped-qualifier`, `invalid-output`, `superseded-world`                 | AI findings the tool cannot settle                                                | a human decision                                                                                                    |
| `requirement-gap`                                                                     | a sentence of the source text is in no requirement                                | add the requirement, or reject it as not normative with its source                                                  |
| `cross-term`                                                                          | a world axis and a behavior axis that no joint case can run together              | make the field settable, promote the axis into the model's events, or `accepted-risk` with why they cannot interact |
| `silent-decision`                                                                     | the model decides a transition the declared state model lacks or states otherwise | confirm it as policy (a new revision), or fix the model                                                             |
| runtime `product-defect`                                                              | an incident trace inside the space still fails on the product                     | fix the product (TDD loop)                                                                                          |

Every production bug asks the same question: why could the space not express it? The answer is one of the
classes above; a `new-axis` answer becomes a permanent axis whose `axisOrigins` entry names the candidate.

## Candidate lifecycle — computed, never stored

`DISCOVERED` (an AI candidate nobody reproduced) → `REPRODUCIBLE` (a deterministic operator, or a
mechanically judged AI candidate) → `DOMAIN_VALIDATED` (a decision with its authority) →
`AXIS_CLASSIFIED` (promoted to a target the package does not have yet) → `ORACLE_DEFINED` (the target
exists, but the operator still finds it — the checks do not see it yet) → `TEST_IMPLEMENTED` (the target
exists and no current run produces it) → `REGRESSION_LOCKED` (`--lock` covers the package and every Bend
file it reads). A stale run cannot run again, so its promoted findings count as absorbed once their target
exists; an operator that did not run at all produces nothing either, but then it blocks L6 by itself. The
stage is recomputed from the current run, the package and the lock every time.

## Closure levels and the verdict

`oracle-discovery.mjs close --package <pkg> [--runtime <anomalies.json>] [--dir <oracle dir>] [--lock <lock>]`

| Level | Passes when                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1    | every requirement quote is verbatim in its source section and is carried by the oracle (only by N/A: `scoped-out`; only by assumptions: `assumed`, listed as residual risk); a location that does not resolve is `source-missing` and fails                                                                                                                                              |
| L2    | the bounded trace space is complete and the product matches the model on every trace; the world conformance executed at least one setting and has no violation, adapter error or unknown                                                                                                                                                                                                 |
| L3    | the laws are proven, the adequacy check is proven, fast-check executed the requested runs, reached past the bound when it can, and passed                                                                                                                                                                                                                                                |
| L4    | every metamorphic relation holds on the model and the product over at least one in-space pair, or it is declared n/a with a source                                                                                                                                                                                                                                                       |
| L5    | a fault model exists, every check passes on the unmutated product, at least one mutant is killed, every survivor is decided, and killed / considered ≥ threshold. A mutant is killed only by a unit (trace case, world setting, fast-check, relation) that passes on the unmutated product; a mutant that does not load, or that the checks never load through an ESM import, is invalid |
| L6    | every operator ran, is covered or is n/a; no candidate is open; every canary passes; the registry has no dangling origin                                                                                                                                                                                                                                                                 |
| L7    | every runtime anomaly is absorbed (inside the space and the product now matches) or decided; one the adapter cannot replay fails the level; `no-evidence` without a file, and a file that is not `{"anomalies": [...]}` is an input error                                                                                                                                                |

Canaries test the attack itself: hiding each observation must make the sufficiency operator refute
something (otherwise it is blind on this world), the harness must kill at least one mutant, and the
sampler must execute its runs and pass the bound when the environment allows.

Verdicts, in order: `RUNTIME_REOPENED` (L7 reopened) → `EXPANSION_REQUIRED` (an open candidate) →
`NOT_CLOSED` (a failing level) → `CLOSED_WITH_BOUNDS` → `PRODUCT_COMPLETE_WITH_BOUNDS` (also, from
`--dir`, a runner at `REVIEW_VERIFIED` with no blockers whose latest run of every label is fresh for the
current snapshot and lock, and a `--lock` that covers the package and every Bend file it reads; the report
lists what is missing under `productComplete.reasons`). `EXPLORATION_CLOSED` is the L6 flag. Report the
verdict with its levels and the residual risk list: operators declared n/a, `modeled:` claims, sampled AI
runs, decided candidates (covered ones included), untested or unconfirmed assumptions and requirements only
assumptions carry, harness limits, rows outside the world, hazards not modeled, terms without a lifecycle,
the trace bound and sampling scope, patterns covered only by sampling, independence evidence, unobserved
runtime. There is no single "LOW/HIGH" label and no numeric confidence: each item says
what was not verified.

## Trust limits

- Every claim is relative to the declared Ω, E, F and C. An operator nobody declared finds nothing.
- The canaries show the operators are not blind on this world, not that they are complete.
- Mutation adequacy is relative to F; `equivalent` is a judgment the reviewer checks. The resolve hook
  redirects ESM imports only: a product loaded through `require()` or never imported runs unmutated, which
  the tool reports as an invalid mutant rather than a survivor.
- AI runs are samples; the input digest shows what they saw, not that they looked well.
- `--dir` is taken to be the Oracle directory of this package's card: the tool checks the runner's state,
  blockers and the freshness of its latest runs, not which card the runner holds — `init` ties that card to
  the package (`PACKAGE_UNLOCKED`).
- Runtime closure is only as good as the anomaly records and their traces.
- Bend 2.0.34 qualifies the constructor tags of imported files (`MODEL.Issue`); the tool translates them at
  the metamorphic boundary. A relation module that defines its own data types must keep them unqualified.
  Bend imports only plain names, so a `.bend` source is named with letters, digits, `_` and `-`
  (`WorldV1.bend`, never `World.v1.bend`); the package check refuses other names (`package-bend-name`).
