# Review — self-review, rationale, user validation

## 1. Self-review — 6축 점수

체크리스트를 돌린 뒤 1–5로 매긴다. **3 미만이 하나라도 있으면 고치고 다시 매긴다.**
두 번째 pass에도 3 미만이면 설계가 아니라 brief가 틀린 것이다. Frame 단계로 돌아간다.

| 축             | 5점 기준                                                             |
| -------------- | -------------------------------------------------------------------- |
| Task fit       | primary task가 최소 조작으로 끝나고, 첫 시선이 그 진입점에 간다      |
| Hierarchy      | 2초 안에 primary / secondary / tertiary가 구분된다                   |
| States         | loading · empty · error · success · partial이 모두 설계됐고 구현됐다 |
| Execution      | 대비 · focus · 320px · reduced-motion · 토큰 참조가 모두 맞다        |
| Restraint      | 지워도 task에 영향 없는 장식이 없다. accent 하나, signature 하나     |
| Explainability | 모든 visual treatment가 사다리 1–4단 중 하나를 근거로 댄다           |

점수는 Rationale 블록 첫 줄에 적는다: `review: T4 H5 S4 E5 R4 X5`.

dev server가 있으면 320 · 768 · 1280과 두 theme 스크린샷을 찍고 본다. 체크리스트 통과와
좋은 화면은 다르다. 스크린샷을 못 찍으면 그 사실을 Rationale에 적는다.

## 2. Rationale — 왜 이렇게 만들었나 (10줄 이내)

```md
## Rationale — <화면>

mode: creation anti-slop: <kill-ai-slop / hallmark / fallback> 결과 <n>건 수정
review: T4 H5 S4 E5 R4 X5

1. task: <primary task 한 줄>. 완료까지 <n>회 조작.
2. hierarchy: <1순위>를 첫 화면 좌상단에, <3순위>는 접음. 이유: <빈도 · 결정 순서>.
3. interaction: <조작 모델>. <대안>을 버린 이유: <한 줄>.
4. feedback: loading은 <skeleton>, error는 <inline>, success는 <조용히/undo toast>. 이유: <한 줄>.
5. visual: accent <색 역할>은 primary action에만. radius/shadow <있음/없음> — <돕는 단>.
   motion <없음/등장 200ms> — <이유>.
6. trade-off: <얻은 것> 대신 <포기한 것>.
7. 검증 필요 가정: <사용자 조사 없이는 확신할 수 없는 것 한 가지>.
```

규칙:

- 5번에서 "돕는 단"을 못 쓰는 treatment는 코드에서도 지운다. 문서와 코드는 같아야 한다.
- 6번 trade-off가 "없음"이면 대안을 탐색하지 않은 것이다.
- 7번은 반드시 있다. 모든 설계에는 검증 안 된 가정이 있다.

## 3. User validation — 사용자에게 넘기는 검증 방법

실행은 사용자 몫이다. 이 skill은 스크립트와 지표까지 제안한다.

### 5초 테스트

화면을 5초 보여주고 가린 뒤 묻는다. 3명이면 충분하다.

1. 이 화면은 무엇을 하는 곳인가요?
2. 여기서 제일 먼저 무엇을 하시겠어요?
3. 기억나는 것 하나만 말해 주세요.

1 · 2번 답이 primary task와 다르면 Impression과 Hierarchy를 다시 본다.

### Task walkthrough

primary task를 말로 주고(“<상황>에서 <결과>를 얻어 보세요”) 관찰한다. 도와주지 않는다.

- 어디서 멈췄나? (멈춤 = discoverability 결함)
- 어디서 되돌아갔나? (되돌림 = hierarchy 또는 카피 결함)
- 끝났다고 스스로 알았나? (몰랐다 = feedback 결함)

### 출시 후 지표

| 지표           | 어디서                     | 이상 신호                         |
| -------------- | -------------------------- | --------------------------------- |
| task 완료율    | primary action 클릭 / 진입 | 감소                              |
| task 소요 시간 | 진입 → 완료                | 증가                              |
| 오류율         | error state 노출 / 시도    | 특정 필드 · 단계에 집중           |
| 단계별 이탈    | Funnel 각 단계 진입 / 이전 | 한 단계에서 급락                  |
| 재방문 후 완료 | 재진입 세션의 완료율       | 첫 방문보다 낮음 = Retention 결함 |

지표 한 개당 개선 가설 한 줄을 붙여 전달한다. 예: "결제 단계 이탈 40% → 주소 자동완성이
없어서. 도입 후 재측정."
