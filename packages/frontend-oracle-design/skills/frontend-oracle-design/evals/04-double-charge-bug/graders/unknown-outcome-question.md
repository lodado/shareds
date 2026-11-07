---
type: regex
target: { source: file, path: '.ai/oracles/pay-double-charge/SPEC.md' }
match: contains
flags: mi
weight: 1
---

^[ \t]*-[ \t]*Q\d+[ \t]*:.*(?:unknown|time ?out|타임아웃|불명|유실|응답 없|응답이 없|no response|network)
