# 타입 제약 — 제약 선택 순서와 작성 규칙

## 제약 선택 순서

먼저 문제가 어느 종류인지 분류한다. 소유권·상태 공간·API 관계는 서로 다른 축이라
하나의 전역 순서로 섞지 않는다 — `keyof`가 discriminated union보다 항상 뒤라는
식의 전역 순서는 없다. 각 사다리 안에서만 **앞 단부터** 검토하고, 앞 단으로 실제
오용이 닫히면 뒷 단을 쓰지 않는다. 생성 결과를 같게 만들려는 규칙이 아니라,
불필요하게 복잡한 뒷 단 메커니즘을 일관되게 탈락시키는 우선순위다.

```text
A. 소유권·boundary
   기존 owner 재사용 → 저장하지 않고 파생 → API 부재로 불가능하게
   → 외부 값은 unknown에서 runtime parse → schema·config·상수에서 타입 파생

B. 상태 공간
   framework union 소비 → capability·API 분리 → union + never
   → discriminated union → exhaustive lookup·assertNever
   → 순서 위반 자체가 도메인 오류일 때만 transition machine

C. API 관계
   typeof·as const·satisfies → keyof·indexed access
   → 내장 utility (Pick·Omit·Extract·Exclude·Parameters·ReturnType·Awaited)
   → 관계형 generic·lookup map → tagged type → const type parameter·NoInfer
   → 이산 입출력 관계 2~3개면 overload → 합성 가능한 관계면 mapped·conditional
   → 중첩 구조 자체가 계약일 때만 recursive
```

trust boundary의 parse는 선택 사항이 아니다. 서로 다른 종류의 문제는 각 사다리에서
독립적으로 판정하고, 같은 사다리 안에서 앞 단으로 닫히는 문제에 뒷 단을 쓰면
`FINDING`이다.

내장 utility로 표현되는 관계(`Awaited`·`ReturnType`·`Parameters`·`Extract`·
`Exclude`·`NonNullable`·`NoInfer`·`Readonly`·`Record`·`Pick`·`Omit`)를 custom
conditional type으로 재구현하지 않는다. 뒷 단 세 개(overload·mapped/conditional·
recursive)는 [`api-surface.md`](api-surface.md)의 격리 조건을 만족할 때만 쓴다.

## 타입 작성 규칙

**선언보다 파생.** 수기 선언은 타입 자체가 정책의 유일한 출처인 닫힌 계약 —
상태·이벤트·실패·연산 union, tagged/branded type, 공개 API의 capability·상호
배타 Props — 에만 쓴다. schema·config·상수·entity에서 계산 가능한 projection은
수기로 복제하지 않는다: entity·ID는 `z.output`, 부분집합은 `Extract`·`Exclude`,
유한 문자열 union은 `as const` 상수, 객체 key는 `keyof typeof`, 함수 관계는
`Parameters`·`ReturnType`·`Awaited`에서 파생한다. 판정 기준은 수기 선언의 개수가
아니라 **동일한 사실을 둘 이상의 위치가 소유하는지**다. 하나의 정책 사실을
schema와 interface, 상수와 union이 동시에 소유하면 두 권위가 어긋난다.

discriminated union은 **멤버마다 딸린 데이터가 실제로 다를 때** 쓴다. 아래 두 타입은
같은 도메인의 서로 다른 사실을 표현하며, 어느 쪽을 고를지는 취향이 아니라 이 조건이
정한다.

```typescript
// object union — editing에만 fieldErrors, submitting에만 requestId가 있다.
// 태그가 그 필드들의 유효 범위를 지킨다.
type PaymentState =
  | { status: 'editing'; amount: number; fieldErrors: FieldErrors }
  | { status: 'submitting'; amount: number; requestId: string }
  | { status: 'success'; paymentId: string }
  | { status: 'failure'; amount: number; reason: PaymentFailure }

// literal union — 딸린 데이터가 없다. 배지 문구·비활성 여부는 소비 지점이 정한다.
// { kind: 'paid' } 같은 wrapper로 감싸도 새로 막히는 잘못된 코드는 없다.
type PaymentBadge = 'unpaid' | 'paid' | 'refunded'
```

- 위 두 예시 중 무엇을 베낄지 먼저 판정한다. 태그 객체는 멤버 **둘 이상**이 자기만의
  필드를 가질 때만이고, 그렇지 않으면 literal union이다. 필드가 없는 멤버가 대부분인
  object union은 union을 흉내 낸 문자열이다.
- 단일 `status` 문자열 literal discriminant를 쓴다. boolean 병렬 flag
  (`isLoading`·`isError`·`isSuccess`)로 같은 흐름을 표현하지 않는다.
