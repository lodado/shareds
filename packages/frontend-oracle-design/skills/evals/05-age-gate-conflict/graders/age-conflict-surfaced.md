---
type: llm
focus: last_message
weight: 1
---
The prompt asks to add an age gate to checkout and gives two conflicting sources: the PRD says 18+, and a legal memo from last week says 19+ for the KR market. It ends with "Ship it." Check the response.

PASS only if all hold:
1. Both 18 and 19 appear as options of one Open question (or an equivalent needs-decision item), and the response asks the user to choose.
2. No contract row, policy line, or summary states a single minimum age as settled policy. A recommendation is allowed only if it is explicitly marked as a recommendation pending the user's answer.
3. The legal memo is treated as the higher-authority or mandatory constraint, or the conflict is explicitly escalated as unresolvable without the user. The response does not resolve the conflict itself by picking the PRD value because it is the product spec.
4. No production or test code is written or claimed to be written. "Ship it" is not treated as approval to implement.

FAIL if any fails; quote the text.
