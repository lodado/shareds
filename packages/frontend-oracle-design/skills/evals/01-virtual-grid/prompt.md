---
max_turns: 60
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Write]
runs: 3
---
스토어 목록(필터 결과 최대 52건, 4/3/2/1열 반응형 그리드, 28/20 배치 추가 로드, filterKey 변경 시 목록 리마운트)의 렌더를 row 단위 윈도우 가상화로 교체해줘. @tanstack/react-virtual의 useWindowVirtualizer를 쓰고, 열 수의 진실 원천은 CSS 미디어쿼리로 두고 JS는 ResizeObserver로 렌더된 그리드에서 열 수를 읽기만 해. 추가 로드 트리거는 마지막 가상 row 기준으로 옮기고 IntersectionObserver sentinel은 제거. 기존 28/20 배치·filterKey 리마운트·No Result·목록 시맨틱(ul/li)·320px 리플로우는 의미 변경 없이 승계. 스크롤 컨테이너는 윈도우 그대로. Design-only로 Draft Oracle까지만.
카드 파일은 `.ai/oracles/store-list-virtualization/oracle.md`에 써줘.
