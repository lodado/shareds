# 독립 Subagent 카드 리뷰·개선

## 목적과 독립성

구현자가 자신의 GREEN을 최종 승인하지 않도록 독립 reviewer가 외부 기준,
Oracle Card와 원시 증거를 검토한다. reviewer는 정책을 정하거나 처음부터 구현을
다시 쓰지 않는다.

변경 용이성을 판정하기 전에 [`changeability.md`](changeability.md)를 전부 읽는다.
구현자와 같은 정의·질문·React 예시·반례·trade-off를 사용하되, 이 reference를 제품
정책이나 새로운 architecture 권위로 승격하지 않는다. raw Implementation Decision의
주장과 실제 diff가 일치하는지를 독립적으로 반증한다.

카드가 `identity-shaping` Design Intent를 포함하면 [`visual-design.md`](visual-design.md)를
전부 다시 읽고 승인된 시각 계약을 디자인 관할에서도 검토한다. `RELATIONAL`
행의 `$frontend-visual-qa` artifact는 원시 입력으로 추가하되,
reviewer가 screenshot이나 직접 브라우저 실행을 대신 소유하지 않는다.

primary agent는 리뷰 직전 bundled `oracle-lock.mjs verify`를 실행한다. mismatch면
reviewer를 호출하지 않고 기존 증거를 폐기한다.

리뷰는 LLM 판단이라 같은 입력에도 결과가 흔들린다. 아래 두 장치로 판정을 고정한다.

1. reviewer 입력은 파일로 고정한다. 잠긴 카드, ledger runId, evidence 매핑, diff를
   그대로 넘기고 의도한 결론이나 요약된 해석을 넣지 않는다.
2. High risk는 **같은 입력으로 독립 리뷰를 2회** 실행한다. critical과 high finding은
   한쪽에만 나온 단독 finding도 blocking이다. medium과 low finding만 행·분류·
   정규화한 finding 내용의 교집합일 때 완료를 차단하고, 한쪽에만 나오면 advisory로
   기록한다. Medium risk는 단일 리뷰와 스키마 검증만 요구한다.

## 리뷰 기준 우선순위

사용자가 제공했거나 작업의 승인된 기준으로 지정된 자료가 있으면 다음 순서로
우선한다.

1. 보안·개인정보·법적·접근성·금융 및 데이터 정합성의 강제 제약
2. 사용자의 명시적 행동 계약과 공개 호환성
3. 대상 레포의 필수 아키텍처·API·테스트 계약
4. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 원본의 해당 관할
5. 위 기준을 실행 가능한 계약으로 옮긴 Oracle Card
6. production 코드·기존 headless test 관찰은 증거일 뿐 정답 권위가 아님

Figma가 기준이면 정확한 파일·페이지·프레임·버전을 확인하고, 접근할 수 없으면
추측하거나 스크린샷 기억으로 대체하지 말고 미검증으로 보고한다. 외부 기준과
Oracle Card가 충돌하면 reviewer가 임의로 하나를 택하거나 코드를 수정하지 않는다.
충돌 위치와 영향받는 카드 행을 finding으로 남기고 `NEEDS_DECISION`으로 복귀한다.

## 역할 라우팅

- native 역할 라우팅이 있으면 설치된 `code-reviewer` 역할을 명시한다.
- Codex collaboration 표면에서는 `agent_type: code-reviewer`를 사용한다.
- Claude Agent 표면에서는 `subagent_type: code-reviewer`를 사용한다.
- 역할 라우팅이 지원되지 않으면 역할을 프롬프트로 가장하지 말고 지원되는 독립
  review 표면을 사용하거나 `FAIL`로 보고한다.

`identity-shaping`, `JUDGMENT` 행 또는 intentional visual baseline 변경이면 위 code
review와 별도로 설치된 `designer` 역할을 명시해 시각 계약을 검토한다. mixed 작업은
`code-reviewer`가 기술·행동 계약을, `designer`가 Design Intent·`D*` 행을 맡는다.
어느 reviewer도 정책을 새로 정하지 않는다. deterministic comparison이 그대로 통과하고
`JUDGMENT` 행과 baseline 변경이 모두 없으면 추가 designer 검수는 N/A와 사유를 기록한다.

