---
version: alpha
name: dense-data-ops
description: '표 · 로그 · 모니터링이 화면의 주인인 도구의 계보. 13px 본문과 1.45 행간, 4px 스케일과 32–36px 행, 상태는 형태 + 색 + 텍스트 세 겹, 차트 팔레트는 anchor에서 등간격. 라이트 기본에 진짜 다크 변형. 기본 hue 200은 자리표시자다 — adaptation.md ①로 반드시 교체한다.'
colors:
  primary: 'oklch(50% 0.15 200)'
  primary-hover: 'oklch(45% 0.16 200)'
  on-primary: 'oklch(99% 0.004 200)'
  background: 'oklch(98% 0.005 200)'
  foreground: 'oklch(20% 0.014 200)'
  muted: 'oklch(95% 0.008 200)'
  muted-foreground: 'oklch(46% 0.02 200)'
  card: 'oklch(100% 0 0)'
  border: 'oklch(88% 0.012 200)'
  ring: 'oklch(60% 0.14 200)'
  selection: 'oklch(93% 0.04 200)'
  destructive: 'oklch(52% 0.19 27)'
  success: 'oklch(52% 0.14 145)'
  warning: 'oklch(70% 0.15 85)'
  info: 'oklch(55% 0.12 250)'
  chart-1: 'oklch(55% 0.15 200)'
  chart-2: 'oklch(55% 0.15 272)'
  chart-3: 'oklch(55% 0.15 344)'
  chart-4: 'oklch(55% 0.15 56)'
  chart-5: 'oklch(55% 0.15 128)'
  dark-background: 'oklch(16% 0.012 200)'
  dark-foreground: 'oklch(92% 0.006 200)'
  dark-card: 'oklch(20% 0.014 200)'
  dark-border: 'oklch(29% 0.014 200)'
typography:
  display:
    fontFamily: 'Public Sans, system-ui, sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  headline:
    fontFamily: 'Public Sans, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: 'Public Sans, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'Public Sans, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: 'Red Hat Mono, ui-monospace, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: tnum
rounded:
  sm: 3px
  md: 4px
  lg: 6px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  section: 32px
  row: 32px
  row-comfortable: 36px
  toolbar: 40px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 4px 10px
    height: 28px
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 4px 8px
    height: 28px
  row:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    typography: '{typography.body}'
    height: '{spacing.row}'
  badge:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.sm}'
    padding: 1px 6px
---

# Lineage: dense-data-ops

## Overview

수천 행을 훑고 이상을 찾는 사람의 계보다. 청중은 전문가, 화면의 일은 스캔 · 비교 · 필터.
인상은 "빠르고 읽힌다". 밀도는 dense — 여백은 낭비이고 정렬 · 열 폭 · tabular 숫자가 구조다.
색은 상태와 계열 구분에만 쓰고, 상태는 항상 형태(글리프)와 텍스트를 동반한다. 다크 모드는
진짜 변형이며 "기본이 다크"가 아니다.

**Key characteristics:** 13px 본문 · 4px 스케일 · 32px 행 · sticky 헤더 · 필터 바 40px · 상태
글리프 세트 · 차트 5색 등간격 · mono는 ID · 시간 · 코드 열에만.

사조: Swiss Style(1950) · Flat Design(2013). Visual Cues 중 모듈형 그리드 · 단일 산세리프 · 장식 없는 기호를 잇는다. 반동 대상은 장식적 세리프와 감정 중심 일러스트다.
출처 `design-movement-converted.md`(로컬 스냅샷, `dictionary-recipes.md` §0). 이름 · 연도 · 신호만 옮겼고 대표작 · 이미지는 URL로만 인용한다.

## Colors

- **Primary**: 선택 · 필터 활성 · primary action. 표 안에서는 선택 행 배경(`selection`)으로만
  보인다.
- **상태색 4종**(destructive · warning · success · info)은 고정 hue이며 **글리프**(● ▲ ■ ◆)와
  텍스트 라벨을 항상 동반한다. 색맹 안전은 형태로 확보한다.
- **chart-1..5**: anchor에서 72° 등간격, 같은 L · C. 계열이 5개를 넘으면 색을 늘리지 말고
  그룹화한다.
- **Border**: hairline. 행 구분은 border 대신 `muted` 줄무늬(zebra) 또는 hover 배경.

**The Shape-First Status Rule.** 상태를 색만으로 전달하지 않는다. 글리프 + 색 + 텍스트.

## Typography

**Body:** 넓은 자폭의 중립 grotesk(작은 크기에서 열림). **Mono:** 식별자 · 시각 · 수치.

