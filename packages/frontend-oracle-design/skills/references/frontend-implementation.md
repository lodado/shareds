# Frontend 구현 결정 가이드

## 목적과 권위

Oracle Card의 관찰 가능한 계약을 React·Next.js·TanStack Query 코드로 옮길 때만
사용한다. 이 문서는 제품 정책을 만들지 않는다. 구현 결과를 바꾸는 선택이 미결이면
`NEEDS_DECISION`으로 돌아간다.

구현 전에 대상 package의 `package.json`, router 구조, framework config와 레포의
`AGENTS.md`·`CLAUDE.md`·필수 아키텍처 문서를 읽는다. 권위는 다음 순서다.

1. 보안·개인정보·법적·접근성·데이터 정합성의 강제 제약
2. 승인된 Oracle Card와 기획·디자인·API 계약
3. 대상 레포의 아키텍처·테스트·호환성 규칙
4. **실제 설치 버전**의 React·Next.js·TanStack Query 공식 문서
5. Vercel Engineering 같은 framework maintainer의 적용 가능한 휴리스틱
6. 커뮤니티 전문가의 반례와 보완 의견

하위 출처가 상위 출처를 덮어쓰지 않는다. 예를 들어 bundle guide가 barrel import를
피하라고 해도 레포가 FSD slice의 Public API import를 요구하면 레포 규칙을 따른다.
가용한 `vercel-react-best-practices` reference/skill이 있으면 관련 규칙만 읽고, 이
결정 순서를 그대로 적용한다.

카드에 Design Intent가 있으면 production 수정 전에 [`visual-design.md`](visual-design.md)를
전부 읽고 `D*` 행을 Implementation Decision에 함께 기록한다. 디자인 skill이나
implementation 편의로 승인된 시각 결과를 바꾸지 않는다.
`local`·`identity-shaping`인데 Design Change Confirmation의 사용자 답변 위치가
카드에 없으면 production을 수정하지 말고 `NEEDS_DECISION`으로 돌아간다.

React production 변경이면 [`architecture-contract.md`](architecture-contract.md)를
전부 읽는다. 영향받는 architecture unit의 기존 문서와 import 관례를 먼저 조사하고,
명시적 문서 승인과 Oracle source lock 없이 테스트나 production을 작성하지 않는다.
FSD는 기존 구조가 FSD이거나 greenfield 제안이 승인된 때만 사용한다.

## 변경 용이성 reference

React production 변경이면 [`changeability.md`](changeability.md)를 전부 읽고, 이번
변경에 material한 품질 축과 trade-off만 Implementation Decision에 기록한다. 이
reference는 기술적으로 동등한 구현을 고르는 휴리스틱이며 제품 정책이 아니다. 승인된
Oracle, 대상 레포 계약과 실제 설치 버전이 항상 우선한다.

상태 소유권, Server/Client, async, Hook과 effect의 구체 구현은 아래 절을 적용한다.
변경 비용을 비교하거나 숨은 부작용·공통화·public surface·새 abstraction을 판단할
때는 같은 정의를 복제하지 말고 `changeability.md`를 기준으로 삼는다.

## TypeScript 계약 — material할 때만

- trust boundary와 public API의 입력·성공 결과·실패 형태를 정확히 표현한다. 내부에서
  충분히 추론되는 타입을 반복하지 않는다.
- 카드에 async·순서 역전·중복 제출·retry·다단계 상태 행이 있으면
  [`type-constraints.md`](type-constraints.md)를 전부 읽고 상태 설계 사다리와
  discriminated union 계약을 따른다. 카드 `O*` 행에서 상태·이벤트를 도출하며, 카드에
  없는 전이는 발명하지 않는다. 단순 toggle·독립 boolean 하나는 state machine으로
  바꾸지 않는다.
- `any`, 광범위한 assertion, 의미 없는 optional로 카드의 오류·상태 계약을 숨기지 않는다.
- exported shared/package API가 바뀔 때만 소비자 추론과 오류 형태를 type test로 검증한다.
  로컬 구현 하나를 위해 interface·factory·adapter를 추가하지 않는다.

## 1. 상태 소유권부터 정한다

| 종류                                        | 기본 소유자                                            | 금지할 중복                                |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| API·DB의 원본과 freshness                   | Server Component 혹은 TanStack Query cache후 hydration | query 결과를 `useState`·전역 store에 복사  |
| 공유·북마크·뒤로가기가 필요한 필터          | URL `searchParams`·router                              | URL과 local state의 양방향 effect 동기화   |
| 입력 중인 form draft                        | 가장 가까운 form/feature                               | 저장 전 draft를 server cache 원본으로 취급 |
| modal·selection·hover 같은 일시 UI          | 가장 가까운 component/hook                             | 이유 없는 global store 승격                |
| 현재 props/state로 계산 가능한 값           | render 중 파생(useMemo등)                              | effect로 계산값을 다시 state에 저장        |
| 먼 하위 트리가 실제로 공유하는 client state | 가장 가까운 공통 provider/store                        | 앱 전체 provider를 기본값으로 사용         |

