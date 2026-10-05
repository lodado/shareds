---
type: regex
target: last_message
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*(?:double[- ]?click|더블클릭|second click|click[ \t]?×[ \t]?2))(?=[\s\S]*\bEnter\b)(?=[\s\S]*(?:\btap\b|탭|\bSpace\b))(?=[\s\S]*^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5}).*(?:second|duplicate|double|another|추가|두 번째|중복|이중|2회).*(?:charge|POST|request|payment|결제|요청))
