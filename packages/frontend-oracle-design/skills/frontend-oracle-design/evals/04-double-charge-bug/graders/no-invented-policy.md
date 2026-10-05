---
type: llm
focus: last_message
weight: 1
---

The user's prompt is the only approved source of product policy in this run; there is no repo, spec, or design file in the working directory. Regex graders already check that every contract row cites `S<n>` or `Q<n>` and that each Open question offers options with one recommendation. Judge only what they cannot: whether an `S1` citation is honest.

The prompt, verbatim (you see the agent output, not the conversation, so judge against this):

> 결제 페이지에서 Pay 버튼을 더블클릭하면 카드가 두 번 결제된다는 CS 티켓이 이번 주에만 3건 들어왔어. 고쳐줘. 참고로 서버는 idempotency key를 받지 않아.

List every contract row, policy line, and plain statement of fact whose only source is `S1` (or the request), or that cites no source at all. For each, decide whether the prompt text actually states that behaviour, number, threshold, or timing. A row whose source includes a `Q<n>` is out of scope.

Not inventions: values the prompt itself gave; observations that follow necessarily from the prompt (for example "a pending indicator is shown while the request is in flight" when the prompt asked for a progress indicator); non-goals and "out of scope" statements; the `Risk:` line and its worst regression, which the format requires as an assessment; candidate axis values and Open question options, which are proposals awaiting `yes`.

PASS if every listed item is stated by the prompt. FAIL if any is not, and quote it.
