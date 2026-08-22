# Delivery — 테스트로 계약 상태 확인 (`VALID_RED`)

1. bundled `oracle-lock.mjs verify` 실행, revision·exit code 기록. `exec`·`transition`은
   매 호출 같은 검증 자동 수행.
2. 카드의 모든 비-N/A 행을 관찰 가능한 테스트로 번역하고 test name을 `evidence.json`
   해당 행에 먼저 매핑.
3. network 경계는 레포가 이미 쓰는 test boundary를 우선한다. MSW가 설치됐거나 도입이
   승인됐으면 MSW handler, 아니면 기존 transport seam. 테스트만 위해
   dependency를 조용히 추가하지 않는다. handler·예시 데이터는 경계를 소유한 가장
   가까운 곳, FSD 배치는 [`fsd.md`](../fsd.md)의 `__mocks__/` 규칙.
4. 각 행의 `Then`, `Never`, 부작용 종류·횟수를 함께 assert. 요청 횟수·순서는 handler에서
   관찰.
5. 테스트를 `exec`로 실제 실행.
6. 실패가 `$test`의 `VALID_RED` 술어를 만족하면 `oracle-verify.mjs red`로 지정 행의
   reported test 실패를 확인. 그 runId·행으로 전이를 기록하고, 전이 통과 뒤에만
   production 수정.

카드가 커서 init에 milestone을 선언했다면 각 묶음 작성 즉시 `red:<name>` label로
reported RED를 실행한다. 모든 묶음이 실제로 실패한 후 마지막 milestone run을 `--run`으로
인용해 전역 `VALID_RED`로 전이한다. 하나라도 없으면 `MILESTONE_RED_MISSING`이며 독립
lock·상태를 만들지 않는다. milestone은 초기 RED 피드백만 앞당기고 GREEN·review는 기존
전역 gate 그대로.

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
production을 먼저 건드렸다는 기계 증거 — 변경 파일을 되돌려 순서를 지키고 우회하지
않는다. 전이는 이 시점의 테스트 파일 digest·assertion 수를 GREEN 게이트 기준선으로
저장한다.

`--harness-path` 등록 파일은 해당 bytes로 reported RED를 기록하기 전까지 변경 가능.
`VALID_RED` 후 다시 바꾸면 harness 예산 미사용 시 `HARNESS_BUDGET_REQUIRED`, 변경된
bytes로 새 reported RED→GREEN 미실행 시 `HARNESS_RED_REQUIRED`로 완료 차단. production
파일을 harness로 등록해 순서 게이트를 우회하지 않는다.

요청된 동작이 이미 GREEN이면 production을 억지로 바꾸거나 RED를 만들지 않는다. 기존
구현이 카드를 충족한다는 증거를 기록하고 `--to IMPLEMENTED_GREEN --reason ...`으로
전이한다. 이 경로는 `ORACLE_READY` 이후 production 변경이 없을 때만 통과. High risk는
`$test`의 mutation 단계로 테스트 민감도를 별도 확인.
