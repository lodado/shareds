# Oracle 역할 모듈화 수용 대응표

날짜: 2026-10-04
대상: 승인된 1+4 분할 및 후속 교정 0.83.1
상태: 0.83.1 소스·공개 실행·읽기 전용 위임 검증 및 push 후 Claude/Codex/Jcode 설치 동기화 완료.

초기 배포의 103줄, 835개 테스트 및 0.83.0 설치 기록은
[초기 검증 기록](2026-10-04-oracle-role-modularization-verification.md)에 남긴다.
이 문서는 Sol 3명의 수용 증거 매핑·공개 경계 검증·독립 리뷰를 코디네이터가 통합한 기록이다.
승인 기준은 [설계 acceptance 1~8](../superpowers/specs/2026-10-04-oracle-role-modularization-design.md)이다.

## 플로우와 분할 단위

`intake → author → 독립 review → 사용자 확인/lock → $test/VALID_RED → implement → 조건부 author closure + 독립 review → controller 보고`

| 단위                     | 분할 근거와 유지한 경계                                                                                                                         | 최종 엔트리 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------: |
| `frontend-oracle-design` | 역할 선택·호출, 질문과 승인, lock, 공통 예산, 실제 수락 확인과 보고만 조율한다.                                                                 |       110줄 |
| `oracle-intake`          | 출처·위험·capability·모델 공간 질문을 같은 조사 단위로 묶는다. 실제 답과 확인은 controller가 받는다.                                            |        65줄 |
| `oracle-author`          | 모델과 투영 Draft는 입력·digest가 결합된 단위다. 수동 카드 영역도 유지한다. closure 근거 작성은 가능하지만 자기 근거의 독립 판정은 하지 않는다. |        72줄 |
| `oracle-implement`       | immutable lock과 accepted VALID_RED 이후의 한정된 제품 변경이다. `$test`가 테스트와 harness를 담당한다.                                         |        60줄 |
| `oracle-review`          | blinded 입력과 독립 컨텍스트가 필요한 판정 단위다. findings만 반환하고 수정·승인·receipt를 하지 않는다.                                         |        58줄 |

별도 contract/explorer 스킬이나 새 상태 머신을 추가하지 않았다. phase timing 자체는 새 역할을 만드는 근거가 아니다.
원래 workflow의 node ID와 edges는 `c8bd27b`와 정확히 같고 `delivery.protocol.json`은 byte-identical이다.

## 증거 종류

- **STATIC**: 문서·경로·크기·버전·해시 비교. 모델의 실제 준수를 대신하지 않는다.
- **PUBLIC**: 지원되는 플러그인/패키지/라우터/generator 명령을 실제로 실행한 결과.
- **RUNTIME**: 공개 runtime에 실제 packet·lock·ledger·전이를 적용한 통합 테스트다. 모델 transport는 기존 fake host를 쓴다.
- **LIVE**: 실제 `claude -p` 호스트의 Skill·Read tool result 및 반환을 관찰했다. 프로세스 exit 0만으로 절차 수용을 판정하지 않는다.

최종 root `pnpm test`는 exit 0, Turbo 12/12 성공이다. 11개 작업은 캐시 재사용, Oracle 작업은 fresh다.
Oracle 원본 `.turbo/turbo-test.log`는 **837/837, fail/cancel/skip 0**이다.
RTK의 `[FAIL]` 헤더는 통과한 테스트 이름의 `FAIL·NEEDS_DECISION`을 잘못 분류한 것으로, 원본 카운터와 exit를 따른다.

## 원요청 및 acceptance별 대응

