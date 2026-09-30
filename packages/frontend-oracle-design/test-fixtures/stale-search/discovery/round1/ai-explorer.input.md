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

### S5 repo:oracle.package.json#v1

{
  "packageVersion": 1,
  "id": "stale-search",
  "spaceVersion": 2,
  "intent": {
    "actor": "a person typing successive search queries while earlier responses are in flight",
    "observableSuccess": "the list shows the latest request's results and never an older request's late results",
    "nonGoals": "cancellation, retry, duplicate responses, debouncing, real network or browser behavior",
    "worstRegression": "an older request's late response replaces or briefly precedes the latest results",
    "reversibility": "revert the isolated fixture",
    "risk": "Medium",
    "openQuestions": []
  },
  "sources": [
    {
      "id": "S1",
      "kind": "product-policy",
      "jurisdiction": "search response ordering",
      "standard": "fixture policy text",
      "location": "repo:README.md#fixture-policy",
      "approval": "approved"
    },
    {
      "id": "S2",
      "kind": "product-policy",
      "jurisdiction": "reference model and environment",
      "standard": "Bend 2.0.34 model",
      "location": "repo:MODEL.bend#v1",
      "approval": "approved"
    },
    {
      "id": "S3",
      "kind": "product-policy",
      "jurisdiction": "approved laws",
      "standard": "Bend 2.0.34 laws",
      "location": "repo:LAWS.bend#v1",
      "approval": "approved"
    },
    {
      "id": "S4",
      "kind": "product-policy",
      "jurisdiction": "adequacy world model",
      "standard": "Bend 2.0.34 world",
      "location": "repo:World.bend#v1",
      "approval": "approved"
    },
    {
      "id": "S6",
      "kind": "product-policy",
      "jurisdiction": "metamorphic relations",
      "standard": "Bend 2.0.34 relations",
      "location": "repo:Metamorphic.bend#v1",
      "approval": "approved"
    },
    {
      "id": "S5",
      "kind": "project-constraint",
      "jurisdiction": "oracle model package",
      "standard": "oracle-package v1",
      "location": "repo:oracle.package.json#v1",
      "approval": "approved",
      "self": true
    }
  ],
  "requirements": [
    {
      "id": "R1",
      "source": "S1",
      "quote": "Every search request gets a request id that grows by one per issued request."
    },
    {
      "id": "R2",
      "source": "S1",
      "quote": "Issuing a request makes it the latest one; the list keeps showing what it showed until a response arrives."
    },
    {
      "id": "R3",
      "source": "S1",
      "quote": "A response to an older request does not change what the list shows."
    },
    {
      "id": "R4",
      "source": "S1",
      "quote": "The latest request's response is shown when it arrives."
    },
    {
      "id": "R5",
      "source": "S1",
      "quote": "The environment delivers each response at most once, only after its request, in any order."
    },
    {
      "id": "R6",
      "source": "S1",
      "quote": "Cancellation, retry, duplicate responses and a response before its request are out of scope; no guarantee is claimed for them."
    }
  ],
  "policies": [
    {
      "id": "P1",
      "text": "Issuing a search request makes it the latest request; the list keeps what it shows until a response arrives.",
      "sources": ["S1"],
      "requirements": ["R2"]
    },
    {
      "id": "P2",
      "text": "A response to an older request does not alter what the list shows, at any step.",
      "sources": ["S1"],
      "requirements": ["R3"]
    },
    {
      "id": "P3",
      "text": "The latest request's response is shown when it arrives.",
      "sources": ["S1"],
      "requirements": ["R4"]
    }
  ],
  "world": {
    "source": "S4",
    "prefix": "Race"
  },
  "terms": [
    {
      "id": "T1",
      "context": "search",
      "name": "response arrival order",
      "role": "controllable",
      "family": "Order",
      "field": "arrival",
      "path": "test: the world adapter delivers response 1 before or after response 2",
      "definition": "which of the two issued requests answers first",
      "not": "the order in which the requests were issued",
      "source": "S1",
      "status": "confirmed"
    },
    {
      "id": "T2",
      "context": "search",
      "name": "newer answer arrives",
      "role": "controllable",
      "family": "Async",
      "field": "newAnswers",
      "path": "test: the world adapter delivers or withholds response 2 within the attempt",
      "definition": "the response to request 2 arrives within the attempt",
      "not": "the response to request 1",
      "source": "S1",
      "status": "confirmed"
    },
    {
      "id": "T3",
      "context": "list",
      "name": "final list",
      "role": "observable",
      "field": "final",
      "path": "reducer: results.requestId after the last event, read by search.adapter observe",
      "definition": "the request whose results the list shows when the attempt ends",
      "not": "the latest issued request id",
      "source": "S1",
      "status": "confirmed"
    },
    {
      "id": "T4",
      "context": "list",
      "name": "older result shown",
      "role": "observable",
      "field": "oldShown",
      "path": "reducer: results.requestId after every event from the second issue on, read by search.adapter observe",
      "definition": "at some step after request 2 was issued, the list showed request 1's results",
      "not": "what the list shows at the end",
      "source": "S1",
      "status": "confirmed"
    },
    {
      "id": "T6",
      "context": "list",
      "name": "shown results intact",
      "role": "observable",
      "family": "Data",
      "field": "itemsIntact",
      "path": "reducer: results.items read through search.adapter snapshot, compared with the results the harness delivered for that request",
      "definition": "the list shows the results of the response it shows, or shows nothing",
      "not": "which request the list shows",
      "source": "S1",
      "status": "confirmed"
    },
    {
      "id": "T5",
      "context": "search",
      "name": "latest request",
      "role": "concept",
      "definition": "the most recently issued request",
      "source": "S1",
      "status": "confirmed"
    }
  ],
  "assumptions": [],
  "goals": [
    {
      "id": "G1",
      "kind": "safety",
      "cites": ["S1"],
      "author": "controller",
      "requirements": ["R3"]
    },
    {
      "id": "G2",
      "kind": "safety",
      "cites": ["S1"],
      "author": "controller",
      "requirements": ["R4"]
    },
    {
      "id": "G3",
      "kind": "witness",
      "cites": ["S1"],
      "author": "controller",
      "requirements": ["R2", "R4"]
    },
    {
      "id": "G4",
      "kind": "safety",
      "cites": ["S1"],
      "author": "controller",
      "requirements": ["R2", "R3"]
    },
    {
      "id": "G5",
      "kind": "safety",
      "cites": ["S1"],
      "author": "controller",
      "requirements": ["R4"]
    }
  ],
  "examples": [
    {
      "id": "E1",
      "goal": "G1",
      "world": "arrival=OldFirst newAnswers final=NewShown oldShown itemsIntact",
      "verdict": "violates"
    },
    {
      "id": "E2",
      "goal": "G1",
      "world": "arrival=OldFirst newAnswers final=NewShown !oldShown itemsIntact",
      "verdict": "holds"
    },
    {
      "id": "E3",
      "goal": "G5",
      "world": "arrival=OldFirst newAnswers final=NewShown !oldShown !itemsIntact",
      "verdict": "violates"
    }
  ],
  "hazards": {
    "permission-change": "n/a: S1 no permission in the search policy",
    "concurrent-change": "n/a: S1 one search box",
    "display-vs-commit": "modeled: final oldShown itemsIntact",
    "effect-count": "n/a: S1 each response arrives at most once",
    "identity-reference": "n/a: S1 request ids are the only identity",
    "feature-composition": "n/a: S1 search only",
    "carry-over": "n/a: S1 one attempt starting from an empty list",
    "order-timing": "modeled: arrival oldShown"
  },
  "contract": [
    {
      "key": "latestShown",
      "row": "O1",
      "def": "latestShown",
      "policies": ["P3"],
      "given": "requests 1 and 2 issued before any response",
      "when": "response 2 arrives",
      "then": "the list ends with the results of request 2",
      "never": "the list ends without request 2's results",
      "sideEffects": "results rendered×1",
      "bva": "arrival: 1 then 2, 2 then 1"
    },
    {
      "key": "staleNeverShown",
      "row": "O2",
      "def": "staleNeverShown",
      "policies": ["P2"],
      "given": "request 2 issued after request 1",
      "when": "response 1 arrives, before or after response 2",
      "then": "the list never shows request 1's results, at any step",
      "never": "request 1's results shown after request 2 was issued, even briefly",
      "sideEffects": "stale results rendered×0",
      "bva": "arrival: 1 then 2, 2 then 1"
    },
    {
      "key": "unansweredKeeps",
      "row": "O3",
      "def": "unansweredKeeps",
      "policies": ["P1", "P2"],
      "given": "requests 1 and 2 issued; response 2 does not arrive",
      "when": "response 1 arrives or nothing arrives",
      "then": "the list keeps showing nothing",
      "never": "request 1's results shown",
      "sideEffects": "results rendered×0",
      "bva": "response 2: arrives, withheld"
    },
    {
      "key": "itemsShown",
      "row": "O5",
      "def": "itemsShown",
      "policies": ["P3"],
      "given": "a response is shown",
      "when": "the attempt ends",
      "then": "the list shows that response's results",
      "never": "a shown request with results that are not its own",
      "sideEffects": "results rendered×1",
      "bva": "final: none, older, newer",
      "requirements": ["R4"]
    },
    {
      "key": "traceConformance",
      "row": "O4",
      "outside": "trace conformance of the reducer on every trace of the Formal Model space (S2)",
      "policies": ["P1", "P2", "P3"],
      "given": "every trace of up to 4 events that `Search.next` allows",
      "when": "each event is applied to the reducer",
      "then": "the reducer's observation equals `Search.observe` at every prefix",
      "never": "a prefix where they differ; an adapter error or budget stop counted as a pass",
      "sideEffects": "none",
      "bva": "bound: 4 events"
    }
  ],
  "notApplicable": [
    {
      "text": "loading indicator, error, retry, empty data, duplicate responses and cancellation are outside this fixture's policy; out-of-order arrival is the arrival axis and the Formal Model space",
      "sources": ["S1"],
      "requirements": ["R6"]
    }
  ],
  "families": {
    "Value": "excluded: request ids are enumerated by the Formal Model space (S2)",
    "Entry": "excluded: one search box S1",
    "Environment": "excluded: pure reducer fixture S1",
    "Platform": "excluded: pure reducer fixture S1",
    "Inherited": "excluded: first revision S1"
  },
  "behavior": {
    "model": "S2",
    "laws": "S3",
    "prefix": "Search",
    "bound": 4,
    "observation": "`Search.observe` is the request id whose results the list shows, 0 when none; the adapter reads the reducer's `results.requestId`",
    "outOfScope": "cancellation, retry, duplicate responses, a response before its request (S1 item 4)",
    "notFormalized": "none",
    "conformance": "traceConformance",
    "lawRows": [
      {
        "name": "issue_advances",
        "kind": "effect",
        "cites": ["P1", "unansweredKeeps"]
      },
      {
        "name": "stale_ignored",
        "kind": "safety",
        "cites": ["P2", "staleNeverShown"]
      },
      {
        "name": "latest_applied",
        "kind": "effect",
        "cites": ["P3", "latestShown"]
      },
      {
        "name": "latest_reachable",
        "kind": "witness",
        "cites": ["P1", "P3", "latestShown"]
      }
    ],
    "requirements": ["R1", "R5"]
  },
  "product": {
    "adapter": "search.adapter.mjs",
    "worldAdapter": "world.adapter.mjs",
    "files": ["search-reducer.mts"],
    "runs": 100,
    "maxLength": 8
  },
  "faultModel": [
    {
      "id": "F1",
      "class": "ordering",
      "file": "search-reducer.mts",
      "find": "if (event.requestId !== state.latestRequestId) return state",
      "replace": "",
      "note": "drop the stale-response check"
    },
    {
      "id": "F2",
      "class": "conditional",
      "file": "search-reducer.mts",
      "find": "event.requestId !== state.latestRequestId",
      "replace": "event.requestId < state.latestRequestId",
      "note": "!== becomes <"
    },
    {
      "id": "F3",
      "class": "boundary",
      "file": "search-reducer.mts",
      "find": "latestRequestId: state.latestRequestId + 1",
      "replace": "latestRequestId: state.latestRequestId + 2",
      "note": "request ids grow by 2"
    },
    {
      "id": "F4",
      "class": "state-transition",
      "file": "search-reducer.mts",
      "find": "return { ...state, latestRequestId: state.latestRequestId + 1 }",
      "replace": "return { latestRequestId: state.latestRequestId + 1, results: null }",
      "note": "issuing clears the list"
    },
    {
      "id": "F5",
      "class": "stale-data",
      "file": "search-reducer.mts",
      "find": "items: event.items",
      "replace": "items: []",
      "note": "the shown results lose their items"
    }
  ],
  "metamorphic": {
    "source": "S6",
    "relations": [
      {
        "id": "MR1",
        "transform": "Meta.issueAppended",
        "relation": "Meta.sameShown",
        "requirements": ["R2"]
      }
    ]
  },
  "operators": {
    "dependency-failure": "n/a: S1 errors, retry and cancellation are outside this fixture policy",
    "latency": "modeled: event.Msg",
    "environment-variation": "n/a: S1 a pure reducer with no browser, device or viewport in scope",
    "malformed-input": "n/a: S1 request ids come from the product, not from user input",
    "concurrency": "modeled: event.Msg"
  },
  "residue": {
    "latestRequestId": "modeled: state.Search.Search.latest"
  },
  "axisOrigins": {
    "world.Race.oldShown": {
      "origin": "counterexample",
      "ref": "C-fee4ce433a",
      "reason": "space v1 judged G1 differently on two worlds alike in every coordinate and observation; the differing fact was the hidden oldShown"
    },
    "world.Race.itemsIntact": {
      "origin": "counterexample",
      "ref": "C-069764844d",
      "reason": "space v1 let the mutant that empties the shown results (F5) survive every check: the observation was only the request id"
    }
  },
  "discoveryDecisions": [
    {
      "candidate": "C-fee4ce433a",
      "decision": "promoted",
      "axis": "world.Race.oldShown",
      "source": "S1",
      "reason": "S1 item 2 forbids showing an older result at any step, not only at the end — observe the list after every event"
    },
    {
      "candidate": "C-3ac744e3e6",
      "decision": "promoted",
      "axis": "staleNeverShown",
      "source": "S1",
      "reason": "the end-state row let a brief older result pass; the contract now forbids it at every step"
    },
    {
      "candidate": "C-069764844d",
      "decision": "promoted",
      "axis": "world.Race.itemsIntact",
      "source": "S1",
      "reason": "S1 item 3 shows the response, not only its id — observe that the shown results are the response's own"
    },
    {
      "candidate": "C-9ac2b5f9d0",
      "decision": "equivalent",
      "reason": "the environment (S1 item 4) never delivers a response id above the latest issued id, so !== and < decide the same on every in-space trace"
    },
    {
      "candidate": "C-3effbeff60",
      "decision": "out-of-scope",
      "source": "S1",
      "reason": "a response before its request is out of scope (S1 item 4, R6); the reducer does accept a response with id 0 before any request because its initial latest id is 0 — kept as residual risk"
    }
  ]
}

