---
'@lodado/eslint-config': minor
'@lodado/eslint-plugin-local-rules': minor
---

Add the opt-in `hook-tiers` preset. It reads each file's tier from its path: UI imports domain hooks through their folder entry, a domain hook composes micro-hooks and pure functions without effects or direct state-owner and API access, and a micro-hook connects at most one state owner. A domain with a single owner may skip the micro-hook folder. `hookTiers({ owners, strict })` extends the owner list and, next to the strict profile, adds only tier placement so each defect reports once.

`no-complex-ternary` no longer reports nested ternaries: base `no-nested-ternary` already does, so a nested ternary now reports once.
