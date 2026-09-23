---
name: eslint-setup
description: Use when adding or changing ESLint config in a project that uses @lodado/eslint-config - picks the right preset combination instead of copying a full config in.
allowed-tools:
  - Bash
---

# ESLint setup with @lodado/eslint-config

**Last updated:** 2026-09-23

The config ships composable presets. Enable only what the package actually is.

## Install

```bash
pnpm add -D @lodado/eslint-config eslint@^10.11.0
```

v3.0.0부터 ESLint 10 전용이다(ESLint 9는 2026-08-06 EOL). base는 Antfu 기반
ESM-only flat config이며 Node 22.22.2 또는 24.15.0 이상이 필요하다. ESLint 9 레포는
`npx @eslint/migrate-config`가 아니라 `npx codemod @eslint/v9-to-v10`으로 올린다.
React 규칙은 `eslint-plugin-react` 대신 `@eslint-react/eslint-plugin`, a11y는
`eslint-plugin-jsx-a11y-x`에서 온다 - 둘 다 ESLint 10을 지원하고 규칙 id 접두사만
`@eslint-react/`·`jsx-a11y-x/`로 바뀐다. `next` preset은 `@next/eslint-plugin-next`만
담으므로 `next` 패키지 없이도 로드된다.

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

| Package kind                                                                    | Presets                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Node/TS library, no JSX                                                         | base                                                                      |
| React component library                                                         | base + react + a11y + local-rules + testing                               |
| Next.js app                                                                     | base + next + react + a11y + local-rules + testing                        |
| Any package inside Turborepo                                                    | add turbo                                                                 |
| Any package using TanStack Query                                                | add query                                                                 |
| Any JS/TS package opting into broad quality checks                              | add quality                                                               |
| TypeScript package with a tsconfig                                              | add strict-types                                                          |
| TypeScript package with designated pure calculation files                       | add functional                                                            |
| Package styling with Tailwind CSS v4                                            | add tailwind                                                              |
| Repo where coding agents write most of the code                                 | add ai                                                                    |
| Repo with a Tailwind design system to hold the line on                          | add design                                                                |
| New React or Next.js app, or new code in a repo with no hook-placement contract | add hook-tiers                                                            |
| FSD repo that locks UI, model and API runtime ownership                         | add `strict(policy)`, see [`STRICT.md`](../../../eslint-config/STRICT.md) |

Order matters: later entries win. Keep `base` first; `next` only carries the
`@next/next/*` rules, so it composes with `react` and `a11y` in any order.
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

`base` also flags habits that type-check but hide a defect: `return Promise.resolve()`
inside `async`, `return await` of a non-promise, thenable objects, useless spreads,
unreadable IIFEs (errors); mutating a value right after creating it, repeated
`push` calls, unused `catch (error)` bindings and banned dependencies such as
`lodash`/`is-odd` (warnings, via `unicorn` and `e18e/ban-dependencies`).

### Adopting a stricter preset on an existing repo

Do not downgrade a preset to warnings to get CI green. Record the existing
violations once and fail only on new ones:

```bash
npx eslint . --suppress-all          # writes eslint-suppressions.json - commit it
npx eslint .                         # passes; new violations still fail
npx eslint . --prune-suppressions    # after fixing, drop entries that no longer fire
```

The file stores a count per (file, rule), so a fix and a regression of the same rule
in the same file cancel out - prune regularly. IDEs apply the file automatically on
ESLint 10.1+.

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

`functional` applies only to `domain/` and `selectors/` directories and
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

`react` layers ESLint React's `strict-typescript` preset (`@eslint-react/*`: no class
components, no nested component definitions, no leaked JSX, no unsafe `target="_blank"`),
the strict `react-you-might-not-need-an-effect` preset, and the full
`eslint-plugin-react-hooks` recommended set - React Compiler diagnostics such as
`purity`, `immutability`, `refs`, `static-components`, `error-boundaries`, `globals`,
`use-memo` and `exhaustive-deps` are **errors**. ESLint React's own ports of the
compiler rules are switched off so one defect reports once under `react-hooks/`.
Do not suppress a dependency error to hide an effect loop; move derived values into
render-time calculations and user actions into event handlers.

The `@eslint-react/web-api-*` rules warn about missing cleanup for event listeners,
fetches, intersection observers, intervals, resize observers and timeouts. Legitimate
effects remain allowed; these checks look for resource leaks rather than counting effects.

`eslint-plugin-react` conventions with no ESLint React equivalent are gone:
`react/function-component-definition` (arrow components) and
`react/jsx-props-no-spreading`. Add a project override if a repo still wants them.

### Hook tiers: UI, domain hooks and micro-hooks

`hook-tiers` checks where React state lives. It reads the tier from the path, so a repo needs no
policy file:

