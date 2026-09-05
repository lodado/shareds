# Frontend Oracle Design

AI가 구현을 시작하기 전에 **무엇이 정답인지 먼저 잠그는** Claude Code / Codex
스킬입니다. 승인된 요구사항을 Oracle Card로 만들고, 테스트·실행 장부·상태 전이·독립
리뷰 같은 결정론적 게이트로 구현을 검증합니다.

## 이런 작업에 적합합니다

- 중복 제출, 비동기 순서, 재시도처럼 경계 동작이 중요한 UI
- 결제, 권한, 파괴적 작업처럼 회귀 비용이 큰 변경
- 현재 코드나 기존 테스트를 제품 정책으로 오인하면 안 되는 작업

단순 문구·토큰·고립된 CSS 수정이나 빠르게 버릴 프로토타입에는 기존 저장소 검증만
사용합니다.

## 동작 방식

1. 사용자 답변과 승인된 명세만 정책 출처로 등록합니다.
2. `Given / When / Then / Never / Source`를 Oracle Card에 기록하고 잠급니다.
3. 명시적으로 Delivery를 요청하면 테스트가 의도한 이유로 실패하는 `VALID_RED`를 먼저
   확인한 뒤 최소 구현으로 통과시킵니다.
4. 실행 결과와 상태 전이를 기계가 기록하고, 정해진 반복 예산 안에서만 수정합니다.
5. 독립 리뷰와 필수 검증을 다시 통과한 `REVIEW_VERIFIED`를 완료로 봅니다.

기본값은 카드 설계에서 멈추는 Design-only입니다. 구현까지 필요하면 Delivery를
명시하세요. 그래프 오케스트레이션도 명시적으로 요청할 때만 로드합니다.

## 증거

이 스킬은 "장부에 없는 실행은 증거가 아니다"를 사용자에게 요구합니다. 같은 기준을
스킬 자신에게 적용한 결과입니다.

**Setup.** 번들된 grader에 여섯 가지 결과 아티팩트를 넣고 실제로 돌립니다. 재현
명령은 아래 그대로입니다.

```bash
npm test                                            # 문서 규범과 실제 파일의 결합 검사
node skills/evals/grade-results.mjs <results.json>  # 10-case 코퍼스 전량 채점
```

**Result.** 2026-08-27 로컬 실행.

| 입력                               | authority                   | 판정                           | exit |
| ---------------------------------- | --------------------------- | ------------------------------ | ---- |
| 10개 케이스 전량·기대와 일치       | `AUTHORITATIVE_FULL_CORPUS` | 10/10 pass, routingAccuracy 1  | 0    |
| 1개 케이스만, 플래그 없음          | 동일                        | 나머지 9개 `MISSING_CASE`      | 1    |
| 1개 케이스만, `--allow-partial`    | `NON_AUTHORITATIVE_PARTIAL` | `authoritative: false`         | 1    |
| 빈 배열                            | 동일                        | `EMPTY_RESULTS`                | 1    |
| 빈 파일                            | 없음                        | `BLANK_JSONL`                  | 2    |
| 10개 중 1개가 REVIEW_VERIFIED 자칭 | `AUTHORITATIVE_FULL_CORPUS` | 9/10, `falseReviewVerified: 1` | 1    |

**So.** 부분 실행은 스스로를 authoritative라고 부를 수 없고, 빈 결과는 통과가 아니라
실패이며, 자칭 REVIEW_VERIFIED는 집계에 그대로 드러납니다.

**증명하지 않은 것.** 위 여섯 줄은 grader 게이트를 검증한 것이지 **실제 모델 실행
결과가 아닙니다.** 라이브 10-case 실행 기록은 아직 이 저장소에 없으므로,
routingAccuracy를 스킬의 성능 수치로 인용하지 마세요.

<!-- WORKFLOW_DOCS:START (generated; do not edit) -->

## 워크플로우 그래프

공개 운영자 화면은 전체 제어 그래프를 여섯 단계로 압축합니다. 현재 canonical graph는 노드
20개, 엣지 36개, fallback 5개, terminal 6개입니다.

