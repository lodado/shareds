# Oracle 기반 구현·자가검증 루프

## 목차

0. 판정 명령은 ledger로 실행한다
1. 테스트로 계약 상태 확인
2. Frontend 구현 결정
3. 최소 구현·셀프피드백
4. GREEN 게이트와 evidence manifest
5. 금지

## 권위와 진입 조건

테스트 파일을 작성하기 직전에 설치된 `$test` 스킬을 이름으로 명시적으로 로드·호출해
SKILL.md 전문과 판정 계약을 활성화한다. 파일을 참고만 하는 것으로 대체하지 않으며,
스킬을 찾거나 로드할 수 없으면 `FAIL`로 멈춘다. `$test`의 Oracle 게이트, 테스트 작성,
실행, `VALID_RED` 판정과 보정 예산을 그대로 따른다. 이 문서는 production 구현과
자가피드백만 추가한다. frontend production을 수정할 때는
[`frontend-implementation.md`](frontend-implementation.md)도 전부 읽는다.

**TDD가 우선이다.** `ORACLE_READY` 뒤 테스트를 먼저 작성·실행하고, sibling `test` skill이
인정하는 `VALID_RED`를 확보하기 전에는 production 코드를 작성하거나 수정하지 않는다.

- Medium/High risk는 `ORACLE_READY` 카드가 필수다. Low fast path는 새 정책·카드가
  없고 기존 승인 계약 안의 되돌리기 쉬운 수정에만 쓴다.
- 새 카드와 의미가 바뀐 revision은 risk와 무관하게 Draft와 delta를 사용자에게
  다시 확인받은 뒤 lock한다.
- 대상 레포의 `AGENTS.md`, `CLAUDE.md`, 테스트 스크립트, 인접 테스트와 필수
  아키텍처 문서를 production 수정 전에 읽는다.
- React architecture 경계·state ownership·public API가 바뀔 때만
  [`architecture-contract.md`](architecture-contract.md)의 명시적 문서 승인과
  Oracle local-source lock을 완료한다. 기존 승인 문서가 변경을 정확히 허용하면
  새 승인 없이 경로와 source hash를 기록한다.
- 기존 worktree 변경을 보존하고 관련 없는 파일을 수정하지 않는다.

## 압축 스케줄

`policy`, `architecture`, `evidence`, `naming`, `review` 질문을 한 intake에 묶는다.
lock 전에는 서로 독립적인 read-only 조사를 병렬 실행할 수 있지만, 모든 결과 변경
결정이 끝난 뒤 final lock을 1회 만든다. Draft Oracle 사용자 승인은 직렬 gate다.
screenshot과 direct-browser 실행은 이 문서에 넣지 않고 사용자가 명시적으로 요청한
별도 `$frontend-visual-qa`가 소유한다.

`VALID_RED` 전에는 production을 수정하지 않는다. 이후 독립 구현 작업이 둘 이상일 때만
겹치지 않는 파일 소유권으로 worker를 최대 2개까지 병렬 실행하고, 합친 뒤 targeted
GREEN을 1회 실행한다. 작은 diff는 agent를 만들지 않는다.

targeted GREEN 뒤에는 root test·lint·format과 독립 review를 병렬 실행한다. 모든 결과가
합류하고 유효 finding이 반영된 뒤 final verify를 직렬로 1회 실행한다. 어느 한 결과만으로
완료 처리하지 않는다.

## 0. 판정 명령은 ledger로 실행한다

이 문서의 모든 판정용 실행은 bundled `oracle-run.mjs exec`를 거친다. `exec`는 실행
직전 lock을 검증하고, 실행 후 runId·exit code·reporter 결과·env fingerprint를
append-only ledger에 남긴다. ledger에 없는 실행은 증거가 아니다.

```bash
node <skill-dir>/scripts/oracle-run.mjs exec \
  --dir .ai/oracles/<oracle-id> --label red-1 \
  --report <reporter-output-path> \
  -- <레포의 실제 테스트 명령>
```

