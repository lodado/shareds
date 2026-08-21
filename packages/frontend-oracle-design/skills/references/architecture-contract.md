# Frontend Architecture Documentation Gate

React production을 새로 만들거나 구조를 바꿀 때, 영향받는 architecture unit의
구조 결정을 사용자 승인과 Oracle source lock으로 고정한다. 이 문서는 특정
architecture(FSD 포함)를 강제하지 않는다.

## Architecture intake

승인 문서나 Oracle lock을 만들기 전에 다음을 실제 파일과 import에서 확인한다.

- 적용되는 `AGENTS.md`, `CLAUDE.md`와 repo-local instruction
- source root(`src/` 포함)와 영향받는 architecture unit의 정확한 경로
- 외부 호출자가 쓰는 public API와 client/server entry point
- 기존 segment별 책임, state와 async ownership
- unit·segment별 테스트 소유 위치와 실행 명령
- 기존 architecture 문서와 import-boundary 검증 수단

확인한 경로와 책임을 승인 문서에 구체적으로 기록한다. 기존 구조가 없거나 사용자가
새 구조를 승인한 경우에만 FSD 같은 architecture를 도입한다. FSD를 채택하면
[`fsd.md`](fsd.md)를 전부 읽고 layer·segment·public API 계약을 적용한다. 사용자
전역 rules나 repo instruction의 폴더 관례(예: `components/`·`hooks/` 조직)가 FSD와
충돌하면 임의로 절충하지 말고 `NEEDS_DECISION`으로 우선순위를 확인해 승인된
결정을 문서에 기록한다. intake 결과가 미결이거나 대화 중 바뀌면 문서를 잠그지
않고 `NEEDS_DECISION`으로 돌려보낸다.

## Architecture unit

문서는 모든 leaf component가 아니라 함께 변경되는 책임 경계에 둔다.

```text
<architecture-unit>/__docs__/architecture.md
```

unit은 기존 레포의 feature, package, route module, component group 또는 FSD slice일 수
있다. 기존 `architecture.md`와 실제 폴더·import 관례를 먼저 읽는다. 일관된 기존
구조는 보존하며, FSD migration을 작업에 끼워 넣지 않는다.

## 승인 게이트

1. 영향받는 기존 `architecture.md`를 모두 읽는다.
2. 현재 변경을 이미 정확히 허용하면 경로와 Oracle source hash를 기록하고 수정하지
   않는다.
3. 문서가 없거나 변경이 필요하면 전체 새 본문과, 기존 문서가 있으면 diff를 대화에
   보여준다.
4. 사용자에게 명시적 승인을 받는다. 승인 전에는 architecture 문서·테스트·production
   코드를 작성하거나 수정하지 않는다.
5. 승인된 exact bytes로 문서를 작성하고 Oracle lock 생성 때
   `--source <architecture.md>`를 포함한다.
6. 테스트, production, 브라우저, 리뷰 직전의 `oracle-lock.mjs verify`가 문서 변경을
   감지한다. `SOURCE_CHANGED`면 기존 증거를 폐기하고 새 본문을 다시 승인받는다.

사용자가 승인한 architecture와 repo instruction이 충돌하거나 어느 한쪽이 바뀌면
승인 당시의 결정을 추측하지 않는다. 현재 문서와 instruction을 다시 대조하고 필요한
최소 diff를 재승인받은 뒤 새 revision을 잠근다.

이미 Design-only lock이 있는데 이 문서가 새 source로 추가되면 기존 lock을 확장하지
않는다. 승인된 source delta를 포함한 새 Oracle revision에서 전체 source를 함께 잠근다.

문서 자체의 SHA-256은 `oracle-lock.mjs` 출력의 source hash가 권위다. 별도 hash 파일이나
generic AST checker를 만들지 않는다.

## 문서 최소 형식

```markdown
# <Unit> Architecture

## Scope / Non-goals

## Existing conventions reused

## Responsibilities and public entry points

## State ownership

## Server / Client boundary

## Data and async flow

## API contract

## Component boundaries

## Pure functions and effects

## Loading / Error / Retry

## Test boundaries

## Rejected alternatives

## Approval evidence
```

섹션은 해당할 때만 구체적으로 작성하고, 적용하지 않는 항목은 N/A 사유를 남긴다.
문서가 코드보다 커지는 template 채우기나 빈 layer·folder 생성을 금지한다.

FSD unit이면 다음을 반드시 포함한다: `Responsibilities and public entry points`에
layer·segment 매핑과 slice public API(`index.ts`)의 정확한 export 목록,
`Component boundaries`에 허용·금지 import 경계(deep import 금지 포함),
`Test boundaries`에 `__test__/`·`__mocks__/` 배치. 기준은 [`fsd.md`](fsd.md)다.

## API 계약 — 조건부

