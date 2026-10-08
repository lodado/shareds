# Model patterns — rules, strong laws, time, errors, attempts and effect counts

Read this before writing `MODEL.bend`, `LAWS.bend` and `PROOF.bend`. It adds modeling patterns to
[`bend-cross-verification.md`](bend-cross-verification.md) §2; it creates no policy and no product
structure — the product keeps the shape [`types/state-ladder.md`](types/state-ladder.md) gives it. Every value below
(retry count, delay, error kind, staleness bound) comes from an approved source or an Open question —
never from the pattern.

## Rules, not answer tables

People review `MODEL.bend` and `LAWS.bend`; only the kernel reads `PROOF.bend`. Cases are enumerated by
the law quantifiers, the proofs and the tools (`space`, the generated tests), never typed into the model
or the laws.

- **Define the rule.** A def whose arms spell out the answer for every input combination is a second
  implementation nobody can review: one wrong arm becomes the oracle. Give the state the structure the
  behavior has — a list, a count, membership — and write the transition as a recursive def over it. One
  constructor per value fits values without structure (error kinds); a table fits only when an approved
  source states that table.
- **Pin every result.** For each message the laws together allow exactly one observation, the model's,
  unless the source allows several (state those as `emit-state` relations). Cover what changes, what
  stays and what is kept: a count or membership law alone allows any reshuffle.
- **Prove by the domain.** A bounded product domain (two or three columns) is quantified as finite
  inputs and proven case by case; that case list in `PROOF.bend` is generated and kernel-checked, never
  reviewed. An unbounded one (a list of any length, a counter) is proven by structural induction — a
  recursive proof def whose recursive call is the hypothesis (`bend guide`, Laws and Proofs). Never
  shrink an unbounded product domain to avoid an induction.

Column reordering. The rejected model gave each order a constructor and typed 128 answers; its only
move law compared the column count:

```python
def Columns.move(order: ColumnOrder, from: ColumnSide, to: ColumnSide) -> ColumnOrder:
  match order from to:
    case OABC{} SideA{} SideC{}:
      OBCA{}
    # … 127 more arms
```

The rule gives the same 128 results. The order is a list and the moved column takes the target's index;
`index`, `has`, `insert`, `choose` and `distinct` follow the shape of `remove`, with a helper that
matches the computed `Bool`:

```python
def Cols.pick(hit: Bool, h: Ver, t: +List<Ver>, rest: +List<Ver>) -> +List<Ver>:
  match hit:
    case True{}:
      t
    case False{}:
      h <> rest

def Cols.remove(xs: +List<Ver>, +a: Ver) -> +List<Ver>:
  match xs:
    case Nil{}:
      Nil{}
    case Con{+h, +t}:
      Cols.pick(Ver.eq(h, a), h, t, Cols.remove(t, a))

def Cols.move(+xs: +List<Ver>, +a: Ver, +b: Ver) -> +List<Ver>:
  Cols.choose(Bool.and(Cols.has(xs, a), Bool.and(Cols.has(xs, b), Bool.not(Ver.eq(a, b)))), xs, Cols.insert(Cols.index(xs, b), Cols.remove(xs, a), a))
```

These three laws leave one result for each of the 54 three-column moves. Without `keeps_every_column`,
18 moves also allow dropping the column (`ABC`, move A to C: `BC`). Two columns state the same laws over
`[x, y]`; there a column can be absent, so `lands_on_target` also assumes both are present and an
`absent_is_noop` law pins the rest — without it, 12 of 54 moves stay open:

```python
law keeps_every_column:
  for x: M.Ver
  for y: M.Ver
  for z: M.Ver
  for a: M.Ver
  for b: M.Ver
  for c: M.Ver
  {M.Cols.has(M.Cols.move([x, y, z], a, b), c) == M.Cols.has([x, y, z], c) : Bool}

law others_keep_order:
  for x: M.Ver
  for y: M.Ver
  for z: M.Ver
  for a: M.Ver
  for b: M.Ver
  for h: {M.Cols.distinct([x, y, z]) == True{} : Bool}
  {M.Cols.remove(M.Cols.move([x, y, z], a, b), a) == M.Cols.remove([x, y, z], a) : +List<M.Ver>}

law lands_on_target:
  for x: M.Ver
  for y: M.Ver
  for z: M.Ver
  for a: M.Ver
  for b: M.Ver
  for h: {M.Cols.distinct([x, y, z]) == True{} : Bool}
  {M.Cols.index(M.Cols.move([x, y, z], a, b), a) == M.Cols.index([x, y, z], b) : Nat}
```