- reporter 경로를 넘기면 테스트 이름과 상태까지 기록되어 grade가 `reported`가 된다.
  vitest·jest의 `--reporter=json --outputFile`, Playwright의 `--reporter=json`,
  `node --test --test-reporter=json`을 지원한다.
- reporter가 없거나 형식을 모르면 grade는 `exit-only`로 격하된다. 격하된 run으로는
  카드 행의 테스트 이름을 증거로 확정할 수 없으므로, 가능하면 reporter를 붙인다.
- node:test 레포는 번들 `scripts/oracle-node-reporter.mjs`를 쓴다. `--test-reporter`는
  module specifier라 `./` 또는 절대 경로로 넘긴다.
- 상태 전이는 `oracle-run.mjs transition`으로만 기록한다. 스크립트가 TDD 순서,
  행별 RED/GREEN evidence, `--required-label` 실행, 연속 통과 횟수, 테스트 약화,
  review artifact와 lock을 검사하고 거부 사유를 코드로 출력한다.
- TDD 순서 판정은 `init` 시점의 worktree를 기준선으로 쓴다. 에디터 캐시나 agent
  runtime 파일이 계속 바뀌는 레포는 `init` 전에 worktree를 정리하거나 `--scan-root`로
  판정 범위를 대상 package로 좁힌다. 무관한 변경이 `PRODUCTION_TOUCHED_BEFORE_RED`를
  만들면 범위를 좁히고 다시 시작하며, 검사를 끄지 않는다.
- 판정 범위는 git 레포에서 `git ls-files -c -o --exclude-standard`, git이 없으면
  `node_modules`·빌드 산출물을 제외한 파일 목록이다. **gitignore된 경로의 변경은
  production 변경으로 세지 않는다.** 빌드 산출물이 아니라 실제 production인데
  gitignore돼 있으면 이 게이트가 그 파일을 보지 못하므로 `--scan-root`나 레포의
  ignore 설정을 먼저 정리한다.

### 이 하네스가 판정하지 못하는 것

- `evidence verify`는 인용한 테스트 이름이 그 run에서 **실제로 통과했는지**만 본다.
  그 테스트가 해당 카드 행을 정말 검증하는지는 판정하지 못하므로, 행과 테스트의
  대응은 독립 reviewer 체크리스트가 계속 담당한다.
- `run-state.json`·`runs.jsonl`을 지울 수 있는 actor는 기준선과 예산을 새로 시작할 수
  있다. `init`은 ledger가 남아 있으면 거부하지만, 이는 drift 검출이지 권한 통제가
  아니다. 강한 통제가 필요하면 `.ai/oracles/**`를 CODEOWNERS와 CI human approval로
  보호한다.
- 비결정 소스 scan은 알려진 토큰 목록 기반이라 우회할 수 있다. 검출 실패를 무결성
  증거로 쓰지 않는다.
- 예산을 쓸 때마다 `oracle-run.mjs budget --spend policy|harness|product --reason ...`을
  호출한다. `BUDGET_EXHAUSTED`면 다른 예산으로 우회하지 않고 `FAIL`로 보고한다.

## 1. 테스트로 계약 상태 확인

1. bundled `oracle-lock.mjs verify`를 실행하고 revision과 exit code를 기록한다.
   `exec`·`transition`은 매 호출마다 같은 검증을 자동으로 수행한다.
2. 카드의 모든 비-N/A 행을 관찰 가능한 테스트로 번역하고 test name을
   `evidence.json`의 해당 행에 먼저 매핑한다.
3. network 경계가 있으면 MSW handler로 세운다. 레포에 MSW가 없으면 설치 여부를 먼저
   확인하고, MSW로 표현할 수 없는 경우에만 다른 mocking 수단을 사유와 함께 쓴다.
   handler와 예시 데이터는 그 경계를 소유한 가장 가까운 곳에 두고, FSD 배치는
   [`fsd.md`](fsd.md)의 `__mocks__/` 규칙을 따른다.
