# Strict architecture profile

`@lodado/eslint-config/strict` is an opt-in policy for declared source roots. The base, React, Next, FSD and local-rules presets do not activate the two new architecture rules automatically.

The implementation rejects misplaced runtime ownership; it does not judge whether a domain boundary is a good design. No application migration, publication or remote protection change is included.

## Consumer configuration

The runnable example is in `examples/strict`. Copy its configuration into an existing consumer with the package peers, TypeScript, React and React types installed. Adjust the roots and exact role paths to that application's owners. The example has no Query runtime dependency.

```js
// strict-policy.mjs
import { fileURLToPath } from 'node:url'

export default {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
  roots: [{ path: 'src', layers: { views: 'pages' } }],
  rendering: ['src/**/ui/**/*.{ts,tsx}'],
  viewHooks: ['src/features/users/ui/useFocus.ts'],
  server: ['src/app/page.tsx', 'src/app/api/**/route.ts'],
  reasons: { viewHooks: 'DOM-only focus lifecycle', server: 'Approved Next server execution owners' },
  modules: [
    { source: 'zustand', exports: ['create', 'useStore'], kind: 'store' },
    { source: 'react-hook-form', exports: ['useForm', 'useFormContext'], kind: 'orchestration' },
    { source: 'next/navigation', exports: ['useRouter', 'useSearchParams'], kind: 'orchestration' },
  ],
}
```

```js
// eslint.config.mjs
import base from '@lodado/eslint-config'
import strict from '@lodado/eslint-config/strict'
import policy from './strict-policy.mjs'

export default [...base, ...strict(policy)]
```

For the UI → domain hook → micro-hook tiers inside `model`, append `...hookTiers({ strict: true })` from `@lodado/eslint-config/hook-tiers`. Strict keeps the UI runtime checks, and its default modules include every hook-tiers owner (state owners by their owner API, so a `Provider` stays allowed) and every transport client; hook-tiers adds only tier placement, so each defect reports once.

```json
{
  "name": "strict-consumer-example",
  "private": true,
  "type": "module",
  "scripts": {
    "lint:code": "eslint src",
    "check:architecture": "lodado-check-architecture strict-policy.mjs",
    "typecheck": "tsc --noEmit",
    "check": "pnpm lint:code && pnpm check:architecture && pnpm typecheck"
  }
}
```

Use the example's `tsconfig.json` as a starting point, retaining the application's actual TS paths and project includes. The factory preserves the parser supplied by the base configuration and supplies the declared project to typed rules. The package uses ESLint's flat-config API; it does not invoke a global or freshly downloaded linter.

`roots[].layers` maps physical directory names to canonical FSD layers, for example `{ views: 'pages', _pages: 'pages', _app: 'app' }`. `roots[].groups` declares one-level slice groups, for example `{ features: ['checkout'] }`. TypeScript's resolver reads aliases from `tsconfig`; there is no implicit `@/` stripping. Declare each application/package root separately.

Optional contracts:

```js
{
  sharedRuntime: ['src/shared/lib/browser/useResize.ts'],
  reasons: { sharedRuntime: 'Shared browser resize lifecycle owner' },
  reactAllow: [{
    files: ['src/features/users/ui/Label.tsx'],
    exports: ['useId'],
    reason: 'Accessible label identity; no workflow state',
  }],
  publicEntries: [
    { file: 'src/shared/ui/button/index.ts', reason: 'Small UI primitive API' },
    { file: 'src/entities/user/index.server.ts', kind: 'server', reason: 'Server-only contract' },
    { file: 'src/entities/user/testing.ts', kind: 'test', reason: 'Test-only contract' },
    { file: 'packages/data/src/entities/user/index.ts', consumers: ['src'], reason: 'Workspace data contract' },
  ],
  crossImports: [{
    from: 'src/entities/order',
    to: 'src/entities/user/@x/order.ts',
    reason: 'Approved entity identity relationship',
  }],
}
```

