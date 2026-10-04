# Oracle / Contract verification profiles: design proposal

Date: 2026-10-04
Status: Proposed. User approval of this design and its implementation plan is required before implementation.
Baseline: commit `2d57d6b`, frontend-oracle-design plugin `0.83.1`.

## 1. 목표와 범위

사용자가 고르는 진입점은 두 개다. 역할 스킬, 공통 Space 검사, Delivery 실행기는 공유한다.

| 진입점                     | 고정 프로필      | 책임                                                                                                   |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `frontend-oracle-design`   | `formal-bend/v1` | 기존 모델·증명·adequacy·투영 검증을 유지한다.                                                          |
| `frontend-contract-design` | `contract/v1`    | 명시한 Space를 기계적으로 열거하고 각 경우의 계약 판정을 완결한다. Bend를 검증 경로에 사용하지 않는다. |

공유 역할은 `oracle-intake`, `oracle-author`, `oracle-implement`, `oracle-review` 네 개다. 같은 플러그인에서 총 여섯 개의 `SKILL.md`를 발견한다. 별도 플러그인, 네 역할의 복사본, 일곱 번째 Space 스킬은 만들지 않는다.

새 기능을 기존의 `Formal Model: N/A` 또는 package-less legacy 우회로로 구현하지 않는다. `--skip-bend`와 자동 프로필 하향 전환은 금지한다.

## 2. 이번 제안에서 명시적으로 선택하는 v1 범위

새 Contract는 **`Coverage: full-product`를 명시**한다. 기존 `oracle.md`의 Case space 표, JSON metadata, Frame dispositions를 재사용한다. 별도의 사람이 편집하는 Space DSL/패키지는 만들지 않는다.

- 유한하고 비어 있지 않은 축·값을 선언한다.
- 기존 100,000 raw tuple 상한을 유지한다. 초과는 미완료이며 자동 sampling하지 않는다.
- raw tuple마다 정확히 하나의 판정을 요구한다.
- 전체 조합을 약속하고 t-way로 몰래 축소하지 않는다.
- 기존 t-way 자료의 읽기와 기존 Formal 동작은 유지한다. 새 Contract v1의 t-way 지원은 이번 범위가 아니다.
- 이 선택은 구 Oracle 전체 기능의 복원이 아니라 의도적으로 좁힌 새 프로필이다. **사용자의 계획 승인에 이 범위 선택을 포함한다.**

Space가 너무 크면 근거 있는 범위 분할안을 먼저 제시한다. 범위 변경은 새로운 승인 대상이며 기존 full-product 완료 주장을 유지하지 않는다.

## 3. 기계가 하는 일과 사람이 결정하는 일

기계는 조합/경로·ID·리비전을 생성하고, 누락·중복·없는 ID·오래된 연결·잘못된 행 참조를 검수한다. 확정된 근거로 유일하게 결정되는 연결은 기계적으로 작성할 수 있다.

기대 결과, 정책 충돌 해결, 불가능/독립성 주장의 정당성은 출처와 사람의 결정이 필요하다. 생성기는 이를 추측하지 않는다. 미정 칸은 `needs-decision` 또는 `needs-evidence`로 표시한다. 활성 Contract Space 안에 미정 칸이 있으면 lock하지 않는다. 미정 범위를 빼고 진행하려면 사용자가 더 좁은 범위를 명시적으로 승인해야 한다. 전체 원요청을 완료했다고 주장하지 않는다.

설계 검수와 실행 검수를 구분한다. 설계에서는 실행 수가 `null`, 실행 상태는 `not-run`이다. 하나의 테스트 함수에 여러 경우가 들어갈 수 있지만 reporter의 실제 case ID 집합이 필요한 경우를 덮어야 한다.

## 4. 공유 경계

### 4.1 공유 문서

공유 `SKILL.md`와 공통 참조에는 출처, Space 판정, 권한, 승인, 잠금, RED/GREEN, 증거, 독립 리뷰 규칙만 둔다. Bend 설치·MODEL/LAWS·proof·adequacy·project-card 절차는 Formal 전용 참조가 소유한다.

공유 역할은 검증된 실행 프로필이 가리키는 현재 단계의 참조만 읽는다. Contract 경로는 Formal 문서를 읽은 다음 무시하는 방식이 아니다. reference graph, bundles, worker/review 입력의 전이적 의존성에서도 Formal 전용 노드를 제외한다. Fresh worker는 부모가 읽었다고 가정하지 않는다.

같은 패키지를 배포하므로 Formal 파일 자체는 설치된다. Contract의 정상 경로에서는 해당 지침과 검증 모듈을 로드/실행하지 않는다. 외부 프로젝트에 무관한 `.bend` 파일이 존재한다는 이유만으로 실패시키지는 않는다.

