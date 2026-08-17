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

Risk와 Grill보다 먼저 사용자가 제공했거나 레포가 승인된 기준으로 지정한 자료를
찾아 전부 읽는다.

우선순위:

1. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 원본
2. 사용자의 명시적 답변
3. 레포의 필수 아키텍처·접근성·보안 계약
4. production 코드·기존 테스트·브라우저 관찰은 조사 증거일 뿐 정책 출처가 아님

Oracle Card 상단에 기준 자료와 각 자료의 관할을 먼저 기록한다.

```markdown
### Source Registry

| ID  | 관할                     | 기준          | 위치·version                        | 승인 상태 |
| --- | ------------------------ | ------------- | ----------------------------------- | --------- |
| S1  | 비즈니스 결과            | PRD           | docs/profile.md#save-flow, revision | approved  |
| S2  | UI·문구·interaction      | Figma         | file/page/frame/version             | approved  |
| S3  | payload·오류·idempotency | API 계약      | endpoint/version                    | approved  |
| S4  | 접근성·토큰              | 디자인 시스템 | 문서 위치/version                   | approved  |
```

- Figma는 가능한 도구로 원본 파일의 정확한 page·frame·variant를 직접 확인한다.
- 링크·파일을 열 수 없으면 기억이나 유사 스크린샷으로 대체하지 않는다.
- 외부 기준이 없으면 `N/A — 제공되거나 승인된 외부 기준 없음`을 기록한다.
- 외부 기준끼리 또는 외부 기준과 사용자의 답변이 충돌하거나 필수 기준에 접근할
  수 없으면 충돌 위치·영향 정책을 제시하고 `NEEDS_DECISION`으로 멈춘다.
- Oracle Card는 외부 기준의 실행 가능한 번역이다. 카드 작성 후 외부 기준의 상태,
  문구, interaction, 부작용 요구가 누락·왜곡되지 않았는지 대조한다.
- 기준은 자신의 관할 안에서만 우선한다. Figma로 idempotency를 정하거나 API 계약으로
  시각 레이아웃을 덮어쓰지 않는다. 관할이 겹치거나 불명확하면 `NEEDS_DECISION`.
- 기준의 revision/version이 바뀌면 기존 `ORACLE_READY`를 무효화하고 다시 대조한다.

## 1. UI 디자인 의도 게이트

새 UI·redesign 또는 보이는 layout·palette·typography·copy·motion·responsive behavior·
visual identity를 바꾸는 작업이면 카드 작성 전에 [`visual-design.md`](visual-design.md)를
전부 읽는다. 기존 시각 결과를 유지하는 작업은 `behavior-only`와 N/A 사유만 기록한다.

- `local`·`identity-shaping`이면 승인된 시각 기준을 Design Intent와 `D*` Visual
  Contract 행으로 같은 Oracle Card에 포함한다.
- AI나 디자인 skill이 만든 Design Proposal은 사용자 승인 또는 승인된 기준 반영
  전에는 정책 출처가 아니다.
- 출처 있는 시각 요구마다 `HARD`·`RELATIONAL`·`JUDGMENT` 증거 계층을 정한다.
- **Design Change Confirmation은 필수다.** `local`·`identity-shaping`은 변경할 축과
  전체 Design Intent를 사용자에게 보여주고 명시적 확인을 받기 전 잠그지 않는다.
  승인된 디자인 source도 이 확인을 대신하지 않으며, 미확인이면 `NEEDS_DECISION`이다.
- `identity-shaping`은 두 번의 설계 pass까지 마친 제안으로 확인받는다.
- 승인된 로컬 디자인 자료는 `--source`로 함께 잠그고, 원격 자료는 정확한 version을
  Design Intent와 Source Registry에 기록한다.

시각 범위는 기능 Risk를 대신하지 않는다. 두 판정은 별도로 기록한다.

## 2. Risk 판정

코드 복잡도가 아니라 **false GREEN의 최악 피해**로 판정한다.

| Risk   | 예                                          | 처리                                    |
| ------ | ------------------------------------------- | --------------------------------------- |
| Low    | 정적 표시, 순수 동기 helper                 | 카드 생략 가능 — risk와 사유 한 줄 기록 |
| Medium | 조회, 검색, 폼, 캐시                        | 카드 작성                               |
| High   | 결제, 주문, 저장, 삭제, 권한, 외부 mutation | 카드 작성 + 사용자 카드 확인 필수       |

UI가 단순해도 부작용이 위험하면 High다.

## 3. 정책 Grill

**답에 따라 예상 결과나 테스트가 달라지는 질문만** 한다.

