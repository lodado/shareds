# 그래프 오케스트레이션 — 명시적 요청만

사용자가 graph-orchestrated delivery loop를 명시적으로 요청한 경우에만 설치된
`$agent-graph-engineering`을 이름으로 명시적으로 로드·호출하고
[`oracle-workflow.graph.json`](oracle-workflow.graph.json)을 실행한다. 요청이 없으면 현재
agent가 같은 계약·게이트·상태 전이를 순차 수행한다 — subagent 위임을 강제하지 않으며
agent 재량 선택만 허용한다. 그래프 모드에서 스킬이나 graph verifier를 찾을 수 없으면
순차 실행으로 우회하지 않고 `FAIL`.

- Controller는 Node 실행·Edge 선택만 소유. 제품 정책·카드·lock·ledger·상태 전이·예산은
  Oracle이 계속 소유.
- bundled graph를 대상 레포 `.ai/agent-graphs/<oracle-id>/graph.json`에 그대로 복사하고
  실행 event는 같은 디렉터리 `events.jsonl`에 append-only 기록.
- 실행 전 bundled `graph-verify.mjs verify`로 그래프 검사. 각 Worker는 현재 Node의
  `task`만 수행해 선언된 output field를 JSON으로 반환.
- 다음 경로는 Worker가 고르지 않는다. Controller가 `graph-verify.mjs next`를
  `--events events.jsonl`과 함께 실행해 strict-equality로 일치한 Edge만 활성화하고
  `maxSteps` 초과·join 준비를 기계 판정.
- 반복 실패 경로는 Node마다 Edge를 두지 않고 그래프 `fallback`이 소유한다 —
  `POLICY_GAP`→`needs-decision`, `FAIL`→`failed`, `PRODUCT_DEFECT`→`implement-green`,
  `EVIDENCE_GAP`·`HARNESS_DEFECT`→`evidence-repair`. Node 전용 Edge가 있으면 그쪽이
  우선한다(예: `valid-red`의 `HARNESS_DEFECT` 자기 재시도). ledger 전인
  `draft-oracle`·`lock-oracle`의 `FAIL`은 node 전용 edge로 `pre-ledger-failed`에 가서
  실제 error를 보존하며, `runId`를 요구하는 `failed` terminal로 보내지 않는다. init 뒤
  `FAIL`은 실제 error와 runId를 포함해 `failed`로 간다. 같은 pre-init Node의
  `POLICY_GAP`은 node 전용 edge로 `pre-ledger-needs-decision`에 가며 runId를 받지 않는다.
- `ENVIRONMENT_DEFECT`와 `NON_ORACLE_OPINION`은 finding 분류로만 남고 graph label이
  아니다. 환경 결함은 사유를 ledger에 남기고 `FAIL`로 보고하며, opinion만 남은 review
  판정은 `review-decision`이 `REVIEW_ACCEPTED`로 정규화한다.
- `valid-red`는 `oracle-run.mjs transition --to VALID_RED`를 기록한 뒤에만 `VALID_RED`를
  분류한다. `ALREADY_SATISFIED`는 draft로 되돌리지 않고 `implement-green`에서 기존 구현
  증거의 zero-production verification만 수행한다; production 편집을 승인하지 않는다. 두 GREEN
  성공 경로 모두 `oracle-run.mjs transition --to IMPLEMENTED_GREEN`을 정확히 한 번 기록한다.
  `INVALID_RED`는 graph label로 쓰지 않는다.
- `POLICY_GAP`을 낼 수 있는 모든 Node는 구조화된 `decision`을 출력한다. init 뒤에는
  `oracle-run.mjs transition --to NEEDS_DECISION`과 실제 runId를 기록해 `needs-decision`으로
  보내고, ledger 전에는 `pre-ledger-needs-decision`에 policy evidence와 decision만 보존하며
  runId를 발명하지 않는다.
- visual evidence가 `pending`이면 `implement-green`은 resumable `IMPLEMENTED_GREEN` terminal로
  멈춘다. 새 graph run은 `draft-oracle`에서 persisted `IMPLEMENTED_GREEN`을 감지해
  `resume-implemented-green`으로 가고, completed visual evidence를 검증한 뒤 risk에 따라
  standard/high review로만 진행한다. 이 경로는 GREEN transition을 다시 기록하거나
  `REVIEW_VERIFIED`를 미리 주장하지 않는다. certifiable visual PASS는 trusted
  `oracle-run --adapter node-test` run의 locked test가 Playwright를 호출해 만든 schema-v3 artifact뿐이며,
  standalone Playwright adapter는 지원하지 않는다. Browser MCP observation은 pending이다.
- High-risk fanout 성공은 Controller-issued `reviewAssignments`·`reviewDispatches`와 `READY`를
  내보낸다. reviewer는 finding artifact만 반환한다. Controller/join은 각 finding에
  `oracle-run.mjs review-receipt`를 호출해 `packetSha256`, `targetRevision`, `role`, `taskId`,
  `outputSha256`, `reviewerId`, `findingsSha256`, `previousDigest`, `digest`를 포함한 ledger-bound
  receipt 두 개를 만든다. 새 run record와 receipt에는 잠긴 `oracleSha256`와 `adapter: node-test`를
  명시한다. `review-decision`과 `final-verify`는 두 receipt identity/digest를
  검증하며 receipt command의 실제 error는 `FAIL`로 전파한다. BLOCKED는 `evidence-repair`로 간다.
- graph `maxSteps`는 runaway 상한일 뿐, `oracle-run.mjs budget` 판정을 대체하지 않는다.
- graph Node 안에서 `$frontend-oracle-design` 재귀 호출 금지. 현재 로드된 계약과 조건부
  reference만 적용.
- `user-confirmation` gate는 명시적 답변 전 `WAITING_USER`로 멈춘다. 카드·Design Change·
  architecture 확인을 생략하거나 agent가 대신 승인하지 않는다.
