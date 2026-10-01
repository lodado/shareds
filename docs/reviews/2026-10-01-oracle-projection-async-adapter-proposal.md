# oracle-projection 비동기 adapter 지원 제안 (A안)

> 2026-10-01 · frontend-oracle-design v0.70.1 · 구현 전 제안
> **계기:** 홈 피드 무한스크롤(`next-fsd-app`)의 Bend 모델을 실제 React 컴포넌트에 연결하려다 생성기가
> 동기 adapter만 지원한다는 것을 확인했다.
>
> **구현됨 (v0.71.0)** — 제안과 다른 결정: `--async` 옵션 없이 생성 템플릿 하나가 모든 adapter 호출을 await한다
> (동기 adapter도 그대로 통과). React·testing-library를 import하는 adapter가 `dispose`를 내보내지 않으면 경고가
> 아니라 `ADAPTER_SUSPECT`(`adapter-dispose-missing`)로 거부한다. `replay --adapter`도 async adapter를 받는다.
> `oracle-model.mjs conform`과 `oracle-discovery.mjs`는 아직 동기다.

## 1. 문제

`oracle-projection.mjs emit-trace`가 생성하는 테스트는 adapter를 동기로 부른다
(`scripts/oracle-projection.mjs`의 `drive`).

```js
function drive(trace, expected) {
  let state = adapter.init()
  assert.deepEqual(adapter.observe(state), INITIAL, 'initial observation')
  trace.forEach((event, index) => {
    state = adapter.step(state, structuredClone(event))
    assert.deepEqual(adapter.observe(state), expected[index], where)
  })
}
```

표본 검사도 `fc.property`를 쓴다. `emit-state`의 `concretize`·`step`·`project`도 동기다.

React 컴포넌트, TanStack Query 같은 query-core observer, `fetch` 응답은 모두 비동기다.
렌더 결과를 읽으려면 `await act(...)`가 필요하고, 쿼리 상태는 microtask가 지난 뒤에 바뀐다.
그래서 지금 구조에서는 다음 두 가지 중 하나를 고를 수밖에 없다.

- 제품 코드 중 동기적인 순수 코어만 conformance로 검사한다. 실제 hook과 컴포넌트는 모델과 연결되지 않는다.
- 생성기를 쓰지 않고 conformance 테스트를 직접 쓴다. 그러면 `STALE_GENERATED_TESTS`, adapter 감사,
  실행 횟수 검사 같은 생성기의 보호 장치가 모두 사라진다.

## 2. 제안

`emit-trace`와 `emit-state`에 `--async` 옵션을 추가한다. 옵션이 없으면 생성 결과는 지금과 같은 바이트로 유지한다.

### 2.1 생성되는 trace 테스트

```js
async function drive(trace, expected) {
  let state = await adapter.init()
  try {
    assert.deepEqual(await adapter.observe(state), INITIAL, 'initial observation')
    for (const [index, event] of trace.entries()) {
      state = await adapter.step(state, structuredClone(event))
      assert.deepEqual(await adapter.observe(state), expected[index], where(trace, index, event))
    }
  } finally {
    if (adapter.dispose) await adapter.dispose(state)
  }
}

for (const entry of CASES) {
  test('[' + ROW + '] [' + entry.id + '] ' + entry.label, () => drive(entry.trace, entry.observations))
}

test('[' + ROW + '] sampled traces (fast-check)', async () => {
  const lengths = []
  await fc.assert(
    fc.asyncProperty(fc.array(fc.nat(), { minLength: BOUND + 1, maxLength: LONGEST }), async (indices) => {
      // 기존과 같은 방식으로 raw trace와 expected를 만든다
      lengths.push(raw.length)
      await drive(raw.map(toPlain), expected)
    }),
    { numRuns: RUNS, seed: SEED },
  )
  // 기존과 같은 executed / beyondBound 검사
})
```

- 기대값은 지금처럼 컴파일된 Bend 모델에서 동기로 계산한다. `await`는 adapter 호출에만 붙는다.
- `dispose`는 선택 사항이다. 테스트 하나가 끝날 때 컴포넌트를 unmount하고 QueryClient·fake timer·
  전역 `fetch` 대체를 원래대로 돌려 놓는다. 다음 case에 상태가 새어 들어가는 것을 막는다.
- adapter가 `dispose`를 내보내지 않으면 `--async` 생성은 `ADAPTER_DISPOSE_MISSING` 경고를 낸다.
  전역 상태를 바꾸지 않는 adapter도 있으므로 경고로 두고 실패로 만들지는 않는다.

### 2.2 emit-state

`concretize`·`step`·`project`·`dispose`를 같은 방식으로 `await`하고 `fc.asyncProperty`를 쓴다.
round trip 검사와 관계 판정은 그대로 둔다.

### 2.3 시간 제한

case 하나가 끝나지 않으면 suite 전체가 멈춘다. `--async`일 때는 case마다 시간 제한을 둔다.

- `--case-timeout <ms>` 기본값은 5000이다.
- 시간 제한을 넘기면 `ADAPTER_TIMEOUT`과 trace, step을 담아 실패한다.
- `delivery/red.md`의 규칙과 같이 timeout은 `VALID_RED`가 아니다. harness 문제로 분류한다.

