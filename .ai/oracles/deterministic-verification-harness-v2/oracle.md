# Deterministic Verification Harness Oracle Card — revision 2

상태: `ORACLE_READY`

revision 1(`sha256:4d7e5759f30393a2df7e38781f47248ad3175a49f604ac0cfa1b1f4a76e71def`)은
`.ai/oracles/deterministic-verification-harness-v1/`에 그대로 보존한다. 이 revision은
독립 리뷰의 `POLICY_GAP` 두 건(f-5 판정 범위, f-6 증거 검증의 한계)을 사용자 승인으로
정책에 반영한 것이다.

## Source Registry

| ID  | 관할             | 기준                                                                                                                                                                            | 위치·version                                                                                 | 승인 상태 |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| S1  | 목표             | AI의 비결정적 결과를 최대한 결정론적인 방식으로 검수한다                                                                                                                        | 사용자 메시지: “AI가 비결정적인 결과를 내는데 최대한 결정론적인 방식으로 검수를 할려고해”    | approved  |
| S2  | 적용 범위        | 제안한 9개 항목(run ledger, state machine, evidence verify, test-diff lint, flakiness gate, card lint, reviewer 2-sample, env fingerprint, nondeterminism scan)을 전부 적용한다 | 사용자 메시지: “ㅇㅋㅇㅋ 적용해줘”                                                           | approved  |
| S3  | 보존할 기존 계약 | Oracle lock, `VALID_RED` 술어, 피드백 라우터 6분류, 예산 2/2/3, 시각 3계층 증거, mutation kill                                                                                  | 레포 파일: `packages/frontend-oracle-design/skills/**`, `packages/test/skills/test/SKILL.md` | approved  |
| S4  | 배포 절차        | 릴리스는 `package.json`·`.claude-plugin/plugin.json`·`.codex-plugin/plugin.json`·루트 `marketplace.json` 4곳을 함께 올린다                                                      | 프로젝트 memory: `frontend-oracle-design-release-flow`                                       | approved  |
| S5  | 판정 범위와 한계 | gitignore된 경로를 production 변경에서 제외하는 것을 정책으로 승격하고, 증거 검증이 행-테스트 대응을 판정하지 못한다는 한계를 카드에 명시한다                                   | 사용자 메시지: “1. ㅇㅇ 2. 괜찮, 둘다 원함”                                                  | approved  |

## Scope and Risk

- Target: `frontend-oracle-design` 스킬의 판정 하네스 — `skills/scripts/*.mjs`와 해당 계약 문서
- Visual scope: `behavior-only` — 보이는 제품 UI를 만들거나 바꾸지 않는다.
- Design Change Confirmation: N/A — 보이는 디자인 결과 변경 없음.
- Architecture gate: N/A — React production 변경이 아니라 Node CLI script와 계약 문서 변경이다.
- Risk: `Medium` — false GREEN이면 이후 모든 Oracle 판정이 검증되지 않은 자기보고로 통과한다. 부작용은 로컬 artifact write에 한정된다.

## 결정된 정책

### 실행 증명 (Run Ledger)

- 판정에 쓰는 모든 명령은 wrapper를 통해 실행하고 append-only `runs.jsonl`에 기록한다. (출처: S1, S2)
- 기록 항목은 runId, label, command, exitCode, reporter 결과, grade, env fingerprint, lock digest, worktree digest, 시각이다. (출처: S2)
- reporter JSON을 읽을 수 있으면 테스트 이름과 상태를 기록하고 grade는 `reported`다. (출처: S2)
- reporter가 없거나 파싱할 수 없으면 grade를 `exit-only`로 격하해 기록하고 숨기지 않는다. (출처: S2)
- 최종 보고의 실행 증거는 자유 서술이 아니라 ledger의 runId를 인용한다. (출처: S1)
- artifact 경로 기본값은 `.ai/oracles/<oracle-id>/`이며 ledger는 `runs.jsonl`, 상태는 `run-state.json`, 증거 매핑은 `evidence.json`이다. (출처: S2)

### 상태 기계와 예산

