# Cross-agent critique input

You are a domain expert reviewing an oracle space, not the implementation. Answer the questions from the source text.
Ground every candidate in the source text; a candidate without a source-backed harm is noise.
An in-world candidate gives a world literal naming every world.* field below: a Bool as `name` or `!name`, any other field as `name=Value` — the tool judges it mechanically.
A new-fact names its category as exactly controllable, observable or hidden. A qualifier lists the contract rows it concerns as O* IDs.
Return only JSON of this shape:

```json
{
  "candidates": [
    {
      "id": "X1",
      "kind": "in-world | new-fact | qualifier",
      "scenario": "the steps, in the user’s terms",
      "harm": "what the user loses, and which source sentence says it matters",
      "world": "in-world only: a world literal, e.g. start !held committed ack reload",
      "newFact": {
        "name": "new-fact only",
        "category": "controllable | observable | hidden",
        "observedVia": "the product path that shows it, or —"
      },
      "whyOutside": "new-fact only: why no field of the world expresses it",
      "sourceText": "qualifier only: the exact source words the rows dropped, e.g. \"while the retention conditions hold\"",
      "rows": [
        "qualifier only: the O* rows that state more or less than the source"
      ],
      "sources": [
        "S1"
      ]
    }
  ]
}
```

## Questions

1. What does the current oracle space assume without saying so?
2. Which failure cannot be expressed with the current axes?
3. What happens when the assumption of a normal user breaks (rapid repeat, back/forward, refresh, multiple tabs, expired session, tampered input)?
4. What goes wrong if the order of two events is reversed or an event repeats?
5. Which counterexample satisfies every stated property and is still a product failure?
6. Which axis would a domain expert of this product add?

## Declared axes

- world.Race.arrival (controllable; OldFirst NewFirst OldEarly) — when response 1 arrives: after both requests were issued and before response 2 (OldFirst), after response 2 (NewFirst), or before request 2 is issued (OldEarly) (not: the order in which the requests were issued)
- world.Race.newAnswers (controllable; false true) — the response to request 2 arrives within the attempt (not: the response to request 1)
- world.Race.oldEmpty (controllable; false true) — the response to request 1 carries no results; it is still request 1's response (not: response 1 not arriving)
- world.Race.newEmpty (controllable; false true) — the response to request 2 carries no results; it is still the latest request's response (S1 item 3) (not: response 2 not arriving (T2))
- world.Race.longSession (controllable; false true) — the attempt's requests have two-digit ids: they are the ninth and tenth requests of the session (not: responses to the earlier requests (they never arrive))
- world.Race.final (observable; NoneShown OldShown NewShown) — the request whose results the list shows when the attempt ends (not: the latest issued request id)
- world.Race.oldShown (observable; false true) — a response to request 1 that arrived after request 2 was issued changed the list to request 1's results, at some step (not: request 1's results kept on screen from before request 2 was issued (S1 item 1 keeps them))
- world.Race.itemsIntact (observable; false true) — after every event, the list displays exactly the results of the response it shows, and no results when it shows none (not: which request the list shows)
- event.Msg (environment; Issue Respond)
- event.Msg.Respond.id (environment; 1 2 3 4)
- state.Search.Search.latest (hidden; Nat)
- state.Search.Search.shown (hidden; Nat)
- observation.Search.observe (observable; 0 1 2 3 4)

## Assumption registry

- none declared

## Operator dispositions

- dependency-failure: n/a: S1 errors, retry and cancellation are outside this fixture policy
- latency: modeled: event.Msg
- environment-variation: n/a: S1 a pure reducer with no browser, device or viewport in scope
- malformed-input: n/a: S1 request ids come from the product, not from user input
- concurrency: modeled: event.Msg

## Sources

- S1 product-policy · search response ordering · repo:README.md#fixture-policy · approved

## Source text

### S1 repo:README.md#fixture-policy

## Fixture policy

The source text the card cites as S1:

1. Every search request gets a request id that grows by one per issued request. Issuing a request
   makes it the latest one; the list keeps showing what it showed until a response arrives.
2. A response to an older request does not change what the list shows.
3. The latest request's response is shown when it arrives.
4. The environment delivers each response at most once, only after its request, in any order.
   Cancellation, retry, duplicate responses and a response before its request are out of scope; no
   guarantee is claimed for them.

## Hazards

- permission-change: permission, role or ownership changes between the check and the effect
- concurrent-change: another tab, user or system changes the same data
- display-vs-commit: what the UI shows differs from what the system committed
- effect-count: an external effect (request, event, analytics, email) happens zero or several times
- identity-reference: the wrong actor, resource or version, or a dangling reference
- feature-composition: another feature or a later step changes the outcome
- carry-over: state or an indicator from an earlier attempt remains in the next one (a stale toast, error or selection)
- order-timing: the result depends on what happens first (a toast before the commit, a late response) — a record world sees end states only