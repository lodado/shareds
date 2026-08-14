---
name: frontend-oracle-design
description: Use when frontend behavior or approved visual intent must be pinned down before tests or implementation, or when the user wants an Oracle-driven delivery loop covering deterministic contract locking, TDD, React/Next state and async boundary decisions, browser self-verification, and independent review. Applies to new or changed features, regression bugs, ambiguous policies, async loading, errors, retry, duplicate submits, races, out-of-order responses, and UI creation or redesign involving layout, typography, copy, motion, responsive behavior, or visual identity.
---

# Frontend Oracle Design

요구사항을 **실행 가능한 정답 계약(Oracle Card)**으로 바꾼다. 기본 동작은 카드
설계에서 멈춘다. 사용자가 구현·자가검증·브라우저 검증·독립 리뷰까지 명시하면
같은 카드를 불변 기준으로 삼아 Delivery 모드를 끝까지 오케스트레이션한다.

보이는 UI를 만들거나 바꾸면 승인된 디자인 의도도 같은 카드에 포함한다. 디자인을
탐색하는 제안과 승인된 시각 정책을 구분하고, 시각 요구에는 알맞은 증거 계층을 쓴다.

production 코드·기존 테스트·브라우저 관찰은 조사 자료이지 정책 출처가 아니다.
구현과 요구사항이 충돌하거나 결과를 바꾸는 정책이 미결이면 구현에 맞추지 말고
`NEEDS_DECISION`으로 멈춘다.

## 불변 규칙

- TDD가 기본이다: `ORACLE_READY` → 테스트 작성·실행 → `VALID_RED` 확인 전에는
  production 코드를 작성하거나 수정하지 않는다.
- 정책 출처는 사용자의 명시적 답변 또는 승인된 명세 위치뿐이다.
- 카드의 정책·`Then`·`Never`·부작용 종류와 횟수는 이후 단계에서 바꾸지 않는다.
- Medium/High 카드는 `scripts/oracle-lock.mjs`로 잠그고 각 단계 전 자동 검증한다.
  사용자가 명령을 실행하게 하지 않으며 mismatch를 통과하려고 재잠금하지 않는다.
- locator·fixture·대기 방법·관찰 계층만 테스트 단계에서 정할 수 있다.
- FSD 레포의 테스트는 slice 밖 중앙 디렉터리로 빼지 않는다. 여러 segment를 관통하는
  scenario·Playwright 테스트는 `<slice>/__test__/`, 한 segment에 국한된 unit·component
  테스트는 해당 `model|api|hooks|ui/__test__/`에 두어 production과 함께 이동·삭제되게 한다.
  레포가 다른 위치를 명시적으로 강제할 때만 그 관례를 우선하고 사유를 기록한다.
- assertion 약화, `test.skip` 전환, 임의 sleep으로 GREEN을 만들지 않는다.
- 브라우저와 subagent는 증거와 비평을 제공하지만 정책을 새로 정하지 않는다.
- AI가 만든 visual direction과 디자인 skill의 결과는 제안이지 정책 출처가 아니다.
  결과를 바꾸는 palette·type·layout·copy·motion·identity는 승인 뒤 카드에 잠근다.
- **Design Change Confirmation은 필수다.** `local`·`identity-shaping`처럼 보이는
  디자인 결과를 바꾸면 변경할 축과 Design Intent를 먼저 보여주고 명시적 사용자
  확인을 받은 뒤에만 lock·테스트·production 수정을 진행한다. 승인된 Figma·문서가
  있어도 확인을 생략하지 않으며, 미확인이면 `NEEDS_DECISION`이다.
- 출처 있는 미적 요구는 정책이다. reviewer의 출처 없는 개인 취향만
  `NON_ORACLE_OPINION`으로 처리한다.
- 구현 best practice는 정책 출처가 아니다. 대상 레포 규칙과 실제 설치 버전을 먼저
  확인하고, 외부 가이드는 충돌하지 않는 구현 선택에만 사용한다.
- 정책 변경이 필요하면 언제든 카드 현재본과 함께 `NEEDS_DECISION`으로 복귀한다.

## Reference 로딩

파일은 존재만으로 로드되지 않는다. 아래 조건이 충족될 때만 지정된 파일을 **전부
읽고**, 조건과 무관한 reference는 로드하지 않는다.