`PROOF.bend` proves them with one generated case per input combination; a case whose hypothesis
computes to `False{}` closes with `Empty.absurd(<goal>, false_is_not_true(h))`, as in the stale-search
fixture. The equality type spells the quantity the def returns (`+List<M.Ver>`), or the kernel reports
`List<&1, …>` against `List<&2, …>`.

A model that folds these axes into one event (`Failed` meaning "every retry failed") is not wrong, but
the folded part leaves the proof and the generated conformance and becomes a hand-written test or a
`Not formalized` line. Unfold the axis when a contract row depends on it.

## Time is an event

Bend has no clock. Model the moment a duration ends as an event the environment may produce:
`Tick` (a retry delay elapsed), `Expire` (a staleness window ended), `Remount{elapsed: Elapsed}` with a
field-less enum for the policy's boundary (`Before{}`, `After{}`). The duration itself lives only in the
adapter, which maps the event to `vi.advanceTimersByTime(<source constant>)`. Never sleep in the adapter.

```python
type Elapsed is Data:
  WithinWindow{}
  PastWindow{}

type Msg is Data:
  AttemptFailed{err: Err}
  Tick{}
  Remount{elapsed: Elapsed}
```

`next` offers `Tick` only while the model waits, so a delay that never started cannot elapse; it offers
user events at every step, including while waiting.

The same move turns the other values the scope gate used to stop on into finite axes. Name the class
the policy distinguishes, never the raw value; the adapter owns the concrete source constant:

- **Clock, expiry:** `Expire` is an event, as above (a 30-minute session ends → a submit after it
  issues 0 payment requests). `Date.now`/`new Date` in the product maps to a fake clock in the adapter.
- **Negative, quantity:** a Value class per sign boundary — `BelowZero{}`, `Zero{}`, `One{}`, `AtMax{}`,
  `AboveMax{}` — for "quantity ±" and the step that crosses each boundary.
- **Money, decimal:** count in the minimal unit (`Nat` cents) so rounding is a law over integers; the
  classes are `Exact{}`, `HalfUnit{}` (the rounding tie) and `SubUnit{}`; `toFixed`/`parseFloat` stay in
  the adapter and the product test.
- **String:** length and format classes — `Empty{}`, `Valid{}`, `TooLong{}`, `Malformed{}`,
  `Unicode{}` — never the text itself.
- **Randomness:** the environment chooses — `next(history)` offers every outcome (`JitterLow{}`,
  `JitterHigh{}` for a retry delay), so a law holds for all of them; the adapter pins `Math.random`.

A source that leaves the boundary, precision or duration open is a `NEEDS_DECISION` question about
that class, not a reason to drop the axis.

## Attempts, not outcomes

Count attempts in the state and decide the visible failure from the count:

```python
# attempts: failed attempts of the current request · waiting: a retry delay is running
type Feed is Data:
  Feed{loading: Bool, waiting: Bool, attempts: Nat, failed: Bool, requests: Nat, fetches: Nat}
```

- An attempt failure below the approved limit sets `waiting`; `Tick` re-sends the same request.
- The attempt that reaches the limit sets `failed`; only then may the product show its failure UI.
- A user retry starts a new request and resets `attempts`.

State one law per transition and one witness for "fails N times, then succeeds".

## Environment faults — decide each

`next(history)` is the environment model: it offers exactly what the user, network, timers and other tabs
may do. Decide every row as an event in `next` or as `excluded: S<n> <reason>`; "the model did not need it"
is not a reason.

| Fault                                            | Event in `next`                                     | Pattern                                           |
| ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------- |
| delayed or reordered response                    | `Resolve{run}` offered after later requests         | Identity and session lifetime                     |
| duplicate delivery (double click, at-least-once) | the same event offered again                        | idempotence law                                   |
| the network never answers                        | `Timeout{}` while a request is pending              | the policy's answer to silence; Progress needs it |
| late after cancel, unmount or logout             | `Resolve` stays in `next` after `Cancel`, `Unmount` | Owner lifetime                                    |
| partial failure                                  | one error kind per outcome the policy distinguishes | Error kinds                                       |
| retry resend                                     | `Tick{}` re-sends the same request                  | Attempts, not outcomes                            |
| offline, hidden tab, second tab or device        | `Offline{}`, `Hidden{}`, `OtherTab{…}`              | only when a row depends on them                   |
| clock jump, expiry                               | `Expire{}`, `Remount{elapsed}`                      | Time is an event                                  |

