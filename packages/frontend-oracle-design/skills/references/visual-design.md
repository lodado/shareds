# UI 시각 디자인 의도 계약

보이는 UI를 새로 만들거나 layout·palette·typography·copy·motion·responsive behavior·
visual identity를 바꿀 때만 읽는다. 기존 시각 계약을 그대로 쓰는 behavior-only 작업은
시각 범위와 N/A 사유만 기록하고 이 절차를 확장하지 않는다.

## 목차

1. 권위와 시각 범위
2. Design Proposal과 Design Change Confirmation
3. Design Intent 형식
4. 증거 계층
5. 두 번의 설계 pass
6. Delivery 증거와 피드백
7. 금지

## 1. 권위와 시각 범위

승인된 기획서·브랜드·디자인 시스템·Figma·content guide와 사용자의 명시적 답변만
시각 정책의 출처다. 각 자료는 자신의 관할 안에서만 사용한다. Figma는 layout·copy·
interaction을 정할 수 있지만 API idempotency를 정하지 못하고, API 계약은 그 반대다.

AI가 만든 시각 방향과 가용한 `frontend-design` skill의 결과는 **Design Proposal**이지
정책 출처가 아니다. `frontend-design` skill은 identity-shaping 제안이 실제로 필요할
때만 로드한다. 제안이 결과를 바꾸면 아래 Design Change Confirmation 전에는 카드에
잠그지 않고 `NEEDS_DECISION`으로 멈춘다.

승인된 시각 요구의 불일치는 `PRODUCT_DEFECT` 또는 카드 누락이면 `POLICY_GAP`이다.
reviewer의 출처 없는 개인 취향만 `NON_ORACLE_OPINION`이다.

Oracle Card에 아래 시각 범위를 하나 기록한다.

| 범위               | 조건                                                   | 처리                                                                   |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `behavior-only`    | 기존 component·token·시각 결과를 그대로 유지           | 전체 디자인 계획 N/A와 사유 기록                                       |
| `local`            | 기존 화면의 state·copy·hierarchy·reflow 일부 변경      | 기존 디자인 시스템을 재사용하고 영향 축만 계약한 뒤 명시적 사용자 확인 |
| `identity-shaping` | 새 page·대규모 redesign·브랜드 인상을 만드는 핵심 화면 | 아래 두 pass와 명시적 사용자 확인을 거쳐 전체 Design Intent 잠금       |

시각 범위와 기능 Risk는 별개다. 단순한 화면도 위험한 mutation이면 High risk일 수 있고,
identity-shaping이어도 부작용 피해가 작으면 기존 Risk 규칙에 따라 판정한다.

## 2. Design Proposal과 Design Change Confirmation

승인된 기준이 충분하면 그대로 실행 가능한 계약으로 번역한다. 기준이 부족한
identity-shaping 작업만 다음 순서로 제안한다.

1. subject, audience, page의 single job을 구체적으로 정한다.
2. subject의 실제 재료·언어·도구·구조에서 시각 방향을 도출한다.
3. color·type·layout·signature·copy·motion을 한 묶음으로 제안한다.
4. genericity self-review로 다른 제품에도 그대로 붙을 선택을 수정한다.
5. 수정한 제안과 버린 대안을 사용자에게 제시한다.
6. 승인된 답만 Source Registry에 등록하고 Design Intent에 잠근다.

에이전트 추천을 무응답 default로 적용하지 않는다. 승인된 기준끼리 충돌하거나 결과를
바꾸는 축이 남으면 현재 제안과 질문을 제시하고 `NEEDS_DECISION`으로 돌아간다.

### Design Change Confirmation — 필수 게이트

`local`·`identity-shaping`처럼 보이는 디자인 결과를 바꾸면 Oracle lock·테스트 작성·
production 수정 전에 반드시 사용자에게 아래 내용을 보여주고 명시적 확인을 받는다.

1. 현재 결과에서 바뀌는 palette·type·layout·copy·motion·responsive·signature 축
2. 승인된 source와 새 Design Intent
3. 유지할 기존 요소와 버린 대안
4. viewport·theme·reduced-motion에서 달라지는 결과

