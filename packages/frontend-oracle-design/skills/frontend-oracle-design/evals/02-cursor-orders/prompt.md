---
max_turns: 60
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Write]
runs: 3
---

주문 목록 테이블에 커서 기반 페이지 이동을 붙여줘. 필터가 바뀌면 첫 페이지부터 다시 읽고, 페이지 이동 중에는 현재 행을 유지한 채 진행 표시, 이동 실패는 현재 행을 유지한 채 실패 안내, 첫 로드 실패는 전체 실패 화면, 결과 0건은 필터 적용 여부에 따라 다른 빈 화면이어야 해. TanStack Query가 이미 설치돼 있어. 구현은 하지 말고 승인 요청까지만.
SPEC은 `.ai/oracles/orders-cursor-paging/SPEC.md`에 써줘.
