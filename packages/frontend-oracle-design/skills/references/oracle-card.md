# Oracle Card 설계 계약

## 목차

0. 외부 기준 게이트
1. UI 디자인 의도 게이트
2. Risk 판정
3. 정책 Grill
4. 정책 출처
5. 카드 형식
6. Adversarial self-review
7. Draft Oracle과 사용자 확인
8. 결정적 revision lock — 카드 lint, lock, run artifact 초기화
9. 설계 종료 상태

## 0. 외부 기준 게이트

Risk·Grill 전에 사용자가 제공했거나 레포가 승인된 기준으로 지정한 자료를 찾아 전부
읽는다. 우선순위:

1. 보안·개인정보·법적 제약·접근성·금융 및 데이터 정합성
2. 사용자의 명시적 행동 계약과 공개 호환성
3. 레포의 필수 아키텍처·API·테스트 계약
4. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 원본의 해당 관할
5. production 코드·기존 테스트·브라우저 관찰은 조사 증거일 뿐 정책 출처가 아님

카드 상단에 이번 변경의 제품 결과와 범위를 기록한다. KPI가 없으면 수치를 발명하지
않고 사용자가 관찰할 수 있는 성공 결과를 쓴다.

```markdown
## Outcome Brief

- Actor and context: 누가 어떤 상황에서 사용하는가
- Observable success: 관찰 가능한 성공 결과
- Non-goals: 이번 변경에서 하지 않을 일
- Worst regression: false GREEN의 가장 큰 피해
- Reversibility: 되돌리는 방법 또는 N/A 사유
- Sources: S1, S2
```

### Requested mechanism check — 수단과 결과 분리

사용자가 구체적 수단(화면·필드·버튼·자동화·조건)을 요청했지만 의도한 결과나
사용자가 불명확하면 Outcome Brief에 다음을 함께 기록한다. 수단과 결과가 이미
일치하면 이 소절 없이 그대로 진행한다.

- Requested mechanism: 사용자가 요청한 구체적 수단
- Intended outcome: 실제로 해결하려는 사용자·비즈니스 문제
- Smallest reversible scope: 그 결과를 확인할 수 있는 최소 가역 범위
- Deferred scope: 검증 전에는 만들지 않을 범위 — Non-goals에 사유와 함께 기록

규칙:

- 더 작은 대안은 Draft Oracle에 제시만 한다. scope 축소는 사용자의 명시적
  승인으로만 확정하며 에이전트가 임의로 줄이지 않는다.
- 이 검토를 `mandatory-constraint`(보안·개인정보·법·접근성·데이터 정합성) 생략
  근거로 쓰지 않는다.

```markdown
## Source Registry

| ID  | Kind                 | 관할                     | 기준          | 위치·version                        | 승인 상태 |
| --- | -------------------- | ------------------------ | ------------- | ----------------------------------- | --------- |
| S1  | product-policy       | 비즈니스 결과            | PRD           | docs/profile.md#save-flow, revision | approved  |
| S2  | product-policy       | UI·문구·interaction      | Figma         | file/page/frame/version             | approved  |
| S3  | project-constraint   | payload·오류·idempotency | API 계약      | endpoint/version                    | approved  |
| S4  | mandatory-constraint | 접근성·토큰              | 디자인 시스템 | 문서 위치/version                   | approved  |
```

허용 `Kind` 4종:

- `product-policy`: 사용자 답변과 승인된 PRD·Figma처럼 제품 결과를 정하는 자료
- `mandatory-constraint`: 보안·개인정보·법·접근성·데이터 정합성처럼 제품 선호로 낮출
  수 없는 제약
- `project-constraint`: 저장소의 공개 API·architecture·테스트·호환성 계약
- `implementation-reference`: 실제 설치 버전의 공식 문서·구현 휴리스틱. 제품 결과를
  정하지 못한다.

규칙:

- Figma는 원본 파일의 정확한 page·frame·variant를 직접 확인. 열 수 없으면 기억·유사
  스크린샷으로 대체하지 않는다.
- 외부 기준이 없으면 `N/A — 제공되거나 승인된 외부 기준 없음` 기록.
- 외부 기준끼리 또는 사용자 답변과 충돌, 필수 기준 접근 불가 → 충돌 위치·영향 정책
  제시 후 `NEEDS_DECISION`.
