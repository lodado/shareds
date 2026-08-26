# Type constraints — constraint selection order and authoring rules

## Constraint selection order

- Classify the problem by axis first. Ownership·state space·API relation are different axes, so do
  not mix them into one global order — there is no global order that puts `keyof` always after a
  discriminated union.
- Review **from the earlier rung** only within each ladder, and if an earlier rung actually closes
  the misuse, do not use a later rung.
- The purpose is not to make generation results identical but to consistently eliminate
  unnecessarily complex later-rung mechanisms.

```text
A. Ownership·boundary
   reuse existing owner → derive without storing → make impossible via API absence
   → runtime parse external values from unknown → derive types from schema·config·constants

B. State space
   consume framework union → capability·API separation → union + never
   → discriminated union → exhaustive lookup·assertNever
   → transition machine only when the ordering violation itself is a domain error

C. API relation
   typeof·as const·satisfies → keyof·indexed access
   → built-in utility (Pick·Omit·Extract·Exclude·Parameters·ReturnType·Awaited)
   → relational generic·lookup map → tagged type → const type parameter·NoInfer
   → overload for 2~3 discrete input/output relations → mapped·conditional for a composable relation
   → recursive only when the nested structure itself is the contract
```

- The parse at a trust boundary is not optional.
- The ladders are judged independently. Using a later rung for a problem that an earlier rung closes
  within the same ladder is a `FINDING`.
- Do not reimplement a relation that a built-in utility expresses
  (`Awaited`·`ReturnType`·`Parameters`·`Extract`·`Exclude`·`NonNullable`·`NoInfer`·`Readonly`·
  `Record`·`Pick`·`Omit`) with a custom conditional type.
- Use the three later rungs (overload·mapped/conditional·recursive) only when they satisfy the
  isolation condition of [`api-surface.md`](api-surface.md).
- If you actually choose a custom exported generic, a mapped·conditional·template-literal·recursive
  type, a variance-sensitive callback, or a deep transform, pick a candidate from the catalog of
  [`advanced-contracts.md`](advanced-contracts.md) and leave a compiler witness.

## Type authoring rules

**Derivation over declaration.**

- Targets for hand declaration — a closed contract where the type itself is the single source of
  policy. State·event·failure·operation unions, tagged/branded types, and a public API's
  capability·mutually exclusive Props.
- Targets for derivation — `z.output` for entity·ID, `Extract`·`Exclude` for a subset, an
  `as const` constant for a finite string union, `keyof typeof` for object keys, and
  `Parameters`·`ReturnType`·`Awaited` for function relations.
- The judgment criterion is not the number of hand declarations but **whether two or more places
  own the same fact**. If one policy fact is owned simultaneously by a schema and an interface, or
  by a constant and a union, the two authorities drift apart.

Use a discriminated union **when the data attached to each member actually differs**. The two types
below express different facts of the same domain, and which one to choose is decided by this
condition, not by taste.

```typescript
// object union — only shipping has fieldErrors, only review has quote.
// The tag guards the valid scope of those fields. All of them are domain states the card defined.
// Do not put a request lifecycle such as submitting·success·failure here —
// the mutation's framework union (state-ladder rung 2) already owns it.
type CheckoutState =
  | { status: 'cart'; items: CartItem[] }
  | { status: 'shipping'; address: Address; fieldErrors: FieldErrors }
  | { status: 'review'; quote: Quote; agreed: boolean }

// literal union — there is no attached data. The badge copy·disabled state is decided by the consumer.
// Wrapping it in a wrapper such as { kind: 'paid' } blocks no new wrong code.
type PaymentBadge = 'unpaid' | 'paid' | 'refunded'
```

- Decide first which of the two examples above to copy. A tagged object is only for when **two or
  more** members have their own fields, and otherwise it is a literal union.
- Use a single `status` string literal discriminant. Do not express the same flow with parallel
  boolean flags (`isLoading`·`isError`·`isSuccess`).
