# frontend-oracle-design 0.1.9 상세 평가

> 평가 기준일: 2026-08-16  
> 평가 대상: <code>@lodado/frontend-oracle-design-plugin</code> 0.1.9  
> 기준 커밋: <code>b8f675b8801056cd21390eafcef2b5b144d32fbb</code>  
> 한 줄 판정: **승인된 UI 의도를 AI가 임의로 바꾸지 못하게 하는 전달·검증
> 거버넌스로는 강하지만, 좋은 디자인을 발견하는 도구로 보기에는 사용자 학습과 실제
> 브라우저 검증이 부족하다.**

## 1. 읽는 법과 조사 범위

이 보고서는 서로 다른 종류의 주장을 다음과 같이 구분한다.

- **확인된 사실**: 저장소의 현재 코드·문서 또는 링크한 1차 자료에서 직접 확인한 내용
- **해석**: 확인된 사실을 바탕으로 한 비교·평가. 인과관계를 입증했다는 뜻은 아니다.
- **제안**: 다음 버전에서 채택할 수 있는 변경안

### 1.1 검토한 로컬 자료

핵심 스킬 문서, Oracle Card/BVA/시각 계약/구현 루프/아키텍처/리뷰 지침과 아래 실행
코드를 함께 읽었다.

- <code>skills/SKILL.md</code> [L1]
- <code>skills/references/oracle-card.md</code> [L2]
- <code>skills/references/bva.md</code> [L3]
- <code>skills/references/visual-design.md</code> [L4]
- <code>skills/references/implementation-loop.md</code> [L5]
- <code>skills/references/frontend-implementation.md</code> [L6]
- <code>skills/references/architecture-contract.md</code> [L7]
- <code>skills/references/fsd.md</code>, <code>backend.md</code>,
  <code>subagent-review.md</code> [L8][L9][L10]
- <code>oracle-lock.mjs</code>, <code>oracle-run.mjs</code>,
  <code>oracle-verify.mjs</code>와 해당 테스트 [L11][L12][L13][L14]

외부 비교에는 가급적 원저자·공식 문서·공식 대회 페이지·원 논문을 사용했다. 블로그
요약을 다시 인용하지 않았다.

### 1.2 해석상의 한계

1. 점수는 실험으로 측정한 제품 KPI가 아니라, 문서와 구현을 기준으로 한 전문가
   휴리스틱 평가다.
2. 대회 페이지는 심사 기준과 결과를 보여 주지만 “이 한 가지 때문에 우승했다”는
   인과관계까지 증명하지 않는다. 따라서 이 보고서의 “우승 전략”은 공개된 심사표,
   수상작 설명, 벤치마크 방법에서 **재현 가능한 패턴을 추출한 것**이다.
3. WebDev Arena의 구조화 출력 실험은 Oracle Card 자체를 실험한 것이 아니다. 이를
   “제약 비용이 존재할 수 있다는 경고”로만 사용하며, Oracle이 같은 폭으로 품질을
   낮춘다고 주장하지 않는다.
4. “최신”은 평가 기준일인 2026-08-16까지 공개된 자료를 뜻한다.

---

## 2. Executive Summary

### 2.1 이 스킬은 무엇인가

**확인된 사실.** 이 스킬은 UI를 곧바로 생성하기보다 다음 순서를 강제한다. 사용자의
결정과 출처를 Oracle Card에 기록하고, 시각 계약(D 행)과 동작 계약(O 행), 경계값,
부작용 횟수, 금지 결과를 명시한다. 그 카드를 SHA-256으로 잠근 뒤 RED → GREEN →
독립 리뷰와 재검증으로 전달 증거를 쌓는다. [L1][L2][L3][L5]

**해석.** 따라서 가장 정확한 제품 범주는 “frontend design copilot”보다
**design-intent delivery harness**다. 즉:

- 강한 질문: “승인한 동작과 시각 의도가 구현·테스트·리뷰까지 보존되었는가?”
- 약한 질문: “사용자가 실제로 무엇을 필요로 하며, 여러 후보 중 어느 디자인이 더
  좋은가?”

### 2.2 핵심 판정

| 사용 맥락                              | 판정                   | 이유                                                                        |
| -------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| 결제·인증·파괴적 작업·복잡한 비동기 UI | **적극 권장**          | 중복 제출, 재시도, 순서 역전, 취소, 부작용 횟수와 증거 추적이 중요하다.     |
| 디자인 시스템 기반의 중대 UI 변경      | **권장**               | 토큰·출처·시각 증거·독립 리뷰를 한 계약으로 묶는다.                         |
| 일반 기능 개발                         | **조건부 권장**        | 현재 full ceremony보다 위험도별 축약형이 필요하다.                          |
| 한 줄 copy/CSS 수정                    | **현 상태로는 비권장** | 카드·승인·아키텍처·lock 비용이 변경 위험보다 커질 수 있다.                  |
| 탐색적 브랜딩·마케팅 페이지            | **보조 도구**          | 선택된 안의 전달에는 좋지만 후보 생성과 사용자 선호 학습은 약하다.          |
| 해커톤·5분 데모                        | **축약형만 권장**      | rubric과 핵심 흐름에는 유용하지만 full workflow는 demo throughput을 해친다. |

### 2.3 점수표

점수는 10점 만점이며, 서로 다른 목적을 억지로 평균 내지 않았다.

| 평가 축             |    점수 | 근거 요약                                                                       |
| ------------------- | ------: | ------------------------------------------------------------------------------- |
| 계약의 명확성       | **9.0** | Then/Never, 부작용 횟수, D/O 분리, 출처와 BVA가 구체적이다.                     |
| TDD·회귀 방지 설계  | **8.5** | production-before-RED 방지, 연속 GREEN, 테스트 약화 휴리스틱이 있다.            |
| 증거 추적성         | **8.0** | lock hash, run ledger, reporter, 행별 evidence mapping이 연결된다.              |
| 사용자 중심 UX 검증 | **5.0** | 휴리스틱은 강하지만 실제 사용자 관찰·task success 단계가 없다.                  |
| 시각 탐색·창의성    | **5.5** | Proposal 개념은 좋지만 다안 비교·선호 학습·탐색 예산이 약하다.                  |
| 작은 변경의 효율    | **4.5** | 모든 React UI 변경에 적용하기에는 승인·문서·리뷰 절차가 무겁다.                 |
| 기계적 강제력       | **6.5** | 도구는 실제로 존재하지만 상태 전이와 증거 검증이 완전히 결합되지 않았다.        |
| 장기 운영성         | **6.0** | durable artifact 의도는 좋지만 로컬 JSONL, stale card, 누적 eval 부재가 남는다. |

**결론:** 문서가 약속하는 규율은 8점대지만, 현재 CLI가 그 약속을 우회 불가능하게
강제하는 정도는 6점대다. 다음 버전의 최우선 목표는 새 기능 추가가 아니라 **이미
있는 검증기를 상태 전이에 연결하는 것**이어야 한다.

---

## 3. 현재 설계 해부

### 3.1 정책 출처와 관찰 증거를 분리한다

