# Asset learning — 검증된 pattern만 내부 자산으로 축적한다

외부 reference 의존도를 줄이되 검증되지 않은 요소로 library를 오염시키지 않는다.

## 1. 새 component를 만들기 전

1. Existing Component Catalog 검색
2. Existing Figma Library 검색
3. Existing Approved Pattern 검색
4. Existing Variant로 흡수 가능한지 검토
5. Existing Primitives의 조합으로 해결 가능한지 검토
6. 모두 부적합할 때만 새 Experiment 생성

새 component를 만들었다는 이유만으로 shared asset으로 publish하지 않는다. 먼저 실제 page에서
실제 content로 사용하고 critique한다.

## 2. 승격 흐름

Experiment → Real Page Usage → Visual Critique → Reuse Evaluation → Approved Pattern

다음을 모두 통과해야 Approved 후보가 된다.

- 다른 project 또는 2개 이상의 실제 context에서 역할이 성립한다.
- 특정 page의 copy와 asset에 지나치게 결합되지 않았다.
- component properties와 variants가 명확하고 과도하지 않다.
- existing component와 중복되지 않는다.
- 새 component보다 existing component의 variant가 더 적절하지 않다.
- auto layout, resizing, text/image bounds, 주요 state를 확인했다.
- 지정된 library에 publish할 권한과 승인이 있다.

하나라도 부족하면 current file의 Experiment로 유지한다. 지정된 shared library가 없으면
current product file에서 검증 기록만 남기고 “Shared/Approved”라고 주장하지 않는다.

## 3. Component Catalog

가능하면 지정된 Figma catalog page 또는 component library에 다음을 기록한다.

- Component Name
- Status: Experiment / Approved / Deprecated
- Purpose
- Best For
- Avoid When
- Supported Content
- Variants
- Editable Properties
- Figma Component Reference
- Originating Reference
- Used In
- Notes

예:

| field          | value                           |
| -------------- | ------------------------------- |
| Component Name | Hero/ProductScreenshot/Split    |
| Status         | Approved                        |
| Best For       | 제품 화면 자체가 강한 SaaS      |
| Avoid When     | 강한 product visual이 없는 경우 |
| Variants       | Copy Left / Copy Right / Dark   |
| Used In        | Project A / Project C           |

Deprecated는 삭제가 아니다. 대체 component와 migration note를 남긴다.

## 4. Pattern과 primitive를 구분한다

- Foundation은 값과 semantic role이다.
- Primitive는 작은 재사용 단위다.
- Component는 content/state API를 가진 조합이다.
- Marketing Pattern은 section-level composition이다.
- Approved Page는 특정 product requirement의 완성 사례다.

한 번 쓴 section을 primitive component처럼 일반화하지 않는다. 반대로 반복되는 relationship을
매번 one-off frame으로 다시 그리지 않는다.

## 5. Reference Log와 연결

승격된 pattern은 origin reference와 “복사하지 않은 visual traits”를 유지한다. 이후 project는
PRD → Component Catalog → Approved Patterns → 부족한 부분만 Refero/Browser 순서로 조사한다.

외부 reference는 새 pattern 발견을 위한 입력이지 내부 system보다 높은 authority가 아니다.
