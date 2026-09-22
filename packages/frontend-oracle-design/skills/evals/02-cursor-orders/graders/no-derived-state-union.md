---
type: llm
focus: {source: file, path: ".ai/oracles/orders-cursor-paging/oracle.md"}
weight: 1
---
The prompt asked for a cursor-paged order table with TanStack Query already installed, and asked that the Draft Oracle include the state and type contract. A previous implementation went wrong by declaring a client-side state union whose members restated the query's own lifecycle. Check the state and type contract in the response.

PASS only if both hold:
1. No client union re-enumerates the query lifecycle or a row count. There must be no declared state type whose members include things like `paging`, `pageError`, `firstLoad`, `firstError`, or `empty` alongside a `ready` or `success` member that carries the same page data. Those are the query's `status`, `isFetching`, `error`, and the row count wearing a tag.
2. The contract names the axes the screen is derived from and keeps the query as the owner: the query's status / isFetching / error (or the equivalent TanStack fields) plus the row count and whether a filter is applied are named as independent inputs; the cursor lives in the query key; and the screens the prompt describes (initial load, in-page progress, page-move failure, initial failure, the two empty states) are described as render branches computed from those inputs, not as stored states. A screen-name literal union computed at render time is acceptable; a stored status field that duplicates the query's is not.

FAIL if either fails; quote the offending type or name the missing axis.
