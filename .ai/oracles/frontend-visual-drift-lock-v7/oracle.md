# Frontend Visual Drift Lock Oracle Card

상태: `ORACLE_READY`

## Source Registry

| ID  | 관할                  | 기준                                                                                                             | 위치·version                                                                                      | 승인 상태            |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| S1  | 목표                  | 승인 없이 디자인이 바뀌면 결정론적으로 실패해야 한다                                                             | 사용자 메시지: “디자인이 지 마음대로 바뀌는걸 막고싶음…”                                          | approved             |
| S2  | 보존할 현행 시각 제약 | `HARD / RELATIONAL / JUDGMENT`, 승인 없는 production golden 금지, 전체 DOM snapshot 과결합 금지                  | 기존 계약을 위 결정된 정책과 Behavior Contract에 포함; `visual-design.md`는 implementation target | approved constraints |
| S3  | 실행 방식             | `$frontend-oracle-design` Design-only 절차                                                                       | 사용자 메시지: “$frontend-oracle-design 로 진행해”                                                | approved             |
| S4  | baseline 변경 권한    | baseline 변경 전후 diff를 사용자에게 보여주고 명시적 승인을 받아야 한다                                          | 사용자 메시지: “ㅇㅇ, A 방법만 고정”                                                              | approved             |
| S5  | 혼합 잠금 방식        | semantic DOM + computed style/layout + exact screenshot, 고정 실행 환경, raw HTML/CSS bytes 제외                 | 사용자 메시지: “ㅇㅋㅇㅋ 그렇게 하자.”                                                            | approved             |
| S6  | 시각 테스트 naming    | 기본 `*.style.test.ts(x)`, runner가 `.spec`만 수집하면 `*.style.spec.ts`                                         | 사용자 메시지: “ㅇㅇ 이름도 잠그자 진행해”                                                        | approved             |
| S7  | 독립 디자인 검수      | `JUDGMENT` 계약 또는 baseline 변경 시 `designer` subagent 검수를 필수화하고 baseline 최종 승인은 사용자에게 둔다 | 사용자 메시지: “ㅇㅇㅇㅇㅇㅇㅇㅇ 그것도 추가”                                                     | approved             |
| S8  | 검증 실행 방식        | 별도 직접 브라우저 조작·자가개선 단계는 삭제하고 exact screenshot은 headless 자동 테스트로 유지한다              | 사용자 메시지: “브라우저로 직접체킹하는게 존나느린데 그부분은 삭제해주셈”                         | approved             |
| S9  | 압축 Delivery         | 정책 질문·lock·RED/GREEN·검증을 batch하고 안전한 독립 작업만 병렬화한다                                          | 사용자 메시지: “ㅇㅋㅇㅋ 적용, 다하면 커밋푸쉬…”                                                  | approved             |

## Scope and Risk

- Target: `frontend-oracle-design`의 시각 회귀 증거 계약
- Visual scope: `behavior-only` — 제품 UI를 바꾸지 않고 검증 정책만 추가한다.
- Design Change Confirmation: N/A — 보이는 디자인 결과를 변경하지 않는다.
- Risk: `Medium` — false GREEN이면 승인되지 않은 디자인 drift가 배포될 수 있다.

## 결정된 정책

