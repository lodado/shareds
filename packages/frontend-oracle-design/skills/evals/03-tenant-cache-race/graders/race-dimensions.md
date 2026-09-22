---
type: llm
focus: {source: file, path: ".ai/oracles/tenant-data-view/oracle.md"}
weight: 1
---
The prompt asks for the first detailed architecture plan for a multi-tenant async data view with query caching and placeholder data. A plan that only lists pending / success / error misses the combinations that actually break. Check the Draft's declared case space or dimension list.

PASS only if all of these are named as dimensions (or explicit axes) and the Draft says which combinations are unreachable or policy-unknown instead of treating every combination as reachable:
1. Tenant or scope (the current tenant versus a previous one, including a switch mid-flight).
2. Data availability for the current key: no data, a cache hit for the current key, and placeholder data carried over from a previous key.
3. Request state (idle / in flight / settled, or equivalent).
4. Completion order when two requests overlap (A then B versus B then A).

FAIL if any of the four is absent, or if the Draft lists them but never says which cells cannot occur or are undecided. Name the missing dimension.
