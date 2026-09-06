---
version: alpha
name: warm-content
description: '읽기 위한 화면의 계보 — 글 · 문서 · 뉴스레터. 18px 본문과 1.7 행간, 62–68ch measure, 최소한의 크롬, 목차와 진행 표시. 종이 틴트는 L 98.5% 이상 · C 0.008 이하로 미세하게(cream 회피). 제목은 세리프 또는 무거운 grotesk 중 노브로. 기본 hue 60은 자리표시자다 — adaptation.md ①로 반드시 교체한다.'
colors:
  primary: 'oklch(45% 0.13 60)'
  primary-hover: 'oklch(40% 0.14 60)'
  on-primary: 'oklch(99% 0.003 60)'
  background: 'oklch(98.8% 0.006 60)'
  foreground: 'oklch(22% 0.016 60)'
  muted: 'oklch(95.5% 0.01 60)'
  muted-foreground: 'oklch(46% 0.03 60)'
  card: 'oklch(100% 0 0)'
  border: 'oklch(89% 0.014 60)'
  ring: 'oklch(58% 0.13 60)'
  highlight: 'oklch(94% 0.06 60)'
  destructive: 'oklch(52% 0.19 27)'
  dark-background: 'oklch(17% 0.012 60)'
  dark-foreground: 'oklch(92% 0.008 60)'
  dark-card: 'oklch(21% 0.014 60)'
  dark-border: 'oklch(30% 0.014 60)'
typography:
  display:
    fontFamily: 'Literata, Georgia, serif'
    fontSize: 52px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.015em
  headline:
    fontFamily: 'Literata, Georgia, serif'
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: 'Literata, Georgia, serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'Source Sans 3, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: 'Source Sans 3, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: 'Sometype Mono, ui-monospace, monospace'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  unit: 8px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  section: 96px
  measure: 66ch
  aside: 240px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 10px 18px
    height: 44px
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  link:
    textColor: '{colors.primary}'
  callout:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 16px 20px
  code:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foreground}'
    typography: '{typography.mono}'
    rounded: '{rounded.sm}'
    padding: 2px 6px
---

# Lineage: warm-content

## Overview

앉아서 읽는 사람의 계보다. 청중은 한 편을 끝까지 읽는 독자 · 문서를 찾는 개발자. 화면의 일은
방해 없이 읽히는 것. 인상은 "차분하고 정성스럽다". 밀도는 sparse, 크롬은 최소(제목 · 메타 ·
목차 · 진행), 타이포가 전부다. 종이 느낌은 미세한 틴트로만 — cream 배경 + 세리프 + 테라코타
조합은 이미 소진됐다.

**Key characteristics:** 18px 본문 · 1.7 행간 · 66ch measure · 제목 세리프(노브) · 미세 종이
틴트 · 목차 사이드 · 인용 · 각주 · 코드 블록 · 진행 표시.

## Colors

- **Primary**: 링크 · 강조 하나. 배경으로 쓰지 않는다. 링크는 underline offset 0.18em.
- **Background**: L 98.8%, C 0.006 — 흰 종이. warm hue라도 L을 내리지 않는다.
- **Highlight**: 형광펜 강조 · 검색 일치. 한 문단에 하나.
- **Muted**: 콜아웃 · 코드 배경.
- 다크는 warm dark(L 17%) — 순수 검정 · 중간 회색 본문 금지, 본문 L 92%.

**The Ink Rule.** 본문색은 순수 검정이 아니라 anchor 틴트의 잉크(L 22%). 대비 12:1 이상이면
충분하다.

## Typography

**Display:** 세리프(가변, 광학 사이즈) 또는 무거운 grotesk — 노브 ②. **Body:** 휴머니스트
sans 또는 본문용 세리프. **Mono:** 코드.

**Character:** 본문이 주인. 제목은 본문보다 겨우 두 단계 크고, 무게로 구분한다. 이탤릭은
인용 · 강조 구문에만, 단어 하나에 세리프 이탤릭 액센트는 없다.

- **Display** (600, 52px — 유동값 `clamp(2rem, 1.4rem + 2.5vw, 3.25rem)`, 1.1): 글 제목 하나. 토큰은 최대값이고 CSS에서는 clamp을 쓴다.
- **Headline / Title** (600, 26 / 20px): 절 · 소절.
- **Body** (400, 18px, 1.7, 66ch): 본문. 문단 간격 1em, 들여쓰기 없음.
- **Label** (500, 14px): 메타 · 목차 · 캡션.
- **Mono** (400, 15px): 코드. 배경 `muted`, 줄 번호는 `muted-foreground`.

