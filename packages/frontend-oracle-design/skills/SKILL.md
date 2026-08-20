---
name: frontend-oracle-design
description: Use when the user explicitly requests an Oracle contract or graph-orchestrated delivery loop, or when medium/high-risk frontend behavior or approved visual intent has unresolved policy that must be locked before implementation. Typical cases are mutations, async ordering, duplicate submits, destructive actions, payments, permissions, or data-integrity boundaries. Do not auto-invoke for low-risk copy/token/isolated CSS, straightforward regression fixes inside already approved behavior, screenshot/browser QA, or FSD folder advice alone.
---

# Frontend Oracle Design

요구사항을 **제품 결과·강제 제약·실행 가능한 정답 계약(Oracle Card)**으로 바꾼다.
요구사항을 대체하지 않고 `Outcome Brief → Source Registry → 행동·시각 계약`으로
구체화한다. 기본 동작은 카드 설계에서 멈춘다. 사용자가 구현·자가검증·독립 리뷰까지 명시하면
같은 카드를 불변 기준으로 삼아 Delivery 모드를 끝까지 오케스트레이션한다.

보이는 UI를 만들거나 바꾸면 승인된 디자인 의도도 같은 카드에 포함한다. 디자인을
탐색하는 제안과 승인된 시각 정책을 구분하고, 시각 요구에는 알맞은 증거 계층을 쓴다.
탐색 중 Proposal은 lock하지 않고, 사용자가 선택한 결과만 Delivery 계약으로 승격한다.

production 코드·기존 테스트 관찰은 조사 자료이지 정책 출처가 아니다.
구현과 요구사항이 충돌하거나 결과를 바꾸는 정책이 미결이면 구현에 맞추지 말고
`NEEDS_DECISION`으로 멈춘다.

Oracle은 `Outcome Brief`·`Source Registry`·승인된 계약·revision lock·Delivery 상태 전이만
소유한다. 테스트 작성·판정은 `$test`, screenshot·직접 browser 실행은
`$frontend-visual-qa`, 기능별 구현 선택지는 `$frontend-system-design`이 소유한다.
일반 architecture나 FSD(Feature-Sliced Design) 폴더 조언만 필요한 요청에는 이 스킬을
단독으로 자동 호출하지 않는다.

진입 시 먼저 risk만 짧게 판정한다. **Low fast path는 reference를 로드하지 않고** 카드·lock·
run artifact 없이 기존 레포 검증만 수행한다. 사용자가 Oracle 자체를 명시적으로 요청했거나
Medium/High일 때만 아래 reference와 카드 절차로 들어간다.

## 그래프 오케스트레이션

Oracle 절차는 설치된 `$agent-graph-engineering`을 이름으로 명시적으로 로드·호출하고
[`references/oracle-workflow.graph.json`](references/oracle-workflow.graph.json)을 실행한다.
스킬이나 graph verifier를 찾을 수 없으면 순차 실행으로 우회하지 않고 `FAIL`로 멈춘다.

- Graph Controller는 Node 실행과 Edge 선택만 소유하고, Oracle은 제품 정책·카드·lock·
  ledger·상태 전이와 예산을 계속 소유한다.
- bundled graph를 대상 레포의 `.ai/agent-graphs/<oracle-id>/graph.json`에 그대로 복사하고
  실행 event는 같은 디렉터리의 `events.jsonl`에 append-only로 기록한다.
- 실행 전 bundled `graph-verify.mjs verify`로 그래프를 검사하고, 각 Worker는 현재 Node의
  `task`만 수행해 선언된 output field를 JSON으로 반환한다.
- 다음 경로는 Worker가 고르지 않는다. Controller가 `graph-verify.mjs next`를 실행해
  strict-equality로 일치한 Edge만 활성화한다.
- graph의 `maxSteps`는 전체 runaway 방지 상한이고, policy·harness·product 개별 한도는
  기존 `oracle-run.mjs budget` 판정을 대체하지 않는다.