4. 각 행의 `Then`, `Never`, 부작용 종류·횟수를 함께 assert한다. 요청 횟수와 순서는
   handler에서 관찰한다.
5. 테스트를 `exec`로 실제 실행한다.
6. 실패가 sibling `test` skill의 `VALID_RED` 술어를 만족하면
   `oracle-verify.mjs red`로 지정 행의 reported test가 실제로 실패했는지 확인한다.
   그 runId와 행으로 전이를 기록하고, 전이가 통과한 뒤에만 production을 수정한다.

카드가 커서 init에 milestone을 선언했다면 각 묶음을 작성하는 즉시
`red:<name>` label로 reported RED를 실행한다. 모든 묶음이 해당 run에서 실제로
실패한 후 마지막 milestone run을 `--run`으로 인용해 전역 `VALID_RED`로
전이한다. 하나라도 없으면 `MILESTONE_RED_MISSING`이며 독립 lock·상태를
만들지 않는다. milestone은 초기 RED 피드백만 앞당기고 GREEN·review는 기존
전역 gate를 그대로 쓴다.

```bash
node <skill-dir>/scripts/oracle-run.mjs exec \
  --dir .ai/oracles/<oracle-id> \
  --label red:list \
  --report .ai/oracles/<oracle-id>/red-list.json \
  -- <targeted-test-command>
```

```bash
node <skill-dir>/scripts/oracle-verify.mjs red \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --map .ai/oracles/<oracle-id>/evidence.json \
  --ledger .ai/oracles/<oracle-id>/runs.jsonl \
  --run r-001 \
  --row O1
```

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to VALID_RED \
  --run r-001 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --row O1
```

`RED_EVIDENCE_UNVERIFIABLE`·`RED_EVIDENCE_MISSING`은 무관한 compile/setup 실패나
exit-only run을 RED로 쓰지 못하게 한다. `PRODUCTION_TOUCHED_BEFORE_RED`는 테스트보다
production을 먼저 건드렸다는 기계 증거다. 변경 파일을 되돌려 순서를 지키고,
우회하지 않는다. 전이는 이 시점의 테스트 파일 digest와 assertion 수를 GREEN
게이트의 기준선으로 저장한다.

`--harness-path`로 등록한 파일은 해당 bytes로 reported RED를 기록하기 전까지
바꿀 수 있다. `VALID_RED` 후 그 파일을 다시 바꾸면 harness 예산을 쓰지
않은 경우 `HARNESS_BUDGET_REQUIRED`, 변경된 bytes로 새 reported RED→GREEN을 실행하지
않은 경우 `HARNESS_RED_REQUIRED`로 완료를 차단한다. 대상이 아닌 production 파일을
harness로 등록해 순서 게이트를 우회하지 않는다.

요청된 동작이 이미 GREEN이면 production을 억지로 바꾸거나 RED를 만들지 않는다.
기존 구현이 카드를 충족한다는 증거를 기록하고 `--to IMPLEMENTED_GREEN --reason ...`으로
전이한다. 이 경로는 `ORACLE_READY` 이후 production 변경이 없을 때만 통과한다.
High risk는 sibling `test` skill의 mutation 단계로 테스트 민감도를 별도 확인한다.

## 2. Frontend 구현 결정

`VALID_RED` 뒤 frontend production 수정이 필요하면 코드를 쓰기 전에 실제 package
version과 레포 규칙을 근거로 아래 기록을 남긴다. 외부 best practice는 제품 정책을
정하거나 레포 계약을 덮어쓰지 않는다. 순수 helper 등 해당하지 않는 항목은 이유와
함께 N/A로 기록한다.

먼저 [`changeability.md`](changeability.md)를 전부 읽는다. 그 문서의 정의·질문·React
예시·반례·trade-off 중 이번 diff에 material한 근거만 아래 Decision에 옮긴다. 원칙
본문을 복제하거나 다섯 축을 모두 채웠다는 선언으로 대신하지 않는다.

기록은 `.ai/oracles/<oracle-id>/implementation-decision.md`에 남긴다. 이 파일은 제품
정책 source가 아니라 reviewer가 diff와 대조할 구현 reasoning 원문이다. 모든 축을
의례적으로 채우는 boilerplate 대신 이번 변경에 material한 trade-off만 기록한다.

```markdown
### Implementation Decision

