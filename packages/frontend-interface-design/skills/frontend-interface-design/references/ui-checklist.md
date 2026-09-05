# UI checklist — 화면 단위 결함

각 항목에 `pass` / `fail` / `n/a`를 붙인다. `fail`은 고친 뒤 다시 돌린다. `n/a`에는 이유를 쓴다.

## Typography

- [ ] 크기 단계가 5개 이하이고 이름이 있다(display / heading / body / label / caption).
- [ ] 본문 줄 길이 45–75자, line-height 1.4–1.6. 제목은 1.1–1.25.
- [ ] 강조는 weight · size · 색 중 하나로만. 이탤릭 제목, 한 단어만 세리프 금지.
- [ ] 폰트는 프로젝트 토큰만. 새 폰트 도입은 decision record에 근거가 있다.
- [ ] 긴 단어·URL이 320px에서 넘치지 않는다(`overflow-wrap: anywhere`).

## Spacing · Layout

- [ ] 간격은 하나의 스케일(4 또는 8 기반)만 쓴다. 임의 값 없음.
- [ ] 섹션 간 간격 > 그룹 간 간격 > 요소 간 간격. 같은 간격만 반복되면 hierarchy 없음.
- [ ] 320 / 768 / 1280에서 가로 스크롤 없음. 이미지 그리드는 `minmax(0, 1fr)`.
- [ ] 카드 안에 카드 없음. 3등분 아이콘 카드 그리드가 기본값이 아니다.
- [ ] 첫 화면에 primary task 진입점이 보인다(fold 아래로 밀리지 않음).

## Hierarchy

- [ ] 2초 테스트: 첫 시선이 primary task 요소에 간다.
- [ ] 화면에 primary action이 하나다. 나머지는 secondary/tertiary 스타일.
- [ ] 같은 무게의 요소가 나란히 있으면 둘 다 primary가 아니다.
- [ ] 숫자·번호(01/02/03)는 실제 순서가 있을 때만.

## Color

- [ ] accent 하나. primary action · 현재 위치 · 링크 이외에 쓰이지 않는다.
- [ ] 텍스트 대비 4.5:1, 큰 텍스트·UI 요소 3:1. 두 theme 모두 확인.
- [ ] 정보를 색으로만 전달하지 않는다(상태 = 색 + 텍스트 또는 아이콘).
- [ ] 상태색(success / warning / error)이 브랜드 accent와 구분된다.
- [ ] gradient · glass · blur가 있다면 decision record 5단에 "돕는 단"이 적혀 있다.

## Interface rules — [`interface-rules.md`](interface-rules.md)

keyboard · hit target · forms · state/URL · feedback · touch · animation · layout · a11y 규칙은
vendoring한 Vercel 규칙을 따른다. MUST 위반은 `fail`, SHOULD 위반은 `fail` 또는 이유 있는 `n/a`.
아래는 그 문서에 없는 것만.

- [ ] 모든 interactive 요소가 8 상태를 가진다: default · hover · focus-visible · active ·
      disabled · loading · error · success.
- [ ] 조작 모델이 decision record 3단과 일치한다(탭인데 스크롤로 바뀌지 않았나).
- [ ] 자주 쓰는 동작 · 키보드 트리거 동작에는 animation 없음. UI 상태 변화 ≤ 200ms.
- [ ] 조건부 렌더(`{open && <Modal/>}`)가 갑자기 튀지 않는다 — 필요하면 enter/exit, 필요 없으면 그대로.
- [ ] hover 효과는 한 요소에 하나. `transition: all` 금지.

## Feedback · States

- [ ] loading: 레이아웃을 아는 콘텐츠는 skeleton, 1초 초과는 진행 표시, 버튼은 라벨 유지 + 스피너.
- [ ] empty: 한 줄 설명 + 다음 행동 CTA. 일러스트만 있는 empty 금지.
- [ ] error: 무엇이 · 왜 · 어떻게. 필드 오류는 필드 옆, `aria-invalid` + `aria-describedby`.
- [ ] success: 결과가 보이면 toast 없음. 안 보이면 toast, 되돌릴 수 있으면 undo.
- [ ] partial: 일부 실패 · 오프라인 · 권한 없음이 error와 구분된다.
- [ ] destructive: undo 또는 confirm. confirm 버튼 라벨은 동작 이름("삭제"), "확인" 금지.
- [ ] form 상태 변화 시 border-width 고정(layout shift 없음). 변화는 outline · background로.

## Browser surfaces — 그리지 않은 것도 디자인이다

- [ ] 텍스트 선택색 · caret · 스크롤바 · focus ring · underline offset이 팔레트 토큰을 쓴다.
- [ ] 숫자 데이터는 `tabular-nums`. 제목은 `text-wrap: balance`, 본문은 `pretty`.
- [ ] 브라우저 기본값 그대로인 표면이 없다. 조립된 페이지와 만들어진 페이지를 가르는 가장 싼 신호다.

## Copy

- [ ] 버튼은 결과를 말한다("변경 사항 저장"). "제출" · "확인" 금지.
- [ ] 같은 동작은 흐름 내내 같은 이름("게시" → "게시됨").
- [ ] 지어낸 수치 · 로고 · 후기 없음. 없으면 placeholder와 "확인 필요" 표시.
- [ ] 오류 문구에 사과 · 모호함 없음.

## Slop gates — 하나라도 `yes`면 지운다

`kill-ai-slop`이 설치돼 있으면 이 절 대신 그 스킬의 scan · triage · report를 돌린다(32 tells).
없을 때만 아래 fallback을 쓴다.

- [ ] 보라→파랑 gradient, gradient text
- [ ] glassmorphism · 큰 drop shadow · 과한 radius가 계층 표현 없이 쓰였다
- [ ] 모든 heading 위 eyebrow, 모든 카드에 badge
- [ ] 지어낸 stat row(10k+ / 99.9% / 24/7)
- [ ] 이모지 아이콘
- [ ] "단순한 X가 아니라 Y입니다" 류 카피
- [ ] 세 장의 동일 카드 + CTA + footer 구조가 이유 없이 기본값
