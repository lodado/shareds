---
type: llm
focus: last_message
weight: 1
---
The prompt reports duplicate card charges when the Pay button is double-clicked, asks for a fix, and states that the server does not accept an idempotency key. There is no repo in the working directory. Check the Draft Oracle in the response.

PASS only if all hold:
1. The Draft treats repeated activation of the pay action as one dimension covering a second click, an Enter or keyboard repeat, and a double-tap (or an equivalent phrasing of "any second activation while the first is pending"), and at least one contract row has a Never that names a second charge or payment request.
2. The Draft raises the unknown-outcome case as an Open question rather than deciding it: what happens when the request was sent but no response arrived (timeout, network drop, tab closed). It must not silently write "retry" or "treat as failed and allow resubmit" as a settled row.
3. The Draft does not assume server-side deduplication or an idempotency key exists; if it recommends adding one, that is an Open question or a non-goal, not a row the client depends on.
4. The Draft classifies this as a payment / High-risk change, or otherwise says the cost of a false pass is a real double charge.

FAIL if any of the four is missing; say which and quote the text.
