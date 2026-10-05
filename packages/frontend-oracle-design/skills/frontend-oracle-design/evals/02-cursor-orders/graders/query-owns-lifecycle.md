---
type: regex
target: { source: file, path: '.ai/oracles/orders-cursor-paging/oracle.md' }
match: contains
flags: mi
weight: 1
---

(?<![\s\S])(?=[\s\S]*\bisFetching\b)(?=[\s\S]*(?:cursor.{0,60}(?:query ?key|쿼리 ?키)|(?:query ?key|쿼리 ?키).{0,60}cursor))(?=[\s\S]*(?:row count|rows?\.length|data\.length|건수|행 수|0건))(?![\s\S]*['"](?:paging|pageError|firstLoad|firstError)(?:'|").*['"](?:ready|success)(?:'|"))(?![\s\S]*['"](?:ready|success)(?:'|").*['"](?:paging|pageError|firstLoad|firstError)(?:'|"))