**Character:** 작고 촘촘하지만 열린 자폭. 무게는 400 · 500 · 600만. tracking은 0. 12px 미만은
없다.

- **Display** (600, 20px): 페이지 제목. 표 위에 한 줄.
- **Headline** (600, 15px): 패널 · 그룹 제목.
- **Body** (400, 13px, 1.45): 셀 · 설명.
- **Label** (500, 12px): 헤더 · 배지 · 필터 칩.
- **Mono** (400, 12px, tnum): ID · 타임스탬프 · 수치 열 · 로그.

**The Column Alignment Rule.** 텍스트 좌정렬, 숫자 우정렬, 상태 중앙, 날짜는 ISO 고정폭.

## Layout

상단 필터 바 40px(검색 · 칩 · 정렬) + 표(폭 100%, sticky 헤더) + 우측 상세 패널 360px(선택
시). 4px 스케일, 셀 padding 4·8, 그룹 간 12, 섹션 간 32. 행 32px(dense) / 36px(comfortable).
소형 다중(small multiples) 그리드는 카드가 아니라 hairline 격자. 375px에서는 열 우선순위로 3열만
남기고 상세는 시트로.

## Elevation & Depth

평면. 표면 단차 `background` → `card`(패널) 한 단. 그림자는 팝오버 · 메뉴 · 시트에만. 다크에서는
단차를 L 4%p로 유지하고 border 대비를 올린다.

## Shapes

radius 3 · 4 · 6. 셀 · 칩 · 배지 3–4, 패널 6. pill 없음, 글로우 없음.

## Components

- **Table**: sticky 헤더 label 500, zebra `muted`, hover 배경, 선택 `selection`, 키보드 ↑↓ 행
  이동, 열 리사이즈 · 정렬 기본값 명시. 50행 이상 가상화.
- **Filter bar**: 검색 input 28px + 필터 칩(radius 4) + 정렬. 적용된 필터는 URL에 반영.
- **Status badge**: 글리프 + 텍스트, `muted` 배경, 상태 hue는 글리프에만.
- **Detail panel**: key-value 2열, mono 값, 액션은 상단 우측.
- **Sparkline**: 실제 시계열이 있을 때만, 높이 20px, 축 없음, 값 라벨 옆.
- **Log stream**: mono 12px, 행 24px, 레벨은 글리프, 타임스탬프 고정폭.

## Do's and Don'ts

- Do: 첫 화면에 표가 보이고 필터가 즉시 반응한다.
- Do: 상태를 형태 + 색 + 텍스트로. 차트는 5색 등간격, 범례 있음.
- Do: 숫자 열은 tabular 우정렬, 단위는 헤더에.
- Don't: KPI 타일 4열 + 글로우 카드 + 도넛. 다크 배경에 중간 회색 본문.
- Don't: 카드 안에 표, 표 안에 카드. 행마다 그림자 · radius.
- Don't: 상태를 색만으로, 차트를 6색 이상으로.

<!-- 스킬 확장 섹션 — DESIGN.md로 방출할 때 제거하고 decision record로 옮긴다 -->

## Adaptation

- **적용 조건**: 표 · 로그 · 모니터링 · 분석이 주인. 일반 운영 도구면 `precision-tool`.
- **① hue**: 기본 200(자리표시자). 허용 chroma 0.12–0.16(primary), 중립 틴트 0.005–0.014.
  chart-1..5는 anchor에서 72° 등간격으로 재계산한다.
- **② 페어링**:
  1. `Public Sans` + `Red Hat Mono` — 열린 자폭 grotesk + 단정한 mono
  2. `Atkinson Hyperlegible` + `Martian Mono` — 가독 우선 + 기계적 mono
  3. (ko) `SUIT Variable` + `Spoqa Han Sans Neo`(숫자) — 고밀도 한글([`typography-ko.md`](../typography-ko.md))
- **③ radius · 밀도**: `dense`(radius 3 · row 32 · unit 4) / `comfortable`(radius 4 · row 36 ·
  unit 4).
- **매크로구조**: `filter-table-panel`(필터 바 + 표 + 상세 패널) · `small-multiples`(hairline
  격자의 작은 차트 6–12개 + 하나 확대) · `log-stream`(레벨 필터 + 스트림 + 상세).
- **signature 후보**: 글리프 상태 세트가 표 · 배지 · 차트 범례에서 같은 형태로 반복되는 것 /
  키보드 행 이동과 상세 패널의 즉시 갱신 / 밀도 토글.
- **흔한 답**: "다크 대시보드 + 글로우 KPI 카드 4열 + 그라데이션 영역 차트 + 둥근 카드 표."
