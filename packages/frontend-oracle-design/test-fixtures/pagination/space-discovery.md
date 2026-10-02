# Space discovery — orders table

The axes and answers the user confirmed before any Bend was written.

## Case space

- Strength: 2

| Family      | Dimension | Choices                              |
| ----------- | --------- | ------------------------------------ |
| Data        | rows      | 0, 1, 20, 21                         |
| Value       | pageParam | valid, invalid, outOfRange           |
| Async       | response  | success, http-5xx [error]            |
| Order       | arrival   | sequential, inverted                 |
| Entry       | entry     | fresh, reload, backForward, deepLink |
| Environment | —         | excluded: no viewport rule           |
| Platform    | —         | excluded: one supported engine       |
| Inherited   | —         | excluded: first revision             |

## State Model

- States: showing, loading, error
- Events: GO_PAGE, RESPONSE_CURRENT, RESPONSE_STALE, ERROR_5XX, RETRY

| From    | Event            | To      | Rows |
| ------- | ---------------- | ------- | ---- |
| showing | GO_PAGE          | loading | O1   |
| loading | GO_PAGE          | loading | O1   |
| loading | RESPONSE_CURRENT | showing | O2   |
| loading | RESPONSE_STALE   | loading | O3   |
| loading | ERROR_5XX        | error   | O4   |
| error   | RETRY            | loading | O5   |
| error   | GO_PAGE          | loading | O1   |

## Questions and answers

- Q: Does a fresh entry carry a page parameter? A: No — it always opens the first page.
