# 무한 스크롤·점진 목록 구현 가이드

**핵심 어려움**: 페이지 경계가 움직이는 데이터 위에 놓인다. 사용자가 2페이지를 보는
동안 1페이지 내용이 바뀌므로 중복·누락이 구조적으로 발생한다. 여기에 스크롤이라는
연속 신호가 트리거로 붙어서 중복 요청과 응답 순서 역전이 기본값으로 따라온다.

> **Oracle 우선:** 이 문서는 `frontend-oracle-design`의 활성 카드 아래에서만 쓴다.
> `ORACLE_READY` 전에는 구현하지 않는다. 추천과 코드는 정책 출처가 아니다. 코드는 구현 선택지다.

## 1. 언제 읽는가

무한 스크롤, `더 보기`, 커서 피드, 점진 로딩 테이블. 목록을 나눠 이어 붙이는 모든 UI.

번호 페이지네이션(1·2·3 이동)이나 한 번에 다 받는 목록에는 필요 없다.

## 2. 권장 구조

cursor·페이지 파라미터와 observer 동작은 실제 설치된 query 라이브러리와 브라우저 지원 범위를 [S1][S2]로 확인한다.

**서버가 cursor를 지원하면 cursor를 쓴다.** offset은 목록이 변하면 반드시 깨진다.
`LIMIT 20 OFFSET 20`을 요청하는 사이에 앞쪽에 항목 하나가 추가되면 20번째 항목이
2페이지에 다시 나오고, 삭제되면 21번째가 사라진다. 이건 튜닝으로 못 고치는 구조적
문제다. cursor는 "이 항목 다음부터"라는 안정된 기준점을 쓰므로 앞쪽 변동에 영향받지
않는다.

**페이지 배열의 소유자는 query cache다.** `useState`로 누적하면 캐시 무효화, 뒤로가기
복원, 항목 수정 반영을 전부 직접 만들어야 한다. `useInfiniteQuery`는 이걸 이미 갖고
있다.

**트리거는 목록 뒤 sentinel + `IntersectionObserver`다.** scroll 이벤트로
`scrollHeight - scrollTop < threshold`를 계산하는 방식은 스크롤마다 레이아웃을 읽어
성능이 나쁘고, 컨테이너가 바뀔 때마다 계산이 틀어진다.

**자동 로드에는 `더 보기` 버튼을 함께 둔다.** observer는 편의 기능이지 유일한 조작
수단이 아니다. 키보드·보조기술 사용자는 버튼으로 같은 다음 페이지 요청을 실행할 수 있어야
한다. [S3]

**가상화는 기본이 아니다.** DOM 항목이 수백 개로 늘어 실제 느려질 때 도입한다. 먼저
넣으면 키보드 탐색·포커스 유지·스크린 리더 항목 수를 전부 직접 관리해야 한다.

## 3. 구현

먼저 Oracle이 async/error boundary를 정한다. 첫 조회가 무조건 실행되고 취소가 제품
계약이 아니면 `useSuspenseInfiniteQuery`와 가까운 Suspense·Error Boundary를 쓰고,
재시도는 `QueryErrorResetBoundary`로 같은 query 범위만 reset한다. `enabled`,
placeholder 또는 실제 취소 계약이 있으면 Oracle 근거와 함께 일반 `useInfiniteQuery`와
명시적 초기 상태 UI를 쓴다. 아래는 기본 Suspense 경로다.

데이터 계층. cursor 기반이고 초기 pending/error는 가까운 boundary에 맡긴다.

```ts
// <slice>/model/useProductFeed.ts
export function useProductFeed(filters: ProductFilters) {
  return useSuspenseInfiniteQuery({
    queryKey: ['products', filters],
    queryFn: ({ pageParam }) => fetchProducts({ cursor: pageParam, filters }),
    initialPageParam: null as string | null,
    // nextCursor가 없을 때만 undefined를 돌려 종료를 알린다.
    // 빈 배열과 종료를 같은 것으로 다루면 마지막 페이지 뒤에 요청이 한 번 더 나간다.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}
```

트리거. `hasNextPage`가 없으면 관찰 자체를 하지 않고, 진행 중이면 호출하지 않는다.

```ts
// <slice>/ui/useLoadMoreOnVisible.ts
export function useLoadMoreOnVisible(query: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) fetchNextPage()
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return sentinelRef
}
```

`isFetchingNextPage`를 의존성에 넣어 진행 중에는 observer를 아예 떼는 게 핵심이다.
쿼리 라이브러리가 동시 호출을 합쳐 주더라도 그 동작에 기대지 말고 트리거 쪽에서
막는다. 설치된 버전이 실제로 어떻게 합치는지는 그 버전 문서로 확인한다.

화면. sentinel은 마지막 항목이 아니라 목록 뒤 전용 요소다.

