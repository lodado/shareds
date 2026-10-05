---
type: llm
focus: { source: file, path: '.ai/oracles/orders-cursor-paging/oracle.md' }
weight: 1
---

A previous implementation of this cursor-paged TanStack Query table went wrong by storing a client-side status that restated the query's own lifecycle. A regex grader already checks that `isFetching`, the row count, and a cursor-bearing query key are named, and that no union pairs `paging` / `pageError` / `firstLoad` / `firstError` with `ready` / `success`. Judge only this:

PASS if every screen the prompt describes (initial load, in-page progress, page-move failure, initial failure, the two empty states) is a render branch computed from the query's fields, the row count, and whether a filter is applied. A screen-name literal union computed at render time is fine.

FAIL if the card declares stored state (a `useState`, store field, reducer, or a type the component keeps between renders) whose values duplicate the query's status, fetching flag, error, or emptiness; quote it.
