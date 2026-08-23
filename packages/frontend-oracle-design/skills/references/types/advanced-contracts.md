# 타입 제약 — 고급 타입 계약과 compiler witness

## 읽는 시점과 적용 범위

- **로드** — 타입 작업마다 [`state-ladder.md`](state-ladder.md)·[`authoring.md`](authoring.md)·[`api-surface.md`](api-surface.md)와 함께 항상.
- **대상** — custom exported generic, mapped·conditional·template-literal·recursive type, variance-sensitive callback, deep transform의 설계·변경·리뷰. feature-local 상태·단순 Props·내장 utility로 닫히는 관계는 제외.
- **채택** — 금기가 아니라 **적극 검토 후보**다. 앞 단으로 닫히지 않으면 카탈로그에서 후보를 올리되, 선택 gate와 compiler witness packet을 통과할 때만 쓴다. 고급 타입은 학습 목표가 아니라 AI가 만든 공개 타입 계약을 컴파일러로 거절 가능하게 만드는 수단이다.

권위 순서는 항상 대상 레포의 lockfile·실효 `tsconfig`·설치된 TypeScript가 먼저다.
TypeScript Playground, latest compiler, challenge corpus에서만 통과하는 결과는 증거가
아니다. 외부 자료는 `implementation-reference`이고 제품 정책 출처가 아니다.

## 선택 gate

[`authoring.md`](authoring.md)의 사다리를 먼저 탄다. 앞 단에서 실제 오용이 닫히면 여기서
멈춘다.

1. API 부재·API 분리로 잘못된 조합을 만들 수 없게 한다.
2. schema·config·`as const` 값에서 `typeof`·`keyof`·indexed access·`satisfies`로 파생한다.
3. 내장 utility(`Pick`·`Omit`·`Extract`·`Exclude`·`Parameters`·`ReturnType`·`Awaited`·`NoInfer`·`Record`)를 쓴다.
4. 이미 설치된 production library type을 재사용한다.
5. 대표 제품 호출부에서 자동 추론되는 최소 generic을 쓴다.
6. 그래도 관계가 닫히지 않을 때만 mapped·conditional·template-literal·recursive type을
   `types/internal`에 격리한다.

feature 코드에 challenge 풀이식 helper를 바로 두거나, custom type으로 내장 utility를
재구현하면 `FINDING`이다.

## 고급 테크닉 카탈로그

Type Challenges와 type-fest·zod·TanStack 같은 오픈소스에서 검증된 패턴이다. 각 항목은
**닫는 관계**와 **함정**을 함께 본다. gate 6단에 도달했을 때 이 카탈로그에서 후보를
고르고, 채택하면 witness packet을 남긴다.

- **`infer X extends Y`** — 추론 결과를 같은 절에서 제약해 중첩 conditional을 줄인다
  (template literal 안 `${infer N extends number}` 등). TS 4.7+.
- **variadic tuple type + labeled element** — wrapper가 인자 개수·이름을 보존한다
  (`(...args: [...A, onDone: () => void]) => void`). 넓어진 배열을 spread하면 tuple
  구조와 label을 잃는다.
- **key remapping 필터** — `{ [K in keyof T as T[K] extends V ? K : never]: T[K] }`로
  값 형태 기준 key를 선별한다(`PickByValue`류). `as` remap은 homomorphic 판정을 바꿀
  수 있으므로 modifier 보존 witness를 함께 둔다.
- **DistributiveOmit·DistributivePick** — 내장 `Omit`은 union에 분배되지 않고 공통
  key로 붕괴시킨다. union 멤버별 보존이 계약이면 `T extends unknown ? Omit<T, K> : never`로 분배를 명시하고 negative witness로 고정한다.
- **tail-recursive accumulator** — 재귀 타입은 accumulator 파라미터로 꼬리 재귀화해
  instantiation depth 한계(`TS2589`)를 늦춘다. 채택 시
  [`../type-environment.md`](../type-environment.md)의 `--extendedDiagnostics` 전후값이
  필수다.
- **homomorphic vs non-homomorphic mapped type** — `{ [K in keyof T]: … }` 형태만
  `readonly`·optional modifier를 보존한다. key 원천이 `keyof T`가 아니면 보존 규칙이
  달라지므로 아래 semantics 규칙의 modifier 테스트를 적용한다.
