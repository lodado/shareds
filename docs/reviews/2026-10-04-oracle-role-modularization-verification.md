# Oracle 역할 모듈화 검증 기록

날짜: 2026-10-04
대상: `frontend-oracle-design` 0.82.0 → 0.83.0

## 결과 구조

기존 플러그인 하나에서 다섯 개의 스킬을 발견하도록 변경했다.

| 스킬                     | 책임                                                     | 엔트리 줄 수 |
| ------------------------ | -------------------------------------------------------- | -----------: |
| `frontend-oracle-design` | 역할 호출, 사용자 승인, lock, ledger, 예산, 최종 보고    |          103 |
| `oracle-intake`          | 출처 조사, 위험·capability 분류, discovery 축 질문       |           56 |
| `oracle-author`          | source-bound model, Draft 투영·수동 영역, 조건부 closure |           72 |
| `oracle-implement`       | lock 및 VALID_RED 이후 한정된 제품 구현                  |           60 |
| `oracle-review`          | 독립 cold-read, reverse, source-aware, delivery 검토     |           58 |

`$test`는 기존 외부 스킬을 그대로 사용한다. runtime, protocol, reference graph,
ledger, 승인과 예산은 복제하지 않았다. 모든 공유 리소스는
`packages/frontend-oracle-design/skills/frontend-oracle-design/`에 한 번만 존재한다.

전문 스킬은 선행조건이 없으면 컨트롤러로 반환한다. 작성자는 closure 근거를 생산하지만
그 근거를 판정하는 독립 reviewer가 되지 않는다. 같은 컨텍스트의 스킬 전환은 독립 리뷰가 아니다.

## 크기와 실제 로딩 경계

- 기존 루트 엔트리: 598줄, 45,014 bytes.
- 새 루트 엔트리: 103줄, 9,062 bytes. 엔트리 자체는 약 79.9% 작다.
- 컨트롤러의 루트 + common + mandatory + loading + controller 절차를 합친 비교:
  71,382 → 53,606 bytes, 약 24.9% 감소. 엔트리 절감률을 전체 컨텍스트 절감률로 주장하지 않는다.
- intake discovery의 공개 router 결과에는 `card-format`이 포함되지 않는다.
- fresh 구현 패킷은 `oracle-implement`와 `role-implement` 의존 참조를 실제 본문으로 전달한다.
  컨트롤러·최종 보고·독립 reviewer 절차를 구현 패킷에 묶지 않는다.
- runtime 코드 해시는 여전히 고정한다. `packet.inputs`는 무결성 manifest이지 전체 소스의
  필수 읽기 목록이 아님을 native worker prompt에서 명시했다.

이 수치는 문서 bytes 비교다. 전체 모델 비용, 성공률 또는 장기적인 품질 개선 측정치는 아니다.
다섯 개 description이 발견되므로 always-on 메타데이터 비용은 별도로 존재한다.

## 관찰한 동작

| 경계              | 실행과 관찰                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| 변경 전 baseline  | 공개 Oracle 패키지 전체 테스트 exit 0, 실패·skip 0                                                                  |
| 스킬 발견         | 실제 `claude plugin details`에서 다섯 이름과 0.83.0 확인                                                            |
| 플러그인 manifest | 실제 `claude plugin validate` 통과                                                                                  |
| 역할 직접 호출    | 실제 native host에서 `Skill(frontend-oracle-design:oracle-implement)` 성공 호출 확인                                |
| 선행조건 누락     | 위 실제 호출에 승인 카드·lock·VALID_RED 없는 결제 중복 제출 구현을 요구하자, 변경하지 않고 컨트롤러로 반환          |
| 훅                | 다섯 역할의 일반/namespace 및 tool/slash 호출에 기존 보호 gate 적용, 유사 이름과 무관한 namespace는 활성화하지 않음 |
| fresh 구현        | 공개 `worker-packet` → `worker-run`으로 GREEN 수락, 중복 전달 시 두 번째 상태 전이 없음                             |
| 호출 증명         | `$test` 및 `oracle-implement` 성공 tool result가 모두 있어야 수락. 역할 미호출·실패·잘못된 namespace를 거부         |
| 무결성            | 역할 본문과 참조 digest를 패킷에 바인딩. scope, source, lock, attempt, stale-input 검사 유지                        |
| 참조              | 실제 router의 intake/implement/reviewer 소유권 분리와 generator `--check` 검증                                      |

