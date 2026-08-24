# Delivery — 권위·스케줄·판정 명령 ledger

## 권위와 진입 조건

테스트 파일을 작성하기 직전에 설치된 `$test` 스킬을 이름으로 명시적으로 로드·호출해
SKILL.md 전문과 판정 계약을 활성화한다. 파일을 참고만 하는 것으로 대체하지 않으며,
못 찾으면 `FAIL`. `$test`의 Oracle 게이트·테스트 작성·실행·`VALID_RED` 판정·보정
예산을 그대로 따른다. Delivery 노드들은 production 구현과 자가피드백만 추가한다.
frontend production 수정 시
[`frontend/decisions.md`](../frontend/decisions.md)·[`frontend/authoring.md`](../frontend/authoring.md)도 전부 읽는다.

**TDD 우선.** `ORACLE_READY` 뒤 테스트 먼저 작성·실행, `VALID_RED` 확보 전 production
작성·수정 금지.

- Medium/High risk는 `ORACLE_READY` 카드가 필수다. Low fast path는 새 정책·카드가
  없고 기존 승인 계약 안의 되돌리기 쉬운 수정에만 쓴다 — lane 계약은
  [`lanes/low-fast-path.md`](../lanes/low-fast-path.md).
- 새 카드와 의미가 바뀐 revision은 risk와 무관하게 Draft와 delta를 사용자에게 다시
  확인받은 뒤 lock한다.
- 대상 레포의 `AGENTS.md`, `CLAUDE.md`, 테스트 스크립트, 인접 테스트, 필수 아키텍처
  문서를 production 수정 전에 읽는다.
- React architecture 경계·state ownership·public API가 바뀔 때만
  [`architecture-contract.md`](../architecture-contract.md)의 명시적 문서 승인과 Oracle
  local-source lock을 완료한다. 기존 승인 문서가 변경을 정확히 허용하면 경로와 source
  hash만 기록.
- 기존 worktree 변경을 보존하고 관련 없는 파일을 수정하지 않는다.

## 압축 스케줄

`policy`, `architecture`, `evidence`, `naming`, `review` 질문을 한 intake에 묶는다.
lock 전에는 독립적인 read-only 조사를 병렬 실행할 수 있지만, 모든 결과 변경 결정이
끝난 뒤 final lock을 1회 만든다. Draft Oracle 사용자 승인은 직렬 gate다. screenshot·
direct-browser 실행은 사용자가 명시적으로 요청한 별도 `$frontend-visual-qa` 소유.

`VALID_RED` 전에는 production을 수정하지 않는다. 이후 구현을 현재 agent가 직접
수행할지, 위임할지, 병렬화할지는 이 계약이 강제하지 않는다. 선택한 실행 방식과
무관하게 합친 production 기준으로 targeted GREEN을 1회 실행한다.

targeted GREEN 뒤에는 root test·lint·format과 독립 review를 병렬 실행한다. 각 `exec`가
runId reservation을 원자적으로 만들어 병렬에도 runId 충돌이 없다. 모든 결과가
합류하고 유효 finding이 반영된 뒤 final verify를 직렬 1회 실행한다. 어느 한 결과만으로
완료 처리 금지.

## 판정 명령은 ledger로 실행한다

모든 판정용 실행은 bundled `oracle-run.mjs exec` 경유. `exec`는 실행 직전 lock을
검증하고 runId·exit code·reporter 결과·env fingerprint·provenance를 append-only ledger에
남긴다. provenance에는 skill version, optional runtime/model, lock/worktree/production
snapshot, capability context가 들어간다. prompt 원문은 저장하지 말고 필요하면 hash나
sanitized metadata만 `--capability-context`에 넣는다. ledger에 없는 실행은 증거가 아니다.

```bash
node <skill-dir>/scripts/oracle-run.mjs exec \
  --dir .ai/oracles/<oracle-id> --label red-1 \
  --report <reporter-output-path> \
  --runtime codex --model '<model-or-host>' \
  --capability-context '<sanitized-json-or-hash>' \
  -- <레포의 실제 테스트 명령>
```

