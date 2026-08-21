---
name: frontend-oracle-design
description: Use when the user explicitly requests an Oracle contract or graph-orchestrated delivery loop, or when medium/high-risk frontend behavior or approved visual intent has unresolved policy that must be locked before implementation. Typical cases are mutations, async ordering, duplicate submits, destructive actions, payments, permissions, or data-integrity boundaries. Do not auto-invoke for low-risk copy/token/isolated CSS, straightforward regression fixes inside already approved behavior, screenshot/browser QA, or FSD folder advice alone.
---

# Frontend Oracle Design

- 요구사항을 제품 결과·강제 제약·실행 가능한 정답 계약(Oracle Card)으로 구체화한다:
  `Outcome Brief → Source Registry → 행동·시각 계약`. 기본 동작은 카드 설계에서 멈추고,
  사용자가 구현·자가검증·독립 리뷰까지 명시하면 같은 카드를 불변 기준으로 Delivery를
  오케스트레이션한다.
- Oracle은 `Outcome Brief`·`Source Registry`·승인된 계약·revision lock·Delivery 상태
  전이만 소유한다. 테스트 작성·판정은 `$test`, screenshot·직접 browser 실행은
  `$frontend-visual-qa`, 기능별 구현 선택지는 `$frontend-system-design` 소유.
- 보이는 UI를 만들거나 바꾸면 승인된 디자인 의도도 같은 카드에 포함한다. 탐색 중
  Proposal은 lock하지 않고, 사용자가 선택한 결과만 Delivery 계약으로 승격한다.
- production 코드·기존 테스트 관찰 = 조사 자료. 정책 출처 아님. 결과를 바꾸는 정책이
  미결이면 구현에 맞추지 말고 `NEEDS_DECISION`으로 멈춘다.
- 일반 architecture나 FSD(Feature-Sliced Design) 폴더 조언만 필요한 요청에는 이 스킬을
  단독으로 자동 호출하지 않는다.
- 진입 시 risk부터 짧게 판정한다. **Low fast path는 reference를 로드하지 않고**
  카드·lock·run artifact 없이 기존 레포 검증만 수행한다. 명시적 Oracle 요청 또는
  Medium/High만 카드 절차로 들어간다.

## 그래프 오케스트레이션

설치된 `$agent-graph-engineering`을 이름으로 명시적으로 로드·호출하고
[`references/oracle-workflow.graph.json`](references/oracle-workflow.graph.json)을
실행한다. 스킬이나 graph verifier를 찾을 수 없으면 순차 실행으로 우회하지 않고 `FAIL`.

- Controller는 Node 실행·Edge 선택만 소유. 제품 정책·카드·lock·ledger·상태 전이·예산은
  Oracle이 계속 소유.
- bundled graph를 대상 레포 `.ai/agent-graphs/<oracle-id>/graph.json`에 그대로 복사하고
  실행 event는 같은 디렉터리 `events.jsonl`에 append-only 기록.
- 실행 전 bundled `graph-verify.mjs verify`로 그래프 검사. 각 Worker는 현재 Node의
  `task`만 수행해 선언된 output field를 JSON으로 반환.
- 다음 경로는 Worker가 고르지 않는다. Controller가 `graph-verify.mjs next`를
  `--events events.jsonl`과 함께 실행해 strict-equality로 일치한 Edge만 활성화하고
  `maxSteps` 초과·join 준비를 기계 판정.
- graph `maxSteps`는 runaway 상한일 뿐, `oracle-run.mjs budget` 판정을 대체하지 않는다.
- graph Node 안에서 `$frontend-oracle-design` 재귀 호출 금지. 현재 로드된 계약과 조건부
  reference만 적용.
- `user-confirmation` gate는 명시적 답변 전 `WAITING_USER`로 멈춘다. 카드·Design Change·
  architecture 확인을 생략하거나 agent가 대신 승인하지 않는다.

## 불변 규칙

### 문서 기준 진행

- 각 단계 시작 시 대화 기억이 아니라 disk를 재독한다: 잠긴 카드, lock,
  `journal.md`, `implementation-decision.md`, ledger·상태 파일. 컨텍스트가
  요약된 뒤에는 필수다.
- 단계를 끝낼 때마다 근거를 `.ai/oracles/<oracle-id>/journal.md`에 append-only로
  기록한다: Grill 질문·답·추천안 채택, phase 가지치기 사유, 확인 응답 위치, 피드백
  분류, 인용 runId. 기존 항목은 수정하지 않는다.
- 구현 trade-off는 기존 `implementation-decision.md`에 두고 journal에 중복 기록하지
  않는다.
