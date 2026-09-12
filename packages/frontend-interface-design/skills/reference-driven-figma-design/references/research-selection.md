# Research and selection — 내부 자산부터 검증 가능한 후보를 고른다

## 1. 검색 순서

항상 다음 순서로 검색한다.

1. Existing Component Catalog
2. Existing Figma Library
3. Existing Approved Patterns
4. 현재 파일의 template, variables, components, variants
5. Refero
6. Aside/Browser를 통한 외부 web
7. New Design

적합한 내부 자산이 있으면 그 역할의 외부 검색은 생략할 수 있다. 외부 검색 개수 자체는 품질
증거가 아니다.

## 2. 내부 인벤토리

Figma 도구로 실제 구조를 읽고 다음을 기록한다.

| 자산               | 확인할 내용                                                  |
| ------------------ | ------------------------------------------------------------ |
| Foundations        | colors, typography, spacing, radius, grid, elevation과 mode  |
| Primitives         | button, badge, icon, input, avatar, product frame            |
| Components         | navigation, card, feature, integration, screenshot container |
| Marketing Patterns | hero, feature, product demo, workflow, comparison, CTA       |
| Approved Pages     | 실제 승인된 page/frame와 적용 범위                           |
| Experiments        | 아직 승격되지 않은 pattern과 사용 이력                       |

이름이 비슷하다는 이유만으로 역할이 같다고 단정하지 않는다. instance가 가리키는 component,
property, variant, auto layout, variable binding을 실제로 확인한다.

## 3. Base Figma Template 자동 선정

사용자가 지정하지 않았으면 내부 후보 다음에 Figma Community, 공식 UI Kit, 신뢰할 수 있는
template library, SaaS landing/product kit를 찾는다. “가장 예쁜 것”이 아니라 아래 기준을 0–5로
평가한다.

| 기준                 | 비중 | 판정 질문                                                              |
| -------------------- | ---: | ---------------------------------------------------------------------- |
| Content/Product fit  |   20 | PRD의 콘텐츠 유형과 screenshot을 자연스럽게 담는가                     |
| Visual/Brand fit     |   15 | 승인 방향으로 낮은 비용에 조정 가능한가                                |
| Structural quality   |   20 | Auto Layout, Variables, Components, Variants, Properties가 실제 있는가 |
| Coverage             |   10 | 필요한 section/state를 충분히 제공하는가                               |
| Responsive readiness |   10 | desktop/mobile 구조와 adaptation 가능성이 있는가                       |
| Editability          |   10 | detach나 one-off 재작업 없이 agent와 사람이 편집 가능한가              |
| Adaptation cost      |   10 | 실제 copy/assets 적용과 customisation 비용이 합리적인가                |
| Access/Rights        |    5 | 실제 접근·복제·편집·사용 권한을 확인했는가                             |

상위 2–3개를 비교하되 후보 수를 최적값으로 취급하지 않는다. 강한 후보는 Figma 도구로 내부
구조를 검사한다. 웹 preview만 본 후보는 `preview-only`, 내부를 읽은 후보는
`structure-inspected`, 실제 복제·편집까지 확인한 후보는 `editable-verified`로 표시한다.

화려하지만 구조가 나쁜 template보다 단순해도 variables/components/auto layout이 잘 구축된
template을 우선한다. 선택된 template은 이후 Visual Source of Truth다.

## 4. 섹션별 Reference Research

내부 자산으로 부족한 중요한 섹션에 서로 다른 후보를 보통 2–3개 찾는다.

- Product Screenshot Hero
- Developer Tool Hero
- Workflow / Product Demo
- Before/After / Comparison
- Version History / Diff Visualization
- Integrations / Technical Explanation
- Evidence / CTA

각 후보에 다음을 기록한다.

| 항목              | 분석                                         |
| ----------------- | -------------------------------------------- |
| problem           | 어떤 communication/user problem을 해결하는가 |
| focal point       | 첫 시선과 가장 큰 시각 면적은 무엇인가       |
| hierarchy         | 어떤 크기·정렬·그룹 관계 때문에 읽히는가     |
| density           | copy, control, image의 밀도와 리듬           |
| product treatment | screenshot crop, frame, annotation, scale    |
| CTA               | 위치, 우선순위, product evidence와의 관계    |
| responsive        | 좁은 화면의 순서·축소·생략·재배치            |
| fit               | 현재 PRD와 실제 assets에 맞는가              |
| adaptation        | 현재 Figma system으로 번역하기 쉬운가        |
| adopt             | 가져올 구조적 원리                           |
| reject            | 복사하지 않을 visual/brand 요소              |
| evidence          | 실제 URL/file/page/frame와 관측 상태         |

Refero는 composition과 hierarchy의 우선 조사원이다. 실제로 연결된 Refero MCP 또는 인증된
`styles.refero.design` session만 사용하고 접근 결과를 기록한다. 적절한 사례가 없거나
state/interaction/responsive를 확인할 수 없으면 Aside/Browser로 실제 서비스와 관련 library를 연다.
검색 snippet이나 정적 screenshot만으로 interaction을 확인했다고 하지 않는다.

## 5. Reference Selection

다음 항목을 같은 0–5 척도로 비교한다.

- Content Fit
- Information Hierarchy
- Visual Hierarchy
- Product Screenshot Compatibility
- Responsive Behavior
- Communication Effectiveness
- Current Design System Compatibility
- Existing Component Reusability
- Adaptation Cost

점수는 판단 보조다. hard constraint를 위반한 후보는 합계가 높아도 제외한다. 선택 이유는
“예뻐서”가 아니라 어떤 사용자 질문을 어떤 구조로 해결하며 기존 component로 어떻게 옮길 수
있는지로 쓴다.

## 6. Reference Log

각 주요 섹션에 다음을 Figma의 지정된 Reference Log page/section 또는 승인된 catalog 위치에
남긴다.

- Section
- Selected Reference
- Source와 관측 상태
- Problem Solved
- Structural Principle Reused
- What Was NOT Copied
- Figma Components Used
- Selection Reason

여러 reference를 사용해도 최종 visual system은 하나여야 한다. Reference Log는 외부 디자인
언어가 섞이는 것을 막는 decision record다.
