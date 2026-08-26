# Type constraints — Props and the shared API surface

## Shared API promotion delta

When creating or changing an exported shared/package API, write **the call site first**, before the
implementation type. Aim not to specify a component generic that the compiler can infer at a
representative product call site, and pin the generic once only at a boundary where Row cannot be
inferred from the value alone, such as a config definition. After that, design only the delta below.

1. Write the representative valid call site without an explicit component type argument.
2. Write down the actual misuses among the wide values·optional combinations·broken relations that
   were allowed before the change.
3. From value·combination·relation·path·result·extension (the six points of
   [`state-ladder.md`](state-ladder.md)), pick only the items this API must close.
4. Derive keys and unions from schema·config·`as const` values and do not increase hand authority.
5. Expose only the controlled surface and the modes the current product uses, and leave the rest as
   API absence.
6. Put one representative valid call without an explicit generic in the type test, and a witness
   for each boundary axis this API closes. Pick the axes from the boundary axis table below and let
   the API decide the axis count. If it uses JSX, make the file `.test-d.tsx`.

- If even the valid call is not inferred, it is not a good public API no matter how the negative
  tests pass. Preserve the helper's inference or simplify the generic, and do not leave the call
  site repeating the same type argument.
- In a newly designed exported shared/package API, the generic itself is not the goal. Use it only
  when it creates a relation between two or more public places, is inferred automatically at an
  ordinary product call site, has a single inference authority, and makes a concrete wrong answer
  fail to compile.
- A one-time pin at a config·schema definition boundary is allowed. If even one of these does not
  hold, prefer a concrete type·derived union·API split.

## Props and API surface rules

- Express mutually exclusive Props with union + `never` (a link with `href` and an action with
  `onClick`, a controlled `value` and an uncontrolled `defaultValue`). Do not make them one object
  where everything is optional.
- Do not pass a union state down to a child wholesale. Pass only the variant narrowed with
  `Extract<State, { status: 'failure' }>`, and do not re-branch inside the child.
- Derive the union·schema·registry of a finite string set from one `as const` constant. A
  route·query key·analytics event name goes through a factory and the call site does not assemble
  strings.
- Use a tagged/branded type only for values that share a primitive type but cause a real outage
  when confused (different IDs, units, already-validated values). Isolate construction in one
  validation function, and do not brand every string.
- A helper preserves type inference. Do not create a helper that annotates the return type widely
  or requires the call site to repeat a generic (the `queryOptions` pattern).
- A literal factory preserves key·tuple literal inference with a `const` type parameter, without
  repeating `as const` at the call site. If only one of several arguments is the inference
  authority, attach `NoInfer` to the remaining arguments to pin the inference point to one:
  ```typescript
  function defineRoutes<const T extends readonly string[]>(paths: T): T
  function pick<T>(options: readonly T[], fallback: NoInfer<T>): T
  ```
- A function that does not mutate its input takes `readonly T[]`.
- If mode mechanically determines the value·return type, preserve the relation with a generic
  lookup map (`{ single: Id | null; multiple: ReadonlySet<Id> }[M]`). If the hook·lifecycle·usage
  meaning differs per mode, split into separate components instead of a generic
  (`Calendar.Single`·`Calendar.Range`). If the product uses only some modes, implement only those
  modes and do not create the mode prop at all.
- A product component is controlled-first — keep one authority for one value. Support uncontrolled
  in parallel only when building a general-purpose library.
- Distinguish a closed union (domain state·error·event) from an open set that consumers extend
  (plugin key, app query key). Open the open set with a typed registry or module augmentation, not
  a wide `string`.
- The type error message is public API quality too. If the error a consumer will see does not read
  at the level of "X is not assignable to CalendarDate | null", simplify the generic or split the
  API.
- If the consumption loop needs an assertion, the API shape is wrong. The moment a consumer spreads
  a union·mapped type config with `map`, the key↔value relation is severed. Tie the relation at
  value creation time (`accessor(key, { cell })` returns `render(row)`), and isolate the remaining
  assertion into one line inside that creation function. A design that closes only the definition
  point and leaves an `as` at the consumption point is disqualified from shared API promotion.
- If there are 2~3 public variants and only the input·output type relation differs, consider an
  overload. If behavior differs per variant, split the API instead of an overload.
- Isolate mapped·conditional·recursive type computation in the shared library's `types/internal`
  and keep a type test with it. Do not write a homemade advanced utility inside a feature
  component. If four or more generics are exposed on Props, consider splitting the public API.

## Boundary axis table

The axes and the count rule for type witnesses are owned by the type boundary section of
[`../bva.md`](../bva.md). Pick only the axes this API closes and do not create axes it does not
close. If `@ts-expect-error` exceeds 30, do not write more cases but split the API — 30 is not a
target but a design disqualification line.

## Verification mapping

- Keep the card row → failing test mapping per the `$test` contract. Do not create a separate "type
  test layer" for every state.
- Only when a state·Props type is exposed as an exported shared/package API, prove that the
  impossible usage does not compile with an `@ts-expect-error` type test (`.test-d.ts`,
  `.test-d.tsx` for JSX, or vitest `expectTypeOf`). For a generic API, prove the representative
  valid call without an explicit type argument in the same typecheck as well. Where applicable,
  verify readonly·`as const` tuple input acceptance, type predicate narrowing, and that no literal
  widening to `string` occurs. Write a one-line reason on each `@ts-expect-error` for which misuse
  it blocks, and do not add them for local state.
- A public compiler witness prefers an actual call·assignment·`satisfies`. Do not verify a public
  API with only an `Equal<A, B>`-style helper.
- A negative case puts only one misuse expression on the line after `@ts-expect-error` so that an
  unrelated diagnostic cannot let it pass.
- A custom generic picks only the axes this type actually closes among the `../bva.md` type
  boundary axes, and does not attach the same checklist to every type.
- Confirm once a mutation where widening the contract to `string`·optional·`any` turns the suite
  RED through an unused `@ts-expect-error` or an exhaustive failure. Because type-valid is not
  behavior-correct, record the runtime behavior test under a separate run label.

Record the following four things in the Implementation Decision.

1. The derived state·event set and the card row mapping
2. The chosen ladder rung and exhaustiveness tier
3. **The list of wrong usages that now do not compile, and the failure evidence**
4. The behavior·time-axis items that types could not catch and the runtime defends
