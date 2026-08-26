# Type constraints — advanced type contracts and compiler witnesses

## When to read and scope of application

- **Load** — always, together with [`state-ladder.md`](state-ladder.md)·[`authoring.md`](authoring.md)·[`api-surface.md`](api-surface.md), on every type task.
- **Target** — the design·change·review of a custom exported generic, a
  mapped·conditional·template-literal·recursive type, a variance-sensitive callback, or a deep
  transform. Excludes feature-local state·simple Props·a relation that closes with a built-in
  utility.
- **Adoption** — not a taboo but an **actively considered candidate**. If an earlier rung does not
  close it, raise a candidate from the catalog, but use it only when it passes the selection gate
  and the compiler witness packet. An advanced type is not a learning goal but a means to make an
  AI-authored public type contract rejectable by the compiler.

In the authority order, the target repo's lockfile·effective `tsconfig`·installed TypeScript always
comes first. A result that passes only in the TypeScript Playground, the latest compiler, or a
challenge corpus is not evidence. External material is `implementation-reference` and not a product
policy source.

## Selection gate

Climb the ladder of [`authoring.md`](authoring.md) first. If an earlier rung closes the actual
misuse, stop here.

1. Make a wrong combination impossible to build through API absence·API separation.
2. Derive from schema·config·`as const` values with `typeof`·`keyof`·indexed access·`satisfies`.
3. Use a built-in utility (`Pick`·`Omit`·`Extract`·`Exclude`·`Parameters`·`ReturnType`·`Awaited`·`NoInfer`·`Record`).
4. Reuse an already installed production library type.
5. Use the minimal generic that is inferred automatically at a representative product call site.
6. Only when the relation still does not close, isolate the
   mapped·conditional·template-literal·recursive type in `types/internal`.

Putting a challenge-solution-style helper directly in feature code, or reimplementing a built-in
utility with a custom type, is a `FINDING`.

## Advanced technique catalog

These are patterns proven in Type Challenges and in open source such as type-fest·zod·TanStack.
Read each item together with **the relation it closes** and **the trap**. When you reach gate step
6, pick a candidate from this catalog, and if you adopt it, leave a witness packet.

- **`infer X extends Y`** — constrains the inference result in the same clause to reduce nested
  conditionals (such as `${infer N extends number}` inside a template literal). TS 4.7+.
- **variadic tuple type + labeled element** — the wrapper preserves the argument count·names
  (`(...args: [...A, onDone: () => void]) => void`). Spreading a widened array loses the tuple
  structure and the labels.
- **key remapping filter** — selects keys by value shape with
  `{ [K in keyof T as T[K] extends V ? K : never]: T[K] }` (the `PickByValue` family). An `as`
  remap can change the homomorphic judgment, so keep a modifier-preservation witness with it.
- **DistributiveOmit·DistributivePick** — the built-in `Omit` does not distribute over a union and
  collapses it to the common keys. If per-union-member preservation is the contract, make the
  distribution explicit with `T extends unknown ? Omit<T, K> : never` and pin it with a negative
  witness.
- **tail-recursive accumulator** — a recursive type is tail-recursed with an accumulator parameter
  to delay the instantiation depth limit (`TS2589`). On adoption, the before/after values of
  `--extendedDiagnostics` from [`../type-environment.md`](../type-environment.md) are
  mandatory.
- **homomorphic vs non-homomorphic mapped type** — only the `{ [K in keyof T]: … }` form preserves
  `readonly`·optional modifiers. If the key source is not `keyof T` the preservation rule differs,
  so apply the modifier test of the semantics rules below.
- **the two implementations of a branded type** — a string tag (`{ __brand: 'UserId' }`) is
  structurally forgeable, while a `unique symbol` brand cannot be forged outside the declaring
  module. For a contract that crosses a package boundary, prefer the symbol brand. The criteria for
  choosing targets follow the brand rule of [`api-surface.md`](api-surface.md).
- **Forbidden: union-order-dependent types** — the `UnionToTuple` family is non-deterministic
  because union member order is a compiler-internal matter. Do not put it in product code. The ban
  on public verification by an `Equal<A, B>` helper alone is exactly the
  [`api-surface.md`](api-surface.md) rule.

## Compiler witness packet

To adopt an advanced type, leave the evidence below in `.test-d.ts(x)` or in the type assertion
test the repo uses.

| Evidence           | Criterion                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| positive witness   | One representative product call site compiles without an explicit type argument.                                                    |
| negative witnesses | One `@ts-expect-error` line per axis this type closes among the [`../bva.md`](../bva.md) type boundary axes.                        |
| edge witnesses     | A hole not in the axis table, such as `overload`, is added only when this type actually exposes it. Split the API if it exceeds 30. |
| mutation witness   | Widening the union to `string`, changing a required field to optional, or removing `NoInfer` turns the suite RED.                   |
| runtime complement | URL·storage·API·time axis·sanitization are proven by a separate parser·guard·runtime test.                                          |
| soundness gap      | Write down the remaining holes such as the last overload signature, method bivariance, and assertion isolation.                     |

## Advanced semantics rules

- A conditional type distributes over a union when it is a naked type parameter. If distribution is
  the contract, test the `any`·`unknown`·`never`·union edges. If it is not distribution, block it
  with the `[T] extends [U]` form and put that difference in a witness.
- Use `infer` only when it preserves the relation between input and output. Because an overload can
  be inferred from the last signature, do not use it alone as accuracy evidence for a public
  overload API.
- A mapped type deliberately tests the preservation·removal of `readonly` and optional modifiers.
  Read `foo: undefined` and `foo?: undefined` together with the effective
  `exactOptionalPropertyTypes` setting.
- Use a template literal type only for a small closed literal grammar. Do not report an API
  response, URL, or storage string as verified without a runtime parser. If the union
  cross-product grows, hand it over to ahead-of-time generation or runtime validation.
- A `const` type parameter only preserves call-site literal inference; it cannot recover the
  literal of a variable that has already widened to `string`.
- `NoInfer` only restricts the inference source and does not change assignability. Pin which
  argument is the inference authority with positive/negative witnesses.
- Even under `strictFunctionTypes`, a method·constructor declaration has a bivariance exception.
  Take a callback that needs safety as a function property rather than a method, and keep a
  negative witness.
- A variance annotation is not a device that forcibly changes structural assignability. Use it only
  as a documentation·debugging·measured-performance aid when it matches the actual structure.
- A recursive/distributive type carries the risk of combinatorial explosion and `TS2589`. Do not
  hardcode a numeric limit in the document but judge by the actual project compiler diagnostics.

## Performance and debugging

Performance·compiler flag·TypeScript version evidence is owned by [`../type-environment.md`](../type-environment.md).
This document only requires that if you choose a recursive/distributive type you apply that
document's `--extendedDiagnostics` criteria. Do not hide a depth·performance error with `any`, a
double assertion, `@ts-ignore`, or `skipLibCheck`.
