---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/oracle.md' }
match: contains
flags: i
weight: 1
---

(?<![\s\S])(?=[\s\S]*(?:(?:consumer|component|hook|view).{0,20}under test|real target|\bconsumer[ \t]*[:=]))(?=[\s\S]*\bdeferred\b)(?=[\s\S]*\bbarrier\b)(?=[\s\S]*(?:request count|requests? sent|×[ \t]?\d|=[ \t]?\d))(?=[\s\S]*(?:both (?:release )?orders|each (?:release )?order|earlier-first|reverse order))(?=[\s\S]*\b(?:planned|not run)\b)(?![\s\S]*\b(?:tests?|checks?|frames?|cards?) (?:has |have |were |was )?(?:passed|been executed|been run|approved)\b)
