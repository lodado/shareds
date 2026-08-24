---
name: frontend-oracle-design
description: Use when the user explicitly requests an Oracle contract or graph-orchestrated delivery loop, or when medium/high-risk frontend behavior or approved visual intent has unresolved policy that must be locked before implementation. Typical cases are mutations, async ordering, duplicate submits, destructive actions, payments, permissions, or data-integrity boundaries. Do not auto-invoke for low-risk copy/token/isolated CSS, straightforward regression fixes inside already approved behavior, screenshot/browser QA, or FSD folder advice alone.
---

# Frontend Oracle Design

Frontend Oracle는 구현 생성기가 아니라 승인된 frontend behavior·visual intent를
`Outcome Brief → Source Registry → 계약 행 → revision lock → ledger 상태 전이`로 보존하는
Delivery/evidence harness다. 세부 규칙은 reference가 소유하고, 이 파일은 operator map이다.

## 진입 — 무조건 먼저

1. **첫 tool call은 lane 진입 노드 1개를 Read 하는 것이다.** risk가 Low면
   [`lanes/low-fast-path.md`](references/lanes/low-fast-path.md), 그 외에는
   [`common.md`](references/common.md). repo 탐색·답변 작성·다른 도구 호출·다른
   reference 로드는 전부 그 뒤에 온다.
2. **응답 첫 줄에 lane 헤더를 출력한다.** 헤더 없이 본문을 쓰면 위반이다.

   ```text
   risk=<Low|Medium|High> lane=<low-fast-path|oracle> nodes=[실제로 Read 한 노드 id]
   ```

   `nodes`에는 읽을 예정이 아니라 **실제로 Read 한** 노드만 적는다.

3. 플랜·설계·파일 구조·타입을 **말로 설명만** 하는 요청도 이 절차 안이다. "이미 아는 내용"·
   "명세가 충분히 상세함"·"코드를 안 고치니까"는 스킵 사유가 아니다.

진입 판정:

- **Low fast path**는 [`lanes/low-fast-path.md`](references/lanes/low-fast-path.md) 하나만
  로드하고 다른 reference 노드는 로드하지 않는다. 카드·lock·run artifact 없이 기존 레포
  검증만 수행한다. 정책 질문·새 계약·architecture/public API·상태 전이·visual identity가
  생기면 즉시 실격해 Oracle lane으로 승격한다.
- 명시적 Oracle 요청 또는 Medium/High는 [`common.md`](references/common.md)부터 읽는다.
  Risk taxonomy, 권위 우선순위, 정책 출처, 피드백 routing은 `common.md`가 canonical이다.
- 일반 architecture나 FSD(Feature-Sliced Design) 폴더 조언만 필요한 요청에는 이 스킬을
  단독으로 자동 호출하지 않는다.

## 불변 규칙

### 문서 기준 진행

- 각 단계 시작 시 대화 기억이 아니라 disk를 재독한다. `journal.md`는 append-only 단계 근거이며 `implementation-decision.md`와 중복 기록하지 않는다. journal은 정책 출처도 lock 대상도 아니며 카드와 어긋나면 카드가 이긴다.

### TDD와 판정 도구

- Oracle은 `Outcome Brief`·`Source Registry`·승인된 계약·revision lock·상태 전이만
  소유한다. `$test`는 테스트 작성·판정, `$frontend-visual-qa`는 screenshot·직접 browser
  실행, `$frontend-system-design`은 기능별 구현 선택지를 소유한다.
- production 코드·기존 테스트·브라우저 관찰은 조사 증거일 뿐 정책 출처가 아니다. 정책이
  미결이면 `POLICY_GAP` → `NEEDS_DECISION`.
- 새 카드와 의미가 바뀐 revision은 Draft Oracle과 delta를 사용자에게 재확인한다. 확인 전
  lint·lock·테스트·production 수정 금지. 정책 변경은 잠긴 파일 수정이 아니라 새 revision.
- 카드는 `scripts/oracle-verify.mjs card`로 lint한 뒤 `scripts/oracle-lock.mjs`로 잠근다.
  각 단계 직전 revision lock을 자동 검증한다. mismatch 통과용 재잠금 금지.
- TDD 기본: `ORACLE_READY` → 테스트 작성·실행 → `oracle-run.mjs transition --to VALID_RED`
  기록 → `VALID_RED` 분류이며, 그 전 production 작성·수정 금지.
  테스트 파일을 작성하기 직전에 `$test` 스킬을 이름으로 명시적으로 로드·호출하며,
  호출하지 못하면 `FAIL`.