- 카드는 외부 기준의 실행 가능한 번역이다. 작성 후 외부 기준의 상태·문구·interaction·
  부작용 요구가 누락·왜곡되지 않았는지 대조한다.
- 기준은 자신의 관할 안에서만 우선한다. Figma로 idempotency, API 계약으로 시각
  레이아웃을 정하지 않는다. 관할이 겹치거나 불명확하면 `NEEDS_DECISION`.
- `mandatory-constraint`와 다른 source 충돌 시 보안·접근성·정합성을 낮춰 통과하지
  않는다. 충돌과 안전한 대안 제시 후 `NEEDS_DECISION`.
- 기준의 revision/version이 바뀌면 기존 `ORACLE_READY`를 무효화하고 다시 대조.

## 1. UI 디자인 의도 게이트

새 UI·redesign 또는 보이는 layout·palette·typography·copy·motion·responsive behavior·
visual identity 변경이면 카드 작성 전 [`visual-design.md`](visual-design.md)를 전부
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

## 2. Risk 판정

코드 복잡도가 아니라 **false GREEN의 최악 피해**로 판정한다. UI가 단순해도 부작용이
위험하면 High다.

| Risk   | 예                                          | 처리                                    |
| ------ | ------------------------------------------- | --------------------------------------- |
| Low    | 정적 표시, 순수 동기 helper                 | 카드 생략 가능 — risk와 사유 한 줄 기록 |
| Medium | 조회, 검색, 폼, 캐시                        | 카드 작성                               |
| High   | 결제, 주문, 저장, 삭제, 권한, 외부 mutation | 카드 작성 + 사용자 카드 확인 필수       |

## 3. 정책 Grill — 시스템 디자인 인터뷰

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

| Phase | 관할            | 대표 질문                                                                                     | 산출물                               |
| ----- | --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| P1    | 결과            | actor·상황, 관찰 가능한 성공, 비목표, 최악 회귀·가역성                                        | Outcome Brief                        |
| P2    | 부작용·위험     | 서버 상태 변경 여부, 돈·데이터·권한 피해                                                      | Risk lane                            |
| P3    | 데이터·아키텍처 | source of truth, stale 허용, 기존 상태 소유자(query·router·form), 핵심 entity와 소유 컴포넌트 | architecture intake, State ownership |
| P4    | API 계약        | 스펙 소스 위치·version, error code별 UI 결과·재시도, idempotency key 주체, pagination 끝 판정 | Source Registry, `API contract` 절   |
| P5    | 경합·비동기     | 아래 "자주 필요한 질문"                                                                       | 카드 `O*` 행                         |
| P6    | 상태 모델       | 상태 수·불가능한 전이                                                                         | State Model(opt-in)                  |
| P7    | 시각            | visual scope, 로딩·빈·에러 표시, 접근성 확인                                                  | Design Intent·`D*` 행                |
| P8    | 성능·운영       | 성능 목표 수치·측정법, rollout·flag                                                           | performance 게이트                   |

가지치기:

- P1에서 Low 판정이면 grill을 끝내고 fast path로 간다.
- endpoint가 없으면 P4, mutation·async가 없으면 P5, `behavior-only`면 P7, 성능
  claim이 없으면 P8을 통째로 건너뛴다.
- 기능이 설치된 `frontend-system-design` reference와 매칭되면 그 문서의 결정
  포인트를 P4·P5 질문으로 변환해 일반 질문을 대체한다.
- API 스펙 소스가 없으면 P4를 추측으로 채우지 않고 `NEEDS_DECISION`.

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

