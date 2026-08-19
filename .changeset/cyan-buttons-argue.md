---
'@lodado/eslint-plugin-local-rules': minor
'@lodado/eslint-config': minor
---

Enforce the frontend-oracle-design contract in lint.

Eleven new local rules. Errors: `require-exact-call-count`, `require-skip-reason`,
`no-arbitrary-sleep-in-tests`, `no-css-locator-without-reason`, `no-refetch-in-effect`,
`no-fetch-in-component`, `require-abort-signal-passthrough`. Warnings:
`require-effect-annotation`, `no-use-client-above-leaf`, `no-derived-state-effect`. Off by
default: `scenario-test-filename`.

The `local-rules` preset now reads each rule's `meta.docs.recommended` for severity
(`false` -> off, `'warn'` -> warn, otherwise error) instead of switching everything on as an error.

New presets: `testing` (Vitest + Testing Library on `*.test.*`, Playwright on `e2e/**`) and
`query` (TanStack Query).
