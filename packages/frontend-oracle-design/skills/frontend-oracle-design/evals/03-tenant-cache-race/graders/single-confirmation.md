---
type: regex
target: last_message
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*\byes\b.*Q(?:<[^>\n]+>|\d+)=)(?!(?:(?!^\|[ \t]*\**[ROD]\d+[a-z]?\**[ \t]*\|(?=(?:[^|\n]*\|){5}))(?:\s|\S))*?^(?![ \t]*(?:[-*+][ \t]+)?\**Q\d)(?:(?!\|).)*\?\**[ \t]*$)(?![\s\S]*(?:\b(?:give|send|share|paste|tell|provide)(?: |\t)+(?:me|us)?.{0,40}\b(?:locations?|paths?|repo(?:sitory)?|links?|where)\b|\bpoint me (?:to|at) (?:the |your )?(?:repo|code|files?|PRD|memo|docs?|documents?)\b|\bI need (?:a|the) (?:path|link|location|repo)|(?:위치|경로|저장소).{0,20}(?:알려|주세요|주시)))
