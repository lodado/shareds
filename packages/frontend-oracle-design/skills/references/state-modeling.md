# 상태 모델링 — AI 출력을 타입 계약 안에 가둔다

## 목적과 권위

승인된 Oracle Card의 async·다단계·순서 계약을 TypeScript 타입으로 옮겨, AI가
임의의 상태·event·전이를 생성해도 typecheck에서 거부되게 한다. 설명이나 naming
convention보다 **표현 가능한 타입의 범위**를 좁히는 것이 이 문서의 주목적이다.

상태·event·전이는 전부 카드의 `O*` 행에서 도출한다. 카드에 없는 조합이 필요하면
type assertion이나 fallback으로 통과시키지 말고 `POLICY_GAP`으로 `NEEDS_DECISION`에
돌아간다. 이 문서는 제품 정책을 만들지 않는다.

권위 순서는 [`frontend-implementation.md`](frontend-implementation.md)와 같다.

## 발동 조건

client workflow 상태를 새로 만들거나 바꾸면 discriminated union을 기본값으로 쓴다.
특히 다음이면 예외 없이 적용한다.

- async·순서 역전·중복 제출·retry·timeout 카드 행이 있다
- boolean·optional 조합으로 카드의 `Never` 상태를 표현할 수 있다
- 한 흐름이 2개 이상의 관찰 가능한 위상(phase)을 오간다
- 같은 흐름에 두 번째 boolean flag나 optional 상태 필드를 추가하려 한다

진짜 독립 boolean 하나와 현재 props/state에서 바로 파생 가능한 값은 예외다. 타입
계약을 이유로 새 hook·class·범용 상태 프레임워크를 만들지 않는다.

## 1. 카드 행을 전이 계약으로 바꾼다

| 카드 열  | 타입 계약 대응                                               |
| -------- | ------------------------------------------------------------ |
| `Given`  | 출발 `phase`와 그 위상에서만 존재하는 payload                |
| `When`   | event literal과 event payload                                |
| `Then`   | 도착 `phase`와 그 위상에서만 존재하는 payload                |
| `Never`  | 타입으로 만들 수 없어야 하는 상태·전이                       |
| `부작용` | 별도 effect union으로 표현할 외부 write의 종류와 정확한 횟수 |

1. `Given`·`Then`에서 phase 집합을, `When`에서 event 집합을 수집한다.
2. `from phase × event → to phase` 표를 만들고 모든 edge에 카드 행 ID를 붙인다.
3. 빈 칸은 불가능한 조합인지 미결 정책인지 구분한다. 미결이면 멈춘다. "무시"나
   "현재 상태 유지"를 AI가 기본값으로 채우지 않는다.
4. 카드 행이 없는 edge는 타입과 구현 어디에도 추가하지 않는다.

phase는 시간에 따른 workflow의 **위상**, state는 `phase + 해당 위상의 payload`다.
event는 이미 일어난 사실이고 transition은 유일하게 state를 바꾸는 함수다.

## 2. phase와 payload를 discriminated union으로 고정한다

workflow 내부 discriminant는 `phase`로 통일한다. 외부 라이브러리가 제공하는
`status`는 그대로 사용하되 별도 local state로 복사하지 않는다.

```typescript
type PaymentState =
  | { phase: 'editing'; amount: number; fieldErrors: FieldErrors }
  | { phase: 'submitting'; amount: number; requestId: string }
  | { phase: 'success'; paymentId: string }
  | { phase: 'failure'; amount: number; reason: PaymentFailure }

type PaymentEvent =
  | { type: 'SUBMIT'; requestId: string }
  | { type: 'RESPONSE_OK'; paymentId: string }
  | { type: 'RESPONSE_ERROR'; reason: PaymentFailure }
  | { type: 'RETRY'; requestId: string }
```

- `phase`와 `type`은 닫힌 string literal union이어야 한다. `string`으로 넓히지 않는다.
- 각 payload는 소유 phase에만 둔다. 모든 field를 optional로 만든 `Partial<State>`를
  금지한다.
- 실패 원인을 카드가 구분하면 `PaymentFailure`도 discriminated union으로 만든다.
- `as PaymentState`, non-null assertion, open index signature로 타입 오류를 숨기지 않는다.
- API·storage·URL payload는 경계에서 parse한다. 레포에 schema parser가 있으면
  재사용하고, 없으면 경계에 좁히는 함수 하나만 둔다.