- Target: React/Next.js/TanStack Query version과 router/runtime
- State ownership: server state, URL state, client state, derived state의 소유자
- Server/Client boundary: server에 남길 것과 최소 client leaf
- Async boundary: initial loading, refetch, error, retry, mutation pending 처리
- Hook boundary: 분리할 interaction/query 책임과 분리하지 않을 trivial logic
- Architecture: 영향 unit, 승인된 architecture 문서, 기존 관례·data/effect 경계와
  Oracle source hash
- Changeability: material한 Readability·Predictability·Cohesion·Coupling 판단,
  우선한 축과 희생한 축의 trade-off
- Side effects: request·navigation·storage·analytics·logging의 종류와 owner/boundary
- Simplicity: 기존 구현→platform/framework 기본 기능→설치 dependency→최소 local
  code 중 처음 요구를 만족한 단계
- Design: Design Intent가 있으면 visual scope, component·token 재사용, typography,
  responsive, motion·reduced motion, copy, signature와 버린 generic 선택; 없으면 N/A
- Sources: 적용한 레포 계약·공식 문서·휴리스틱
- Rejected: 실제 검토했지만 적용하지 않은 대안, 관련 품질 축과 구체 이유
```

선택이 카드의 관찰 결과를 바꾸거나 승인된 기준과 충돌하면 구현하지 말고
`NEEDS_DECISION`으로 복귀한다. 기술적으로 동등한 선택이면
`frontend-implementation.md`의 runtime 기준과 `changeability.md`의 변경 비용 기준으로
결정하고 계속한다.

## 3. 최소 구현·셀프피드백

최대 3라운드 반복한다. 한 라운드는 다음 전체 묶음이다.

1. 실패한 카드 행 하나 또는 같은 root cause의 행 묶음을 고른다.
2. 관련 호출 경로를 끝까지 추적해 모든 호출자가 공유하는 원인을 찾는다.
3. 해당 계약만 만족하는 최소 production 변경을 작성한다.
4. 실패했던 targeted test를 재실행한다.
5. 영향 범위 테스트를 실행한다.
6. 결과를 분류하고 다음 행동을 결정한다.

| 분류                 | 행동                                                         |
| -------------------- | ------------------------------------------------------------ |
| `POLICY_GAP`         | 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`               |
| `EVIDENCE_GAP`       | 잠긴 카드 범위 안에서 누락 테스트·증거만 추가                |
| `HARNESS_DEFECT`     | sibling `test` skill 허용 항목과 공용 2회 예산 안에서만 보정 |
| `PRODUCT_DEFECT`     | 같은 카드 행을 유지하고 최소 수정 후 재실행                  |
| `ENVIRONMENT_DEFECT` | production을 건드리지 않고 `FAIL`                            |
| `NON_ORACLE_OPINION` | 기록하되 정책·assertion·완료 상태를 바꾸지 않음              |

revision mismatch는 피드백 분류 대상이 아니다. 기존 증거를 즉시 폐기하고
`oracle-card.md`의 lock 규칙대로 `NEEDS_DECISION` 또는 `FAIL`로 이동한다.

매 라운드 기록:

| 라운드 | 카드 행 | 실패 가설 | 최소 변경 | 실제 실행 결과 | 다음 판단 |
| ------ | ------- | --------- | --------- | -------------- | --------- |

## 4. GREEN 게이트

