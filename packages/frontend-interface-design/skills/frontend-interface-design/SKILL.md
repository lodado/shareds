---
name: frontend-interface-design
description: 'Design and apply coherent web UI/UX and motion in the agreed format. Clarify journeys, brand and references; compose section-level sources and verify actual experience. Preserve approved scope. Not for risky behavior policy or independent QA.'
---

# Frontend Interface Design

**질문으로 의도를 맞추고, 실제 시각 대안을 비교하고, UI·UX·모션을 함께 완성하는** skill이다.
원샷은 질문 0회가 아니라 **브리프와 방향 합의 뒤 중간 선택을 떠넘기지 않고 완성**하는 것이다.
전체 스타일은 공유하되 각 섹션을 하나의 템플릿에 종속시키지 않는다. 결과 형식·적용 위치를 먼저 합의하며
코드 구현을 자동 목표로 바꾸지 않는다. 기술 작업과 권한은 기존 환경 규칙을 따른다.

## 철학 — 결정 순서가 곧 품질이다

```
1. primary task        사용자가 이 화면에서 끝내야 할 한 가지 일
2. information hierarchy  그 일에 필요한 정보의 우선순위와 노출 순서
3. interaction         그 일을 끝내는 최소 조작과 조작 모델(click / scroll / type / drag)
4. feedback            조작마다 시스템이 돌려주는 상태(loading / success / error / empty)
5. visual treatment    위 네 단과 브랜드 표현을 조율하는 typography · spacing · color
   motion              2–5단의 정보 설명·조작 피드백·브랜드 표현과 함께 설계
```

시각 처리와 모션은 핵심 작업·접근성·읽기를 해치지 않으며 정보 이해·조작·합의된 브랜드 표현에
연결한다. 마감은 생략하지 않는다. `references/craft.md`와 프로젝트 `DESIGN.md`는 기본값이고
관측된 레퍼런스와 승인 기준을 우선한다.

## 상시 규칙 12 — 코드 규칙은 코드 산출물에, 디자인 기준은 모든 결과물에

1. 사용자 소유 소스 또는 잠긴 `DESIGN.md`의 보존 범위는 **Fidelity**가 먼저다. 명시적인 재디자인은
   승인된 범위만 바꾼다. 새 방향이 필요한 곳에서만
   브랜드 지목을 [reference-pack.md](references/reference-pack.md)로 처리하고,
   소스도 팩도 없으면 [adaptation.md](references/adaptation.md)로 시작한다.
2. 색 · 폰트 · radius · 그림자는 토큰만 참조한다. 컴포넌트 안의 리터럴 값은 결함이다.
3. 폰트 가족 ≤2. 한글이 있으면 한글 완비 가족(Pretendard 계열)이 본문이고
   [typography-ko.md](references/typography-ko.md)가 라틴 조언에 앞선다.
4. 색은 hue 가족 3–5(중립 포함). accent는 화면 점유 ≤5%, primary action과 현재 위치에만.
   관측된 팩이 다른 것을 말하면 팩이 이긴다([one-shot.md](references/one-shot.md) §1 · §6).
5. 간격 스케일 하나(4 또는 8), 임의 값 없음. 섹션 > 그룹 > 요소 순으로 줄어든다.
6. 아이콘 세트 하나(기본 Lucide 1.5px, 16/20/24). 이모지 · 유니코드 글리프 아이콘 금지.
7. interactive 요소는 그 역할에 필요한 상태를 전부 가진다(버튼: default · hover · focus-visible ·
   active · disabled · loading; 입력: + error; 목록: loading · empty · error). 역할별 표는
   [one-shot.md](references/one-shot.md) §5. 빠진 상태는 미완성이다.
8. **보지 않은 화면은 완료가 아니다.** Build 뒤 [look.md](references/look.md):
   렌더 → 게이트 → 원본/승인 보드와 비교 → 근거 있는 개선만 채택. 비교 근거 없는 자기 승인으로 확장하지 않는다.
   첫 렌더 1회 + 보수 최대 2회.
