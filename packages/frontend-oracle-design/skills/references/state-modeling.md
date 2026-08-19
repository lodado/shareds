# 상태 모델링 — 카드를 타입 계약으로 번역한다

## 목적과 권위

승인된 Oracle Card의 async·다단계·순서 계약을 TypeScript discriminated union과
전이 함수로 옮길 때만 사용한다. 이 문서는 제품 정책을 만들지 않는다. 상태·전이는
전부 카드의 `O*` 행에서 도출하며, 카드에 없는 상태나 전이가 필요해지면 발명하지
말고 `POLICY_GAP`으로 `NEEDS_DECISION`에 돌아간다.

권위 순서는 [`frontend-implementation.md`](frontend-implementation.md)와 같다.
이 문서의 강제 도구·라이브러리 선택은 구현 휴리스틱이며 정책 출처가 아니다.

## 발동 조건

client 상태의 형태를 새로 만들거나 바꾸는 모든 변경에서 discriminated union이
**기본값**이다. 특히 다음이면 예외 없이 적용한다.

- 카드에 async·순서 역전·중복 제출·retry·timeout `O*` 행이 있다
- boolean·optional 필드 조합으로 카드의 `Never` 행을 위반하는 상태가 타입상 표현
  가능하다 (예: `isLoading && isSuccess`, `error`와 `data`가 동시에 채워짐)
- 한 흐름이 2개 이상의 관찰 가능한 UI 상태를 오간다 (제출, form 다단계, wizard, 결제)
- 같은 흐름에 두 번째 boolean flag나 두 번째 optional 필드를 추가하려 한다 —
  두 번째 flag가 필요해진 시점이 union으로 바꿀 시점이다

union을 **쓰지 않는 쪽이 예외**이며 Implementation Decision에 사유를 기록해야 한다.
허용되는 예외는 진짜 독립 boolean 하나(예: 서로 배타 상태가 없는 열림/닫힘 toggle)와
현재 props/state에서 파생 가능한 값뿐이다. 이 문서를 이유로 필요 없는 새 파일·hook을
만들지 않는다.

## 1. 카드에서 전이표를 도출한다

`O*` 행은 이미 전이의 부분 기술이다. 행을 상태 기계 어휘로 재조립한다.

| 카드 열  | 상태 기계 대응                                           |
| -------- | -------------------------------------------------------- |
| `Given`  | 출발 상태와 그 상태에서만 유효한 데이터                  |
| `When`   | 이벤트 (사용자 행동, 응답, 시간·순서 변화)               |
| `Then`   | 도착 상태와 관찰 결과                                    |
| `Never`  | 금지 상태 또는 금지 전이 — 타입으로 표현 불가하게 만든다 |
| `부작용` | 전이에 결합된 외부 write의 종류와 횟수                   |

절차:

1. 모든 `O*` 행의 `Given`·`Then`에서 상태 이름 집합을 수집한다. 같은 상태의 다른
   표현은 하나로 통일한다.
2. 모든 `When`에서 이벤트 집합을 수집한다.
3. `상태 × 이벤트` 표를 만들고 각 칸을 채운다: 카드 행 ID, 도착 상태, 부작용.
4. **빈 칸이 남으면 멈춘다.** 그 조합이 불가능하면 타입으로 표현 불가함을 기록하고,
   가능한데 카드에 없으면 `POLICY_GAP`으로 `NEEDS_DECISION`이다. "아마 무시"를
   기본값으로 채우지 않는다.
5. 전이표의 각 전이가 `O*` 행 ID를 최소 하나 참조하는지 확인한다. 참조 없는 전이는
   발명된 정책이다.

## 2. 타입 작성 규칙

```typescript
type PaymentState =
  | { status: 'editing'; amount: number; fieldErrors: FieldErrors }
  | { status: 'submitting'; amount: number; requestId: string }
  | { status: 'success'; paymentId: string }
  | { status: 'failure'; amount: number; reason: PaymentFailure }

type PaymentEvent =
  | { type: 'SUBMIT' }
  | { type: 'RESPONSE_OK'; paymentId: string }
  | { type: 'RESPONSE_ERROR'; reason: PaymentFailure }
```

- 단일 `status` 문자열 literal discriminant를 쓴다. boolean 병렬 flag
  (`isLoading`·`isError`·`isSuccess`)로 같은 흐름을 표현하지 않는다.
- 각 상태의 필드는 **그 상태에서만 의미 있는 값**만 담는다. `paymentId`는
  `success`에만, `reason`은 `failure`에만 존재한다. 전 상태 공통 optional 필드로
  합치지 않는다.
- 실패는 카드가 subtype을 구분하면 (`network`·`validation`·`5xx`) `reason`도
  discriminated union으로 만든다. 문자열 하나로 뭉개지 않는다.
- 이벤트도 같은 규칙의 union으로 만든다.
- 전이는 `(state, event) => state` **pure model function**이 소유한다. React 비의존
  함수로 두고 [`frontend-implementation.md`](frontend-implementation.md) 5절의
  소유권 표를 따른다. `useReducer`에 그대로 얹을 수 있다.
- `Given`이 특정 상태인 카드 행은 전이 함수에서 그 상태 branch 안에서만 처리한다.
  잘못된 상태에서 온 이벤트는 카드가 정한 대로 무시·오류 처리하고, 카드에 없으면
  4번 규칙대로 멈춘다.
