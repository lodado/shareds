---
name: test
description: Use when writing, executing, or auditing frontend behavior and headless visual regression tests — new or changed behavior, regression reproduction, async flows with loading, errors, retry, duplicate submits or out-of-order responses.
---

# $test — Oracle 기반 테스트 생성·실행·검증

이 스킬은 승인된 Oracle Card를 테스트 코드로 번역하고 실행한다.
**제품 정책 판단은 하지 않는다** — 정책 문제가 나오면 NEEDS_DECISION으로
frontend-oracle-design에 복귀한다.

## 종료 상태 (넷 중 하나)

| 상태           | 뜻                                                                         |
| -------------- | -------------------------------------------------------------------------- |
| GREEN          | 카드의 테스트 전부 통과 + 레포 필수 검증 통과                              |
| VALID_RED      | 아래 술어를 만족하는 계약 위반 — 제품 버그로 보고, 테스트는 유지           |
| NEEDS_DECISION | **정책 미결 전용** — 카드 전문 + 미결 질문 + 소진 예산 출력 후 oracle 복귀 |
| FAIL           | 환경·하네스·도구·예산 문제로 계약을 판정할 수 없음                         |

환경·하네스 문제(서버 기동 불가, 도구 부재, chromium 미설치 등)는 NEEDS_DECISION이
아니다 — 원인을 적은 FAIL 보고로 끝낸다.

## Step 0: Oracle 게이트

- Low risk(정적 표시, 순수 동기 helper)만 카드 없이 진행 — risk와 사유 한 줄 기록.
- 그 외는 ORACLE_READY 카드가 먼저다. 없으면 `frontend-oracle-design` 스킬부터.
- 테스트를 직접 호출해도 [`references/bva.md`](references/bva.md)를 전부 읽는다.
- 구현·자가개선·독립 subagent 리뷰까지 요청되면 `frontend-oracle-design`의 Delivery
  모드가 오케스트레이터다. 이 스킬은 테스트 판정 권한을 유지한다.
- 카드의 정책·Then·Never·부작용 횟수는 **불변**. 이 스킬이 정할 수 있는 것은
  locator·fixture·대기 방법·관찰 계층뿐이다.

## Step 1: 타깃·관례 조사

대상 파일과 인접 테스트를 읽는다. **대상 레포의 AGENTS.md/CLAUDE.md, 테스트
스크립트, 인접 테스트 관례가 우선**이고, 레포 전용 테스트 스킬이 실제로 발견되면
그것에 위임한다. production 코드는 public surface·wiring 조사 자료일 뿐 기대
결과의 출처가 아니다.

FSD 레포에서는 테스트 locality도 architecture 계약으로 취급한다. 레포가 다른 위치를
명시적으로 강제하지 않으면 테스트를 slice 밖의 중앙 `tests/`·`e2e/`에 만들지 않는다.

- 여러 `model`·`api`·`hooks`·`ui`와 route를 관통하는 scenario·Playwright 테스트:
  `<slice>/__test__/`
- 한 segment 또는 한 production 모듈에 국한된 unit·component 테스트:
  해당 `model|api|hooks|ui/__test__/`
- shared layer 테스트: 해당 shared unit의 가장 가까운 `__test__/`

테스트가 검증하는 가장 좁은 공통 architecture unit을 선택한다. 테스트만 따로 이동해
production과 소유권이 갈라지지 않게 하며, slice 삭제·이동 시 테스트도 함께 따라가게 한다.

## Step 2: 테스트 작성

- 카드 매트릭스의 **모든 행**이 기준. 행마다 Then + Never + 부작용 횟수까지 assert.
- 위치: 위 locality 규칙을 먼저 적용한다. FSD에서는 slice 횡단 scenario를
  `<slice>/__test__/*.scenario.spec.ts`, segment unit·component 테스트를 해당
  `<segment>/__test__/*.unit.test.ts(x)`에 둔다. FSD가 아니면 컴포넌트 옆
  `*.scenario.test.tsx`, 순수 helper 옆 `*.unit.test.ts`, 페이지 플로우는 레포의
  Playwright 관례를 따른다.
- 값 선정은 카드의 BVA 열 근거 — 임의 값 금지, 이유가 자명하지 않으면 주석.
- assertion은 정확한 값·횟수: `toBe(1)`, `error.code`. `toBeTruthy`·`>0` 금지.
- 관찰 가능한 것만: 렌더된 UI, 입력값, 공개 콜백, 네트워크 요청(횟수·payload),
  URL, focus, a11y 속성(role·name·aria). 내부 state·hook 호출·dispatch 검사 금지.
  production 조건문·계산식 복제 금지.
- loading·race는 deferred **pending barrier**로 완료 시점을 테스트가 통제
  (bva.md 패턴). 임의 sleep 금지.

Playwright 규칙 (예외 없음):

1. 셀렉터 `role` > `text` > `data-testid` > CSS(최후 수단, 사유 주석 필수)
2. `waitForTimeout` 금지 — 요소·네트워크 조건 대기 또는 barrier 해제
3. 각 test 독립 실행 가능 — `test.only` 단독 실행도 통과
4. Next.js Image: DOM 존재가 계약일 때만 `toBeAttached`. 표시·로드가 계약이면
   scroll into view 후 visible 또는 `naturalWidth > 0`