- Each state's fields hold only **the values that are meaningful in that state**. Do not merge them
  into optional fields common to all states.
- The number of variants is not grounds for introducing a variant record. Derive a union from a
  record only when that same record is the single authority actually deriving two or more of the
  state union and the per-variant runtime lookups (config·renderer·message·permission):
  ```typescript
  interface Steps {
    shipping: { address: Address; fieldErrors: FieldErrors }
    review: { quote: Quote; agreed: boolean }
  }
  type State = { [K in keyof Steps]: { status: K } & Steps[K] }[keyof Steps]
  const stepLabel = { shipping: '배송지', review: '최종 확인' } satisfies Record<keyof Steps, string>
  ```
- **Attach a discriminant when there is diverging data.** The return of a derived computation
  (`resolve*`) built by combining source states is almost always a literal union — putting a tag on
  it only adds the cost of stripping `.kind` at every call site and blocks no wrong code.
- **Create schemas only at boundaries.** Declare a finite value generated inside the app by user
  action as an `as const` constant or a literal union, and attach zod at the **read point where
  that value comes back** from storage·URL·a response. Creating a schema for an internally
  generated value while the read point trusts the `JSON.parse` result as is means the boundary was
  placed exactly backwards, and it is a `FINDING`.
- For failure, if the card distinguishes subtypes (`network`·`validation`·`5xx`), make `reason` a
  discriminated union too. If an expected failure must be handled as a return value, use a closed
  union of the form `Result<T, ErrorUnion>` and leave `throw` exclusively for defects (broken
  invariants).
- A value from a trust boundary (API response, storage, URL, message) starts at `unknown` and
  acquires its domain type through **parsing**. If the repo has zod, use `z.discriminatedUnion()`
  and derive the type with `z.output` — do not double-declare a schema and an interface or use
  `as DomainType` on a response.
- Model a mutation payload as an actual operation union rather than a `Partial` of the entity (like
  `rename`·`clear-description`). Do not create a patch type where it is ambiguous whether
  `undefined` means "keep" or "delete", and if keep·set·delete are all possible, split the
  operations.

## Do not claim more than the runtime

A type promises only as far as the implementation actually guarantees. The following are false
contracts that compile but claim more than the runtime.

- **`Record<K, V>` is a totality contract** — it means every `K` exists in the result. Use it only
  when initializing every key by a prior traversal or filling a default into missing keys.
  - If the implementation is a sparse lookup that fills only observed keys (a `groupBy` result and
    such) and the key domain is a finite union, `Partial<Record<K, V>>`.
  - For an open domain such as an ID·branded string, `Map`. Putting `Partial<Record<K, V>>` on an
    open key only rebuilds by hand the `V | undefined` lookup contract that `Map` already gives.
  - It is a different problem from the `Partial<DomainEntity>` mutation ban. The former is a patch
    that loses operation meaning, and the latter is a result expression that only some keys exist
    at runtime.
- **A type predicate has a duty to check.** Use `value is T` only when the body actually checks
  `T`'s required invariants. Do not create a predicate that always returns `true`, that wraps an
  `as`, or that checks only some fields while promising the whole domain type. For a complex domain
  type at a boundary the schema parser comes first, and only simple·exact narrowing at the level of
  `isNotNil` is left as a predicate.
- **A wrapper's return contract follows its execution timing.** Preserve the call contract with
  `Parameters`, but preserve `ReturnType` only when the wrapper returns an actual value on the same
  call. If execution changes to deferred·cached·async, use the runtime meaning as it is.

  ```typescript
  type AnyFn = (...args: never[]) => unknown

  // debounce·schedule — there is no value on this call
  type Deferred<F extends AnyFn> = (...args: Parameters<F>) => void
  // cache — on a miss there is no value
  type Cached<F extends AnyFn> = (...args: Parameters<F>) => ReturnType<F> | undefined
  // async wrapper
  type Wrapped<F extends AnyFn> = (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>
  ```

