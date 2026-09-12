---
name: frontend-interface-design
description: 'Make distinctive, content-led web UI and working interactions in the agreed format. Choose a signature, build a real slice, expand and inspect. Preserve approved sources, scope and behavior; not risky-action policy or independent QA.'
---

# Frontend Interface Design

실제 콘텐츠와 핵심 작업에서 출발해 **기억에 남는 시그니처와 작동하는 화면**을 만든다.
판단 순서: primary task → information hierarchy → interaction → feedback → visual treatment.
모션도 정보 이해·조작·합의된 브랜드 표현을 돕는다. 핵심 작업·접근성·읽기를 해치지 않는다.

## 핵심 계약

1. 사용자 소유 소스·잠긴 `DESIGN.md`의 보존 범위는 **Fidelity**다. 합의된 출력 형식·위치·편집 권한을 지키고, 유효한 승인·실행 요청이 있으면 재인터뷰하지 않는다. 새 방향은 선택 또는 명시적 위임 범위에서 정한다.
2. 실제 문구·데이터·허용된 자산으로 만든다. 필수 사실만 질문하고, 허용된 placeholder는 표시한다. **브랜드 이름은 증거가 아니다**. 관측과 추정을 구분하고 무단 자산·코드 복제 없이 출처를 남긴다.
3. 기존 토큰·컴포넌트를 재사용한다. 대비(본문 4.5:1·UI 3:1), 키보드·focus-visible, 작은 화면 읽기·overflow 방지, 충분한 탭 타깃을 지킨다. 색 면적·폰트 개수는 취향 게이트가 아니라 역할과 승인 방향의 결정이다.
4. 실제 지원되는 조작·상태·완료/복구를 구현한다. 일반 조작의 motion 기본값은 짧고 즉각적인 피드백이며 브랜드 시간축의 상한이 아니다. 필요한 모션은 일반/축소 설정에서 정보와 조작을 보존한다. 콘텐츠 교체는 핵심 경험 삭제 권한이 아니다.
5. **보지 않은 화면은 완료가 아니다.** 실제 적용 결과와 필요한 동작을 확인한다. 첫 렌더 1회 + 보수 최대 2회 안에서 비교 근거가 있는 개선만 채택하고, 미해결·미관측 범위를 남긴다.
6. 위험 동작 정책은 `frontend-oracle-design`이 소유한다(미정이면 `NEEDS_DECISION`). 독립 QA는 `frontend-visual-qa`, behavior test는 `test`가 맡는다. 자체 Look는 `VERIFIED`를 발급하지 않는다. 기술 통과·자기검토·사용자 수락을 구분한다.

## 모드

| 조건                                | 경로                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Fidelity**: 소유 소스·잠긴 디자인 | [fidelity.md](references/fidelity.md). 실제 URL/화면 재현은 [reference-rebuild.md](references/reference-rebuild.md)로 관측하고 보존한다. |
| **Reference-informed**: 브랜드 지목 | [reference-pack.md](references/reference-pack.md), `scripts/pack.mjs --route`로 관측·task 범위를 확인한다.                               |
| **Adaptation**: 새 방향             | 아래 생성 루프로 먼저 만든다. 계보와 토큰 정리가 필요할 때 [adaptation.md](references/adaptation.md)를 쓴다.                             |

최종 시각 시스템은 하나, 섹션 구성의 출처는 여러 개다. 혼합 요청은 보존 범위와 새 부분을 나눈다.

## 생성 루프

1. **주인공과 시그니처.** 실제 제목·숫자·이미지·선택 결과 중 주인공을 정한다. 새 방향이면 [art-direction.md](references/art-direction.md)로 서체·구도·색 중 표현의 중심 하나를 과감하게 쓴다. 승인된 방향은 잇는다. 전이가 있으면 [experience-design.md](references/experience-design.md)로 실제 상태·조작·복구 범위를 먼저 정한다.
2. **대표 구간을 만든다.** 실제 길이 콘텐츠로 핵심 구간을 구현하고 desktop/mobile에서 연다. 방향이 미정일 때만 작은 후보 둘을 비교·추천한다. [exemplars/README.md](exemplars/README.md)에서 맞는 예시 하나만 참고하며, 이미지가 없으면 글과 정렬로 구성한다.
3. **같은 언어로 확장한다.** 선택한 관계·타입·색 역할을 전체 섹션과 필요한 상태에 잇는다. 기존 `DESIGN.md`/편집 환경의 스타일에 정리하고 같은 결정을 보드·로그·보고서에 반복하지 않는다. 기존 승인 안의 세부 구현은 직접 끝낸다.
4. **Look (필수).** [look.md](references/look.md)로 전체·부분·작은 화면과 핵심 동작을 직접 확인한다. 코드는 `scripts/render.mjs`와 기존 검사, 디자인은 합의된 편집 환경의 미리보기를 쓴다. 확인한 화면을 먼저 전달하고 선택 이유·검증·잔여 범위만 설명한다.

## 참조 로드

필요한 절만 읽는다. 기본 경로는 이 파일 → 새 방향의 art-direction/맞는 예시 → 제작 → Look다.

| 조건                            | 참조                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 상시                            | 이 파일뿐                                                                                                                                                          |
| 목적·출력·브랜드에 중요한 빈칸  | [discovery.md](references/discovery.md), [brand-intake.md](references/brand-intake.md); 자료 전달은 `design-input-template.md`                                     |
| 새 구도·레퍼런스 응용이 어려움  | `section-composition.md`, `reference-study.md`; 관측·치환 연구가 필요할 때 `clone-study.md`                                                                        |
| 여러 화면·분기·복구·모션        | [experience-design.md](references/experience-design.md); 역할별 상태·AI/위임 충돌은 [one-shot.md](references/one-shot.md) 해당 절                                  |
| 구현/마감의 구체적인 빈칸       | `section-implementation.md`, [craft.md](references/craft.md)의 기본값; 한글은 [typography-ko.md](references/typography-ko.md), 사전 조회는 `dictionary-recipes.md` |
| 비교 후 미해결 또는 실제 피드백 | [review.md](references/review.md); 필요한 질문만 `form-quality.md`, `ui-checklist.md`, `ux-checklist.md`, `interface-rules.md`에서 선택                            |

설치된 전문 도구는 가산이며 없어도 자체 제작·검사를 이어간다. 측정하지 못한 항목과 독립 검증 부재를 숨기지 않는다.
