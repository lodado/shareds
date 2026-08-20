---
'@lodado/eslint-plugin-local-rules': minor
'@lodado/eslint-config': minor
---

Add `no-action-in-state` — keep client state data-only.

Storing an action inside a state value (`{ status: 'failure', retry: () => load() }`)
freezes the closure of the render that set it and forces every actionless state to carry a
fake `retry: () => undefined`. The rule reports both shapes: a function-typed field in a
union member keyed by a `status` / `phase` / `state` discriminant, and an action property in
an object literal that carries a string-literal discriminant. It ships as a warning through
the `local-rules` preset, so repos with their own convention can turn it off.
