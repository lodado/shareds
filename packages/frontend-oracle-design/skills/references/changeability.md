# 변경 용이성 구현·리뷰 기준

## 목적과 권위

이 reference는 승인된 동작을 바꾸지 않으면서 여러 구현안 중 변경 비용이 낮은 안을
고르는 구현 휴리스틱이다. 제품 정책이 아니다. 결과·문구·상태·부작용을 새로 정하거나
승인된 Oracle을 고치는 데 사용하지 않는다.

권위는 항상 다음 순서다.

1. 승인된 Oracle과 그 Source Registry
2. 대상 레포의 `AGENTS.md`·`CLAUDE.md`, architecture·보안·접근성 계약
3. 대상 레포의 실제 설치 버전과 기존 구현 관례
4. 이 문서의 범용 구현 휴리스틱
5. 외부 project convention과 case study

Oracle, 대상 레포 계약과 실제 설치 버전, 구현 휴리스틱이 충돌하면 상위 기준을
따른다. 적용하지 않은 하위 기준이 이번 변경에 중요하면 Implementation Decision의
`Sources` 또는 `Rejected`에 충돌과 이유를 남긴다. Toss의 공개 자료는 일반화 후보를
찾는 근거이며 Toss 조직이나 특정 project의 convention을 다른 레포에 강제하는 권위가
아니다.

## 읽는 방법

구현자는 `VALID_RED` 뒤 production을 수정하기 전에 이 파일을 전부 읽는다. 아래 다섯
축을 점수화하거나 모든 항목을 의례적으로 채우지 않는다. 이번 변경에서 실제 선택을
갈라놓는 축, 우선한 비용, 의도적으로 감수한 비용만 Implementation Decision에 남긴다.

독립 reviewer도 같은 파일을 전부 읽고 raw Decision과 diff를 대조한다. 각 축을
`PASS | FINDING | N/A`로 판정하되, 이 문서만으로 새로운 제품 동작이나 architecture를
요구하지 않는다. 구체적인 drift·숨은 부작용·변경 전파 위험이 없으면 선호 차이는
`NON_ORACLE_OPINION`이다.

각 축은 다음 질문으로 읽는다.

- 무엇을 이해하거나 수정할 때 비용이 발생하는가?
- 그 비용이 이번 diff에서 실제 결함 또는 drift로 이어질 수 있는가?
- 다른 축을 개선하기 위해 의도적으로 감수한 비용인가?
- 대상 레포의 기존 경계로 해결할 수 있는가?
- 가장 작은 수정으로 위험을 제거할 수 있는가?

## Readability

### 의미

Readability는 코드를 처음 보는 사람이 동시에 기억해야 할 맥락과 해석해야 할 조건을
줄이는 성질이다. 짧은 코드나 적은 파일 자체가 목표가 아니다. 사용자 intent, 정책,
상태 전이가 실제 실행 순서대로 읽히고 이름이 책임을 설명해야 한다.

### 구현 전 질문

- 이 동작을 이해하려면 몇 개 파일과 시점을 왕복해야 하는가?
- 조건식이 domain 의미를 말하는가, 낮은 수준의 flag 조합만 보여주는가?
- 이름만 보고 입력, 결과, 실패와 외부 부작용의 범위를 예상할 수 있는가?
- 위에서 아래로 읽었을 때 사용자 행동과 async 흐름이 같은 순서로 나타나는가?
- 추출한 helper·hook·component 이름이 본문보다 더 많은 정보를 주는가?

### React 구현 기준

- JSX는 semantic structure, 접근성 상태, 사용자 intent 연결을 중심으로 읽혀야 한다.
- props와 render에서 계산할 수 있는 값은 effect를 거쳐 다른 state로 복사하지 않는다.
- 여러 boolean이 불가능한 조합을 만들면 승인된 상태 전이를 표현하는 union이나 단일
  status를 검토한다.
