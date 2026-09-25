# @lodado/eslint-config

## 2.0.0

### Major Changes

- ab6348c: Require ESLint 10. ESLint 9 reached end of life on 2026-08-06 and `eslint-plugin-react` never
  followed, so the `react` preset now layers `@eslint-react/eslint-plugin` strict-typescript under the
  official `eslint-plugin-react-hooks` recommended set (React Compiler diagnostics such as
  `error-boundaries`, `globals` and `use-memo` are errors, ESLint React's duplicate ports stay off).
  `a11y` moves to `eslint-plugin-jsx-a11y-x` (`jsx-a11y-x/*`), `next` ships only
  `@next/eslint-plugin-next` core-web-vitals and no longer needs the `next` package, and Web API leak
  rules report as `@eslint-react/web-api-*`. `react/function-component-definition` and
  `react/jsx-props-no-spreading` have no ESLint React equivalent and are dropped.

  `base` gains a `lodado/habits` block: `unicorn/no-thenable`, `no-unnecessary-await`,
  `no-useless-promise-resolve-reject`, `no-useless-spread` and `no-unreadable-iife` are errors;
  `no-immediate-mutation`, `prefer-single-call`, `prefer-optional-catch-binding` and
  `e18e/ban-dependencies` warn.

  Add an opt-in `tailwind` preset for Tailwind CSS v4 on top of `eslint-plugin-better-tailwindcss`
  (unknown, conflicting, concatenated and duplicate classes fail, deprecated classes warn, ordering
  stays with the formatter). The plugin and `tailwindcss` are optional peers, installed only by repos
  that extend the preset.

  `@lodado/eslint-plugin-local-rules` reads `context.filename` / `context.sourceCode` instead of the
  accessor methods ESLint 10 removed and declares ESLint 10 as a supported peer.

- 73efe85: Check FSD layer direction without a strict policy, and keep verdicts independent of preset order, `--fix` and non-code files.

  - New `fsd-layer-direction` rule, on in the `fsd` preset: a slice imports only from lower layers, never from a sibling slice (type-only imports included), and `@x` only from the entity it names. The fsd rules now read layers from cwd-relative paths anchored at `src/`, so a checkout under a folder named `views`, `features` or `db` no longer changes their verdict.
  - `fsd` is now `fsd.mjs` and adds `fsdBoundaries({ cwd, tsconfig, roots })`, which runs `fsd-strict-boundaries` over the named roots. Inside strict or fsdBoundaries roots the folder-name rules step aside, and `verifyStrictProject` fails if a later `fsd` spread turns them back on.
  - `local-rules` no longer lists the fsd and interaction rules as `off`, so spreading it after those presets keeps them on.
  - Every preset block is scoped to JS/TS sources. Linting a README with `react` or `ai` no longer crashes.
  - `base`: an empty `catch` block is an error (a comment inside it marks a deliberate one), and `unicorn/prefer-optional-catch-binding` is gone, so `--fix` cannot turn a reported empty catch into an unreported one. `.tsx`/`.jsx` files no longer need explicit function return types.
  - `quality`: `sonarjs/no-reference-error` is off. `no-undef` owns undeclared names in JS and tsc owns them in TS, where the rule misread `React.ReactNode`.
  - `testing`: `playwright/no-raw-locators` and `playwright/prefer-locator` are errors, replacing `@lodado/local-rules/no-css-locator-without-reason`, which is removed.

- 73efe85: Give one defect one verdict, whatever spelling a coding agent picks, and close the ways to pass lint without fixing the code.

  Local rules:

  - `no-fetch-in-component` resolves the request, so `window.fetch`, an aliased `fetch`, an HTTP client import (`axios`, `ky`, `ofetch`, `wretch`, `redaxios`) or its `create()` instance count. It reports a request anywhere in a module that renders JSX, and a PascalCase factory that returns an object is no longer a component.
  - `no-response-type-assertion` sees `as unknown as T`, `!` and `satisfies` hops and type arguments such as `res.json<T>()` and `axios.get<T>()`.
  - `require-abort-signal-passthrough` checks every request in a queryFn. Deleting `{ signal }` no longer silences it, and `AbortSignal.any([signal, ...])`, `new Request(url, { signal })` and a local `const init = { signal }` count as passing it.
  - `no-refetch-in-effect` follows `refetch` under any local name and counts `invalidateQueries`/`refetchQueries`/`resetQueries`. A call inside an event listener, `socket.onmessage` or `subscribe(...)` callback is allowed.
  - `require-skip-reason` covers `skipIf`, `runIf`, `fails`, `test.fail()`, `skip.each`, `ctx.skip()`, `{ skip | fails | todo: true }`, and retries or raised timeouts (`{ retry }`, `{ timeout }`, a third-argument timeout, `describe.configure({ retries })`, `test.setTimeout`, `waitFor`/`expect.poll` timeouts). A Playwright annotation's reason argument counts as the reason.
  - A written reason is a comment of three or more words directly above the statement or at the end of its line. A lint directive, a license header, `// TODO` and `// wip` no longer count.
  - `no-arbitrary-sleep-in-tests` catches `setTimeout` from `timers/promises`, `globalThis.setTimeout`, `scheduler.wait`, member sleeps with a literal duration and sleep helpers in `test-utils/`. It allows waits under `vi.useFakeTimers()` and same-named functions imported from product code.
  - `no-action-in-state` reads interfaces and `(() => void) | undefined`, and skips library option objects such as `toast({ status, onClose })`. `require-discriminated-state` counts `T | null` siblings, resolves a same-file status alias, and no longer treats `type`/`kind` props as state. `no-boolean-state-flags` reports two boolean `useState`s only when one function sets both.
  - `strict-ui-boundary` defaults include every state owner by its owner API, every transport client, `WebSocket`, `EventSource`, `XMLHttpRequest`, `navigator.sendBeacon`, `document` listeners and `matchMedia`, and it reports a non-literal `import()` in rendering files. A barrel default import reports once.
  - `interaction-hover-needs-focus` no longer accepts `focus:outline-none` as a focus style and checks `Link`/`NavLink`.
  - `require-exact-call-count` reads `expect.soft` and negated or compared `mock.calls` counts.
  - `no-use-client-above-leaf` covers `not-found` and `loading`, and `scenario-test-filename` covers `.mts`/`.cts`/`.mjs`/`.cjs`.
  - New `no-swallowed-rejection` (an empty or log-only rejection handler, or `() => null` whose result is thrown away; `readFile(...).catch(() => null)` stays valid) and `no-nondeterministic-render` (`new Date()`, `crypto.randomUUID()` or host-locale formatting while rendering), both errors in `local-rules`.
  - A node:test or Vitest context skip (`t.skip('why')`) takes its message as the reason.
  - Removed `no-console-log` (base `no-console` owns it) and `no-derived-state-effect` (`react-hooks/set-state-in-effect` owns it).
  - The plugin exports `runtimeModules` (`OWNERS`, `OWNER_API`, `TRANSPORT`), the one list the ownership rules and presets share.

  Presets:

  - `base` forbids inline disables of the rules that report defects (`react-hooks/*`, `ts/no-floating-promises`, `ts/no-misused-promises`, `ts/no-unsafe-*`, `@lodado/local-rules/*`) outside Markdown code blocks, reports unused inline config, and rejects `<T>value` and object-literal assertions.
  - `strict-types` adds `ts/no-explicit-any`, `ts/no-unsafe-type-assertion`, `ts/no-non-null-assertion`, `ts/await-thenable` and `ts/use-unknown-in-catch-callback-variable` as errors and `ts/no-deprecated` as a warning.
  - `testing` turns the Vitest rules on under the base's `test/` id instead of registering the plugin twice (`vitest/*` ids become `test/*`). It rejects weak matchers, unnamed or large snapshots, `toThrow()` without a message, an early return in a test, `vi.setConfig` timeouts, Playwright imports in unit tests and Vitest imports in e2e specs, longer action timeouts and `test.slow()`.
  - `quality` turns off the SonarJS rules that restate a base, `react` or `testing` rule, and `cyclomatic-complexity` beside `cognitive-complexity`.
  - `react` derives the ESLint React ports it turns off from both plugins, turns off every effect-state duplicate of `react-hooks/set-state-in-effect`, and raises leaked listeners, `javascript:` URLs and leaked JSX text to errors. `next` raises `no-async-client-component` and `no-typos` to errors.
  - `ai` owns hardcoded secrets and SQL string building, where SonarJS misses the spellings agents write; spread it after `quality`.
  - `design` lists every rule it turns on instead of spreading the plugin's recommended config. Placeholder and mock code are errors, and the security and accessibility checks no other preset makes are on.
  - `a11y` adds `prefer-tag-over-role`, `no-aria-hidden-on-focusable`, `lang`, `control-has-associated-label` and `anchor-ambiguous-text`.
  - `functional` also rejects `crypto`, `performance`, `globalThis.*` time and random sources, aliases of them, dynamic imports, host-locale formatting and HTTP client imports.
  - `hook-tiers` reads its owners from the plugin, catches a default owner import (`import useSWR from 'swr'`), `window.fetch`/`globalThis.fetch`, computed `React['useEffect']` and `import('axios')`.
  - `fsd` rejects `process.env` outside `shared/config`, config files and scripts.
  - New opt-in `conventions` preset: named exports, top-level function declarations, PascalCase or camelCase file names, boolean names and `await` over `.then()`.

- b0f0d34: Replace the base preset with the latest Antfu flat config and add an opt-in `quality` preset powered by SonarJS. The base entry is now ESM-only and requires Node 22.22.2 or 24.15.0 and later.
- 3d431ce: Strengthen AI lint feedback with type-aware Promise, unsafe-any and unnecessary-condition errors in `strict-types`; require scoped, explained disable comments and reject unused disables in `base`.

  Enable React purity, immutability, refs and static-component errors, promote exhaustive dependencies to errors, and warn about six categories of Web API resource leaks. Keep the public React preset import unchanged while moving its source to ESM.

  Add an opt-in, type-aware `functional` preset for designated pure TypeScript files, with mutation and direct side-effect restrictions plus immutable-contract and reassignment warnings. Ship the functional and React Web API plugins as dependencies; consumers still import the presets they need.

  This is a major release because existing enabled presets report new errors and previously warning-only React dependency violations now fail lint. Consumers of `strict-types` and `functional` need a tsconfig covering their matched files.

### Minor Changes

- 70f97f2: Add an opt-in `ai` preset over `eslint-plugin-ai-guard` for defects coding agents
  produce that still pass the type checker: `.map(async ...)` returning promises instead
  of values (error), plus warnings for a catch that logs and rethrows, `JSON.parse` on a
  request body with no validation, `async` on a function that never awaits, independent
  awaits serialized in a loop, `catch (error: any)`, and Express/Fastify routes with no
  authentication or ownership check.

  Ten of the plugin's eighteen rules ship off. Each restates a judgement another preset
  already makes with more information - `ts/no-floating-promises`,
  `ts/no-unnecessary-condition`, several SonarJS security rules, `no-eval`,
  `unicorn/no-unnecessary-await` and base `no-console` - so one defect
  reports once. A repo that skips `quality` or `strict-types` should turn the matching
  rules back on; the skill documents which.

  `eslint-plugin-ai-guard` is an optional peer, installed only by repos that extend the
  preset.

- 32cee6f: Enforce the frontend-oracle-design contract in lint.

  Nine new local rules. Errors: `require-exact-call-count`, `require-skip-reason`,
  `no-arbitrary-sleep-in-tests`, `no-refetch-in-effect`,
  `no-fetch-in-component`, `require-abort-signal-passthrough`. Warnings:
  `require-effect-annotation`, `no-use-client-above-leaf`. Off by
  default: `scenario-test-filename`.

  The `local-rules` preset lists each rule's severity explicitly: certain defects are errors,
  judgement calls are warnings, and adding a rule to the plugin never switches it on silently.

  New presets: `testing` (Vitest + Testing Library on `*.test.*`, Playwright on `e2e/**`) and
  `query` (TanStack Query).

- 5275313: Add an opt-in `design` preset over `@deslint/eslint-plugin` for the axis the other
  presets leave alone: markup that escapes the design system. Arbitrary colors, spacing,
  typography, radii, z-index and layout numbers fail, as do a secret env var or a
  server-only module reaching a `'use client'` file and placeholder or mock code shipped
  as product code. Dark-mode and breakpoint coverage, spacing rhythm, palette size,
  inline styles and utility-class count warn, because the theme cannot decide those alone.

  Its accessibility, security and Tailwind-correctness rules ship off - `a11y`, `quality`,
  `tailwind` and `local-rules` already decide the same questions - and the preset names
  the owner beside each one.

  `@deslint/eslint-plugin` is an optional peer and ESM-only, so the preset file is
  `design.mjs`; the public import is `@lodado/eslint-config/design`. Enable it only where
  the Tailwind theme really defines the scale an arbitrary value is escaping.

- 32cee6f: Enforce the FSD boundary contract in lint.

  Three new local rules, all `recommended: false` (off in the `local-rules` preset):
  `fsd-no-deep-import` (consume slice public APIs — index.ts / index.server.ts /
  api/server, `@x` allowed), `fsd-no-banned-segments` (no components/hooks/utils
  folders inside slices), `fsd-no-driver-outside-repository` (DB driver/ORM imports
  only in db infrastructure and _.repository._ modules; configurable drivers/allow).

  New `fsd` preset (`@lodado/eslint-config/fsd`) turns all three on as errors — the
  deliberate opt-in for FSD repos.

- f6a77a4: Add the opt-in `hook-tiers` preset. It reads each file's tier from its path: UI imports domain hooks through their folder entry, a domain hook composes micro-hooks and pure functions without effects or direct state-owner and API access, and a micro-hook connects at most one state owner. A domain with a single owner may skip the micro-hook folder. `hookTiers({ owners, strict })` extends the owner list and, next to the strict profile, adds only tier placement so each defect reports once.

  `no-complex-ternary` no longer reports nested ternaries: base `no-nested-ternary` already does, so a nested ternary now reports once.

- 8550a23: Add `interaction-hover-needs-focus`: an interactive element that styles `hover:` but nothing for
  focus leaves keyboard users with no feedback, and jsx-a11y only checks handlers, never styles. It
  reads the class list through `cn`/`clsx`, template literals and ternaries, and ships on as a warning.

  `interaction-pattern-contract` ships `recommended: false`: it judges a whole WAI-ARIA pattern rather
  than a single defect. Repos that want that scrutiny extend the new `@lodado/eslint-config/interaction`
  preset, the same opt-in shape the FSD rules already use.

- a7e297a: Add `no-derived-state-member` — do not enumerate derived states as union members.

  Two members of a `status` / `phase` / `state` union that carry the same fields differ only by
  their tag (`{ status: 'ready'; page }` next to `{ status: 'paging'; page }`), so the tag is
  encoding one flag — in flight, failed, empty — that the query, the data, or the input already
  holds. The rule reports the later member and names the sibling it duplicates. Members with no
  fields (`idle` next to `loading`) and `type` / `kind` variant unions are not reported. It ships as
  a warning through the `local-rules` preset.

- 645a6d0: Add `no-action-in-state` — keep client state data-only.

  Storing an action inside a state value (`{ status: 'failure', retry: () => load() }`)
  freezes the closure of the render that set it and forces every actionless state to carry a
  fake `retry: () => undefined`. The rule reports both shapes: a function-typed field in a
  union member keyed by a `status` / `phase` / `state` discriminant, and an action property in
  an object literal that carries a string-literal discriminant. It ships as a warning through
  the `local-rules` preset, so repos with their own convention can turn it off.

- 87e9f0f: Add an opt-in strict architecture profile for declared FSD roots and rendering modules. Source-aware runtime checks reject direct React primitives, Query/store orchestration, and transport ownership outside approved roles. Configured public entries enforce layer, slice, server, test, and workspace boundaries.

  Ship a coverage-checking CLI, consumer examples, regression fixtures, and packed-package tests. Existing presets do not enable the new architecture rules automatically.

### Patch Changes

- Updated dependencies [32cee6f]
- Updated dependencies [ab6348c]
- Updated dependencies [32cee6f]
- Updated dependencies [73efe85]
- Updated dependencies [f6a77a4]
- Updated dependencies [77c48ec]
- Updated dependencies [8550a23]
- Updated dependencies [b4681e8]
- Updated dependencies [73efe85]
- Updated dependencies [a7e297a]
- Updated dependencies [fe50613]
- Updated dependencies [645a6d0]
- Updated dependencies [87e9f0f]
  - @lodado/eslint-plugin-local-rules@0.1.0
