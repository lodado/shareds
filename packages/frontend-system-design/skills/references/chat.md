# 실시간 채팅·메시징 구현 가이드

**핵심 어려움**: 내가 보낸 메시지가 두 경로로 들어온다. 낙관적으로 그린 임시 항목과
서버가 밀어주는 확정 항목이다. 이 둘을 같은 메시지로 합치지 못하면 같은 말이 두 번
보인다. 여기에 연결이 끊기고, 재시도가 중복 전송이 되고, 기기 시계가 서로 다르다.

## 1. 언제 읽는가

양방향 실시간 메시지 UI. 전송 상태를 표시하고 연결이 끊길 수 있는 화면.

과거 메시지를 위로 이어 붙이는 부분은 `infinite-scroll.md`를 함께 읽는다. 단방향
알림은 `notification-realtime.md`를 본다.

## 2. 권장 구조

**클라이언트가 메시지마다 고유 키를 만들어 보내고, 서버 응답과 푸시가 그 키를 되돌려
준다.** 이 키가 두 가지를 동시에 해결한다. 임시 항목과 서버 에코를 같은 메시지로 합칠
수 있고, 재시도가 같은 키를 쓰므로 서버가 중복을 걸러낼 수 있다. 서버가 이 키를
왕복시켜 주지 않으면 이중 표시와 중복 전송을 깔끔하게 막을 방법이 없다. 구현 전에 API
계약을 먼저 확인한다.

**임시 메시지를 별도 배열로 두지 않는다.** 서버 목록과 임시 목록을 따로 관리하면 정렬,
중복 제거, 상태 전이를 두 번 만들게 되고 반드시 어긋난다. 하나의 목록에 `sending`
상태 항목으로 넣는다.

**정렬 키는 서버가 정한 값을 쓴다.** 기기 시계로 정렬하면 시계가 느린 상대의 메시지가
과거로 끼어들어 대화가 뒤섞인다.

**누락 복구는 마지막으로 확정된 기준점 이후만 다시 읽는다.** 재연결마다 전체 대화를
다시 받으면 스크롤 위치와 읽음 상태가 매번 날아간다.

**병합·중복 제거·정렬은 순수 함수로 빼낸다.** 이 로직이 채팅 버그의 대부분이 사는
곳이고, 순수 함수여야 순서 역전과 중복 수신을 테스트로 고정할 수 있다.

## 3. 구현

병합 로직. 서버 id와 클라이언트 키 양쪽으로 같은 메시지를 찾는다.

```ts
// <slice>/lib/mergeIncoming.ts
export function mergeIncoming(messages: Message[], incoming: Message): Message[] {
  const index = messages.findIndex(
    (message) =>
      (incoming.id && message.id === incoming.id) || (incoming.clientId && message.clientId === incoming.clientId),
  )

  // 처음 보는 메시지
  if (index === -1) return sortByServerKey([...messages, incoming])

  // 이미 있는 메시지: 임시 항목을 확정본으로 교체하거나 중복 수신을 흡수한다
  const next = messages.slice()
  next[index] = { ...incoming, status: 'sent' }
  return sortByServerKey(next)
}
```

전송. 클라이언트 키를 만들어 임시 항목으로 먼저 그린다.

```ts
// <slice>/model/useSendMessage.ts
export function useSendMessage(roomId: string) {
  const queryClient = useQueryClient()
  const key = ['room', roomId, 'messages'] as const

  return useMutation({
    mutationFn: (draft: Draft) => sendMessage(roomId, draft),
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData<Message[]>(key, (messages = []) => [
        ...messages,
        { ...draft, id: null, status: 'sending', serverKey: null },
      ])
    },
    onSuccess: (confirmed) => {
      // 서버가 clientId를 되돌려주므로 임시 항목이 여기서 확정본으로 바뀐다
      queryClient.setQueryData<Message[]>(key, (messages = []) => mergeIncoming(messages, confirmed))
    },
    onError: (_error, draft) => {
      queryClient.setQueryData<Message[]>(key, (messages = []) =>
        messages.map((message) => (message.clientId === draft.clientId ? { ...message, status: 'failed' } : message)),
      )
    },
  })
}
```

재시도는 새 `clientId`를 만들지 않고 실패한 항목의 키를 그대로 다시 보낸다. 여기서 키를
새로 만들면 재시도가 곧 중복 전송이다.

재연결. 지수 백오프에 상한을 두고, 복구는 기준점 이후만 읽는다.