5. 어느 계층에서도 판정 불가한 것만 `test.skip` + 사유 — 계층 이동(unit/API)을
   먼저 검토

Visual Lock은 headless `*.style.test.ts(x)` 또는 기존 runner가 `.spec`만 수집할 때
`*.style.spec.ts`에서 실행한다. semantic DOM, computed style/layout, exact screenshot을
같은 test command로 판정하며 별도 직접 브라우저 조작·자가개선 단계는 실행하지 않는다.

비-N/A Oracle 행이 skip되면 `GREEN`을 발급하지 않는다.
다른 계층에서 검증하거나, 출처 있는 N/A로 Oracle에 복귀하거나, `FAIL`로 보고한다.

## Step 3: 실행 + 기계 보정 (도합 2회)

작성한 테스트를 **실제로 실행**한다. 실행 없이 통과 주장 금지.

`frontend-oracle-design`의 Delivery 오케스트레이션 안에서 실행할 때는 판정 명령을
`scripts/oracle-run.mjs exec`로 돌린다. 실행이 append-only ledger에 runId로 기록되고,
보고의 실행 증거는 그 runId를 인용한다. reporter 출력 경로(`--report`)를 함께 넘기면
테스트 이름과 상태까지 기록되어 카드 행 증거를 기계로 대조할 수 있다. 보정 1회를 쓸
때마다 `oracle-run.mjs budget --spend harness --reason ...`으로 계수한다.

FAIL이면 원인 분류. **기계장치 문제만 보정 가능** — 도합 2회이며,
1회 = 허용된 수정 한 묶음 + 해당 실패 재실행:

- 허용: 잘못된 import / fixture의 **누락 전제** 보충 / 의미 동일 locator(동일
  role·name 유지, 단일 요소로 resolve) / pending barrier 연결 / dev 서버 기동
- 금지: assertion 약화, visible→attached 전환, `test.skip` 전환, fixture에 기대
  결과 인코딩, 단정 대상 자체를 기다려서 race를 직렬화, `first()`/`nth()`로
  cardinality 오류 은폐, screenshot 허용치(`maxDiffPixels`·`maxDiffPixelRatio`·
  `threshold`) 상향

금지 항목은 GREEN 전이에서 기계로 검사된다. `VALID_RED` 시점 대비 assertion 수가
줄거나 위 토큰이 새로 들어오면 `TEST_WEAKENED`로 거부되므로, 보정은 허용 항목
안에서만 한다.

### VALID_RED 술어 — 전부 만족해야 발급

1. 실제 실행이 non-zero exit
2. 실패가 특정 카드 행의 Then/Never 위반과 일치 (예: `Expected 1, Received 2`)
3. 대상 화면·사전조건·fixture가 정상 로드됐음
4. 문법·타입·import·서버 미기동·인증·잘못된 locator·timeout 등 인프라 원인 아님

신규 기능의 첫 RED에서 Oracle이 요구한 public component·route·export 자체가 아직
없는 경우는 예외다. 대상 경로가 카드와 일치하고 테스트 파일·fixture·인증·부모
화면 등 나머지 하네스가 정상임을 입증하면 그 미존재를 `VALID_RED`로 인정한다.
카드 대상이 아닌 일반 missing import/module은 계속 인프라 실패다.

계약상 존재해야 할 요소의 미발견은 조건 3을 먼저 입증한 경우에만 유효 RED다
(미구현 기능의 정상 TDD RED). 보고에 실행 command와 실패 출력 원문을 첨부한다.
**술어를 못 채운 RED로 production을 수정하지 않는다** — 보정하거나 FAIL로 보고.

보정 2회 소진 후에도 FAIL이면 원인과 함께 그대로 보고 — 가짜 GREEN 금지.

## Step 4: High risk mutation (해당 시에만)

GREEN 이후 결제·삭제·저장·권한이면 핵심 guard 1개를 고른다.
`VALID_RED` 또는 `FAIL` 상태에서는 mutation을 실행하지 않는다.

1. 대상 파일의 pre-mutation diff/preimage와 mutation hunk를 기록한다.
2. 다른 변경과 겹치는 hunk면 mutation을 중단하고 사유를 보고한다.
3. guard 제거 → 해당 카드 행 테스트가 죽는지 확인한다.
4. 저장한 preimage로 **수정한 hunk만 원복**한다.
5. 원복 후 diff가 mutation 전 상태와 같은지 확인하고 GREEN을 재실행한다.

mutation은 로컬 소스 변경이지 라이브 부작용 실행이 아니다. production/live 서비스에
연결된 상태에서는 실행하지 않는다. High risk GREEN에는 kill·원복·재-GREEN 증거가 필요하다.

## Step 5: 보고

```text
상태: GREEN | VALID_RED | NEEDS_DECISION | FAIL
카드: O1→test name, O2→N/A 사유 형식의 전 행 증거 매핑
실행: command + PASS/FAIL 수 (실제 출력에서), ledger를 썼으면 runId와 grade
보정: 사용 횟수/2 + 내역
mutation: High risk면 kill + 원복 증거, 아니면 N/A
남은 것: 커버 못 한 행과 사유
```
