---
'@lodado/eslint-plugin-local-rules': minor
'@lodado/eslint-config': minor
---

Add `no-derived-state-member` — do not enumerate derived states as union members.

Two members of a `status` / `phase` / `state` union that carry the same fields differ only by
their tag (`{ status: 'ready'; page }` next to `{ status: 'paging'; page }`), so the tag is
encoding one flag — in flight, failed, empty — that the query, the data, or the input already
holds. The rule reports the later member and names the sibling it duplicates. Members with no
fields (`idle` next to `loading`) and `type` / `kind` variant unions are not reported. It ships as
a warning through the `local-rules` preset.
