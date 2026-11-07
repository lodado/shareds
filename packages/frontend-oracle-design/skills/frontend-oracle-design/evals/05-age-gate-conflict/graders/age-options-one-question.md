---
type: regex
target: { source: file, path: '.ai/oracles/checkout-age-gate/SPEC.md' }
match: contains
flags: m
weight: 1
---

^[ \t]*-[ \t]*Q\d+[ \t]*:(?=.*\b18\b)(?=.*\b19\b)