승인된 Figma·PRD·디자인 시스템은 변경 방향의 출처지만 사용자 확인을 대신하지
않는다. 포괄적인 “redesign”, “더 예쁘게” 요청도 구체 Design Intent의 승인으로
간주하지 않는다. 이전 사용자 메시지는 **제시된 전체 Design Intent를 명시적으로
확인한 답변**일 때만 재질문 없이 사용할 수 있다.

확인 답변의 메시지 위치 또는 식별 가능한 인용을 Oracle Card에 기록한다. 답이 없거나
일부 축만 승인되면 카드 현재본과 남은 질문을 출력하고 `NEEDS_DECISION`으로 멈춘다.
`behavior-only`는 기존 시각 결과를 바꾸지 않으므로 이 게이트를 N/A로 기록한다.

## 3. Design Intent 형식

Design Intent와 Visual Contract는 별도 임시 파일이 아니라 **같은 Oracle Card bytes**에
포함한다. 승인된 로컬 디자인 자료는 `oracle-lock.mjs --source`로 함께 잠그고, 원격
Figma·URL은 정확한 file·page·frame·version을 카드에 기록한다.

```markdown
### Design Intent

- Visual scope: behavior-only | local | identity-shaping
- Subject:
- Audience:
- Single job:
- Visual thesis:
- Signature element:
- Deliberate aesthetic risk:
- Restraint:
- Voice and canonical vocabulary:
- Approved references:
- Rejected generic direction:
- Design Change Confirmation: 사용자 답변 위치 또는 behavior-only N/A

### Visual Contract

| ID  | 축         | 계약 | Never | 출처      | 증거 계층  |
| --- | ---------- | ---- | ----- | --------- | ---------- |
| D1  | copy       | ...  | ...   | S1        | HARD       |
| D2  | responsive | ...  | ...   | S2        | RELATIONAL |
| D3  | identity   | ...  | ...   | 유저 Q1=A | JUDGMENT   |
```

`behavior-only`이면 Visual scope와 기존 계약을 유지한다는 출처 있는 N/A만 기록한다.
`local`이면 영향받는 축만 작성한다. `identity-shaping`이면 아래 항목을 모두 결정하거나
N/A 사유를 남긴다.

- palette와 semantic token 역할
- display·body·utility typography 역할과 실제 가용 font
- layout hierarchy, reading order, responsive reflow
- 정보 구조를 표현하는 label·divider·numbering
- primary action, loading, error, empty, success의 canonical copy
- signature element 한 가지와 주변 restraint
- motion의 목적·trigger와 reduced-motion 대체
- focus·contrast·keyboard·overflow 등 레포 접근성 계약

구현 class·component tree·임의 pixel 값은 정책 결과가 아닌 한 계약에 넣지 않는다.

## 4. 증거 계층

각 `D*` 행에 주 증거 계층을 하나 기록한다. 여러 계층이 필요하면 evidence mapping에서
보조 증거를 추가하되 독립 증거 개수로 과장하지 않는다.

| 계층         | 대상                                                                        | 대표 증거                                                     |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `HARD`       | 정확히 결정 가능한 copy·role·focus·theme·reduced motion·overflow·token 결과 | component test, Playwright, DOM/a11y, computed style          |
| `RELATIONAL` | hierarchy·reading order·reflow·요소 간 시각 관계                            | 실제 browser, bounding box, 승인 frame 비교, screenshot       |
| `JUDGMENT`   | subject 고유성·typography 성격·signature·절제·voice                         | 승인 brief와 screenshot을 보는 사용자 또는 독립 designer 리뷰 |

- `HARD`를 내부 class name이나 전체 DOM snapshot에 결합하지 않는다.
- `RELATIONAL`을 모든 pixel의 exact coordinate로 바꾸지 않는다.
- `JUDGMENT`를 자동화할 수 없다는 이유로 출처 없는 합격 처리하지 않는다.
- 현재 production screenshot을 승인 없이 golden image로 채택하지 않는다.
- 같은 fixture·mock·reference를 공유하는 증거는 서로 완전히 독립적이라고 보고하지 않는다.

