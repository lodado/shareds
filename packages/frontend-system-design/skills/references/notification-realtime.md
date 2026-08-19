# 알림·실시간 배지 구현 가이드

**핵심 어려움**: 같은 숫자를 여러 탭과 여러 기기가 동시에 본다. 한쪽에서 읽으면 다른
쪽이 틀린 값을 보여주고, 주기 조회는 탭 수만큼 배로 늘어난다. 배지와 목록이 서로 다른
조회를 쓰면 두 값이 어긋난 채로 남는다.

> **Oracle 우선:** 이 문서는 `frontend-oracle-design`의 활성 카드 아래에서만 쓴다.
> `ORACLE_READY` 전에는 구현하지 않는다. 추천과 코드는 정책 출처가 아니다. 코드는 구현 선택지다.

## 1. 언제 읽는가

읽지 않은 개수 배지, 알림 목록, 서버가 밀어주는 상태 갱신. 여러 탭·기기에서 같은 값을
보게 되는 표면.

사용자 동작 직후에만 뜨는 토스트나 화면 안에서만 유효한 검증 메시지에는 필요 없다.
양방향 대화는 `chat.md`를 본다.

## 2. 권장 구조

탭 가시성·탭 간 메시지·권한 요청은 [S1][S2][S3]의 브라우저 lifecycle과 지원 범위를 확인한다.

**배지와 목록이 같은 원본을 읽는다.** 배지용 개수 조회와 목록 조회를 따로 두면 읽음
처리 후 한쪽만 갱신되어 값이 어긋난다. 개수를 목록에서 파생하거나, 개수 조회 하나를
두고 목록이 그것을 무효화하게 만든다.

**화면이 보이지 않으면 주기 조회를 멈춘다.** 탭 10개를 열어 둔 사용자가 있으면 요청도
10배다. `document.visibilityState`로 멈추고 복귀 시 1회 재조회한다.

**로컬 증감은 기본이 아니다.** 개수를 클라이언트에서 줄이면 즉각적이지만 다른 탭·기기와
갈라진다. 증감하려면 반드시 서버 재검증으로 수렴시킨다.

**탭 간 동기화가 필요하면 `BroadcastChannel`을 쓴다.** 같은 출처의 탭들이 읽음 이벤트를
주고받게 하면 각 탭이 서버를 다시 찌르지 않아도 배지가 맞는다. 같은 출처의 탭
사이에서만 동작하므로 기기 간 동기화는 서버가 해야 한다.

**알림 권한은 첫 진입에 요청하지 않는다.** 거부는 되돌리기 어렵고, 브라우저는 반복 요청을
차단한다. 사용자가 알림을 원한다는 의도를 보인 시점에 요청한다.

## 3. 구현

가시성에 묶인 주기 조회.

```ts
// <slice>/model/useUnreadCount.ts
export function useUnreadCount({ intervalMs = 30_000 } = {}) {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: ({ signal }) => fetchUnreadCount({ signal }),
    // 숨겨진 탭에서는 조회하지 않고, 복귀 시 다시 켜지면서 1회 조회한다.
    refetchInterval: visible ? intervalMs : false,
    refetchOnWindowFocus: true,
  })
}
```

읽음 처리. 낙관적으로 줄이고 서버 값으로 수렴시킨다.

```ts
// <slice>/model/useMarkRead.ts
export function useMarkRead() {
  const queryClient = useQueryClient()
  const countKey = ['notifications', 'unread-count'] as const

  return useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: countKey })
      const snapshot = queryClient.getQueryData<number>(countKey)
      queryClient.setQueryData<number>(countKey, (count = 0) => Math.max(0, count - ids.length))
      // 다른 탭에도 알린다. 각 탭이 서버를 다시 찌르지 않게 한다.
      readChannel.postMessage({ type: 'read', ids })
      return { snapshot }
    },
    onError: (_error, _ids, context) => {
      queryClient.setQueryData(countKey, context?.snapshot)
      showToast('읽음 처리를 반영하지 못했어요')
    },
    // 로컬 증감의 오차를 서버 값으로 수렴시킨다.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
```

탭 간 동기화.

```ts
// <slice>/model/readChannel.ts
export const readChannel = new BroadcastChannel('notifications:read')

// 구독 쪽
readChannel.onmessage = (event) => {
  if (event.data.type === 'read') {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }
}
```

