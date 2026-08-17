---
name: frontend-visual-qa
description: Use when the user explicitly requests frontend screenshot comparison, visual regression, approved baseline creation or update, or direct interactive browser QA. Verifies rendered UI and browser journeys against an approved Oracle Card or user-approved visual source, records reproducible artifacts, and reports findings without changing product policy or production code. Do not use for ordinary behavior TDD; use the separate test skill for deterministic unit, component, integration, or Playwright behavior tests.
---

# Frontend Visual QA

실제 렌더 결과와 브라우저 journey를 검증하는 **독립 evidence skill**이다. 제품 정책,
Oracle 작성, behavior TDD, production 수정은 소유하지 않는다.

## 불변 경계

- 사용자가 screenshot 비교 또는 직접 브라우저 QA를 명시적으로 요청했을 때만
  실행한다. 승인된 Oracle의 `Visual QA authorization: approved`도 명시적 요청으로 인정한다.
  둘 다 없으면 `frontend-oracle-design`이 필요성을 추측해
  자동 실행하지 않는다.
- 승인된 Oracle Card, Figma, 디자인 시스템, baseline과 사용자의 명시적 답변만
  기대 결과의 출처다. 현재 production 화면은 관찰 자료일 뿐 자동 baseline이 아니다.
- 새 정책·baseline 선택·허용치 변경이 필요하면 `NEEDS_DECISION`으로 돌아간다.
- product source와 테스트 assertion을 수정하지 않는다. 제품 결함은 재현 증거와 함께
  `frontend-oracle-design`의 `VALID_RED` 흐름으로 돌려보낸다.
- 브라우저 조작은 **Playwright 또는 이미 연결된 browser MCP** 중 하나로만 수행한다.
  repo에 이미 설치된 쪽을 먼저 쓰고, 이 스킬만을 위해 dependency나 새 runner를
  추가하지 않는다. 둘 다 없으면 `NEEDS_DECISION`으로 멈추고 어느 쪽을 쓸지 묻는다.
- 새 Oracle Delivery 상태를 만들지 않는다. 결과는 보조 artifact이며
  `IMPLEMENTED_GREEN`이나 `REVIEW_VERIFIED`를 대신하지 않는다.

## 1. 모드 선택

사용자 요청에서 필요한 모드만 실행한다.

| 모드           | 사용 시점                                                 | 종료 판정                                |
| -------------- | --------------------------------------------------------- | ---------------------------------------- |
| Screenshot     | 승인 baseline과 실제 렌더의 drift 비교·baseline 후보 확인 | `VISUAL_VERIFIED` 또는 `VISUAL_FAILED`   |
| Direct browser | 사람이 쓰는 것처럼 실제 화면에 들어가 핵심 journey 검증   | `BROWSER_VERIFIED` 또는 `BROWSER_FAILED` |
| Both           | 두 검증을 명시적으로 모두 요청                            | 두 판정을 각각 보고                      |

요청하지 않은 모드를 “더 안전하다”는 이유로 추가하지 않는다.

## 2. 진입 게이트

1. 대상 레포의 `AGENTS.md`·`CLAUDE.md`, 실제 실행 script와 기존 browser 관례를 읽는다.
2. Oracle이 있으면 lock을 검증하고 revision을 기록한다. mismatch면 실행하지 않는다.
3. 검증할 D/O 행, route, state, viewport와 baseline source를 사용자 요청 또는
   승인된 Oracle authorization에서 고정한다.
4. baseline 권위나 기대 결과가 미결이면 현재 자료와 한 번에 묶은 질문을 제시하고
   `NEEDS_DECISION`으로 멈춘다.
5. local/test/staging 환경을 우선한다. production/live는 명시적으로 허용된 read-only
   관찰만 수행하며 submit·삭제·결제 같은 부작용을 만들지 않는다.

Oracle이 없으면 exploratory observation은 가능하지만 `VERIFIED`를 발급하지 않는다.
관찰 결과와 “정책 기준 없음”을 명시하고 `NEEDS_DECISION`으로 끝낸다.

## 3. 공통 환경 고정

재현에 영향을 주는 값만 기록한다.

- commit과 dirty state
- driver: Playwright 또는 browser MCP 이름
- browser 이름·version, OS, font readiness
- viewport, device scale
- light/dark theme와 color scheme
- reduced-motion
- locale, timezone, clock/seed
- role, fixture, storage/session 초기 상태
- base URL과 server readiness

UI 변경이면 최소 320px과 대표 desktop을 확인한다. 앱이 두 theme를 지원하면 둘 다
확인하고 motion 변경이면 reduced-motion도 확인한다. 무관한 조합을 곱집합으로
늘리지 않고 영향받은 상태만 선택한다.

임의 sleep을 사용하지 않는다. 화면 readiness, network response, animation 종료,
font readiness 같은 관찰 가능한 barrier를 기다린다.

## 4. Screenshot 모드

