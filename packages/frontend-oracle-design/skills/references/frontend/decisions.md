# Frontend Implementation Decisions — State Ownership·Execution Location·loading Boundaries

## Purpose and Authority

Use this only when porting the Oracle Card's observable contract into React·Next.js·TanStack Query
code. It does not create product policy; if a choice that changes the implementation result is
unresolved, return to `NEEDS_DECISION`.

Before implementing, read the target package's `package.json`, router structure, framework config,
and the repo's `AGENTS.md`·`CLAUDE.md`·required architecture documents. For authority order, the
shared priority in [`common.md`](../common.md) is canonical, and this document only adds the
lower-tier sources under its own jurisdiction:

- Official React·Next.js·TanStack Query documentation for the **actually installed version**
- Applicable heuristics from framework maintainers such as Vercel Engineering
- Counterexamples and supplementary opinions from community experts

A lower-tier source never overrides a higher-tier source. Example: even if a bundle guide says to
avoid barrel imports, follow the repo rule when the repo requires FSD slice public API imports. For
an available `vercel-react-best-practices` reference/skill, read only the relevant rules and apply
this decision order.

If the card has a Design Intent, read all of [`visual-design.md`](../visual-design.md) before
modifying production and record the `D*` rows in the Implementation Decision. Do not change an
approved visual result for the sake of a design skill or implementation convenience. If it is
`local`·`identity-shaping` but the card has no location for the Design Change Confirmation answer,
production modification is forbidden, `NEEDS_DECISION`.

For a React production change, read all of
[`architecture-contract.md`](../architecture-contract.md). Investigate the affected unit's existing
documents·import conventions first, and do not write tests·production without explicit document
approval and an Oracle source lock. FSD applies only when the existing structure is FSD or a
greenfield proposal has been approved.

For a React production change, also read all of [`changeability.md`](../changeability.md), and
record in the Implementation Decision only the quality axes and trade-offs that are material to this
change. For judgments about change cost·hidden side effects·consolidation·public surface·new
abstractions, do not duplicate the same definitions and take that document as the standard.

Code authoring boundaries (component splitting·micro-hook·effect) are owned by
[`frontend/authoring.md`](authoring.md), and Design Intent implementation·performance·quality gates
and the Source Registry are owned by [`frontend/quality.md`](quality.md).

## TypeScript Contract — Only When Material

- Express the input·success·failure shapes of trust boundaries and public APIs precisely. Do not
  repeat types that are sufficiently inferred internally.
- If the card has async·order-inversion·duplicate-submit·retry·multi-step state rows, or you create
  or change the type shape of client state·exported Props·shared/package API·trust boundary, read
  all of [`types/state-ladder.md`](../types/state-ladder.md). Derive states·events from the card's
  `O*` rows, follow the state design ladder and the discriminated union contract, and do not invent
  transitions that are not in the card. Do not convert a simple toggle·single independent boolean
  into a state machine.
- Do not hide the card's error·state contract behind `any`, broad assertions, or meaningless
  optionals.
- Only when an exported shared/package API changes, verify consumer inference·error shapes with a
  type test. Do not add an interface·factory·adapter for a single local implementation.

## 1. Decide State Ownership First

Each item is `kind → default owner. Forbidden: duplication shape`.

- Source of record and freshness for API·DB → Server Component or hydration after TanStack Query cache. Forbidden: copying query results into `useState`·a global store
- Filters that need sharing·bookmarking·back navigation → URL `searchParams`·router. Forbidden: two-way effect sync between URL and local state
- A form draft being typed → the nearest form/feature. Forbidden: treating an unsaved draft as the server cache source of record
- Transient UI such as modal·selection·hover → the nearest component/hook. Forbidden: promoting to a global store without a reason
- Values computable from current props/state → derive during render (useMemo etc.). Forbidden: storing a computed value back into state via effect
- Client state actually shared by distant subtrees → the nearest common provider/store. Forbidden: using an app-wide provider as the default

To copy a server source of record into an editable draft, the Oracle must have policies for
`initialization timing`, `save`, `cancel`, and `conflict with remote updates`. Keep a single source
of truth, and do query transformation with query `select` or render-time derivation when possible.