- journal은 조사 자료다. 정책 출처도 lock 대상도 아니며 카드·ledger를 대체하지
  않는다. 카드와 어긋나면 카드가 이긴다.

### TDD와 판정 도구

- TDD 기본: `ORACLE_READY` → 테스트 작성·실행 → `VALID_RED` 확인 전 production 작성·수정
  금지.
- 테스트 파일을 작성하기 직전에 `$test` 스킬을 이름으로 명시적으로 로드·호출하고
  테스트 작성·실행·판정을 위임한다. 파일 참고로 대체 금지, 스킬을 못 찾으면 `FAIL`.
- 카드는 `scripts/oracle-verify.mjs card`로 구조 검사 후 `scripts/oracle-lock.mjs`로
  잠그고 각 단계 직전 revision lock을 자동 검증한다. 사용자에게 명령 실행을 시키지
  않으며 mismatch 통과용 재잠금 금지.
- **판정 명령은 `scripts/oracle-run.mjs exec`로 실행한다.** 실행 결과는 append-only
  ledger에 기록되고 보고는 자유 서술 대신 runId를 인용한다. ledger에 없는 실행을
  통과로 보고하지 않는다.
- Delivery 상태 전이는 `scripts/oracle-run.mjs transition`으로만 기록한다. 스크립트가
  거부한 전이는 우회하지 않는다.
- 반복 예산은 `scripts/oracle-run.mjs budget`이 계수한다. 머릿속 계수 금지.
- 카드 행 증거는 `evidence.json`에 적고 `scripts/oracle-verify.mjs evidence`로 실제
  run 결과와 대조한다. 존재하지 않는 테스트 이름을 증거로 쓰지 않는다.
- assertion 약화, `test.skip` 전환, 임의 sleep으로 GREEN 만들기 금지.

### 정책 출처와 카드

- 제품 정책 출처 = 사용자의 명시적 답변 또는 승인된 명세 위치뿐. 강제 제약과 project
  계약은 Source Registry에 정확한 위치·version·관할과 함께 기록.
- 새 카드는 사용자·상황, 관찰 가능한 성공, 비목표, 최악 회귀, 가역성을 적은
  `Outcome Brief`와 source `Kind`가 있는 Source Registry 필수. 보안·개인정보·법적·
  접근성·금융 및 데이터 정합성 제약은 제품·시각 선호로 낮추지 않는다.
- 결정된 정책과 계약 행은 stable ID로 양방향 연결. 연결 안 된 정책·행은 lock 금지.
- **새 카드와 의미가 바뀐 revision은 다시 확인받는다.** read-only 조사로 Draft Oracle과
  delta를 만들고, 카드 전문·미결 질문을 보여준 뒤 명시적 승인 응답을
  `User Confirmation`에 기록한다. 확인 전 lint·lock·테스트·production 수정 금지,
  무응답이면 `NEEDS_DECISION`.
- 카드의 정책·`Then`·`Never`·부작용 종류·횟수는 이후 단계에서 불변.
- 정책 변경이 필요하면 잠긴 카드를 제자리에서 고치지 않고 새 Draft revision과 delta로
  사용자 재확인에 돌아간다. 언제든 카드 현재본과 함께 `NEEDS_DECISION` 복귀.
- test·subagent는 증거·비평만 제공, 정책 결정 금지. 구현 best practice도 정책 출처
  아님 — 레포 규칙과 실제 설치 버전을 먼저 확인하고 충돌 없는 구현 선택에만 사용.

### 디자인

- AI visual direction·디자인 skill 결과 = 제안. 결과를 바꾸는 palette·type·layout·copy·
  motion·identity는 승인 뒤 카드에 잠근다.
- **Design Change Confirmation 필수.** `local`·`identity-shaping` 변경은 변경 축과
  Design Intent를 먼저 보여주고 명시적 사용자 확인 후에만 lock·테스트·production 진행.
  승인된 Figma·문서도 확인을 대체하지 않는다. 미확인이면 `NEEDS_DECISION`.
- 출처 있는 미적 요구 = 정책. reviewer의 출처 없는 개인 취향만 `NON_ORACLE_OPINION`.

### 타입·상태

- 카드에 async·순서·중복 제출·다단계 상태 행이 있거나 client state·exported Props·
  shared/package API·trust boundary 타입 형태를 만들거나 바꾸면 구현 전에
  `references/type-constraints.md`를 읽는다. 상태·이벤트·전이표는 카드 `O*` 행에서
  도출하고 그 문서의 상태 설계 사다리를 따른다.
