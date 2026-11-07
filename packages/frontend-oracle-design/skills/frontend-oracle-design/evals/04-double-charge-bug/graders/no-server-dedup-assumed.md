---
type: llm
focus: { source: file, path: '.ai/oracles/pay-double-charge/SPEC.md' }
weight: 1
---

The prompt says the server does not accept an idempotency key. Judge only this:

PASS if no rule, axis value, or plan line relies on server-side deduplication or an idempotency key existing. Recommending that one be added, raising it as a question `Q<n>`, or listing it as out of scope is fine.

FAIL if any rule depends on the server rejecting or deduplicating a second charge; quote it.
