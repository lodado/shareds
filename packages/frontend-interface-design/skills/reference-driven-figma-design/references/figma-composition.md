# Figma composition — 구조를 기존 시스템의 언어로 번역한다

구성을 만들기 전에 [taxonomy → reference → adaptation](taxonomy-reference-workflow.md)의 화면 근거와
자산 근거를 확인한다. 검증된 출처의 구조를 바꾸어 로컬 파생 컴포넌트로 응용할 수 있지만,
원본 보존·실제 연결 상태·토큰 정합성·변경 근거를 기록한다. 기본 키트 모양의 무조건적 유지도 목표가 아니다.
전체 확장은 같은 계약의 레퍼런스 대비 파일럿 검토를 통과한 뒤에 한다.

## 1. Canvas safety

Figma를 열면 대상 file, page, frame, component set, variable collection과 version을 먼저 확인한다.
이름이나 과거 기록만으로 ID를 재사용하지 않는다.

- 원본 template과 approved page를 직접 덮어쓰지 않는다.
- 별도 Working Page, duplicated frame 또는 명시된 Experiment Area에서 시작한다.
- 의미 있는 checkpoint마다 실제 page/frame ID를 기록한다.
- component instance와 property를 우선하며 불필요한 detach를 피한다.
- publish된 library component를 바꾸는 작업은 일반 canvas 편집과 별도 권한이다.
- destructive replace, library publish, 외부 공유가 필요하면 사용자 승인을 받는다.

## 2. PRD를 디자인 문제로 변환한다

PRD 문장을 그대로 section으로 옮기지 않는다. 각 section을 다음 질문으로 정리한다.

| 필드                    | 답할 내용                                     |
| ----------------------- | --------------------------------------------- |
| User Question           | 방문자가 이 지점에서 묻는 질문                |
| Communication Goal      | 무엇을 이해·판단하게 해야 하는가              |
| Required Content        | 반드시 들어갈 실제 copy, data, image, control |
| Available Evidence      | screenshot, demo, proof, customer evidence    |
| Desired Action          | 다음 행동 또는 다음 정보                      |
| Available Visual Assets | 사용할 수 있는 product/brand asset            |

예:

- Hero: “이 제품이 무엇이며 나에게 어떤 가치가 있는가?”
- Product Evidence: “실제로 어떤 제품인가?”
- Workflow: “어떻게 사용하는가?”
- Comparison: “기존 방법과 무엇이 다른가?”
- Evidence: “이 주장을 믿을 근거가 있는가?”
- CTA: “다음 행동은 무엇인가?”

section은 `사용자가 <질문>에 답을 얻도록 <주인공>을 <관계>로 보여주고 <다음 행동>으로 잇는다`로
요약한다. 모든 내용을 같은 card로 포장하지 않는다.

## 3. Reference → Figma mapping

외부 pattern을 복사하기 전에 element 단위로 매핑한다.
[필수 컴포넌트 출처 게이트](component-source-gate.md)를 먼저 통과하고 실제 외부 자산도 후보에 포함한다.

| Reference role     | Existing Figma candidate |
| ------------------ | ------------------------ |
| Eyebrow            | Badge/Neutral            |
| Heading            | Typography/Display/L     |
| Description        | Typography/Body/L        |
| Primary CTA        | Button/Primary           |
| Secondary CTA      | Button/Secondary         |
| Product Screenshot | ProductFrame/Desktop     |
| Feature Indicator  | FeatureIndicator         |

실제 component 이름은 Figma에서 읽은 값으로 바꾼다. 표의 이름을 존재하는 ID처럼 사용하지 않는다.

사용 우선순위:

1. 적합성이 검증된 Existing Component / Existing Variant
2. 출처 게이트에서 채택한 External Component Instance / Editable Frame
3. 게이트에서 비교·탈락 이유가 기록된 경우의 Composition of Existing Primitives
4. 같은 게이트와 승인 범위 안의 New Reusable Component / One-off Experiment

