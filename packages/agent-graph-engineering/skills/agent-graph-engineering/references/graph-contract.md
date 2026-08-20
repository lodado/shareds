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
  "nodes": [],
  "edges": []
}
```

- `id`, `outcome`, `stopCondition`은 비어 있지 않은 문자열이다.
- `entry`는 존재하는 Node 하나를 가리킨다.
- `terminals`는 `kind: terminal`인 Node만 가리키며 outgoing Edge를 갖지 않는다.
- `maxSteps`는 retry와 cycle을 포함한 전체 Node 실행 횟수의 양의 정수 상한이다.

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
  배열을 쓴다.
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

## 병렬 쓰기

같은 `dispatch: all` fan-out에서 실행될 수 있는 agent Node의 `writeScope`가 같거나 한
쪽이 다른 쪽의 상위 범위면 병렬 실행하지 않는다. graph를 직렬화하거나 scope를 실제
소유 경계로 좁힌다. 빈 scope는 read-only로 취급한다.

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
