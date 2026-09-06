# Review — self-review, rationale, user validation

## 1. Self-review — 7축, yes/no

체크리스트와 Look 루프를 돌린 뒤 각 축에 **yes/no**로 답하고 근거를 한 줄 적는다. 점수(1–5)는
매기지 않는다 — 자기 채점 절대점수는 근거가 약하다. `no`가 하나라도 있으면 고치고 다시 본다.
두 번째에도 `no`면 설계가 아니라 brief가 틀린 것이다. Frame 단계로 돌아간다.

| 축             | `yes`의 기준                                                                                                                                                 | 근거 출처                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Task fit       | primary task가 최소 조작으로 끝나고, 첫 시선이 그 진입점 또는 기억할 요소에 간다                                                                             | 브리프 체크리스트 1             |
| Hierarchy      | 2초 안에 primary / secondary / tertiary가 크기 · 무게 · 색 중 둘 이상으로 구분된다                                                                           | craft 체크 2                    |
| States         | loading · empty · error · success · partial이 모두 설계됐고 구현됐다                                                                                         | state matrix · ui-checklist     |
| Execution      | 게이트 전부 통과(대비 · overflow · 폰트 수 · 탭 타깃 · 리터럴 비율 · keep-all)                                                                               | `design-loop/r<n>/metrics.json` |
| Restraint      | 지워도 task에 영향 없는 장식이 없다. accent 하나, signature 하나                                                                                             | craft 체크 6 · 12               |
| Craft          | craft.md 12개 기본값이 적용됐다: 틴트 중립색 · 층 그림자 · hairline · 브라우저 표면 · 타이포 대비 · tabular · radius 중첩 · 피드백 모션 · 밀도 · 아이콘 세트 | craft 체크 3–5 · 7–10           |
| Explainability | craft · DESIGN.md 밖의 모든 treatment가 사다리 1–4단 중 하나를 근거로 댄다                                                                                   | decision record 5단             |

결과는 Rationale 첫 줄에 적는다: `axes: 7/7` 또는 `axes: 6/7 (Craft no → r3에서 수정)`.

## 2. Rationale — 왜 이렇게 만들었나 (10줄 이내)

```md
## Rationale — <화면>

mode: adaptation lineage: <id 또는 fidelity 소스> loop: r2 gates 9/9 checks 14/20→18/20 axes: 7/7

1. task: <primary task 한 줄>. 완료까지 <n>회 조작.
2. hierarchy: <1순위>를 첫 화면 좌상단에, <3순위>는 접음. 이유: <빈도 · 결정 순서>.
3. interaction: <조작 모델>. <대안>을 버린 이유: <한 줄>.
4. feedback: loading은 <skeleton>, error는 <inline>, success는 <조용히/undo toast>. 이유: <한 줄>.
5. visual: 계보 <id> + 노브 <hue · 페어링 · radius/밀도>. signature <무엇> — <돕는 단>.
   craft 밖 treatment <없음 / 있음 — 돕는 단>.
6. trade-off: <얻은 것> 대신 <포기한 것>.
7. 검증 필요 가정: <사용자 조사 없이는 확신할 수 없는 것 한 가지. Look 3라운드 뒤에도 no였던 항목 포함>.
```

규칙:

- 5번에서 craft · DESIGN.md 밖인데 "돕는 단"을 못 쓰는 treatment는 코드에서도 지운다.
- 6번 trade-off가 "없음"이면 대안을 탐색하지 않은 것이다.
- 7번은 반드시 있다. 모든 설계에는 검증 안 된 가정이 있다.
- `loop:` 줄이 없으면 Look 루프를 돌지 않은 것이다. 완료가 아니다.

## 3. User validation — 사용자에게 넘기는 검증 방법

실행은 사용자 몫이다. 이 skill은 스크립트와 지표까지 제안한다.

### 5초 테스트

화면을 5초 보여주고 가린 뒤 묻는다. 3명이면 충분하다.

1. 이 화면은 무엇을 하는 곳인가요?
2. 여기서 제일 먼저 무엇을 하시겠어요?
3. 기억나는 것 하나만 말해 주세요.

1 · 2번 답이 primary task와 다르면 Impression과 Hierarchy를 다시 본다. 3번 답이 브리프의 "기억할
요소"와 다르면 signature를 다시 본다.

### Task walkthrough

primary task를 말로 주고(“<상황>에서 <결과>를 얻어 보세요”) 관찰한다. 도와주지 않는다.

- 어디서 멈췄나? (멈춤 = discoverability 결함)
- 어디서 되돌아갔나? (되돌림 = hierarchy 또는 카피 결함)
- 끝났다고 스스로 알았나? (몰랐다 = feedback 결함)

### Pairwise 취향 보정 (Adaptation)

같은 브리프의 다른 라운드 · 다른 노브 스크린샷 두 장을 나란히 보여주고 "어느 쪽이 이 제품
같나요"만 묻는다. 점수를 묻지 않는다. 결과는 `.design/log.json`의 `decisions`에 남긴다 — 다음
실행의 심판 문항이 여기서 자란다.

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
