# BVA 5축 & 공용 참조

frontend-oracle-design과 test 스킬이 공유하는 참조. 카드 작성 전에 전부 읽는다.

## 1. 값 경계

| 검토                | 예                                                    |
| ------------------- | ----------------------------------------------------- |
| min−1 / min / min+1 | 검색 최소 2글자: 1글자→요청 0회, 2글자→1회, 3글자→1회 |
| max−1 / max / max+1 | 글자수 제한, 파일 크기, 수량 상한                     |
| 빈 값               | 빈 문자열, 공백만, null, 빈 목록, 0건 응답            |
| 중복 값             | 같은 항목 재추가, 같은 검색어 재입력                  |
| 형식                | 잘못된 형식, 매우 긴 값, Unicode·이모지·개행          |

전부 기계적으로 넣지 않는다 — **승인된 정책의 실제 경계만**. 의미 없는 0/1 자동 추가 금지.

## 2. 상태 경계

각 전이 직후가 경계다: idle→pending, pending→success, pending→error, error→retry.

- 클릭 전: 버튼 활성 / 클릭 직후: pending 표시 + 재행동 차단
- 실패 직후: loading 해제 + 오류 표시 + 성공 부작용 없음 + 입력·기존 데이터 유지 여부(정책)
- 재시도 직후: 이전 오류 제거 + 새 pending
- 성공 직후: loading 해제 + 성공 이벤트 정확히 1회

## 3. 시간·순서 경계

- 첫 요청 pending 중 두 번째 행동 (같은 행동, 다른 행동)
- A 요청 후 B 요청 → B 응답 후 A 응답(역전) — latest wins / first wins / 동시 요청 금지 중 정책 필요
- 페이지 이탈·unmount·취소 후 늦은 응답 — 화면 오염 금지
- 응답 완료 시점은 테스트가 통제한다 (아래 pending barrier)

## 4. 부작용 횟수 경계

0회 / 정확히 1회 / 2회 이상. mutation 버그는 거의 전부 여기서 잡힌다.

- 권한·조건 미충족 → 요청 0회
- 정상 제출 → 정확히 1회 (payload 정확성 포함)
- 연속 클릭, double click, Enter 연속, 클릭+Enter 조합 → 여전히 총 1회
- **UI 차단과 횟수는 별도 검증** — disabled여도 요청 2회 가능 (disabled 적용 전 두 이벤트)

## 5. 타입 경계

exported shared/package API 타입에만 적용한다 — 로컬 상태·내부 Props는 대상이 아니다.
타입의 경계는 값의 min·max가 아니라 타입 lattice의 극단이다. 이번 API가 **실제로 닫는**
축만 고르고, 축마다 통과 witness 1개와 `@ts-expect-error` 1개를 `.test-d.ts(x)`에 둔다.
닫지 않는 축에는 witness를 만들지 않는다.

| 축                      | 경계                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| union 멤버              | 멤버 하나 통과, 비멤버 하나 거절                                               |
| `never`·`any`·`unknown` | distributive conditional이 계약일 때만 세 값을 각각 고정                       |
| optional                | property 생략과 `property: undefined` 구분 (실효 `exactOptionalPropertyTypes`) |
| readonly                | `readonly T[]`·`as const` tuple 입력 수용, mapped type의 modifier 유실 없음    |
| literal widening        | 호출부 `as const` 반복 없이 literal이 `string`으로 넓어지지 않음               |
| tuple arity             | 빈 tuple·1개·n개 중 계약이 실제로 구분하는 길이만                              |
| 추론 권위               | `NoInfer`·`const` type parameter에서 의도한 인자만 추론에 참여                 |

`@ts-expect-error` 다음 줄에는 오용 표현 하나만 둔다 — 여러 오용을 한 줄에 담으면 unrelated
diagnostic으로 통과한다. 한 API의 `@ts-expect-error`가 30개를 넘으면 케이스를 더 쓰지 말고
API를 나눈다. 30은 채워야 할 목표가 아니라 표면이 너무 넓다는 설계 실격선이다.

