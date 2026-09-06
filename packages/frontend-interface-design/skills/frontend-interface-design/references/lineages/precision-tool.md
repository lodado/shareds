---
version: alpha
name: precision-tool
description: '고빈도 운영 도구의 계보. 밝은 바탕 위 저채도 틴트 중립색, hairline 구분, 한 가족의 grotesk와 tabular 숫자, 4px 스케일과 40px 행. accent는 primary action · 선택 · 포커스에만 쓰인다. 기본 hue 230은 자리표시자다 — adaptation.md ①로 반드시 교체한다.'
colors:
  primary: 'oklch(50% 0.16 230)'
  primary-hover: 'oklch(45% 0.17 230)'
  on-primary: 'oklch(99% 0.004 230)'
  background: 'oklch(98.5% 0.005 230)'
  foreground: 'oklch(20% 0.014 230)'
  muted: 'oklch(95.5% 0.008 230)'
  muted-foreground: 'oklch(47% 0.024 230)'
  card: 'oklch(100% 0 0)'
  border: 'oklch(89% 0.012 230)'
  ring: 'oklch(60% 0.15 230)'
  selection: 'oklch(93% 0.05 230)'
  destructive: 'oklch(52% 0.19 27)'
  success: 'oklch(52% 0.14 145)'
  warning: 'oklch(70% 0.15 85)'
  dark-background: 'oklch(15% 0.012 230)'
  dark-foreground: 'oklch(93% 0.006 230)'
  dark-card: 'oklch(19% 0.014 230)'
  dark-border: 'oklch(28% 0.014 230)'
typography:
  display:
    fontFamily: 'Schibsted Grotesk, system-ui, sans-serif'
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline:
    fontFamily: 'Schibsted Grotesk, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  body:
    fontFamily: 'Schibsted Grotesk, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Schibsted Grotesk, system-ui, sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: 'Martian Mono, ui-monospace, monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: tnum
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 48px
  row: 40px
  sidebar: 240px
  topbar: 48px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: 6px 12px
    height: 32px
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.on-primary}'
  button-secondary:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 6px 12px
    height: 32px
  input:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 6px 10px
    height: 32px
  row:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    height: '{spacing.row}'
---

# Lineage: precision-tool

## Overview

하루에 수십 번 여는 도구의 계보다. 청중은 반복 사용자이고, 화면의 일은 찾고 · 고치고 · 넘기는
것이다. 인상은 "정확하고 조용하다"여야 하며 브랜드는 accent 한 줄과 아이콘 하나로 충분하다.
밀도는 dense 쪽이고, 여백보다 정렬과 hairline이 구조를 만든다. 키보드가 1급 입력이다.

**Key characteristics:** 밝은 바탕 · 저채도 틴트 중립색 · 한 가족 grotesk · tabular 숫자 · 4px
스케일 · 40px 행 · hairline 구분 · 그림자는 팝오버에만.

## Colors

- **Primary** (`oklch(50% 0.16 H)`): primary action · 현재 위치 · 선택 강조에만. 한 화면 점유 ≤5%.
- **Foreground / Muted-foreground**: 본문과 보조 텍스트. 둘 다 anchor hue로 틴트, 보조 텍스트는
  4.5:1 이상.
- **Border**: hairline. 배경 대비 3:1을 지키지 못하면 border 대신 간격 · 배경 단차로 구분.
- **Selection** (`oklch(93% 0.05 H)`): 선택된 행 · 활성 탭의 배경. accent를 크게 칠하지 않는다.
- **상태색**은 anchor와 무관하게 고정(destructive 27 · success 145 · warning 85)이며 항상
  아이콘 · 텍스트와 함께 쓴다.
- 다크: `dark-*` 토큰. 배경은 순수 검정이 아니라 L 15%의 틴트, 표면은 L 19%로 한 단만 올린다.

**The One Accent Rule.** 링크 · 버튼 · 선택 · 포커스가 모두 같은 hue다. 두 번째 chroma는
상태색뿐이다.

## Typography

**Body font:** 하나의 grotesk. **Mono:** ID · 시간 · 코드 · 수치 열에만.

**Character:** 낮은 대비의 neo-grotesk, 좁은 x-height 차이, 기계적 숫자. display는 24px를
넘지 않는다 — 도구는 제목이 아니라 내용이 주인이다.

- **Display** (600, 24px, 1.2, −0.02em): 페이지 제목 · 상세 헤더.
- **Headline** (600, 18px, 1.3): 섹션 · 다이얼로그 제목.
- **Body** (400, 14px, 1.5): 기본. 긴 설명은 65ch 이내.
- **Label** (500, 12px, 1.3): 표 헤더 · 폼 라벨 · 배지. 대문자 변환 금지.
- **Mono** (400, 12px, tnum): 식별자 · 타임스탬프 · 수치 열.

