# 상품 선택·장바구니 구현 가이드

**핵심 어려움**: 재고와 가격이 사용자가 보는 동안 변한다. 담을 때 있던 재고가 결제할 때
없을 수 있고, 담을 때 가격이 결제할 때 다를 수 있다. 여기에 수량 조절이라는 연타되기
쉬운 조작과, 로그인 시 장바구니 병합이라는 데이터 합치기 문제가 붙는다.

## 1. 언제 읽는가

옵션을 골라 담는 상품 화면, 수량을 바꾸는 장바구니, 결제 직전 확인 화면.

금액이 실제로 움직이는 승인 단계는 `payment-flow.md`가 다룬다.

## 2. 권장 구조

**수량 변경은 델타가 아니라 최종 수량을 보낸다.** `+1`을 보내면 재시도와 중복 전송이
그대로 수량 증가가 된다. `quantity = 3`은 몇 번 도착해도 결과가 같다.

**연속 조작은 마지막 의도만 서버에 반영한다.** `+` 버튼을 다섯 번 누르면 요청 다섯
개가 아니라 최종 수량 하나여야 한다. 화면은 즉시 반응하고 서버 요청만 합친다.

**최종 금액은 서버 값을 따른다.** 표시용 합계는 클라이언트에서 계산해도 되지만 그
값으로 결제를 진행하면 안 된다. 할인·쿠폰·배송비 규칙은 클라이언트가 완전히 알 수 없다.

**재고는 두 시점에 확인한다.** 담을 때 한 번, 결제로 넘어갈 때 한 번이다. 담을 때 재고만
믿고 결제로 보내면 결제 도중 품절이 드러난다.

**장바구니 병합 결과를 사용자에게 보여준다.** 비로그인 장바구니를 로그인 시 조용히
대체하거나 합치면 사용자는 담아둔 물건이 사라지거나 두 배가 된 걸 나중에 발견한다.

## 3. 구현

수량 변경. 최종 수량 전송 + 낙관적 갱신 + 진행 중 조회 취소.

```ts
// <slice>/model/useSetCartQuantity.ts
export function useSetCartQuantity() {
  const queryClient = useQueryClient()
  const key = ['cart'] as const

  return useMutation({
    // 델타가 아니라 최종 수량. 재시도가 멱등이 된다.
    mutationFn: ({ lineId, quantity }: SetQuantity) => setCartQuantity(lineId, quantity),
    onMutate: async ({ lineId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData<Cart>(key)
      queryClient.setQueryData<Cart>(key, (cart) =>
        cart ? { ...cart, lines: cart.lines.map((line) => (line.id === lineId ? { ...line, quantity } : line)) } : cart,
      )
      return { snapshot }
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(key, context?.snapshot)
      showToast('수량을 변경하지 못했어요')
    },
    // 서버가 재고 상한으로 깎았을 수 있으므로 최종 값을 다시 읽는다.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
```

연타 병합. 화면은 즉시, 서버는 마지막 값만.

```ts
// <slice>/model/useQuantityStepper.ts
export function useQuantityStepper(line: CartLine, max: number) {
  const [draft, setDraft] = useState(line.quantity)
  const debounced = useDebouncedValue(draft, 400)
  const setQuantity = useSetCartQuantity()

  useEffect(() => {
    if (debounced !== line.quantity) setQuantity.mutate({ lineId: line.id, quantity: debounced })
  }, [debounced])

  // 상한을 입력 단계에서 막는다. 서버도 다시 막는다.
  const step = (delta: number) => setDraft((current) => Math.min(max, Math.max(1, current + delta)))

  return { draft, step }
}
```

결제 진입 전 재검증. 여기서 막지 않으면 결제 중에 문제가 드러난다.

```ts
// <slice>/model/useBeginCheckout.ts
async function beginCheckout(cart: Cart) {
  const verified = await verifyCart(cart.id)

  if (verified.soldOutLineIds.length > 0) return { ok: false as const, reason: 'sold-out', verified }
  // 표시 금액과 서버 금액이 다르면 진행하지 않고 사용자에게 변경을 알린다.
  if (verified.total !== cart.total) return { ok: false as const, reason: 'price-changed', verified }

  return { ok: true as const, verified }
}
```

