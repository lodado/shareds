---
type: regex
target: { source: file, path: '.ai/oracles/orders-cursor-paging/oracle.md' }
match: contains
flags: m
weight: 1
---

(?<![\s\S])(?=[\s\S]*^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5}).*×[ \t]?\d)(?![\s\S]*^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5})(?!.*×[ \t]?\d))(?![\s\S]*^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5}).*\|[ \t]*(?:—|–|-|N\/?A)?[ \t]*\|[^|\n]*×[ \t]?\d)
