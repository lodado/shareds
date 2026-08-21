# 변경 용이성 구현·리뷰 기준

## 목적과 권위

제품 정책이 아니다 — 승인된 동작을 바꾸지 않으면서 변경 비용이 낮은 구현안을 고르는
휴리스틱이다. 결과·문구·상태·부작용을 새로 정하거나 승인된 Oracle을 고치는 데 쓰지
않는다.

권위 순서: 1) 보안·개인정보·법적·접근성·정합성 제약과 승인된 Oracle, 2) 대상 레포의
`AGENTS.md`·`CLAUDE.md`·architecture·API·테스트 계약, 3) 실제 설치 버전과 기존 구현
관례, 4) 이 문서의 구현 휴리스틱과 외부 사례. 충돌하면 상위 기준을 따른다. Toss
자료는 구현 후보를 찾는 근거일 뿐 다른 레포에 강제하는 권위가 아니다.

## 읽는 방법

`VALID_RED` 뒤 production 수정 전 전부 읽는다. 다섯 축을 점수화하거나 모두 채우지
않고, 이번 선택을 실제로 갈라놓은 축과 감수한 비용만 Implementation Decision에
남긴다. 독립 reviewer도 같은 기준으로 Decision과 diff를 대조한다. 구체적인 drift,
숨은 부작용, 변경 전파 위험이 없으면 선호 차이는 `NON_ORACLE_OPINION`이다.

각 축의 **구현 전 질문**: 이 선택이 이해·수정·검증 범위를 실제로 줄이는가? 다른 축의
비용이나 기존 경계를 불필요하게 해치지 않는가?

## Readability

처음 읽는 사람이 동시에 기억할 맥락과 조건을 줄인다. 짧은 코드보다 사용자 행동,
상태 전이와 부작용의 실행 순서가 드러나는 것이 우선이다.

### 핵심 패턴

| 위험 신호                          | 기본 선택                                         | 적용하지 않는 경우                      |
| ---------------------------------- | ------------------------------------------------- | --------------------------------------- |
| 복잡한 조건이 반복된다             | domain 의미가 드러나는 이름을 붙인다              | 한 번만 쓰이고 이름이 조건보다 모호하다 |
| 독립 state·async 흐름이 섞인다     | 상태 소유권·error boundary를 기준으로 분리한다    | LOC만 길고 변경 이유가 같다             |
| 핵심 순서가 여러 effect에 흩어진다 | event 또는 이름 붙은 workflow에서 순서를 드러낸다 | 실제 외부 system 동기화다               |
| 한 줄마다 helper·wrapper가 생긴다  | 정보를 추가하지 않는 indirection을 제거한다       | 여러 사용처가 동일 정책을 공유한다      |

```tsx
const canSubmit = !isLoading && !isLocked && user != null && amount > 0
```

같은 정책이 반복될 때만 `canTransfer` 같은 domain 이름을 부여한다.

### React 구현 기준

- JSX는 semantic structure, 접근성 상태와 사용자 intent 연결을 중심으로 읽힌다.
- props와 render에서 계산할 수 있는 값은 effect를 거쳐 다른 state로 복사하지 않는다.
- component는 LOC가 아니라 상태 소유권, async/error boundary, 접근성 책임, 독립 테스트
  또는 재사용 이유가 달라질 때 분리한다.
- 명시적 순서가 중요한 workflow를 generic pipeline이나 불필요한 hook으로 숨기지 않는다.

### Implementation Decision evidence · Reviewer 판정 기준

- Decision에는 이름을 붙이거나 분리한 경계와 실제 정보 이득을 기록한다.
- 불필요한 파일·시점 이동이 실제 변경 오류를 만들 수 있으면 `FINDING`이다.
- 더 좋아 보이는 이름·함수 문법이나 LOC 선호만 다르면 `NON_ORACLE_OPINION`이다.

## Predictability

호출자가 이름, 입력, 반환값으로 결과와 외부 부작용을 예상할 수 있어야 한다. 내부
알고리즘은 숨길 수 있지만 request, navigation, storage, analytics, timer 같은 외부
write의 종류·시점·횟수는 이름 붙은 owner와 경계에서 보여야 한다. 외부 API는 사용자
intent로 읽히게 만들되 내부 상태 전이와 lifecycle을 모호한 자동화로 숨기지 않는다.

### 핵심 패턴

