---
type: regex
target: last_message
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*저장)(?![\s\S]*^.*(?:\brisk\b|approv|polic(?:y|ies)|side[- ]effects?|승인|위험|정책|부작용|진행할까요|진행해도).*\?[ \t]*$)
