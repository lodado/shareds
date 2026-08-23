# SonarJS AI quality 규칙

`@lodado/eslint-config/quality`는 사람이 매번 다르게 판단할 수 있는 AI 생성 코드를
결정적인 정적 검문소에 통과시키기 위한 opt-in 프리셋이다. Antfu base 뒤에 펼쳐 쓴다.

```js
import base from '@lodado/eslint-config'
import quality from '@lodado/eslint-config/quality'

export default [...base, ...quality]
```

## 켜진 범위

작성 시점의 `eslint-plugin-sonarjs@4.2.0`에는 279개 규칙이 있다. 이 프리셋은 공식
`recommended`의 활성 규칙 217개를 전부 `error`로 받고, 기본값이 `off`인 규칙 중
AI 출력의 정확성과 검토 가능성에 직접 도움이 되는 32개를 더 켠다. 따라서 총 249개
SonarJS 규칙이 활성화된다.

공식 recommended에서 특히 AI 결과 검수에 중요한 영역은 다음과 같다.

| 영역               | 대표 활성 규칙                                                                                                                                      | 막는 실패                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 분기와 데이터 흐름 | `no-identical-expressions`, `no-identical-conditions`, `no-duplicated-branches`, `no-invariant-returns`, `no-dead-store`                            | 복사·붙여넣기로 같아진 조건/분기, 항상 같은 결과, 사용되지 않는 계산                         |
| 반환과 타입        | `array-callback-without-return`, `function-return-type`, `no-ignored-return`, `null-dereference`, `in-operator-type-error`                          | 누락된 반환, 호출마다 바뀌는 반환 타입, 무시된 순수 함수 결과, 확정적인 런타임 예외          |
| 예외와 비동기      | `no-ignored-exceptions`, `no-unthrown-error`, `no-try-promise`, `async-test-assertions`                                                             | 삼킨 오류, 생성만 하고 던지지 않은 Error, 잘못된 Promise 예외 처리, await하지 않은 assertion |
| 테스트 신뢰성      | `no-empty-test-file`, `no-empty-test-title`, `no-duplicate-test-title`, `test-check-exception`, `no-debug-commands-in-ui-tests`                     | 실행되지 않는 테스트, 이름 충돌, 예외 종류를 확인하지 않는 테스트, 커밋된 디버그 명령        |
| 복잡도와 정규식    | `cognitive-complexity`, `regex-complexity`, `slow-regex`, `super-linear-regex`, `stateful-regex`                                                    | 리뷰하기 어려운 제어 흐름과 ReDoS/상태 누수 가능성이 있는 정규식                             |
| 보안               | `code-eval`, `sql-queries`, `no-hardcoded-passwords`, `hardcoded-secret-signatures`, `pseudo-random`, `csrf`, `cors`, `insecure-cookie`, `weak-ssl` | 사용자 입력 실행, SQL injection, 비밀 유출, 보안 문맥의 PRNG, 완화책 비활성화                |

전체 공식 규칙 정의는 각 lint 메시지의 SonarSource RSPEC 링크가 권위다. 아래 목록은
공식 recommended에 **추가로** 켠 32개다.

## 추가 error 16개

확실한 런타임 결함, 의존성 환각 또는 분석 우회이므로 Claude Stop 훅과 CI를 실패시킨다.

| 규칙                                   | 검수 목적                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `declarations-in-global-scope`         | script 전역에 상태를 흘려 실행 순서에 따라 결과가 달라지는 일을 막는다.                 |
| `for-in`                               | 상속된 프로퍼티까지 순회하는 불확실한 객체 열거를 막는다.                               |
| `no-built-in-override`                 | 표준 내장 객체를 덮어써 이후 코드 의미가 바뀌는 일을 막는다.                            |
| `no-for-in-iterable`                   | 배열·iterable을 `for in`으로 순회해 index/프로퍼티를 혼동하는 일을 막는다.              |
| `no-function-declaration-in-block`     | 런타임과 strict mode에 따라 해석이 달라질 수 있는 block 함수 선언을 막는다.             |
| `no-implicit-dependencies`             | AI가 설치하지 않은 패키지를 import하거나 간접 의존성에 우연히 기대는 일을 막는다.       |
| `no-inconsistent-returns`              | 같은 함수가 어떤 경로에서는 값, 다른 경로에서는 `undefined`를 반환하는 일을 막는다.     |
| `no-incorrect-string-concat`           | 문자열과 비문자열을 의도 없이 더해 잘못된 payload/UI 값을 만드는 일을 막는다.           |
| `no-reference-error`                   | 선언하지 않은 식별자를 생성해 런타임 `ReferenceError`가 나는 일을 막는다.               |
| `no-sonar-comments`                    | AI가 `NOSONAR`로 검사를 통째로 숨기는 일을 막는다. 규칙 단위 disable에는 사유를 남긴다. |
| `no-undefined-assignment`              | `undefined`를 직접 대입해 값 없음과 미초기화 상태를 섞는 일을 막는다.                   |
| `no-variable-usage-before-declaration` | `var` hoisting에 기대어 초기화 전 값을 읽는 일을 막는다.                                |
| `non-number-in-arithmetic-expression`  | 숫자가 아닌 값을 산술식에 넣어 coercion/`NaN`이 생기는 일을 막는다.                     |
| `operation-returning-nan`              | 정적으로 확인 가능한 `NaN` 산술 결과를 막는다.                                          |
| `unicode-aware-regex`                  | Unicode property/class를 쓰면서 `u` 플래그를 빼 문자 판정이 달라지는 일을 막는다.       |
| `values-not-convertible-to-numbers`    | 숫자로 바꿀 수 없는 값을 수치 비교해 잘못된 분기로 가는 일을 막는다.                    |

