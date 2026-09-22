---
type: llm
focus: {source: file, path: ".ai/oracles/store-list-virtualization/oracle.md"}
weight: 1
---
When the filter changes in this list, the query key changes. Whether the user sees a Suspense fallback (empty list or skeleton) or the previous list kept on screen until the new data arrives is a product decision the prompt does not settle.

PASS if the Draft Oracle raises this as an Open question or a needs-decision cell: it asks what the user sees during a filter switch and offers at least the two options (fallback shown versus previous list kept, or an equivalent pair).

FAIL if the Draft (a) silently assumes one behaviour as a contract row without an Open question, (b) marks the loading state during a filter switch as N/A, out of scope, or "owned outside this card", or (c) does not mention what is visible during a filter switch at all. Quote the relevant text either way.
