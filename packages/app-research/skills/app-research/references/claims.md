# Features and policies

Write `features.json` and `policies.json` in the run directory after exploring. `lint` checks both.

## Feature

```json
{
  "features": [
    {
      "id": "AUTH-001",
      "name": "Email login",
      "status": "observed",
      "description": "Email and password sign in; a wrong password shows an inline error.",
      "screenIds": ["S-002", "S-003"],
      "transitionIds": ["T-004"],
      "evidence": [{ "kind": "observation", "ref": "O-0007" }]
    }
  ]
}
```

A feature can span several screens and a screen can hold several features. `status` takes the same five values as a policy and needs the same evidence. An observed feature may only list screens and transitions that its cited observations touched.

## Policy

```json
{
  "policies": [
    {
      "id": "POL-001",
      "category": "auth",
      "statement": "Five failed sign-ins lock the account.",
      "status": "documented",
      "featureIds": ["AUTH-001"],
      "serverSide": true,
      "evidence": [
        {
          "kind": "document",
          "url": "https://example.com/help/lockout",
          "fetchedAt": "2026-10-26T09:00:00Z",
          "appVersion": "unknown",
          "region": "KR"
        }
      ]
    }
  ]
}
```

Categories: auth, account, permission, billing, data, usage, exception.

| Status      | Needs                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------- |
| observed    | an observation whose result is `ok` or `no-change`                                                  |
| documented  | a document with `url`, `fetchedAt`, `appVersion`, `region` (`"unknown"` when the page does not say) |
| code-backed | code evidence with `ref` and `appVersion`                                                           |
| inferred    | a non-empty `basis`; evidence optional                                                              |
| unknown     | nothing; use it to name a question the run could not answer                                         |

- `serverSide: true` with `observed` or `code-backed` also needs a document. Otherwise mark it `inferred`.
- A blocked gate (`G-...`) is not evidence. A blocked path is an unknown, not something that was explored.
- When sources disagree, record each as its own policy with its own evidence and say so in `statement`; do not merge them into one.
- Observed behavior and a recommended behavior are different claims; never write a recommendation as an observation.
