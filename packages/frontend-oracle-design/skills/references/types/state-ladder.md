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

Before designing, identify the applicable relations below and the concrete wrong usages that must
not compile. Select witnesses by the risk and the static guarantee being claimed, not a minimum
case count or export visibility.

- Value — wide `string`·`number`·`Date` → brand·semantic type
- Combination — several related booleans, mutually exclusive optional Props → discriminated union,
  union + `never`
- Relation — mode determines the value·return type but it is not in the type → generic lookup map,
  separate component
- Path·key — free strings for route·query key·field path → factory·`keyof`·derived union
- Result — success·failure·absence·keep·delete all in one `undefined` → `Result`·operation union
- Extension — the key consumers will extend is open as `string` → typed registry·module
  augmentation

## Contract obligations

For each important or explicitly claimed static guarantee, attach a small obligation to the existing
Implementation Decision: approved source row; protected relation; actual file, symbol, and consumer
path; valid usage; rejected misuse; classification (`static`, `runtime`, `mixed`, or `policy-gap`);
required compiler flags; witness and run evidence; and remaining runtime complement.

Choose non-overlapping coverage, not a fixed minimum or maximum count. Do not exempt a high-risk
contract merely because it is local or require a witness merely because it is exported. Do not
promote private types to public API solely for tests; use colocated checks or the real consumption
boundary. Missing approved policy is a policy gap, not permission to invent a type restriction.

## State design ladder

Writing a union is a three-rung ladder. Do not use rung 3 for a problem that ends at rung 1·2.