- handler에서 순차적으로 일어나는 mutation, 성공 처리와 navigation은 실행 순서가
  보이게 둔다. 숨겨야 할 복잡한 workflow가 있을 때만 이름 붙은 hook으로 옮긴다.
- component 분리는 LOC가 아니라 상태 소유권, async/error boundary, 접근성 책임,
  독립 테스트 또는 재사용 이유가 달라질 때 한다.

```tsx
// 해석 비용이 큰 flag 조합
const canSubmit = !isLoading && !isLocked && user != null && amount > 0

// 같은 정책이 반복될 때만 domain 이름을 부여한다.
const canTransfer = hasTransferPermission({ user, amount, isLocked }) && !isLoading
```

두 번째 형태가 항상 낫지는 않다. 한 번만 쓰이고 이름이 조건보다 명확하지 않다면
첫 번째 표현을 유지한다.

### 위험 신호

- JSX를 이해하려면 unrelated hook과 util을 연속해서 열어야 한다.
- event handler의 핵심 순서가 여러 effect에 나뉘어 있다.
- `data`, `item`, `handle`, `process` 같은 이름이 서로 다른 domain 책임을 숨긴다.
- 한 component 안에 독립적인 state machine과 외부 연결이 여러 개 있다.
- 반대로 한 줄짜리 표현마다 파일과 wrapper component가 생긴다.

### 적용하지 않는 경우

- 설명하려는 이름이 본문보다 길거나 모호한 한 번짜리 표현
- 독립 책임이 없는 JSX fragment 또는 prop 전달 wrapper
- 대상 레포가 co-location을 요구하는데 파일 길이만으로 분리하는 경우
- explicit한 순서가 중요한데 fluent chain이나 generic pipeline으로 숨기는 경우

### Implementation Decision evidence

- 이해에 필요한 주요 파일 이동을 줄인 경계
- 이름을 붙이거나 붙이지 않은 조건과 그 이유
- 한 파일에 유지하거나 component/hook으로 분리한 책임 기준
- Readability를 위해 감수한 중복이나 명시적 orchestration

### Reviewer 판정 기준

불필요한 파일·시점 이동이나 조건 해석이 실제 변경 오류를 만들 수 있으면 구체 path와
함께 `FINDING`이다. 더 좋아 보이는 이름, 선호하는 함수 문법, 단순 LOC 의견만 있으면
`NON_ORACLE_OPINION`이다. 수정은 위험을 숨기는 가장 작은 경계에 이름을 붙이거나
불필요한 indirection 하나를 제거하는 수준이어야 한다.

## Predictability

### 의미

Predictability는 호출자가 이름, 입력, 반환값과 승인된 계약으로 실행 결과와 외부
부작용을 예상할 수 있는 성질이다. 내부 알고리즘은 캡슐화할 수 있지만 request,
navigation, storage write, analytics, logging, timer, observer, cache invalidation 같은
숨은 부작용은 이름 붙은 owner와 실행 경계에서 보여야 한다.

### 구현 전 질문

- 함수나 hook 이름에 드러나지 않는 외부 write가 있는가?
- 성공, 실패, 취소와 unmount에서 어떤 부작용이 각각 몇 번 실행되는가?
- 같은 입력이라도 호출 순서나 이전 global state 때문에 뜻밖의 결과가 생기는가?
- render 또는 selector가 외부 상태를 변경하는가?
- retry가 원래 실패한 경계보다 넓은 cache나 workflow를 reset하는가?

### React 구현 기준

- render와 render 파생은 pure하게 유지하고 외부 write는 event, mutation 또는 실제 외부
  system 동기화 effect에 둔다.
- query function은 data 획득과 transport 오류를 소유하고 toast, navigation, UI copy를
  함께 소유하지 않는다.
- mutation 성공 뒤 analytics와 navigation을 수행해야 하면 caller가 순서를 볼 수 있게
  조합하거나 workflow를 정확히 설명하는 이름을 사용한다.
