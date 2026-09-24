---
'@lodado/eslint-plugin-local-rules': minor
'@lodado/eslint-config': minor
---

Enforce the frontend-oracle-design contract in lint.

Nine new local rules. Errors: `require-exact-call-count`, `require-skip-reason`,
`no-arbitrary-sleep-in-tests`, `no-refetch-in-effect`,
`no-fetch-in-component`, `require-abort-signal-passthrough`. Warnings:
`require-effect-annotation`, `no-use-client-above-leaf`. Off by
default: `scenario-test-filename`.

The `local-rules` preset lists each rule's severity explicitly: certain defects are errors,
judgement calls are warnings, and adding a rule to the plugin never switches it on silently.

New presets: `testing` (Vitest + Testing Library on `*.test.*`, Playwright on `e2e/**`) and
`query` (TanStack Query).
