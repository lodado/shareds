# frontend-interface-design UI 품질 개선 플랜 — 슬롭에서 마감(craft)으로

작성: 2026-09-06. 대상: `packages/frontend-interface-design` 0.3.0.
근거: 레포 실측(§1) + 외부 레퍼런스 원문 조사(§2, 링크는 §12). 인용문은 원문 그대로이며, 해석은
"분석:"으로 표시한다.

## 0. 한 줄 요약

증상은 "스킬을 써도 AI 슬롭이거나 예쁘지 않다. UX 패턴은 따라 하는데 UI 마감이 조악하다.
Impeccable도 효과가 없다"이다. 실측 결과 현재 스킬은 **UX 거버넌스 + 음성 제약(anti-slop
lint)** 체계다. 이 체계는 바닥(최악 회피)을 올리지만 천장(예쁨)을 올리는 장치가 없다.
구체적으로 다섯 가지가 비어 있다.

1. **보는 루프가 없다.** 스크린샷은 "dev server가 있으면"이라는 조건부 한 줄이고, 채점도 개선
   수용 기준도 없다.
2. **실물이 없다.** 규칙 223개에 코드 예시 0줄, 토큰 파일 0개, 레퍼런스 DESIGN.md 0개.
3. **계보가 없다.** Creation 모드의 시각 시스템은 "주제의 사물 → hue" 공식으로 도출한다.
   공식은 유효한 평균을 내지, 특정한 점(point)을 찍지 못한다.
4. **한국어 타이포가 없다.** Pretendard · `keep-all` · 한글 행간 규칙이 한 줄도 없다.
5. **측정이 없다.** 마크다운 regex pin 10건이 전부라, 스킬을 바꿔도 좋아졌는지 알 수 없다.

그리고 Impeccable은 **린터로 쓰고 있다**(`detect` 게이트). 소스 스캔에서는 61규칙 중 16개만
돌고 대비 계산은 꺼진다. 작동하는 부분(PRODUCT.md 컨텍스트 → 스크린샷 라운드 → finish
reviewer)은 쓰지 않는다.

플랜은 Phase 0 측정 → Phase 1 채점형 시각 루프 → Phase 2 craft cookbook + 한국어 타이포 +
exemplar → Phase 3 계보 기반 DESIGN.md → Phase 4 규칙 예산 재편 · Impeccable 재배치 순이다.
각 phase는 Phase 0 하네스의 pairwise 승률로만 채택된다.

## 1. 문제 정의 — 증거

### 1.1 레포 실측 (`skills/frontend-interface-design/`)

| 항목                 | 실측                                                                                                                                                                           | 의미                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 분량                 | SKILL.md + references 8개 = 1,040줄 · 69k chars ≈ 23k 토큰(한글 가중 시 30k 내외)                                                                                              | 매 실행마다 로드되는 지시 예산                     |
| 이산 규칙 수         | interface-rules 107(MUST/SHOULD/NEVER) + ui-checklist 45 + ux-checklist 30 + visual-system 27 + decision-rules 14 = **223**                                                    | 동시 준수를 요구하는 제약 수                       |
| 코드 예시            | fenced css/tsx/html 블록 **0**                                                                                                                                                 | "좋은 것"의 실물이 없음                            |
| 스크린샷             | SKILL.md:167 "dev server가 있으면 스크린샷을 찍어 본다", review.md:19 동일. 루브릭 · 라운드 · 수용 기준 없음                                                                   | 보는 절차가 선택이고 채점이 없음                   |
| 한국어 타이포        | Pretendard · keep-all · Hangul · CJK 언급 **0**                                                                                                                                | 한국어 화면의 폰트 fallback · 줄바꿈 방치          |
| 어휘 성향            | 금지 · 삭제 · 제거 · 지운다: SKILL 11 · visual-system 11 · ui-checklist 6 · decision-ladder 3. 마감 어휘(layered shadow · hairline · optical · tracking · tabular): SHOULD 4줄 | 규칙 체계가 '빼기' 중심, '더하기'는 vendoring 잔여 |
| 외부 위임            | 13개 스킬(impeccable · kill-ai-slop · hallmark · baseline-ui · frontend-design · figma · clone-website · design-motion-principles · improve-ui · create-design-md · 자매 3)    | 취향의 소유자가 분산됨                             |
| 아이콘 시스템        | 지정 없음(이모지 금지만)                                                                                                                                                       | 세트 · 스트로크 · 크기 기본값 부재                 |
| 레지스트리 조합 블록 | reference-study.md:85 "hero · pricing · feature grid 같은 조합 블록은 항상 참고 모드다. 설치하지 않는다"                                                                       | 슬롭이 가장 많이 나오는 구역을 매번 손으로 그림    |
| 측정                 | `scripts/skill-contract.test.mjs` regex pin 10건                                                                                                                               | 산출물 품질 지표 0                                 |

### 1.2 구조 원인 — 왜 규칙을 잘 따를수록 밋밋해지는가

- **철학이 예쁨을 종속변수로 둔다.** SKILL.md:8 "목표는 예쁜 화면이 아니라", :24 visual
  treatment gate "말할 수 없으면 지운다". review.md:14 Restraint 축은 "지워도 task에 영향 없는
  장식이 없다"에 5점을 준다. 분석: 이 규칙을 충실히 따르면 **plain**에 수렴한다. plain은 refined가
  아니다. refined는 tinted neutral · layered shadow · hairline · optical alignment · tracking
  같은 15개 안팎의 미세 결정에서 나오는데, 이것들은 "1–4단 중 무엇을 돕는가"에 답하기 어렵고,
  현행 gate는 답 못 하는 treatment를 지우라고 한다. 마감을 벗겨내는 규칙이다.
- **Creation 모드가 공식이다.** visual-system.md §0–§6: 주제의 사물 3개 → anchor hue →
  OKLCH 4층 → Radix 12-step → shadcn 토큰 → 2+1 타이포. 분석: 입력에 레퍼런스 실물이 없으니
  출력은 "틴트된 중립색 + accent 하나 + 그로테스크"라는 영역의 평균이다. 이식 테스트는 범주
  반사를 막지만 LLM 자기 판정이라 외부 앵커가 없다.
- **아무도 화면을 보지 않는다.** 이 스킬의 스크린샷은 조건부 · 무루브릭. `frontend-visual-qa`는
  SKILL.md:119 "정책 판단 · 미적 판단은 하지 않는다", :144 "출처 없는 미적 선호 →
  `NON_ORACLE_OPINION`"으로 미적 판단을 명시적으로 거부하고 명시 요청 시에만 돈다. 시스템
  어디에도 디자이너의 눈으로 렌더를 보는 노드가 없다.
- **anti-slop이 전부 음성 제약이다.** `impeccable detect` 61규칙 · `kill-ai-slop` tells ·
  ui-checklist Slop gates. 클리셰를 빼면 "나쁘지 않음"까지만 간다(§3 I1).
- **규칙 223개, 예시 0.** 텍스트 규칙은 시각을 과소결정하고 남은 자유도는 모델 prior가 채운다.
  그 prior가 곧 슬롭이다.
- **위임 13개의 취향이 충돌한다.** `frontend-design`(Anthropic v1) "commit to a BOLD aesthetic
  direction" · `baseline-ui` "NEVER add animation unless it is explicitly requested" · 이 스킬
  "Restraint". SKILL은 "사다리가 이긴다"고 하지만 취향 충돌은 사다리 충돌이 아니다. 평균은
  무취향이다.

### 1.3 Impeccable이 효과 없어 보이는 이유 — 우리 사용법 대조

현재 SKILL.md는 Impeccable을 "anti-slop · 비평 · 마감의 1순위"로 두면서 실제로는 `npx --yes
impeccable detect`를 게이트로 쓰고, `critique` · `polish`를 선택적으로 부른다. 원문 대조:

| 우리 가정 (SKILL.md)                                       | 원문 사실 (impeccable 4.0.3 / skill 4.2.1 소스)                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "규칙 61개가 모델 없이 돌아서 결과가 재현된다"             | 맞다. 그러나 JSX/TSX/CSS **소스 스캔은 16규칙만** 낸다. `low-contrast` · `line-length` · `flat-type-hierarchy` · `nested-cards` · `text-overflow`는 static-HTML 또는 browser 엔진에서만 돈다    |
| "CLI는 자기 의존성을 들고 오므로 대비까지 계산한다"        | 대비 계산 함수는 있지만(`foundation/src/color.rs`) `detect src/` 같은 소스 스캔에서는 실행되지 않는다. README: "A clean detector run is evidence, not proof of visual or accessibility quality" |
| detect 통과 = anti-slop 통과                               | `polish` 문서: "A detector result is defect evidence, not proof of quality." 카탈로그: composition · hierarchy · taste는 판정 불가                                                              |
| DESIGN.md는 Fidelity의 잠긴 소스, impeccable이 바꾸면 중지 | Impeccable 자체 절차는 `init`(PRODUCT.md) → 빌드 → 스크린샷 라운드 → finish-reviewer → **documenter가 마지막에 DESIGN.md를 쓴다**: "DESIGN.md is written at finish, from the built world"       |
| `teach`로 DESIGN.md 생성                                   | v3.0(2026-04)부터 `teach`는 `init`의 별칭이고 `init`은 PRODUCT.md만 쓴다("It never writes DESIGN.md"). DESIGN.md는 `document` 또는 documenter 산출물                                            |

우리 워크플로에는 `init`(PRODUCT.md) 단계가 없다. Impeccable 문서: "Design without context
produces generic output" · "The floor is meaningfully higher with context." 즉 우리는 컨텍스트 없이
린터만 돌린 것이다. 리뷰어 평가도 같은 방향이다 — "impeccable was excellent as a finisher but
fairly ordinary from a blank page"(Steven Sacks), "The micro-adjustment loop in the browser is the
killer feature"(Chase Hannegan). 저자 스스로 3.5 릴리스에서 인정했다: "many popular design
skills, including Impeccable and Anthropic's frontend-design, weren't actually very good at
design (the workflow was valuable, but the output didn't magically make LLMs like GPT great
designers)." 그리고 "There is no auto, and there will be no auto."

분석: Impeccable의 유효 성분은 (a) 컨텍스트 파일, (b) 브라우저 스크린샷 라운드(상한 2회),
(c) 격리된 finish-reviewer, (d) 마무리 `polish`다. 우리는 (a)(b)(c)를 빼고 detect만 남겼다.
이건 Impeccable의 실패가 아니라 배치의 실패다. 단, Impeccable로도 "blank page"는 평범하다는
리뷰가 반복되므로, 생성의 천장은 이 플랜의 Phase 2(exemplar) · Phase 3(계보)가 맡아야 한다.

## 2. 레퍼런스 — 남들은 어떻게 푸는가

바닥(floor) = 최악을 막는 장치, 천장(ceiling) = 특정하고 예쁜 결과를 만드는 장치로 나눠 읽는다.

| 레퍼런스                                                    | 메커니즘                                                                                                                                                             | 원문 근거                                                                                                                                                                                                                                                                                                                                                                                   | 바닥/천장           | 이 스킬에의 번역                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| Anthropic `frontend-design` v1→v3 (2025-11 → 2026-09-03)    | 금지 목록 + 절차. v3: 토큰 계획(4–6 hex, 타입 역할, ASCII 와이어프레임) → "비슷한 프롬프트의 일반적 답"을 머릿속으로 돌려 겹치면 갈라서기 → 코드 → 스크린샷 자기비평 | v3 "a picture is worth 1000 tokens"; "All traits are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject."; v1 "NEVER converge on common choices (Space Grotesk, for example) across generations."                                                                                                                                 | 바닥(금지) + 절차   | 코드 전 토큰 계획 · "일반적 답 시뮬레이션"은 채택. 금지 목록은 버전 관리 대상       |
| OpenAI GPT-5.4 frontend skill                               | 코드 전 "visual thesis" 한 문장, 카드 없는 레이아웃 기본                                                                                                             | "visual thesis: one sentence describing mood, material, and energy"; "Default to cardless layouts"; 거부 목록 "Generic SaaS card grid as the first impression"                                                                                                                                                                                                                              | 절차                | 두 벤더가 "브리프 먼저"로 수렴 — Phase 3 절차의 근거                                |
| Anthropic 블로그 "Improving frontend design through Skills" | 슬롭 = distributional convergence 진단. 평가 수치 없음(스크린샷 3쌍)                                                                                                 | "Safe design choices–those that work universally and offend no one–dominate web training data. Without direction, Claude samples from this high-probability center."; "The more you can map aesthetic improvements to implementable frontend code, the better Claude can execute."                                                                                                          | 진단                | 규칙을 코드로 사상(Phase 2 cookbook)                                                |
| 커뮤니티 비판 — "anti-slop slop"                            | 금지 목록이 새 단일문화를 만든다                                                                                                                                     | "The 2026 tell is a warm cream background with a serif display font (Instrument Serif, Fraunces) and a sage or forest green accent"(Unslop UI); "It replaced one signature with another."(dmaya); HN "Claude has no way of knowing what designs are actually unique or not"                                                                                                                 | —                   | 특이성은 금지가 아니라 계보 · 브리프에서 온다(Phase 3)                              |
| Impeccable (65.8k★)                                         | 23 커맨드 · PRODUCT.md/DESIGN.md 컨텍스트 · craft-floor · concept-seed 주사위 · 스크린샷 라운드 ≤2 · detect 61규칙 · finish-reviewer                                 | "Verify in bounded passes, not a loop"; craft-floor "the reflexes no detector catches"; "Direction by dice, not by taste."                                                                                                                                                                                                                                                                  | 바닥(detect) + 절차 | §1.3 재배치(Phase 4). craft-floor는 Phase 2 cookbook의 선례                         |
| hallmark (28.1k★)                                           | 21 테마 · 21 매크로구조 · 컴포넌트 cookbook(N1–N13 · H1–H9) · 58 slop gates · 6축 비평 · `.hallmark/log.json`으로 구조 반복 방지                                     | "Two pages by Hallmark for two different briefs feel like different sites, not colour-swaps of the same template."; Gate 22 "Pure greys read as flat. Tint every neutral toward the anchor hue — minimum 0.005 chroma."                                                                                                                                                                     | 천장(카탈로그)      | 카탈로그 + 다양성 로그 채택. 단 전부 LLM 자기평가 · 6,800줄이라 예산 초과           |
| ui-ux-pro-max (125k★)                                       | CSV 데이터(styles 88 · colors 192 · typography 74 · google-fonts 1,934) BM25 검색 → `design-system/<slug>/MASTER.md` 영속                                            | "Apply style priorities (BM25 ranking)"; "If the page file exists, its rules override the Master file"                                                                                                                                                                                                                                                                                      | 천장(데이터 선택)   | 영속 시스템 파일 채택. 렌더 확인이 없고 프리셋 수렴 위험                            |
| ibelick/ui-skills (8.1k★)                                   | 80줄 MUST/NEVER baseline + `create-design-md`                                                                                                                        | "Every rule comes from things that bored me when using agents to build UI."; "NEVER exceed `200ms` for interaction feedback"                                                                                                                                                                                                                                                                | 바닥                | 상시 규칙 12개 모델(Phase 4)                                                        |
| kill-ai-slop (1.1k★)                                        | 35 tells regex 스캔 + LLM triage                                                                                                                                     | "a passing scan is not the same as a better page."; "A gradient, a serif, or an emoji can be a real, defended choice."                                                                                                                                                                                                                                                                      | 바닥                | detect와 같은 역할 — 둘 중 하나만                                                   |
| OneRedOak design-review (3.9k★)                             | Playwright MCP 1440/768/375 스크린샷 → 8단계 리뷰 → Blocker/High/Medium/Nit                                                                                          | "Live Environment First"; "IMMEDIATELY after implementing any front-end change… Take full page screenshot"                                                                                                                                                                                                                                                                                  | 루프                | Phase 1 루프의 선례. 단 Inter를 추천해 미학은 못 맡김                               |
| styleseed (944★)                                            | 74 규칙 + 0–100 채점 게이트, render → score → revise                                                                                                                 | "the enforced gate improved both Codex and Claude Code by +5.3 points. Raw rules alone were inconsistent (Codex +1.6, Claude Code −3.7)"                                                                                                                                                                                                                                                    | 루프                | **규칙만으로는 불안정, 채점 게이트가 효과** — Phase 1의 직접 근거                   |
| gstack (131k★) · tastemaker (326★)                          | 취향 메모리(주 5% 감쇠) · `/design-shotgun` 4–6 변형 · 대비 행렬 스크립트                                                                                            | tastemaker "Ground in real pixels, not words."                                                                                                                                                                                                                                                                                                                                              | 루프 · 메모리       | 사용자 accept/reject 로그(Phase 3)                                                  |
| 프로덕션 툴 프롬프트 — Lovable · v0 · Same.dev · Emergent   | 스택 고정(React + Tailwind + shadcn + lucide) · 시맨틱 토큰만 · 수치 상한 · 브리프 먼저 · 버전마다 스크린샷                                                          | Lovable "The design system is everything. You should never write custom styles in components"; v0 "ALWAYS use exactly 3-5 colors total", "maximum 2 font families", "NEVER use emojis as icons", "If you generate a design brief, you MUST follow it"; Same.dev "NEVER stay with default shadcn/ui components", versioning 툴이 "a full-page screenshot of the version's live preview" 반환 | 바닥(자유도 축소)   | 토큰 외 값 금지 · 수치 상한 · 조합 블록 허용(Phase 2 · 4)                           |
| Google DESIGN.md (Stitch)                                   | YAML 토큰 + 8 섹션 산문, `design.md lint`(contrast 4.5:1 · missing-primary · broken-ref) · `diff` · `export css-tailwind`                                            | PHILOSOPHY "Adjectives describe a region. A specific reference describes a point."; "The negative constraints arrive for free when the reference is specific enough."; lint `missing-primary`: "agents will auto-generate one"                                                                                                                                                              | 인터페이스          | 시스템 파일의 스키마로 채택(Phase 3). Impeccable · ui-skills · Stitch이 같은 스키마 |
| VoltAgent/awesome-design-md (MIT)                           | 실제 제품 74개의 DESIGN.md(Linear · Stripe · Vercel …), 각 ~3,000단어 + preview.html                                                                                 | "Copy a DESIGN.md into your project, tell your AI agent 'build me a page that looks like this'"                                                                                                                                                                                                                                                                                             | 천장(계보)          | 계보 프로필 추출 원천(Phase 3). 브랜드 자산 복제 금지 · 토큰 재도출                 |
| shadcn theming + tweakcn                                    | 고정 변수 어휘로 전체 재스킨, 프리셋 38개를 `npx shadcn add <url>` 한 줄로                                                                                           | "Websites made with shadcn/ui famously look the same."; shadcn "Changing `--radius` updates the entire radius scale"                                                                                                                                                                                                                                                                        | 바닥(프리셋)        | 프리셋 = 즉시 통일된 팔레트 · radius · 폰트. 단 레이아웃은 못 바꿈                  |
| 21st.dev Magic MCP (5.8k★)                                  | 사람이 만든 컴포넌트를 검색해 시작점으로                                                                                                                             | "Components are inspired by 21st.dev's library"                                                                                                                                                                                                                                                                                                                                             | 천장(차용)          | 조합 블록 게이트 완화(Phase 2)                                                      |
| Claude Design (2026-04)                                     | 코드 · Figma · 브랜드 자산에서 디자인 시스템 추출 → 자기 검사 → 캔버스 반복                                                                                          | "Claude builds a design system for your team by reading your codebase and design files"; 리뷰어 공통: 입력 없으면 하우스 룩                                                                                                                                                                                                                                                                 | 인터페이스          | "침묵 = 기본값" 원칙                                                                |
| 한국어 타이포 — Pretendard · Toss · KRDS                    | 한글 + 라틴을 한 가족에 담은 폰트, keep-all, 행간 1.5–1.7, -0.01~-0.02em, 400/700, tnum                                                                              | Toss "국문과 동일한 두께로 맞추면 숫자, 영문이 너무 얇아 보여"; KRDS 본문 17px/150%, 400 · 700만; toss.im CSS `word-break:keep-all` 10회 · `line-height:1.6` 19회 · `letter-spacing:-.02em` 11회                                                                                                                                                                                            | 바닥(한국어)        | `typography-ko.md`(Phase 2)                                                         |

