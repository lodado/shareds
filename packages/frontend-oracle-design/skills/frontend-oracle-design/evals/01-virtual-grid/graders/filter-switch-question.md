---
type: regex
target: { source: file, path: '.ai/oracles/store-list-virtualization/oracle.md' }
match: contains
flags: mi
weight: 1
---

^[ \t]*(?:[-*+][ \t]+|#{2,4}[ \t]+|\|[ \t]*|\d+\.[ \t]+)?\**Q\d+\b(?=(?:(?!^[ \t]*(?:[-*+][ \t]+|#{2,4}[ \t]+|\|[ \t]*|\d+\.[ \t]+)?\**Q\d+\b|^#{1,3}[ \t]|^.*\byes\b)(?:\s|\S))*?(?:filter|필터))(?=(?:(?!^[ \t]*(?:[-*+][ \t]+|#{2,4}[ \t]+|\|[ \t]*|\d+\.[ \t]+)?\**Q\d+\b|^#{1,3}[ \t]|^.*\byes\b)(?:\s|\S))*?(?:suspense|fallback|skeleton|폴백|스켈레톤|빈 목록|empty list))(?=(?:(?!^[ \t]*(?:[-*+][ \t]+|#{2,4}[ \t]+|\|[ \t]*|\d+\.[ \t]+)?\**Q\d+\b|^#{1,3}[ \t]|^.*\byes\b)(?:\s|\S))*?(?:previous|keep|이전|유지))
