# Decision ladder — 코드 전에 채우는 결정 기록

40줄 이내로 요약하고 브리프 · 선택 무드보드 · 섹션 출처표를 연결한다. 중요한 빈칸은
"미확정 — 질문: …"으로 남기고 [`discovery.md`](discovery.md)에서 답을 받은 뒤 구현한다.
직접 관찰한 사실 · 사용자 답변 · 위임받은 시각 선택을 구분하며 제품 사실을 추론으로 채우지 않는다.

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

- 계보(Adaptation): <id> — 표의 행 <유형>. 노브 ① hue <사물 3개 → hue, 이식 테스트 결과> ·
  ② 페어링 <번호> · ③ radius/밀도 <프리셋>
- DESIGN.md(Adaptation): <경로, lint 오류 0 · 경고 n> / (Fidelity) 소스 <종류 · 위치>
- 비코드 출력의 DESIGN.md·코드 토큰 필드: N/A — <편집 환경 스타일·변수·프레임 위치>
- 방향/무드보드: <산출물 경로 · 사용자 선택/명시적 위임/기존 Fidelity>
- 섹션 출처: <선택표 경로 · 유지한 구도와 공통 스타일 조정>
- 흔한 답 vs 갈림(Adaptation): <차이 또는 적합해서 유지한 이유>
- 토큰: <exemplars/tokens.css 복사 + 노브 반영 / 기존 토큰 재사용 + 출처 파일>
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
- **5단의 "돕는 단" 칸이 비면 그 treatment는 삭제.** 단, [`craft.md`](craft.md) 12개 기본값과
  계보 `DESIGN.md`에 있는 treatment는 면제다 — 마감은 정당화 대상이 아니다. 이것이 visual
  treatment gate다.
- **버린 대안은 최소 1개.** 대안이 없었다면 탐색을 안 한 것이다.

## 사용자에게 묻는 기준

질문 여부는 [`discovery.md`](discovery.md)를 따른다. 아래는 결과를 바꿀 결정의 예시이며
질문 범위를 이 목록으로 제한하지 않는다. 이미 확인한 사실은 다시 묻지 않고 위임된 세부는 직접 결정한다.

- 조작 모델이 갈리고(탭 vs 스크롤, 모달 vs 페이지) 되돌리려면 재작성이 필요할 때
- 기본 노출 정보 범위가 비즈니스 판단일 때(가격, 재고, 개인정보)
- destructive 동작의 undo / confirm 정책이 없을 때 — 이 경우 `frontend-oracle-design`으로 보낸다

## Decision rules — 자주 갈리는 지점의 기본값

3단 · 4단을 채울 때 아래 기본값에서 시작한다. 뒤집으려면 조건이 있어야 한다.

| 상황                           | 기본값                                                                  | 뒤집는 조건                            |
| ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| 정보 노출                      | primary task에 필요한 것만 기본 노출, 나머지는 progressive disclosure   | 전문가용 고빈도 도구면 밀도를 올린다   |
| 조작 모델                      | 가장 적은 단계로 task를 끝내는 모델, click 기본                         | 순차 서사·비교 탐색이면 scroll-driven  |
| Loading                        | 레이아웃을 아는 콘텐츠는 skeleton, 모르면 spinner, 1초 넘으면 진행 표시 | 되돌릴 수 있는 동작은 optimistic       |
| Empty                          | 다음 행동 CTA 하나 + 한 줄 설명, 분위기 문구 금지                       | 첫 방문 온보딩이면 예시 데이터 제안    |
| Error                          | 무엇이 · 왜 · 어떻게, 필드 옆 inline, 사과 금지                         | 전역 오류만 배너                       |
| Success                        | 결과가 화면에 보이면 조용히, 안 보이면 toast                            | 되돌리기 가능하면 undo 포함 toast      |
| Destructive                    | undo 우선, 없으면 확인 dialog, 확인 버튼에 동작 이름                    | 되돌릴 수 없는 결제·삭제는 Oracle 정책 |
| Form                           | label 위, blur 시 검증, idle 상태에서 submit 비활성화 금지              | 한 필드 form은 inline 검증             |
| Motion                         | 피드백 120–200ms ease-out만. 등장/퇴장은 필요할 때 ≤200ms               | 브랜드 순간 한 곳(signature)만 허용    |
| Accent                         | 하나. primary action과 현재 위치에만                                    | 데이터 시각화 범주 색은 별도 팔레트    |
| Density                        | 사용 빈도로 결정. 온보딩 sparse, 운영 도구 dense                        | —                                      |
| Radius · shadow · blur · glass | craft.md · 계보 기본값 그대로. 그 밖은 계층 · 레이어를 표현할 때만      | 근거 한 줄을 못 쓰면 제거              |