### 2.1 실증 연구 — 무엇이 측정 가능하게 좋아지는가

| 발견                                                                              | 출처                                          | 수치                                                                                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **채점 없는** 자기 수정(렌더를 보고 고치기)은 거의 효과가 없고 약한 모델엔 해롭다 | Design2Code (NAACL 2025)                      | GPT-4V block-match 85.8→88.8, color 73.3→72.9; Gemini position 72.3→70.1                                             |
| **채점되는** 스크린샷 루프 + 나빠지면 되돌리기는 정확도를 2배로 올린다            | WebGen-Agent (2025)                           | Claude-3.5-Sonnet 26.4%→51.9%, appearance 3.0→3.9/5                                                                  |
| "개선일 때만 채택" 규칙이 단일 최대 기여                                          | ReLook (2025)                                 | Forced Optimization +2.0, vision reward +3.3                                                                         |
| 라운드는 2–5에서 포화                                                             | UI2Code^N · Sketch2Code                       | 실제 UI 66%→74%(5라운드), 합성은 2라운드에서 포화; Sketch2Code 3라운드 후 평탄                                       |
| 전문가가 쓴 질문은 결과를 올리고, 모델이 만든 질문은 내린다                       | Sketch2Code                                   | 질문당 시각 유사도 +0.58% vs −1.12%; 참가자 8명 중 7명이 질문하는 에이전트 선호                                      |
| 섹션별 생성 · 비평이 전체 한 번보다 낫다                                          | DCGen (FSE 2025)                              | 시각 유사도 최대 +15%                                                                                                |
| VLM 심판은 **순위는 맞히지만 절대점수는 못 준다**                                 | "VLM Judges Can Rank but Cannot Score" (2026) | 미학 점수 구간이 범위의 ~40%                                                                                         |
| pairwise + 과제별 체크리스트가 사람과의 일치를 올린다                             | WebDevJudge · ArtifactsBench · WebVR          | 단일 채점 대비 pairwise +8.0%; 체크리스트 없이 66.06% → 체크리스트로 90.95% · 96%                                    |
| 심판은 Ease of Use에는 거의 무작위                                                | MLLM as a UI Judge (2025)                     | Interest 75–78% vs Ease of Use 47–51%                                                                                |
| 디자이너끼리도 합의가 낮다 — 취향은 개인 · 맥락                                   | DesignPref (2025)                             | Krippendorff α = 0.25; 개인화 심판이 20× 적은 예시로 우세                                                            |
| 제약 수가 늘수록 준수율이 떨어지고, 실패는 누락으로 나타난다                      | FollowBench · ComplexBench · IFScale          | GPT-4 hard-satisfaction 84.7%(1제약)→61.9%(5제약); 500제약에서 누락:수정 >30:1; primacy bias는 150–200 지시에서 최대 |
| 지시 간 긴장 · 충돌이 저하의 주 요인                                              | IBM "Boosting Instruction Following" (2025)   | 2지시에서 최대 +7점 회복                                                                                             |
| 멀티턴에서 앞의 지시를 잊는다                                                     | Multi-IF · FronTalk                           | o1 0.877→0.707(3턴); 편집 인식 baseline +9.3%                                                                        |
| 아름다움 → 지각된 사용성 (단 큰 결함은 못 가림)                                   | Kurosu & Kashimura 1995 · Tractinsky 2000     | —                                                                                                                    |

### 2.2 핵심 재해석

슬롭은 능력 결핍이 아니라 **기본값**이다. 침묵하면 분포의 중심이 나온다. 그래서 형용사를 더
붙이는 프롬프트는 효과가 없고, 다음 세 가지만 효과가 있다.

1. 구체적인 **점**(레퍼런스 · 토큰 · exemplar)을 입력으로 준다 — 영역이 아니라 점.
2. 결과를 **보고 채점하고, 나아질 때만 채택**한다 — 무채점 루프는 무효.
3. 규칙은 적고 단단하게, 충돌 없이 — 223개는 준수율을 깎는 구조다.

## 3. 통찰

- **I1. 금지 목록은 러닝머신이다.** Anthropic v1은 Inter · 보라 gradient를, v2는 cream + serif +
  terracotta를, v3은 "SaaS-card kit" · 대문자 eyebrow · `→` 버튼을 금지한다 — 매번 이전 버전이
  만든 룩을 금지한다. Impeccable 저자: "today's antidote to slop becomes tomorrow's slop the
  moment everyone reaches for it." 분석: 금지는 영역의 경계만 옮긴다. 우리 Slop gates · detect ·
  kill-ai-slop도 같은 층위다. 바닥 장치로만 쓰고, 천장은 다른 장치가 맡는다.
- **I2. 절제 ≠ 마감.** 우리 규칙은 "빼기" 어휘 31회, "더하기" 4줄이다. 남들의 "마감" 규칙은 전부
  수치와 코드다 — Refactoring UI 간격 스케일(4/8/12/16/24/32/48/64/96), Comeau의 층 그림자
  (offset · blur 2배씩, 알파 ~0.075, 색은 배경 hue로 틴트), Emil의 duration(버튼 100–160ms,
  ease-out, 키보드 트리거 무모션), hallmark Gate 22(중립색 chroma ≥0.005). paddo.dev:
  "Vocabulary isn't taste. Knowing 'tinted neutrals' doesn't mean knowing when to use them." 분석:
  어휘를 늘리지 말고 **코드 스니펫이 붙은 기본값**으로 준다.
