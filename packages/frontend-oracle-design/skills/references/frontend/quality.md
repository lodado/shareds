# Frontend 품질 게이트 — Design Intent·성능·접근성

권위·정책 출처는 [`frontend/decisions.md`](decisions.md), 코드 작성 경계는
[`frontend/authoring.md`](authoring.md)가 소유한다. 이 문서는 GREEN·리뷰 전 확인
게이트와 Source Registry만 소유한다.

## 1. 승인된 Design Intent를 구현한다

`behavior-only`면 기존 component·token·시각 결과 보존. `local`·`identity-shaping`이면:

1. 대상 레포의 기존 component, semantic token, typography, layout pattern을 먼저 찾고
   승인된 Design Intent에 맞는 것을 재사용.
2. 새 identity가 승인된 경우에만 새 color·font·signature 도입. signature는 한 곳에
   집중하고 나머지 장식을 줄인다.
3. canonical action 어휘를 action→pending→success·error에서 일관 유지, empty·error
   copy가 다음 행동을 설명하게 한다.
4. 실제 content·긴 문자열에서 responsive reflow·reading order·overflow 확인.
5. motion은 승인된 목적·trigger만 구현하고 레포의 reduced-motion·property 제한을
   따른다. 접근성·성능을 aesthetic risk로 희생하지 않는다.
6. CSS selector specificity가 section·element 규칙을 상쇄하지 않는지 확인.

디자인 테스트를 위해 internal class·component tree를 public contract로 만들지 않는다.
승인된 `D*` 결과를 구현할 수 없거나 새 시각 선택이 필요하면 임의 대체하지 말고
`NEEDS_DECISION`.

## 2. 최소 성능·품질 확인

적용 가능한 항목만. 측정·구조적 근거 없이 `memo`, `useMemo`, `useCallback`, global
store, dynamic import를 일괄 추가하지 않는다.

- 독립 async 작업의 waterfall 제거
- RSC 경계 직렬화와 client bundle 최소화
- 무거운 선택 기능만 `next/dynamic` 등으로 지연
- static JSX와 provider를 필요한 범위에 배치
- interactive control은 semantic element·accessible name·키보드 동등성, loading은
  `role="status"` 또는 `aria-live`, 오류는 `role="alert"` 등 레포 계약에 맞게 전달
- retry 후 focus·이전 입력 유지를 Oracle대로 복구, dialog·popover는 Escape·tab order·
  trigger focus 복귀 검증
- 320px·양 theme·reduced motion 등 대상 레포의 필수 UI 검증
- 승인된 architecture 문서가 Oracle source lock과 일치, 레포 구조 검증 명령 통과

성능 요구·개선 주장이 있으면 먼저 [`performance.md`](../performance.md)를 전부 읽고
Initial-load·Runtime·Responsiveness 축 분류와 profiler 원인 확인을 마친다.
성능 요구·개선 주장이 있을 때만 같은 환경의 `metric·budget`, baseline run, after run과
차이를 기록한다. 기존 benchmark·bundle script를 우선하고 해당 명령을
`oracle-run.mjs init --required-label performance`와 ledger run으로 고정. 비교 가능한
환경이 없으면 "개선됨"을 주장하지 않는다. 성능 요구 없는 변경에는 benchmark나 새 측정
dependency 없이 N/A 사유만.

## Source Registry

아래는 구현 근거다. 제품 정책은 반드시 Oracle의 승인된 출처에서. 링크 내용과 실제
설치 버전이 다르면 설치 버전 문서 우선.

- React state/effect/hook/Suspense: [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks), [Suspense](https://react.dev/reference/react/Suspense)
- Next server/client/stream/error: [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- TanStack Query Suspense/reset/SSR: [Suspense](https://tanstack.com/query/latest/docs/framework/react/guides/suspense), [QueryErrorResetBoundary](https://tanstack.com/query/latest/docs/framework/react/reference/QueryErrorResetBoundary), [Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- Vercel performance heuristics: [React Best Practices](https://vercel.com/blog/introducing-react-best-practices), [Dashboard frontend optimization](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
- Community cross-check: [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query), [Kent C. Dodds: State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- Changeability 구현·review: [`changeability.md`](../changeability.md)의 canonical 정의·React 예시·trade-off·Decision evidence·review 기준. 외부 근거와 고정 revision도 그 reference가 소유한다.