**The Tabular Rule.** 비교되는 숫자는 전부 `tabular-nums`이고 우정렬이다.

## Layout

앱 셸: 240px 사이드바 + 48px 상단바 + 콘텐츠. 콘텐츠는 유동 폭(최대 1440px)이며 표는 폭을
다 쓴다. 4px 스케일, 그룹 간 16 · 섹션 간 48. 행 높이 40px(dense) / 48px(comfortable).
375px에서는 사이드바가 시트로 접히고 표는 카드 목록이 아니라 **열 우선순위**로 줄어든다(중요
열 3개만). 320px 가로 스크롤 0.

## Elevation & Depth

평면 우선. 표면 단차는 `background` → `card` 한 단만이고 border는 hairline이다. 그림자는
팝오버 · 메뉴 · 다이얼로그에만(`--shadow-overlay` · `--shadow-modal`, hue 틴트). 카드에 그림자를
주지 않는다 — 카드 자체를 최소화한다.

**The Flat-By-Default Rule.** 상태(hover · 선택)는 배경 단차로, 레이어(팝오버)만 그림자로.

## Shapes

radius 4 · 6 · 8. 버튼 · 입력 6px, 카드 · 패널 8px, 배지 4px. pill은 쓰지 않는다. 중첩은 안쪽 ≤
바깥쪽.

## Components

- **Button**: 32px 높이, label 12px 500. primary 하나 · secondary(카드 배경 + hairline) ·
  ghost. 상태 8종. 키보드 단축키가 있으면 우측에 `kbd` 힌트.
- **Input**: 32px, hairline, focus는 `ring` 2px outline. 라벨은 위, 오류는 아래 inline.
- **Table**: sticky 헤더, 행 40px, 좌정렬 텍스트 · 우정렬 숫자, hover 행 배경 `muted`, 선택 행
  `selection`. 정렬 기본값 명시.
- **Row / List**: 목록은 표의 축소형이다. 카드 목록으로 바꾸지 않는다.
- **Dialog**: 480px, 제목 headline, 액션은 우하단, destructive는 라벨에 동작 이름.
- **Command palette**: 있으면 이 계보의 signature 후보다.

## Do's and Don'ts

- Do: 표 · 목록 · 폼을 hairline과 간격으로 구분한다. 첫 화면에 데이터가 보인다.
- Do: 모든 동작에 키보드 경로와 `kbd` 힌트를 둔다.
- Do: 상태를 아이콘 형태 + 색 + 텍스트 세 겹으로 표시한다.
- Don't: KPI 카드 4열 + 차트 + 표를 기본 구조로 두지 않는다. 지표가 결정을 유도할 때만 카드.
- Don't: 카드 안에 카드, 카드에 그림자, 아이콘 타일, 대문자 eyebrow.
- Don't: display를 32px 이상으로 키우지 않는다. 도구의 제목은 조용하다.

<!-- 스킬 확장 섹션 — DESIGN.md로 방출할 때 제거하고 decision record로 옮긴다 -->

## Adaptation

- **적용 조건**: 반복 사용 · 데스크톱 우선 · 정보 위계가 일이다. 표 · 로그가 주인이면
  `dense-data-ops`, 모바일 소비자면 `consumer-fintech-ko`.
- **① hue**: 기본 230(자리표시자). 허용 chroma 0.12–0.18(primary), 중립 틴트 0.005–0.014.
- **② 페어링** (성격이 스펙, 이름은 구현):
  1. `Schibsted Grotesk` + `Martian Mono` — 낮은 대비 grotesk + 기계적 mono
  2. `Public Sans` + `Red Hat Mono` — 관공서풍 중립 grotesk, 넓은 자폭
  3. (ko) `Pretendard Variable` + `Spoqa Han Sans Neo`(숫자 열) — [`typography-ko.md`](../typography-ko.md)
- **③ radius · 밀도**: `dense`(radius 4 · row 40 · unit 4) / `comfortable`(radius 6 · row 48 ·
  unit 4). spacious는 이 계보에 없다.
- **매크로구조**: `shell-table`(사이드바 + 필터 + 표 + 상세 패널) · `master-detail`(목록 ↔ 상세) ·
  `settings`(좌측 섹션 nav + 폼 스택).
- **signature 후보**: 커맨드 팔레트와 `kbd` 힌트 체계 / 형태가 다른 상태 글리프 세트 / 밀도
  토글(dense ↔ comfortable)이 한 번에 바뀌는 순간.
- **흔한 답**: "사이드바 + KPI 카드 4열 + 도넛 차트 + 둥근 카드 표, 회색 그림자, Inter."