**The Measure Rule.** 본문 폭은 66ch(±4)다. 화면이 넓어져도 늘리지 않는다.

## Layout

단일 열 66ch를 가운데 두고, ≥1024px에서 우측 240px에 목차(sticky). 제목 블록(제목 · 요약 ·
메타)은 본문 폭, 이미지 · 표 · 코드는 본문보다 넓게(최대 880px) 튀어나올 수 있다. 섹션 간
96px, 절 사이 40px. 375px에서 좌우 20px, 목차는 상단 접힘.

## Elevation & Depth

없음. 콜아웃 · 코드는 `muted` 배경 단차, 이미지는 hairline 프레임. 그림자는 팝오버(각주 ·
용어)에만.

## Shapes

radius 4 · 8 · 12. 코드 인라인 4, 콜아웃 · 코드 블록 8, 이미지 12.

## Components

- **Title block**: display · 요약 문장(body, `muted-foreground`) · 메타(label: 저자 · 날짜 · 읽는
  시간).
- **TOC**: label 14px, 현재 절 강조(primary 텍스트 + 좌측 2px 표시), 스크롤 동기.
- **Callout**: `muted` 배경 · 좌측 표시 없이 · 아이콘 + 제목 label + 본문.
- **Blockquote**: 본문 크기 이탤릭 · 좌측 hairline · 출처 label.
- **Footnote**: 번호 위첨자 → 하단 목록, 클릭 시 팝오버.
- **Code block**: mono · `muted` · 복사 버튼 · 언어 label.
- **Progress**: 상단 2px primary 진행 바. 유일한 모션.

## Do's and Don'ts

- Do: 본문 measure를 지키고 이미지만 튀어나오게 한다.
- Do: 한국어 본문은 [`typography-ko.md`](../typography-ko.md) — Pretendard 또는 본문 세리프
  (Gowun Batang · Noto Serif KR), 행간 1.7, keep-all.
- Do: 목차 · 진행 · 각주로 길이를 다룬다.
- Don't: cream 배경 + Instrument Serif/Fraunces 이탤릭 액센트 + 테라코타 링크.
- Don't: 카드로 감싼 글, 3열 관련 글 카드, 큰 hero 이미지 위 흰 제목.
- Don't: drop cap · 장식 구분선 · 섹션마다 아이콘.

<!-- 스킬 확장 섹션 — DESIGN.md로 방출할 때 제거하고 decision record로 옮긴다 -->

## Adaptation

- **적용 조건**: 글 · 문서 · 뉴스레터 · 도움말. 코드 문서가 중심이면 이 계보의 레이아웃에
  `precision-tool`의 타입(13–14px)을 섞지 말고 body 16px로만 내린다.
- **① hue**: 기본 60(자리표시자). 허용 chroma 0.1–0.16(primary), 종이 틴트 C ≤0.008, L ≥98.5%.
- **② 페어링**:
  1. `Literata`(display) + `Source Sans 3`(body) — 광학 세리프 + 휴머니스트 sans
  2. `Archivo` 800(display) + `Spectral`(body) — 무거운 grotesk 제목 + 본문 세리프
  3. (ko) `Gowun Batang`(display · 본문 세리프) 또는 `Pretendard Variable` 700 + `Pretendard Variable` 400 — [`typography-ko.md`](../typography-ko.md)
- **③ radius · 밀도**: `reading`(measure 66ch · 본문 18 · 행간 1.7) / `docs`(measure 72ch · 본문
  16 · 행간 1.65 · 좌측 nav 260).
- **매크로구조**: `article`(제목 블록 → 본문 → 각주 → 다음 글 1개) · `docs`(좌 nav + 본문 + 우
  목차) · `newsletter`(제목 블록 → 섹션 4–6 → 구독 CTA 1).
- **signature 후보**: 이미지 · 코드만 본문 밖으로 튀어나오는 리듬 / 각주 팝오버 / 스크롤 진행
  바가 제목 밑줄처럼 자라는 것.
- **흔한 답**: "cream 배경 + Instrument Serif 이탤릭 단어 + 테라코타 링크 + 카드로 감싼 관련
  글 3열."
