# TypeScript로 AI 결과를 검수하는 방법

`frontend-oracle-design` 0.24.0에서 추가하고 0.24.1에서 정리한 고급 TypeScript 계약과 compiler witness를
설명합니다. 대상 독자는 AI가 생성한 TypeScript 코드를 프로젝트에 수용하기 전에, 같은
컴파일러와 설정으로 반복 가능한 통과·거절 기준을 만들려는 프론트엔드 개발자입니다.

> **현재 routing 메모:** 아래 `추가한 구조` 설명은 0.24.1 당시의 historical
> design record입니다. 현재는 타입 작업에서 `types-advanced-contracts`를
> `types-state-ladder`·`types-api-surface`와 함께 **항상 로드**하되, 고급 계약의
> **채택**만 compiler witness packet gate로 제한합니다. 현재 정답은
> [`skills/SKILL.md`](skills/SKILL.md)와
> [`skills/references/reference-graph.json`](skills/references/reference-graph.json)입니다.

## 한 줄 요약

AI 생성을 결정론적으로 만들지는 않습니다. 대신 AI가 만든 여러 후보를 **프로젝트에 실제로
설치된 TypeScript compiler와 type test로 동일하게 통과·거절**하도록 검문소를 강화했습니다.

```text
AI 구현 후보
  → 실제 lockfile의 TypeScript와 실효 tsconfig 확인
  → public API의 positive / negative / edge witness 실행
  → tsc --noEmit 통과
  → runtime boundary·시간축 테스트 통과
  → 독립 리뷰
  → 수용 또는 거절
```

## 왜 바꿨나

타입이 복잡하다고 안전한 코드는 아닙니다. 다음과 같은 AI 생성 코드는 겉보기에는 정교하지만
실제 계약을 약하게 만들 수 있습니다.

- generic의 추론 권위가 여러 인자로 흩어져 union이 `string`으로 넓어짐
- conditional type의 의도하지 않은 union 분배 또는 `never` 처리 오류
- mapped type이 `readonly`나 optional modifier를 잃음
- helper 수준의 `Equal<A, B>`는 통과하지만 실제 public call은 잘못된 값을 허용함
- `any`, assertion, `@ts-ignore`, `skipLibCheck`로 타입 오류를 숨김
- discriminated union을 만들고 async ordering까지 해결됐다고 잘못 보고함

이번 변경은 이런 결과를 설명이나 리뷰어의 감각만으로 판단하지 않고, 실제 compiler가 실패할
수 있는 witness로 바꾸는 데 목적이 있습니다.

## 타입이 소유하는 범위

TypeScript 검수는 다음 항목에 집중합니다.

- 허용 가능한 값과 닫힌 union
- 함께 존재할 수 없는 Props 조합
- 입력과 출력, key와 value 사이의 타입 관계
- public API 호출부의 자동 추론
- exhaustiveness와 optional/required property 구분
- readonly tuple, union, `never`처럼 계약과 직접 관련된 edge case

다음 항목은 타입만으로 증명했다고 보고하지 않습니다.

- API, URL, storage, `postMessage`처럼 runtime에서 들어오는 외부 데이터
- 중복 제출, 응답 순서 역전, retry, abort, unmount 이후 도착
- 인증·권한·서버 정합성
- sanitization과 사용자에게 관찰되는 실제 동작

이 항목은 `unknown` boundary parser, guard, abort signal, pending guard, idempotency와 runtime
test가 소유합니다. `type-valid`는 `behavior-correct`의 동의어가 아닙니다.

## 추가한 구조

### 1. 0.24.1 당시: 고급 타입 reference를 조건부로 분리

[`skills/references/types/advanced-contracts.md`](skills/references/types/advanced-contracts.md)를
새로 추가했습니다. 다음 작업에만 로드합니다.

- custom exported generic
- mapped·conditional·template-literal·recursive type
- variance-sensitive callback
- deep transform

단순 Props, feature-local 상태, 내장 utility로 끝나는 관계에는 로드하지 않습니다.
[`skills/references/reference-graph.json`](skills/references/reference-graph.json)의
`types-advanced-contracts` 노드는 `types-api-surface`만 선행 조건으로 가집니다.
`types-state-ladder`에는 연결하지 않아 일반 상태 설계가 타입 퍼즐 풀이로 번지는 것을
막았습니다.

이 routing은 [`skills/scripts/skill-contract.test.mjs`](skills/scripts/skill-contract.test.mjs)가
다음을 검증합니다.

- node와 문서 경로가 실제로 존재함
- `when` 조건이 advanced public type 작업으로 제한됨
- `requires`가 정확히 `types-api-surface`임
- `types-state-ladder`가 advanced node를 요구하지 않음
- `SKILL.md`, README와 graph 설명이 일치함

### 2. 고급 타입 선택 사다리

고급 타입은 기본값이 아니라 마지막 수단입니다. 앞 단계에서 오용이 닫히면 즉시 멈춥니다.