권한 요청은 사용자 동작 안에서만 한다.

```ts
async function enablePushFromUserAction() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') showInAppFallbackNotice()
}
```

## 4. 판단이 갈리는 지점

| 선택         | 추천안 (정책 아님)            | 다른 선택이 맞는 때                            |
| ------------ | ----------------------------- | ---------------------------------------------- |
| 배지 출처    | 서버 값 + 낙관적 증감 후 수렴 | 정확성이 절대적이면 서버 값만                  |
| 전달 방식    | 주기 조회                     | 즉시성이 제품 가치면 서버 푸시                 |
| 조회 간격    | 30초                          | 실시간성이 중요하면 짧게, 배터리 우선이면 길게 |
| 읽음 시점    | 항목을 열 때                  | 목록 확인 자체가 읽음인 제품이면 목록 열 때    |
| 탭 간 동기화 | 구현                          | 단일 탭 사용이 지배적이면 생략                 |
| 새 항목 삽입 | 상단에 즉시 삽입              | 읽는 중 위치가 밀리면 배너로 알림              |
| 삭제된 대상  | 목록으로 보내고 안내          | 상세 진입이 의미 있으면 삭제 안내 화면         |

## 5. 함정

| 증상                            | 원인                            | 교정                             |
| ------------------------------- | ------------------------------- | -------------------------------- |
| 탭을 많이 열면 요청이 폭증      | 숨겨진 탭도 주기 조회           | 가시성에 조회를 묶음             |
| 탭마다 배지 숫자가 다름         | 로컬 증감만 하고 수렴 없음      | 서버 재검증 + 탭 간 브로드캐스트 |
| 배지와 목록 숫자가 안 맞음      | 서로 다른 조회 사용             | 원본을 하나로 통합               |
| 읽었는데 배지가 그대로          | 읽음 처리 후 무효화 누락        | `onSettled`에서 관련 조회 무효화 |
| 포커스 복귀에 조회가 여러 번 감 | 중복 트리거                     | 진행 중 조회 재사용              |
| 알림 권한을 영구히 거부당함     | 첫 진입에 즉시 요청             | 사용자 의도가 드러난 시점에 요청 |
| 배지가 과거 값으로 되돌아감     | 늦게 온 조회 응답 반영          | 최신 응답만 채택                 |
| 알림 눌렀는데 빈 화면           | 대상이 삭제된 경우를 처리 안 함 | 대상 소멸 시 이동 지점 정의      |

## 6. 남길 검증

network 경계는 MSW handler로 세운다.

- **숨김 중 중단**: 탭이 숨겨진 동안 주기 조회 요청이 발생하지 않는지 확인한다.
- **포커스 복귀**: 복귀 시 재조회가 요청 **총 횟수** 기준 1회인지 확인한다.
- **응답 순서 역전**: 조회 응답이 뒤바뀌어 도착해도 배지가 과거 값으로 되돌아가지
  않는지 확인한다.
- **읽음 후 정합**: 읽음 처리 뒤 배지와 목록이 같은 결론을 보이는지 확인한다.
- **낙관적 실패 복구**: 읽음 처리 실패 시 개수가 복구되고 오류가 보이는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                          | 경계        | FSD 위치                 |
| ----------------------------- | ----------- | ------------------------ |
| 알림 조회·읽음 처리 요청 함수 | transport   | `<slice>/api`            |
| 개수 조회·가시성·탭 채널 훅   | model       | `<slice>/model`          |
| 배지·목록·권한 안내 component | view        | `<slice>/ui`             |
| 그룹핑·문구 포맷 순수 함수    | pure helper | `<slice>/lib`            |
| MSW handler와 알림 fixture    | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.

## 8. 근거

| ID   | 등급 | 자료                                                                                                                             | 이 문서에서 지지하는 주장                                     |
| ---- | ---- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [S1] | 공식 | [MDN — BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)                                      | 같은 origin 탭 간 메시지는 channel lifecycle과 함께 관리한다. |
| [S2] | 공식 | [MDN — Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)                                | 숨겨진 탭의 polling 중단과 복귀 재조회 조건을 확인한다.       |
| [S3] | 공식 | [MDN — Notification.requestPermission()](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static) | 권한은 사용자 의도와 브라우저 제약을 고려해 요청한다.         |