- **excess property check is not a sanitizer.** Because it applies only to object literal
  assignment, an annotation such as `const user: PublicUser = source` does not remove `source`'s
  sensitive fields at runtime. Removing sensitive fields·guaranteeing an exact object is owned by a
  runtime projection or a parser.
- **A key remapping return type must be isomorphic to the runtime.** Attaching only a key-transform
  return type such as `ToCamelCaseKeys` when the function does not actually transform keys is a
  false contract.

## Exhaustiveness enforcement

Use the dependency-free mechanism first, and introduce a library only when the condition is met.

- Baseline (always, no dependency needed) — a shared `assertNever` after per-state early
  return·guard chains.
- Declarative mapping (when the per-state result is a static value·render function) — a lookup
  object + `satisfies Record<Status, ...>`. The key is **the branching union itself**: for a string
  literal union `Record<DisplayStatus, string>`, and only for a discriminated object union do you
  pull the tag out with indexed access as in `Record<State['status'], string>`.
- Library (**only when it is installed or its adoption is approved**) — `ts-pattern`'s
  `.exhaustive()`.

Per-variant configuration (label·message·handler·permission) also forces full union coverage with
`satisfies Record<Union, Config>`. When a new variant is added, every required consumption point
must surface as a compile error, and do not hide the omission with a catch-all default branch.

**The fact that a label map is needed is not grounds for making a tagged object.**
`satisfies Record` applies to a literal union as is. Making a wrapper such as
`{ kind: 'confirmed' }` in order to use a badge copy·permission map overturns the union judgment,
so the discriminant rule above takes precedence.

Some type **shapes** are caught by machine. A repo using `@lodado/eslint-config/local-rules`
already has the following rules turned on.

- `no-response-type-assertion` — asserting a boundary payload with `as` instead of parsing
- `require-discriminated-state` — an optional sibling field next to a `status` literal union
- `no-boolean-state-flags` — expressing one flow with parallel boolean flags or two boolean
  `useState`
- `no-action-in-state` — an action such as `retry` stored inside a state union·state value

Reuse `assertNever` if the repo already has it, and if not, create it in only one shared location.

## Assertion and `any` policy

Do not hide a type error in product code with `value as DomainType`, `as unknown as`, a non-null
assertion, `@ts-ignore`, or `any`. There are only four allowances.

- `as const` for literal preservation.
- A brand constructor isolated inside a validation function.
- An assertion inside an adapter that bridges a library limitation.
- A construction assertion at a single point inside a shared generic helper. It is a case such as
  `const result = {} as Pick<T, K>` where TypeScript cannot prove incremental object construction,
  and only when the public return type is mechanically derived from the input generic, the
  implementation actually establishes that invariant, and the `as` does not propagate to consumer
  call sites. Do not use it to turn a boundary value into a domain type.

Leave the runtime invariant grounds on an isolated assertion. If an external package returns `any`,
receive it immediately as `unknown` and narrow it.

The `any` ban is measured on application values. When `any` is used only for generic wiring, as in
a callable constraint such as `(...args: any[]) => unknown`, and is neither read as a value nor
leaked into a public return type·Props, allow it only inside `types/internal`·an adapter. Where
`unknown` works, use `unknown`.

## Do not move the rules into code comments

- This document's rules and rationale (`Record` is a totality contract, `Map` when sparse) are an
  explanation of why that type was chosen, not content for the code to hold.
- Write the reason for the choice in the Implementation Decision, and leave in code comments only
  the domain constraint that cannot be expressed by a type and the card row ID backing it
  (`// P6: cancellation cannot be undone`). A comment that pastes a rule sentence verbatim is a
  deletion target in review.
- If a type error occurs, first judge whether the implementation violated the contract or the
  contract differs from the actual requirement. Do not remove the error by turning a required field
  optional or widening a union to `string` without grounds.
