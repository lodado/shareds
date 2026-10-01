# frontend-oracle-design 검증 축 정리와 개선 플랜

> 2026-10-01 · frontend-oracle-design v0.71.0 · 구현 전 제안
> **근거:** `next-fsd-app` 홈 피드 무한스크롤 Draft 작업. 여기서 처음으로 모델 패키지 → World → adequacy →
> 카드 projection → cold-read까지 모든 단계를 끝까지 돌렸다. 아래에 적은 문제는 모두 그 과정에서 실제로
> 관찰한 것이다. 각 항목에 근거 위치를 같이 적었다.

## 1. 결론

스킬은 이미 Bend 증명, adequacy, 생성 conformance로 **요청 흐름 상태 머신**을 강하게 검증한다.
약한 곳은 상태 머신 바깥에 있는 축들이다. 시간, 에러 종류, 요청의 정체성, 비동기 경쟁, 데이터 정체성, 라이브러리가
소유한 상태, 브라우저 기하가 여기에 해당한다. 이 축들은 다음 셋 중 하나로 처리되고 있었다.

- 모델 안에서 하나로 뭉쳐진다. 예: 재시도까지 끝난 실패가 `Failed` 하나로 표현됨.
- `Not formalized`로 밀려나서 근거가 이어지지 않는다.
- family 투영 과정에서 의미 없는 축에 매핑된다.

개선 방향은 **새 도구를 더하는 것보다, 이 축들을 모델로 옮기는 방법과 모델 밖에 남는 부분의 근거 형식을 정하는 것**이다.

## 2. 중요하게 다뤄야 할 축

| #   | 축                                           | 무엇이 틀리나                                                                                  | 지금 스킬 상태                                                                        | 권장 처리                                                                                                                                              |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | 요청 정체성 (요청 수 vs 효과 수 vs 호출 수)  | 재시도와 새 요청을 구분하지 못하면 "요청 1건" 계약을 검증할 수 없다                            | §2에 "request count versus effect count" 한 줄뿐. cold-read root가 정확히 이 문제였다 | 모델이 `requests`(정책 단위)와 `fetches`(네트워크 호출)를 따로 세게 하고, 이 구분을 Terms의 `path`에 강제한다                                          |
| A2  | 시간 (재시도 지연, stale, timeout)           | 실제 시간을 모델링할 수 없다는 이유로 시간 축 전체를 빼버린다                                  | fake timer, `Tick`, 가상 시간 관련 지침이 references에 없다                           | **시간을 이벤트로 표현한다.** `Tick`·`Expire` 같은 이벤트를 두고, adapter가 이를 `advanceTimersByTime`으로 바꾼다. 밀리초 값은 adapter의 상수로만 둔다 |
| A3  | 에러 종류                                    | network, 5xx, 4xx, 형식 깨짐이 모두 한 가지 실패로 처리되거나, 반대로 일부가 빠진다            | 일반적인 "error" 자동 TC 토큰만 있다                                                  | `type Err` sum type을 두고 `for k: Err` 법칙을 쓴다. 종류에 따라 동작이 다르면 그만큼 법칙을 분리하고, 정책에 없는 종류는 Q로 남긴다                   |
| A4  | 시도 단위 실패                               | "재시도 N회"가 모델 밖으로 나가 손으로 쓰는 TC가 된다                                          | 모델 예제는 결과 단위 실패만 보여준다                                                 | `AttemptFailed{err}`와 `attempts` 카운터 패턴을 레퍼런스 예제로 추가한다                                                                               |
| A5  | 비동기 경쟁 (Promise 완료 순서)              | refetch와 다음 페이지 요청, 늦게 온 응답과 owner 교체 같은 경쟁                                | `fc.scheduler`가 한 줄 언급된다(bend-cross-verification.md:453)                       | 모델에 이벤트가 있으면 생성 conformance로, 없으면 `fc.scheduler`를 쓴다. 이 결정 표를 Order family 쪽에 둔다                                           |
| A6  | owner 수명 (unmount, 라우트 이동)            | unmount 이후 setState, 이동 중에 도착한 응답                                                   | 체크리스트에 `owner-lifetime`이 있지만 모델 패턴이 없다                               | `Unmount`·`Remount{elapsed}` 이벤트 패턴을 둔다. 캐시 수명(gcTime)과 화면 수명을 분리해서 관찰한다                                                     |
| A7  | 데이터 정체성과 순서 (dedupe, prefix 안정성) | 페이지 수만 세는 모델은 dedupe와 순서를 볼 수 없다                                             | `Not formalized` 문자열로만 기록된다                                                  | **모델 밖 property 근거 형식**을 만든다(§3.4). 계약 행, property 이름, 생성기의 충돌 밀도를 명시한다                                                   |
| A8  | 신뢰 경계 입력                               | 형식 깨진 응답이 렌더된다                                                                      | type-fest witness는 필수이지만 런타임 fuzz 지침이 약하다                              | `fc.anything()` fuzz와 "올바른 결과이거나 지정된 에러만 던진다"는 성질을 파서 경계의 기본으로 둔다                                                     |
| A9  | 라이브러리가 소유한 상태                     | TanStack `cancelRefetch`, 전체 페이지 순차 refetch 같은 함정                                   | Dependency landmines 절차는 있지만 모델에 연결되지 않는다                             | landmine 처리를 `needs-decision`으로 끝내지 말고, 해당 동작을 모델 이벤트 후보(예: `StaleRefetch`)로 등록한다                                          |
| A10 | 브라우저 기하 (IntersectionObserver, 스크롤) | jsdom용 fake IO가 `observe()` 시점에 알림을 주지 않으면 "센티널이 보이는데 멈춤" 버그를 놓친다 | 지침이 없다                                                                           | fake IO 계약(observe 시점 즉시 알림, disconnect 정리)을 adapter 체크리스트에 넣는다. 실제 거리 판정은 Playwright가 맡는다                              |
| A11 | Entry와 복원                                 | 뒤로가기 복원, SSR 첫 페이지                                                                   | Entry family는 있지만 world 축으로만 매핑된다                                         | Playwright journey를 행 근거로 쓸 때의 형식을 명확히 한다(node-test producer 규칙 재사용)                                                              |

