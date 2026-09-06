---
version: alpha
name: consumer-fintech-ko
description: '한국어 소비자 금융 · 결제 앱의 계보. 375px 기준 모바일 우선, Pretendard 한 가족, TDS형 스케일(17/15/13), 한 화면에 메시지 하나, 하단 고정 primary CTA, 카드가 아니라 섹션과 목록 행. accent는 기능색이지 장식이 아니다. 기본 hue 240은 자리표시자다 — adaptation.md ①로 반드시 교체한다.'
colors:
  primary: 'oklch(55% 0.19 240)'
  primary-hover: 'oklch(50% 0.2 240)'
  on-primary: 'oklch(99% 0.004 240)'
  primary-soft: 'oklch(95% 0.03 240)'
  background: 'oklch(99% 0.003 240)'
  foreground: 'oklch(20% 0.02 240)'
  muted: 'oklch(96% 0.006 240)'
  muted-foreground: 'oklch(50% 0.022 240)'
  subtle-foreground: 'oklch(64% 0.018 240)'
  card: 'oklch(100% 0 0)'
  border: 'oklch(91% 0.008 240)'
  ring: 'oklch(60% 0.17 240)'
  destructive: 'oklch(55% 0.2 27)'
  success: 'oklch(55% 0.14 145)'
  dark-background: 'oklch(14% 0.012 240)'
  dark-foreground: 'oklch(94% 0.006 240)'
  dark-card: 'oklch(19% 0.014 240)'
  dark-border: 'oklch(28% 0.014 240)'
typography:
  t1:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: -0.02em
  t2:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: -0.02em
  t3:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.02em
  t4:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: -0.01em
  t5:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.01em
  t6:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: -0.01em
  t7:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  amount:
    fontFamily: 'Pretendard Variable, Pretendard, Apple SD Gothic Neo, Noto Sans KR, sans-serif'
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.02em
    fontFeature: tnum
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  section: 8px
  row: 56px
  cta: 56px
  page-x: 20px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.t5}'
    rounded: '{rounded.lg}'
    padding: 0 20px
    height: '{spacing.cta}'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  button-secondary:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary}'
    rounded: '{rounded.lg}'
    padding: 0 20px
    height: '{spacing.cta}'
  input:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 14px 16px
    height: 52px
  row:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    height: '{spacing.row}'
---

# Lineage: consumer-fintech-ko

## Overview

돈을 확인하고 옮기는 사람의 계보다. 청중은 매일 여는 일반 소비자, 기기는 한 손 폰. 화면의
일은 "3초 안에 답을 주는 것" — 한 화면은 하나의 메시지만 말한다. 인상은 "믿음직하고
가볍다". 밀도는 comfortable, 구조는 섹션과 목록 행이며 카드는 예외다. 숫자가 주인공이므로
금액 타이포가 signature다.

**Key characteristics:** 375px 기준 · Pretendard 한 가족 · TDS형 스케일 t1–t7 · 금액 32px
700 tnum · 하단 고정 CTA 56px · 목록 행 56px + chevron · 섹션 구분은 8px 두께 `muted` 띠.

## Colors

- **Primary** (`oklch(55% 0.19 H)`): CTA · 링크 · 진행 표시. 파랑이 기본이 아니다 — hue는
  브리프의 사물에서 온다. accent는 **기능**이지 장식이 아니다(선택 · 진행 · 행동).
- **Primary-soft**: secondary 버튼 배경 · 선택 칩. accent를 크게 칠하는 유일한 자리.
- **Foreground 3단**: `foreground`(제목 · 금액) · `muted-foreground`(설명) · `subtle-foreground`
  (캡션 · 비활성). 전부 anchor 틴트.
- **Border**: 목록 행 사이 hairline. 카드 테두리로 쓰지 않는다.
- 상태색은 고정(destructive 27 · success 145). 수입/지출 같은 방향은 색 + 부호(+/−)로.

**The Functional Blue Rule.** (hue가 무엇이든) accent는 눌리는 것과 진행 중인 것에만 있다.

## Typography

**Font:** Pretendard Variable 한 가족. 라틴 · 숫자도 같은 가족이 받는다.

**Character:** 한글 기준으로 조정된 grotesk. 무게는 400 · 600 · 700만, 자간 −0.01~−0.02em,
행간 1.5. [`typography-ko.md`](../typography-ko.md)의 `keep-all` · `font-synthesis: none` ·
tabular 규칙이 그대로 적용된다.

