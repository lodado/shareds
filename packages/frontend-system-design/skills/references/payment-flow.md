# 결제·송금 구현 가이드

**핵심 어려움**: 요청이 서버에 닿았는지 모르는 순간이 반드시 생긴다. 타임아웃과 네트워크
끊김은 "실패"가 아니라 "모름"이다. 이걸 실패로 표시하면 사용자가 다시 시도해서 두 번
결제된다. 여기에 외부 결제 앱으로 이탈했다 돌아오는 흐름이 겹친다.

이 문서의 실수는 사용자 돈에 직접 영향을 준다. 추측한 기본값으로 넘어가지 않는다.

## 1. 언제 읽는가

금액이 실제로 움직이는 클라이언트 플로우. 결제, 송금, 정기결제 등록·해지, 환불 요청.
외부 결제 수단이나 인증 화면으로 이탈했다 돌아오는 흐름을 포함한다.

담기·수량 변경·가격 표시는 `commerce-cart.md`가 다룬다.

## 2. 권장 구조

**상태를 `성공`·`실패` 두 개로 만들지 않는다. `확인 중`이 반드시 필요하다.** 응답을 못
받은 상태는 세 번째 상태다. 이 상태를 만들지 않으면 개발자는 어쩔 수 없이 실패로
분류하고, 그게 이중 결제 경로가 된다.

**멱등 키는 결제 시도 1건에 1개를 만들고 재시도에도 같은 값을 유지한다.** 재시도마다
새 키를 만들면 서버는 별개 결제로 처리한다. 키를 어디에 보관하는지가 중요하다. 화면
상태에만 두면 새로고침이나 앱 복귀로 사라진다.

**응답을 못 받으면 상태 조회로 확정한다.** 결제 결과의 진실은 서버에 있다. 클라이언트가
받은 응답의 유무는 진실이 아니다.

**상태는 단방향으로만 전이한다.** 확정된 성공·실패에서 `확인 중`으로 되돌아가면 안 된다.
상태 조회를 여러 번 하면 늦게 온 응답이 확정 결과를 뒤집을 수 있다.

**외부 화면에서 돌아오면 클라이언트 기억값을 믿지 않고 서버 상태를 다시 읽는다.**
인앱브라우저는 복귀 시 화면을 새로 만드는 경우가 잦아서 메모리 상태가 남아 있다고
가정할 수 없다.

**최종 금액은 서버 값을 따른다.** 표시용 계산은 클라이언트에서 해도 승인 요청에 넣는
금액은 서버가 확정한 값이어야 한다.

## 3. 구현

상태 모델. 세 갈래가 아니라 네 갈래다.

```ts
// <slice>/model/paymentStatus.ts
export type PaymentStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'unconfirmed'; attemptId: string } // 응답 없음. 실패가 아니다.
  | { kind: 'settled'; result: 'succeeded' | 'failed'; reason?: string }

// 확정된 결과는 되돌리지 않는다.
export function transition(current: PaymentStatus, next: PaymentStatus): PaymentStatus {
  if (current.kind === 'settled' && next.kind !== 'settled') return current
  return next
}
```

멱등 키. 시도 시작 시 1개 만들고 재시도에서 재사용한다.

```ts
// <slice>/model/useCheckout.ts
const attemptIdRef = useRef<string | null>(null)

function beginAttempt() {
  // 이미 진행 중인 시도가 있으면 그 키를 유지한다. 재시도는 새 시도가 아니다.
  attemptIdRef.current ??= crypto.randomUUID()
  return attemptIdRef.current
}

function resetAttempt() {
  // 결과가 확정되고 사용자가 새 결제를 시작할 때만 키를 버린다.
  attemptIdRef.current = null
}
```

승인 요청. 타임아웃을 실패로 만들지 않는 게 이 코드의 요점이다.

```ts
async function submitPayment(input: CheckoutInput): Promise<PaymentStatus> {
  const attemptId = beginAttempt()

  try {
    const result = await requestPayment({ ...input, attemptId })
    return { kind: 'settled', result: result.succeeded ? 'succeeded' : 'failed', reason: result.reason }
  } catch (error) {
    if (isTimeoutOrNetworkError(error)) {
      // 서버에 닿았는지 모른다. 실패로 단정하지 않고 조회로 확정한다.
      return { kind: 'unconfirmed', attemptId }
    }
    throw error
  }
}
```

상태 확정. 상한을 두고, 상한까지 못 정하면 사용자에게 안내한다.

```ts
async function confirmAttempt(attemptId: string, { attempts = 5, intervalMs = 2_000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const status = await fetchPaymentStatus(attemptId)
    if (status.settled) return status
    await wait(intervalMs)
  }
  // 여기서도 실패로 단정하지 않는다. 사용자에게 확인 경로를 준다.
  return { settled: false as const }
}
```

중복 제출. 버튼 잠금과 서버 멱등을 둘 다 쓴다. 버튼 잠금은 UX이고, 이중 결제를 실제로
막는 건 서버 멱등이다.

```tsx
<button type="button" disabled={status.kind === 'requesting'} onClick={submit}>
  결제하기
</button>
```