9. 텍스트 대비 4.5:1 · UI 3:1, 320px 가로 overflow 0, 탭 타깃 24px(모바일 44px) 이상.
10. 일반 조작 피드백의 motion 기본값은 `transform` · `opacity`, ≤200ms ease-out을 기본으로 하되 키보드·고빈도
    조작을 지연시키지 않는다. 브랜드 연출·영상·스크롤 시간축은 역할에 맞게 별도 설계한다.
    `prefers-reduced-motion` 대안과 일반 설정을 각각 검토한다. 재현은 관측값·접근성 우선순위를 따른다.
11. 지어낸 수치 · 로고 · 후기 없음. 필수 콘텐츠가 없으면 질문한다. 명시적으로 허용한 시안용
    placeholder는 "확인 필요"로 표시하고 실제 콘텐츠가 완성됐다고 보고하지 않는다.
    **브랜드 이름은 증거가 아니다** — 관측한 팩이 없으면 "재현이 아니다"고 먼저 말한다.
12. 한 화면에 primary action 하나. 첫 시선이 그것 또는 기억할 요소에 간다.

## 경계

- medium/high-risk 동작(결제 · 삭제 · 중복 제출 · 권한)의 정책은 `frontend-oracle-design`이
  소유한다. 여기서는 정책을 화면으로 옮길 뿐이며, 없으면 `NEEDS_DECISION`.
- 스크린샷 **검증** · 브라우저 QA는 `frontend-visual-qa`, behavior test는 `test`가 맡는다. Look
  루프는 자기비평이고 `VERIFIED`를 발급하지 않는다.
- 사용자 소유 디자인은 그대로 따른다. 제3자 사이트의 패턴은 참고하되 무단 자산 · 코드 복제는
  하지 않는다. 사용 권한이나 라이선스가 허용하는 재사용은 출처 · 버전 · 의무를 기록한다.

## 모드 — 소스가 있으면 따르고, 레퍼런스가 있으면 관측하고, 없으면 계보를 고른다

| 모드                   | 조건                                                                     | 절차                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Fidelity**           | 사용자 소유 소스(루트 `DESIGN.md` · Figma · 스크린샷 · 토큰 · 기존 화면) | [fidelity.md](references/fidelity.md) — 값 단위로 추출해 재현. 이탈은 a11y · responsive · 빠진 state뿐, 전부 기록           |
| **Reference-informed** | 사용자가 브랜드를 지목("오늘의집처럼") — 팩 있음                         | [reference-pack.md](references/reference-pack.md) — `pack.mjs --route`로 팩 · scope 판정, 관측값이 계보 기본값을 이긴다     |
| **Adaptation**         | 소스도 팩도 없음                                                         | [adaptation.md](references/adaptation.md) — 브리프 · 무드보드 방향 확정 → 계보 기본값 조정 → `DESIGN.md` 방출 · lint → 잠금 |

혼합이면 보존 범위는 Fidelity, 새 부분은 승인된 스타일을 잇는 Adaptation이다.
최종 시각 시스템은 하나, 섹션 구성의 출처는 여러 개다. 준비/실행은 모드와 별개이며,
유효한 승인과 실행 요청이 있으면 재인터뷰하지 않는다. 질문·위임 경계는
[one-shot.md](references/one-shot.md)를 따른다.

## Workflow

실제 URL·기존 화면·스크린샷을 충실히 재현하는 요청은 Fidelity에서
[reference-rebuild.md](references/reference-rebuild.md)를 함께 읽는다.
제3자 URL도 이 경로를 쓰되 소유 소스·계약과 자산 권리를 보존한다. 브랜드 이름만이면 기존 팩 경로다.

