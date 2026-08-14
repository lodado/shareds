# Frontend Architecture Documentation Gate

React production을 새로 만들거나 구조를 바꿀 때, 영향받는 architecture unit의
구조 결정을 사용자 승인과 Oracle source lock으로 고정한다. 이 문서는 특정
architecture(FSD 포함)를 강제하지 않는다.

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

## Component boundaries

## Pure functions and effects

## Loading / Error / Retry

## Test boundaries

## Rejected alternatives

## Approval evidence
```

섹션은 해당할 때만 구체적으로 작성하고, 적용하지 않는 항목은 N/A 사유를 남긴다.
문서가 코드보다 커지는 template 채우기나 빈 layer·folder 생성을 금지한다.

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
TypeScript project reference 또는 동등한 검증이 있으면 해당 명령을 실행한다. 없으면
승인된 architecture 문서와 production diff의 일치 여부를 독립 reviewer가 검토한다.

강한 승인 권한이 필요하면 `**/__docs__/architecture.md`와 Oracle lock path를
CODEOWNERS 및 CI human approval로 보호한다. Oracle source lock은 drift 검출 장치이며
같은 actor가 문서와 lock을 함께 쓸 수 있는 로컬 환경의 권한 증명은 아니다.