- **t1–t3** (700, 30/26/22): 화면 제목 · 질문. 한 화면에 하나.
- **t4** (600, 20): 섹션 제목.
- **t5** (400, 17): 본문 · 목록 행 제목 · 버튼 라벨.
- **t6** (400, 15): 보조 · 목록 행 설명.
- **t7** (400, 13): 캡션 · 법적 고지. "안 읽어도 되는" 정보만.
- **amount** (700, 32, tnum): 잔액 · 금액. 화면에 한 번.

**The One Question Rule.** 제목은 질문 또는 결과 한 문장이다. 3초 안에 답이 안 나오면 화면을
나눈다.

## Layout

375px 기준, 좌우 padding 20px, 세로 스택 하나. 상단 nav 56px(뒤로 + 제목 또는 닫기), 하단
고정 CTA 56px + safe-area. 섹션은 8px 두께 `muted` 띠로 나누고 섹션 안은 목록 행 56px.
그리드는 액션 아이콘 4열(한 줄)만 허용. 데스크톱(≥768)은 480px 컨테이너를 가운데 두고
확장하지 않는다.

## Elevation & Depth

평면. 바텀시트 · 토스트만 `--shadow-modal`. 카드는 예외 요소(프로모션 배너 1개)이며 그림자
없이 `card` 배경 + radius 16.

## Shapes

radius 8 · 12 · 16 · 20. 버튼 16, 입력 12, 칩 8(작은 컨트롤만 pill 허용), 바텀시트 상단 20.
아이콘 타일은 radius 12에 `primary-soft` 배경 — 한 화면에 최대 4개(액션 행).

## Components

- **Bottom CTA**: 56px, t5 600, primary. 화면에 하나. 비활성은 `muted` + `subtle-foreground`.
- **List row**: 56px, 좌 아이콘(선택) · 제목 t5 · 설명 t6 · 우측 값(tnum) 또는 chevron. 전체
  행이 탭 타깃.
- **Amount hero**: 캡션 t7 → 금액 amount → 보조 t6. 변화는 부호와 색.
- **Input**: 52px, `muted` 배경, 라벨 위 t6, 오류 inline t7 destructive. 금액 입력은 오른쪽
  정렬 tnum.
- **Bottom sheet**: 선택 · 확인. 제목 t3, 옵션 행 56px, CTA 하단.
- **Toast**: 하단 CTA 위, 한 줄, undo 가능하면 undo.
- **Empty**: 한 줄 설명 + CTA. 일러스트는 실제 자산이 있을 때만.

## Do's and Don'ts

- Do: 화면당 질문 하나, 금액 하나, CTA 하나.
- Do: 금액 · 날짜 · 계좌번호는 tnum이고 자릿수 구분(`Intl.NumberFormat`).
- Do: 목록 행 전체를 탭 타깃으로, 최소 56px.
- Don't: 보라 gradient 카드, 4열 아이콘 타일 이상, 도넛 차트로 잔액 표시.
- Don't: 카드 안에 카드, 카드마다 그림자, 대시보드식 KPI 타일.
- Don't: 라틴 display 폰트로 한글 제목. 한글은 항상 Pretendard가 받는다.

<!-- 스킬 확장 섹션 — DESIGN.md로 방출할 때 제거하고 decision record로 옮긴다 -->

## Adaptation

- **적용 조건**: 한국어 · 모바일 · 소비자 · 돈 또는 절차. 데스크톱 B2B면 `precision-tool`.
- **① hue**: 기본 240(자리표시자). 허용 chroma 0.15–0.22(primary), 중립 틴트 0.003–0.02.
  파랑을 고르려면 "파랑인 사물"이 있어야 한다.
- **② 페어링**:
  1. (ko) `Pretendard Variable` 단일 가족 — 기본 ([`typography-ko.md`](../typography-ko.md))
  2. (ko) `Pretendard Variable` + `Spoqa Han Sans Neo`(금액 · 표의 숫자만)
  3. (en) `Hanken Grotesk` + tabular — 영어 전용 버전일 때만
- **③ radius · 밀도**: `friendly`(radius 16 · row 56 · CTA 56) / `compact`(radius 12 · row 48 ·
  CTA 52).
- **매크로구조**: `amount-hero-list`(nav → 금액 hero → 액션 행 → 섹션 목록) ·
  `one-question-flow`(질문 t2 → 입력 하나 → 하단 CTA, 단계마다 한 화면) ·
  `summary-detail`(요약 헤더 → 목록 → 상세 시트).
- **signature 후보**: 금액이 화면 폭을 쓰는 순간 / 진행 표시가 상단 nav에 얇게 흐르는 것 /
  목록 행의 값이 갱신될 때 한 번만 강조되는 것.
- **흔한 답**: "보라 gradient 카드 + 아이콘 타일 4열 + 도넛 차트 + 둥근 카드 목록, 라틴 폰트
  제목."