- Delivery 상태 전이는 스크립트 명령으로만 기록하고 허용된 전이만 통과시킨다. (출처: S2)
- `VALID_RED` 전이는 인용 run이 non-zero exit이어야 한다. (출처: S2, S3)
- `VALID_RED` 전이는 `ORACLE_READY` 이후 변경된 파일이 전부 테스트 소유 경로일 때만 통과한다. (출처: S1, S2)
- 판정 범위는 git 레포에서 `git ls-files -c -o --exclude-standard`, git이 없으면 빌드 산출물을 제외한 파일 목록이다. gitignore된 경로의 변경은 production 변경으로 세지 않는다. (출처: S5)
- 실제 production인데 gitignore된 파일이 있으면 게이트를 끄지 말고 `--scan-root`나 레포 ignore 설정을 먼저 정리한다. (출처: S5)
- `IMPLEMENTED_GREEN` 전이는 인용 run이 exit 0이고 lock 재검증이 통과해야 한다. (출처: S2, S3)
- 기존 구현이 이미 카드를 만족하면 명시적 사유와 함께 `VALID_RED` 없이 `IMPLEMENTED_GREEN`으로 갈 수 있으나, `ORACLE_READY` 이후 production 변경이 없어야 한다. (출처: S2, S3)
- 예산은 정책 질문 2, 테스트 기계 보정 2, production 개선 3으로 스크립트가 계수하며 초과 요청은 거부한다. (출처: S3)
- 예산이 소진되면 전이 대신 `FAIL`을 남긴다. (출처: S3)

### 테스트 약화 방지와 flakiness

- `VALID_RED` 시점의 테스트 파일 digest와 `expect(` 수를 기록한다. (출처: S2)
- `IMPLEMENTED_GREEN` 전이는 기록 대비 assertion 수 감소, 금지 토큰 신규 유입, 기록된 테스트 파일 삭제가 없어야 통과한다. (출처: S2, S3)
- 금지 토큰은 `test.skip`, `it.skip`, `describe.skip`, `.only(`, `waitForTimeout(`, `toBeTruthy(`, `toBeFalsy(`, `.first()`, `.nth(`, `setTimeout(`와 screenshot diff 허용치(`maxDiffPixels`, `maxDiffPixelRatio`, `threshold`) 상향이다. (출처: S2, S3)
- screenshot diff 허용치는 카드에 잠그는 정책값이며 테스트 단계에서 조정하지 않는다. (출처: S2, S3)
- `IMPLEMENTED_GREEN`은 같은 명령의 마지막 연속 통과 run이 risk별 필요 횟수를 채워야 발급한다. High 3회, Medium 2회, Low 1회다. (출처: S2)
- RED run과 GREEN run의 env fingerprint가 다르면 전이는 막지 않되 drift를 출력하고 기록한다. (출처: S2)

### 증거 매핑 검증

- 카드 행 ID와 증거의 매핑은 산문이 아니라 `evidence.json`으로 관리하고 스크립트가 검증한다. (출처: S1, S2)
- 모든 비-N/A 카드 행에 증거 항목이 있어야 한다. (출처: S3)
- `test` 증거는 인용한 run의 reporter 결과에 같은 이름이 통과로 존재해야 한다. (출처: S1, S2)
- 인용 run이 `exit-only`면 `test` 증거를 검증할 수 없으므로 거부한다. (출처: S2)
- `na` 증거는 사유와 출처를, `reviewer` 증거는 finding 식별자와 역할을 요구한다. (출처: S3)
- 카드에 없는 행 ID를 인용하면 거부한다. (출처: S2)

### 카드 구조 lint

- Medium/High 카드는 lock 전에 구조 lint를 통과해야 한다. (출처: S2)
- lint는 Source Registry 존재, 모든 정책 줄의 출처 표기, 모든 행의 `Never`·부작용 비어있지 않음, `Then`·`Never`의 모호어 부재, 자동 추가 TC 7종의 행 또는 N/A 표기, `D*` 행의 출처와 증거 계층을 검사한다. (출처: S2, S3)
- lint는 LLM의 adversarial self-review를 대체하지 않고 구조적 최소선만 강제한다. (출처: S1)

### 독립 리뷰 결정화

