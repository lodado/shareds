---
type: llm
focus: last_message
weight: 1
---

The prompt says the server does not accept an idempotency key. Regex graders already check the repeat-activation dimension, the second-charge Never, the unknown-outcome Open question, and the High risk lane header. Judge only this:

PASS if the response never relies on server-side deduplication or an idempotency key existing. Recommending that one be added, raising it as an Open question, or listing it as a non-goal is fine.

FAIL if any contract row, policy line, or plan step depends on the server rejecting or deduplicating a second charge; quote it.
