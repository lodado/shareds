---
name: reference-driven-figma-design
description: 'Plan task flows with HCI, compare verified references, explain rough wireframes before Figma editing, then compose and critique editable Figma product or landing designs. Use for Figma-first design work; not frontend implementation, design-to-code, or static-image-only delivery.'
metadata:
  short-description: Build editable Figma designs from verified references
---

# Reference-Driven Figma Design

편집 전 [Edit contract](references/edit-contract.md)로 ASSEMBLE / LOCALIZE / FIDELITY / RESKIN / REDESIGN과 섹션별 보존·변경 범위를 고정한다. 컴포넌트 연결, 시각 충실도, 콘텐츠, 레이아웃을 독립 검증한다.

좋은 구조를 조사하고 기존 시각 시스템의 언어로 번역해, 사람이 계속 편집할 수 있는 Figma 시안을
만든다. AI의 무제약 창작이 아니라 **Understand → Research → Sketch & Explain → Map → Compose → Critique → Refine →
Accumulate**가 기본이다.

## 5개 계층 — 작업 단계가 아니라 결정의 의존관계

Garrett의 **Strategy → Scope → Structure → Skeleton → Surface**는 아래의 추상적 목적을 위의
구체적 표현으로 연결한다. 아래 계층을 전부 끝내야 다음 작업을 시작하는 waterfall이나 단계별
승인 절차가 아니다. 조사·스케치·시각 실험은 겹칠 수 있지만, 영향을 주는 하위 결정이 미정이면
상위 결과는 가설로 남긴다. 위쪽에서 발견한 문제는 원인이 있는 계층과 영향받는 결정만 다시 연다.

| 계층      | 결정                                                 | 기존 실행 루프에서 다루는 곳                   |
| --------- | ---------------------------------------------------- | ---------------------------------------------- |
| Strategy  | 사용자 요구·제품 목적·핵심 과업·성공 신호            | Normalize / Model the task의 brief             |
| Scope     | 기능·콘텐츠·상태·기기와 포함/제외·보존 범위          | Normalize / Inspect의 scope·locked constraints |
| Structure | 정보 분류·화면 관계·행동/상태/복구 흐름              | Model the task / Research의 HCI 흐름           |
| Skeleton  | 화면 내 위계·배치·탐색·키보드/반응형 의도            | Sketch & explain의 러프 와이어프레임           |
| Surface   | 시각 시스템·실제 콘텐츠 표현·지각 가능한 모션/피드백 | Compose / Pilot / Critique의 실제 Figma 시안   |

각 지점에서 [단계별 Grill 질문](references/request-contract.md) §3으로
중요한 빈칸만 확인한다. 자료에 있는 답은 추출하고 위임된 세부는 직접 결정한다. 작은 Fidelity/RESKIN
수정에 목적 인터뷰나 새 와이어프레임을 강제하지 않는다. 기존 HCI 설명·출처·권한 게이트는 유지한다.
기존 화면을 Surface부터 분석할 수 있지만 관찰만으로 제품 전략이나 정책이 확인됐다고 하지 않는다.

## 제작 방식부터 고정한다

“레퍼런스 조립” 요청은 **편집 가능한 원본 frame/component/instance를 가져와 조합**하는 작업이다.
스크린샷을 보고 비슷하게 재그리기, UI 전체를 이미지로 대체하기, 코드 구현으로 제작 방식을 바꾸지 않는다. UI 레퍼런스 스크린샷은 관찰·비교 QA의 증거이지 편집 가능한 UI를 대체하는 조립 재료가 아니다. 원본에 포함된 제품 스크린샷 등 실제 콘텐츠 에셋은 유지할 수 있다.
이미 정해진 산출물·원본·허용 변형·제외 범위는 brief에 유지하고 다시 묻지 않는다. 필요한 원본을 확보하지 못하면 해당 부분을 HOLD로 남기며, 대체 제작 방식은 사용자 결정 없이는 바꾸지 않는다.
[조립 매핑](references/figma-composition.md)으로 큰 단위 자산부터 확인하고 [출처·파일럿 게이트](references/component-source-gate.md)를 통과한다.
“한방에/알아서”는 자산 선택·조립·수정·검토를 내부에서 완수하라는 뜻이지 검증 생략이나 근거 없는 완료 선언을 허용하지 않는다.

