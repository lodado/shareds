# Exemplars — 서로 다른 표현의 중심을 배운다

새 방향이 필요하면 실제 콘텐츠에 맞는 **예시 하나**만 연다. 전부 읽거나 같은 조합에서 시작하지 않는다.
이 예시들은 관측한 정보 관계를 자체 HTML/CSS/SVG와 다른 콘텐츠로 옮긴 연구다. 원본 사이트의 픽셀 복제나 브랜드 자산이 아니다.

## 기본 선택: 세 가지 시그니처

| 예시                                                                      | 입력 → 제작 조작 → 보이는 결과                                                                     | 바꿀 것                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [editorial-signal-ledger.html](compositions/editorial-signal-ledger.html) | 긴 한글 제목·짧은 메타 → 서체 대비와 비대칭 정렬 → 글이 주인공인 편집 화면, 실제 주제 필터         | 실제 제목 길이·기사 수·주제 분류. 이미지 없는 작업은 그래픽 칸까지 가져오지 않는다.     |
| [image-orbit-rail.html](compositions/image-orbit-rail.html)               | 자체 제작 제품 도형·라인업 → 큰 이미지 무대와 별도 선택 레일 → 제품/옵션 관계와 인접한 선택 피드백 | 허용된 실제 이미지·제품 비례·긴 옵션명. 필수 실제 자산을 도형으로 대체하는 예가 아니다. |
| [color-pathway.html](compositions/color-pathway.html)                     | 소비자 서비스의 선택 항목 → 넓은 브랜드 색면과 행동/상태색 분리 → 선택·결과·reset이 연결된 화면    | 브랜드 색 역할·문구·조작 계약. 색만으로 선택을 구분하지 않는다.                         |

주인공·정보 관계·작동하는 상태를 배우고 우리 콘텐츠·토큰·반응형 구도로 치환한다. 과감한 글자나 색면만 복사하면 새 템플릿이 된다.
토큰은 각 예시의 `:root`에 있다. 기존 프로젝트에서는 그 역할을 기존 토큰에 매핑한다. 새 토큰 체계를 겹쳐 넣지 않는다.

## 관측 출처와 한계

2026-09-12 관측: [The Guardian](https://www.theguardian.com/international)의 편집 위계·비대칭 관계, [Apple iPhone](https://www.apple.com/iphone/)의 제품 무대·라인업 레일, [Headspace](https://www.headspace.com/)의 넓은 색면·선택 구조.
관측 화면과 자체 재구성·다른 콘텐츠 치환·최종 예시를 구분한다. 로고·기사·제품 사진·원본 CSS/폰트 파일을 복사하지 않았다.
정지 화면의 재구성과 직접 실행한 필터/선택/reset만 근거다. 원본 사이트 전체 동작이나 픽셀 Fidelity를 보장하지 않는다.
실제 캡처·소스 hash·콘텐츠 치환·동작 관측 범위는 [평가 기록](../evals/results/2026-09-12-generation-first/README.md)에 연결한다.

## 기존 기능 재료와 회귀 fixture — 기본 시각 방향이 아님

| 파일                                                                                                                                                        | 쓰는 경우                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [tokens.css](tokens.css)                                                                                                                                    | 기존 시스템이 없을 때만 출발할 공통 토큰. 선택한 방향으로 조정             |
| [button.html](primitives/button.html), [input.html](primitives/input.html)                                                                                  | 역할별 상태·포커스·오류의 구현 참고                                        |
| [card.html](primitives/card.html), [table-row.html](primitives/table-row.html), [dialog.html](primitives/dialog.html)                                       | 구조·상태·토큰 참조를 기존 컴포넌트에 이식                                 |
| [app-shell.html](compositions/app-shell.html), [marketing-hero.html](compositions/marketing-hero.html), [fintech-home.html](compositions/fintech-home.html) | 이전 조합의 기능/토큰 회귀 비교; 새 작업의 기본 템플릿으로 선택하지 않음   |
| [pack-developer-platform.html](compositions/pack-developer-platform.html)                                                                                   | 관측된 Vercel pack 라우팅·토큰 매핑 fixture. 2026-09-06 관측의 제한된 표본 |

새 예시는 `scripts/render.mjs --source <실제 HTML>`로 토큰 사용까지 검사하고 [Look](../references/look.md)으로 실제 화면·동작을 본다.
패키지의 `signature-exemplars.test.mjs`는 키보드 조작·선택/복귀·일반/축소 모션을 검사한다. 테스트 통과는 미감 또는 사용자 선호의 증명이 아니다.