실제 host 검사 로그는 로컬 scratch의 `oracle-modular-live-implement-restored.ndjson`에 있다.
첫 native 검사는 아래 fixture 문제 때문에 역할을 발견하지 못했다. 해당 검사를 성공으로 계산하지
않았고, 복구 후 별도 fresh 호출에서 성공한 Skill 호출과 차단 동작을 확인했다.

## 검증 중 발견하고 수정한 문제

1. 기존 worker prompt와 receipt 검사는 `$test`만 요구했다. 새 구현 역할 호출을 명시하고,
   미호출·실패·무관한 namespace의 실제 runtime 수락을 RED로 재현한 뒤 거부하도록 수정했다.
2. 기존 변조 테스트가 `requiredSkills[0]`을 자기 fixture로 가정했다. 새 역할을 앞에 추가하자
   신규 엔트리를 덮어썼다. 엔트리를 원문으로 복구하고 기존 순서를 보존했으며, 테스트는 이름으로
   fixture를 선택하고 fixture 경로임을 먼저 확인하도록 수정했다. 후속 엔트리·훅 검사가 통과했다.
3. hash 고정과 문서 읽기를 구분하지 않아 모든 runtime 파일 읽기를 요구하던 prompt를 정정했다.
   native 호출에 전달되는 prompt와 기존 digest 검사를 함께 회귀 검증한다.
4. 전체 회귀에서 전역 스킬 개수, eval corpus·bundle·grader fixture의 이전 참조 목록,
   macOS `/tmp`와 `/private/tmp`의 같은 파일 비교를 수정했다. 기존 검증 조건을 제거하지 않았다.

## 최종 회귀 및 배포

- 공개 `rtk test pnpm test`: exit 0, Turbo 12/12 작업 성공. Oracle 패키지는 835/835 테스트 통과,
  실패·취소·skip 모두 0. 커밋 훅의 전체 `pnpm lint`와 `pnpm test`도 통과했다.
- Oracle 공개 lint: exit 0, 오류 0. 기존 영역을 포함한 경고 316개는 남아 있다.
- 세 generator의 `--check`, 실제 cache manifest 검증, 독립 리뷰 완료. 해결하지 않은 실행 차단 발견 없음.
- 구현 커밋 `b816303`과 설계 커밋 `4965cad`를 `origin/main`에 push했다. 플러그인 버전은 0.83.0이다.
- push 성공 후 Claude 사용자 설치와 Codex 설치를 실제 0.83.0으로 갱신했다. 각 cache의 skills·hooks·manifest·package
  223개 파일을 저장소와 SHA-256으로 비교해 모두 일치함을 확인했다.
- Jcode는 다섯 스킬의 219개 파일이 저장소와 일치한다. `--delete` 없이 동기화했고 인덱스 재로딩 후
  새 네 역할이 발견되는 것을 확인했다. 작업 전부터 있던 미추적 문서·output·test.bend는 보존했다.
- 이미 열려 있는 Claude/Codex 세션에는 재시작이 필요하다. 자동으로 사용자 세션을 종료하지 않았다.

## 한계

실제 모델 검사는 선행조건 없는 전문 스킬 직접 호출이라는 한 경로를 확인한 것이다.
모델을 통한 intake부터 최종 리뷰까지의 전체 새 흐름이나 이전 버전 대비 품질 우월성은 검증하지 않았다.
기존 runtime 통합 테스트의 모델 host는 fixture이며 실제 ledger/상태 수락 검증과 구분해야 한다.
버전과 경로 변경으로 기존 발행 worker packet은 다시 발행해야 할 수 있다. 새 ledger 상태는 없다.
