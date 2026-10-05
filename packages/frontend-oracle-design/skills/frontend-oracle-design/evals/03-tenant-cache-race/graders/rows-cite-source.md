---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/oracle.md' }
match: not_contains
flags: m
weight: 1
---

^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5})(?!.*\b[SQ]\d+\b).*$