방법 근거: phase 순서는
[RADIO framework](https://www.greatfrontend.com/front-end-system-design-playbook/framework)의
R→A→D→I→O 순서를, 질문·정책·예시 분리는
[Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/)의
rule(=`P*`)·example(=`O*`)·question(=red card) 카드 대응을 따른다. `Then`이
불명확한 예시는 예시가 아니라 질문이다 — 그 행을 만들지 않고 red card로 기록한다.
red card가 쌓이면 토론하지 않고 `NEEDS_DECISION`, rule이 쌓이면 카드가 너무 크다 —
Requested mechanism check의 Smallest reversible scope 분할을 제안한다.

- outcome-unknown timeout에서 재시도와 idempotency를 어떻게 보장할지
- 요청된 수단이 의도한 결과를 얻는 최소 수단인지, 더 작은 대안을 먼저 검증할지

## 4. 정책 출처

인정: 1) 사용자의 명시적 답변, 2) 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma의
정확한 위치·version, 3) 적용되는 보안·개인정보·법적·접근성·데이터 정합성 제약, 4)
레포가 공개 계약으로 지정한 API·architecture·호환성 문서.

인정 안 함: 에이전트 추천안, production 코드, 기존 테스트, 브라우저에서 관찰한 현재
동작, `implementation-reference`로 분류한 framework 문서·구현 휴리스틱.

결정된 정책마다 출처를 붙인다. 출처 없는 정책이 하나라도 있으면 `ORACLE_READY`가
아니다.

```markdown
### 결정된 정책

- P1: 저장 중 추가 제출은 무시한다. (출처: 유저 Q1=A) (행: O1, O2)
- P2: 5xx 실패 시 입력을 유지한다. (출처: docs/save.md#failure-policy) (행: O3)
```

## 5. 카드 형식

`references/bva.md`의 네 축과 자동 추가 TC 7종을 적용한다. 모든 새 카드는
`Outcome Brief → Source Registry → User Confirmation → 결정된 정책 → 계약 행` 순서.
`oracle-verify.mjs card`가 Outcome Brief 필수 값과 Source Registry `Kind`를 lock 전에
검사한다.

Design Intent가 있으면 `visual-design.md` 형식을 행동 매트릭스 바로 앞에 둔다.
Design Intent·`D*` 행·`O*` 행·확인 근거는 모두 같은 Oracle bytes로 잠근다. 비-N/A
`D*` 행은 `HARD → test`, `RELATIONAL → visual | pending`, `JUDGMENT → designer
reviewer`로 매핑. `local`·`identity-shaping`이면 Design Change Confirmation의 사용자
답변 위치를 같은 Design Intent에 기록.

```markdown
## User Confirmation

- Status: draft | approved
- Source: 사용자 승인 응답의 메시지·issue·문서 위치
- Delta: new card 또는 이전 revision 대비 의미 변경 요약
- Visual QA authorization: approved | declined # RELATIONAL 행이 있을 때
```

Draft 단계는 `Status: draft` 유지. 사용자가 카드 전문·delta를 확인하고 명시적으로
승인한 뒤에만 `approved`와 실제 응답 위치를 기록한다. 에이전트 추천이나 "사용자가
원할 것"이라는 추론을 Source로 쓰지 않는다.

| ID  | 정책 | Given | When | Then | Never | 부작용(종류×횟수) | BVA |
| --- | ---- | ----- | ---- | ---- | ----- | ----------------- | --- |

| 열       | 의미                                       |
| -------- | ------------------------------------------ |
| `Given`  | 행동 직전 상태와 전제                      |
| `When`   | 사용자 행동, 응답, 시간 또는 순서 변화     |
| `Then`   | 반드시 관찰되어야 하는 결과                |
| `Never`  | 절대 발생하면 안 되는 반대 결과            |
| `부작용` | 요청·저장·이동·이벤트의 정확한 종류와 횟수 |
| `BVA`    | 값·상태·시간/순서·횟수 중 검토한 경계      |

규칙:

- `Never`와 부작용 횟수가 빈 행은 미완성이다.
- 각 결정에 stable 정책 ID(`P*`)와 적용 행, 각 `O*`·`D*` 행의 `정책` 열에 같은 ID.
  정책 ID와 행 ID의 양방향 참조가 정확히 일치해야 한다.
- UI 상태와 실제 부작용 횟수를 각각 검증.
- 전제가 있는 자동 추가 TC는 행으로 만들고, 없으면 N/A와 사유 기록.
- 존재하지 않는 retry·cancel·race를 테스트 목적으로 발명하지 않는다.
- 오류는 기능에 해당하는 subtype별 메시지·복구·부작용을 구분.

축약 예시:

```markdown
| ID  | 정책 | Given     | When       | Then           | Never              | 부작용      | BVA           |
| --- | ---- | --------- | ---------- | -------------- | ------------------ | ----------- | ------------- |
| O1  | P1   | 유효 입력 | 저장 클릭  | pending 표시   | 응답 전 성공 UI    | POST×1      | 상태: pending |
| O2  | P1   | pending   | 클릭+Enter | pending 유지   | 두 번째 POST       | POST×1(총)  | 횟수: 1/2     |
| O3  | P2   | pending   | 서버 5xx   | 오류+입력 유지 | 성공 UI, 입력 유실 | 성공 저장×0 | 상태: error   |
```

### State Model — 선택 사항

기본값은 생략이다. async 행이 있어도 `O*` 행 자체가 계약이며, 섹션이 없다고
lint가 막지 않는다. 전이 정책이 행 나열만으로 읽히지 않을 만큼 얽힌 카드
(다단계 제출·낙관적 롤백·결제류)에만 계약 행 뒤에 `## State Model`을 추가한다.
추가했다면 `oracle-verify.mjs card`가 구조를 검증한다: 비어 있지 않은
`States`·`Events`, 모든 전이가 실제 `O*` 행을 인용하는 전이표 없이는
`CARD_LINT_FAILED`로 lock이 막힌다.

```markdown
## State Model

- States: editing, submitting, success, failure
- Events: SUBMIT, RESPONSE_OK, RESPONSE_ERROR

| From       | Event          | To         | 행  |
| ---------- | -------------- | ---------- | --- |
| editing    | SUBMIT         | submitting | O1  |
| submitting | SUBMIT         | submitting | O2  |
| submitting | RESPONSE_OK    | success    | O4  |
| submitting | RESPONSE_ERROR | failure    | O3  |
```

- 상태·이벤트는 `O*` 행의 `Given`·`When`·`Then`에서만 도출하고 표의 모든 전이는 행
  ID를 참조한다. 참조 없는 전이는 발명된 정책이다.
- `상태 × 이벤트`의 빈 조합은 불가능(타입으로 표현 불가)인지 미결 정책인지 구분한다.
  미결이면 `NEEDS_DECISION`이며 "무시"를 기본값으로 채우지 않는다.
- 이 섹션은 카드 bytes에 포함되어 함께 잠긴다. discriminated union 번역은
  [`type-constraints.md`](type-constraints.md) 담당.

## 6. Adversarial self-review

각 행에 네 질문을 적용하고 반례가 나오면 행을 보강한다.

1. 이 행을 통과하면서 요구사항을 위반하는 가장 단순한 구현은?
2. 정상적인 다른 구현인데 이 행 때문에 실패할 수 있는가?
3. UI만 흉내 내고 실제 부작용 없이 통과할 수 있는가?
4. loading, error, retry, 연속 입력, 순서 역전 중 관련 있지만 빠진 것은?

예: "저장 중 버튼 disabled"만으로는 disabled 적용 전 POST 두 번을 잡지 못한다. 같은
행에 `POST×1(총)`과 "두 번째 POST 없음"을 병기한다.

Design Intent가 있으면 `visual-design.md`의 genericity·restraint 비평도 수행한다. 출처
있는 미적 요구를 자동화하기 어렵다는 이유로 `NON_ORACLE_OPINION`이나 N/A로 내리지
않는다.

## 7. Draft Oracle과 사용자 확인

새 카드나 의미가 바뀐 revision은 다음 직렬 gate를 반드시 거쳐 사용자에게 확인받는다.

1. production 수정 없이 외부 기준과 기존 revision 조사.
2. **Draft Oracle**과 semantic delta, 미결 질문 작성.
3. 전체 카드와 delta를 사용자에게 보여주고 재확인.
4. 승인되면 `User Confirmation`을 `approved`로 바꾸고 실제 응답 위치 기록.
5. 수정 요청이면 Draft를 고쳐 재확인.
6. 무응답·정책 충돌이면 `NEEDS_DECISION`.

