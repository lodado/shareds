# Frontend Oracle 피드백 개선 플랜

## Requirements Summary

- 실제 세션에서 확인된 false GREEN, lock 순서 충돌, visual evidence 데드락을 먼저 제거한다.
- SHA-256 lock, append-only ledger, reporter-backed RED/GREEN, 독립 review라는 기존 강점은 유지한다.
- 새 gate는 우회면을 넓히지 않아야 하며 기존 locked artifact를 깨지 않는다.
- 비용 절감은 검증 삭제가 아니라 더 이른 RED와 기계 생성 review input으로 달성한다.

## 현행 판정

| 항목                 | 판정                                | 현재 근거                                                                                                                                                                                                             | 처리                |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| A 정책↔행 연결       | 타당, 미구현                        | card lint는 정책의 `(출처:)`와 행 필수 cell만 검사하고 연결은 보지 않는다 (`oracle-verify.mjs:192-246`).                                                                                                              | P0                  |
| B visual tier 데드락 | 타당, 부분 완화이나 불안전          | 문서는 explicit visual QA만 허용하지만 (`visual-design.md:140-160`), evidence shape는 tier별 owner를 강제하지 않는다 (`oracle-verify.mjs:256-265`).                                                                   | P0                  |
| C harness allowlist  | 타당, 미구현                        | test 판정은 고정 경로·확장자뿐이고 (`oracle-run.mjs:44,112-120`), 그 밖의 변경은 production으로 거부된다 (`oracle-run.mjs:477-485`).                                                                                  | P1                  |
| D source lock 순서   | 타당, 문서상 모순                   | Design-only가 먼저 lock한다 (`SKILL.md:132-140`). 이후 Delivery가 architecture source를 결정한다 (`SKILL.md:142-148`). 반면 loop 문서는 모든 결정을 마친 뒤 한 번 lock하라고 한다 (`implementation-loop.md:38-40`).   | P0                  |
| E milestone          | 문제는 타당, 제안 전체는 큼         | 상태 기계는 전역 `VALID_RED` 하나이고 (`oracle-run.mjs:35-40`), 전이는 한 run·한 row만 받는다 (`oracle-run.mjs:608-638`).                                                                                             | P1 MVP              |
| F review packet      | 타당, 미구현                        | reviewer input 15종은 문서에만 있고 (`subagent-review.md:55-75`), 실행 명령은 init/exec/transition/budget뿐이다 (`oracle-run.mjs:780-788`).                                                                           | P1                  |
| G evidence strength  | 타당, blocking에는 부적합           | 현재는 test name/status만 대조한다 (`oracle-verify.mjs:349-373`). reporter 정규화 결과에도 source path가 없다 (`oracle-run.mjs:293-344`).                                                                             | P2 warning          |
| H row 비례 budget    | 문제는 타당, `ceil(rows/20)`은 기각 | budget은 고정 2/2/3이다 (`oracle-run.mjs:31-33,394-403`). 행 쪼개기를 보상하는 공식은 새 gaming surface다.                                                                                                            | telemetry 후 재결정 |
| I FSD 문서           | 타당, 부분 미해결                   | workspace package와 Steiger를 함께 안내하지만 설치 가능성·별도 plugin·`_pages` 예외가 없다 (`fsd.md:27-30,117-126`). 2026-08-17 npm 조회에서 `@lodado/eslint-config`는 404, Steiger와 plugin은 각각 별도 package였다. | P1 hotfix           |
| J ledger schema      | 현재 worktree에서 완료              | budget에 `type: budget`이 있고 run 판정에서 분리한다 (`oracle-run.mjs:238-240,443-446,768-775`). 회귀 테스트도 있다 (`oracle-run.test.mjs:477-498`).                                                                  | 유지                |
| K reviewer 충돌      | 타당, 미구현                        | 현재 2-sample은 normalized finding의 교집합만 계산한다 (`oracle-verify.mjs:414-476`). 상반된 주장의 판정 절차는 없다.                                                                                                 | P2                  |

## Architecture Decisions

1. **`add-source`로 기존 lock을 수정하지 않는다.** Delivery intent가 있으면 source 승인 후 한 번 lock한다. 나중에 Delivery로 승격돼 source가 추가되면 새 revision directory와 새 lock을 만든다.
2. **새 visual 상태를 만들지 않는다.** 기존 `IMPLEMENTED_GREEN`을 honest partial stop으로 쓰고, tier-correct evidence가 모두 있어야만 `REVIEW_VERIFIED`를 허용한다.
3. **임의 harness glob 대신 exact path부터 지원한다.** `src/**` 같은 broad allowlist가 TDD gate를 무력화하는 것을 막는다.
4. **완전한 per-milestone state machine은 바로 만들지 않는다.** 우선 milestone별 early RED를 강제하고 GREEN/review는 전역으로 유지한다.
5. **evidence strength는 경고로 시작한다.** regex/AST 휴리스틱은 의미 증명이 아니므로 false positive율을 본 뒤 blocking 승격을 결정한다.

