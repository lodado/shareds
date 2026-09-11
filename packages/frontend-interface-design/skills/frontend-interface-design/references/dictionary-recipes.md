# Dictionary recipes — 원문 패턴을 섹션 구현 지시로 번역한 예시

`section-implementation.md`의 명세를 작성할 때 §0으로 원문을 찾고 관련 레시피만 읽는다. A–C의 원문 요지는
Vibe Dictionary Markdown에서 발췌·요약했다. 그 뒤의 구조·수치·동작 결정은 **구현 지시 예시**이지
사전의 규범이나 라이브 사이트 관측값이 아니다. 실제 콘텐츠·계약·토큰에 맞게 선택하고 조정 이유를 적는다.
출처 표기는 `파일 → 섹션 제목/패턴 ID`로 남긴다. 줄 번호만 의존하지 않는다.

## 0. 사전 루트와 읽는 순서

사전 루트는 `references/dictionary/`다. 사이트 원본 8개 · 페이지 변환본 3개 · `README.md` · `TOC.md` ·
`SHA256SUMS.txt`를 바이트 그대로 둔 **로컬 스냅샷**(수집 2026-09-11)이며 git에 올리지 않는다. 배포된 플러그인에는
없을 수 있다. 무결성은 `cd references/dictionary && shasum -a 256 -c SHA256SUMS.txt`로 확인하고, 바뀌어 있으면 다시 복사한다.
출처 · 라이선스 · 알려진 불일치는 [reference-sources.md](reference-sources.md)의 스냅샷 절에 있다.

소스는 이 순서로 고르고 어느 것을 썼는지 적는다.

1. 로컬 스냅샷이 있으면 원문을 읽고 `snapshot: 2026-09-11`을 적는다. 라이브 사이트 관측이 아니다.
2. 사용자가 파일/경로를 주면 그것을 쓴다. 스냅샷보다 새 판이면 사용자 판이 우선이다.
3. 둘 다 없으면 이 파일의 A–C 발췌만 쓰고 `패키지 내 요약 참조`로 표시한다. 요약을 원문 읽기로 보고하지 않는다.

파일은 통째로 읽지 않는다(133 KB짜리도 있다). 카테고리 범위나 ID 한 행만 읽는다.

```sh
grep -n '^### ' references/dictionary/layout-taxonomy.md                        # 카테고리 목차
sed -n '/^### 17\./,/^### 18\./p' references/dictionary/layout-taxonomy.md      # 한 카테고리
grep -n '^| sticky-scroll-reveal ' references/dictionary/layout-taxonomy.md    # ID 한 행
grep -n '^| Purple-Blue Gradient ' references/dictionary/ai-slop-taxonomy.md   # Pattern 이름 한 행
grep -n '^## ' references/dictionary/design-movement-converted.md              # 사조 목차 `## 이름 (연도)`
```

| 단계             | 사전 파일                                                                                                  | 읽는 곳                                                                      | 쓰는 곳                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1 Discovery      | `ux-taxonomy.md`                                                                                           | Part 4 페이지 유형 · Part 5 플로우 Sequence                                  | `discovery.md` · `experience-design.md` §1                   |
| 1·2 Adaptation   | `design-movement-converted.md`                                                                             | `## 이름 (연도)` → Visual Cues · 반동 대상 · Lenses                          | `adaptation.md` §2 · `lineages/*.md` · `art-direction.md` §1 |
| 2 Art direction  | `visual-asset-taxonomy.md`; 제작 시 `generative-image-taxonomy.md` · `commercial-photographic-taxonomy.md` | Part 1 기법 · Part 2 구조 · Part 3 표면; Spec · Prompt Fragment · Part 10    | `art-direction.md` 이미지 제작 브리프                        |
| 2 소스 탐색      | `design-references-converted.md`                                                                           | 9 카테고리의 "언제 쓰나"                                                     | `reference-sources.md`                                       |
| 3 Compose        | `layout-taxonomy.md`                                                                                       | 대표 조합 · Part 3 아키타입 Best For/Avoid For · Part 4 블록 · Part 6 페어링 | `section-composition.md` §2                                  |
| 3 Implementation | `layout-taxonomy.md` · `design-taxonomy.md`                                                                | Part 5 스크롤/스티키 Avoid For · Part 2 모션 이름과 의존 라이브러리          | `section-implementation.md` §2 · `experience-design.md` §3   |
| 4 Build (ko)     | `typography-taxonomy.md`                                                                                   | Part 4 §9 한글 조판 · Part 6 §15 한영 페어링                                 | `typography-ko.md`                                           |
| 4·6 상태         | `ux-taxonomy.md`                                                                                           | 25. 상태 유형 · 27. AI UX 패턴                                               | `one-shot.md` §5                                             |
| 5 Look           | `ai-slop-taxonomy.md`                                                                                      | Pattern · Tell · Escape · Part 8 Root Causes                                 | `look.md` §2 비평                                            |
| —                | `dev-wiki-converted.md`                                                                                    | 읽지 않는다(스킬 무관)                                                       | —                                                            |