- reviewer finding은 스키마가 있는 파일로 제출하며 분류는 기존 6종만 허용한다. (출처: S2, S3)
- finding은 카드에 실제로 있는 행 ID를 인용해야 하고, 인용이 없으면 `NON_ORACLE_OPINION`으로 강등한다. (출처: S2, S3)
- High risk는 같은 원시 입력으로 독립 리뷰를 2회 실행하고 (행, 분류)가 양쪽에 모두 나온 finding만 완료를 차단한다. 한쪽에만 나온 finding은 advisory로 기록한다. (출처: S2)
- Medium risk는 단일 리뷰와 스키마 검증만 요구한다. (출처: S2)

### 비결정 소스 scan

- production diff에 `Date.now`, `Math.random`, `crypto.randomUUID`, `toLocale`, `new Intl.` 같은 비결정 원천이 들어오면 scan이 위치를 보고한다. (출처: S2, S3)
- 같은 줄이나 바로 앞 줄의 `oracle:nondeterminism <사유>` 주석이 있으면 면제한다. (출처: S2)

### 한계 기록

- ledger·state·lock은 같은 actor가 다시 쓸 수 있으므로 drift 검출 장치이며 승인 권한 증명이 아니다. 강한 통제는 CI human approval·CODEOWNERS로 올린다. (출처: S3)
- git이 없거나 reporter 형식을 모르면 판정을 지어내지 않고 격하 사실을 기록한다. (출처: S2)
- 증거 검증은 인용한 테스트 이름이 그 run에서 통과했는지만 판정한다. 그 테스트가 해당 카드 행을 실제로 검증하는지는 판정하지 못하며, 행과 테스트의 대응은 독립 reviewer 체크리스트가 담당한다. (출처: S5)
- 비결정 소스 scan은 알려진 토큰 목록 기반이므로 검출 실패를 무결성 증거로 쓰지 않는다. (출처: S5)

## Behavior Contract

