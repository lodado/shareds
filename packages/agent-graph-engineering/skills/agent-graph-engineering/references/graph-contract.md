# Agent Workflow Graph Contract

Graph Controller와 Worker가 같은 실행 경계를 공유하기 위한 최소 계약이다. 첫 버전은
정적 graph만 지원하며 실행 중 임의 Node 생성은 지원하지 않는다.

## Graph

```json
{
  "id": "fix-login-race",
  "outcome": "중복 로그인 요청의 원인을 수정하고 회귀 검증을 통과한다.",
  "stopCondition": "targeted test와 영향 검증이 통과한 success terminal에 도달한다.",
  "entry": "N1",
  "terminals": ["N5", "N6"],
  "maxSteps": 12,
  "context": ["request"],
  "nodes": [],
  "edges": []
}
```

- `id`, `outcome`, `stopCondition`은 비어 있지 않은 문자열이다.
- `entry`는 존재하는 Node 하나를 가리킨다.
- `terminals`는 `kind: terminal`인 Node만 가리키며 outgoing Edge를 갖지 않는다.
- `maxSteps`는 retry와 cycle을 포함한 전체 Node 실행 횟수의 양의 정수 상한이다.
- `context`는 그래프 밖에서(사용자 요청, Controller 초기 입력) 제공되는 input field
  이름 목록이다. 모든 Node의 `input` field는 `context`에 있거나 해당 Node에 도달할 수
  있는 상류 Node의 `output`에 선언되어야 하며, 아니면 `NODE_INPUT_UNSATISFIED`로
  검증에 실패한다.

`maxSteps`는 첫 버전의 전역 안전장치다. 독립 loop마다 다른 예산이 실제로 필요해질
때만 per-cycle counter를 추가한다.

## Node

```json
{
  "id": "N2",
  "kind": "agent",
  "owner": "executor",
  "task": "승인된 계획만 구현하고 변경 파일과 검증 결과를 반환한다.",
  "input": ["approvedPlan"],
  "output": ["status", "summary", "artifacts"],
  "writeScope": ["packages/auth/**"],
  "retryLimit": 1,
  "dispatch": "one"
}
```

- 모든 Node ID는 유일하다.
- `task`는 해당 Node가 수행할 한 가지 책임과 완료 기준을 적은 비어 있지 않은 문자열이다.
- `agent`는 실제 native surface에 설치된 구체적인 `owner` 역할을 가져야 한다.
- `input`과 `output`은 구조화된 field 이름이다. Edge 조건은 source Node의 `output`에
  선언된 field만 볼 수 있다.
- `writeScope`는 agent가 수정할 수 있는 repo-relative 범위다. read-only agent는 빈
  배열을 쓴다. `!`로 시작하는 항목은 제외 범위다 — 예: `["**", "!.ai/agent-graphs/**"]`는
  실행 ledger를 제외한 전체 쓰기를 뜻한다. 제외 항목도 repo-relative여야 하며, 병렬
  쓰기 충돌 검사는 보수적으로 positive 범위만 비교한다.
- `retryLimit`은 0 이상의 정수이며 기본값은 0이다.
- `dispatch` 기본값은 `one`이다. `all`은 일치하는 Edge 모두를 fan-out할 때만 쓴다.
- `join` Node는 `join: all | any`를 추가한다.

## Edge와 전이

무조건 Edge:

```json
{ "from": "N1", "to": "N2", "when": "always" }
```

조건 Edge:

```json
{
  "from": "N3",
  "to": "N4",
  "when": { "field": "status", "equals": "failure" }
}
```

조건은 top-level output field의 strict equality만 지원한다. 임의 JavaScript, 정규식,
자유 서술 판정은 허용하지 않는다.

- `dispatch: one`: 정확히 한 Edge가 일치해야 한다.
- `dispatch: all`: 일치하는 모든 Edge를 활성화한다.
- 0개 일치: `NO_TRANSITION`
- `dispatch: one`에서 여러 개 일치: `AMBIGUOUS_TRANSITION`
- terminal Node: 다음 Edge 없이 종료한다.

Worker는 `status`와 evidence를 제출할 뿐 `to`나 다음 Node ID를 반환하지 않는다.
Controller가 output을 validator에 전달하고 반환된 Edge만 따른다.

## Fallback

