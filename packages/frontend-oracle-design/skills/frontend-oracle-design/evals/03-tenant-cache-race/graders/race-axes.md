---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/SPEC.md' }
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*tenant)(?=[\s\S]*placeholder)(?=[\s\S]*^\|[ \t]*Order[ \t]*\|.*(?:tenant|테넌트|response|응답|late|늦))
