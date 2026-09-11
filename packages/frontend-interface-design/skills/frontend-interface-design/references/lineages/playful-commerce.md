---
version: alpha
name: playful-commerce
description: '상품을 보고 담는 화면의 계보. 이미지가 주인이고 타이포는 가격에 무게를 몰아준다. 잠긴 비율의 상품 이미지 그리드, 큰 radius(16–24), 브랜드 accent 하나 + 가격 · 할인 전용 semantic hue 하나, sticky 구매 박스. 기본 hue 300은 자리표시자다 — adaptation.md ①로 반드시 교체한다.'
colors:
  primary: 'oklch(50% 0.2 300)'
  primary-hover: 'oklch(45% 0.21 300)'
  on-primary: 'oklch(99% 0.004 300)'
  primary-soft: 'oklch(95% 0.035 300)'
  background: 'oklch(99% 0.004 300)'
  foreground: 'oklch(19% 0.016 300)'
  muted: 'oklch(96% 0.008 300)'
  muted-foreground: 'oklch(48% 0.026 300)'
  card: 'oklch(100% 0 0)'
  border: 'oklch(90% 0.012 300)'
  ring: 'oklch(60% 0.18 300)'
  price: 'oklch(20% 0.02 300)'
  sale: 'oklch(52% 0.2 27)'
  destructive: 'oklch(52% 0.19 27)'
  success: 'oklch(52% 0.14 145)'
  dark-background: 'oklch(15% 0.012 300)'
  dark-foreground: 'oklch(94% 0.006 300)'
  dark-card: 'oklch(19% 0.014 300)'
  dark-border: 'oklch(28% 0.014 300)'
typography:
  display:
    fontFamily: 'Gabarito, system-ui, sans-serif'
    fontSize: 56px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline:
    fontFamily: 'Gabarito, system-ui, sans-serif'
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  title:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
  price:
    fontFamily: 'Gabarito, system-ui, sans-serif'
    fontSize: 24px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.01em
    fontFeature: tnum
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
spacing:
  unit: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  section: 64px
  gutter: 16px
  container: 1280px
  aspect: 4/5
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.title}'
    rounded: '{rounded.lg}'
    padding: 0 24px
    height: 52px
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  chip:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: 8px 12px
    height: 36px
  chip-selected:
    backgroundColor: '{colors.foreground}'
    textColor: '{colors.background}'
  product-card:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: 0
  badge-sale:
    backgroundColor: '{colors.sale}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: 2px 8px
---

# Lineage: playful-commerce

## Overview

고르고 담는 사람의 계보다. 청중은 폰으로 훑고 비교하는 쇼핑객, 화면의 일은 상품을 보여주고
장바구니까지 마찰 없이 보내는 것. 인상은 "가볍고 또렷하다". 밀도는 comfortable, 이미지가
주인이고 텍스트는 이름 · 가격 · 옵션 세 가지만 크게 말한다. 놀이는 radius와 가격 타이포에,
장식은 없다.

**Key characteristics:** 잠긴 비율(4/5) 이미지 그리드 · radius 16–24 · 가격 800 tnum · 브랜드
accent 하나 + sale hue 하나 · sticky 구매 박스 · 옵션 칩 · 모션은 이미지 hover 한 번.

사조: Material You(2021) · Claymorphism(2021). Visual Cues 중 콘텐츠 색에서 파생한 톤 · 둥근 볼륨감 · 친근한 촉각을 잇는다. 반동 대상은 엔터프라이즈형 진지한 톤이며 럭셔리 편집샵에는 맞지 않는다.
출처 `design-movement-converted.md`(로컬 스냅샷, `dictionary-recipes.md` §0). 이름 · 연도 · 신호만 옮겼고 대표작 · 이미지는 URL로만 인용한다.

## Colors

- **Primary**: 담기 · 구매 · 선택 상태. 상품 이미지 위에 칠하지 않는다.
- **Price / Sale**: 가격은 `foreground`급 잉크(`price`), 할인 · 긴급은 `sale`(고정 hue 27) —
  이 계보에서 허용되는 두 번째 chroma이며 가격 · 배지에만 쓴다.
- **Background**: 흰색에 미세 틴트. 상품 이미지가 깨끗하게 놓이려면 배경이 물러나야 한다.
- **Chip-selected**: `foreground` 배경 + `background` 텍스트 — accent가 아니라 잉크로 선택을
  표시해 accent 점유를 지킨다.

**The Image-First Rule.** 색은 이미지 바깥에만 있다. 이미지 위 오버레이 · gradient는 없다.

## Typography

**Display:** 둥근 기하 grotesk 800. **Body:** 중립 grotesk.

**Character:** 무게 대비가 크고(800 vs 400) 자간은 살짝 좁다. 가격은 display 가족 800 tnum이며
화면에서 가장 무겁다. 상품명은 title 600 두 줄 `line-clamp`.