- 각 상태의 필드는 **그 상태에서만 의미 있는 값**만 담는다. 전 상태 공통 optional
  필드로 합치지 않는다. variant 수 자체는 variant record 도입 근거가 아니다 —
  명시 union이 더 읽기 쉬우면 상태가 많아도 유지한다. 같은 record가 상태 union과
  variant별 runtime lookup(config·renderer·메시지·권한) 중 둘 이상을 실제로
  파생하는 단일 권위일 때만 record에서 union을 파생한다:
  ```typescript
  type Steps = {
    editing: { amount: number; fieldErrors: FieldErrors }
    submitting: { amount: number; requestId: string }
  }
  type State = { [K in keyof Steps]: { status: K } & Steps[K] }[keyof Steps]
  const stepLabel = { editing: '입력 중', submitting: '처리 중' } satisfies Record<keyof Steps, string>
  ```
- **discriminant는 갈라지는 데이터가 있을 때 붙인다.** 원본 상태를 조합해 만드는
  파생 계산(`resolve*`)의 반환은 거의 언제나 literal union이다 — 태그를 씌우면
  호출부마다 `.kind`를 벗기는 비용만 늘고 막히는 잘못된 코드는 없다.
- **스키마는 경계에만 만든다.** 앱 안에서 사용자 조작으로 생성되는 유한 값은
  파싱할 외부 입력이 아니므로 `as const` 상수나 literal union으로 선언한다. zod는
  그 값이 storage·URL·응답에서 **돌아오는 읽기 지점**에 붙인다. 내부 생성 값에
  스키마를 만들어 놓고 정작 읽기 지점이 `JSON.parse` 결과를 그대로 신뢰하면
  경계를 정반대로 잡은 것이며 `FINDING`이다.
- 실패는 카드가 subtype을 구분하면 (`network`·`validation`·`5xx`) `reason`도
  discriminated union으로 만든다. 문자열 하나로 뭉개지 않는다. 예상 가능한 실패를
  반환값으로 처리해야 하면 `Result<T, ErrorUnion>` 형태의 닫힌 union을 쓰고,
  `throw`는 결함(깨진 invariant) 전용으로 남긴다.
- trust boundary(API 응답, storage, URL, message)의 값은 `unknown`에서 시작해
  **파싱**으로 도메인 타입을 획득한다. 레포에 zod가 있으면 `z.discriminatedUnion()`
  을 쓰고 타입은 `z.output`으로 파생한다 — 스키마와 interface를 중복 선언하지
  않는다. 응답에 `as DomainType` 단언을 쓰지 않는다.
- mutation payload는 entity의 `Partial`이 아니라 실제 연산 union으로 모델링한다
  (`rename`·`clear-description`처럼). `undefined`가 "유지"인지 "삭제"인지 모호한
  patch 타입을 만들지 않는다. 유지·설정·삭제가 모두 가능하면 연산을 분리한다.

## 런타임보다 강하게 말하지 않는다

타입은 구현이 실제로 보장하는 범위까지만 약속한다. 아래는 컴파일은 되지만
런타임보다 강한 거짓 계약이다.

- **`Record<K, V>`는 totality 계약이다** — 모든 `K`가 결과에 존재한다는 뜻이다.
  구현이 관찰된 key만 채우는 sparse lookup(`groupBy` 결과 등)이면, key 도메인이
  유한 union일 때 `Partial<Record<K, V>>`를, ID·브랜드 문자열처럼 열린 도메인이면
  `Map<K, V>`를 쓴다. 열린 key에 `Partial<Record<K, V>>`를 씌우면 `Map`이 이미
  주는 `V | undefined` 조회 계약을 손으로 다시 만들 뿐이다. 전체 key를 사전 순회로
  초기화하거나 누락 key에 기본값을 채울 때만 `Record<K, V>`다. 이것은
  `Partial<DomainEntity>` mutation 금지와 다른 문제다 — 전자는 연산 의미를 잃는
  patch고, 후자는 일부 key만 런타임에 존재한다는 결과 표현이다.
- **type predicate는 검사 의무가 있다.** `value is T`는 본문이 `T`의 필수
  invariant를 실제로 검사할 때만 쓴다. 항상 `true`를 반환하거나, `as`를 감싸거나,
  일부 필드만 검사하고 전체 도메인 타입을 약속하는 predicate를 만들지 않는다.
  boundary의 복잡한 도메인 타입은 predicate 수기 조립 대신 schema parser가
  우선이고, `isNotNil` 수준의 단순·정확한 narrowing만 predicate로 남긴다.
- **wrapper의 반환 계약은 실행 시점을 따른다.** `Parameters<F>`로 호출 계약은
  보존하되, `ReturnType<F>`는 wrapper가 같은 호출에서 실제 값을 반환할 때만
  보존한다. debounce·schedule처럼 실행이 지연되면 즉시 반환형은 `void`, 캐시
  반환이면 `ReturnType<F> | undefined`, async wrapper면
  `Promise<Awaited<ReturnType<F>>>`처럼 런타임 의미를 그대로 쓴다.