**확인된 사실.** 현재 구현, 기존 테스트, 브라우저에서 우연히 보이는 동작은 정책의
정답이 아니라 조사 증거로 취급한다. 사용자가 승인한 텍스트·디자인 소스·기존
프로젝트 계약을 Source Registry에 기록하고, 열 수 없는 자료를 기억이나 유사
스크린샷으로 대체하지 않는다. [L2]

이 구분은 매우 중요하다. 기존 버그를 golden screenshot으로 승인하거나, 구현
세부사항을 테스트가 “정답”으로 굳히는 순환 논리를 막기 때문이다.

### 3.2 D 행과 O 행을 분리한다

- **D(Design) 행**: copy, hierarchy, typography, spacing, theme, responsive,
  reduced motion 등 시각 의도를 다룬다.
- **O(Operational) 행**: 사용자 행동, 로딩/성공/오류, 부작용 횟수, 중복 실행,
  재시도, 취소, out-of-order 응답 등을 다룬다.
- 각 행은 원하는 결과(Then)뿐 아니라 절대 일어나면 안 되는 결과(Never)를 둔다.
  [L2][L4]

이 분리는 “화면이 닮았다”와 “사용자가 안전하게 일을 마쳤다”를 같은 screenshot으로
판정하지 않게 한다.

### 3.3 경계값 분석을 기본값으로 둔다

**확인된 사실.** BVA 문서는 명시된 구간의 경계뿐 아니라 중복, 오류, 재시도,
빈 데이터, 로딩, out-of-order, 취소를 자동 검토 대상으로 둔다. API 호출 횟수와
순서도 handler에서 관찰하도록 한다. [L3]

이는 happy path 중심 AI 코딩의 대표적인 실패를 직접 겨냥한다. 특히 결제 버튼의
double-click, 이전 요청이 늦게 도착하는 검색 UI, 이탈 후 state update 같은 문제는
시각 snapshot만으로 발견하기 어렵다.

### 3.4 문서가 아닌 실행 가능한 상태 기계를 둔다

현재 상태 흐름은 다음과 같다. [L12]

```text
ORACLE_READY
  ├─ VALID_RED
  │    └─ IMPLEMENTED_GREEN
  │          └─ REVIEW_VERIFIED
  ├─ IMPLEMENTED_GREEN  (기존 구현이 이미 GREEN인 예외)
  ├─ NEEDS_DECISION
  └─ FAIL
```

Oracle lock 검증, 명령 실행 결과, reporter가 파싱한 테스트 이름, 환경 fingerprint,
worktree digest와 상태 이력이 로컬 artifact로 남는다. 위험도에 따라 같은 명령의
연속 성공을 low 1회, medium 2회, high 3회 요구한다. [L11][L12]

### 3.5 시각 증거를 세 계층으로 나눈다

**확인된 사실.** 시각 계약은 다음처럼 분류된다. [L4]

- **HARD**: copy, role, focus, theme, reduced motion, overflow, token처럼 비교적
  결정적으로 검사할 수 있는 항목
- **RELATIONAL**: hierarchy, reading order, reflow, 요소 간 관계
- **JUDGMENT**: 고유성, typography의 성격, signature, 절제, voice처럼 판단이 필요한
  항목

이 분류는 모든 디자인 질문을 pixel diff로 환원하지 않는다는 점에서 좋다. 다만 현재
완료 증거는 headless style/screenshot에 무게가 있고, 실제 사용자가 핵심 흐름을
브라우저에서 완료하는 동적 검증은 필수 gate로 연결되어 있지 않다. [L4][L5][L10]

---

## 4. 여러 구루의 관점에서 본 평가

### 4.1 UX·제품 디자인

| 관점                | 잘 맞는 점                                                                                         | 충돌하거나 빠진 점                                                                                                                                  | 보완 방향                                                                                       | 근거                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Jakob Nielsen**   | loading/error, system status, error prevention, user control, consistency를 D/O 계약으로 명시한다. | recognition over recall, 실제 사용자 언어, 도움말, learnability를 검증하는 단계가 없다. 휴리스틱 준수는 usability 입증과 같지 않다.                 | 핵심 task의 usability test와 task-success/오류/막힘 기록을 high-risk 또는 신규 흐름에 추가한다. | 10 Usability Heuristics [UX1], Usability Testing 101 [UX2] |
| **Don Norman**      | feedback과 constraints, action의 결과, 오류 방지가 강하다.                                         | 사용자의 mental model, signifier, discoverability가 실제로 맞는지 관찰하지 않는다. “승인자에게 명확함”과 “처음 온 사용자에게 발견 가능함”은 다르다. | prototype 단계에서 첫 클릭, 망설임, 잘못된 해석을 관찰하고 그 결과로 Oracle을 갱신한다.         | The Design of Everyday Things [UX3]                        |
| **Steve Krug**      | “명시적이고 애매하지 않게” 만드는 계약은 불필요한 추측을 줄인다.                                   | 전문가가 쓴 완벽한 카드가 짧은 실제 사용자 테스트를 대체할 위험이 있다.                                                                             | 대규모 연구가 아니라도 대표 사용자에게 핵심 task를 보여 주는 lean usability checkpoint를 둔다.  | Don't Make Me Think [UX4], NN/g의 실무 절차 [UX2]          |
| **Dieter Rams**     | 자의적 장식 금지, restraint, 명료한 목적, 가능한 한 적은 디자인이라는 태도와 매우 잘 맞는다.       | “정책에 없는 것은 하지 않는다”가 지나치면 혁신과 새로운 signature까지 억제할 수 있다.                                                               | delivery에는 restraint를 유지하되 discovery에서는 2–3개 의도적으로 다른 제안을 허용한다.        | Ten Principles for Good Design [UX5]                       |
| **Brad Frost**      | 토큰, 컴포넌트 재사용, 공통 어휘, 부분과 전체의 계약은 Atomic Design과 잘 맞는다.                  | 디자인 시스템은 고정된 법전이 아니라 실제 사용과 데이터로 진화하는 제품이다. revision lock이 오래 지속되면 stale contract가 된다.                   | 완료 후 analytics, 사용자 테스트, escaped defect를 다음 revision의 입력으로 되돌린다.           | Atomic Design [UX6]                                        |
| **Luke Wroblewski** | 320px와 responsive 상태를 명시하도록 유도한다.                                                     | mobile-first의 본질인 콘텐츠 우선순위, touch target, 느린 네트워크, 작은 화면에서의 핵심 행동 우선순위는 자동으로 나오지 않는다.                    | viewport 숫자뿐 아니라 “작은 화면에서 먼저 보여야 하는 정보와 행동”을 D/O 행으로 적는다.        | Mobile First [UX7]                                         |
| **Jen Simmons**     | reflow와 relational evidence를 별도 계약으로 보는 것은 intrinsic layout과 잘 맞는다.               | 고정 breakpoint/screenshot 행렬로만 가면 콘텐츠가 만드는 유연한 레이아웃을 다시 고정할 수 있다.                                                     | 대표 폭 두세 개뿐 아니라 content stress, zoom, long text에서 관계 불변식을 검사한다.            | Intrinsic Web Design [UX8], WCAG Reflow [S1]               |

#### 판정

이 스킬은 **전문가가 승인한 의도를 잃지 않는 데 강하고, 그 의도가 사용자에게 맞는지
배우는 데 약하다.** Nielsen의 휴리스틱 검토와 Norman/Krug의 사용자 관찰은 대체재가
아니다. 둘을 순서대로 연결해야 한다.

