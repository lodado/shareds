---
type: llm
focus: last_message
weight: 1
---
The user asked, for a Feature-Sliced Design project, whether a `useCartTotal` hook belongs in entities, features, or shared, and asked for folder placement only. Check the response.

PASS if the response names exactly one of those layers (or a slice inside one, such as `entities/cart`) as the answer, gives a reason tied to what the hook does (it derives a value from the cart entity's data), and stops there. Mentioning when it would move to another layer is fine.

FAIL if the response gives no single placement, answers with a contract table, Oracle Card, Draft, Open questions, or a lane header, or asks the user to approve anything before answering.
