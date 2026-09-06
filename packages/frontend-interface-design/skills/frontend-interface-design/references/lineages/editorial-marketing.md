---
version: alpha
name: editorial-marketing
description: '제품 소개 · 랜딩의 계보. 첫 화면은 논지(thesis) 하나 — 헤드라인 · 제품 화면 · 숫자 중 하나가 주인이다. 큰 display와 넓은 여백, 12열 비대칭 그리드, 카드 대신 hairline 섹션. accent 하나, 사진 · 제품 화면은 hairline 프레임. 기본 hue 340은 자리표시자다 — adaptation.md ①로 반드시 교체한다.'
colors:
  primary: 'oklch(48% 0.19 340)'
  primary-hover: 'oklch(43% 0.2 340)'
  on-primary: 'oklch(99% 0.004 340)'
  background: 'oklch(99% 0.004 340)'
  foreground: 'oklch(17% 0.016 340)'
  muted: 'oklch(96% 0.008 340)'
  muted-foreground: 'oklch(46% 0.03 340)'
  card: 'oklch(100% 0 0)'
  border: 'oklch(90% 0.012 340)'
  ring: 'oklch(58% 0.18 340)'
  destructive: 'oklch(52% 0.19 27)'
  dark-background: 'oklch(14% 0.014 340)'
  dark-foreground: 'oklch(94% 0.006 340)'
  dark-card: 'oklch(18% 0.016 340)'
  dark-border: 'oklch(27% 0.016 340)'
typography:
  display:
    fontFamily: 'Bricolage Grotesque, system-ui, sans-serif'
    fontSize: 'clamp(2.5rem, 1.5rem + 4.5vw, 5rem)'
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.03em
  headline:
    fontFamily: 'Bricolage Grotesque, system-ui, sans-serif'
    fontSize: 'clamp(1.75rem, 1.2rem + 2vw, 2.5rem)'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  title:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'Hanken Grotesk, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 10px
  lg: 16px
spacing:
  unit: 8px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  section: 128px
  gutter: 24px
  container: 1200px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 14px 22px
    height: 48px
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  button-secondary:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 14px 22px
    height: 48px
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: 32px
---

# Lineage: editorial-marketing

## Overview

처음 온 사람에게 "왜 여기 왔는가"에 답하는 화면의 계보다. 청중은 한 번 읽고 결정하는 방문자,
화면의 일은 이해시키고 다음 행동으로 보내는 것. 인상은 "확신 있고 담백하다". 밀도는 sparse,
구조는 잡지처럼 — 큰 제목, 긴 여백, 비대칭, 실제 제품 화면. 카드 그리드가 아니라 섹션과
hairline이 페이지를 나눈다.

**Key characteristics:** 논지 하나의 hero · 큰 display(700, −0.03em) · 12열 비대칭(7/5 · 5/7) ·
섹션 간 128px · accent 하나 · 제품 화면은 hairline 프레임 · 모션은 한 순간.

## Colors

- **Primary** (`oklch(48% 0.19 H)`): CTA · 링크 · 강조 숫자 하나. 배경으로 칠하지 않는다.
- **Background**: 거의 흰색에 anchor 틴트(C 0.004). cream(L 96%, warm)으로 내리지 않는다 —
  그 룩은 이미 소진됐다.
- **Muted**: 대안 섹션 배경. 페이지에 최대 두 번.
- **Border**: hairline. 제품 화면 · 사진의 프레임.
- 다크는 지원 시에만. 기본은 라이트다.

**The Quiet Page Rule.** accent는 CTA와 강조 숫자에만 있다. 배경 gradient · 글로우 · 블러 blob은
없다.

## Typography

**Display font:** 성격 있는 grotesk(광폭 · 가변 축). **Body font:** 중립 grotesk.

**Character:** display는 크고 무겁고 좁게(700, −0.03em), 본문은 18px로 넉넉하게. 대문자
eyebrow · 이탤릭 강조 단어 · 한 단어만 세리프는 쓰지 않는다. 제목이 스스로 무게를 갖는다.

- **Display** (700, clamp 40–80px, 1.02, −0.03em): hero 헤드라인 하나.
- **Headline** (600, 28–40px, 1.1): 섹션 제목.
- **Title** (600, 20px): 카드 · 기능 제목.
- **Body** (400, 18px, 1.6, 60–70ch): 설명.
- **Label** (500, 14px): 버튼 · 메타.

**The One Headline Rule.** 페이지에 display는 한 번이다.