서버 원본을 편집용 draft로 복사해야 하면 `초기화 시점`, `저장`, `취소`, `원격 갱신과 충돌` 정책이 Oracle에 있어야 한다. 단일 source of truth를 유지하고, query 변환은
가능하면 query `select` 또는 render 중 파생으로 처리한다.

## 2. 실행 위치를 고른다

1. 초기 route render에서 서버가 안전하게 읽을 수 있고 브라우저에서 지속 동기화할
   필요가 없으면 Server Component에서 읽는다.
2. event handler, browser API, local interaction state가 필요한 가장 작은 leaf만 Client
   Component로 만든다. `'use client'` 경계를 편의상 layout/page 전체로 올리지 않는다.
3. 클라이언트가 같은 원격 데이터를 재사용·refetch·polling·optimistic update해야
   하면 TanStack Query를 검토한다. 단순 fetch 한 번 때문에 추가하지 않는다.
4. RSC→Client 경계에는 client가 실제 쓰는 serializable field만 전달한다.
5. 같은 원격 데이터에 Next cache와 Query cache를 함께 쓰면 hydration·staleness·
   nvalidation 소유자를 명시한다. 소유권이 불명확하면 캐시를 하나 줄인다.
6. server prefetch를 client query에 넘겨야 할 때만 대상 버전의 `dehydrate`·
   `HydrationBoundary` 패턴을 쓰고, server `QueryClient`를 요청 간 공유하지 않는다.

독립 요청은 가능한 빨리 시작해 함께 await하고, 실제 dependency가 있는 요청만
직렬화한다. 전체 shell을 막지 말고 느린 부분 가까이에 Suspense boundary를 둔다.

## 3. loading·error 경계를 상태별로 정한다

| 상황                                      | 기본 선택                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| route/server 초기 조회                    | `loading.tsx` 또는 국소 `<Suspense>`, route `error.tsx`                             |
| 무조건 실행되는 client query의 첫 조회    | `useSuspenseQuery` + 국소 Suspense + Error Boundary                                 |
| 조건부 query·placeholder·세밀한 취소 제어 | 일반 `useQuery`를 허용하고 명시적 상태 UI                                           |
| cache가 있는 background refetch           | 기존 content 유지 여부와 작은 progress/error UI를 Oracle대로 구현                   |
| mutation                                  | `useMutation().isPending`과 명시적 오류 UI/`throwOnError`; Suspense로 처리하지 않음 |

- fallback은 기다리는 subtree만 대체하고 레이아웃 크기를 가능한 유지한다.
- 첫 조회가 무조건 실행되고 `enabled`·placeholder·취소 제약이 없으면 client query는
  `useSuspenseQuery`를 기본으로 한다. polling이나 background refetch가 있다는 이유만으로
  일반 `useQuery`로 내리지 않는다. Suspense는 data가 없는 첫 read를, query의
  `isFetching`·`error`는 cached content가 있는 후속 동기화를 표현할 수 있다.
- query retry는 `QueryErrorResetBoundary`와 Error Boundary를 함께 reset하되, 전체 cache를
  무차별 reset하지 말고 실패한 query/boundary 범위로 제한한다.
- TanStack Query가 cached data가 있는 refetch error를 항상 boundary로 throw한다고
  가정하지 않는다. stale content 유지·오류 노출 정책을 카드에서 확인한다.
- `useSuspenseQuery`에 `enabled`·`placeholderData`가 있다고 가정하지 않으며, 취소가
  제품 계약이면 대상 버전의 제한을 확인하고 일반 query 등 더 맞는 수단을 택한다.
- query key는 dependency처럼 다룬다. `queryFn` 결과에 영향을 주는 입력을 모두
  serializable key에 포함하고, effect에서 수동 `refetch`로 입력 변화를 맞추지 않는다.
- 취소가 계약이면 `queryFn`이 제공된 `AbortSignal`을 실제 요청에 전달하는지 확인하고,
  응답 순서 역전에서도 최신 입력 결과만 남는지 결정론적으로 검증한다.
- mutation pending은 duplicate submit 차단과 실제 요청 총 횟수를 각각 검증한다.

## 4. Architecture unit과 코드 경계를 지킨다

- 기존 레포 architecture가 일관되면 보존하고 FSD migration을 끼워 넣지 않는다.
- greenfield 또는 승인된 FSD에서는 [`fsd.md`](fsd.md)를 전부 읽고 layer 방향,
  segment 규칙, slice public API 계약을 지킨다. 사용하지 않는 layer·segment는
  만들지 않는다.