## 3. 개선 플랜

### 3.1 모델 패턴 레퍼런스 (A1~A4, A6) — 우선순위 1

`references/model-patterns.md`를 새 노드로 만들고 `bend-cross-verification.md` §2에서 링크한다. 넣을 내용:

- 시간을 이벤트로 표현하기: `Tick`, `Expire`, `Remount{elapsed: Bucket}`. 경계값(예: 5분 직전·직후)은 enum으로 둔다.
- 시도 단위 실패: `AttemptFailed{err}`, `attempts`, `waiting`. 3번째 실패에서 버튼이 나오는 법칙 예시를 포함한다.
- 에러 taxonomy: `type Err` + `for k: Err`. 4xx처럼 정책에 없는 종류는 Q로 남긴다.
- 효과 수 분리: `requests` / `fetches` / `effects`. 각각을 adapter가 어느 경로에서 읽는지 적는다.
- 각 패턴에 `space` 크기가 얼마나 늘어나는지와, 크기가 넘칠 때 bound를 낮추고 샘플을 늘리는 규칙을 같이 둔다.

**검증:** 패턴마다 fixture를 하나씩(`test-fixtures/retry-backoff/`) 둔다. `prove` → `space` → `emit-trace` → 일부러
틀린 mutant가 잡히는지 확인하는 테스트를 `oracle-projection.test.mjs`에 추가한다.

### 3.2 family 투영 품질 (A5, A7, A10) — 우선순위 1

관찰: 홈 피드 카드에서 projection 결과가 `frames 0`이었다. 모든 family가 "excluded: enumerated exhaustively
derived world axes"로 나왔다. 그리고 Order는 `shownStable`(순서가 아니라 관찰 결과)에, Environment는
`nearBottom`에 매핑됐다(`derived.json`). `orderObligations`는 0이었다.

- `derive`가 `observable` 역할만 가진 축을 Order에 매핑하면 경고를 낸다. Order는 이벤트 간 순서여야 한다.
- world가 끝 상태 하나만 표현하는 경우 Order·Async family를 "world로 전부 열거됨"으로 제외하지 못하게 한다.
  이 경우에는 behavior model의 trace space(`orderObligations`)를 근거로 대거나, 명시적인 이유를 요구한다.
- 경쟁 조건 결정 표: 모델에 이벤트가 있으면 생성 conformance를 쓰고, 없으면 `fc.scheduler` property를 쓰거나 Q로 남긴다.

**검증:** `oracle-package.test.mjs`에 end-state world fixture를 넣고, Order가 제외되면 lint가 실패하는지 확인한다.

### 3.3 요청 정체성 강제 (A1) — 우선순위 1

- Terms에 `effect-count` 해저드가 `modeled`로 표시됐다면, 관찰 필드의 `path`가 "무엇을 하나로 세는지"를 적어야 한다.
  예: 새 커서인지 버튼을 누른 직후인지. 그렇지 않으면 경고한다.
- cold-read 질문 5개에 "카운트 단위가 테스트에서 관찰 가능한가"를 추가한다. 이번 cold-read root가 이 문제였다.

### 3.4 모델 밖 property 근거 형식 (A7, A8) — 우선순위 2

지금 `notFormalized`는 자유 문자열이라 어떤 근거와도 연결되지 않는다. 다음과 같이 바꾼다.

```json
"outsideModel": [
  { "row": "O8", "kind": "property", "test": "mergePages: first-seen order, no duplicate",
    "generator": "ids 0..30, ≤8 pages", "collisionCheck": "≥1 duplicate per run asserted" }
]
```

- `evidence.json`과 같은 식으로 테스트 이름을 run 결과와 대조한다.
- 생성기가 실제로 충돌을 만들었는지 property 안에서 assert하게 한다. 그래야 "dedupe 코드가 한 번도 실행되지 않았는데
  통과"하는 경우를 막는다. 생성 conformance의 `beyondBound` 검사와 같은 원리다.

