---
type: llm
focus: last_message
weight: 1
---
The user's prompt is the only approved source of product policy in this run; there is no repo, spec, or design file in the working directory. Read the Draft Oracle in the response and list every number, threshold, timing, or behavioural rule that the prompt did not state. Examples: a retry count, a debounce or timeout in milliseconds, a minimum age, a batch size the prompt did not give, what the screen shows during a transition the prompt did not describe, or a claim that a server behaves a certain way.

For each item, decide which of these it is:
(a) written as an option inside an Open question, with the choice left to the user;
(b) explicitly marked as an assumption or recommendation pending the user's "yes", not as an approved row;
(c) stated as a settled contract row, policy line, or fact, with no Open question and no source that is the prompt text.

PASS if there are no items of kind (c). FAIL if any item is of kind (c), and quote it.

Not inventions: values the prompt itself gave (for example "28/20 batches", "18+", "19+"); observations that follow necessarily from the prompt (for example "a pending indicator is shown while the request is in flight" when the prompt asked for a progress indicator); and non-goals or "out of scope" statements.

Card convention: a policy line or contract row whose source cites an Open question, for example `(source: Q4 — recommended)` or `source: Q2`, is provisional and counts as kind (a), even when it sits under a heading such as "Decided policies". Only a policy whose source is neither the prompt text nor an Open question can be kind (c).
