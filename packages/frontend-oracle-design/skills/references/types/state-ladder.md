# Type constraints — purpose·ownership·state design ladder

## Purpose and authority

- When to use — when the card has async·out-of-order·duplicate submit·retry·multi-step state `O*`
  rows, or when newly creating or changing the shape of client state·Props·boundary types.
- This document does not create product policy. State·transition·error classification is all
  derived from the card's `O*` rows, and when a state or transition not in the card becomes
  necessary, do not invent it but return to `NEEDS_DECISION` as a `POLICY_GAP`.
- The authority order follows the common priority of [`common.md`](../common.md) and
  [`frontend/decisions.md`](../frontend/decisions.md). The tool·library choices in this document
  are implementation heuristics and not a policy source.

Judge every design by the following question.

> Of the wrong code the AI could have generated, **what no longer compiles?**

- Do not add type complexity that cannot answer this question concretely.
- AI generation itself remains non-deterministic. The goal is **acceptance decision determinism**,
  passing·rejecting a candidate with the same result under the same source·TypeScript·tsconfig.
- Passing compilation is not a soundness proof but a deterministic, high-efficiency filter.
  TypeScript is deliberately unsound (bivariance, an excess property check that applies only to
  literals), and filter strength is a function of tsconfig·compiler version.
- Prerequisite environment verification is owned by
  [`type-environment.md`](../type-environment.md) — verify once per repo and do not repeat it here.

## Constraint ownership

| Target                                                    | Owner                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| Value·Props·state combination·input/output relation       | Types                                                        |
| External input such as API·storage·URL·message            | runtime parser from `unknown`                                |
| Observable product behavior                               | `$test`                                                      |
| Out-of-order·duplicate submit·retry·arrival after unmount | abort signal·pending guard·idempotency key·server validation |
| Generation reproducibility for the same prompt            | model·provider — not guaranteed by this document             |

- The time axis is not proven by types. Declaring the ordering problem "resolved" just because a
  union was created is a `FINDING`.
- The remaining time-axis non-determinism and its runtime defense must be recorded in the
  Implementation Decision. Reporting type-valid as behavior-correct is also a `FINDING`.

Before designing, find the six points below in the change target and **write down at least three
wrong usages that must not compile first** — for an exported API they become the
`@ts-expect-error` cases of `.test-d.ts` as they are.

- Value — wide `string`·`number`·`Date` → brand·semantic type
- Combination — several related booleans, mutually exclusive optional Props → discriminated union,
  union + `never`
- Relation — mode determines the value·return type but it is not in the type → generic lookup map,
  separate component
- Path·key — free strings for route·query key·field path → factory·`keyof`·derived union
- Result — success·failure·absence·keep·delete all in one `undefined` → `Result`·operation union
- Extension — the key consumers will extend is open as `string` → typed registry·module
  augmentation

## State design ladder

Writing a union is a three-rung ladder. Do not use rung 3 for a problem that ends at rung 1·2.

1. **If it can be derived, do not store it.** Compute it from the source
   (`itemCount = items.length`). Even with strong types, duplicated stored state gets only one side
   updated.
2. **If a library already owns the union, consume it as is.** TanStack Query's
   `status`·`fetchStatus` and a mutation's `isPending`/`isSuccess`/`isError` are already a
   discriminated contract and even include time-axis handling based on the latest call. Do not copy
   the same state into a `useState` machine. If a required parameter is missing, express it with
   `skipToken` or API absence instead of a non-null assertion.
3. **Make only the real client state that still remains with `useState<Union>` + an intent-function
   hook.** Do not expose raw `setState`·setters outside the hook, and return only functions that
   express domain intent (`pick`, `submit`, `reset`). Handle a call that came from a wrong state by
   ignoring·erroring as the card decided, and if it is not in the card it is `NEEDS_DECISION` as a
   `POLICY_GAP`.

Loading·error handling at rung 2 follows the rules below.

- **The default for loading·load failure is a boundary, not a component branch.** For the first
  query that runs unconditionally, keep `useSuspenseQuery` as the default and lift the
  loading·error branch into a local `<Suspense>` and Error Boundary to remove it from the component
  body.
- The per-situation decision table is owned by section 3 of
  [`frontend/decisions.md`](../frontend/decisions.md) and this document does not override its
  defaults. **Do not choose a loading mechanism before reading the decision table** — if you grab a
  familiar API first, that API's constraints harden as if they were the requirements and you
  disqualify the remaining candidates yourself.
- Leave a branch only for the remainder that cannot be lifted to a boundary, such as conditional
  query·placeholder·cancellation constraints. Even then, attach ts-pattern directly to the library
  union without a homemade union
  (`match(mutation).with({ status: 'error', error: { code: 'CONFLICT' } }, …)`).
