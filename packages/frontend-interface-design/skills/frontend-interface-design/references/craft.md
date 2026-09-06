# Craft — plain을 refined로 만드는 12개 기본값

절제(restraint)는 노이즈를 없애고, craft는 마감을 더한다. 둘은 다른 일이다. 이 파일의 항목은
**기본값**이다 — 사다리 근거를 대지 않아도 쓴다. 계보 `DESIGN.md`가 다른 값을 정했으면 그것이
이긴다. 수치는 출처에서 왔고 어휘가 아니라 코드다: "tinted neutral"을 아는 것과 쓰는 것은
다르다.

모든 값은 토큰으로 방출한다. 컴포넌트 안의 리터럴은 결함이다. 토큰 이름은 shadcn 어휘
(`--background` `--foreground` `--card` `--muted` `--accent` `--border` `--ring` `--radius`)를
따르고, 여기 없는 것만 아래 이름으로 추가한다.

## 1. 중립색은 anchor hue로 틴트한다

순수 `#000` · `#fff` · 무채색 회색(`#6b7280`류)은 쓰지 않는다. 배경 · 본문 · 회색 단계 · border
전부 anchor hue를 조금 담는다. chroma 최소 0.005, 중간 단계에서 최대(양 끝의 2–3배).

```css
:root {
  --h: 250; /* anchor hue — DESIGN.md가 정한다 */
  --background: oklch(98% 0.006 var(--h));
  --foreground: oklch(18% 0.014 var(--h));
  --muted: oklch(95% 0.01 var(--h));
  --muted-foreground: oklch(48% 0.024 var(--h)); /* 4.5:1 이상인지 metrics로 확인 */
  --border: oklch(88% 0.012 var(--h));
}
```

출처: Refactoring UI "Greys don't have to be grey" · hallmark Gate 22(chroma ≥0.005).

## 2. 그림자는 층으로, 광원은 하나, 색은 틴트

raised · overlay · modal 3단만. 단이 오를수록 offset과 blur는 2배씩 커지고 알파는 거의 그대로.
검정 대신 배경 hue로 틴트한 어두운 색을 쓴다. 0-offset 컬러 halo(glow)는 장식이다.

```css
:root {
  --shadow-color: oklch(30% 0.03 var(--h) / 0.08);
  --shadow-raised: 0 1px 2px var(--shadow-color), 0 2px 4px var(--shadow-color);
  --shadow-overlay: 0 2px 4px var(--shadow-color), 0 8px 16px var(--shadow-color);
  --shadow-modal: 0 4px 8px var(--shadow-color), 0 16px 32px var(--shadow-color), 0 32px 64px var(--shadow-color);
}
```

출처: Josh Comeau "Designing Beautiful Shadows" · Refactoring UI "Shadows can have two parts".

## 3. 구분 수단의 순서 — 간격 > 배경 > 그림자 > border

border는 마지막 수단이다. 남긴 border는 알파 hairline으로 두고 배경 대비 3:1(UI 요소 기준)을
지킨다. elevation은 한 번만 선언한다 — 1px border 아래 넓은 soft shadow는 "ghost card"다.

```css
.card {
  background: var(--card);
  box-shadow: var(--shadow-raised); /* border 없음 */
}
.list > li + li {
  border-top: 1px solid color-mix(in oklch, var(--foreground) 10%, transparent); /* hairline */
}
```

출처: Refactoring UI "Use fewer borders" · Vercel WIG "semi-transparent borders + shadows" ·
Impeccable craft-floor(ghost card).

## 4. 브라우저 표면도 디자인이다

focus ring · 텍스트 선택 · caret · 스크롤바 · underline offset은 그리지 않아도 화면에 있다.
전부 팔레트 토큰으로 바꾼다. "조립된 페이지와 만들어진 페이지를 가르는 가장 싼 신호"다.

```css
:root {
  --ring: oklch(60% 0.16 var(--h));
}
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
::selection {
  background: oklch(from var(--ring) l c h / 0.25);
}
html {
  caret-color: var(--ring);
  accent-color: var(--ring);
  scrollbar-color: color-mix(in oklch, var(--foreground) 25%, transparent) transparent;
}
a {
  text-underline-offset: 0.18em;
  text-decoration-thickness: 1px;
}
```

출처: Impeccable craft-floor "Browser surfaces" · Vercel WIG.

## 5. 타이포 대비는 극단으로, tracking은 display에만

display는 무게 · 크기 · tracking으로 본문과 확실히 갈린다. 400×600은 기본값으로 읽히고
400×800은 의도로 읽힌다. tracking은 display −0.02em, 본문 0. 한국어는
[`typography-ko.md`](typography-ko.md)가 우선한다.

```css
h1 {
  font-size: clamp(2rem, 1.2rem + 3vw, 3.5rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
p {
  font-size: 1rem;
  line-height: 1.6;
  max-width: 65ch;
  text-wrap: pretty;
}
```