- 현재 production 화면을 자동으로 정답 baseline으로 채택하지 않는다. (출처: S2)
- 전체 HTML, class name, CSS source bytes 또는 전체 DOM snapshot을 정답 계약으로 삼지 않는다. (출처: S2)
- 계약은 `HARD`, `RELATIONAL`, `JUDGMENT`별로 가장 좁은 유효 증거에 매핑한다. (출처: S2)
- 승인된 baseline과 계약 변경은 일반 제품 변경과 분리해 식별 가능해야 한다. (출처: S1)
- baseline 변경은 변경 전후 diff를 사용자에게 보여주고 명시적 승인을 받은 경우에만 허용한다. (출처: S4)
- stable copy, role, 의미 구조는 semantic DOM snapshot으로 비교한다. (출처: S5)
- 승인된 whitelist의 computed style과 relative layout은 정규화된 snapshot으로 비교한다. (출처: S5)
- 실제 렌더 결과는 pinned Chromium, OS, font, viewport, theme, reduced-motion 조건에서 exact screenshot으로 비교한다. (출처: S5)
- raw HTML/CSS source bytes와 전체 DOM/class-name snapshot은 잠그지 않는다. (출처: S2, S5)
- 시각 계약 테스트는 기본적으로 소유 대상 가까이에 `*.style.test.ts` 또는 `*.style.test.tsx`로 둔다. (출처: S6)
- 기존 runner가 `.spec`만 수집하면 `*.style.spec.ts`를 쓰며, naming만을 위해 test 설정을 확장하지 않는다. (출처: S6)
- 시각 계약 테스트가 레포의 실제 test command에 의해 수집되는지 검증한다. (출처: S1, S6)
- `JUDGMENT` 계약 행 또는 intentional baseline 변경이 있으면 독립 `designer` subagent 검수를 필수로 수행한다. (출처: S7)
- reviewer에는 잠긴 Oracle revision, 승인 baseline, actual screenshot, diff와 viewport·theme·motion 조건만 제공하고 정책·baseline 수정 권한을 주지 않는다. (출처: S2, S7)
- reviewer finding은 기존 분류로 보고하며 baseline 최종 승인은 사용자가 한다. (출처: S4, S7)
- deterministic comparison이 그대로 통과하고 `JUDGMENT` 행과 baseline 변경이 모두 없으면 추가 designer 검수는 N/A로 기록할 수 있다. (출처: S7)
- exact screenshot은 레포 test command가 수집하는 headless `*.style.test/spec` 안에서 실행한다. (출처: S5, S8)
- 별도 직접 브라우저 조작·자가개선 loop와 `BROWSER_VERIFIED` 완료 gate는 사용하지 않는다. (출처: S8)
- 시각 운영 정책은 한 intake에서 묶어 확인하고 모든 결과 변경 질문이 끝난 뒤 Oracle을 한 번 잠근다. (출처: S9)
- lock 전 read-only 조사, `VALID_RED` 뒤 겹치지 않는 파일 구현, targeted GREEN 뒤 root validation과 독립 review만 병렬화한다. (출처: S9)
- 작은 diff는 agent를 만들지 않고, 병렬 구현은 최대 worker 2개와 reviewer 1개로 제한한다. (출처: S9)
- 정책 승인, 최종 lock, `VALID_RED` 전 production 금지, baseline 사용자 승인, 병렬 결과 병합 후 최종 verify는 직렬 gate로 유지한다. (출처: S9)

## Visual Lock

1. `HARD`: copy, role, focus, token 결과, overflow, theme, reduced motion을 semantic DOM과 computed-style assertion으로 비교한다.
2. `RELATIONAL`: 선택된 landmark의 relative bounding box와 pinned-browser exact screenshot을 비교한다.
3. `JUDGMENT`: screenshot을 보존하되 exact pixel match만으로 고유성·절제를 합격시키지 않고 승인자/reviewer 증거를 유지한다.
4. clock, timezone, viewport, theme, reduced motion, font readiness, animation을 고정한 뒤에만 비교한다.
5. mismatch는 baseline을 자동 갱신하지 않고 실패하며, 변경 전후 diff에 대한 사용자 승인 뒤에만 새 revision을 만든다.

## Behavior Contract

| ID  | Given                                               | When                                                              | Then                                                                                                                                      | Never                                                                         | 부작용(종류×횟수)                                  | BVA                       |
| --- | --------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| O1  | 승인된 Visual Lock revision과 고정된 실행 조건      | 동일한 UI 결과를 비교                                             | 모든 비-N/A 계약 행이 통과한다                                                                                                            | baseline 또는 제품 파일 변경                                                  | baseline write×0, product write×0                  | 상태: match               |
| O2  | 승인된 Visual Lock revision과 고정된 실행 조건      | `HARD` 또는 `RELATIONAL` 결과가 달라짐                            | 변경된 계약 행과 실제/기대 차이를 보고하며 실패한다                                                                                       | 자동 승인, baseline 자동 갱신                                                 | baseline write×0, product write×0                  | 상태: mismatch            |
| O3  | 승인된 Visual Lock revision                         | viewport, browser, font, clock 등 필수 실행 조건을 재현할 수 없음 | `ENVIRONMENT_DEFECT`로 판정 불가를 보고한다                                                                                               | 제품 결함으로 오분류, baseline 갱신                                           | baseline write×0, product write×0                  | 상태: environment failure |
| O4  | 기존 baseline이 있음                                | 승인 근거 없이 update가 요청됨                                    | update를 거부한다                                                                                                                         | 기존 revision 덮어쓰기                                                        | baseline write×0                                   | 횟수: 0                   |
| O5  | 승인된 디자인 변경과 새 revision 식별자가 있음      | baseline update가 수행됨                                          | 새 revision을 만들고 이전 revision을 보존한다                                                                                             | 기존 revision 덮어쓰기, 무관한 계약 변경                                      | new baseline write×1, old baseline write×0         | 상태·횟수                 |
| O6  | `JUDGMENT` 계약 행이 있음                           | 자동 비교가 통과함                                                | reviewer/사용자 증거가 없으면 해당 행은 미검증으로 남는다                                                                                 | pixel match만으로 미적 판단을 자동 승인                                       | approval write×0                                   | 상태: evidence gap        |
| O7  | target repo의 test runner와 소유 경계가 확인됨      | 시각 계약 테스트를 추가                                           | 소유 대상 가까이에 `*.style.test.ts(x)`로 배치되고 실제 test command가 수집한다; runner가 `.spec`만 수집하면 `*.style.spec.ts`를 사용한다 | 미수집 테스트, naming만을 위한 runner 설정 변경, 중앙 테스트 디렉터리 이동    | test-config write×0                                | 상태·횟수                 |
| O8  | `JUDGMENT` 행 또는 intentional baseline 변경이 있음 | deterministic 증거 생성이 끝남                                    | 독립 `designer`가 잠긴 Oracle과 baseline/actual/diff를 검수하고 finding을 행별로 보고한다                                                 | reviewer의 정책 발명, baseline 수정·승인, 검수 없는 `REVIEW_VERIFIED`         | policy write×0, baseline write×0, finding report×1 | 상태·횟수                 |
| O9  | Visual Lock을 검증함                                | Delivery 검증을 실행                                              | semantic/style/exact screenshot을 headless test command에서 판정하고 GREEN 뒤 review로 진행한다                                           | 별도 직접 브라우저 조작, 브라우저 자가개선 loop, `BROWSER_VERIFIED` 완료 요구 | direct-browser run×0                               | 상태·횟수                 |
| O10 | 결과를 바꾸는 시각 운영 정책이 아직 미결            | intake를 수행                                                     | evidence, screenshot strictness, baseline authority, naming, designer, direct-browser 여부를 한 번에 질문하고 전부 승인된 뒤 lock한다     | 답 하나마다 lock 생성, 무응답 default                                         | final lock write×1                                 | 상태·횟수                 |
| O11 | 잠긴 Oracle의 `VALID_RED`가 확인됨                  | 독립 구현 작업이 둘 이상 있음                                     | 겹치지 않는 파일 소유권으로 최대 worker×2가 병렬 수정하고 한 번 합쳐 targeted GREEN을 실행한다                                            | RED 전 production 수정, 같은 파일 동시 수정                                   | worker×0..2, targeted GREEN×1                      | 상태·횟수                 |
| O12 | targeted GREEN이 확인됨                             | 최종 검증을 시작                                                  | root test·lint·format과 독립 review를 병렬 실행하고 모두 통과한 뒤 lock을 최종 verify한다                                                 | 일부 결과 전 완료, reviewer finding 미반영                                    | final verify×1                                     | 상태·횟수                 |

