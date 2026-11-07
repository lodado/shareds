---
type: llm
focus: { source: file, path: '.ai/oracles/pay-double-charge/SPEC.md' }
weight: 1
---

The user's prompt is the only approved source of product policy in this run; there is no repo, spec, or design file in the working directory. Regex graders already check that every rule `R<n>` cites an `S<n>`/`C<n>` source and that each question `Q<n>` carries a ★ recommendation. Judge only what they cannot: whether an `S1` citation is honest.

The prompt, verbatim (you see the agent output, not the conversation, so judge against this):

> 결제 페이지에서 Pay 버튼을 더블클릭하면 카드가 두 번 결제된다는 CS 티켓이 이번 주에만 3건 들어왔어. 고쳐줘. 참고로 서버는 idempotency key를 받지 않아.
> SPEC은 `.ai/oracles/pay-double-charge/SPEC.md`에 써줘.

List every rule and every 7-axis value in `.ai/oracles/pay-double-charge/SPEC.md` whose only source is `S1` (the request). For each, decide whether the prompt text actually states that behaviour, number, threshold, or timing.

Not inventions: values the prompt itself gave; observations that follow necessarily from the prompt; out-of-scope statements; a `N/A — reason` axis; question options and ★ recommendations, which wait for the user's answer.

PASS if every listed item is stated by the prompt. FAIL if any is not, and quote it.