- 판정 명령은 `scripts/oracle-run.mjs exec`로 실행한다. 실행 결과는 append-only
  ledger에 기록되고 보고는 자유 서술 대신 runId를 인용한다. ledger에 없는 실행을
  통과로 보고하지 않는다.
- Delivery 상태 전이는 `scripts/oracle-run.mjs transition`으로만 기록한다. 반복 예산은
  `oracle-run.mjs budget`이 계수한다. 카드 행 증거는 `evidence.json`에 적고
  `scripts/oracle-verify.mjs evidence`로 실제 run 결과와 대조한다.
- assertion 약화, `test.skip`, 임의 sleep, 브라우저 현재 동작을 기대값으로 채택, 카드에
  없는 상태·전이·정책 발명 금지.

## Reference 로딩 — 그래프

reference는 [`reference-graph.json`](references/reference-graph.json)에 선언된 노드다.
`when`은 산출물 시점이 아니라 결정 시점으로 읽는다. 조건 해당 여부가 애매하면 로드한다.
로드를 건너뛸지는 판정 대상이 아니다. 「모드 선택」의 각 단계에 인라인된 읽기 지시가 실행
순서를 소유하며, 이 섹션을 참조로 미루고 단계를 진행하지 않는다.

- graph-orchestrated delivery loop를 명시적으로 요청받은 경우에만 설치된
  `$agent-graph-engineering`을 이름으로 명시적으로 로드·호출하고
  [`graph-orchestration.md`](references/graph-orchestration.md)를 전부 읽은 뒤 bundled workflow 실행.
- 카드 작성: [`card/policy-sources.md`](references/card/policy-sources.md),
  [`card/risk-grill.md`](references/card/risk-grill.md), [`bva.md`](references/bva.md),
  [`card/card-format.md`](references/card/card-format.md),
  [`card/confirmation-lock.md`](references/card/confirmation-lock.md).
- Delivery: Delivery 진입 직후 설치된 `$test` 스킬을 이름으로 명시적으로 로드·호출;
  [`delivery/ledger.md`](references/delivery/ledger.md), [`delivery/red.md`](references/delivery/red.md),
  [`delivery/implementation-decision.md`](references/delivery/implementation-decision.md),
  [`delivery/green-review.md`](references/delivery/green-review.md),
  [`subagent-review.md`](references/subagent-review.md). 리뷰 기준은 프롬프트에 복붙하지 않고
  diff에 해당하는 reference 파일만 `review-packet --review-point`로 전달한다.
- 구현 결정: [`changeability.md`](references/changeability.md),
  [`frontend/authoring.md`](references/frontend/authoring.md),
  [`frontend/decisions.md`](references/frontend/decisions.md),
  [`frontend/quality.md`](references/frontend/quality.md). React architecture 경계·state ownership·public API 변경이면
  [`architecture-contract.md`](references/architecture-contract.md).
- 타입·상태: 카드에 async·순서·중복 제출·retry·다단계 상태 `O*` 행, client state·exported Props·
  shared/package API·trust boundary 타입 변경 전 [`types/state-ladder.md`](references/types/state-ladder.md),
  [`types/authoring.md`](references/types/authoring.md), [`types/api-surface.md`](references/types/api-surface.md),
  [`frontend/decisions.md`](references/frontend/decisions.md). [`state-ladder.md`](references/types/state-ladder.md)는 [`frontend/decisions.md`](references/frontend/decisions.md)와 함께 읽는다.
  기존 query·router·form이 상태를 소유하면 새 `status` union을 만들지 않는다.
- 타입 작업 시 state-ladder와 함께 항상 — 로드는 무조건, 채택은 compiler witness packet gate →
  [`types/advanced-contracts.md`](references/types/advanced-contracts.md). 레포당 1회 또는 tsconfig·TS 버전 변경 시
  [`references/type-environment.md`](references/type-environment.md).
- UI-shaping: 새 UI·redesign·visible layout/palette/type/copy/motion/responsive/identity 변경 전
  [`references/visual-design.md`](references/visual-design.md). `behavior-only`·`local`·`identity-shaping` 범위와
  Design Change Confirmation을 기록한다. `RELATIONAL`·`JUDGMENT` 또는 UI-shaping interaction은 기존
  repo/installed tool로 browser journey 1개를 남긴다. 도구 부재·사용자 declined 상태에서 잠긴
  source-backed N/A도 없으면 `IMPLEMENTED_GREEN`까지만 가능하고 `REVIEW_VERIFIED`는 차단한다.