## BVA / 조건부 Guard

- 값 경계: N/A — 제품 입력값을 다루지 않는다.
- 상태 경계: match / mismatch / environment failure / evidence gap을 구분한다.
- 시간·순서 경계: baseline revision과 실행 조건을 비교 시작 전에 고정한다.
- 부작용 횟수: 일반 compare는 write×0, 승인된 update만 새 baseline write×1이다.
- network, retry, loading, empty, out-of-order, cancel: N/A — 시각 비교 하네스 자체에는 해당 전제가 없다.
- 비결정 소스: clock, timezone, viewport, browser build, font readiness, theme, reduced motion, animation을 통제한다.

## Adversarial Self-review

- screenshot만 같고 focus/copy/token 계약이 틀릴 수 있음 → O1은 모든 비-N/A 행 통과를 요구한다.
- DOM 구조만 같고 cascade/font/layout 결과가 달라질 수 있음 → source snapshot 대신 computed result와 browser result를 비교한다.
- mismatch 때 baseline을 같이 바꿔 false GREEN을 만들 수 있음 → O2/O4에서 compare write×0과 update 거부를 분리한다.
- 환경 차이를 제품 변경으로 오판할 수 있음 → O3에서 환경 판정과 제품 판정을 분리한다.
- pixel match로 미적 품질을 보장한다고 오판할 수 있음 → O6에서 `JUDGMENT` 증거를 별도로 요구한다.
- `*.style.test.ts(x)` 파일이 있지만 runner가 수집하지 않아 false GREEN일 수 있음 → O7에서 실제 discovery를 요구한다.
- 구현 agent와 reviewer가 같은 기대를 공유해 시각 결함을 놓칠 수 있음 → O8에서 독립 role과 잠긴 증거만 제공한다.
- reviewer가 취향을 새 정책으로 만들거나 baseline을 승인할 수 있음 → O8에서 finding 이외 write/approval×0을 요구한다.
- 직접 브라우저 검증이 deterministic test를 중복 실행해 Delivery를 느리게 할 수 있음 → O9에서 별도 loop×0을 요구한다.
- 정책마다 lock을 만들면 승인된 revision이 불필요하게 늘어남 → O10에서 bundled intake와 final lock×1을 요구한다.
- 무분별한 병렬 수정은 TDD와 파일 소유권을 깨뜨림 → O11에서 `VALID_RED` 이후·겹치지 않는 파일·worker≤2로 제한한다.
- 병렬 validation 하나만 끝나도 완료할 수 있음 → O12에서 모든 결과 join 뒤 final verify를 요구한다.

## Lock

- Oracle revision은 `oracle.lock.json`과 최종 보고에 기록한다.
- Local source: N/A — 기존 제약은 카드 bytes에 포함했고 수정 대상 문서를 source로 잠그지 않는다.