- 기존 query·router·form이 상태를 소유하면 새 `status` union을 만들지 않는다.
  discriminated union은 기존 소유자가 표현 못 하는 진짜 client state에만. 카드에 없는
  상태·전이는 발명하지 않고 `POLICY_GAP`으로 `NEEDS_DECISION`.

### 테스트 경계·배치

- locator·fixture·대기 방법·관찰 계층만 테스트 단계에서 결정 가능.
- 테스트는 중앙 디렉터리로 빼지 않고 소유 경계와 함께 이동·삭제되게 둔다. FSD 레포는
  `references/fsd.md`의 `__test__/` 규칙, 레포가 다른 위치를 명시적으로 강제할 때만 그
  관례 우선 + 사유 기록.
- network 경계는 레포가 이미 쓰는 network test 경계를 우선한다. MSW가 설치됐거나
  도입이 승인됐으면 MSW handler, 아니면 기존 transport seam. 테스트용 dependency 조용히
  추가 금지. handler·예시 데이터는 그 경계를 소유한 가장 가까운 곳에 두고 루트
  `mocks/` 집중 금지.

### 외부 스킬·조건부 게이트

- screenshot 비교·직접 브라우저 QA는 이 스킬과 `$test`가 실행하지 않는다. 사용자가
  명시적으로 요청했을 때만 별도 `$frontend-visual-qa`를 이름으로 호출한다. 그 artifact는
  보조 evidence일 뿐 정책·상태 기계를 대체하지 않는다.
- 무한 스크롤·검색·채팅·업로드·결제 같은 기능은 `frontend-system-design` skill이
  설치돼 있으면 Oracle intake와 제어권을 유지한 채 해당 reference만 읽는다. reference의
  모든 선택은 정책 후보 — 승인된 source나 사용자 답변에 매핑하고 미결이면
  `POLICY_GAP`으로 `NEEDS_DECISION`. `남길 검증`은 카드 증거 행으로 매핑. 문서의 권장
  구조와 구현은 정책 출처가 아닌 구현 선택지이며 Oracle의 오케스트레이션과 구현 결정을
  앞설 수 없다.
- **Hook Encapsulation은 승인된 architecture가 `orchestration-only`를 선택한 경우에만.**
  target glob·rule ID·`allow`·`block`·lint command·config source를 잠그고
  `hook-encapsulation`을 필수 run label로 둔다. 기존 동등 규칙 우선, dependency 설치나
  lint config를 조용히 변경하지 않는다.

## 위험도와 두 개의 Lane

- **Low fast path:** 새 정책·카드·architecture 결정 없는, 기존 승인 계약 안의 되돌리기
  쉬운 copy·token·고립 CSS·명확한 회귀 수정. 스킬 reference·Oracle artifact 없이 관련
  테스트와 레포 필수 검증만 수행.
- **Medium:** 새 상태·form·responsive 구조 등 계약이 필요한 변경. Oracle + `VALID_RED` +
  필수 GREEN run + 단일 독립 리뷰.
- **High:** 결제·권한·파괴적 작업·데이터 손실·복잡한 concurrency. full Oracle + 다중
  연속 GREEN + 2-sample 리뷰 + mutation.
- **Discovery Lane:** 여러 Proposal을 read-only로 비교하고 선택 이유 기록. Proposal은
  정책도 baseline도 아니다.
- **Delivery Lane:** 사용자가 확인한 한 revision만 lock하고 TDD와 리뷰 수행.

## Reference 로딩

조건 충족 시에만 지정 파일을 **전부 읽고**, 무관한 reference는 로드하지 않는다.

- 명시적 Oracle 요청 또는 Medium/High 판정 뒤 카드 작성 시작 → [`bva.md`](references/bva.md), [`oracle-card.md`](references/oracle-card.md)
- 새 UI·redesign 또는 보이는 layout·palette·type·copy·motion·responsive·identity 변경 전 → [`visual-design.md`](references/visual-design.md)
- screenshot 비교·직접 브라우저 QA 명시 요청 → 별도 `$frontend-visual-qa` 호출, 이 스킬은 실행을 소유하지 않음
- Delivery 진입 직후 → 설치된 `$test` 스킬을 이름으로 명시적으로 로드·호출, 못 찾으면 `FAIL`; [`implementation-loop.md`](references/implementation-loop.md), [`changeability.md`](references/changeability.md), [`frontend-implementation.md`](references/frontend-implementation.md), [`architecture-contract.md`](references/architecture-contract.md)
- 카드에 async·순서·중복 제출·retry·다단계 상태 `O*` 행, 또는 client state·exported Props·shared/package API·trust boundary 타입 변경 전 → [`type-constraints.md`](references/type-constraints.md)
- 레포당 1회 — 타입 계약 첫 작성 전, 또는 diff가 tsconfig·TS 버전을 바꿈 → [`type-environment.md`](references/type-environment.md), 결과를 Source Registry에 기록, 카드마다 반복하지 않음
- Delivery 활성 + FSD 레포(또는 도입 승인) + FSD 채택·폴더 구조를 제안·설계·리뷰하기 전 → [`fsd.md`](references/fsd.md)
- backend·full-stack·DB·data-access 경계를 만들거나 바꾸기 전 → [`backend.md`](references/backend.md)
- 성능 요구·개선 claim이 있는 카드 작성 또는 production 수정 전 → [`performance.md`](references/performance.md)
- 구현·테스트 검증 후 → [`subagent-review.md`](references/subagent-review.md); Design Intent 있으면 [`visual-design.md`](references/visual-design.md) 재독

