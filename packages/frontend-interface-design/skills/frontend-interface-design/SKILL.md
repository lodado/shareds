---
name: frontend-interface-design
description: Use when the user asks to design or implement a web UI, screen, flow, or component and wants it usable and well-crafted, not generic. Covers a decision ladder (primary task → hierarchy → interaction → feedback → visual), lineage-based DESIGN.md adaptation when no design source exists, exemplar-first token-only build, a scored screenshot loop (render → gates → critique → accept only improvements), Korean typography defaults, funnel-based UX review, and a written rationale. Do not use for risky behavior policy (frontend-oracle-design), screenshot verification (frontend-visual-qa), or behavior tests (test).
---

# Frontend Interface Design

**설명 가능하고 마감된** 웹 UI를 설계 · 구현하는 skill이다. 사용성은 사다리가, 특이성은 계보가,
마감은 craft 기본값과 채점 루프가 만든다. 넷은 서로 대체하지 않는다.

## 철학 — 결정 순서가 곧 품질이다

```
1. primary task        사용자가 이 화면에서 끝내야 할 한 가지 일
2. information hierarchy  그 일에 필요한 정보의 우선순위와 노출 순서
3. interaction         그 일을 끝내는 최소 조작과 조작 모델(click / scroll / type / drag)
4. feedback            조작마다 시스템이 돌려주는 상태(loading / success / error / empty)
5. visual treatment    위 네 단을 더 잘 보이게 하는 typography · spacing · color · motion
```

아래 단이 위 단을 바꾸지 못한다. **visual treatment gate**: `references/craft.md`와 프로젝트
`DESIGN.md`(계보)에 있는 treatment는 **기본값**이라 근거 없이 쓴다 — 마감은 정당화 대상이 아니다.
그 밖의 것(gradient · glass · 장식 motion · 두 번째 accent)은 1–4단 중 무엇을 돕는지 한 줄로
말할 수 있어야 하고, 말할 수 없으면 지운다. 우선순위는 인지 부하 < task completion <
discoverability < accessibility < responsiveness이며 취향보다 앞선다. 예쁨은 취향이 아니라
지각된 사용성의 지렛대(aesthetic-usability effect)라서 craft와 루프가 이 skill의 소관이다.

## 상시 규칙 12 — 항상 켜져 있고, 위가 더 단단하다

1. `DESIGN.md`가 없으면 [`references/adaptation.md`](references/adaptation.md)로 만들고 시작한다.
   있으면 그것이 잠긴 시스템이다.
2. 색 · 폰트 · radius · 그림자는 토큰만 참조한다. 컴포넌트 안의 리터럴 값은 결함이다.
3. 폰트 가족 ≤2. 한글이 있으면 한글 완비 가족(Pretendard 계열)이 본문이고
   [`references/typography-ko.md`](references/typography-ko.md)가 라틴 조언에 앞선다.
4. 색은 중립 포함 3–5개. accent는 화면 점유 ≤5%, primary action과 현재 위치에만.
5. 간격 스케일 하나(4 또는 8), 임의 값 없음. 섹션 > 그룹 > 요소 순으로 줄어든다.
6. 아이콘 세트 하나(기본 Lucide 1.5px, 16/20/24). 이모지 · 유니코드 글리프 아이콘 금지.
7. interactive 요소는 상태 8종(default · hover · focus-visible · active · disabled · loading ·
   error · success)을 가진다. 빠진 상태는 미완성이다.
8. **보지 않은 화면은 완료가 아니다.** Build 뒤 [`references/look.md`](references/look.md):
   렌더 → 게이트 → 섹션 비평 → 개선일 때만 채택, 최대 3라운드.
9. 텍스트 대비 4.5:1 · UI 3:1, 320px 가로 overflow 0, 탭 타깃 24px(모바일 44px) 이상.
10. motion은 `transform` · `opacity`만, ≤200ms ease-out. 키보드 · 고빈도 동작은 무모션,
    `prefers-reduced-motion` 존중.
11. 지어낸 수치 · 로고 · 후기 없음. 없으면 placeholder와 "확인 필요"로 표시한다.
12. 한 화면에 primary action 하나. 첫 시선이 그것 또는 기억할 요소에 간다.

## 경계

- medium/high-risk 동작(결제 · 삭제 · 중복 제출 · 권한)의 정책은 `frontend-oracle-design`이
  소유한다. 여기서는 정책을 화면으로 옮길 뿐이며, 없으면 `NEEDS_DECISION`.
- 스크린샷 **검증** · 브라우저 QA는 `frontend-visual-qa`, behavior test는 `test`가 맡는다. Look
  루프는 자기비평이고 `VERIFIED`를 발급하지 않는다.
- 사용자 소유 디자인은 그대로 따른다. 제3자 사이트는 구조만 배우고 픽셀 · 카피 · 폰트명을
  복제하지 않는다.

## 모드 — 소스가 있으면 따르고, 없으면 계보를 고른다

| 모드           | 조건                                                                     | 절차                                                                                                                           |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Fidelity**   | 사용자 소유 소스(루트 `DESIGN.md` · Figma · 스크린샷 · 토큰 · 기존 화면) | [`references/fidelity.md`](references/fidelity.md) — 값 단위로 추출해 재현. 이탈은 a11y · responsive · 빠진 state뿐, 전부 기록 |
| **Adaptation** | 소스 없음                                                                | [`references/adaptation.md`](references/adaptation.md) — 계보 6개 중 하나 → 노브 3개 → 루트 `DESIGN.md` 방출 · lint → 잠금     |

혼합이면 소스 있는 부분은 Fidelity, 없는 부분은 소스의 토큰 · 밀도를 잇는 Adaptation. Frame
직후 정하고 Rationale 첫 줄에 적는다. 계보를 두 개 섞지 않는다 — 평균이 슬롭이다.

