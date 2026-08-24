# Oracle Card — 카드 형식과 self-review

## 카드 형식

[`bva.md`](../bva.md)의 네 축과 자동 추가 TC 7종을 적용한다. 모든 새 카드는
`Outcome Brief → Source Registry → User Confirmation → 결정된 정책 → 계약 행` 순서.
`oracle-verify.mjs card`가 Outcome Brief 필수 값과 Source Registry `Kind`를 lock 전에
검사한다.

Design Intent가 있으면 [`visual-design.md`](../visual-design.md) 형식을 행동 매트릭스
바로 앞에 둔다. Design Intent·`D*` 행·`O*` 행·확인 근거는 모두 같은 Oracle bytes로
잠근다. 비-N/A `D*` 행은 `HARD → test`, `RELATIONAL → visual | pending`,
`JUDGMENT → designer reviewer`로 매핑. `local`·`identity-shaping`이면 Design Change
Confirmation의 사용자 답변 위치를 같은 Design Intent에 기록.

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
  정책 ID와 행 ID의 양방향 참조가 정확히 일치해야 한다. 각 정책 출처는 Source
  Registry의 승인된 `S*` 또는 `User Confirmation`이어야 하며 source FK가 끊기면 lock 금지.
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

## State Model — 선택 사항

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
  [`types/state-ladder.md`](../types/state-ladder.md) 담당.

## Adversarial self-review

각 행에 네 질문을 적용하고 반례가 나오면 행을 보강한다.

1. 이 행을 통과하면서 요구사항을 위반하는 가장 단순한 구현은?
2. 정상적인 다른 구현인데 이 행 때문에 실패할 수 있는가?
3. UI만 흉내 내고 실제 부작용 없이 통과할 수 있는가?
4. loading, error, retry, 연속 입력, 순서 역전 중 관련 있지만 빠진 것은?

예: "저장 중 버튼 disabled"만으로는 disabled 적용 전 POST 두 번을 잡지 못한다. 같은
행에 `POST×1(총)`과 "두 번째 POST 없음"을 병기한다.

Design Intent가 있으면 [`visual-design.md`](../visual-design.md)의 genericity·restraint
비평도 수행한다. 출처 있는 미적 요구를 자동화하기 어렵다는 이유로
`NON_ORACLE_OPINION`이나 N/A로 내리지 않는다.
