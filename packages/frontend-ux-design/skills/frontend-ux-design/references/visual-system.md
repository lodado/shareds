# Visual system — Creation 모드 시각 시스템 도출 공식

Creation 모드에서 decision record 5단(visual treatment)을 채우기 **전에** 실행한다.
Fidelity에서는 쓰지 않는다 — 소스가 곧 시스템이다.

링크가 원천(source of truth)이고, 본문에는 실행에 필요한 최소 수치만 담는다.
링크 내용과 본문 수치가 다르면 링크가 이긴다. 원문 vendoring 금지 — 이 파일은
갱신을 따라가지 않는다.

## 왜 예쁨이 이 스킬 소관인가

미학은 **지각된 사용성**과 강하게 상관한다(aesthetic-usability effect, Kurosu &
Kashimura 1995). 예쁨은 장식이 아니라 impression과 오류 관용도를 올리는 사용성
지렛대다. 단, 예쁨이 사용성 문제를 가리기도 하므로 self-review 6축은 그대로 돈다.

> 출처: <https://lawsofux.com/aesthetic-usability-effect/>

## 0. 주제 고정 — 시스템은 주제의 세계에서 나온다

1. 주제 · 청중 · 화면의 일을 각 1줄로 못 박는다.
2. **주제의 사물 3개**를 적는다 — 재료 · 도구 · 환경 · 빛 중에서. 각각이 함의하는 hue를
   함께 적고, 그중 하나를 anchor로 고른다. "금융이라서 파랑" 같은 범주 반사는 사물이
   아니므로 무효다. 서체 성격도 같은 목록에서 나온다.
3. **이식 테스트 — 통과해야 다음으로 간다.** 도출한 팔레트를 무관한 브리프(치과 ·
   주물 공장 · 장례 안내 중 하나)에 그대로 놓아본다. 어색하지 않으면 주제에서 나온 게
   아니다. 2번으로 돌아가 다시 도출한다. 결과를 decision record에 한 줄로 남긴다.
4. 미적 리스크는 **1개만** 정해 signature 요소로 지정한다. 나머지는 조용히.

이식 테스트가 클리셰 방어의 본체다. 특정 팔레트 금지 목록은 명단 밖 클리셰로 밀어낼
뿐이라 두지 않는다. 이름 붙은 클리셰 탐지는 review 단계의 `kill-ai-slop` · Slop gates가
맡는다.