### 4.2 공유 코드

현재 `oracle-verify.mjs`는 model/package 모듈을 정적으로 import한다. 따라서 전체 파일을 Bend 없는 공용 검사기로 간주하지 않는다.

`oracle-space.mjs`로 중립적인 파싱, ID/판정/행 연결, full-product 구조 검수를 추출한다. 이 모듈은 Bend 전용 모듈, 모델 실행기, 설치기, 네트워크에 의존하지 않는다. 기존 `oracle-frames.mjs`의 열거 알고리즘과 ID 생성 규칙은 보존한다.

Formal의 `Coverage: model`은 일반 F/E 프레임을 생성하지 않는다. 이를 full-product로 바꾸거나 빈 배열의 검수 통과를 모델 완전성으로 해석하지 않는다. Formal은 기존 도출/투영 검사를 유지하고, 실제로 공통인 식별자·출처·행·증거 연결 검사만 같은 함수로 호출한다. 동일한 전체 Space 생성기를 억지로 만들지 않는다.

### 4.3 일반 화면에 맞는 Contract scenario

현재 full-product 검수는 `given.query/page/history/data/pending`을 요구한다. 이 목록 화면 전용 규칙을 toggle 같은 일반 Contract에 강제하지 않는다.

Contract에서는 `given`을 비어 있지 않은 객체로 받는다. 실제 상태를 표현하는 유효 JSON 값은 허용하므로 `false`, `0`, 빈 문자열, `null`을 일괄 금지하지 않는다. 기존 scenario ID, 승인된 sources, 실제 rows, 순서가 있는 when, then의 requests/display/effects/never, target/control/barrier/observe 검사를 유지한다. 발생하지 않는 요청·효과도 근거에 맞게 명시한다. 형식 검수는 기대 결과의 의미적 정당성을 증명하지 않는다.

Legacy full-product는 기존 given 규칙을 그대로 사용한다. 새 프로필을 명시하지 않은 문서가 새 느슨한 구조 검사로 자동 이동하지 않는다.

## 5. 프로필의 단일 정의와 불변성

`oracle-profile.mjs`에 두 개의 고정된 버전 ID와 진입점 매핑을 정의한다. 사용자가 임의 backend/검증 정책을 등록하는 프레임워크는 만들지 않는다.

새 카드의 필수 표기:

```markdown
## Verification Profile

- Profile: contract/v1
```

같은 섹션의 Formal 값은 `formal-bend/v1`이다. 이 값은 승인받는 카드 원문에 포함되므로 카드 hash에 묶인다.

새 stage, lock, run state, worker packet, review dispatch/receipt에는 같은 `verificationProfile`을 기록하고 카드 값과 비교한다. `--profile`은 일치 확인용이지 변경 권한이 아니다. 잘못된 namespace, 미지/중복 프로필, stage/card/lock/packet 불일치는 거부하며 기존 lock/ledger를 수정하지 않는다.

프로필 선택은 authoring 전에 끝낸다. 역할 자체의 bare 호출만으로 프로필을 정하거나 Formal로 fallback하지 않는다. 선택되지 않았다면 적절한 controller 선택을 요구하고 작업을 멈춘다.

Legacy는 세 번째 선택 가능한 프로필이 아니다. 기존 profile-less 데이터와 낮은 수준 CLI 호환은 원래 검증 수준으로 보존하되, 새 controller/worker가 이를 Contract 권한으로 받지 않는다. 기존 기록을 읽을 때는 legacy/unclassified로 구분하고 실행하지 않은 검증을 소급 주장하지 않는다. 호환되지 않는 재개는 승인된 새 revision을 요구한다. 기존 lock/card/ledger bytes는 자동 수정하지 않는다.

## 6. 작성 단계와 승인 순서

### Contract

```text
DISCOVERING
  출처 조사, 축 확인, Draft 작성, Space 사전 검수
  독립 cold-read, 질문 해결, 실제 사용자 확인
  최종 승인 카드 bytes 확정
    ↓ strict Space 검사
CHECKED
    ↓ 같은 카드 bytes의 전체 Contract lint
DRAFTED
    ↓ 기존 immutable lock 생성
ORACLE_READY
```

Contract는 승인 전에는 stage를 DISCOVERING에 둔다. CLI 사전 검수는 여러 번 할 수 있지만 승인/잠금 권한이 아니다. 승인 후에만 CHECKED의 전체 카드 hash를 고정하므로 User Confirmation 수정 때문에 별도의 해시 제외 규칙을 만들 필요가 없다. CHECKED 이후 카드가 바뀌면 rewind 후 재검사하고, 정책 의미가 바뀌면 재승인도 필요하다.