1. baseline의 source, revision, viewport·theme·motion 조건을 확인한다.
2. stable copy·role·의미 구조는 DOM/a11y evidence로, 관계는 layout evidence로,
   최종 drift는 screenshot으로 확인한다.
3. actual과 approved baseline을 같은 환경에서 생성하고 exact diff를 보존한다.
4. mismatch면 영향받은 Oracle 행과 expected/actual/diff를 함께 기록한다.
5. baseline을 자동 update하지 않는다.

일반 compare는 baseline read×1, write×0이다. 새 baseline이나 tolerance 변경은 변경
전후 차이를 사용자에게 보여주고 명시적 승인을 받은 뒤 새 Oracle revision에서만
적용한다. 최초 자동 생성 screenshot을 승인으로 간주하지 않는다.

## 5. Direct browser 모드

핵심 journey 하나씩 다음 순서로 검증한다.

1. clean storage/session과 격리된 test data로 route를 연다.
2. role·accessible name 기반으로 실제 click·keyboard 입력을 수행한다.
3. loading·error·retry·empty·success 중 요청받은 상태를 만든다.
4. focus 이동, URL/navigation, network 요청 횟수·payload, 최종 UI를 확인한다.
5. uncaught exception과 console error를 확인한다.
6. 취소·중복·out-of-order가 대상이면 요청 순서를 결정적으로 통제한다.
7. journey 종료 후 test data와 session을 정리한다.

locator나 fixture 문제가 있으면 최대 2회만 보정한다. assertion 약화, `first()`,
`nth()`, 임의 wait, baseline update로 통과시키지 않는다.

## 6. 판정과 라우팅

| 관찰                                    | 판정·라우팅                                              |
| --------------------------------------- | -------------------------------------------------------- |
| 요청한 행 전부 승인 source와 일치       | 해당 모드 `VERIFIED`                                     |
| 승인 source와 실제 UI가 불일치          | `VISUAL_FAILED` 또는 `BROWSER_FAILED` + `PRODUCT_DEFECT` |
| 카드에 기대 결과가 없거나 source 충돌   | `NEEDS_DECISION` + `POLICY_GAP`                          |
| 요청한 행의 artifact 누락               | 해당 모드 FAILED + `EVIDENCE_GAP`                        |
| locator·fixture·font·viewport 조건 오류 | `HARNESS_DEFECT`, 2회 안에서만 보정                      |
| server·browser·credential·tool 문제     | `FAIL` + `ENVIRONMENT_DEFECT`                            |
| 출처 없는 미적 선호                     | advisory `NON_ORACLE_OPINION`                            |

결함을 발견해도 이 스킬 안에서 product를 고치고 재승인하지 않는다.

## 7. Artifact

레포가 위치를 정하지 않았다면 기존 Oracle 아래에 새 run 디렉터리를 만든다.

```text
.ai/oracles/<oracle-id>/visual-qa/<run-id>/
  report.md
  evidence.json      # Oracle evidence manifest가 인용하는 기계 판독 결과
  actual.png        # Screenshot 모드일 때
  diff.png          # mismatch가 있을 때
  trace/            # Direct browser 도구가 제공할 때
```

기존 run을 덮어쓰지 않는다. `report.md`에는 다음을 기록한다.

```text
상태: VISUAL_VERIFIED | VISUAL_FAILED | BROWSER_VERIFIED | BROWSER_FAILED | NEEDS_DECISION | FAIL
모드: screenshot | direct-browser
Oracle: revision 또는 N/A
baseline: source·revision 또는 N/A
환경: driver(playwright|mcp:<name>), browser/version, viewport, theme, motion, locale/TZ, fixture
행: D1/O1 → PASS|FAIL|N/A + 실제 관찰
artifact: actual/diff/trace 경로와 digest
network: 요청 횟수·payload·실패 또는 N/A
console: uncaught error·console error 또는 없음
보정: n/2와 내용
남은 것: 미검증 항목과 이유
```

`evidence.json`은 잠긴 Oracle bytes의 SHA-256과 통과한 행만 기록한다.

```json
{
  "schemaVersion": 1,
  "oracleSha256": "<64-hex-digest>",
  "rows": { "D1": "passed" }
}
```

Oracle의 전체 evidence manifest에서는 이 artifact를 Oracle 디렉터리 상대 경로로
인용한다.

```json
{
  "kind": "visual",
  "artifact": "visual-qa/<run-id>/evidence.json"
}
```

artifact 경로만 쓰지 말고 `report.md`에 Oracle revision, 행, 판정과 실제 관찰을
함께 남긴다.

## 금지

- 사용자 요청 없이 screenshot이나 직접 브라우저 실행
- 현재 화면을 자동 golden baseline으로 승인
- mismatch를 없애려고 tolerance 또는 baseline 자동 갱신
- production/live에서 파괴적 journey 실행
- visual QA 안에서 정책·Oracle·production 코드 수정
- screenshot 한 장으로 focus·network·console·부작용까지 통과 처리
- 모든 viewport·theme·state의 불필요한 곱집합 생성
- artifact 없이 `VERIFIED` 주장