- **I3. 형용사는 영역, 레퍼런스는 점.** Google PHILOSOPHY: "'Modern, clean, trustworthy,
  premium' evokes nothing specific… Adjectives describe a region. A specific reference describes a
  point." 그리고 "The negative constraints arrive for free when the reference is specific enough."
  분석: 계보(lineage) DESIGN.md 하나가 금지 규칙 수십 개를 대체한다. Creation 모드는 "무에서
  도출"이 아니라 "계보 선택 + 변이"로 바꾼다.
- **I4. 규칙만으로는 불안정하고, 채점 게이트가 안정적으로 효과가 있다.** styleseed 벤치마크에서
  raw rules는 Codex +1.6 · Claude −3.7로 **일관성이 없고**, 채점 게이트는 둘 다 +5.3.
  WebGen-Agent는 채점 루프로 26.4%→51.9%, ReLook은 "개선일 때만 채택"이 최대 기여. 반대로
  Design2Code의 무채점 자기수정은 ~0. 분석: 우리 스킬의 "스크린샷을 찍어 본다"는 정확히 효과
  없는 변종이다. 채점 · 수용 기준 · 라운드 상한이 있어야 루프다.
- **I5. 심판은 비교와 체크리스트만 믿는다.** VLM은 순위는 맞히지만 점수는 못 주고(구간 ~40%),
  pairwise는 +8%, 과제별 체크리스트는 일치율 66%→91–96%. Ease of Use는 무작위(47–51%). 분석:
  a11y · overflow · 대비 · 폰트 수 · 토큰 위반은 **결정론 도구**로, 위계 · 무드 · 특이성만 VLM
  pairwise로. 절대점수 루브릭(현행 6축 1–5)은 심판 근거로 약하다.
- **I6. 규칙 예산.** FollowBench 84.7%→61.9%(5제약), IFScale 누락:수정 >30:1, IBM은 지시 간
  긴장이 주 요인. 우리 스킬은 223규칙 + 13위임의 취향 충돌. 분석: 상시 규칙 ≤12개를
  hardest-first(primacy)로 두고, 나머지는 단계별 on-demand 로드 또는 사후 체크리스트로 옮긴다.
- **I7. 바닥은 시스템에서 빌린다.** v0 · Lovable · Same.dev는 스택을 고정하고 토큰 외 값을
  금지하고 사람이 만든 컴포넌트에서 시작한다. tweakcn 프리셋 38개는 한 줄로 통일된 팔레트 ·
  radius · 폰트를 준다. 우리는 조합 블록 설치를 금지해 hero · pricing을 매번 손으로 그린다.
  분석: Creation/Adaptation에서는 검증된 블록 · 프리셋을 시작점으로 허용하고, 재스킨-to-token
  게이트만 유지한다.
- **I8. 한국어 화면은 다른 타이포 체계다.** Inter · Space Grotesk · Instrument Serif · Geist에는
  한글이 없다. 한글 문자열은 Malgun Gothic · Apple SD Gothic Neo로 조용히 fallback되어 굵기 ·
  x-height · baseline이 다른 두 번째 가족이 섞인다. Pretendard · Interop · Toss Product Sans는 정확히
  이 불일치를 없애려고 만들어졌다. 분석: 한국어 브리프에는 라틴 우선 스킬의 폰트 조언이 전부
  역효과다. 한글 완비 가족 하나 + keep-all + 1.5–1.7 행간 + em 단위 음수 자간이 기본값이어야 한다.
- **I9. 취향은 합의가 아니다.** 디자이너 20명의 α = 0.25. 분석: "예쁨"의 정답은 없고 브리프 ·
  청중 · 레퍼런스 2–3개 · 기억할 요소 하나가 정답이다. 심판 루브릭은 브리프에서 파생하고,
  사용자의 accept/reject를 프로젝트 파일에 남긴다(gstack · tastemaker). Frame 단계의 질문은
  고정 템플릿(청중 · 무드 · 레퍼런스 · 기억할 요소)으로 둔다 — Sketch2Code에서 전문가 질문은
  결과를 올리고 모델이 즉석에서 만든 질문은 내렸다.
- **I10. Impeccable은 린터가 아니라 워크플로다.** §1.3. 분석: 컨텍스트 → 스크린샷 라운드 →
  격리 리뷰어 → polish 순으로 재배치하고, 효과는 Phase 0 하네스로 측정해 데이터로 유지 · 제거를
  결정한다.
- **I11. 보지 않은 화면은 완료가 아니다.** 프로덕션 툴은 버전마다 스크린샷을 돌려주고
  (Same.dev), Impeccable · OneRedOak · gstack · styleseed는 브라우저를 전제한다. Anthropic조차
  v3에서 "a picture is worth 1000 tokens"라 썼다. 우리 레포에는 Playwright와 browser MCP가 이미
  있다(`.playwright-mcp/`, `frontend-visual-qa`). 비용이 아니라 배선의 문제다.

## 4. 설계 원칙

1. **바닥은 결정론, 천장은 점 + 루프.** lint · 토큰 · 프리셋 · 한국어 타이포 기본값은 결정론으로
   고정하고, 특이성 · 위계 · 무드는 계보 DESIGN.md와 채점 루프가 만든다. 둘을 같은 규칙 목록에
   섞지 않는다.
2. **상시 규칙 ≤12, hardest-first.** 나머지는 단계별 on-demand 로드. UX 체크리스트는 유지하되
   Self-review에서만 로드한다 — 사용자 진단대로 UX는 문제가 아니다.
3. **보지 않은 화면은 완료가 아니다.** 렌더 → 결정론 검사 + 비평 → 수정 → 재렌더, **이전보다
   나을 때만 채택**, 최대 3라운드.
4. **예시가 규칙을 이긴다.** 토큰 파일 · exemplar 컴포넌트 · 계보 DESIGN.md를 실물로 둔다.
5. **한국어 우선 기본값.** 브리프 언어가 한국어면 `typography-ko.md`가 라틴 조언에 앞선다.
6. **측정 없는 변경 없음.** 모든 phase는 Phase 0 하네스의 pairwise 승률 · pass^k · 결정론 지표로
   채택된다. host(claude · codex)별로 따로 보고하고 pooled 하지 않는다(oracle-design 관례).
7. **경계 유지.** `frontend-visual-qa`의 `VERIFIED` 의미와 Oracle 정책 경계는 손대지 않는다.
   디자인 루프는 자기비평이지 검증이 아니며, 산출물도 Oracle artifact가 아니다. Fidelity 모드는
   그대로다.
8. **단독 동작.** 외부 스킬이 하나도 없어도 이 스킬만으로 바닥 + 천장이 성립해야 한다. 외부
   스킬은 가산이다.

## 5. Phase 0 — 측정 하네스 (먼저)

`packages/frontend-interface-design/evals/` 신설. oracle-design의 `run-live.mjs` ·
`grade-results.mjs` 패턴(variant · replicateId · pass^k/pass@k · 비pooled)을 이식한다.