### 4.2 소프트웨어 설계·명세·테스트

| 관점              | 잘 맞는 점                                                                                       | 충돌하거나 빠진 점                                                                               | 보완 방향                                                                         | 근거                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------- |
| **Kent Beck**     | 작은 RED → GREEN, 실패를 먼저 재현하고 production-before-RED를 막는 규율은 TDD와 잘 맞는다.      | 모든 작은 변경 전에 전체 정책·아키텍처를 잠그면 emergent design과 빠른 feedback을 둔화한다.      | 위험도 low에는 가벼운 example/test만, high에만 full lock과 다중 검증을 적용한다.  | Test-Driven Development: By Example [T1] |
| **Gojko Adzic**   | 구체적 예, Given/When/Then, 경계값, 정책 출처는 Specification by Example의 강점과 거의 일치한다. | living documentation보다 immutable snapshot에 치우치면 구현·사용자 학습과 명세가 갈라질 수 있다. | 완료된 Oracle을 폐기하지 말고 누적 회귀 corpus와 다음 revision 입력으로 승격한다. | Specification by Example [T2]            |
| **Kent C. Dodds** | 사용자 행동을 관찰하고 MSW/통합 테스트로 네트워크를 제어하는 방향은 Testing Trophy와 잘 맞는다.  | 모든 카드 행을 같은 강도로 자동화하거나 pixel contract로 만들면 유지비가 가치보다 커질 수 있다.  | static/unit보다 integration/E2E에 투자하되, JUDGMENT 행은 사람 리뷰로 남긴다.     | Testing Trophy [T3]                      |

#### 판정

현재 방식은 “명세를 먼저 쓰는 것”에는 성공했지만, **명세가 계속 살아 움직이게 만드는
feedback loop**가 약하다. TDD의 형식을 더 늘리기보다, escaped defect와 실제 사용자
관찰이 Oracle revision으로 돌아오는 경로가 필요하다.

---

## 5. 2025–2026 AI·에이전트 트렌드와 비교

### 5.1 단순 workflow 우선, 복잡성은 필요할 때만

Anthropic은 먼저 가능한 가장 단순한 해법을 쓰고, 복잡한 agentic system은 성능
개선이 복잡성과 비용을 정당화할 때 도입하라고 권한다. 평가 기준이 명확한 작업에서는
evaluator–optimizer가 잘 맞지만, 사람이 checkpoint를 잡고 환경에서 ground truth를
얻어야 한다. [AI1]

- **정렬되는 점:** Oracle은 평가 기준을 먼저 고정하고, bounded repair loop와
  독립 reviewer를 둔다. evaluator–optimizer가 성공하기 좋은 조건을 만든다.
- **어긋나는 점:** 현재 SKILL은 거의 모든 React UI 변경을 동일한 ceremony로
  끌어들인다. 단순 copy/CSS 수정까지 복잡한 workflow가 기본이면 “simple first”
  원칙에 반한다.
- **제안:** risk triage를 첫 gate로 두고 low-risk에는 Oracle 파일과 architecture
  approval 자체를 생략할 수 있게 한다.

### 5.2 장시간 에이전트의 핵심은 durable progress와 실제 환경 검증

Anthropic의 장시간 에이전트 harness 연구는 세션 사이에 명확한 progress artifact,
작고 점진적인 작업, clean state를 남기는 방식을 강조한다. 웹 앱에서는 browser
automation으로 실제 사용자처럼 기능을 시험하게 했을 때 성능이 크게 개선됐다고
설명한다. [AI2]

- **정렬되는 점:** lock, run-state, JSONL ledger, budget은 세션이 바뀌어도 진행
  상태를 복원하게 한다.
- **간극:** 현재 fingerprint와 screenshot 증거만으로는 클릭, focus 이동, network
  실패, console 오류, 실제 navigation 완결성을 함께 보장하지 못한다.
- **제안:** 새 상태를 추가하지 말고, 영향받은 핵심 사용자 journey 한 개의 실제
  브라우저 실행을 기존 GREEN evidence bundle에 포함한다.

### 5.3 harness는 모델보다 오래된 가정을 품기 쉽다

Anthropic의 managed agent 운영 경험은 session/harness/sandbox를 분리하고,
append-only event, recovery, credential 경계를 명시하며, 모델이 좋아질수록 오래된
harness 가정이 병목이 될 수 있다고 지적한다. [AI3]

- **정렬되는 점:** 실행 상태와 결과를 durable artifact로 만들려는 방향은 옳다.
- **간극:** 단일 로컬 JSON state와 수정 가능한 JSONL은 복구·동시성·tamper evidence가
  약하다. workflow 정책도 하나의 큰 SKILL에 강하게 결합되어 있다.
- **제안:** 상태/ledger의 원자성과 복구부터 고치고, ceremony는 risk profile로
  분리한다. “더 많은 agent”보다 먼저 해야 할 일이다.

### 5.4 정적 테스트 목록보다 누적 eval dataset

OpenAI의 eval 지침은 실제 실패와 edge case를 dataset에 계속 추가하고, 도메인
전문가 annotation과 자동 grader를 함께 쓰는 방식을 권한다. Trace grading은 최종
출력뿐 아니라 tool call과 decision trace를 평가한다. [AI4][AI5]

- **정렬되는 점:** Oracle 행과 evidence map은 작은 feature-level eval dataset에
  해당한다.
- **간극:** feature가 끝난 뒤 대표 BVA가 프로젝트 전체 regression corpus로
  승격되지 않는다. ledger도 명령과 결과는 남기지만, 잘못된 tool 선택이나 반복
  패턴 같은 trajectory 품질은 설명하지 않는다.
- **제안:** 완료 Oracle에서 재발 가치가 높은 행만 중앙 corpus로 승격한다. 모든
  trace를 저장하지 말고, 실패 유형·수정 횟수·판단 전환만 구조화해 비용과 개인정보
  노출을 제한한다.

### 5.5 spec-driven development와의 비교

GitHub Spec Kit은 constitution → specification → plan → tasks → implementation
흐름을 제공한다. 동시에 creative exploration과 여러 구현 접근을 허용한다. [AI6]

- **정렬되는 점:** Oracle의 policy source → card → architecture → test →
  implementation은 spec-driven development의 frontend 특화형이다.
- **간극:** 탐색과 전달이 같은 lock 중심 흐름에 섞여 있다.
- **제안:** **Discovery Lane**에서는 여러 proposal과 실제 피드백을 허용하고,
  **Delivery Lane**에 들어갈 때만 선택된 revision을 immutable lock으로 만든다.

### 5.6 AI 생산성은 workflow가 아니라 조직 역량의 증폭기

DORA 2025는 AI가 조직의 기존 역량을 증폭한다고 본다. 테스트가 약하고 승인 대기가
긴 조직이라면 AI나 새 workflow만 추가해도 자동으로 좋아지지 않는다. [AI7]

METR의 2025 무작위 실험에서는 해당 조건의 숙련 오픈소스 개발자가 당시 AI 도구를
사용할 때 평균 19% 느려졌다. METR의 2026 업데이트는 late-2025 도구의 speedup
가능성을 관찰했지만 selection bias 때문에 정확한 효과 크기를 확정하기 어렵다고
명시한다. [AI8][AI9]

