---
name: eslint-setup
description: Use when adding or changing ESLint config in a project that uses @lodado/eslint-config - picks the right preset combination instead of copying a full config in.
---

# ESLint setup with @lodado/eslint-config

The config ships composable presets. Enable only what the package actually is.

## Install

```bash
pnpm add -D @lodado/eslint-config eslint@^8.57.0
```

## Compose

`.eslintrc.js` in the consuming package:

```js
module.exports = {
  root: true,
  extends: [
    '@lodado/eslint-config', // always - TS parsing, import sort, prettier conflict removal
    '@lodado/eslint-config/react', // React components (airbnb style guide)
    '@lodado/eslint-config/next', // Next.js apps only
    '@lodado/eslint-config/a11y', // JSX that renders user-facing markup
    '@lodado/eslint-config/turbo', // Turborepo workspaces - catches undeclared env vars
    '@lodado/eslint-config/local-rules', // lodado custom rules - see the table below
    '@lodado/eslint-config/testing', // Vitest/Testing Library + Playwright, scoped by file path
    '@lodado/eslint-config/query', // packages using TanStack Query
    '@lodado/eslint-config/strict-types', // typed lint - exhaustive discriminated union switches
  ],
}
```

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

| Rule                               | Severity | What it catches                                                                 |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `no-console-log`                   | error    | `console.log` left in source                                                    |
| `require-exact-call-count`         | error    | `toHaveBeenCalled()` where the contract is 0 / exactly 1 / 2+ calls             |
| `require-skip-reason`              | error    | `test.skip` / `it.todo` with no comment saying which layer covers it instead    |
| `no-arbitrary-sleep-in-tests`      | error    | `await sleep(100)` / `new Promise(r => setTimeout(r, n))` in test files         |
| `no-css-locator-without-reason`    | error    | `page.locator('.thing')` in e2e specs with no justification comment             |
| `no-refetch-in-effect`             | error    | `refetch()` inside an effect instead of putting the input in the query key      |
| `no-fetch-in-component`            | error    | `fetch` / `axios` called straight from a component                              |
| `require-abort-signal-passthrough` | error    | a queryFn that destructures `signal` but never hands it to `fetch`              |
| `require-effect-annotation`        | warn     | `useEffect` with no comment naming the external system, reason and cleanup      |
| `no-use-client-above-leaf`         | warn     | `'use client'` on a Next.js `page`/`layout`/`template`/`default` route file     |
| `no-derived-state-effect`          | warn     | an effect whose only job is `setX(<value derived from the deps>)`               |
| `scenario-test-filename`           | off      | test files that do not name their layer (`*.scenario.test.*` / `*.unit.test.*`) |

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