외부 복귀. 복귀 진입점에서 서버 상태를 다시 읽는다.

```ts
// app 라우트 복귀 진입점
const attemptId = readAttemptIdFromDurableStore()
if (attemptId) await confirmAttempt(attemptId)
```

완료 화면은 이력에서 대체해 뒤로가기로 결제 화면에 돌아가지 않게 한다.

```ts
router.replace(`/orders/${orderId}/complete`)
```

## 4. 판단이 갈리는 지점

| 선택           | 기본 추천                            | 다른 선택이 맞는 때                                |
| -------------- | ------------------------------------ | -------------------------------------------------- |
| 멱등 키 주체   | 서버 발급 시도 토큰                  | 서버가 제공하지 않으면 클라이언트 생성 + 계약 명시 |
| 키 보관 위치   | 새로고침·복귀를 견디는 저장소        | 세션 내 완결이 보장되면 메모리                     |
| 상태 확정 방식 | 조회 폴링                            | 서버가 콜백을 보장하면 콜백 대기 + 조회 백업       |
| 조회 상한      | 5회 / 2초 간격                       | 결제망 지연이 큰 수단이면 더 길게                  |
| 재시도 허용    | 확정된 실패에서만                    | 어떤 경우에도 재시도를 막는 정책이면 버튼 제거     |
| 실패 사유 노출 | 행동 가능한 안내로 변환              | 내부 코드는 어떤 경우에도 노출하지 않는다          |
| 복귀 실패 처리 | 다음 진입 시 미확정 시도를 이어 확인 | 서버가 만료로 정리하면 그 규칙에 맞춤              |

## 5. 함정

| 증상                                | 원인                              | 교정                             |
| ----------------------------------- | --------------------------------- | -------------------------------- |
| 이중 결제                           | 타임아웃을 실패로 표시 후 재시도  | `확인 중` 상태 + 조회로 확정     |
| 이중 결제                           | 재시도마다 새 멱등 키 생성        | 시도 1건에 키 1개 유지           |
| 이중 결제                           | 버튼 잠금만으로 막음              | 서버 멱등 처리까지 요구          |
| 성공했는데 실패로 보임              | 응답 유실을 결과로 해석           | 서버 상태를 진실로 삼음          |
| 확정된 성공이 다시 `확인 중`으로 감 | 늦게 온 조회 응답이 상태를 되돌림 | 단방향 전이로 고정               |
| 복귀 후 결제 상태를 모름            | 화면 상태에만 멱등 키 보관        | 새로고침을 견디는 저장소로 이동  |
| 뒤로가기로 재결제됨                 | 완료 화면이 이력에 남음           | `replace`로 이력 대체            |
| 금액이 서버와 다른데 승인됨         | 클라이언트 계산 금액 전송         | 서버 확정 금액 확인 후 진행      |
| 사용자에게 내부 오류 코드가 보임    | 실패 응답 원문을 그대로 렌더      | 안내 문구로 변환하고 상세는 로깅 |

## 6. 남길 검증

network 경계는 MSW handler로 세운다. 이 목록은 축약 대상이 아니다.

- **중복 제출**: 버튼을 빠르게 여러 번 눌러도 결제 요청이 **총 1회**인지 요청 횟수로
  확인한다.
- **재시도 멱등**: 재시도가 같은 멱등 키를 보내는지 요청 본문·헤더로 확인한다.
- **응답 없음**: 타임아웃에서 `실패`가 아니라 `확인 중`으로 가고 조회가 수행되는지
  확인한다.
- **조회로 성공 확정**: 요청은 실패로 보였지만 실제로 성공한 경우 조회 결과로 성공이
  확정되는지 확인한다.
- **응답 순서 역전**: 늦게 온 조회 응답이 확정된 결과를 되돌리지 않는지 확인한다.
- **외부 복귀**: 복귀 후 서버 상태를 다시 읽는지 확인한다.
- **금액 불일치**: 서버 금액이 화면 금액과 다르면 승인이 진행되지 않는지 확인한다.
- **뒤로가기**: 완료 후 뒤로가기로 결제를 다시 실행할 수 없는지 확인한다.
- **오류 노출**: 실패 응답의 내부 사유가 사용자 화면 텍스트에 나타나지 않는지 확인한다.

임의 sleep으로 GREEN을 만들지 않는다. 대기는 관찰 가능한 상태 변화에 건다.

## 7. 배치

| 요소                             | 경계        | FSD 위치                 |
| -------------------------------- | ----------- | ------------------------ |
| 결제 요청·상태 조회 함수         | transport   | `<slice>/api`            |
| 멱등 키 보관·상태 전이 머신      | model       | `<slice>/model`          |
| 결제 화면·확인 중·결과 component | view        | `<slice>/ui`             |
| 금액·통화 계산과 표기 함수       | pure helper | `<slice>/lib`            |
| MSW handler와 결제 응답 fixture  | mock        | `<slice>/api/__mocks__/` |

승인·검증·금액 확정 같은 server 로직은 client public API에 섞지 않는다.
FSD 레포가 아니면 같은 역할을 레포의 기존 경계 관례에 매핑한다. 새 폴더 규칙을
발명하지 않는다.