```text
src/hooks/useCheckout/            domain hook folder, named after the hook
  index.ts                        exports useCheckout and its types, never a micro-hook
  useCheckout.ts                  composes micro-hooks and pure functions; no effects or owners
  checkout.pure.ts                pure calculations (the functional preset owns *.pure.*)
  useCartTotal/useCartTotal.ts    micro-hook: one state owner such as useQuery, plus its API call
  useCouponCode/useCouponCode.ts  micro-hook: local state and its actions
src/components/CheckoutPanel.tsx  UI: calls useCheckout(), keeps view-local useState/useRef/useId
```

- A UI file (`*.tsx`/`*.jsx` outside `use<Name>/` folders) imports domain hooks through their
  folder entry. It does not call effects, state-owner hooks or API modules. Reading a route param
  or navigating stays in UI.
- A domain hook composes. Once it imports a micro-hook it may not import effects, state owners or
  the API. A domain with a single owner may skip the micro-hook folder and use that owner directly
  until a second one appears.
- A micro-hook connects at most one state owner and never imports another hook; the domain hook
  passes values between micro-hooks. Hooks have two tiers, so a third nested `use<Name>/` fails.
- A `use*` file outside these folders is a view hook for DOM work only, and other modules may not
  define stores.

State owners default to `OWNERS`: `@tanstack/react-query`, `swr`, `zustand`, `jotai`, `valtio`,
`react-redux`, `@reduxjs/toolkit`, `react-hook-form` and `@tanstack/react-form`. Routers are not
owners. Extend the list for other libraries:

```js
import { hookTiers, OWNERS } from '@lodado/eslint-config/hook-tiers'

export default [...base, ...react, ...localRules, ...hookTiers({ owners: [...OWNERS, '@apollo/client'] })]
```

With `strict(policy)`, spread `hookTiers({ strict: true })` instead: strict already reports UI
runtime defects, so hook-tiers adds only tier placement and each defect reports once. In FSD,
`model/use<Domain>/` takes the place of `hooks/use<Domain>/`. The preset sets
`no-restricted-imports`, `no-restricted-syntax` and `no-restricted-globals` per tier; a later
block that sets one of them replaces those options for its files. The runnable example is
[`examples/hook-tiers`](../../../eslint-config/examples/hook-tiers).

### Tailwind: classes resolve against the real theme

`tailwind` is opt-in and needs two peers the preset does not install:

```bash
pnpm add -D eslint-plugin-better-tailwindcss tailwindcss
```

Then tell the plugin which CSS file imports Tailwind so unknown and conflicting
classes are judged against the project's theme, not a generic list:

```js
import tailwind from '@lodado/eslint-config/tailwind'

export default [...base, ...tailwind, { settings: { 'better-tailwindcss': { entryPoint: 'app/globals.css' } } }]
```

Unknown, conflicting, concatenated and duplicate classes are errors; deprecated
classes warn. Class order and line wrapping stay off - that is the formatter's job.

### AI: the defects that still type-check

`ai` is opt-in and needs one peer the preset does not install:

```bash
pnpm add -D eslint-plugin-ai-guard
```

Most of `eslint-plugin-ai-guard`'s 18 rules restate a judgement another preset
already makes, usually with type information the plugin does not have, so the preset
turns those off and keeps the eight with no owner elsewhere:

| Rule                               | Severity | What it catches                                                                  |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `ai-guard/no-async-array-callback` | error    | `.map(async ...)` yielding `Promise[]` instead of values                         |
| `ai-guard/no-catch-log-rethrow`    | warn     | a catch that logs and rethrows, so one failure is reported twice                 |
| `ai-guard/no-unsafe-deserialize`   | warn     | `JSON.parse` on a request body or query with no visible validation               |
| `ai-guard/no-async-without-await`  | warn     | `async` added by habit to a function that never awaits                           |
| `ai-guard/no-await-in-loop`        | warn     | independent awaits serialized in a loop; retry and sequential shapes are allowed |
| `ai-guard/no-broad-exception`      | warn     | `catch (error: any)` widening a typed failure back to `any`                      |
| `ai-guard/require-auth-middleware` | warn     | an Express/Fastify route defined with no authentication middleware               |
| `ai-guard/require-authz-check`     | warn     | a handler reading a resource id with no ownership check                          |

The off rules defer to `ts/no-floating-promises`, `ts/no-unnecessary-condition`
(`strict-types`), `sonarjs/no-ignored-exceptions`, `no-hardcoded-passwords`,
`sql-queries`, `no-identical-functions` (`quality`), and `no-eval`, `no-console` and
`unicorn/no-unnecessary-await` (`base`).
**A repo that does not enable `quality` or `strict-types` loses those checks
entirely** - turn the matching `ai-guard` rules back on instead:

```js
rules: {
  'ai-guard/no-empty-catch': 'error',
  'ai-guard/no-hardcoded-secret': 'error',
}
```

### Design: token drift, coverage and server/client leaks

`design` is opt-in and needs one peer the preset does not install:

```bash
pnpm add -D @deslint/eslint-plugin
```

