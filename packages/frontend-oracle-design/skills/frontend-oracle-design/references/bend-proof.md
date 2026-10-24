# Bend proof from requirements — state, event and transition

Read this when you write, prove or repair `MODEL.bend`, `LAWS.bend` or `PROOF.bend` from requirements, when a
proof fails, or when the laws look too weak to pin the model. Policy, lock, review and delivery rules stay in
[`bend-cross-verification.md`](bend-cross-verification.md); modelling patterns (time, attempts, error kinds,
counters, collections) stay in [`model-patterns.md`](model-patterns.md). Nothing here decides policy: every
value comes from an approved source or an Open question.

## The model is a machine

- **State** — the control states the flow names (`Idle`, `Pending`, `Paid`) and data fields in finite classes or
  counters. Keep the outcome of the last event in the state (`last: Moved | Stayed | Refused{reason}`) when
  three-argument relations must see it: `step` returns a state, and such a relation sees only states.
- **Event** — every `Msg` constructor: user commands, responses, timers, other tabs. An event that must change
  nothing (hover, re-render) is an ordinary constructor whose law says the state stays. Add it only when a row
  depends on it; every event multiplies the space per depth.
- **Transition** — `step` is total. An ignored event is a named outcome, never a missing arm.
- **Environment** — `next(history)` is the environment unrolled over the history. Keep the environment in the
  state when a law holds only on traces the environment allows (below).

The input families keep their Space discovery dispositions and land in the machine as follows. Async gives
states and response events. Order is the set of orders `next` allows. Data and Value are finite field or payload
classes. When Entry changes behaviour, it is `modeled: behavior` as a first event (`Enter{kind}`), so a law over
every trace covers every entry. Environment gives environment events (`Remount`, observer events). Platform stays
outside the model unless behaviour differs. Inherited policies keep their laws in `LAWS.bend` beside the new ones.

## Requirement sentence → law

- "In A, X leads to B": a forward relation `R(s, c, t)` (cell).
- "B is entered only from A by X": an entry relation, the mirror of the forward ones and a cross-check (cell).
- "X is refused when …": one relation per reason, plus the frame law that a refused or stayed event keeps the
  state (cell).
- "A finished item stays as it is": an absorbing relation (cell).
- "Sending twice has one effect": an idempotence relation and a counter law over every trace (cell, trace).
- "Never …", "always …", "after X never Y": a safety law over every trace. Its predicate is a `MODEL.bend`
  definition; a history condition is proven with a monitor in `PROOF.bend`, never a `MODEL.bend` field (trace).