- 라운드당 3~5개, 최대 2라운드
- 각 질문에 추천안과 근거를 동봉
- 레포 문서나 승인된 명세에 답이 있으면 질문하지 않음
- 추천안은 결정이 아니며, 답이 없으면 default로 적용하지 않음
- 2라운드 후에도 결과를 바꾸는 질문이 남으면 `NEEDS_DECISION`

자주 필요한 질문:

- pending 중 중복 제출을 무시할지, 큐잉할지, 오류로 볼지
- 실패 후 입력·기존 데이터를 유지할지
- 오류 subtype별 재시도 허용 여부
- A 후 B 요청, B 후 A 응답에서 어떤 결과가 이길지
- 이탈·취소 후 늦은 응답을 어떻게 처리할지
- outcome-unknown timeout에서 재시도와 idempotency를 어떻게 보장할지

## 4. 정책 출처

인정:

1. 사용자의 명시적 답변
2. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma의 정확한 위치와 version

인정하지 않음:

- 에이전트의 추천안
- production 코드
- 기존 테스트
- 브라우저에서 관찰한 현재 동작

결정된 정책마다 출처를 붙인다. 출처 없는 정책이 하나라도 있으면
`ORACLE_READY`가 아니다.

```markdown
### 결정된 정책

- P1: 저장 중 추가 제출은 무시한다. (출처: 유저 Q1=A) (행: O1, O2)
- P2: 5xx 실패 시 입력을 유지한다. (출처: docs/save.md#failure-policy) (행: O3)
```

## 5. 카드 형식

`references/bva.md`의 네 축과 자동 추가 TC 7종을 적용한다.

Design Intent가 있으면 `visual-design.md`의 형식을 행동 매트릭스 바로 앞에 둔다.
Design Intent·`D*` 행·행동 `O*` 행과 아래 확인 근거는 모두 같은 Oracle bytes로
잠근다. 비-N/A `D*` 행은 `HARD → test`, `RELATIONAL → visual | pending`,
`JUDGMENT → designer reviewer`로 매핑한다. 아래 행동 행에는 기존 BVA 규칙을
그대로 적용한다.
`local`·`identity-shaping`이면 Design Change Confirmation의 사용자 답변 위치를 같은
Design Intent에 기록한다.

```markdown
## User Confirmation

- Status: draft | approved
- Source: 사용자 승인 응답의 메시지·issue·문서 위치
- Delta: new card 또는 이전 revision 대비 의미 변경 요약
- Visual QA authorization: approved | declined # RELATIONAL 행이 있을 때
```

Draft 단계에서는 `Status: draft`로 유지한다. 사용자가 카드 전문과 delta를 확인하고
명시적으로 승인한 뒤에만 `approved`와 실제 응답 위치를 기록한다. 에이전트의 추천이나
“사용자가 원할 것”이라는 추론을 Source로 쓰지 않는다.

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
- 각 결정에는 stable 정책 ID(`P*`)와 적용 행을 쓰고, 각 `O*`·`D*` 행의 `정책` 열에도
  같은 ID를 쓴다. 정책 ID와 행 ID의 양방향 참조가 정확히 일치해야 한다.
- UI 상태와 실제 부작용 횟수를 각각 검증한다.
- 전제가 있는 자동 추가 TC는 행으로 만들고, 없으면 N/A와 사유를 기록한다.
- 존재하지 않는 retry, cancel, race를 테스트 목적으로 발명하지 않는다.
- 오류는 기능에 해당하는 subtype별 메시지·복구·부작용을 구분한다.

축약 예시:

```markdown
| ID  | 정책 | Given     | When       | Then           | Never              | 부작용      | BVA           |
| --- | ---- | --------- | ---------- | -------------- | ------------------ | ----------- | ------------- |
| O1  | P1   | 유효 입력 | 저장 클릭  | pending 표시   | 응답 전 성공 UI    | POST×1      | 상태: pending |
| O2  | P1   | pending   | 클릭+Enter | pending 유지   | 두 번째 POST       | POST×1(총)  | 횟수: 1/2     |
| O3  | P2   | pending   | 서버 5xx   | 오류+입력 유지 | 성공 UI, 입력 유실 | 성공 저장×0 | 상태: error   |
```

## 6. Adversarial self-review

각 행에 네 질문을 적용하고 반례가 나오면 행을 보강한다.

1. 이 행을 통과하면서 요구사항을 위반하는 가장 단순한 구현은?
2. 정상적인 다른 구현인데 이 행 때문에 실패할 수 있는가?
3. UI만 흉내 내고 실제 부작용 없이 통과할 수 있는가?
4. loading, error, retry, 연속 입력, 순서 역전 중 관련 있지만 빠진 것은?

