# Frontend 구현 결정 — 상태 소유권·실행 위치·loading 경계

## 목적과 권위

Oracle Card의 관찰 가능한 계약을 React·Next.js·TanStack Query 코드로 옮길 때만
사용한다. 제품 정책을 만들지 않으며, 구현 결과를 바꾸는 선택이 미결이면
`NEEDS_DECISION`으로 복귀.

구현 전에 대상 package의 `package.json`, router 구조, framework config, 레포의
`AGENTS.md`·`CLAUDE.md`·필수 아키텍처 문서를 읽는다. 권위 순서는
[`common.md`](../common.md)의 공통 우선순위가 canonical이며, 이 문서 관할의 하위 출처만
추가한다:

- **실제 설치 버전**의 React·Next.js·TanStack Query 공식 문서
- Vercel Engineering 같은 framework maintainer의 적용 가능한 휴리스틱
- 커뮤니티 전문가의 반례와 보완 의견

하위 출처가 상위 출처를 덮어쓰지 않는다. 예: bundle guide가 barrel import를 피하라
해도 레포가 FSD slice public API import를 요구하면 레포 규칙을 따른다. 가용한
`vercel-react-best-practices` reference/skill은 관련 규칙만 읽고 이 결정 순서를 적용.

카드에 Design Intent가 있으면 production 수정 전 [`visual-design.md`](../visual-design.md)
전부 읽고 `D*` 행을 Implementation Decision에 기록한다. 디자인 skill이나 구현 편의로
승인된 시각 결과를 바꾸지 않는다. `local`·`identity-shaping`인데 Design Change
Confirmation 답변 위치가 카드에 없으면 production 수정 금지, `NEEDS_DECISION`.

React production 변경이면 [`architecture-contract.md`](../architecture-contract.md) 전부
읽는다. 영향 unit의 기존 문서·import 관례를 먼저 조사하고, 명시적 문서 승인과 Oracle
source lock 없이 테스트·production을 작성하지 않는다. FSD는 기존 구조가 FSD이거나
greenfield 제안이 승인된 때만.

React production 변경이면 [`changeability.md`](../changeability.md)도 전부 읽고, 이번
변경에 material한 품질 축과 trade-off만 Implementation Decision에 기록한다. 변경 비용·
숨은 부작용·공통화·public surface·새 abstraction 판단은 같은 정의를 복제하지 말고 그
문서를 기준으로 삼는다.

코드 작성 경계(component 분리·micro-hook·effect)는
[`frontend/authoring.md`](authoring.md), Design Intent 구현·성능·품질 게이트와 Source
Registry는 [`frontend/quality.md`](quality.md)가 소유한다.

## TypeScript 계약 — material할 때만

- trust boundary와 public API의 입력·성공·실패 형태를 정확히 표현한다. 내부에서 충분히
  추론되는 타입은 반복하지 않는다.
- 카드에 async·순서 역전·중복 제출·retry·다단계 상태 행이 있거나 client state·
  exported Props·shared/package API·trust boundary 타입 형태를 만들거나 바꾸면
  [`types/state-ladder.md`](../types/state-ladder.md)를 전부 읽는다. 상태·이벤트는 카드 `O*`
  행에서 도출, 상태 설계 사다리와 discriminated union 계약을 따르고 카드에 없는 전이는
  발명하지 않는다. 단순 toggle·독립 boolean 하나는 state machine으로 바꾸지 않는다.
- `any`, 광범위한 assertion, 의미 없는 optional로 카드의 오류·상태 계약을 숨기지 않는다.
- exported shared/package API가 바뀔 때만 소비자 추론·오류 형태를 type test로 검증.
  로컬 구현 하나를 위해 interface·factory·adapter를 추가하지 않는다.

## 1. 상태 소유권부터 정한다

각 항목은 `종류 → 기본 소유자. 금지: 중복 형태`다.

- API·DB의 원본과 freshness → Server Component 혹은 TanStack Query cache후 hydration. 금지: query 결과를 `useState`·전역 store에 복사
- 공유·북마크·뒤로가기가 필요한 필터 → URL `searchParams`·router. 금지: URL과 local state의 양방향 effect 동기화
- 입력 중인 form draft → 가장 가까운 form/feature. 금지: 저장 전 draft를 server cache 원본으로 취급
- modal·selection·hover 같은 일시 UI → 가장 가까운 component/hook. 금지: 이유 없는 global store 승격
- 현재 props/state로 계산 가능한 값 → render 중 파생(useMemo등). 금지: effect로 계산값을 다시 state에 저장
- 먼 하위 트리가 실제로 공유하는 client state → 가장 가까운 공통 provider/store. 금지: 앱 전체 provider를 기본값으로 사용

서버 원본을 편집용 draft로 복사하려면 `초기화 시점`, `저장`, `취소`, `원격 갱신과
충돌` 정책이 Oracle에 있어야 한다. 단일 source of truth 유지, query 변환은 가능하면
query `select` 또는 render 중 파생으로.