사전 항목은 `document-only` 참고다. 관측값 · 사용자 소유 소스 · 접근성 하한 · 프로젝트 토큰보다 앞서지 않는다
(`one-shot.md` §1). `Prompt Example` · `Build` 열은 후보이지 결정값이 아니다. 원문의 오탈자 · 수치 불일치는 고치지 않는다.

## A. 요금제 화면 — 조건 → 같은 기준의 비교 → 선택

### 원문에서 가져온 것

- `layout-taxonomy.md` → 대표 조합 구성 → `configured-plan-selection`:
  “사용량 조건을 먼저 정하고 가격과 기능 차이를 같은 기준으로 확인한다.”
  필수는 `comparison-table`, 선택은 `sectioned-stack`, 반응형은 `reflow-reorder`.
- 같은 파일 → `comparison-table`: 항목은 행, 비교 대상은 열. 서사형 설명에는 부적합하며
  좁은 화면에는 카드형 재배치를 제안한다. `outlined-containers`·`tonal-surface-separation`의
  경계·숫자 정렬은 비교 기준을 드러내는 데 쓴다.
- `typography-taxonomy.md` → Micro-typography → `tabular-nums`:
  `font-variant-numeric: tabular-nums`로 가격·표 수치의 폭을 맞춘다.

### 구현 지시는 이 정도로 쓴다

조건: 승인된 플랜 세 개와 동일한 비교 항목, 월/연 결제 데이터·목적지가 제공된 경우.

- **S1 / 조건 선택:** H1·설명 아래 월/연 라디오 그룹을 둔다. 변경 시 부모의 `billingPeriod` 하나를 갱신하고
  S2 가격·단위·S3 링크를 제공된 데이터로 함께 갱신한다. 할인율을 역산해 홍보 문구를 만들지 않는다.
  결제 주기 기능이 계약에 없으면 이 제어 자체를 넣지 않는다.
- **S2 / 비교:** 넓은 화면은 `table > caption + thead + tbody`. 첫 열은 기능명,
  나머지 세 열은 플랜이다. 열 헤더는 `th scope="col"`, 기능명은 `th scope="row"`를 쓴다.
  가격·숫자는 우측 정렬과 `tabular-nums`, 기능 설명은 시작 정렬. 승인된 추천 플랜만 기존 강조 표면을 쓴다.
- **S3 / 선택:** 각 플랜의 CTA를 해당 플랜·결제 주기에 연결한다. 카드나 표에서 떨어진
  정체불명의 공통 “시작하기” 버튼으로 만들지 않는다. `선택`은 기존 목적지 이동이지 자동 결제가 아니다.
- **좁은 화면:** 이 예시에서는 `48rem` 미만에 플랜별 `article > h2 + dl + CTA`로 재배치한다.
  모든 플랜의 기능명·순서를 동일하게 유지한다. 표/카드가 같은 데이터로 렌더되도록 하고
  비활성 표현은 `display:none`으로 숨겨 중복 포커스·중복 읽기를 막는다. 원문 추천을 따르는 선택이다.
  단, 사용자가 표 보존을 요구하면 카드화를 하지 않고 이름 있는 표 스크롤 영역으로 제한한다.