## Reviewer 입력

리뷰 직전 다음 명령으로 기계 생성한 입력을 고정한다.

```bash
node <skill-dir>/scripts/oracle-run.mjs review-packet \
  --dir .ai/oracles/<oracle-id> \
  --decision .ai/oracles/<oracle-id>/implementation-decision.md \
  --output .ai/oracles/<oracle-id>/review-input.json
```

패킷은 마지막 lock verify command·exit, lock manifest, Oracle 전문, 잠긴 local source
전문, run state, ledger, evidence mapping, init 이후 변경 파일 digest, git diff, visual
pending과 Implementation Decision의 path·sha256·content를 원시 필드로 담는다.
reviewer는 `implementation-decision.md`의 주장과 실제 diff를 대조한다. 결론·의도한
해결책·유리한 요약을 추가하지 않는다. 패킷을 손으로 고치지 말고 입력이 바뀌면 다시
생성한다. URL·Figma처럼
lock에 내용을 담을 수 없는 외부 기준만 Oracle Registry에 적힌 정확한
revision으로 별도 전달한다.

reviewer는 패킷의 diff에서 변경한 Page/UI component와 micro-hook·pure model source,
그 사이 import·호출 관계를 직접 대조한다.
`JUDGMENT` 행은 패킷의 승인 기준·Design Intent와 designer finding을 함께
대조한다.

reviewer는 코드를 수정하지 않고 finding만 반환한다. 정책과 baseline을 수정하거나
승인하는 것은 금지하며, baseline 최종 승인은 사용자에게 남긴다.

finding은 자유 서술 대신 아래 스키마 파일로 제출해 기계로 검증한다.

```json
{
  "schemaVersion": 2,
  "reviewer": "code-reviewer",
  "changeabilityReview": [
    { "axis": "Readability", "status": "PASS", "evidence": "src/form.tsx:10-30" },
    {
      "axis": "Predictability",
      "status": "FINDING",
      "evidence": "src/fetch-balance.ts:8",
      "findingId": "f-1"
    },
    { "axis": "Cohesion", "status": "N/A", "evidence": "변경된 소유 경계가 없다" },
    { "axis": "Coupling", "status": "PASS", "evidence": "새 public API가 없다" },
    { "axis": "Simplicity", "status": "PASS", "evidence": "기존 platform API를 재사용한다" }
  ],
  "findings": [
    {
      "id": "f-1",
      "row": "O3",
      "classification": "PRODUCT_DEFECT",
      "severity": "high",
      "source": "S1",
      "finding": "fetchBalance가 이름과 반환값에 드러나지 않는 analytics logging을 수행한다",
      "evidence": "review-input.json diff:src/fetch-balance.ts:8",
      "fix": "analytics logging을 이름 붙은 event boundary로 이동한다"
    }
  ]
}
```

`changeabilityReview`는 다섯 축을 정확히 한 번씩 `PASS | FINDING | N/A`로 판정한다.
모든 판정은 path·line 또는 packet field evidence가 필요하다. `FINDING`은 아래
`findings`의 실제 ID를 인용하고, `N/A`는 적용되지 않는 이유를 evidence에 쓴다.
schema v1은 과거 artifact 검증에만 허용하고 새 review는 v2를 사용한다.

```bash
node <skill-dir>/scripts/oracle-verify.mjs findings \
  --file .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md

node <skill-dir>/scripts/oracle-verify.mjs findings \
  --file .ai/oracles/<oracle-id>/findings-a.json \
  --intersect .ai/oracles/<oracle-id>/findings-b.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md

node <skill-dir>/scripts/oracle-verify.mjs review \
  --file .ai/oracles/<oracle-id>/findings-a.json \
  --intersect .ai/oracles/<oracle-id>/findings-b.json \
  --oracle .ai/oracles/<oracle-id>/oracle.md
```