For server state, first use the query API·router state·form state that already exist in the repo.
Managing the same data by hand with `useState`+`useEffect`+`useRef` means reimplementing
freshness·duplicate requests·cancellation in full — manage it by hand only for data that has no
existing boundary, and write the reason in the Implementation Decision. Even when managing by hand,
put only data in the state value and do not put functions such as `retry` in it — follow "State is
data, actions are siblings" in [`types/state-ladder.md`](../types/state-ladder.md).

## 2. Choose the Execution Location

1. If the server can read it safely during the initial route render and there is no continuous
   browser synchronization, read it in a Server Component.
2. Only the smallest leaf that needs an event handler·browser API·local interaction state becomes a
   Client Component. Do not raise the `'use client'` boundary to the whole layout/page for
   convenience.
3. Consider TanStack Query when the same remote data needs reuse·refetch·polling·optimistic update.
   Do not add it for a single simple fetch.
4. Pass across the RSC→Client boundary only the serializable fields the client actually uses.
5. If Next cache and Query cache are used together for the same remote data, state the owner of
   hydration·staleness·invalidation. If it is unclear, drop one cache.
6. Only when handing a server prefetch to a client query, use the target version's
   `dehydrate`·`HydrationBoundary` pattern, and never share a server `QueryClient` across requests.

Start independent requests early and await them together, and serialize only requests with a real
dependency. Do not block the whole shell; put a Suspense boundary near the slow part.

## 3. Decide loading·error Boundaries Per State

- Initial route/server fetch → `loading.tsx` or a local `<Suspense>`, route `error.tsx`
- First fetch of a client query that always runs → `useSuspenseQuery` + local Suspense + Error Boundary
- Conditional query·placeholder·fine-grained cancellation control → allow plain `useQuery` with explicit state UI
- Background refetch with a cache → implement whether existing content is kept and the small progress/error UI exactly as the Oracle says
- mutation → `useMutation().isPending` with explicit error UI/`throwOnError`; not handled with Suspense

- A fallback replaces only the subtree being waited on and keeps the layout size as much as
  possible.
- If the first fetch always runs and there is no `enabled`·placeholder·cancellation constraint,
  `useSuspenseQuery` is the default. Do not drop down to plain `useQuery` merely because
  polling·background refetch exists. Suspense = the first read with no data, query's
  `isFetching`·`error` = subsequent synchronization with cached content.
- **Do not leave a branch inside a component when it can be lifted to a boundary.** If Suspense is
  the default in the table but a `status` branch sits in the component body, review it as a
  `FINDING`. If another row applies and the branch is needed, write the disqualification reason in
  the Implementation Decision.
- When a query input under Suspense changes, it becomes a first read with no data again and the
  fallback comes up. If the card requires keeping the existing content, wrap the input change in
  `startTransition` and show pending with a means that does not shake the layout.
- For query retry, reset `QueryErrorResetBoundary` and the Error Boundary together, but limit it to
  the failed query/boundary scope. An indiscriminate reset of the whole cache is forbidden.
- Do not assume that a refetch error with cached data always throws to the boundary. Check the
  policy for keeping stale content·exposing errors in the card. If the card requires keeping the
  existing content, narrow `throwOnError` to the no-data condition so the boundary does not erase an
  already loaded screen.
- Do not assume `useSuspenseQuery` has `enabled`·`placeholderData`. If cancellation is a product
  contract, check the target version's limits and choose a better-fitting means such as a plain
  query.
- Treat the query key like a dependency. Include every input that affects the `queryFn` result in
  the serializable key, and do not match input changes with a manual `refetch` in an effect.
- If cancellation is a contract, confirm that `queryFn` passes the provided `AbortSignal` to the
  actual request, and verify deterministically that only the latest input's result survives even
  under response order inversion.
- **Do not update state with a response that arrives after unmount·route change.** For queries the
  library handles this against the latest call, but apply the same defense to hand-built async
  state: abort the request with `AbortController` in effect cleanup, or discard late responses with
  an invalidation token. This is a runtime defense rather than a type one, so record it in the
  Implementation Decision.
- For mutation pending, verify duplicate submit blocking and the total number of actual requests
  separately.
