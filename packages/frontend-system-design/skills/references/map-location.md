# 지도·위치 기반 목록 구현 가이드

**핵심 어려움**: 지도 이동은 초당 수십 번 발생하는 연속 신호인데 조회는 무겁다. 여기에
사용자 위치 권한이라는 거부·무응답이 가능한 비동기가 붙고, 지도와 목록이라는 두 개의
선택 UI를 서로 맞춰야 한다.

> **Oracle 우선:** 이 문서는 `frontend-oracle-design`의 활성 카드 아래에서만 쓴다.
> `ORACLE_READY` 전에는 구현하지 않는다. 추천과 코드는 정책 출처가 아니다. 코드는 구현 선택지다.

## 1. 언제 읽는가

지도를 움직여 결과를 다시 조회하는 화면, 사용자 위치로 주변 목록을 보여주는 화면,
지도와 목록을 나란히 두고 선택을 맞추는 화면.

좌표를 표시만 하는 정적 지도에는 필요 없다.

## 2. 권장 구조

위치 권한·timeout·공유 위치의 정밀도는 [S1][S2]를 기준으로 대상 브라우저와 개인정보 정책에 맞춘다.

**이동이 끝난 뒤 조회한다.** 지도 라이브러리의 이동 종료 이벤트(`idle`, `moveend` 등)를
쓴다. 이동 중 프레임마다 조회하면 요청이 폭증하고 대부분 버려진다.

**정규화한 경계를 query key에 넣는다.** 좌표 원값을 키로 쓰면 소수점 아래가 매번 달라져
사실상 캐시가 없는 것과 같다. 확대 수준과 반올림한 경계를 키로 만들면 같은 화면으로
돌아왔을 때 캐시가 맞는다. 쿼리 캐시가 키를 소유하므로 늦게 온 이전 경계의 응답이
현재 화면에 들어올 수 없다.

**선택 상태의 주인을 한 곳으로 정한다.** 지도 선택과 목록 선택을 effect로 양방향
동기화하면 서로를 계속 되돌린다. 상위에서 선택 id 하나를 소유하고 지도와 목록이 그것을
읽게 한다.

**위치 권한에는 세 가지 결말이 있다.** 허용, 거부, 그리고 응답이 오지 않음이다. 세 번째를
처리하지 않으면 화면이 로딩에서 멈춘다. 시간초과 경로를 만들고 기본 위치로 진행한다.

**정확한 좌표를 주소에 남기지 않는다.** 링크 공유, 서버 로그, referrer로 사용자 위치가
새어 나간다. 공유·복원이 필요하면 정밀도를 낮춘 값만 남긴다.

## 3. 구현

경계 정규화. 이 함수가 캐시 적중률을 만든다.

```ts
// <slice>/lib/normalizeBounds.ts
export function normalizeBounds(bounds: Bounds, zoom: number) {
  // 확대 수준이 높을수록 정밀하게, 낮으면 거칠게 반올림한다.
  const precision = zoom >= 15 ? 3 : 2
  const round = (value: number) => Number(value.toFixed(precision))

  return {
    zoom,
    south: round(bounds.south),
    west: round(bounds.west),
    north: round(bounds.north),
    east: round(bounds.east),
  }
}
```

이동 종료에만 반응하는 조회.

```ts
// <slice>/model/usePlacesInView.ts
export function usePlacesInView(map: MapInstance | null) {
  const [view, setView] = useState<NormalizedBounds | null>(null)

  useEffect(() => {
    if (!map) return
    // 이동 중이 아니라 멈춘 뒤에만 갱신한다.
    const onIdle = () => setView(normalizeBounds(map.getBounds(), map.getZoom()))
    map.on('idle', onIdle)
    return () => map.off('idle', onIdle)
  }, [map])

  return useQuery({
    queryKey: ['places', view],
    queryFn: ({ signal }) => fetchPlacesInBounds(view!, { signal }),
    enabled: view !== null,
    // 새 영역을 기다리는 동안 이전 마커를 남긴다. 빈 지도가 깜빡이는 것보다 낫다.
    placeholderData: keepPreviousData,
  })
}
```

위치 권한. 시간초과가 있는 세 갈래 처리.

```ts
// <slice>/model/useUserLocation.ts
type LocationState = { kind: 'pending' } | { kind: 'ready'; coords: Coords; source: 'user' | 'fallback' }

export function requestUserLocation(fallback: Coords, timeoutMs = 5_000): Promise<LocationState> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ kind: 'ready', coords: fallback, source: 'fallback' })

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          kind: 'ready',
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
          source: 'user',
        }),
      // 거부와 시간초과를 같은 fallback 경로로 보낸다. 화면이 멈추지 않게 한다.
      () => resolve({ kind: 'ready', coords: fallback, source: 'fallback' }),
      { timeout: timeoutMs },
    )
  })
}
```