0. **Pre-flight.** 지정 원본 · 디자인 시스템 · 실제 콘텐츠 · 대상 파일/프레임과 도구의 읽기/쓰기
   접근을 확인한다. 코드 작업이면 `package.json` · 토큰 · 공용 컴포넌트 · `DESIGN.md`도 읽는다.
   관찰한 구현을 승인된 정책으로 취급하지 않는다. 기존 PRD는 다시 쓰지 않고 디자인 결정의 누락만 찾는다.
1. **Frame / Discovery.** [discovery.md](references/discovery.md)로 중요한 미확정 결정을
   질문한다. [brand-intake.md](references/brand-intake.md)에서 브랜드 원본·자산·토큰과
   누락 처리 방식을 함께 확인한다. 출력 형식·위치·편집 가능 범위·위임까지 짧은 브리프로 합의한다.
   [experience-design.md](references/experience-design.md)로 핵심 여정·퍼널별 목표·재방문 가치와
   기존 경험의 유지/재해석/삭제 범위를 연결한다. 콘텐츠 교체는 인터랙션 일괄 삭제 권한이 아니다.
2. **Source / Art direction.** 브랜드 지목은 `node <skill>/scripts/pack.mjs --route "<발화>" --task "<확정된 task>"`와
   [reference-pack.md](references/reference-pack.md), Fidelity는 `fidelity.md`의 extraction 표를
   쓴다. 새 방향이 필요하면 [art-direction.md](references/art-direction.md)로 실제 콘텐츠를
   넣은 무드보드 대안을 보여주고 하나를 추천한다. 사용자 선택 또는 명시적 위임으로 방향을 정한다.
   명확한 방향은 기존 자료로 확인한다. 코드 작업은 `DESIGN.md` 방출 · lint · `.design/log.json`을 쓴다.
   [reference-sources.md](references/reference-sources.md)의 관측 가능한 레퍼런스와 설치된 전문 스킬을
   기억 속 템플릿보다 우선 활용한다. 문서 열람과 실제 화면 확인은 구분한다.
   실제 사이트 기반 재디자인은 제품 수정 전에 진입·대기·스크롤·대표 조작을 관측한다.
   토큰 명세로 미관측 모션을 없다고 가정하지 않으며 접근 불가 범위는 명시한다.
   새 구도·어려운 시그니처·시각 반려에는 [clone-study.md](references/clone-study.md)의 `$clone-website`
   대표 구간 연구를 우선 검토한다. 실제 계약과 위임 범위에서 관측·재현·콘텐츠 치환을 비교하며 전체 클론을 강제하지 않는다.
3. **Compose / Decision record.** [section-composition.md](references/section-composition.md):
   먼저 섹션 역할 · 실제 내용 · 관계를 정리하고 여러 레퍼런스 · 템플릿 · 사용 가능한 MCP 후보를
   비교한다. 레퍼런스를 응용할 때는 [reference-study.md](references/reference-study.md)의
   원본 구간 → 보존할 관계 → 실콘텐츠 대표 구간 → 나란히 비교를 거쳐 주 구성을 선택한다.
   [decision-ladder.md](references/decision-ladder.md) 40줄 이내 요약에 브리프 · 선택 보드 ·
   출처 기록을 연결한다. 섹션별 디자인 선택은 위임 범위에서 직접 끝낸다. 화면 구현·지시는 [section-implementation.md](references/section-implementation.md)로 구체화한다.
4. **Apply / Build.** 대표 구간의 실제 콘텐츠·구성·조형·핵심 동작을 먼저 시험하고, [form-quality.md](references/form-quality.md)로 확장 여부를 판단한다.
   합의된 편집 환경·위치에 전체 대상 섹션의 구도와 실제 콘텐츠를 배치하고
   세부를 마감한다. 편집 가능한 결과는 기존 컴포넌트·스타일·변수·레이아웃 규칙을 활용한다.
   요구한 편집본을 스크린샷 한 장이나 다른 출력 형식으로 몰래 대체하지 않는다.
   코드 작업은 기존 토큰·컴포넌트를 재사용하고 토큰 블록·시맨틱 HTML·landmark를 확정한다.
   [craft.md](references/craft.md) · [ui-checklist.md](references/ui-checklist.md) ·
   [interface-rules.md](references/interface-rules.md)는 해당 산출물에 맞는 기준만 적용한다.