- **Display** (800, 56px — 유동값 `clamp(2rem, 1.4rem + 3vw, 3.5rem)`): 프로모션 · 카테고리 제목. PDP에는 없다. 토큰은 최대값이고 CSS에서는 clamp을 쓴다.
- **Headline** (700, 24px): PDP 상품명.
- **Title** (600, 16px): 카드 상품명 · 버튼.
- **Body** (400, 15px): 설명 · 리뷰.
- **Label** (500, 13px): 배지 · 칩 · 메타.
- **Price** (800, 24px, tnum): 가격. 할인 전 가격은 label + line-through `muted-foreground`.

## Layout

컨테이너 1280, gutter 16. PLP: 필터 바(sticky) + 상품 그리드 2열(375) / 3열(768) / 4열(1280),
이미지 비율 4/5 고정, 카드 padding 0(이미지 · 이름 · 가격만). PDP: 갤러리 7열 + 구매 박스
5열(sticky), 옵션 칩 → 수량 → CTA 52px; 375px에서는 갤러리 위 · 구매 박스 하단 고정. 섹션 간
64px.

## Elevation & Depth

이미지가 깊이를 만든다. 카드에 그림자 없음. 구매 박스 · 필터 시트 · 토스트만 `--shadow-overlay`.
hover는 이미지 `scale(1.03)` 한 번(200ms ease-out), 카드 lift 없음.

## Shapes

radius 8 · 12 · 16 · 24. 상품 이미지 16, 버튼 16, 칩 8, 갤러리 24. 배지는 8(pill 아님).

## Components

- **Product card**: 이미지(4/5, radius 16) · 이름 title 2줄 · 가격 price · sale 배지(있을 때만,
  좌상단 하나). 전체 카드가 링크.
- **Buy box**: 이름 headline · 가격 · 옵션 칩 그룹(라벨 위) · 수량 · CTA 52px · 배송 · 반품 한 줄.
- **Chip**: 36px, hairline, 선택은 잉크 반전, 품절은 대각선 취소선 + `muted-foreground`.
- **Gallery**: 메인 4/5 + 썸네일 행, 스와이프, 확대는 탭.
- **Filter bar**: 카테고리 칩 + 정렬, 적용 필터는 URL.
- **Cart drawer**: 우측 시트, 행 72px(이미지 56), 합계 tnum, CTA 하단.

## Do's and Don'ts

- Do: 이미지 비율을 잠그고 `object-fit: cover`, 로딩은 이미지 자리 skeleton.
- Do: 가격을 화면에서 가장 무겁게, 할인은 sale hue + line-through 원가.
- Do: 옵션 · 수량 · CTA를 한 흐름으로, CTA 옆에 배송 · 반품 조건.
- Don't: hero 배너 캐러셀 + 프로모션 카드 3열 + 그림자 상품 카드.
- Don't: 이미지 위 gradient 오버레이 · 흰 제목, 별점만으로 신뢰 표시, 지어낸 리뷰 수.
- Don't: 카드마다 hover lift · 그림자 · 배지 두 개.

<!-- 스킬 확장 섹션 — DESIGN.md로 방출할 때 제거하고 decision record로 옮긴다 -->

## Adaptation

- **적용 조건**: 상품 · 장바구니 · 결제 · 프로모션. 럭셔리 · 편집샵이면 `editorial-marketing`.
- **① hue**: 기본 300(자리표시자). 허용 chroma 0.16–0.24(primary), 중립 틴트 0.004–0.012.
  `sale`은 27 고정이며 anchor가 0–60이면 sale의 chroma를 accent보다 높여 구분한다.
- **② 페어링**:
  1. `Gabarito` 800 + `Onest` — 둥근 기하 display + 중립 본문
  2. `Sora` 700 + `Albert Sans` — 기하 display + 넓은 본문
  3. (ko) `Pretendard Variable` 800 + 400 — 프로모션 제목만 `Gasoek One` 허용(한 화면에 한
     번, [`typography-ko.md`](../typography-ko.md))
- **③ radius · 밀도**: `playful`(radius 16 · 이미지 4/5 · 그리드 gutter 16) / `tidy`(radius 12 ·
  이미지 1/1 · gutter 12).
- **매크로구조**: `pdp`(갤러리 + 구매 박스 + 상세 탭) · `plp`(필터 바 + 그리드) ·
  `cart-checkout`(단일 열 · 요약 sticky).
- **signature 후보**: 가격이 화면에서 가장 무거운 것 / 스티커 같은 sale 배지 하나 / 이미지
  hover의 한 번 `scale`.
- **흔한 답**: "hero 배너 캐러셀 + 프로모션 카드 3열 + 그림자 상품 카드 + 별점 + 보라 CTA."