- graph Node 안에서 `$frontend-oracle-design`을 다시 호출해 재귀 진입하지 않는다. 현재
  로드된 이 계약과 조건부 reference만 적용한다.
- `user-confirmation` gate는 명시적 답변 전 `WAITING_USER`로 멈춘다. 카드·Design Change·
  architecture 확인을 생략하거나 agent가 대신 승인하지 않는다.

## 불변 규칙

- TDD가 기본이다: `ORACLE_READY` → 테스트 작성·실행 → `VALID_RED` 확인 전에는
  production 코드를 작성하거나 수정하지 않는다.
- 테스트 파일을 작성하기 직전에 `$test` 스킬을 이름으로 명시적으로 로드·호출하고
  테스트 작성·실행·판정 권한을 위임한다. `$test`의 파일을 참고만 하는 것으로
  대체하지 않으며, 스킬을 찾거나 로드할 수 없으면 `FAIL`로 멈춘다.
- 제품 정책 출처는 사용자의 명시적 답변 또는 승인된 명세 위치뿐이다. 강제 제약과
  project 계약은 Source Registry에 정확한 위치·version·관할을 별도로 기록한다.
- 모든 새 카드는 사용자·상황, 관찰 가능한 성공, 비목표, 최악 회귀, 가역성을 적은
  `Outcome Brief`와 source `Kind`가 있는 Source Registry를 포함한다. 보안·개인정보·
  법적·접근성·금융 및 데이터 정합성 제약은 제품·시각 선호로 낮추지 않는다.
- 결정된 정책과 계약 행은 stable ID로 양방향 연결하며, 연결되지 않은 정책이나 행을
  lock하지 않는다.
- **새 카드와 의미가 바뀐 모든 revision은 다시 확인받는다.** read-only 조사로
  Draft Oracle과 이전 revision 대비 delta를 먼저 만들고, 카드 전문과 미결 질문을
  사용자에게 보여준 뒤 명시적 승인 응답을 `User Confirmation`에 기록한다. 확인
  전에는 lint·lock·테스트·production 수정을 진행하지 않으며 답이 없으면
  `NEEDS_DECISION`이다.
- 카드의 정책·`Then`·`Never`·부작용 종류와 횟수는 이후 단계에서 바꾸지 않는다.
- Oracle Card는 `scripts/oracle-verify.mjs card`로 구조를 검사한 뒤
  `scripts/oracle-lock.mjs`로 잠그고 각 단계 전 자동 검증한다.
  사용자가 명령을 실행하게 하지 않으며 mismatch를 통과하려고 재잠금하지 않는다.
- **판정에 쓰는 명령은 `scripts/oracle-run.mjs exec`로 실행한다.** 실행 결과는 append-only
  ledger에 기록되고 보고는 자유 서술 대신 runId를 인용한다. ledger에 없는 실행을
  통과로 보고하지 않는다.
- Delivery 상태 전이는 `scripts/oracle-run.mjs transition`으로만 기록한다. 스크립트가
  의미 있는 RED evidence, 필수 run label, flakiness, 테스트 약화, review artifact와
  lock을 검사하며 거부된 전이를 우회하지 않는다.
- 반복 예산은 `scripts/oracle-run.mjs budget`이 계수한다. 머릿속으로 세지 않는다.
- 카드 행 증거는 `evidence.json`에 적고 `scripts/oracle-verify.mjs evidence`로 실제
  run 결과와 대조한다. 존재하지 않는 테스트 이름을 증거로 쓰지 않는다.
- screenshot 비교나 사람이 직접 브라우저에 들어가는 QA는 이 스킬과 `$test`가
  실행하지 않는다. 사용자가 명시적으로 요청했을 때만 별도 `$frontend-visual-qa`를
  이름으로 호출한다. 그 스킬의 artifact는 보조 evidence일 뿐 정책을 만들거나 이
  상태 기계를 대신하지 않는다.
