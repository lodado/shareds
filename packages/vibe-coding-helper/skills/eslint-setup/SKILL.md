---
name: eslint-setup
description: Use when adding or changing ESLint config in a project that uses @lodado/eslint-config - picks the right preset combination instead of copying a full config in.
---

# ESLint setup with @lodado/eslint-config

The config ships composable presets. Enable only what the package actually is.

## Install

```bash
pnpm add -D @lodado/eslint-config eslint@^9.39.5
```

v1.0.0부터 ESLint 9 flat config 전용이다 — `.eslintrc.*` 레포는 `eslint.config.mjs`로
이전해야 쓸 수 있다. `next` preset은 `eslint-config-next@16`이 `next` 패키지 자체를
require하므로 Next 앱(next 설치됨)에서만 동작한다. preset들이 공유 plugin 참조를
내부에서 하나로 정규화하므로 별도 pnpm override는 필요 없다.

## Compose

`eslint.config.mjs` in the consuming package — every preset is a flat-config array, spread it:

```js
import base from '@lodado/eslint-config' // always - TS parsing, import sort, prettier conflict removal
import react from '@lodado/eslint-config/react' // React recommended + hooks/effect discipline
import next from '@lodado/eslint-config/next' // Next.js apps only
import a11y from '@lodado/eslint-config/a11y' // JSX that renders user-facing markup
import turbo from '@lodado/eslint-config/turbo' // Turborepo workspaces - catches undeclared env vars
import localRules from '@lodado/eslint-config/local-rules' // lodado custom rules - see the table below
import testing from '@lodado/eslint-config/testing' // Vitest/Testing Library + Playwright, scoped by file path
import query from '@lodado/eslint-config/query' // packages using TanStack Query
import strictTypes from '@lodado/eslint-config/strict-types' // typed lint - exhaustive discriminated union switches

export default [
  { ignores: ['dist/**', '.next/**', 'coverage/**'] },
  ...base,
  ...react,
  ...next,
  ...a11y,
  ...turbo,
  ...localRules,
  ...testing,
  ...query,
  ...strictTypes,
]
```

CJS(`eslint.config.js`)면 `require`로 같은 배열을 spread한다.

## Which presets

| Package kind                     | Presets                                            |
| -------------------------------- | -------------------------------------------------- |
| Node/TS library, no JSX          | base                                               |
| React component library          | base + react + a11y + local-rules + testing        |
| Next.js app                      | base + react + next + a11y + local-rules + testing |
| Any package inside a turborepo   | add turbo                                          |
| Any package using TanStack Query | add query                                          |
| Any package with a tsconfig      | add strict-types                                   |

`strict-types` needs type information. It ships `parserOptions.project: true` (nearest
tsconfig.json); override `parserOptions.project` in the consuming config when that guess is
wrong (for example a monorepo package linting files owned by a different tsconfig). It turns on
`@typescript-eslint/switch-exhaustiveness-check` as an error with redundant defaults also
reported, so every switch over a discriminated union must name all states.

`testing` routes by path on its own: `*.test.*` / `*.spec.*` get the Vitest and Testing Library
rules, `e2e/**`, `*.e2e.*` and `playwright/**` get the Playwright rules. Nothing else is touched,
so it is safe to enable package-wide.

Order matters: later entries win. Keep the base preset first.

## Local rules

`@lodado/eslint-config/local-rules` turns these on. Severity comes from each rule - certain
defects are errors, judgement calls are warnings, and rules that clash with an existing repo
convention ship off.

| Rule                               | Severity | What it catches                                                                                     |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `no-console-log`                   | error    | `console.log` left in source                                                                        |
| `require-exact-call-count`         | error    | `toHaveBeenCalled()` where the contract is 0 / exactly 1 / 2+ calls                                 |
| `require-skip-reason`              | error    | `test.skip` / `it.todo` with no comment saying which layer covers it instead                        |
| `no-arbitrary-sleep-in-tests`      | error    | `await sleep(100)` / `new Promise(r => setTimeout(r, n))` in test files                             |
| `no-css-locator-without-reason`    | error    | `page.locator('.thing')` in e2e specs with no justification comment                                 |
| `no-refetch-in-effect`             | error    | `refetch()` inside an effect instead of putting the input in the query key                          |
| `no-fetch-in-component`            | error    | `fetch` / `axios` called straight from a component                                                  |
| `require-abort-signal-passthrough` | error    | a queryFn that destructures `signal` but never hands it to `fetch`                                  |
| `no-response-type-assertion`       | error    | `(await res.json()) as Payload` — asserting a boundary payload instead of parsing it                |
| `require-discriminated-state`      | warn     | a `status` literal union sitting next to optional siblings instead of one member per state          |
| `no-boolean-state-flags`           | warn     | parallel `isLoading` / `isError` flags for one flow, or two boolean `useState` in one component     |
| `no-action-in-state`               | warn     | an action (`retry`, `reset`) stored inside a state union member or state value instead of beside it |
| `require-effect-annotation`        | warn     | `useEffect` with no comment naming the external system, reason and cleanup                          |
| `no-use-client-above-leaf`         | warn     | `'use client'` on a Next.js `page`/`layout`/`template`/`default` route file                         |
| `no-derived-state-effect`          | warn     | an effect whose only job is `setX(<value derived from the deps>)`                                   |
| `scenario-test-filename`           | off      | test files that do not name their layer (`*.scenario.test.*` / `*.unit.test.*`)                     |

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