## Implementation Steps

### 0. 현재 baseline을 먼저 고정한다

- 현재 product/docs 변경만 명시적으로 stage하고 `.omx/logs`, `.omx/state`, `.playwright-mcp` 같은 runtime artifact는 제외한다.
- `@lodado/frontend-oracle-design-plugin` test와 skill validator가 통과한 commit을 이후 schema 변경의 기준점으로 삼는다.
- 기존 Oracle Card/evidence/run-state는 계속 읽을 수 있어야 한다. 새 format에는 명시적 schema version을 추가하고 v1 locked artifact는 migration 없이 유지한다.

### 1. A — 정책↔행 양방향 coverage gate

**Files**

- `skills/references/oracle-card.md`
- `skills/scripts/oracle-verify.mjs`
- `skills/scripts/oracle-verify.test.mjs`
- `skills/scripts/skill-contract.test.mjs`

**Format**

```markdown
- P1: 결정 후 목록으로 replace 이동한다. (출처: S8 Q4) (행: O43, O45)

| ID | 정책 | Given | When | Then | Never | 부작용 |
| O43 | P1 | ... | ... | ... | ... | ... |
```

**Gate**

- 정책 ID는 unique `P\d+`여야 한다.
- 모든 정책은 source와 하나 이상의 row를 가져야 한다.
- 정책의 `(행:)`은 존재하는 O/D row만 인용해야 한다.
- 모든 O/D row는 존재하는 정책 ID를 하나 이상 인용해야 한다.
- policy→rows와 row→policies 집합이 정확히 대칭이어야 한다.
- 실패는 기존 `CARD_LINT_FAILED` 아래 `policy-id`, `policy-row-unknown`, `policy-row-unlinked`, `row-policy-unknown`, `policy-row-asymmetric` issue로 한 번에 보고한다.

이 gate는 **번역 coverage**를 증명하며 자연어 의미의 모순 자체를 증명한다고 주장하지 않는다. 의미 반대는 adversarial review가 계속 담당한다.

**Acceptance**

- row 없는 정책, 없는 row 인용, 없는 정책 인용, 한쪽만 연결된 mapping이 각각 RED다.
- 순서가 다른 동일 집합은 GREEN이다.
- 기존 schema v1 locked card의 verify/evidence는 그대로 동작한다.

### 2. D — lock 순서를 단일화한다

**Files**

- `skills/SKILL.md`
- `skills/references/oracle-card.md`
- `skills/references/architecture-contract.md`
- `skills/references/implementation-loop.md`
- `skills/scripts/skill-contract.test.mjs`

**Flow**

- Design-only로 끝날 요청: card 승인 → card lint → standalone lock → `ORACLE_READY`에서 종료.
- 처음부터 Delivery인 요청: card draft/승인 → architecture/backend source 승인 → card self-review/lint → 모든 source와 final lock **1회** → init.
- locked Design-only가 나중에 Delivery로 승격되고 새 source가 필요함: 기존 lock을 수정하지 않고 `-r2` revision을 만들어 card/source를 다시 확인하고 새 lock을 만든다.
- `oracle-lock.mjs add-source`는 만들지 않는다. source 집합은 revision identity의 일부다.

**Acceptance**

- 문서 어느 경로에서도 “lock 후 같은 revision에 architecture source 추가”를 지시하지 않는다.
- Delivery contract test가 architecture approval text보다 final lock text가 뒤에 있음을 검사한다.
- changed source로 기존 lock create를 호출하면 현재처럼 `SOURCE_CHANGED`를 유지한다.

### 3. B — visual evidence owner와 partial stop을 명시한다

**Files**

- `skills/references/visual-design.md`
- `skills/references/oracle-card.md`
- `skills/references/subagent-review.md`
- `skills/scripts/oracle-verify.mjs`
- `skills/scripts/oracle-run.mjs`
- 대응 test files

**Contract**

- D row는 `tier` 외에 owner를 기록한다: `HARD→test`, `RELATIONAL→frontend-visual-qa`, `JUDGMENT→designer`.
- RELATIONAL row가 있으면 Draft 승인 질문에 `Visual QA authorization`을 포함한다. `approved`와 사용자 응답 위치가 있어야 외부 skill 호출을 explicit request로 본다.
- evidence schema v2에 `visual`과 `pending`을 추가한다.
  - `visual`: `artifact`, `oracleSha256`, `row`, `result` 필수.
  - `pending`: `reason`, `owner` 필수. RELATIONAL에만 허용한다.