- Feature-Sliced Design 레포(또는 도입 승인) + FSD 채택·폴더 구조를 제안·설계·리뷰하기 전
  [`references/fsd.md`](references/fsd.md). backend·full-stack·DB·data-access 변경 전
  [`backend.md`](references/backend.md). 성능 요구·개선 claim이 있으면 [`references/performance.md`](references/performance.md).
- 이미 쓰는 network test 경계를 우선한다. MSW가 설치됐거나 도입이 승인됐으면
  handler·예시 데이터는 가장 가까운 곳에 두고 루트 집중 금지. 테스트용 dependency 조용히 추가 금지.
- `frontend-system-design` skill이 설치돼 있으면 Oracle intake와 제어권을 유지한 채 해당
  reference만 읽는다. 모든 선택은 정책 후보이며, 승인된 source나 사용자 답변에 매핑하지
  못하면 `POLICY_GAP`으로 `NEEDS_DECISION`. 문서 권장은 구현 선택지이며 Oracle의 오케스트레이션을 앞설 수 없다.
- Hook Encapsulation은 승인된 architecture가 `orchestration-only`를 선택한 경우에만. 기존
  동등 규칙 우선, dependency 설치나 lint config 변경 금지.
- screenshot 비교·직접 브라우저 QA는 명시적으로 요청했을 때만 별도 `$frontend-visual-qa`를
  이름으로 호출한다. 이 스킬은 별도 browser 완료 상태를 만들지 않는다.
- visual PASS를 Oracle review에 certifiable evidence로 만들 수 있는 producer는 trusted
  `oracle-run --adapter node-test` run뿐이다. 잠긴 test가 Playwright를 호출하고 schema-v3 artifact를
  발행해야 한다. standalone Playwright adapter는 지원하지 않는다. Browser MCP는 관찰 artifact를
  수집할 수 있으나 pending·non-verifying이며 PASS를 만들지 않는다.

## 모드 선택

### Design-only — 기본값

카드·요구사항 정리·정책 결정·테스트 계약만 요청 시:

1. [`common.md`](references/common.md)와
   [`card/policy-sources.md`](references/card/policy-sources.md)를 읽는다 → `Outcome Brief`
   작성. KPI 없으면 수치 발명 금지.
2. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 조사, 정확한 위치·frame·version 고정.
3. source를 `product-policy`·`mandatory-constraint`·`project-constraint`·
   `implementation-reference`로 분류. 강제 제약과 충돌 시 임의로 낮추지 말고
   `NEEDS_DECISION`.
4. 외부 기준끼리 충돌하거나 필수 자료 접근 불가 → `NEEDS_DECISION`.
5. 보이는 UI 변경이면 `visual-design.md`로 `behavior-only`·`local`·`identity-shaping`
   범위 기록. `local`·`identity-shaping`은 Design Change Confirmation을 받고 카드에 기록.
6. Risk 판정 + 정책 출처 조사. lane 헤더의 `risk`를 여기서 확정한다.
7. [`card/risk-grill.md`](references/card/risk-grill.md)·[`bva.md`](references/bva.md)·
   [`card/card-format.md`](references/card/card-format.md)를 읽는다 → 필요한 Grill 질문과
   BVA로 **Draft Oracle** 작성. phase 순서(결과→위험→데이터·아키텍처→API→경합·비동기→상태→시각→성능·운영)를 따르고, 1문1답 인터뷰를 요청하면 라운드 상한 없이 진행한다.
8. 기존 revision은 semantic delta, 새 카드는 전체 정책·미결 질문을 보여주고 명시적으로 재확인.
9. 승인 응답 위치를 `User Confirmation`에 기록하고 adversarial self-review. 수정 요청이면 Draft 고쳐 재확인, 무응답이면 `NEEDS_DECISION`.
10. [`card/confirmation-lock.md`](references/card/confirmation-lock.md)를 읽는다 →
    `oracle-verify.mjs card` lint 통과 후 결정적 revision lock 생성.
11. `ORACLE_READY` | `NEEDS_DECISION` | 도구 실패 `FAIL`에서 종료.
12. 테스트·production 코드 작성 금지.

### Delivery — 명시적 요청만

구현·테스트 기반 자가검증·subagent 리뷰까지 명시 시:

1. Design-only 절차 후 [`delivery/ledger.md`](references/delivery/ledger.md)·
   [`delivery/red.md`](references/delivery/red.md)를 읽는다. Delivery가 처음부터 알려졌으면
   architecture·backend source 결정 전에는 lock을 만들지 않고 미룬다. Design Intent는 기록된
   Design Change Confirmation 없이 진행 금지.
