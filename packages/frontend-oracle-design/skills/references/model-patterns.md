# Model patterns — time, errors, attempts and effect counts

Read this when writing `MODEL.bend` for behavior that depends on retries, delays, staleness, error kinds,
remounts or request counts. It adds modeling patterns to
[`bend-cross-verification.md`](bend-cross-verification.md) §2; it creates no policy. Every value below
(retry count, delay, error kind, staleness bound) comes from an approved source or an Open question —
never from the pattern.

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

Base already declares some constructor names (for example `Fail` and the `Scroll` input event). A
duplicate declaration fails before any law runs; pick a domain name (`AttemptFailed`, `FeedWorld`).
Reusable traces need `+List<Msg>` in `run` and in `exs` witnesses.
