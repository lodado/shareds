# Frontend Oracle Outcome Contract

## Outcome Brief

- Actor and context: frontend-oracle-design을 사용해 새 frontend 계약을 설계·구현하는 개발자와 에이전트
- Observable success: 기존 Oracle 행동·시각 계약과 증거 흐름을 유지하면서 제품 목표·비목표·최악 회귀·가역성·제약 종류가 카드와 검증 결과에 명시된다.
- Non-goals: v1/v2 포맷 분기, 기존 카드 migration, 새 Delivery 상태, 새 dependency, Visual QA 또는 릴리즈 자동화 추가
- Worst regression: 기존 O*/D* 행, BVA, RED/GREEN, lock·ledger·evidence 검증이 약화되거나 우회된다.
- Reversibility: 이번 단일 기능 commit을 revert하면 기존 형식과 동작으로 돌아간다.
- Sources: S1, S2, S3

## Source Registry

| ID | Kind | 관할 | 기준 | 위치·version | 승인 상태 |
| --- | --- | --- | --- | --- | --- |
| S1 | product-policy | 기존 계약 보존·상위집합 | 사용자 답변 | “수정은 상위집합으로(기존꺼도 포함)” | approved |
| S2 | product-policy | 호환성 비목표·구현 승인 | 사용자 답변 | “호환은 신경안써도됨 v1v2, 작업” | approved |
| S3 | product-policy | 제품 목표·제약·타입·접근성·성능·협업 개선 | 사용자 제공 Toss Frontend Engineering 합성 스킬과 후속 대화 | current conversation | approved |
| S4 | project-constraint | 검증·릴리즈 관례 | repository | package.json, README.md, adjacent tests | approved |

## User Confirmation

- Status: approved
- Source: 사용자 응답 “ㅇㅇㅇ ㄱㄱㄱㄱ”
- Delta: 기존 카드 형식을 제자리에서 상위집합으로 확장하며 v1/v2 분기는 만들지 않는다.

## 결정된 정책

- P1: 기존 O*/D* 계약, BVA, TDD, lock, ledger와 evidence 흐름을 유지한다. (출처: S1) (행: O1, O2)
- P2: 새 Oracle Card는 완전한 Outcome Brief를 포함하고 verifier가 누락·빈 값을 거부한다. (출처: S3) (행: O3, O4)
- P3: Source Registry는 source의 Kind를 표시하고 보안·개인정보·법적·접근성·데이터 정합성 제약이 제품·시각 정책보다 우선한다. (출처: S3) (행: O5, O6)
- P4: Delivery guidance는 material한 TypeScript 계약, interactive 접근성 기본선, 측정된 성능 주장, 조건부 public API gate와 human-first 보고를 기존 흐름에 추가한다. (출처: S3) (행: O7)
- P5: 카드 포맷을 제자리에서 변경하고 v1/v2 분기나 migration을 추가하지 않는다. (출처: S2) (행: O8)

## Behavior Contract

| ID | 정책 | Given | When | Then | Never | 부작용(종류×횟수) | BVA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | P1 | 새 필드를 모두 가진 완전한 카드 | card lint 실행 | 기존 O*/D* 행과 새 상위 계약을 함께 검증하고 exit 0 | 기존 행 검증 생략 | lint 결과×1 | 상태: success |
| O2 | P1 | 기존 RED/GREEN·lock·ledger 구현 | 변경 적용 | 관련 기존 테스트 92개가 계속 통과 | 증거 gate 약화 또는 삭제 | 기존 상태 전이 변경×0 | 회귀: 기존 suite |
| O3 | P2 | Outcome Brief가 없는 카드 | card lint 실행 | `CARD_LINT_FAILED`와 `outcome-brief` 원인을 출력 | 불완전 카드를 통과 | 오류 출력×1 | 오류: missing section |
| O4 | P2 | Outcome Brief의 필수 값 하나가 빈 카드 | card lint 실행 | 빈 필드 이름을 포함해 실패 | TBD·빈 값 허용 | 오류 출력×1 | 값: empty |
| O5 | P3 | Kind 열이 없는 Source Registry | card lint 실행 | `source-kind` 원인으로 실패 | source 성격을 추측해 통과 | 오류 출력×1 | 오류: missing kind |
| O6 | P3 | 허용되지 않은 Kind를 가진 source | card lint 실행 | invalid Kind를 포함해 실패 | 임의 Kind 허용 | 오류 출력×1 | 값: invalid kind |
| O7 | P4 | React Delivery 또는 public API·성능 주장 작업 | 구현·리뷰 지침 적용 | 해당하는 품질 계약과 증거만 기존 Implementation Decision·review·report에 포함 | 모든 작업에 benchmark·package gate 강제 | 새 dependency 설치×0 | 조건: applicable only |
| O8 | P5 | 현재 카드·lock·run format | 기능 변경 | 단일 현재 형식으로 동작 | schema version 분기·migration 생성 | migration write×0 | 호환성: N/A |

## 자동 추가 TC 적용

- 중복: N/A — card lint는 사용자 action을 중복 실행하는 경로가 없다. (출처: S1)
- 오류: O3~O6에서 구조 오류를 검증한다. (출처: S3)
- 재시도: N/A — lint 실패를 내부에서 자동 재시도하지 않는다. (출처: S1)
- 빈 데이터: O4에서 빈 값을 검증한다. (출처: S3)
- 로딩: N/A — 동기 CLI lint에 loading 상태가 없다. (출처: S1)
- out-of-order: N/A — card lint에 병렬 응답이나 순서 역전 경로가 없다. (출처: S1)
- 취소: N/A — card lint에 취소·이탈 상태가 없다. (출처: S1)

## Visual Contract

N/A — behavior-only 문서·CLI 계약 변경이며 production UI를 변경하지 않는다. (출처: S2)