기존 locked Oracle 범위 안의 구현·테스트 보정에는 새 카드를 만들지 않는다. 그러나
`Then`·`Never`·부작용·BVA·Design Intent·정책 출처 중 하나라도 의미가 바뀌면 잠긴
파일을 제자리에서 고치지 않고 새 경로에 Draft revision을 만든다. 새 revision도 사용자
확인 전에는 lint·lock·테스트·production 수정으로 넘어가지 않는다.

## 8. 결정적 revision lock

사용자가 확인한 카드는 self-review 뒤 exact bytes를 파일로 저장하고 bundled script로
잠근다. Low fast path처럼 새 정책·카드가 없는 작업은 이 절차에 들어오지 않는다.

Design-only로 잠근 revision을 나중에 Delivery로 확장하며 architecture·backend 등 새
local source가 필요해지면 기존 lock에 덧붙이지 않는다. source delta를 사용자에게
보여주고 새 revision 경로에서 카드와 전체 source 집합을 한 번에 잠근다. 처음부터
Delivery가 요청됐으면 모든 source 승인을 마칠 때까지 lock을 미룬다.

대상 레포가 agent artifact 위치를 정하지 않았다면:

```text
<repo>/.ai/oracles/<oracle-id>/oracle.md
<repo>/.ai/oracles/<oracle-id>/oracle.lock.json
<repo>/.ai/oracles/<oracle-id>/run-state.json
<repo>/.ai/oracles/<oracle-id>/runs.jsonl
<repo>/.ai/oracles/<oracle-id>/.run-ids/ # 병렬 exec의 원자적 runId reservation
<repo>/.ai/oracles/<oracle-id>/evidence.json
```

### 카드 구조 lint

lock 전에 `oracle-verify.mjs card`로 구조적 최소선을 기계 확인한다. lint는 token·표
구조 검사일 뿐 semantic approval이 아니다 — 의미 심사는 6절 담당.

```bash
node <skill-dir>/scripts/oracle-verify.mjs card \
  --oracle .ai/oracles/<oracle-id>/oracle.md
```

검사 항목: 완전한 Outcome Brief, `Kind` 있는 Source Registry, 승인된 User Confirmation
존재, 모든 정책 줄의 stable ID·`(출처: …)`·적용 행, 정책 ID와 행 ID의 양방향 참조,
중복 없는 행 ID, `O*` 행의 `Then`·`Never`·부작용, `D*` 행의 계약·출처·증거 계층과
Source Registry 참조, 모호어 부재, 자동 추가 TC 7종의
실제 계약 행 또는 출처 있는 N/A 표기. `CARD_LINT_FAILED`는 lock 전에 카드를 고치라는
뜻이며, 검사를 우회하려고 문구만 바꾸지 않는다.

에이전트가 직접 실행하며 사용자에게 명령 실행을 요청하지 않는다. 승인된 로컬 명세
파일은 `--source`를 반복해 함께 잠근다. URL·Figma 같은 원격 기준은 정확한 version을
카드 bytes에 기록하고 외부 기준 게이트에서 다시 확인한다.

```bash
node <skill-dir>/scripts/oracle-lock.mjs create \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --source <local-approved-source>

node <skill-dir>/scripts/oracle-lock.mjs verify \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json
```

- `<skill-dir>`는 현재 host가 실제로 로드한 이 스킬의 디렉터리. home 경로 hardcode
  금지.
- 출력된 `sha256:<digest>`가 Oracle revision이다.
- `create`는 동일 bytes의 기존 lock에 idempotent, 변경된 카드·source의 기존 lock은
  덮어쓰지 않는다. 승인된 새 revision은 이전 artifact를 보존하고 새 경로에 생성.
- 모든 새 카드·revision은 7절에서 카드 전문·delta를 확인받는다. digest는 확인된
  bytes의 식별자일 뿐 사용자 확인을 대신하지 않는다.
- 테스트 작성, production 수정, 독립 리뷰, 완료 상태 발급 직전 `verify` 재실행.
  `oracle-run.mjs`의 `exec`·`transition`은 매 호출 같은 검증을 자동 수행.
- `ORACLE_CHANGED`·`SOURCE_CHANGED`면 기존 RED·GREEN·리뷰 증거를 폐기하고 변경 diff와
  카드 현재본을 제시해 `NEEDS_DECISION`으로 복귀.