| 위험 신호                            | 기본 선택                                             | 적용하지 않는 경우                        |
| ------------------------------------ | ----------------------------------------------------- | ----------------------------------------- |
| `get*`·`fetch*`에 숨은 부작용이 있다 | caller에서 조합하거나 전체 workflow를 이름에 드러낸다 | 승인 계약이 원자적 workflow를 요구한다    |
| render·selector가 외부 상태를 쓴다   | event·mutation·외부 동기화 effect로 옮긴다            | 해당하지 않음                             |
| 성공·실패 handler가 write를 중복한다 | 실행 owner와 정확한 횟수를 한 경계로 모은다           | 서로 다른 승인 부작용이다                 |
| timer·subscription cleanup이 없다    | 생성한 경계에서 cleanup한다                           | runtime이 lifecycle을 명시적으로 소유한다 |
| 닫힘·제거·결과 확정이 한 boolean이다 | 관찰 결과가 다른 전이만 이름과 owner를 나눈다         | 같은 시점의 원자적 전이다                 |
| 국소 경계가 모든 오류를 소비한다     | 복구 가능한 오류만 처리하고 나머지는 상위로 전파한다  | 앱 최상위 격리·관측 경계다                |

```ts
const balance = await fetchBalance()
trackBalanceViewed(balance)
saveLastViewedBalance(balance)
```

세 동작이 승인된 하나의 workflow라면 무조건 분리하지 않는다. 전체 책임을 드러내는
이름을 사용하고 실패·재시도·중복 실행 계약을 검증한다.

### React 구현 기준

- query function은 data 획득과 transport 오류를 소유하고 UI copy·navigation을 숨기지
  않는다.
- effect는 observer, subscription, timer, DOM 또는 외부 SDK 동기화에만 쓰며 대상과
  cleanup을 드러낸다.
- 요청·overlay·다단계 flow는 시작·취소·성공·실패·시각적 닫힘·resource 제거가 실제로
  다른 결과나 cleanup을 만들 때만 별도 전이로 모델링한다. 단순 toggle은 늘리지 않는다.
- 국소 catch·Error Boundary는 자신이 복구할 수 있는 오류만 처리한다. 알 수 없는 오류와
  fallback 자체 오류는 원인을 보존해 상위 경계로 전파한다.
- SSR code는 browser global 접근 시점과 server fallback을 경계에서 예측할 수 있게 한다.
- 기존 logging·telemetry boundary나 캡슐화된 workflow를 개인 선호로 해체하지 않는다.

### Implementation Decision evidence · Reviewer 판정 기준

- Decision에는 외부 write의 owner, 실행 시점과 실패·재시도 시 횟수, material한
  lifecycle 전이와 오류 전파 경계를 기록한다.
- 호출자가 알 수 없는 write, cleanup 누락이나 중복 부작용은 구체 evidence가 있으면
  `PRODUCT_DEFECT`, 필요한 검증만 없으면 `EVIDENCE_GAP`이다.
- 관찰 결과를 새로 정해야 하면 `POLICY_GAP`, explicit handler 선호만 다르면
  `NON_ORACLE_OPINION`이다.

## Cohesion

같은 정책과 같은 이유로 함께 바뀌는 source, test, mock과 문서를 가장 가까운 owner에
둔다. 코드가 반복된다는 이유만으로 공통화하지 않고 한쪽만 바뀔 때 실제 drift 결함이
생기는지를 본다.

### 핵심 패턴

| 위험 신호                                          | 기본 선택                         | 적용하지 않는 경우                          |
| -------------------------------------------------- | --------------------------------- | ------------------------------------------- |
| 같은 business rule이 여러 곳에 복제된다            | 가장 가까운 domain owner로 모은다 | 정책과 release cadence가 서로 다르다        |
| feature source·test·mock이 함께 이동하지 않는다    | 같은 architecture unit에 둔다     | 레포가 다른 경계를 강제한다                 |
| generic util에 consumer별 option이 늘어난다        | 서로 다른 변경 이유를 분리한다    | 안정된 동일 invariant를 공유한다            |
| consumer 하나를 미래 재사용 때문에 shared로 올린다 | local에 둔다                      | 현재 여러 consumer와 stable contract가 있다 |

```ts
const isNicknameValid = nickname.length <= 20
const isCouponCodeValid = couponCode.length <= 20
```

현재 숫자가 같아도 독립 정책이면 하나의 domain API로 합치지 않는다. 반대로 동일한
송금 한도 규칙이 복제됐다면 drift를 막을 공통 owner가 필요하다.

### React 구현 기준

- feature 전용 hook, mapper, test와 mock은 가장 가까운 feature 경계에 둔다.
- query option, DTO mapper와 cache update는 해당 server state owner 가까이에 둔다.
- UI가 소유할 JSX·token·문구와 domain 판단·transport 변환을 generic hook에 섞지 않는다.
- 대상 레포의 public API·FSD·module boundary를 넘어 co-location하지 않는다.

### Implementation Decision evidence · Reviewer 판정 기준

- Decision에는 함께 바뀌는 정책과 owner, 중복을 허용하거나 공통화한 drift 근거를 적는다.
- 동일 정책이 떨어져 drift를 만들거나 unrelated 책임이 한 abstraction에 묶이면
  `FINDING` 후보다.
