# 피드·타임라인 구현 가이드

**핵심 어려움**: 반응은 즉시 반영돼야 하는데 서버 확인은 나중에 온다. 그 사이 사용자는
같은 버튼을 여러 번 누르고, 목록에는 새 항목이 들어오고, 노출 로그가 중복으로 나간다.
낙관적 갱신을 잘못 만들면 화면과 서버가 조용히 어긋난 상태로 남는다.

> **Oracle 우선:** 이 문서는 `frontend-oracle-design`의 활성 카드 아래에서만 쓴다.
> `ORACLE_READY` 전에는 구현하지 않는다. 추천과 코드는 정책 출처가 아니다. 코드는 구현 선택지다.

## 1. 언제 읽는가

반응(좋아요·저장·팔로우)이나 미디어가 붙고, 보는 동안 새 항목이 생길 수 있는 소비용
목록. 페이지 이어 붙이기 자체는 `infinite-scroll.md`를 함께 읽는다.

반응·미디어·실시간 유입이 없는 단순 조회 목록에는 필요 없다.

## 2. 권장 구조

낙관적 갱신의 취소·snapshot·rollback·재검증 순서는 [S1]을 확인하고, 동시 mutation의 최신 의도를 별도로 보존한다.

**반응은 델타가 아니라 원하는 최종 상태를 보낸다.** `toggle` 요청은 멱등이 아니라서
재시도나 중복 전송이 그대로 상태 반전이 된다. `liked = true`를 보내면 몇 번 도착해도
결과가 같다. 이 한 줄이 연속 클릭 문제의 절반을 없앤다.

**낙관적 갱신은 스냅샷·복구·재검증 세 쌍으로 만든다.** 갱신만 하고 실패 복구를 빼면
화면은 좋아요, 서버는 아님인 상태가 남는다. 실패는 조용히 되돌리지 말고 사용자에게
보인다. 되돌아간 이유를 모르면 사용자는 다시 누른다.

**같은 항목의 동시 mutation에서는 최신 의도를 보존한다.** 먼저 보낸 요청의 실패가 나중
낙관적으로 반영한 값을 snapshot으로 덮으면 안 된다. 항목별로 요청을 직렬화하거나, intent
revision을 비교해 현재 의도와 같은 rollback만 허용한다.

**항목은 자기 상태만 구독한다.** 피드 전체가 하나의 상태를 보면 좋아요 한 번에 수백
항목이 다시 렌더된다.

**노출 로깅은 관찰과 체류 시간에 붙이고 항목 id로 중복을 막는다.** effect 실행 횟수로
세면 리렌더마다 로그가 나간다.

**새 항목은 스크롤을 흔들지 않는 방식으로 넣는다.** 읽던 위치가 밀리는 건 기능이 아니라
버그로 체감된다.

## 3. 구현

반응 갱신. 최종 상태 전송 + 스냅샷 복구 + 재검증.

```ts
// <slice>/model/useToggleLike.ts
export function useToggleLike(postId: string) {
  const queryClient = useQueryClient()
  const key = ['post', postId] as const
  const latestIntent = useRef(0)

  return useMutation({
    // 델타가 아니라 최종 상태. 재시도가 멱등이 된다.
    mutationFn: (liked: boolean) => setPostLike(postId, liked),
    onMutate: async (liked) => {
      const intent = ++latestIntent.current
      // 진행 중 조회가 낙관적 값을 덮어쓰지 않게 먼저 취소한다.
      await queryClient.cancelQueries({ queryKey: key })
      if (intent !== latestIntent.current) return { intent }
      const snapshot = queryClient.getQueryData<Post>(key)
      queryClient.setQueryData<Post>(key, (post) => (post ? { ...post, liked } : post))
      return { intent, snapshot }
    },
    onError: (_error, _liked, context) => {
      // 오래된 실패가 나중에 반영한 최신 의도를 되돌리면 안 된다.
      if (context?.intent !== latestIntent.current) return
      queryClient.setQueryData(key, context?.snapshot)
      showToast('좋아요를 반영하지 못했어요')
    },
    onSettled: (_data, _error, _liked, context) => {
      if (context?.intent === latestIntent.current) return queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
```

카운트를 로컬에서 증감하면 탭·기기 사이에서 값이 갈라진다. 서버 값만 쓰거나, 증감하되
`onSettled` 재검증으로 수렴시킨다.

노출 로깅. 항목 id 집합으로 중복을 막고 체류 시간을 조건에 넣는다.

```ts
// <slice>/model/useImpressionLog.ts
export function useImpressionLog(postId: string, { dwellMs = 1000, ratio = 0.5 } = {}) {
  const targetRef = useRef<HTMLElement>(null)
  const sentRef = useRef(false)

  useEffect(() => {
    const target = targetRef.current
    if (!target || sentRef.current) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            sentRef.current = true
            logImpression(postId)
            observer.disconnect()
          }, dwellMs)
        } else {
          clearTimeout(timer)
        }
      },
      { threshold: ratio },
    )

    observer.observe(target)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [postId, dwellMs, ratio])

  return targetRef
}
```