- TanStack Query 같은 설치된 도구가 이미 제공하는 server-state contract를 재사용한다.
  local workflow는 query 밖의 phase와 순서만 소유한다.

## 3. 전이표를 타입의 단일 원본으로 만든다

표준 TypeScript 유틸 `Extract`와 `satisfies`로 카드 행·출발 phase·event·도착 phase를
한 타입 관계로 묶는다. 이 작은 유틸은 같은 workflow 안에서만 두고, 두 feature가
실제로 같은 형태를 반복하기 전에는 shared package로 올리지 않는다.

```typescript
type Phase = PaymentState['phase']
type EventType = PaymentEvent['type']

type StateAt<P extends Phase> = Extract<PaymentState, { phase: P }>
type EventAt<T extends EventType> = Extract<PaymentEvent, { type: T }>

type Edge = { from: Phase; on: EventType; to: Phase }
type OracleRowId = `O${number}`

const paymentTransitionContract = {
  O1: { from: 'editing', on: 'SUBMIT', to: 'submitting' },
  O2: { from: 'submitting', on: 'RESPONSE_OK', to: 'success' },
  O3: { from: 'submitting', on: 'RESPONSE_ERROR', to: 'failure' },
  O4: { from: 'failure', on: 'RETRY', to: 'submitting' },
} as const satisfies Record<OracleRowId, Edge>

type Handler<C extends Edge> = (state: StateAt<C['from']>, event: EventAt<C['on']>) => StateAt<C['to']>

type TransitionHandlers<C extends Record<string, Edge>> = {
  [K in keyof C]: Handler<C[K]>
}

const paymentTransitions = {
  O1: (state, event) => ({
    phase: 'submitting',
    amount: state.amount,
    requestId: event.requestId,
  }),
  O2: (_state, event) => ({ phase: 'success', paymentId: event.paymentId }),
  O3: (state, event) => ({
    phase: 'failure',
    amount: state.amount,
    reason: event.reason,
  }),
  O4: (state, event) => ({
    phase: 'submitting',
    amount: state.amount,
    requestId: event.requestId,
  }),
} satisfies TransitionHandlers<typeof paymentTransitionContract>
```

이 구조는 AI가 다음을 시도하면 compile error를 만든다.

- 카드에 없는 phase·event·edge 추가
- `editing + RESPONSE_OK`처럼 잘못된 입력 조합
- `O1` handler가 `success`처럼 계약과 다른 phase 반환
- 도착 phase의 필수 payload 누락 또는 다른 phase payload 혼입
- 계약 행을 추가하고 handler 구현을 빠뜨림

`Record<string, Edge>`처럼 아무 key나 받지 않고 `Record<OracleRowId, Edge>`를
`as const satisfies`로 검사한다. 그래야 카드 행 ID와 각 edge의 literal 관계를
보존하면서 shape도 검사한다.

## 4. 호출 지점도 카드 행과 함께 제한한다

handler가 안전해도 호출부가 `(PaymentState, PaymentEvent)` 전체 조합을 받으면 잘못된
pair를 만들 수 있다. 카드 행을 discriminant로 가진 command union을 파생한다.

```typescript
type TransitionCommand<C extends Record<string, Edge>> = {
  [K in keyof C]: {
    row: K
    state: StateAt<C[K]['from']>
    event: EventAt<C[K]['on']>
  }
}[keyof C]

type PaymentTransitionCommand = TransitionCommand<typeof paymentTransitionContract>

function transition(command: PaymentTransitionCommand): PaymentState {
  switch (command.row) {
    case 'O1':
      return paymentTransitions.O1(command.state, command.event)
    case 'O2':
      return paymentTransitions.O2(command.state, command.event)
    case 'O3':
      return paymentTransitions.O3(command.state, command.event)
    case 'O4':
      return paymentTransitions.O4(command.state, command.event)
    default:
      return assertNever(command)
  }
}
```

새 카드 행을 contract에 추가하면 handler와 exhaustive dispatcher가 함께 깨져야 한다.
그 compile error가 AI에게 필요한 수정 범위를 알려준다. `default: return state` 같은
catch-all은 금지한다.

