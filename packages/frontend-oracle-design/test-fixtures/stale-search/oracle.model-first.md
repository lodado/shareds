# Stale search fixture Oracle, model-first projection (skill tool fixture, not a product decision)

> Projected from the Oracle model package. Edit the package and regenerate; the region between the
> `oracle:generated` markers is checked against its digest and the package on every lint.

<!-- oracle:generated:begin generator=oracle-package@1.1 package=oracle.package.json inputs-sha256=a7ab77bbd2532d5b402129c55af47ec900feb26dcd04867d8659f6d9a2ec1de5 content-sha256=975d6d448d5ed9eb68d6606eaa1304e93293babd9636cafbe670dcc95de01695 -->

## Outcome Brief

- Actor and context: a person typing successive search queries while earlier responses are in flight
- Observable success: the list shows the latest request's results and never an older request's late results
- Non-goals: cancellation, retry, duplicate responses, debouncing, real network or browser behavior
- Worst regression: an older request's late response replaces or briefly precedes the latest results
- Reversibility: revert the isolated fixture
- Risk: Medium
- Sources: S1

## Source Registry

| ID  | Kind               | Jurisdiction                    | Standard              | Location·version              | Approval status |
| --- | ------------------ | ------------------------------- | --------------------- | ----------------------------- | --------------- |
| S1  | product-policy     | search response ordering        | fixture policy text   | repo:README.md#fixture-policy | approved        |
| S2  | product-policy     | reference model and environment | Bend 2.0.34 model     | repo:MODEL.bend#v1            | approved        |
| S3  | product-policy     | approved laws                   | Bend 2.0.34 laws      | repo:LAWS.bend#v1             | approved        |
| S4  | product-policy     | adequacy world model            | Bend 2.0.34 world     | repo:World.bend#v1            | approved        |
| S6  | product-policy     | metamorphic relations           | Bend 2.0.34 relations | repo:Metamorphic.bend#v1      | approved        |
| S5  | project-constraint | oracle model package            | oracle-package v1     | repo:oracle.package.json#v1   | approved        |

## Requirements

| ID  | Source | Quote                                                                                                                          | Mapped by      |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| R1  | S1     | Every search request gets a request id that grows by one per issued request.                                                   | behavior       |
| R2  | S1     | Issuing a request makes it the latest one; the list keeps showing what it showed until a response arrives.                     | G3 G4 P1 MR1   |
| R3  | S1     | A response to an older request does not change what the list shows.                                                            | G1 G4 P2       |
| R4  | S1     | The latest request's response is shown when it arrives.                                                                        | G2 G3 G5 P3 O5 |
| R5  | S1     | The environment delivers each response at most once, only after its request, in any order.                                     | behavior       |
| R6  | S1     | Cancellation, retry, duplicate responses and a response before its request are out of scope; no guarantee is claimed for them. | N/A            |

## Decided policies

- P1: Issuing a search request makes it the latest request; the list keeps what it shows until a response arrives. (source: S1) (rows: O3, O4)
- P2: A response to an older request does not alter what the list shows, at any step. (source: S1) (rows: O2, O3, O4)
- P3: The latest request's response is shown when it arrives. (source: S1) (rows: O1, O5, O4)

## Behavior Contract

| ID  | Policy     | Formal                                                                                            | Given                                                                           | When                                                                       | Then                                                                                                                     | Never                                                                                             | Side effects                                 | BVA                                                                      |
| --- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| O1  | P3         | `Race.latestShown`                                                                                | requests 1 and 2 issued; response 1 arrives before or after request 2 is issued | response 2 arrives                                                         | the list ends with request 2's response, also when it carries no results                                                 | the list ends without request 2's response                                                        | results rendered×1                           | arrival: 1 before request 2, 1 then 2, 2 then 1; response 2 empty or not |
| O2  | P2         | `Race.staleNeverShown`                                                                            | request 2 issued while request 1 is unanswered                                  | response 1 arrives, before or after response 2, empty or not               | a response to request 1 arriving after request 2 was issued never changes the list, at any step                          | a late response to request 1 shown, even briefly                                                  | stale results rendered×0                     | arrival: 1 then 2, 2 then 1; response 1 empty or not                     |
| O3  | P1, P2     | `Race.unansweredKeeps`                                                                            | requests 1 and 2 issued; response 2 does not arrive                             | response 1 arrives before or after request 2 is issued, or nothing arrives | the list keeps showing what it showed when request 2 was issued: request 1's results when they had arrived, else nothing | the kept results cleared, or request 1's late results shown                                       | results rendered×0 after request 2 is issued | response 2: withheld; response 1: before or after request 2              |
| O5  | P3         | `Race.itemsShown`                                                                                 | any attempt                                                                     | after every event                                                          | the list displays exactly the results of the response it shows, or none                                                  | results of no shown response, a mix of two responses, or a shown response without its own results | results rendered×1                           | final: none, older, newer; results: empty or not; every event            |
| O4  | P1, P2, P3 | outside the world: trace conformance of the reducer on every trace of the Formal Model space (S2) | every trace of up to 5 events that `Search.next` allows                         | each event is applied to the reducer                                       | the reducer's observation equals `Search.observe` at every prefix                                                        | a prefix where they differ; an adapter error or budget stop counted as a pass                     | none                                         | bound: 5 events                                                          |

