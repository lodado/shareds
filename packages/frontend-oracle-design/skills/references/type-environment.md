# Type Contract Prerequisite Environment — Verify Once Per Repo

## When to Read

- **Once per repo**, before creating a type contract
  ([`types/state-ladder.md`](types/state-ladder.md)) with this skill in the target repo for the
  first time.
- Or when a diff changes the tsconfig·TypeScript version. Do not re-read it for every card.
- Rationale — "it does not compile" is a function of the compiler settings. A type contract whose
  environment is not pinned is not deterministic. The same code may pass or fail depending on the
  repo settings.

## Verification Items

For tsconfig, follow the `extends` chain to the end and judge by the effective value
(`tsc --showConfig`). The standard is the effective value, not the value visible in the file.

| Item                                 | Standard    | Contract Weakened When Unmet                                                                     |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------ |
| TypeScript version                   | ≥ 5.4       | `NoInfer`(5.4)·`const` type parameter(5.0)·`satisfies`(4.9) unavailable                          |
| `strict`                             | Required    | discriminated union narrowing·null safety — the type contract premise itself is absent           |
| `strictFunctionTypes`                | Recommended | callback parameter safety. But the method·constructor bivariance exception remains               |
| `useUnknownInCatchVariables`         | Recommended | The `catch` value can flow like `any` and be used without boundary parsing                       |
| `noUncheckedIndexedAccess`           | Recommended | lookup map·array index access passes without an `undefined` check                                |
| `noPropertyAccessFromIndexSignature` | Recommended | Code that reads an open dictionary key like a definite property passes                           |
| `exactOptionalPropertyTypes`         | Recommended | The "keep vs delete" `undefined` distinction in computed unions is not guaranteed by compilation |

## Judgment

- **All satisfied** — record the tsconfig location·TypeScript version in the Source Registry as
  `project-constraint` and proceed. Do not re-verify in later cards.
- **`strict` or the version unmet** — the premise of the type contract is absent. Do not change the
  tsconfig silently — it is a project policy change that ripples across the whole repo. Show the
  user the unmet items and their impact, then `NEEDS_DECISION`.
- **Recommended flag unmet** — propose the change that turns it on, but if it is refused·deferred,
  record the list of weakened contracts in the Implementation Decision and proceed. It means that
  violations of those contracts must be caught by review·tests rather than by compilation.

## Recording and Re-verification

- If a tsconfig·version change that differs from the recorded environment appears in a later diff,
  read this document again and update the Source Registry record. A compiler upgrade is a
  project-constraint change that can also alter `strict`-family behavior.
- Record the compiler version the lockfile/package manager actually resolved and the effective
  values from `tsc --showConfig`. A result that passes only in the Playground or on the latest
  TypeScript is not Source Registry evidence.
- If there is a custom recursive·distributive·template-literal type or a performance claim, leave
  the baseline/after values from `tsc --noEmit --extendedDiagnostics` in the Implementation Decision.
  Use `--generateTrace` only when there is a baseline regression and the cause needs to be identified.
