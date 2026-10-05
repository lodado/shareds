---
type: regex
target: last_message
match: not_contains
flags: m
weight: 1
---

^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5})(?!.*\b[SQ]\d+\b).*$
