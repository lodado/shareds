# Frontend 코드 작성 — component 경계·micro-hook·effect

권위·정책 출처·사전 조사·상태 소유권·실행 위치·loading 경계는
[`frontend/decisions.md`](decisions.md)가 소유한다. 이 문서는 그 결정을 코드로 옮길
때의 작성 경계만 더한다. Design Intent 구현·성능·품질 게이트는
[`frontend/quality.md`](quality.md) 소유.

## 1. Architecture unit과 코드 경계를 지킨다

- 기존 레포 architecture가 일관되면 보존, FSD migration을 끼워 넣지 않는다.
- greenfield 또는 승인된 FSD에서는 [`fsd.md`](../fsd.md)를 전부 읽고 layer 방향·segment
  규칙·slice public API 계약을 지킨다. 사용하지 않는 layer·segment는 만들지 않는다.
- FSD가 아니면 기존 레포 architecture 문서·import 관례를 그대로 적용. 구현 중 새
  profile·migration 발명 금지.
- component는 상태 소유권, async/error boundary, 접근성 책임, 독립 테스트·재사용
  이유가 달라질 때 분리. 기본 파일당 exported component 하나, 작은 private JSX helper
  허용. LOC만으로 쪼개거나 prop 전달 wrapper 금지.
- component에서 직접 network call 금지. transport·DTO adapter는 승인된 api/network
  경계, query key/options·domain selector는 model 경계 소유.
- client·server public API를 분리해 server-only 코드가 client graph로 새지 않게 한다.

## 2. 선언적 UI와 micro-hook 경계를 정한다

컴포넌트는 현재 상태의 UI와 사용자 intent를 선언하고 DOM을 명령식으로 조작하지
않는다. 독립 boolean 여러 개로 불가능한 조합을 만들기보다 실제 UI 상태를 표현하는
최소 상태를 둔다. async·다단계 흐름의 상태 도출·exhaustiveness는
[`types/state-ladder.md`](../types/state-ladder.md)를 따르고, 새 state-machine dependency는
필요가 입증될 때만.

micro-hook은 **짧은 코드**가 아니라 **작은 소유권 경계**다. UI와 비즈니스 로직 책임:

- UI component는 semantic JSX, 접근성, 시각 상태 표현, view-local interaction, 사용자 intent 전달만 맡는다. domain 판정, DTO 변환, query/cache, navigation·storage·observer 조율은 맡지 않는다.
- micro-hook은 하나의 interaction workflow 또는 하나의 외부 시스템과 React lifecycle 연결만 맡는다. JSX·class·token·문구, unrelated workflow 묶음은 맡지 않는다.
- pure model function은 필터·그룹·정렬·검증·상태 전이 같은 React 비의존 비즈니스 규칙만 맡는다. hook lifecycle과 화면 표현은 맡지 않는다.

Page는 micro-hook을 조합해 render-ready 값과 intent action으로 UI를 그린다. event
handler에 domain 분기나 둘 이상의 부작용 순서가 생기면 hook이 workflow를 소유하고,
React가 필요 없는 계산은 pure model function에 둔다.

- 하나의 interaction workflow 또는 외부 시스템 동기화를 소유하면 hook으로 분리.
- hook은 **state와 action을 형제로 반환한다** (`{ state, retry }`). action을 상태 값에
  넣지 않고, 서버 상태면 새 action 대신 query의 `refetch`를 다시 노출. 할 수 없는
  일에 no-op action을 채우지 않는다.
- query key/options·remote operation은 해당 server-state 경계에.
- view는 렌더링·접근 가능한 interaction 표현에 집중하고 data/action을 받는다.
- 순수 계산은 함수 또는 render 중 표현. `useMemo`는 실제 비용이 있는 최적화일 때만.
- 한 번 쓰는 한 줄 `useState`, 단순 rename, JSX 조각 때문에 hook/file 금지.
- unrelated query·form·modal 상태를 하나의 큰 hook 반환 객체로 합치지 않는다.
- 구현 선택 순서: `순수 함수 → render 파생 → event handler → framework/query API →
effect`. effect는 이 사다리의 마지막 수단이다.
- **데이터 흐름은 렌더 안에서 읽혀야 한다.** 사용자 행동의 결과는 그 행동의 event
  handler에서 동기적으로 실행한다 — 상태 변화를 effect가 구독해 반응하는 순간
  원인과 결과가 렌더 사이클 사이로 숨고, 값이 어디서 바뀌는지 추적할 수 없게
  된다. `이벤트 → 순수 계산 → 상태 갱신 → render 파생` 한 방향으로 흐르게 한다.