| 시점                                                                                                   | 읽을 파일                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 모든 실행의 시작                                                                                       | [`references/bva.md`](references/bva.md), [`references/oracle-card.md`](references/oracle-card.md)                                                                                                                                                                               |
| 새 UI·redesign 또는 보이는 layout·palette·type·copy·motion·responsive·identity 변경을 카드로 만들기 전 | [`references/visual-design.md`](references/visual-design.md)                                                                                                                                                                                                                     |
| Delivery 진입 직후                                                                                     | [`../test/SKILL.md`](../test/SKILL.md), [`references/implementation-loop.md`](references/implementation-loop.md), [`references/frontend-implementation.md`](references/frontend-implementation.md), [`references/architecture-contract.md`](references/architecture-contract.md) |
| GREEN 후 브라우저로 열 수 있음                                                                         | [`references/browser-verification.md`](references/browser-verification.md); Design Intent가 있으면 [`references/visual-design.md`](references/visual-design.md)도 다시 읽음                                                                                                      |
| 구현·브라우저 검증 후                                                                                  | [`references/subagent-review.md`](references/subagent-review.md); identity-shaping이면 [`references/visual-design.md`](references/visual-design.md)도 다시 읽음                                                                                                                  |

## 모드 선택

### Design-only — 기본값

사용자가 Oracle Card, 요구사항 정리, 정책 결정 또는 테스트 계약만 요청하면:

1. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma가 있는지 먼저 조사하고,
   정확한 위치·frame·version을 기준 자료로 고정한다.
2. 외부 기준이 서로 충돌하거나 필수 자료에 접근할 수 없으면 `NEEDS_DECISION`.
3. 보이는 UI 변경이면 `visual-design.md`로 `behavior-only`·`local`·
   `identity-shaping` 범위를 기록한다. 시각 결과를 바꾸는 제안은 승인받은 뒤 카드에
   Design Intent로 포함한다. `local`·`identity-shaping`은 Design Change Confirmation을
   명시적으로 받고 카드에 기록하며, 미확인·미결이면 `NEEDS_DECISION`.
4. Risk를 판정하고 정책 출처를 조사한다.
5. 필요한 Grill 질문과 BVA를 수행한다.
6. Oracle Card를 adversarial self-review한다.
7. Medium/High 카드를 파일로 저장하고 결정적 revision lock을 생성한다. High risk면
   카드 전문과 SHA-256을 함께 확인받는다.
8. lock 검증 뒤 `ORACLE_READY`, `NEEDS_DECISION` 또는 도구 실패면 `FAIL`에서 종료한다.
9. 테스트와 production 코드를 작성하지 않는다.

### Delivery — 명시적 요청만

사용자가 구현, 테스트 기반 자가검증, 브라우저 자가개선 또는 subagent 리뷰까지
명시하면:

1. 먼저 Design-only 절차로 잠긴 `ORACLE_READY`를 만든다.
   Design Intent가 있으면 기록된 Design Change Confirmation 없이는 진행하지 않는다.
2. React production 변경이면 `architecture-contract.md`로 영향 unit의 기존 문서를
   읽고, 생성·수정할 정확한 본문과 diff를 보여준 뒤 명시적 사용자 확인을 받는다.
   승인 전에는 architecture 문서·테스트·production을 수정하지 않는다. 승인된 문서를
   Oracle lock의 local source로 포함한다.
3. 각 단계 직전 revision lock을 자동 검증한다. mismatch면 기존 증거를 폐기하고
   `NEEDS_DECISION`, 손상·도구 오류면 `FAIL`로 멈춘다.
4. High risk면 카드 전문과 SHA-256에 대한 사용자 확인 전에는 진행하지 않는다.
5. sibling `test` skill 계약으로 테스트를 먼저 작성·실행해 `VALID_RED`를 확인한다.
   FSD이면 테스트 위치도 승인된 architecture source와 대조해 가장 가까운 slice 또는
   segment의 `__test__/`에 둔다. 편의상 루트 `e2e/`로 모으지 않는다.
6. production 수정 전 `implementation-loop.md`와 `frontend-implementation.md`로 구현
   결정을 기록한 뒤 최소 구현→GREEN을 수행한다.
7. High risk면 sibling `test` skill의 mutation kill·원복·재-GREEN을 먼저 수행한다.
8. 브라우저 대상이면 `browser-verification.md`로 실제 조작·증거·자가개선을 수행하고,
   Design Intent가 있으면 모든 `D*` 행도 증거에 매핑한다.