- reporter 경로를 넘기면 테스트 이름·상태까지 기록되어 grade가 `reported`가 된다.
  vitest·jest `--reporter=json --outputFile`, Playwright `--reporter=json`,
  `node --test --test-reporter=json` 지원.
- reporter 없거나 형식 미상이면 `exit-only`로 격하 — 카드 행의 테스트 이름을 증거로
  확정할 수 없으므로 가능하면 reporter를 붙인다.
- node:test 레포는 번들 `scripts/oracle-node-reporter.mjs` 사용. `--test-reporter`는
  module specifier라 `./` 또는 절대 경로로 넘긴다.
- 상태 전이는 `oracle-run.mjs transition`으로만 기록. 스크립트가 TDD 순서, 행별
  RED/GREEN evidence, `--required-label` 실행, 연속 통과 횟수, 테스트 약화, review
  artifact와 lock을 검사하고 거부 사유를 코드로 출력한다.
- TDD 순서 판정 기준선 = `init` 시점 worktree. 에디터 캐시·agent runtime 파일이 계속
  바뀌는 레포는 `init` 전에 worktree를 정리하거나 `--scan-root`로 범위를 대상 package로
  좁힌다. 무관한 변경이 `PRODUCTION_TOUCHED_BEFORE_RED`를 만들면 범위를 좁히고 다시
  시작하며, 검사를 끄지 않는다.
- 판정 범위: git 레포는 `git ls-files -c -o --exclude-standard`, 아니면 `node_modules`·
  빌드 산출물 제외 목록. **gitignore된 경로는 production 변경으로 세지 않는다.** 실제
  production인데 gitignore돼 있으면 `--scan-root`나 ignore 설정을 먼저 정리한다.

## 상태 조회와 resume

재개는 새 명령으로 상태를 발명하지 않고 기존 lock·`run-state.json`·`runs.jsonl`·budget·
evidence에서 재계산한다. 세션 시작 또는 컨텍스트 요약 뒤 먼저 실행한다.

```bash
node <skill-dir>/scripts/oracle-run.mjs status \
  --dir .ai/oracles/<oracle-id> \
  --json
```

출력은 `currentState`, `currentSnapshot`, `lockStatus`, `staleOrMissingRuns`,
`orphanedRun`, `remainingBudgets`, `blockers`, `nextLegalActions`를 담는다. stale run은
현재 lock/worktree/production snapshot과 다른 과거 증거이며 재사용하지 않는다.
`orphanedRun`은 `.run-ids` reservation은 있으나 ledger 완료 기록이 없는 실행이다. 같은
runId를 손으로 재사용하지 말고 새 `exec`를 실행한다. 상태 파일 쓰기는 temp file + atomic
rename으로만 수행하고 직접 편집하지 않는다.

### 이 하네스가 판정하지 못하는 것

- `evidence verify`는 인용 테스트 이름이 그 run에서 **실제로 통과했는지**만 본다.
  행↔테스트 대응의 타당성은 독립 reviewer 체크리스트 담당.
- `run-state.json`·`runs.jsonl`을 지울 수 있는 actor는 기준선·예산을 재시작할 수 있다.
  `init`의 거부는 drift 검출이지 권한 통제가 아니다. High risk만 `.ai/oracles/**`, lock
  SHA, run IDs를 CI artifact와 CODEOWNERS·required review로 보호한다. Low/Medium에는
  기본 강제하지 않는다.
- 비결정 소스 scan은 알려진 토큰 목록 기반 — 검출 실패를 무결성 증거로 쓰지 않는다.
- 예산 사용마다 `oracle-run.mjs budget --spend policy|harness|product --reason ...` 호출.
  `BUDGET_EXHAUSTED`면 다른 예산으로 우회하지 않고 `FAIL`로 보고.