5. **Look (필수).** [look.md](references/look.md): 실제 적용 결과를 전체/부분으로 연다.
   코드 작업은 `node <skill>/scripts/render.mjs`로 375 · 1280 × 테마를 렌더하고 측정 게이트를 검사한다.
   정적 렌더와 별개로 experience-design.md의 대표 여정·일반 모션·축소 모션을 실행 확인한다.
   디자인/프로토타입은 합의된 화면·상태·크기의 편집 환경 미리보기를 확인한다. DOM/실행 상태를
   확인하지 못했다면 그 한계를 남기고 코드 검사 통과라고 하지 않는다. 역할·브랜드·전체 조화를
   검토하고 첫 렌더 1회 + 보수 최대 2회 안에서 보정한다. 코드의 하드 게이트 · 치명적 무퇴행 ·
   진전 채택 규칙은 유지한다. 보지 못한 결과는 완료가 아니라 미검증 산출물이다.
6. **Self-review.** [form-quality.md](references/form-quality.md)로 구성·조형을 검토하고 선택한 무드보드와 실제 전체 화면을 비교한다. 섹션 역할 · 전체 조화 · 모바일
   위계를 따로 점검한다. `ui-checklist.md`(`fail`은 고친다) →
   [ux-checklist.md](references/ux-checklist.md)(Funnel → Retention 개선 포인트) →
   [review.md](references/review.md) 7축의 비교 근거·미검토 범위. 구성 문제는 해당 섹션 선택으로 되돌리되
   미세 조정은 Look 보정 예산 안에서 수정한다. 핵심 경험 해석 실패는 실패로 기록하고 영향받은
   결정으로 돌아간다. 미해결을 완료로 바꾸거나 전체 절차를 무한 재시작하지 않는다.
7. **Rationale.** `review.md` 템플릿 10줄. 코드면 실제 `loop:`·측정 범위, 디자인이면 적용 프레임·
   확인 상태·보정 기록을 적고 비교 근거를 연결한다. 기술/디자인/사용자 판정은 분리하며 미실행 수치를 채우지 않는다.
8. **Deliver / User validation.** 완성 UI · 실제 확인한 화면을 먼저 보여준다. 이어 방향 · 섹션별 출처와
   선택 이유 · 조정한 요소 · 남은 결함과 미적용 범위를 간결히 적는다. 5초 테스트 · task walkthrough ·
   출시 후 지표(`review.md` §3)는 별도 사용자 검증 방법이지 수행했다고 가정하지 않는다.
   실제 받은 채택 · 반려만 `.design/log.json`에 남긴다.

## 참조 로드 — 상시는 이 파일뿐, 나머지는 단계에서 읽는다

| 단계  | 파일                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상시  | `one-shot.md`(우선순위 · 질문/위임 · 상태 범위)만 짧게                                                                                                                           |
| 1     | `discovery.md` · `brand-intake.md`; `design-input-template.md`는 선택형 자료 전달                                                                                                |
| 2     | `art-direction.md` — 새 디자인 방향을 정할 때                                                                                                                                    |
| 1 · 2 | 브랜드를 지목했으면 `reference-pack.md`; 아니면 `adaptation.md` + `lineages/<id>.md` 또는 `fidelity.md`; 필요 시 `reference-study.md`                                            |
| 3     | `section-composition.md` · `reference-study.md`(레퍼런스 응용) · `decision-ladder.md`                                                                                            |
| 4     | `exemplars/README.md` · `form-quality.md`(새 UI·시각 반려) · `craft.md` · `typography-ko.md`(ko) · [visual-system.md](references/visual-system.md)(토큰 파생 공식이 필요할 때만) |
| 5     | `look.md` · `evals/gates.json`                                                                                                                                                   |
| 6     | `ui-checklist.md` · `interface-rules.md` · `ux-checklist.md` · `review.md`                                                                                                       |

