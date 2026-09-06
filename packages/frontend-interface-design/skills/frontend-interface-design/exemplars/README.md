# Exemplars — 복사한 뒤 DESIGN.md로 재스킨한다

zero-shot 생성 대신 여기서 시작한다. 파일은 전부 정적 HTML + `tokens.css`라 브라우저에서 바로
열리고 `scripts/render.mjs`로 렌더 · 측정된다. 프레임워크로 옮길 때는 **구조 · 상태 · 토큰
참조**를 옮기고 클래스 이름은 프로젝트 관례를 따른다.

조합(compositions)은 계보의 실제 레퍼런스 **밀도와 마감**을 기준으로 만들었다. 구조와 밀도만
배웠고 브랜드 자산 · 카피 · 폰트명은 가져오지 않았다. 각 파일의 상단 주석이 어떤 원칙을 따르는지
적는다.

| 파일                               | 계보 · 레퍼런스 밀도                                 | 보여주는 craft                                                                                                       |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`                       | 공통                                                 | 노브 3개(`--h` · chroma · radius)로 전체가 바뀐다 · 표면 사다리 · hairline · soft 상태색 · 아이콘 · 아바타(hue 파생) |
| `primitives/button.html`           | 공통                                                 | 변형 4 · 크기 3 · 상태 8종 · 광학 정렬 · scale(0.97) · 로딩 중 라벨 유지                                             |
| `primitives/input.html`            | 공통                                                 | 라벨 위 · 힌트 · 오류 inline · border-width 고정(강조는 shadow) · 16px · tabular                                     |
| `primitives/card.html`             | 공통                                                 | 그림자 또는 border 하나 · radius 중첩 · 상태 형태                                                                    |
| `primitives/table-row.html`        | 공통                                                 | sticky 헤더 · 좌/우 정렬 · hairline · 형태+색+텍스트 상태 · 밀도 토글                                                |
| `primitives/dialog.html`           | 공통                                                 | 네이티브 `<dialog>` · modal 그림자 단 · 0.98에서 등장 · 동작 이름 버튼                                               |
| `compositions/app-shell.html`      | precision-tool · Linear류 이슈 목록 + 상세           | 13px · 28px nav 행 · 36px 목록 행 · 그룹 헤더 · 우선순위 글리프 · 라벨 pill · 아바타 · 속성 패널 · 활동 · 댓글       |
| `compositions/marketing-hero.html` | editorial-marketing · Stripe/Linear류 마케팅         | 제품 mock이 주인공(KPI · 차트 · 표 · 토스트) · 6/6 hero · 사실 띠 · 번갈아 기능 3 · 단계 · 가격 2 · CTA · footer     |
| `compositions/fintech-home.html`   | consumer-fintech-ko · Toss류 모바일 홈(hue 250 노브) | 금액 hero · 액션 타일 4 · 8px 띠 · 60px 행 + 송금 버튼 · 소비 막대 · 프로모 · 하단 탭                                |

## 사용 절차

1. 계보와 노브가 정해졌으면(`references/adaptation.md`) `tokens.css`를 프로젝트 토큰 파일에
   복사하고 `--h` · `--c-accent` · `--c-tint` · `--radius` · `--row-h` · 폰트 스택만 바꾼다.
   `fintech-home.html`이 그 예다 — 파일 안 `:root`에서 노브만 바꿨다.
2. 필요한 프리미티브 · 조합을 복사한다. **구조와 밀도와 상태는 유지**하고 카피 · 데이터 · 열을
   바꾼다. 아이콘은 파일 상단의 `<symbol>` 스프라이트처럼 한 세트로 둔다.
3. 컴포넌트 안에 남은 리터럴 값이 없는지 `scripts/render.mjs --source`로 확인한다.
4. `references/look.md` 루프를 돈다. 이 파일들도 그 루프로 만들었다(r1 → 발견 → r2).

## 레퍼런스에서 배운 것 (구조 · 밀도만)

- **Linear류 도구**: 깊이는 그림자가 아니라 표면 사다리(canvas → surface-1 → card)와 hairline로.
  13px 본문, 4px 스케일, 아이콘 16px 1.5px, 아바타 20px, 라벨은 점 + pill, 우선순위는 막대 글리프.
  제품 화면이 마케팅의 주인공이다. 이니셜 아바타 · 기관 마크는 흰 글자 on 채움(4.5:1 미달)이 아니라
  hue에서 soft 배경 + 진한 잉크를 파생한다(`oklch(from … 92% 0.05 h)` / `40% 0.12 h`).
- **Stripe류 마케팅**: 단일 CTA 색, 큰 display에 좁은 자간, 숫자는 tabular, 제품 mock은 12–16px
  radius 프레임 + 은은한 틴트 그림자, 섹션 96–128px, 카드 대신 hairline 띠.
- **Toss류 소비자 금융**: 375px 기준 한 화면 한 메시지, 금액이 주인공(32–34px 700 tnum), 섹션은
  8px 띠, 행 56–64px에 행 단위 액션, accent는 기능(송금 · 선택 · 진행)에만, pill은 작은 컨트롤만.

## 프레임워크로 옮길 때

- React + Tailwind: `tokens.css`의 변수를 `@theme` 또는 `tailwind.config` `extend`에 매핑한다
  (shadcn 이름이라 그대로 붙는다). 클래스는 `bg-primary text-primary-foreground`처럼 토큰만.
- CSS-in-JS: 변수 참조(`var(--primary)`)를 그대로 쓴다. 값을 JS 상수로 복제하지 않는다.
- 상태 8종(default · hover · focus-visible · active · disabled · loading · error · success)은
  프레임워크 컴포넌트에서도 전부 구현한다. 빠진 상태는 미완성이다.

## 이 파일들이 아닌 것

- 완성 디자인이 아니다. 계보 · 노브 없이 그대로 쓰면 자리표시자 hue의 화면이 나온다.
- 컴포넌트 라이브러리가 아니다. 프로젝트에 이미 `components/ui`가 있으면 그것을 쓴다.
- 데모 데이터다. 실제 프로젝트에서는 사용자의 실제 수치 · 로고 · 후기만 쓴다.