## Figma 편집 전에 HCI와 러프 와이어프레임을 설명한다

새 화면·주요 구성/행동 변경 또는 사용자의 와이어프레임 요청에는
[HCI → reference → wireframe](references/hci-wireframe-workflow.md)을 먼저 읽는다.
사용자·과업·사용 맥락·성공 신호와 행동→피드백→오류/복구를 정의하고, 같은 과업의 레퍼런스를 비교한다.
**첫 대상 Figma 쓰기 전에** 번호가 붙은 텍스트 와이어프레임과 핵심 상태, 채택/기각 근거,
사용자 동선과 Figma 구현 매핑을 대화에 보여준다. 내부 메모만 쓰거나 완성 시안 뒤에 설명하지 않는다.
Figma 읽기·자산 조사는 선행할 수 있다. 러프 스케치는 설계 가설이지 편집 가능한 원본이나 최종 납품물이 아니다.
검토를 기다리라는 명시 요청이 있으면 멈추고, 그렇지 않으면 설명 후 위임 범위에서 계속한다. 설명을 사용자 승인으로 기록하지 않는다.
구조·행동이 그대로인 작은 내부 수정은 기존 근거를 재사용하며 새 조사·와이어프레임을 강제하지 않는다.
이 단계도 프롬프트 실행 계약이며 MCP 호출을 물리적으로 차단하는 런타임 훅은 아니다.

시각 방향이 미정이거나 대안 요청이 있으면 [Visual direction](references/visual-direction.md)을 읽는다.
사전 설명 뒤 출처 게이트를 통과한 원본으로 대표 구간의 시각 대안을 비교·선정하고 확장한다.
방향이 고정된 수정에는 대안을 강제하지 않는다. 피드백은 대상 영역과 관찰 가능한 문제로 좁히고,
같은 콘텐츠·viewport·상태에서 변경 전후를 확인한다. 와이어프레임 설명은 시각 품질 검증이 아니다.

## 필수 taxonomy·화면 근거·응용 계약

새 화면·주요 구성 변경·컴포넌트 대안 탐색은 검색 전에
[Taxonomy → reference → adaptation](references/taxonomy-reference-workflow.md)을 읽는다.
내부 적합성 확인 후 필요한 사전 항목의 정의·fit/avoid를 검색 의도로 번역하고,
**taxonomy 판단 근거 / 관찰한 화면 구성 / 실제 편집 자산**을 따로 확인한다.
키워드만 보고 임의로 그리거나 컴포넌트 import를 좋은 화면 구성의 증거로 대신하지 않는다.

템플릿은 출발점이지 부품의 한계가 아니다. 콘텐츠·밀도·상태·모바일 불일치가 있으면 승인 범위 안에서
다른 출처를 능동적으로 찾아 변형·재조합하고, 원본·연결 상태·변경 이유를 기록한다.
전체 확장 전 실제 레퍼런스와 파일럿을 나란히 비교해 위계·비율·밀도·여백·읽기 순서를 검증한다.
기존 컴포넌트 출처 게이트와 작은 내부 수정의 예외는 유지한다. 이 계약은 프롬프트 규칙이며 런타임 차단 훅은 아니다.

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

## 필수 컴포넌트 출처 게이트 — 본 시안 변경 전에

**템플릿은 시각 기준이지 선택지의 상한이 아니다.** 필요한 역할·콘텐츠·상태·기기 변형이 없거나,
사용자가 외부 레퍼런스/컴포넌트 비교를 요청하면 [component-source-gate.md](references/component-source-gate.md)를
먼저 읽고 통과한다. 기존 컴포넌트가 있다는 이유로 이 게이트를 건너뛰지 않는다.

- 부족한 부분은 외부의 **서로 다른 출처 2곳 이상**을 실제 조사하고 편집 가능한 후보를 같은 콘텐츠로 비교한다.
  검색 결과·스크린샷·한 라이브러리의 여러 Variant는 서로 다른 출처의 실제 컴포넌트 비교를 대체하지 못한다.
- 기존 구조의 적합성이 확인됐고 외부 비교 요청도 없는 오타·간격·상태 수정은 그 근거를 남기고 재사용한다.
  승인된 정확한 원본 보존/외부 반입 금지 범위를 검색 할당량으로 깨지 않는다.