```mermaid
flowchart LR
  DEFINE["DEFINE<br/>Oracle Card 초안"] --> LOCK["LOCK<br/>사용자 확인·lock"]
  LOCK --> PROVE["PROVE<br/>VALID_RED"]
  PROVE --> BUILD["BUILD<br/>최소 구현·GREEN"]
  BUILD --> REVIEW["REVIEW<br/>독립 검토"]
  REVIEW --> CERTIFY["CERTIFY<br/>REVIEW_VERIFIED"]

  DEFINE -. "policy decision wait" .-> POLICY["정책 결정 대기"]
  POLICY -. "승인된 정책으로 재정의" .-> DEFINE
  BUILD -. "evidence / harness repair" .-> REPAIR["증거·harness 보정"]
  REPAIR --> BUILD
  BUILD -. "failure" .-> STOP(["failure stop"])
  REVIEW -. "failure" .-> STOP
```

- 정책 판단이 비면 **policy decision wait**로 나가며, 승인된 정책으로만 DEFINE에 돌아갑니다.
- evidence/harness 문제는 정책·production을 바꾸지 않고 보정한 뒤 BUILD로 돌아갑니다.
- 복구 불가능한 실패는 **failure stop**으로 끝납니다.

이 도식은 operator projection입니다. dispatch, 병렬 high-risk review, join, ledger receipt,
visual-pending resume, 그리고 모든 정확한 전이는
[`oracle-workflow.graph.json`](references/oracle-workflow.graph.json)의 canonical controller
view가 소유합니다.

<!-- WORKFLOW_DOCS:END (generated; do not edit) -->

<!-- REFERENCE_DOCS:START (generated; do not edit) -->

## Reference 로딩 그래프

계약 문서는 한 번에 다 읽지 않습니다.
[`reference-graph.json`](references/reference-graph.json)이 진입 risk로 lane을 고르고,
`when` 조건이 충족된 노드의 전문과 그 `requires` 엣지만 로드합니다. 아래 도식은 그
파일에서 생성되므로 노드나 `requires`가 바뀌면 함께 갱신됩니다.

```mermaid
flowchart LR
  START(["요청"]) --> RISK{"risk 판정"}
  RISK -->|"risk=Low"| low_fast_path["low-fast-path<br/><i>exclusive · 이 노드만</i>"]
  low_fast_path -.->|"immediately disqualified when a policy question·new contract·architecture decision appears — promote to the oracle lane"| common
  RISK -->|"그 외"| common["common"]

  card_policy_sources["card-policy-sources"]
  card_risk_grill["card-risk-grill"]
  card_format["card-format"]
  card_interaction_sweep["card-interaction-sweep"]
  card_case_space["card-case-space"]
  card_retro_metrics["card-retro-metrics"]
  card_confirmation_lock["card-confirmation-lock"]
  visual_design["visual-design"]
  delivery_ledger["delivery-ledger"]
  delivery_red["delivery-red"]
  delivery_implementation_decision["delivery-implementation-decision"]
  delivery_green_review["delivery-green-review"]
  frontend_decisions["frontend-decisions"]
  frontend_authoring["frontend-authoring"]
  frontend_quality["frontend-quality"]
  architecture_contract["architecture-contract"]
  types_state_ladder["types-state-ladder"]
  types_authoring["types-authoring"]
  types_api_surface["types-api-surface"]
  types_advanced_contracts["types-advanced-contracts"]
  types_review_criteria["types-review-criteria"]
  subagent_review["subagent-review"]
  review_checklist["review-checklist"]
  graph_orchestration["graph-orchestration"]
  oracle_workflow_graph["oracle-workflow-graph"]

  common --> card_policy_sources
  common --> card_risk_grill
  card_policy_sources --> card_risk_grill
  common --> card_format
  bva --> card_format
  common --> card_interaction_sweep
  card_format --> card_interaction_sweep
  common --> card_case_space
  bva --> card_case_space
  card_format --> card_case_space
  common --> card_retro_metrics
  card_case_space --> card_retro_metrics
  common --> card_confirmation_lock
  common --> visual_design
  common --> delivery_ledger
  delivery_ledger --> delivery_red
  bva --> delivery_red
  changeability --> delivery_implementation_decision
  frontend_authoring --> delivery_implementation_decision
  delivery_ledger --> delivery_green_review
  frontend_quality --> delivery_green_review
  common --> changeability
  common --> frontend_decisions
  frontend_decisions --> frontend_authoring
  common --> architecture_contract
  common --> types_state_ladder
  frontend_decisions --> types_state_ladder
  types_state_ladder --> types_authoring
  types_state_ladder --> types_api_surface
  types_authoring --> types_api_surface
  types_api_surface --> types_advanced_contracts
  subagent_review --> types_review_criteria
  common --> subagent_review
  changeability --> subagent_review
  subagent_review --> review_checklist
  oracle_workflow_graph --> graph_orchestration
  IND["type-environment · fsd · backend · performance<br/><i>독립 노드 — 조건 충족 시에만</i>"]
```

