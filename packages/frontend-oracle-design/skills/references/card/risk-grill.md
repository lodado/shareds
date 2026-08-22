# Oracle Card — Risk 판정과 정책 Grill

## UI 디자인 의도 게이트

새 UI·redesign 또는 보이는 layout·palette·typography·copy·motion·responsive behavior·
visual identity 변경이면 카드 작성 전 [`visual-design.md`](../visual-design.md)를 전부
읽는다. 기존 시각 결과 유지 작업은 `behavior-only`와 N/A 사유만 기록.

- `local`·`identity-shaping`이면 승인된 시각 기준을 Design Intent와 `D*` Visual
  Contract 행으로 같은 카드에 포함.
- AI·디자인 skill의 Design Proposal은 사용자 승인 전 정책 출처가 아니다.
- 출처 있는 시각 요구마다 `HARD`·`RELATIONAL`·`JUDGMENT` 증거 계층을 정한다.
- **Design Change Confirmation 필수.** `local`·`identity-shaping`은 변경 축과 전체
  Design Intent를 보여주고 명시적 확인 전 잠그지 않는다. 승인된 디자인 source도 확인을
  대신하지 않으며, 미확인이면 `NEEDS_DECISION`.
- `identity-shaping`은 두 번의 설계 pass까지 마친 제안으로 확인받는다.
- 승인된 로컬 디자인 자료는 `--source`로 함께 잠그고, 원격 자료는 정확한 version을
  Design Intent와 Source Registry에 기록.

시각 범위는 기능 Risk를 대신하지 않는다. 두 판정은 별도로 기록.

## Risk 판정

코드 복잡도가 아니라 **false GREEN의 최악 피해**로 판정한다. UI가 단순해도 부작용이
위험하면 High다.

- Low (정적 표시, 순수 동기 helper) → 카드 생략 가능 — risk와 사유 한 줄 기록
- Medium (조회, 검색, 폼, 캐시) → 카드 작성
- High (결제, 주문, 저장, 삭제, 권한, 외부 mutation) → 카드 작성 + 사용자 카드 확인 필수

## 정책 Grill — 시스템 디자인 인터뷰

**답에 따라 예상 결과나 테스트가 달라지는 질문만** 한다.

- 라운드당 3~5개, 최대 2라운드
- 각 질문에 추천안과 근거 동봉
- 레포 문서·승인된 명세에 답이 있으면 질문하지 않음
- 추천안은 결정이 아니며, 답이 없으면 default로 적용하지 않음
- 2라운드 후에도 결과를 바꾸는 질문이 남으면 `NEEDS_DECISION`

### Phase 순서

질문은 **앞 답이 뒤 가지를 죽이는 순서**로 한다. 질문 전에 레포·PRD·Figma·API
문서를 먼저 탐색해 답이 있는 질문을 제거한다. 코드 관찰로 얻은 답은
`project-constraint` 후보일 뿐 제품 정책 출처가 아니다.

- P1 결과: actor·상황, 관찰 가능한 성공, 비목표, 최악 회귀·가역성, 플랫폼·디바이스·offline·다국어 → Outcome Brief
- P2 부작용·위험: 서버 상태 변경 여부, 돈·데이터·권한 피해 → Risk lane
- P3 데이터·아키텍처: source of truth, stale 허용, 기존 상태 소유자(query·router·form), 핵심 entity와 소유 컴포넌트 → architecture intake, State ownership
- P4 API 계약: 스펙 소스 위치·version, error code별 UI 결과·재시도, idempotency key 주체, pagination 끝 판정 → Source Registry, `API contract` 절
- P5 경합·비동기: 아래 "자주 필요한 질문" → 카드 `O*` 행
- P6 상태 모델: 상태 수·불가능한 전이 → State Model(opt-in)
- P7 시각: visual scope, 로딩·빈·에러 표시, 접근성 확인 → Design Intent·`D*` 행
- P8 성능·운영: 성능 목표 수치·측정법, rollout·flag → performance 게이트

가지치기:

- P1에서 Low 판정이면 grill을 끝내고 fast path로 간다.
- endpoint가 없으면 P4, mutation·async가 없으면 P5, `behavior-only`면 P7, 성능
  claim이 없으면 P8을 통째로 건너뛴다.
- 기능이 설치된 `frontend-system-design` reference와 매칭되면 그 문서의 결정
  포인트를 P4·P5 질문으로 변환해 일반 질문을 대체한다.
- API 스펙 소스가 없으면 P4를 추측으로 채우지 않는다. 대신 카드 행에서 draft
  schema를 도출해 Draft Oracle과 함께 제시하고, 명시 승인 시 `project-constraint`
  source로 등록해 함께 잠근다. 승인이 없으면 `NEEDS_DECISION`.

라운드 구성: Round 1 = P1~P3 생존 질문, Round 2 = P4~P7 생존 질문. 사용자가
명시적으로 1문1답 인터뷰를 요청하면(예: "grill me") Design-only 조사에 한해
라운드 상한 없이 phase 순서로 진행한다. Delivery 중 정책 질문은 그대로
`oracle-run.mjs budget` 2라운드를 따른다.

각 라운드가 끝나면 질문·답·추천안 채택 여부와 가지치기 사유를
`.ai/oracles/<oracle-id>/journal.md`에 append한다. 답을 대화에만 남기지 않는다 —
컨텍스트가 요약돼도 다음 단계는 journal과 카드에서 이어진다.

문답 항목은 한 줄 규격으로 쓴다 — 질문·답·채택·매핑 행이 빠지면 미완성이다:

```markdown
## Grill Round 1 (P1~P3) — 2026-08-21

- Q1(P1): 성공 판정 기준? → 답: 완료 화면+주문번호 → 채택: 추천 수용 → 행: P1, O1
- Q2(P4): 409의 UI 결과? → 답: 기존 주문 화면 이동 → 채택: 수정 → 행: P3, O5
- 가지치기: P7 스킵 — behavior-only
```

자주 필요한 질문(P5):

- pending 중 중복 제출을 무시할지, 큐잉할지, 오류로 볼지
- 실패 후 입력·기존 데이터를 유지할지
- 오류 subtype별 재시도 허용 여부
- A 후 B 요청, B 후 A 응답에서 어떤 결과가 이길지
- 이탈·취소 후 늦은 응답을 어떻게 처리할지
- outcome-unknown timeout에서 재시도와 idempotency를 어떻게 보장할지
- 요청된 수단이 의도한 결과를 얻는 최소 수단인지, 더 작은 대안을 먼저 검증할지

방법 근거: phase 순서는
[RADIO framework](https://www.greatfrontend.com/front-end-system-design-playbook/framework)의
R→A→D→I→O 순서를, 질문·정책·예시 분리는
[Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/)의
rule(=`P*`)·example(=`O*`)·question(=red card) 대응을 따른다. `Then`이 불명확한
예시는 질문이다 — 행을 만들지 않고 red card로 기록한다. red card가 쌓이면
`NEEDS_DECISION`, rule이 쌓이면 Smallest reversible scope 분할을 제안한다.

RADIO 각 요소의 처리 위치 — grill이 전부 소유하지 않는다:

- R Requirements: Grill P1·P2
- A Architecture: Delivery architecture 게이트 — grill에서 구현 구조를 질문하지 않는다
- D Data model: Grill P3
- I Interface (server): Grill P4 → 스펙 없으면 카드 도출 draft → 승인 → `## API contract`
- I Interface (component): [`types/state-ladder.md`](../types/state-ladder.md) — 카드 `O*` 행에서 도출
- O Optimizations: P5 경합·P7 접근성·P8 성능 + Delivery 증거 행