```ts
// <slice>/model/useRoomConnection.ts
const backoffMs = (attempt: number) => Math.min(1_000 * 2 ** attempt, 30_000)

function onReconnected(lastConfirmedKey: string | null) {
  // 전체 재조회 금지. 끊긴 구간만 메운다.
  return fetchMessagesAfter(roomId, lastConfirmedKey)
}
```

수신. 푸시로 들어오는 메시지도 같은 병합 함수를 통과시킨다.

```ts
socket.on('message', (incoming: Message) => {
  queryClient.setQueryData<Message[]>(key, (messages = []) => mergeIncoming(messages, incoming))
})
```

스크롤. 하단에 붙어 있을 때만 자동으로 내린다.

```ts
if (isPinnedToBottom) scrollToBottom()
else showNewMessageBadge()
```

## 4. 판단이 갈리는 지점

| 선택           | 기본 추천                      | 다른 선택이 맞는 때                                   |
| -------------- | ------------------------------ | ----------------------------------------------------- |
| 전송 상태 단계 | `전송 중`·`전송됨`·`실패`      | 읽음 확인이 제품 가치면 수신·읽음까지 구분            |
| 실패 큐 지속   | 메모리에만 두고 재진입 시 폐기 | 이탈이 잦은 모바일이면 저장소에 남겨 재개             |
| 읽음 보고 시점 | 대화창이 화면에 보일 때        | 명시적 확인이 필요한 업무용이면 버튼                  |
| 타이핑 표시    | 구현하지 않음                  | 실시간 상담처럼 대기 체감이 중요하면 도입             |
| 누락 복구 방식 | 기준점 이후 조회               | 서버가 기준점 조회를 지원하지 않으면 전체 재조회 감수 |
| 재연결 상한    | 30초                           | 백그라운드 유지가 중요하면 더 길게                    |

## 5. 함정

| 증상                              | 원인                               | 교정                                |
| --------------------------------- | ---------------------------------- | ----------------------------------- |
| 보낸 메시지가 두 번 보임          | 임시 항목과 서버 에코를 못 합침    | 클라이언트 키로 병합                |
| 재시도할 때마다 메시지가 늘어남   | 재시도가 새 키를 생성              | 실패 항목의 키를 재사용             |
| 대화 순서가 뒤섞임                | 기기 시계로 정렬                   | 서버 정렬 키 사용                   |
| 재연결하면 스크롤이 맨 아래로 튐  | 전체 대화 재조회                   | 기준점 이후만 조회                  |
| 같은 메시지가 잠깐 두 번 깜빡임   | 푸시와 응답이 각각 목록에 들어감   | 두 경로 모두 같은 병합 함수 통과    |
| 위를 읽는데 화면이 계속 내려감    | 무조건 자동 스크롤                 | 하단 고정 상태에서만 자동 스크롤    |
| 테스트는 통과하는데 실제로 깨짐   | 소켓을 통째로 스텁하고 상태만 조작 | 실제 전송을 재현하는 handler로 검증 |
| 오프라인에서 보낸 메시지가 사라짐 | 전송 큐가 없음                     | 순서 보존 큐 + 실패 상태 유지       |

## 6. 남길 검증

network 경계는 MSW handler로 세운다. WebSocket·SSE도 실제 전송을 재현하는 handler로
세우고 소켓 객체를 통째로 스텁하지 않는다. 병합 함수는 순수 함수라 단위 테스트로
직접 고정한다.

- **낙관적 이중 표시 없음**: 서버 에코가 도착했을 때 항목이 하나로 합쳐지는지 확인한다.
  이 테스트 없이 채팅 전송을 완료로 보지 않는다.
- **재시도 중복 전송 없음**: 재시도가 같은 키를 쓰고 최종 목록에 1건만 남는지 요청
  **총 횟수**와 함께 확인한다.
- **응답 순서 역전**: 두 메시지의 확인 응답이 뒤바뀌어도 순서가 유지되는지 확인한다.
- **중복 수신**: 같은 메시지를 두 번 밀어도 한 번만 렌더되는지 확인한다.
- **재연결 후 누락 없음**: 끊긴 동안 생긴 메시지가 정확히 한 번씩 나타나는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                            | 경계        | FSD 위치                 |
| ------------------------------- | ----------- | ------------------------ |
| 소켓 연결·메시지 요청 함수      | transport   | `<slice>/api`            |
| 메시지 상태·전송 큐·재연결 훅   | model       | `<slice>/model`          |
| 대화창·입력·상태 배지 component | view        | `<slice>/ui`             |
| 병합·중복 제거·정렬 순수 함수   | pure helper | `<slice>/lib`            |
| MSW handler와 메시지 fixture    | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.