- 증거가 부족하면 해당 부분의 채택·확장·완료 선언을 중단한다. 검색 실패를 임의 창작·역할 바꾸기·무단
  detach 허가로 해석하지 않는다. `ㄱㄱ`, `빨리`, `한방에`는 게이트 생략 승인이 아니다.
- `PILOT_READY`/`FIGMA_READY`와 “완료/정상 확인” 표현은 출처 게이트 및 실제 가독 크기의 시각 검토 통과 후에만 쓴다.
  도구 성공 응답과 전체 페이지 축소판은 검토 증거가 아니다. 도구·권한·라이선스 제약은 그대로 보존한다.

## Capability gate

컴포넌트 출처 탐색은 편집 가능한 Figma Library/Community/UI Kit를 우선하고,
구도 리서치는 사용 가능한 Refero를 우선한다. 두 경로는 서로의 실제 자산/관측 증거를 대체하지 않는다.

작업 전 실제 도구와 권한을 확인한다. 제품명만 보고 기능을 추측하지 않는다.

사용 가능한 Figma provider의 도구 설명과 필수 companion skill을 먼저 읽고 그 실행 규칙을 따른다.
예를 들어 공식 provider가 요구하면 `figma-use`, 페이지 작업의 `figma-generate-design`, component
작업의 `figma-generate-library`를 해당 작업 전에 읽는다. 설치되지 않은 skill이나 API를 가정하지 않는다.

- 최종 Figma 제작에는 **Figma read/write가 필수다.** 파일·page·frame·Variables·Components·Variants·Auto Layout을
  실제로 읽고, 별도 working 영역을 쓰며, 결과를 다시 열어 볼 수 있어야 한다. 존재하지 않는
  node ID, component ID, variable, version을 만들지 않는다.
- Figma write가 없으면 상태를 BLOCKED로 내고 필요한 연결 또는 권한을 요청한다. 리서치 메모나
  후보 비교는 제한 산출물일 뿐 Figma 완료로 보고하지 않는다.
  읽을 수 있는 자료의 HCI·레퍼런스 비교·텍스트 와이어프레임 설명은 독립적으로 준비할 수 있다.
  준비 산출물과 막힌 Figma 제작을 분리하고, 권한·출처 게이트를 통과한 것으로 취급하지 않는다.
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
- 이 규칙은 외부의 편집 가능한 component/kit 반입을 금지하지 않는다. 출처 게이트에서 채택한
  instance/프레임은 실제로 재사용하고, 승인된 토큰으로 조정한 override와 연결 상태를 기록한다.

## 실행 상태

| 상태        | 의미                                            |
| ----------- | ----------------------------------------------- |
| DISCOVERED  | 소스·권한·자산·미결정이 구분됨                  |
| NEEDS_INPUT | 제품 방향을 바꾸는 필수 결정이 남음             |
| BRIEF_READY | 작업 계약과 source hierarchy가 준비됨           |
| PILOT_READY | 합의된 핵심 pilot이 Figma에서 작성·비평됨       |
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
3. **Model the task and translate the PRD.** Strategy·Scope의 근거를 기존 brief와 범위에서 확인하고,
   Structure의 HCI 브리프로 사용자·과업·맥락·성공 신호와
   핵심 행동/상태/복구를 정리한다. 각 섹션은 User Question, Communication Goal, Required Content,
   Available Evidence, Desired Action, Available Visual Assets로 바꾼다. 랜딩에는 설득·다음 행동의 흐름을,
   제품 UI에는 과업·상태 전이를 우선하며 불필요한 폼이나 화면을 추가하지 않는다.
4. **Select a base candidate.** 지정 template이 없으면
   [research and selection](references/research-selection.md) 기준으로 접근 가능한 후보를 비교한다.
   내부 시스템이 범위를 충분히 해결하면 `internal-default`로 선택하고 외부 template 검색을 생략한다.
   이 단계는 읽기 전용 후보 선정이다. preview만 본 내부 구조나 아직 복제하지 않은 자산을 검증됐다고 하지 않는다.
5. **Research references and inspect candidates.** 부족한 컴포넌트와 사용자가 요청한 외부 대안의
   화면·동작·편집 원본·권리를 읽기 전용으로 조사한다. 구도 참고만으로 컴포넌트 탐색을 대신하지 않는다.
