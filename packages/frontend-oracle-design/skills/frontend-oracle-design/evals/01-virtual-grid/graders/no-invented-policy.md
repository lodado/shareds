---
type: llm
focus: { source: file, path: '.ai/oracles/store-list-virtualization/oracle.md' }
weight: 1
---

The user's prompt is the only approved source of product policy in this run; there is no repo, spec, or design file in the working directory. Regex graders already check that every contract row cites `S<n>` or `Q<n>` and that each Open question offers options with one recommendation. Judge only what they cannot: whether an `S1` citation is honest.

The prompt, verbatim (you see the agent output, not the conversation, so judge against this):

> 스토어 목록(필터 결과 최대 52건, 4/3/2/1열 반응형 그리드, 28/20 배치 추가 로드, filterKey 변경 시 목록 리마운트)의 렌더를 row 단위 윈도우 가상화로 교체해줘. @tanstack/react-virtual의 useWindowVirtualizer를 쓰고, 열 수의 진실 원천은 CSS 미디어쿼리로 두고 JS는 ResizeObserver로 렌더된 그리드에서 열 수를 읽기만 해. 추가 로드 트리거는 마지막 가상 row 기준으로 옮기고 IntersectionObserver sentinel은 제거. 기존 28/20 배치·filterKey 리마운트·No Result·목록 시맨틱(ul/li)·320px 리플로우는 의미 변경 없이 승계. 스크롤 컨테이너는 윈도우 그대로. Design-only로 Draft Oracle까지만.
> 카드 파일은 `.ai/oracles/store-list-virtualization/oracle.md`에 써줘.

List every contract row, policy line, and plain statement of fact whose only source is `S1` (or the request), or that cites no source at all. For each, decide whether the prompt text actually states that behaviour, number, threshold, or timing. A row whose source includes a `Q<n>` is out of scope.

Not inventions: values the prompt itself gave; observations that follow necessarily from the prompt (for example "a pending indicator is shown while the request is in flight" when the prompt asked for a progress indicator); non-goals and "out of scope" statements; the `Risk:` line and its worst regression, which the format requires as an assessment; candidate axis values and Open question options, which are proposals awaiting `yes`.

PASS if every listed item is stated by the prompt. FAIL if any is not, and quote it.
