# Frontend Oracle Design 개선 계획

## 목표

`frontend-oracle-design`의 핵심 안전장치(정책 출처 분리, revision lock, ledger 기반 상태 전이, RED→GREEN, 독립 리뷰)는 유지한다. 개선은 다음 세 가지에 집중한다.

1. 현재 workflow와 eval의 계약을 일치시킨다.
2. 그래프의 Standard/High 리뷰 경로 입력 계약을 실행 가능하게 만든다.
3. 실제 모델 실행 결과와 workflow 비용을 측정 가능한 형태로 만든다.

## 범위와 비범위

- 범위: `packages/frontend-oracle-design`, 필요한 경우 `packages/agent-graph-engineering`의 graph verifier 및 테스트.
- 비범위: Oracle의 정책 권위 모델 제거, Low fast path에 Oracle ceremony 추가, 새 런타임 의존성 추가, 기존 `.omx` 상태 파일 수정.

## 선행 검증 기준

현재 기준선:

- `pnpm --filter @lodado/frontend-oracle-design-plugin test`: 295 tests pass.
- `pnpm --filter @lodado/frontend-oracle-design-plugin lint`: errors 0, warnings 4.
- graph static verifier: `GRAPH_VALID frontend-oracle-design`.

변경 후에는 관련 단위 테스트, 패키지 전체 test/lint, graph verifier를 다시 실행한다.

---

## P0 — Black-box eval 계약 동기화

### 문제

현재 Oracle lane의 async 작업은 `SKILL.md`와 reference graph에 따라 다음 노드를 요구한다.

- `card-interaction-sweep`
- `card-case-space`
- `card-retro-metrics`
- `types-advanced-contracts`

그러나 `evals/blackbox-corpus.json`의 async Oracle case 기대값에는 이들 노드가 빠진 경우가 있다. grader는 `loadedNodes`를 양방향 정확 일치로 비교하므로, 최신 workflow를 준수한 실행이 오히려 `LOADED_NODES_MISMATCH`로 실패할 수 있다.

### 변경

1. `evals/blackbox-corpus.json`의 각 Oracle case를 reference graph 및 risk 조건과 대조한다.
2. async/order/retry/type-state case에 필요한 node closure를 명시한다.
3. Low fast path는 `low-fast-path`만 허용하는 현행 엄격성을 유지한다.
4. `eval-corpus.test.mjs`에 fixture의 node closure뿐 아니라 **현재 필수 노드가 기대값에 포함되는지** 검증하는 회귀 테스트를 추가한다.
5. 예외가 필요한 경우에는 node를 삭제하지 말고, corpus fixture에 위험·작업 성격에 근거한 예외를 명시한다.

### 완료 기준

- 최신 필수 노드를 포함한 Oracle 결과가 grader에서 통과한다.
- 필수 노드를 fixture에서 제거하면 테스트가 실패한다.
- Low fixture에 Oracle node를 넣으면 계속 실패한다.

---

## P0 — Standard/High 리뷰 그래프 입력 계약 수정

### 문제

그래프에서 `STANDARD_READY`는 `primary-review → review-finalize`로 직접 이동한다. 하지만 `review-finalize`는 High 전용 join에서 생성되는 `reviewReceiptA`, `reviewReceiptB`를 필수 input으로 선언한다.

현재 graph verifier는 그래프 전체 upstream producer만 확인하므로, High 경로의 producer가 존재하면 Standard 경로의 payload 누락을 발견하지 못한다.

### 변경

1. Standard와 High의 finalization contract를 분리한다. 권장안은 다음 중 하나다.
   - `review-finalize-standard`와 `review-finalize-high` 노드로 분리한다.
   - 또는 branch-specific input schema를 도입해 Standard에는 단일 controller-recorded receipt, High에는 두 receipt를 요구한다.
2. Standard finalization이 단일 review finding을 ledger-bound receipt로 기록하는 책임을 명시한다.
3. High finalization은 두 독립 reviewer receipt와 intersection 규칙을 유지한다.
4. `graph-verify`에 path-aware input 검증을 추가하거나, 적어도 Standard/High route payload fixture를 검증해 동일 결함을 재발 방지한다.
5. graph docs와 JSON task 설명을 변경된 책임 경계와 맞춘다.