서버 상태에는 레포에 이미 있는 query API·router state·form state를 먼저 쓴다. 같은
데이터를 `useState`+`useEffect`+`useRef`로 직접 관리하면 freshness·중복 요청·취소를
전부 재구현하게 된다 — 기존 경계에 없는 데이터일 때만 직접 관리하고 사유를
Implementation Decision에 적는다. 직접 관리해도 상태 값에는 데이터만 담고 `retry`
같은 함수는 넣지 않는다 — [`types/state-ladder.md`](../types/state-ladder.md)의 「상태는
데이터, action은 형제」를 따른다.

## 2. 실행 위치를 고른다

1. 초기 route render에서 서버가 안전하게 읽을 수 있고 브라우저 지속 동기화가 없으면
   Server Component에서 읽는다.
2. event handler·browser API·local interaction state가 필요한 가장 작은 leaf만 Client
   Component. `'use client'` 경계를 편의상 layout/page 전체로 올리지 않는다.
3. 같은 원격 데이터의 재사용·refetch·polling·optimistic update가 필요할 때 TanStack
   Query 검토. 단순 fetch 한 번 때문에 추가하지 않는다.
4. RSC→Client 경계에는 client가 실제 쓰는 serializable field만 전달.
5. 같은 원격 데이터에 Next cache와 Query cache를 함께 쓰면 hydration·staleness·
   invalidation 소유자를 명시. 불명확하면 캐시를 하나 줄인다.
6. server prefetch를 client query에 넘길 때만 대상 버전의 `dehydrate`·
   `HydrationBoundary` 패턴, server `QueryClient`는 요청 간 공유 금지.

독립 요청은 빨리 시작해 함께 await, 실제 dependency가 있는 요청만 직렬화. 전체
shell을 막지 말고 느린 부분 가까이에 Suspense boundary.

## 3. loading·error 경계를 상태별로 정한다

- route/server 초기 조회 → `loading.tsx` 또는 국소 `<Suspense>`, route `error.tsx`
- 무조건 실행되는 client query의 첫 조회 → `useSuspenseQuery` + 국소 Suspense + Error Boundary
- 조건부 query·placeholder·세밀한 취소 제어 → 일반 `useQuery`를 허용하고 명시적 상태 UI
- cache가 있는 background refetch → 기존 content 유지 여부와 작은 progress/error UI를 Oracle대로 구현
- mutation → `useMutation().isPending`과 명시적 오류 UI/`throwOnError`; Suspense로 처리하지 않음

- fallback은 기다리는 subtree만 대체하고 레이아웃 크기를 가능한 유지.
- 첫 조회가 무조건 실행되고 `enabled`·placeholder·취소 제약이 없으면
  `useSuspenseQuery` 기본. polling·background refetch가 있다는 이유만으로 일반
  `useQuery`로 내리지 않는다. Suspense = data 없는 첫 read, query의
  `isFetching`·`error` = cached content가 있는 후속 동기화.
- **경계로 올릴 수 있는 분기를 컴포넌트 안에 남기지 않는다.** 표에서 Suspense가
  기본인데 컴포넌트 본문에 `status` 분기를 두면 리뷰 `FINDING`. 다른 행에 해당해
  분기가 필요하면 실격 사유를 Implementation Decision에 적는다.
- Suspense 아래 query 입력이 바뀌면 다시 data 없는 첫 read가 되어 fallback이 올라온다.
  카드가 기존 content 유지를 요구하면 입력 변경을 `startTransition`으로 감싸고 pending
  표시는 레이아웃을 흔들지 않는 수단으로.
- query retry는 `QueryErrorResetBoundary`와 Error Boundary를 함께 reset하되, 실패한
  query/boundary 범위로 제한. 전체 cache 무차별 reset 금지.
- cached data가 있는 refetch error가 항상 boundary로 throw된다고 가정하지 않는다.
  stale content 유지·오류 노출 정책은 카드에서 확인. 카드가 기존 content 유지를
  요구하면 `throwOnError`를 data 부재 조건으로 좁혀 boundary가 이미 로드된 화면을
  지우지 않게 한다.
- `useSuspenseQuery`에 `enabled`·`placeholderData`가 있다고 가정하지 않는다. 취소가
  제품 계약이면 대상 버전의 제한을 확인하고 일반 query 등 더 맞는 수단 선택.
- query key는 dependency처럼 다룬다. `queryFn` 결과에 영향 주는 입력을 모두
  serializable key에 포함, effect의 수동 `refetch`로 입력 변화를 맞추지 않는다.
- 취소가 계약이면 `queryFn`이 제공된 `AbortSignal`을 실제 요청에 전달하는지 확인하고
  응답 순서 역전에서도 최신 입력 결과만 남는지 결정론적으로 검증.
- **unmount·route 변경 뒤 도착한 응답으로 상태를 갱신하지 않는다.** query는
  라이브러리가 최신 호출 기준으로 처리하지만, 직접 만든 async 상태에도 같은 방어를
  적용한다: effect cleanup에서 `AbortController`로 요청을 끊거나 무효화 token으로 늦은
  응답을 버린다. 타입이 아니라 런타임 방어이므로 Implementation Decision에 기록.
- mutation pending은 duplicate submit 차단과 실제 요청 총 횟수를 각각 검증.