runtime state와 async event의 phase가 맞는지는 호출 직전 좁힌다. response가 늦게 와
현재 phase나 `requestId`가 달라졌다면 카드의 stale-response 정책을 적용한다. 값의
동등성·순서·횟수는 타입만으로 증명할 수 없으므로 guard와 카드 테스트가 담당한다.

## 5. 기존 유틸을 우선한다

아래 순서에서 처음 충분한 수단을 쓴다.

1. TypeScript 내장 `Extract`, `Readonly`, `satisfies`
2. 레포의 기존 `assertNever`, schema parser, Result/Error 타입
3. 설치된 query/form/router가 이미 제공하는 상태 타입
4. 설치돼 있거나 도입이 승인된 경우에만 `ts-pattern().exhaustive()`

`assertNever`가 이미 있으면 재사용한다. 없으면 가장 가까운 공용 경계에 하나만 둔다.
JSX는 phase별 early return이나 `satisfies Record<Phase, ...>` lookup으로 충분한지 먼저
본다. 새 dependency나 범용 transition builder는 위 수단으로 실제 중복을 제거하지
못할 때만 제안한다.

외부 write가 있으면 transition 안에서 직접 실행하지 말고 카드에 등장한 effect만
닫힌 union으로 반환해 기존 effect runner가 처리하게 한다. effect 종류와 payload도
phase와 같은 방식으로 제한하며, 범용 command bus는 만들지 않는다.

## 6. AI 출력 거부 규칙

다음 결과는 동작해 보여도 거부한다.

- boolean flag 병렬 조합, optional payload soup, open string phase
- 카드에 없는 edge를 위한 fallback·no-op·catch-all
- `as`, `any`, non-null assertion으로 transition 오류 우회
- handler 밖에서 state object를 직접 조립하거나 phase를 직접 대입
- 같은 phase/event/edge를 타입·reducer·UI에 중복 선언
- 기존 schema/query/assertNever 유틸을 다시 구현
- type error를 없애기 위한 카드 정책 변경 또는 contract 완화

AI가 새 phase나 edge를 제안하면 구현부터 하지 않는다. 카드 행과 사용자 승인이 생긴
뒤 contract를 먼저 바꾸고, 그 결과 발생한 compile error 목록을 작업 범위로 사용한다.

## 7. 검증과 reviewer 기준

- 전이표 edge는 카드 행 테스트와 1:1로 연결한다.
- pure handler는 해당 행의 입력·도착 payload만 단위 테스트한다. UI·부작용 테스트를
  중복하지 않는다.
- exported shared/package API일 때만 잘못된 command가 compile되지 않음을
  `@ts-expect-error` type test로 남긴다. 로컬 타입에는 추가하지 않는다.
- `@lodado/eslint-config/local-rules`를 쓰면 `require-discriminated-state`,
  `no-boolean-state-flags`, `no-response-type-assertion`을 재사용한다.
- phase/event/edge 변경, exhaustive 실패, type assertion 추가는 review 대상이다.
- 값의 순서·requestId 일치·부작용 횟수는 타입 claim으로 통과시키지 않고 runtime
  guard와 카드 테스트 증거를 요구한다.

## Implementation Decision evidence

- 카드 행 ID가 붙은 `from × event → to` 표
- 선택한 phase·event·payload union과 parser 위치
- 재사용한 타입·schema·query·exhaustiveness 유틸
- 불가능 조합과 미결 조합의 구분
- typecheck command와 영향받은 카드 테스트 runId

## Source Registry

구현 근거이며 정책 출처가 아니다. 실제 설치 버전 문서가 링크보다 우선한다.

| 관할                     | 자료                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 개념 canon               | [Kent C. Dodds: Make Impossible States Impossible](https://kentcdodds.com/blog/make-impossible-states-impossible), [Stop using isLoading booleans](https://kentcdodds.com/blog/stop-using-isloading-booleans), Scott Wlaschin: Designing with Types, Alexis King: Parse, don't validate |
| 타입·exhaustiveness      | [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html), [satisfies operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html), [ts-pattern](https://github.com/gvergnaud/ts-pattern)                                |
| TanStack Query 상태 계약 | [TkDodo: Status Checks in React Query](https://tkdodo.eu/blog/status-checks-in-react-query)                                                                                                                                                                                             |