카드 테스트가 통과하면 init에서 `--required-label`로 고정한 레포 검증을 각 label의
`exec`로 실제 실행한다.

1. targeted test
2. 영향 범위 test
3. typecheck와 lint
4. Oracle source lock verify 및 레포에 존재하는 구조 검증 명령
5. 루트 또는 패키지 필수 test/build

레포 규칙에 정의된 명령이 우선이다. 실행하지 않은 검증을 통과했다고 보고하지
않는다. 문서화된 명령이 없으면 package scripts를 읽어 targeted + 가장 가까운
package 검증을 실행한다. 필수 root 명령이 없거나 무관한 기존 실패가 있으면 원문과
영향을 분리해 보고하며 GREEN으로 숨기지 않는다.

그다음 `--to IMPLEMENTED_GREEN` 전이를 시도한다. 스크립트가 아래를 기계로 검사한다.

| 거부 코드              | 뜻                                               | 올바른 대응                                        |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `ORACLE_CHANGED`       | 카드·source bytes가 잠긴 값과 다름               | 증거를 폐기하고 `NEEDS_DECISION`                   |
| `RUN_NOT_GREEN`        | 인용한 run이 통과하지 않음                       | 실제 통과 run을 만들고 인용                        |
| `EVIDENCE_REQUIRED`    | evidence manifest 없이 상태 전이를 시도함        | 잠긴 카드 전 행을 매핑하고 `--evidence`로 인용     |
| `REQUIRED_RUN_MISSING` | 선언한 필수 label의 최신 통과가 없음             | 해당 repo 명령을 `exec --label`로 다시 실행        |
| `FLAKINESS_GATE`       | 같은 명령의 연속 통과가 risk 필요 횟수에 못 미침 | 같은 명령을 그대로 다시 실행해 연속 통과를 확보    |
| `TEST_WEAKENED`        | RED 기준선 대비 assertion 감소·금지 토큰·삭제    | 테스트를 원래 강도로 되돌린다                      |
| `ENV_DRIFT`(경고)      | RED와 GREEN의 실행 환경이 다름                   | 환경 차이가 결과를 바꿨는지 확인하고 보고에 남긴다 |

flakiness 필요 횟수는 Low 1회, Medium 2회, High 3회다. 재실행으로 통과를 뽑아내는
것이 아니라 **같은 명령이 반복해도 결정론적으로 통과함**을 보이는 절차다. 실패가
섞이면 `HARNESS_DEFECT`로 분류하고 조용히 다시 굴리지 않는다.

`TEST_WEAKENED`가 가리키는 금지 토큰은 `test.skip`·`it.skip`·`describe.skip`·`.only(`·
`waitForTimeout(`·`toBeTruthy(`·`toBeFalsy(`·`.first()`·`.nth(`·`setTimeout(`과
screenshot 허용치(`maxDiffPixels`·`maxDiffPixelRatio`·`threshold`) 상향이다.

선택한 GREEN run은 parsed reporter가 있는 카드 test run이어야 한다. 별도 lint·typecheck·
build는 각각 선언한 label로 기록한다. 전이는 모든 필수 label과 evidence manifest를
직접 검사하며, 전이가 통과해야 `IMPLEMENTED_GREEN`이다.

### Evidence manifest

증거 매핑은 산문이 아니라 `.ai/oracles/<oracle-id>/evidence.json`으로 관리하고
기계로 검증한다.

```json
{
  "schemaVersion": 1,
  "rows": {
    "O1": { "kind": "test", "name": "저장 > pending 표시와 POST 1회" },
    "O2": { "kind": "reviewer", "finding": "f-3", "role": "code-reviewer" },
    "O3": { "kind": "na", "reason": "이 기능에 취소 경로가 없다", "source": "S1" },
    "D1": { "kind": "visual", "artifact": "visual-qa/v-001/evidence.json" },
    "D2": { "kind": "reviewer", "finding": "d-1", "role": "designer" }
  }
}
```

