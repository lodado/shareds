---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/SPEC.md' }
match: not_contains
flags: m
weight: 1
---

^[ \t]*-[ \t]*Q\d+[ \t]*:(?!.*★)(?! *없음).*$