Merge `reasons` with the main policy. Public entry files and `@x` paths are exact existing files, including extensions. `consumers` lists source-root paths, not layer names. A declared small Shared entry also protects private files beneath its directory from outside importers. Shared is unsliced; it is not forced into one `shared/index.ts`.

The factory rejects empty rendering/roots arrays and requires reasons for role exceptions. The architecture CLI checks every source file under each root, including untracked files. It rejects ignored files, excluded directories inside source roots, unmatched rendering globs, unchecked source symlinks, weakened hard-rule severity/options and inline-config re-enablement. `eslint-disable` cannot remove a strict violation.

CLI exit codes: `0` means all discovered files passed; `1` means lint violations; `2` means configuration, coverage, parser or execution failure. The CLI checks coverage before linting. Ordinary `eslint .` alone does not run that preflight.

## Ownership and scope

These are this repository's strict policies, not universal FSD or React prohibitions:

- `model` owns domain state, workflow, query keys/options and hooks connecting that work. Pure domain rules may remain there.
- `ui` owns views, styles, accessibility and presentation-only hooks. Rendering obtains workflow through model hooks, not raw API imports.
- `api` owns ordinary request functions, transport and DTO conversion. Request functions do not have to become hooks.
- `lib` contains helpers belonging to its owner; reuse alone does not justify moving domain state to Shared.

Within strict roots, React primitive ownership is limited to model hooks, explicitly approved view hooks/shared runtime, or exact `reactAllow` exports. Rendering files cannot bypass this by renaming or moving into `lib`. JSX/React element implementations in model/api fail; type annotations containing `ReactNode` do not count as rendering. Views moved into unapproved helper directories also fail. Custom hooks are not forbidden merely because their names start with `use`.

Approved presentation hooks may own React lifecycle but not Query, transport or domain-store access. Shared and `use*.ts` are not automatically exempt. Next server owners are declared separately; a `use client` directive revokes their server exemption. Actual Next/server-only build checks remain the consuming application's responsibility.

The import policy enforces lower-layer direction, sibling isolation even through public APIs, private deep imports, own-barrel imports, configured cross-root contracts, named public exports, immediate slice segments and required public entries. Nested `model/components` folders and conventional `__test__`/`__mocks__` paths are not banned. Type imports follow declared FSD direction, including model-to-view and server/test entry restrictions. Only approved entities consumers may use an exact `@x` entry with named exports.

## Audit and minimum changes