1. 잘못된 조합이 존재하지 않도록 API를 제거하거나 분리합니다.
2. schema·config·`as const` 값에서 `typeof`, `keyof`, indexed access, `satisfies`로 파생합니다.
3. `Pick`, `Omit`, `Extract`, `Exclude`, `Awaited`, `NoInfer`, `Record` 같은 내장 utility를 씁니다.
4. 이미 설치된 production library type을 재사용합니다.
5. 대표 호출부에서 자동 추론되는 최소 generic을 씁니다.
6. 그래도 관계가 닫히지 않을 때만 고급 계산 타입을 `types/internal`에 격리합니다.

### 3. Compiler witness packet

고급 public type을 채택하려면 다음 증거를 함께 둡니다.

| 증거               | 판정 기준                                                                          |
| ------------------ | ---------------------------------------------------------------------------------- |
| positive           | 대표 제품 호출이 explicit type argument 없이 컴파일됨                              |
| edge               | 계약과 관련 있는 `any`, `unknown`, `never`, union, readonly tuple, optional만 선택 |
| mutation           | union widening, optional 변경, `NoInfer` 제거 중 하나가 suite를 RED로 만듦         |
| runtime complement | 외부 데이터와 시간축을 parser·guard·runtime test가 검증함                          |
| soundness gap      | overload, bivariance, assertion처럼 남은 구멍을 명시함                             |

### 4. 포함된 compiler witness

[`test-fixtures/typescript/compiler-witnesses.ts`](test-fixtures/typescript/compiler-witnesses.ts)는
다음 네 계약을 실행합니다.

#### `NoInfer`로 추론 권위 고정

`allowedStatuses` tuple에서 `T`를 추론하고 fallback 값은 추론에 참여시키지 않습니다.
`'archived'`가 들어오면 compiler가 거절합니다.

대표 mutation에서 `NoInfer<T>`를 `T`로 바꾸면 union이 넓어져 잘못된 호출이 허용되고,
기존 `@ts-expect-error`가 사용되지 않아 `TS2578`로 RED가 됐습니다. 원복 후 GREEN을
확인했습니다.

#### `satisfies Record<Union, ...>`로 닫힌 registry 검증

`home | settings | billing` union을 기준으로 registry의 누락 key와 추가 key를 모두
거절합니다. 동시에 annotation으로 객체 전체를 넓히지 않아 실제 literal key도 보존합니다.

#### distributive conditional과 boxed conditional 구분

`T extends U`와 `[T] extends [U]`의 차이를 union witness로 고정합니다. `never`가 naked type
parameter conditional에서 분배될 때 결과가 `never`가 되는 경우와 tuple boxing으로 실제
boolean 결과를 얻는 경우도 분리합니다.

#### `exactOptionalPropertyTypes` 검증

property 생략과 `property: undefined`를 구분합니다. 값에 `undefined`가 포함된 required
property는 여전히 생략할 수 없다는 것도 함께 검사합니다.

fixture의 실효 설정은 다음과 같습니다.

```json
{
  "compilerOptions": {
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "strict": true,
    "target": "ES2022"
  }
}
```

## 기존 문서에서 강화한 부분

| 파일                                                                                       | 책임                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [`skills/references/types/authoring.md`](skills/references/types/authoring.md)             | 고급 타입을 선택 사다리의 마지막 단계로 제한                                              |
| [`skills/references/types/api-surface.md`](skills/references/types/api-surface.md)         | 실제 call·assignment·`satisfies`, negative mutation, runtime complement 기준 소유         |
| [`skills/references/type-environment.md`](skills/references/type-environment.md)           | lockfile compiler, 실효 tsconfig, strict flag, compiler 성능 증거 소유                    |
| [`skills/references/types/review-criteria.md`](skills/references/types/review-criteria.md) | `any`, `@ts-ignore`, `skipLibCheck`, helper-only test, runtime 과장 등을 finding으로 판정 |

compiler upgrade도 단순 도구 업데이트로 취급하지 않습니다. assignability와 strict flag 동작이
바뀌면 기존 수용 판정도 바뀔 수 있으므로 별도 project constraint 변경으로 검증합니다.

## 참고한 외부 저장소

외부 자료는 제품 정책이 아니라 `implementation-reference`입니다. 코드나 challenge 정답을
제품에 복사하지 않고, 검수할 positive·negative·edge witness 패턴과 실무 caveat만
재서술했습니다.

| 자료                 | 고정한 revision                            | License          | 반영한 내용                                                         |
| -------------------- | ------------------------------------------ | ---------------- | ------------------------------------------------------------------- |
| TypeScript 공식 문서 | 2026-08-23 조회                            | Microsoft docs   | conditional, mapped, template literal, utility와 compiler flag 의미 |
| type-challenges      | `0b0b0b18bcb7ac42dc22ce26ffb438231d4754b1` | MIT              | positive·negative·edge witness 패턴                                 |
| type-fest            | `3fe02d33596f8afa167bc465d9d9ac9ab81b497e` | MIT 또는 CC0-1.0 | deep transform과 tagged type의 production precedent                 |
| ts-pattern           | `c92ca435c7e1827e0fd55c539080ef1bfd6fe3f0` | MIT              | runtime match와 compile-time exhaustiveness 연결                    |
| TypeHero             | `e32da38bcb9ced6fbc78a0b891701e8e023cd231` | AGPL-3.0         | challenge 격리 구조만 참고, 코드·문구 복사 금지                     |
| ts-toolbelt          | `b8a49285e3ed3a7d8bb8e0b433389eac46a5f140` | Apache-2.0       | 대규모 type computation의 복잡도 경고                               |

