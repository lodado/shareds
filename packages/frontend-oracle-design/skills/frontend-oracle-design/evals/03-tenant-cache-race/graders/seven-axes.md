---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/SPEC.md' }
match: contains
flags: m
weight: 1
---

(?<![\s\S])(?=[\s\S]*^\|[ \t]*Data[ \t]*\|[^|\n]*\S[^|\n]*\|)(?=[\s\S]*^\|[ \t]*Value[ \t]*\|[^|\n]*\S[^|\n]*\|)(?=[\s\S]*^\|[ \t]*Async[ \t]*\|[^|\n]*\S[^|\n]*\|)(?=[\s\S]*^\|[ \t]*Order[ \t]*\|[^|\n]*\S[^|\n]*\|)(?=[\s\S]*^\|[ \t]*Entry[ \t]*\|[^|\n]*\S[^|\n]*\|)(?=[\s\S]*^\|[ \t]*Environment[ \t]*\|[^|\n]*\S[^|\n]*\|)(?=[\s\S]*^\|[ \t]*Platform[ \t]*\|[^|\n]*\S[^|\n]*\|)