선택 동기화. 주인은 하나다.

```tsx
// <slice>/ui/PlaceExplorer.tsx
const [selectedId, setSelectedId] = useState<string | null>(null)

<PlaceMap places={places} selectedId={selectedId} onSelect={setSelectedId} />
<PlaceList places={places} selectedId={selectedId} onSelect={setSelectedId} />
```

## 4. 판단이 갈리는 지점

| 선택         | 추천안 (정책 아님)         | 다른 선택이 맞는 때                             |
| ------------ | -------------------------- | ----------------------------------------------- |
| 조회 트리거  | 이동 종료 시 자동          | 데이터가 비싸면 `이 지역 검색` 버튼             |
| 조회 범위    | 화면 경계                  | 서버가 반경 검색만 지원하면 중심 + 반경         |
| 밀집 표현    | 상한 초과 시에만 묶음      | 항목이 항상 수천 개면 처음부터 묶음             |
| 이동 중 표시 | 이전 결과 유지             | 결과가 완전히 다른 지역이면 비우는 편이 덜 혼란 |
| 기본 위치    | 서비스 대표 지역           | 최근 조회 위치를 기억하는 제품이면 그 값        |
| 상태 공유    | 정밀도 낮춘 값만 주소에    | 공유가 기능이 아니면 주소에 남기지 않음         |
| 축소 한계    | 일정 수준 이하는 조회 차단 | 전국 요약 통계를 줄 수 있으면 요약 표시         |

## 5. 함정

| 증상                             | 원인                           | 교정                              |
| -------------------------------- | ------------------------------ | --------------------------------- |
| 지도를 움직이면 요청이 폭증      | 이동 중 프레임마다 조회        | 이동 종료 이벤트에만 반응         |
| 캐시가 전혀 안 맞음              | 좌표 원값을 query key로 사용   | 정규화한 경계 + 확대 수준을 키로  |
| 이전 지역 결과가 남아 있음       | 늦게 온 응답을 그대로 반영     | 쿼리 키로 결과를 영역에 묶음      |
| 선택이 계속 되돌아감             | 지도·목록 양방향 effect 동기화 | 선택 주인을 하나로                |
| 위치 로딩에서 멈춤               | 권한 무응답 경로 없음          | 시간초과 + fallback 좌표          |
| 마커 수천 개로 지도가 멈춤       | 상한 없이 렌더                 | 결과 상한 + 묶음 표현             |
| 공유 링크에 사용자 위치가 노출됨 | 정확한 좌표를 주소에 기록      | 정밀도를 낮추거나 주소에서 제거   |
| 축소하면 서버가 죽음             | 전국 범위 조회 허용            | 축소 한계에서 조회 차단 또는 요약 |

## 6. 남길 검증

network 경계는 MSW handler로 세운다. 경계 정규화는 순수 함수라 단위 테스트로 직접
고정한다.

- **연속 이동**: 지도를 여러 번 이어 움직였을 때 조회 요청 **총 횟수**가 이동 종료
  횟수와 맞는지 확인한다.
- **응답 순서 역전**: 이전 경계 응답이 나중에 도착해도 현재 화면에 맞는 결과만 남는지
  확인한다.
- **권한 거부·시간초과**: 두 경우 모두 기본 위치로 진행되고 화면이 비지 않는지
  확인한다.
- **선택 동기화**: 지도에서 고른 항목이 목록에서도 같은 항목으로 표시되는지, 반대
  방향도 같은지 확인한다.
- **캐시 적중**: 같은 화면으로 돌아왔을 때 추가 요청이 없는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                                 | 경계        | FSD 위치                 |
| ------------------------------------ | ----------- | ------------------------ |
| 지역 조회 요청 함수·DTO 변환         | transport   | `<slice>/api`            |
| 조회 키·선택 상태·위치 권한 훅       | model       | `<slice>/model`          |
| 지도·마커·목록 component             | view        | `<slice>/ui`             |
| 경계 정규화·거리·묶음 계산 순수 함수 | pure helper | `<slice>/lib`            |
| MSW handler와 지역 결과 fixture      | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.

## 8. 근거

| ID   | 등급 | 자료                                                                                                          | 이 문서에서 지지하는 주장                                                  |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [S1] | 표준 | [W3C Geolocation API](https://www.w3.org/TR/geolocation/)                                                     | 위치 접근은 사용자 허가와 위치 정보의 개인정보 고려가 필요하다.            |
| [S2] | 공식 | [MDN — getCurrentPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition) | 위치 조회의 success, error, timeout 옵션은 브라우저 API 계약으로 확인한다. |
