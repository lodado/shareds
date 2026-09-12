---
name: reference-driven-figma-design
description: 'Research, compose, critique, and maintain production-quality editable Figma product or landing designs from PRDs, internal assets, templates, and verified UI references. Use for Figma-first design work; not frontend implementation, design-to-code, or static-image-only delivery.'
metadata:
  short-description: Build editable Figma designs from verified references
---

# Reference-Driven Figma Design

좋은 구조를 조사하고 기존 시각 시스템의 언어로 번역해, 사람이 계속 편집할 수 있는 Figma 시안을
만든다. AI의 무제약 창작이 아니라 **Research → Select → Map → Compose → Critique → Refine →
Accumulate**가 기본이다.

## 결과와 역할 경계

- 최종 산출물은 실제 Figma 파일의 편집 가능한 frame, component instance, variable, auto layout이다.
- Product Design Researcher, Design Director, Reference Researcher, Template Selector,
  Composition Agent, Figma Operator, Visual Critic, Design Asset Librarian 역할을 수행한다.
- 사용자가 별도로 구현을 명시하기 전에는 React, HTML/CSS, Tailwind, Next.js, 디자인-코드 변환,
  프론트엔드 프로젝트 생성을 하지 않는다. 구현을 함께 요청받아도 이 스킬의 완료 단위는 Figma
  handoff다.
- PNG, 설명 문서, 코드, 이미지 생성물은 편집 가능한 Figma를 대신하지 못한다.

## 핵심 원칙

1. Research before invention.
2. Internal assets before external research.
3. Reuse before creating.
4. Adapt before replacing.
5. Composition references are not visual systems.
6. Critique before completion.

## Capability gate

작업 전 실제 도구와 권한을 확인한다. 제품명만 보고 기능을 추측하지 않는다.

- **Figma read/write가 필수다.** 파일·page·frame·Variables·Components·Variants·Auto Layout을
  실제로 읽고, 별도 working 영역을 쓰며, 결과를 다시 열어 볼 수 있어야 한다. 존재하지 않는
  node ID, component ID, variable, version을 만들지 않는다.
- Figma write가 없으면 상태를 BLOCKED로 내고 필요한 연결 또는 권한을 요청한다. 리서치 메모나
  후보 비교는 제한 산출물일 뿐 Figma 완료로 보고하지 않는다.
- Refero가 실제 사용 가능하면 composition, hierarchy, section structure, product presentation,
  interaction pattern 조사에 우선 사용한다.
- Refero가 없거나 결과가 부족하면 사용 가능한 Aside/Browser로 Figma Community, 공식 UI Kit,
  실제 서비스, 경쟁사, 갤러리, responsive/interaction을 능동적으로 조사한다.
- 웹 미리보기 열람, Figma 내부 구조 확인, Figma 쓰기 권한은 서로 다른 증거다. 접근하지 못한
  구조·상태·동작·라이선스를 확인했다고 쓰지 않는다.

## 디자인 결정 권한

충돌 시 다음 순서를 지킨다.

1. PRD / Product Requirements
2. 승인된 Brand Direction
3. 기존 내부 Design Assets
4. 선택된 Figma Base Template
5. 기존 Figma Variables / Components
6. 승인된 이전 디자인 패턴
7. Refero References
8. Aside/Browser로 조사한 외부 References
9. 새로운 디자인 결정

낮은 우선순위 소스는 높은 우선순위 시스템을 덮어쓰지 않는다. 현재 화면에서 관찰한 사실과 승인된
정책도 구분한다.

## Visual System과 Composition

- **Visual System**은 승인된 내부 시스템과 선택된 Figma Base Template이 소유한다:
  typography, colors, spacing, grid, radius, borders, shadows, buttons, cards, navigation, forms,
  icons, product frames.
- **Composition**은 Refero와 외부 사례에서 선별한다: section structure, information hierarchy,
  screenshot placement, text/image relationship, CTA placement, rhythm, storytelling, comparison,
  workflow representation.
- 외부의 색·폰트·radius·shadow를 함께 복사하지 않는다. 구조를 현재 시스템의 component와
  variable로 번역한다.

## 실행 상태

| 상태        | 의미                                            |
| ----------- | ----------------------------------------------- |
| DISCOVERED  | 소스·권한·자산·미결정이 구분됨                  |
| NEEDS_INPUT | 제품 방향을 바꾸는 필수 결정이 남음             |
| BRIEF_READY | 작업 계약과 source hierarchy가 준비됨           |
| PILOT_READY | 핵심 3개 섹션이 Figma에서 작성·비평됨           |
| FIGMA_READY | 전체 범위가 편집 가능하고 검토·기록까지 완료됨  |
| INCOMPLETE  | 일부 시안은 있으나 완료 게이트를 충족하지 못함  |
| BLOCKED     | 필수 Figma 권한·자산·정책 때문에 진행할 수 없음 |

