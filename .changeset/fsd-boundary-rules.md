---
'@lodado/eslint-plugin-local-rules': minor
'@lodado/eslint-config': minor
---

Enforce the FSD boundary contract in lint.

Three new local rules, all `recommended: false` (off in the `local-rules` preset):
`fsd-no-deep-import` (consume slice public APIs — index.ts / index.server.ts /
api/server, `@x` allowed), `fsd-no-banned-segments` (no components/hooks/utils
folders inside slices), `fsd-no-driver-outside-repository` (DB driver/ORM imports
only in db infrastructure and _.repository._ modules; configurable drivers/allow).

New `fsd` preset (`@lodado/eslint-config/fsd`) turns all three on as errors — the
deliberate opt-in for FSD repos.
