---
type: llm
focus: last_message
weight: 1
---
The text is a Draft Oracle for a frontend change, awaiting the user's approval. It may be written in Korean or English. Check each claim against the text. PASS only if all four hold; otherwise FAIL and name the first claim that fails, quoting the text.

1. Contract rows exist. There is at least one table of contract rows where every row has a Given, a When, a Then, and a non-empty Never (the outcome that must not happen), plus a side-effect count (for example "POST×1" or "결제 요청×1"). A row with an empty Never or no side-effect count fails this claim.
2. Every unresolved decision is an Open question with choices. Each policy the prompt did not settle appears as a numbered Open question (Q1, Q2, ...) that lists at least two concrete options and marks exactly one as recommended. An Open question with no options, or with options but no recommendation, fails this claim.
3. Boundaries are enumerated, not just the happy path. The text declares the dimensions of the case space (what varies: request state, ordering, repeats, data availability, and so on) and contains an interaction sweep, deviation list, or landmine list that dispositions combinations of those dimensions. A Draft that only lists success and one error case fails this claim.
4. Sources are real. Each contract row and each policy line cites a source, and every cited source is either the user's prompt text or an Open question (a tag such as `(source: Q3 — recommended)` is an Open question source). A source that is a guess about what the user wants, current code behaviour, or an unnamed "spec" fails this claim.