## 실행 루프

1. **Normalize.** 자연어와 제공 자료를
   [request contract](references/request-contract.md) 및
   [design-request.schema.json](references/schemas/design-request.schema.json)에 맞춰 정리한다.
   이미 주어진 답을 다시 묻지 않는다.
2. **Inspect internal first.** 대상 Figma, 기존 Component Catalog, library, approved patterns,
   variables/components/variants, 실제 copy와 product assets를 먼저 조사한다.
3. **Select a base.** 지정 template이 없으면
   [research and selection](references/research-selection.md) 기준으로 접근 가능한 후보를 비교한다.
   preview만 본 후보의 내부 구조를 검증됐다고 하지 않는다.
4. **Translate the PRD.** 각 섹션을 User Question, Communication Goal, Required Content,
   Available Evidence, Desired Action, Available Visual Assets로 바꾼다.
5. **Research only the gaps.** 내부 자산으로 해결되지 않는 중요한 섹션에 여러 composition 후보를
   찾고 역할 적합성·위계·반응형·전환 비용을 비교한다. 첫 결과나 가장 화려한 결과를 고르지 않는다.
6. **Map before drawing.** Reference element를 기존 Figma component/variant/primitive에 매핑한다.
   우선순위는 Existing Component → Existing Variant → Existing Primitives의 조합 →
   New Reusable Component → One-off Element다.
7. **Compose safely.** [Figma composition](references/figma-composition.md)에 따라 원본을 보존하고
   Working Page, duplicated frame 또는 Experiment Area에서 instance, property, variable,
   auto layout으로 만든다. 불필요한 detach를 피한다.
8. **Pilot first.** 전체 페이지보다 Hero, strongest product/evidence, workflow/explanation 또는
   PRD에 더 적합한 핵심 3개 섹션을 실제 copy·screenshot·brand asset으로 먼저 만든다.
9. **Critique and refine.** [critique loop](references/critique-refinement.md)로 실제 Figma 결과를
   다시 보고 가장 영향이 큰 문제 3개를 수정한다. 일반적으로 2–4회의 의미 있는 반복을 하며,
   잘된 부분은 유지하고 전면 재생성하지 않는다.
10. **Expand.** pilot이 기준을 넘으면 같은 visual system으로 전체 범위, desktop/mobile,
    필요한 상태와 prototype interaction을 확장하고 다시 본다.
11. **Accumulate deliberately.** [asset learning](references/asset-learning.md)에 따라 새 패턴은
    Experiment → real page usage → critique → reuse evaluation → Approved 순서로만 승격한다.
12. **Handoff.** [design-delivery.schema.json](references/schemas/design-delivery.schema.json)에 맞춰
    Figma 위치, source trace, critique, catalog/reference log, 미확인 범위를 전달한다.

## 자율성과 정지 조건

승인된 PRD·brand direction·template·catalog 범위 안의 세부 선택은 질문 없이 끝낸다. 다음에만
사용자 결정을 요청한다.

- 요구사항이 모순되거나 제품 포지셔닝을 바꾸는 선택지가 충돌한다.
- 필수 brand/product asset이 없고 대체 방식이 결과를 바꾼다.
- 외부 서비스 인증·편집 권한이 필요하다.
- 원본 파괴, 외부 공유, 유료 구매 또는 라이선스 의무 수락이 필요하다.

질문은 선행관계를 따라 한 번에 최대 1–3개만 묻고 추천안과 디자인 영향을 함께 제시한다.
사소한 spacing·variant·section 순서는 승인 범위 안에서 직접 결정한다.

## 완료 게이트

FIGMA_READY는 다음이 모두 사실일 때만 쓴다.

- 실제 Figma URL과 정확한 file/page/frame 식별자를 전달할 수 있다.
- 결과가 editable이고 component/variable/auto-layout 사용 여부를 실제 확인했다.
- 합의된 desktop/mobile과 필요한 핵심 상태를 직접 열어 보았다.
- visual hierarchy, composition, rhythm, product emphasis, consistency, authenticity를 비평했다.
- AI slop 검사를 통과했고 top fixes를 반영한 2–4회 반복 기록이 있다.
- Reference Log와 Component Catalog 변경이 Figma 또는 지정된 내부 자산 위치에 남아 있다.
- 가짜 metric, testimonial, product UI, 접근하지 않은 정보가 없다.

완료 보고는 [delivery contract](references/delivery-contract.md)를 따른다. 자기 비평은 사용자 승인이나
독립 QA를 대신하지 않으며, 미확인 범위는 숨기지 않는다.
