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
  `POLICY_GAP`→`draft-oracle`, `FAIL`→`failed`, `PRODUCT_DEFECT`→`implement-green`,
  `EVIDENCE_GAP`·`HARNESS_DEFECT`→`evidence-repair`. Node 전용 Edge가 있으면 그쪽이
  우선한다(예: `valid-red`의 `HARNESS_DEFECT` 자기 재시도).
- `ENVIRONMENT_DEFECT`와 `NON_ORACLE_OPINION`은 finding 분류로만 남고 graph label이
  아니다. 환경 결함은 사유를 ledger에 남기고 `FAIL`로 보고하며, opinion만 남은 review
  판정은 `review-decision`이 `REVIEW_ACCEPTED`로 정규화한다.
- graph `maxSteps`는 runaway 상한일 뿐, `oracle-run.mjs budget` 판정을 대체하지 않는다.
- graph Node 안에서 `$frontend-oracle-design` 재귀 호출 금지. 현재 로드된 계약과 조건부
  reference만 적용.
- `user-confirmation` gate는 명시적 답변 전 `WAITING_USER`로 멈춘다. 카드·Design Change·
  architecture 확인을 생략하거나 agent가 대신 승인하지 않는다.
