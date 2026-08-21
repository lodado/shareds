# 타입 제약 설계 — AI 비결정성을 컴파일 계약으로 줄인다

## 목적과 권위

카드에 async·순서 역전·중복 제출·retry·다단계 상태 `O*` 행이 있거나, client 상태·
Props·boundary 타입의 형태를 새로 만들거나 바꿀 때 사용한다. 이 문서는 제품 정책을
만들지 않는다. 상태·전이·오류 분류는 전부 카드의 `O*` 행에서 도출하며, 카드에 없는
상태나 전이가 필요해지면 발명하지 말고 `POLICY_GAP`으로 `NEEDS_DECISION`에 돌아간다.

권위 순서는 [`frontend-implementation.md`](frontend-implementation.md)와 같다.
이 문서의 도구·라이브러리 선택은 구현 휴리스틱이며 정책 출처가 아니다.

모든 설계는 다음 질문으로 판정한다.

> AI가 생성할 수 있었던 잘못된 코드 중 **무엇이 이제 컴파일되지 않는가?**

이 질문에 구체적으로 답할 수 없는 타입 복잡성은 추가하지 않는다. AI 생성 자체는 계속
비결정적이다. 이 문서의 목표는 동일한 source·TypeScript·tsconfig에서 후보를 같은
결과로 통과·거절하는 **수용 판정 결정성**이다.

컴파일 통과는 건전성 증명이 아니라 결정적 고효율 필터다. TypeScript는 의도적으로
불건전하고(bivariance, 리터럴에만 적용되는 excess property check), 필터 강도는
tsconfig·컴파일러 버전의 함수다. 전제 환경 검증은
[`type-environment.md`](type-environment.md)가 소유한다 — 레포당 1회 검증하고
여기서는 반복하지 않는다.

## 제약 소유권

| 대상                                      | 담당                                        |
| ----------------------------------------- | ------------------------------------------- |
| 값·Props·상태 조합·입출력 관계            | 타입                                        |
| API·storage·URL·message 같은 외부 입력    | `unknown`에서 runtime parser                |
| 관찰 가능한 제품 행동                     | `$test`                                     |
| 순서 역전·중복 제출·retry·unmount 후 도착 | abort signal·pending guard·멱등키·서버 검증 |
| 같은 prompt의 생성 재현성                 | 모델·provider — 이 문서가 보장하지 않음     |

시간축은 타입으로 증명되지 않는다. union을 만들었다고 순서 문제가 "해결됨"이라고
선언하면 `FINDING`이다. 남은 시간축 비결정성과 그 런타임 방어는 Implementation
Decision에 반드시 기록한다. type-valid를 behavior-correct로 보고해도 `FINDING`이다.

설계 전에 변경 대상에서 아래 여섯 지점을 찾고, **컴파일되지 않아야 할 잘못된
사용을 최소 세 개 먼저 적는다** — exported API면 그대로 `.test-d.ts`의
`@ts-expect-error` 케이스가 된다.

| 찾을 것 | 예                                            | 치환                                 |
| ------- | --------------------------------------------- | ------------------------------------ |
| 값      | 넓은 `string`·`number`·`Date`                 | 브랜드·의미 타입                     |
| 조합    | 관련 boolean 여러 개, 배타적인 optional Props | discriminated union, union + `never` |
| 관계    | mode가 값·반환 타입을 결정하는데 타입에 없음  | generic lookup map, 별도 컴포넌트    |
| 경로·키 | route·query key·field path 자유 문자열        | factory·`keyof`·파생 union           |
| 결과    | 성공·실패·부재·유지·삭제가 `undefined` 하나에 | `Result`·연산 union                  |
| 확장    | 소비자가 확장할 key가 `string`으로 열림       | typed registry·module augmentation   |

## 상태 설계 사다리

union 작성은 3단이다. 1·2단에서 끝나는 문제에 3단을 쓰지 않는다.

1. **파생 가능하면 저장하지 않는다.** 원본에서 계산한다(`itemCount = items.length`).
   타입이 강해도 중복 저장된 상태는 한쪽만 갱신된다.
