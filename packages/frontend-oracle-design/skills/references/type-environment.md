# Type Contract Prerequisite Environment — Verify Once Per Repo

## Mandatory verification stack

Follow [`mandatory-verification.md`](mandatory-verification.md) on every Oracle invocation, including
Low and Design-only. Its tool-use, evidence and blocking rules remain mandatory; the selection
ladders below choose meaningful contracts and never exempt a member of that stack.

## When to Read

- **Once per repo**, before creating a type contract ([`types/state-ladder.md`](types/state-ladder.md))
  with this skill in the target repo for the first time. On every later invocation, confirm that the
  existing environment evidence still matches the current compiler, effective config, witnesses and
  harness before Draft/lock.
- Re-verify when a diff changes the tsconfig·TypeScript version, compiler witness inclusion, or the
  checker/harness path.
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
  `project-constraint` and proceed; confirm that prior evidence remains valid for this card.
- **`strict`, the version, or any obligation-required flag unmet** — the premise of the type contract is absent. Do not change the
  tsconfig silently — it is a project policy change that ripples across the whole repo. Show the
  user the unmet items and their impact, then `NEEDS_DECISION`.
- **Recommended flag unmet but not required by a claimed obligation** — record the remaining
  soundness limitation and any runtime complement. Do not claim a static guarantee that needs the
  missing flag. A missing or broken compiler/checker is `ENVIRONMENT_DEFECT` → `FAIL`, not a
  request to invent weaker types.

## Recording and Re-verification

- Re-verify when the effective config, compiler version, witness inclusion, or checker path changes.
  A harness change can invalidate type evidence without changing the product type. Do not silently
  upgrade the compiler or change project-wide flags.
- Record the resolved compiler path/version and effective config from `tsc --showConfig` or the
  same compiler's config parser (including `extends`). Record the actual checked files, required
  witness inclusion, module resolution, JSX, lib/types, and project-reference handling. Missing
  witnesses, stale declarations, unsupported references, and config/module errors are not rejection
  evidence. A flag needed by an obligation is required for that claim even if this table calls it
  recommended for the project overall.
- Reject `noCheck` and checking-suppression directives. Execute a clear-error canary through the
  same checker in an isolated target; transpilation or a runtime test alone cannot establish a
  static guarantee. Vitest runtime tests and Vitest typechecking are separate execution paths.
- Important negatives must also run without their suppression directive, preserving source spans
  or as independent case programs. Check diagnostic code, expression span, and actual imported
  symbol; an error elsewhere, typo, syntax failure, missing module, crash, or timeout is not a
  successful contract rejection. The compiler does not verify `@ts-expect-error` descriptions.
- General work uses the smallest necessary witness. Advanced contracts use relationship-specific
  mutations; checker/environment changes also use canary and harness mutations. Require baseline
  GREEN, one effective mutation, intended verification failure, and restored GREEN. Classify
  `killed` / `survived` / `invalid` / `infrastructure-failure`, keeping malformed/no-op
  mutants out of the kill count. A suppressed negative or temporary mutant is not product `VALID_RED`.
- Use an existing trusted adapter run (`node-test` or `vitest`) to assert compiler results where possible. Record
  compiler, runner, effective config, files, contract revision, diagnostics, mutation outcomes, and
  runId. Do not invent a TypeScript adapter or evidence kind. Fixture regression is not consumer
  product verification. Hashes and manually authored receipts do not prove policy or execution;
  preserve the approved baseline and trusted CI/runner ownership because an implementer able to
  edit the contract, verifier, and receipt together can still bypass this local check.
- For new recursive, large union, distributive, or template-literal computations, record comparable
  baseline/after `tsc --noEmit --extendedDiagnostics` results in the same environment. These are
  observations, not universal safe budgets. Use `--generateTrace` only to investigate a regression.