- trust boundary(API 응답, storage, URL)에서 들어오는 값은 union으로 **파싱**해서
  받는다. 레포에 zod가 있으면 `z.discriminatedUnion()`을 쓰고, 없으면 좁히는 함수를
  경계에 둔다. 내부에서 재검증을 반복하지 않는다.
- server state는 TanStack Query의 `status`·`fetchStatus`가 이미 discriminated
  contract다. query 상태를 별도 `useState` 기계로 복사하지 않고, 카드의 상태가
  query 상태와 1:1이면 query 상태를 그대로 쓴다. 기계가 필요한 것은 query 밖의
  workflow(다단계 제출, 낙관적 롤백 순서)뿐이다.

## 3. Exhaustiveness 강제 — 세 계층

낮은 계층부터 쓰고, 상위 계층은 조건이 맞을 때만 올라간다.

| 계층       | 수단                                                                                                                                                                                                            | 조건                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 기본       | `switch` + `default: satisfies never` 또는 공용 `assertNever`                                                                                                                                                   | 항상. dependency 불필요                       |
| lint gate  | `@typescript-eslint/switch-exhaustiveness-check` — `@lodado/eslint-config`를 쓰는 레포는 `strict-types` preset을 extends, 아니면 rule 직접 설정 (plugin v8+면 `considerDefaultExhaustiveForUnions: false` 추가) | 레포가 typed lint를 이미 쓰거나 도입이 승인됨 |
| 라이브러리 | `ts-pattern` `.exhaustive()`, XState v5                                                                                                                                                                         | **설치돼 있거나 도입이 승인된 경우만**        |

- `assertNever`는 레포에 이미 있으면 재사용하고, 없으면 공용 위치 하나에만 만든다.
- lint 규칙·config 변경은 [`frontend-implementation.md`](frontend-implementation.md)의
  Hook Encapsulation Gate와 같은 절차를 따른다: 사용자 승인 후 rule ID·target glob·
  lint command를 잠그고 `oracle-run.mjs exec --label state-exhaustiveness`로 실행하며,
  조용히 dependency를 추가하지 않는다.
- JSX 안에서 상태별 분기가 표현식으로 필요하면 상태별 render를 반환하는 pure
  함수나 lookup 객체로 충분한지 먼저 확인하고, `ts-pattern`은 그것이 반복적으로
  불충분할 때 승인받아 도입한다.
- XState는 계층·병렬 상태나 actor 조율이 카드에 실제로 있을 때만 후보다. 단일
  흐름 union을 위해 도입하지 않는다.

## 4. 검증 매핑

- 전이표의 각 전이는 카드 행을 통해 이미 테스트 대상이다. 별도 "상태 기계 테스트"
  layer를 만들지 않고, `$test` 계약대로 카드 행 → 실패 테스트 매핑을 유지한다.
- 전이 함수는 pure이므로 UI 없이 `(state, event)` 표를 그대로 단위 테스트할 수
  있다. 카드 행이 UI 관찰과 부작용 횟수를 검증하는 것과 중복되지 않는 범위에서만
  추가한다.
- exported shared/package API로 상태 타입이 노출될 때만 불가능 상태가 컴파일되지
  않음을 `@ts-expect-error` type test로 증명한다. 로컬 상태에는 추가하지 않는다.

## Implementation Decision evidence · Reviewer 판정 기준

- Decision에는 도출한 상태·이벤트 집합, 전이표에서 카드로 못 돌린 빈 칸 처리,
  선택한 exhaustiveness 계층과 이유를 기록한다.
- boolean 조합이 `Never` 행을 타입상 허용하는데 union으로 만들지 않았으면
  `FINDING`이다. 전이표에 없는 전이가 구현에 있으면 `FINDING`이다.
- 같은 흐름에 병렬 boolean flag 2개 이상을 새로 도입했거나, 상태별 필드를 전 상태
  공통 optional로 합쳤거나, 상태 분기에 exhaustiveness 강제(기본 계층 이상)가 없으면
  Decision의 예외 사유 없이는 `FINDING`이다.
- union 대신 XState를 원하는 선호, 상태 이름 취향, reducer vs 개별 handler 문법
  선호만 다르면 `NON_ORACLE_OPINION`이다.

## Source Registry

구현 근거이며 정책 출처가 아니다. 실제 설치 버전 문서가 링크 내용보다 우선한다.

| 관할                     | 자료                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 개념 canon               | [Kent C. Dodds: Make Impossible States Impossible](https://kentcdodds.com/blog/make-impossible-states-impossible), [Stop using isLoading booleans](https://kentcdodds.com/blog/stop-using-isloading-booleans), Scott Wlaschin: Designing with Types, Alexis King: Parse, don't validate |
| exhaustiveness lint      | [switch-exhaustiveness-check](https://typescript-eslint.io/rules/switch-exhaustiveness-check/)                                                                                                                                                                                          |
| 라이브러리               | [ts-pattern](https://github.com/gvergnaud/ts-pattern), [XState v5 setup()](https://stately.ai/docs/setup)                                                                                                                                                                               |
| TanStack Query 상태 계약 | [TkDodo: Status Checks in React Query](https://tkdodo.eu/blog/status-checks-in-react-query)                                                                                                                                                                                             |