Quick check: **derive → reuse the owner → own only the remainder**. Choose the loading mechanism
with [`frontend/decisions.md` section 3](../frontend/decisions.md#3-decide-loadingerror-boundaries-per-state),
then check the examples below. The default example uses Suspense; plain Query is a separate exception.

1. **If it can be derived, do not store it.** Compute it from the source
   (`itemCount = items.length`). Even with strong types, duplicated stored state gets only one side
   updated. A union member whose tag can be computed is stored derived state too — the section
   "A derived state is not a state" below owns that judgment.
2. **If a library already owns the union, consume it as is.** TanStack Query's
   `status`·`fetchStatus` and a mutation's `isPending`/`isSuccess`/`isError` are already a
   discriminated contract. Do not copy the same state into a `useState` machine. Their observer
   lifecycle does not prove cancellation, server write ordering, or duplicate-submit safety; verify
   those runtime contracts separately. If a required parameter is missing, use `skipToken` with
   plain `useQuery`, or do not render the querying child until the parameter exists; do not use a
   non-null assertion or pass `skipToken` to `useSuspenseQuery`.
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
  query·placeholder·cancellation constraints. Even then, narrow the library union directly without
  a homemade union; use dependency-free guards or, when already installed or approved, ts-pattern
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

## A derived state is not a state

Rung 1 applies to union members, not only to scalars. A member earns its tag only when it carries a
fact that **no existing owner holds and no other member's fields can compute**. Before adding a
member, name what separates it from its nearest neighbour: a derived display condition, or a
card-approved domain fact that changes allowed actions or transitions? Only the latter needs a new
stored tag when no existing owner holds it.

| Member                   | What it actually is                        | Who already owns the axis                            |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| `paging`·`refreshing`    | `ready` while a request is in flight       | the query's `isFetching`·`isPlaceholderData`         |
| `pageError`·`staleError` | `ready` plus the last failure              | the query's `error` beside its retained `data`       |
| `empty`·`noResults`      | `ready` with `rows.length === 0`           | the data, read at render                             |
| `filteredEmpty`          | `empty` while a filter is active           | the filter input the hook already holds              |
| `firstLoad`·`firstError` | the query's `pending`·`error` with no data | the query's `status`, or the Suspense·Error Boundary |

- **Same payload under different tags** is a review signal; same payload alone is not proof of
  derived state. `ready` and `paging` duplicate the query's request axis, so read it from the query.
  In contrast, `draft` and `submitted` may carry identical fields but have different card-approved
  permissions or transitions; preserve that distinction if no existing owner holds it. The
  `no-derived-state-member` lint rule detects shapes, not domain intent; review its diagnostic
  against the ownership evidence rather than merging legitimate states to silence it.
- **A member that is a neighbour plus one field** (`pageError` = `ready` + `failure`) is the same
  smell when an existing owner already holds the extra axis. Read the query's failure beside its
  data instead of storing a new member; a genuinely new domain fact is not prohibited by this shape.
- **Different screens do not imply different states.** Skeleton, table, table with a spinner, table
  under a failure notice, and an empty panel are five renders of three or four independent axes —
  data present, in flight, failed, row count. A union that enumerates their reachable combinations
  is a hand-copied truth table that must be edited whenever one axis changes, and it is exactly the
  shape rungs 1·2 exist to prevent. Keep each axis at its owner and branch on the axes at render.
- If the render needs a name for the screen, it is the **literal union returned by a `resolve*`
  function** of [`authoring.md`](authoring.md) —
  `resolveOrderTableView(query, rowCount): 'firstLoad' | 'table' | 'empty' | 'failure'` — computed
  on every render, never stored, and carrying no payload of its own.
- A card `## State Model` that lists `paging` or `empty` as a state names what the user observes; it
  does not declare a member. Translate only the states no owner holds (rung 3), derive the rest,
  and map the `O*` rows that mention a spinner or an empty panel to a render branch.
- What survives is small. In a list with cursor paging the cursor lives in the query key and every
  lifecycle axis lives in the query, so no client union remains at all. Only a value the user chose
  and no owner holds — a selected row, an open detail panel — earns a `useState`, with one member
  per _choice_, never per screen.

```tsx
// Forbidden — the tags enumerate combinations of axes the query and the data already own
type OrderTableState =
  | { status: 'firstLoad' }
  | { status: 'ready'; page: Page<OrderRow> }
  // eslint-disable-next-line @lodado/local-rules/no-derived-state-member -- the document shows the forbidden pattern itself.
  | { status: 'paging'; page: Page<OrderRow> } // ready + isFetching
  | { status: 'pageError'; page: Page<OrderRow>; failure: ListFailure } // ready + error
  | { status: 'empty'; filtered: boolean } // ready + rows.length === 0
  | { status: 'firstError'; failure: ListFailure } // the query's own error, with no data

// Default — the parent owns local Suspense and Error Boundary fallbacks.
function OrderTable({ filters }: { filters: OrderFilters }) {
  const query = useSuspenseQuery(orderListOptions(filters))
  const { rows } = query.data
  if (rows.length === 0) return <EmptyOrders filtered={hasActiveFilter(filters)} />
  return <OrderRows rows={rows} busy={query.isFetching} failure={query.error} />
}
```

The parent places `<OrderTable />` inside a local `<Suspense fallback={<TableSkeleton />}>` and
the repo's Error Boundary. Query retry coordinates that boundary with `QueryErrorResetBoundary`
as specified in the decision table. This example assumes the card keeps cached rows with a
background-error notice; the empty branch assumes the card needs no progress/error notice there.
Neither branch stores a new state. Different card policies require different render branches.

### Exception: observer-level placeholder data

Keeping existing content alone does not justify `useQuery`: first consider a transition of the
query input under Suspense. Use the following alternative only when the approved contract requires
the observer to switch to the new key immediately while temporarily exposing the previous page as
placeholder data, including `isPlaceholderData` to disable next-page navigation. Record why the
transition alternative does not satisfy that contract; do not invent this requirement for a card.

```tsx
function PlaceholderOrderTable({ filters }: { filters: OrderFilters }) {
  const query = useQuery({ ...orderListOptions(filters), placeholderData: keepPreviousData })
  if (query.data === undefined) {
    if (query.isError) return <LoadFailure failure={query.error} />
    return <TableSkeleton />
  }
  return (
    <OrderPage
      page={query.data}
      busy={query.isFetching}
      failure={query.error}
      nextPageDisabled={query.isPlaceholderData || !query.data.hasMore}
    />
  )
}
```

`OrderPage` owns the card's empty/content branches and pagination UI. Placeholder data is not a
promise to retain the previous page after the new key fails; this example then renders
`LoadFailure` when no data remains. A stale-page-on-failure policy needs separate implementation
and runtime evidence, not an assumption about `keepPreviousData`.

## State is data, actions are siblings

**State holds only data.** A union member's fields are the values that are true in that state, and
an action is what can be done next with those values. The two have different lifetimes, so do not
mix them into one value.

- Do not store functions such as `retry`·`submit`·`reset` in a state value. A persisted function can
  retain the closure of an earlier render after props·params change. A capability object derived
  on each render is not persisted state; keeping actions beside state makes that boundary explicit.
  In a repo using `@lodado/eslint-config/local-rules`,
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

```tsx
// Forbidden — persisting an action inside state can retain an old render's closure
// eslint-disable-next-line @lodado/local-rules/no-action-in-state -- the document shows the forbidden pattern itself.
type DetailState = { status: 'loading' } | { status: 'failure'; retry: () => void }

// Allowed — stored state is data; action availability is derived on each render
type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: Detail }
  | { status: 'failure'; reason: LoadFailure }
type DetailResult =
  | { state: Exclude<DetailState, { status: 'failure' }>; retry: undefined }
  | { state: Extract<DetailState, { status: 'failure' }>; retry: () => void }
declare function useDetail(id: DetailId): DetailResult

function DetailRetry({ result }: { result: DetailResult }) {
  if (result.retry === undefined) return null
  return <button onClick={result.retry}>Retry</button>
}
```

`DetailResult` is a render-time return contract, never another stored state. The hook implementation
derives retry availability from its current state; its runtime guard also prevents a second request
if the same callback is invoked twice before a rerender. That guard and late-response handling
require tests against the card's policy; the return type alone does not make invocation timing safe.

The `DetailState` above is the rung-3 remainder for data that has no query boundary. When a query
owns the detail there is no `DetailState` at all — `query.data`·`query.error` are the state and
`query.refetch` is the sibling — and hand-copying `loading`·`failure` into a client union stays the
rung-2 `FINDING` regardless of where the action went.

## Derive state from the card

If the card has a `## State Model` section, that is the single source of states·events·transitions.
The section is optional so most cards do not have one — without it, derive directly from
`Given`·`When`·`Then` of the `O*` rows, and the absence of the section is a reason not to build a
transition table·state machine, not a reason to build one.

| Card column    | Type correspondence                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `Given`        | The starting state and the fields valid only in that state                                                    |
| `When`         | The event (user action, response, time·order change)                                                          |
| `Then`         | The arriving state and the observed result                                                                    |
| `Never`        | Reject invalid value combinations statically; forbidden temporal transitions require runtime guards and tests |
| `Side effects` | The kind and count of external writes coupled to the transition                                               |

- **One row is not one state.** The table is a reading aid, not a generator that converts rows into
  states. It is normal for several `O*` rows to converge into one same state, and splitting rows
  that share a screen and a recovery path into different states creates meaningless branches at the
  consumption point. Rows that differ only by an axis an owner already holds — spinner on or off,
  zero or more rows, a failure notice present — converge into the _same_ member as well, with the
  axis read beside it; a `Given` that reads as a screen (`table with spinner`, `empty panel`) is a
  render, not a starting state.
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
