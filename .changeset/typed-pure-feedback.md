---
'@lodado/eslint-config': major
---

Strengthen AI lint feedback with type-aware Promise, unsafe-any and unnecessary-condition errors in `strict-types`; require scoped, explained disable comments and reject unused disables in `base`.

Enable React purity, immutability, refs and static-component errors, promote exhaustive dependencies to errors, and warn about six categories of Web API resource leaks. Keep the public React preset import unchanged while moving its source to ESM.

Add an opt-in, type-aware `functional` preset for designated pure TypeScript files, with mutation and direct side-effect restrictions plus immutable-contract and reassignment warnings. Ship the functional and React Web API plugins as dependencies; consumers still import the presets they need.

This is a major release because existing enabled presets report new errors and previously warning-only React dependency violations now fail lint. Consumers of `strict-types` and `functional` need a tsconfig covering their matched files.