1. **`briefs.json`** — 8개 브리프 × `lang`(ko 4 · en 4) × 유형: SaaS 대시보드 · 마케팅 랜딩 ·
   커머스 PDP · 폼 중심 관리자 · 콘텐츠/읽기 · 핀테크 모바일 첫 화면 · 데이터 테이블 도구 ·
   온보딩. 각 브리프에 청중 · 무드 3단어 · 기억할 요소 1개 · **브리프별 체크리스트 10문항**
   (yes/no; 예: "첫 시선이 primary action에 가는가", "한글 줄바꿈이 어절 단위인가", "같은 gap이
   화면 전체에 반복되지 않는가").
2. **`run-live.mjs`** — host(claude · codex) × variant(baseline · candidate) × replicates k=3.
   산출물은 정적 HTML 또는 dev server URL.
3. **`render.mjs`** — Playwright로 375 · 1280 × light/dark(지원 시) PNG. 폰트 readiness 대기,
   임의 sleep 금지(visual-qa 관례).
4. **결정론 지표** (스크린샷과 같이 수집): `impeccable detect` **browser 엔진**(`--viewport`)
   경고 수, 대비 4.5/3 실패 수, 320 가로 overflow, 컴포넌트 내 토큰 외 색/폰트/radius 값 비율
   (regex), 폰트 가족 수, `keep-all` 존재(ko), 이모지 아이콘 수.
5. **`judge.mjs`** — VLM pairwise: 같은 브리프의 A/B 스크린샷(+ 코드)을 위치 교대(A/B swap)
   2회, 체크리스트 10문항 + "어느 쪽이 더 이 브리프에 속하는가" 1문항. **절대점수 금지.**
   결과는 승률 + 체크리스트 통과 수.
6. **사람 보정** — 사용자가 20쌍을 직접 투표. 심판-사람 일치율 ≥75%가 목표(MLLM-as-judge
   77%, 사람-사람 68.7%가 기준선). 미달이면 체크리스트를 고친 뒤 재측정.
7. **`grade-results.mjs`** — (caseId · variant · replicateId) 단위, pass^k = 모든 replicate가
   결정론 지표 통과, 승률은 variant 쌍별. `results/<date>-<variant>.json`.

수용 기준: baseline(현행 0.3.0) 승률 50% 기준점과 결정론 지표 분포, 심판-사람 일치율이 기록된다.
비용: 스크립트 4개 + 브리프 8개. Playwright는 레포에 이미 있다. 외부 의존은 impeccable CLI(선택).

근거: styleseed(채점 게이트 벤치마크) · ArtifactsBench/WebVR(체크리스트 심판) ·
WebDevJudge(pairwise) · "Rank but Cannot Score" · Design Arena(blind pairwise + Bradley-Terry) ·
oracle-design 하네스.

## 6. Phase 1 — 채점형 시각 루프 (`references/look.md`, Phase 0와 함께)

Build 직후 **필수** 단계로 삽입한다. 현행 5.5 "dev server가 있으면 스크린샷을 찍어 본다"를
대체한다.

1. **렌더.** dev server가 없으면 정적 하네스 HTML(토큰 블록 + 대상 컴포넌트)을 만들어 Playwright로
   렌더한다. 375 · 1280 × 지원 테마.
2. **결정론 검사를 도구로.** `impeccable detect --engine browser`(설치 시) 또는 자체 스크립트:
   대비 · overflow · 폰트 수 · 토큰 외 값 · keep-all. 이 결과는 LLM 판단을 앵커링하므로
   비평보다 **먼저** 확정한다(Impeccable critique의 격리 원칙).
3. **섹션별 비평.** hero/nav · 본문 · 폼/표 · footer 순으로, Phase 0 브리프 체크리스트 10문항 +
   craft 체크(§7) 10문항에 yes/no. 실패 항목마다 **수정 1줄**(무엇을 어느 값으로).
4. **수정 → 재렌더 → 비교.** 이전 스크린샷과 나란히 놓고 같은 체크리스트로 재채점.
   **통과 수가 늘었을 때만 채택**, 줄면 되돌린다(ReLook Forced Optimization).
5. **정지 규칙.** 최대 3라운드, 2라운드 연속 무개선이면 정지(UI2Code^N · Sketch2Code 포화).
6. **기록.** `design-loop/<n>-{375,1280}.png`와 라운드별 체크리스트 diff를 Rationale에 링크.
   Rationale `review:` 줄은 절대점수 대신 `loop: r2 checks 14/20→18/20`으로 바꾼다.

경계: `VERIFIED` 미발급, Oracle artifact 아님, 정책 판단 없음. visual-qa가 명시 요청되면 그
결과가 우선한다.

수용 기준: Phase 0 하네스에서 baseline 대비 승률 ≥65%(host별), 결정론 지표 비악화, 라운드당
평균 토큰 기록.

근거: WebGen-Agent · ReLook · UI2Code^N · Design2Code(무채점 무효) · DCGen(섹션별) ·
OneRedOak · Impeccable "bounded passes" · Same.dev/Emergent 스크린샷 · Anthropic v3.

## 7. Phase 2 — craft cookbook + 한국어 타이포 + exemplar (plain → refined)

계보(Phase 3)보다 먼저 한다 — 문서와 코드만으로 즉시 체감되고 데이터 준비가 필요 없다.

### 7.1 `references/craft.md` (≤120줄, 각 항목에 CSS 스니펫)

| #   | 기본값                                                                                | 수치 · 출처                                                                 |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | 중립색을 anchor hue로 틴트                                                            | chroma ≥0.005 (hallmark G22) · Refactoring UI "Greys don't have to be grey" |
| 2   | 층 그림자 토큰 3단(raised · overlay · modal), 광원 1개                                | offset · blur 2배씩, 알파 ~0.075, 색은 배경 hue 틴트 (Comeau)               |
| 3   | hairline border는 알파로, 구분은 간격 > 배경 > 그림자 > border                        | Refactoring UI · Vercel WIG "semi-transparent borders + shadows"            |
| 4   | focus ring · selection · caret · scrollbar 토큰                                       | Impeccable craft-floor "the one models skip most reliably"                  |
| 5   | display tracking −0.02em, 본문 0, 라틴 전용 문자열 0                                  | toss.im · KRDS · uxdev                                                      |
| 6   | `tabular-nums`, `text-wrap: balance/pretty`                                           | Vercel WIG · ui-skills                                                      |
| 7   | radius 중첩: child ≤ parent, concentric                                               | Vercel WIG · kill-ai-slop "corners that don't nest"                         |
| 8   | hover/pressed 피드백 120–200ms ease-out, `scale(0.97)` active, 키보드 · 고빈도 무모션 | Emil (버튼 100–160ms, "Never ease-in", 100+회/일 → 없음)                    |
| 9   | 밀도 모드: 행 높이 40/48/56, 간격 스케일 4 또는 8 하나                                | Refactoring UI 스케일                                                       |
| 10  | 아이콘 시스템 하나(Lucide, 1.5px stroke, 16/20/24), 이모지 · 유니코드 금지            | v0 "typically 16px, 20px, or 24px" · Impeccable refuse list                 |
| 11  | empty · table · form 레시피 각 1개(구조 + 상태 8종 + 토큰만 참조)                     | 현행 visual-system §5 세공 규칙을 코드로                                    |
| 12  | 브랜드 순간 하나(signature), 나머지는 조용히                                          | Anthropic v3 "Spend your boldness in one place" · 현행 규칙 유지            |

### 7.2 `references/typography-ko.md`

```css
/* 한국어 우선 기본값 — 출처 [ ] */
:root {
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue',
    'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif; /* [Pretendard README] */
}
html {
  font-family: var(--font-sans);
  font-synthesis: none; /* [MDN: CJK faux bold 금지] */
}
body {
  font-size: 16px;
  line-height: 1.6; /* [KRDS ≥150% · toss.im 1.6] */
  letter-spacing: -0.01em;
  word-break: keep-all; /* [toss.im 10회 · MDN] */
  overflow-wrap: break-word;
}
h1,
h2,
h3 {
  line-height: 1.3;
  letter-spacing: -0.02em; /* [toss.im -.02em] */
  font-weight: 700; /* [KRDS 400 · 700] */
  word-break: keep-all;
  text-wrap: balance; /* [ryelle: balance는 keep-all 필요] */
}
@media (max-width: 480px) {
  h1,
  h2 {
    word-break: normal;
  }
}
.num,
td {
  font-variant-numeric: tabular-nums;
} /* [toss.im tnum] */
:lang(en) {
  letter-spacing: 0;
} /* [uxdev: 라틴은 과도하게 좁아짐] */
/* weight 400/500/600/700만. TDS 스케일 30/40 · 26/35 · 22/31 · 20/29 · 17/25.5 · 15/22.5 · 13/19.5 */
```

- 라틴 display 폰트가 꼭 필요하면 `unicode-range`로 라틴만 싣고 한글은 Pretendard로 받는다.
  이때 라틴 굵기를 한 단계 올린다(Toss · Interop의 교훈).
- Toss Product Sans는 배포 불가 자산이므로 쓰지 않는다. 대안: Pretendard(범용) · SUIT(고밀도) ·
  Spoqa Han Sans Neo(숫자 중심) · Wanted Sans(브랜드).
- 라틴 폰트 조언(visual-system §3의 grotesk · humanist serif)은 `lang: en`에서만 유효하다고
  명시한다.

### 7.3 `exemplars/` — 검수된 실물

`tokens.css`(light/dark, ko 타이포 포함) · primitives 5개(button · input · card · table row ·
dialog, 상태 8종) · compositions 2개(app shell · marketing hero). 사용자가 한 번 검수하면 이후
"정답지"다. 지시는 "exemplar를 복사한 뒤 DESIGN.md로 재스킨한다"로, zero-shot 생성을 대체한다.

### 7.4 컴포넌트 소싱 게이트 완화

reference-study.md § 설치 게이트에 "Creation/Adaptation 모드에서는 검증된 조합 블록(shadcn
blocks · 자체 registry · exemplars)을 시작점으로 허용"을 추가한다. 재스킨-to-token 게이트(원본
색 · 폰트 · 그림자 잔존 = slop)와 역할 중복 금지는 유지한다.

