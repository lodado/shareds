---
name: agent-graph-engineering
description: Use when the user explicitly requests graph-based AI orchestration, or when a task needs multiple agents or tools with branching, parallel work, joins, bounded retries, evaluation loops, or human decisions. Do not invoke for work one agent can complete safely in a short sequential flow.
---

# Agent Graph Engineering

사용자의 목표를 실행 가능한 Node·Edge 그래프로 모델링하고, 현재 환경이 제공하는
native agent와 tool로 실행한다. 외부 agent runtime이나 시각 편집기를 자동 설치하지
않는다.

## 빠른 판정

- 한 agent와 짧은 순차 작업으로 충분하면 그래프 artifact를 만들지 않고 그대로 수행한다.
- 독립 작업의 병렬화, 조건 분기, join, 실패 복구, 반복 평가 또는 사람 결정이 필요할
  때만 그래프를 만든다.
- 사용자가 설계만 요청하면 `GRAPH_READY`에서 멈춘다. 구현·실행을 요청했으면 같은
  그래프를 검증한 뒤 실행한다.

## 권한과 경계

- primary agent가 **Graph Controller**다. Worker Node는 결과와 증거만 반환하며 다음
  경로를 선택하지 않는다.
- Controller는 자유 서술을 해석해 경로를 고르지 않는다. Node의 구조화된 output에
  잠긴 Edge 조건을 적용하고 bundled `scripts/graph-verify.mjs next`로 전이를 판정한다.
- `gate` Node의 제품 정책, 파괴적 행동, 외부 부작용 또는 권한 확대는 사용자가
  결정한다. 답이 없으면 `WAITING_USER`에서 멈춘다.
- 명시적 스킬 호출은 원래 요청 범위 안의 agent 위임을 허용하지만 live 배포, 결제,
  삭제, 외부 메시지 발송 같은 추가 부작용을 허용하지 않는다.
- native surface가 `agent_type` 역할 라우팅을 지원하면 설치된 역할 중 가장 구체적인
  역할을 지정하고 생략하지 않는다. 지원되지 않는 역할을 prompt 이름으로 꾸며내지
  않는다.
- 테스트·review Node는 증거를 제공할 뿐 목표나 정책을 새로 정하지 않는다.

## Graph Contract

그래프를 만들기 전 [`references/graph-contract.md`](references/graph-contract.md)를 전부
읽는다. 복잡하거나 재개 가능한 실행은 아래에 기록한다.

```text
.ai/agent-graphs/<graph-id>/
├── graph.json
└── events.jsonl
```

`graph.json`은 Node, Edge, entry, terminal, 구조화된 조건과 전체 `maxSteps`의 권위 있는
계약이다. `events.jsonl`은 append-only이며 기존 event를 고치거나 덮어쓰지 않는다.

Node 종류는 다음 다섯 개뿐이다.

- `agent`: 역할이 있는 native agent 작업
- `tool`: 결정적인 tool 또는 command 실행
- `gate`: 사용자 결정을 기다리는 지점
- `join`: 병렬 경로를 `all` 또는 `any`로 합치는 지점
- `terminal`: 완료 또는 실패 종료점

## 실행

1. actor/context, 관찰 가능한 목표, 입력, 비목표, 최악 실패, 종료 조건을 짧게 고정한다.
2. 필요한 최소 Node와 Edge만 만들고 각 Node의 한 가지 책임을 `task`로 고정한
   `graph.json`을 작성한다.
3. `graph-verify.mjs verify`로 ID, Edge, 도달 가능성, terminal 경로, output 조건과 즉시
   fan-out write 충돌을 검사한다.
4. entry부터 실행한다. incoming 조건을 만족한 Node만 `READY`로 만들고, 해당 Node의
   `task`만 수행한다. 서로 독립이며 write scope가 겹치지 않는 Node만 병렬 실행한다.
5. Worker 결과를 `{ status, summary, artifacts, findings }`처럼 Node 계약에 맞춘 JSON으로
   기록한다. 없는 값을 추측하거나 자유 서술에서 뽑아내지 않는다.
6. `graph-verify.mjs next`가 고른 Edge만 활성화한다. 일치 Edge가 없거나 `dispatch: one`에
   여러 Edge가 일치하면 `GRAPH_INVALID`로 멈춘다.
7. 실패는 Node의 `retryLimit` 안에서만 재시도한 뒤 명시된 failure Edge를 따른다.
   그래프 전체 실행은 `maxSteps`를 넘기지 않는다.
8. graph 수정이 필요하면 실행 중 몰래 바꾸지 않는다. 새 revision을 검증하고 변경
   이유를 event로 남긴 뒤 아직 실행하지 않은 경로에만 적용한다.
9. terminal 도달 후 산출물과 target repo의 실제 test·lint·typecheck 중 적용되는 검증을
   실행하고 결과를 보고한다.

## 상태

```text
Graph: DRAFT | GRAPH_READY | RUNNING | WAITING_USER | COMPLETED | FAILED
Node:  PENDING | READY | RUNNING | SUCCEEDED | FAILED | SKIPPED
```

정상 완료는 성공 terminal 도달과 요청 범위의 실제 검증 통과를 모두 요구한다.

## 최종 보고

```text
상태: COMPLETED | WAITING_USER | FAILED
결과: 목표와 실제 달성 결과, 비목표
그래프: 실행한 Node와 선택된 Edge
병렬: 동시에 실행한 Node와 write scope
반복: Node별 재시도와 사용한 step/maxSteps
검증: 실제 command와 결과
증거: 주요 artifact와 finding
남은 위험: 생략된 경로, 복구 또는 다음 결정
```
