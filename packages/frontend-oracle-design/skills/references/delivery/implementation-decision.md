# Delivery — Frontend 구현 결정 기록

`VALID_RED` 뒤 frontend production 수정 전, 실제 package version과 레포 규칙을 근거로
아래 기록을 남긴다. 외부 best practice는 제품 정책을 정하거나 레포 계약을 덮어쓰지
않는다. 해당 없는 항목은 이유와 함께 N/A.

먼저 [`changeability.md`](../changeability.md)를 전부 읽고, 이번 diff에 material한
근거만 Decision에 옮긴다. 원칙 본문 복제나 다섯 축 완주 선언으로 대신하지 않는다.

기록 위치는 `.ai/oracles/<oracle-id>/implementation-decision.md`. 제품 정책 source가
아니라 reviewer가 diff와 대조할 구현 reasoning 원문이다. 모든 축을 의례적으로 채우는
boilerplate 대신 material한 trade-off만 기록한다.

```markdown
### Implementation Decision

- Target: React/Next.js/TanStack Query version과 router/runtime
- State ownership: server state, URL state, client state, derived state의 소유자
- Server/Client boundary: server에 남길 것과 최소 client leaf
- Async boundary: initial loading, refetch, error, retry, mutation pending 처리
- Hook boundary: 분리할 interaction/query 책임과 분리하지 않을 trivial logic
- Type contract: material한 입력·성공·실패·상태 전이와 불가능 상태, 또는 N/A 사유
- Architecture: 영향 unit, 승인된 architecture 문서, 기존 관례·data/effect 경계와
  Oracle source hash
- Changeability: material한 Readability·Predictability·Cohesion·Coupling 판단,
  우선한 축과 희생한 축의 trade-off
- Side effects: request·navigation·storage·analytics·logging의 종류와 owner/boundary
- Simplicity: 기존 구현→platform/framework 기본 기능→설치 dependency→최소 local
  code 중 처음 요구를 만족한 단계
- Dependency: 새로 도입·교체한 framework/library가 있으면 해결하는 실제 문제,
  실제로 사용할 기능, 검토한 대안, 비용과 제거 경로; 없으면 N/A
- Design: Design Intent가 있으면 visual scope, component·token 재사용, typography,
  responsive, motion·reduced motion, copy, signature와 버린 generic 선택; 없으면 N/A
- Accessibility: interactive UI의 semantic name·keyboard·focus·상태 전달 증거, 또는 N/A
- Performance: claim이 있으면 metric·budget·동일 환경 baseline/after runId, 없으면 N/A
- Public API: exported shared/package surface가 바뀌면 consumer·호환성·type/runtime·pack·
  migration 계약, 아니면 N/A
- Sources: 적용한 레포 계약·공식 문서·휴리스틱
- Rejected: 실제 검토했지만 적용하지 않은 대안, 관련 품질 축과 구체 이유
```

선택이 카드의 관찰 결과를 바꾸거나 승인 기준과 충돌하면 구현하지 말고
`NEEDS_DECISION` 복귀. 기술적으로 동등한 선택이면
[`frontend-implementation.md`](../frontend-implementation.md)의 runtime 기준과
[`changeability.md`](../changeability.md)의 변경 비용 기준으로 결정하고 계속한다.