| Area                           | Existing owner and scope                                                                                                  | Existing tests                                        | Gap and result                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base/quality/functional        | `index.mjs`, `quality.js`, `functional.mjs`; separately composed presets                                                  | `test.js`, `feedback.test.mjs`, `functional.test.mjs` | Existing support retained. No new length/count/props heuristics. `no-nested-ternary` remains covered by the existing feedback suite.                                                                                                                                                                               |
| React/Next                     | `react.mjs`, `next.js`; compiler and lifecycle diagnostics                                                                | `feedback.test.mjs`                                   | Reused. Strict raises resource cleanup to error only inside selected roots.                                                                                                                                                                                                                                        |
| Query                          | `query.js`; installed recommended rules                                                                                   | config tests                                          | Supplemented with real model-hook violations and a passing UI→model→API chain.                                                                                                                                                                                                                                     |
| Typed safety                   | `strict-types.js`; TS project-aware Promise/unsafe rules                                                                  | `feedback.test.mjs`                                   | Reused with the consumer's project; void-only Promise suppression remains an error.                                                                                                                                                                                                                                |
| Local registration             | `rules/index.js`, explicit `local-rules.js` map                                                                           | plugin `test.js`                                      | New rules use `recommended: false`; defaults unchanged. TypeScript moves from a development dependency to runtime because the published resolver uses it.                                                                                                                                                          |
| Folder-name FSD                | `fsd-layer-direction`, `fsd-no-banned-segments`, `fsd-no-deep-import`, `fsd-no-driver-outside-repository`, `lib/fsd-path` | plugin `test.js`, `strict.test.mjs`                   | The `fsd` preset reads layers from cwd-relative folder names. Inside strict roots `fsd-strict-boundaries` owns direction, public API and segments: strict turns the folder-name rules off there, and `verifyStrictProject` fails if a later `fsd` spread turns them back on. Spread `fsd` before `strict(policy)`. |
| Resolution                     | Existing FSD path helpers are not a complete resolver                                                                     | legacy plugin tests                                   | New strict helper reuses installed TypeScript resolution for paths/extensions/index/workspace exports, canonical cwd paths, configured aliases/groups and Windows separators.                                                                                                                                      |
| Runtime ownership              | No existing source/scope-aware UI ownership rule                                                                          | none                                                  | New `strict-ui-boundary` follows finite import/alias/re-export syntax. It does not autofix hook extraction or file moves.                                                                                                                                                                                          |
| Cycles/transitive environments | No complete dependency-cycle or client-graph checker found in the inspected presets                                       | none                                                  | Outside this change. Consumer dependency/build checks are still required; direct-import lint does not prove transitive safety.                                                                                                                                                                                     |
| Oracle                         | Canonical FSD/architecture/authoring references and existing `hook-encapsulation` label                                   | graph/bundle/workflow tests                           | Minimal links to approved targets, config source, preset and actual commands; no new execution platform.                                                                                                                                                                                                           |

## Packages and executable rule specification

Local verification used Node 26.7.0, pnpm 9.0.6, ESLint 10.11.0, TypeScript 5.9.3 and typescript-eslint 8.70.0. The package requires Node `^22.22.2 || >=24.15.0` and ESLint `^10.0.0`. The installed Next lint plugin is 16.3.5; this is not evidence of an application's Next runtime version. React type fixtures use `@types/react` 19.3.0. No Next build was executed.

All hard rules below run at **error** within the declared roots. Typed rules apply to TS/TSX/MTS/CTS with the real project. Central role/export exceptions affect the local ownership rule, not Rules of Hooks. No `--max-warnings 0` is added.