```bash
node <skill-dir>/scripts/oracle-verify.mjs evidence \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --map .ai/oracles/<oracle-id>/evidence.json \
  --ledger .ai/oracles/<oracle-id>/runs.jsonl \
  --run r-007 \
  --phase green
```

`D*` 행의 owner는 `HARD → test`, `RELATIONAL → visual | pending`, `JUDGMENT →
designer reviewer`다. visual `pending`은 GREEN 증거 검증에서 미검증 항목으로 보고되지만
review 증거 검증에서는 `EVIDENCE_PENDING`으로 완료를 차단한다.

GREEN 전이는 같은 manifest를 필수 입력으로 받는다.

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to IMPLEMENTED_GREEN \
  --run r-007 \
  --evidence .ai/oracles/<oracle-id>/evidence.json
```

`kind: test`는 인용한 run의 reporter 결과에 같은 이름이 통과로 존재해야 한다.
`EVIDENCE_NOT_IN_RUN`은 매핑이 실제 실행과 어긋난다는 뜻이고, `EVIDENCE_UNVERIFIABLE`은
run이 `exit-only`라 이름을 확인할 수 없다는 뜻이다. 둘 다 이름을 지어내지 말고
reporter를 붙여 다시 실행한다.

최종 보고에는 Oracle SHA-256·source hashes·마지막 verify command/exit, 인용한 runId와
실제 검증 command/PASS·FAIL 수, `oracle-verify.mjs evidence` 출력을 기록한다. 결과에
영향을 주는 commit·runtime/browser version·locale/timezone·viewport/theme·role·
clock/seed·데이터 초기화만 함께 기록한다. 비-N/A 행이 매핑되지 않거나 revision이
다르면 GREEN을 발급하지 않는다.

production diff에 비결정 소스가 새로 들어왔는지 확인하려면 `oracle-verify.mjs scan`을
변경 파일에 실행한다. 검출된 `Date.now`·`Math.random`·`crypto.randomUUID`·`toLocale`·
`new Intl.`은 주입 seam으로 바꾸거나 `oracle:nondeterminism <사유>` 주석으로 면제를
기록한다.

### 최종 review 전이

`IMPLEMENTED_GREEN` 뒤 reviewer finding을 반영하면 init에서 선언한 필수 label을
전부 다시 실행한다. 선택한 test run은 GREEN 때와 같은 command여야 하며, review
artifact에 blocking finding이 없어야 한다.

```bash
node <skill-dir>/scripts/oracle-verify.mjs review \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --file .ai/oracles/<oracle-id>/findings-code-reviewer.json

node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to REVIEW_VERIFIED \
  --run r-010 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --findings .ai/oracles/<oracle-id>/findings-code-reviewer.json
```

High risk는 두 번째 reviewer 파일을 `--intersect`로 함께 넘긴다. 다만 critical/high
finding은 한쪽에만 있어도 review를 막는다.

## 금지

- 카드의 정책·`Then`·`Never`·부작용 횟수 변경
- ledger를 거치지 않은 실행을 증거로 보고
- 거부된 전이를 우회하거나 `run-state.json`·`runs.jsonl`을 직접 편집
- 예산을 계수하지 않고 보정·개선 라운드를 반복
- assertion 약화, `test.skip`, `first()`/`nth()`로 오류 은폐
- fixture에 기대 결과 인코딩
- 임의 sleep 또는 단정 대상을 기다려 race 직렬화
- 브라우저의 현재 동작을 기대값으로 채택
- 유효하지 않은 RED를 근거로 production 수정
- revision mismatch를 자동 재잠금해 기존 증거 재사용
- 승인 없이 architecture 문서 생성·수정 또는 lock 갱신
- 승인된 architecture 문서가 아닌 구현에 맞춰 문서·경계를 사후 변경

3라운드 후에도 GREEN이 아니면 남은 카드 위반과 실제 출력을 포함해 `FAIL`로
보고한다. 무한 자가개선은 하지 않는다.
