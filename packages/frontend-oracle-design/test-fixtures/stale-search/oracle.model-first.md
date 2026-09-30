# Stale search fixture Oracle, model-first projection (skill tool fixture, not a product decision)

> Projected from the Oracle model package. Edit the package and regenerate; the region between the
> `oracle:generated` markers is checked against its digest and the package on every lint.

<!-- oracle:generated:begin generator=oracle-package@1.1 package=oracle.package.json inputs-sha256=4134c704ccbaf925d42035535708a7a7fa7009c9527e8dd2e636207eff4e2a04 content-sha256=303261147955969080d4fe7b154f307b7e15d6bb5b691f536fa2ae62eee16fe4 -->

## Outcome Brief

- Actor and context: a person typing successive search queries while earlier responses are in flight
- Observable success: the list shows the latest request's results and never an older request's late results
- Non-goals: cancellation, retry, duplicate responses, debouncing, real network or browser behavior
- Worst regression: an older request's late response replaces or briefly precedes the latest results
- Reversibility: revert the isolated fixture
- Risk: Medium
- Sources: S1

## Source Registry

| ID  | Kind               | Jurisdiction                    | Standard            | Location·version              | Approval status |
| --- | ------------------ | ------------------------------- | ------------------- | ----------------------------- | --------------- |
| S1  | product-policy     | search response ordering        | fixture policy text | repo:README.md#fixture-policy | approved        |
| S2  | product-policy     | reference model and environment | Bend 2.0.34 model   | repo:MODEL.bend#v1            | approved        |
| S3  | product-policy     | approved laws                   | Bend 2.0.34 laws    | repo:LAWS.bend#v1             | approved        |
| S4  | product-policy     | adequacy world model            | Bend 2.0.34 world   | repo:World.bend#v1            | approved        |
| S5  | project-constraint | oracle model package            | oracle-package v1   | repo:oracle.package.json#v1   | approved        |

## Decided policies

- P1: Issuing a search request makes it the latest request; the list keeps what it shows until a response arrives. (source: S1) (rows: O3, O4)
- P2: A response to an older request does not alter what the list shows, at any step. (source: S1) (rows: O2, O3, O4)
- P3: The latest request's response is shown when it arrives. (source: S1) (rows: O1, O4)

## Behavior Contract

| ID  | Policy     | Formal                                                                                            | Given                                                   | When                                           | Then                                                              | Never                                                                         | Side effects             | BVA                           |
| --- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------ | ----------------------------- |
| O1  | P3         | `Race.latestShown`                                                                                | requests 1 and 2 issued before any response             | response 2 arrives                             | the list ends with the results of request 2                       | the list ends without request 2's results                                     | results rendered×1       | arrival: 1 then 2, 2 then 1   |
| O2  | P2         | `Race.staleNeverShown`                                                                            | request 2 issued after request 1                        | response 1 arrives, before or after response 2 | the list never shows request 1's results, at any step             | request 1's results shown after request 2 was issued, even briefly            | stale results rendered×0 | arrival: 1 then 2, 2 then 1   |
| O3  | P1, P2     | `Race.unansweredKeeps`                                                                            | requests 1 and 2 issued; response 2 does not arrive     | response 1 arrives or nothing arrives          | the list keeps showing nothing                                    | request 1's results shown                                                     | results rendered×0       | response 2: arrives, withheld |
| O4  | P1, P2, P3 | outside the world: trace conformance of the reducer on every trace of the Formal Model space (S2) | every trace of up to 4 events that `Search.next` allows | each event is applied to the reducer           | the reducer's observation equals `Search.observe` at every prefix | a prefix where they differ; an adapter error or budget stop counted as a pass | none                     | bound: 4 events               |

- The Formal column is the meaning; the prose columns explain it and never override it.
- N/A: loading indicator, error, retry, empty data, duplicate responses and cancellation are outside this fixture's policy; out-of-order arrival is the arrival axis and the Formal Model space (source: S1)

## Case space

| Family      | Dimension | Choices                                                                     |
| ----------- | --------- | --------------------------------------------------------------------------- |
| Data        | —         | excluded: result items are opaque to the policy S1                          |
| Value       | —         | excluded: request ids are enumerated by the Formal Model space (S2)         |
| Async       | —         | excluded: enumerated exhaustively as the derived world axes newAnswers (S4) |
| Order       | —         | excluded: enumerated exhaustively as the derived world axes arrival (S4)    |
| Entry       | —         | excluded: one search box S1                                                 |
| Environment | —         | excluded: pure reducer fixture S1                                           |
| Platform    | —         | excluded: pure reducer fixture S1                                           |
| Inherited   | —         | excluded: first revision S1                                                 |

## Terms

