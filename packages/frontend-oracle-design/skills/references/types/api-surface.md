# 타입 제약 — Props와 공용 API 표면

## 공용 API 승격 델타

exported shared/package API를 만들거나 바꿀 때는 구현 타입보다 **호출부 먼저** 쓴다. 대표
제품 호출부에서 컴파일러가 추론할 수 있는 component generic을 명시하지 않는 것을 목표로
하고, config 정의처럼 값만으로 Row를 추론할 수 없는 경계에서만 generic을 한 번 고정한다.
이후 아래 델타만 설계한다.

1. 대표 정상 호출부를 명시적 component type argument 없이 작성한다.
2. 변경 전 허용되던 넓은 값·optional 조합·끊어진 관계 중 실제 오용을 적는다.
3. 값·조합·관계·경로·결과·확장([`state-ladder.md`](state-ladder.md)의 여섯 지점) 중 이번
   API가 닫아야 할 항목만 고른다.
4. schema·config·`as const` 값에서 key와 union을 파생하고 수기 권위를 늘리지 않는다.
5. controlled surface와 현재 제품이 쓰는 mode만 공개하고 나머지는 API 부재로 둔다.
6. type test에 generic 명시 없는 대표 정상 호출 1개와, 이 API가 닫는 경계 축마다 witness를
   둔다. 축은 아래 경계 축 표에서 고르고 축 수는 API가 정한다. JSX를 쓰면 파일은
   `.test-d.tsx`로 만든다.

- 정상 호출도 추론되지 않으면 부정 테스트가 통과해도 좋은 공개 API가 아니다. helper의 추론을
  보존하거나 generic을 단순화하고, 호출부가 같은 type argument를 반복하게 두지 않는다.
- 새로 설계하는 exported shared/package API에서 generic 자체는 목표가 아니다. 둘 이상의
  public 위치 사이 관계를 만들고, 일반 제품 호출부에서 자동 추론되며, 추론 권위가 하나이고,
  구체적 오답을 컴파일 실패시키는 경우에만 쓴다.
- config·schema 정의 경계의 1회 고정은 허용한다. 하나라도 아니면 concrete type·파생 union·
  API 분리를 우선한다.

## Props와 API 표면 규칙

- 상호 배타 Props는 union + `never`로 표현한다 (`href` 있는 link와 `onClick` 있는 action,
  controlled `value`와 uncontrolled `defaultValue`). 전부 optional인 한 객체로 만들지 않는다.
- union 상태를 자식에 통째로 내리지 않는다. `Extract<State, { status: 'failure' }>`로 좁힌
  variant만 전달하고, 자식 안에서 재분기하지 않는다.
- 유한한 문자열 집합은 `as const` 상수 하나에서 union·schema·registry를 파생한다.
  route·query key·analytics event 이름은 factory를 경유하고 호출부에서 문자열을 조립하지
  않는다.
- 같은 원시 타입인데 혼동 시 실제 장애가 나는 값(서로 다른 ID, 단위, 검증 완료 값)만
  tagged/branded type을 쓴다. 생성은 검증 함수 한 곳에 격리하고, 모든 문자열을 브랜드화하지
  않는다.
- helper는 타입 추론을 보존한다. 반환 타입을 넓게 annotation하거나 호출부에 generic 반복을
  요구하는 helper는 만들지 않는다 (`queryOptions` 패턴).
- literal factory는 `const` type parameter로 호출부의 `as const` 반복 없이 key·tuple literal
  추론을 보존한다. 여러 인자 중 하나만 추론 권위면 나머지 인자에 `NoInfer`를 붙여 추론
  지점을 하나로 고정한다:
  ```typescript
  function defineRoutes<const T extends readonly string[]>(paths: T): T
  function pick<T>(options: readonly T[], fallback: NoInfer<T>): T
  ```
- 입력을 변경하지 않는 함수는 `readonly T[]`를 받는다.
- mode가 값·반환 타입을 기계적으로 결정하면 generic lookup map으로 관계를 보존한다
  (`{ single: Id | null; multiple: ReadonlySet<Id> }[M]`). mode별 hook·lifecycle·사용 의미가
  다르면 generic 대신 별도 컴포넌트로 나눈다 (`Calendar.Single`·`Calendar.Range`). 제품이
  일부 mode만 쓰면 그 mode만 구현하고 mode prop 자체를 만들지 않는다.