## Layout

컨테이너 1200px, 12열, gutter 24. hero는 7/5 또는 5/7 비대칭 — 텍스트 열과 제품 화면 열.
섹션 간 128px(모바일 80px), 섹션 내부 그룹 40px. 기능은 3열 카드가 아니라 **번갈아 배치되는
2열 섹션**(텍스트 ↔ 화면) 또는 hairline로 나뉜 목록이다. 실제 순서가 있을 때만 단계(steps)를
번호로 표시한다. 375px에서는 단일 열, display는 40px, 제품 화면은 폭 100%.

## Elevation & Depth

그림자 대신 hairline 프레임과 배경 단차(`background` ↔ `muted`)로 깊이를 만든다. 제품 화면은
1px `border` + 12–16px radius로 프레임하고 그림자는 주지 않는다. 팝오버 · 메뉴만
`--shadow-overlay`.

## Shapes

radius 6 · 10 · 16. 버튼 10px, 제품 화면 프레임 16px, 태그 6px. pill 버튼은 브랜드가 각진
성격이 아닐 때만 하나.

## Components

- **Hero**: display + 한 문장 + CTA 1 + secondary 링크 1. 제품 화면 · 숫자 · 헤드라인 중 주인은
  하나.
- **Proof**: 실제 로고 · 실제 숫자만. 없으면 placeholder로 표시하고 지어내지 않는다.
- **Feature section**: 2열 텍스트 ↔ 화면, 번갈아. 제목 headline · 본문 body · 링크 1.
- **Pricing**: 플랜 2–4개는 표 또는 나란한 카드. 추천 플랜만 primary 테두리. 단일 플랜이면 CTA
  카드 1개.
- **CTA band**: `muted` 배경 · headline · 버튼. 페이지 끝에 한 번.
- **Footer**: 4열 링크 · hairline 상단.

## Do's and Don'ts

- Do: hero에 실제 제품 화면을 hairline 프레임으로 넣는다.
- Do: 섹션마다 헤드라인 한 문장이 논지를 잇는다. 읽는 순서가 스크롤 순서다.
- Do: 대담함은 display 하나에만 쓴다.
- Don't: 아이콘 타일 카드 3열, 대문자 eyebrow, 이탤릭 강조 단어, `→` 버튼, 01/02/03.
- Don't: 지어낸 통계 행(10k+ / 99.9% / 24/7), 가짜 후기, 가짜 로고 띠.
- Don't: 섹션마다 fade-up 등장, 카드마다 hover lift. 모션은 hero의 한 순간뿐.

<!-- 스킬 확장 섹션 — DESIGN.md로 방출할 때 제거하고 decision record로 옮긴다 -->

## Adaptation

- **적용 조건**: 마케팅 · 제품 소개 · 가격 · 채용. 커머스면 `playful-commerce`.
- **① hue**: 기본 340(자리표시자). 허용 chroma 0.15–0.22(primary), 중립 틴트 0.004–0.012.
  주제의 사물에서 온 hue가 warm(20–60)이면 배경 L은 99%를 유지하고 C는 0.006 이하 — cream
  회피.
- **② 페어링**:
  1. `Bricolage Grotesque` + `Hanken Grotesk` — 광폭 가변 display + 중립 본문
  2. `Familjen Grotesk` + `Source Sans 3` — 단정한 grotesk + 휴머니스트 본문
  3. (ko) `Pretendard Variable` 800 display + `Pretendard Variable` 400 본문 — 한 가족, 무게 극단.
     라틴 display가 필요하면 `unicode-range`로만 ([`typography-ko.md`](../typography-ko.md))
- **③ radius · 밀도**: `editorial`(radius 10 · section 128 · unit 8) / `compact`(radius 8 · section
  96 · unit 8).
- **매크로구조**: `thesis-proof-flow`(hero → proof → 번갈아 기능 → 가격 → CTA) ·
  `number-first`(hero가 숫자 하나 → 설명 → 기능) · `product-first`(hero가 제품 화면 전면 → 짧은
  헤드라인 → 기능 목록).
- **signature 후보**: 화면 폭을 다 쓰는 숫자 하나 / 헤드라인 안에서만 움직이는 단어 교체(한
  순간) / 제품 화면 프레임이 스크롤에 따라 한 번 열리는 것.
- **흔한 답**: "가운데 정렬 hero + 보라 gradient + 아이콘 카드 3열 + 후기 슬라이더 + 가격 카드
  3열 + 대문자 eyebrow."
