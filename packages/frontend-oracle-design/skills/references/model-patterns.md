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
