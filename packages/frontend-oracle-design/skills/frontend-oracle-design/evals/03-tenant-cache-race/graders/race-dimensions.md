---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/oracle.md' }
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*^.*(?:axes|case[ -]?space|dimensions).*(?=(?:(?!^#{1,3}[ \t])(?:\s|\S))*?tenant)(?=(?:(?!^#{1,3}[ \t])(?:\s|\S))*?placeholder)(?=(?:(?!^#{1,3}[ \t])(?:\s|\S))*?(?:cache|fresh|stale|absent|no data))(?=(?:(?!^#{1,3}[ \t])(?:\s|\S))*?(?:pending|in[- ]?flight|idle))(?=(?:(?!^#{1,3}[ \t])(?:\s|\S))*?(?:order|inver|reversal)))(?=[\s\S]*(?:(?:→|->|:|=)(?: |\t)*[*\x60]*(?:impossible|unreachable|needs-decision)|\b(?:cannot occur|never reachable)\b))