| ID  | Given                                                 | When                                                    | Then                                                                                           | Never                                                      | 부작용(종류×횟수)                                 | BVA                    |
| --- | ----------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| O1  | 유효한 lock과 초기화된 oracle 디렉터리                | `exec`로 명령을 실행                                    | 명령을 실행하고 runId와 exitCode를 담은 ledger 줄을 추가하며 runId를 출력한다                  | 실행 없이 성공 기록, 기존 ledger 줄 수정                   | command spawn×1, ledger append×1, product write×0 | 횟수: 1                |
| O2  | lock digest가 잠긴 값과 다름                          | `exec`를 요청                                           | 명령을 실행하지 않고 `ORACLE_CHANGED`로 non-zero 종료한다                                      | 명령 실행, 실행 기록 추가                                  | command spawn×0, ledger append×0                  | 상태: mismatch         |
| O3  | 테스트 명령이 reporter JSON을 남김                    | `exec --report <path>`로 실행                           | 테스트 이름과 상태를 파싱해 기록하고 grade `reported`를 남긴다                                 | 이름 없는 통과 수만 기록, 실패 테스트 누락                 | ledger append×1                                   | 상태: reported         |
| O4  | reporter 파일이 없거나 형식을 알 수 없음              | `exec --report <path>`로 실행                           | grade `exit-only`로 기록하고 exitCode는 그대로 남긴다                                          | `reported` 주장, 파싱 실패 은폐, 명령 실패를 성공으로 기록 | ledger append×1                                   | 상태: exit-only        |
| O5  | `ORACLE_READY`이고 변경 파일이 전부 테스트 소유 경로  | non-zero run을 인용해 `--to VALID_RED` 전이             | 전이를 기록하고 테스트 파일 digest와 assertion 수를 저장한다                                   | production 변경 허용, 상태 건너뛰기                        | state write×1                                     | 상태: idle→red         |
| O6  | `ORACLE_READY` 이후 production 파일이 변경됨          | `--to VALID_RED` 전이를 요청                            | `PRODUCTION_TOUCHED_BEFORE_RED`로 거부하고 변경 경로를 출력한다                                | 전이 성공, 상태 변경                                       | state write×0                                     | 상태: 위반             |
| O7  | 인용 run이 exit 0                                     | `--to VALID_RED` 전이를 요청                            | `RUN_NOT_RED`로 거부한다                                                                       | RED 전이 성공                                              | state write×0                                     | 값: exit 0/≠0          |
| O8  | `VALID_RED`이고 같은 명령의 마지막 연속 통과가 충분함 | exit 0 run을 인용해 `--to IMPLEMENTED_GREEN` 전이       | lock 재검증과 테스트 약화 검사를 통과한 뒤 전이를 기록한다                                     | 검증 없는 GREEN, lock mismatch 통과                        | state write×1, lock verify×1                      | 상태: red→green        |
| O9  | 연속 통과 run이 risk 필요 횟수보다 적음               | `--to IMPLEMENTED_GREEN` 전이를 요청                    | `FLAKINESS_GATE`로 거부하고 필요/실제 횟수를 출력한다                                          | 1회 통과로 GREEN 발급                                      | state write×0                                     | 횟수: N−1/N/N+1        |
| O10 | RED 기록 대비 테스트가 약화됨                         | `--to IMPLEMENTED_GREEN` 전이를 요청                    | `TEST_WEAKENED`로 거부하고 파일과 사유(assertion 감소·금지 토큰·삭제)를 출력한다               | 약화된 테스트로 GREEN 발급                                 | state write×0                                     | 상태: 위반             |
| O11 | 예산 잔여가 0                                         | 같은 종류의 예산을 다시 사용 요청                       | `BUDGET_EXHAUSTED`로 거부하고 카운터를 한도 위로 올리지 않는다                                 | 한도 초과 사용 허용, 다른 예산으로 대체                    | state write×0                                     | 횟수: limit−1/limit/+1 |
| O12 | RED run과 GREEN run의 env fingerprint가 다름          | `--to IMPLEMENTED_GREEN` 전이                           | 전이는 통과시키되 `ENV_DRIFT` 경고를 출력하고 상태에 기록한다                                  | 조용한 통과, 제품 결함으로 오분류                          | state write×1                                     | 상태: drift            |
| O13 | 현재 상태에서 허용되지 않는 전이                      | `--to <상태>` 전이를 요청                               | `TRANSITION_NOT_ALLOWED`로 거부하고 현재 상태를 출력한다                                       | 상태 건너뛰기, 같은 상태 재전이 허용                       | state write×0                                     | 상태: 불법 전이        |
| O14 | ledger에 없는 runId를 인용                            | 전이를 요청                                             | `RUN_NOT_FOUND`로 거부한다                                                                     | 없는 증거로 전이                                           | state write×0                                     | 값: 빈 ledger          |
| O15 | `exec`를 두 번 실행                                   | ledger를 확인                                           | 줄이 정확히 2개이고 첫 줄 내용이 그대로 유지된다                                               | 기존 줄 덮어쓰기, 파일 절단                                | ledger append×2                                   | 횟수: 2                |
| O16 | production 변경이 없고 기존 구현이 카드를 만족함      | 사유와 함께 `ORACLE_READY`에서 `--to IMPLEMENTED_GREEN` | 사유를 기록하고 전이를 통과시킨다                                                              | 사유 없는 RED 생략, production 변경 상태에서 생략          | state write×1                                     | 상태: 예외 경로        |
| O17 | 구조 결함이 있는 카드                                 | `verify card`를 실행                                    | 출처 없는 정책, 빈 `Never`·부작용, 모호어, 누락된 자동 TC를 각각 위치와 함께 보고하고 거부한다 | 결함 통과, 결함 종류 병합 보고                             | card write×0                                      | 상태: 결함/정상        |
| O18 | 모든 비-N/A 행이 통과 테스트에 매핑됨                 | `verify evidence`를 실행                                | exit 0으로 통과한다                                                                            | 미매핑 행 통과                                             | evidence write×0                                  | 상태: 완전 매핑        |
| O19 | 인용한 테스트 이름이 run 결과에 없음                  | `verify evidence`를 실행                                | `EVIDENCE_NOT_IN_RUN`으로 거부하고 해당 행과 이름을 출력한다                                   | 환각 매핑 통과                                             | evidence write×0                                  | 상태: 불일치           |
| O20 | 인용 run의 grade가 `exit-only`                        | `verify evidence`를 실행                                | `EVIDENCE_UNVERIFIABLE`로 거부한다                                                             | 이름 검증 없이 통과                                        | evidence write×0                                  | 상태: 검증 불가        |
| O21 | 카드에 없는 행 ID를 매핑했거나 비-N/A 행이 빠짐       | `verify evidence`를 실행                                | 각각 `EVIDENCE_UNKNOWN_ROW`·`EVIDENCE_MISSING_ROW`로 거부한다                                  | 조용한 무시                                                | evidence write×0                                  | 값: 빈 매핑            |
| O22 | reviewer finding 파일                                 | `verify findings`를 실행                                | 분류·행 ID·심각도 스키마를 검증하고 행 인용이 없으면 `NON_ORACLE_OPINION`으로 강등해 보고한다  | 임의 분류 허용, 없는 행 인용 통과                          | findings write×0                                  | 상태: 스키마 위반      |
| O23 | 독립 리뷰 결과 파일 2개                               | `verify findings --intersect a b`를 실행                | 두 파일 모두에 있는 (행, 분류)만 blocking으로, 한쪽만 있는 것은 advisory로 분류해 출력한다     | 단일 리뷰 finding으로 완료 차단, advisory 누락             | findings write×0                                  | 횟수: 1/2 등장         |
| O24 | 비결정 API를 쓰는 production 파일                     | `verify scan --path <file>`를 실행                      | 파일·줄·토큰을 보고하고 non-zero로 종료한다                                                    | 조용한 통과                                                | product write×0                                   | 상태: 검출             |
| O25 | 같은 줄 또는 앞 줄에 면제 주석이 있음                 | `verify scan --path <file>`를 실행                      | 해당 hit를 면제하고 exit 0으로 통과한다                                                        | 면제 주석 무시                                             | product write×0                                   | 상태: 면제             |
| O32 | git 레포이고 gitignore된 경로만 바뀜                  | `--to VALID_RED` 전이를 요청                            | 전이를 통과시키고 gitignore된 변경을 production 변경으로 세지 않는다                           | ignore된 파일로 전이 거부, 판정 범위를 무시한 통과         | state write×1                                     | 상태: ignored 변경     |

