# Oracle 기반 구현·자가검증 루프

## 목차

1. 권위와 진입 조건
2. 테스트로 계약 상태 확인
3. Frontend 구현 결정
4. 최소 구현·셀프피드백
5. GREEN 게이트
6. 금지

## 권위와 진입 조건

먼저 sibling `test/SKILL.md`를 전부 읽고 Oracle 게이트, 테스트 작성, 실행,
`VALID_RED` 판정과 보정 예산을 그대로 따른다. 이 문서는 production 구현과
자가피드백만 추가한다. frontend production을 수정할 때는
[`frontend-implementation.md`](frontend-implementation.md)도 전부 읽는다.

**TDD가 우선이다.** `ORACLE_READY` 뒤 테스트를 먼저 작성·실행하고, sibling `test` skill이
인정하는 `VALID_RED`를 확보하기 전에는 production 코드를 작성하거나 수정하지 않는다.

- Medium/High risk는 `ORACLE_READY` 카드가 필수다.
- Medium/High risk는 revision lock이 유효해야 하고, High risk는 사용자에게 카드와
  SHA-256을 확인받아야 한다.
- 대상 레포의 `AGENTS.md`, `CLAUDE.md`, 테스트 스크립트, 인접 테스트와 필수
  아키텍처 문서를 production 수정 전에 읽는다.
- React production 변경은 [`architecture-contract.md`](architecture-contract.md)의
  명시적 문서 승인과 Oracle local-source lock을 완료해야 테스트를 작성할 수 있다.
  기존 승인 문서가 변경을 정확히 허용하면 새 승인 없이 경로와 source hash를 기록한다.
- 기존 worktree 변경을 보존하고 관련 없는 파일을 수정하지 않는다.

## 1. 테스트로 계약 상태 확인

1. bundled `oracle-lock.mjs verify`를 실행하고 revision과 exit code를 기록한다.
2. 카드의 모든 비-N/A 행을 관찰 가능한 테스트로 번역한다.
3. network 경계가 있으면 MSW handler로 세운다. 레포에 MSW가 없으면 설치 여부를 먼저
   확인하고, MSW로 표현할 수 없는 경우에만 다른 mocking 수단을 사유와 함께 쓴다.
   handler와 예시 데이터는 그 경계를 소유한 가장 가까운 곳에 두고, FSD 배치는
   [`fsd.md`](fsd.md)의 `__mocks__/` 규칙을 따른다.
4. 각 행의 `Then`, `Never`, 부작용 종류·횟수를 함께 assert한다. 요청 횟수와 순서는
   handler에서 관찰한다.
5. 테스트를 실제로 실행한다.
6. 실패가 sibling `test` skill의 `VALID_RED` 술어를 만족할 때만 production을 수정한다.

요청된 동작이 이미 GREEN이면 production을 억지로 바꾸거나 RED를 만들지 않는다.
기존 구현이 카드를 충족한다는 증거를 기록하고 전체 검증으로 간다. High risk는
sibling `test` skill의 mutation 단계로 테스트 민감도를 별도 확인한다.

## 2. Frontend 구현 결정

`VALID_RED` 뒤 frontend production 수정이 필요하면 코드를 쓰기 전에 실제 package
version과 레포 규칙을 근거로 아래 기록을 남긴다. 외부 best practice는 제품 정책을
정하거나 레포 계약을 덮어쓰지 않는다. 순수 helper 등 해당하지 않는 항목은 이유와
함께 N/A로 기록한다.

```markdown
### Implementation Decision

- Target: React/Next.js/TanStack Query version과 router/runtime
- State ownership: server state, URL state, client state, derived state의 소유자
- Server/Client boundary: server에 남길 것과 최소 client leaf
- Async boundary: initial loading, refetch, error, retry, mutation pending 처리
- Hook boundary: 분리할 interaction/query 책임과 분리하지 않을 trivial logic
- Architecture: 영향 unit, 승인된 architecture 문서, 기존 관례·data/effect 경계와
  Oracle source hash
- Design: Design Intent가 있으면 visual scope, component·token 재사용, typography,
  responsive, motion·reduced motion, copy, signature와 버린 generic 선택; 없으면 N/A
- Sources: 적용한 레포 계약·공식 문서·휴리스틱
- Rejected: 검토했지만 적용하지 않은 대안과 이유
```