화살표는 실행 순서가 아니라 **선행 조건**입니다. `card-format`을 읽으려면 `common`과
`bva`를 이미 읽었어야 한다는 뜻입니다.

<!-- REFERENCE_DOCS:END (generated; do not edit) -->

`types-advanced-contracts`는
`always with state-ladder during type work — loading unconditional, adoption via compiler witness packet gate`
조건으로 로드하고 `types-api-surface`를 선행 조건으로 둡니다. 읽기는 타입 작업마다
무조건이지만, 고급 타입의 **채택**은 문서 안의 선택 gate와 compiler witness packet을
통과할 때만 합니다.

0.24.0에서 추가한 compiler witness, 외부 저장소 provenance, TypeScript와 runtime 검증의
경계는 [`TYPESCRIPT-VERIFICATION.md`](../TYPESCRIPT-VERIFICATION.md)에 정리했습니다.

첫 툴 콜은 lane 진입 노드 **하나**의 Read로 고정되고, 응답은
`risk=<Low|Medium|High> lane=<low-fast-path|oracle> nodes=[실제로 읽은 노드]` 헤더로
시작합니다. 구현 요청이든 설명·플랜 전용 요청이든 동일합니다 — 로딩을 건너뛴 사실이
헤더에 드러나게 만드는 장치입니다.

## 운영 도구

### 현재 상태와 재개

```bash
node skills/scripts/oracle-run.mjs status \
  --dir .ai/oracles/<oracle-id> \
  --json
```

`status`는 lock, worktree/production snapshot, stale run, orphaned `.run-ids`, 남은 budget,
다음 합법 전이를 기존 artifact에서 재계산합니다. resume은 이 출력으로 다음 action을
고르는 절차이며, `run-state.json`이나 `runs.jsonl`을 직접 편집하지 않습니다.

### Black-box eval corpus

`evals/blackbox-corpus.json`은 hosted eval 제품에 의존하지 않는 10개 smoke prompt입니다.
결과 JSON/JSONL을 만든 뒤 grader로 routing, policy invention, false review, tool calls,
tokens, runtime, error count를 확인합니다. 기본 모드는 10개 case를 모두 요구하며, 단일
case 탐색 실행에만 `--allow-partial`을 사용합니다. partial도 빈 결과는 통과하지 않습니다.

```bash
node skills/evals/grade-results.mjs <results.json|results.jsonl>
node skills/evals/grade-results.mjs --allow-partial <results.json|results.jsonl>
```