기존 component가 있는데 rectangle과 text로 다시 그리지 않는다. 새 component가 필요하면 먼저
Experiment로 만들고 API/property를 실제 콘텐츠에 맞춰 제한한다.

## 4. Visual System은 하나다

선택된 template과 내부 design system에서 다음을 유지한다.

- typography roles와 type scale
- semantic color와 mode
- spacing/grid
- radius, border, elevation
- button, card, navigation, form, icon language
- product frame과 screenshot treatment의 기본 규칙

외부 reference에서 가져오는 정보 관계는 다음과 같다. 실제 component/Frame도 출처 게이트를 거쳐
재사용할 수 있다. 시각 언어를 유지하라는 규칙으로 외부 자산 반입을 금지하거나 재그리기를 강요하지 않는다.

- section structure와 reading order
- text/image proportion
- screenshot placement/crop
- CTA와 evidence의 인접성
- comparison 또는 workflow의 관계
- visual rhythm과 asymmetric balance

예를 들어 Linear의 hero composition을 쓰더라도 Linear의 font, color, radius, glow를 가져오지
않는다. 재스킨 과정에서 원본 reference의 핵심 hierarchy가 사라지면 mapping을 다시 한다.

## 5. 핵심 3개 section pilot

먼저 전체 page의 section map을 잡되 실제 canvas에는 보통 아래 세 개만 만든다.

1. Hero
2. Strongest Product/Evidence Section
3. Workflow/Explanation Section

PRD의 설득 구조가 다르면 더 중요한 약 3개 section으로 바꾼다.
단일 화면이나 부분 수정은 합의 범위의 1–3개 section/state만 선택하며 범위를 부풀리지 않는다. 예를 들어 comparison이 핵심인
제품은 workflow 대신 comparison을 선택할 수 있다.

pilot은 실제 길이의 copy, 실제 screenshot, 실제 brand asset을 사용한다. 허용된 placeholder는
표시한다. screenshot이 제품 증거라면 장식처럼 축소하지 않는다.

합의된 기기에서 위계와 rhythm을 확인하고, mobile이 범위에 있으면 같은 pilot에서 만든다. 좁은 화면에서는
단순 scale-down이 아니라 읽기 순서, crop, grouping, CTA 우선순위를 재결정한다.

pilot을 실제 Figma preview로 보고 [출처 게이트 §4](component-source-gate.md)의 구조·가독 크기 검토를
통과한 뒤에만 PILOT_READY를 쓴다. 이 시점의 목적은 방향을 검증하는
것이지 미완성 전체 page를 빠르게 채우는 것이 아니다.

## 6. 전체 확장

pilot의 visual system, section rhythm, screenshot language를 유지해 나머지 범위를 만든다.

- 각 section의 visual weight와 density를 의도적으로 달리한다.
- 같은 card grid나 center alignment를 반복해 page를 채우지 않는다.
- 필요한 product states, hover/focus/open/selected/error/empty와 prototype transition을
  scope에 맞춰 표현한다.
- interaction은 static frame만으로 검증했다고 하지 않는다. Figma prototype을 실제 preview한다.
- desktop/mobile에서 copy wrapping, overflow, target size, contrast, focus order가 이해 가능한지 본다.

Figma node 이름은 역할과 상태를 드러내게 유지한다. 임시 `Frame 123` 또는 `Rectangle 54`가
handoff의 핵심 구조에 남지 않게 한다.

## 7. 권장 Figma 계층

- Foundations: Colors, Typography, Spacing, Radius, Grid, Elevation
- Primitives: Button, Badge, Icon, Input, Avatar, ProductFrame
- Components: Navigation, Card, FeatureItem, IntegrationItem, ScreenshotContainer
- Marketing Patterns: Hero/ProductScreenshot/Split, Hero/ProductScreenshot/Centered,
  Feature/Alternating, Product/FullWidthDemo, Workflow/Steps, Comparison/BeforeAfter, CTA/Split
- Experiments: 아직 검증되지 않은 신규 pattern
- Approved Pages: 실제 승인된 page

이 이름은 구조 예시다. 기존 Figma naming convention이 있으면 그것이 우선한다.
