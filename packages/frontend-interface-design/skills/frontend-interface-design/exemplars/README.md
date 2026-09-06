# Exemplars — 복사한 뒤 DESIGN.md로 재스킨한다

zero-shot 생성 대신 여기서 시작한다. 파일은 전부 정적 HTML + `tokens.css`라 브라우저에서 바로
열리고 `scripts/render.mjs`로 렌더 · 측정된다. 프레임워크로 옮길 때는 **구조 · 상태 · 토큰
참조**를 옮기고 클래스 이름은 프로젝트 관례를 따른다.

| 파일                               | 무엇                                                     | 보여주는 craft                                                 |
| ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `tokens.css`                       | 토큰 블록 정답지(light/dark · ko 타이포 · 그림자 · 모션) | 노브 3개(`--h` · chroma · radius)로 전체가 바뀐다              |
| `primitives/button.html`           | 변형 4 · 크기 3 · 상태 8종 · kbd 힌트                    | 광학 정렬 · scale(0.97) · 로딩 중 라벨 유지                    |
| `primitives/input.html`            | 라벨 위 · 힌트 · 오류 inline · 금액 입력                 | border-width 고정(강조는 shadow) · 16px · tabular              |
| `primitives/card.html`             | KPI · 미디어 · skeleton                                  | 그림자 또는 border 하나 · radius 중첩 · 상태 형태              |
| `primitives/table-row.html`        | sticky 헤더 · 정렬 · 밀도 토글 · 상태 글리프             | 좌/우 정렬 · hairline · 형태+색+텍스트                         |
| `primitives/dialog.html`           | 네이티브 `<dialog>` · 요약 · destructive 확인            | modal 그림자 단 · 0.98에서 등장 · 동작 이름 버튼               |
| `compositions/app-shell.html`      | precision-tool 매크로구조 `shell-table`                  | 사이드바 240 + 상단바 48 + 표 + 상세 · 열 우선순위 · 카드 없음 |
| `compositions/marketing-hero.html` | editorial-marketing 매크로구조 `thesis-proof-flow`       | 7/5 비대칭 · display 하나 · hairline 프레임 · 숫자 섹션        |

## 사용 절차

1. 계보와 노브가 정해졌으면(`references/adaptation.md`) `tokens.css`를 프로젝트 토큰 파일에
   복사하고 `--h` · `--c-accent` · `--c-tint` · `--radius` · `--row-h` · 폰트 스택만 바꾼다.
2. 필요한 프리미티브 · 조합을 복사한다. **구조와 상태는 유지**하고 카피 · 데이터 · 열을 바꾼다.
3. 컴포넌트 안에 남은 리터럴 값이 없는지 `scripts/render.mjs --source`로 확인한다.
4. `references/look.md` 루프를 돈다.

## 프레임워크로 옮길 때

- React + Tailwind: `tokens.css`의 변수를 `@theme` 또는 `tailwind.config` `extend`에 매핑한다
  (shadcn 이름이라 그대로 붙는다). 클래스는 `bg-primary text-primary-foreground`처럼 토큰만.
- CSS-in-JS: 변수 참조(`var(--primary)`)를 그대로 쓴다. 값을 JS 상수로 복제하지 않는다.
- 상태 8종(default · hover · focus-visible · active · disabled · loading · error · success)은
  프레임워크 컴포넌트에서도 전부 구현한다. 빠진 상태는 미완성이다.

## 이 파일들이 아닌 것

- 완성 디자인이 아니다. 계보 · 노브 없이 그대로 쓰면 자리표시자 hue(230)의 화면이 나온다.
- 컴포넌트 라이브러리가 아니다. 프로젝트에 이미 `components/ui`가 있으면 그것을 쓴다.