수용 기준: Phase 0 하네스에서 craft 체크 10문항 통과율과 한국어 브리프 승률 상승, detect 경고 수
감소. 계약 테스트에 craft.md · typography-ko.md · exemplars 존재 pin 추가.

근거: Refactoring UI · Comeau · Emil · Impeccable craft-floor · v0 수치 상한 · Pretendard ·
TDS · KRDS · toss.im 실측 CSS · Anthropic "map aesthetic improvements to implementable code".

## 8. Phase 3 — 계보(lineage) 기반 DESIGN.md 파이프라인 (Creation → Adaptation)

Creation 모드를 "무에서 도출"에서 "계보 선택 + 변이"로 바꾼다. Fidelity 모드는 그대로다.

1. **`references/lineages/<name>.md` 6개** — 특정 브랜드 복제가 아닌 추상화된 계보:
   `precision-tool`(운영 도구, Linear류) · `editorial-marketing`(Stripe류) ·
   `consumer-fintech-ko`(Toss류) · `dense-data-ops` · `warm-content`(읽기) · `playful-commerce`.
   각 파일은 Google DESIGN.md 스키마(YAML 토큰 + Overview · Colors · Typography · Layout ·
   Elevation · Shapes · Components · Do's and Don'ts) + 한국어 타이포 블록 + signature 후보 3개.
   ≤150줄로 제한한다(awesome-design-md의 3,000단어는 예산 초과).
2. **추출 원천** — awesome-design-md(MIT) 74건에서 **패턴**(밀도 · 위계 · 표면 · 모션 성격)만
   추출하고 토큰 값은 재도출한다. 브랜드 색 · 폰트 이름 · 카피는 옮기지 않는다(현행
   reference-study 원칙). TDS 공개 스케일 · KRDS는 값 인용 가능.
3. **절차** — Frame → 브리프(청중 · 무드 3단어 · 기억할 요소 1개 · 레퍼런스 ≤3; 질문은 고정
   템플릿) → 계보 선택(유형 × 밀도 × 청중, 표로 결정) → **변이 노브 3개**(hue · 타입 페어링 ·
   radius+밀도)를 브리프에서 정한다 → 프로젝트 루트 `DESIGN.md` 방출 → `design.md lint`
   (contrast · missing-primary · broken-ref) → Anthropic v3의 "일반적 답 시뮬레이션": 같은
   브리프에 흔한 답을 한 줄로 적고 우리 선택이 그와 어디서 갈리는지 적는다 → 이후 화면은
   Fidelity로 잠긴다. 현행 이식 테스트는 변이 검증으로 유지한다.
4. **다양성 로그** — `.design/log.json`에 사용한 계보 · 매크로구조 · 폰트 페어링을 기록하고,
   같은 프로젝트의 다음 화면은 매크로구조를 반복하지 않는다(hallmark). 사용자의 accept/reject도
   같은 파일에 남겨 다음 실행의 심판 루브릭에 반영한다(gstack · tastemaker · DesignPref).
5. **상호운용** — 같은 `DESIGN.md`를 `impeccable context` · ui-skills `create-design-md` · Stitch가
   읽는다. 새 포맷을 만들지 않는다.

수용 기준: 같은 브리프 3회 실행에서 계보 내 변이가 관측되고(hue · 페어링 · 매크로구조 중 ≥2
상이), Phase 0 심판의 "이 브리프에 속하는가" 문항 승률 상승. 계보 6개 모두 `design.md lint`
통과.

근거: Google PHILOSOPHY · awesome-design-md · Claude Design("침묵 = 기본값") · Impeccable
DESIGN.md/concept-seed · hallmark 다양성 로그 · Anthropic v3 · OpenAI GPT-5.4 "visual thesis" ·
DesignPref · Sketch2Code.

## 9. Phase 4 — 규칙 예산 재편 + Impeccable 재배치

### 9.1 상시 규칙 12개 (SKILL.md 본문, hardest-first)

1. `DESIGN.md`가 없으면 Phase 3 절차로 만들고 시작한다. 있으면 그것이 잠긴 시스템이다.
2. 색 · 폰트 · radius · 그림자는 토큰만 참조한다. 컴포넌트 안의 리터럴 값은 결함이다.
3. 폰트 가족 ≤2. 한국어 브리프는 한글 완비 가족(Pretendard 계열)이 본문이다.
4. 색은 중립 포함 3–5개, accent는 한 화면 점유 ≤5%, primary action과 현재 위치에만.
5. 간격 스케일 하나(4 또는 8), 임의 값 없음, 섹션 > 그룹 > 요소.
6. 아이콘 세트 하나, 이모지 · 유니코드 아이콘 금지.
7. interactive 요소는 상태 8종을 가진다.
8. 보지 않은 화면은 완료가 아니다 — 렌더 → 채점 → 개선일 때만 채택, ≤3라운드.
9. 텍스트 대비 4.5:1 · UI 3:1, 320px 가로 overflow 0.
10. 모션은 transform/opacity ≤200ms, 키보드 · 고빈도 동작 무모션, reduced-motion 존중.
11. 지어낸 수치 · 로고 · 후기 없음.
12. 한 화면에 primary action 하나, 첫 시선이 그것에 간다.

나머지(ux-checklist · interface-rules · decision-ladder · fidelity · reference-study)는 단계별
on-demand로 이동한다. 목표: SKILL.md 상시 로드 토큰을 현재의 50% 이하로.

### 9.2 gate · 축 재정의

- visual treatment gate: "craft.md · 계보 DESIGN.md에 있는 treatment는 근거 면제. 그 외만 사다리
  근거 필요"로 바꾼다. 마감을 벗겨내는 현행 규칙의 직접 수정이다.
- review 6축: Restraint를 **Restraint · Craft**로 분리하고, 절대점수 대신 Phase 1 체크리스트
  통과 수를 쓴다. 계약 테스트의 `review: T\d H\d S\d E\d R\d X\d` pin을 함께 갱신한다.
- ui-checklist Slop gates와 kill-ai-slop 위임은 Phase 0 결정론 지표로 흡수한다.

### 9.3 Impeccable 재배치 (설치된 경우에만, 가산)

| 단계        | 현행                            | 재배치                                                                                                                |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Frame       | 없음                            | `impeccable init` → PRODUCT.md를 Frame 입력으로. 없으면 우리 Frame 4항목으로 대체                                     |
| 컨텍스트    | DESIGN.md를 impeccable에서 보호 | 같은 스키마이므로 `impeccable context`가 우리 DESIGN.md를 읽게 둔다. 교체 시도는 여전히 `NEEDS_DECISION`              |
| 결정론 검사 | `detect` 소스 스캔을 게이트로   | Phase 1 2단계에서 **browser 엔진**으로만 실행. 훅의 regex 폴백 결과는 "undercount"로 표기하고 통과 근거로 쓰지 않는다 |
| 비평        | 선택적 `critique`               | Phase 1 3단계의 두 번째 의견. 우리 체크리스트가 1순위, critique 지적은 증거로 인용                                    |
| 마무리      | 선택적 `polish`                 | Phase 1 루프 종료 후 finisher로 1회. 리뷰어 합의("excellent as a finisher")                                           |
| 유지 여부   | 취향                            | Phase 0 하네스에서 impeccable on/off variant 승률로 결정. 차이가 없으면 위임 표에서 제거                              |

수용 기준: 상시 규칙 ≤12, SKILL 토큰 ≤50%, 계약 테스트 갱신 GREEN, Phase 0 승률 비악화(host별).

근거: FollowBench · ComplexBench · IFScale · IBM tension · Lost in the Middle · ui-skills 80줄
모델 · Impeccable 문서 · 리뷰어 인용.

## 10. 우선순위와 정지 규칙