| 요구사항                                              | 구체적인 검사                                                                                                                                                                                                              | 관찰 결과와 범위                                                                                                                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 플로우를 분석하고 적정 단위를 제안                    | 승인 설계의 역할 책임과 단일 authority, workflow node/edge 및 protocol 전후 비교                                                                                                                                           | 위 1+4 구조로 구현했다. 모델+Draft를 함께 두고 근거 생산자와 독립 판정자를 분리했다. topology와 canonical protocol은 보존했다. STATIC                                                                                             |
| 1. 정확히 다섯 entry, flat 중복 없음                  | `exactly five named skill entries are discoverable, with no flat duplicate` 및 실제 plugin inventory                                                                                                                       | PASS. 다섯 이름과 하나의 plugin이다. source-resolved details와 실제 설치 registry는 구분한다. PUBLIC                                                                                                                              |
| 1. 각 entry의 적정 크기와 유효한 링크                 | 다섯 개 각각의 `has its exact discovery name, stays within … lines and has reachable links`                                                                                                                                | 모두 PASS. ceiling 140/150/240/180/180 안에 있고 실제 110/65/72/60/58줄이다. 하한을 채우기 위한 불필요한 내용을 넣지 않았다. PUBLIC/STATIC                                                                                        |
| 1. 공유 runtime 단일 사본                             | `one canonical runtime owns scripts, references, bundles and evals`                                                                                                                                                        | PASS. core의 scripts/references/bundles/evals만 존재하고 sibling에 복제하지 않았다. PUBLIC                                                                                                                                        |
| 2. 기존 스킬은 링크 기반 orchestrator                 | `controller links and explicitly invokes every sibling role and external test skill`                                                                                                                                       | PASS. 네 sibling의 실제 entry와 `$test` 호출을 검사했다. intake에 대한 실제 위임은 아래 LIVE에서도 확인했다. 모든 역할의 전체 모델 실행을 주장하지 않는다. PUBLIC/LIVE                                                            |
| 2. 예비 조사라는 이유로 위임 연기 금지                | `initial or preliminary investigation cannot defer the intake handoff until a later turn`                                                                                                                                  | 새 assertion의 RED를 관찰한 후 GREEN. 실제 0.83.0 native 누락도 재현했으며 최종 실행에서는 controller→intake Skill을 관찰했다. PUBLIC/LIVE                                                                                        |
| 2. 현재 단계 의존성을 다음 턴이나 Draft까지 연기 금지 | `intake loads its current-stage dependencies before even a preliminary brief`                                                                                                                                              | 새 assertion RED→GREEN. 최종 native에서 필수 9개 참조의 전체 본문을 확인했다. source code는 offset/limit으로 좁게 조사하고 future author/review 절차를 읽지 않았다. PUBLIC/LIVE                                                   |
| 2, 6. 역할별 권한·선행조건 보존                       | 네 역할 각각의 `cannot bootstrap missing prerequisites or grant itself authority`, `specialist write and evidence authority follows each bounded role`                                                                     | 각각 PASS. missing prerequisite는 controller로 반환하고 승인·전이 권한을 만들지 않는다. intake의 제품/모델/테스트 금지, author의 policy/lock 금지, implement의 기대/정책/lock 금지, review의 제품/receipt 금지를 검사한다. PUBLIC |
| 3. 잠금 전 테스트 작성 보호                           | `tool/slash activation of <role> preserves the pre-lock test gate`의 plain/namespaced 변형                                                                                                                                 | 다섯 역할의 20개 변형 PASS. 유사 이름·무관 namespace 및 tool result 인용으로 활성화되는 부정 경로도 각각 PASS. PUBLIC, hook 입력 시나리오                                                                                         |
| 3. 기존 상태와 protocol authority                     | `protocol obligations as one guide and transition input…`, `protocol edges as one status and transition input…`, `invalid protocol as pre-dispatch validation…`                                                            | 원본 전체 로그에서 각각 PASS. 잘못된 protocol은 workspace 쓰기 전에 거부한다. RUNTIME                                                                                                                                             |
| 3. lock·RED 및 중복 GREEN 방지                        | `worker packets require VALID_RED and never create a second delivery state`, `worker fresh transport executes the existing GREEN gate and duplicate delivery is idempotent`                                                | 각각 PASS. 공개 `worker-packet`→`worker-run`이 기존 gate를 수락하고 재전달은 두 번째 전이를 만들지 않는다. RUNTIME                                                                                                                |
| 3. 호출 증명·scope·attempt·freshness                  | `worker completion claims cannot replace tests, skills, scope or attempt identity` 및 worker stale/interrupted 검사                                                                                                        | 각각 PASS. `$test`와 `oracle-implement` 성공 tool result가 필요하며 미호출·실패·무관 namespace를 거부한다. stale baseline/pinned input·이전 attempt도 거부한다. RUNTIME                                                           |
| 3. 모델+카드 투영과 수동 영역                         | `the projected card is deterministic, marks its generated region and never records approval`, `[bend] card lint regenerates the region…`, `project-card never overwrites a hand-written card that has no generated region` | 각각 PASS. 재서명된 수동 generated-region 수정과 stale 모델도 거부하며 수동 카드와 사용자 승인을 생성기로 대체하지 않는다. RUNTIME                                                                                                |
| 3. High 독립성·hold·visual resume                     | `the blind mapping reviewer cannot be a reviewer who already read the packet`, `O17: High risk REVIEW_VERIFIED는 GREEN 이후 mutation kill 증거를 요구한다`, 열린 hold 및 `O18: visual pending…` 검사                       | 각각 PASS. hold는 REVIEW_VERIFIED를 막고 같은 리뷰 관문 뒤 PARTIAL_VERIFIED를 허용한다. visual pending은 GREEN에 남으며 review 완료를 막는다. RUNTIME                                                                             |
| 3. 예산·복구·진실한 최종 보고                         | `O11: budget spend is counted once per distinct current change digest`, policy/implicit harness stable digest 검사, `harness budget: evidence-only repair…`, `the Stop hook blocks a final report the ledger contradicts…` | 각각 PASS. 역할별 예산을 만들지 않았고 evidence-only repair도 새 RED를 요구한다. ledger와 모순되는 완료 보고는 차단한다. RUNTIME                                                                                                  |
| 4. 공개 라우터와 소유권                               | relocated core CLI의 unknown/manual/dependency/read-only/closed-vocabulary 검사 및 아래 실제 역할별 JSON                                                                                                                   | 9개 route 검사 PASS. unknown 조건을 보수적으로 포함하고 manual remainder를 숨기지 않는다. reviewer 입력을 agent 입력과 섞지 않는다. PUBLIC                                                                                        |
| 4. bundle와 fresh-context 의존성                      | byte identity, full source bytes, requires closure, continuation omissions, phase deferral, optional-cache의 여섯 bundle 검사                                                                                              | 각각 PASS. continuation의 부모 로딩 가정을 fresh specialist의 독립 입력으로 쓰지 않는다. PUBLIC                                                                                                                                   |
| 5. test-first와 전체 회귀                             | 새 두 검사 각각 RED→GREEN, 공개 root `pnpm test`, source lint 및 세 generator `--check`                                                                                                                                    | root 837/837 및 12/12. 독립 focused 61/61 = modular 17 + guard 29 + route 9 + bundles 6, fail/cancel/skip 0. lint 오류 0, 기존 경고 316. 세 generator exit 0. PUBLIC                                                              |
| 6. 실제 선행조건 누락 pressure                        | 초기 native `oracle-implement` 직접 호출, 승인 카드·lock·VALID_RED 없는 구현 요청                                                                                                                                          | 실제 성공한 Skill 호출 뒤 수정 없이 controller로 BLOCKED 반환했다. 하나의 직접 호출 경로이지 전체 독립 리뷰 입력의 실제 모델 준수 증명은 아니다. LIVE, 0.83.0 기록                                                                |
| 6. 실제 정상 조사 위임                                | 최종 `oracle-modular-live-controller-intake-complete.ndjson`의 tool result와 프로젝트 자체 관찰기                                                                                                                          | 아래 순서와 9개 full body를 독립 Sol이 재확인했다. 읽기 전용 연결·로딩·정지만 수용하며 응답 품질 전체를 수용한 것은 아니다. LIVE                                                                                                  |
| 7. 실제 개선 범위와 측정                              | 같은 파일 범위의 git baseline bytes와 stable 소스 bytes 비교                                                                                                                                                               | entry 45,014→9,760 bytes, 598→110줄. broader controller 71,382→54,304 bytes로 23.9% 감소. 이것은 문서량이며 총 토큰·품질 향상 측정이 아니다. STATIC                                                                               |
| 8. metadata와 기존 사용자 파일                        | `keeps Oracle plugin release metadata versions aligned`, 네 manifest 값, 의도된 파일만 diff/status 확인                                                                                                                    | 네 source 버전 모두 0.83.1이고 검사 PASS. 초기 미추적 문서 세 개, `output/`, `test.bend`는 여전히 미추적 상태로 보존했다. 최종 push/설치는 아래 배포 기록에 연결한다. PUBLIC/STATIC                                               |

