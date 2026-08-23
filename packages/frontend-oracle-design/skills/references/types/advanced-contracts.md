# 타입 제약 — 고급 타입 계약과 compiler witness

## 적용 조건

이 문서는 custom exported generic, mapped·conditional·template-literal·recursive type,
variance-sensitive callback, deep transform을 설계·변경·리뷰할 때만 읽는다. feature-local
상태, 단순 Props, 내장 utility로 끝나는 관계에는 적용하지 않는다. 고급 타입은 학습 목표가
아니라 AI가 만든 공개 타입 계약을 컴파일러로 거절 가능하게 만드는 마지막 수단이다.

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

`@ts-expect-error` 다음 줄에는 한 오용 표현만 둔다. unrelated diagnostic이 directive를
만족시키면 검증이 아니다. `Equal<A, B>`류 helper는 보조다. public call·assignment·
`satisfies` witness 없이 helper만 통과시키지 않는다.

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

## Source provenance

| Source                                                                                                                                                                     | Provenance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | License          | 이 문서에서 쓰는 방식                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------ |
| TypeScript Handbook: conditional, mapped, template literal, utility types                                                                                                  | 공식 문서: <https://www.typescriptlang.org/docs/handbook/2/conditional-types.html>, <https://www.typescriptlang.org/docs/handbook/2/mapped-types.html>, <https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html>, <https://www.typescriptlang.org/docs/handbook/utility-types.html>                                                                                                                                                                                    | Microsoft docs   | 언어 의미의 최종 기준                                                                      |
| TypeScript TSConfig/release notes: `strictFunctionTypes`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noPropertyAccessFromIndexSignature`, TS 4.7, TS 5.4 | 공식 문서: <https://www.typescriptlang.org/tsconfig/strictFunctionTypes.html>, <https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html>, <https://www.typescriptlang.org/tsconfig/useUnknownInCatchVariables.html>, <https://www.typescriptlang.org/tsconfig/noPropertyAccessFromIndexSignature.html>, <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html>, <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html> | Microsoft docs   | version·flag 사실은 `type-environment.md`가 소유하고, 이 문서는 고급 타입 caveat에만 인용  |
| type-challenges                                                                                                                                                            | `github.com/type-challenges/type-challenges@0b0b0b18bcb7ac42dc22ce26ffb438231d4754b1`, MIT, 조사 path: `utils/index.d.ts`, `questions/*/test-cases.ts` 중 Pick·Readonly2·DeepReadonly·TupleToUnion·Chainable·Awaited·IsAny·IsNever·IsUnion·Permutation·Diff·PercentageParser·UnionToIntersection·GetRequired·Currying                                                                                                                                                                      | MIT              | positive/negative/edge witness 패턴만 추출. 풀이·helper를 product code로 복사하지 않음     |
| type-fest                                                                                                                                                                  | `github.com/sindresorhus/type-fest@3fe02d33596f8afa167bc465d9d9ac9ab81b497e`, path 예: `source/*.d.ts`, `test-d`                                                                                                                                                                                                                                                                                                                                                                           | MIT 또는 CC0-1.0 | 이미 설치됐을 때 deep transform·branded/tagged type의 production precedent로 재사용 검토   |
| ts-pattern                                                                                                                                                                 | `github.com/gvergnaud/ts-pattern@c92ca435c7e1827e0fd55c539080ef1bfd6fe3f0`, path 예: `src/types`, type tests                                                                                                                                                                                                                                                                                                                                                                               | MIT              | runtime match와 compile-time exhaustive checking 연결 참고. 설치·승인 없이는 도입하지 않음 |
| TypeHero                                                                                                                                                                   | `github.com/typehero/typehero@e32da38bcb9ced6fbc78a0b891701e8e023cd231`                                                                                                                                                                                                                                                                                                                                                                                                                    | AGPL-3.0         | challenge UI·격리 구조만 참고. 코드·문구 복사 금지                                         |
| ts-toolbelt                                                                                                                                                                | `github.com/millsp/ts-toolbelt@b8a49285e3ed3a7d8bb8e0b433389eac46a5f140`                                                                                                                                                                                                                                                                                                                                                                                                                   | Apache-2.0       | 대규모 union/intersection 연산의 복잡도 경고 사례. 기본 구현 권장 아님                     |
