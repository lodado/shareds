# Delivery — 최소 구현·GREEN 게이트·review 전이

## 최소 구현·셀프피드백

최대 3라운드. 한 라운드:

1. 실패한 카드 행 하나 또는 같은 root cause의 행 묶음 선택.
2. 관련 호출 경로를 끝까지 추적해 모든 호출자가 공유하는 원인 파악.
3. 해당 계약만 만족하는 최소 production 변경 작성.
4. 실패했던 targeted test 재실행.
5. 영향 범위 테스트 실행.
6. 결과를 분류하고 다음 행동 결정.

분류·라우팅의 canonical 정의는 [`common.md`](../common.md)의 피드백 라우팅이다.
이 단계의 특칙:

- `POLICY_GAP` → 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`
- `EVIDENCE_GAP` → 잠긴 카드 범위 안에서 누락 테스트·증거만 추가
- `HARNESS_DEFECT` → sibling `test` skill 허용 항목과 공용 2회 예산 안에서만 보정
- `PRODUCT_DEFECT` → 같은 카드 행을 유지하고 최소 수정 후 재실행
- `ENVIRONMENT_DEFECT` → production을 건드리지 않고 `FAIL`
- `NON_ORACLE_OPINION` → 기록하되 정책·assertion·완료 상태를 바꾸지 않음

revision mismatch는 피드백 분류 대상이 아니다. 기존 증거를 즉시 폐기하고
[`card/confirmation-lock.md`](../card/confirmation-lock.md)의 lock 규칙대로
`NEEDS_DECISION` 또는 `FAIL`로 이동.

매 라운드 기록:

| 라운드 | 카드 행 | 실패 가설 | 최소 변경 | 실제 실행 결과 | 다음 판단 |
| ------ | ------- | --------- | --------- | -------------- | --------- |

## GREEN 게이트

카드 테스트 통과 후 init에서 `--required-label`로 고정한 레포 검증을 각 label의
`exec`로 실제 실행한다.

1. targeted test
2. 영향 범위 test
3. typecheck와 lint
4. Oracle source lock verify 및 레포에 존재하는 구조 검증 명령
5. 루트 또는 패키지 필수 test/build

성능 요구·개선 claim이 있으면 동일 조건 baseline/after를 검사하는 기존 repo 명령을
`performance` 필수 label로 추가. exported shared/package API가 바뀌면 레포가 이미
제공하는 type test, runtime test, pack/export·changeset 검증만 필수 label로 추가.
해당 없는 작업에 이 명령이나 새 dependency를 만들지 않는다.

레포 규칙에 정의된 명령이 우선이다. 실행하지 않은 검증을 통과로 보고하지 않는다.
문서화된 명령이 없으면 package scripts를 읽어 targeted + 가장 가까운 package 검증을
실행한다. 필수 root 명령이 없거나 무관한 기존 실패가 있으면 원문과 영향을 분리해
보고하고 GREEN으로 숨기지 않는다.

그다음 `--to IMPLEMENTED_GREEN` 전이를 시도한다. 기계 검사:

- `ORACLE_CHANGED` — 카드·source bytes가 잠긴 값과 다름 → 증거를 폐기하고 `NEEDS_DECISION`
- `RUN_NOT_GREEN` — 인용한 run이 통과하지 않음 → 실제 통과 run을 만들고 인용
- `EVIDENCE_REQUIRED` — evidence manifest 없이 상태 전이를 시도함 → 잠긴 카드 전 행을 매핑하고 `--evidence`로 인용
- `REQUIRED_RUN_MISSING` — 선언한 필수 label의 최신 통과가 없음 → 해당 repo 명령을 `exec --label`로 다시 실행
- `FLAKINESS_GATE` — 같은 명령의 연속 통과가 risk 필요 횟수에 못 미침 → 같은 명령을 그대로 다시 실행해 연속 통과를 확보
- `TEST_WEAKENED` — RED 기준선 대비 assertion 감소·금지 토큰·삭제 → 테스트를 원래 강도로 되돌린다
- `ENV_DRIFT`(경고) — RED와 GREEN의 실행 환경이 다름 → 환경 차이가 결과를 바꿨는지 확인하고 보고에 남긴다

flakiness 필요 횟수는 Low 1회, Medium 2회, High 3회. 재실행으로 통과를 뽑는 게 아니라
**같은 명령이 반복해도 결정론적으로 통과함**을 보이는 절차다. 실패가 섞이면
`HARNESS_DEFECT`로 분류하고 조용히 다시 굴리지 않는다.

`TEST_WEAKENED` 금지 토큰: `test.skip`·`it.skip`·`describe.skip`·`.only(`·
`waitForTimeout(`·`toBeTruthy(`·`toBeFalsy(`·`.first()`·`.nth(`·`setTimeout(`과
screenshot 허용치(`maxDiffPixels`·`maxDiffPixelRatio`·`threshold`) 상향.

선택한 GREEN run은 parsed reporter가 있는 카드 test run이어야 한다. 별도 lint·
typecheck·build는 각각 선언한 label로 기록. 전이는 모든 필수 label과 evidence
manifest를 직접 검사하며, 전이가 통과해야 `IMPLEMENTED_GREEN`이다.

### Evidence manifest

증거 매핑은 산문이 아니라 `.ai/oracles/<oracle-id>/evidence.json`으로 관리하고 기계로
검증한다.

```json
{
  "schemaVersion": 1,
  "rows": {
    "O1": { "kind": "test", "name": "저장 > pending 표시와 POST 1회" },
    "O2": { "kind": "reviewer", "finding": "f-3", "role": "code-reviewer" },
    "O3": { "kind": "na", "reason": "이 기능에 취소 경로가 없다", "source": "S1" },
    "D1": { "kind": "visual", "artifact": "visual-qa/v-001/evidence.json" },
    "D2": { "kind": "reviewer", "finding": "d-1", "role": "designer" }
  }
}
```

```bash
node <skill-dir>/scripts/oracle-verify.mjs evidence \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --map .ai/oracles/<oracle-id>/evidence.json \
  --ledger .ai/oracles/<oracle-id>/runs.jsonl \
  --run r-007 \
  --phase green
```

`D*` 행 owner: `HARD → test`, `RELATIONAL → visual | pending`, `JUDGMENT → designer
reviewer`. visual `pending` 또는 Visual QA `declined`는 GREEN 증거 검증에서 미검증 항목으로
보고되지만 review 증거 검증에서는 `EVIDENCE_PENDING`으로 완료를 차단한다.
`REVIEW_VERIFIED`로 가려면 기존 tool browser journey artifact, designer finding, 또는
source-backed N/A revision 중 하나가 필요하다. N/A는 artifact가 아니라 잠긴 카드 row가
`N/A (출처: S*)`를 명시하고 manifest가 승인된 Source Registry ID를 인용할 때만 쓴다.

RELATIONAL visual artifact receipt는 Oracle directory 안의 일반 파일이어야 하며, receipt 내부 artifact 경로는 receipt directory 기준이어야 하며, 최소 형식은
다음과 같다.

```json
{
  "schemaVersion": 2,
  "oracleSha256": "<locked-oracle-sha256>",
  "rows": {
    "D1": {
      "status": "passed",
      "journey": {
        "status": "passed",
        "tool": "playwright",
        "scenario": "primary purchase card at 320px and desktop",
        "checks": ["CTA does not overlap price"],
        "artifacts": ["mobile.png"]
      }
    }
  }
}
```

Browser journey만 N/A이면 row 자체는 여전히 `status: "passed"`여야 하며, row-level `checks`/`artifacts`와 row가 인용한 승인 source가 필요하다. whole-row N/A는 artifact가 아니라 위 manifest의 `kind: "na"`만 쓴다.

```json
{
  "schemaVersion": 2,
  "oracleSha256": "<locked-oracle-sha256>",
  "rows": {
    "D1": {
      "status": "passed",
      "checks": ["Static relation reviewed from approved design source"],
      "artifacts": ["d1.png"],
      "journey": {
        "status": "not-applicable",
        "reason": "No interactive browser journey for this static relation",
        "source": "S1"
      }
    }
  }
}
```

GREEN 전이는 같은 manifest를 필수 입력으로 받는다.

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to IMPLEMENTED_GREEN \
  --run r-007 \
  --evidence .ai/oracles/<oracle-id>/evidence.json
```

`kind: test`는 인용한 run의 reporter 결과에 같은 이름이 통과로 존재해야 한다.
`EVIDENCE_NOT_IN_RUN` = 매핑이 실제 실행과 어긋남, `EVIDENCE_UNVERIFIABLE` = run이
`exit-only`라 이름 확인 불가. 둘 다 이름을 지어내지 말고 reporter를 붙여 재실행.

최종 보고는 Outcome Brief의 사용자·성공 결과·비목표, 선택한 최소 경계, path별 변화,
검증, 남은 위험과 가역성을 먼저 쓴다. 증거 부록에 Oracle SHA-256·source hashes·마지막
verify command/exit, 인용 runId와 실제 검증 command/PASS·FAIL 수,
`oracle-verify.mjs evidence` 출력 기록. 결과에 영향을 주는 commit·runtime/browser
version·locale/timezone·viewport/theme·role·clock/seed·데이터 초기화만 함께 기록.
비-N/A 행 미매핑 또는 revision 불일치면 GREEN을 발급하지 않는다.

production diff의 비결정 소스는 `oracle-verify.mjs scan`을 변경 파일에 실행해 확인.
검출된 `Date.now`·`Math.random`·`crypto.randomUUID`·`toLocale`·`new Intl.`은 주입
seam으로 바꾸거나 `oracle:nondeterminism <사유>` 주석으로 면제를 기록.

### 최종 review 전이

`IMPLEMENTED_GREEN` 뒤 reviewer finding을 반영하면 init에서 선언한 필수 label을 전부
다시 실행한다. 선택한 test run은 GREEN 때와 같은 command여야 하며, review artifact에
blocking finding이 없어야 한다.

```bash
node <skill-dir>/scripts/oracle-verify.mjs review \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --file .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --packet .ai/oracles/<oracle-id>/review-input.json \
  --revision <targetRevision-from-review-packet> \
  --map .ai/oracles/<oracle-id>/evidence.json

node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to REVIEW_VERIFIED \
  --run r-010 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --findings .ai/oracles/<oracle-id>/findings-code-reviewer.json
```

High risk는 GREEN 뒤 guard를 제거한 reported failing run과 영향받은 카드 행을
`--mutation-run`·`--mutation-row`로 넘기고, guard 복구 뒤 같은 GREEN command를 review
run으로 다시 통과시킨다. runner는 GREEN 대비 production digest가 mutation에서 바뀌고
review 전에 정확히 돌아왔는지도 검사한다. 둘 중 하나가 없으면
`MUTATION_EVIDENCE_REQUIRED`, 순서·실패·reporter·digest 조건이 어긋나면
`MUTATION_EVIDENCE_INVALID`. 두 번째 reviewer 파일도 `--intersect`로 함께 넘긴다.
critical/high finding은 한쪽에만 있어도 review를 막는다.

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to REVIEW_VERIFIED \
  --run r-012 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --findings .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --intersect .ai/oracles/<oracle-id>/findings-second-reviewer.json \
  --mutation-run r-011 \
  --mutation-row O3
```

## 금지

[`common.md`](../common.md)의 공통 금지에 더해:

- 카드의 정책·`Then`·`Never`·부작용 횟수 변경
- ledger를 거치지 않은 실행을 증거로 보고
- 거부된 전이를 우회하거나 `run-state.json`·`runs.jsonl`을 직접 편집
- 예산을 계수하지 않고 보정·개선 라운드를 반복
- assertion 약화, `test.skip`, `first()`/`nth()`로 오류 은폐
- fixture에 기대 결과 인코딩
- 임의 sleep 또는 단정 대상을 기다려 race 직렬화
- 브라우저의 현재 동작을 기대값으로 채택
- 유효하지 않은 RED를 근거로 production 수정
- revision mismatch를 자동 재잠금해 기존 증거 재사용
- 승인 없이 architecture 문서 생성·수정 또는 lock 갱신
- 승인된 architecture 문서가 아닌 구현에 맞춰 문서·경계를 사후 변경

3라운드 후에도 GREEN이 아니면 남은 카드 위반과 실제 출력을 포함해 `FAIL`로 보고한다.
무한 자가개선은 하지 않는다.
