# 타입 제약 — 목적·소유권·상태 설계 사다리

## 목적과 권위

카드에 async·순서 역전·중복 제출·retry·다단계 상태 `O*` 행이 있거나, client 상태·
Props·boundary 타입의 형태를 새로 만들거나 바꿀 때 사용한다. 이 문서는 제품 정책을
만들지 않는다. 상태·전이·오류 분류는 전부 카드의 `O*` 행에서 도출하며, 카드에 없는
상태나 전이가 필요해지면 발명하지 말고 `POLICY_GAP`으로 `NEEDS_DECISION`에 돌아간다.

권위 순서는 [`common.md`](../common.md)의 공통 우선순위와
[`frontend/decisions.md`](../frontend/decisions.md)를 따른다.
이 문서의 도구·라이브러리 선택은 구현 휴리스틱이며 정책 출처가 아니다.

모든 설계는 다음 질문으로 판정한다.

> AI가 생성할 수 있었던 잘못된 코드 중 **무엇이 이제 컴파일되지 않는가?**

이 질문에 구체적으로 답할 수 없는 타입 복잡성은 추가하지 않는다. AI 생성 자체는 계속
비결정적이다. 이 문서의 목표는 동일한 source·TypeScript·tsconfig에서 후보를 같은
결과로 통과·거절하는 **수용 판정 결정성**이다.

컴파일 통과는 건전성 증명이 아니라 결정적 고효율 필터다. TypeScript는 의도적으로
불건전하고(bivariance, 리터럴에만 적용되는 excess property check), 필터 강도는
tsconfig·컴파일러 버전의 함수다. 전제 환경 검증은
[`type-environment.md`](../type-environment.md)가 소유한다 — 레포당 1회 검증하고
여기서는 반복하지 않는다.

## 제약 소유권

- 값·Props·상태 조합·입출력 관계 → 타입
- API·storage·URL·message 같은 외부 입력 → `unknown`에서 runtime parser
- 관찰 가능한 제품 행동 → `$test`
- 순서 역전·중복 제출·retry·unmount 후 도착 → abort signal·pending guard·멱등키·서버 검증
- 같은 prompt의 생성 재현성 → 모델·provider — 이 문서가 보장하지 않음

시간축은 타입으로 증명되지 않는다. union을 만들었다고 순서 문제가 "해결됨"이라고
선언하면 `FINDING`이다. 남은 시간축 비결정성과 그 런타임 방어는 Implementation
Decision에 반드시 기록한다. type-valid를 behavior-correct로 보고해도 `FINDING`이다.

설계 전에 변경 대상에서 아래 여섯 지점을 찾고, **컴파일되지 않아야 할 잘못된
사용을 최소 세 개 먼저 적는다** — exported API면 그대로 `.test-d.ts`의
`@ts-expect-error` 케이스가 된다.

- 값: 넓은 `string`·`number`·`Date` → 브랜드·의미 타입
- 조합: 관련 boolean 여러 개, 배타적인 optional Props → discriminated union, union + `never`
- 관계: mode가 값·반환 타입을 결정하는데 타입에 없음 → generic lookup map, 별도 컴포넌트
- 경로·키: route·query key·field path 자유 문자열 → factory·`keyof`·파생 union
- 결과: 성공·실패·부재·유지·삭제가 `undefined` 하나에 → `Result`·연산 union
- 확장: 소비자가 확장할 key가 `string`으로 열림 → typed registry·module augmentation

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
   표는 [`frontend/decisions.md`](../frontend/decisions.md) 3절이 소유하며
   이 문서가 그 기본값을 덮지 않는다. **판정표를 읽기 전에 로딩 수단을 고르지
   않는다** — 익숙한 API를 먼저 집으면 그 API의 제약이 요구사항인 것처럼 굳어
   나머지 후보를 스스로 실격시키게 된다. 조건부 query·placeholder·취소 제약처럼
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
