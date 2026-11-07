---
type: regex
target: { source: file, path: '.ai/oracles/checkout-age-gate/SPEC.md' }
match: not_contains
flags: m
weight: 1
---

^[ \t]*-[ \t]*R\d+[ \t]*:(?!.*\b[SC]\d+\b).*$