| Candidate / actual version                                                             | Actual IDs and disposition                                                                                                                                                                                                                                                                                                                                                | Executed evidence                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint-plugin-use-encapsulation` 1.3.1, isolated audit                                | `use-encapsulation/prefer-custom-hooks`, not adopted. Source-unaware name matching misses aliases/hidden hooks and flags unrelated same-named locals. Replaced by the local ownership rule.                                                                                                                                                                               | Isolated probes: direct hooks fail; alias/hidden-hook bypass and local-name false positive reproduced. Not a package dependency.                                                                                                                                    |
| `eslint-plugin-react-hooks` 7.1.1                                                      | `react-hooks/rules-of-hooks`, `exhaustive-deps`, `set-state-in-effect`, `set-state-in-render`, `purity`, `immutability`, `refs`, `static-components`: reused, error.                                                                                                                                                                                                      | `strict.test.mjs` executes a violation for each; normal model/custom hook, initial editing draft and cleanup fixtures pass.                                                                                                                                         |
| `eslint-plugin-react-you-might-not-need-an-effect` 1.0.2                               | `react-you-might-not-need-an-effect/no-chain-state-updates`, `no-event-handler`, `no-adjust-state-on-prop-change`, `no-reset-all-state-on-prop-change`, `no-pass-live-state-to-parent`, `no-pass-data-to-parent`, `no-external-store-subscription`, `no-initialize-state`: reused, error. `no-derived-state` stays off to avoid duplicating Hooks' `set-state-in-effect`. | Chain/event violations execute in strict consumer; draft and normal external synchronization pass. Other installed strict effect rules are guarded in final config, not each independently mutation-tested.                                                         |
| `eslint-plugin-react-web-api` 5.20.3, provided by `@eslint-react/eslint-plugin` 5.20.3 | `@eslint-react/web-api-no-leaked-event-listener`, `fetch`, `intersection-observer`, `interval`, `resize-observer`, `timeout`: reused, error. No extra web-api package added to config.                                                                                                                                                                                    | Missing cleanup executes for all six; symmetric listener/timer/observer cleanup passes. Fetch transport has a separate ownership check; its leak fixture also violates that ownership.                                                                              |
| `@tanstack/eslint-plugin-query` 5.103.1                                                | `@tanstack/query/exhaustive-deps`, `stable-query-client`, `no-rest-destructuring`, `no-unstable-deps`, `infinite-query-property-order`, `no-void-query-fn`, `mutation-property-order`: recommended rules, error in strict.                                                                                                                                                | First four have real failing model-hook fixtures. Normal query chain passes. The remaining recommended ordering/return rules are config-checked, not individually mutation-tested. Query's test-only ambient declaration is not a runtime-library integration test. |
| `typescript-eslint` 8.70.0                                                             | `ts/no-floating-promises` (`ignoreVoid:false`), `no-misused-promises`, `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`: reused, error. Other existing strict-types rules remain composed.                                                                                                | Each listed rule executes against a typed consumer; handled rejection and unknown narrowing pass. Parser crashes are failures, never expected lint violations.                                                                                                      |
| ESLint 10.11.0 / existing import checks                                                | `no-empty` error with `allowEmptyCatch:false`; existing `no-restricted-imports`, `no-restricted-globals`, `no-restricted-syntax` options preserved.                                                                                                                                                                                                                       | Empty catch fails; options preservation, later weakening and source disable fixtures execute. Error fallback semantics still require review.                                                                                                                        |
| `@lodado/eslint-plugin-local-rules` workspace                                          | `@lodado/local-rules/strict-ui-boundary`, `@lodado/local-rules/fsd-strict-boundaries`: new, error, strict only. Existing FSD rules are not silently replaced globally.                                                                                                                                                                                                    | RuleTester, FSD fixture project, real ESLint consumer, and packed CLI tests cover the boundaries below.                                                                                                                                                             |
| Steiger 0.6.0 + `@feature-sliced/steiger-plugin` 0.7.0, isolated audit                 | Not adopted. Separate CLI; actual candidates include `fsd/forbidden-imports`, `no-public-api-sidestep`, `public-api`, `segments-by-purpose`, `no-segments-on-sliced-layers`, `no-segmentless-slices`, `no-layer-public-api`. Duplicates structural checks without covering the runtime policy.                                                                            | Isolated CLI valid=0, sibling alias violation=1, bad config=100. Next RSC/route/test-only semantics are not established by this probe. Heuristics such as insignificant/excessive slicing are not hard gates.                                                       |
| `eslint-plugin-boundaries` 7.2.0, audited candidate                                    | Not adopted: another ownership taxonomy is unnecessary for the implemented contracts.                                                                                                                                                                                                                                                                                     | No adoption or execution claim.                                                                                                                                                                                                                                     |

## Regression and execution evidence

- `strict-ui.test.js`: aliases, namespaces, literal computed access, direct aliases/destructuring, hidden hooks, literal dynamic imports/require, named/star/namespace re-exports, type-only imports, shadowing, view-hook/store exceptions, renamed repository/seed files, misplaced JSX/createElement/cloneElement/JSX-runtime factories and moved helpers. Non-hook React APIs through namespaces pass.
- `fsd-strict.test.js`: directional/sibling/deep/self imports, public wildcard and missing API, exact `@x`, production→test and client-capable→server entries, type dependencies, approved shared entries, TS aliases, extension/index lookup, workspace exports, grouped slices with identical leaf names, multiple roots and Windows separators. Assertions require the intended message ID, error severity, location and no parser fatality.
- `strict.test.mjs`: ten real-consumer suites, typed rules, Hooks/Query/resources/effects, effective config, source suppression, ignores, unmatched roots/globs, untracked/moved files, later overrides and CLI 0/1/2. No test treats an ignored or parser-error fixture as a lint success.
- `strict-example.test.mjs`: copies the shipped example, then executes code lint, architecture CLI and `tsc --noEmit`; all exit 0 using real React type declarations and without fake Query declarations. This is static validation, not execution of a React runtime.
- `strict-distribution.test.mjs`: packs both packages, resolves the packed plugin from the packed config, checks shipped artifacts, and runs actual strict violations (exit 1) and a clean consumer (exit 0). It does not substitute a `no-undef` failure for the architecture contract.

Commands wired into package scripts and CI:

```sh
pnpm --filter @lodado/eslint-plugin-local-rules test
pnpm --filter @lodado/eslint-plugin-local-rules lint
pnpm --filter @lodado/eslint-config test
pnpm --filter @lodado/eslint-config lint
pnpm check:architecture
pnpm --filter @lodado/frontend-oracle-design-plugin test
pnpm --filter @lodado/frontend-oracle-design-plugin bundles:check
pnpm --filter @lodado/frontend-oracle-design-plugin workflow-docs:check
```

The two lint packages and their strict fixtures passed locally, including plugin example typechecking. Oracle tests passed 476/476; bundle/workflow/eval generation checks passed. Broad workspace lint completed with 0 errors and advisory warnings only (257 in Oracle, 46 in UX flow, 6 in the ESLint config package). Root Knip and jscpd passed; the existing clone baseline was unchanged.

`.github/workflows/test-reusable.yml`, called by the integrated push/PR workflow, now pins pnpm 9.0.6, uses the frozen lockfile and runs `pnpm check:architecture` before broad lint. Broad lint/quality failures remain visible and their exit codes are not swallowed. `hook-encapsulation` is Oracle's existing evidence label, not a new GitHub status check. Remote required checks, branch protection and CODEOWNERS were not changed or verified through the hosting API.

## Static limits

Re-export traversal is bounded to 64 visited entries per resolution. Literal paths and direct bindings are supported; arbitrary computed properties, reflection, dynamic dispatch, wrapper call graphs and generated code are not. TS resolution does not establish runtime bundler condition selection or all transitive client/server edges. Cycle analysis and a real Next/server-only build remain separate consumer checks.

Selected source roots are protected, not every file in a repository. Changing policy/config/ignore/CI can change enforcement; review those files as part of the architecture contract. ESLint is not a security sandbox or a pre-write interceptor. Domain ownership, legitimate recovery, edit-draft conflict policy and external lifetime ownership still require architectural review. A passing linter does not prove UX quality or skill completion.

This work does not opt any user application into strict mode. The consumer must select the profile and required CI command with its actual roots, runtime APIs, public entries and narrow exceptions. No remote changes, commit, push or publish were performed.

## References

- [React Hooks lint rules](https://react.dev/reference/eslint-plugin-react-hooks)
- [FSD layers](https://feature-sliced.design/docs/reference/layers), [segments](https://feature-sliced.design/docs/reference/slices-segments), [public API](https://feature-sliced.design/docs/reference/public-api), [Next integration](https://feature-sliced.design/docs/guides/tech/with-nextjs)
- [use-encapsulation 1.3.1 source](https://github.com/kyleshevlin/eslint-plugin-use-encapsulation/tree/v1.3.1)
- [Steiger](https://github.com/feature-sliced/steiger) and [boundaries](https://www.jsboundaries.dev/docs/quick-start/)
- [Flat config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Floating promises](https://typescript-eslint.io/rules/no-floating-promises/), [misused promises](https://typescript-eslint.io/rules/no-misused-promises/)
- [TanStack Query ESLint](https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query)
