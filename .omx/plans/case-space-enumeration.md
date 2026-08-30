# Case-space 전수 열거 플랜 — 스킬의 궁극 목표

작성: 2026-08-30. 선행: `.omx/plans/oracle-discovery-gap.md` (interaction sweep, 0.34.x로 출시됨).
목표 선언: **모든 경우의 수를 카드 시점에 예지하고, BVA 기반으로 테스트 플랜과 구현을 도출한다.**

## 1. "전수 예지"의 정확한 정의 — 속이지 않기 위한 경계

무한 입력 공간의 문자 그대로의 전수는 불가능하다. 확립된 정의는:

> **전수 = (1) 유한 추상화(차원×동치류)를 명시하고, (2) 그 추상화 안에서는 기계가
> 빠짐없이 열거하며, (3) 추상화 자체의 구멍은 별도 루프로 회수한다.**

- (2)의 정당화: [small-scope hypothesis](https://users.ece.utexas.edu/~khurshid/papers/BET.pdf)
  — 대부분의 결함은 작은 반례를 가지므로, 작은 scope 안의 bounded exhaustive는 그 scope
  안에서 sound & complete다. scope 선택을 명시·감사 가능하게 하는 것이 핵심.
- (3)은 이미 출시됨: I\* 불변식 + 탐색 phase(모델 밖 그물) + escaped-bug 루프(미지 축 →
  기지 차원 승격).

이 플랜은 (1)·(2)를 만든다. 지금 스킬의 결함: **열거 주체가 LLM 회상**이라 (2)가
확률적이다. 해법: 열거는 기계, LLM은 판정만.

**정확한 완전성 주장 (2026-08-30 사용자 정정 반영)**: "완전성이 구성적으로 보장"은
조건부다 — 정의된 Category/Choice 공간 **내부에서만** completeness가 기계적으로 정의된다.
차원 목록에 `Platform(browser)`이 없으면 Safari 원인 결함은 프레임 공간에 존재하지 않고
영원히 생성되지 않는다. 완전성은 2단계다:

1. 프레임 ⊂ 차원 공간 — **기계적** (`oracle-frames.mjs` + `frame-undispositioned`)
2. 차원 공간 ⊂ 현실 — **기계화 불가** (frame problem). 어떤 기법도 축 발명을 자동화하지
   못한다; Antithesis조차 property는 사람이 쓴다.

2단계의 보정이 §3-4의 5층 스택이다. 층마다 "생각 못한 축"이 어디서 회수되는지, Safari
예시로 추적 가능해야 한다.

## 2. 레퍼런스 → 파이프라인 매핑

| 기법                                                                                         | 출처                                                                                                                                                                                             | 이 시스템에의 번역                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Category-Partition: categories → choices → constraints → 프레임 기계 생성 (TSL/TSLgenerator) | [Ostrand & Balcer, CACM 1988](https://dl.acm.org/doi/pdf/10.1145/62959.62964), [KAIST 강의 PDF](https://swtv.kaist.ac.kr/courses/cs453-sw-verification-tech-fall-10/category-partition.pdf)      | 카드 `## Case space` 섹션 + `oracle-frames.mjs` 생성기                                                                                                  |
| choices의 내용 = 동치류 + 경계값                                                             | 동 방법론, [Equivalence partitioning](https://en.wikipedia.org/wiki/Equivalence_partitioning)                                                                                                    | **기존 bva.md 5축이 choices 규칙으로 그대로 편입** — BVA가 목표의 기반이라는 선언과 일치                                                                |
| error/single 주석으로 프레임 폭발 제어                                                       | Category-Partition 원문                                                                                                                                                                          | 에러류 choice는 단독 프레임 1개, 조합에 안 태움                                                                                                         |
| Classification Tree Method + pairwise/threewise                                              | [Grochtmann & Grimm](https://www.semanticscholar.org/paper/a0b63de333e2608279b811e273d1a3fcafa021c1), [CTM 개요](https://en.wikipedia.org/wiki/Classification_Tree_Method), ISO/IEC/IEEE 29119-4 | 조합 강도 t=2 기본, High risk t=3 — NIST 근거는 선행 플랜에                                                                                             |
| 상태기계 전 경로 생성                                                                        | [@xstate/graph 경로 생성](https://stately.ai/docs/xstate-test), [CSS-Tricks 실전](https://css-tricks.com/model-based-testing-in-react-with-state-machines/)                                      | 카드 `## State Model` 전이표는 이미 기계 판독 가능 — **자체 경로 열거기**(작은 digraph, 외부 의존 불필요; @xstate/graph v5는 아직 beta 마이그레이션 중) |
| 랜덤 커맨드 시퀀스 + race 탐지                                                               | [fast-check model-based](https://fast-check.dev/docs/advanced/model-based-testing/) (`fc.commands`, `fc.scheduler`)                                                                              | async·순서 행 있는 카드에서 **필수**로 승격 (현재 "검토" 문구)                                                                                          |
| LLM 자유 생성 = 커버리지 미달, 구조 강제 = 전 경로                                           | [ISEC 2025 LLM 비교연구](https://dl.acm.org/doi/10.1145/3717383.3717389), [arXiv 2505.09830](https://arxiv.org/html/2505.09830)                                                                  | 설계 원칙: **프레임은 기계가 생성, LLM은 disposition만 채움, lint가 완전성 판정**                                                                       |

## 3. 설계 — 3개 산출물

### 3-1. 카드 `## Case space` 섹션 (신규 reference `card/case-space.md`)

Category-Partition의 카드 번역. 차원 목록은 자유 발명이 아니라 **고정 분류표에서 전제
매칭으로 선택**한다(7 auto-TC와 같은 규율). 프런트엔드 고정 분류(초안):

| 차원 계열          | choices 도출 규칙 (전부 bva.md에서)                     |
| ------------------ | ------------------------------------------------------- |
| Data volume        | 0 / 1 / 경계(페이지 크기±1) / max — bva 값 경계         |
| Value (필드별)     | min−1/min/min+1, 형식 위반, 중복, Unicode — bva 값 경계 |
| Async state (op별) | idle/pending/success/error(subtype별) — bva 상태 경계   |
| Order (op쌍별)     | 순차/역전/중복/취소 후 늦은 응답 — bva 시간·순서 경계   |
| Entry path         | 신규 진입/새로고침/back·forward/딥링크                  |
| Environment        | viewport 경계/theme/reduced-motion/StrictMode           |
| Inherited          | 승계 P\* (interaction sweep과 접점)                     |

카드에는 표로 선언한다:

```markdown
## Case space

| Dimension        | Choices                               | Constraint |
| ---------------- | ------------------------------------- | ---------- |
| rows             | 0, 1, pageSize, pageSize+1, max       |            |
| page request     | success, 5xx [error], timeout [error] |            |
| sort during load | none, change-while-pending            |            |
| entry            | fresh, back-forward, refresh          |            |
| viewport         | 320, desktop                          | single     |
```

`[error]` = 단독 프레임(조합 제외), `single` = 대표 1값만 조합. 원문 주석 체계 그대로.

### 3-2. `oracle-frames.mjs` (신규 스크립트) — 열거의 기계화

1. `## Case space` 표 파싱 → **t-way covering 프레임 목록을 결정적으로 생성**
   (greedy pairwise, ~100줄, 외부 의존 0 — PICT/ACTS 도입 안 함: 프레임 수십 개
   규모에 바이너리 의존은 과함).
2. `## State Model` 전이표 파싱 → **전 단순 경로 + 빈 셀 목록** 열거 (~30줄).
3. 출력: 프레임/경로마다 ID (`F1…`, `PATH1…`). 카드의 `## Frame dispositions` 표와 대조:
   - 모든 프레임은 `covered(O*)` / `needs-decision: 질문` / `infeasible: 제약` 중 하나
   - **판정 없는 프레임 = lint 실패** (`frame-undispositioned`) — sweep-policy-missing과
     같은 "침묵은 셀로만 가능" 원칙의 프레임 판
4. `oracle-verify.mjs card`에 통합: Case space 섹션 존재 시 frames 검사 실행.

여기가 질적 도약: 선행 플랜의 sweep은 표를 **LLM이 만들고** lint는 구조만 봤다.
이제 표의 행(프레임)은 **기계가 만들고** LLM은 판정 셀만 채운다. ISEC 2025가 보여준
LLM 열거 불완전성이 구조적으로 제거된다.

### 3-3. $test 파생 강제 (기존 "검토" → 트리거식 "필수")

- `## State Model` 존재 → 열거된 전 경로 각각에 테스트 매핑 (경로 = describe 이름),
  빈 셀 = "도달 불가" 단언. 매핑 누락 = 행 스킵과 동급 (GREEN 불가).
- Order 차원에 choices 2개 이상 → `fc.commands`(모델 대조) 또는
  `fc.scheduler`(promise 순서 셔플) 중 하나 필수. deferred pending barrier 패턴과 결합.
- Data volume·Value 프레임 → 기존 단위 테스트로 (변화 없음).

### 3-4. 차원 누락의 보정 — 5층 스택 (§1의 2단계 문제)

"생각 못한 축"은 단일 장치로 회수되지 않는다. 층마다 성질이 다르고, 결함 하나가 여러
층에서 독립적으로 걸리도록 설계한다. 추적 예시: **결함 원인이 `browser=Safari`인데
카드 차원에 Platform이 없는 경우.**

| 층  | 장치                                                                                                                                                                                                                                                                                                                                                                             | 성질                                                    | Safari 예시에서                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | **분류표를 발명하지 않고 수입** — 고정 분류표를 우리 회상이 아니라 확립된 카탈로그 병합으로 구축: [HTSM/SFDIPOT](https://www.satisfice.com/download/heuristic-test-strategy-model) (Platform 계열이 browser·OS를 이미 포함), [Hendrickson 휴리스틱 치트시트](https://testobsessed.com/wp-content/uploads/2011/04/testheuristicscheatsheetv1.pdf), ISO 25010. 각 계열에 출처 기록 | 반정적 — 업계가 이미 결함으로 지불한 축의 총합에서 시작 | Platform 계열이 분류표에 **이미 있음** — 우리가 떠올릴 필요 없음                                                                     |
| L2  | **계열 단위 disposition lint** — 분류표의 모든 계열은 카드에서 `instantiated`(차원 선언) 또는 `excluded: 사유` 중 하나여야 함 (`family-undispositioned`). 침묵→선언 강제의 계열판                                                                                                                                                                                                | 기계적                                                  | 카드에 최소 `Platform: excluded — 단일 브라우저 가정` 선언이 남음. 결함 발생 시 "생각 안 함"이 아니라 "기록된 scope 결정"으로 감사됨 |
| L3  | **환경 축은 상상이 아니라 레포에서 파생** — Platform choices = 대상 레포의 `browserslist`·`engines`가 원본. 코드가 쓰는 API×[MDN BCD](https://github.com/mdn/browser-compat-data)/`eslint-plugin-compat` 대조는 대상 레포에 이미 있을 때만 활용                                                                                                                                  | 기계적(부분) — 파생 가능한 계열만                       | browserslist에 Safari가 있으면 choices에 **기계가 넣음**                                                                             |
| L4  | **모델 무관 그물을 환경 매트릭스로** — I\*·탐색 phase를 Playwright 기본 동봉 engine(chromium+**webkit**)에서 실행. 축을 몰라도 위반이 관측면에 뜸                                                                                                                                                                                                                                | 확률적이나 축 인지 불필요                               | webkit run에서 console error·layout 위반으로 **원인 모른 채 잡힘**                                                                   |
| L5  | **escape 루프 = 유일한 미지→기지 변환기** — 새어나간 결함마다 누락 차원을 분류표에 승격. 분류표는 스킬 레포 공유 자산이라 한 프로젝트의 수업료가 전 카드에 상각됨 (항공 ASRS·수술 체크리스트 모델)                                                                                                                                                                               | 사후적, 단조 수렴                                       | 이 결함 이후 모든 카드가 Platform을 물음                                                                                             |

수학 정리: 카드 하나의 완전성은 조건부다. 그러나 조건(분류표)은 (a) 업계 최대치에서
초기화되고(L1), (b) 카드마다 경계가 가시화되며(L2), (c) 파생 가능한 계열은 기계가
채우고(L3), (d) 단조 성장한다(L5). 잔여 = L1 수입 카탈로그에 없고 + L3로 파생 불가하고

- L4 관측면에 안 뜨는 축 — 축소 불가능하지만 작고, 시간이 갈수록 줄어드는 집합.

## 4. Interaction sweep과의 관계

sweep(출시됨) = 정책×정책·정책×런타임의 **판정** 곱. Case space = 입력×상태×순서의
**프레임** 곱. 겹치는 축(Inherited, StrictMode)은 sweep이 소유하고 Case space는 참조만
한다 — 같은 판정을 두 표에 쓰게 하지 않는다. 장기적으로 sweep을 Case space의 한 차원
계열로 흡수할 수 있으나 이 플랜의 경계 밖(출시 직후 문서를 다시 흔들지 않는다).

## 5. 서버 페이지네이션 테이블 dry-run (수용 기준용, 일반 도메인)

Case space 위 예시 기준 기계 생성 결과(개략): pairwise 프레임 ~12개 + error 단독 3개

- State Model 경로 ~8개 = **판정 대상 ~23개**. 전 곱 5×3×2×3×2=180 대비 87% 절감,
  [NIST](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software/combinatorial-methods-in-testing/interactions-involved-in-software-failures) 근거로 2-way가 결함 50~90% 포착. 예상 needs-decision: "back-forward × pending",
  "sort-while-pending × 5xx", "pageSize+1 × refresh" — 전부 지금은 구현 중에 밟는 것들.

## 6. 구현 단계

| 순서 | 산출물                                                                      | 파일                                                  | 비용            |
| ---- | --------------------------------------------------------------------------- | ----------------------------------------------------- | --------------- |
| P0   | `card/case-space.md` — 고정 분류·choices 규칙(bva 편입)·주석 체계·섹션 포맷 | 신규 reference + graph 노드 + 번들 + SKILL 7단계 편입 | 문서            |
| P1   | `oracle-frames.mjs` — covering 생성 + 경로 열거 + disposition lint          | 신규 스크립트 + `oracle-verify.mjs` 훅 + 테스트       | ~200줄 + 테스트 |
| P2   | $test 트리거 강제 — 경로 매핑 필수, fc.commands/scheduler 필수 트리거       | test SKILL.md + delivery/red.md                       | 문서            |
| P3   | 계약 pin + 4-manifest bump + 배포 (Claude·jcode)                            | 관례대로                                              | 소량            |

P0 범위 추가 (§3-4 반영): 고정 분류표는 SFDIPOT·Hendrickson·ISO 25010 병합으로 구축하고
계열마다 출처를 기록(L1). 계열 단위 disposition 규칙과 "Platform choices는 browserslist
파생" 규칙을 case-space.md에 명기(L2·L3). P1 범위 추가: `family-undispositioned` lint.
P2 범위 추가: visual-qa 탐색·I\* 실행 환경 기본값에 webkit 포함(L4, Playwright 동봉
engine이라 의존 추가 없음).

## 7. 수용 기준

1. r11b 소급: 결함 4건이 프레임/경로/sweep 셀 중 하나로 생성된다 (기계 생성 목록에서
   지목 가능해야 함 — "질문 은행에 있으니 잡혔을 것" 수준의 주장 금지).
2. 서버 테이블 dry-run: §5의 needs-decision 3종이 실제로 생성 목록에 나타난다.
3. `frame-undispositioned` lint: 판정 누락 프레임이 있는 카드는 lock 불가.
4. 프레임 수 상한: Medium 카드 t=2 기준 프레임 50개 초과 시 차원 분해를 요구하는
   경고 (`case-space-too-wide`) — bva의 "@ts-expect-error 30개 = 설계 실격선"과 같은 원리.
5. 스킬 계약 테스트 GREEN + 기존 v1 카드(Case space 없음) 하위 호환.
6. **Safari 시나리오 (§3-4 검증)**: Platform 계열이 분류표에 존재하고(L1), Platform을
   선언도 제외도 안 한 카드는 `family-undispositioned`로 lock이 막히며(L2), browserslist
   있는 레포에서 Platform choices가 그 목록으로 채워지고(L3), webkit 매트릭스 실행이
   탐색 phase 기본값에 있다(L4).

## 8. 경계 (안 하는 것)

- PICT/ACTS/CTE 외부 도구 도입 — 프레임 수십 개 규모에 과함.
- Alloy/TLA+ 수준 형식 명세 — 카드의 전이표·Case space 표가 그 역할의 경량판.
- 문자 그대로의 무한 전수 주장 — §1 정의 밖의 완전성은 주장하지 않고, 모델 밖은
  I\*·탐색·escaped-bug 루프가 소관한다는 문장을 case-space.md에 명기.
- @xstate/graph 의존 — v5 마이그레이션 미완(beta), 전이표 자체 열거가 더 작고 결정적.
