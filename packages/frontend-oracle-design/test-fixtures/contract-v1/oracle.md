# Synthetic Boolean toggle Oracle

## Verification Profile

- Profile: contract/v1

## Outcome Brief

- Actor and context: maintainer testing a private synchronous Boolean toggle fixture
- Observable success: false returns true and true returns false
- Non-goals: UI, persistence, non-Boolean inputs, real consumer approval
- Worst regression: unchanged input accepted as a toggle
- Reversibility: remove isolated fixture
- Risk: Medium
- Sources: S1

## Source Registry

| ID  | Kind               | Jurisdiction                  | Standard                       | Location·version                                                            | Approval status |
| --- | ------------------ | ----------------------------- | ------------------------------ | --------------------------------------------------------------------------- | --------------- |
| S1  | project-constraint | synthetic toggle fixture only | explicit Task6a fixture policy | repo:packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md#v1 | approved        |

## User Confirmation

- Status: approved
- Source: explicit synthetic fixture approval in Task6a assignment, not real consumer user confirmation

## Decided policies

- P1: A single toggle(false) returns true with no requests or external effects. (source: S1) (rows: O1)
- P2: A single toggle(true) returns false with no requests or external effects. (source: S1) (rows: O2)

## Behavior Contract

| ID  | Policy | Given         | When        | Then         | Never        | Side effects                   | BVA           |
| --- | ------ | ------------- | ----------- | ------------ | ------------ | ------------------------------ | ------------- |
| O1  | P1     | enabled=false | toggle once | return true  | return false | requests 0; external effects 0 | false Boolean |
| O2  | P2     | enabled=true  | toggle once | return false | return true  | requests 0; external effects 0 | true Boolean  |

- N/A: duplicate actions: S1 approves exactly one synchronous call per Boolean case; repeated invocation is outside that source boundary. (source: S1)
- N/A: errors: S1 restricts inputs to false and true; the inspected single-return function has no error branch. (source: S1)
- N/A: retry: the inspected product has no requests or failure/retry lifecycle, and S1 approves one call per case. (source: S1)
- N/A: empty data: S1's domain contains only two Boolean values, neither an empty collection nor absent data; there is no data store or request. (source: S1)
- N/A: loading: the inspected product returns synchronously without promises or timers. (source: S1)
- N/A: out-of-order: the inspected product has no asynchronous responses or concurrent events to reorder. (source: S1)
- N/A: cancellation: the inspected product has no pending operation or owner lifetime to cancel. (source: S1)

## Type Contract

- Not applicable: private JavaScript-only fixture has no public typed consumer boundary. (source: S1)
- Investigated: packages/frontend-oracle-design/test-fixtures/contract-v1/product.mjs, packages/frontend-oracle-design/test-fixtures/contract-v1/product.test.mjs, packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md

## Case space

- Coverage: full-product

| Family      | Dimension | Choices                                                               |
| ----------- | --------- | --------------------------------------------------------------------- |
| Entry       | enabled   | false, true                                                           |
| Value       | none      | excluded: non-Boolean inputs outside approved fixture domain S1       |
| Order       | none      | excluded: exactly one synchronous call per case S1                    |
| Async       | none      | excluded: no promises, requests or timers in inspected product.mjs S1 |
| Data        | none      | excluded: no persisted or server data in inspected product.mjs S1     |
| Environment | none      | excluded: pure Boolean return, no environment reads S1                |
| Platform    | none      | excluded: private Node function only, no UI S1                        |
| Inherited   | none      | excluded: first synthetic revision S1                                 |

```json
{
  "dimensionSources": { "enabled": "S1" },
  "dimensionKinds": { "enabled": "input" },
  "boundaries": [{ "id": "toggle", "kind": "action", "source": "S1" }],
  "applicability": [
    {
      "boundary": "toggle",
      "candidate": "action-repeat",
      "source": "S1",
      "reason": "exactly one call per case; repeated invocation outside approved S1 scope"
    },
    {
      "boundary": "toggle",
      "candidate": "request-lifecycle",
      "source": "S1",
      "reason": "inspected product.mjs has no requests S1"
    },
    {
      "boundary": "toggle",
      "candidate": "response-order",
      "source": "S1",
      "reason": "inspected product.mjs has no asynchronous responses S1"
    },
    {
      "boundary": "toggle",
      "candidate": "owner-lifetime",
      "source": "S1",
      "reason": "pure return has no owner lifecycle S1"
    },
    {
      "boundary": "toggle",
      "candidate": "server-boundary",
      "source": "S1",
      "reason": "inspected product.mjs has no server boundary S1"
    },
    { "boundary": "toggle", "candidate": "data-value", "source": "S1", "dimensionId": "enabled" }
  ],
  "constraints": []
}
```

## Frame dispositions

- Dimension revision: fb9b9ef74cf7976b2264d86bc4663760ebbff4b5734eaa18b5a72489d31dc33c
- Constraint revision: 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945

| Frame                                                             | Disposition | Tuple               | Scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F93b83b42b4c9568530d6b25bf3750e2e9d32471c984157bccb31feb4646eaad8 | covered(O1) | {"enabled":"false"} | {"id":"G-F93b83b42b4c9568530d6b25bf3750e2e9d32471c984157bccb31feb4646eaad8","sources":["S1"],"rows":["O1"],"given":{"enabled":false},"when":["call toggle(false) once"],"then":{"requests":"0 network requests","display":"return true","effects":"0 external side effects","never":"return false"},"target":"product.mjs toggle return","control":"Boolean false input","barrier":"synchronous call returned","observe":"product.test.mjs asserts imported toggle(false) equals true"} |
| F2a0e8eaf8d470c9b95c9f65e9c30ac0ba173d688572526afebeefcee41b85893 | covered(O2) | {"enabled":"true"}  | {"id":"G-F2a0e8eaf8d470c9b95c9f65e9c30ac0ba173d688572526afebeefcee41b85893","sources":["S1"],"rows":["O2"],"given":{"enabled":true},"when":["call toggle(true) once"],"then":{"requests":"0 network requests","display":"return false","effects":"0 external side effects","never":"return true"},"target":"product.mjs toggle return","control":"Boolean true input","barrier":"synchronous call returned","observe":"product.test.mjs asserts imported toggle(true) equals false"}    |