6. **Sketch, explain, then compare and map.** Structure의 연결과 Skeleton의 화면 배치를 구분하고,
   HCI 계약의 러프 와이어프레임과 설명을 먼저 보여준다.
   실제 반입·비교판 작성도 Figma 쓰기이므로 설명 및 명시된 검토 대기 뒤에 한다.
   필수 출처 게이트의 실콘텐츠 비교를 마친 후 후보를 확정하고 Reference element를
   기존 Figma component/variant/primitive에 매핑한다. 비교 결과로 스케치가 바뀌면 이유를 설명한다.
   우선순위는 적합성이 검증된 내부 자산 → 출처 게이트에서 채택한 외부 자산 →
   게이트가 허용한 내부 primitive 조합/새 Experiment다. 비교가 요청됐다면 내부 자산도 비교 후 선택한다.
7. **Compose safely.** [Figma composition](references/figma-composition.md)에 따라 원본을 보존하고
   Working Page, duplicated frame 또는 Experiment Area에서 instance, property, variable,
   auto layout으로 만든다. 불필요한 detach를 피한다.
8. **Pilot first.** Surface는 위 계층의 의도를 승인된 시각 시스템으로 표현한다. 방향이 미정이면
   [시각 대안](references/visual-direction.md)으로 비교하고, 위임된 선택은 직접 끝낸다.
   전체 페이지보다 Hero, strongest product/evidence, workflow/explanation 또는
   PRD에 더 적합한 약 3개 섹션을 실제 copy·screenshot·brand asset으로 먼저 만든다.
   단일 화면·부분 수정은 합의 범위 안의 1–3개로 제한하며 섹션이나 기기를 추가하지 않는다.
9. **Critique and refine.** 문제의 원인이 있는 계층을 먼저 찾고, 범위·흐름 문제를 장식으로 덮지 않는다.
   [critique loop](references/critique-refinement.md)로 실제 Figma 결과를
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

질문은 [단계별 Grill 규칙](references/request-contract.md) §3에 따라
선행관계를 지키며 한 번에 최대 1–3개만 묻고 추천안과 디자인 영향을 함께 제시한다.
사소한 spacing·variant·section 순서는 승인 범위 안에서 직접 결정한다.

## 완료 게이트

FIGMA_READY는 다음이 모두 사실일 때만 쓴다.

- 현재 범위에 영향을 주는 5개 계층의 결정 근거가 기존 brief·scope·Reference Log에 연결돼 있고,
  결과를 바꾸는 미결정을 임의 가정이나 시각 마감으로 덮지 않았다. 계층별 별도 문서·승인은 요구하지 않는다.

- HCI 사전 설명 대상이면 와이어프레임·핵심 상태·결정 근거를 대상 편집 전에 보여준 기록이 있다.
  Figma 결과를 그 과업/상태와 대조하고 변경 이유·미검증 동작을 남긴다. 작은 수정의 생략 근거도 기록한다.
- 변경한 각 역할의 출처 게이트 통과 또는 정당한 내부 재사용 근거가 Reference Log에 있다.
  후보·권리·실제 복제/연결·override·적용 위치·가독 크기 비교 증거 중 필요한 항목이 없으면 완료가 아니다.
- 실제 Figma URL과 정확한 file/page/frame 식별자를 전달할 수 있다.
- 결과가 editable이고 component/variable/auto-layout 사용 여부를 실제 확인했다.
- 합의된 desktop/mobile과 필요한 핵심 상태를 직접 열어 보았다.
- visual hierarchy, composition, rhythm, product emphasis, consistency, authenticity를 비평했다.
- AI slop 검사를 통과했고 실제 재검토와 필요한 top fixes 기록이 있다. 2–4회는 권장치이며,
  작은 수정은 1회로 충분할 수 있다. 회수보다 합의 범위와 품질 게이트 충족을 확인한다.
- 합의된 Reference Log와 Component Catalog 변경이 Figma 또는 지정된 내부 자산 위치에 남아 있다.
  기존 자산만 재사용해 변경이 없으면 그 이유를 기록하며 불필요한 새 자산을 만들지 않는다.
- 가짜 metric, testimonial, product UI, 접근하지 않은 정보가 없다.

완료 보고는 [delivery contract](references/delivery-contract.md)를 따른다. 자기 비평은 사용자 승인이나
독립 QA를 대신하지 않으며, 미확인 범위는 숨기지 않는다.