## Progress is a ranking function

Bend states no "eventually"; it proves a number that shrinks. Give the live states a rank in `Nat`, prove
that every step keeps a terminal state or lowers the rank of a live one, and the rank of `init` bounds the
path to a terminal state. A bounded retry ranks by the retries left:

```python
def Load.progress(s: Load, t: Load) -> Bool:
  match s t:
    case Loading{n} Loading{p}:
      Nat.is_lt(p, n)
    case Loading{n} Ready{}:
      True{}
    # … GaveUp, and the terminal states keep any t
```

The law is `for s, for m: {Load.progress(s, Load.step(s, m)) == True{} : Bool}`. The proof is a case split
plus one induction for the shrinking step (`def lt_succ(p: Nat) -> {Nat.is_lt(p, 1n+p) == True{} : Bool}`;
a lemma cannot sit under the `Laws.` alias). Register it as `safety`, beside an `effect` law that a live state
reaches the terminal one and its `witness`.

- Fairness is `next`: it offers an event at every live state. A live state with no event is a hang; "the
  network never answers" is the `Timeout{}` row above, and without it no rank exists.
- A step that does not lower the rank (a retry that re-enters `Loading{n}`) fails the kernel. That is the
  finding: the wait has no bound, so ask the policy for one (`NEEDS_DECISION`); do not weaken the law.
- Set `Bound` at least the rank of `init` plus one, so the space holds a full path to a terminal state.
- The product needs no second test: conformance compares it with the model on every traced step, so the
  rank carries over within the checked traces. Strong fairness and starvation between actors have no rank;
  they stay `Not formalized`.

## Error kinds are a sum type

```python
type Err is Data:
  Network{}
  Server{}
  Malformed{}
```

When the policy treats every kind alike, quantify the law over the kind (`for k: M.Err`); one law covers
all of them. When kinds differ, write one law per kind. A kind the policy does not mention (for example a
4xx) is an Open question, not a default branch.

## Requests, fetches and effects are different counts

Keep separate observed counters for the policy's unit (`requests`: a page request), the transport
(`fetches`: network calls, retries included) and the user-visible effect (`effects`). Each has its own
`## Terms` row whose `path` says how the adapter tells them apart — for example "a call with a new cursor,
or the first call after a retry press, is a request; a repeated call with the same cursor after a
rejection is a retry". A count the test cannot attribute is an observation gap, not evidence.

## Owner lifetime

Model leaving and returning as events (`Unmount`, `Remount{elapsed}`) when a row depends on them, and
observe the cache and the screen separately: a response may still update a cache after unmount, while
the unmounted screen must not change. Late completions after `Unmount` stay in `next` — dropping them
because a correct product ignores them hides the defect.

## Counters and ids

An unbounded counter (request ids, retries, list length) makes every value its own state: the transition
cover reports `capped` and the trace space multiplies per depth. Give the counter the resolution the policy
distinguishes. When an approved source states a threshold T (retry limit 3, page size 20), let the counter
saturate at T+1 and add a law that two counts above T observe alike, so the kernel checks the saturation.
When the observation shows the value (ids on screen, a displayed total) or no source states a threshold,
keep the counter exact and lower the bound instead. Saturating to avoid an induction is the shrink the
rule above forbids; saturating because the policy cannot tell the values apart is the model.

## Collections and order — prove every length, list few

Reordering (drag and drop, move to top) makes every arrangement its own state: up to n! for n items, and at
seven items the 5040 arrangements pass the 2000-configuration cap, so `space` reports `capped` and the density
analyses and the W-method suite skip. Do not list the arrangements to show the operation is sound; split the claim.

- Order-changing operations get a length law and a permutation law proved by induction on the list, for every
  length and every index. Item ids are `Nat`. The relation `R_items_kept(s, c, t)` says the length is the same
  and every item of `s` appears as often in `t`. The proof follows the recursion of the operation:

```python
def Board.swap_at(xs: List<&2, Nat>, +n: Nat) -> List<&2, Nat>:
  match xs n:
    case Nil{} n:
      Nil{}
    case +a <> Nil{} n:
      a <> Nil{}
    case +a <> (+b <> +r) 0n:
      b <> (a <> r)
    case +a <> (+b <> +r) 1n+p:
      a <> Board.swap_at(b <> r, p)
```