## Workflow

0. **Pre-flight.** `package.json` · 토큰 파일 · 공용 컴포넌트 · 폰트 로딩 · 루트 `DESIGN.md` ·
   `.design/log.json`을 읽고 "보존 / 새로 도입"을 `file:line`으로 적는다. 있는 컴포넌트를 쓴다.
1. **Frame.** primary task · user & context · 핵심 UX 문제(≤3) · 성공 기준. Adaptation이면 브리프
   6칸과 체크리스트 10문항(`adaptation.md` §1). 질문은 고정 템플릿에서 최대 3개, 추정을 먼저.
2. **Source.** Fidelity는 `fidelity.md`의 extraction 표. Adaptation은 계보 → 노브 → `DESIGN.md` →
   `npx --yes @google/design.md lint` → 흔한 답 시뮬레이션 → `.design/log.json`. 조작 모델이
   갈릴 때만 [`references/reference-study.md`](references/reference-study.md)로 공통 패턴을 뽑는다.
3. **Decision record.** [`references/decision-ladder.md`](references/decision-ladder.md) 40줄 이내.
   갈리는 지점 하나만 사용자에게 묻는다.
4. **Build.** [`exemplars/`](exemplars/README.md)의 `tokens.css` · 프리미티브 · 조합을 **복사한 뒤
   DESIGN.md로 재스킨**한다. 빈 div에서 시작하지 않는다. 토큰 블록을 먼저 방출하고
   [`references/craft.md`](references/craft.md) 12개 기본값을 근거 없이 적용한다. 시맨틱 HTML ·
   landmark 먼저, 카피는 사용자 언어로. 세부는 [`references/ui-checklist.md`](references/ui-checklist.md)와
   [`references/interface-rules.md`](references/interface-rules.md).
5. **Look (필수).** [`references/look.md`](references/look.md): `node <skill>/scripts/render.mjs`로
   375 · 1280 × 테마를 렌더 → 게이트(대비 · overflow · 폰트 수 · 이모지 · 탭 타깃 · 리터럴 비율 ·
   keep-all) 먼저 통과 → 섹션별 브리프 10문항 + craft 10문항 yes/no와 수정 1줄 → 재렌더 →
   통과 수가 늘었을 때만 채택, 최대 3라운드. Playwright가 없으면 프로젝트의 브라우저 도구로
   같은 뷰포트를 찍는다 — 스크린샷 없이 넘어가지 않는다.
6. **Self-review.** `ui-checklist.md`(`fail`은 고친다) →
   [`references/ux-checklist.md`](references/ux-checklist.md)(Funnel → Retention 개선 포인트) →
   [`references/review.md`](references/review.md) 7축 yes/no. 두 번째에도 `no`면 Frame으로.
7. **Rationale.** `review.md` 템플릿 10줄. 첫 줄 `mode · lineage · loop: r<n> gates a/b checks
x/y→z/y · axes`. 없으면 완료가 아니다.
8. **User validation.** 5초 테스트 · task walkthrough · 출시 후 지표(`review.md` §3). Adaptation이면
   채택 · 반려를 `.design/log.json`에 남긴다.

## 참조 로드 — 상시는 이 파일뿐, 나머지는 단계에서 읽는다

| 단계  | 파일                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · 2 | `adaptation.md` + `lineages/<id>.md` 또는 `fidelity.md`; 필요 시 `reference-study.md`                                                         |
| 3     | `decision-ladder.md`                                                                                                                          |
| 4     | `exemplars/README.md` · `craft.md` · `typography-ko.md`(ko) · [`visual-system.md`](references/visual-system.md)(토큰 파생 공식이 필요할 때만) |
| 5     | `look.md` · `evals/gates.json`                                                                                                                |
| 6     | `ui-checklist.md` · `interface-rules.md` · `ux-checklist.md` · `review.md`                                                                    |

## 위임 — 가산이며, 없어도 이 skill만으로 완결된다

| 스킬                         | 설치돼 있으면                                                                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impeccable                   | Frame 입력으로 `impeccable init`(PRODUCT.md). Look 1단계에서 `detect`는 **browser 엔진**만 게이트에 넣는다(소스 스캔은 undercount). `critique`는 Look 2단계의 두 번째 의견, `polish`는 루프 뒤 finisher 1회. DESIGN.md 교체 시도는 `NEEDS_DECISION` |
| `figma:figma-design-to-code` | Fidelity의 Figma 추출. 없으면 `fidelity.md` § 스냅 규칙으로 격하하고 알린다                                                                                                                                                                         |
| oracle · visual-qa · test    | 경계 절대로. 없으면 `NEEDS_DECISION`으로 사용자에게                                                                                                                                                                                                 |

위임 스킬의 시각 제안은 Look 루프의 채택 규칙(통과 수가 늘 때만)으로만 들어온다. 상시 규칙 ·
사다리와 충돌하면 이 skill이 이긴다.

## 완료 조건

- 모드가 명시됐다. Fidelity면 extraction 표 · 이탈 기록, Adaptation이면 계보 · 노브 3개 ·
  `DESIGN.md` lint 결과 · 흔한 답 vs 갈림이 decision record에 있다.
- 토큰 블록이 먼저 있고 `render.mjs --source` 리터럴 비율 ≤0.1이다.
- `design-loop/r<n>/`(스크린샷 · metrics · critique)이 있고 게이트를 통과했다.
- Decision record · Rationale(`loop:` 줄 포함)이 있고 모순이 없다. 7축 모두 `yes`.
- ui-checklist에 `fail`이 없고, ux-checklist 개선 포인트가 목록으로, 사용자 검증 방법이 전달됐다.
- 프로젝트 typecheck / lint / test 실제 실행 결과를 보고했다.