## 위임 — 가산이며, 없어도 이 skill만으로 완결된다

| 스킬                         | 설치돼 있으면                                                                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impeccable                   | Frame 입력으로 `impeccable init`(PRODUCT.md). Look 1단계에서 `detect`는 **browser 엔진**만 게이트에 넣는다(소스 스캔은 undercount). `critique`는 Look 2단계의 두 번째 의견, `polish`는 루프 뒤 finisher 1회. DESIGN.md 교체 시도는 `NEEDS_DECISION` |
| `figma:figma-design-to-code` | Fidelity의 Figma 추출. 없으면 `fidelity.md` § 스냅 규칙으로 격하하고 알린다                                                                                                                                                                         |
| oracle · visual-qa · test    | 소유 경계를 지킨다. 필요한 정책/권한 결정이 미확정일 때만 `NEEDS_DECISION`. 선택적 검증 도구가 없으면 자체 검사를 진행하고 미수행 범위를 보고하며 위임 검증을 주장하지 않는다.                                                                      |

hallmark 등 전문 스킬은 실제 설치본의 계약을 확인해 역할에 맞게 활용한다(`reference-sources.md`).
위임 제안도 Look의 비교 근거로 채택한다. 도구 호출·기본값 적용·검사 통과 수는 시각적 채택 근거가 아니다.

## 완료 조건

수정안 채택과 납품 가능 판정은 다르다. 기술 통과·디자인 자기검토·사용자 수락을 `look.md`대로 분리한다.
와이어프레임을 요청하지 않았다면 실제 콘텐츠의 정적 구성을 먼저 완성하고 핵심 구성 결함을 해결한다.
정적 우선은 정적 종료가 아니다. [experience-design.md](references/experience-design.md)의
여정·핵심 특징 대응·일반/축소 모션 근거를 함께 기록한다. 요구된 핵심 경험 누락은 미완성이다.

- 브리프의 목적·필수 내용·브랜드 처리·시각 방향·출력 범위가 확정됐고 실행 요청/위임 근거가 있다.
- 기준 원본·버전, 브랜드 자산/토큰·예외, 섹션별 출처·조정·실제 적용 위치가 연결돼 있다.
- 새 방향이면 실제 무드보드 또는 작은 시각 견본을 열람한 `board-viewed: yes`와 미리보기·반응형
  증거가 있다. 명확한 기존 방향은 실제 확인한 소스로 대체한다. code-only·미열람은 완료가 아니다.
- 합의된 화면·상태·크기·편집 가능 범위가 해당 위치에 적용됐다. 도구 부재로 다른 형식을 낸 것은
  동등한 완료가 아니다. 제한·미적용 범위를 밝힌다.
- 코드 산출물은 기존 검사 계약을 유지한다: Fidelity extraction/이탈 또는 Adaptation의 `DESIGN.md`
  lint·계보/노브 기록, 토큰 우선·`render.mjs --source` 리터럴 비율 ≤0.1, `design-loop/r<n>/`의
  스크린샷·metrics·critique와 게이트 통과, Rationale `loop:`·7축·프로젝트 typecheck/lint/test 결과.
- 디자인 산출물은 실제 편집 요소·스타일/변수·합의된 상태와 크기를 미리보기에서 확인하고,
  디자인에 적용 가능한 기준의 결과와 측정 불가 항목을 기록한다. 코드 테스트 성공으로 대체하지 않는다.
- 별도 사용자 검증은 미수행이면 그렇게 밝힌다. 피드백은 [review.md](references/review.md)에서
  기존 기준 위반·새 요구·모호한 불만으로 구분하고 영향 범위만 반영한다.
