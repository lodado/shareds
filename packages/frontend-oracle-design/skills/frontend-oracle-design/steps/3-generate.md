# Step 3 — Generate the conformance tests

Goal: tests computed from the proven model that drive the real product through one hand-written adapter.

## Write the adapter (the SPEC's `adapter` path)

The adapter is the only boundary between the model and the product. It exports:

- `init()` — a fresh product instance (render the component, create the store, reset fakes).
- `step(state, event)` — perform the event on the product and return the next state. `event` is the model's
  `Msg` as plain JSON: `{ "$": "Respond", "id": 2 }` (constructors as `$`, `Nat` as a number, `Bool` as a
  boolean, lists as arrays). An event it cannot map throws; never guess.
- `observe(state)` — read the product and return the same plain value the model's `observe` returns. A
  constructor with fields keeps its declared field names: `Obs{shown, failed}` is
  `{ "$": "Obs", "shown": [3], "failed": false }`.
- `dispose(state)` — required when it renders React or opens clients; unmount and restore globals.

Every call may be async. The adapter imports product modules and test harnesses only. It must not import
`MODEL.bend`, a generated `*.model.mjs`, any `oracle-*.mjs` script or `fast-check`, read files, or compute
expected values: it observes, it does not re-implement. With `state`, `command` and `relations` in the SPEC it
also exports `concretize(modelState)`, `step(productState, command)` and `project(productState)` for the property
suite.

A real bug trace goes in `BUGS.json` beside `MODEL.bend`:
`[{ "id": "B1", "trace": [{ "$": "Click" }, { "$": "Click" }] }]`. The model computes its expectation each time.

## Run `fod.mjs gen <id>`

The generated tests import `fast-check`: install it in the project as a dev dependency first, with the repo's
package manager. `gen` requires the approval of the current SPEC and Bend files, then writes into `out`:

- `<prefix>.model.mjs` — the compiled model; `<prefix>.oracle.test.mjs` — the tests:
  - sources unchanged since generation, and the adapter audit;
  - `[T…]` a minimum cover of every reachable configuration and its boundary items, `[W…]` W-method cases
    (every state and transition followed by the characterizing sequences), `[S…]` event orders the cover missed
    (3-way), `[B…]` the bug traces;
  - fast-check sampled traces past the bound, with seed and shrinking, and a coverage report;
  - outside-environment probes, reported and never failing.
- `<prefix>-state.model.mjs` and `<prefix>-state.oracle.test.mjs`, the property suite, when the SPEC asks for it.

Never edit the generated files; change the model or the adapter and rerun `gen`. Commit them with the product.

| Code                                           | Fix                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GEN_PROOF_STALE`                              | the SPEC or Bend changed after the proof: rerun `prove` and ask again                             |
| `GEN_NOT_APPROVED`                             | send step 2's approval message and run `approve` after the answer                                 |
| `ADAPTER_SUSPECT`                              | import the product, not the model or the oracle scripts; export `dispose` when rendering React    |
| `ADAPTER_UNREADABLE`                           | create the adapter at the SPEC's path                                                             |
| `SUITE_UNAVAILABLE`                            | the state grows without bound; keep it finite for W-method cases                                  |
| `BUGS_INVALID` / `BUG_OUTSIDE_SPACE`           | fix the `BUGS.json` shape, or the model's environment that forbids the trace                      |
| `GEN_DEPENDENCY_MISSING`                       | install the named package as a dev dependency, then rerun `gen`                                   |
| `USAGE`                                        | match `runner`, `environment` and the adapter: a JSX adapter needs `runner: vitest`               |
| `TYPE_UNSUPPORTED` / `SAMPLING_BOUND_REQUIRED` | build `state` and `command` from finite constructors, `Bool`, bounded `Nat` and `List`            |
| `RELATION_INVALID`                             | each relation is `def Prefix.<name>(s: State, c: Command, t: State) -> Bool`                      |
| `BEND_…`                                       | Bend could not be installed: check the network and platform, run `scripts/ensure-bend.mjs`, rerun |

Next: [step 4](4-red.md).