- State each claim as a `Bool` relation built from `Nat.is_eq`: it reduces on `1n+x`, so at the recursive case the
  recursive call is the proof (`length_kept(b <> r, p)`), and a lemma `eq_refl(+n)` closes the swap. The
  permutation case adds two small lemmas — swapping two hits keeps a sum (`swap_hits`, four cases on two `Bool`s)
  and adding the same hit to equal counts keeps them equal (`hit_cong`) — and `and_true(p, q, ep, eq)` joins two
  proven `Bool`s. A value used twice needs `+` (`+x`, `+a`, `+r` in the patterns); a lemma cannot sit under the
  `Laws.` alias; `Nil` and `Cons` are Base names, so use `List<&2, Nat>` with `<>` or another constructor name.
- Write both laws. A drag that drops an item fails the length law; one that overwrites an item keeps the length
  and fails only the permutation law. Where the item lands (the target index, a locked row staying put) is its own
  law, and the permutation law does not state it.
- Enumerate boards of at most three items in the trace model: the first, a middle and the last place, and a drag
  to the same place all occur, and the induction laws carry every longer list.
- Carry the same relations to the product with `emit-state` with `--relation` and `--list-max` (and `--nat-max`),
  which draws boards longer than the model lists. Observed on a fixture: a product that overwrites a neighbour
  only on a board of more than four items passed every board of three items exhaustively, and sampling boards
  up to seven found it within 300 draws.
- The claim is bounded: the induction proves the model, not the product, and fast-check shows the product
  agrees with the relation on the boards it drew. An operation whose result depends on an item's value (sort by
  name) needs its own law saying how.

## Identity and session lifetime

When completions can belong to different owners, give every request event the owner it was sent for
(`Request{run}`, `Resolve{run}`) so `next` can order two runs against each other: run A's response
arriving after run B's start and after B's response are different traces, and a settlement keyed by
the wrong run shows up as a wrong observation. When the identity can change under an in-flight request
(`Logout{}`, `Login{account}`), model it as events too and keep the old identity's late `Resolve` in
`next`; the law says whose state it may touch (none of the new account's). The adapter resets every
global it touched in `dispose` (mock handlers, stores, the render root), so one trace cannot leak into
the next. Server-side deduplication of the same run is a server contract: record it in the API
contract and test the client's resend, not the server's rule.

## Library-owned behavior

A dependency landmine whose behavior changes an outcome (for example a background refetch that a
concurrent fetch can overwrite) becomes an event (`StaleRefetch`) with its own laws, and its landmine row
is dispositioned `covered(O*)` by those rows. Interleavings the model does not name stay with
`fc.scheduler` properties or Open questions.

## Space size

Each unfolded event multiplies the trace space. If `space` stops with `complete: false`, lower `Bound` in
a new revision and raise the fast-check sample count; never trim events to make the space fit. Report the
new bound and the sampled length range together.

## Bend names

Base already declares some constructor names (for example `Fail`, `Move` and the `Scroll` input event). A
duplicate declaration fails before any law runs; pick a domain name (`AttemptFailed`, `FeedWorld`).
Reusable traces need `+List<Msg>` in `run` and in `exs` witnesses.

## Bend check failures

A check costs seconds; a guessed rewrite costs a model turn. Before declaring a constructor or type run
`bend base | grep -w <Name>` (no match means it is free; `bend base <Name>` finds only top-level names).
Check with `scripts/oracle-model.mjs check --file <file>` (`bend <file> --check-only` per file); it and
`prove` print the matching fix below as `hint`. Read the failure's `Location:` line, apply the fix once,
and rerun the same file. Do not rewrite the whole model to fix one reported line.

| Failure text                                | Cause                                                  | Fix                                                                                        |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `a fresh name (duplicate declaration: X)`   | Base or another import already declares `X`            | rename to a domain name (`FeedEvent`, `AttemptFailed`)                                     |
| `X (consumed more than once)`               | a plain `x = v` or parameter is affine: one use only   | bind it reusable (`+x = v`, `+x: T`), type it `+D<A>`, or destructure once and reuse parts |
| `a match on a parameter or field`           | the matched name is a def or a bind already consumed   | match the value before its first other use, or bind it with `+`                            |
| `a declared constructor (unknown: M.X)`     | `X` is not in that type, or the module prefix is wrong | use a constructor from the type's `type` block under its import alias                      |
| `a filled definition (an unfilled law ...)` | a `law f` has no `def f` with the same name            | add `def f` that proves it, or remove a law the card does not claim                        |
| `an import ('import Base', ...)`            | the file does not open with its imports                | first line `import Base`, then `import ./file.bend as M`                                   |