**해석:** “AI니까 더 많은 guardrail이 무조건 이득”도, “절차가 있으니 무조건
느리다”도 아직 근거가 부족하다. Oracle 작성 시간, 승인 대기, lead time, escaped
defect를 같은 팀에서 전후 비교해야 한다.

---

## 6. 대회·벤치마크 전략과 비교

### 6.1 Microsoft AI Agents Hackathon 2025

#### 공개 기준에서 확인되는 전략

공식 심사 기준은 다음 다섯 항목이 각각 20%다. [C1]

1. Innovation
2. Impact
3. Usability
4. Solution Quality
5. Category Alignment

또한 실제 entry를 보여 주는 5분 이내 demo, 무엇을 왜 만들었는지, agentic
framework가 어떻게 기여했는지 설명해야 한다. Best Overall 수상작 RiskWise는 실제
공급망 위험 문제를 대상으로 자연어 질의와 위험 insight 시각화를 포함한 end-to-end
시스템을 제시했다. [C2]

#### Oracle과의 비교

| 대회에서 유리한 패턴 | Oracle의 도움                                                  | Oracle의 방해 가능성                                              |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| rubric-first scope   | 각 심사 기준을 정책/행/증거에 매핑할 수 있다.                  | 모든 가능한 edge case를 먼저 문서화하면 핵심 demo가 늦어진다.     |
| 실제 문제와 impact   | 사용자 목표와 부작용을 O 행으로 명확히 할 수 있다.             | impact 가설을 실제 사용자나 데이터로 검증하는 기능은 없다.        |
| end-to-end demo      | 핵심 흐름과 실패 금지 조건을 고정한다.                         | full architecture approval와 다중 GREEN은 제한 시간에 비싸다.     |
| 5분 storytelling     | Source Registry와 evidence가 선택 이유를 설명하는 재료가 된다. | 내부 process 설명이 사용자 가치보다 앞에 나오면 pitch가 약해진다. |
| category alignment   | 사용 기술과 agent 역할을 명시할 수 있다.                       | 기술 자체를 과도하게 증명하다 제품 완성도를 놓칠 수 있다.         |

**권장 해커톤 순서:** 심사표 → 핵심 사용자 흐름 1개 → 실행 가능한 demo → 5분
story evidence → 남는 시간에 failure hardening. full Oracle은 결제·보안처럼
실패 비용이 큰 부분에만 적용한다.

### 6.2 WebDev Arena와 Fullstack Code Arena

WebDev Arena는 실제 사용자가 두 결과를 head-to-head로 비교해 선호를 고른다.
공개 분석에서 주요 prompt 범주는 Website Design 15.3%, Game 12.1%, Clone 11.6%였고,
18%는 “both bad”였다. 존재하지 않는 dependency, compile failure, 잘못된 state
management, TypeScript 오류가 주요 실패 원인으로 보고됐다. [C3]

같은 연구에서 structured output은 downstream 일관성을 높였지만 실험한 모든 모델의
Arena score를 낮췄고, 보고된 감소 폭은 약 12.98–88.76이었다. vision input은 UI
복제, token 추출, visual bug fixing에 중요했다. 2026 Fullstack Code Arena는 인증,
DB, API key, persistent state, deployment까지 평가 범위를 확장했다. [C3][C4]

#### 해석

1. **실행 가능성이 먼저다.** compile, dependency, state, deployment가 깨지면
   정교한 카드도 사용자가 선택할 결과를 만들지 못한다.
2. **구조화의 세금이 있다.** 제약은 전달 안정성을 높이지만 초기 시각 탐색의
   다양성과 매력을 낮출 수 있다.
3. **최종 평가는 실제 상호작용이다.** 정적 screenshot만으로 fullstack 완결성을
   평가할 수 없다.
4. **vision은 보조 입력으로 유효하다.** 다만 현재 production screenshot을 승인
   없이 baseline으로 삼지 않는 Oracle 원칙은 그대로 지켜야 한다.

#### 권장 전략

- discovery에서는 2–3개 후보를 느슨하게 만들고 pairwise 비교한다.
- 사용자가 선택한 안만 Oracle로 잠근다.
- delivery에서는 dependency install, typecheck, build, 핵심 interaction,
  persistence를 evidence로 요구한다.
- structured output은 모든 생성 단계가 아니라 handoff와 verification 단계에만
  집중한다.

### 6.3 Agentless와 SWE-bench 계열

Agentless의 공개 접근은 대체로 다음 순서다. 계층적으로 fault location을 좁히고,
여러 작은 patch 후보를 생성하고, reproduction test와 regression test를 돌린 뒤
결과로 후보를 rerank한다. [C5][C6]

| Agentless 전략     | Oracle과 맞는 점                             | 현재 빠진 점                                                  |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------- |
| fault localization | root cause와 shared layer를 찾도록 요구한다. | localization의 근거와 정확도를 별도 산출물로 평가하지 않는다. |
| 작은 patch         | 승인된 범위를 벗어난 임의 변경을 막는다.     | 한 구현이 막혔을 때 후보 비교보다 같은 loop 반복에 치우친다.  |
| reproduction test  | VALID_RED와 정확히 맞는다.                   | RED가 실제 재현 테스트 때문인지 CLI가 확인하지 못한다.        |
| regression test    | repo 필수 검증을 요구한다.                   | holdout/누적 regression dataset과 직접 연결되지 않는다.       |
| candidate rerank   | bounded repair와 양립 가능하다.              | 여러 후보의 테스트·diff 크기·리스크를 비교하는 단계가 없다.   |

**제안:** 항상 여러 patch를 만들 필요는 없다. 최초 최소 patch가 두 번 실패하거나
원인이 불확실할 때만 2–3개 후보를 격리 생성하고, reproduction + regression +
diff risk로 선택한다. 이것이 단순성 원칙과 benchmark 전략을 함께 살리는 방법이다.

---

## 7. 좋은 점

### 7.1 정책과 현재 구현의 순환 논리를 끊는다

현재 화면이나 기존 테스트를 자동으로 정답 취급하지 않는다. 이는 AI가 “지금 있는
것을 테스트로 복사한 뒤 GREEN이라고 부르는” 편법을 막는 가장 중요한 설계다.

### 7.2 동작을 결과와 금지 결과로 함께 쓴다

Then만 쓰면 성공 toast가 보이면서 요청이 두 번 전송되는 구현도 통과할 수 있다.
Never와 부작용 횟수는 그런 모순을 계약 표면으로 끌어낸다.

### 7.3 비동기 UI의 실제 위험을 구체적으로 다룬다

중복 submit, retry, cancel, stale/out-of-order response, loading, empty/error를
기본 검토 대상으로 둔 것은 일반적인 “happy path 테스트 생성”보다 훨씬 낫다.

### 7.4 AI의 흔한 지름길을 의식적으로 막는다

- 유효한 RED 전에 production을 수정하지 못하게 한다.
- <code>skip</code>, <code>only</code>, 느슨한 screenshot tolerance,
  assertion 감소를 탐지한다.
- 수정 횟수 budget과 <code>NEEDS_DECISION</code>을 둬 무한 repair loop를 막는다.
- 현재 screenshot을 자동 golden으로 승인하지 않는다.