2. **라이브러리가 이미 union을 소유하면 그대로 소비한다.** TanStack Query의
   `status`·`fetchStatus`, mutation의 `isPending`/`isSuccess`/`isError`는 이미
   discriminated contract고 최신 호출 기준 시간축 처리까지 포함한다. 같은 상태를
   `useState` 기계로 복사하지 않는다. 필수 파라미터가 없으면 non-null assertion
   대신 `skipToken` 또는 API 부재로 표현한다.
   **로딩·로드 실패의 기본은 컴포넌트 분기가 아니라 경계다.** 무조건 실행되는 첫
   조회는 `useSuspenseQuery`를 기본으로 두고 loading·error 분기를 국소
   `<Suspense>`와 Error Boundary로 올려 컴포넌트 본문에서 제거한다. 상황별 판정
   표는 [`frontend-implementation.md`](frontend-implementation.md) 3절이 소유하며
   이 문서가 그 기본값을 덮지 않는다. 조건부 query·placeholder·취소 제약처럼
   경계로 올릴 수 없는 나머지에만 분기를 남기고, 그때도 자작 union 없이 라이브러리
   union에 ts-pattern을 직접 물린다
   (`match(mutation).with({ status: 'error', error: { code: 'CONFLICT' } }, …)`).
   같은 이유로 **기존 query·framework 상태를 최우선으로 재사용한다.** 이미 있는
   query API·router state·form state로 표현되는 서버 상태를 직접 관리하는 hook으로
   다시 만들지 않는다. 카드가 요구하는 데이터가 기존 경계에 없을 때만 3단으로
   내려간다.
3. **그래도 남는 진짜 client 상태만 `useState<Union>` + 의도 함수 hook으로 만든다.**
   raw `setState`·setter를 hook 밖으로 노출하지 않고, 도메인 의도를 표현하는 함수
   (`pick`, `submit`, `reset`)만 반환한다. 잘못된 상태에서 온 호출은 카드가 정한
   대로 무시·오류 처리하고, 카드에 없으면 `POLICY_GAP`으로 `NEEDS_DECISION`이다.

reducer·전이표·상태 기계는 기본값이 아니다. 순서 위반 자체가 카드의 도메인 오류인
흐름(결제·다단계 제출·낙관적 롤백)에서만, 새 state-machine dependency는 필요가
입증될 때만 쓴다. XState는 계층·병렬 상태나 actor 조율이 카드에 실제로 있을 때만
후보이며, 설치돼 있거나 도입이 승인된 경우만 쓴다.

**카드에 `## State Model`이 있다는 사실만으로** Event union·전이 함수·transition
command 같은 런타임 기계를 만들지 않는다. 카드의 State Model은 정책을 빠짐없이
적어 두는 표기이고, 그 정책을 무엇으로 구현할지는 이 사다리가 정한다. 단순 조회
하나의 로딩·성공·실패는 2단에서 끝나며, 3단에서도 필요한 것은 상태 union 하나와
의도 함수 몇 개다.

### 상태 소유권은 하나다

하나의 async 흐름에는 canonical state owner를 하나만 둔다. TanStack Query처럼
framework가 상태를 소유하면 그 결과를 `NextPageState` 같은 새 `status` union으로
재포장하거나 같은 의미의 application 타입으로 복제하지 않는다. 공통 UI가 전체
lifecycle이 아니라 다음 행동 가능 여부만 필요하면 `onLoadMore?: () => void`처럼
callback 존재 자체가 capability가 되게 한다. loading·error·retry 표시는 원래 query를
소유한 feature가 렌더링한다. 카드의 State Model은 정책 명세이지 구현마다 union을
생성하라는 명령이 아니다.

## 상태는 데이터, action은 형제

**상태는 데이터만 담는다.** union 멤버의 필드는 그 상태에서 참인 값이고, action은
그 값으로 다음에 할 수 있는 일이다. 둘은 수명이 다르므로 한 값에 섞지 않는다.

- `retry`·`submit`·`reset` 같은 함수를 state 값에 저장하지 않는다. 저장한 함수는
  그것을 만든 render의 closure에 고정되므로, 이후 props·param이 바뀌어도 낡은 값을
  계속 캡처한다. `@lodado/eslint-config/local-rules`를 쓰는 레포에서는
  `no-action-in-state`가 타입과 값 양쪽에서 이 형태를 잡는다.
- action은 **hook 반환 객체의 sibling**으로 준다 (`{ state, retry }`). 서버 상태면
  새 action을 만들지 말고 query의 `refetch`를 그대로 다시 노출한다.