| Term | Context | Name                   | Category     | Field      | Path                                                                                                  | Definition                                                                   | Not                                         | Source | Status    |
| ---- | ------- | ---------------------- | ------------ | ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ------ | --------- |
| T1   | search  | response arrival order | controllable | arrival    | test: the world adapter delivers response 1 before or after response 2                                | which of the two issued requests answers first                               | the order in which the requests were issued | S1     | confirmed |
| T2   | search  | newer answer arrives   | controllable | newAnswers | test: the world adapter delivers or withholds response 2 within the attempt                           | the response to request 2 arrives within the attempt                         | the response to request 1                   | S1     | confirmed |
| T3   | list    | final list             | observable   | final      | reducer: results.requestId after the last event, read by search.adapter observe                       | the request whose results the list shows when the attempt ends               | the latest issued request id                | S1     | confirmed |
| T4   | list    | older result shown     | observable   | oldShown   | reducer: results.requestId after every event from the second issue on, read by search.adapter observe | at some step after request 2 was issued, the list showed request 1's results | what the list shows at the end              | S1     | confirmed |
| T5   | search  | latest request         | concept      | —          | —                                                                                                     | the most recently issued request                                             | —                                           | S1     | confirmed |

## Adequacy

- World: S4 Race
- Coordinates: arrival newAnswers
- Observations: final oldShown
- Rows: O1=latestShown O2=staleNeverShown O3=unansweredKeeps
- Rows outside the world: O4 (trace conformance of the reducer on every trace of the Formal Model space (S2))

| Goal | Kind    | Cites |
| ---- | ------- | ----- |
| G1   | safety  | S1    |
| G2   | safety  | S1    |
| G3   | witness | S1    |
| G4   | safety  | S1    |

| Example | Goal | World                                                | Verdict  |
| ------- | ---- | ---------------------------------------------------- | -------- |
| E1      | G1   | arrival=OldFirst newAnswers final=NewShown oldShown  | violates |
| E2      | G1   | arrival=OldFirst newAnswers final=NewShown !oldShown | holds    |

| Hazard              | Disposition                                     |
| ------------------- | ----------------------------------------------- |
| permission-change   | n/a: S1 no permission in the search policy      |
| concurrent-change   | n/a: S1 one search box                          |
| display-vs-commit   | modeled: final oldShown                         |
| effect-count        | n/a: S1 each response arrives at most once      |
| identity-reference  | n/a: S1 request ids are the only identity       |
| feature-composition | n/a: S1 search only                             |
| carry-over          | n/a: S1 one attempt starting from an empty list |
| order-timing        | modeled: arrival oldShown                       |

## Formal Model

- Model: S2
- Laws: S3
- Prefix: Search
- Bound: 4
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

## Derived Axes

- Derivation: oracle-package.mjs derive v1 · digest e433aa47cee08cc6b4d37b204cbcd94caa1f03052fa3d2a07956c38edb160300 · status derived
- Order obligations: 3 within bound 4 (order-sensitive 2, history-sensitive 1)
- Diagnostics: none

| Axis                       | Role         | Derivation | Status  | Domain                      | Model refs      | Terms | Sources | Limitations                                                                                                                                                             |
| -------------------------- | ------------ | ---------- | ------- | --------------------------- | --------------- | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| world.Race.arrival         | controllable | structural | derived | OldFirst NewFirst           | Race.arrival    | T1    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.newAnswers      | controllable | structural | derived | false true                  | Race.newAnswers | T2    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.final           | observable   | structural | derived | NoneShown OldShown NewShown | Race.final      | T3    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| world.Race.oldShown        | observable   | structural | derived | false true                  | Race.oldShown   | T4    | S1      | product domain not stated — the model domain is not a claim about the product                                                                                           |
| event.Msg                  | environment  | structural | derived | Issue Respond               | Search.next     | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; events come from the environment next(history); the test drives them, the product must handle each |
| event.Msg.Respond.id       | environment  | structural | derived | 1 2 3                       | Msg.Respond     | —     | S2      | infinite or compound domain — enumerated only up to the trace bound                                                                                                     |
| state.Search.Search.latest | hidden       | structural | derived | Nat                         | Search.Search   | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; model state — only what observe projects is compared with the product                              |
| state.Search.Search.shown  | hidden       | structural | derived | Nat                         | Search.Search   | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; model state — only what observe projects is compared with the product                              |
| observation.Search.observe | observable   | structural | derived | 0 1 2 3                     | Search.observe  | —     | S2      | infinite or compound domain — enumerated only up to the trace bound; read through the adapter’s observe — the Observation line names the product path                   |

<!-- oracle:generated:end -->

## User Confirmation

- Status: approved
- Source: synthetic fixture approval; not a real consumer user confirmation
