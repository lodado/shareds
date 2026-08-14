# 브라우저 검증·자가개선

## 진입과 예산

`IMPLEMENTED_GREEN` 이후 브라우저로 열 수 있는 대상에 수행한다. sibling `test` skill의
브라우저 규칙과 공용 보정 예산을 그대로 적용하며, 이 문서의 최대 2라운드는
sibling `test` skill의 브라우저 2라운드와 **같은 예산**이다.

카드에 Design Intent가 있으면 [`visual-design.md`](visual-design.md)를 전부 다시 읽고
행동 `O*`뿐 아니라 모든 비-N/A 시각 `D*` 행도 실행 전에 증거에 매핑한다.

브라우저 자동화는 locator, 네트워크 요청 횟수·payload, route 통제 등 카드 판정에
필요한 관찰 능력으로 선택한다. headless도 실제 브라우저 검증으로 인정한다.

## 진입 체크

- bundled `oracle-lock.mjs verify`를 실행해 Oracle SHA-256과 exit code를 기록한다.
  mismatch면 브라우저를 열지 않고 기존 증거를 폐기한다.
- readiness probe로 서버가 응답함을 확인한 뒤 navigation한다.
- test data seed/reset 방법과 storage/session 초기화 방법을 확인한다.
- 시간 의존 UI면 clock/timezone을 통제한다.
- 실패 시 screenshot과 가능한 trace/video를 보존한다.
- Design Intent가 있으면 통과한 핵심 상태도 사전 지정 viewport·theme·motion 조건의
  screenshot으로 보존한다. 현재 production 화면을 승인 없는 golden으로 삼지 않는다.
- live/production mutation은 실행하지 않는다.
- 브라우저에서 검증할 행동·시각 Oracle 행을 실행 전에 `행 ID → scenario`로 명시한다.

## 라운드 절차

1. 앱을 실제로 기동하고 대상 URL에 접속한다.
2. storage, session, test data를 초기화한다.
3. 카드의 핵심 시나리오를 사용자처럼 조작한다.
4. UI, 입력값, focus, URL, a11y 속성, 네트워크 횟수·payload를 필요한 만큼 관찰한다.
   Design Intent가 있으면 실제 font, copy, hierarchy, reflow, overflow, signature와
   viewport·theme·reduced-motion 결과도 해당 `D*` 계약 범위에서 관찰한다.
5. 카드의 `Then`, `Never`, 부작용 종류·횟수와 비교한다.
6. 스크린샷, DOM, URL 또는 네트워크 증거와 판정을 기록한다.

대상 레포가 양 테마, 320px, reduced motion 같은 UI 검증을 요구하면 같은 라운드에
포함한다. 카드나 레포 계약에 없는 미적 취향을 새 요구사항으로 만들지 않는다.
반대로 승인된 Design Intent의 불일치는 개인 취향으로 내리지 않는다.

## 불일치 분류와 개선

| 분류                 | 행동                                                         |
| -------------------- | ------------------------------------------------------------ |
| `POLICY_GAP`         | 구현을 따라 기대값을 만들지 말고 `NEEDS_DECISION`            |
| `EVIDENCE_GAP`       | 잠긴 카드 행을 인용해 결정론 테스트·scenario만 추가          |
| `HARNESS_DEFECT`     | 공용 2회 예산 안에서 의미 동일 locator·barrier만 보정        |
| `PRODUCT_DEFECT`     | 결정론 테스트로 재현하고 `VALID_RED` 뒤 최소 production 수정 |
| `ENVIRONMENT_DEFECT` | production을 수정하지 않고 `FAIL`                            |
| `NON_ORACLE_OPINION` | 미적 취향 등은 기록만 하고 정책·완료 상태를 바꾸지 않음      |

승인된 Figma·Design Intent와 실제 UI의 불일치는 `PRODUCT_DEFECT`, 시각 source의
요구가 카드에서 빠졌거나 서로 충돌하면 `POLICY_GAP`, 잘못된 viewport·font fixture·
screenshot 조건이면 `HARNESS_DEFECT`다. 출처 없는 reviewer 취향만
`NON_ORACLE_OPINION`이다.

브라우저 단발 관찰만으로 제품을 수정하지 않는다. 카드 위반을 테스트로 재현하고
`VALID_RED`를 확보한 뒤 `implementation-loop.md`의 최소 구현 절차로 돌아간다.
수정 후 카드 테스트와 레포 필수 검증을 다시 통과하고, 영향받은 브라우저 시나리오를
새 라운드에서 재검증한다.

## 종료

- 사전 매핑한 모든 browser-relevant `O*`·`D*` 카드 행이 통과하면
  `BROWSER_VERIFIED`.
- 매핑되지 않은 browser-relevant 비-N/A 행이 하나라도 있으면 발급하지 않는다.
- 브라우저 대상이 아닌 순수 helper는 N/A와 구체적 사유를 기록한다.
- 열 수 있는 UI인데 도구나 서버 문제로 검증하지 못하면 `BROWSER_VERIFIED`를
  발급하지 않는다.