완벽한 방어는 아니지만 실패 모델을 알고 설계했다는 점이 큰 장점이다.

### 7.5 증거가 문장에 머물지 않는다

SHA-256 lock, source/worktree hash, runId, exit code, parsed reporter, test name,
evidence map이 실제 Node 스크립트로 존재한다. “검증했다”는 자연어 주장보다 한 단계
강하다.

### 7.6 판단 가능한 것과 취향을 구분한다

HARD/RELATIONAL/JUDGMENT 계층은 typography의 성격 같은 질문을 억지 숫자로 만들지
않는다. AI proposal을 정책으로 승격하기 전에 사용자 confirmation을 요구하는 것도
건전하다.

### 7.7 필요한 reference만 읽게 한다

frontend/backend/FSD/visual/review 지침을 조건부로 읽게 하는 구조는 long-context
agent의 주의력과 비용을 아낀다. 모든 작업에 모든 문서를 주입하는 것보다 낫다.

---

## 8. 나쁜 점과 아쉬운 점

### 8.1 나쁜 점: 문서가 약속하는 gate보다 상태 전이가 약하다

<code>oracle-verify.mjs</code>에는 card/evidence/findings 검증기가 있지만
<code>oracle-run.mjs</code>의 상태 전이는 그 결과를 필수 입력으로 받지 않는다.
따라서 사용자가 절차를 성실히 따르면 강하지만, 실수하거나 shortcut을 택하면
“machine-verifiable”이라는 이름만큼 강제되지 않는다.

### 8.2 나쁜 점: 실제 브라우저 사용자 journey가 완료 조건의 중심이 아니다

headless style/screenshot은 필요하지만 충분하지 않다. 클릭 후 focus, 실제 router
전환, network 중단과 재시도, console exception, hydration, persistence는 실제 실행
없이는 놓칠 수 있다. 최신 web-agent harness와 fullstack arena가 실제 환경 완결성을
강조하는 이유다. [AI2][C4]

### 8.3 아쉬운 점: 사용자를 위한 디자인보다 승인자를 위한 계약에 치우친다

사용자의 mental model, 첫 클릭, 이해하지 못한 용어, task completion을 관찰하는
단계가 없다. 내부 합의가 매우 선명해져도 잘못된 문제를 완벽하게 구현할 수 있다.

### 8.4 아쉬운 점: discovery와 delivery의 최적화 목표가 섞여 있다

- discovery는 다양성, 빠른 비교, 실패 비용이 낮은 실험이 중요하다.
- delivery는 재현성, 변경 통제, 회귀 방지가 중요하다.

현재 lock 중심 흐름은 delivery에는 좋지만 discovery에 너무 일찍 적용하면 시각적
고유성과 탐색 폭을 줄인다.

### 8.5 나쁜 점: 작은 변경의 ceremony가 위험도에 비례하지 않는다

연속 GREEN 횟수에는 risk가 반영되지만, 카드 작성, 정책 confirmation, architecture
approval, lock, 리뷰라는 큰 절차는 여전히 광범위하다. 낮은 위험에서 이 비용은
사용자 가치가 아니라 process inventory가 된다.

### 8.6 아쉬운 점: 완료된 카드가 누적 학습 자산으로 연결되지 않는다

각 Oracle은 feature revision을 잘 고정하지만, 대표 edge case가 프로젝트 회귀
dataset으로 올라가거나 escaped defect가 다음 카드 template에 반영되는 경로가
명시적이지 않다.

### 8.7 아쉬운 점: 접근성·보안·성능의 최소선이 “취향”과 함께 보일 수 있다

사용자 승인은 제품 정책의 권위가 될 수 있지만 WCAG, 보안 통제, 성능 budget 같은
baseline을 무효화할 권위는 아니다. 이들은 선택형 visual preference가 아니라 별도
non-negotiable constraint로 선언해야 한다. [S1][S2][S3]

---

## 9. 코드 수준 강제력 감사

이 절은 “악의적인 공격자”만이 아니라 장시간 작업 중 실수하는 AI와 사람을 threat
model로 본다.

| ID  | 심각도       | 확인된 구현                                                                                                   | 실패·우회 가능성                                                                                                                                                                         | 최소 보완                                                                                                                                                |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **High**     | <code>VALID_RED</code>는 선택한 run의 exit가 0이 아니고 production diff가 없으면 전이한다. [L12]              | setup error, compile error, 무관한 기존 실패, signal 종료도 “의미 있는 RED”처럼 취급될 수 있다. 새 테스트와 특정 O/D 행의 실패인지 보지 않는다.                                          | parsed reporter를 필수로 하고, 사전 선언한 test name/row가 예상 이유로 실패했는지 검사한다.                                                              |
| A2  | **Critical** | <code>IMPLEMENTED_GREEN</code>은 같은 명령의 연속 성공과 테스트 약화 휴리스틱을 검사한다. [L12]               | 선언된 필수 test/lint/typecheck/build 목록과 연결되지 않아 <code>true</code>처럼 무관한 성공 명령도 GREEN 근거가 될 수 있다.                                                             | init 때 required labels를 고정하고, 모든 label의 최신 reported run과 evidence verification을 transition이 직접 요구한다.                                 |
| A3  | **High**     | <code>REVIEW_VERIFIED</code> 전이는 선택한 run의 exit 0만 확인한다. [L12]                                     | findings 파일, findings verifier 결과, blocking 0건, evidence map, mutation 결과와 상태 전이가 결합되지 않았다.                                                                          | review artifact digest, findings 검증 결과, blocking=0, 최종 required rerun을 하나의 review bundle로 요구한다.                                           |
| A4  | **Medium**   | card lint는 표를 문자열로 파싱하고 토큰·일부 셀 존재를 검사한다. [L13]                                        | 자동 TC 단어가 카드 어디에든 있으면 통과한다. O 행의 빈 Then, D 행의 핵심 계약 셀, 중복 ID, Source Registry 참조 무결성을 충분히 거부하지 않는다.                                        | 새 parser 프레임워크보다 현재 parser에 ID uniqueness, required cell, source foreign-key, TC 행/N/A 구조 검사를 추가한다.                                 |
| A5  | **Critical** | 두 리뷰의 intersection key는 <code>row                                                                        | classification</code>이다. 행 없는 claim은 <code>NON_ORACLE_OPINION</code>으로 강등된다. [L13]                                                                                           | 같은 행·분류의 다른 결함이 합의로 오인되고, 같은 결함의 분류가 다르면 advisory가 된다. 단독 critical/security/data-loss와 전역 보안 결함이 묻힐 수 있다. | critical/high security/data-loss는 단독이어도 adjudication을 막는다. 나머지만 normalized finding fingerprint로 교집합을 구한다. |
| A6  | **High**     | ledger는 로컬 <code>runs.jsonl</code>에 append하고 runId는 현재 run 수+1이다. state는 별도 JSON에 쓴다. [L12] | 파일 수정이 가능하고 hash chain/외부 anchor가 없다. 동시 실행은 같은 runId를 만들 수 있으며, ledger append와 state write가 transaction이 아니다. 중단된 명령은 기록 전에 사라질 수 있다. | UUID, started/finished event, temp+rename state write, single-writer lock을 먼저 적용한다. high-risk에서만 CI artifact나 외부 digest anchor를 둔다.      |
| A7  | **Medium**   | 테스트 약화는 assertion token 수, 금지 token 증가, 숫자 tolerance 상향을 비교한다. [L12]                      | 무관한 assertion 추가, 기대값 의미 변경, 변수로 우회한 tolerance, 다른 matcher 약화는 잡지 못한다.                                                                                       | 휴리스틱은 경고로 유지하고, 핵심 행 mutation 또는 reviewer verification을 high-risk에만 추가한다.                                                        |
| A8  | **Medium**   | fingerprint는 Node, platform, arch, TZ, locale, note를 기록하며 worktree digest도 있다. [L12]                 | browser/version, commit SHA, lockfile digest, viewport, theme, motion, feature flags가 구조화되지 않아 재현 원인 분석이 어렵다.                                                          | 실행기에서 얻을 수 있는 browser/project/viewport/theme/motion과 commit/lockfile digest를 manifest에 자동 기록한다.                                       |