예: “저장 중 버튼 disabled”만으로는 disabled 적용 전 POST 두 번을 잡지 못한다.
같은 행에 `POST×1(총)`과 “두 번째 POST 없음”을 병기한다.

Design Intent가 있으면 `visual-design.md`의 genericity·restraint 비평도 수행한다.
출처 있는 미적 요구를 자동화하기 어렵다는 이유로 `NON_ORACLE_OPINION`이나 N/A로
내리지 않는다.

## 7. Draft Oracle과 사용자 확인

새 카드나 의미가 바뀐 revision은 다음 직렬 gate를 반드시 거친다.

1. production을 수정하지 않고 외부 기준과 기존 revision을 조사한다.
2. **Draft Oracle**과 semantic delta, 미결 질문을 만든다.
3. 전체 카드와 delta를 사용자에게 보여주고 다시 확인한다.
4. 승인되면 `User Confirmation`을 `approved`로 바꾸고 실제 응답 위치를 기록한다.
5. 수정 요청이면 Draft를 고쳐 다시 확인한다.
6. 답이 없거나 정책이 충돌하면 `NEEDS_DECISION`으로 멈춘다.

기존 locked Oracle 범위 안의 구현·테스트 보정에는 새 카드를 만들지 않는다. 그러나
`Then`·`Never`·부작용·BVA·Design Intent·정책 출처 중 하나라도 의미가 바뀌면 잠긴
파일을 제자리에서 고치지 않고 새 경로에 Draft revision을 만든다. 새 revision도
사용자 확인 전에는 lint·lock·테스트·production 수정으로 넘어가지 않는다.

## 8. 결정적 revision lock

사용자가 확인한 카드는 self-review 뒤 exact bytes를 파일로 저장하고 bundled
script로 잠근다. Low fast path처럼 새 정책과 카드가 없는 작업은 이 절차에 들어오지
않는다. 대상 레포가 agent artifact 위치를 정하지 않았다면 아래 경로를 사용한다.

Design-only로 잠근 revision을 나중에 Delivery로 확장하면서 architecture·backend 등
새 local source가 필요해지면 기존 lock에 덧붙이지 않는다. source delta를 사용자에게
보여주고 새 revision 경로에서 카드와 전체 source 집합을 한 번에 잠근다. 처음부터
Delivery가 요청됐으면 모든 source 승인을 마칠 때까지 lock을 미룬다.

```text
<repo>/.ai/oracles/<oracle-id>/oracle.md
<repo>/.ai/oracles/<oracle-id>/oracle.lock.json
<repo>/.ai/oracles/<oracle-id>/run-state.json
<repo>/.ai/oracles/<oracle-id>/runs.jsonl
<repo>/.ai/oracles/<oracle-id>/evidence.json
```

### 카드 구조 lint

lock 전에 `oracle-verify.mjs card`를 실행해 구조적 최소선을 기계로 확인한다. lint는
adversarial self-review를 대신하지 않으며, 의미 심사는 6절이 계속 담당한다.

```bash
node <skill-dir>/scripts/oracle-verify.mjs card \
  --oracle .ai/oracles/<oracle-id>/oracle.md
```

검사 항목은 Source Registry와 승인된 User Confirmation 존재, 모든 정책 줄의
stable ID·`(출처: …)`·적용 행, 정책 ID와 행 ID의 양방향 참조, 중복 없는 행 ID,
`O*` 행의 `Then`·`Never`·부작용,
`D*` 행의 계약·출처·증거 계층과 Source Registry 참조, 모호어 부재, 자동 추가 TC
7종의 실제 계약 행 또는 출처 있는 N/A 표기다. `CARD_LINT_FAILED`는 lock 전에
카드를 고쳐야 한다는 뜻이며, 검사를 우회하려고 문구만 바꾸지 않는다.

에이전트가 직접 실행하며 사용자에게 명령 실행을 요청하지 않는다. 승인된 로컬
명세 파일은 `--source`를 반복해 함께 잠근다. URL·Figma 같은 원격 기준은 카드에
정확한 version을 기록해 카드 bytes에 포함하고 외부 기준 게이트에서 다시 확인한다.

```bash
node <skill-dir>/scripts/oracle-lock.mjs create \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --source <local-approved-source>

node <skill-dir>/scripts/oracle-lock.mjs verify \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json
```

- `<skill-dir>`는 현재 host가 실제로 로드한 이 스킬의 디렉터리다. Codex·Claude의
  특정 home 경로를 hardcode하지 않는다.
