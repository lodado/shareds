---
type: regex
target: { source: file, path: '.ai/oracles/tenant-data-view/oracle.md' }
match: contains
flags: mi
weight: 0.5
---

(?<![\s\S])(?=[\s\S]*^.*(?:case[ -]?space|case 공간|케이스 공간|dimensions?).*(?:\n.+){0,2}?[^\s×]\s*×\s*[^\s×])(?=[\s\S]*^[ \t]*(?:[-*]|\d+\.)(?: |\t).*×.*(?:→|->|:)(?: |\t)*\**(?:covered|impossible|needs-decision|deviation|excluded|N\/A))