분류는 상위 피드백 라우터의 `POLICY_GAP`, `EVIDENCE_GAP`, `HARNESS_DEFECT`,
`PRODUCT_DEFECT`, `ENVIRONMENT_DEFECT`, `NON_ORACLE_OPINION` 중 하나다. 그 밖의
분류나 카드에 없는 행 ID는 `FINDINGS_INVALID`로 거부된다. 카드 행을 인용하지 않은
medium/low finding은 `NON_ORACLE_OPINION`으로 강등된다. 행이 없는 critical/high
finding은 전역 보안·권한·데이터 손실 문제일 수 있으므로 강등하지 않고 blocking으로
유지한다. `oracle-verify.mjs review`는 blocking이 남으면 `FINDINGS_BLOCKING`으로
실패한다.

승인된 레포 보안·접근성 계약 위반은 `PRODUCT_DEFECT`, 카드에 그 계약이 누락됐으면
`POLICY_GAP`이다. 단순 선호는 `NON_ORACLE_OPINION`이며 완료를 차단하지 않는다.
출처 있는 미적 요구의 불일치는 단순 선호가 아니다. 구현이 다르면
`PRODUCT_DEFECT`, 카드가 누락·왜곡했으면 `POLICY_GAP`으로 분류한다.

숨은 부작용, 실제 drift 결함 위험, 승인된 architecture·public API 경계 위반은 구체
evidence와 카드 행이 있을 때 `PRODUCT_DEFECT`다. 필요한 검증이 없으면
`EVIDENCE_GAP`, 관찰 결과나 API shape를 새로 정해야 하면 `POLICY_GAP`이다. 더 선호하는
이름·폴더·추상화 방식은 `NON_ORACLE_OPINION`이며 blocking 근거가 아니다.

## Reviewer 체크리스트

변경 용이성은 [`changeability.md`](changeability.md)의 canonical 기준으로
Readability·Predictability·Cohesion·Coupling·Simplicity를 먼저 판정한다. 각 축의
`Implementation Decision evidence`와 `Reviewer 판정 기준`을 실제 path·line 또는 packet
field에 대조한다. 다섯 축을 모두 PASS로 채우는 것이 목적이 아니며, 적용되지 않는 축은
구체 N/A 이유를 쓴다.

### Decision 반증 질문 — 적용 가능한 항목만

reviewer는 아래 질문으로 사용자를 다시 인터뷰하거나 새 정책을 정하지 않는다. Oracle,
`implementation-decision.md`, diff와 ledger에서 답의 근거를 찾고 실제 path·line·runId를
인용한다. 카드 결과나 구현 claim에 material한데 근거만 없으면 `EVIDENCE_GAP`, 결과를
새로 정해야 하면 `POLICY_GAP`, 해당하지 않으면 구체 사유와 함께 N/A다. 설명 취향이나
문장력만으로 finding을 만들지 않는다.

| 반증 질문                                                | 필요한 근거                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| 왜 이 범위까지 변경했는가?                               | 사용자 가치, 명시된 제약, Outcome Brief의 성공·Non-goals        |
| 왜 이 상태는 local 또는 global owner가 소유하는가?       | 실제 consumer 범위, 생성·유지·폐기 lifecycle                    |
| 요구가 바뀌면 어디를 수정하고 어디까지 전파되는가?       | 정책 owner, public surface, import·data flow 영향 범위          |
| 왜 이 component·abstraction을 공유하는가?                | 현재 consumer가 공유하는 stable invariant와 함께 바뀌는 계약    |
| 왜 중복을 남겼는가?                                      | 독립 변경 방향, 공통화 결합 비용과 drift 위험                   |
| 왜 이 type·state model의 복잡성이 필요한가?              | 타입이 막는 실제 불가능 상태·잘못된 전이                        |
| 이 경계는 어떤 오류를 복구하고 무엇을 상위로 전파하는가? | 예상 오류·알 수 없는 오류의 owner, fallback과 retry 계약        |
| 검증하지 않은 계약은 무엇이며 왜 제외했는가?             | risk, 카드 행 evidence 또는 출처 있는 N/A                       |
| 성능 문제나 개선 claim의 근거가 있는가?                  | 동일 환경 metric·budget·baseline/after 또는 claim 없음          |
| 다음 우선순위는 무엇인가?                                | 기술적 wishlist가 아니라 남은 사용자·보안·정합성·운영 위험 순서 |