- FSD가 아니면 기존 레포의 architecture 문서와 import 관례를 그대로 적용한다.
  AI가 구현 중 새 profile이나 migration을 발명하지 않는다.
- component는 상태 소유권, async/error boundary, 접근성 책임, 독립 테스트 또는 재사용
  이유가 달라질 때 분리한다. 기본값은 파일당 exported component 하나지만 작은 private
  JSX helper는 허용한다. LOC만으로 쪼개거나 prop 전달 wrapper를 만들지 않는다.
- component에서 직접 network call을 만들지 않는다. transport·DTO adapter는 승인된
  api/network 경계, query key/options·domain selector는 model 경계가 소유한다.
- client와 server public API를 분리해 server-only 코드가 client graph로 새지 않게 한다.

## 5. 선언적 UI와 micro-hook 경계를 정한다

컴포넌트는 현재 상태에 대응하는 UI와 사용자 intent를 선언하고, DOM을 명령식으로
조작하지 않는다. 독립 boolean 여러 개로 불가능한 조합을 만들기보다 실제 UI 상태를
표현하는 최소 상태를 둔다. async·다단계 흐름의 상태 도출과 exhaustiveness 강제는
[`type-constraints.md`](type-constraints.md)를 따르고, 새 state-machine dependency는
필요가 입증될 때만 쓴다.

여기서 micro-hook은 **짧은 코드**가 아니라 **작은 소유권 경계**다.

UI와 비즈니스 로직은 다음 책임으로 나눈다.

| 소유자              | 맡는 것                                                                          | 맡지 않는 것                                                         |
| ------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| UI component        | semantic JSX, 접근성, 시각 상태 표현, view-local interaction, 사용자 intent 전달 | domain 판정, DTO 변환, query/cache, navigation·storage·observer 조율 |
| micro-hook          | 하나의 interaction workflow 또는 하나의 외부 시스템과 React lifecycle 연결       | JSX·class·token·문구, unrelated workflow 묶음                        |
| pure model function | 필터·그룹·정렬·검증·상태 전이 같은 React 비의존 비즈니스 규칙                    | hook lifecycle과 화면 표현                                           |

Page는 필요한 micro-hook을 조합하고 render-ready 값과 intent 이름의 action으로 UI를
그린다. event handler에 domain 분기나 둘 이상의 부작용 순서가 생기면 hook이 workflow를
소유하고, React가 필요 없는 계산은 hook으로 감싸지 말고 pure model function에 둔다.

- 하나의 interaction workflow 또는 외부 시스템 동기화를 소유하면 hook으로 분리한다.
- query key/options와 remote operation은 해당 server-state 경계에 둔다.
- view는 렌더링과 접근 가능한 interaction 표현에 집중하고 data/action을 받는다.
- 순수 계산은 함수 또는 render 중 표현으로 남긴다. `useMemo`는 순수성 도구가 아니라
  실제 비용이 있는 계산 최적화일 때만 쓴다.
- 한 번만 쓰는 한 줄 `useState`, 단순 rename, JSX 조각 때문에 hook/file을 만들지 않는다.
- unrelated query·form·modal 상태를 하나의 큰 hook 반환 객체로 합치지 않는다.
- 구현 선택 순서는 `순수 함수 → render 파생 → event handler → framework/query API →
effect`다.
- effect는 architecture 문서에 외부 시스템·이유·cleanup을 기록한 동기화에만 쓰고, prop/state 파생,
  event 처리, query key 대신 수동 refetch, URL↔local state 양방향 동기화에 쓰지 않는다.
- 각 effect에는 external system·reason·cleanup이 있어야 한다.

### Hook Encapsulation Gate — 승인된 경우만

architecture 문서가 `orchestration-only`를 명시적으로 선택했을 때만 Page/UI target
glob에 결정적 lint gate를 적용한다. LOC나 effect 개수로 자동 선택하지 않는다.

1. 레포에 같은 경계를 강제하는 ESLint 규칙이 있으면 그대로 재사용한다.
2. 동등 규칙이 없을 때만 `eslint-plugin-use-encapsulation`의
   `use-encapsulation/prefer-custom-hooks` 도입을 제안한다. 설치와 config 변경은 사용자
   승인 뒤 architecture source에 기록·잠그며 조용히 추가하지 않는다.
3. 실제 설치 버전과 함께 target glob, rule ID, `allow`, `block`, lint command, config
   source를 고정한다. render-local primitive는 승인된 `allow`에, lifecycle·navigation·
   query·form 같은 외부 orchestration hook은 승인된 `block`에 **이름을 명시한다**.
   plugin 기본 목록이나 최신 React/Next hook 자동 인식을 가정하지 않는다.