- 카드에 async·순서·중복 제출·다단계 상태 행이 있거나 client state·exported Props·
  shared/package API·trust boundary 타입 형태를 만들거나 바꾸면 구현 전에
  `references/type-constraints.md`를 읽는다. 상태·이벤트·전이표는 카드 `O*` 행에서
  도출하되 구현 타입은 그 문서의 상태 설계 사다리를 따른다. 기존 query·router·form이
  상태를 소유하면 새 `status` union을 만들지 않는다. discriminated union은 기존
  소유자가 표현하지 못하는 진짜 client state에만 만든다. 카드에 없는 상태나 전이가
  필요하면 발명하지 않고 `POLICY_GAP`으로 `NEEDS_DECISION`이다.
- locator·fixture·대기 방법·관찰 계층만 테스트 단계에서 정할 수 있다.
- 테스트는 중앙 디렉터리로 빼지 않고 소유 경계와 함께 이동·삭제되게 둔다. FSD
  레포의 배치는 `references/fsd.md`의 `__test__/` 규칙을 따르고, 레포가 다른 위치를
  명시적으로 강제할 때만 그 관례를 우선하고 사유를 기록한다.
- TDD 시작 시 대상 레포가 이미 쓰는 network test 경계를 우선한다. MSW가 설치됐거나
  도입이 승인됐으면 MSW handler를 쓰고, 그렇지 않으면 기존 transport seam을 사용한다.
  테스트 편의를 위해 dependency를 조용히 추가하지 않는다. handler와 예시 데이터는
  그 경계를 소유한 가장 가까운 곳에 두고 편의상 루트 `mocks/`로 모으지 않는다. FSD
  배치는 `references/fsd.md`를 따른다.
- assertion 약화, `test.skip` 전환, 임의 sleep으로 GREEN을 만들지 않는다.
- test와 subagent는 증거와 비평을 제공하지만 정책을 새로 정하지 않는다.
- AI가 만든 visual direction과 디자인 skill의 결과는 제안이지 정책 출처가 아니다.
  결과를 바꾸는 palette·type·layout·copy·motion·identity는 승인 뒤 카드에 잠근다.
- **Design Change Confirmation은 필수다.** `local`·`identity-shaping`처럼 보이는
  디자인 결과를 바꾸면 변경할 축과 Design Intent를 먼저 보여주고 명시적 사용자
  확인을 받은 뒤에만 lock·테스트·production 수정을 진행한다. 승인된 Figma·문서가
  있어도 확인을 생략하지 않으며, 미확인이면 `NEEDS_DECISION`이다.
- 출처 있는 미적 요구는 정책이다. reviewer의 출처 없는 개인 취향만
  `NON_ORACLE_OPINION`으로 처리한다.
- 구현 best practice는 정책 출처가 아니다. 대상 레포 규칙과 실제 설치 버전을 먼저
  확인하고, 외부 가이드는 충돌하지 않는 구현 선택에만 사용한다.
- **Hook Encapsulation은 승인된 architecture가 `orchestration-only`를 선택한 경우에만
  적용한다.** target glob·rule ID·`allow`·`block`·lint command와 config source를
  잠그고 `hook-encapsulation`을 필수 run label로 둔다. 기존 동등 규칙을 먼저 쓰며
  dependency 설치나 lint config 변경을 조용히 수행하지 않는다. 기계 gate는 직접
  호출 경계를, 독립 review는 UI·비즈니스 로직 분리와 추출된 hook의 응집도를 검수한다.
- 무한 스크롤·검색·채팅·업로드·결제처럼 잘 알려진 기능을 다룰 때는
  `frontend-system-design` skill이 설치돼 있으면 Oracle intake와 제어권을 유지한 채
  해당 reference만 읽는다. reference의 모든 선택은 정책 후보이므로 승인된 source나
  사용자 답변에 매핑하고, 미결이면 `POLICY_GAP`으로 `NEEDS_DECISION`에 돌아간다.
  `남길 검증`은 카드 증거 행으로 매핑한다. 문서의 권장 구조와 구현은 정책 출처가 아닌
  구현 선택지이며 Oracle의 오케스트레이션과 구현 결정을 앞설 수 없다.
