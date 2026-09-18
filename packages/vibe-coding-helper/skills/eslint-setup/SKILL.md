---
name: eslint-setup
description: Use when adding or changing ESLint config in a project that uses @lodado/eslint-config - picks the right preset combination instead of copying a full config in.
---

# ESLint setup with @lodado/eslint-config

**Last updated:** 2026-09-18

The config ships composable presets. Enable only what the package actually is.

## Install

```bash
pnpm add -D @lodado/eslint-config eslint@^9.39.5
```

v2.0.0부터 base는 Antfu 기반 ESM-only ESLint 9 flat config다. Node 22.22.2 또는
24.15.0 이상이 필요하며 `.eslintrc.*` 레포는 `eslint.config.mjs`로 이전해야 한다.
`next` preset은 `eslint-config-next@16`이 `next` 패키지 자체를 require하므로 Next
앱(next 설치됨)에서만 동작한다. preset들이 공유 plugin 참조를 내부에서 하나로
정규화하므로 별도 pnpm override는 필요 없다.

## Compose

Use `eslint.config.mjs`; each preset is a flat-config array. Start with the presets
needed by the package, for example a React library:

```js
import base from '@lodado/eslint-config'
import react from '@lodado/eslint-config/react'
import a11y from '@lodado/eslint-config/a11y'
import localRules from '@lodado/eslint-config/local-rules'
import testing from '@lodado/eslint-config/testing'

export default [
  { ignores: ['dist/**', '.next/**', 'coverage/**'] },
  ...base,
  ...react,
  ...a11y,
  ...localRules,
  ...testing,
]
```

Plugins, including `eslint-plugin-functional` and `eslint-plugin-react-web-api`,
install as package dependencies. **Installing a plugin does not activate a preset**:
import and spread each required preset. No Jest preset is added.

## Which presets

| Package kind                                              | Presets                                            |
| --------------------------------------------------------- | -------------------------------------------------- |
| Node/TS library, no JSX                                   | base                                               |
| React component library                                   | base + react + a11y + local-rules + testing        |
| Next.js app                                               | base + next + react + a11y + local-rules + testing |
| Any package inside Turborepo                              | add turbo                                          |
| Any package using TanStack Query                          | add query                                          |
| Any JS/TS package opting into broad quality checks        | add quality                                        |
| TypeScript package with a tsconfig                        | add strict-types                                   |
| TypeScript package with designated pure calculation files | add functional                                     |

Order matters: later entries win. Keep `base` first and, for Next.js apps, put
`react` **after** `next` so the React discipline rules retain their severity.
The public import stays `@lodado/eslint-config/react` even though its source is ESM.

### Base: keep lint feedback actionable

`base` enables `eslint-comments/require-description` and
`eslint-comments/no-unlimited-disable` as errors, and sets
`linterOptions.reportUnusedDisableDirectives: 'error'`. Exceptions must name the
rule and explain why it is needed, rather than disabling all feedback:

```js
// eslint-disable-next-line no-console -- CLI output is the command's public interface.
console.log('Ready')
```

### Type-aware checks

Add these presets after the base and framework presets when the project has a tsconfig:

```js
import base from '@lodado/eslint-config'
import strictTypes from '@lodado/eslint-config/strict-types'
import functional from '@lodado/eslint-config/functional'

export default [...base, ...strictTypes, ...functional]
```

Both use `parserOptions.project: true` (nearest `tsconfig.json`). Ensure matched files
belong to that tsconfig; for a different project, append a file-scoped override such as:

```js
{
  files: ['**/*.{ts,tsx,mts,cts}'],
  languageOptions: {
    parserOptions: { project: './tsconfig.eslint.json' },
  },
}
```

Use TypeScript's `strict`/`strictNullChecks` for meaningful unnecessary-condition
checks. Type-aware lint builds a TypeScript program, so check lint duration on the
consumer project; JavaScript files are not enrolled by `strict-types`.

`strict-types` enables these errors:

| Rule                                                                                                                         | Feedback                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ts/no-floating-promises`                                                                                                    | Handle completion or rejection; `void` alone is not an escape (`ignoreVoid: false`). |
| `ts/no-misused-promises`                                                                                                     | Do not pass Promises to synchronous conditions or callbacks.                         |
| `ts/no-unsafe-assignment`, `ts/no-unsafe-argument`, `ts/no-unsafe-call`, `ts/no-unsafe-member-access`, `ts/no-unsafe-return` | Stop `any` from bypassing the type contract.                                         |
| `ts/no-unnecessary-condition`                                                                                                | Remove conditions that types prove unnecessary.                                      |
| `ts/switch-exhaustiveness-check`                                                                                             | Name every discriminated-union state; redundant defaults are also reported.          |

### Functional: a scoped pure core

`functional` applies only to `domain/`, `selectors/`, and `reducers/` directories and
`*.pure.ts` files (also `.mts`/`.cts`); `*.test.*` and `*.spec.*` files are excluded.
It does not impose these restrictions on every UI component, event handler or adapter.

- `functional/immutable-data`: **error** for mutation.
- `functional/prefer-immutable-types` and `functional/no-let`: **warn**, so readonly
  contracts and avoiding reassignment give feedback without banning every local algorithm.
- Core restriction rules reject direct I/O imports/globals and nondeterministic
  operations such as `Date.now()`, zero-argument `new Date()` and `Math.random()`.
  Keep I/O in adapters; pass data, time and random values into calculations.

For example, use `expiresAt(now, ttl)` rather than reading the clock inside it.
Readonly types and syntax restrictions are guardrails, **not proof of full purity**:
ESLint cannot establish the behavior of every indirect call or injected dependency.

### React: effects only for external synchronization

`react` keeps the strict `react-you-might-not-need-an-effect` preset and enables
`react-hooks/purity`, `react-hooks/immutability`, `react-hooks/refs`,
`react-hooks/static-components`, and `react-hooks/exhaustive-deps` as **errors**.
Do not suppress a dependency error to hide an effect loop; move derived values into
render-time calculations and user actions into event handlers.

The `react-web-api` rules warn about missing cleanup for event listeners, fetches,
intersection observers, intervals, resize observers and timeouts. Legitimate effects
remain allowed; these checks look for resource leaks rather than counting effects.

### Other presets

`testing` routes by path: `*.test.*` / `*.spec.*` receive Vitest and Testing Library
rules; `e2e/**`, `*.e2e.*` and `playwright/**` receive Playwright rules.

`a11y` uses jsx-a11y's strict preset. `quality` enables SonarJS's recommended flat
config plus AI reliability rules documented in
[`QUALITY.md`](../../../eslint-config/QUALITY.md). It is opt-in because its broad
code-smell and complexity checks can surface existing debt when first adopted.

## Local rules

`@lodado/eslint-config/local-rules` turns these on. Severity comes from each rule - certain
defects are errors, judgement calls are warnings, and rules that clash with an existing repo
convention ship off.

| Rule                               | Severity | What it catches                                                                                       |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `no-console-log`                   | error    | `console.log` left in source                                                                          |
| `require-exact-call-count`         | error    | `toHaveBeenCalled()` where the contract is 0 / exactly 1 / 2+ calls                                   |
| `require-skip-reason`              | error    | `test.skip` / `it.todo` with no comment saying which layer covers it instead                          |
| `no-arbitrary-sleep-in-tests`      | error    | `await sleep(100)` / `new Promise(r => setTimeout(r, n))` in test files                               |
| `no-css-locator-without-reason`    | error    | `page.locator('.thing')` in e2e specs with no justification comment                                   |
| `no-refetch-in-effect`             | error    | `refetch()` inside an effect instead of putting the input in the query key                            |
| `no-fetch-in-component`            | error    | `fetch` / `axios` called straight from a component                                                    |
| `require-abort-signal-passthrough` | error    | a queryFn that destructures `signal` but never hands it to `fetch`                                    |
| `no-response-type-assertion`       | error    | `(await res.json()) as Payload` — asserting a boundary payload instead of parsing it                  |
| `require-discriminated-state`      | warn     | a `status` literal union sitting next to optional siblings instead of one member per state            |
| `no-boolean-state-flags`           | warn     | parallel `isLoading` / `isError` flags for one flow, or two boolean `useState` in one component       |
| `no-action-in-state`               | warn     | an action (`retry`, `reset`) stored inside a state union member or state value instead of beside it   |
| `require-effect-annotation`        | warn     | `useEffect` with no comment naming the external system, reason and cleanup                            |
| `no-use-client-above-leaf`         | warn     | `'use client'` on a Next.js `page`/`layout`/`template`/`default` route file                           |
| `no-derived-state-effect`          | warn     | an effect whose only job is `setX(<value derived from the deps>)`                                     |
| `no-derived-state-member`          | warn     | a state union member carrying the same fields as a sibling under a different tag (`ready` / `paging`) |
| `scenario-test-filename`           | off      | test files that do not name their layer (`*.scenario.test.*` / `*.unit.test.*`)                       |

Turn an off-by-default rule on per project:

```js
rules: {
  '@lodado/local-rules/scenario-test-filename': 'warn',
}
```

## Rules

- Do not re-declare rules the preset already sets. Change the preset instead and release it.
- Formatting is Prettier's job, not ESLint's - the base preset only turns conflicting rules off.
- A rule that should apply everywhere belongs in `@lodado/eslint-plugin-local-rules`, not in a per-project override.