2. React architecture 경계·state ownership·public API 변경 시 `architecture-contract.md` 확인.
   backend·DB·data-access 변경이면 `backend.md` 확인.
3. architecture·backend 포함 모든 결과 변경 결정과 local source 확정 후 card lint → 같은 source
   집합으로 final lock을 1회 만든다. 기존 lock에 덧붙이지 않고 새 revision을 확인받아 잠근다.
4. `oracle-run.mjs init`의 `--required-label`로 실제 repo 필수 명령 label 고정, run ledger·상태
   파일 생성. 각 단계 직전 revision lock을 자동 검증한다.
5. 테스트 파일 작성 직전에 `$test` 스킬을 명시적으로 호출해 테스트를 먼저 작성·실행.
   reporter의 실패 test name을 카드 행에 매핑하고 `oracle-verify.mjs red` 통과 뒤
   `oracle-run.mjs transition --to VALID_RED`를 기록한 run만 `VALID_RED`.
6. `VALID_RED`만 production 수정 전 `delivery/implementation-decision.md`·`frontend/authoring.md`로
   구현 결정을 기록한 후 최소 구현→GREEN 한다. `ALREADY_SATISFIED`는 zero-production verification만
   수행하며 production 편집을 승인하지 않는다. 어느 경로든 GREEN 성공은
   `oracle-run.mjs transition --to IMPLEMENTED_GREEN`을 정확히 한 번 먼저 기록한다.
7. High risk는 sibling `test` skill의 mutation kill·원복·재-GREEN 먼저.
8. Controller가 `oracle-run.mjs review-packet`으로 원시 리뷰 입력과 assignment/dispatch를 생성한다.
   reviewer는 findings만 반환하고 Controller/join이 `oracle-run.mjs review-receipt` ledger event를
   생성한다. receipt의 identity/digest를 `oracle-verify.mjs review`와 final verify에 전달한다.
9. Terminal: `IMPLEMENTED_GREEN` 또는 `REVIEW_VERIFIED`; 정책 미결은 init 뒤
   `oracle-run.mjs transition --to NEEDS_DECISION`과 구조화된 decision·runId를 기록한다.
   init 전에는 정책 증거와 decision만 보존하고 runId를 만들지 않는다. 판정 불가는 실제 error와 `FAIL`.

## 피드백 라우팅

canonical 정의는 [`common.md`](references/common.md). 관찰마다 주원인 하나만 기록한다.

| 분류                 | 경로                                                     |
| -------------------- | -------------------------------------------------------- |
| `POLICY_GAP`         | 카드 현재본과 질문 출력 → `NEEDS_DECISION`               |
| `EVIDENCE_GAP`       | 잠긴 카드 범위의 테스트·mapping 보강                     |
| `HARNESS_DEFECT`     | `$test` 허용 항목과 `budget --spend harness` 안에서 보정 |
| `PRODUCT_DEFECT`     | `VALID_RED` 뒤 production 개선 예산 사용                 |
| `ENVIRONMENT_DEFECT` | production을 건드리지 않고 `FAIL`                        |
| `NON_ORACLE_OPINION` | 기록만 하고 정책·완료 차단에 사용하지 않음               |

예산은 policy 2, harness 2, product 3. `BUDGET_EXHAUSTED`면 마지막 실제 실패와 함께 `FAIL`.

## Delivery 상태

| 상태                | 뜻                                                      |
| ------------------- | ------------------------------------------------------- |
| `IMPLEMENTED_GREEN` | 카드 테스트와 레포 필수 검증이 실제로 통과              |
| `REVIEW_VERIFIED`   | 독립 리뷰 finding 반영 후 테스트와 필수 검증 재통과     |
| `NEEDS_DECISION`    | 결과를 바꾸는 정책이 미결 — 카드 현재본과 질문을 출력   |
| `FAIL`              | 환경·하네스·도구 문제 또는 예산 소진으로 계약 판정 불가 |

Delivery의 정상 완료 상태는 `REVIEW_VERIFIED`다. 단 `RELATIONAL`·`JUDGMENT` visual evidence가
`pending`이거나 Visual QA가 `declined`이고 source-backed N/A revision이 없으면 resumable
`IMPLEMENTED_GREEN` terminal에서 멈춘다. 재개 시 pending visual evidence를 완료한 뒤 review로
진행하며, 이 중간 상태가 `REVIEW_VERIFIED`를 의미한다고 주장하지 않는다.

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
상태 기계: 기록된 전이와 마지막 상태, 사용한 예산 n/한도, ENV_DRIFT 유무, `oracle-run.mjs status --json` 요약
```