`@deslint/eslint-plugin` judges the axis the other presets leave alone: whether
generated markup escapes the design system instead of using it.

| Rule                                                                                                                                                                                              | Severity | What it catches                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `deslint/no-arbitrary-colors`, `-spacing`, `-typography`, `-border-radius`, `-zindex`, `deslint/no-magic-numbers-layout`                                                                          | error    | `bg-[#1A5276]`, `p-[13px]`, `z-[100]` - a value escaping the theme scale  |
| `deslint/no-leaked-env-on-client`, `deslint/no-server-only-in-client`, `deslint/no-hydration-mismatch`                                                                                            | error    | a secret env var or a server module reaching a `'use client'` file        |
| `deslint/no-placeholder-code`, `deslint/no-mock-data-in-prod`, `deslint/no-leaked-stack-trace`                                                                                                    | error    | `throw new Error('Not implemented')` and fixtures shipped as product code |
| `deslint/dark-mode-coverage`, `deslint/responsive-required`, `deslint/spacing-rhythm-consistency`, `deslint/consistent-color-palette`, `deslint/no-inline-styles`, `deslint/max-tailwind-classes` | warn     | coverage and rhythm the theme cannot decide on its own                    |

The token rules judge Tailwind classes, so enable this preset only where the theme
really defines the scale the arbitrary value is escaping - otherwise every one-off
becomes noise.

Its accessibility, security and Tailwind-correctness rules ship off: `a11y`,
`quality`, `tailwind` and `local-rules` already decide those, and `design.mjs` names
the owner beside each one. `@deslint/eslint-plugin` is ESM-only, which is why the
preset is `design.mjs`; the public import stays `@lodado/eslint-config/design`.

### Other presets

`testing` routes by path: `*.test.*` / `*.spec.*` receive Vitest and Testing Library
rules; `e2e/**`, `*.e2e.*` and `playwright/**` receive Playwright rules.

`a11y` uses the jsx-a11y-x strict preset (rule ids `jsx-a11y-x/*`). `quality` enables SonarJS's recommended flat
config plus AI reliability rules documented in
[`QUALITY.md`](../../../eslint-config/QUALITY.md). It is opt-in because its broad
code-smell and complexity checks can surface existing debt when first adopted.

## Local rules

`@lodado/eslint-config/local-rules` turns these on. Severity comes from each rule - certain
defects are errors, judgement calls are warnings, and rules that clash with an existing repo
convention or restate another preset's rule ship off.

| Rule                               | Severity | What it catches                                                                                                 |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `require-exact-call-count`         | error    | `toHaveBeenCalled()` where the contract is 0 / exactly 1 / 2+ calls                                             |
| `require-skip-reason`              | error    | `test.skip` / `it.todo` with no comment saying which layer covers it instead                                    |
| `no-arbitrary-sleep-in-tests`      | error    | `await sleep(100)` / `new Promise(r => setTimeout(r, n))` in test files                                         |
| `no-css-locator-without-reason`    | error    | `page.locator('.thing')` in e2e specs with no justification comment                                             |
| `no-refetch-in-effect`             | error    | `refetch()` inside an effect instead of putting the input in the query key                                      |
| `no-fetch-in-component`            | error    | `fetch` / `axios` called straight from a component                                                              |
| `require-abort-signal-passthrough` | error    | a queryFn that destructures `signal` but never hands it to `fetch`                                              |
| `no-response-type-assertion`       | error    | `(await res.json()) as Payload` — asserting a boundary payload instead of parsing it                            |
| `require-discriminated-state`      | warn     | a `status` literal union sitting next to optional siblings instead of one member per state                      |
| `no-boolean-state-flags`           | warn     | parallel `isLoading` / `isError` flags for one flow, or two boolean `useState` in one component                 |
| `no-action-in-state`               | warn     | an action (`retry`, `reset`) stored inside a state union member or state value instead of beside it             |
| `require-effect-annotation`        | warn     | `useEffect` with no comment naming the external system, reason and cleanup                                      |
| `no-use-client-above-leaf`         | warn     | `'use client'` on a Next.js `page`/`layout`/`template`/`default` route file                                     |
| `no-derived-state-member`          | warn     | a state union member carrying the same fields as a sibling under a different tag (`ready` / `paging`)           |
| `no-complex-ternary`               | warn     | a ternary whose condition holds a logical operator or an optional chain; nesting is base `no-nested-ternary`    |
| `interaction-hover-needs-focus`    | warn     | an interactive element that styles its hover state with no matching focus style                                 |
| `no-console-log`                   | off      | `console.log` left in source; base `no-console` already reports it                                              |
| `no-derived-state-effect`          | off      | an effect whose only job is `setX(<value derived from the deps>)`; `react-hooks/set-state-in-effect` reports it |
| `scenario-test-filename`           | off      | test files that do not name their layer (`*.scenario.test.*` / `*.unit.test.*`)                                 |

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
