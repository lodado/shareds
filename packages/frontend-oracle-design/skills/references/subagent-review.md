# 독립 Subagent 카드 리뷰·개선

## 목적과 독립성

구현자가 자신의 GREEN을 최종 승인하지 않도록 독립 reviewer가 외부 기준,
Oracle Card와 원시 증거를 검토한다. reviewer는 정책을 정하거나 처음부터 구현을
다시 쓰지 않는다.

카드가 `identity-shaping` Design Intent를 포함하면 [`visual-design.md`](visual-design.md)를
전부 다시 읽고, 승인된 시각 계약과 성공 screenshot을 디자인 관할에서도 검토한다.

primary agent는 리뷰 직전 bundled `oracle-lock.mjs verify`를 실행한다. mismatch면
reviewer를 호출하지 않고 기존 증거를 폐기한다.

## 리뷰 기준 우선순위

사용자가 제공했거나 작업의 승인된 기준으로 지정된 자료가 있으면 다음 순서로
우선한다.

1. 승인된 기획서·PRD·수용 기준·디자인 시스템·Figma 원본 파일/프레임
2. 위 외부 기준을 실행 가능한 계약으로 옮긴 Oracle Card
3. 대상 레포의 필수 아키텍처·접근성·보안 계약
4. production 코드·기존 테스트·브라우저 관찰은 증거일 뿐 정답 권위가 아님

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

`identity-shaping`이면 위 code review와 별도로 설치된 `designer` 역할을 명시해
시각 계약을 검토한다. mixed 작업은 `code-reviewer`가 기술·행동 계약을,
`designer`가 Design Intent·`D*` 행을 맡는다. `behavior-only`·단순 `local` 변경에는
추가 reviewer를 만들지 않는다. 어느 reviewer도 정책을 새로 정하지 않는다.

## Reviewer 입력

의도한 해결책이나 선행 결론 대신 다음 원시 자료를 전달한다.

1. 승인된 기획서·PRD·수용 기준·Figma 링크와 정확한 frame/version 등 외부 기준
2. Oracle Card 전문과 Risk
3. Oracle SHA-256·source hashes·마지막 verify command와 exit code
4. `implementation-loop.md`의 Implementation Decision 기록
5. architecture unit별 승인 문서 전문·Oracle source hash·사용자 승인 위치와 레포 구조 검증 출력 또는 N/A 사유
6. production diff
7. 추가·변경한 테스트 diff
8. 테스트·typecheck·lint·build의 실제 출력
9. 브라우저 증거 또는 N/A 사유
10. High risk mutation 증거
11. 미검증 항목
12. `Oracle 행 ID → test/browser/N/A 증거` 전체 매핑
13. Design Intent가 있으면 승인된 reference·anti-reference, `D*` 행과
    viewport·theme·motion별 성공 screenshot

reviewer는 코드를 수정하지 않고 다음 형식으로 finding만 반환한다.

| 분류 | 기준 출처 | 카드 행 | 상태 | 발견 | 증거 | 심각도 | 최소 권장 수정 |
| ---- | --------- | ------- | ---- | ---- | ---- | ------ | -------------- |

분류는 상위 피드백 라우터의 `POLICY_GAP`, `EVIDENCE_GAP`, `HARNESS_DEFECT`,
`PRODUCT_DEFECT`, `ENVIRONMENT_DEFECT`, `NON_ORACLE_OPINION` 중 하나다. 승인된
레포 보안·접근성 계약 위반은 `PRODUCT_DEFECT`, 카드에 그 계약이 누락됐으면
`POLICY_GAP`이다. 단순 선호는 `NON_ORACLE_OPINION`이며 완료를 차단하지 않는다.
출처 있는 미적 요구의 불일치는 단순 선호가 아니다. 구현이 다르면
`PRODUCT_DEFECT`, 카드가 누락·왜곡했으면 `POLICY_GAP`으로 분류한다.

## Reviewer 체크리스트

