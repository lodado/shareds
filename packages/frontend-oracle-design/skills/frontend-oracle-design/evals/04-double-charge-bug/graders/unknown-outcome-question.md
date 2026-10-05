---
type: regex
target: last_message
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*^[ \t]*(?:[-*+][ \t]+|#{2,4}[ \t]+|\|[ \t]*|\d+\.[ \t]+)?\**Q\d+\b(?:(?!^[ \t]*(?:[-*+][ \t]+|#{2,4}[ \t]+|\|[ \t]*|\d+\.[ \t]+)?\**Q\d+\b|^#{1,3}[ \t]|^.*\byes\b)(?:\s|\S))*?(?:unknown|time ?out|타임아웃|불명|유실|no response|network drop))(?![\s\S]*^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5})(?=.*(?:unknown|time ?out|타임아웃|불명|유실))(?!.*\bQ\d+\b).*$)
