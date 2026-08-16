# 검색·자동완성 구현 가이드

**핵심 어려움**: 입력 하나하나가 요청 하나가 될 수 있고, 응답은 보낸 순서대로 오지
않는다. 한글은 여기에 조합 입력이 더해져서 `ㅎ`·`하`·`한`이 각각 요청이 된다. 결과가
최신 입력과 어긋나는 순간 사용자는 잘못된 목록을 보고 선택한다.

> **Oracle 우선:** 이 문서는 `frontend-oracle-design`의 활성 카드 아래에서만 쓴다.
> `ORACLE_READY` 전에는 구현하지 않는다. 추천과 코드는 정책 출처가 아니다. 코드는 구현 선택지다.

## 1. 언제 읽는가

검색창, typeahead, combobox, 필터 검색, mention picker. 입력에 따라 원격 결과를
갱신하는 모든 UI.

제출 버튼으로만 조회하는 폼이나 메모리 안에서 거르는 필터에는 필요 없다.

## 2. 권장 구조

combobox의 키보드·focus 계약과 query 취소 전달은 [S1][S2]의 실제 버전·브라우저 동작을 따른다.

**정규화한 쿼리를 query key에 넣는다. 이게 순서 역전 문제를 구조적으로 없앤다.**
직접 `fetch` + `setState`로 만들면 늦게 온 `사과` 응답이 최신 `사과나무` 결과를
덮어쓰므로 순번 가드를 손으로 만들어야 한다. 쿼리 캐시는 결과를 입력에 묶어 두기
때문에 오래된 키의 응답이 현재 키의 화면에 들어올 수 없다. 순서 역전 방어를 직접
만들지 말고 이 성질을 쓴다.

**정규화는 key에 넣기 전에 한다.** `사과 `와 `사과`가 다른 키가 되면 캐시 적중률이
떨어지고 같은 결과를 두 번 받는다.

**입력 대기는 debounce다.** 타이핑은 멈춤이 의미 있는 신호이므로 "멈춘 뒤 1회"가 맞다.
throttle은 scroll·resize처럼 계속 흐르는 신호용이다.

**취소는 `AbortSignal`을 실제 요청까지 넘겨서 한다.** 화면 정합성은 query key가
해결하지만, 쓸모없어진 요청이 서버와 네트워크를 계속 쓰는 건 별개 문제다.

**목록은 ARIA Combobox 패턴으로 만든다.** `div` 나열로 만들면 키보드 이동과 스크린
리더 안내를 전부 새로 발명해야 하고 대개 틀린다.

## 3. 구현

정규화. 유니코드 정규화를 빼면 자모 분리 입력이 다른 문자열로 취급된다.

```ts
// <slice>/lib/normalizeQuery.ts
export function normalizeQuery(raw: string) {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}
```

debounce 훅. 타이머가 훅 인스턴스 안에 있는 게 중요하다. 모듈 스코프에 두면 검색창이
두 개인 화면에서 서로의 타이머를 덮어쓴다.

```ts
// <slice>/lib/useDebouncedValue.ts
export function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
```

조회. 정규화 → debounce → key 순서다.

```ts
// <slice>/model/useProductSearch.ts
export function useProductSearch(raw: string, { minLength = 2, delay = 300 } = {}) {
  const query = normalizeQuery(raw)
  const debounced = useDebouncedValue(query, delay)

  return useQuery({
    queryKey: ['product-search', debounced],
    queryFn: ({ signal }) => searchProducts(debounced, { signal }),
    enabled: debounced.length >= minLength,
    // 새 쿼리를 기다리는 동안 이전 결과를 남길지는 제품 결정이다.
    placeholderData: keepPreviousData,
  })
}
```

IME 게이트. 조합이 끝난 뒤에만 조회하는 정책일 때 쓴다.

```tsx
// <slice>/ui/SearchInput.tsx
const [raw, setRaw] = useState('')
const composingRef = useRef(false)

<input
  role="combobox"
  value={raw}
  aria-expanded={isOpen}
  aria-controls="product-search-options"
  aria-activedescendant={activeOptionId}
  onCompositionStart={() => {
    composingRef.current = true
  }}
  onCompositionEnd={(event) => {
    composingRef.current = false
    // 조합이 확정된 최종 값은 여기서 한 번만 반영한다.
    setRaw(event.currentTarget.value)
  }}
  onChange={(event) => {
    if (composingRef.current) return
    setRaw(event.currentTarget.value)
  }}
/>
```

`aria-expanded`·`aria-controls`·`aria-activedescendant`와 화살표·Escape·Enter의 세부
동작은 ARIA Combobox 패턴 [S1]에 맞춰 제품이 실제로 제공하는 선택 흐름만 구현한다.