### 9.1 가장 중요한 구조적 문제

검증기가 없는 것이 아니다. 이미 <code>oracle-verify.mjs</code>가 행별 evidence와
review findings를 검사한다. 문제는 **검증기의 성공이 상태 전이의 전제조건이
아니라는 것**이다. 새 프레임워크를 만들지 말고 아래 세 연결부터 고치는 것이
가장 작은 고효율 개선이다.

1. RED transition ↔ reporter의 예상 실패 행
2. GREEN transition ↔ required run bundle + evidence verifier
3. REVIEW transition ↔ findings verifier + blocking 0 + 최종 rerun

---

## 10. 우선순위별 개선 제안

### P0 — 신뢰 경계를 먼저 닫기

#### P0-1. 상태 전이에 evidence bundle을 강제한다

**근거:** OpenAI eval은 dataset과 grader의 연결을, Anthropic harness는 환경에서
검증 가능한 progress를 강조한다. 현재 로컬 코드에는 필요한 verifier 대부분이 이미
있다. [AI2][AI4][L12][L13]

**제안:**

- <code>VALID_RED</code>
  - exit-only run을 거부한다.
  - evidence map에 미리 선언된 test name과 Oracle row가 실패해야 한다.
  - setup/compile/environment failure는 RED가 아니라
    <code>HARNESS_DEFECT</code> 또는 <code>ENVIRONMENT_DEFECT</code>로 분류한다.
- <code>IMPLEMENTED_GREEN</code>
  - Oracle revision에 필요한 명령 label 목록을 init 시 고정한다.
  - 각 label의 최신 run이 통과하고, test evidence가 모든 행을 덮어야 한다.
  - 연속 성공은 “같은 임의 명령”이 아니라 각 필수 label별로 센다.
- <code>REVIEW_VERIFIED</code>
  - review file digest, findings verifier 결과, blocking 0건을 요구한다.
  - 최종 rerun은 구현 GREEN과 동일한 required label 집합이어야 한다.

**완료 기준:** 무관한 실패 명령으로 RED, <code>true</code>로 GREEN, 빈 리뷰 파일로
REVIEW_VERIFIED가 되는 회귀 테스트가 각각 실패해야 한다.

#### P0-2. review 합의 알고리즘에 severity override를 둔다

**근거:** 현재 교집합 방식은 두 LLM의 공통 노이즈를 줄이려는 좋은 의도지만,
보안·데이터 손실처럼 false negative 비용이 큰 finding에 같은 규칙을 적용하면
위험하다. OWASP ASVS도 위험 기반 검증 통제를 요구한다. [S2][L13]

**제안:**

1. critical, security, privacy, data-loss, authz finding은 한 reviewer만 발견해도
   자동 adjudication 전까지 blocking으로 둔다.
2. medium/low의 LLM 의견 노이즈에만 intersection을 사용한다.
3. key는 <code>row|classification</code> 대신 row, affected location,
   normalized root-cause를 합친 fingerprint를 사용한다.
4. 카드 행이 없는 전역 security finding을 opinion으로 강등하지 않는다.

**완료 기준:** 서로 다른 critical 결함 두 개가 같은 O 행에 있어도 둘 다 보존되고,
행이 없는 authz finding도 blocking이어야 한다.

#### P0-3. 핵심 브라우저 journey를 GREEN 증거로 복원한다

**근거:** Anthropic의 web-agent 경험과 Fullstack Code Arena 모두 실제 환경에서
사용자처럼 실행되는 완결성을 강조한다. [AI2][C4]

**제안:** 새 workflow 상태나 별도 거대한 E2E suite를 만들지 않는다. UI-shaping
변경에 한해 영향받은 핵심 journey 1개를 기존 GREEN bundle에 넣고 다음을 함께
관찰한다.

- 실제 click/keyboard와 최종 사용자 결과
- focus와 접근 가능한 이름
- network 요청 횟수·성공/실패
- uncaught exception과 console error
- 320px와 대표 desktop에서의 reflow
- light/dark 및 reduced motion 중 영향받은 조합

스크린샷은 결과 설명용 보조 증거로 유지하고 interaction 성공을 대체하지 않는다.

**완료 기준:** screenshot은 같지만 click handler가 죽은 fixture가 GREEN을 통과하지
못해야 한다.

### P1 — 비용을 위험과 학습 가치에 맞추기

#### P1-1. risk-proportional ceremony

| 위험도     | 예                                                            | 필수 절차                                                                        | 생략 가능한 절차                                        |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Low**    | copy, token 치환, 고립된 CSS, 테스트가 이미 잡는 작은 수정    | scope 확인, 관련 check, 접근성 기본선                                            | 별도 Oracle 파일, architecture approval, lock, 2인 리뷰 |
| **Medium** | 새 상태, 일반 form, responsive 구조 변경                      | 축약 Oracle, 유효 RED, required GREEN, UI-shaping이면 browser journey            | 다중 reviewer와 mutation은 선택                         |
| **High**   | 결제, 인증/권한, 파괴적 작업, 복잡한 concurrency, 규제 데이터 | full Oracle, lock, 다중 필수 run, 독립 review, browser journey, 필요 시 mutation | 생략 없음                                               |

위험도는 변경 줄 수가 아니라 **실패 영향, 되돌리기 난이도, 상태/부작용 복잡도**로
정한다. 현재 연속 성공 횟수의 low/medium/high 개념을 확장하면 되므로 새로운
분류 체계를 만들 필요가 없다.

#### P1-2. Discovery Lane과 Delivery Lane을 분리한다

**Discovery Lane**

1. 문제와 성공 기준을 짧게 확인한다.
2. 필요할 때만 시각적으로 다른 proposal 2–3개를 만든다.
3. 실제 브라우저에서 비교하고 사용자/승인자의 이유를 기록한다.
4. 선택되지 않은 후보는 production contract가 아니다.

**Delivery Lane**

1. 선택된 proposal과 정책 출처만 Oracle Card로 승격한다.
2. confirmation 후 SHA lock을 건다.
3. RED → implementation → required GREEN → review를 수행한다.

이 변경은 기존 Proposal 개념을 버리지 않고 **lock 시점만 뒤로 옮기는** 최소
수정이다. Rams의 절제와 Arena의 pairwise preference를 동시에 살린다. [UX5][C3]