## 추가 warn 16개

문맥에 따라 정당할 수 있지만, AI 출력은 사람이 한 번 확인해야 하는 지점이다. 경고는
기본적으로 lint를 실패시키지 않으며 팀이 `--max-warnings=0`을 선택하면 차단할 수 있다.

| 규칙                                 | 검토 신호                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `cyclomatic-complexity`              | 독립 실행 경로가 많아 누락된 테스트 조합이 생기기 쉬운 함수다.                |
| `elseif-without-else`                | 분기 체인에 나머지 입력 정책이 명시되지 않았다. 의도적 no-op인지 확인한다.    |
| `expression-complexity`              | 한 식에 조건 연산자가 너무 많아 진리표 검토가 어렵다.                         |
| `max-lines`                          | 생성된 대형 파일이 책임을 과도하게 합쳤을 가능성이 있다.                      |
| `max-lines-per-function`             | 한 함수의 입력·출력·실패 경계를 한 번에 검토하기 어렵다.                      |
| `max-union-size`                     | 거대한 union이 상태 모델의 누락/중복을 숨길 수 있다.                          |
| `nested-control-flow`                | 깊은 중첩 때문에 early return, cleanup, 오류 경로가 가려진다.                 |
| `no-commented-code`                  | 과거 구현을 주석으로 남겨 실제 권위 코드가 무엇인지 흐리는 일을 찾는다.       |
| `no-duplicate-string`                | 생성 코드에 반복된 protocol key/상태 문자열이 서로 drift할 위험을 알린다.     |
| `no-nested-incdec`                   | 증가·감소의 평가 순서를 한 식 안에서 추론해야 하는 코드를 찾는다.             |
| `no-nested-switch`                   | 상태 전이 표가 여러 switch로 흩어져 조합 누락이 생길 가능성을 알린다.         |
| `no-return-type-any`                 | AI가 타입 오류를 `any` 반환으로 덮어 계약 검증을 약화한 지점을 찾는다.        |
| `no-unused-function-argument`        | 구현이 계약 입력을 빠뜨렸거나 복사한 signature를 정리하지 않은 지점을 찾는다. |
| `no-wildcard-import`                 | 실제 사용 API와 의존 범위가 불명확한 import를 찾는다.                         |
| `prefer-immediate-return`            | 중간 변수가 결과를 바꾸지 않는데 남아 데이터 흐름을 길게 만든 지점을 찾는다.  |
| `too-many-break-or-continue-in-loop` | loop 탈출 경로가 많아 원소 처리 여부를 예측하기 어려운 코드를 찾는다.         |

## frontend-oracle-design과의 관계

이 레포의 `frontend-oracle-design`은 production diff에서 아래 토큰을 별도로 스캔한다.

```text
Date.now
Math.random
crypto.randomUUID
toLocale
new Intl.
new Date()
```

SonarJS의 `pseudo-random`은 **보안 문맥에서 PRNG를 쓰는 문제만** 찾는다. 시각, seed,
UUID, locale, timezone 때문에 테스트나 렌더 결과가 실행마다 달라지는 일반적인 비결정성은
잡지 못한다. 따라서 medium/high-risk Oracle delivery에서는 다음 검사를 함께 유지한다.

```bash
node packages/frontend-oracle-design/skills/scripts/oracle-verify.mjs scan \
  --path <changed-source-file>
```

검출된 소스는 clock/random/locale을 인자로 주입하는 seam으로 바꾸는 것이 우선이다.
의도된 비결정성이면 해당 줄 또는 바로 윗줄에
`oracle:nondeterminism <구체적인 사유>`를 기록한다.

정리하면 SonarJS는 소스 구조와 알려진 결함 패턴을 결정적으로 검사하고, Oracle은 고정된
요구사항·테스트 증거·실행 환경과 비결정 소스를 검증한다. 둘 다 실제 제품 정책의 정답,
브라우저 시각 결과, race condition의 모든 interleaving을 증명하지는 않는다.

## 도입과 예외 원칙

1. 먼저 `pnpm eslint .`로 baseline을 확인한다.
2. `error`는 구현을 고친다. 특히 누락 의존성을 allowlist로 숨기지 않는다.
3. `warn`은 경계 분리나 early return으로 줄이되, 도메인상 명확하면 프로젝트 config에서
   해당 규칙만 좁은 `files` 범위로 조정한다.
4. `eslint-disable`에는 왜 안전한지와 무엇이 그 동작을 검증하는지 같은 줄에 적는다.
5. `NOSONAR`는 허용하지 않는다. Sonar 전체를 우회해 다른 결함까지 숨기기 때문이다.

의도적으로 켜지 않은 규칙은 naming·file header 같은 조직별 스타일, TypeScript/ESM 전환을
강제하는 규칙, AWS 전용 규칙처럼 범용 프론트엔드/Node 코드의 신뢰성과 직접 관계가 없거나
오탐 비용이 큰 항목이다.