- 어떤 상태에서 쓸 수 없는 action은 만들지 않는다. `retry: () => undefined`처럼
  타입을 맞추려고 넣는 no-op action은 UI에 "재시도할 수 있다"는 거짓 정보를 준다.
  action이 상태별로 달라지면 상태를 좁힌 자식에 좁힌 action을 넘긴다.
- 잘못된 입력(파싱 실패한 ID, 없는 route param)은 **UI 동작·문구가 실제로 다를 때만
  별도 상태로 나눈다.** 화면과 복구 경로가 같으면 기존 실패 상태에 합치고, 나누면
  그 상태만의 필드와 action을 각각 채운다. 카드에 구분이 없으면 발명하지 말고
  `POLICY_GAP`으로 `NEEDS_DECISION`이다.

```typescript
// 금지 — 상태에 action이 들어가 stale closure와 가짜 retry가 동시에 생긴다
type DetailState = { status: 'loading' } | { status: 'failure'; retry: () => void }

// 허용 — 상태는 데이터, action은 형제
type DetailState = { status: 'loading' } | { status: 'failure'; reason: LoadFailure }
function useDetail(id: DetailId): { state: DetailState; retry: () => void }
```

## 카드에서 상태를 도출한다

카드에 `## State Model` 섹션이 있으면 그것이 상태·이벤트·전이의 유일한 출처다.
섹션은 선택이라 대부분의 카드에는 없다 — 없으면 `O*` 행의 `Given`·`When`·`Then`에서
직접 도출하며, 섹션이 없다는 사실은 전이표·상태 기계를 만들 이유가 아니라 만들지
않을 이유다.

| 카드 열  | 타입 대응                                                |
| -------- | -------------------------------------------------------- |
| `Given`  | 출발 상태와 그 상태에서만 유효한 필드                    |
| `When`   | 이벤트 (사용자 행동, 응답, 시간·순서 변화)               |
| `Then`   | 도착 상태와 관찰 결과                                    |
| `Never`  | 금지 상태 또는 금지 전이 — 타입으로 표현 불가하게 만든다 |
| `부작용` | 전이에 결합된 외부 write의 종류와 횟수                   |

`상태 × 이벤트`에서 빈 조합은 불가능(타입으로 표현 불가)인지 미결 정책인지
구분한다. 미결이면 `NEEDS_DECISION`이며 "아마 무시"를 기본값으로 채우지 않는다.
카드 행 ID를 참조하지 않는 전이는 발명된 정책이다.

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
recursive)는 「Props와 API 표면」의 격리 조건을 만족할 때만 쓴다.

## 타입 작성 규칙

**선언보다 파생.** 수기 선언은 타입 자체가 정책의 유일한 출처인 닫힌 계약 —
상태·이벤트·실패·연산 union, tagged/branded type, 공개 API의 capability·상호
배타 Props — 에만 쓴다. schema·config·상수·entity에서 계산 가능한 projection은
수기로 복제하지 않는다: entity·ID는 `z.output`, 부분집합은 `Extract`·`Exclude`,
유한 문자열 union은 `as const` 상수, 객체 key는 `keyof typeof`, 함수 관계는
`Parameters`·`ReturnType`·`Awaited`에서 파생한다. 판정 기준은 수기 선언의 개수가
아니라 **동일한 사실을 둘 이상의 위치가 소유하는지**다. 하나의 정책 사실을
schema와 interface, 상수와 union이 동시에 소유하면 두 권위가 어긋난다.

```typescript
type PaymentState =
  | { status: 'editing'; amount: number; fieldErrors: FieldErrors }
  | { status: 'submitting'; amount: number; requestId: string }
  | { status: 'success'; paymentId: string }
  | { status: 'failure'; amount: number; reason: PaymentFailure }
```

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
  구현이 관찰된 key만 채우는 sparse lookup(`groupBy` 결과 등)이면
  `Partial<Record<K, V>>` 또는 `Map<K, V>`를 쓴다. 전체 key를 사전 순회로
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

## Props와 API 표면

### 공용 API 승격 델타

