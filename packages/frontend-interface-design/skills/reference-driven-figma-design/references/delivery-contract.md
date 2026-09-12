# Delivery contract — 편집 가능한 Figma와 검증 범위를 전달한다

모든 handoff는 `schemas/design-delivery.schema.json`의 의미를 따른다. 대화에서는 읽기 쉽게
요약해도 내부 기록은 같은 필드를 유지한다.

## 1. 가장 먼저 전달할 것

1. 실제 Figma URL
2. file/page/frame 식별자와 최종 frame 이름
3. 현재 상태: PILOT_READY / FIGMA_READY / INCOMPLETE / BLOCKED
4. 사용자가 바로 검토할 desktop/mobile 또는 prototype 위치

정적 preview는 보조 증거다. Figma 원본 링크보다 먼저 대체 산출물처럼 제시하지 않는다.

## 2. Source trace

- 선택된 base template과 실제 구조 확인 수준
- 사용한 내부 components/variables/patterns
- section별 selected reference와 source
- 가져온 structural principle
- 복사하지 않은 visual traits
- 새로 만든 Experiment 또는 Approved 변경

## 3. Critique trace

- iteration 수
- round별 top issues와 fixes
- 확인한 viewport/state
- AI slop 제거·유지 판단
- unresolved와 unreviewed

`iteration_count`는 실제 `rounds` 길이와 일치해야 한다. 각 round는 고유한 version과 관찰 기록을 가진다.
문제가 없으면 `top_issues`와 `fixes`는 빈 배열로 두고 `result`에 실제 검토한 기준과 수정 불필요 이유를
기록한다. 검토 횟수를 채우려고 문제나 수정을 발명하지 않는다.
요청의 전체 section, viewport, state와 전달한 완료 목록을 대조한다. JSON Schema만으로 범위 간
일치나 실제 Figma 관찰을 증명할 수 없으므로 도구 결과와 함께 확인한다.
반복 횟수만으로 품질을 주장하지 않는다. 실제 frame을 보고 어떤 문제가 개선됐는지 연결한다.

## 4. 결과 상태

- **FIGMA_READY**: editable Figma, 전체 합의 범위, 실제 critique와 수정 후 재검토, 합의된 log/catalog 기록.
  2–4회는 권장치이며 적거나 더 많은 경우 이유를 남긴다. 범위 안의 unresolved/unreviewed는 없어야 한다.
- **PILOT_READY**: 합의한 pilot(보통 3개, 작은 범위는 1–3개)만 검증됨. 전체 page 완료가 아니다.
- **INCOMPLETE**: 일부 frame은 있으나 asset, state, responsive, critique gate가 남음.
- **NEEDS_INPUT**: 제품 방향을 바꾸는 사용자 결정이 필요함.
- **BLOCKED**: Figma write, 필수 원본, 권한 또는 유료/라이선스 승인 때문에 진행 불가.

## 5. 완료와 승인 분리

- `technical`: Figma read/write와 구조 확인 결과.
- `design-self-review`: ready / incomplete / unreviewed.
- `user-acceptance`: accepted / rejected / not-obtained.

FIGMA_READY는 스킬의 self-review 완료 상태다. 사용자의 실제 승인, usability test, conversion 개선,
frontend QA를 의미하지 않는다.

## 6. 금지된 handoff

- 접근하지 않은 Figma URL, node ID, component, variable을 발명한다.
- PNG 또는 HTML을 “Figma 시안”이라고 부른다.
- 미완성 pilot을 전체 page 완료로 보고한다.
- code generation을 작업 성과에 포함한다.
- 가짜 metric/testimonial/logo를 실제 content처럼 전달한다.
