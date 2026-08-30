# Oracle 발견 격차(discovery gap) 해소 플랜

작성: 2026-08-30. 근거 세션: fe-hiring-challenge-main 가상 그리드 작업
(`docs/ai-work-log/13-2026-08-30-virtual-grid.md`, oracle `connect-store-refactor-r11b`).

## 1. 문제 정의 — 증거

### 증상 — 두 실패 모드 (수학이 다르다)

- **모드 A · 미기재(miss)**: 요구사항으로 정의되지 않은 모호한 케이스는 **결정적으로
  그냥 넘어간다**. P(발견) ≈ 0. `NEEDS_DECISION`은 에이전트가 모호함을 *인지*했을 때만
  발동하는데, 인지 실패는 흔적을 남기지 않는다 — 안 물은 질문은 비용이 0이고 보이지도
  않는다. 현행 발견 장치(grill·BVA·cold-read)는 전부 LLM 자유 회상 프롬프트라서 인지
  자체가 확률적이다.
- **모드 B · 기재(flake)**: 카드에 적혀 있어도 검수는 **확률적**이다. 기계 게이트가
  결정적으로 고정하는 것은 커버리지뿐(행 스킵 → GREEN 불가, 이름 매핑 대조). 행→테스트
  의미 충실도(약한 assertion으로 "커버"), visual·review의 LLM 판정은 run마다 흔들린다.
  subagent-review.md도 이미 인정한다: "Review is LLM judgment, so it wavers even on the
  same input."

레버리지가 다르다: 모드 A는 **열거로 침묵을 가시화**해야 하고(빈 셀은 lint 가능,
안 한 생각은 불가능), 모드 B는 **인자별 기계 고정 또는 표본 중복**으로 P를 올려야
한다. 이 플랜의 주 타깃은 모드 A다 — 모드 B는 기존 장치(2-sample 리뷰, 수동 mutation,
자매 플랜 G의 evidence-strength)가 이미 소관하며 아래 3.6에서 잔여 인자만 대조한다.

### 실측 사례 — r11b에서 카드 밖에서 늦게 발견된 결함 4건

| #   | 결함                                                                                        | 실제 원인 축                                                     | 카드에 없던 이유                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | append skeleton 영구 잔류                                                                   | StrictMode 재실행 × 핸들러 소유 타이머                           | 런타임 환경(React 시맨틱)과의 교차 — grill 질문 은행에 없음                          |
| 2   | 필터 변경 시 scrollTo(0)                                                                    | 승계된 filterKey 리마운트(P13계) × 신규 virtualizer mount 부작용 | "기존 행 의미 변경 없이 승계" 선언만 하고 승계 행 × 신규 행 교차를 스윕하지 않음     |
| 3   | 필터마다 화면 튐                                                                            | 첫 렌더 기본 4열 × ResizeObserver × scroll anchoring             | 라이브러리 초기화 시퀀스와의 교차                                                    |
| 4   | Suspense fallback 출렁임(5332→1190px)                                                       | 필터 변경 × queryKey × Suspense 경계                             | 가상화 이전부터 존재. 어떤 revision 카드도 "필터 전환 중 로딩 표시" 정책을 묻지 않음 |
| +   | 수정 시도 3건 전부 다른 잠긴 계약과 충돌 (checkbox 반응성, GET 회계, useSuspenseQuery 옵션) | 정책 × 정책 교차                                                 | 교차 지점의 소유 행이 없어 시행착오로만 발견                                         |

전부 **단일 축 경계값이 아니라 2~3개 조건의 교차**다. 현행 bva.md(5축, 7 auto-TC,
error subtype)는 축 하나씩은 강하게 커버하지만 축을 가로지르지 않는다.

### 구조 원인 — 스위스 치즈 구멍 정렬

```
카드(specified oracle, 유일 정책원)
  → $test: "Every row of the card matrix is the standard"
  → $frontend-visual-qa: "검증할 D/O 행을 고정", "요청하지 않은 모드 추가 금지", "곱집합 금지"
  → agent QA(playwright-spec-for-ai-agent): @qa-scenario 주석 = 카드 파생 스펙
```

4개 레이어 전부 같은 카드에서 파생되므로 카드의 맹점이 전 레이어에 그대로 복제된다.
방어층이 4겹이어도 구멍이 정렬돼 있다. 이것은 버그가 아니라 설계 의도(fidelity —
"카드에 없는 states·transitions·policies 발명 금지", `common.md` 공통 금지)의 부작용이다.

