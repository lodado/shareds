# Low fast path — lane 계약

진입 시 risk 판정이 Low인 작업의 유일한 로드 노드다. 이 lane에서는 이 파일 **하나만**
읽고 다른 reference 노드는 로드하지 않는다 — 그래프의 Oracle lane(`common` 이하)은
명시적 Oracle 요청 또는 Medium/High 판정에서만 연다.

## 진입 조건 — 전부 만족할 때만

- 새 정책·카드·architecture 결정이 없다.
- 기존 승인 계약 안의 변경이다: 되돌리기 쉬운 copy·token·고립 CSS·명확한 회귀 수정.
- false GREEN의 최악 피해가 작다(정적 표시, 순수 동기 helper 수준). 부작용이 위험하면
  UI가 단순해도 Low가 아니다.

## 절차

1. risk 판정과 사유를 한 줄 기록한다 (예: `risk: low — 승인된 문구 계약 안의 copy 수정`).
2. 변경을 수행하고 관련 테스트와 레포 필수 검증(lint·typecheck·targeted test)만
   실행한다.
3. 결과를 보고한다: 변경 path, 실행한 검증 명령과 실제 결과, risk 사유.

## 하지 않는 것

- Oracle Card·revision lock·run ledger·상태 파일·evidence manifest 생성
- Grill·사용자 카드 확인·독립 subagent 리뷰
- 다른 reference 노드 로드

절차를 생략하는 lane이지 검증을 생략하는 lane이 아니다 — 레포 필수 검증은 그대로
실행하고, 실행하지 않은 검증을 통과로 보고하지 않는다.

## 승격 — Low 실격 조건

작업 중 아래 중 하나라도 나타나면 그 즉시 Low 실격이다. fast path를 계속 타지 말고
지금까지의 변경 내용을 보고한 뒤 Oracle lane으로 승격한다
(`common.md` → `card/` 노드, Medium 절차).

- 결과를 바꾸는 정책 질문이 생겼다 (`Then`·`Never`·부작용 횟수를 정해야 한다)
- 새 상태·form·async 흐름·responsive 구조가 필요해졌다
- architecture 경계·state ownership·public API를 바꾸게 됐다
- mutation·권한·데이터 정합성 등 부작용 위험이 드러났다

승격 후에는 이미 만든 변경을 기정사실로 두지 않는다 — 카드 절차가 정한 정책과
어긋나면 되돌린다.
