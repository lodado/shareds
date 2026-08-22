# 공통 계약 — 권위·정책 출처·피드백 라우팅

카드 절차(명시적 Oracle 요청 또는 Medium/High 판정)에 진입하면 다른 reference 노드보다
먼저 읽는다. 여러 reference가 공유하던 중복 정의는 이 문서가 canonical이다 — 각
reference는 자기 단계의 특칙만 더하고, 이 문서와 어긋나면 이 문서가 이긴다.

## 권위 우선순위

사용자가 제공했거나 레포가 승인된 기준으로 지정한 자료의 우선순위. 하위 출처는 상위
출처를 덮어쓰지 않는다.

1. 보안·개인정보·법적·접근성·금융 및 데이터 정합성의 강제 제약(`mandatory-constraint`)
2. 사용자의 명시적 행동 계약과 공개 호환성
3. 대상 레포의 필수 아키텍처·API·테스트 계약(`AGENTS.md`·`CLAUDE.md` 포함)
4. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 원본의 해당 관할
5. 위 기준을 실행 가능한 계약으로 옮긴 Oracle Card
6. 실제 설치 버전의 공식 문서, framework maintainer·커뮤니티 휴리스틱 — 구현
   선택지일 뿐 제품 정책 출처가 아님
7. production 코드·기존 테스트·브라우저 관찰 — 조사 증거일 뿐 정답 권위가 아님

`mandatory-constraint`와 다른 source가 충돌하면 보안·접근성·정합성을 제품·시각 선호로
낮춰 통과하지 않는다. 충돌과 안전한 대안을 제시하고 `NEEDS_DECISION`.

## 관할 규칙

- 기준은 자신의 관할 안에서만 우선한다. Figma는 layout·copy·interaction을 정하지만
  API idempotency를 정하지 못하고, API 계약은 그 반대다.
- 관할이 겹치거나 불명확하면 임의로 절충하지 않고 `NEEDS_DECISION`.
- 기준의 revision/version이 바뀌면 그 기준을 인용한 기존 판정을 무효화하고 다시
  대조한다.

## 정책 출처

인정: 1) 사용자의 명시적 답변, 2) 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma의
정확한 위치·version, 3) 적용되는 보안·개인정보·법적·접근성·데이터 정합성 제약, 4)
레포가 공개 계약으로 지정한 API·architecture·호환성 문서.

인정 안 함: 에이전트 추천안, production 코드, 기존 테스트, 브라우저에서 관찰한 현재
동작, `implementation-reference`로 분류한 framework 문서·구현 휴리스틱, 테스트·subagent
의 증거·비평.

결정된 정책마다 출처를 붙인다. 출처 없는 정책이 하나라도 있으면 `ORACLE_READY`가
아니다.

## 피드백 라우팅 — canonical 분류

테스트·리뷰·구현의 새 관찰마다 주원인 하나를 기록하고 아래 경로만 사용한다. 현재
구현·test 관찰·reviewer 선호는 분류 증거일 뿐 정책 출처가 아니다.

| 분류                 | 뜻                                                     | 라우팅                                                        |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `POLICY_GAP`         | 결과를 바꾸는 정책이 카드에 없거나 미결               | 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`                |
| `EVIDENCE_GAP`       | 잠긴 카드 범위 안의 테스트·매핑 누락                  | 누락된 테스트·reviewer 매핑만 추가                            |
| `HARNESS_DEFECT`     | locator·fixture·barrier 등 테스트 기계 결함           | 허용 항목만 공용 2회 예산(`budget --spend harness`)으로 보정  |
| `PRODUCT_DEFECT`     | 잠긴 계약과 실제 구현의 불일치                        | 결정론 테스트의 `VALID_RED` 뒤 production 개선 예산 사용      |
| `ENVIRONMENT_DEFECT` | 도구·환경 문제로 판정 불가                            | production을 건드리지 않고 실제 원인과 함께 `FAIL`            |
| `NON_ORACLE_OPINION` | 출처 없는 선호·취향                                   | 근거와 함께 기록, 완료 차단이나 정책 변경에 사용하지 않음     |

- revision mismatch는 피드백 분류 대상이 아니다. 기존 증거를 즉시 폐기하고 lock
  규칙대로 `NEEDS_DECISION` 또는 `FAIL`로 이동한다.
- 예산은 서로 대체하지 않는다. `BUDGET_EXHAUSTED`면 마지막 실제 실패와 함께 `FAIL`로
  보고하고 다른 예산으로 우회하지 않는다.

## 공통 상태 의미

- `NEEDS_DECISION` — 결과를 바꾸는 정책이 미결. 카드 현재본, 미결 질문, 질문별
  추천안과 근거를 출력하고 테스트·구현을 진행하지 않는다. 잠긴 적이 있으면 마지막
  SHA-256과 mismatch를 함께 출력한다.
- `FAIL` — 환경·하네스·도구 문제 또는 예산 소진으로 계약 판정 불가. LLM 판정으로
  대체하지 않는다.

## 공통 금지

- ledger를 거치지 않은 실행을 증거로 보고
- mismatch 통과용 자동 재잠금·lock 우회
- assertion 약화, `test.skip` 전환, 임의 sleep으로 GREEN 만들기
- 브라우저의 현재 동작을 기대값으로 채택
- 카드에 없는 상태·전이·정책 발명 — `POLICY_GAP`으로 `NEEDS_DECISION`