- For the same reason, **reuse existing query·framework state first.** Do not rebuild server state
  that is expressed by an existing query API·router state·form state into a hook that manages it
  directly. Only when the data the card requires is not at an existing boundary do you go down to
  rung 3.

Reducers·transition tables·state machines are not the default.

- Use them only in a flow where the ordering violation itself is a domain error in the card
  (payment·multi-step submit·optimistic rollback), and add a new state-machine dependency only when
  the need is proven.
- XState is a candidate only when hierarchical·parallel state or actor coordination is actually in
  the card, and use it only when it is installed or its adoption is approved.
- **Merely because the card has a `## State Model`**, do not build runtime machinery such as an
  Event union·transition function·transition command. The State Model is a notation that writes
  down the policy without omission, and this ladder decides what to implement that policy with. The
  loading·success·failure of a single simple query ends at rung 2, and even at rung 3 what is
  needed is one state union and a few intent functions.

### State ownership is singular

- Keep only one canonical state owner per async flow. When a framework owns the state, as TanStack
  Query does, do not repackage its result into a new `status` union such as `NextPageState` or
  duplicate it into an application type with the same meaning.
- If shared UI needs only whether the next action is possible rather than the whole lifecycle, let
  the existence of the callback itself be the capability, as in `onLoadMore?: () => void`.
- The loading·error·retry display is rendered by the feature that originally owns the query. The
  card's State Model is a policy specification, not an order to generate a union per
  implementation.

## State is data, actions are siblings

**State holds only data.** A union member's fields are the values that are true in that state, and
an action is what can be done next with those values. The two have different lifetimes, so do not
mix them into one value.

- Do not store functions such as `retry`·`submit`·`reset` in a state value. A stored function is
  pinned to the closure of the render that created it, so it keeps capturing stale values even
  after props·params change. In a repo using `@lodado/eslint-config/local-rules`,
  `no-action-in-state` catches this shape on both the type and the value side.
- Hand actions back as a **sibling of the hook's return object** (`{ state, retry }`). For server
  state, do not make a new action but re-expose the query's `refetch` as is.
- Do not create an action that cannot be used in some state. A no-op action put in just to satisfy
  the type, such as `retry: () => undefined`, gives the UI the false information that "you can
  retry". If the action differs per state, pass the narrowed action to the child that narrowed the
  state.
- Split wrong input (an ID that failed to parse, a missing route param) into a **separate state
  only when the UI behavior·copy actually differs.** If the screen and the recovery path are the
  same, merge it into the existing failure state, and if you split it, fill in that state's own
  fields and actions for each. If the card makes no distinction, do not invent one — it is
  `NEEDS_DECISION` as a `POLICY_GAP`.

```typescript
// Forbidden — an action inside state creates a stale closure and a fake retry at the same time
// eslint-disable-next-line @lodado/local-rules/no-action-in-state -- the document shows the forbidden pattern itself.
type DetailState = { status: 'loading' } | { status: 'failure'; retry: () => void }

// Allowed — state is data, actions are siblings
type DetailState = { status: 'loading' } | { status: 'failure'; reason: LoadFailure }
function useDetail(id: DetailId): { state: DetailState; retry: () => void }
```

## Derive state from the card

If the card has a `## State Model` section, that is the single source of states·events·transitions.
The section is optional so most cards do not have one — without it, derive directly from
`Given`·`When`·`Then` of the `O*` rows, and the absence of the section is a reason not to build a
transition table·state machine, not a reason to build one.

| Card column    | Type correspondence                                                           |
| -------------- | ----------------------------------------------------------------------------- |
| `Given`        | The starting state and the fields valid only in that state                    |
| `When`         | The event (user action, response, time·order change)                          |
| `Then`         | The arriving state and the observed result                                    |
| `Never`        | A forbidden state or forbidden transition — make it inexpressible in the type |
| `Side effects` | The kind and count of external writes coupled to the transition               |

- **One row is not one state.** The table is a reading aid, not a generator that converts rows into
  states. It is normal for several `O*` rows to converge into one same state, and splitting rows
  that share a screen and a recovery path into different states creates meaningless branches at the
  consumption point.
- The "fields valid only in that state" of `Given` are only the values the card actually
  renders·branches·records differently. Do not pile on fields such as origin·history just to fill
  out the state.
- For an empty combination in `state × event`, distinguish whether it is impossible (inexpressible
  in the type) or an undecided policy. If it is undecided it is `NEEDS_DECISION` and do not fill in
  "probably ignore" as the default.
- A transition that does not reference a card row ID is invented policy. Fields follow the same
  rule — leaving a value the card does not distinguish (such as the origin of two paths that use
  the same badge) as a field means policy was invented without asking, and it is `NEEDS_DECISION`
  as a `POLICY_GAP`.
