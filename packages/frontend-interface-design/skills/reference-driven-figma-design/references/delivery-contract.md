# Delivery contract — 편집 가능한 Figma와 검증 범위를 전달한다

모든 handoff는 `schemas/design-delivery.schema.json`의 의미를 따른다. 대화에서는 읽기 쉽게
요약해도 내부 기록은 같은 필드를 유지한다.

[taxonomy·화면 근거·응용 계약](taxonomy-reference-workflow.md)의 Reference Log를 기존
`source_trace.references`의 `source`/`selection_reason`에서 연결한다. 사전 파일/용어, 번역한 검색 의도,
관찰한 화면, 편집 자산, 응용 내용, 적용 node와 실제 비교 캡처를 구분해 남긴다.
정적 검사나 모의 행동 평가를 실제 Figma 실행·시각 품질 검증으로 보고하지 않는다.

## 1. 가장 먼저 전달할 것

1. 실제 Figma URL
2. file/page/frame 식별자와 최종 frame 이름
3. 현재 상태: PILOT_READY / FIGMA_READY / INCOMPLETE / BLOCKED
4. 사용자가 바로 검토할 desktop/mobile 또는 prototype 위치

정적 preview는 보조 증거다. Figma 원본 링크보다 먼저 대체 산출물처럼 제시하지 않는다.

## 2. Source trace

라이브러리 연결, 실제 재사용, 시각 품질은 별개의 주장이다. 연결 성공만으로 화면 전체에 적용됐다고 하지 않는다.
공식 라이브러리와 팀/로컬 파생 자산을 구분한다. 이름에 ADS 같은 시스템명이 있어도 공식임을 입증하지 못하면 파생/미확인으로 표시하고, 자체 토큰을 공식 토큰으로 부르지 않는다.
주요 조립 단위별로 원본 URL/node 또는 component key → 적용 node, `linked instance / copied frame / local derivative`, 유지된 연결·변경한 override를 기존 source trace에 남긴다. 복사한 frame을 linked instance로 보고하지 않는다.

컴포넌트 변경은 [필수 출처 게이트](component-source-gate.md)의 증거 행 위치를 기존
`source_trace.references`의 `source`/`selection_reason`에 연결한다. HOLD인 부분이 있으면
전체 FIGMA_READY 또는 “완료/정상 확인”으로 보고하지 않는다. 필요한 자료가 없는 부분과 이미 검토한
부분을 분리하며, 단순 import/저장 성공을 출처 비교·시각 검토의 통과로 대신하지 않는다.

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
