---
name: frontend-interface-design
description: Use when the user asks to design or implement a web UI, screen, flow, or component and wants it usable, not just pretty. Covers requirement framing, reference study, a decision ladder (primary task → hierarchy → interaction → feedback → visual), implementation with loading/empty/error states, funnel-based UX review, and a written rationale for every visual choice. Do not use for risky behavior policy (frontend-oracle-design), screenshot verification (frontend-visual-qa), or behavior tests (test).
---

# Frontend Interface Design

요구사항을 받아 **설명 가능한** 웹 UI를 설계하고 구현하는 skill이다. 목표는 예쁜 화면이
아니라 사용자가 primary task를 빨리, 실수 없이, 다시 찾아와서 끝내는 화면이다.

## 철학 — 결정 순서가 곧 품질이다

모든 결정은 아래 사다리를 위에서 아래로 내려온다. 아래 단이 위 단을 바꾸지 못한다.

```
1. primary task        사용자가 이 화면에서 끝내야 할 한 가지 일
2. information hierarchy  그 일에 필요한 정보의 우선순위와 노출 순서
3. interaction         그 일을 끝내는 최소 조작과 조작 모델(click / scroll / type / drag)
4. feedback            조작마다 시스템이 돌려주는 상태(loading / success / error / empty)
5. visual treatment    위 네 단을 더 잘 보이게 하는 typography · spacing · color · motion
```

**visual treatment gate.** `rounded-xl`, gradient, glassmorphism, shadow, blur, motion,
accent color 하나하나가 1–4단 중 어느 것을 돕는지 한 줄로 말할 수 있어야 한다. 말할 수
없으면 지운다. "모던해 보여서"는 근거가 아니다.

우선순위: 인지 부하 < task completion < discoverability < accessibility < responsiveness
순으로 낮추고 높인다. 이 다섯이 미적 취향보다 항상 앞선다.

## 경계

- 결제·삭제·중복 제출·권한 같은 medium/high-risk 동작의 정책은 `frontend-oracle-design`이
  소유한다. 이 skill은 그 정책을 화면으로 옮길 뿐 새로 정하지 않는다.
- 스크린샷 비교와 브라우저 QA는 `frontend-visual-qa`, 결정적 behavior test는 `test`가 맡는다.
- 기존 디자인 시스템·토큰·컴포넌트가 있으면 그것이 이긴다. 새 토큰은 기존 토큰 블록에
  추가하고 inline 값은 쓰지 않는다.
- 사용자가 소유한 디자인(Figma · 스크린샷 · design.md · 디자인 시스템 · 기존 화면)은
  **그대로 따른다**. 제3자 공개 사이트는 구조만 배우고 픽셀·카피·에셋을 복제하지 않는다.
- 사용자가 준 수치·로고·후기만 쓴다. 없으면 placeholder로 표시하고 지어내지 않는다.

## 모드 — 소스가 있으면 따르고, 없을 때만 만든다

Frame 직후 한 번 정하고 Rationale 첫 줄에 적는다. 창작은 소스가 없을 때의 마지막 수단이다.

| 모드         | 조건                                                                                                                                                     | 원칙                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fidelity** | 사용자 소유 디자인 소스가 있다(루트 `DESIGN.md` · Figma · 스크린샷 · 토큰 · 기존 화면). `DESIGN.md`가 있으면 그것이 잠긴 시스템이며 다른 소스보다 앞선다 | 소스를 값 단위로 추출해 그대로 구현한다. 소스에 없는 treatment를 추가하지 않는다. 벗어나는 건 a11y · responsive · 빠진 state뿐이며 전부 기록한다                                                  |
| **Creation** | 소스가 없다                                                                                                                                              | 사다리 순서대로 결정하고 anti-slop 규칙(아래 위임 표) 안에서만 만든다. 시각 시스템은 [`references/visual-system.md`](references/visual-system.md) 공식으로 도출한다. 빼는 게 먼저, signature 하나 |

혼합(일부 화면만 소스 있음)이면 소스 있는 부분은 Fidelity, 없는 부분은 소스의 토큰 ·
컴포넌트 · 밀도를 그대로 이어받는 Creation이다. 두 모드 모두 slop gate를 통과해야 한다.
Fidelity 절차는 [`references/fidelity.md`](references/fidelity.md).

## 위임 — 있는 스킬은 부르고, 여기서 다시 쓰지 않는다