## Documentation Contract

| ID  | Given                       | When               | Then                                                                                                      | Never                           | 부작용(종류×횟수) | BVA       |
| --- | --------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------- | --------- |
| O26 | 스킬 계약 문서              | 계약 테스트를 실행 | SKILL.md가 ledger 인용, 상태 전이 명령, 기계 계수 예산, 증거 매핑 검증을 불변 규칙과 최종 보고에 포함한다 | 산문 자기보고만 유지            | doc write×0       | 상태·횟수 |
| O27 | `oracle-card.md`            | 계약 테스트를 실행 | lock 전 카드 lint와 run artifact 초기화를 요구한다                                                        | lint 없는 lock 허용             | doc write×0       | 상태·횟수 |
| O28 | `implementation-loop.md`    | 계약 테스트를 실행 | 판정 명령을 `exec`로 실행하고 전이·flakiness·테스트 약화 게이트를 GREEN 게이트에 포함한다                 | 직접 실행 후 결과 자기보고      | doc write×0       | 상태·횟수 |
| O29 | `subagent-review.md`        | 계약 테스트를 실행 | reviewer 입력에 runId와 finding 스키마 파일을 포함하고 High risk 2-sample 교집합 규칙을 명시한다          | 자유 형식 finding 유지          | doc write×0       | 상태·횟수 |
| O30 | `visual-design.md`          | 계약 테스트를 실행 | screenshot diff 허용치를 잠긴 정책값으로 규정하고 테스트 단계 조정을 금지한다                             | 허용치 상향으로 GREEN 확보 허용 | doc write×0       | 상태·횟수 |
| O31 | `packages/test/skills/test` | 계약 테스트를 실행 | 실행과 보정을 ledger로 기록하고 금지 토큰 유입 검사를 명시한다                                            | 실행 증거 없는 GREEN 보고       | doc write×0       | 상태·횟수 |

## BVA / 조건부 Guard