exported shared/package API를 만들거나 바꿀 때는 구현 타입보다 **호출부 먼저** 쓴다.
대표 제품 호출부에서 컴파일러가 추론할 수 있는 component generic을 명시하지 않는 것을
목표로 하고, config 정의처럼 값만으로 Row를 추론할 수 없는 경계에서만 generic을 한 번
고정한다. 이후 아래 델타만 설계한다.

1. 대표 정상 호출부를 명시적 component type argument 없이 작성한다.
2. 변경 전 허용되던 넓은 값·optional 조합·끊어진 관계 중 실제 오용을 적는다.
3. 값·조합·관계·경로·결과·확장 중 이번 API가 닫아야 할 항목만 고른다.
4. schema·config·`as const` 값에서 key와 union을 파생하고 수기 권위를 늘리지 않는다.
5. controlled surface와 현재 제품이 쓰는 mode만 공개하고 나머지는 API 부재로 둔다.
6. type test에 generic 명시 없는 대표 정상 호출 1개와 컴파일되지 않아야 할 사용 최소
   3개를 함께 둔다. JSX를 쓰면 파일은 `.test-d.tsx`로 만든다.

정상 호출도 추론되지 않으면 부정 테스트가 통과해도 좋은 공개 API가 아니다. helper의
추론을 보존하거나 generic을 단순화하고, 호출부가 같은 type argument를 반복하게 두지
않는다.

새로 설계하는 exported shared/package API에서 generic 자체는 목표가 아니다. 둘 이상의
public 위치 사이 관계를 만들고, 일반 제품 호출부에서 자동 추론되며, 추론 권위가 하나이고,
구체적 오답을 컴파일 실패시키는 경우에만 쓴다. config·schema 정의 경계의 1회 고정은
허용한다. 하나라도 아니면 concrete type·파생 union·API 분리를 우선한다.

- 상호 배타 Props는 union + `never`로 표현한다 (`href` 있는 link와 `onClick` 있는
  action, controlled `value`와 uncontrolled `defaultValue`). 전부 optional인 한
  객체로 만들지 않는다.
- union 상태를 자식에 통째로 내리지 않는다. `Extract<State, { status: 'failure' }>`
  로 좁힌 variant만 전달하고, 자식 안에서 재분기하지 않는다.
- 유한한 문자열 집합은 `as const` 상수 하나에서 union·schema·registry를 파생한다.
  route·query key·analytics event 이름은 factory를 경유하고 호출부에서 문자열을
  조립하지 않는다.
- 같은 원시 타입인데 혼동 시 실제 장애가 나는 값(서로 다른 ID, 단위, 검증 완료
  값)만 tagged/branded type을 쓴다. 생성은 검증 함수 한 곳에 격리한다. 모든
  문자열을 브랜드화하지 않는다.
- helper는 타입 추론을 보존한다. 반환 타입을 넓게 annotation하거나 호출부에
  generic 반복을 요구하는 helper는 만들지 않는다 (`queryOptions` 패턴).
- literal factory는 `const` type parameter로 호출부의 `as const` 반복 없이
  key·tuple literal 추론을 보존한다. 여러 인자 중 하나만 추론 권위면 나머지
  인자에 `NoInfer`를 붙여 추론 지점을 하나로 고정한다:
  ```typescript
  function defineRoutes<const T extends readonly string[]>(paths: T): T
  function pick<T>(options: readonly T[], fallback: NoInfer<T>): T
  ```
- 입력을 변경하지 않는 함수는 `readonly T[]`를 받는다.
- mode가 값·반환 타입을 기계적으로 결정하면 generic lookup map으로 관계를
  보존한다 (`{ single: Id | null; multiple: ReadonlySet<Id> }[M]`). mode별
  hook·lifecycle·사용 의미가 다르면 generic 대신 별도 컴포넌트로 나눈다
  (`Calendar.Single`·`Calendar.Range`). 제품이 일부 mode만 쓰면 그 mode만
  구현하고 mode prop 자체를 만들지 않는다.
- 제품 컴포넌트는 controlled-first — 한 값의 권위를 하나로 유지한다.
  uncontrolled 병행 지원은 범용 라이브러리를 만들 때만 한다.
- 닫힌 union(도메인 상태·오류·이벤트)과 소비자가 확장하는 열린 집합(플러그인
  key, 앱 query key)을 구분한다. 열린 집합은 넓은 `string`이 아니라 typed
  registry나 module augmentation으로 연다.
