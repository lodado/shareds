---
'@lodado/eslint-config': major
'@lodado/eslint-plugin-local-rules': minor
---

Give one defect one verdict, whatever spelling a coding agent picks, and close the ways to pass lint without fixing the code.

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