## 5. 두 번의 설계 pass

### Pass 1 — subject 기반 계획

`identity-shaping`일 때만 compact plan을 만든다.

- **Color:** 기존 디자인 시스템을 우선한다. 새 identity면 4~6개 named color와
  semantic 역할을 제안한다.
- **Type:** display·body·utility 역할, 실제 설치·license·loading·fallback을 확인한다.
- **Layout:** 정보 위계를 한 문장과 작은 ASCII wireframe으로 표현한다.
- **Signature:** 이 화면을 기억하게 할 요소 하나만 고른다.
- **Risk:** 접근성이나 사용성을 해치지 않는 시각적 위험 하나만 정당화한다.
- **Motion:** 이해를 돕는 한 순간을 우선하고 산발적인 효과를 피한다.
- **Copy:** 사용자가 인식하는 명사와 능동형 동사를 쓰고 action→pending→success의
  어휘를 일관되게 유지한다.

### Pass 2 — genericity와 restraint 비평

잠그기 전에 다음을 검토하고 수정한 선택과 이유를 기록한다.

1. 전혀 다른 제품에도 palette·type·layout을 그대로 붙일 수 있는가?
2. hero 또는 첫 화면이 subject의 thesis인가, 템플릿형 큰 제목인가?
3. numbering·divider·eyebrow가 실제 정보 구조를 표현하는가?
4. signature 외 장식이나 motion이 주의를 경쟁하는가?
5. 카피가 사용자 언어인가, 내부 구현 용어인가?
6. 한 요소를 제거하면 더 명확해지는가?
7. 실제 content, 긴 문자열, empty·error 상태에서도 방향이 유지되는가?

## 6. Delivery 증거와 피드백

- `HARD` 행은 가장 좁은 관찰 계층에서 테스트하고 `Then`·`Never`를 함께 확인한다.
- `RELATIONAL` 행은 사전 지정 viewport·theme·motion·state의 실제 브라우저에서 본다.
- UI-shaping 작업은 실패 때뿐 아니라 통과한 핵심 상태 screenshot도 증거로 보존한다.
- 대상 레포가 요구하는 320px, 양 theme, visible focus, reduced motion, AA contrast를
  생략하지 않는다.
- `JUDGMENT` 행은 승인 기준·Design Intent·성공 screenshot을 독립 `designer`에게
  전달한다. reviewer는 정책을 새로 만들지 않는다.
- 모든 `D*` 행을 `test | browser scenario | reviewer finding | 출처 있는 N/A`에 매핑한다.
- 새 상태를 만들지 않고 기존 `BROWSER_VERIFIED`와 `REVIEW_VERIFIED`에 포함한다.

피드백은 기존 라우터를 그대로 사용한다.

| 관찰                                                   | 분류                 |
| ------------------------------------------------------ | -------------------- |
| 승인 Figma·Design Intent와 실제 UI 불일치              | `PRODUCT_DEFECT`     |
| source의 시각 요구가 카드에 누락되거나 source끼리 충돌 | `POLICY_GAP`         |
| 잘못된 viewport·font fixture·screenshot 조건           | `HARNESS_DEFECT`     |
| 도구·font asset·브라우저 기동 문제로 판정 불가         | `ENVIRONMENT_DEFECT` |
| 카드 범위 안 시각 증거 누락                            | `EVIDENCE_GAP`       |
| 출처 없는 reviewer 취향                                | `NON_ORACLE_OPINION` |

## 7. 금지

- 모든 UI 변경에 새 palette·font·signature 계획 강제
- reviewer나 에이전트 제안을 승인 없이 Oracle로 잠금
- 디자인 품질을 근거 없는 단일 점수로 축약
- 현재 구현 screenshot을 자동 golden으로 승인
- 전체 DOM snapshot·class name·모든 pixel coordinate에 계약 결합
- 고유성을 이유로 새 디자인 시스템·animation dependency·icon library를 기본 추가
- 여러 signature element와 산발적인 animation 추가
- 접근성·성능·responsive 기본기를 aesthetic risk로 희생
- 시각 검증만을 위한 새 Delivery 상태 머신 추가