- 정책 변경이 필요하면 언제든 카드 현재본과 함께 `NEEDS_DECISION`으로 복귀한다.
  잠긴 카드를 제자리에서 고치지 않고 새 Draft revision과 delta를 만든 뒤 사용자
  재확인 단계로 돌아간다.

## 위험도와 두 개의 Lane

- **Low fast path:** 새 정책·카드·architecture 결정이 없고 기존 승인 계약 안의
  되돌리기 쉬운 copy·token·고립 CSS·명확한 회귀 수정은 스킬 reference와 Oracle
  artifact 없이 관련 테스트와 레포 필수 검증만 수행한다.
- **Medium:** 새 상태·form·responsive 구조처럼 계약이 필요한 변경은 Oracle,
  `VALID_RED`, 필수 GREEN run, 단일 독립 리뷰를 사용한다.
- **High:** 결제·권한·파괴적 작업·데이터 손실·복잡한 concurrency는 full Oracle,
  다중 연속 GREEN, 2-sample 리뷰와 mutation을 사용한다.
- **Discovery Lane:** 여러 Proposal을 read-only로 비교하고 사용자의 선택 이유를
  기록한다. Proposal은 정책도 baseline도 아니다.
- **Delivery Lane:** 사용자가 확인한 한 revision만 lock하고 TDD와 리뷰를 수행한다.

## Reference 로딩

파일은 존재만으로 로드되지 않는다. 아래 조건이 충족될 때만 지정된 파일을 **전부
읽고**, 조건과 무관한 reference는 로드하지 않는다.

| 시점                                                                                                                                                                             | 읽을 파일                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 명시적 Oracle 요청 또는 Medium/High 판정 뒤 카드 작성 시작                                                                                                                       | [`references/bva.md`](references/bva.md), [`references/oracle-card.md`](references/oracle-card.md)                                                                                                                                                                                                                                                                                                                     |
| 새 UI·redesign 또는 보이는 layout·palette·type·copy·motion·responsive·identity 변경을 카드로 만들기 전                                                                           | [`references/visual-design.md`](references/visual-design.md)                                                                                                                                                                                                                                                                                                                                                           |
| 사용자가 screenshot 비교 또는 직접 브라우저 QA를 명시적으로 요청함                                                                                                               | 설치된 `$frontend-visual-qa`를 별도 호출; 이 스킬은 실행을 소유하지 않음                                                                                                                                                                                                                                                                                                                                               |
| Delivery 진입 직후                                                                                                                                                               | 설치된 `$test` 스킬을 이름으로 명시적으로 로드·호출해 SKILL.md 전문과 판정 계약을 활성화하고, 못 찾으면 `FAIL`; [`references/implementation-loop.md`](references/implementation-loop.md), [`references/changeability.md`](references/changeability.md), [`references/frontend-implementation.md`](references/frontend-implementation.md), [`references/architecture-contract.md`](references/architecture-contract.md) |
| 카드에 async·순서 역전·중복 제출·retry·다단계 상태 `O*` 행이 있거나 client state·exported Props·shared/package API·trust boundary 타입 형태를 만들거나 바꾸고 production 수정 전 | [`references/type-constraints.md`](references/type-constraints.md)                                                                                                                                                                                                                                                                                                                                                     |
| 대상 레포에서 이 스킬로 타입 계약을 처음 만들기 전(레포당 1회), 또는 diff가 tsconfig·TypeScript 버전을 바꿈                                                                      | [`references/type-environment.md`](references/type-environment.md) — 결과를 Source Registry에 기록하고 이후 카드에서 반복하지 않음                                                                                                                                                                                                                                                                                     |
| Oracle Delivery가 활성이고 대상 레포가 FSD이거나 FSD 도입이 승인되어, 계약 영향이 있는 FSD 채택·폴더 구조를 **제안·설계·리뷰하기 전**                                            | [`references/fsd.md`](references/fsd.md)                                                                                                                                                                                                                                                                                                                                                                               |
| backend·full-stack·DB 또는 data-access 경계를 만들거나 바꾸기 전                                                                                                                 | [`references/backend.md`](references/backend.md)                                                                                                                                                                                                                                                                                                                                                                       |
| 구현·테스트 검증 후                                                                                                                                                              | [`references/subagent-review.md`](references/subagent-review.md); Design Intent가 있으면 [`references/visual-design.md`](references/visual-design.md)도 다시 읽음                                                                                                                                                                                                                                                      |