- 값 경계: exit code 0/≠0, 예산 limit−1/limit/limit+1, 연속 통과 N−1/N/N+1, 빈 ledger·빈 증거 매핑.
- 상태 경계: `ORACLE_READY`→`VALID_RED`→`IMPLEMENTED_GREEN`→`REVIEW_VERIFIED`의 각 전이 직후와 불법 전이.
- 시간·순서 경계: ledger는 append 순서가 판정 순서다. 마지막 연속 통과 판정은 VALID_RED 전이 이후 run만 센다.
- 부작용 횟수 경계: 일반 검증은 product write×0, 전이는 state write×1, `exec` 1회는 ledger append×1.
- 중복 실행: `exec` 2회 → ledger 2줄(O15). 같은 전이 2회 → 두 번째 거부(O13).
- 오류: lock mismatch(O2), 없는 run 인용(O14), 스키마 위반(O22), 파싱 실패 격하(O4).
- 재시도 복구: 예산 잔여가 있으면 보정 후 재실행이 가능하고, 소진되면 거부한다(O11).
- 빈 데이터: 빈 ledger 전이 요청(O14), 빈 증거 매핑(O21).
- 로딩·out-of-order·취소: N/A — 동기 CLI 호출이며 진행 중 취소·응답 역전 계약이 없다. `exec`는 명령 종료 후 한 번만 append한다.
- optimistic UI·cache·navigation: N/A — UI와 원격 상태가 없다.
- 비결정 소스: 테스트는 runId·timestamp·경로 같은 가변 값을 형식으로만 단정하고 임시 디렉터리를 테스트별로 격리한다.

## Adversarial Self-review

- 에이전트가 명령을 실행하지 않고 통과를 주장할 수 있음 → O1·O3에서 ledger 기록과 reporter 이름을 요구한다.
- reporter 파싱 실패를 성공으로 뭉갤 수 있음 → O4에서 grade 격하를 별도 상태로 요구한다.
- production을 먼저 고치고 테스트를 나중에 써도 TDD를 주장할 수 있음 → O5·O6에서 worktree 변경 경로를 기계로 판정한다.
- 실패하는 assertion을 지우고 GREEN을 만들 수 있음 → O10에서 assertion 수와 금지 토큰을 RED 시점 기록과 비교한다.
- screenshot 허용치를 올려 시각 회귀를 통과시킬 수 있음 → O10 금지 토큰과 O30 정책 잠금으로 함께 막는다.
- 한 번 우연히 통과한 flaky 테스트로 GREEN을 낼 수 있음 → O9에서 연속 통과 횟수를 요구한다.
- 브라우저·런타임이 바뀌어 GREEN이 됐는데 제품 개선으로 오해할 수 있음 → O12에서 env drift를 기록한다.
- 존재하지 않는 테스트 이름으로 증거를 채울 수 있음 → O19에서 run 결과와 대조한다.
- grade가 `exit-only`인 run으로 이름 매핑을 주장할 수 있음 → O20에서 거부한다.
- 예산을 마음속으로 세어 초과할 수 있음 → O11에서 스크립트가 계수한다.
- 카드 자체가 부실해 통과가 쉬울 수 있음 → O17에서 구조 최소선을 강제한다. 단, lint는 의미 심사를 대신하지 않는다.
- reviewer 한 번의 취향이 완료를 막거나, 반대로 실제 결함을 한 번 놓칠 수 있음 → O23에서 2-sample 교집합과 advisory를 분리한다.
- 스크립트만 만들고 문서가 옛 절차를 유지하면 아무도 쓰지 않음 → O26~O31에서 문서 배선을 계약으로 만든다.
- 판정 범위가 정책 없이 구현에만 있으면 나중에 조용히 넓히거나 좁힐 수 있음 → O32와 S5 정책 줄로 gitignore 제외를 명시한다.
- 증거 검증 통과를 "행이 실제로 검증됐다"로 오해할 수 있음 → 한계 기록에서 이름 통과만 판정함을 명시하고 대응 판단을 reviewer에 남긴다.
- 게이트가 늘어 도구 부재로 판정 불가가 늘 수 있음 → 격하 기록(O4)과 `ENVIRONMENT_DEFECT` 분류를 유지한다.

## Lock

- Oracle revision은 `oracle.lock.json`과 최종 보고에 기록한다.
- Local source: N/A — 승인 근거는 사용자 메시지와 카드 bytes에 포함했고 수정 대상 문서를 source로 잠그지 않는다.