- `pending`은 `IMPLEMENTED_GREEN`까지 허용하되 최종 보고에 `VISUAL_EVIDENCE_PENDING`을 출력한다.
- `REVIEW_VERIFIED`는 `pending`을 거부한다. 사용자가 QA를 승인하지 않았다면 이것이 정상적인 scoped stop이며 `FAIL`로 위장하지 않는다.
- JUDGMENT는 독립 designer evidence로 완료할 수 있고 browser artifact를 강제하지 않는다.

**Acceptance**

- RELATIONAL을 일반 reviewer evidence로 채우면 실패한다.
- 다른 Oracle SHA의 visual artifact는 실패한다.
- visual authorization 없이 외부 skill을 자동 호출하지 않는다.
- pending RELATIONAL은 IMPLEMENTED_GREEN에는 도달하지만 REVIEW_VERIFIED에는 도달하지 못한다.
- 승인된 artifact와 clear findings가 있으면 기존 REVIEW_VERIFIED flow가 통과한다.

### 4. I — FSD 설치 문서 hotfix

**Files**

- `skills/references/fsd.md`
- `skills/scripts/skill-contract.test.mjs`

**Changes**

- `@lodado/eslint-config`는 **대상 workspace에 이미 존재할 때만** 쓰며 npm 설치를 제안하지 않는다고 명시한다. publish 전까지 외부 1순위 후보에서 제외한다.
- Steiger를 택하면 `steiger`와 `@feature-sliced/steiger-plugin`이 별도 devDependency임을 실제 지원 버전 기준으로 함께 적는다.
- Next 충돌로 `_app`/`_pages`를 쓰는 예시는 Steiger의 `typo-in-layer-name` 처리 방법을 같은 snippet에 둔다.
- 임시 fixture에서 문서 그대로 install/config/run해 `ERR_MODULE_NOT_FOUND`와 `_pages` false positive가 없음을 확인한다.

### 5. C — exact harness allowlist

**Files**

- `skills/scripts/oracle-run.mjs`
- `skills/scripts/oracle-run.test.mjs`
- `skills/references/implementation-loop.md`
- `skills/references/oracle-card.md`

**CLI**

```bash
oracle-run.mjs init ... \
  --harness-path vitest.config.ts \
  --harness-path src/test/setup.ts
```

- path는 scan root 안의 기존 exact file이어야 하며 canonical relative path로 state에 저장한다.
- `*`, `**`, directory, scan root 밖 path는 거부한다.
- listed harness 변경은 VALID_RED 전 production change로 세지 않는다.
- VALID_RED 뒤 harness가 바뀌면 harness budget 기록과 그 변경 이후의 새 reporter-backed RED가 없을 때 GREEN을 거부한다.

**Acceptance**

- listed config/setup/render helper는 RED 전에 수정 가능하다.
- unlisted sibling과 `src/**` 우회는 `PRODUCTION_TOUCHED_BEFORE_RED` 또는 usage error다.
- harness 수정 뒤 낡은 RED를 인용하면 실패하고, budget+새 RED 뒤에는 통과한다.

### 6. E — milestone MVP: early RED만 먼저 강제한다

**Files**

- `skills/scripts/oracle-run.mjs`
- `skills/scripts/oracle-run.test.mjs`
- `skills/references/oracle-card.md`
- `skills/references/implementation-loop.md`

**Scope**

- repeatable `--milestone list:O1,O2,...`를 init에서 받아 unique row membership을 state에 저장한다.
- 각 milestone은 production 수정 전에 `red:<name>` label의 reported failing run을 하나 이상 가져야 한다.
- 해당 run에는 milestone의 test-mapped row가 실제 failed로 존재해야 한다.
- 모든 milestone RED가 확인된 뒤에만 전역 `VALID_RED`로 간다. GREEN, flakiness, review는 현재처럼 전역 1회다.

이 MVP는 72개를 모두 쓴 뒤 처음 실행하는 blind period를 줄이지만 per-milestone production snapshot/state machine은 만들지 않는다. 실제 사용 자료에서 전역 GREEN이 다시 병목임이 확인될 때만 v2 RED→GREEN milestone을 설계한다.

**Acceptance**

- milestone 하나라도 RED run이 없으면 전이가 거부된다.
- unknown/duplicate row membership은 init에서 거부된다.
- 첫 milestone run을 일찍 실행해 setup/reporting failure를 production 작성 전에 관찰할 수 있다.