## 모드 선택

### Design-only — 기본값

사용자가 Oracle Card, 요구사항 정리, 정책 결정 또는 테스트 계약만 요청하면:

1. 사용자·상황, 관찰 가능한 성공, 비목표, 최악 회귀와 가역성을 `Outcome Brief`로
   정리한다. KPI가 없으면 수치를 발명하지 않는다.
2. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma가 있는지 조사하고,
   정확한 위치·frame·version을 기준 자료로 고정한다.
3. 각 source를 `product-policy`·`mandatory-constraint`·`project-constraint`·
   `implementation-reference`로 분류한다. 강제 제약과 다른 source가 충돌하면 안전한
   쪽을 임의로 낮추지 말고 `NEEDS_DECISION`.
4. 외부 기준이 서로 충돌하거나 필수 자료에 접근할 수 없으면 `NEEDS_DECISION`.
5. 보이는 UI 변경이면 `visual-design.md`로 `behavior-only`·`local`·
   `identity-shaping` 범위를 기록한다. 시각 결과를 바꾸는 제안은 승인받은 뒤 카드에
   Design Intent로 포함한다. `local`·`identity-shaping`은 Design Change Confirmation을
   명시적으로 받고 카드에 기록하며, 미확인·미결이면 `NEEDS_DECISION`.
6. Risk를 판정하고 정책 출처를 조사한다.
7. 필요한 Grill 질문과 BVA를 수행해 **Draft Oracle**을 만든다.
8. 기존 revision이 있으면 semantic delta를, 새 카드면 전체 정책과 미결 질문을
   사용자에게 보여주고 명시적으로 다시 확인받는다.
9. 승인 응답 위치를 `User Confirmation`에 기록하고 Oracle Card를 adversarial
   self-review한다. 수정 요청이면 Draft를 고쳐 다시 확인하며 응답이 없으면
   `NEEDS_DECISION`이다.
10. `oracle-verify.mjs card` lint를 통과시킨 뒤 결정적 revision lock을 생성한다.
11. lock 검증 뒤 `ORACLE_READY`, `NEEDS_DECISION` 또는 도구 실패면 `FAIL`에서 종료한다.
12. 테스트와 production 코드를 작성하지 않는다.

### Delivery — 명시적 요청만

사용자가 구현, 테스트 기반 자가검증 또는 subagent 리뷰까지 명시하면:

1. Design-only의 조사·Draft·사용자 확인 절차까지 수행하되, Delivery가 처음부터
   알려졌으면 architecture·backend source 결정 전에는 lock을 만들지 않고 미룬다.
   Design Intent가 있으면 기록된 Design Change Confirmation 없이는 진행하지 않는다.
2. React architecture 경계·state ownership·public API가 바뀔 때만
   `architecture-contract.md`로 영향 unit의 기존 문서를 읽고, 생성·수정할 정확한
   본문과 diff를 보여준 뒤 명시적 사용자 확인을 받는다. 기존 승인 architecture를
   그대로 따르는 변경은 source hash만 기록하고 이 gate를 반복하지 않는다.
3. backend·DB·data-access 변경이면 `backend.md`로 기존 데이터 경계와 persistence
   정책을 확인하고 승인된 architecture source에 결정을 반영한다. 데이터 경계가
   안정되기 전에는 lock을 만들지 않는다.
