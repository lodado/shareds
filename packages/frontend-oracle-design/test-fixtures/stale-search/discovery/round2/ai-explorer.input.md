# Oracle space explorer input

Every row of this card passes and the adequacy checks are proven inside the declared world. Your job is to break that:
find situations where every row passes and the user is still harmed. Three kinds count:

- `in-world`: the harm is expressible with the existing fields. Give the world literal. The tool checks it mechanically.
- `new-fact`: the harm needs a fact the world does not have (another tab, a retry, a cache, an analytics call, a stale token, ...).
  Name the fact, its category and the product path that would show it, and say why no existing field expresses it.
- `qualifier`: a condition of the source text (while, unless, within, except, only if) that the rows dropped, so the card
  promises more or less than the source. Quote the words and name the rows.

Ground every candidate in the source text; a candidate without a source-backed harm is noise. Return only JSON of this shape:

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

## Outcome Brief

- Actor and context: a person typing successive search queries while earlier responses are in flight
- Observable success: the list shows the latest request's results and never an older request's late results
- Non-goals: cancellation, retry, duplicate responses, debouncing, real network or browser behavior
- Worst regression: an older request's late response replaces or briefly precedes the latest results
- Reversibility: revert the isolated fixture
- Risk: Medium
- Sources: S1

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

## Behavior Contract

| ID  | Policy     | Formal                                                                                            | Given                                                   | When                                           | Then                                                                                 | Never                                                                                 | Side effects             | BVA                           |
| --- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------ | ----------------------------- |
| O1  | P3         | `Race.latestShown`                                                                                | requests 1 and 2 issued before any response             | response 2 arrives                             | the list ends with the results of request 2                                          | the list ends without request 2's results                                             | results rendered×1       | arrival: 1 then 2, 2 then 1   |
| O2  | P2         | `Race.staleNeverShown`                                                                            | request 2 issued while request 1 is unanswered          | response 1 arrives, before or after response 2 | a response to request 1 arriving after request 2 never changes the list, at any step | a late response to request 1 shown, even briefly                                      | stale results rendered×0 | arrival: 1 then 2, 2 then 1   |
| O3  | P1, P2     | `Race.unansweredKeeps`                                                                            | requests 1 and 2 issued; response 2 does not arrive     | response 1 arrives or nothing arrives          | the list keeps showing nothing                                                       | request 1's results shown                                                             | results rendered×0       | response 2: arrives, withheld |
| O5  | P3         | `Race.itemsShown`                                                                                 | any attempt                                             | the attempt ends                               | the list displays exactly the results of the response it shows, or none              | results that belong to no shown response, or a shown response without its own results | results rendered×1       | final: none, older, newer     |
| O4  | P1, P2, P3 | outside the world: trace conformance of the reducer on every trace of the Formal Model space (S2) | every trace of up to 4 events that `Search.next` allows | each event is applied to the reducer           | the reducer's observation equals `Search.observe` at every prefix                    | a prefix where they differ; an adapter error or budget stop counted as a pass         | none                     | bound: 4 events               |

- The Formal column is the meaning; the prose columns explain it and never override it.
- N/A: loading indicator, error, retry, duplicate responses and cancellation are outside this fixture's policy; out-of-order arrival is the arrival axis and the Formal Model space; empty result lists are not exercised — an accepted risk recorded in the discovery decisions (source: S1)

## Terms

| Term | Context | Name                    | Category     | Field       | Path                                                                                                                          | Definition                                                                                                            | Not                                                                                        | Source | Status    |
| ---- | ------- | ----------------------- | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | --------- |
| T1   | search  | response arrival order  | controllable | arrival     | test: the world adapter delivers response 1 before or after response 2                                                        | which of the two issued requests answers first                                                                        | the order in which the requests were issued                                                | S1     | confirmed |
| T2   | search  | newer answer arrives    | controllable | newAnswers  | test: the world adapter delivers or withholds response 2 within the attempt                                                   | the response to request 2 arrives within the attempt                                                                  | the response to request 1                                                                  | S1     | confirmed |
| T3   | list    | final list              | observable   | final       | reducer: results.requestId after the last event, read by search.adapter observe                                               | the request whose results the list shows when the attempt ends                                                        | the latest issued request id                                                               | S1     | confirmed |
| T4   | list    | late older result shown | observable   | oldShown    | reducer: results.requestId after every event from the second issue on, read by search.adapter observe                         | a response to request 1 that arrived after request 2 was issued changed the list to request 1's results, at some step | request 1's results kept on screen from before request 2 was issued (S1 item 1 keeps them) | S1     | confirmed |
| T6   | list    | shown results intact    | observable   | itemsIntact | reducer: results.items read through search.adapter snapshot, compared with the results the harness delivered for that request | the list displays exactly the results of the response it shows, and no results when it shows none                     | which request the list shows                                                               | S1     | confirmed |
| T5   | search  | latest request          | concept      | —           | —                                                                                                                             | the most recently issued request                                                                                      | —                                                                                          | S1     | confirmed |

## Adequacy

- World: S4 Race
- Coordinates: arrival newAnswers
- Observations: final oldShown itemsIntact
- Rows: O1=latestShown O2=staleNeverShown O3=unansweredKeeps O5=itemsShown
- Rows outside the world: O4 (trace conformance of the reducer on every trace of the Formal Model space (S2))

| Goal | Kind    | Cites |
| ---- | ------- | ----- |
| G1   | safety  | S1    |
| G2   | safety  | S1    |
| G3   | witness | S1    |
| G4   | safety  | S1    |
| G5   | safety  | S1    |

| Example | Goal | World                                                             | Verdict  |
| ------- | ---- | ----------------------------------------------------------------- | -------- |
| E1      | G1   | arrival=OldFirst newAnswers final=NewShown oldShown itemsIntact   | violates |
| E2      | G1   | arrival=OldFirst newAnswers final=NewShown !oldShown itemsIntact  | holds    |
| E3      | G5   | arrival=OldFirst newAnswers final=NewShown !oldShown !itemsIntact | violates |

| Hazard              | Disposition                                     |
| ------------------- | ----------------------------------------------- |
| permission-change   | n/a: S1 no permission in the search policy      |
| concurrent-change   | n/a: S1 one search box                          |
| display-vs-commit   | modeled: final oldShown itemsIntact             |
| effect-count        | n/a: S1 each response arrives at most once      |
| identity-reference  | n/a: S1 request ids are the only identity       |
| feature-composition | n/a: S1 search only                             |
| carry-over          | n/a: S1 one attempt starting from an empty list |
| order-timing        | modeled: arrival oldShown                       |

## Assumption sensitivity (computed)


## Outside the world (declared)

- Rows outside the world: O4 (trace conformance of the reducer on every trace of the Formal Model space (S2))
- hazard permission-change: n/a: S1 no permission in the search policy
- hazard concurrent-change: n/a: S1 one search box
- hazard effect-count: n/a: S1 each response arrives at most once
- hazard identity-reference: n/a: S1 request ids are the only identity
- hazard feature-composition: n/a: S1 search only
- hazard carry-over: n/a: S1 one attempt starting from an empty list