> 출처: Anthropic 공식 `frontend-design` 스킬
> (<https://github.com/anthropics/claude-plugins-official>)

## 1. 색 — anchor hue 하나에서 전부 파생

순서: anchor hue 결정 → 4층 팔레트 → 12-step 상태 매핑. 즉석 색 결정 금지.

먼저 anchor의 `C_peak`(그 hue에서 쓸 최대 chroma, 0.12–0.22)를 정한다. 나머지 chroma는
전부 여기서 비례로 나온다 — 고정 상수로 두면 hue가 달라도 화면의 95%가 같은 색이 된다.

| 층           | light                                                                       | dark                               |
| ------------ | --------------------------------------------------------------------------- | ---------------------------------- |
| Paper(배경)  | `oklch(96–98% C_peak×0.06–0.12 h)`                                          | `oklch(12–16% C_peak×0.08–0.15 h)` |
| Ink(본문)    | `oklch(16–22% C_peak×0.06–0.12 h)`                                          | `oklch(92–96% C_peak×0.05–0.08 h)` |
| Neutral ramp | 5–9개, Paper↔Ink 사이. L은 균등, chroma는 중간 단계에서 최대(양 끝의 2–3배) | 동일 규칙                          |
| Accent       | `C_peak`, 화면 점유 ≤3%                                                     | 동일 규칙                          |

- 순수 `#000` · `#fff` 금지. 회색에도 anchor hue를 틴트한다.
- 상태색은 Radix 12-step **역할**로 파생한다(위 ramp 개수와 무관한 별개 축):
  1–2 앱/섹션 배경 · 3–5 컴포넌트 배경(normal/hover/active) ·
  6–8 border(subtle/기본·focus ring/hover) · 9–10 solid(버튼 normal/hover) ·
  11–12 텍스트(low/high contrast).
  interactive 상태 의무(Build 규칙)가 색 층위에서 자동으로 풀린다.
- **solid 위 전경색은 계산해서 정한다.** solid의 L이 70% 이상이면(노랑 · 라임 · 민트 ·
  하늘 계열이 여기 걸린다) 전경은 Ink 계열 어두운 값, 미만이면 Paper 계열 밝은 값.
  흰 글자를 기본값으로 두면 밝은 accent에서 4.5:1이 깨진다.
- **border · focus ring은 배경 대비 3:1 이상**(WCAG 1.4.11). 미학상 옅게 하고 싶으면
  구분은 간격 · 배경 대비로 옮기고, 남긴 border는 3:1을 지킨다.
- 상태가 3개 이상 필요한 화면(부족/초과/일치 같은)은 accent 하나로 파생하지 못한다.
  hue를 늘리지 말고 **형태**로 구분한다(방향 · 크기 · 아이콘). 색은 보조다.
- `oklch()`는 Chrome 111+ / Safari 15.4+. pre-flight에서 더 낮은 타깃이 보이면
  hex fallback을 병기한다.

> 출처: <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>

## 2. 토큰 방출 — 컴포넌트 코드보다 먼저

- 위 팔레트를 shadcn 네이밍의 `:root` / `.dark` CSS variables 블록으로 **가장 먼저**
  방출한다: `background/foreground` 쌍 + `card` `popover` `primary` `secondary`
  `muted` `accent` `destructive` `border` `input` `ring` `radius`.
- 팔레트에서 안 나오는 토큰은 다음 규칙으로 채운다. 발명하지 않는다.
  - `card` · `popover`: Paper에서 L을 light면 +1.5–3%p, dark면 +3–5%p. 그 이상 벌리면
    카드가 떠 보인다.
  - `destructive`: anchor와 hue 거리 ≥60°인 위험색 하나(관습값 h≈27). anchor가 이미
    h 0–60 구간이면 hue를 옮기지 말고 chroma를 accent보다 높여 구분한다.
  - `radius`: 밀도가 결정한다. 정보 밀도 높은 도구는 0.25–0.375rem, 콘텐츠 · 마케팅은
    0.5–0.75rem, 브랜드가 각진 성격이면 0.
  - 차트 · 사이드바가 있으면 shadcn의 `chart-1..5` · `sidebar-*` 이름을 그대로 쓴다.
    `chart-*`는 anchor에서 hue를 등간격으로 벌려 만든다.
- pre-flight에서 기존 토큰을 발견했으면 그 이름에 매핑한다. 새 이름 발명 금지.
- 방출 후 모든 색 · 폰트 · radius는 토큰 참조만 쓴다. 임의 값 금지 — 이 잠금이
  일관성의 실제 메커니즘이다. 방출 순서는 보조일 뿐, 금지 규칙이 본체다.

> 출처: <https://ui.shadcn.com/docs/theming>

## 3. 타이포 — 2+1, 비율, 극단

- 가족 수: display + body, outlier 최대 1(워드마크 · 히어로 숫자 같은 단일 순간).
  4가족은 슬롭이다.
- 크기는 비율 스케일 택1, 5단계 이하로 이름 붙인다(ui-checklist와 동일 기준).
  밀도 높은 도구는 1.25, 일반 앱은 1.333, 히어로가 지배하는 랜딩은 1.5. base 16px.
- weight 대비는 극단으로 — **display 한정**. 200×800은 의도로 읽히고 400×600은
  기본값으로 읽힌다. 본문 weight는 400 아래로 내리지 않는다(작은 크기에서 무너진다).
- line-height · measure는 ui-checklist Typography가 소유한다(본문 1.4–1.6 · 45–75자,
  제목 1.1–1.25). 여기서 다시 정하지 않는다. 본문 폭 기본값은 `max-width: 65ch`.
- 서체 이름은 이 순서로 정한다: ① pre-flight에서 찾은 프로젝트 폰트 ② §0의 사물
  목록이 함의하는 성격(계측 도구 → 그로테스크, 수공 → 휴머니스트 세리프 …)에 맞는
  가변 폰트 1–2개 ③ 못 고르겠으면 시스템 스택. 어느 경우든 fallback 스택을 함께 적는다.
- 페어링 기본값:

| 상황                  | 기본값                          | 뒤집는 조건                         |
| --------------------- | ------------------------------- | ----------------------------------- |
| 데이터 밀도 높은 도구 | grotesk 1가족 + tabular numeric | 브랜드 서사가 중심이면 display 추가 |
| 콘텐츠 · 서사 랜딩    | 개성 있는 display + 중립 body   | 주제가 기술 도구면 중립 display     |
| 대시보드 · 설정 · 폼  | body 1가족, weight로만 위계     | 마케팅 구역이 섞이면 display 허용   |

> 출처: Refactoring UI 전술 목록 (<https://www.refactoringui.com/>)

## 4. 간격 · 깊이

- 간격 스케일은 ui-checklist가 소유한다(4 또는 8 기반 하나, 임의 값 없음).
  밀도 높은 도구는 4, 그 외 8을 기본으로 고른다.
- 여백은 과하게 시작해서 줄인다. 채우려고 늘리지 않는다.
- 구분 수단 우선순위: 간격 > 배경 대비 > shadow > border. border는 마지막 수단이고,
  남길 거면 §1의 3:1을 지킨다.
- 광원은 위 1개. elevation 2–3단만(raised / overlay), 단마다 shadow 토큰을 만든다.
  y-offset은 스케일 단위(4 또는 8)로, blur는 offset의 2–3배, alpha는 Ink의 8–16%.
  단이 올라갈 때 offset과 blur만 키우고 alpha는 거의 그대로 둔다.
- 강조는 올리는 게 아니라 주변을 **내려서** 만든다(de-emphasize to emphasize).

> 출처: Refactoring UI 전술 목록 (<https://www.refactoringui.com/>)

## 5. 레이아웃 패턴 — 웰노운에서 고르고, 조건 밖이면 쓰지 않는다

패턴은 발명하지 않고 아래에서 고른다. 조건이 안 맞으면 그 패턴을 버리는 것이
규칙이다. 사다리와 충돌하면 사다리가 이긴다.

### 랜딩

| 패턴                                                | 쓰는 조건                           | 피하는 조건                               |
| --------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Hero-as-thesis(헤드라인 / 데모 / 제품샷 / 숫자 택1) | 첫 화면이 "왜 여기 왔는가"에 답해야 | primary task가 폼 · 도구면 그것이 첫 화면 |
| Bento grid                                          | 이질적 기능 4–8개를 한눈에          | 기능이 순차 서사면 스크롤 섹션            |
| Feature 3-grid                                      | 동급 가치가 정확히 3개              | 기본값 사용 금지(ui-checklist)            |
| 비교 · 가격표                                       | 플랜 2–4개의 선택 결정              | 단일 플랜이면 CTA 카드 1개                |
| Social proof                                        | 실제 수치 · 후기 보유               | 지어내지 않는다 — placeholder로 표시      |
| Timeline · steps                                    | 실제 순서 존재                      | 순서 없는 나열이면 grid                   |

### 앱

| 패턴           | 쓰는 조건                      | 피하는 조건                                  |
| -------------- | ------------------------------ | -------------------------------------------- |
| 폼 단일 컬럼   | 모든 폼의 기본                 | City/State/Zip류 짧은 연관 필드만 한 행 허용 |
| 데이터 테이블  | 행 단위 비교 · 스캔이 일       | 스캔 대상이 아니면 카드 목록                 |
| 대시보드 카드  | 이질적 지표 각각이 결정을 유도 | 지표 1개가 지배하면 히어로 숫자 + 보조       |
| 마스터-디테일  | 목록↔상세 왕복이 잦다          | 상세가 얕으면 expandable row                 |
| 빈 상태 = 초대 | 최초 진입 · 데이터 0건         | 회색 일러스트 + "데이터 없음"만 두기 금지    |

- 폼 세공: label은 필드 위, placeholder를 label 대용 금지, 필수/선택 구분,
  형식 요구는 에러 전에 미리, Reset 버튼 금지.
- 테이블 세공: 텍스트 좌정렬 · 숫자 우정렬 + tabular numeric, 행 높이
  40/48/56px(밀도 옵션), 구분선 1px 이하, 정렬 기본값 명시(최신 · 긴급 우선).

> 출처: 폼 <https://www.nngroup.com/articles/web-form-design/> ·
> 테이블 <https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables>

## 6. 원샷 방출 순서

1. **토큰 블록** (`:root` / `.dark`) — §1–4 결정 전부 포함.
2. **signature 요소 스펙 3줄** — 무엇인지 / 사다리 어느 단을 돕는지 / 왜 기억에 남는지.
3. **컴포넌트** — 토큰 참조만.

이 순서가 지켜지면 decision record 5단은 표 채우기로 끝나고, ui-checklist의
색 · 타이포 · 간격 항목은 구성상 통과한다.