### 완료 기준

- Standard route는 High receipt 없이 유효한 finalization payload를 만든다.
- High route는 두 receipt 중 하나라도 없으면 실패한다.
- 과거처럼 다른 branch의 producer만으로 input이 충족되었다고 판정하지 않는다.

---

## P1 — Host hook의 적용 범위와 관측성 강화

### 문제

PreToolUse hook은 사전 방어 계층이며 최종 권위는 `oracle-run` transition gate다. 현재 hook은 특정 write tool만 대상으로 하고 판정 불능 시 fail-open한다. 설계 자체는 합리적이지만, 사용자와 운영자가 “무엇이 사전 차단되고 무엇이 사후 gate에 의존하는지” 알기 어렵다.

### 변경

1. README에 Claude/Codex host별 사전 차단과 사후 검증 범위를 표로 문서화한다.
2. fail-open 원인을 구조화한 diagnostic 또는 warning으로 남긴다. 단, gate의 최종 권위는 유지한다.
3. rename/delete/new test/harness 경계를 포함하는 guard regression test를 추가한다.

### 완료 기준

- hook이 보장하지 않는 경로가 문서에 명시된다.
- 판정 불능은 조용히 사라지지 않고 추적 가능하다.
- 최종 transition gate가 여전히 모든 필수 evidence를 검증한다.

---

## P1 — 실제 모델 eval 도입

### 문제

현재 bundled grader와 fixture 테스트는 평가 도구의 동작을 검증한다. 실제 모델이 workflow를 정확히 따르는지, 비용이 얼마나 드는지는 아직 입증하지 않는다.

### 변경

1. 기존 10-case corpus를 실제 Claude/Codex 실행에 연결한다.
2. 결과 artifact에 모델/버전, prompt hash, tool calls, tokens, runtime, loaded nodes, terminal state, grader report를 저장한다.
3. `held-out.json`의 escaped defect를 별도 holdout으로 유지한다. corpus author가 기대값을 임의로 맞추지 못하게 한다.
4. 비용과 품질을 분리한다: routing accuracy, policy invention, false completion, user turns, wall-clock time을 함께 기록한다.

### 완료 기준

- complete corpus가 실제 실행 artifact와 함께 reproducible하게 grade된다.
- partial run은 계속 non-authoritative다.
- 보고서가 fixture 통과와 모델 성능을 구분한다.

---

## P2 — Ceremony 비용의 데이터 기반 경량화

### 원칙

측정 전에는 Medium workflow가 “과도하다”고 단정하지 않는다. High-risk gate(정책 승인, lock, RED/GREEN evidence, 독립 리뷰)는 보존한다.

### 변경

1. P1 실행 결과로 lane별 tool calls, tokens, runtime, user turns, 발견된 defect class를 수집한다.
2. Medium 작업에서 중복되지만 결함 발견 기여가 낮은 단계만 후보로 삼는다.
3. continuation bundle, node loading, review packet 크기를 먼저 최적화한다.
4. 경량화 전후를 동일 corpus/holdout에서 비교한다.

### 완료 기준

- 품질 지표 악화 없이 Medium ceremony 비용이 줄었음을 데이터로 보인다.
- Low fast path의 단순성 및 High-risk의 엄격성이 유지된다.

---

## 권장 실행 순서

1. P0 eval 계약 동기화와 회귀 테스트.
2. P0 graph Standard/High contract 수정 및 route fixture.
3. 전체 test/lint/graph verifier 실행.
4. P1 hook 관측성 및 문서화.
5. P1 실제 모델 eval harness.
6. P2 비용 데이터 기반 최적화.

## 위험 관리

- 기존 card, lock, ledger, state transition 명세는 호환성을 우선한다.
- graph 변경은 generated docs 및 reference bundle check까지 포함해 검증한다.
- eval corpus 변경은 실제 policy를 완화하는 방식이 아니라 최신 workflow의 요구사항을 정확히 반영하는 방식으로만 수행한다.
- 모든 단계는 작은 diff와 해당 회귀 테스트를 함께 제출한다.