- effect는 observer, subscription, timer, DOM 또는 외부 SDK와 동기화할 때만 쓰며 대상,
  이유, cleanup이 드러나야 한다.
- SSR과 hydration이 있는 code는 browser global 접근 시점과 server fallback을 이름과
  boundary에서 예측할 수 있어야 한다.

```ts
// fetch라는 이름에 analytics와 storage write가 숨어 있다.
async function fetchBalance() {
  const balance = await api.getBalance()
  analytics.track('balance_viewed')
  localStorage.setItem('lastBalance', String(balance))
  return balance
}

// caller가 부작용 종류와 순서를 볼 수 있다.
const balance = await fetchBalance()
trackBalanceViewed(balance)
saveLastViewedBalance(balance)
```

Oracle이 세 동작을 하나의 workflow로 승인했다면 무조건 분리하지 않는다. 대신
`fetchAndRecordViewedBalance`처럼 전체 책임을 드러내고 실패·중복 실행 계약을 테스트한다.

### 위험 신호

- `get*`, `select*`, `format*`이 network, storage 또는 global state를 변경한다.
- component mount만으로 승인되지 않은 navigation이나 analytics가 실행된다.
- 성공과 실패 handler가 같은 side effect를 중복 실행한다.
- custom hook 반환 API에는 보이지 않는 unrelated cache invalidation이 있다.
- cleanup 없는 subscription, observer 또는 timer가 남는다.

### 적용하지 않는 경우

- 모든 내부 함수 호출을 public API로 노출해 캡슐화를 깨는 경우
- 이름 하나로 충분한 workflow를 호출자가 매번 수동 조립하게 만드는 경우
- 레포가 승인한 logging·telemetry boundary를 개인 선호로 해체하는 경우
- Oracle에 없는 새로운 사용자 관찰 결과를 “예측 가능성” 명목으로 추가하는 경우

### Implementation Decision evidence

- request·navigation·storage·analytics·logging의 owner와 정확한 실행 시점
- 실패·재시도·중복 입력에서 부작용 횟수를 지키는 boundary
- effect의 외부 대상, 필요한 이유와 cleanup
- 내부에 유지한 부작용이 있다면 전체 책임을 드러내는 이름과 계약

### Reviewer 판정 기준

호출자가 알 수 없는 외부 write, cleanup 누락, 성공/실패 경계의 중복 부작용은 구체
evidence와 카드 행이 있을 때 `PRODUCT_DEFECT`다. 필요한 부작용 횟수 테스트가 없으면
`EVIDENCE_GAP`, 관찰 결과 자체를 새로 정해야 하면 `POLICY_GAP`이다. 단지 explicit
handler를 선호한다는 이유만으로 기존 승인 workflow를 해체하지 않는다.

## Cohesion

### 의미

Cohesion은 같은 정책과 같은 이유로 함께 바뀌는 source, test, mock과 문서를 가장
가까운 소유 경계에 두는 성질이다. 코드 모양이 비슷한지는 부차적이다. 반복된다는
이유만으로 공통화하지 않고 한쪽만 수정됐을 때 실제 drift 결함이 생기는지를 먼저 본다.

### 구현 전 질문

- 이 코드들은 같은 제품 정책 때문에 함께 변경되는가?
- 한쪽만 변경되면 사용자가 관찰할 결함이 생기는가?
- test와 fixture가 production 소유 경계와 함께 이동·삭제되는가?
- 공통화 후 API가 서로 다른 정책을 옵션으로 억지로 결합하지 않는가?
- 기술 역할이 아니라 변경 이유를 기준으로 가까이 둘 수 있는가?

### React 구현 기준

- feature 전용 hook, mapper, test와 mock은 가능한 한 그 feature 또는 가장 가까운
  architecture unit에 둔다.
- 동일한 validation 정책을 여러 form이 공유하고 한쪽 drift가 결함이면 pure model
  function이나 승인된 domain boundary로 모은다.