- `LOCK_INVALID`·도구 부재·실행 불가는 결정론 판정 실패 → `FAIL`.
- mismatch 제거용 자동 재생성 금지. 재잠금은 source gate, Draft delta, 사용자 재확인,
  self-review를 다시 거친 뒤에만.
- Low risk로 카드를 생략했으면 lock N/A 사유를 남긴다. Medium/High에서 파일시스템·
  Node가 없으면 Design-only와 Delivery 모두 LLM 판정으로 대체하지 않고 `FAIL`.

SHA-256은 drift 검출 장치다. 같은 actor가 lockfile까지 다시 쓸 수 있는 환경에서 승인
권한을 보장하지 않는다. 강한 통제가 필요하면 lockfile 변경에 CI human approval·
CODEOWNERS·외부 서명을 추가한다. run ledger·상태 파일도 같은 한계.

### Run artifact 초기화

Delivery 진입 시 lock 직후 run ledger와 상태 파일을 만든다. Design-only로 끝나면
생성하지 않는다. `journal.md`는 예외다 — Grill부터 같은 디렉터리에 쌓이며 ledger와
별개로 단계 근거만 담는다.

```bash
node <skill-dir>/scripts/oracle-run.mjs init \
  --dir .ai/oracles/<oracle-id> \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --risk low|medium|high \
  --required-label behavior \
  --required-label lint \
  --harness-path vitest.config.ts \
  --milestone list:O1,O2 \
  --milestone detail:O3,O4
```

- `--required-label`: 대상 레포에서 실제 적용되는 targeted test, lint, typecheck,
  build label을 반복 선언. 최소 하나 필요, GREEN·리뷰 후 재검증에서 모두 재확인.
- `init`은 lock을 검증하고 현재 worktree digest를 `ORACLE_READY` 기준선으로 저장 —
  이후 TDD 순서 판정의 근거.
- `--scan-root` 기본값은 현재 작업 디렉터리. monorepo에서 범위를 좁힐 때만 명시.
- RED 전에 바꿔야 하는 config·setup·mock 배선은 `--harness-path`로 scan root 기준의
  정확한 상대 파일 경로를 반복 선언. glob·디렉터리·root 밖 경로 불허, 실제로 존재하고
  worktree snapshot에 포함되는 파일만.
- 큰 카드는 `--milestone <name>:O1,O2`를 반복해 겹치지 않는 test-owned 행을 묶는다.
  행은 Oracle에 존재해야 하고 두 milestone이 같은 행을 소유하지 않는다. 작은 카드에는
  선언하지 않는다.
- 상태 파일이 이미 있으면 `init`은 실패한다. 예산·기준선 초기화 목적 재실행 금지. 새
  revision은 새 `<oracle-id>` 디렉터리.

## 9. 설계 종료 상태

### `ORACLE_READY`

- Outcome Brief 완성, Source Registry에 Kind·관할·위치·version·승인 상태 또는 N/A 사유
- 카드가 외부 기준의 상태·문구·interaction·부작용을 누락·왜곡하지 않음
- 모든 정책에 인정되는 출처
- `User Confirmation`이 `approved`이고 새 카드 또는 semantic delta를 승인한 실제
  사용자 응답 위치가 있음
- UI 시각 범위 기록, `local`·`identity-shaping`이면 승인된 Design Intent와 모든 `D*`
  행의 `Never`·출처·증거 계층 완성
- `local`·`identity-shaping`이면 Design Change Confirmation의 명시적 사용자 답변 위치
- `identity-shaping`이면 두 번의 설계 pass를 완료한 제안으로 확인받음
- 모든 행의 `Never`와 부작용 횟수 완성
- 자동 추가 TC 7종 추가 또는 N/A 사유
- adversarial self-review 통과
- `oracle-verify.mjs card` lint와 revision lock 검증이 통과함

### `NEEDS_DECISION`

미결 질문, 질문별 추천안과 근거, 카드 현재본을 출력한다. 이 상태에서는 테스트·구현을
진행하지 않는다. 잠긴 적이 있으면 마지막 SHA-256과 mismatch를 함께 출력한다. 카드
현재본은 다음 세션의 재개 자료다.