선택이 카드의 관찰 결과를 바꾸거나 승인된 기준과 충돌하면 구현하지 말고
`NEEDS_DECISION`으로 복귀한다. 기술적으로 동등한 선택이면
`frontend-implementation.md`의 우선순위로 결정하고 계속한다.

## 3. 최소 구현·셀프피드백

최대 3라운드 반복한다. 한 라운드는 다음 전체 묶음이다.

1. 실패한 카드 행 하나 또는 같은 root cause의 행 묶음을 고른다.
2. 관련 호출 경로를 끝까지 추적해 모든 호출자가 공유하는 원인을 찾는다.
3. 해당 계약만 만족하는 최소 production 변경을 작성한다.
4. 실패했던 targeted test를 재실행한다.
5. 영향 범위 테스트를 실행한다.
6. 결과를 분류하고 다음 행동을 결정한다.

| 분류                 | 행동                                                         |
| -------------------- | ------------------------------------------------------------ |
| `POLICY_GAP`         | 카드 현재본과 질문을 출력하고 `NEEDS_DECISION`               |
| `EVIDENCE_GAP`       | 잠긴 카드 범위 안에서 누락 테스트·증거만 추가                |
| `HARNESS_DEFECT`     | sibling `test` skill 허용 항목과 공용 2회 예산 안에서만 보정 |
| `PRODUCT_DEFECT`     | 같은 카드 행을 유지하고 최소 수정 후 재실행                  |
| `ENVIRONMENT_DEFECT` | production을 건드리지 않고 `FAIL`                            |
| `NON_ORACLE_OPINION` | 기록하되 정책·assertion·완료 상태를 바꾸지 않음              |

revision mismatch는 피드백 분류 대상이 아니다. 기존 증거를 즉시 폐기하고
`oracle-card.md`의 lock 규칙대로 `NEEDS_DECISION` 또는 `FAIL`로 이동한다.

매 라운드 기록:

| 라운드 | 카드 행 | 실패 가설 | 최소 변경 | 실제 실행 결과 | 다음 판단 |
| ------ | ------- | --------- | --------- | -------------- | --------- |

## 4. GREEN 게이트

카드 테스트가 통과하면 레포가 요구하는 검증을 실제로 실행한다.

1. targeted test
2. 영향 범위 test
3. typecheck와 lint
4. Oracle source lock verify 및 레포에 존재하는 구조 검증 명령
5. 루트 또는 패키지 필수 test/build

레포 규칙에 정의된 명령이 우선이다. 실행하지 않은 검증을 통과했다고 보고하지
않는다. 문서화된 명령이 없으면 package scripts를 읽어 targeted + 가장 가까운
package 검증을 실행한다. 필수 root 명령이 없거나 무관한 기존 실패가 있으면 원문과
영향을 분리해 보고하며 GREEN으로 숨기지 않는다. 모두 통과해야 `IMPLEMENTED_GREEN`이다.

최종 evidence manifest에는 Oracle SHA-256·source hashes·마지막 verify command/exit,
실제 검증 command/PASS·FAIL 수와 모든 행동·시각 Oracle 행의
`행 ID → test name | browser scenario | reviewer finding | 출처 있는 N/A 사유`를 기록한다. 결과에 영향을
주는 commit·runtime/browser version·locale/timezone·viewport/theme·role·clock/seed·
데이터 초기화만 함께 기록한다. 비-N/A 행이 매핑되지 않거나 revision이 다르면 GREEN을
발급하지 않는다.

## 금지

- 카드의 정책·`Then`·`Never`·부작용 횟수 변경
- assertion 약화, `test.skip`, `first()`/`nth()`로 오류 은폐
- fixture에 기대 결과 인코딩
- 임의 sleep 또는 단정 대상을 기다려 race 직렬화
- 브라우저의 현재 동작을 기대값으로 채택
- 유효하지 않은 RED를 근거로 production 수정
- revision mismatch를 자동 재잠금해 기존 증거 재사용
- 승인 없이 architecture 문서 생성·수정 또는 lock 갱신
- 승인된 architecture 문서가 아닌 구현에 맞춰 문서·경계를 사후 변경

3라운드 후에도 GREEN이 아니면 남은 카드 위반과 실제 출력을 포함해 `FAIL`로
보고한다. 무한 자가개선은 하지 않는다.