unit이 HTTP/RPC endpoint를 호출하거나 정의할 때만 `## API contract`을 endpoint마다
채운다. 호출하는 endpoint가 없으면 N/A 사유만 남긴다.

```markdown
### `POST /api/orders` — 주문 생성

| 항목        | 값                                                   |
| ----------- | ---------------------------------------------------- |
| Source      | S3 — API 계약 endpoint/version                       |
| Auth        | 필요 여부와 scope                                    |
| Idempotency | key 생성 주체·헤더·재전송 시 응답 재생 여부 또는 N/A |
| Pagination  | 끝 판정 신호·token 규칙 또는 N/A                     |

**Request parameters**

| 위치              | 이름 | 타입 | 필수 | 제약 |
| ----------------- | ---- | ---- | ---- | ---- |
| path/query/header |      |      |      |      |

**Request body**

| 필드 | 타입 | 필수 | 제약 |
| ---- | ---- | ---- | ---- |

**Response 200**

| 필드 | 타입 | nullable | 비고 |
| ---- | ---- | -------- | ---- |

**Error codes**

| status | code           | 의미      | UI 결과        | 재시도 | 카드 행 |
| ------ | -------------- | --------- | -------------- | ------ | ------- |
| 400    | INVALID_FIELD  | 형식 오류 | 필드 오류 표시 | 금지   | O3      |
| 409    | ALREADY_PLACED | 중복 제출 | 기존 주문 유지 | 금지   | O5      |
```

- 값은 승인된 API source(`project-constraint`)에서만 옮겨 적는다. 응답 관찰이나
  추측으로 채우지 않으며, 스펙 소스가 없으면 `NEEDS_DECISION`.
- 각 error code의 UI 결과·재시도는 제품 정책이다. 카드 `O*` 행에 매핑되지 않은
  code가 남으면 `POLICY_GAP`으로 `NEEDS_DECISION`.
- 서버가 problem+json([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457))이면
  `type` URI·machine-readable code로만 분기하고 UI가 `detail` 문자열을 파싱하지
  않는다.