이 skill은 순서와 판정 기준만 소유한다. 아래 관심사는 설치된 스킬에 위임하고, 없을 때만
괄호 안 fallback을 쓴다. 위임한 스킬의 출력은 decision record와 Rationale에 인용한다.
시각 시스템 도출(`references/visual-system.md`)은 위임 대상이 아니다 — 설치된 스킬이
있어도 Creation이면 항상 이 skill이 돌린다. 위임 스킬의 시각 제안은 그 위에 얹는다.

`impeccable`은 설치돼 있으면 anti-slop · 비평 · 마감의 1순위다. 이유는 취향이 아니라
결정론이다 — 규칙 61개가 모델 없이 돌아서 결과가 재현된다. 다만 경계 두 개를 지킨다.
`DESIGN.md`는 이 skill의 Fidelity 모드에서 잠긴 시스템이므로, `impeccable`이 redesign
경로에서 그것을 교체하려 하면 멈추고 사용자에게 묻는다(`NEEDS_DECISION`). 그리고
`impeccable`의 지적은 증거로 인용하되, 채택 여부는 사다리 순서로 판정한다 — 1–4단을
해치는 시각 제안은 반려하고 그 근거를 Rationale에 남긴다.

anti-slop 검사는 **CLI(`npx --yes impeccable detect`)로 돌린다.** 편집 후 자동으로 도는
플러그인 훅은 `htmlparser2` · `css-select` · `css-tree` · `domutils`를 프로젝트에서
resolve 하지 못하면 정규식 폴백으로 내려가고, 그때 **대비 계산과 선택자 매칭이 꺼진다**
(도구가 "findings are an undercount" 경고를 함께 낸다). CLI는 자기 의존성을 들고 오므로
대비까지 계산한다. 훅 결과만 보고 통과로 판정하지 않는다.

| 관심사                       | 위임 대상                                                                            | 없을 때 fallback                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Creation build 제약          | `baseline-ui` (요청 없으면 animation · gradient 없음)                                | ui-checklist + interface-rules.md                             |
| Creation anti-slop 검사      | `npx --yes impeccable detect <target>` (결정론적 규칙 61개) → 남은 건 `kill-ai-slop` | `hallmark` slop-test; 둘 다 없으면 ui-checklist § Slop gates  |
| 화면 비평 · 마감 패스        | `impeccable critique <target>` / `polish <target>`                                   | review.md 6축 + ui-checklist                                  |
| Fidelity 기존 화면 감사      | `impeccable critique` (없으면 `improve-ui`, read-only)                               | fidelity.md § Self-review                                     |
| 기존 코드에서 DESIGN.md 생성 | `impeccable document` 또는 `create-design-md`                                        | pre-flight 결과를 소스로 사용                                 |
| Creation 카피·비평 패스      | `frontend-design` (plan → critique → build, 카피 규칙)                               | ui-checklist § Copy                                           |
| Figma 소스 추출              | `figma:figma-design-to-code`                                                         | fidelity.md § 스크린샷 스냅 규칙으로 격하하고 사용자에게 알림 |
| 자기 사이트 URL 추출         | `clone-website` workflow가 레포에 있으면 그 Phase 1                                  | fidelity.md § 최소 추출                                       |
| 제3자 사이트 구조 학습       | `hallmark study` (DNA만, 픽셀 금지)                                                  | reference-study.md                                            |
| motion 검토                  | `design-motion-principles`                                                           | ui-checklist § Motion                                         |
| 위험 동작 정책               | `frontend-oracle-design`                                                             | 없으면 `NEEDS_DECISION`으로 사용자에게                        |
| 스크린샷·브라우저 QA         | `frontend-visual-qa` (명시 요청 시)                                                  | 눈으로 섹션별 비교                                            |

위임 스킬이 이 skill의 사다리 순서와 충돌하면 사다리가 이긴다. 예: `frontend-design`이
"hero는 thesis"라 해도 primary task가 폼 완료면 폼이 첫 화면이다.

## Workflow

### 0. Pre-flight — 코드를 먼저 읽는다

`package.json`, 토큰 파일(`globals.css` `:root`, `tailwind.config.*`, `tokens.json`),
기존 공용 컴포넌트(`components/ui`, `shared/ui`), motion 라이브러리, 폰트 로딩을 확인한다.
결과를 `file:line`과 함께 한 블록으로 적고 "보존 / 새로 도입"을 나눈다. 재사용 가능한
컴포넌트가 있으면 그것을 쓴다. 신호가 없으면 한 줄만 남기고 넘어간다.
컴포넌트가 없어 레지스트리(21st.dev · shadcn)를 볼 때는
[`references/reference-study.md`](references/reference-study.md) § 컴포넌트 소스의 설치
게이트를 따른다 — 기본은 참고, 설치는 역할이 비어 있는 프리미티브만이다.