정책 위반이나 실패처럼 **모든 Node가 같은 곳으로 보내는** 결과는 Node마다 Edge를
재선언하지 않고 그래프 최상위에 한 번만 선언한다.

```json
{
  "fallback": [
    { "when": { "field": "classification", "equals": "POLICY_GAP" }, "to": "draft-oracle" },
    { "when": { "field": "classification", "equals": "FAIL" }, "to": "failed" }
  ]
}
```

- Node 전용 Edge가 언제나 우선한다. 일치하는 Edge가 하나도 없을 때만 fallback을 본다.
  같은 조건에 다른 목적지가 필요한 Node는 자기 Edge를 선언해 그래프 규칙을 덮는다.
- 조건은 Edge와 같은 `{ field, equals }` strict equality다. `always`는 쓸 수 없다 —
  모든 Node의 모든 결과를 삼켜 `NO_TRANSITION`을 무력화하기 때문이다.
- 한 조건은 규칙 하나만 가질 수 있다. 중복은 `FALLBACK_DUPLICATE`, 없는 Node를 가리키면
  `FALLBACK_TARGET_UNKNOWN`이다.
- fallback은 terminal이 아닌 모든 Node에서 출발하므로 도달성 검사가 이 경로를 함께 센다.
  반면 `NODE_INPUT_UNSATISFIED`는 fallback 목적지에만 이 경로를 인정한다 — 모든 Node에
  인정하면 규칙 하나로 그래프 전체 input이 만족된 것처럼 보이기 때문이다.
- fallback으로도 일치하지 않으면 여전히 `NO_TRANSITION`이다. 모델링하지 않은 결과를
  조용히 삼키지 않는다.

## 병렬 쓰기

같은 `dispatch: all` fan-out에서 실행될 수 있는 agent Node의 `writeScope`가 겹치면
병렬 실행하지 않는다. 겹침 판정은 glob-aware다 — `*`는 한 segment, `**`는 0개 이상의
segment와 일치하며 모든 scope는 자기 하위 경로를 포함한다. `packages/*/auth/**`와
`packages/app/auth/tokens/**`처럼 중간 glob을 통한 겹침도 충돌이다. graph를
직렬화하거나 scope를 실제 소유 경계로 좁힌다. 빈 scope는 read-only로 취급한다.

## Event ledger

복잡하거나 재개 가능한 실행만 `events.jsonl`을 남긴다. 각 줄은 최소한 다음 값을
가진다.

```json
{
  "at": "2026-08-20T00:00:00.000Z",
  "type": "node.completed",
  "node": "N3",
  "status": "SUCCEEDED",
  "output": ".ai/agent-graphs/fix-login-race/outputs/N3.json"
}
```

event는 append-only다. 이전 결과를 정정해야 하면 기존 줄을 수정하지 않고 새
`graph.revised` 또는 `node.superseded` event를 추가한다.

## 런타임 경계 강제

`events.jsonl`을 유지하는 실행에서 Controller는 Node 완료마다 `node.completed` event를
먼저 append하고, 전이 판정 시 `graph-verify.mjs next --events <events.jsonl>`로 ledger를
함께 전달한다. validator는 다음을 기계 판정한다.

- `node.completed` 수가 `maxSteps`에 도달하면 `MAX_STEPS_EXCEEDED`로 전이를 거부한다.
- `join` Node의 전이는 incoming Edge의 source가 (`join: all`은 전부, `join: any`는 하나
  이상) `node.completed`를 남겼을 때만 허용하고, 아니면 `JOIN_NOT_READY`로 거부한다.

거부는 실행의 끝이지 증발이 아니다. Controller는 `MAX_STEPS_EXCEEDED`를 받으면 거부
코드와 마지막 Node를 담은 `node.completed`를 append하고 failure terminal에서 종료해,
ledger만 읽어도 왜 멈췄는지 알 수 있게 한다. `JOIN_NOT_READY`는 종료가 아니라 대기다 —
Controller는 join Node로 전이하기 전에 target join을 `graph-verify.mjs next`로 먼저
판정해, 준비 안 된 join 본문을 실행해 반쪽 산출물을 남기지 않는다.

`gate` Node의 사용자 결정만은 기계 판정 대상이 아니다 — Controller는 명시적 답변 전
`WAITING_USER`에서 멈춘다.