```tsx
// <slice>/ui/ProductFeed.tsx
export function ProductFeed({ filters }: { filters: ProductFilters }) {
  const query = useProductFeed(filters)
  const sentinelRef = useLoadMoreOnVisible(query)
  const products = query.data.pages.flatMap((page) => page.items)

  return (
    <>
      <ul>
        {products.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </ul>
      {query.hasNextPage && (
        <>
          <div ref={sentinelRef} aria-hidden />
          <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            더 보기
          </button>
        </>
      )}
      {query.isFetchingNextPage && <FeedSpinner />}
      {query.isFetchNextPageError && <FeedRetry onRetry={() => query.fetchNextPage()} />}
    </>
  )
}
```

마지막 항목에 observer를 붙이면 가상화나 항목 삭제로 그 노드가 사라질 때 트리거가
같이 사라진다. 전용 sentinel은 그런 일이 없다.

## 4. 판단이 갈리는 지점

아래 추천안은 비교를 돕는 정책 후보일 뿐이다. 답이 결과를 바꾸므로 승인된 source나
사용자 답변 없이 적용하지 않는다.

| 선택            | 추천안 (정책 아님)                 | 다른 선택이 맞는 때                                            |
| --------------- | ---------------------------------- | -------------------------------------------------------------- |
| cursor / offset | cursor                             | 서버가 cursor를 지원하지 않거나, 목록이 사실상 고정된 아카이브 |
| 부분 실패       | 앞 페이지 유지 + 실패 지점 재시도  | 목록 전체 일관성이 제품 요구인 경우 전체 폐기                  |
| 스크롤 복원     | 상세로 갔다 돌아오는 흐름이면 구현 | 목록이 매번 새로 읽혀야 하면 생략                              |
| 가상화          | 도입하지 않음                      | 동시 DOM 항목이 수백 개를 넘고 실측으로 느릴 때                |
| 새 항목 유입    | 배너로 알리고 사용자 동작으로 삽입 | 항상 최신이 중요한 실시간 모니터링 화면이면 자동 삽입          |

## 5. 함정

| 증상                               | 원인                                    | 교정                                             |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------ |
| 끝에서 요청이 2~3개 동시에 나감    | pending 중 sentinel이 다시 교차         | 진행 중에는 observer를 떼고 요청 횟수로 검증     |
| 같은 항목이 두 번 보임             | offset + 목록 변동                      | cursor 전환. 불가하면 id 기준 중복 제거          |
| 마지막 페이지 뒤에 요청이 한 번 더 | 빈 배열을 종료로 판정하지 않음          | `getNextPageParam`이 `undefined`를 돌리게        |
| 가상화 후 키보드 탐색이 끊김       | 화면 밖 DOM 제거로 포커스 대상이 사라짐 | 포커스 항목을 유지하고 항목 수를 보조기술에 노출 |
| 뒤로가기 하면 목록이 처음으로      | 캐시가 폐기되고 스크롤이 복원되지 않음  | 캐시 보존 시간을 늘리고 복원 지점을 명시         |
| 스크롤이 위로 튐                   | 새 항목을 스크롤 보정 없이 위에 삽입    | 배너 후 삽입, 또는 삽입 시 오프셋 보정           |
| 필터를 바꿨는데 이전 목록이 남음   | 필터가 query key에 없음                 | 결과에 영향을 주는 입력을 전부 key에 포함        |

## 6. 남길 검증

network 경계는 MSW handler로 세운다. 아래 네 개는 이 기능에서 실제로 깨지는 지점이라
테스트로 남긴다.

- **중복 요청 차단**: sentinel을 연속 교차시켜도 같은 페이지 요청이 1회인지 요청
  **총 횟수**로 확인한다. 렌더 결과만 보면 통과해 버린다.
- **응답 순서 역전**: page 2 응답이 page 3보다 늦게 도착해도 목록 순서와 다음 커서가
  유지되는지 확인한다.
- **종료 판정**: 마지막 페이지 뒤에 추가 요청이 없는지 요청 횟수로 확인한다.
- **부분 실패 재시도**: 실패한 페이지만 다시 요청하고 앞 페이지가 유지되는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                            | 경계        | FSD 위치                 |
| ------------------------------- | ----------- | ------------------------ |
| 목록 요청 함수·DTO 변환         | transport   | `<slice>/api`            |
| query key·페이지 조회 options   | model       | `<slice>/model`          |
| 목록 component·sentinel 훅      | view        | `<slice>/ui`             |
| 페이지 병합·중복 제거 순수 함수 | pure helper | `<slice>/lib`            |
| MSW handler와 페이지 fixture    | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.

## 8. 근거

| ID   | 등급 | 자료                                                                                                                | 이 문서에서 지지하는 주장                                                 |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [S1] | 공식 | [TanStack Query — Infinite Queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) | `pageParam`·`getNextPageParam`·다음 페이지 상태는 설치 버전으로 확인한다. |
| [S2] | 공식 | [MDN — Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)       | viewport 교차 관찰은 scroll 이벤트 계산과 다른 브라우저 API다.            |
| [S3] | 표준 | [WCAG 2.2](https://www.w3.org/TR/WCAG22/)                                                                           | 자동 로드만 쓰지 않고 키보드로 실행 가능한 대안을 제공할지 검토한다.      |