연구 clone은 `.cache/typescript-research/` 아래에만 있고 Git에서 ignore됩니다. release commit에는
포함하지 않았습니다.

## 변경 파일

주요 구현 commit은 `0ff8ede935091a5028d3fc305b7da5427a2f86f2`입니다.

- 고급 계약: `skills/references/types/advanced-contracts.md`
- routing: `skills/SKILL.md`, `skills/README.md`, `skills/references/reference-graph.json`
- 기존 타입 계약: `type-environment.md`, `types/authoring.md`, `types/api-surface.md`,
  `types/review-criteria.md`
- 실행 검증: `skills/scripts/type-guidance.test.mjs`,
  `test-fixtures/typescript/compiler-witnesses.ts`, `test-fixtures/typescript/tsconfig.json`
- 계약 회귀: `skills/scripts/skill-contract.test.mjs`
- 버전과 compiler dependency: package/plugin manifests, marketplace manifest, `pnpm-lock.yaml`

## 검증 결과

0.24.1 release에서 다음 결과를 확인했습니다.

| 검증                           | 결과                          |
| ------------------------------ | ----------------------------- |
| compiler witness               | 2/2 통과                      |
| skill contract                 | 46/46 통과                    |
| frontend-oracle-design package | 129/129 통과                  |
| root lint                      | Turbo 2/2 task 통과           |
| root test                      | hook 3/3, Turbo 7/7 task 통과 |
| skill quick validation         | `Skill is valid!`             |
| Prettier와 `git diff --check`  | 통과                          |
| changed-files-only cleanup     | PASS, 수정 없는 no-op         |
| 독립 code review               | APPROVE, finding 0개          |
| 독립 architecture review       | CLEAR                         |

재실행 명령은 다음과 같습니다.

```bash
node --test packages/frontend-oracle-design/skills/scripts/type-guidance.test.mjs
node --test packages/frontend-oracle-design/skills/scripts/skill-contract.test.mjs
pnpm --filter @lodado/frontend-oracle-design-plugin test
pnpm lint
pnpm test
```

## Claude Code와 Codex 로컬 설치

### 새 로컬 marketplace 설치

저장소 root에서 실행합니다.

```bash
# Claude Code
claude plugin marketplace add "$PWD"
claude plugin install frontend-oracle-design@my-vibe-coding-helper --scope user

# Codex
codex plugin marketplace add "$PWD"
codex plugin add frontend-oracle-design@my-vibe-coding-helper
```

### 기존 설치 업데이트

```bash
# Claude Code
claude plugin marketplace update my-vibe-coding-helper
claude plugin update frontend-oracle-design@my-vibe-coding-helper --scope user

# Git marketplace일 때만 snapshot을 갱신합니다.
codex plugin marketplace upgrade my-vibe-coding-helper
```

Codex marketplace가 이 저장소의 local path를 가리키면 snapshot 복사 없이 현재 파일을 직접
읽으므로 `marketplace upgrade`가 필요하지 않습니다.

### 2026-08-23 실제 설치 확인 결과

| Runtime     | Version | 상태                | Source                                                                        |
| ----------- | ------- | ------------------- | ----------------------------------------------------------------------------- |
| Claude Code | 0.24.1  | user scope, enabled | `~/.claude/plugins/cache/my-vibe-coding-helper/frontend-oracle-design/0.24.1` |
| Codex       | 0.24.1  | installed, enabled  | 이 저장소의 `packages/frontend-oracle-design` local path                      |

Claude Code는 update 후 재시작해야 새 plugin cache를 현재 세션에 적용합니다. Codex도 새
세션에서 skill 목록에 `frontend-oracle-design 0.24.1`이 표시되는지 확인하는 것이 가장
확실합니다.

## 사용할 때의 판정 질문

고급 타입을 추가하기 전에 다음 질문에 답합니다.

1. AI가 만들 수 있는 구체적인 잘못된 사용 중 무엇이 이제 컴파일되지 않는가?
2. built-in utility나 API 분리로 같은 오용을 더 단순하게 막을 수 없는가?
3. 실제 제품 호출이 explicit generic 없이 추론되는가?
4. 계약을 넓히는 mutation이 type suite를 실제로 RED로 만드는가?
5. 타입으로 잡을 수 없는 runtime boundary와 시간축은 어떤 test가 소유하는가?

답을 증거로 남길 수 없으면 고급 타입 복잡성을 추가하지 않습니다.