| 순위 | 항목                                                     | 비용                       | 근거                                                                   |
| ---- | -------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| 1    | Phase 0 측정 하네스 + Phase 1 채점형 시각 루프 (§5 · §6) | 스크립트 4개 + reference 1 | 채점 게이트만 두 host에서 일관되게 효과(styleseed), 루프로 2배(WebGen) |
| 2    | Phase 2 craft cookbook + 한국어 타이포 + exemplar (§7)   | 문서 2 + 코드 exemplar     | plain→refined는 수치 · 코드로만 전달됨; 한국어 fallback은 결정론 결함  |
| 3    | Phase 3 계보 DESIGN.md (§8)                              | 계보 6개 + 절차            | 특이성은 금지가 아니라 점에서 온다; 데이터 준비 필요                   |
| 4    | Phase 4 규칙 예산 + Impeccable 재배치 (§9)               | SKILL 재작성 + 테스트      | 준수율 회복; 위 세 phase가 자리 잡은 뒤 정리                           |

정지 규칙: 각 phase는 (1) 계약 테스트 GREEN, (2) Phase 0 하네스 host별 승률 ≥ 이전 phase, (3)
결정론 지표 비악화를 만족해야 다음으로 간다. 어느 phase든 승률이 55% 미만이면 되돌리고 원인을
분석한다. 릴리스는 Phase 2까지 0.4.0, Phase 3 0.5.0, Phase 4 0.6.0으로 나눈다(changeset ·
marketplace bump · README).

경계 밖: 자체 컴포넌트 라이브러리 전면 제작, 모델 파인튜닝, 이미지 생성 comps(Impeccable
comp-led), 새 delivery 상태, visual-qa · oracle 경계 변경, Fidelity 모드 변경.

## 11. 리스크

| 리스크                                    | 대응                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 계보 프로필이 새 단일문화가 된다(I1)      | 변이 노브 3개 + 다양성 로그 + "일반적 답 시뮬레이션" + Phase 0 특이성 문항으로 감시                                                                                 |
| VLM 심판이 화려함 · 다크모드를 선호한다   | pairwise + 브리프 체크리스트만, 사용자 20쌍 보정, Ease of Use류는 결정론 지표로                                                                                     |
| 루프 비용(토큰 · 시간)                    | 3라운드 상한, 2라운드 무개선 정지, 섹션별 비평, 정적 하네스, 라운드당 토큰을 Phase 0에 기록                                                                         |
| 라이선스 · 브랜드                         | awesome-design-md는 MIT이지만 "extracted from public websites… as is" — 패턴만, 값 재도출, 자산 · 카피 · 폰트명 불복제. Pretendard OFL. Toss Product Sans 사용 금지 |
| host 차이(Claude vs Codex)                | variant · host별 보고, pooled 금지. Impeccable도 모델별 블록을 두는 이유와 같다                                                                                     |
| 한국어 · 영어 브리프 혼합                 | 브리프 `lang` 필드, typography-ko는 ko에서만 우선                                                                                                                   |
| 금지 목록 노후화                          | detect · Slop gates를 Phase 0 지표로 흡수하고 분기마다 원문 버전을 갱신(interface-rules의 sha pin 관례)                                                             |
| 채점 루프가 visual-qa · oracle과 혼동된다 | 산출물 경로 · 이름을 분리(`design-loop/`), `VERIFIED` 미발급 명시, README 경계 표 갱신                                                                              |

## 12. 원문 링크

- Anthropic: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md ·
  https://github.com/anthropics/skills/pull/1713 · https://github.com/anthropics/skills/pull/210 ·
  https://claude.com/blog/improving-frontend-design-through-skills ·
  https://www.anthropic.com/news/claude-design-anthropic-labs ·
  https://raw.githubusercontent.com/anthropics/skills/main/skills/web-artifacts-builder/SKILL.md ·
  https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- 커뮤니티 비판: https://claudecodehq.com/playbooks/unslop-ui ·
  https://dmaya.ai/blog/claude-code-frontend-design-skill ·
  https://news.ycombinator.com/item?id=47427727 · https://news.ycombinator.com/item?id=49330250 ·
  https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it ·
  https://www.925studios.co/blog/ai-slop-design-tells ·
  https://superdesign.dev/blog/why-ai-design-looks-generic
- Impeccable: https://github.com/pbakaus/impeccable · https://impeccable.style/docs/detector ·
  https://impeccable.style/slop/ · https://a16z.news/p/impeccable-by-design ·
  https://latent.space/p/skill-engineering-design · https://news.ycombinator.com/item?id=46587284 ·
  https://react-japan.dev/articles/three-design-tools-one-model ·
  https://www.chaseai.io/blog/claude-code-impeccable-skill-frontend-design ·
  https://paddo.dev/blog/impeccable-design-vocabulary/
- 커뮤니티 스킬: https://github.com/ibelick/ui-skills ·
  https://github.com/nextlevelbuilder/ui-ux-pro-max-skill · https://github.com/yetone/kill-ai-slop ·
  https://github.com/Nutlope/hallmark · https://github.com/OneRedOak/claude-code-workflows ·
  https://github.com/bitjaru/styleseed · https://github.com/garrytan/gstack ·
  https://github.com/codeswithroh/tastemaker · https://github.com/emilkowalski/skills ·
  https://github.com/Leonxlnx/taste-skill · https://github.com/21st-dev/magic-mcp ·
  https://github.com/vercel-labs/web-interface-guidelines
- 프로덕션 툴 · 시스템 파일: https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools ·
  https://github.com/google-labs-code/design.md ·
  https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/ ·
  https://github.com/google-labs-code/stitch-skills · https://github.com/VoltAgent/awesome-design-md ·
  https://ui.shadcn.com/docs/theming · https://github.com/jnsahaj/tweakcn ·
  https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make ·
  https://docs.replit.com/teams/custom-design-system
- 실증 연구: https://arxiv.org/abs/2403.03163 (Design2Code) · https://arxiv.org/abs/2410.16232
  (Sketch2Code) · https://arxiv.org/abs/2406.16386 (DCGen) · https://arxiv.org/abs/2509.22644
  (WebGen-Agent) · https://arxiv.org/abs/2510.11498 (ReLook) · https://arxiv.org/abs/2511.08195
  (UI2Code^N) · https://arxiv.org/abs/2510.23272 (OpenDesign) · https://arxiv.org/abs/2601.04203
  (FronTalk) · https://arxiv.org/abs/2506.06251 (DesignBench) · https://arxiv.org/abs/2507.04952
  (ArtifactsBench) · https://arxiv.org/html/2510.18560v1 (WebDevJudge) ·
  https://arxiv.org/abs/2510.08783 (MLLM as a UI Judge) · https://arxiv.org/abs/2604.25235 (Rank but
  Cannot Score) · https://arxiv.org/abs/2603.13391 (WebVR) · https://arxiv.org/abs/2511.20513
  (DesignPref) · https://arxiv.org/abs/2310.20410 (FollowBench) · https://arxiv.org/abs/2407.03978
  (ComplexBench) · https://arxiv.org/abs/2507.11538 (IFScale) · https://arxiv.org/abs/2510.14842 (IBM)
  · https://arxiv.org/abs/2410.15553 (Multi-IF) · https://arxiv.org/abs/2307.03172 (Lost in the Middle)
  · https://www.designarena.ai/about · https://arena.ai/leaderboard/code/webdev ·
  https://www.nngroup.com/articles/aesthetic-usability-effect/
- Craft: https://www.refactoringui.com/ · https://www.joshwcomeau.com/css/designing-shadows/ ·
  https://emilkowal.ski/ui/great-animations · https://rauno.me/craft/interaction-design ·
  https://frontend.horse/articles/the-linear-look/
- 한국어 타이포: https://github.com/orioncactus/pretendard · https://github.com/jhaemin/Interop ·
  https://toss.im/tossfeed/article/beginning-of-tps ·
  https://tossmini-docs.toss.im/tds-react-native/foundation/typography/ ·
  https://toss.tech/article/tds-color-system-update ·
  https://www.krds.go.kr/html/site/style/style_03.html · https://www.w3.org/TR/klreq/ ·
  https://developer.mozilla.org/en-US/docs/Web/CSS/word-break ·
  https://developer.mozilla.org/en-US/docs/Web/CSS/font-synthesis ·
  https://ryelle.codes/2025/04/typography-troubles-balancing-in-japanese-korean/ ·
  https://uxdev.org/blog/99-css-letter-spacing/ · https://parksb.github.io/article/37.html ·
  https://sun.fo/suit/ · https://spoqa.github.io/spoqa-han-sans/ ·
  https://github.com/wanteddev/wanted-sans · https://tilnote.io/en/pages/6a9355cface8bd2da70ebf6a

## 13. 구현 기록 (2026-09-06)

브랜치 `claude/ui-design-quality-m9zu73`, 패키지 `frontend-interface-design` 0.3.0 → 0.4.0. Phase 0–4를
한 릴리스로 구현했다 — 플랜의 0.4/0.5/0.6 분할은 "측정 게이트 통과 후 다음 phase"를 전제했는데,
live 하네스는 host(`claude` · `codex`) 실행이 필요해 이 세션에서 돌리지 않았다. 승률 게이트는
사용자가 §5 절차로 실행한 뒤 적용한다.