#### P1-3. 완료 Oracle의 일부를 누적 eval corpus로 승격한다

모든 행을 영구 suite로 만들면 느리고 brittle해진다. 다음 중 하나에 해당하는 행만
프로젝트 regression dataset으로 올린다.

- 실제 escaped defect를 재현한다.
- 결제·권한·데이터 손실을 막는다.
- 여러 feature가 공유하는 invariant다.
- flake 없이 결정적으로 실행된다.

각 행에는 source Oracle, owner, 마지막 실패, 실행 시간, flake rate를 남긴다.
OpenAI eval 지침처럼 실제 운영 edge case를 계속 추가하되, 중복되거나 가치가 사라진
행은 review 후 제거한다. [AI4]

#### P1-4. card lint를 “토큰 존재”에서 “참조 무결성”으로 올린다

새 Markdown AST dependency를 추가하기 전에 현재 작은 parser로 다음을 검사한다.

1. D/O ID uniqueness
2. O 행의 non-empty Then/Never/side-effect
3. D 행의 non-empty contract/source/evidence tier
4. Source Registry ID와 각 행 source의 foreign-key 일치
5. 자동 TC마다 실제 행 또는 구조화된 sourced N/A
6. evidence map의 row ID와 카드 row ID의 양방향 일치

현재 parser로 정확히 처리하기 어려운 실제 사례가 생길 때만 Markdown AST 도입을
검토한다.

#### P1-5. 막힌 작업에만 후보 patch와 rerank를 사용한다

최초에는 하나의 최소 patch를 시도한다. 같은 root cause에서 repair budget을 2회
소비했거나 localization confidence가 낮을 때만 후보 2–3개를 격리 생성한다. 선택
점수는 다음 순서로 둔다.

1. reproduction test 통과
2. holdout regression 통과
3. Oracle 범위 준수
4. 변경 표면과 새 dependency가 가장 작음
5. 성능·접근성·보안 budget 준수

이는 Agentless의 강점을 가져오되 모든 변경에 병렬 후보 비용을 부과하지 않는다.
[C5][C6]

### P2 — 운영 신뢰와 조직 학습 강화

#### P2-1. 접근성·보안·성능 baseline을 별도 계층으로 둔다

- 접근성: WCAG 2.2 AA와 저장소의 더 강한 기준 [S1]
- 보안: 프로젝트 threat model과 OWASP ASVS의 해당 control [S2]
- 성능: 저장소 budget과 Core Web Vitals [S3]

이 baseline은 사용자 visual preference로 N/A 처리할 수 없게 한다. 적용되지 않는
경우에는 사람의 취향이 아니라 기술적 범위 근거를 남긴다.

#### P2-2. ledger의 복구·동시성·tamper evidence를 강화한다

우선순위는 다음과 같다.

1. runId를 UUID로 만들어 동시 실행 충돌 제거
2. 명령 시작 전에 <code>started</code>, 끝난 뒤 <code>finished</code> event 기록
3. state를 temp file + atomic rename으로 갱신
4. 동일 Oracle directory에 single-writer lock
5. 이전 event digest를 포함한 hash chain
6. high-risk/CI에서만 chain head를 immutable artifact나 원격 저장소에 고정

hash chain만 로컬에 두면 파일 전체를 다시 쓸 수 있으므로 완전한 tamper-proof가
아니다. 외부 anchor가 있을 때 tamper-evident가 된다.

#### P2-3. 환경 manifest를 자동화한다

commit SHA, dirty state, lockfile digest, Node/package manager, test runner,
browser/version, viewport, theme, motion, locale/TZ, feature flag를 구조화한다.
현재 worktree digest는 보존하되 사람이 원인을 빨리 읽을 수 있는 필드를 추가한다.

#### P2-4. 결과가 아니라 효과를 측정한다

도입 전후에 최소한 다음을 같은 팀·비슷한 작업군에서 비교한다.

| 지표                  | 정의                                        | 목적            |
| --------------------- | ------------------------------------------- | --------------- |
| Escaped defect rate   | release 후 Oracle 범위에서 발견된 결함/변경 | 실제 품질 향상  |
| Median lead time      | confirmation부터 merge까지                  | ceremony 비용   |
| Approval wait         | 사람이 답하기까지 멈춘 시간                 | 조직 병목 분리  |
| Oracle authoring time | 카드 작성·수정 시간                         | 명세 비용       |
| Flaky rerun rate      | 동일 revision의 비결정적 실패 비율          | 연속 GREEN 가치 |
| Review precision      | blocking finding 중 실제 수정된 비율        | reviewer noise  |
| User task success     | 대표 사용자가 도움 없이 완료한 비율         | UX 효과         |
| Repair loops          | GREEN까지 production 수정 횟수              | agent 효율      |

처음부터 임의의 목표 숫자를 정하지 않는다. 4–6주 baseline을 얻고, escaped defect
감소가 lead time 증가를 정당화하는지 risk tier별로 판단한다. 이 측정이 DORA와 METR의
상반된 관찰을 로컬 현실에 맞게 해석하는 방법이다. [AI7][AI8][AI9]

---

## 11. 권장 개정 workflow

```text
1. RISK TRIAGE
   ├─ Low    → existing test/check → patch → verify
   └─ Medium/High
        ↓
2. DISCOVERY (새 UX/시각 의도가 있을 때만)
   problem → 2–3 proposals → browser/user comparison → choice
        ↓
3. CONFIRMATION
   policy source + D/O rows + baseline constraints
        ↓
4. LOCK
   selected revision only
        ↓
5. VALID RED
   expected row/test fails; setup failure is rejected
        ↓
6. MINIMUM IMPLEMENTATION
        ↓
7. REQUIRED GREEN BUNDLE
   tests + type/lint/build as applicable + key browser journey + evidence map
        ↓
8. RISK-TIER REVIEW
   severity override → findings resolved → exact rerun
        ↓
9. PROMOTE
   only high-value BVA/escaped defects → cumulative regression corpus
        ↓
10. MEASURE
   lead time + defect escape + task success
```

### 반드시 유지할 현재 강점

개정하면서 아래를 버리면 안 된다.

1. 정책 출처와 구현 관찰의 분리
2. D/O 행, Then/Never, 부작용 횟수
3. 현재 screenshot을 자동 baseline으로 삼지 않는 원칙
4. Oracle revision hash
5. bounded repair budget과 <code>NEEDS_DECISION</code>
6. HARD/RELATIONAL/JUDGMENT 증거 계층
7. POLICY/HARNESS/PRODUCT/ENVIRONMENT finding 분류

개선의 목적은 workflow를 더 크게 만드는 것이 아니라, **high-risk에서는 약속한
증거를 실제 gate로 만들고 low-risk에서는 불필요한 절차를 제거하는 것**이다.

---

## 12. 시나리오별 최종 적합성