### 7. F — review packet 기계 생성

**Files**

- `skills/scripts/oracle-run.mjs`
- `skills/scripts/oracle-run.test.mjs`
- `skills/references/subagent-review.md`

**Command**

```bash
oracle-run.mjs review-packet --dir .ai/oracles/<id> --output review-input.md
```

- lock manifest와 verify 결과
- run-state와 필요한 ledger slice
- evidence manifest
- architecture source exact bytes
- changed file list와 `git diff --no-ext-diff`
- test/typecheck/build run output references
- 미검증/pending 항목

고정 순서의 원시 자료만 출력하고 결론·severity·추천 수정은 생성하지 않는다. packet SHA-256과 input hashes를 함께 기록한다.

**Acceptance**

- 같은 입력은 같은 packet bytes를 만든다(시각 제외).
- stale lock, 없는 runId, scan root 밖 source면 생성에 실패한다.
- packet에 구현자의 자유 요약 section이 없다.

### 8. G — evidence strength advisory

- reporter normalization에 test source path를 보존한다.
- 부작용 cell이 `GET×1`, `POST×0` 같은 exact count를 선언할 때 mapped test body에서 framework별 exact-count assertion token을 찾는다.
- 없으면 `EVIDENCE_WEAK` warning을 출력하되 전이를 막지 않는다.
- source를 찾지 못한 경우는 “검사 불가”로 보고하며 강한 evidence라고 간주하지 않는다.
- 2개 실제 프로젝트에서 false positive율을 기록한 뒤 blocking 승격 여부를 결정한다.

### 9. K — reviewer 충돌 판정 protocol

- finding schema v2에 `claimType: policy|mechanism|judgment`, `source`, `reproduction`을 추가한다.
- policy 충돌은 승인 source hierarchy로 판정한다.
- mechanism 충돌은 최소 reproduction, computed style, browser/test evidence로 판정한다.
- judgment 충돌은 승인 Design Intent를 기준으로 하고 둘 다 근거가 있으면 `NEEDS_DECISION`으로 보낸다.
- “명세를 인용한 reviewer가 무조건 승리” 규칙은 넣지 않는다. 잘못된 메커니즘 설명이 명세 인용으로 사실이 되지는 않는다.
- 1차는 문서 protocol과 resolution artifact schema만 추가하고 자연어 상반성 자동 탐지는 하지 않는다.

### 10. H — budget은 telemetry 뒤 결정한다

- 현재 default 2/2/3을 유지한다.
- milestone 수, finding 수, 실제 spend/exhaustion을 packet에 노출한다.
- 반복적으로 부족하다는 자료가 쌓이면 `init --budget product=N --budget-reason ...`의 승인된 bounded override(예: 1–6)를 검토한다.
- row count 공식은 도입하지 않는다.

## Global Acceptance Criteria

1. `pnpm --filter @lodado/frontend-oracle-design-plugin test`가 통과한다.
2. skill quick validator가 통과한다.
3. root lint/test가 기존 baseline보다 악화되지 않는다.
4. 기존 v1 lock/evidence와 현재 schema v2 run-state fixture가 계속 읽힌다.
5. 새 schema의 negative case마다 정확한 error code 또는 issue key가 있다.
6. 기존 lock bytes를 수정하는 명령은 생기지 않는다.
7. `REVIEW_VERIFIED`는 tier-correct evidence와 clear findings 없이는 발급되지 않는다.

## Risks and Mitigations

- **Schema churn:** card/evidence/run-state version을 독립적으로 올리고 legacy reader test를 둔다.
- **Gate gaming:** arbitrary glob, row-count budget, self-declared strong evidence를 blocking 근거로 쓰지 않는다.
- **상태 기계 폭증:** milestone v1은 early RED만 소유하고 aggregate GREEN은 유지한다.
- **visual 비용:** card 승인에서 실행 권한을 미리 묻고, 미승인 시 IMPLEMENTED_GREEN partial stop을 정직하게 보고한다.
- **휴리스틱 false positive:** G는 warning으로 출시하고 측정 전에는 gate로 승격하지 않는다.

## Delivery Order and Stop Rules

1. baseline checkpoint
2. A → D → B를 각각 독립 commit으로 완료
3. I hotfix
4. C → E → F
5. 실제 사용 1회 후 G/K/H 재평가

각 단계는 자기 test와 package 전체 test가 GREEN일 때만 다음으로 간다. P0 중 schema backward compatibility가 깨지면 P1으로 진행하지 않고 legacy fixture부터 복구한다. full milestone state, automatic reviewer-conflict NLP, row-proportional budget은 이 계획의 stop boundary 밖이다.