- 타입 오류 메시지도 공개 API 품질이다. 소비자가 볼 오류가 "X is not assignable
  to CalendarDate | null" 수준으로 읽히지 않으면 generic을 단순화하거나 API를
  나눈다.
- 소비 루프에 단언이 필요하면 API 형태가 틀린 것이다. union·mapped 타입 config를
  소비자가 `map`으로 펼치는 순간 key↔value 관계가 끊긴다. 관계는 값 생성 시점에
  묶고(`accessor(key, { cell })`이 `render(row)`를 반환), 남는 단언은 그 생성
  함수 안 한 줄로 격리한다. 정의 지점만 닫고 소비 지점에 `as`를 남기는 설계는
  공용 API 승격 실격이다.
- 공개 variant가 2~3개고 입·출력 타입 관계만 다르면 overload를 검토한다.
  variant마다 동작이 다르면 overload 대신 API를 분리한다.
- mapped·conditional·recursive 타입 계산은 공용 라이브러리의 `types/internal`에
  격리하고 type test를 함께 둔다. feature 컴포넌트 안에 자작 고급 utility를
  작성하지 않는다. Props에 generic이 4개 이상 노출되면 공개 API 분리를 검토한다.

## Exhaustiveness 강제

dependency 없는 수단부터 쓰고, 라이브러리는 조건이 맞을 때만 도입한다.

| 계층        | 수단                                                   | 조건                                   |
| ----------- | ------------------------------------------------------ | -------------------------------------- |
| 기본        | 상태별 early return·guard chain 뒤 공용 `assertNever`  | 항상. dependency 불필요                |
| 선언적 매핑 | lookup 객체 + `satisfies Record<State['status'], ...>` | 상태별 결과가 정적 값·render 함수일 때 |
| 라이브러리  | `ts-pattern`의 `.exhaustive()`                         | **설치돼 있거나 도입이 승인된 경우만** |

variant별 설정(라벨·메시지·핸들러·권한)도 `satisfies Record<Union, Config>`로
전체 union 커버를 강제한다. 새 variant 추가 시 모든 필수 소비 지점이 컴파일
오류로 드러나야 하며, catch-all 기본 분기로 누락을 숨기지 않는다.

타입 **형태** 일부는 기계로 잡는다. `@lodado/eslint-config/local-rules`를 쓰는
레포는 다음 규칙이 이미 켜져 있다.

| 규칙                          | 잡는 것                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `no-response-type-assertion`  | boundary payload를 파싱 대신 `as`로 단언                    |
| `require-discriminated-state` | `status` literal union 옆의 optional 형제 필드              |
| `no-boolean-state-flags`      | 한 흐름을 병렬 boolean flag나 boolean `useState` 2개로 표현 |
| `no-action-in-state`          | state union·state 값 안에 저장된 `retry` 같은 action        |

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

타입 오류가 나면 구현이 계약을 위반했는지, 계약이 실제 요구사항과 다른지 먼저
판정한다. 근거 없이 필수 필드를 optional로 바꾸거나 union을 `string`으로 넓혀서
오류를 없애지 않는다.

## 검증 매핑

- 카드 행 → 실패 테스트 매핑은 `$test` 계약대로 유지한다. 별도 "타입 테스트
  layer"를 전 상태에 만들지 않는다.
- exported shared/package API로 상태·Props 타입이 노출될 때만 불가능 사용이
  컴파일되지 않음을 `@ts-expect-error` type test(`.test-d.ts`, JSX면 `.test-d.tsx`,
  또는 vitest `expectTypeOf`)로 증명한다. generic API면 명시적 type argument가 없는
  대표 정상 호출도 같은 typecheck에서 증명한다. 해당되면 readonly·`as const`
  tuple 입력 수용, type predicate narrowing, literal의 `string` widening 미발생도
  같이 검증한다. 각 `@ts-expect-error`에는 어떤 오용을 차단하는지 한 줄 이유를
  적는다. 로컬 상태에는 추가하지 않는다.
- Implementation Decision에는 (1) 도출한 상태·이벤트 집합과 카드 행 매핑,
  (2) 선택한 사다리 단과 exhaustiveness 계층, (3) **이제 컴파일되지 않는 잘못된
  사용 목록과 실패 증거**, (4) 타입으로 못 잡아 런타임으로 방어한 행동·시간축 항목을
  기록한다.