- 출력된 `sha256:<digest>`가 Oracle revision이다.
- `create`는 동일 bytes의 기존 lock에는 idempotent하지만 변경된 카드·source의 기존
  lock은 덮어쓰지 않는다. 승인된 새 revision은 이전 artifact를 보존하고 새 경로에
  생성한다.
- 모든 새 카드와 revision은 7절에서 카드 전문과 delta를 사용자에게 확인받는다.
  digest는 그 확인된 bytes를 식별하며 사용자 확인을 대신하지 않는다.
- 테스트 작성, production 수정, 독립 리뷰, 완료 상태 발급 직전에
  `verify`를 다시 실행한다. `oracle-run.mjs`의 `exec`와 `transition`은 매 호출마다
  같은 검증을 자동으로 수행한다.
- `ORACLE_CHANGED`·`SOURCE_CHANGED`면 기존 RED·GREEN·리뷰 증거를 폐기하고
  변경 diff와 카드 현재본을 제시해 `NEEDS_DECISION`으로 돌아간다.
- `LOCK_INVALID`·도구 부재·실행 불가는 결정론 판정 실패이므로 `FAIL`이다.
- mismatch를 없애려고 자동 재생성하지 않는다. 재잠금은 source gate, Draft delta,
  사용자 재확인과 self-review를 다시 거친 뒤에만 한다.
- Low risk로 카드를 생략했으면 lock N/A 사유를 남긴다. Medium/High에서 파일시스템이나
  Node가 없으면 Design-only와 Delivery 모두 LLM 판정으로 대체하지 않고 `FAIL`이다.

SHA-256은 drift 검출 장치다. 같은 actor가 lockfile까지 다시 쓸 수 있는 환경에서
승인 권한을 보장하지는 않는다. 강한 승인 통제가 필요하면 lockfile 변경에 CI human
approval·CODEOWNERS·외부 서명을 추가한다. 같은 한계가 run ledger와 상태 파일에도
적용된다.

### Run artifact 초기화

Delivery로 진입하면 lock 직후 run ledger와 상태 파일을 만든다. Design-only로
끝나면 생성하지 않는다.

```bash
node <skill-dir>/scripts/oracle-run.mjs init \
  --dir .ai/oracles/<oracle-id> \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --risk low|medium|high \
  --required-label behavior \
  --required-label lint
```

- `--required-label`은 대상 레포에서 실제 적용되는 targeted test, lint, typecheck,
  build label을 반복해 선언한다. 최소 하나가 필요하며 GREEN과 리뷰 후 재검증에서
  모두 다시 확인한다.
- `init`은 lock을 검증하고 현재 worktree digest를 `ORACLE_READY` 기준선으로 저장한다.
  이 기준선이 이후 TDD 순서 판정의 근거다.
- `--scan-root`는 기본값이 현재 작업 디렉터리다. monorepo에서 판정 범위를 좁힐 때만
  명시한다.
- 상태 파일이 이미 있으면 `init`은 실패한다. 예산과 기준선을 초기화하려고 다시
  실행하지 않는다. 새 revision은 새 `<oracle-id>` 디렉터리를 쓴다.

## 9. 설계 종료 상태

### `ORACLE_READY`

- 외부 기준을 확인하고 카드 상단 Source Registry에 관할·위치·version·승인 상태
  또는 N/A 사유를 기록함
- 카드가 외부 기준의 상태·문구·interaction·부작용을 누락·왜곡하지 않음
- 모든 정책에 인정되는 출처가 있음
- `User Confirmation`이 `approved`이고 새 카드 또는 semantic delta를 승인한 실제
  사용자 응답 위치가 있음
- UI 시각 범위를 기록하고, `local`·`identity-shaping`이면 승인된 Design Intent와
  모든 `D*` 행의 `Never`·출처·증거 계층을 완성함
- `local`·`identity-shaping`이면 Design Change Confirmation의 명시적 사용자 답변
  위치를 기록함
- `identity-shaping`이면 두 번의 설계 pass를 완료한 제안으로 확인받음
- 모든 행의 `Never`와 부작용 횟수가 완성됨
- 자동 추가 TC 7종을 추가하거나 N/A 사유를 기록함
- adversarial self-review를 통과함
- `oracle-verify.mjs card` lint와 revision lock 검증이 통과함

### `NEEDS_DECISION`

미결 질문, 질문별 추천안과 근거, 카드 현재본을 출력한다. 이 상태에서는 테스트와
구현을 진행하지 않는다. 잠긴 적이 있으면 마지막 SHA-256과 mismatch를 함께 출력한다.
카드 현재본은 다음 세션의 재개 자료다.
