# SonarJS AI quality 규칙

`@lodado/eslint-config/quality`는 SonarJS로 코드 결함을 검사하는 opt-in 프리셋이다.
Antfu base 뒤에 펼쳐 쓴다. AI 생성 여부를 판별하는 도구는 아니다.

```js
import base from '@lodado/eslint-config'
import quality from '@lodado/eslint-config/quality'

export default [...base, ...quality]
```

## 켜진 범위

공식 `recommended`를 바탕으로 결함 검사를 추가하되, base와 겹치는 진단은 끈다.
JS/TS 파일에만 적용하며 Markdown 코드 블록과 JSON·YAML은 제외한다.
인지 복잡도는 error 대신 warn으로 보고한다. 파일·함수 줄 수와 반복 문자열은 검사하지 않는다.
중첩 삼항연산자는 base의 `no-nested-ternary: error`가 담당하고,
중복 보고를 피하기 위해 `sonarjs/no-nested-conditional`은 끈다. 단일 삼항연산자는 허용한다.
같은 방식으로 base의 core·regexp·unused-vars·`test/` 규칙과 같은 결함을 보는 SonarJS 규칙은 끈다.
`code-eval`(`no-eval`), `no-identical-expressions`(`no-self-compare`), `no-primitive-wrappers`,
`constructor-for-side-effects`, `array-callback-without-return`, `prefer-default-last`, 정규식 규칙 5개,
`no-unused-function-argument`, `no-exclusive-tests`, `no-duplicate-test-title`이 여기에 해당하며,
`quality.js`의 각 줄에 담당 규칙을 적어 둔다. `no-reference-error`도 끈다. 선언하지 않은 이름은
JS에서는 base `no-undef`, TS에서는 tsc가 담당하며, 이 규칙은 `React.ReactNode` 같은 전역 타입
네임스페이스를 오탐했다. 복잡도는 `cognitive-complexity` 하나로 본다. `cyclomatic-complexity`는
같은 함수를 거의 항상 함께 보고해 끈다.

## 다른 프리셋의 중복·과잉 검사

- `console`은 base의 `no-console`, `includes` 권고는 Unicorn이 담당한다.
- effect 안의 동기적인 상태 갱신은 React Hooks가 담당한다. 중복된 derived-state 검사는 끈다.
  `sonarjs/no-hook-setter-in-body`도 `react-hooks/set-state-in-render`에 맡긴다.
- 테스트 파일에서는 `testing` preset의 Vitest·Testing Library·Playwright 규칙이 담당한다.
  `assertions-in-tests`, `no-empty-test-title`, `no-debug-commands-in-ui-tests`, `no-fixed-wait-in-tests`,
  `no-networkidle-wait`, `no-forced-browser-interaction`은 테스트 파일에서 끈다. `react`나 `testing`을
  쓰지 않는 레포는 해당 규칙을 다시 켠다.
- `ai` preset을 켜면 비밀값과 SQL 문자열 결합은 `ai-guard`가 담당하고 `no-hardcoded-passwords`,
  `no-hardcoded-secrets`, `sql-queries`는 꺼진다. `ai`는 `quality` 뒤에 펼친다.
- 버튼의 `type` 누락 검사는 유지한다. 타입 검사가 버튼의 기본 submit 동작을 막아주지는 않는다.
- 루트 설정에서 `react-perf`를 제거했다. 인라인 함수·객체라는 이유만으로 메모이제이션을 강제하지 않는다.
- functional의 기본 범위는 domain·selectors·`*.pure.*`다. 일반 reducer는 제외하고, 명시적인 pure reducer는 계속 검사한다.
- local 규칙의 활성화 목록은 명시적으로 관리한다. 플러그인에 규칙을 추가해도 자동으로 켜지지 않는다.

## 타입 검사와 저장소 검사

TypeScript 프로젝트에서는 기존 `strict-types` 프리셋도 함께 쓴다.
검사할 파일이 `tsconfig.json`에 포함되어 있어야 한다.

```js
import base from '@lodado/eslint-config'
import quality from '@lodado/eslint-config/quality'
import strictTypes from '@lodado/eslint-config/strict-types'

export default [...base, ...quality, ...strictTypes]
```

`strict-types`는 처리하지 않은 Promise, 안전하지 않은 `any` 사용,
타입상 불필요한 조건과 빠진 union 분기를 검사한다.

이 저장소의 별도 정적 분석은 다음 명령으로 실행한다. CI에서도 `pnpm quality`를 실행한다.

```sh
pnpm quality:knip  # 미사용 파일·export·의존성, 누락 의존성
pnpm quality:jscpd # 새로 생긴 코드 복제
pnpm quality      # 위 두 검사
```

Knip의 workspace entry에는 패키지 스크립트와 테스트를 포함한다.
예제와 검사 fixture는 제외하며, 언어 플러그인으로 쓰는 `@eslint/css`와
`typescript-eslint`는 미사용 의존성 검사에서 제외한다.

jscpd는 `packages/`의 JS/TS 코드에서 50토큰·5줄 이상인 복제를 검사한다.
테스트·예제·생성된 bundle은 제외한다. 기존 복제 12건은 `.jscpd-baseline.json`에 기록했고,
새 복제가 하나라도 생기면 실패한다. `threshold: 100`은 비율 검사를 비활성화하기 위한 값이며,
실제 차단은 `--fail-on-new-clones`가 담당한다. 기준선 갱신은 기존 복제를 검토한 뒤에만 한다.

