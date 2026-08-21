# CLAUDE.md

프론트엔드 컴포넌트·문서 작업 지침. 상세 내용은 아래 문서에 있고, 해당 작업을 시작할 때 읽는다.

## 문서 링크

- [docs/component-design-guide.md](docs/component-design-guide.md) — 컴포넌트 설계·구현·리뷰 시 읽기. 우선순위(API 설계 → 접근성 → 토큰 일관성 → DX → 판단 근거), 터치 환경 요구사항, 코드 작성 규칙.
- [docs/pr-writing-guide.md](docs/pr-writing-guide.md) — PR 생성 직전 읽기. 템플릿 섹션별 작성 규칙, 문맥 모르는 초심자 리뷰어 기준, technical-writing 스킬 사용.

## 작업별 스킬 매핑

해당 작업을 시작할 때 스킬을 로드한다. 목록에 없는 작업은 스킬 없이 진행.

| 작업                                       | 스킬                             | 이유                                                           |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------------------- |
| 컴포넌트 API 설계·리팩터링                 | `vercel-composition-patterns`    | boolean prop 증식 → compound component 전환 패턴, React 19 API |
| React 구현·성능                            | `vercel-react-best-practices`    | 렌더링·데이터 페칭 패턴                                        |
| 동작 테스트 작성 (포커스·키보드·중복 제출) | `test`                           | 결정적 frontend 행동 테스트 — 인터랙션 품질의 검증 수단        |
| 데모·문서 페이지 시각 작업                 | `frontend-design`                | 템플릿 티 안 나는 의도적 디자인 방향                           |
| 애니메이션·전환 추가 시                    | `design-motion-principles`       | transform/opacity, reduced motion 리뷰 기준                    |
| README·설계 문서·PR 본문                   | `technical-writing`              | 문서 유형·구조·문장 편집                                       |
| 접근성 최종 점검                           | `Accessibility Auditor` 에이전트 | WCAG 기준 감사 — 구현 후 1회                                   |

## 핵심 원칙 (항상 적용)

- 우선순위 충돌 시 항상 낮은 순위를 희생한다. 데모 완성도보다 키보드·포커스 동작이 먼저다.
- PR은 `.github/pull_request_template.md` 템플릿 + technical-writing 스킬로 작성한다.
- 설계 결정은 내릴 때마다 README에 근거를 기록한다.