병합. 결과를 보여주고 되돌릴 수단을 남긴다.

```ts
const merged = await mergeGuestCart(guestCartId)
showMergeSummary(merged) // 합쳐진 항목, 수량 조정된 항목, 담기지 못한 항목
```

## 4. 판단이 갈리는 지점

| 선택           | 기본 추천                   | 다른 선택이 맞는 때                              |
| -------------- | --------------------------- | ------------------------------------------------ |
| 옵션 재고 조회 | 상품 진입 시 조합 전체      | 조합이 수백 개면 선택 시점에 조회                |
| 품절 처리      | 표시 유지 + 결제 차단       | 목록이 길면 자동 제거 후 안내                    |
| 수량 상한      | 재고와 정책 한도 중 작은 값 | 예약 판매처럼 재고 개념이 없으면 정책 한도만     |
| 낙관적 갱신    | 적용                        | 재고 경합이 심한 한정 판매면 서버 확인 후 반영   |
| 가격 변동      | 진행 차단 + 변경 안내       | 인하만 발생하는 구조면 자동 반영                 |
| 장바구니 병합  | 합치고 결과 요약            | 계정 장바구니가 항상 우선인 정책이면 대체 + 안내 |
| 삭제 되돌리기  | 짧은 시간 되돌리기 제공     | 삭제가 드물면 확인 대화로 대체                   |

## 5. 함정

| 증상                               | 원인                       | 교정                                  |
| ---------------------------------- | -------------------------- | ------------------------------------- |
| 수량이 의도보다 많이 올라감        | 델타 전송 + 재시도         | 최종 수량 전송으로 멱등화             |
| `+` 연타에 요청이 다섯 번          | 조작마다 즉시 전송         | 화면은 즉시, 서버는 마지막 값만       |
| 낙관적 값이 곧바로 원복            | 진행 중 조회가 덮어씀      | `onMutate`에서 진행 중 조회 취소      |
| 재고보다 많이 주문됨               | 상한 검증이 클라이언트에만 | 입력 단계와 서버 양쪽에서 차단        |
| 결제 중에 품절이 드러남            | 담을 때 재고만 확인        | 결제 진입 시 재검증                   |
| 결제 금액이 표시와 다름            | 클라이언트 합계로 진행     | 서버 확정 금액을 따름                 |
| 로그인하니 장바구니가 사라짐       | 병합 없이 대체             | 병합 결과를 보여주고 되돌릴 수단 제공 |
| 선택할 수 없는 조합을 고를 수 있음 | 조합 재고를 반영하지 않음  | 불가 조합 비활성 + 이유 표시          |

## 6. 남길 검증

network 경계는 MSW handler로 세운다. 금액·상한 계산은 순수 함수라 단위 테스트로
직접 고정한다.

- **연속 수량 변경**: 빠르게 여러 번 바꿨을 때 서버 요청 **총 횟수**와 최종 값이
  의도대로인지 확인한다.
- **응답 순서 역전**: 수량 변경 응답이 뒤바뀌어 도착해도 최종 값이 마지막 의도와 같은지
  확인한다.
- **낙관적 실패 복구**: 실패 시 이전 수량으로 돌아가고 오류가 보이는지 확인한다.
- **수량 상한**: 상한 초과 입력에서 요청이 발생하지 않고 이유가 보이는지 확인한다.
- **품절·가격 변동**: 결제 진입이 차단되고 변경 내용이 안내되는지 확인한다.
- **병합**: 로그인 후 항목이 중복되거나 사라지지 않는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                                 | 경계        | FSD 위치                 |
| ------------------------------------ | ----------- | ------------------------ |
| 장바구니·재고·가격 조회와 변경 요청  | transport   | `<slice>/api`            |
| 장바구니 cache·낙관적 갱신·병합 훅   | model       | `<slice>/model`          |
| 옵션 선택기·수량 입력·요약 component | view        | `<slice>/ui`             |
| 금액·할인·상한 계산 순수 함수        | pure helper | `<slice>/lib`            |
| MSW handler와 장바구니 fixture       | mock        | `<slice>/api/__mocks__/` |

FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.