9. `subagent-review.md`로 독립 카드 리뷰, 유효 finding 개선, 최종 재검증을 수행한다.

## 피드백 라우팅

테스트·브라우저·리뷰의 새 관찰마다 주원인을 하나 기록하고 아래 경로만 사용한다.

| 분류                 | 허용 행동                                                     |
| -------------------- | ------------------------------------------------------------- |
| `POLICY_GAP`         | 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`                |
| `EVIDENCE_GAP`       | 잠긴 카드 범위 안에서 누락된 테스트·브라우저 매핑만 추가      |
| `HARNESS_DEFECT`     | locator·fixture·barrier 등 허용 항목만 공용 2회 예산으로 보정 |
| `PRODUCT_DEFECT`     | 결정론 테스트의 `VALID_RED` 뒤 production 개선 예산 사용      |
| `ENVIRONMENT_DEFECT` | production을 건드리지 않고 실제 원인과 함께 `FAIL`            |
| `NON_ORACLE_OPINION` | 근거와 함께 기록하고 완료 차단이나 정책 변경에 사용하지 않음  |

현재 구현·브라우저 관찰·reviewer 선호는 분류 증거일 뿐 정책 출처가 아니다.
단, 승인된 Design Intent의 불일치는 단순 선호가 아니며 `visual-design.md`의 기준으로
분류한다.

## 반복 예산

| 활동                   |                          한도 |
| ---------------------- | ----------------------------: |
| 정책 질문              |                  최대 2라운드 |
| 테스트 기계 보정       | 테스트+브라우저 합계 최대 2회 |
| production 개선        |                  최대 3라운드 |
| 브라우저 검증·자가개선 |                  최대 2라운드 |

예산은 서로 대체하지 않는다. 소진하면 마지막 실제 실패와 함께 `FAIL`로 보고한다.

## Delivery 상태

| 상태                | 뜻                                                             |
| ------------------- | -------------------------------------------------------------- |
| `IMPLEMENTED_GREEN` | 카드 테스트와 레포 필수 검증이 실제로 통과                     |
| `BROWSER_VERIFIED`  | GREEN + 브라우저 매핑 행 통과 (+ High risk mutation 증거)      |
| `REVIEW_VERIFIED`   | 독립 리뷰 finding 반영 후 테스트와 가능한 브라우저 검증 재통과 |
| `NEEDS_DECISION`    | 결과를 바꾸는 정책이 미결 — 카드 현재본과 질문을 출력          |
| `FAIL`              | 환경·하네스·도구 문제 또는 예산 소진으로 계약 판정 불가        |

브라우저로 열 수 있는 대상은 `BROWSER_VERIFIED` 없이 완료 처리하지 않는다.
브라우저 대상이 아닌 순수 helper 등은 N/A 사유를 기록하고 리뷰 단계로 진행한다.
Delivery의 정상 완료 상태는 `REVIEW_VERIFIED`다.

## 최종 보고

```text
상태: ORACLE_READY | IMPLEMENTED_GREEN | BROWSER_VERIFIED | REVIEW_VERIFIED | NEEDS_DECISION | FAIL
카드: O1→test name, O2→browser scenario, O3→N/A 사유 형식의 전 행 증거 매핑
revision: Oracle SHA-256, source hashes, 마지막 verify command와 exit code
결정: Target, State ownership, Server/Client, Async, Hook, Sources, Rejected
아키텍처: unit별 architecture.md, 승인 답변, Oracle source hash, 레포 구조 검증 또는 reviewer 증거
디자인: Visual scope, Subject, Audience, Single job, Thesis, Signature, Risk, Rejected
디자인 확인: Design Change Confirmation의 사용자 답변 위치
시각 증거: D1→test/browser/reviewer, D2→N/A 사유 형식의 전 행 매핑
구현: 라운드별 카드 행, 가설, 최소 변경, 결과
실행: 실제 command와 PASS/FAIL 수
브라우저: 라운드, 핵심 시나리오, 증거 또는 N/A 사유
mutation: High risk kill·원복·재통과 증거 또는 N/A
subagent: 역할, finding, 반영 여부
재검증: 테스트·레포 필수 검증·브라우저 결과
남은 것: 미검증 항목과 사유
```