- "The order does not matter": a commutation law over (s, a, b), only where both orders are allowed (by hand).
- "It must be possible to …": an `exs` witness.
- "Eventually …", "within N …": a [ranking function](model-patterns.md#progress-is-a-ranking-function).
- "The screen shows only …": an observation relation over `observe` (cell).
- "Never more than N": a counter invariant; a saturated counter also needs a law that the counts it merges are
  observed alike (trace).

The order of refusal reasons comes from the source; without one it is an Open question. Write cell laws as
three-argument relations, `<Prefix>.<R>(s: State, c: Command, t: State) -> Bool`, stated as
`{R(s, c, step(s, c)) == True{} : Bool}` for every `s` and `c` — the `emit-state --relation` form. With
three-argument relations the frame laws are required: without "a refused or stayed event keeps the state", a
state that moves while claiming `Refused` satisfies every other law. Write the forward, refusal and frame laws
first; the entry laws then cross-check them. A frame law has this shape — a blocked Set command keeps `checked`:

<!-- excerpt: test-fixtures/toggle/MODEL.bend -->

```python
def Toggle.R_blocked_keeps(+s: Toggle, +c: Cmd, t: Toggle) -> Bool:
  Toggle.imp(Bool.and(Toggle.blocked(s), Toggle.is_set(c)), Toggle.same(Toggle.checked(t), Toggle.checked(s)))
```

## Proof templates

### Cell

Finite `State` and `Command` types are proven with one case per pair, each closed by `{==}` because the relation
computes on constructors:

<!-- excerpt: test-fixtures/session-expiry/PROOF.bend -->

```python
def Laws.expired_blocks(s, c):
  match s c:
    case M.Session{True{}, True{}} M.Submit{}:
      {==}
    case M.Session{True{}, True{}} M.Expire{}:
      {==}
    case M.Session{True{}, False{}} M.Submit{}:
      {==}
    case M.Session{True{}, False{}} M.Expire{}:
      {==}
    case M.Session{False{}, True{}} M.Submit{}:
      {==}
    case M.Session{False{}, True{}} M.Expire{}:
      {==}
    case M.Session{False{}, False{}} M.Submit{}:
      {==}
    case M.Session{False{}, False{}} M.Expire{}:
      {==}
```

A `Nat` or `List` field makes the domain infinite: prove such a law by cases on constructors and induction
([rules, not answer tables](model-patterns.md#rules-not-answer-tables)).

### Every trace

State the requirement once in `LAWS.bend`:

<!-- excerpt: test-fixtures/pay/LAWS.bend -->

```python
law never_double_charge:
  for t: List<M.Msg>
  {M.Pay.at_most_one(M.Pay.run(t, M.Pay.init())) == True{} : Bool}
```

Put the invariant and its lemmas in `PROOF.bend`, which is never locked. The invariant is a rule over the state:

<!-- excerpt: test-fixtures/pay/PROOF.bend -->

```python
def inv(s: M.Pay) -> Bool:
  match s:
    case M.Pay{M.Idle{}, c}:
      Nat.is_eq(c, 0n)
    case M.Pay{M.Pending{}, c}:
      Nat.is_eq(c, 0n)
    case M.Pay{M.Paid{}, c}:
      Nat.is_eq(c, 1n)
    case M.Pay{M.Errored{}, c}:
      Nat.is_eq(c, 0n)
```

`inv_step(s, m, h)` proves that every step keeps it, with one arm per state and event; `inv_safe(s, h)` proves
that it implies the law. One induction then carries the invariant along any trace:

<!-- excerpt: test-fixtures/pay/PROOF.bend -->

```python
def safe_run(t: List<M.Msg>, +s: M.Pay, h: {inv(s) == True{} : Bool}) -> {M.Pay.at_most_one(M.Pay.run(t, s)) == True{} : Bool}:
  match t:
    case Nil{}:
      inv_safe(s, h)
    case Con{+m, rest}:
      safe_run(rest, M.Pay.step(s, m), inv_step(s, m, h))

def Laws.never_double_charge(t):
  safe_run(t, M.Pay.init(), {==})
```

- `+s` and `Con{+m, rest}` mark values the body uses twice; `for t` in `LAWS.bend` needs no `+` because the
  induction uses `t` once.
- An invariant is often not inductive at first. A step that leaves it from a state where it holds is a
  counterexample to induction. `charges ≤ 1` fails at `Pay{Pending, 1}` with `Resolve`, a state no trace
  reaches. Add the missing conjunct; never weaken the law. The kernel checks such a counterexample as a witness:

<!-- excerpt: test-fixtures/pay/PROOF.bend -->

```python
law weak_is_not_inductive:
  exs s: M.Pay
  {Bool.and(inv0(s), Bool.not(inv0(M.Pay.step(s, M.Resolve{})))) == True{} : Bool}

def weak_is_not_inductive():
  (M.Pay{M.Pending{}, 1n}, {==})
```

- Define a lemma before the def that uses it; Bend reports a later one as an unfilled law.
- Split on a computed `Bool` by passing the value with its equation, and call the helper with `{==}`:

<!-- excerpt: test-fixtures/stale-search-env/PROOF.bend -->

```python
def respond_ok(b: Bool, +id: Nat, +latest: Nat, shown: Nat, e: {Nat.is_eq(id, latest) == b : Bool}, h: {Nat.is_le(shown, latest) == True{} : Bool}) -> {Nat.is_le(M.Search.pick(b, id, shown), latest) == True{} : Bool}:
  match b:
    case True{}:
      eq_le(id, latest, e)
    case False{}:
      h
```

<!-- excerpt: test-fixtures/stale-search-env/PROOF.bend -->

```python
    case M.Search{+latest, +shown, open} M.Respond{+id}:
      respond_ok(Nat.is_eq(id, latest), id, latest, shown, {==}, h)
```

- A law over every list also covers traces the environment cannot produce. When such a trace breaks the law,
  either make `step` leave the state unchanged on an event the environment does not allow, or add the
  hypothesis that the trace is allowed and pass it through the induction.

### The environment in the state

A `next` that re-reads the whole history makes the induction hypothesis a pair of state and history:

<!-- excerpt: test-fixtures/stale-search/MODEL.bend -->

```python
def Search.next(+h: +List<Msg>) -> List<Msg>:
  Issue{} <> Env.pending(Env.issued(h, 0n), h)
```

When a law holds only on traces the environment allows, keep the environment in the state and derive `next`
from it:

<!-- excerpt: test-fixtures/stale-search-env/MODEL.bend -->

```python
type Search is Data:
  Search{latest: Nat, shown: Nat, open: List<&2, Nat>}
```

<!-- excerpt: test-fixtures/stale-search-env/MODEL.bend -->

```python
def Search.enabled(s: Search) -> List<Msg>:
  match s:
    case Search{latest, shown, open}:
      Issue{} <> Search.responses(open)

def Search.next(h: List<Msg>) -> List<Msg>:
  Search.enabled(Search.run(h, Search.init()))
```

- `observe` must not read environment fields or `last`, and a property-mode `State` for `emit-state` must not
  contain them unless the product exposes them: the round trip `project(concretize(s)) == s` would fail on a
  field the product does not have.
- Leave the environment out of the state when `observe` returns the whole state.
- `oracle-package.mjs derive` reports each environment field as a hidden axis (here `state.Search.Search.open`);
  on a locked package that changes the Derived Axes and needs a new revision.
- The oracle space does not change: this variant and the stale-search model give the same cases and
  `spaceDigest` at bounds 3 to 5.

### Witness and rank

A witness is an `exs` law with a trace taken from `space --cases`. A progress claim is a
[ranking function](model-patterns.md#progress-is-a-ranking-function).

## Reading a failure

- The kernel stops at one arm of a cell proof or of `inv_step`: that step is not proven yet, and the claim may
  still be true. Print the arm's goal with `?name`.
- The goal holds for every value the arm allows: a lemma is missing. Prove it (`le_succ`, `eq_le` and
  `respond_ok` are examples).
- A concrete state and event break the invariant: a counterexample to induction. Check it as an `exs` law like
  `weak_is_not_inductive`. If replaying a `space --cases` trace prefix through `run` reaches that state, the
  model or the requirement is wrong: fix the model or ask a `POLICY_GAP` question. If no trace within the bound
  reaches it, the invariant is probably too weak: add the missing conjunct.
- A state that moves while claiming `Refused` passes every law: the frame laws are missing.
- The law is proven but says less than the requirement: the reviewer decides; never fit the law to the model.

Failing to build a proof never shows a product defect by itself.

## Reviewer checklist

- Each law names the requirement sentence it formalizes, and its scope matches it: "never" is every trace,
  "can" is a witness, a single step is a cell.
- Refusal reasons and their order come from a source.
- Frame laws are present for three-argument relations.
- No relation is defined through `step` (`t == step(s, c)`) or copied from the model instead of the requirement.
- A law that fails only on traces the environment cannot produce gets a stutter or an allowed-trace hypothesis.
- Environment, monitor and `last` fields stay out of `observe` unless the product shows them.

## Commands in this release

`scripts/oracle-model.mjs check --file <file>` ([model-patterns](model-patterns.md#bend-check-failures) lists its
failures and fixes), and `prove --dir <dir> --require <law>...` and
`space --model <MODEL.bend> --prefix <Prefix> --bound <n>` as
[bend-cross-verification](bend-cross-verification.md) §3 describes.