- 단순 중복 줄 수와 선호하는 폴더 구조는 blocking 근거가 아니다.

## Coupling

하나의 변경이 알아야 하거나 수정해야 하는 consumer 범위를 줄인다. 공유 invariant는
결합하되 public API, global store, shared util, transport DTO와 framework API가 책임보다
넓게 퍼지지 않게 한다.

### 핵심 패턴

| 위험 신호                                        | 기본 선택                                         | 적용하지 않는 경우                     |
| ------------------------------------------------ | ------------------------------------------------- | -------------------------------------- |
| consumer 하나뿐인 global/public surface가 생긴다 | local state·module에 둔다                         | 승인된 public contract가 필요하다      |
| UI가 transport DTO·query key를 안다              | mapper/model owner에서 render-ready 값으로 바꾼다 | UI 자체가 그 contract의 owner다        |
| 짧은 props 전달 때문에 store·context를 만든다    | 가장 가까운 common owner에서 전달한다             | 실제로 넓게 공유하는 상태다            |
| interface·adapter가 구현 하나를 감싼다           | 구현을 직접 사용한다                              | 현재 여러 구현 또는 호환성 계약이 있다 |
| 동일 flow가 여러 platform API에 직접 묶인다      | pure transition core와 얇은 adapter로 나눈다      | 현재 runtime 하나만 지원한다           |

```tsx
function BalanceCard({ balance }: { balance: number }) {
  return <span>{formatCurrency(balance)}</span>
}
```

UI가 `BalanceApiResponse` 전체를 받을 필요가 없으면 필요한 값만 전달한다.

### React 구현 기준

- state는 실제로 공유하는 가장 가까운 common owner에 둔다.
- FSD는 대상 레포가 이미 사용하거나 도입이 승인됐을 때만 그 public API를 따른다.
- custom hook은 consumer가 필요한 값과 intent action만 반환한다. tuple/object 형태는
  대상 레포 관례를 따르며 transport, cache와 UI copy를 동시에 노출하지 않는다.
- 둘 이상의 승인된 router·runtime이 같은 flow를 공유할 때만 순수 state·transition을
  core에 두고 URL·navigation·browser API를 adapter가 소유하게 한다. 미래 가능성만으로
  단일 runtime에 adapter를 추가하지 않는다.
- 승인된 design system·domain API나 동일한 권한·통화·identity invariant를 local 복제로
  우회하지 않는다.

### Implementation Decision evidence · Reviewer 판정 기준

- Decision에는 public/global/shared surface와 실제 consumer, DTO 변환 owner, platform
  adapter가 있으면 현재 공유 runtime을 기록한다.
- 불필요하게 넓은 surface, transport 누수나 승인된 import boundary 위반이 구체 변경
  전파 위험을 만들면 `FINDING`이다.
- context·props·barrel에 대한 개인 선호만 다르면 `NON_ORACLE_OPINION`이다.

## Simplicity

현재 승인 계약을 만족하는 가장 작은 책임과 가장 익숙한 수단을 선택한다. 짧거나
영리한 코드보다 새 개념, dependency, runtime state와 운영 비용을 줄이는 것이 목적이다.

### 핵심 패턴

구현 선택은 다음 순서에서 처음 요구를 만족한 단계에 멈춘다.

1. 코드가 실제로 필요한가?
2. 기존 레포 구현이나 util이 해결하는가?
3. JavaScript·TypeScript·DOM·Web·React·framework 기본 기능으로 가능한가?
4. 이미 설치된 dependency가 해결하는가?
5. 최소 local code로 가능한가?
6. 그 뒤에만 새 abstraction이나 dependency를 제안한다.

위험 신호는 구현체 하나뿐인 interface·factory·registry, 사용처 없는 option, 측정 없는
memoization·cache·lazy loading과 단일 request를 위한 global state다.

### React 구현 기준 · 적용하지 않는 경우

- render에서 계산할 수 있는 값에 effect와 state를 추가하지 않는다.
- 단순 event handler를 이름만 바꾼 custom hook으로 감싸지 않는다.
- `memo`, `useMemo`, `useCallback`, dynamic import는 측정된 병목이나 identity 계약이
  있을 때만 사용한다.
- 입력 검증, 보안, 접근성, cleanup, 데이터 유실 방지나 실제 calibration seam을 코드
  수 때문에 제거하지 않는다.

### Implementation Decision evidence · Reviewer 판정 기준

- Decision에는 기존 레포→기본 기능→설치 dependency→최소 local code 중 선택한 첫
  단계와 추가하지 않은 abstraction을 적는다.
- 현재 consumer와 요구가 정당화하지 않는 abstraction·dependency·성능 복잡성은
  `FINDING` 후보다.