`keyCode === 229` 같은 브라우저별 우회를 쓰지 않는다. composition 이벤트가 표준
경로다. 안드로이드 키보드는 조합 이벤트 발생 양상이 기기마다 달라서, 실제 대상 기기에서
한 번은 직접 확인한다.

조합 중에도 조회하는 정책이면 이 게이트를 넣지 않는다. 대신 `minLength`를 올려 자모
한 글자로 요청이 나가는 것을 줄인다.

## 4. 판단이 갈리는 지점

| 선택              | 추천안 (정책 아님)         | 다른 선택이 맞는 때                                    |
| ----------------- | -------------------------- | ------------------------------------------------------ |
| IME 조합 중 조회  | 확정 후에만                | 초성 검색을 제품 기능으로 제공하는 경우                |
| debounce 시간     | 250~350ms                  | 로컬 인덱스처럼 응답이 즉각적이면 더 짧게              |
| 최소 글자 수      | 2자                        | 코드·사번처럼 1자도 유효한 검색이면 1자                |
| 로딩 중 이전 결과 | 유지                       | 결과가 완전히 다른 맥락으로 바뀌면 비우는 편이 덜 혼란 |
| 빈 입력           | 결과 비우고 조회 전 상태로 | 최근 검색·추천을 보여주는 제품이면 그 목록으로         |
| 캐시 유지 시간    | 짧게(수십 초)              | 결과가 거의 안 변하는 마스터 데이터면 길게             |

## 5. 함정

| 증상                                | 원인                                     | 교정                                      |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------- |
| 한 글자 칠 때마다 요청이 나감       | 조합 이벤트 미처리                       | composition 게이트 또는 조회 정책 확정    |
| 결과가 이전 검색어의 것으로 보임    | 응답 순서 역전에 순번 가드 없음          | 쿼리를 query key에 넣어 캐시가 묶게       |
| 붙여넣기에도 debounce가 걸려 답답함 | 모든 입력에 같은 대기 적용               | 붙여넣기는 즉시 조회로 분기               |
| 검색창 두 개가 서로 방해            | debounce 타이머가 모듈 스코프            | 타이머를 훅 인스턴스로 이동               |
| 같은 검색어인데 캐시가 안 맞음      | 정규화 전 원문을 key로 사용              | 정규화 후 값을 key로                      |
| 화살표 키가 목록을 못 움직임        | `div` 나열, 활성 항목 연결 없음          | Combobox 패턴 + `aria-activedescendant`   |
| `결과 없음`이 첫 진입에도 보임      | `조회 전`과 `결과 없음`을 한 상태로 처리 | 두 상태를 분리해서 렌더                   |
| 취소해도 서버 요청이 계속 감        | `signal`을 요청에 넘기지 않음            | `queryFn`의 `signal`을 transport까지 전달 |

## 6. 남길 검증

network 경계는 MSW handler로 세운다. 아래는 이 기능에서 실제로 깨지는 지점이다.

- **응답 순서 역전**: `사과` 응답을 `사과나무`보다 늦게 도착시켜도 최신 쿼리 결과만
  남는지 확인한다. 이 테스트 없이 검색을 완료로 보지 않는다.
- **debounce 경계**: 대기 시간 안에 연속 입력하면 요청이 1회인지 요청 **총 횟수**로
  확인한다. 가짜 타이머로 경계 직전·직후를 모두 본다.
- **IME 조합**: 확정 후 조회 정책이면 조합 중 입력에서 요청이 0회인지 확인한다.
- **최소 글자 미만**: 요청이 발생하지 않는지 확인한다.
- **키보드 확정**: Enter 확정과 클릭 확정이 같은 결과를 만드는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                            | 경계        | FSD 위치                 |
| ------------------------------- | ----------- | ------------------------ |
| 검색 요청 함수·DTO 변환         | transport   | `<slice>/api`            |
| query key·조회 options·히스토리 | model       | `<slice>/model`          |
| 입력·목록 component·키보드 처리 | view        | `<slice>/ui`             |
| 정규화·debounce·하이라이트 함수 | pure helper | `<slice>/lib`            |
| MSW handler와 결과 fixture      | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.

## 8. 근거

| ID   | 등급 | 자료                                                                                                                    | 이 문서에서 지지하는 주장                                     |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [S1] | 표준 | [WAI-ARIA APG — Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)                                   | combobox의 role, focus, 키보드와 활성 항목 연결을 확인한다.   |
| [S2] | 공식 | [TanStack Query — Query Cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) | query의 `AbortSignal`을 실제 요청에 전달하는 패턴을 확인한다. |
| [S3] | 공식 | [MDN — compositionend](https://developer.mozilla.org/en-US/docs/Web/API/Element/compositionend_event)                   | IME 조합 확정은 composition 이벤트로 다룬다.                  |
