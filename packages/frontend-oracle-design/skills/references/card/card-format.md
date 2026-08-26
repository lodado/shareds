# Oracle Card — card format and self-review

## Card format

Apply the four axes and the seven auto-added TCs from [`bva.md`](../bva.md). Every new card follows
the order `Outcome Brief → Source Registry → User Confirmation → Decided policies → contract rows`.
`oracle-verify.mjs card` checks the Outcome Brief required values and the Source Registry `Kind`
before the lock.

When there is a Design Intent, place the [`visual-design.md`](../visual-design.md) format
immediately before the behavior matrix. Design Intent·`D*` rows·`O*` rows·confirmation evidence are
all locked into the same Oracle bytes. Non-N/A `D*` rows map as `HARD → test`,
`RELATIONAL → visual | pending`, `JUDGMENT → designer reviewer`. For `local`·`identity-shaping`,
record the location of the user's Design Change Confirmation answer in the same Design Intent.

```markdown
## User Confirmation

- Status: draft | approved
- Source: message·issue·document location of the user's approval response
- Delta: new card, or a summary of semantic changes against the previous revision
- Visual QA authorization: approved | declined # when there is a RELATIONAL row
```

The Draft stage keeps `Status: draft`. Only after the user has reviewed the full card·delta and
explicitly approved it, record `approved` and the actual response location. Do not use an agent
recommendation or the inference that "the user would want it" as the Source.

| ID  | Policy | Given | When | Then | Never | Side effects (kind×count) | BVA |
| --- | ------ | ----- | ---- | ---- | ----- | ------------------------- | --- |

| Column         | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `Given`        | state and premises immediately before the action              |
| `When`         | user action, response, time or ordering change                |
| `Then`         | the result that must be observed                              |
| `Never`        | the opposite result that must never happen                    |
| `Side effects` | the exact kind and count of requests·saves·navigations·events |
| `BVA`          | the boundary examined among value·state·time/order·count      |

Rules:

- A row with an empty `Never` or side-effect count is incomplete.
- Give each decision a stable policy ID (`P*`) and its applied rows, and put the same ID in the
  `Policy` column of each `O*`·`D*` row. The bidirectional reference between policy IDs and row IDs
  must match exactly. Each policy source must be an approved `S*` in the Source Registry or
  `User Confirmation`, and locking is forbidden when the source FK is broken.
- Verify the UI state and the actual side-effect count separately.
- Turn auto-added TCs that have a premise into rows, and when there is none, record N/A and the
  reason.
- Do not invent a retry·cancel·race that does not exist for the sake of a test.
- For errors, distinguish the message·recovery·side effects per subtype that applies to the feature.

Abbreviated example:

```markdown
| ID  | Policy | Given       | When        | Then             | Never                      | Side effects      | BVA            |
| --- | ------ | ----------- | ----------- | ---------------- | -------------------------- | ----------------- | -------------- |
| O1  | P1     | valid input | click save  | pending shown    | success UI before response | POST×1            | state: pending |
| O2  | P1     | pending     | click+Enter | pending kept     | second POST                | POST×1 (total)    | count: 1/2     |
| O3  | P2     | pending     | server 5xx  | error+input kept | success UI, input lost     | successful save×0 | state: error   |
```

## State Model — optional

The default is to omit it. Even when there are async rows, the `O*` rows themselves are the
contract, and lint does not block on a missing section. Add `## State Model` after the contract rows
only for cards where the transition policy is too tangled to read from the row list alone
(multi-step submits·optimistic rollback·payment-like). Once added, `oracle-verify.mjs card` verifies
the structure: without non-empty `States`·`Events` and a transition table in which every transition
cites a real `O*` row, the lock is blocked with `CARD_LINT_FAILED`.

```markdown
## State Model

- States: editing, submitting, success, failure
- Events: SUBMIT, RESPONSE_OK, RESPONSE_ERROR

| From       | Event          | To         | Row |
| ---------- | -------------- | ---------- | --- |
| editing    | SUBMIT         | submitting | O1  |
| submitting | SUBMIT         | submitting | O2  |
| submitting | RESPONSE_OK    | success    | O4  |
| submitting | RESPONSE_ERROR | failure    | O3  |
```

- States·events are derived only from the `Given`·`When`·`Then` of `O*` rows, and every transition
  in the table references a row ID. A transition without a reference is an invented policy.
- For an empty `state × event` combination, distinguish whether it is impossible (inexpressible in
  the type) or an unresolved policy. When unresolved it is `NEEDS_DECISION`, and do not fill in
  "ignore" as the default.
- This section is included in the card bytes and locked along with them. Translation into a
  discriminated union is owned by [`types/state-ladder.md`](../types/state-ladder.md).

## Adversarial self-review

Apply four questions to each row and reinforce the row when a counterexample appears.

1. What is the simplest implementation that passes this row while violating the requirement?
2. Is there a different but normal implementation that could fail because of this row?
3. Can it pass by only mimicking the UI, without the actual side effect?
4. Among loading, error, retry, consecutive input, and order reversal, what is relevant but missing?

Example: "button disabled while saving" alone does not catch two POSTs before disabled is applied.
Write both `POST×1 (total)` and "no second POST" on the same row.

When there is a Design Intent, also perform the genericity·restraint critique from
[`visual-design.md`](../visual-design.md). Do not downgrade a sourced aesthetic requirement to
`NON_ORACLE_OPINION` or N/A on the grounds that it is hard to automate.