### 2.4 adapter 감사

`auditAdapterSource`의 금지 목록은 그대로 둔다. 추가로 다음을 허용한다.

- `.tsx`·`.ts` adapter. vitest처럼 TS와 JSX를 실행하는 러너에서만 허용하고,
  `--runner node-test`와 함께 쓰면 `USAGE`로 거부한다.
- `@testing-library/*`, `react`, `react-dom` import. 제품 module import가 최소 하나 있어야 한다는 기존 조건은 유지한다.

리뷰 체크리스트에 한 줄을 추가한다.
"`step`은 이벤트 하나를 넣은 뒤 화면이 안정될 때까지 기다린다(`act` flush). 기대값을 맞추려고 고정 sleep을 넣지 않는다."
고정 sleep은 이미 금지 항목이다.

## 3. 사용 예 — 홈 피드

```sh
node oracle-projection.mjs emit-trace --async --runner vitest \
  --model src/views/home/__test__/formal/MODEL.bend --prefix Feed --bound 4 \
  --adapter src/views/home/__test__/formal/feed.adapter.tsx \
  --out src/views/home/__test__/formal --row O4 --runs 100 --max-length 12
```

```tsx
// feed.adapter.tsx — 사람이 작성하고 리뷰하는 유일한 부분
export async function init() {
  const net = deferredFetch()
  const io = installFakeIntersectionObserver()
  const client = new QueryClient()
  const ui = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <FeedGrid />
      </QueryClientProvider>
    </StrictMode>,
  )
  await flush()
  return { ui, net, io, client }
}
export async function step(s, event) {
  /* Enter·Leave·Resolve·Failed·Retry → 제품 입력, 모르는 이벤트는 throw */ await flush()
  return s
}
export function observe(s) {
  /* 화면에서 View를 읽음 */
}
export function dispose(s) {
  s.ui.unmount()
  s.client.clear()
  s.io.restore()
  s.net.restore()
}
const flush = () => act(async () => {})
```

생성된 파일은 첫 줄에 `// @vitest-environment jsdom`이 필요하다. `--environment jsdom` 옵션으로 넣는다.
vitest를 쓸 때만 허용한다.

## 4. 보장 범위 — 바뀌지 않는 것

- 보고서에는 지금처럼 `formal: proven`(모델)과 `conformance: tested`(제품)를 따로 적는다.
  React 렌더링 경로까지 conformance가 늘어날 뿐이고, 증명 범위가 넓어지는 것은 아니다.
- jsdom과 fake IntersectionObserver는 실제 브라우저의 기하 계산과 스크롤 복원을 검증하지 않는다.
  그 부분은 계속 Playwright journey가 맡는다.
- 표본 실행 횟수 검사(`executed >= RUNS`), bound 밖 trace 검사, `SAMPLING_REQUIRED`는 그대로다.

## 5. 위험과 대응

| 위험                                               | 대응                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 504 case를 각각 mount하면 느리다                   | 측정 전이다. 줄어든 bound는 새 revision으로만 바꾼다. case 수를 줄이려고 bound를 몰래 내리지 않는다 |
| case 사이에 상태가 남는다(QueryClient, 전역 fetch) | `dispose` 계약과 경고. 리뷰 체크리스트                                                              |
| `act` 경고나 끝나지 않은 Promise                   | case별 timeout으로 `ADAPTER_TIMEOUT` 처리. harness 예산으로 처리한다                                |
| 동기 생성 결과가 바뀐다                            | `--async`가 없으면 같은 바이트가 나와야 한다. 기존 fixture snapshot으로 회귀 검사를 한다            |

## 6. 작업 범위와 검증

1. `scripts/oracle-projection.mjs`: `--async`, `--case-timeout`, `--environment` 옵션을 추가한다. async용 `drive` 템플릿과 `dispose`를 추가한다.
2. `scripts/oracle-projection.test.mjs`:
   - 기존 동기 fixture의 생성 바이트가 바뀌지 않는지 확인한다.
   - async adapter fixture(setTimeout으로 상태가 바뀌는 toggle)가 GREEN인지 확인한다.
   - 일부러 틀린 async adapter가 RED인지 확인한다.
   - 끝나지 않는 step이 `ADAPTER_TIMEOUT`을 내는지 확인한다.
   - `.tsx` adapter와 `node-test`를 함께 쓰면 거부되는지 확인한다.
3. `references/bend-cross-verification.md`: emit 명령 설명에 `--async`를 추가하고,
   "동기 adapter만 projection할 수 있음" 문장을 바꾼다.
4. 버전을 올린다. contract test가 요구하는 metadata 정렬도 맞춘다. 번들을 다시 생성한다.

검증 명령: `pnpm --filter @lodado/frontend-oracle-design-plugin test`, `... lint`.

## 7. 결정 필요

- `dispose`가 없을 때 경고로 둘지 실패로 만들지 정해야 한다. 추천은 경고다. 전역 상태를 바꾸지 않는 adapter가 있기 때문이다.
- case별 timeout 기본값 5000ms가 적당한지 정해야 한다. 측정한 값이 아니다.