## 변경된 공개 출력과 실제 명령

| 출력/경계                              | 실행 또는 검사                                                                                       | 결과                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 entry 및 10 role reference           | 위 개별 entry/link/authority 검사                                                                    | 17/17 modular 검사 PASS. 공통 canonical reference source를 링크하고 복제하지 않는다.                                                                                      |
| 4 hook command target                  | source hooks.json 및 hook 29개 검사                                                                  | 네 command는 모두 `skills/frontend-oracle-design/scripts/oracle-guard-hook.mjs`. 실제 hook 이벤트 종류는 세 개다.                                                         |
| package `test`                         | `pnpm test`의 Oracle 패키지 작업                                                                     | `scripts/*.test.mjs`와 core `scripts/*.test.mjs`를 실행했다. Oracle 837/837 PASS, fresh.                                                                                  |
| package `lint`                         | `pnpm --filter @lodado/frontend-oracle-design-plugin lint`                                           | exit 0, 오류 0/경고 316. bundle와 eval projection checks도 포함한다.                                                                                                      |
| `workflow-docs:check` 및 대응 generate | 해당 공개 check 명령과 stale/generated-block 개별 테스트                                             | check exit 0. 전체 로그의 workflow/ref block 생성·부분 교체·stale 탐지·README 일치 검사 각각 PASS. 생성 여부를 경로 존재만으로 판단하지 않는다.                           |
| `bundles:check` 및 대응 generate       | 해당 공개 check 명령과 bundle 여섯 검사                                                              | exit 0, 7 bundles가 원본 노드와 일치. 생성기는 캐시 형식이지 새 authority가 아니다.                                                                                       |
| eval projection 및 소비자              | `to-skill-creator-evals.mjs --check`와 corpus/live/grader 기존 전체 검사                             | exit 0, 14 corpus + 5 held-out + 6 lifecycle + 25 boundary. 성공 Read만 인정하며 인용·실패·부분 Read는 로딩 증거가 아니다.                                                |
| 참조 CLI의 intake                      | `node <core>/scripts/oracle-reference-route.mjs --point scope-decision --include role-intake --json` | exit 0. `agent`에 intake/space/input/policy/risk/BVA 및 공통 closure, `card-format` 없음, reviewer 비어 있음.                                                             |
| 참조 CLI의 implement                   | 같은 명령에 `--include role-implement`                                                               | exit 0. 현재 implementation 의존성을 포함하며 `role-controller`, `role-reporting`, `role-review`는 agent에 없다.                                                          |
| 참조 CLI의 review                      | 같은 명령에 `--include role-review`                                                                  | exit 0. `role-review`는 reviewer bucket에만 있다. 세 결과의 authority는 advisory, coverage는 partial이다. unknown architecture/backend/performance는 정상적으로 포함한다. |
| 영향받은 외부 plugin 소비자            | root 11개 cached 작업과 별도로 affected package의 공개 `pnpm --dir … test` 재실행                    | fresh 네 공개 package 명령 모두 exit 0. interface 33/33, system-design 16/16, visual-qa 10/10, test 6/6, 합계 65/65 PASS. 아래 이름별 import/owner 검사를 직접 실행했다.  |
| 4 metadata 및 실제 설치                | source lockstep와 실제 `plugin list --json`의 version/cache path                                     | push 전 source는 0.83.1, 실제 Claude/Codex registry와 cache는 0.83.0이다. marketplace 이름의 `details`가 source 0.83.1을 보여도 최신 설치라고 간주하지 않는다.            |