- 현재 표현만 같은 두 UI가 서로 다른 정책과 release cadence를 가지면 중복을 허용한다.
- query option, DTO mapper와 cache update는 해당 server state owner 가까이에 둔다.
- JSX, class, token과 문구는 UI가 소유하고 domain 판단과 transport 변환을 generic
  presentation hook 안에 섞지 않는다.

```ts
// 같은 문자열 길이 검사를 한다고 같은 정책은 아니다.
const isNicknameValid = nickname.length <= 20
const isCouponCodeValid = couponCode.length <= 20
```

현재 숫자가 같아도 nickname과 coupon 정책이 독립적으로 바뀐다면 하나의
`validateText(value, 20)` domain API로 합칠 이유가 없다. 반대로 동일한 송금 한도 규칙이
여러 화면에 복제됐다면 한쪽 drift가 실제 결함이므로 공통 owner가 필요하다.

### 위험 신호

- 관련 source와 test가 기술별 root directory에 떨어져 함께 이동하지 않는다.
- generic hook이 unrelated interaction, query와 navigation을 동시에 소유한다.
- 공통 util이 consumer마다 다른 option과 예외 flag를 계속 추가한다.
- 같은 business rule이 여러 mapper와 component에 복제되어 일부만 수정된다.
- feature 하나뿐인데 미래 재사용을 위해 shared layer로 먼저 승격한다.

### 적용하지 않는 경우

- 같은 라이브러리나 문법을 사용한다는 이유만으로 묶는 경우
- 한 번만 존재하는 구현을 generic abstraction으로 감싸는 경우
- 서로 다른 정책을 옵션 parameter로 합쳐 독립 변경을 어렵게 만드는 경우
- 대상 레포의 public API·FSD·module boundary를 건너 co-location하는 경우

### Implementation Decision evidence

- 함께 바뀌는 정책과 그 owner
- 중복을 허용하거나 공통화한 실제 drift 위험
- source·test·mock이 같은 변경 단위에 놓인 근거
- shared로 승격하지 않고 local에 둔 이유 또는 실제 consumer 목록

### Reviewer 판정 기준

동일 정책이 떨어져 있어 한쪽 drift가 실제 결함을 만들거나 unrelated 책임이 한
abstraction에 묶이면 `FINDING` 후보다. 단순 중복 줄 수나 선호하는 폴더 구조는
blocking 근거가 아니다. 최소 수정은 공통 정책 하나를 가장 가까운 owner로 옮기거나
서로 다른 변경 이유를 가진 책임 하나를 분리하는 데 그친다.

## Coupling

### 의미

Coupling은 하나의 변경이 알아야 하거나 수정해야 하는 consumer 범위다. 결합을 전부
없애는 것이 목표가 아니다. 공유해야 하는 invariant는 결합되어야 한다. 다만 public API,
global store, shared util, barrel export, transport DTO와 framework API가 책임보다 넓게
퍼지지 않아야 한다.

### 구현 전 질문

- 이 변경으로 함께 수정해야 하는 consumer가 몇 개인가?
- local state나 module로 충분한데 global/public surface를 만드는가?
- UI가 API response, query key 또는 transport 오류 형태를 직접 알아야 하는가?
- 새 abstraction이 framework 교체가 아니라 현재 요구에도 실제 가치를 주는가?
- 테스트가 공개 결과가 아니라 private hook 호출과 dispatch 순서에 결합됐는가?

### React 구현 기준

- state는 실제로 공유하는 가장 가까운 common owner에 두며 편의상 global store로
  올리지 않는다.
- API DTO는 승인된 mapper/model boundary에서 render-ready 값으로 변환한다.
- FSD라면 slice public API를 따르고 deep import를 피하되 FSD가 아닌 레포에 같은
  구조를 자동 도입하지 않는다.
- props drilling 비용은 실제 depth와 공유 범위로 판단한다. 한두 단계 전달만으로
  context나 store를 만들지 않는다.