- **branded type의 두 구현** — string tag(`{ __brand: 'UserId' }`)는 구조적으로 위조
  가능하고, `unique symbol` 브랜드는 선언 모듈 밖에서 위조할 수 없다. 패키지 경계를
  넘는 계약이면 symbol 브랜드를 우선한다. 대상 선정 기준은
  [`api-surface.md`](api-surface.md)의 브랜드 규칙을 따른다.
- **금지: union 순서 의존 타입** — `UnionToTuple`류는 union 멤버 순서가 컴파일러 내부
  사정이라 비결정적이다. 제품 코드에 두지 않는다. `Equal<A, B>` helper 단독의 public
  검증 금지는 [`api-surface.md`](api-surface.md) 규칙 그대로다.

## Compiler witness packet

고급 타입을 채택하려면 `.test-d.ts(x)` 또는 레포가 쓰는 type assertion test에 아래 증거를
남긴다.

| 증거               | 기준                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| positive witness   | 대표 제품 호출부 1개가 explicit type argument 없이 컴파일된다.                                         |
| negative witnesses | 실제로 막아야 하는 오용 최소 3개가 각각 한 줄 `@ts-expect-error`다.                                    |
| edge witnesses     | 관련 있는 `any`·`unknown`·`never`·union·readonly tuple·optional·overload만 고른다.                     |
| mutation witness   | union을 `string`으로 넓히거나 필수 필드를 optional로 바꾸거나 `NoInfer`를 제거하면 suite가 RED가 된다. |
| runtime complement | URL·storage·API·시간축·sanitization은 별도 parser·guard·runtime test로 증명한다.                       |
| soundness gap      | overload 마지막 signature, method bivariance, assertion 격리 같은 남은 구멍을 적는다.                  |

## 고급 semantics 규칙

- conditional type은 naked type parameter일 때 union에 분배된다. 분배가 계약이면
  `any`·`unknown`·`never`·union edge를 테스트한다. 분배가 아니면 `[T] extends [U]` 형태로
  막고 그 차이를 witness에 둔다.
- `infer`는 입력과 출력의 관계를 보존할 때만 쓴다. overload는 마지막 signature 기준으로
  추론될 수 있으므로 public overload API의 정확성 증거로 단독 사용하지 않는다.
- mapped type은 `readonly`와 optional modifier 보존·제거를 의도적으로 테스트한다.
  `foo: undefined`와 `foo?: undefined`는 `exactOptionalPropertyTypes` 실효 설정과 함께 본다.
- template literal type은 작은 closed literal grammar에만 쓴다. API 응답, URL, storage
  문자열을 runtime parser 없이 검증했다고 보고하지 않는다. union cross-product가 커지면
  ahead-of-time 생성이나 runtime 검증으로 넘긴다.
- `const` type parameter는 호출부 literal 추론을 보존할 뿐, 이미 `string`으로 넓어진 변수의
  literal을 복구하지 못한다.
- `NoInfer`는 inference source를 제한할 뿐 assignability를 바꾸지 않는다. 어떤 인자가
  추론 권위인지 positive/negative witness로 고정한다.
- `strictFunctionTypes`에서도 method·constructor declaration은 bivariance 예외가 있다.
  안전이 필요한 callback은 method가 아니라 function property로 받고 negative witness를 둔다.
- variance annotation은 structural assignability를 강제로 바꾸는 장치가 아니다. 실제 구조와
  일치할 때의 문서화·디버깅·측정된 성능 보조로만 쓴다.
- recursive/distributive type은 조합 폭발과 `TS2589` 위험이 있다. 숫자 한계를 문서에
  하드코딩하지 말고 실제 project compiler diagnostics로 판정한다.

## 성능과 디버깅

성능·compiler flag·TypeScript version 증거는 [`../type-environment.md`](../type-environment.md)가
소유한다. 이 문서는 recursive/distributive type을 고르면 그 문서의
`--extendedDiagnostics` 기준을 적용하라고 요구만 한다. `any`, double assertion,
`@ts-ignore`, `skipLibCheck`로 depth·성능 오류를 숨기지 않는다.
