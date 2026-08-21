# 성능 최적화 판단 가이드

## 목적과 권위

제품 정책이 아니다 — 성능 요구나 개선 claim이 있을 때만 읽는 조건부 구현
reference다. metric·threshold는 승인된 성능 계약이나 사용자 답변이 있어야 정책이
되며, 없으면 `POLICY_GAP`으로 `NEEDS_DECISION`.

측정 명령·baseline/after run·`performance` 필수 label은
[`frontend-implementation.md`](frontend-implementation.md) 7절과
[`implementation-loop.md`](implementation-loop.md)의 GREEN 게이트가 소유한다. 이
문서는 문제 분류·원인 확인·trade-off 판단만 소유한다.

## 1. 문제를 세 축으로 분류한다

| 축             | 뜻                                             | 대표 수단                                                     |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Initial-load   | 전송량, 네트워크 latency, JavaScript 실행 시간 | bundle 축소, cache, prefetch, code splitting, 리소스 우선순위 |
| Runtime        | 총 처리 시간, 렌더링, main-thread blocking     | 알고리즘·자료구조, 작업 분할, 렌더 범위 축소                  |
| Responsiveness | 입력·행동에 대한 화면 반응 지연                | long task 분할, 진행 상태 표시, transition                    |

- 어느 축의 문제인지 먼저 기록한다. 축이 다르면 수단과 검증도 다르다.
- 총 처리 시간과 체감 반응성은 별개다. 작업을 나누면 총 시간이 늘어도 반응성이
  좋아질 수 있다 — 어느 쪽이 제품 요구인지는 정책이며 미결이면 `NEEDS_DECISION`.

## 2. 측정 전에는 최적화하지 않는다

- 개발 장비·네트워크는 실제 사용자보다 빠르다. 동일 route·fixture·viewport·
  device/network 조건을 고정하고 baseline을 먼저 기록한다.
- 원인은 profiler로 확인한다: 브라우저 performance profiler, React Profiler,
  bundle analyzer 등 대상 레포에 이미 있는 도구를 우선한다. 추측한 병목에 먼저
  손대지 않는다.
- 잘못된 code splitting은 첫 화면 리소스를 늦춰 오히려 악화시킨다 — 변경 후에도
  같은 조건으로 재측정한다.

## 3. 가장 작은 병목만 바꾼다

- profiler가 가리킨 병목 영역만 변경하고, 예방적 일괄 최적화(`memo`·`useMemo`·
  prefetch·dynamic import 전면 적용)를 하지 않는다.
- 모든 개선은 비용이 있다: 메모리, 코드량, bundle, 복잡성, 유지보수. 감수한
  비용을 Implementation Decision의 Performance 항목에 trade-off로 기록한다.
- render 파생 값을 effect+setState 연쇄로 만들지 않는다 —
  [`frontend-implementation.md`](frontend-implementation.md)의 상태 소유권 표를
  따른다.

## 4. 검증

- baseline/after run은 `oracle-run.mjs exec`와 `performance` 필수 label로
  기록한다. 비교 가능한 동일 환경이 없으면 "개선됨"을 주장하지 않는다.
- 원시 측정 artifact(trace·reporter 출력) 경로를 증거에 남긴다.

## 채택하지 않는 범용 규칙

- P95/P99 측정을 모든 프로젝트에 강제하지 않는다. 느린 사용자 구간 확인은 승인된
  성능 계약이나 실제 제품 데이터가 있을 때만.
- `React.memo`·prefetch·chunking·web worker를 기본값으로 쓰지 않는다.
- 총 처리 시간보다 반응성이 항상 우선한다고 가정하지 않는다.

## Source Registry

구현 근거일 뿐 제품 정책 출처가 아니다. 실제 설치 버전 문서가 우선한다.

- [web.dev: Performance](https://web.dev/performance)
- [React Profiler](https://react.dev/reference/react/Profiler)
- [Chrome DevTools: Performance panel](https://developer.chrome.com/docs/devtools/performance)