## Reviewer 판정 기준

- boolean 조합이 카드 `Never` 행을 타입상 허용하는데 union으로 만들지 않았으면
  `FINDING`이다. 카드에 없는 전이가 구현에 있으면 `FINDING`이다.
- boundary 값을 파싱 없이 단언했거나, `any`가 application 계층으로 새거나,
  `Partial<DomainEntity>` mutation을 도입했으면 `FINDING`이다.
- 파생 가능한 값을 별도 상태로 저장했거나, query·mutation 상태를 로컬 기계로
  복사했거나, raw setter를 hook 밖으로 노출했거나, 스키마·연산 union에서 파생
  가능한 타입을 수기로 복제 선언했으면 `FINDING`이다.
- 기존 query·router·form 상태를 이름만 바꾼 새 `status` union으로 재포장했거나,
  단일 capability만 필요한 공통 UI에 전체 lifecycle 타입을 만들었으면 `FINDING`이다.
- state union이나 state 값에 action을 저장했거나, 쓸 수 없는 상태에 no-op action을
  채웠거나, 기존 `refetch`가 있는데 같은 일을 하는 action을 새로 만들었으면
  `FINDING`이다.
- 카드의 State Model을 근거로 단순 조회에 Event union·전이 함수·transition command를
  도입했으면 `FINDING`이다. 사다리 단 선택 사유가 Implementation Decision에 있으면
  아니다.
- 무조건 실행되는 첫 조회의 loading·error를 경계로 올리지 않고 컴포넌트 안에서
  분기했으면 `FINDING`이다. 조건부 query·placeholder·취소 제약 같은 실제 실격
  사유를 Implementation Decision에 적었으면 아니다.
- 사다리 1·2단으로 끝나는 문제에 union·기계를 도입했거나, 상태 분기에
  exhaustiveness 강제(기본 계층 이상)가 없으면 Decision의 예외 사유 없이는
  `FINDING`이다.
- 앞 단 메커니즘으로 닫히는 문제에 뒷 단 타입을 썼거나, feature 코드에 자작
  mapped·conditional·recursive utility가 있거나, 내장 utility 재구현이나 type
  test 없는 고급 utility가 있으면 `FINDING`이다.
- 구현이 모든 key를 채우지 않는데 `Record<K, V>`로 total map을 약속했거나, 실행이
  지연·캐시되는 wrapper가 즉시 `ReturnType<F>`를 반환한다고 선언했으면
  `FINDING`이다. sparse lookup 결과의 `Partial<Record<K, V>>`는
  `Partial<DomainEntity>` mutation 금지의 대상이 아니다 — 둘을 같은 규칙으로
  금지하면 오적용이다.
- 필수 invariant를 검사하지 않는 type predicate, runtime key 변환 없는
  key-remapping 반환형, `satisfies`·`as const`·annotation·excess property check를
  runtime 검증이나 sanitization으로 보고한 것, 단일 권위 없이 선언 줄 수만 줄이는
  variant record는 `FINDING`이다.
- 이번 변경에서 새로 설계한 exported shared/package API의 generic이 둘 이상의 public
  위치 사이 관계를 만들지 않거나 일반 제품 호출부가 type argument를 반복해야 하면
  `FINDING`이다. config·schema 정의 경계의 1회 고정과 기존 library generic 사용은
  대상이 아니다.
- 시간축 비결정성을 타입만으로 "해결됨" 처리했으면 `FINDING`이다.
- 생성 후 typecheck를 실행했을 뿐인데 생성 자체를 결정론화했다고 보고하면
  `FINDING`이다.
- 구현 diff가 `.test-d.*`의 `@ts-expect-error` 케이스를 삭제·약화했거나, 계약
  타입·스키마를 넓혀(필수 필드→optional, union→`string`) 타입 오류를 없앴는데
  카드 행 인용이 없으면 `FINDING`이다. 계약 파일은 검수의 신뢰 뿌리다 — 완화는
  구현 결정이 아니라 정책 변경이며 `POLICY_GAP`으로 `NEEDS_DECISION`이다.
- 상태 이름 취향, reducer 대 개별 handler 문법 선호, 패턴 매칭 라이브러리 선호만  
  다르면 `NON_ORACLE_OPINION`이다.