### 1. Frame — 문제를 한 문장으로 고정한다

네 가지를 고정한다: **primary task**, **user & context**(기기 · 빈도 · 숙련도), **핵심 UX 문제**
(최대 3개), **성공 기준**(완료율 · 소요 시간 · 이탈 · 오류). 질문지를 던지지 않는다.
brief에서 읽히는 것은 추정으로 먼저 말하고, 결과를 가장 크게 바꾸는 **2–3개만** 묻는다.
한 라운드가 기본이고, 답이 중요한 공백을 드러낼 때만 한 라운드 더.

> 추정: task = 결제 완료 · 사용자 = 재구매 고객, 모바일 · 문제 = 주소 재입력.
> 정정할 것 있으면 알려 주세요. 두 가지만 여쭙니다:
>
> 1. 성공 기준은 완료율인가요, 소요 시간인가요?
> 2. 게스트 결제를 허용하나요?

"go ahead"면 추정대로 진행하고 답변 첫 줄에 무엇을 추정했는지 밝힌다.

### 2. Source extraction 또는 Reference study

**Fidelity**: [`references/fidelity.md`](references/fidelity.md) 절차로 소스에서 토큰 · 간격 ·
타입 · 모든 state · 조작 모델 · 반응형을 값 단위로 뽑아 extraction 표를 만든다. 추정 금지.
값을 못 읽으면 사용자에게 묻는다.

**Creation**: 도메인이 낯설거나, 조작 모델이 여러 갈래(탭 vs 스크롤, 모달 vs 페이지)로
갈릴 때만 실행한다. 같은 task를 푸는 우수 서비스 2–3개를 골라
[`references/reference-study.md`](references/reference-study.md) 절차로 **공통 패턴**과
**단일 브랜드 선택**을 분리한다. 2개 이상에서 반복되면 패턴, 1개에만 있으면 그 브랜드의
선택이다. 패턴은 채택 후보, 브랜드 선택은 채택 금지 후보다.

### 3. Decision record — 코드 전에 사다리를 채운다

[`references/decision-ladder.md`](references/decision-ladder.md)의 템플릿을 40줄 이내로
채운다. 포함: 사다리 5단, state matrix(loading / empty / error / success / partial),
responsive 계획(320 / 768 / 1280), a11y 계획(keyboard path, focus order, 이름 붙은 landmark),
그리고 **버린 대안**. Fidelity에서는 5단이 extraction 표 참조로 대체되고, gate는 "소스에
없는 treatment 추가 금지"로 바뀐다. 결정이 실제로 갈리는 지점(조작 모델, 정보 노출 범위, destructive
처리)이 있으면 그 한 가지만 사용자에게 묻는다. 나머지는 진행한다. Creation이면 5단을
채우기 전에 [`references/visual-system.md`](references/visual-system.md)로 팔레트 · 토큰 ·
타이포 · 레이아웃 패턴을 도출하고, Build에서 토큰 블록을 컴포넌트보다 먼저 방출한다.

### 4. Build — 작은 컴포넌트, 잠긴 토큰, 모든 상태

- 시맨틱 HTML과 landmark 먼저. div로 버튼을 만들지 않는다.
- 모든 interactive 요소는 default / hover / focus-visible / active / disabled / loading /
  error / success 상태를 가진다. 빠진 상태는 미완성이다.
- 토큰 블록(`:root` / `.dark`)을 컴포넌트보다 먼저 방출한다. 이후 색과 폰트는 토큰만
  참조한다. 새 값이 필요하면 토큰 블록에 이름 붙여 추가한다.
- motion은 `transform` · `opacity`만, UI 상태 변화는 200ms 이하, `prefers-reduced-motion`
  존중. 자주 쓰거나 키보드로 트리거되는 동작에는 animation을 넣지 않는다.
- 320px에서 가로 스크롤 없음, 두 theme(지원 시) 모두 확인.
- 카피는 사용자 쪽 언어로: "제출" 대신 "변경 사항 저장". 같은 동작은 흐름 내내 같은 이름.

세부 규칙은 [`references/ui-checklist.md`](references/ui-checklist.md)와 그 안에서 참조하는
[`references/interface-rules.md`](references/interface-rules.md)(Vercel 규칙 vendoring, MUST/SHOULD/NEVER).

### 5. Self-review — 두 체크리스트를 돌린다