- **크기·간격:** 예시 새 토큰은 비교 최대 폭 `72rem`, 기능 열 `25%`, 플랜 열 각각 `25%`,
  셀 안쪽 간격 `16px`, 섹션 간격 `48px`. 기존 대응 토큰이 있으면 재사용하고 새 숫자를 흩뿌리지 않는다.
- **확인:** 375/1280px에서 동일한 가격·기능·CTA인지, 결제 주기 변경이 세 플랜에 함께 반영되는지,
  키보드 라디오 선택과 링크 접근이 가능한지 확인한다. 긴 기능명과 빈 값도 시험하며 `0`을 누락값으로 처리하지 않는다.

## B. 긴 글 화면 — 좁은 본문 축과 필요한 미디어 확장

### 원문에서 가져온 것

- `layout-taxonomy.md` → 대표 조합 구성 → `evidence-led-longread`:
  “본문 폭을 제한하고 필요한 미디어만 축 밖으로 확장한다.” 필수 `manuscript-grid`, 선택 `full-bleed-content`.
  가로 괘선은 제목·메타·본문 전환에만 사용하고 본문은 연속 표면으로 유지한다.
- 같은 파일 → `manuscript-grid`: 한 열의 읽기 영역, 구현 예시는 `max-width:65ch; margin:auto`.
  여러 지표를 동시에 비교하는 작업 화면에는 맞지 않는다.
- `typography-taxonomy.md` → `line-length-measure`, `line-height`, `tracking`, `line-break-keepall`:
  한글과 라틴의 행 길이 조건을 구분하고 한글 본문 자간은 기본 0, 어절 줄바꿈을 고려한다.

### 구현 지시는 이 정도로 쓴다

- **S1 / 기사 헤더:** 카테고리 → H1 → 제공된 작성자·날짜 순서. H1과 본문 시작선을 맞춘다.
  메타정보 아래 한 번만 구분선을 쓰며, 읽기 과업에 불필요한 hero CTA는 추가하지 않는다.
- **S2 / 본문:** `article` 안에서 `h2 → p/list/blockquote`가 한 축으로 이어진다.
  문단마다 카드·배경색·그림자를 붙이지 않는다. 본문 `line-height:1.5`, `letter-spacing:normal`을
  예시 토큰으로 두고 `word-break:keep-all; overflow-wrap:anywhere`로 긴 한글·URL 넘침을 처리한다.
  라틴 원문의 `65ch`를 한글 65자로 오해하지 않는다. 한국어는 `typography-ko.md`의 폭을 우선하고
  실제 문장으로 행 길이를 확인한다.
- **S3 / 근거 미디어:** 해당 문단 바로 뒤에 제공된 `figure > image/chart + figcaption`을 배치한다.
  전체 화면 폭으로 키우는 대신 근거를 읽는 데 필요한 경우만 본문 축 밖으로 확장한다.
  원본 비율로 공간을 예약하고, 도표 라벨이 잘리면 `cover`가 아닌 전체 표시를 택한다. 자산이 없으면 생략한다.
- **배치:** 바깥 article grid는 `minmax(16px,1fr) minmax(0,var(--reading-width)) minmax(16px,1fr)`.
  일반 콘텐츠는 두 번째 열, 확장 figure만 `grid-column:1/-1`에 두되 미디어 최대 폭과 중앙 정렬을 적용한다.
  미디어 내부도 안전 여백을 유지하고, 작은 화면에서는 본문·미디어가 같은 가용 폭 안에 들어오게 한다.
- **확인:** 긴 제목·장문·긴 URL·미디어 없는 글로 확인한다. 제목 계층·캡션 연결·한글 줄바꿈과
  이미지 로드 전후 밀림을 확인하며, 보기 좋다는 이유로 문단을 잘라내거나 빈 장식을 채우지 않는다.

## C. 제품 작동 설명 — 고정 비주얼과 단계별 텍스트

### 원문에서 가져온 것

- `layout-taxonomy.md` → Scroll Behavior → `sticky-scroll-reveal`:
  한쪽 비주얼을 고정하고 옆 텍스트가 스크롤되며 대응 비주얼이 바뀌는 패턴.
  구현 수단으로 `position:sticky`·`IntersectionObserver`를 연결한다.