- 승인된 기획서·Figma의 레이아웃, 상태, 문구, interaction과 구현이 일치하는가?
- Outcome Brief의 사용자·상황과 관찰 가능한 성공이 실제 diff로 달성됐고 Non-goals를
  침범하지 않았는가?
- 외부 기준의 각 요구가 Oracle Card에 정확히 번역됐으며 누락·왜곡되지 않았는가?
- Source Registry의 `Kind`·관할·version이 정확하며 mandatory constraint를 제품·시각
  선호로 낮추지 않았는가?
- Oracle SHA-256과 source hashes가 마지막 verify 결과와 일치하는가?
- 보고된 통과가 ledger runId로 뒷받침되며 grade가 `reported`인가?
- 모든 Oracle 행에 tier owner의 증거 또는 출처 있는 N/A가 매핑됐고
  `oracle-verify.mjs evidence`가 통과했는가?
- 모든 비-N/A 카드 행이 테스트에 대응하는가?
- 각 행이 `Then`, `Never`, 부작용 종류·횟수를 검증하는가?
- UI 상태와 실제 부작용 횟수를 별도로 검증하는가?
- assertion이 내부 state나 구현 세부에 결합되지 않았는가?
- loading, retry, race, out-of-order가 결정론적으로 통제되는가?
- 구현이 카드 밖의 정책이나 동작을 임의로 추가하지 않았는가?
- 실제 package version과 레포 계약을 확인하고 외부 best practice보다 우선했는가?
- material한 입력·성공·실패·상태가 TypeScript로 표현되고 `any`나 광범위한 assertion으로
  불가능 상태를 숨기지 않았는가? 단순 상태에 불필요한 state machine도 만들지 않았는가?
- state에 저장된 action(`retry`·`submit`)이나 no-op action이 있는가? 상태는 데이터만
  담고 action은 hook 반환의 형제여야 하며, 서버 상태면 기존 `refetch`를 재사용해야
  한다. 위반이면 `FINDING`이다.
- 기존 query API로 표현되는 서버 상태를 `useState`+`useEffect`로 다시 구현했는가?
  unmount·route 변경 뒤 늦은 응답이 상태를 덮을 수 있는가?
- server state를 query cache와 local/global state가 중복 소유하지 않는가?
- Server Component로 충분한 일을 Client Component·TanStack Query로 옮기지 않았는가?
- Suspense/Error Boundary가 필요한 subtree에만 있고 initial load·background refetch·
  mutation pending을 같은 상태로 취급하지 않았는가?
- 무조건 실행되는 첫 조회의 loading·error를 경계로 올리지 않고 컴포넌트 안에서
  분기했는가? 조건부 query·placeholder·취소 제약 같은 실격 사유가 Implementation
  Decision에 없으면 `FINDING`이다.
- retry가 실패한 query/boundary 범위만 복구하고 전체 cache를 무차별 reset하지 않는가?
- micro-hook이 UI와 비즈니스 로직의 책임을 정확히 분리하는가? UI component는 semantic
  JSX·접근성·시각 상태·사용자 intent 연결만 소유하고, domain 판정·DTO 변환·query/cache·
  navigation·storage·observer 조율을 직접 소유하지 않는가?
- 각 micro-hook이 하나의 interaction workflow 또는 외부 시스템 연결만 소유하고
  render-ready 값과 intent action만 반환하며 JSX·class·token·문구를 숨기지 않는가?
- React가 필요 없는 필터·그룹·정렬·검증·상태 전이는 pure model function에 있고,
  단순 rename인 trivial wrapper나 unrelated 책임을 합친 거대 hook을 만들지 않았는가?
- 승인된 architecture unit 문서와 실제 import/data flow가 일치하는가?
- 기존 구조에 불필요한 FSD migration이나 빈 layer·segment를 만들지 않았는가?
- FSD면 [`fsd.md`](fsd.md)를 전부 읽고 「자주 나오는 위반」 표에 해당하는 항목이
  없는가?