- custom hook은 consumer가 필요한 render-ready 값과 intent action만 반환하고 transport,
  cache와 UI copy를 동시에 노출하지 않는다.

```tsx
// UI가 transport 구조에 결합된다.
function BalanceCard({ response }: { response: BalanceApiResponse }) {
  return <span>{response.data.account.balance.amount}</span>
}

// boundary가 UI에 필요한 값만 전달한다.
function BalanceCard({ balance }: { balance: number }) {
  return <span>{formatCurrency(balance)}</span>
}
```

### 위험 신호

- consumer 하나뿐인 global store, public barrel 또는 plugin point
- feature 내부 DTO와 query key가 unrelated UI까지 export됨
- shared util 변경이 여러 feature test를 이유 없이 깨뜨림
- component가 transport client를 직접 생성하거나 호출함
- compatibility를 위한 wrapper가 실제로는 하나의 구현만 감쌈

### 적용하지 않는 경우

- 동일한 권한·통화·identity invariant를 여러 구현이 따로 소유하게 만드는 경우
- 승인된 design system이나 domain public API를 local 복제로 우회하는 경우
- import 줄 수를 줄이려고 책임 있는 module boundary를 제거하는 경우
- 미래 framework 교체 가능성만으로 adapter와 interface를 추가하는 경우

### Implementation Decision evidence

- 새로 만들거나 유지한 public/global/shared surface와 실제 consumer
- DTO·transport·query cache와 UI 사이 변환 owner
- local state와 shared state를 나눈 근거
- 승인된 module/FSD/public API 경계를 그대로 사용한 증거

### Reviewer 판정 기준

불필요하게 넓은 global/public surface, transport 누수 또는 승인된 import boundary 위반이
구체 변경 전파 위험을 만들면 `FINDING`이다. 단순히 context보다 props를 선호하거나
barrel 자체를 싫어하는 의견은 대상 레포 계약이 없으면 `NON_ORACLE_OPINION`이다. 최소
수정은 consumer가 하나인 surface를 local로 내리거나 누수된 DTO 변환 한 곳을 owner로
옮기는 정도다.

## Simplicity

### 의미

Simplicity는 현재 승인 계약을 만족하는 가장 작은 책임과 가장 익숙한 수단을 선택하는
성질이다. 짧거나 영리한 코드가 아니라 새 개념, 새 dependency, 새 runtime 상태와 운영
비용을 최소화하는 것이다.

구현 선택은 다음 순서로 검토한다.

1. 코드가 실제로 필요한가?
2. 기존 레포 구현이나 util이 이미 해결하는가?
3. JavaScript·TypeScript·DOM·Web·React·framework 기본 기능으로 가능한가?
4. 이미 설치된 dependency가 해결하는가?
5. 최소 local code로 해결 가능한가?
6. 그 뒤에만 새 abstraction이나 dependency를 제안한다.

### 구현 전 질문

- 지금 사용처가 하나인데 재사용 abstraction을 만드는가?
- platform API나 기존 helper로 충분한가?
- 새 option과 extension point가 승인 요구에 실제로 필요한가?
- memoization, cache 또는 lazy loading을 정당화하는 profile·benchmark가 있는가?
- 코드를 삭제하거나 render 파생으로 바꾸는 것이 더 작은가?

### React 구현 기준

- props와 state로 계산 가능한 값은 render 중 계산하고 effect+state를 추가하지 않는다.
- 단순 event handler를 이름만 바꾼 custom hook으로 감싸지 않는다.
- `memo`, `useMemo`, `useCallback`, dynamic import는 측정된 병목이나 안정적인 identity
  계약이 있을 때만 사용한다.
- 단순 server fetch를 client query와 hydration으로 옮기지 않는다.
- 브라우저 native semantics와 CSS로 가능한 일을 JS state와 listener로 재구현하지
  않는다.