출처: Refactoring UI 타입 스케일 · Impeccable craft-floor(tracking floor) · toss.im(−0.02em).

## 6. 숫자는 tabular, 제목은 balance, 본문은 pretty

```css
.num,
td,
time {
  font-variant-numeric: tabular-nums;
}
```

출처: Vercel WIG · ui-skills.

## 7. radius는 중첩 규칙으로 — 안쪽 ≤ 바깥쪽, 동심

```css
:root {
  --radius: 0.5rem; /* 밀도가 정한다: 도구 0.25–0.375 · 콘텐츠 0.5–0.75 · 각진 브랜드 0 */
}
.card {
  border-radius: var(--radius);
  padding: 1rem;
}
.card > .thumb {
  border-radius: calc(var(--radius) - 1rem); /* 부모 radius − 부모 padding, 0 이하면 0 */
}
```

출처: Vercel WIG "Nested radii" · kill-ai-slop "corners that don't nest".

## 8. 피드백 모션 — 120–200ms ease-out, 키보드 · 고빈도 동작은 무모션

hover · pressed는 즉시성이 핵심이다. `transform` · `opacity`만, `transition: all` 금지,
`ease-in` 금지, 등장 애니메이션은 0.9 이상에서 시작. 하루 100번 쓰는 동작(단축키 · 팔레트
토글)은 애니메이션이 없다. reduced-motion은 "적고 부드럽게"이지 0이 아니다.

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
.button {
  transition: background-color 140ms var(--ease-out), transform 140ms var(--ease-out);
}
.button:active {
  transform: scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  .button {
    transition-duration: 1ms;
  }
}
```

출처: Emil Kowalski(버튼 100–160ms · "Never ease-in on UI" · 100+회/일 → 없음) · Vercel WIG.

## 9. 밀도 모드와 간격 스케일 하나

간격은 4 또는 8 기반 스케일 하나만: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. 섹션 96 · 그룹 32 ·
요소 12처럼 **층마다 다른 값**을 쓴다. 같은 gap이 화면 전체에 반복되면 위계가 없다. 행 높이는
밀도 옵션으로 40 · 48 · 56.

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;
  --row-h: 48px; /* dense 40 · comfortable 48 · spacious 56 */
}
```

출처: Refactoring UI 간격 스케일(인접 값 ≥25% 차이) · Impeccable craft-floor "Spacing".

## 10. 아이콘 시스템 하나

한 세트만 쓴다. 기본값 Lucide, stroke 1.5px, 크기 16 · 20 · 24만, `currentColor`. 이모지 ·
유니코드 글리프(→ ✓ ★) · 세트가 섞인 아이콘은 결함이다. 아이콘 옆 텍스트와 광학 정렬한다
(아이콘을 1px 내린다).

```css
.icon {
  width: 20px;
  height: 20px;
  stroke-width: 1.5;
  flex: none;
  translate: 0 1px;
}
```

출처: v0 "typically 16px, 20px, or 24px" · Impeccable refuse list(glyph icons) · Vercel WIG
"Balance icon/text lockups".

## 11. empty · table · form 레시피

- **empty**: 한 줄 설명 + 다음 행동 CTA 하나. 회색 일러스트 + "데이터 없음"만 두지 않는다.
- **table**: 텍스트 좌정렬 · 숫자 우정렬 + tabular · 행 높이 `--row-h` · 구분선 hairline ·
  헤더는 `--muted-foreground` 500 · 정렬 기본값 명시 · sticky 헤더.
- **form**: label 위 · 필수 표시 · 형식 요구는 에러 전에 · blur 검증 · 에러는 필드 옆 `aria-describedby` ·
  상태 변화 시 border-width 고정(outline · background로) · submit은 idle에서 활성.

구조와 상태 8종이 들어간 실물은 [`../exemplars/`](../exemplars/README.md)에 있다. 복사한 뒤
`DESIGN.md`로 재스킨한다.

## 12. 브랜드 순간은 하나

기억에 남을 요소를 **하나** 고르고 그 하나에만 대담함을 쓴다 — 나머지는 조용히. 두 개면 둘 다
잡음이다. 무엇인지 · 사다리 어느 단을 돕는지 · 왜 기억에 남는지 3줄을 decision record에 적는다.

출처: Anthropic frontend-design v3 "Spend your boldness in one place" · 현행 signature 규칙.

## 이 파일이 하지 않는 것

- 방향(어떤 계보 · 어떤 hue · 어떤 페어링)을 고르지 않는다 — [`adaptation.md`](adaptation.md).
- 금지 목록을 두지 않는다 — 클리셰 탐지는 `evals/gates.json`과 `impeccable detect`가 맡는다.
- 사다리 1–4단(task · hierarchy · interaction · feedback)을 바꾸지 않는다.