- component가 상태·async/error·접근성 책임에 따라 분리되고 한 파일에 독립 component를
  몰아넣거나 반대로 trivial wrapper를 늘리지 않았는가?
- interactive UI가 semantic element·accessible name·keyboard·focus·상태 전달 계약을
  충족하고, dialog·popover의 Escape와 focus 복귀가 해당할 때 검증됐는가?
- UI가 network transport를 직접 호출하지 않고 api/model/public API 경계를 지키는가?
- 성능 claim이 있으면 동일 환경의 metric·budget과 baseline/after ledger run이 있고,
  claim이 없는데 benchmark·memoization dependency를 추가하지 않았는가?
- exported shared/package API가 바뀐 경우에만 consumer·호환성·type/runtime·pack·migration
  증거가 있으며, 앱 내부 변경에 release gate를 강제하지 않았는가?
- 순수 함수·render 파생·event handler로 가능한 일을 effect로 옮기지 않았으며 모든
  effect가 승인 문서의 외부 시스템·이유·cleanup에 대응하는가?
- architecture 문서 bytes와 Oracle source lock, 레포 구조 검증 또는 reviewer 증거가 모두 일치하는가?
- Design Intent가 있으면 subject·audience·single job에서 palette·type·layout·copy·
  signature·motion이 실제로 파생되고 승인된 방향과 일치하는가?
- `local`·`identity-shaping`이면 lock 전에 받은 Design Change Confirmation의 명시적
  사용자 답변 위치가 카드에 있는가?
- `identity-shaping`이면 다른 제품에도 그대로 붙을 generic 선택을 제거하고 boldness를
  signature 한 곳에 집중했는가?
- 모든 `D*` 행에 `HARD` test, `RELATIONAL` visual artifact, `JUDGMENT`
  designer finding 또는 출처 있는 N/A가
  매핑됐으며 같은 fixture·reference를 공유하는 증거를 독립 증거로 과장하지 않았는가?
- `$frontend-visual-qa` artifact가 있다면 같은 Oracle revision을 인용하고 사전
  합의한 시각·브라우저 행을 빠짐없이 판정하는가?
- 보안, 접근성, 데이터 유실 방지 같은 레포 필수 계약을 훼손하지 않았는가?

## Finding 개선

1. primary agent가 finding을 상위 피드백 라우터로 처리하고, 별도의 `executor` 역할은
   증거 있는 `PRODUCT_DEFECT`만 최소 수정한다.
2. 정책을 새로 정해야 하는 finding은 수정하지 않고 `NEEDS_DECISION`으로 복귀한다.
3. 수정 후 finding을 재현하는 targeted test를 실행한다.
4. 카드 전체 테스트와 레포 필수 검증을 다시 실행한다.
5. 사용자가 별도 `$frontend-visual-qa`를 요청했고 영향받은 artifact가 있으면 그
   스킬로 돌아가 다시 실행한다.
6. 가능하면 같은 reviewer에 원시 재검증 증거를 전달해 finding 해소 여부만 확인한다.

reviewer와 fixer를 분리한다. reviewer가 직접 수정하고 자신의 수정을 최종 승인하게
하지 않는다. reviewer는 각 finding에 한 위험과 최소 수정만 제안하고 품질 명목의
전면 리팩터링을 요구하지 않는다. `NON_ORACLE_OPINION`과 advisory finding은 기록하되
수정이나 정책 변경의 근거로 쓰지 않는다. 재검증도 `oracle-run.mjs exec`로 실행하고 그 runId로
`--to REVIEW_VERIFIED` 전이를 기록한다. blocking finding이 없거나 모두 해소되고 필수
재검증이 통과해야 `REVIEW_VERIFIED`다. init에서 선언한 모든 필수 label을 GREEN
이후 다시 실행하고, 같은 카드 test command의 reported run과 clear findings를
`oracle-run.mjs transition --to REVIEW_VERIFIED --evidence ... --findings ...`에
넘긴다. High risk는 두 번째 reviewer 파일도 `--intersect`로 넘기고, GREEN 이후의
mutation kill run과 해당 행을 `--mutation-run`·`--mutation-row`로 함께 기록한다.