### 위험 신호

- 구현체 하나뿐인 interface, factory, registry 또는 adapter
- 사용처 없는 generic, option, feature flag와 configuration
- 기존 dependency와 겹치는 새 helper package
- profile 없이 모든 component에 memoization 추가
- 단일 request를 위한 별도 global cache와 sync effect

### 적용하지 않는 경우

- 입력 검증, 보안, 접근성, cleanup 또는 데이터 유실 방지를 코드 수 때문에 제거하는 경우
- 실제 여러 consumer와 안정된 invariant가 있는데 중복 local 구현을 선택하는 경우
- 측정된 병목을 “단순성”만으로 방치하는 경우
- 물리 device·clock·sensor처럼 실제 calibration seam이 필요한 영역을 고정값으로 줄이는 경우

### Implementation Decision evidence

- 기존 레포→기본 기능→설치 dependency→최소 local code 중 처음 요구를 만족한 단계
- 추가하지 않은 abstraction/dependency와 이유
- memoization·cache·lazy loading을 썼다면 profile, benchmark 또는 구조적 근거
- 삭제하거나 재사용한 기존 코드와 남은 단순한 한계

### Reviewer 판정 기준

현재 consumer와 요구가 정당화하지 않는 새 abstraction, dependency 또는 측정 없는
성능 복잡성이 실제 유지 비용을 늘리면 `FINDING` 후보다. 더 짧은 문법이 있다는 이유는
finding이 아니다. 최소 수정은 한 wrapper나 extension point를 제거하고 기존 수단을
직접 사용하는 수준이어야 한다.

## 축 사이 trade-off

다섯 축은 동시에 최대화할 수 없다. 구현자는 아래 표처럼 실제 선택에서 우선한 비용과
감수한 비용을 기록한다.

| 충돌                     | 질문                                                                             | 기본 판단                                                         |
| ------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Readability ↔ Cohesion   | 한 파일에서 순서대로 읽는 이점과 같은 이유로 바뀌는 책임의 경계 중 무엇이 큰가?  | 독립 변경·테스트 책임이 없다면 가까이 두고, 생기면 이름 붙여 분리 |
| Predictability ↔ 캡슐화  | 내부를 숨기면서 외부 부작용 종류와 시점을 호출자가 알 수 있는가?                 | 알고리즘은 숨기고 외부 write는 이름·계약에서 드러냄               |
| Cohesion ↔ Coupling      | 공통화가 drift를 막는가, consumer가 공통 API에 불필요하게 묶이는가?              | 같은 정책과 실제 drift 위험이 있을 때만 공통화                    |
| Coupling ↔ Readability   | local explicit flow와 shared abstraction 중 어느 쪽이 더 적은 지식을 요구하는가? | consumer가 적으면 local flow, 안정된 다수 consumer면 공용 경계    |
| Simplicity ↔ Performance | 추가 복잡성을 정당화하는 측정 또는 구조적 근거가 있는가?                         | 근거 전에는 단순 구현, 근거 뒤 최소 범위만 최적화                 |

trade-off 기록은 “모든 축을 고려했다”는 선언이 아니다. 예를 들어 다음처럼 구체적으로 쓴다.

```markdown
- Changeability: save와 analytics를 별도 함수로 두어 호출 순서를 드러내는
  Predictability를 우선했다. handler가 두 호출을 조합하는 작은 중복은 허용한다.
- Rejected: generic workflow hook은 현재 consumer가 하나이고 서로 다른 실패 정책을
  options로 숨기므로 만들지 않았다.
```

## Workflow owner

이 문서는 변경 비용의 의미와 근거만 소유한다. 같은 실행 형식을 다시 정의하지 않고
다음 owner를 따른다.

- State·effect·Hook·async·성능의 전체 React runtime checklist는
  [`frontend-implementation.md`](frontend-implementation.md)가 소유한다. 이 문서의 축별
  React 예시는 해당 선택의 변경 비용을 설명하는 데만 사용한다.
