# Decision ladder — 코드 전에 채우는 결정 기록

40줄 이내. 빈 칸은 "모름 — 추론: …"으로 채운다. 빈 칸을 비워 두고 코드로 넘어가지 않는다.

## 템플릿

```md
## Decision record — <화면/컴포넌트 이름>

### 1. Primary task

- 한 문장: 사용자는 <상황>에서 <행동>해서 <결과>를 얻는다.
- 빈도: 하루 n회 / 주 n회 / 1회성 숙련도: 초심자 / 반복 사용자
- 성공 기준: <완료율 · 소요 시간 · 오류율 · 이탈 중 하나>

### 2. Information hierarchy

1. <primary task를 끝내는 데 반드시 보여야 하는 것>
2. <판단을 돕는 보조 정보>
3. <접어도 되는 것 — progressive disclosure>

- 2초 테스트: 첫 시선이 닿을 요소 = <요소>. 그것이 1번인가? (예/아니오)

### 3. Interaction

- 조작 모델: click / scroll / type / drag 중 <하나>. 이유: <한 줄>
- primary task 완료까지 조작 수: <n>회. 줄일 수 있는 조작: <있음/없음>
- 키보드 경로: <Tab 순서 요약>. 단축키: <있음/없음>
- destructive 동작: <없음 / undo / confirm — Oracle 카드 참조 여부>

### 4. Feedback — state matrix

| state   | 언제                           | 화면                                 |
| ------- | ------------------------------ | ------------------------------------ |
| loading | <트리거>                       | skeleton / spinner / progress + 이유 |
| empty   | <조건>                         | 한 줄 설명 + CTA <이름>              |
| error   | <조건>                         | 무엇·왜·어떻게, 위치 <inline/배너>   |
| success | <조건>                         | 조용히 / toast(+undo)                |
| partial | <일부 실패·오프라인·권한 없음> | <처리>                               |

### 5. Visual treatment — 각 항목은 1–4단 중 무엇을 돕는지 적는다

- typography: <scale 단계 수, display/body 역할> → 돕는 단: hierarchy
- spacing: <기본 단위, 섹션 간격 규칙> → 돕는 단: hierarchy
- color: accent <하나>, 쓰이는 곳 <primary action · 현재 위치> → 돕는 단: interaction
- radius / shadow / blur: <값 또는 없음> → 돕는 단: <feedback(레이어) / 없음이면 제거>
- motion: <없음 / 등장·퇴장 n ms> → 돕는 단: <feedback / 없음이면 제거>
- signature(선택): <이 화면을 기억하게 할 한 요소> → 돕는 단: <impression>

### Responsive

- 320: <무엇이 접히고 무엇이 남나> 768: <…> 1280: <…>
- 터치 타깃 44px, 두 줄 버튼 없음, `minmax(0, 1fr)`

### Accessibility

- landmark: header / nav / main / aside / footer 중 <사용>
- 이름: 모든 interactive 요소에 accessible name. 아이콘 버튼은 `aria-label`
- 색만으로 전달하는 정보: <없음 / 있으면 텍스트·아이콘 보강>

### 버린 대안

- <대안 A> — 버린 이유 <한 줄>
- <대안 B> — 버린 이유 <한 줄>
```

## 채우는 규칙

- **1단이 바뀌면 나머지를 다시 쓴다.** 5단만 고치는 "톤 조정"은 1–4단이 그대로일 때만 허용.
- **2단 목록은 3개 이하.** 4개째부터는 progressive disclosure 대상이다.
- **3단 조작 수는 세어서 적는다.** "간단함"은 수치가 아니다.
- **4단 표의 빈 행은 없다.** 그 state가 실제로 불가능하면 "불가 — 이유"를 적는다.
- **5단의 "돕는 단" 칸이 비면 그 treatment는 삭제.** 이것이 visual treatment gate다.
- **버린 대안은 최소 1개.** 대안이 없었다면 탐색을 안 한 것이다.

## 사용자에게 묻는 기준

아래 중 하나에 해당할 때만, 그 항목 하나만 묻는다. 나머지는 기본값으로 진행한다.

- 조작 모델이 갈리고(탭 vs 스크롤, 모달 vs 페이지) 되돌리려면 재작성이 필요할 때
- 기본 노출 정보 범위가 비즈니스 판단일 때(가격, 재고, 개인정보)
- destructive 동작의 undo / confirm 정책이 없을 때 — 이 경우 `frontend-oracle-design`으로 보낸다