- 같은 파일 → `sticky-stacking-cards`: 단계 강조에는 맞지만 동시 비교가 필요한 목록에는 부적합하다.
  따라서 요금 비교에 이 효과를 붙이지 않는다. 서로 다른 패턴을 “스크롤 애니메이션”으로 뭉뚱그리지 않는다.

### 구현 지시는 이 정도로 쓴다

조건: 승인된 단계 세 개와 단계별 실제 제품 이미지가 있으며, 순서를 설명하는 것이 섹션의 목적일 때.

- **S1 / 도입:** 섹션 제목과 결과 요약을 먼저 보여준다. 애니메이션 시작을 기다려야 읽을 수 있게 숨기지 않는다.
- **S2 / 단계 설명:** 데스크톱은 `grid-template-columns:repeat(2,minmax(0,1fr))`로 같은 비중의 두 열을 만들고
  열 간격은 기존 24px 대응 토큰을 쓴다. 왼쪽은 sticky 비주얼, 오른쪽은 `ol > li` 단계 설명이다.
  sticky의 top은 `헤더 높이 + 기존 gap 토큰`, 상위 요소의 `overflow`가 sticky를 깨지 않는지 확인한다.
  읽기에 필요하지 않은 `300vh` 빈 스크롤 구간은 만들지 않는다.
- **트리거·상태:** 문서 중앙의 활성 구간에 들어온 단계 ID를 `activeStep`으로 정한다.
  IntersectionObserver의 후보가 여러 개면 중앙에 가장 가까운 단계를 선택하고, 후보가 없으면 직전 상태를 유지한다.
  첫 단계가 초기값이며 위로 되돌아갈 때도 해당 단계로 복귀한다. observer는 언마운트 시 해제한다.
- **피드백·시간축:** 단계가 바뀌면 동일한 비율의 이미지 레이어에서 opacity만 crossfade한다.
  예시 토큰 `160ms ease-out`은 이번 설계값이다. 연속 스크롤 중 전환을 큐로 쌓지 않고 최신 단계로 덮어쓴다.
  비활성 이미지의 링크·버튼이 탭 순서에 남지 않게 한다. 이미지가 설명을 중복할 뿐이면 장식으로 처리한다.
  이미지 로드 실패 시 예약 공간에 짧은 실패 안내를 표시하고 단계 설명은 유지한다. 실패한 이미지 때문에
  `activeStep` 전환이나 이후 단계 읽기를 막지 않는다.
- **모바일·reduced-motion:** 이 예시에서는 `48rem` 미만 또는 reduced-motion에 sticky와 crossfade를 해제하고
  각 단계 설명 바로 뒤에 해당 이미지를 표시한다. 효과는 없어져도 세 단계의 정보는 모두 남는다.
  스크롤을 가로채거나 focus를 단계로 강제로 옮기거나 스크롤마다 live announcement를 하지 않는다.
- **확인:** 처음·중간·끝 상태, 빠른 정/역방향 스크롤, 짧은 뷰포트, 이미지 로드 실패,
  모바일·reduced-motion에서 단계/이미지 대응을 확인한다. 스크린샷 한 장만으로 모션 완료를 주장하지 않는다.

## 전달 전 구체성 확인

구현자는 새 디자인 결정을 떠안지 않고 다음을 답할 수 있어야 한다.

1. 어느 원문 패턴을 왜 선택했고 어떤 부적합 조건을 피했는가?
2. 실제 콘텐츠가 어느 DOM/컴포넌트에 어떤 순서·비중으로 들어가는가?
3. 폭·간격·타입·시간은 어느 기존 토큰 또는 명시한 새 토큰인가?
4. 무엇이 상태를 바꾸며 종료·실패·작은 화면·reduced-motion에서는 무엇이 남는가?
5. 어떤 입력·화면·동작을 확인하면 명세와 구현의 일치를 판정할 수 있는가?

“적절히”, “반응형으로”, “부드럽게”, “카드 또는 리스트”만 남았다면 해당 결정을 더 풀어 쓴다.
실제 확인되지 않은 제품 사실은 수치로 지어내지 말고 미확정으로 표시한다.
