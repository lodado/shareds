# Critique and refinement — 전체를 버리지 않고 영향이 큰 문제를 고친다

첫 시안을 만든 직후 실제 Figma canvas와 preview를 다시 연다. node 생성 응답이나 성공 메시지는
시각 검토가 아니다.

## 1. 여섯 축 비평

### Hierarchy

- 가장 중요한 message, product evidence, CTA가 실제로 가장 강한가?
- type size뿐 아니라 면적, 위치, 대비, 여백이 같은 우선순위를 말하는가?

### Composition

- section이 User Question과 Required Content의 관계를 명확하게 전달하는가?
- reference에서 선택한 구조 원리가 현재 content에서도 남아 있는가?

### Rhythm

- 모든 section의 alignment, density, height, visual weight가 똑같지 않은가?
- page가 강조와 휴식, 설명과 증거 사이에 의도적인 속도 변화를 갖는가?

### Product Emphasis

- 실제 product screenshot/demo가 장식으로 축소되거나 무의미한 floating UI에 가려지지 않는가?
- crop과 annotation이 증거를 더 잘 읽게 하는가?

### Consistency

- typography, color, spacing, radius, surface, icon, product frame이 하나의 system인가?
- 서로 다른 reference의 visual language가 섞이지 않았는가?

### Authenticity

- 이 제품의 실제 content와 강점 때문에 생긴 화면인가?
- generic AI SaaS template처럼 제품명만 교체한 결과가 아닌가?

## 2. AI slop detection

다음 요소가 있으면 각각 PRD, visual system, selected reference 또는 usability 근거를 찾는다.
근거가 없으면 제거하거나 구조를 바꾼다.

- 과도한 card, pill, gradient
- 의미 없는 glassmorphism, glow, floating UI
- 모든 요소가 rounded rectangle
- 모든 section center alignment
- 반복되는 bento grid
- 의미 없는 chart
- 가짜 metric, testimonial, customer logo
- 모든 section의 동일한 layout, density, visual weight
- product와 무관한 abstract orb 또는 decorative dashboard
- 실제 기능으로 오인되는 가짜 product UI

AI slop 검사는 특정 스타일 금지가 아니다. 목적과 source가 없는 관성적 장식을 탐지하는 과정이다.

## 3. 반복 방법

각 round에서 가장 영향이 큰 문제를 최대 3개 고른다. 문제가 적으면 채워 넣지 않는다.

예:

1. Product screenshot이 너무 작아 evidence 역할을 못 한다.
2. Workflow가 card 나열이라 순차성이 전달되지 않는다.
3. Hero와 다음 section의 visual weight가 같아 entry hierarchy가 없다.

그 세 문제와 직접 관련된 frame/component만 수정한다. 잘된 hierarchy, copy, system mapping은
유지한다. 전체 page를 다시 생성하지 않는다.

권장 루프:

1. V1 → critique → top 3 fixes
2. V2 → critique → remaining high-impact fixes
3. V3 → targeted polish
4. 필요한 경우에만 V4

일반적으로 2–4회의 의미 있는 반복을 우선한다. 색 하나를 바꾸거나 관찰 없이 다시 저장한 것은
iteration으로 세지 않는다. 2–4회는 권장치이지 최소·최대 게이트가 아니다. 작은 변경은
1회 실제 비평과 필요한 수정 후 재검토로 충분할 수 있고, 추가 반복이 필요하면 이유를 기록한다.
횟수를 채우기 위한 수정이나 관찰하지 않은 round를 만들지 않는다. 같은 문제가 두 round 연속 개선되지 않으면 미세 조정 대신 source
selection, mapping 또는 asset 조건으로 돌아간다.

## 4. Round record

각 round에 최소한 다음을 남긴다.

- inspected Figma page/frame과 viewport/state
- 관찰한 문제와 영향
- 선택한 top fixes
- 변경한 frame/component/variable
- 유지한 부분
- 이전 round 대비 개선 또는 회귀
- 남은 unresolved/unreviewed

V1, V2, V3를 모두 복제해 canvas를 어지럽히지 않는다. 사용자가 비교본을 요구하지 않았다면
최종 frame과 간결한 critique history만 유지한다.

## 5. 완료 판정

다음이면 FIGMA_READY가 아니다.

- Figma 결과를 다시 열어 보지 못했다.
- 합의한 desktop/mobile/state가 unreviewed다.
- 핵심 product asset이 placeholder인데 실제처럼 보인다.
- hierarchy나 content fit의 큰 실패를 polish로 덮었다.
- 실제 critique와 필요한 수정 후 재검토 기록이 없다.
- 다른 reference의 visual system이 섞여 있다.

자기 비평은 `design-self-review: ready | incomplete | unreviewed`로 기록한다. 사용자 수락은 실제
응답이 있을 때만 `accepted`이며, 자기 비평으로 대신하지 않는다.