| 시나리오                       | 현재 full workflow | 제안 적용 후 | 설명                                                                     |
| ------------------------------ | -----------------: | -----------: | ------------------------------------------------------------------------ |
| 결제/송금 submit               |               9/10 |       9.5/10 | 부작용 횟수, 중복, 재시도, review가 직접 가치가 있다.                    |
| 검색·자동완성 race             |             8.5/10 |         9/10 | out-of-order BVA가 강점이며 실제 browser/network 증거가 보완된다.        |
| 디자인 시스템 대규모 migration |               8/10 |         9/10 | source/token/visual evidence와 누적 corpus가 유용하다.                   |
| 신규 SaaS 핵심 onboarding      |               6/10 |       8.5/10 | 현재는 사용자 관찰이 약하지만 discovery/usability checkpoint로 개선된다. |
| 브랜드/마케팅 탐색             |             4.5/10 |       7.5/10 | 후보 비교 후 선택된 안에만 lock을 적용해야 한다.                         |
| 해커톤 prototype               |               4/10 |         8/10 | low/medium 축약형과 rubric-first mapping이 필요하다.                     |
| 한 줄 copy/CSS 수정            |               3/10 |         9/10 | low-risk fast path가 있으면 불필요한 ceremony를 없앨 수 있다.            |
| 규제 없는 내부 일회성 도구     |               5/10 |       7.5/10 | 실패 영향에 맞춰 evidence와 review를 줄여야 한다.                        |

---

## 13. 최종 제언

<code>frontend-oracle-design</code>의 독특한 가치는 “AI에게 더 예쁘게 만들어 달라”가
아니다. **사람이 승인한 디자인과 동작을 명시적 계약, 실패 재현, 증거, 독립 리뷰로
끝까지 보존하는 것**이다. 이 포지셔닝은 분명하고 가치가 있다.

다음 버전에서 가장 피해야 할 일은 agent, 상태, 문서 종류를 더 늘리는 것이다. 현재
도구의 핵심 결함은 기능 부족보다 **연결 부족**이다. 다음 네 가지면 방향이 충분하다.

1. 기존 evidence/findings verifier를 상태 전이에 묶는다.
2. 단독 critical finding이 교집합 밖으로 사라지지 않게 한다.
3. UI-shaping 변경의 핵심 browser journey를 GREEN 증거에 넣는다.
4. discovery/delivery와 low/medium/high ceremony를 분리한다.

이 네 가지를 먼저 고치면, Rams식 restraint와 Beck/Adzic식 명세 규율은 유지하면서
Nielsen/Norman식 사용자 학습, 최신 agent harness의 환경 검증, Arena/해커톤의
실행·선호·속도 전략을 함께 수용할 수 있다.

---

## 참고문헌

### 로컬 구현

[L1]: ./skills/SKILL.md 'frontend-oracle-design SKILL'
[L2]: ./skills/references/oracle-card.md 'Oracle Card'
[L3]: ./skills/references/bva.md 'Boundary Value Analysis'
[L4]: ./skills/references/visual-design.md 'Visual Design Contract'
[L5]: ./skills/references/implementation-loop.md 'Implementation Loop'
[L6]: ./skills/references/frontend-implementation.md 'Frontend Implementation'
[L7]: ./skills/references/architecture-contract.md 'Architecture Contract'
[L8]: ./skills/references/fsd.md 'FSD Guidance'
[L9]: ./skills/references/backend.md 'Backend Guidance'
[L10]: ./skills/references/subagent-review.md 'Subagent Review'
[L11]: ./skills/scripts/oracle-lock.mjs 'Oracle Lock CLI'
[L12]: ./skills/scripts/oracle-run.mjs 'Oracle Run CLI'
[L13]: ./skills/scripts/oracle-verify.mjs 'Oracle Verify CLI'
[L14]: ./skills/scripts/skill-contract.test.mjs 'Skill Contract Tests'

### UX·디자인·테스트

[UX1]: https://www.nngroup.com/articles/ten-usability-heuristics/ 'Jakob Nielsen, 10 Usability Heuristics for User Interface Design'
[UX2]: https://www.nngroup.com/articles/usability-testing-101/ 'Nielsen Norman Group, Usability Testing 101'
[UX3]: https://www.hachettebookgroup.com/titles/don-norman/the-design-of-everyday-things/9780465050659/ 'Don Norman, The Design of Everyday Things, Revised and Expanded'
[UX4]: https://www.pearson.com/en-us/subject-catalog/p/dont-make-me-think-revisited-a-common-sense-approach-to-web-usability/P200000009819/9780321965516 "Steve Krug, Don't Make Me Think, Revisited"
[UX5]: https://www.vitsoe.com/us/about/good-design 'Vitsœ, Dieter Rams: Ten Principles for Good Design'
[UX6]: https://atomicdesign.bradfrost.com/chapter-1/ 'Brad Frost, Atomic Design'
[UX7]: https://abookapart.com/products/mobile-first 'Luke Wroblewski, Mobile First'
[UX8]: https://talks.jensimmons.com/15TjNW/intrinsic-web-design 'Jen Simmons, Intrinsic Web Design'
[T1]: https://www.pearson.com/en-us/subject-catalog/p/test-driven-development-by-example/P200000009421/9780321146533 'Kent Beck, Test-Driven Development: By Example'
[T2]: https://gojko.net/books/specification-by-example/ 'Gojko Adzic, Specification by Example'
[T3]: https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications 'Kent C. Dodds, The Testing Trophy and Testing Classifications'

### AI·에이전트·생산성

[AI1]: https://www.anthropic.com/engineering/building-effective-agents 'Anthropic, Building Effective Agents'
[AI2]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents 'Anthropic, Effective Harnesses for Long-Running Agents'
[AI3]: https://www.anthropic.com/engineering/managed-agents 'Anthropic, Scaling Managed Agents'
[AI4]: https://developers.openai.com/api/docs/guides/evaluation-getting-started 'OpenAI, Working with evals'
[AI5]: https://developers.openai.com/api/docs/guides/trace-grading 'OpenAI, Trace Grading'
[AI6]: https://github.com/github/spec-kit 'GitHub, Spec Kit'
[AI7]: https://dora.dev/research/2025/dora-report/ 'DORA, State of AI-assisted Software Development 2025'
[AI8]: https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ 'METR, Early-2025 AI Experienced Open-Source Developer Study'
[AI9]: https://metr.org/blog/2026-02-24-uplift-update/ 'METR, 2026 Uplift Update'

### 대회·벤치마크

[C1]: https://microsoft.github.io/AI_Agents_Hackathon/rules/ 'Microsoft AI Agents Hackathon 2025, Rules and Judging Criteria'
[C2]: https://microsoft.github.io/AI_Agents_Hackathon/winners/ 'Microsoft AI Agents Hackathon 2025, Winners'
[C3]: https://arena.ai/blog/webdev-arena 'LMArena, WebDev Arena'
[C4]: https://arena.ai/blog/fullstack-code-arena 'LMArena, Fullstack Code Arena'
[C5]: https://github.com/OpenAutoCoder/Agentless 'OpenAutoCoder, Agentless'
[C6]: https://arxiv.org/abs/2407.01489 'Xia et al., Agentless: Demystifying LLM-based Software Engineering Agents'

### 최소 품질 기준

[S1]: https://www.w3.org/TR/WCAG22/ 'W3C, Web Content Accessibility Guidelines 2.2'
[S2]: https://owasp.org/www-project-application-security-verification-standard/ 'OWASP, Application Security Verification Standard'
[S3]: https://web.dev/articles/vitals 'web.dev, Web Vitals'