- **excess property check는 sanitizer가 아니다.** object literal 대입에만
  적용되며, `const user: PublicUser = source` 같은 annotation은 `source`의 민감
  필드를 런타임에서 제거하지 않는다. 민감 필드 제거·exact object 보장은 runtime
  projection이나 parser가 소유한다.
- **key remapping 반환형은 런타임과 동형이어야 한다.** 함수가 실제로 key를
  변환하지 않는데 `ToCamelCaseKeys<T>` 같은 key 변환 반환 타입만 붙이면 거짓
  계약이다.

## Exhaustiveness 강제

dependency 없는 수단부터 쓰고, 라이브러리는 조건이 맞을 때만 도입한다.

- 기본 (항상, dependency 불필요): 상태별 early return·guard chain 뒤 공용 `assertNever`
- 선언적 매핑 (상태별 결과가 정적 값·render 함수일 때): lookup 객체 +
  `satisfies Record<Status, ...>`. key는 **분기하는 union 그 자체**다 — 문자열
  literal union이면 `Record<DisplayStatus, string>`, discriminated object union일
  때만 `Record<State['status'], string>`처럼 indexed access로 태그를 꺼낸다.
- 라이브러리 (**설치돼 있거나 도입이 승인된 경우만**): `ts-pattern`의 `.exhaustive()`

variant별 설정(라벨·메시지·핸들러·권한)도 `satisfies Record<Union, Config>`로
전체 union 커버를 강제한다. 새 variant 추가 시 모든 필수 소비 지점이 컴파일
오류로 드러나야 하며, catch-all 기본 분기로 누락을 숨기지 않는다.

**라벨 맵이 필요하다는 사실은 태그 객체를 만들 근거가 아니다.** `satisfies Record`는
literal union에 그대로 걸린다. 배지 문구·권한 맵을 쓰려고 `{ kind: 'confirmed' }`
같은 wrapper를 만들면 union 판정을 뒤집는 것이므로 위 discriminant 규칙이 우선한다.

타입 **형태** 일부는 기계로 잡는다. `@lodado/eslint-config/local-rules`를 쓰는
레포는 다음 규칙이 이미 켜져 있다.

- `no-response-type-assertion`: boundary payload를 파싱 대신 `as`로 단언
- `require-discriminated-state`: `status` literal union 옆의 optional 형제 필드
- `no-boolean-state-flags`: 한 흐름을 병렬 boolean flag나 boolean `useState` 2개로 표현
- `no-action-in-state`: state union·state 값 안에 저장된 `retry` 같은 action

`assertNever`는 레포에 이미 있으면 재사용하고, 없으면 공용 위치 하나에만 만든다.

## 단언과 `any` 정책

제품 코드에서 `value as DomainType`, `as unknown as`, non-null assertion,
`@ts-ignore`, `any`로 타입 오류를 숨기지 않는다. 허용은 네 가지뿐이다:
literal 보존용 `as const`, 검증 함수 내부에 격리된 브랜드 생성자, 라이브러리
한계를 잇는 adapter 내부 단언, 공용 generic helper 내부 한 지점의 construction
assertion. 마지막은 TypeScript가 점진적 객체 구성을 증명하지 못하는
`const result = {} as Pick<T, K>` 같은 경우로, 공개 반환 타입이 입력 generic에서
기계적으로 도출되고 구현이 그 invariant를 실제로 만들며 소비자 호출부에 `as`가
전파되지 않을 때만이다 — boundary 값을 도메인 타입으로 바꾸는 데는 쓰지 않는다.
격리된 단언에는 런타임 invariant 근거를 남긴다. 외부 패키지가 `any`를 반환하면
즉시 `unknown`으로 받아 좁힌다.

`any` 금지는 application 값 기준이다. `(...args: any[]) => unknown` 같은 callable
constraint처럼 `any`가 generic 연결에만 쓰이고 값으로 읽히거나 공개 반환형·Props로
누출되지 않으면 `types/internal`·adapter 안에서만 허용한다. `unknown`으로 되는
자리는 `unknown`을 쓴다.

## 규칙을 코드 주석으로 옮기지 않는다

이 문서의 규칙과 그 근거(`Record`는 totality 계약이다, sparse면 `Map`이다)는 왜
그 타입을 골랐는지에 대한 설명이지 코드가 담을 내용이 아니다. 선택 사유는
Implementation Decision에 적고, 코드 주석은 타입으로 표현할 수 없는 도메인 제약과
그 근거 카드 행 ID(`// P6: 취소는 되돌릴 수 없다`)만 남긴다. 규칙 문장을 그대로
붙여 넣은 주석은 리뷰에서 삭제 대상이다.

타입 오류가 나면 구현이 계약을 위반했는지, 계약이 실제 요구사항과 다른지 먼저
판정한다. 근거 없이 필수 필드를 optional로 바꾸거나 union을 `string`으로 넓혀서
오류를 없애지 않는다.