## 모드 선택

### Design-only — 기본값

카드·요구사항 정리·정책 결정·테스트 계약만 요청 시:

1. `Outcome Brief` 작성. KPI 없으면 수치 발명 금지.
2. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 조사, 정확한 위치·frame·version 고정.
3. source를 `product-policy`·`mandatory-constraint`·`project-constraint`·
   `implementation-reference`로 분류. 강제 제약과 충돌 시 임의로 낮추지 말고
   `NEEDS_DECISION`.
4. 외부 기준끼리 충돌하거나 필수 자료 접근 불가 → `NEEDS_DECISION`.
5. 보이는 UI 변경이면 `visual-design.md`로 `behavior-only`·`local`·`identity-shaping`
   범위 기록. `local`·`identity-shaping`은 Design Change Confirmation을 받고 카드에
   기록. 미확인·미결이면 `NEEDS_DECISION`.
6. Risk 판정 + 정책 출처 조사.
7. 필요한 Grill 질문과 BVA로 **Draft Oracle** 작성. Grill은 `oracle-card.md`의 phase
   순서(결과→위험→데이터·아키텍처→API→경합·비동기→상태→시각→성능·운영)를 따르고,
   사용자가 명시적으로 1문1답 인터뷰를 요청한 경우에만 라운드 상한 없이 진행한다.
8. 기존 revision은 semantic delta, 새 카드는 전체 정책·미결 질문을 보여주고 명시적으로
   재확인.
9. 승인 응답 위치를 `User Confirmation`에 기록하고 adversarial self-review. 수정 요청이면
   Draft 고쳐 재확인, 무응답이면 `NEEDS_DECISION`.
10. `oracle-verify.mjs card` lint 통과 후 결정적 revision lock 생성.
11. `ORACLE_READY` | `NEEDS_DECISION` | 도구 실패 `FAIL`에서 종료.
12. 테스트·production 코드 작성 금지.

### Delivery — 명시적 요청만

구현·테스트 기반 자가검증·subagent 리뷰까지 명시 시:

1. Design-only의 조사·Draft·확인 절차 수행. 단 Delivery가 처음부터 알려졌으면
   architecture·backend source 결정 전에는 lock을 만들지 않고 미룬다. Design Intent는
   기록된 Design Change Confirmation 없이 진행 금지.
2. React architecture 경계·state ownership·public API 변경 시에만
   `architecture-contract.md` 게이트: 생성·수정할 본문과 diff를 보여주고 명시적 사용자
   확인. 기존 승인 architecture를 그대로 따르면 source hash만 기록하고 반복하지 않는다.
3. backend·DB·data-access 변경이면 `backend.md`로 기존 데이터 경계·persistence 정책
   확인. 데이터 경계 안정 전 lock 금지.
4. architecture·backend 포함 모든 결과 변경 결정과 local source 확정 후 card lint →
   같은 source 집합으로 final lock을 1회 만든다. 기존 lock에 덧붙이지 않고 새 revision을
   확인받아 잠근다.
5. `oracle-run.mjs init`의 `--required-label`로 실제 repo 필수 명령 label 고정, run
   ledger·상태 파일 생성. 각 단계 직전 revision lock을 자동 검증한다. mismatch면 기존
   증거 폐기 후 `NEEDS_DECISION`, 손상·도구 오류면 `FAIL`.
6. 테스트 파일 작성 직전에 `$test` 스킬을 명시적으로 호출해 테스트를 먼저 작성·실행.
   reporter의 실패 test name을 카드 행에 매핑하고 `oracle-verify.mjs red` 통과 run만
   `VALID_RED`로 전이. network·mock·테스트 배치는 불변 규칙과 승인된 architecture
   source, FSD면 `references/fsd.md` 규칙을 따른다.