### 3.5 adapter 체크리스트 (A6, A10) — 우선순위 2

`subagent-review` 체크리스트에 추가할 항목:

- fake IO는 `observe()` 시점에 현재 교차 상태를 알리고, `disconnect`로 정리한다.
- fetch 가짜는 deferred 방식이어야 하고, 호출 로그에 커서를 남긴다.
- fake timer는 `dispose`에서 원래대로 돌린다. 고정 sleep은 금지한다.
- StrictMode로 감싼다(이중 effect 실행 버그 검출).
- 모델 이벤트 중 제품 입력이 없는 것(예: 버튼이 없을 때의 `Retry`)은 "입력 없음"으로 처리한다. 이렇게 처리한 근거를 주석으로 남긴다.

### 3.6 라이브러리 landmine을 모델로 연결 (A9) — 우선순위 3

- landmine 행의 처리값에 `modeled: <event>`를 허용한다. 예: TanStack `cancelRefetch` → `StaleRefetch` 이벤트 + 법칙.
- 처리값이 `needs-decision`으로만 남은 landmine은 Draft에서 Q로 승격한다. 이건 이미 있는 규칙이고 그대로 둔다.

### 3.7 작업 마찰 줄이기 — 우선순위 2

이번 작업에서 실제로 시간을 쓴 부분이다.

| 마찰                            | 근거                                                                                                                                                                            | 개선                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bend Base와 이름 충돌           | `Fail`, `Scroll`이 이미 Base에 있어서 `duplicate declaration` 오류가 남. analyst와 controller 모두 이름을 바꿔야 했다                                                           | `oracle-model.mjs`가 Base 예약 이름 목록을 출력하는 옵션을 준다. model-input에도 그 목록을 넣는다                      |
| 패키지 스키마를 찾기 어려움     | `openQuestions`(`{id,text,sources}`), assumption registry(`evidence`·`riskIfFalse`·`testability`·`status`) 형식을 알려고 소스 코드를 읽어야 했다. example JSON에 이 필드가 없다 | `model-package.example.json`에 모든 필드를 최소 1개씩 넣는다. `validate`가 기대하는 형태를 에러 메시지에 같이 보여준다 |
| `--require` 반복                | zsh에서 `$R` 변수 확장이 한 덩어리로 들어가서 USAGE 오류가 남                                                                                                                   | `--require-all`(LAWS.bend의 모든 law) 또는 쉼표로 구분한 목록을 지원한다                                               |
| `+List` 수량 오류               | `Feed.run`과 `exs` 둘 다 `+List`가 필요했다                                                                                                                                     | model-patterns 예제에 `+` 수량이 들어간 trace 헬퍼를 넣는다                                                            |
| 잠금 전 검사가 ledger 밖에 있음 | `prove`·`space`·adequacy 결과를 보고서에 어떻게 적어야 할지 애매하다                                                                                                            | 보고 문구 규칙("pre-lock, not ledger evidence")을 common.md 메시지 형식에 넣는다                                       |

### 3.8 독립성 순서 (adequacy) — 우선순위 3

관찰: controller가 analyst의 goal을 읽은 다음에 계약 행을 썼다. 그 결과 `goalAudit`에서 모든 safety goal이 계약 행 하나와
일대일로 겹쳤고, 주장 수준은 `self-consistency`가 됐다.

- 계약 행 초안을 analyst를 보내기 **전에** package에 먼저 기록한다. 이후 diff로 순서를 증명한다.
  또는 순서가 뒤바뀐 경우 `independence.evidence`에 `order: contract-after-goals`를 남긴다.

## 4. 순서와 검증

1. 3.1 + 3.3 + 3.7의 스키마와 예제 정리(한 PR). fixture 1개, mutant 테스트, 문서 노드 1개.
2. 3.2 family 투영 lint(한 PR). 기존 fixture가 회귀하지 않는지 확인한다.
3. 3.4 + 3.5 근거 형식과 체크리스트(한 PR). `oracle-verify evidence` 확장.
4. 3.6, 3.8(작은 PR).

각 PR은 패키지 `pnpm test`, `pnpm lint`, contract test(버전 정렬), 번들 재생성을 통과해야 한다.
홈 피드 카드를 회귀 사례로 다시 projection해서, frames가 0이 아니고 Order family가 의미 있는 축에 매핑되는지 확인한다.

## 5. 바꾸지 않는 것

- Bend 필수, model-first, 사용자 승인, VALID_RED, ledger 기반 완료.
- 증명과 테스트의 구분. 시간과 에러를 모델에 넣어도 제품 쪽은 계속 `conformance: tested`로 보고한다.
- 브라우저 기하와 시각 요소는 Playwright와 `$frontend-visual-qa`가 맡는다.

## 6. 결정 필요

- `model-patterns.md`를 새 노드로 만들지, `bend-cross-verification.md` §2 안에 넣을지. 추천: 새 노드. §2가 이미 길다.
- family 투영 lint(3.2)를 경고로 둘지 실패로 막을지. 추천: 실패. frames 0인 카드가 잠기는 것을 막아야 한다.