- idempotency는 서버 계약을 그대로 기록한다 — key 생성 주체(권장: 클라이언트
  UUID), 같은 key 재전송 시 저장된 응답 재생 여부, 같은 key·다른 파라미터의 처리
  ([Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
  방식 참조).
- 목록 endpoint는 끝 판정 신호(예: 빈 `next_page_token`)와 token 불투명성(클라
  파싱 금지), 페이지 간 파라미터 고정 규칙을 기록한다
  ([AIP-158](https://google.aip.dev/158) 참조).
- 생성 타입(OpenAPI codegen 등)이 이미 있으면 타입 이름과 생성 경로만 적고 필드를
  복제하지 않는다. 문서와 생성 타입 중 하나만 권위를 갖는다.
- 레포 전체 endpoint 카탈로그를 만들지 않는다. 이번 변경 unit이 실제 쓰는
  endpoint만 기록한다.

### 스펙이 없을 때 — 카드에서 schema 도출

승인된 API source가 없으면 추측 대신 카드에서 draft schema를 도출해 제안한다.
도출물은 Proposal이다 — 명시 승인 전에는 이 schema로 구현·mock을 작성하지 않고,
승인되면 `project-constraint` source로 등록해 카드와 함께 잠근다.

| 카드 요소             | schema로                                              |
| --------------------- | ----------------------------------------------------- |
| P3 entity 답          | 리소스 경로·필드                                      |
| `O*` 부작용 종류×횟수 | method×endpoint 목록                                  |
| `Given`·`When` 입력   | request parameters·body와 제약                        |
| `Then` 관찰 결과      | response 필드 — UI가 그려야 하는 것만                 |
| `Never`·실패 행       | error code 표 — 구분해야 하는 실패 정책마다 code 하나 |
| P4·P5 답              | idempotency 헤더·pagination token 규칙                |

- 도출 draft는 소유 unit의 `__docs__/architecture.md` `## API contract` 절에
  쓴다 — 구조 결정과 같은 파일, 같은 승인·lock 흐름이다. 레포가 스펙 파일
  위치(OpenAPI 등)를 명시적으로 강제할 때만 그 관례를 우선하고 이 절에는
  위치·version 참조와 카드 행 매핑만 남긴다. 어느 쪽이든 파일로 존재해야 하고
  `--source`로 lock에 포함한다 — 대화에만 있는 schema는 source가 아니다.
- 기본값은 위 표준을 재사용한다: 에러 RFC 9457, idempotency 클라이언트 key,
  pagination cursor. 레포에 기존 API 관례가 있으면 그것이 우선한다.
- `Then`에 없는 response 필드를 발명하지 않는다. 카드가 요구하는 관찰 결과만
  담는다.
- 서버를 다른 팀이 소유하면 승인은 "이 draft로 서버팀과 합의한다"는 확인이며
  journal에 기록한다.

## Exported Public API 계약 — 조건부

shared/package export를 새로 만들거나 바꿀 때만 다음을 architecture 문서와
Implementation Decision에 기록한다.

- 실제 consumer와 함께 바뀌는 이유. 구체 사용 사례가 하나뿐이면 먼저 local API로 둔다.
- 이 API가 해결하는 한 가지 문제와 non-goals. 기능 요청은 package 범위인지
  application 범위인지 triage해 기록한다.
- platform API와 이미 설치된 dependency로 해결할 수 없는 이유
- 입력·출력·오류 타입, 호환성 범위, breaking 여부와 migration
- 대상 레포가 이미 제공하는 runtime·type test, build/pack/export 검사와 changeset
- 실패 시 rollback. 앱 내부 local 구현에는 이 gate와 release 절차를 적용하지 않는다.

공용 API를 위해 새 검사 도구가 필요하면 자동 설치하지 않고 비용과 대안을 사용자에게
제시한다. speculative consumer, option flag 또는 미래 교체 가능성만으로 public surface를
늘리지 않는다.

## Hook Encapsulation 계약 — 조건부

Page/UI component를 orchestration-free 경계로 만들기로 사용자가 승인한 경우에만
정책을 `orchestration-only`로 기록한다. component LOC, effect 수 또는 reviewer 취향으로
이 정책을 추론하지 않는다. 승인 문서에는 다음 값을 exact value로 남긴다.

| policy               | target glob              | rule ID             | allow                 | block                 | lint command        | config source                |
| -------------------- | ------------------------ | ------------------- | --------------------- | --------------------- | ------------------- | ---------------------------- |
| `orchestration-only` | 적용할 Page/UI 파일 glob | 실제 ESLint rule ID | 직접 허용할 hook 이름 | 직접 금지할 hook 이름 | 실제 repo lint 명령 | config 경로와 실제 설치 버전 |

- 기존에 동등한 lint rule이 있으면 그것을 사용한다. 없을 때만
  `eslint-plugin-use-encapsulation`의 `use-encapsulation/prefer-custom-hooks` 도입을
  제안하며 dependency 설치와 config 변경도 architecture 승인 대상이다.
- `allow`와 `block`은 plugin default에 맡기지 않는다. target runtime의 React·router·
  query·form hook을 실제 설치 버전에서 확인해 명시한다.
- config source를 Oracle local source로 잠그고 `oracle-run.mjs init`의 필수 label에
  `hook-encapsulation`을 추가한다. GREEN과 review 뒤 고정한 lint command를 같은
  label로 실행한다.
- 이 계약은 금지된 직접 호출을 막는 구조 gate다. custom hook의 응집도나 동작 계약은
  테스트와 독립 review가 담당한다.

## 구현 판단

- component는 상태 소유권, async/error boundary, 접근성 책임, 독립 테스트 또는 재사용
  이유가 달라질 때만 분리한다. 파일 수나 LOC만으로 쪼개지 않는다.
- component에서 transport를 직접 만들지 않는다. 기존 api/service/client 경계가 있으면
  재사용하고, 없으면 변경 unit 문서가 승인한 가장 작은 data module을 만든다.
- query key/options, domain selector, DTO 변환의 위치는 기존 관례를 따른다. FSD라면
  slice의 api/model/ui 경계를 쓸 수 있지만, 그것이 범용 기본값은 아니다.
- 구현 순서는 `순수 함수 → render 파생 → event handler → framework/query API → effect`다.
  effect는 observer, timer, subscription, DOM 또는 외부 SDK 동기화처럼 외부 시스템과
  연결할 때만 쓴다. 각 effect의 대상·이유·cleanup을 architecture 문서에 기록한다.

## 검증

generic skill이 import graph, component 수, effect 수를 추측해 검사하지 않는다.
대상 레포에 이미 ESLint import-boundary 규칙, dependency-cruiser, Nx module boundary,
TypeScript project reference 또는 동등한 검증이 있으면 해당 명령을 실행한다.
greenfield 또는 검증 수단이 없는 FSD 레포면 steiger(공식 FSD linter)나 ESLint
boundary 규칙 도입을 사용자에게 제안하고, 승인되면 devDependency로 추가해 GREEN
게이트 검증 명령에 포함한다. 도입이 거절되거나 불가하면 승인된 architecture
문서와 production diff의 일치 여부를 독립 reviewer가 검토한다.

강한 승인 권한이 필요하면 `**/__docs__/architecture.md`와 Oracle lock path를
CODEOWNERS 및 CI human approval로 보호한다. Oracle source lock은 drift 검출 장치이며
같은 actor가 문서와 lock을 함께 쓸 수 있는 로컬 환경의 권한 증명은 아니다.