새 항목 유입. 즉시 삽입 대신 알림으로 두고, 사용자가 누를 때 반영한다.

```tsx
// <slice>/ui/Feed.tsx
{
  pendingCount > 0 && (
    <button type="button" onClick={applyPending}>
      새 글 {pendingCount}개 보기
    </button>
  )
}
```

최상단에 있을 때만 자동 삽입하는 정책이면 스크롤 위치를 조건으로 쓴다. 중간에서 보고
있을 때 삽입하려면 삽입 높이만큼 스크롤을 보정해야 하는데, 이 보정 책임을 정하지 않고
구현하면 화면이 튄다.

## 4. 판단이 갈리는 지점

| 선택            | 추천안 (정책 아님)         | 다른 선택이 맞는 때                            |
| --------------- | -------------------------- | ---------------------------------------------- |
| 반응 카운트     | 서버 값만 신뢰             | 즉각 반응감이 중요하면 로컬 증감 + 재검증 수렴 |
| 새 항목 유입    | 배너 알림 후 사용자 동작   | 실시간 모니터링처럼 항상 최신이 중요하면 자동  |
| 항목 소멸       | 즉시 제거                  | 맥락 유지가 필요하면 `삭제된 글` 자리표시      |
| 순서 안정성     | 재진입 시 같은 순서 유지   | 랭킹 신선도가 제품 가치면 매번 재계산          |
| 비디오 자동재생 | 음소거 + 뷰포트 중앙에서만 | 데이터 절약이 중요한 사용자층이면 탭 후 재생   |
| 노출 재집계     | 항목당 1회                 | 재노출 자체가 지표면 조건을 명시해 재집계      |

## 5. 함정

| 증상                                | 원인                         | 교정                             |
| ----------------------------------- | ---------------------------- | -------------------------------- |
| 빠르게 누르면 좋아요가 반대로 남음  | 토글 델타 전송 + 순서 역전   | 최종 상태 전송으로 멱등화        |
| 실패했는데 사용자는 반영됐다고 믿음 | 조용한 원복                  | 스냅샷 복구 + 보이는 오류        |
| 낙관적 값이 곧바로 원복됨           | 진행 중 조회가 덮어씀        | `onMutate`에서 진행 중 조회 취소 |
| 좋아요 한 번에 피드 전체가 렌더     | 항목이 공통 상태를 구독      | 항목이 자기 상태만 구독하게 분리 |
| 노출 로그가 부풀려짐                | effect 실행 횟수로 집계      | 관찰 + 체류 시간 + id 중복 제거  |
| 스크롤이 위로 튐                    | 새 항목을 보정 없이 삽입     | 배너 후 삽입 또는 오프셋 보정    |
| 이미지 로드되며 목록이 밀림         | 크기 미지정                  | width/height로 자리 예약         |
| 탭마다 좋아요 수가 다름             | 로컬 증감만 하고 재검증 없음 | `onSettled` 재검증으로 수렴      |

## 6. 남길 검증

network 경계는 MSW handler로 세운다.

- **연속 토글**: 빠르게 N번 눌렀을 때 최종 상태와 요청 **총 횟수**가 의도와 맞는지
  확인한다.
- **낙관적 실패 롤백**: 실패 응답에서 이전 상태로 돌아가고 오류가 보이는지 확인한다.
- **최신 의도 보존**: 이전 요청의 실패가 최신 의도를 덮지 않는지 확인한다.
- **응답 순서 역전**: 토글 응답이 뒤바뀌어 도착해도 최종 상태가 마지막 의도와 같은지
  확인한다.
- **노출 로깅 중복**: 같은 항목을 지나갔다 되돌아와도 1회만 전송되는지 요청 횟수로
  확인한다.
- **새 항목 삽입**: 삽입 후에도 보고 있던 항목이 화면에서 같은 위치인지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                            | 경계        | FSD 위치                 |
| ------------------------------- | ----------- | ------------------------ |
| 피드 조회·반응 요청 함수        | transport   | `<slice>/api`            |
| 피드 cache key·낙관적 갱신 훅   | model       | `<slice>/model`          |
| 노출 로깅 훅                    | model       | `<slice>/model`          |
| 피드 목록·항목·미디어 component | view        | `<slice>/ui`             |
| 항목 병합·순서 정규화 함수      | pure helper | `<slice>/lib`            |
| MSW handler와 피드 fixture      | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.

## 8. 근거

| ID   | 등급 | 자료                                                                                                                    | 이 문서에서 지지하는 주장                                                         |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [S1] | 공식 | [TanStack Query — Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) | refetch 취소, snapshot, 오류 rollback, settled 후 invalidation의 순서를 확인한다. |
| [S2] | 공식 | [MDN — Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)           | 노출 관찰은 observer와 명시적 체류 조건으로 다룬다.                               |
