---
type: llm
focus: last_message
weight: 1
---
The response is the final chat message of a run that produced a Draft Oracle (the full card may live in a file). Check how it ends.

PASS if the message asks the user for one confirmation in which a bare "yes" adopts every recommendation and approves the card. Offering `Q<n>=<option>` to swap a single recommendation is fine. Asking the user to supply one value the card explicitly refuses to invent (a duration, a threshold) alongside "yes" is also fine.

FAIL if the message does any of these: asks the user to compose answers freeform instead of choosing; asks for a code path, repository, or file before it will present the card for confirmation; ends with a status report and no confirmation request; or asks its questions before showing the Draft rather than inside it.