- The Formal column is the meaning; the prose columns explain it and never override it.
- N/A: loading indicator, error, timeout, retry, duplicate responses, cancellation and pagination are outside this fixture's policy; out-of-order arrival is the arrival axis and the Formal Model space (source: S1)

## Case space

- Coverage: model
- Possible cases: 576 of 576 worlds (0 excluded); 26 traces of up to 5 events; transition cover capped at 5 events (44 cases; the state grows without bound)

| Family      | Dimension   | Choices                           |
| ----------- | ----------- | --------------------------------- |
| Data        | oldEmpty    | false, true                       |
| Data        | newEmpty    | false, true                       |
| Value       | longSession | false, true                       |
| Async       | newAnswers  | false, true                       |
| Order       | arrival     | OldFirst, NewFirst, OldEarly      |
| Entry       | —           | excluded: one search box S1       |
| Environment | —           | excluded: pure reducer fixture S1 |
| Platform    | —           | excluded: pure reducer fixture S1 |
| Inherited   | —           | excluded: first revision S1       |

## Terms

| Term | Context | Name                    | Category     | Field       | Path                                                                                                                                               | Definition                                                                                                                                                       | Not                                                                                        | Source | Status    |
| ---- | ------- | ----------------------- | ------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | --------- |
| T1   | search  | response arrival order  | controllable | arrival     | test: the world adapter delivers response 1 before request 2 is issued, or after it and before or after response 2                                 | when response 1 arrives: after both requests were issued and before response 2 (OldFirst), after response 2 (NewFirst), or before request 2 is issued (OldEarly) | the order in which the requests were issued                                                | S1     | confirmed |
| T2   | search  | newer answer arrives    | controllable | newAnswers  | test: the world adapter delivers or withholds response 2 within the attempt                                                                        | the response to request 2 arrives within the attempt                                                                                                             | the response to request 1                                                                  | S1     | confirmed |
| T3   | list    | final list              | observable   | final       | reducer: results.requestId after the last event, read by search.adapter observe                                                                    | the request whose results the list shows when the attempt ends                                                                                                   | the latest issued request id                                                               | S1     | confirmed |
| T4   | list    | late older result shown | observable   | oldShown    | reducer: results.requestId after every event from response 1's late arrival on, read by search.adapter observe                                     | a response to request 1 that arrived after request 2 was issued changed the list to request 1's results, at some step                                            | request 1's results kept on screen from before request 2 was issued (S1 item 1 keeps them) | S1     | confirmed |
| T6   | list    | shown results intact    | observable   | itemsIntact | reducer: results.items after every event, read through search.adapter snapshot, compared with the results the harness delivered with that response | after every event, the list displays exactly the results of the response it shows, and no results when it shows none                                             | which request the list shows                                                               | S1     | confirmed |
| T7   | search  | older response empty    | controllable | oldEmpty    | test: the world adapter delivers response 1 with an empty result list                                                                              | the response to request 1 carries no results; it is still request 1's response                                                                                   | response 1 not arriving                                                                    | S1     | confirmed |
| T8   | search  | newer response empty    | controllable | newEmpty    | test: the world adapter delivers response 2 with an empty result list                                                                              | the response to request 2 carries no results; it is still the latest request's response (S1 item 3)                                                              | response 2 not arriving (T2)                                                               | S1     | confirmed |
| T9   | search  | long session            | controllable | longSession | test: the world adapter issues eight earlier requests, never answered, before the attempt, so the attempt's requests are 9 and 10                  | the attempt's requests are the ninth and tenth of the session, so their ids cross from one digit to two (9 and 10)                                               | responses to the earlier requests (they never arrive)                                      | S1     | confirmed |
| T5   | search  | latest request          | concept      | —           | —                                                                                                                                                  | the most recently issued request                                                                                                                                 | —                                                                                          | S1     | confirmed |
| T10  | list    | list change             | concept      | —           | —                                                                                                                                                  | an event after which the list shows another request's results, other results, or nothing where it showed results                                                 | issuing a request, after which the list keeps what it shows (S1 item 1)                    | S1     | confirmed |