1. [`references/ui-checklist.md`](references/ui-checklist.md) — 화면 단위 결함.
2. [`references/ux-checklist.md`](references/ux-checklist.md) — Funnel → Impression →
   Interaction → Conversion → Retention 렌즈로 개선 포인트를 찾는다.
3. [`references/review.md`](references/review.md)의 6축(Task fit · Hierarchy · States ·
   Execution · Restraint · Explainability)을 1–5로 매긴다. 3 미만이 있으면 고친 뒤 다시 매긴다.
   두 번째 pass에도 3 미만이면 brief가 틀린 것이다 — 1단계로 돌아간다.
4. Fidelity면 소스와 나란히 놓고 320 · 1280에서 섹션별 diff. 차이는 "의도한 이탈"과
   "결함"으로 나눠 기록한다. Creation이면 위임 표의 anti-slop 검사를 돌린다.
5. dev server가 있으면 스크린샷을 찍어 본다. 체크리스트 통과가 좋은 화면을 보장하지 않는다.

### 6. Rationale — 왜 이렇게 만들었는지

[`references/review.md`](references/review.md) § Rationale 템플릿으로 10줄 이내.
사다리 5단 각각의 결정 한 줄, 버린 대안 한 줄, trade-off 한 줄, 사용자 검증이 필요한
가정 한 줄. 이 블록이 없는 구현은 완료가 아니다.

### 7. User validation — 검증 방법을 넘긴다

[`references/review.md`](references/review.md) § User validation의 5초 테스트 스크립트와
task walkthrough 질문 3개, 출시 후 측정 지표(완료율 · 소요 시간 · 오류율 · 단계별 이탈)를
전달한다. 검증은 제안까지이며 실제 실행은 사용자 몫이다.

## Decision rules — 자주 갈리는 지점의 기본값

| 상황                           | 기본값                                                                  | 뒤집는 조건                            |
| ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| 정보 노출                      | primary task에 필요한 것만 기본 노출, 나머지는 progressive disclosure   | 전문가용 고빈도 도구면 밀도를 올린다   |
| 조작 모델                      | 가장 적은 단계로 task를 끝내는 모델, click 기본                         | 순차 서사·비교 탐색이면 scroll-driven  |
| Loading                        | 레이아웃을 아는 콘텐츠는 skeleton, 모르면 spinner, 1초 넘으면 진행 표시 | 되돌릴 수 있는 동작은 optimistic       |
| Empty                          | 다음 행동 CTA 하나 + 한 줄 설명, 분위기 문구 금지                       | 첫 방문 온보딩이면 예시 데이터 제안    |
| Error                          | 무엇이 · 왜 · 어떻게, 필드 옆 inline, 사과 금지                         | 전역 오류만 배너                       |
| Success                        | 결과가 화면에 보이면 조용히, 안 보이면 toast                            | 되돌리기 가능하면 undo 포함 toast      |
| Destructive                    | undo 우선, 없으면 확인 dialog, 확인 버튼에 동작 이름                    | 되돌릴 수 없는 결제·삭제는 Oracle 정책 |
| Form                           | label 위, blur 시 검증, idle 상태에서 submit 비활성화 금지              | 한 필드 form은 inline 검증             |
| Motion                         | 없음. 등장/퇴장·위치 이동만 200ms 이하 transform/opacity                | 브랜드 순간 한 곳(signature)만 허용    |
| Accent                         | 하나. primary action과 현재 위치에만                                    | 데이터 시각화 범주 색은 별도 팔레트    |
| Density                        | 사용 빈도로 결정. 온보딩 sparse, 운영 도구 dense                        | —                                      |
| Radius · shadow · blur · glass | 계층(hierarchy)이나 레이어(feedback)를 표현할 때만                      | 근거 한 줄을 못 쓰면 제거              |

## 완료 조건

- 모드가 명시됐다. Fidelity면 extraction 표와 이탈 기록이, Creation이면 anti-slop gate
  결과가 있다.
- Creation이면 토큰 블록과 anchor hue 도출 1줄(주제의 사물 → hue)이 decision record에
  있다. 기존 토큰을 쓴 경우 그 사실과 출처 파일을 적는다.
- Decision record와 Rationale이 모두 있고 서로 모순이 없다.
- UI checklist에 남은 `fail`이 없고, UX checklist에서 나온 개선 포인트가 목록으로 전달됐다.
- 6축 점수가 모두 3 이상이다.
- 프로젝트 typecheck / lint / test 실제 실행 결과를 보고했다.
- 사용자 검증 방법이 전달됐다.
