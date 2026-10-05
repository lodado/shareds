---
type: regex
target: last_message
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?:(?!\b(?:entities|features|shared)\b)(?:\s|\S))*?\b(entities|features|shared)\b(?:(?!\b(?!\1\b)(?:entities|features|shared)\b).)*$(?=[\s\S]*(?:cart|장바구니).{0,60}(?:data|데이터|derive|파생|계산|도메인|entity|엔티티))(?![\s\S]*^.*(?:approv|승인|진행할까요).*\?[ \t]*$)