## 주요 검사 영역

공식 recommended에서 특히 AI 결과 검수에 중요한 영역은 다음과 같다.

| 영역               | 대표 활성 규칙                                                                                                                         | 막는 실패                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 분기와 데이터 흐름 | `no-identical-conditions`, `no-duplicated-branches`, `no-invariant-returns`, `no-dead-store`                                           | 복사·붙여넣기로 같아진 조건/분기, 항상 같은 결과, 사용되지 않는 계산                         |
| 반환과 타입        | `function-return-type`, `no-ignored-return`, `null-dereference`, `in-operator-type-error`                                              | 누락된 반환, 호출마다 바뀌는 반환 타입, 무시된 순수 함수 결과, 확정적인 런타임 예외          |
| 예외와 비동기      | `no-ignored-exceptions`, `no-unthrown-error`, `no-try-promise`, `async-test-assertions`                                                | 삼킨 오류, 생성만 하고 던지지 않은 Error, 잘못된 Promise 예외 처리, await하지 않은 assertion |
| 테스트 신뢰성      | `no-empty-test-file`, `test-check-exception`                                                                                           | 실행되지 않는 테스트, 이름 충돌, 예외 종류를 확인하지 않는 테스트, 커밋된 디버그 명령        |
| 복잡도와 정규식    | `cognitive-complexity`, `regex-complexity`, `super-linear-regex`, `stateful-regex`                                                     | 리뷰하기 어려운 제어 흐름과 ReDoS/상태 누수 가능성이 있는 정규식                             |
| 보안               | `sql-queries`, `no-hardcoded-passwords`, `hardcoded-secret-signatures`, `pseudo-random`, `csrf`, `cors`, `insecure-cookie`, `weak-ssl` | 사용자 입력 실행, SQL injection, 비밀 유출, 보안 문맥의 PRNG, 완화책 비활성화                |

전체 공식 규칙 정의는 각 lint 메시지의 SonarSource RSPEC 링크가 권위다. 아래 목록은
이 프리셋에서 추가하거나 경고 수준으로 조정한 규칙이다.

## 추가 error 16개

`error`는 lint를 실패시키고, CI와 pre-commit이 그 실패에서 멈춘다.

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
| `no-sonar-comments`                    | AI가 `NOSONAR`로 검사를 통째로 숨기는 일을 막는다. 규칙 단위 disable에는 사유를 남긴다. |
| `no-undefined-assignment`              | `undefined`를 직접 대입해 값 없음과 미초기화 상태를 섞는 일을 막는다.                   |
| `no-variable-usage-before-declaration` | `var` hoisting에 기대어 초기화 전 값을 읽는 일을 막는다.                                |
| `non-number-in-arithmetic-expression`  | 숫자가 아닌 값을 산술식에 넣어 coercion/`NaN`이 생기는 일을 막는다.                     |
| `operation-returning-nan`              | 정적으로 확인 가능한 `NaN` 산술 결과를 막는다.                                          |
| `unicode-aware-regex`                  | Unicode property/class를 쓰면서 `u` 플래그를 빼 문자 판정이 달라지는 일을 막는다.       |
| `values-not-convertible-to-numbers`    | 숫자로 바꿀 수 없는 값을 수치 비교해 잘못된 분기로 가는 일을 막는다.                    |

## 경고로 검사하는 규칙

문맥에 따라 정당할 수 있지만, AI 출력은 사람이 한 번 확인해야 하는 지점이다. 경고는
기본적으로 lint를 실패시키지 않으며 팀이 `--max-warnings=0`을 선택하면 차단할 수 있다.

| 규칙                                 | 검토 신호                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `cognitive-complexity`               | 제어 흐름이 복잡해 사람이 검토할 필요가 있는 함수다.                         |
| `elseif-without-else`                | 분기 체인에 나머지 입력 정책이 명시되지 않았다. 의도적 no-op인지 확인한다.   |
| `expression-complexity`              | 한 식에 조건 연산자가 너무 많아 진리표 검토가 어렵다.                        |
| `max-union-size`                     | 거대한 union이 상태 모델의 누락/중복을 숨길 수 있다.                         |
| `nested-control-flow`                | 깊은 중첩 때문에 early return, cleanup, 오류 경로가 가려진다.                |
| `no-commented-code`                  | 과거 구현을 주석으로 남겨 실제 권위 코드가 무엇인지 흐리는 일을 찾는다.      |
| `no-nested-incdec`                   | 증가·감소의 평가 순서를 한 식 안에서 추론해야 하는 코드를 찾는다.            |
| `no-nested-switch`                   | 상태 전이 표가 여러 switch로 흩어져 조합 누락이 생길 가능성을 알린다.        |
| `no-return-type-any`                 | AI가 타입 오류를 `any` 반환으로 덮어 계약 검증을 약화한 지점을 찾는다.       |
| `no-wildcard-import`                 | 실제 사용 API와 의존 범위가 불명확한 import를 찾는다.                        |
| `prefer-immediate-return`            | 중간 변수가 결과를 바꾸지 않는데 남아 데이터 흐름을 길게 만든 지점을 찾는다. |
| `too-many-break-or-continue-in-loop` | loop 탈출 경로가 많아 원소 처리 여부를 예측하기 어려운 코드를 찾는다.        |

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