`<core>`는 `packages/frontend-oracle-design/skills/frontend-oracle-design`이다.
`scope-decision`은 지원되는 실제 decision point다. `interview`, `implementation`, `review`나 `--help` 실패를 성공 검사로 계산하지 않았다.

## 외부 소비자 fresh 통합 검증

Sol shark가 각 package.json의 실제 test script를 확인한 뒤 Turbo 없이 공개 `pnpm --dir <package> test`를 실행했다. 네 명령 모두 exit 0, fail/cancel/skip 0이다.

| package                     | 결과  | 이동·소유권 경계를 직접 검사한 통과 테스트                                                                                                                                                                                                                                                                          |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-interface-design` | 33/33 | `ships source fingerprints and local resolution without redistributing dictionary text`는 이동된 `resolve-executable.mjs`를 실제 import하고 python3/git 해석을 사용한다. `routes contextual Bend generation without changing design authority or delivery`도 PASS. 설치된 Bend CLI 검사는 실행됐고 skip하지 않았다. |
| `frontend-system-design`    | 16/16 | `the Oracle remains the orchestrator when it loads system-design references`는 이동된 core와 `roles/intake.md`를 읽고 controller 연결 및 intake의 정책 제안 소유권을 검사한다.                                                                                                                                      |
| `frontend-visual-qa`        | 10/10 | `is referenced as a separate responsibility by Oracle and behavior test skills`는 이동된 core와 test entry를 읽고 시각 QA 위임 및 BROWSER_VERIFIED 권한 분리를 검사한다.                                                                                                                                            |
| `test`                      | 6/6   | `ships the frontend test contract with its required BVA reference`는 이동된 canonical BVA와 외부 test의 번들 본문 일치를 검사한다. `O31: records runs through the oracle ledger and blocks weakened tests`도 PASS.                                                                                                  |

합계 65/65이며 live AI/Figma 실행을 의미하지 않는다. 실행 후 네 소비자 package와 공유 runtime의 diff가 추가로 생기지 않았음을 확인했다.
명령·결과 기록은 `$JCODE_SCRATCH_DIR/sol-fresh-sibling-consumers.log`와 `sol-sibling-*.log`다.

## 실제 native RED → 교정 → 수용

동일한 첫 조사 요청, low effort 및 읽기 전용 도구 제한으로 실제 native CLI를 실행했다.
초기 설치 상태와 후속 source package 로더 검사를 구분한다.

1. `oracle-modular-live-controller-intake.ndjson`: controller/common만 읽고 예비 조사로 intake와 mandatory/loading을 다음 턴으로 미뤘다. **RED**다.
2. `…-fixed.ndjson`: intake Skill은 호출했지만 current-stage 의존성을 미뤘다. **부분 개선, 수용 실패**다.
3. `…-final.ndjson`: 의존 참조를 호출했으나 60/50/40줄 prefix Read가 있어 필수 본문을 완전히 전달하지 않았다. **수용 실패**다.
4. `…-complete.ndjson`: 실제 `claude -p --plugin-dir <package>` 로더로 94.15초, exit 0. 프로젝트 `parseTranscript`/`loadedNodesFrom`과 독립 Sol이 아래 수용 조건을 확인했다.

`controller Skill → common 전체 Read → mandatory 전체 Read → loading 전체 Read → intake Skill → common 재독 → intake/policy/risk/space/input/BVA 전체 Read → bounded source 조사 → Design-only 반환`

Canonical full-body ID는 `common`, `mandatory-verification`, `role-loading`, `role-intake`,
`card-policy-sources`, `card-risk-grill`, `role-space-discovery`, `role-case-space-inputs`, `bva`다.
두 번째 common은 native `file_unchanged` 반환이며 같은 세션의 앞선 전체 본문이 유지됨을 확인했다.
모델 도구는 Skill/Read/Grep뿐이고 source Read는 offset 4531, limit 450이다.
제품 수정·테스트·run·승인·receipt 및 future author/implement/review/`$test` 호출이 없다.

**수용한 것:** 역할 연결, 현재 단계 전체 참조 전달, 한정된 소스 조사와 승인 전 안전한 정지.

**수용하지 않은 것:** 전체 모델 흐름 및 정책 판단 품질. 실제 응답에는 progress lane header 누락,
영어 progress, final header의 graph ID 별칭, 요청이 잘렸다는 잘못된 주장,
읽지 않은 정책 문서를 source candidate로 제시한 부분이 남았다.
따라서 완전히 준수하는 intake나 전체 정책 품질 PASS라고 부르지 않는다.
Codex native 전체 실행과 실제 토큰/비용 비교도 하지 않았다.
새 교정을 반복해서 넓히지 않고 이 한계를 남긴다.

## 재현 가능한 증거 위치

- 최종 전체 실행: background task `408180k7ui`, exit 0, 392.85초.
- 원본 Oracle 결과: `packages/frontend-oracle-design/.turbo/turbo-test.log`, 837/837, fail/cancel/skip 0.
- 개별 공개 검사: `$JCODE_SCRATCH_DIR/sol-public-interface-validation.log`, focused 61/61 및 generator/CLI 출력.
- native traces: `$JCODE_SCRATCH_DIR/oracle-modular-live-controller-intake{,-fixed,-final,-complete}.ndjson`.
- public role JSON: `$JCODE_SCRATCH_DIR/oracle-acceptance-route-{intake,implement,review}.json`.
- scope가 제한된 독립 리뷰: Sol peacock, 공개 경계 검증: Sol shark, 원요청 수용 매핑: Sol penguin. 모두 `gpt-6.1-sol`이다.

로컬 로그는 저장소에 raw transcript로 복제하지 않았다. 로그 경로는 이 머신에서의 관찰 증거이며 배포 artifact의 일부가 아니다.

## 배포 후 확인

- 검증된 코드와 이 문서의 prepush 증거는 `cf7dc9e` (`fix(oracle): require early intake handoff and full references`)로 commit했고 `origin/main` push가 성공했다. 설치를 먼저 갱신하지 않았다.
- 그 뒤 공개 명령 `claude plugin marketplace update`, `claude plugin update … --scope user --json`, `codex plugin add … --json`을 실행했다. Claude update는 0.83.0→0.83.1, Codex add는 0.83.1의 실제 installedPath를 반환했다.
- 실제 `claude plugin list --json`은 version 0.83.1, scope user, enabled true 및 `~/.claude/plugins/cache/my-vibe-coding-helper/frontend-oracle-design/0.83.1` 경로를 반환했다. 실제 Codex list 역시 version 0.83.1, installed/enabled true다. marketplace 이름의 source-resolved details를 설치 증거로 쓰지 않았다.
- Claude와 Codex 실제 cache의 skills/hooks/package.json/양쪽 manifest를 소스와 파일별 SHA-256으로 비교했다. 각각 **223/223 일치**, 세 manifest 모두 0.83.1, 정확히 다섯 named entry이고 flat 중복은 없다. Codex cache는 `~/.codex/plugins/cache/my-vibe-coding-helper/frontend-oracle-design/0.83.1`이다. 실제 Claude cached manifest의 공개 validate도 exit 0이다.
- 다섯 Jcode 디렉터리를 `rsync -a`로 동기화하고 파일별 SHA-256을 비교했다. core 215개+네 role entry로 **219/219 일치**다. 로컬 전용 파일은 0개이며 `--delete`, 사용자 파일 삭제 및 Codex plain-copy 설치를 하지 않았다.
- 증거는 `$JCODE_SCRATCH_DIR/oracle-0831-{claude,codex}-installed.json`과 `oracle-0831-install-parity.log`다. 양쪽 marketplace가 같은 작업 디렉터리를 가리켜 별도 merge는 하지 않았다. 기존 user 미추적 파일은 그대로 보존했다.

이미 열린 Claude/Codex/Jcode 세션은 재시작해서 새 entry를 로드해야 한다. 사용자 세션을 자동 종료하거나 Codex trust를 우회하지 않았다.
버전·경로·입력 digest 변경으로 기존 worker packet은 다시 발행해야 할 수 있다.
