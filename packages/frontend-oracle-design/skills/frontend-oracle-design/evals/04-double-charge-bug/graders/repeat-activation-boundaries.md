---
type: regex
target: { source: file, path: '.ai/oracles/pay-double-charge/SPEC.md' }
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*(?:double[- ]?click|더블클릭|두 번 클릭|연속 클릭))(?=[\s\S]*\bEnter\b)(?=[\s\S]*(?:\btap\b|탭|\bSpace\b|스페이스))(?=[\s\S]*^[ \t]*-[ \t]*R\d+[ \t]*:.*(?:second|duplicate|double|another|추가|두 번째|중복|이중|2회|한 번만|1회).*(?:charge|POST|request|payment|결제|요청))