### Formal

기존 `DISCOVERING → MODELED → CHECKED → DRAFTED → ORACLE_READY`와 모델 패키지 hash·Bend gate·승인 순서를 유지한다.

둘 다 같은 `oracle-stage.mjs`가 기록한다. Contract에서 MODELED나 가짜 package를 만들지 않는다. gate는 프로필을 확인한 후에만 해당 프로필 모듈을 로드한다. ORACLE_READY는 lock 도구만 기록한다.

## 7. 공유 Delivery와 추가 의무

Delivery의 기존 상태 그래프, append-only ledger, budgets, 단일 실행기, 중복 GREEN 방지, 실제 RED, ALREADY_SATISFIED, snapshot/증거 신선도, 독립 리뷰는 그대로 유지한다.

Contract Delivery는 다음 의무를 가진다.

1. `contract-cases:reported`: 실제 제품 assertion과 모든 실행 대상 frame/scenario의 reporter 대응.
2. 공개 타입 경계가 있으면 기존 `type-contract:reported`와 실제 TypeScript/type-fest 검증. 경계가 없다는 판정도 조사 파일과 근거가 필요하다.
3. Async/Order가 활성화되면 `fast-check:reported`의 양수 실행 수, seed, domain, 실패 시 shrink 정보. 기준은 승인된 계약 불변식이며 Bend 모델 비교를 강제하지 않는다.
4. 필요한 실행기나 증거가 없으면 실제 원인에 따라 실패한다. ordinary tests로 Bend 실패를 덮거나, Contract의 필요한 property/type 검사를 생략하지 않는다.

Formal은 현재 behavior/world stack을 유지한다. 새 `formal-bend/v1`이 필수 package/법칙 또는 world/adequacy 증거 없이 성공하지 못하도록 명시적으로 검사한다. 기존 legacy 기록에 이를 소급 적용했다는 주장은 하지 않는다.

최종 보고서는 state뿐 아니라 profile, 선언 Space 범위, 검수 결과, 실제 실행 수, 미검증 범위를 표시한다. Contract는 `formalVerification: not-performed`를 명시한다. 전용 Bend 검증을 Contract 성공 라벨로 대체하지 않는다.

## 8. 비목표

- 새 검증 언어, 모델 플러그인 레지스트리, 두 번째 Delivery runtime.
- `.ai/oracles` 또는 `oracle.md` 전역 이름 변경.
- 기존 Formal world/trace를 raw Cartesian product로 변경.
- role별 no-bend 스킬 복제.
- 전체 UI/제품 결함이 없다는 완전성 주장.
- 계획 작성 중 runtime 변경, 설치 갱신, 모델 실행을 통한 구현 완료 주장.

## 9. 요구사항과 수용 기준

| ID  | 요구사항                              | 수용 관찰                                                                           |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| R1  | 두 controller + 네 역할 + 단일 core   | 세 호스트에서 정확히 여섯 entry, 중복 core 없음                                     |
| R2  | 공유 규칙·Contract 경로의 Formal 격리 | 4 roles × 2 profiles routing, 전체 의존성 검사, native read 기록                    |
| R3  | 명시 Space의 기계적 완결              | 12개 기본 사례 및 누락/중복/제외/미정/리비전 변경 거부                              |
| R4  | 일반 Contract scenario                | 목록 전용 필드 없는 toggle와 async 카드 구조 검수                                   |
| R5  | 프로필 불변성                         | card/lock/state/packet/receipt 변경 시 거부, lock/ledger unchanged                  |
| R6  | 승인·잠금·제품 변경 권한 보존         | 승인 전 lock 거부, RED 전 production 거부, Design-only 무수정                       |
| R7  | 두 프로필의 실제 Delivery             | Contract 실제 defect RED/fix/GREEN/review, Formal 실제 Bend 회귀                    |
| R8  | 환경 실패의 정직한 처리               | Bend 없는 Contract 성공 경로, Bend 없는 Formal 실패, 필수 runner 없는 Contract 실패 |
| R9  | legacy 보존                           | 실제 이전 revision read/resume 또는 명시적 migration stop, 원본 hash 유지           |
| R10 | 문서·평가·설치 일치                   | generators, 전체 공개 테스트, consumer 테스트, native discovery와 파일 parity       |

현재 확인한 것은 기존 공개 CLI의 12-frame 생성과 구조 검수 및 기존 frames 테스트 통과다. 새 Contract 전체 경로나 no-Bend 환경 검증은 아직 실행하지 않았다.
