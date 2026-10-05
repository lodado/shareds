---
type: llm
focus: { source: file, path: '.ai/oracles/orders-cursor-paging/oracle.md' }
weight: 1
---

The user's prompt is the only approved source of product policy in this run; there is no repo, spec, or design file in the working directory. Regex graders already check that every contract row cites `S<n>` or `Q<n>` and that each Open question offers options with one recommendation. Judge only what they cannot: whether an `S1` citation is honest.

The prompt, verbatim (you see the agent output, not the conversation, so judge against this):

> 주문 목록 테이블에 커서 기반 페이지 이동을 붙여줘. 필터가 바뀌면 첫 페이지부터 다시 읽고, 페이지 이동 중에는 현재 행을 유지한 채 진행 표시, 이동 실패는 현재 행을 유지한 채 실패 안내, 첫 로드 실패는 전체 실패 화면, 결과 0건은 필터 적용 여부에 따라 다른 빈 화면이어야 해. TanStack Query가 이미 설치돼 있어. Design-only로 상태·타입 계약까지 Draft Oracle에 담아줘.
> 카드 파일은 `.ai/oracles/orders-cursor-paging/oracle.md`에 써줘.

List every contract row, policy line, and plain statement of fact whose only source is `S1` (or the request), or that cites no source at all. For each, decide whether the prompt text actually states that behaviour, number, threshold, or timing. A row whose source includes a `Q<n>` is out of scope.

Not inventions: values the prompt itself gave; observations that follow necessarily from the prompt (for example "a pending indicator is shown while the request is in flight" when the prompt asked for a progress indicator); non-goals and "out of scope" statements; the `Risk:` line and its worst regression, which the format requires as an assessment; candidate axis values and Open question options, which are proposals awaiting `yes`.

PASS if every listed item is stated by the prompt. FAIL if any is not, and quote it.