- 제품 컴포넌트는 controlled-first — 한 값의 권위를 하나로 유지한다. uncontrolled 병행
  지원은 범용 라이브러리를 만들 때만 한다.
- 닫힌 union(도메인 상태·오류·이벤트)과 소비자가 확장하는 열린 집합(플러그인 key, 앱 query
  key)을 구분한다. 열린 집합은 넓은 `string`이 아니라 typed registry나 module augmentation으로
  연다.
- 타입 오류 메시지도 공개 API 품질이다. 소비자가 볼 오류가 "X is not assignable to
  CalendarDate | null" 수준으로 읽히지 않으면 generic을 단순화하거나 API를 나눈다.
- 소비 루프에 단언이 필요하면 API 형태가 틀린 것이다. union·mapped 타입 config를 소비자가
  `map`으로 펼치는 순간 key↔value 관계가 끊긴다. 관계는 값 생성 시점에 묶고(`accessor(key,
{ cell })`이 `render(row)`를 반환), 남는 단언은 그 생성 함수 안 한 줄로 격리한다. 정의
  지점만 닫고 소비 지점에 `as`를 남기는 설계는 공용 API 승격 실격이다.
- 공개 variant가 2~3개고 입·출력 타입 관계만 다르면 overload를 검토한다. variant마다 동작이
  다르면 overload 대신 API를 분리한다.
- mapped·conditional·recursive 타입 계산은 공용 라이브러리의 `types/internal`에 격리하고
  type test를 함께 둔다. feature 컴포넌트 안에 자작 고급 utility를 작성하지 않는다. Props에
  generic이 4개 이상 노출되면 공개 API 분리를 검토한다.

## 경계 축 표

타입 witness의 축과 개수 규칙은 [`../bva.md`](../bva.md)의 타입 경계 절이 소유한다. 이 API가
닫는 축만 고르고 닫지 않는 축은 만들지 않는다. `@ts-expect-error`가 30개를 넘으면 케이스를
더 쓰지 말고 API를 나눈다 — 30은 목표가 아니라 설계 실격선이다.

## 검증 매핑

- 카드 행 → 실패 테스트 매핑은 `$test` 계약대로 유지한다. 별도 "타입 테스트 layer"를 전
  상태에 만들지 않는다.
- exported shared/package API로 상태·Props 타입이 노출될 때만 불가능 사용이 컴파일되지 않음을
  `@ts-expect-error` type test(`.test-d.ts`, JSX면 `.test-d.tsx`, 또는 vitest `expectTypeOf`)로
  증명한다. generic API면 명시적 type argument가 없는 대표 정상 호출도 같은 typecheck에서
  증명한다. 해당되면 readonly·`as const` tuple 입력 수용, type predicate narrowing, literal의
  `string` widening 미발생도 같이 검증한다. 각 `@ts-expect-error`에는 어떤 오용을 차단하는지
  한 줄 이유를 적고, 로컬 상태에는 추가하지 않는다.
- public compiler witness는 실제 call·assignment·`satisfies`를 우선한다. `Equal<A, B>`류
  helper만으로 public API를 검증하지 않는다.
- negative case는 `@ts-expect-error` 다음 줄에 한 오용 표현만 둬 unrelated diagnostic이
  통과시키지 못하게 한다.
- custom generic은 `../bva.md` 타입 경계 축 중 이 타입이 실제로 닫는 축만 고르고, 모든
  타입에 같은 checklist를 붙이지 않는다.
- 계약을 `string`·optional·`any`로 넓혔을 때 unused `@ts-expect-error`나 exhaustive failure로
  suite가 RED가 되는 mutation을 한 번 확인한다. type-valid는 behavior-correct가 아니므로
  runtime behavior test는 별도 run label로 기록한다.

Implementation Decision에는 다음 네 가지를 기록한다.

1. 도출한 상태·이벤트 집합과 카드 행 매핑
2. 선택한 사다리 단과 exhaustiveness 계층
3. **이제 컴파일되지 않는 잘못된 사용 목록과 실패 증거**
4. 타입으로 못 잡아 런타임으로 방어한 행동·시간축 항목