## Adequacy

- World: S4 Race
- Coordinates: arrival newAnswers oldEmpty newEmpty longSession
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

| Example | Goal | World                                                                                               | Verdict  |
| ------- | ---- | --------------------------------------------------------------------------------------------------- | -------- |
| E1      | G1   | arrival=OldFirst newAnswers !oldEmpty !newEmpty !longSession final=NewShown oldShown itemsIntact    | violates |
| E2      | G1   | arrival=OldFirst newAnswers !oldEmpty !newEmpty !longSession final=NewShown !oldShown itemsIntact   | holds    |
| E3      | G5   | arrival=OldFirst newAnswers !oldEmpty !newEmpty !longSession final=NewShown !oldShown !itemsIntact  | violates |
| E4      | G4   | arrival=OldEarly !newAnswers !oldEmpty !newEmpty !longSession final=OldShown !oldShown itemsIntact  | holds    |
| E5      | G4   | arrival=OldEarly !newAnswers !oldEmpty !newEmpty !longSession final=NoneShown !oldShown itemsIntact | violates |
| E6      | G2   | arrival=NewFirst newAnswers !oldEmpty newEmpty !longSession final=NewShown !oldShown itemsIntact    | holds    |
| E7      | G1   | arrival=NewFirst newAnswers !oldEmpty !newEmpty longSession final=NewShown !oldShown itemsIntact    | holds    |

| Hazard              | Disposition                                |
| ------------------- | ------------------------------------------ |
| permission-change   | n/a: S1 no permission in the search policy |
| concurrent-change   | n/a: S1 one search box                     |
| display-vs-commit   | modeled: final oldShown itemsIntact        |
| effect-count        | n/a: S1 each response arrives at most once |
| identity-reference  | n/a: S1 request ids are the only identity  |
| feature-composition | n/a: S1 search only                        |
| carry-over          | modeled: arrival final itemsIntact         |
| order-timing        | modeled: arrival oldShown                  |

## Formal Model

- Model: S2
- Laws: S3
- Prefix: Search
- Bound: 5
- Observation: `Search.observe` is the request id whose results the list shows, 0 when none; the adapter reads the reducer's `results.requestId`
- Out of scope: cancellation, retry, duplicate responses, a response before its request (S1 item 4)
- Not formalized: none
- Conformance row: O4

| Law              | Kind    | Cites    |
| ---------------- | ------- | -------- |
| issue_advances   | effect  | P1 O3    |
| stale_ignored    | safety  | P2 O2    |
| latest_applied   | effect  | P3 O1    |
| latest_reachable | witness | P1 P3 O1 |

## Discovery Space

- Space version: 5

| Fault | Class            | File               | Mutation                                                            |
| ----- | ---------------- | ------------------ | ------------------------------------------------------------------- |
| F1    | ordering         | search-reducer.mts | drop the stale-response check                                       |
| F2    | conditional      | search-reducer.mts | !== becomes <                                                       |
| F3    | boundary         | search-reducer.mts | request ids grow by 2                                               |
| F4    | state-transition | search-reducer.mts | issuing clears the list                                             |
| F5    | stale-data       | search-reducer.mts | the shown results lose their items                                  |
| F6    | ordering         | search-reducer.mts | only the previous request counts as stale                           |
| F7    | stale-data       | search-reducer.mts | a response appends to the results already shown                     |
| F8    | conditional      | search-reducer.mts | an empty response is skipped                                        |
| F9    | ordering         | search-reducer.mts | an empty response clears the list before the stale check            |
| F10   | state-transition | search-reducer.mts | a stale response clears the list                                    |
| F11   | conditional      | search-reducer.mts | request ids compared as text                                        |
| F12   | conditional      | search-reducer.mts | a late response is ignored only when nothing or the latest is shown |

| Relation | Transform          | Holds          | Requirements |
| -------- | ------------------ | -------------- | ------------ |
| MR1      | Meta.issueAppended | Meta.sameShown | R2           |