## Behavior Contract

| ID  | Policy     | Formal                                                                                            | Given                                                   | When                                           | Then                                                              | Never                                                                         | Side effects             | BVA                           |
| --- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------ | ----------------------------- |
| O1  | P3         | `Race.latestShown`                                                                                | requests 1 and 2 issued before any response             | response 2 arrives                             | the list ends with the results of request 2                       | the list ends without request 2's results                                     | results rendered×1       | arrival: 1 then 2, 2 then 1   |
| O2  | P2         | `Race.staleNeverShown`                                                                            | request 2 issued after request 1                        | response 1 arrives, before or after response 2 | the list never shows request 1's results, at any step             | request 1's results shown after request 2 was issued, even briefly            | stale results rendered×0 | arrival: 1 then 2, 2 then 1   |
| O3  | P1, P2     | `Race.unansweredKeeps`                                                                            | requests 1 and 2 issued; response 2 does not arrive     | response 1 arrives or nothing arrives          | the list keeps showing nothing                                    | request 1's results shown                                                     | results rendered×0       | response 2: arrives, withheld |
| O5  | P3         | `Race.itemsShown`                                                                                 | a response is shown                                     | the attempt ends                               | the list shows that response's results                            | a shown request with results that are not its own                             | results rendered×1       | final: none, older, newer     |
| O4  | P1, P2, P3 | outside the world: trace conformance of the reducer on every trace of the Formal Model space (S2) | every trace of up to 4 events that `Search.next` allows | each event is applied to the reducer           | the reducer's observation equals `Search.observe` at every prefix | a prefix where they differ; an adapter error or budget stop counted as a pass | none                     | bound: 4 events               |