- 승인된 기획서·Figma의 레이아웃, 상태, 문구, interaction과 구현이 일치하는가?
- 외부 기준의 각 요구가 Oracle Card에 정확히 번역됐으며 누락·왜곡되지 않았는가?
- Source Registry의 각 기준이 자신의 관할 안에서만 적용됐고 version이 여전히 같은가?
- Oracle SHA-256과 source hashes가 마지막 verify 결과와 일치하는가?
- 모든 Oracle 행에 test, browser scenario 또는 출처 있는 N/A 증거가 매핑됐는가?
- 모든 비-N/A 카드 행이 테스트에 대응하는가?
- 각 행이 `Then`, `Never`, 부작용 종류·횟수를 검증하는가?
- UI 상태와 실제 부작용 횟수를 별도로 검증하는가?
- assertion이 내부 state나 구현 세부에 결합되지 않았는가?
- loading, retry, race, out-of-order가 결정론적으로 통제되는가?
- 구현이 카드 밖의 정책이나 동작을 임의로 추가하지 않았는가?
- 실제 package version과 레포 계약을 확인하고 외부 best practice보다 우선했는가?
- server state를 query cache와 local/global state가 중복 소유하지 않는가?
- Server Component로 충분한 일을 Client Component·TanStack Query로 옮기지 않았는가?
- Suspense/Error Boundary가 필요한 subtree에만 있고 initial load·background refetch·
  mutation pending을 같은 상태로 취급하지 않았는가?
- retry가 실패한 query/boundary 범위만 복구하고 전체 cache를 무차별 reset하지 않는가?
- micro-hook이 응집된 interaction/query 책임을 분리하며 trivial wrapper와 거대 hook을
  늘리지 않았는가?
- 승인된 architecture unit 문서와 실제 import/data flow가 일치하는가?
- 기존 구조에 불필요한 FSD migration이나 빈 layer·segment를 만들지 않았는가?
- component가 상태·async/error·접근성 책임에 따라 분리되고 한 파일에 독립 component를
  몰아넣거나 반대로 trivial wrapper를 늘리지 않았는가?
- UI가 network transport를 직접 호출하지 않고 api/model/public API 경계를 지키는가?
- 순수 함수·render 파생·event handler로 가능한 일을 effect로 옮기지 않았으며 모든
  effect가 승인 문서의 외부 시스템·이유·cleanup에 대응하는가?
- architecture 문서 bytes와 Oracle source lock, 레포 구조 검증 또는 reviewer 증거가 모두 일치하는가?
- Design Intent가 있으면 subject·audience·single job에서 palette·type·layout·copy·
  signature·motion이 실제로 파생되고 승인된 방향과 일치하는가?
- `local`·`identity-shaping`이면 lock 전에 받은 Design Change Confirmation의 명시적
  사용자 답변 위치가 카드에 있는가?
- `identity-shaping`이면 다른 제품에도 그대로 붙을 generic 선택을 제거하고 boldness를
  signature 한 곳에 집중했는가?
- 모든 `D*` 행에 test, browser scenario, designer finding 또는 출처 있는 N/A가
  매핑됐으며 같은 fixture·reference를 공유하는 증거를 독립 증거로 과장하지 않았는가?
- 브라우저 증거가 사전 매핑된 모든 browser-relevant 카드 행을 실제로 판정하는가?
- 보안, 접근성, 데이터 유실 방지 같은 레포 필수 계약을 훼손하지 않았는가?

## Finding 개선

1. primary agent가 finding을 상위 피드백 라우터로 처리하고, 별도의 `executor` 역할은
   증거 있는 `PRODUCT_DEFECT`만 최소 수정한다.
2. 정책을 새로 정해야 하는 finding은 수정하지 않고 `NEEDS_DECISION`으로 복귀한다.
3. 수정 후 finding을 재현하는 targeted test를 실행한다.
4. 카드 전체 테스트와 레포 필수 검증을 다시 실행한다.
5. 영향을 받은 브라우저 시나리오를 다시 실행한다.
6. 가능하면 같은 reviewer에 원시 재검증 증거를 전달해 finding 해소 여부만 확인한다.

reviewer와 fixer를 분리한다. reviewer가 직접 수정하고 자신의 수정을 최종 승인하게
하지 않는다. `NON_ORACLE_OPINION`은 기록하되 수정이나 정책 변경의 근거로 쓰지 않는다.
유효 finding이 없거나 모두 해소되고 필수 재검증이 통과해야 `REVIEW_VERIFIED`다.