- effect는 architecture 문서에 외부 시스템·이유·cleanup을 기록한 동기화에만
  (DOM 측정, 구독, non-React 위젯, analytics). prop/state 파생, event 처리,
  query key 대신 수동 refetch, URL↔local state 양방향 동기화 금지.
- **effect chain 금지.** setState가 다른 effect를 깨워 다시 setState하는 연쇄는
  같은 데이터가 여러 렌더에 걸쳐 갈라지는 것이다 — 순수 함수 하나로 합치거나
  event handler로 내린다. prop 변경에 따른 상태 리셋은 effect가 아니라 `key`로
  한다.

### Effect Lint Gate — 조건 맞을 때만

파생 state·effect chain·event 대체는 lint로 기계 판정할 수 있다. 절차는 Hook
Encapsulation Gate와 같다 — 레포의 기존 규칙 재사용이 먼저고, plugin 도입·설정
변경은 사용자 승인 뒤 architecture source에 기록하며 조용히 추가하지 않는다.

1. `@lodado/eslint-config/react`를 쓰는 레포는 이미 켜져 있다 —
   `react-hooks/set-state-in-effect`·`set-state-in-render`(effect 안 동기
   setState, 파생 state와 chain의 시작점)와
   `react-you-might-not-need-an-effect` strict
   (`no-derived-state`·`no-chain-state-updates`·`no-event-handler`·
   `no-adjust-state-on-prop-change` 등 전 규칙 error)가 위 금지 목록과 대응한다.
2. 그 외 레포는 `eslint-plugin-react-hooks` 6+(4.x는
   `rules-of-hooks`·`exhaustive-deps`뿐이라 잡지 못한다)와
   `eslint-plugin-react-you-might-not-need-an-effect` 도입을 제안한다. flat config는 같은
   plugin 이름에 하나의 인스턴스만 허용하므로, 직접 조합하는 레포는 공유 plugin
   참조를 한 곳에서만 정의한다.

lint는 effect의 **형태**만 잡는다. 남은 effect가 실제 외부 시스템 동기화인지,
사유·cleanup이 있는지는 reviewer가 판정한다.

### Hook Encapsulation Gate — 승인된 경우만

architecture 문서가 `orchestration-only`를 명시적으로 선택했을 때만 Page/UI target
glob에 결정적 lint gate를 적용한다. LOC나 effect 개수로 자동 선택하지 않는다.

1. 레포에 같은 경계를 강제하는 ESLint 규칙이 있으면 재사용.
2. 동등 규칙이 없을 때만 `eslint-plugin-use-encapsulation`의
   `use-encapsulation/prefer-custom-hooks` 도입 제안. 설치·config 변경은 사용자 승인
   뒤 architecture source에 기록·잠금, 조용히 추가 금지.
3. 실제 설치 버전과 함께 target glob, rule ID, `allow`, `block`, lint command, config
   source를 고정한다. render-local primitive는 승인된 `allow`에, lifecycle·navigation·
   query·form 같은 외부 orchestration hook은 승인된 `block`에 **이름을 명시**. plugin
   기본 목록이나 최신 React/Next hook 자동 인식을 가정하지 않는다.
4. 고정한 lint command를 `oracle-run.mjs exec --label hook-encapsulation`으로 실행하고
   GREEN·독립 review 뒤 같은 필수 label로 재실행.

이 gate는 금지된 hook의 **직접 호출이 없다**는 구조만 증명한다. 추출된 hook의 책임
응집도나 동작 정확성을 증명하지 않으므로 trivial wrapper, UI 표현을 숨긴 hook,
unrelated 책임을 합친 거대 hook은 테스트와 독립 reviewer가 별도 판정한다.