현행 발견 장치의 한계:

- cold-read gate 4질문(card-format.md) — **존재하는 행**을 심문한다. 4번 질문의 누락
  탐지도 고정 5항목(loading/error/retry/연속입력/순서역전) 단일 행 스코프다.
- State Model 섹션 — state×event 빈 셀을 impossible/미결로 판정하는 규칙이 **이미
  있으나 opt-in, 기본 생략**. 결함 1·2·3이 정확히 이 빈 셀이다.
- risk-grill P5 — 동시성 질문 은행이 있으나 리마운트·라이브러리 초기화·스케줄링 교차가 없다.
- visual-qa — 요청 journey 안에서만 console error를 본다(5모드 5단계). 탐색 mandate 없음.

## 2. 레퍼런스 — 이 딜레마의 이름과 알려진 해법

이 문제는 test oracle problem 그 자체다. 카드는 Barr et al. 분류의 **specified oracle**이고,
specified oracle은 명세의 완전성만큼만 판정한다. 문헌·업계의 해법은 전부 "oracle을
레이어링"하는 방향이다.

| 해법                                                                                                                        | 출처                                                                                                                                                                                                                                                                                                                                                    | 이 시스템에의 번역                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| implicit oracle — 명세 없이도 항상 틀린 것(크래시, 콘솔 에러, 오버플로)                                                     | [Barr et al., The Oracle Problem in Software Testing: A Survey (IEEE TSE 2015)](https://coinse.github.io/publications/pdfs/Barr2015qd.pdf)                                                                                                                                                                                                              | visual-qa가 카드 없이 판정 가능한 불변식 스윕                                               |
| t-way 조합 커버리지 — 결함 대부분은 1~2개 조건, 사실상 전부 4~6-way 이하 교차에서 발생. pairwise만으로 50~90% 검출          | [NIST SP 800-142 Practical Combinatorial Testing (Kuhn·Kacker·Lei)](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-142.pdf), [NIST CSRC: Why do Combinatorial Testing?](https://csrc.nist.gov/projects/automated-combinatorial-testing-for-software/combinatorial-methods-in-testing/interactions-involved-in-software-failures) | 카드 작성 시점의 pairwise **판정 스윕**(테스트 곱집합이 아니라 disposition 곱집합)          |
| property catalog + autonomous exploration — 시나리오 대신 불변식을 선언하고, 탐색이 위반 시퀀스를 찾는다                    | [Antithesis: How Antithesis works](https://antithesis.com/docs/introduction/how_antithesis_works/), [DST 해설](https://antithesis.com/docs/resources/deterministic_simulation_testing/), [etcd 적용 사례 (CNCF)](https://www.cncf.io/blog/2025/09/25/autonomous-testing-of-etcds-robustness/)                                                           | 카드 `## Invariants`(I\* 행) + visual-qa bounded exploration                                |
| metamorphic testing — 기대값 없이 실행 간 관계로 판정                                                                       | [Metamorphic testing (개요)](https://en.wikipedia.org/wiki/Metamorphic_testing), Chen et al.                                                                                                                                                                                                                                                            | $test의 파생 oracle: "필터 후 해제=원상", "loaded count 단조 증가", "유니크 쿼리당 GET ≤1"  |
| Session-Based Test Management / 탐색 투어 — time-box·charter·산출물 있는 탐색 (Bach, Whittaker)                             | 업계 표준 기법, [2026 탐색 도구 지형](https://superdupr.com/blog/exploratory-testing-tools) 참고                                                                                                                                                                                                                                                        | 탐색 budget: N 상호작용/시간 상한 + exploration.md 산출물                                   |
| 탐색 에이전트 제품군 — Playwright Test Agents, Momentic exploration agent, Explorbot(탐색 후 통과 flow를 Playwright로 저장) | [Momentic: AI Agents in QA Testing](https://momentic.ai/blog/ai-agents-in-qa-testing), [QA.tech 2026 비교](https://qa.tech/blog/the-13-best-ai-testing-tools-in-2026)                                                                                                                                                                                   | visual-qa 탐색 phase의 업계 선례. 단 이 시스템에서는 탐색이 verdict를 내지 않고 질문을 생산 |

핵심 재해석: **발견은 정책 발명이 아니다.** 탐색·스윕의 출력을 verdict가 아니라
`POLICY_GAP 후보(질문+증거+추천)`로 정의하면, "카드 밖 발명 금지" 원칙과 충돌 없이
기존 feedback routing(`POLICY_GAP → NEEDS_DECISION`)에 그대로 태울 수 있다. 거버넌스는
유지되고 맹점만 줄어든다.

## 3. 설계 원칙

1. 발견의 출력은 항상 질문이다. verdict·baseline·정책 변경은 여전히 사용자 승인 경유.
2. 곱집합 금지 원칙 유지 — 스윕은 **판정**(covered/impossible/needs-decision)의
   곱집합이지 테스트의 곱집합이 아니다. 셀당 테스트를 만들지 않는다. NIST pairwise가
   폭발을 막는 바로 그 도구다.
3. 탐색은 기존 budget 모델처럼 bounded (policy 2·harness 2·product 3에 exploration 추가).
4. 새 상태·새 스킬을 만들지 않는다. 기존 카드 섹션·기존 모드의 phase로 붙인다.
5. **침묵을 비싸게 — 자유 회상이 아니라 닫힌 세계 disposition.** 판정 공간(스윕 표의
   행·열)을 카드의 P\* ID에서 **기계적으로 생성**하고, 모든 셀에 판정 값을 강제하고,
   완전성(빈 셀 없음)을 lint로 결정적으로 검사한다. "생각했는가"(검사 불가)를
   "셀 (i,j)에 값이 있는가"(검사 가능)로 바꾸는 것이 스윕의 본질이다 — 기존
   policy↔row FK lint와 같은 철학. 단, 셀 판정 내용 자체는 여전히 LLM 판단이므로
   miss가 0이 되는 게 아니라 "생각 안 함"이 "생각했는데 잘못 기각"으로 이동한다.
   후자는 cold-read와 escaped-bug 회고가 감사할 수 있고, 그래도 남는 miss는
   I\* 불변식 + 탐색이 시나리오 열거 없이 받아낸다. 3중 안전망의 역할 분담이다.
6. **모드 B 잔여 인자 대조** — 카드에 있어도 확률적인 인자와 고정 장치:

   | 확률 인자                     | 고정 장치                                     | 상태            |
   | ----------------------------- | --------------------------------------------- | --------------- |
   | 행 자체를 건너뜀              | 행 스킵 → GREEN 불가 + evidence 대조          | 기존, 결정적    |
   | 행→테스트 번역이 약함         | evidence-strength lint (자매 플랜 G, warning) | 계획됨          |
   | 테스트가 실제로 무는지        | High risk 수동 mutation kill·revert·re-GREEN  | 기존, High만    |
   | visual·review LLM 판정 흔들림 | High risk 2-sample 독립 리뷰 교집합/단독 차단 | 기존, High만    |
   | I\* 불변식 판정               | console·network·layout 등 기계 관측만 채택    | 이 플랜 Phase 2 |

   이 플랜에서 새로 추가하는 것은 마지막 줄뿐이다 — I\*를 기계 관측 가능한 것만으로
   제한하면 모드 B를 늘리지 않고 모드 A를 줄인다.

## 4. Phase 1 — 카드: interaction sweep (최우선, 문서 변경만)

**신규 reference** `packages/frontend-oracle-design/skills/references/card/interaction-sweep.md`
— 카드 lane 노드로 등록, `bva.md` 직후 로드.

1. **조건 인벤토리**: 카드의 신규 P\*와 승계 P\*, 그리고 런타임 차원(리마운트, 스케줄링,
   타이머, 스크롤 소유, 캐시, viewport)을 나열한다.
2. **pairwise 스윕**: 신규 P\* × (승계 P\* ∪ 런타임 차원) 표를 만들고 각 셀을 셋 중
   하나로 판정한다 — `covered(행 ID)` / `impossible(사유)` / `needs-decision(질문)`.
   High risk는 3-way 승격. needs-decision 셀만 행 또는 grill 질문으로 승격된다.
   **빈 셀은 lint 실패다** — 표의 행·열이 카드 P\* ID에서 기계적으로 파생되므로
   완전성은 `oracle-verify.mjs card`가 결정적으로 검사할 수 있다 (설계 원칙 5).
3. **승계 게이트**: "기존 행 의미 변경 없이 승계" 선언은 승계 행이 포함된 스윕이
   있어야만 쓸 수 있다. (r11b 결함 2·4를 카드 시점으로 당기는 규칙)
4. **런타임 교차 질문 은행** (초기 항목 = r11b 결함들, 이후 Phase 4 루프로 성장):
   - StrictMode 재실행 — effect 밖에서 잡은 타이머·구독의 cleanup 정합
   - Suspense·key 리마운트 — 마운트 시 부작용 있는 라이브러리(virtualizer, observer, focus)
   - 초기 렌더 기본값 → 실측값 전환이 "변경 이벤트"로 관측되는 훅 (ResizeObserver 등)
   - 렌더 스케줄링(transition·deferred) 변경 × 요청 횟수 계약
   - scroll restoration·bfcache × 목록 상태 초기화
5. **cold-read 5번째 질문** (card-format.md): "이 행과 상태·DOM·스크롤·캐시를 공유하는
   다른 행은 무엇이고, 그 교차의 기대 결과는 어느 행이 소유하는가?"

**State Model 승격** (card-format.md): 델타가 리마운트·타이머·스크롤 소유·async
lifecycle을 건드리면 opt-in → 필수. 빈 셀 판정 규칙은 이미 있으므로 트리거만 넓힌다.

수용 기준: r11b에 소급 적용 시 결함 4건이 전부 카드 시점 산출물(스윕 셀 2건, 질문
은행 2건)로 나와야 한다.

## 5. Phase 2 — 카드 Invariants + visual-qa bounded exploration

**카드 `## Invariants` 섹션** (I\* 행, card-format.md): Given/When 없이 모든 상태에서
성립하는 항상/절대. Antithesis property catalog의 카드 번역.

```markdown
| ID | Policy | Invariant | 판정 근거 |
| I1 | P23 | 문서 scrollWidth === clientWidth (≥320px) | 어느 journey에서든 |
| I2 | — | console error·uncaught exception 0건 | implicit |
| I3 | P13 | 세션 GET 총합 ≤ 유니크 쿼리스트링 수 | network 로그 |
| I4 | P19 | 총 스크롤 높이 급변(점프) 없음 | layout 관측 |
```

I\* 행은 시나리오를 열거하지 않아도 **모든 journey에서** 판정 가능 — 탐색 phase의
판정 기준이 된다.

**visual-qa 탐색 phase** (frontend-visual-qa/SKILL.md):

1. 카드 User Confirmation에 `Exploration authorization: approved | declined` 필드 추가.
   Visual QA authorization과 같은 방식 — approved면 명시 요청으로 인정. (기존 "요청하지
   않은 모드 추가 금지"와 충돌 없음)
2. 새 모드가 아니라 기존 모드의 **후행 phase**: 요청 행 검증 완료 후, time-box
   (기본 상호작용 30회 또는 10분) 안에서 투어 실행 — 새로고침 mid-flow, back/forward,
   빠른 연타, pending 중 리사이즈·필터 변경, 스크롤 중 조작, 최대/빈 데이터.
3. 판정 기준은 **implicit oracle + I\* 행만**: console/uncaught, 실패 네트워크, dead
   click, 오버플로, 포커스 소실, 요청 수. 정책 판단 금지 유지.
4. 산출물 `exploration.md` (run 디렉터리): 발견을 verdict가 아닌 후보로 분류 —
   - I\* 위반 → `PRODUCT_DEFECT` 후보 (재현 증거 포함, VALID_RED 루트)
   - 미규정 동작 관찰 → `POLICY_GAP` 후보 (질문+증거+추천, NEEDS_DECISION 루트)
   - 탐색은 VERIFIED 판정에 영향을 주지 않는다 (기존 "탐색 관찰은 VERIFIED 불가" 원칙 유지)
5. **계측 함정 기록**: 도구 유발 현상(Playwright가 클릭 전 대상으로 auto-scroll 등)을
   사용자 등가 행동과 구분해 기록한다. (r11b에서 가짜 신호로 판명된 사례를 규칙화)

## 6. Phase 3 — $test: 파생 oracle (derived)

1. State Model이 있는 카드: 전이 경로 열거 테스트 — 모든 전이 경로 + 빈 셀은
   "도달 불가" 단언. 우선 수동 열거(파생), 경로가 10개를 넘으면 `@xstate/graph`
   경로 생성(라이브러리) 검토. 자작 금지.
2. 순수 model(usePagedList류)에 metamorphic 관계 테스트: 카드 P\*에서 도출 —
   "임의 스크롤 시퀀스에서 loaded count는 28, +20…, ≤total 단조", "필터 적용 후
   해제 = 원상", "유니크 쿼리당 GET ≤1". 관계가 3개를 넘으면 fast-check
   model-based(`fc.commands`) 검토. bva.md의 pending barrier 패턴 재사용.
3. **Stryker 도입 안 함** — High risk 수동 mutation 1건(test SKILL.md Step 4)이 이미
   있고, 전면 mutation은 5분+ pre-commit 위에 비용만 얹는다. 분기별 감사 옵션으로만 기록.

## 7. Phase 4 — 피드백 루프: escaped-bug ledger

lock 이후 발견된 모든 결함(사용자 지적, 탐색, 리뷰)에 1줄 회고를 의무화한다:
"어떤 스윕 셀/질문을 카드 시점에 물었으면 잡혔나" → 해당 항목을
`interaction-sweep.md` 질문 은행에 append하는 PR로 승격.

work log 13의 "앞으로 지킬 규칙" 3건이 이미 정확히 이 형태인데 과제 레포에 고립돼
있다. 승격 경로(과제 레포 → 스킬 레포 질문 은행)를 delivery 보고서의 선택 그룹으로
정의한다.

## 8. 레포 통합 체크리스트 — 2026-08-30 구현 완료

- [x] `reference-graph.json`에 `card-interaction-sweep` 노드 + `when` + card-lane 번들 편입
- [x] `scripts/generate-reference-bundles.mjs` 재생성, `--check` 통과
- [x] `skill-contract.test.mjs` regex pin 추가 — 공백은 `\s+`, 원문 확인은 bash 아닌 Read
- [x] `oracle-verify.mjs card`: Invariants 섹션 존재 시 구조 lint(State Model과 동일 패턴),
      스윕 표 존재 시 셀 판정 값 enum + **완전성 검사**(카드 P\* ID 대비 누락 행·열,
      빈 셀 = 실패) (신규 gate는 warning으로 시작 — 기존 플랜
      `frontend-oracle-feedback-remediation.md`의 G 원칙과 동일하되, 완전성 검사만은
      결정적 성질이 목적이므로 안정화 후 blocking 승격 전제)
- [x] visual-qa SKILL.md: 탐색 phase + 금지 목록 문구 정합 (oracle SKILL.md 위임 문구,
      visual-qa 불변 경계, test SKILL.md 라우팅 3곳 동시 수정)
- [x] 4-manifest 버전 bump + 로컬 marketplace 재설치, 기존 locked artifact 하위 호환
      (v1 카드에 Invariants·스윕 없음 = 정상)
- [x] pre-commit full test 5분+ — background commit

## 9. 우선순위와 정지 규칙

| 순위 | 항목                                                           | 비용                    | 근거                                       |
| ---- | -------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| P0   | Phase 1 interaction sweep + 승계 게이트 + cold-read 5번째 질문 | 문서만                  | 실측 결함 4/4가 카드 시점으로 당겨짐       |
| P1   | Phase 2 I\* Invariants + visual-qa 탐색 phase                  | 문서 + verify lint 소량 | 카드 독립 oracle 확보 — 다음 맹점의 안전망 |
| P2   | Phase 3 파생 테스트 (State Model 경로·metamorphic)             | 카드별 소량             | 교차 시퀀스의 결정적 재현                  |
| P3   | Phase 4 escaped-bug 루프                                       | 절차 1개                | 질문 은행이 스스로 자라야 P0가 늙지 않음   |

정지 규칙: 각 phase는 스킬 계약 테스트 GREEN + r11b 소급 수용 기준 통과 후에만 다음으로.
전면 조합 테스트 자동화(PICT/ACTS 도구 도입), Stryker 상시화, 무제한 탐색, 새 delivery
상태 추가는 이 플랜의 경계 밖이다.

## 10. 구현 기록 (2026-08-30)

- P0·P1·P2 문서와 lint 전부 적용. 예외: 스윕 lint는 warning 채널 없이 State Model과 같은
  "섹션 존재 시 blocking" 방식으로 구현 — 별도 warning 기계를 만드는 것보다 기존 관례가 작다.
- 검증: oracle-design 패키지 테스트 245/245 GREEN (verify 신규 4건, contract 신규 2블록 포함).
  lint 실패 39건은 전부 기존 것(bundles H1·스크립트 스타일, baseline 동일) — 변경 파일은 clean.
- 릴리스: frontend-oracle-design 0.34.0 · frontend-visual-qa 0.3.0 · test 0.7.0.
  Claude 플러그인 3종 캐시 반영 확인, ~/.jcode/skills/ 3종 rsync 완료. codex는 미갱신.