- Implementation Decision의 경로·필드·작성 시점은
  [`implementation-loop.md`](implementation-loop.md)가 소유한다. 위 축별
  `Implementation Decision evidence` 중 이번 diff에 material한 근거만 옮긴다.
- `PASS | FINDING | N/A`, finding router와 최소 수정 절차는
  [`subagent-review.md`](subagent-review.md)가 소유한다. 이 문서의 축별 reviewer 기준은
  구체 위험과 단순 취향을 구분하는 의미 근거로만 사용한다.

## 채택하지 않는 범용 규칙

- Toss의 DRI, 조직 구조, 개발 속도 또는 내부 도구를 코드 blocker로 바꾸지 않는다.
- FSD, monorepo, 특정 state/query library를 자동 도입하지 않는다.
- hook 반환을 tuple 또는 object 중 하나로 통일하지 않는다. 대상 레포 관례를 따른다.
- `type`/`interface`, named/default export, function declaration 같은 문법을 강제하지 않는다.
- 100% coverage, zero dependency 또는 특정 React·Next 버전을 보편 규칙으로 만들지 않는다.
- “Toss가 직접 만들었다”는 이유로 build-vs-buy 결정을 하지 않는다.

## Source Registry

아래 자료는 구현 후보를 일반화한 근거다. 제품 정책 출처가 아니며 대상 레포의 실제
버전과 계약이 우선한다.

| 관할                               | 자료                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 변경 용이성 네 축                  | [Frontend Fundamentals](https://github.com/toss/frontend-fundamentals/blob/161d3d6a0d6d372eacd75036de567511643f6265/fundamentals/code-quality/code/index.md), [숨은 로직 드러내기](https://github.com/toss/frontend-fundamentals/blob/161d3d6a0d6d372eacd75036de567511643f6265/fundamentals/code-quality/code/examples/hidden-logic.md), [함께 수정되는 파일을 같은 디렉터리에 두기](https://github.com/toss/frontend-fundamentals/blob/161d3d6a0d6d372eacd75036de567511643f6265/fundamentals/code-quality/code/examples/code-directory.md), commit `161d3d6a0d6d372eacd75036de567511643f6265` |
| React project evidence             | [react-simplikit design principles](https://github.com/toss/react-simplikit/blob/85d19c3816afca9a84ffbd5b7ff581962cb5db4c/docs/ko/core/design-principles.md), [AGENTS.md](https://github.com/toss/react-simplikit/blob/85d19c3816afca9a84ffbd5b7ff581962cb5db4c/AGENTS.md), commit `85d19c3816afca9a84ffbd5b7ff581962cb5db4c`. lifecycle·SSR·cleanup·type safety 후보만 일반화하고 project 문법은 채택하지 않는다.                                                                                                                                                                             |
| Simplicity project evidence        | [es-toolkit AGENTS.md](https://github.com/toss/es-toolkit/blob/5dc4477f838b8cee2b6b09af4f373be2b3aaaa54/AGENTS.md), [.github/CONTRIBUTING.md](https://github.com/toss/es-toolkit/blob/5dc4477f838b8cee2b6b09af4f373be2b3aaaa54/.github/CONTRIBUTING.md), commit `5dc4477f838b8cee2b6b09af4f373be2b3aaaa54`. built-in·단순 API·측정 원칙만 참고하고 utility-library convention은 강제하지 않는다.                                                                                                                                                                                               |
| 출처·review traceability 보조 근거 | [도구를 넘어, 기준과 책임으로](https://toss.tech/article/technical-writing-6) (published 2026-06-23), [QA Platform](https://toss.tech/article/50893) (published 2026-06-26), [Tossion](https://toss.tech/article/tossion) (published 2026-08-11), checked 2026-08-17. mutable case study이므로 URL·date·관할만 기록한다.                                                                                                                                                                                                                                                                       |