| Operator              | Disposition                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| dependency-failure    | n/a: S1 errors, retry and cancellation are outside this fixture policy |
| latency               | modeled: event.Msg                                                     |
| environment-variation | n/a: S1 a pure reducer with no browser, device or viewport in scope    |
| malformed-input       | n/a: S1 request ids come from the product, not from user input         |
| concurrency           | modeled: event.Msg                                                     |

| Residue field   | Disposition                         |
| --------------- | ----------------------------------- |
| latestRequestId | modeled: state.Search.Search.latest |

| Axis                   | Origin         | Ref          | Reason                                                                                                                                               |
| ---------------------- | -------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| world.Race.oldShown    | counterexample | C-fee4ce433a | space v1 judged G1 differently on two worlds alike in every coordinate and observation; the differing fact was the hidden oldShown                   |
| world.Race.itemsIntact | counterexample | C-069764844d | space v1 let the mutant that empties the shown results (F5) survive every check: the observation was only the request id                             |
| world.Race.newEmpty    | counterexample | C-b55fd8002e | no world delivered an empty response, so a product that skips empty responses passed every check of space v2                                         |
| world.Race.oldEmpty    | counterexample | C-5b74ed91ab | no world delivered an empty late response, so an empty-response branch ahead of the stale check passed every check of space v2                       |
| world.Race.longSession | counterexample | C-56c922678f | the space never reached a two-digit request id (the traces stop at 4 events, sampling at 8), so comparing ids as text passed every check of space v3 |

## Derived Axes

- Derivation: oracle-package.mjs derive v1 · digest 2e7c4cf72c66ab5efa90f24699625d3fdea8504d70a3c678006c62aa50b54026 · status derived
- Order obligations: 6 within bound 5 (order-sensitive 4, history-sensitive 2)
- Diagnostics: none

| Axis                       | Role         | Derivation | Status  | Domain                      | Model refs       | Terms | Sources | Limitations                                                                                                                                                             |
| -------------------------- | ------------ | ---------- | ------- | --------------------------- | ---------------- | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| world.Race.arrival         | controllable | structural | derived | OldFirst NewFirst OldEarly  | Race.arrival     | T1    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.newAnswers      | controllable | structural | derived | false true                  | Race.newAnswers  | T2    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.oldEmpty        | controllable | structural | derived | false true                  | Race.oldEmpty    | T7    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.newEmpty        | controllable | structural | derived | false true                  | Race.newEmpty    | T8    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.longSession     | controllable | structural | derived | false true                  | Race.longSession | T9    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.final           | observable   | structural | derived | NoneShown OldShown NewShown | Race.final       | T3    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.oldShown        | observable   | structural | derived | false true                  | Race.oldShown    | T4    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.itemsIntact     | observable   | structural | derived | false true                  | Race.itemsIntact | T6    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| event.Msg                  | environment  | structural | derived | Issue Respond               | Search.next      | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; events come from the environment next(history); the test drives them, the product must handle each |
| event.Msg.Respond.id       | environment  | structural | derived | 1 2 3 4                     | Msg.Respond      | —     | S2      | infinite or compound domain — enumerated only up to the trace bound                                                                                                     |
| state.Search.Search.latest | hidden       | structural | derived | Nat                         | Search.Search    | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; model state — only what observe projects is compared with the product                              |
| state.Search.Search.shown  | hidden       | structural | derived | Nat                         | Search.Search    | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; model state — only what observe projects is compared with the product                              |
| observation.Search.observe | observable   | structural | derived | 0 1 2 3 4                   | Search.observe   | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; read through the adapter’s observe — the Observation line names the product path                   |

## Open questions

### Q1 Does one request-id sequence outlive a remount of the search box? Recommended: no claim in this fixture — S1 describes one reducer lifetime, so a response that outlives its search box is owned by the component that mounts it (owner-lifetime), not by this policy

- Sources: S1

### Q2 Is anything outside the reducer in scope — the layer that sends requests and tags each response with its id (errors, timeouts, the id a response carries) or the view that renders the list (loading states, counts, labels)? Recommended: no claim in this fixture — S1 describes responses that carry results and says nothing of errors or rendering, and the product under test is the reducer, judged on the events it receives

- Sources: S1

<!-- oracle:generated:end -->

## User Confirmation

- Status: approved
- Source: synthetic fixture approval; not a real consumer user confirmation