### 구현된 것

| Phase | 산출물                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `skills/frontend-interface-design/scripts/{metrics-core.js, metrics-browser.js, render.mjs}` — Look 루프와 eval이 같은 렌더러 · 지표를 쓴다. `evals/{briefs.json(8: ko 4 · en 4, 문항 10), gates.json, run-live.mjs(--dry-run 픽스처), judge.mjs(pairwise · 위치 교대 · 절대점수 없음), calibrate.mjs, grade-results.mjs, README.md}` + 패키지 테스트 |
| 1     | `references/look.md` — 렌더 → 게이트 → 섹션별 yes/no 비평(브리프 10 + craft 10) → 통과 수가 늘 때만 채택 → ≤3라운드 · 2라운드 무개선 정지. `VERIFIED` 미발급                                                                                                                                                                                          |
| 2     | `references/craft.md`(12 기본값, CSS 스니펫 12) · `references/typography-ko.md` · `exemplars/`(tokens.css + 프리미티브 5 + 조합 3 + README) · reference-study의 조합 블록 허용                                                                                                                                                                        |
| 3     | `references/adaptation.md`(브리프 6칸 · 고정 질문 · 체크리스트 10 템플릿 · 계보 표 · 노브 3 · DESIGN.md 방출 · lint · 흔한 답 시뮬레이션 · `.design/log.json`) · `references/lineages/*.md` 6개(Google DESIGN.md alpha 스키마 + `## Adaptation` 확장 섹션, 자리표시자 hue)                                                                            |
| 4     | SKILL.md 208줄 · 18,916자 → 125줄 · 11,975자(63%), 상시 규칙 12, 참조 on-demand 표, Impeccable 재배치(init → browser detect → critique 2순위 → polish finisher), review 7축 yes/no + `loop:` 줄, decision-ladder gate 면제 조항 · Decision rules 이관, ui-checklist Slop gates → 루프로 흡수, 계약 테스트 13건 재작성                                 |

### 플랜과의 차이

- SKILL.md 상시 로드는 63%로, 목표 50%에 미달이다. 남은 비용은 frontmatter description(트리거
  정확도 때문에 유지)과 위임 표다. 다음 라운드에서 하네스 승률과 함께 재측정한다.
- 계보 토큰의 `fontSize`에 `clamp()`를 썼다가 실제 `@google/design.md lint`(0.4.0)가 Dimension이
  아니라고 거부해 최대값으로 바꾸고 유동값은 산문 · CSS로 옮겼다. 6개 전부 errors 0(warnings는
  `orphaned-tokens`뿐 — 산문에서만 쓰는 다크 · 상태 토큰). 계약 테스트에 `clamp(` 금지 pin 추가.
- 한국어 제목 줄바꿈: 처음엔 ryelle의 조언대로 ≤480px에서 `word-break: normal`로 풀었는데, 375px
  렌더에서 "정산\n을"처럼 음절이 끊겼다. `keep-all` 유지 + `overflow-wrap: anywhere`로 바꾸고
  typography-ko.md 규칙을 수정했다 — Look 루프가 규칙 자체의 결함을 잡은 첫 사례다.

- §7.3의 조합 2개(app shell · marketing hero)는 첫 판이 사용자 판정에서 탈락했다 — 규칙은 다
  지켰지만 레퍼런스 옆에 두면 "빈 프레임 + 카드 나열"이었다. §1.2가 말한 평균 회귀를 우리 정답지가
  재현한 것이다. 레퍼런스 밀도로 다시 만들고 소비자 금융(Toss류 375 홈) 조합을 하나 더 추가했다
  (아래 기록).

### Look 루프를 exemplar에 적용한 기록

첫 판(조합 2): r1 발견 3건 — app-shell에 primary 버튼 2개 · marketing-hero의 feature 프레임이
`min-height`로 빈 공간을 채움 · 375 제목 음절 끊김. r2에서 통과했지만 위의 이유로 폐기했다.

다시 만든 판(조합 3)은 계보의 실제 레퍼런스에서 구조 · 밀도만 가져왔다(브랜드 자산 · 카피 · 폰트명
제외): `tokens.css` v2(노브 5 · 표면 사다리 · hairline · soft 상태색 · 차트 5 · 아이콘 · 아바타),
`app-shell.html`(Linear류 — 13px · 28px nav 행 · 36px 목록 행 · 그룹 헤더 · 우선순위 글리프 · 라벨
pill · 속성 패널 · 활동 · 댓글), `marketing-hero.html`(Stripe류 — 제품 mock이 주인공 · 사실 띠 ·
기능 3 · 단계 · 가격 2 · CTA · footer), `fintech-home.html`(Toss류 375 홈 — 금액 hero · 액션 타일 ·
8px 띠 · 60px 행 · 소비 막대 · 탭 바, `:root` 노브만 바꿔 hue 250). 여기에 `look.md` 루프를 그대로
돌렸다(chromium 141 · 375 + 1280 · light):

| 라운드 | 게이트 (app-shell · marketing · fintech)               | 발견 → 수정                                                                                                                                           |
| ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| r1     | tiny 11px 다수 · contrast 57 · 18 · 8 · tap 0 · 19 · 2 | 11px 전부 12px로 · `--subtle-foreground` L62 → 50 · 링크 최소 높이 · 트러스트 띠 selector 버그(`.trust div` → `> div`) · 토스트가 표를 가림           |
| r2     | contrast 16 · 1 · 4 · tap 0 · 1 · 0                    | 아바타 · 기관 마크: 흰 글자 on 58% 채움(3.8–4.5:1) → hue에서 soft 배경 + 진한 잉크 파생 · `--warning-text` 추가(70% 노랑은 2.7:1) · footer 링크 block |
| r3     | contrast 1 · 0 · 0 · 나머지 0                          | primary 버튼 안 kbd의 흰 12% 오버레이가 전경 대비를 4.2:1로 → 어두운 오버레이                                                                         |
| r4     | 전 게이트 0 · keep-all 1.00 · overflow 0/16 스크린샷   | 통과. 탭 바 fixed + 스페이서 → 흐름 안 sticky. 전체 페이지 캡처에서 하단 바가 중간에 찍히는 건 캡처 아티팩트라 look.md에 명시                         |

정답지라서 게이트 0까지 갔고, 그 때문에 `look.md`의 3라운드 상한을 한 라운드 넘겼다(매 라운드
통과 수가 늘었으므로 정지 조건에는 걸리지 않았다). 생성 화면에서는 상한을 지킨다. 스크린샷은
세션 스크래치에만 있고 레포에는 넣지 않았다.

루프가 잡아낸 것 중 셋은 규칙 · 토큰 자체의 결함이었다 — 한국어 줄바꿈 규칙, `--subtle-foreground`
밝기, warning 색의 텍스트 사용. 규칙만 읽고 만들었다면 셋 다 통과했다고 믿었을 것이다.

### 검증

- 계약 테스트 13/13 (`node --test scripts/skill-contract.test.mjs`).
- 패키지 테스트 55(54 pass · 1 skip — `FID_PLAYWRIGHT_DIR` 없는 브라우저 스모크) · `eslint skills scripts` 0.
- 브라우저 스모크 `render.test.mjs` 10/10 (playwright-core 1.56.1 · chromium 141.0.7390.37).
- exemplar 게이트: 조합 3 × (375 · 1280) 전부 0 — contrast · overflow · tiny · tap · long. 프리미티브 5
  가로 overflow 0. `--source` 리터럴 비율 0.07–0.08(색 리터럴 0 · radius 소수는 데모 레이아웃).
- pre-commit 전체 `pnpm test` 8/8 패키지 GREEN (커밋 `bf1b65f` · `86fee93` · `004bf85`).

### 남은 것 — 사용자 실행

1. live 하네스: `evals/README.md` 절차로 baseline(0.3.0, `git worktree`) vs candidate(0.4.0) ×
   host × k=3 실행 → `grade-results.mjs` 승률. 55% 미만이면 되돌린다(§10 정지 규칙).
2. 사람 보정 20쌍(`calibrate.mjs`), 심판-사람 일치율 ≥75% 확인.
3. Impeccable on/off variant 측정 후 위임 표 유지 여부 결정.
4. exemplar를 레퍼런스와 나란히 놓고 사람 검수 1회(정답지 확정) · `.design/log.json` 첫 프로젝트 적용.
