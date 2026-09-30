# Stale search response fixture Oracle (skill tool fixture, not a product decision)

## Outcome Brief

- Actor and context: a person typing successive search queries while earlier responses are in flight
- Observable success: the list shows the latest request's results and never an older request's late results
- Non-goals: cancellation, retry, duplicate responses, debouncing, real network or browser behavior
- Worst regression: an older request's late response replaces the latest results
- Reversibility: revert the isolated fixture
- Risk: Medium
- Sources: S1

## Source Registry

| ID  | Kind           | Jurisdiction                    | Standard            | Location·version              | Approval status |
| --- | -------------- | ------------------------------- | ------------------- | ----------------------------- | --------------- |
| S1  | product-policy | search response ordering        | fixture policy text | repo:README.md#fixture-policy | approved        |
| S2  | product-policy | reference model and environment | Bend 2.0.34 model   | repo:MODEL.bend#v1            | approved        |
| S3  | product-policy | approved laws                   | Bend 2.0.34 laws    | repo:LAWS.bend#v1             | approved        |

## User Confirmation

- Status: approved
- Source: synthetic fixture approval; not a real consumer user confirmation

## Decided policies

- P1: Issuing a search request makes it the latest request; the list keeps what it shows until a response arrives. (source: S1) (rows: O1, O4)
- P2: A response to an older request does not change what the list shows. (source: S1) (rows: O2, O4)
- P3: The latest request's response is shown when it arrives. (source: S1) (rows: O3, O4)

## Behavior Contract

| ID  | Policy     | Given                                                   | When                                 | Then                                                              | Never                                                                         | Side effects             | BVA                           |
| --- | ---------- | ------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------ | ----------------------------- |
| O1  | P1         | results of request n shown, or none                     | a new query issues request n+1       | request n+1 is the latest; the list is unchanged                  | the list cleared or replaced before a response                                | request×1                | requests: 1st, 2nd, 3rd       |
| O2  | P2         | request n+1 issued after request n                      | response n arrives                   | the list is unchanged                                             | results of request n shown                                                    | stale results rendered×0 | order: in order, out-of-order |
| O3  | P3         | request n is the latest                                 | response n arrives                   | results of request n shown                                        | results of request n dropped                                                  | results rendered×1       | order: in order, reversed     |
| O4  | P1, P2, P3 | every trace of up to 4 events that `Search.next` allows | each event is applied to the reducer | the reducer's observation equals `Search.observe` at every prefix | a prefix where they differ; an adapter error or budget stop counted as a pass | none                     | bound: 4 events, 10 traces    |

- N/A: loading indicator, error, retry, empty data, duplicate responses and cancellation are outside this fixture's policy. (source: S1)

## Case space

| Family      | Dimension | Choices                                                                |
| ----------- | --------- | ---------------------------------------------------------------------- |
| Data        | —         | excluded: result items are opaque to the policy S1                     |
| Value       | —         | excluded: request ids are enumerated by the Formal Model space (O4)    |
| Async       | —         | excluded: response timing is enumerated by the Formal Model space (O4) |
| Order       | —         | excluded: response order is enumerated by the Formal Model space (O4)  |
| Entry       | —         | excluded: one search box S1                                            |
| Environment | —         | excluded: pure reducer fixture S1                                      |
| Platform    | —         | excluded: pure reducer fixture S1                                      |
| Inherited   | —         | excluded: first revision S1                                            |

## Formal Model

- Model: S2
- Laws: S3
- Prefix: Search
- Bound: 4
- Observation: `Search.observe` is the request id whose results the list shows, 0 when none; the adapter reads the reducer's `results.requestId`
- Out of scope: cancellation, retry, duplicate responses, a response before its request (S1 item 4)
- Not formalized: none
- Conformance row: O4

| Law              | Kind    | Cites       |
| ---------------- | ------- | ----------- |
| issue_advances   | effect  | P1 O1       |
| stale_ignored    | safety  | P2 O2       |
| latest_applied   | effect  | P3 O3       |
| latest_reachable | witness | P1 P3 O1 O3 |
