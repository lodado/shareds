---
type: llm
focus: {source: file, path: ".ai/oracles/tenant-data-view/oracle.md"}
weight: 1
---
The Draft must say how the race-safety claim would be proven, not only claim it. Check the verification design in the response.

PASS only if all hold:
1. The request-reversal path (a later request completing before an earlier one) and the tenant/placeholder path are each connected to a real consumer (a named hook, component, or query owner), to a controllable boundary (a fetcher or deferred response the test holds open), to an observable completion barrier (what the test waits for after the late response is processed), and to exact assertions about what data is visible and which requests were sent.
2. When completion order has two or more possibilities, the Draft plans ordering evidence and says it is future or planned evidence, not something that has already run. A plan that holds two responses deferred and releases them in each order (earlier-first and later-first) counts as hand-enumerated ordering evidence; property-based generation is not required.
3. The response does not claim that any frame, card, or test was approved, executed, or passed. Planned examples are labelled as planned.

FAIL if any of the three is missing; say which.