`evals/run-live.mjs`가 그 결과 artifact를 실제 CLI 실행으로 만듭니다. fixture 통과와 모델 성능을
섞지 않기 위해 권위를 나눕니다 — `loadedNodes`·`toolCalls`·`tokens`·`runtimeMs`는 host transcript에서
기계로 유도하고, routing 판정(`risk`·`lane`·`status`·`labels`·`ceremony`)만 실행이 마지막 ```json
블록으로 자기보고합니다. `loadedNodes`는 read 도구 호출이 오류 없는 tool result로 돌아온 노드만
세고, 경로가 문자열로만 등장한 노드는 `mentionedNodes`에 따로 둡니다. 각 결과의 `attestation`은
필드별로 `observed`·`self-reported`·`unreported`를 기록하며, 자기보고에서 빠진
`policyInvention`·`falseReviewVerified`는 조용한 `false`가 아니라 `FLAG_UNREPORTED:<flag>`오류가
됩니다. 블록이 없으면`NO_MACHINE_REPORT`오류로 실패합니다. sidecar`<out>.meta.json`에 model,
prompt SHA-256, session id, exit code, 원본 자기보고가 남습니다.

`--replicates <k>`는 같은 fixture를 k번 독립 실행해 `replicateId`(r1..rk)를 붙입니다. `--variant
<name>`은 A/B 팔(예: baseline·compressed)을 표시합니다. grader의 채점 단위는 `(caseId, variant)`이며
팔끼리는 절대 합산하지 않습니다(`metrics.variants`). 한 팔 안에서 replicate를 각각 채점해 모두
통과해야 통과(pass^k, `metrics.passAllK`)로 보고, 하나라도 통과한 비율은 `metrics.passAtK`로 따로
냅니다. 서로 다른 k는 `metrics.replicateCounts`로 드러나고, replicateId 없이 반복된 case는 여전히
`DUPLICATE_CASE`입니다. 같은 `--repo` 작업 폴더를 반복 사용하므로 실행 간 오염 격리는 호출자
책임입니다.

```bash
node skills/evals/run-live.mjs --host claude --out results.jsonl --repo <대상 레포>
node skills/evals/run-live.mjs --host claude --out results-k3.jsonl --repo <대상 레포> --replicates 3
node skills/evals/run-live.mjs --host codex --out held-out.jsonl --corpus held-out.json
```

held-out은 grader가 점수 매기지 않습니다. `escapes[].assertion`을 Draft와 대조해 판정하며, corpus
기대값을 고치는 사람이 홀드아웃 정답을 만질 수 없도록 분리된 채로 둡니다.

### 기계 유도 — 코드와 형제 카드에서 빈칸을 만든다

카드 안의 열거(스윕·deviation·frame)는 카드 바이트에서 기계가 만든다. 0.41.0부터 그 원칙이 카드 밖으로
넓어진다 — 판정은 여전히 사람과 LLM의 disposition이고, 기계는 빈칸의 범위만 넓힌다.

- `scripts/oracle-dimensions.mjs --path <file>...` — 고정 패턴 표로 코드에서 Case space 차원 후보
  (`code(path#L)` 인용 포함)와 side-effect 인벤토리를 뽑는다. 카드에 자동 기입하지 않는다.
- `scripts/oracle-verify.mjs card --repo-policies` — 같은 레포의 잠긴 형제 카드 중 surface 토큰을
  공유하는 정책을 스윕 counterpart 후보(`P3 × <oracle-id>.P7`)로 낸다. 정보이지 게이트가 아니다.
- `scripts/oracle-verify.mjs scan --side-effects --oracle <card> --path <changed files>` — diff의
  알려진 side-effect 토큰마다 카드의 어떤 행이 그 범주를 소유하는지 대조한다. 미소유는
  `SIDE_EFFECT_UNOWNED`, 면제는 `oracle:side-effect <row|reason>` 주석.
- `scripts/oracle-run.mjs status --dir <dir> --changed-files` — init 기준선 이후 바뀐 경로만 한 줄씩.
  레포의 related-tests 명령에 그대로 넘겨 필수 라벨 `impact`를 만든다.
- `scripts/oracle-verify.mjs card --ir` — 카드 바이트에서 파생한 Judgment Space IR(JSON) 덤프.
  `impossible`은 witness가 필수이고(`code()`·`constraint()`는 실재 검사), `needs-evidence`는 조회처가
  필수다. 역-2-sample 리뷰와 지표 집계가 이 IR을 읽는다.
- `scripts/oracle-verify.mjs review --blind-map <file>` — evidence.json을 보지 않은 리뷰어의 테스트→행
  매핑과 대조한다. 불일치는 `EVIDENCE_MAPPING_DISPUTED`.
- `hooks/hooks.json` — Claude Code PreToolUse hook. 플러그인 루트의 이 파일을 Claude Code가 자동으로
  읽으므로 `plugin.json`에 등록하지 않는다. `ORACLE_READY`에서 production 쓰기, `VALID_RED` 이후
  **기존** 테스트에 약화 토큰 추가를 쓰기 전에 거절한다(스냅샷에 없는 새 테스트 파일은 순서 게이트가
  본다). 판정 불가는 허용(fail-open)이고 사후 게이트가 계속 권위다. Codex·jcode에는 hook이 없다.
- `evals/to-skill-creator-evals.mjs` — 블랙박스 코퍼스와 `evals/held-out.json`을 skill-creator
  `evals/evals.json`으로 투영한다. `--check`가 드리프트를 잡는다. held-out은 저자가 아니라 다른 레포에서
  실제로 새어나간 결함이 정답을 준 케이스다(r11b: StrictMode 타이머·리마운트 scrollTo·ResizeObserver
  초기 측정·필터 전환 중 Suspense 폴백). "나아졌나"는 이 케이스의 버전 간 A/B로만 답한다.

### Hook이 사전 차단하는 것과 게이트만 보는 것

hook은 가속기이고 `oracle-run.mjs transition`이 최종 권위입니다. 아래 표의 "게이트"는 쓰기가 이미
일어난 뒤 `status --changed-files`와 transition 검증이 잡는다는 뜻입니다.

| 경로                                      | Claude Code      | Codex·jcode | 판정                                            |
| ----------------------------------------- | ---------------- | ----------- | ----------------------------------------------- |
| `Write`·`Edit`·`MultiEdit`·`NotebookEdit` | hook이 사전 거절 | 게이트      | `PRODUCTION_TOUCHED_BEFORE_RED`·`TEST_WEAKENED` |
| Bash `rm`·`mv`·`sed -i`·heredoc 쓰기      | 게이트           | 게이트      | hook은 도구 이름과 경로로만 보므로 판정 불가    |
| MCP·에디터 확장 쓰기                      | 게이트           | 게이트      | 같은 이유                                       |
| `.ai/oracles/**` 자체                     | 통과             | 통과        | 오라클 아티팩트는 production이 아님             |

판정 불가는 fail-open이지만 조용히 사라지지 않습니다. hook은 stderr에 한 줄 JSON을 남깁니다 —
`{"oracleGuard":"unjudged","reason":"STATE_UNPARSEABLE"|"SCAN_ROOT_MISSING"|"PAYLOAD_UNREADABLE",...}`.
stdout과 종료 코드는 그대로이므로 쓰기는 계속 진행되고, 흔적만 남습니다.

### Harness garbage collection

새 상태·agent·dependency를 추가하기 전에 stale reference, never-fired sensor, duplicate
guidance, 충돌 규칙을 삭제·통합합니다. High risk에만 `.ai/oracles/**`, lock SHA, run IDs를
CI artifact와 CODEOWNERS/required review로 보호합니다. Low/Medium에는 기본 강제하지
않습니다.

## 이웃 스킬과의 결합

Oracle은 테스트·스크린샷·구현 옵션을 직접 소유하지 않고 이웃 스킬에 위임합니다. 위임
강도는 셋으로 나뉘며 **의도적으로 다릅니다** — 아래 표가 그 지도입니다. 한쪽을 고치면
반대쪽도 함께 확인하세요.

| 이웃 스킬                  | 결합 강도              | 규칙                                                                           |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `$test`                    | hard — 없으면 `FAIL`   | 테스트 파일 작성 직전 이름으로 호출. 호출 불가면 Oracle이 판정을 포기합니다.   |
| `$frontend-visual-qa`      | explicit-only          | 사용자가 명시 요청할 때만. Oracle은 별도 브라우저 완료 상태를 만들지 않습니다. |
| `$agent-graph-engineering` | explicit-only          | 그래프 오케스트레이션을 명시 요청할 때만 로드합니다.                           |
| `$frontend-system-design`  | graceful — 없으면 진행 | 설치되어 있으면 reference만 읽고, intake와 통제는 Oracle이 유지합니다.         |

`$test`만 hard인 이유는 테스트 판정 소유권이 의도된 신뢰 경계이기 때문입니다. Oracle이
자기 테스트를 스스로 쓰고 스스로 통과 판정하면 증거가 순환합니다.

`references/bva.md`는 `packages/test`와 **바이트 단위로 동일한 사본**입니다. 두 스킬이
같은 경계값 축을 쓰지 않으면 계약과 테스트가 조용히 갈라지므로 사본을 없애지 말고
동기화 상태로 두며, `skill-contract.test.mjs`가 동일성을 검사합니다.

## 설치

Claude Code:

```text
/plugin marketplace add lodado/shareds
/plugin install frontend-oracle-design@my-vibe-coding-helper
```

Codex:

```bash
codex plugin marketplace add lodado/shareds
codex plugin add frontend-oracle-design@my-vibe-coding-helper
```

## 사용 예

```text
이 결제 폼의 중복 제출과 실패 복구를 Oracle Card로 설계해줘.
```

```text
승인한 카드로 테스트를 먼저 작성하고 REVIEW_VERIFIED까지 Delivery해줘.
```

전체 계약과 조건부 reference는 [`SKILL.md`](SKILL.md)를 확인하세요.

## 참고 자료

- [구현보다 정답 기준을 먼저 잠가요 — AI에게 프론트엔드를 맡길 때의 설계](https://bblog-theta.vercel.app/ko/blog/lock-the-oracle-first)
- [비결정론적인 AI 코드, 결정론적인 검문소로 걸러내요 — 워크플로우 단계별 해부](https://bblog-theta.vercel.app/ko/blog/deterministic-gates-for-ai-code)