4. 고정한 lint command를 `oracle-run.mjs exec --label hook-encapsulation`으로 실행하고
   GREEN과 독립 review 뒤 모두 같은 필수 label로 재실행한다.

이 gate가 증명하는 것은 대상 component에 금지된 hook의 **직접 호출이 없다**는
구조뿐이다. 추출된 hook의 책임 응집도나 동작 정확성을 증명하지 않으므로 trivial
wrapper, UI 표현을 숨긴 hook, unrelated 책임을 합친 거대 hook은 테스트와 독립
reviewer가 별도로 판정한다.

## 6. 승인된 Design Intent를 구현한다

`behavior-only`이면 기존 component·token·시각 결과를 보존한다. `local`·
`identity-shaping`이면 다음 순서를 따른다.

1. 대상 레포의 기존 component, semantic token, typography와 layout pattern을 먼저
   찾고 승인된 Design Intent에 맞는 것을 재사용한다.
2. 새 identity가 승인된 경우에만 새 color·font·signature를 도입한다. signature는
   한 곳에 집중하고 나머지 장식을 줄인다.
3. canonical action의 어휘를 action→pending→success·error에서 일관되게 유지하고,
   empty·error copy가 다음 행동을 설명하게 한다.
4. 실제 content와 긴 문자열에서 responsive reflow·reading order·overflow를 확인한다.
5. motion은 승인된 목적과 trigger만 구현하고 레포의 reduced-motion·property 제한을
   따른다. 접근성·성능을 aesthetic risk로 희생하지 않는다.
6. CSS selector specificity가 section·element 규칙을 상쇄하지 않는지 확인한다.

디자인을 테스트하기 위해 internal class·component tree를 public contract로 만들지
않는다. 승인된 `D*` 결과를 구현할 수 없거나 새로운 시각 선택이 필요하면 임의로
대체하지 말고 `NEEDS_DECISION`으로 돌아간다.

## 7. 최소 성능·품질 확인

적용 가능한 항목만 사용한다. 측정이나 구조적 근거 없이 `memo`, `useMemo`,
`useCallback`, global store, dynamic import를 일괄 추가하지 않는다.

- 독립 async 작업의 waterfall 제거
- RSC 경계 직렬화와 client bundle 최소화
- 무거운 선택 기능만 `next/dynamic` 등으로 지연
- static JSX와 provider를 필요한 범위에 배치
- interactive control은 semantic element·accessible name·키보드 동등성을 갖고, loading은
  `role="status"` 또는 `aria-live`, 오류는 `role="alert"` 등 레포 계약에 맞게 전달
- retry 후 focus와 이전 입력 유지 여부를 Oracle대로 복구하고 dialog·popover는 필요한
  Escape·tab order·trigger focus 복귀를 검증
- 320px·양 theme·reduced motion 등 대상 레포의 필수 UI 검증 수행
- 승인된 모든 architecture 문서가 Oracle source lock과 일치하고, 레포에 이미 존재하는
  구조 검증 명령이 있으면 통과

성능 요구나 성능 개선 주장이 있을 때만 같은 환경의 `metric·budget`, baseline run,
after run과 차이를 기록한다. 기존 benchmark·bundle script를 우선하고 해당 명령을
`oracle-run.mjs init --required-label performance`와 ledger run으로 고정한다. 비교 가능한
환경이 없으면 “개선됨”을 주장하지 않는다. 성능 요구가 없는 일반 변경에는 benchmark나
새 측정 dependency를 추가하지 않고 N/A 사유만 남긴다.

## Source Registry

아래 자료는 구현 근거다. 제품 정책은 반드시 Oracle의 승인된 출처에서 가져온다.
링크 내용과 실제 설치 버전이 다르면 설치 버전 문서를 우선한다.

| 관할                              | 자료                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React state/effect/hook/Suspense  | [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks), [Suspense](https://react.dev/reference/react/Suspense) |
| Next server/client/stream/error   | [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error)                                                       |
| TanStack Query Suspense/reset/SSR | [Suspense](https://tanstack.com/query/latest/docs/framework/react/guides/suspense), [QueryErrorResetBoundary](https://tanstack.com/query/latest/docs/framework/react/reference/QueryErrorResetBoundary), [Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)                            |
| Vercel performance heuristics     | [React Best Practices](https://vercel.com/blog/introducing-react-best-practices), [Dashboard frontend optimization](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)                                                                                                                                    |
| Community cross-check             | [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query), [Kent C. Dodds: State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)                                                                                                                                 |
| Changeability 구현·review         | [`changeability.md`](changeability.md)의 canonical 정의·React 예시·trade-off·Decision evidence·review 기준. 외부 근거와 고정 revision도 그 reference가 소유한다.                                                                                                                                                               |