7. production 수정 전 `implementation-loop.md`·`frontend-implementation.md`로 구현 결정
   기록 후 최소 구현→GREEN.
8. High risk는 sibling `test` skill의 mutation kill·원복·재-GREEN 먼저.
9. `oracle-run.mjs review-packet`으로 원시 리뷰 입력 생성 → `subagent-review.md`로 독립
   카드 리뷰, 유효 finding 개선, 필수 label 전체 재실행과 `oracle-verify.mjs review`.

## 피드백 라우팅

테스트·리뷰의 새 관찰마다 주원인 하나를 기록하고 아래 경로만 사용한다.

- `POLICY_GAP` → 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`
- `EVIDENCE_GAP` → 잠긴 카드 범위 안에서 누락된 테스트·reviewer 매핑만 추가
- `HARNESS_DEFECT` → locator·fixture·barrier 등 허용 항목만 공용 2회 예산으로 보정
- `PRODUCT_DEFECT` → 결정론 테스트의 `VALID_RED` 뒤 production 개선 예산 사용
- `ENVIRONMENT_DEFECT` → production을 건드리지 않고 실제 원인과 함께 `FAIL`
- `NON_ORACLE_OPINION` → 근거와 함께 기록하고 완료 차단이나 정책 변경에 사용하지 않음

현재 구현·test 관찰·reviewer 선호는 분류 증거일 뿐 정책 출처가 아니다. 승인된 Design
Intent 불일치는 단순 선호가 아니며 `visual-design.md` 기준으로 분류한다.

## 반복 예산

| 활동             |         한도 | 계수                                    |
| ---------------- | -----------: | --------------------------------------- |
| 정책 질문        | 최대 2라운드 | `oracle-run.mjs budget --spend policy`  |
| 테스트 기계 보정 |     최대 2회 | `oracle-run.mjs budget --spend harness` |
| production 개선  | 최대 3라운드 | `oracle-run.mjs budget --spend product` |

예산은 서로 대체하지 않는다. `BUDGET_EXHAUSTED`면 마지막 실제 실패와 함께 `FAIL`로
보고하고 다른 예산으로 우회하지 않는다.

## Delivery 상태

| 상태                | 뜻                                                      |
| ------------------- | ------------------------------------------------------- |
| `IMPLEMENTED_GREEN` | 카드 테스트와 레포 필수 검증이 실제로 통과              |
| `REVIEW_VERIFIED`   | 독립 리뷰 finding 반영 후 테스트와 필수 검증 재통과     |
| `NEEDS_DECISION`    | 결과를 바꾸는 정책이 미결 — 카드 현재본과 질문을 출력   |
| `FAIL`              | 환경·하네스·도구 문제 또는 예산 소진으로 계약 판정 불가 |

Delivery의 정상 완료 상태는 `REVIEW_VERIFIED`다.

## 최종 보고

```text
상태: ORACLE_READY | IMPLEMENTED_GREEN | REVIEW_VERIFIED | NEEDS_DECISION | FAIL
결과: Actor/context, Observable success, 실제 달성 결과, Non-goals
결정: 선택한 최소 경계, State ownership, Server/Client, Async, Type contract, Sources, Rejected
변경: path별 관찰 가능한 행동 변화
검증: targeted test·영향 test·typecheck·lint·build, 접근성, 성능 claim 또는 N/A
위험과 복구: Worst regression, 남은 위험, Reversibility·rollback 또는 N/A
아키텍처: unit별 architecture.md, 승인 답변, Oracle source hash, 레포 구조 검증 또는 reviewer 증거; FSD면 layer·segment·public API·테스트 배치 준수 증거
디자인: Visual scope, Subject, Audience, Single job, Thesis, Signature, Risk, Rejected
디자인 확인: Design Change Confirmation의 사용자 답변 위치
외부 시각 QA: 명시적으로 `$frontend-visual-qa`를 실행했으면 artifact 경로와 판정, 아니면 N/A
구현: 라운드별 카드 행, 가설, 최소 변경, 결과
mutation: High risk kill·원복·재통과 증거 또는 N/A
subagent: 역할, finding, 반영 여부
증거 부록: O*/D* 전 행 매핑, Oracle SHA-256, source hashes, 마지막 verify command와 exit code
runs: 인용한 ledger runId와 label·exit·grade, evidence verify 출력
상태 기계: 기록된 전이와 마지막 상태, 사용한 예산 n/한도, ENV_DRIFT 유무
```
