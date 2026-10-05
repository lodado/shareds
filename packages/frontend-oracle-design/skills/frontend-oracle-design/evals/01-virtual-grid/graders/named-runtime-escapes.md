---
type: regex
target: { source: file, path: '.ai/oracles/store-list-virtualization/oracle.md' }
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*^(?=.*(?:StrictMode|double[- ](?:mount|invoke)|이중 (?:마운트|실행)))(?=.*(?:timer|타이머|pending|append|batch|배치)).*$)(?=[\s\S]*^(?=.*(?:remount|리마운트))(?=.*(?:scroll|스크롤|initialOffset|scrollMargin)).*$)(?=[\s\S]*^(?=.*ResizeObserver)(?=.*(?:default|기본|first measure|첫 측정|before|전에|이전)).*$)