4. architecture·backend를 포함한 모든 결과 변경 결정과 local source가 확정되면
   card lint 후 같은 source 집합으로 final lock을 1회 만든다. 기존 Design-only lock에
   필요한 source가 없으면 덧붙이지 않고 새 revision을 사용자에게 확인받아 잠근다.
5. `oracle-run.mjs init`의 `--required-label`로 실제 repo의 targeted test,
   lint·typecheck·build 중 적용되는 필수 명령 label을 고정하고 run ledger와 상태
   파일을 만든다.
   각 단계 직전 revision lock을 자동 검증한다. mismatch면 기존 증거를 폐기하고
   `NEEDS_DECISION`, 손상·도구 오류면 `FAIL`로 멈춘다.
6. 테스트 파일 작성 직전에 `$test` 스킬을 명시적으로 호출하고, 그 계약으로 테스트를
   먼저 작성·실행한다. reporter의 실패 test name을 카드 행에 매핑한 뒤
   `oracle-verify.mjs red`가 통과한 run만 `VALID_RED`로 전이한다.
   network 경계는 레포가 이미 쓰는 test boundary를 우선하고, MSW가 설치됐거나 도입이
   승인된 경우에만 MSW handler를 쓴다. 테스트·handler 배치는 승인된 architecture
   source와 대조하고, FSD면 `references/fsd.md` 규칙을 따른다. 편의상 루트
   `e2e/`·`mocks/`로 모으거나 test만 위해 dependency를 조용히 추가하지 않는다.
7. production 수정 전 `implementation-loop.md`와 `frontend-implementation.md`로 구현
   결정을 기록한 뒤 최소 구현→GREEN을 수행한다.
8. High risk면 sibling `test` skill의 mutation kill·원복·재-GREEN을 먼저 수행한다.
9. `oracle-run.mjs review-packet`으로 원시 리뷰 입력을 생성한 뒤
   `subagent-review.md`로 독립 카드 리뷰, 유효 finding 개선, 필수 label 전체 재실행과
   `oracle-verify.mjs review`를 수행한다.

## 피드백 라우팅

테스트·리뷰의 새 관찰마다 주원인을 하나 기록하고 아래 경로만 사용한다.

| 분류                 | 허용 행동                                                     |
| -------------------- | ------------------------------------------------------------- |
| `POLICY_GAP`         | 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`                |
| `EVIDENCE_GAP`       | 잠긴 카드 범위 안에서 누락된 테스트·reviewer 매핑만 추가      |
| `HARNESS_DEFECT`     | locator·fixture·barrier 등 허용 항목만 공용 2회 예산으로 보정 |
| `PRODUCT_DEFECT`     | 결정론 테스트의 `VALID_RED` 뒤 production 개선 예산 사용      |
| `ENVIRONMENT_DEFECT` | production을 건드리지 않고 실제 원인과 함께 `FAIL`            |
| `NON_ORACLE_OPINION` | 근거와 함께 기록하고 완료 차단이나 정책 변경에 사용하지 않음  |

현재 구현·test 관찰·reviewer 선호는 분류 증거일 뿐 정책 출처가 아니다.
단, 승인된 Design Intent의 불일치는 단순 선호가 아니며 `visual-design.md`의 기준으로
분류한다.

## 반복 예산

| 활동             |         한도 | 계수                                    |
| ---------------- | -----------: | --------------------------------------- |
| 정책 질문        | 최대 2라운드 | `oracle-run.mjs budget --spend policy`  |
| 테스트 기계 보정 |     최대 2회 | `oracle-run.mjs budget --spend harness` |
| production 개선  | 최대 3라운드 | `oracle-run.mjs budget --spend product` |

예산은 서로 대체하지 않는다. 스크립트가 `BUDGET_EXHAUSTED`를 내면 마지막 실제 실패와
함께 `FAIL`로 보고하고 다른 예산으로 우회하지 않는다.

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