- 더 짧은 문법이 있다는 이유만으로 finding을 만들지 않는다.

## 축 사이 trade-off

다섯 축은 동시에 최대화할 수 없다. 실제 선택에서 우선한 비용과 감수한 비용만 적는다.

| 충돌                     | 기본 판단                                                             |
| ------------------------ | --------------------------------------------------------------------- |
| Readability ↔ Cohesion   | 독립 변경·테스트 책임이 없으면 가까이 두고, 생기면 이름 붙여 분리한다 |
| Predictability ↔ 캡슐화  | 알고리즘은 숨기고 외부 write는 이름·계약에서 드러낸다                 |
| Cohesion ↔ Coupling      | 같은 정책과 실제 drift 위험이 있을 때만 공통화한다                    |
| Coupling ↔ Readability   | consumer가 적으면 local flow, 안정된 다수 consumer면 공용 경계를 쓴다 |
| Simplicity ↔ Performance | 근거 전에는 단순 구현, 측정 뒤 필요한 범위만 최적화한다               |

```markdown
- Changeability: analytics 실행 순서를 드러내는 Predictability를 우선했다. handler의
  작은 orchestration 중복은 허용한다.
- Rejected: consumer가 하나인 generic workflow hook은 만들지 않았다.
```

## Workflow owner

이 문서는 변경 비용의 의미와 근거만 소유한다.

- React runtime 기준은 [`frontend-implementation.md`](frontend-implementation.md)가
  소유한다.
- Implementation Decision의 경로·필드·작성 시점은
  [`implementation-loop.md`](implementation-loop.md)가 소유한다.
- `PASS | FINDING | N/A`, finding router와 최소 수정 절차는
  [`subagent-review.md`](subagent-review.md)가 소유한다.

## 채택하지 않는 범용 규칙

- Toss의 조직 구조·내부 도구나 숫자 threshold를 blocker로 바꾸지 않는다.
- FSD, monorepo, 특정 state/query library를 자동 도입하지 않는다.
- hook 반환, `type`/`interface`, export와 함수 문법을 통일하지 않는다.
- 100% coverage, zero dependency 또는 특정 React·Next 버전을 보편 규칙으로 만들지 않는다.
- “Toss가 만들었다”는 이유만으로 build-vs-buy 결정을 하지 않는다.

## Source Registry

외부 자료는 제품 정책 출처가 아니며 대상 레포의 실제 버전과 계약이 우선한다.

- 간결한 네 축 skill 구조: [Frontend Fundamentals plugin skills](https://github.com/toss/frontend-fundamentals/tree/abec04157e2c6eac5be1e59b1a82863a138c6c66/frontend-fundamentals-plugin/skills), commit `abec04157e2c6eac5be1e59b1a82863a138c6c66`.
- 변경 용이성 정의와 사례: [Frontend Fundamentals](https://github.com/toss/frontend-fundamentals/blob/161d3d6a0d6d372eacd75036de567511643f6265/fundamentals/code-quality/code/index.md), commit `161d3d6a0d6d372eacd75036de567511643f6265`.
- React lifecycle·SSR·cleanup 보조 근거: [react-simplikit](https://github.com/toss/react-simplikit/blob/85d19c3816afca9a84ffbd5b7ff581962cb5db4c/docs/ko/core/design-principles.md), commit `85d19c3816afca9a84ffbd5b7ff581962cb5db4c`.
- built-in·단순 API·측정 원칙: [es-toolkit](https://github.com/toss/es-toolkit/blob/5dc4477f838b8cee2b6b09af4f373be2b3aaaa54/AGENTS.md), commit `5dc4477f838b8cee2b6b09af4f373be2b3aaaa54`.
- 관찰 결과가 다른 close·unmount lifecycle: [overlay-kit event contract](https://github.com/toss/overlay-kit/blob/8f0e59ca653932b44dc19d5002c7dea253682c53/packages/src/event.ts), commit `8f0e59ca653932b44dc19d5002c7dea253682c53`.
- 처리 가능한 오류만 잡고 나머지를 전파하는 경계: [Suspensive ErrorBoundary](https://github.com/toss/suspensive/blob/c9ada0a088fe6fdb14440935edf01b7a0680d1ae/packages/react/src/ErrorBoundary.tsx), commit `c9ada0a088fe6fdb14440935edf01b7a0680d1ae`.
- typed transition core와 router adapter 분리: [use-funnel core](https://github.com/toss/use-funnel/blob/26a9aa78723b84178e40eadab38378a052dcaf12/packages/core/src/core.ts), [Next adapter](https://github.com/toss/use-funnel/blob/26a9aa78723b84178e40eadab38378a052dcaf12/packages/next/src/useFunnel.tsx), commit `26a9aa78723b84178e40eadab38378a052dcaf12`.