## 자동 추가 TC 7종

요구사항에 없어도 **전제가 실제로 존재하면** 매트릭스에 넣는다. 없으면 N/A+사유.
존재하지 않는 retry·cancel·race 동작을 테스트 목적으로 발명하지 않는다.

| 전제             | TC                                                    |
| ---------------- | ----------------------------------------------------- |
| 부작용 있는 행동 | 중복 클릭 — UI 차단 행 + 실제 요청 횟수 행 **각각**   |
| 네트워크 요청    | 오류 — 오류 표시 + loading 해제 + 성공 부작용 없음    |
| 실패 가능        | 재시도 복구 — 재제출 가능, 새 요청 정확히 1회         |
| 목록·조회        | 빈 데이터 / 0건 상태                                  |
| 비동기           | 로딩 — 시작 시점 + 성공/실패 양쪽에서 해제            |
| 연속 요청 가능   | out-of-order — 늦은 이전 응답이 최신 결과를 덮지 않음 |
| 이탈·취소 가능   | 취소/이탈 중 응답 — 늦은 응답의 화면 오염 금지        |

## 조건부 guard — 해당하면 TC 추가, 아니면 N/A+사유

- optimistic UI → 실패 시 정확한 이전 상태 복원, 동시 사용자 변경 보존, 중복 항목 없음
- cache → mutation 후 정확한 query 무효화, stale 응답이 최신 데이터를 덮지 않음, 뒤로가기·새로고침 후 상태
- navigation → 성공/실패 시 URL·history 정확성, 중복 클릭으로 entry 2개 금지, 이탈 후 늦은 응답
- interactive UI → semantic element와 accessible name, 키보드 동등성, focus 이동·복귀,
  loading/error의 보조기술 전달(role, aria-live). dialog·popover처럼 focus를 가두거나
  되돌려야 하는 UI는 Escape·tab order·trigger 복귀를 각각 검증한다.
- 비결정 소스 → clock/timezone/seed/응답 순서 통제, 테스트별 storage·데이터 격리, 실제 외부 서비스 의존 금지

## 오류 subtype

"에러가 난다" 하나로 뭉치지 않는다. 기능에 해당하는 subtype만 골라 각각
메시지·재시도 가능 여부·입력 유지·리다이렉트를 정의한다:

validation / business rule / 401·권한 / 네트워크 단절 / timeout / 5xx / 응답 형식 오류

**definitive vs outcome-unknown**: 서버가 처리했는지 불명인 실패(전송 후 timeout,
응답 유실)는 별도 유형이다. 무조건 재시도하면 중복 부작용이 난다 — High risk
write면 재시도·idempotency 정책을 grill 질문으로 올리고, "재시도로 중복 부작용
발생"을 Never에 기록한다.

## Deferred pending barrier (결정론)

시간·응답 순서는 테스트가 통제한다. 임의 sleep·`waitForTimeout` 금지.

```ts
function createDeferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// pending 검증: 테스트가 완료 시점을 쥔다
const deferred = createDeferred<Response>()
vi.spyOn(globalThis, 'fetch').mockReturnValue(deferred.promise as Promise<Response>)
// ... pending UI + 중복 차단 + 요청 횟수 검증 후
deferred.resolve(new Response(JSON.stringify({ id: 'n1' }), { status: 200 }))

// 순서 역전: deferred 두 개를 만들어 뒤 요청을 먼저 resolve
```

MSW를 쓰면 같은 barrier를 handler 안에 둔다. `http.post(path, async () => {
await deferred.promise; return HttpResponse.json({ id: 'n1' }) })`처럼 완료 시점을
테스트가 쥐고, 요청 횟수·순서도 handler에서 관찰한다. Playwright면 `page.route`
handler 안에서 같은 barrier를 쓴다.

## Adversarial 반례 예시

TC: "저장 중 버튼이 disabled인지 확인한다."
반례: disabled 적용 전에 요청이 이미 2회 발생해도 통과한다.
보강: disabled 확인 + `expect(요청 횟수).toBe(1)`을 같은 행에 병기.