- The Formal column is the meaning; the prose columns explain it and never override it.
- N/A: loading indicator, error, retry, empty data, duplicate responses and cancellation are outside this fixture's policy; out-of-order arrival is the arrival axis and the Formal Model space (source: S1)

## Terms

| Term | Context | Name                   | Category     | Field       | Path                                                                                                                          | Definition                                                                   | Not                                         | Source | Status    |
| ---- | ------- | ---------------------- | ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ------ | --------- |
| T1   | search  | response arrival order | controllable | arrival     | test: the world adapter delivers response 1 before or after response 2                                                        | which of the two issued requests answers first                               | the order in which the requests were issued | S1     | confirmed |
| T2   | search  | newer answer arrives   | controllable | newAnswers  | test: the world adapter delivers or withholds response 2 within the attempt                                                   | the response to request 2 arrives within the attempt                         | the response to request 1                   | S1     | confirmed |
| T3   | list    | final list             | observable   | final       | reducer: results.requestId after the last event, read by search.adapter observe                                               | the request whose results the list shows when the attempt ends               | the latest issued request id                | S1     | confirmed |
| T4   | list    | older result shown     | observable   | oldShown    | reducer: results.requestId after every event from the second issue on, read by search.adapter observe                         | at some step after request 2 was issued, the list showed request 1's results | what the list shows at the end              | S1     | confirmed |
| T6   | list    | shown results intact   | observable   | itemsIntact | reducer: results.items read through search.adapter snapshot, compared with the results the harness delivered for that request | the list shows the results of the response it shows, or shows nothing        | which request the list shows                | S1     | confirmed |
| T5   | search  | latest request         | concept      | —           | —                                                                                                                             | the most recently issued request                                             | —                                           | S1     | confirmed |

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