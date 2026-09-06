# Look — 채점형 시각 루프

Build 직후 **반드시** 돈다. 보지 않은 화면은 완료가 아니다. 이 루프는 자기비평이지 검증이
아니다 — `frontend-visual-qa`의 `VERIFIED`를 발급하지 않고 Oracle artifact도 만들지 않는다.

근거 한 줄: 채점 없는 "보고 고치기"는 효과가 거의 없고(Design2Code), 채점 + 개선일 때만
채택 + 라운드 상한이 있는 루프는 정확도를 두 배로 올린다(WebGen-Agent · ReLook). 절차의
세 요소를 빼면 루프가 아니다.

## 0. 준비 — 렌더 대상

- dev server가 있으면 그 URL. 없으면 **정적 하네스**를 만든다: `design-loop/harness.html`에
  토큰 블록(`:root` / `.dark`)과 대상 컴포넌트 · 화면을 인라인한다. 외부 요청은 폰트 CDN만.
- 하네스는 실제 카피와 실제 길이의 데이터를 쓴다. `Lorem ipsum`과 한 줄짜리 가짜 데이터는
  줄바꿈 · 밀도 결함을 숨긴다.

## 1. 렌더 + 결정론 검사 (도구)

```bash
node <skill>/scripts/render.mjs --in design-loop/harness.html --out design-loop/r1 \
  --viewports 375,1280 --themes light,dark --lang ko --source src/
```

`<out>/375-light.png` 등 스크린샷과 `<out>/metrics.json`이 나온다. metrics의 게이트는
`evals/gates.json` 기본값을 따른다: 대비 실패 0 · 가로 overflow 0 · 폰트 가족 ≤2 · 이모지
글리프 0 · 12px 미만 텍스트 0 · 24px 미만 탭 타깃 0 · 80ch 초과 본문 0 · 토큰 외 리터럴 비율
≤0.1 · (ko) keep-all 커버리지 ≥0.95.

- 게이트 실패는 **비평 전에** 고친다. 결정론 결과는 LLM 판단을 앵커링하므로 먼저 확정한다.
- `impeccable`이 설치돼 있으면 `--impeccable`을 붙인다(browser 엔진). 소스 스캔(`detect src/`)
  결과는 undercount라서 게이트 근거로 쓰지 않는다.
- Playwright가 없으면 프로젝트의 Playwright 또는 browser MCP로 같은 뷰포트를 찍고,
  metrics는 "미측정"으로 기록한다. 스크린샷 없이 다음 단계로 가지 않는다.
- 전체 페이지 캡처에서 `fixed` · `sticky` 하단 바(탭 바 · 토스트 · 하단 CTA)는 첫 뷰포트의
  바닥, 즉 페이지 중간에 찍힌다. 캡처 아티팩트지 결함이 아니다 — 겹침으로 세지 않고, 확인이
  필요하면 뷰포트 높이를 문서 높이로 늘려 한 번 더 찍는다.

## 2. 섹션별 비평 (체크리스트, yes/no만)

스크린샷을 **섹션 순서**로 본다: 첫 화면(hero · nav · 첫 카드 열) → 본문 → 폼 · 표 → footer.
전체를 한 번에 보면 첫 인상이 나머지를 덮는다(DCGen: 분할 비평 +15%).

두 체크리스트에 yes/no로만 답한다. 점수를 매기지 않는다 — VLM 판단은 순위는 맞히지만
절대점수는 못 준다.

**A. 브리프 체크리스트 10문항** — Frame 단계에서 만든 것(`references/adaptation.md` § 브리프).
없으면 `evals/briefs.json`의 같은 유형 브리프 문항을 빌린다.

**B. Craft 체크리스트 10문항** (`references/craft.md` 번호 참조)

| #   | 질문                                                                             | craft |
| --- | -------------------------------------------------------------------------------- | ----- |
| 1   | 2초 안에 첫 시선이 primary action 또는 primary 정보에 가는가                     | —     |
| 2   | primary / secondary / tertiary 세 층이 크기 · 무게 · 색 중 둘 이상으로 갈리는가  | —     |
| 3   | 섹션 > 그룹 > 요소 순으로 간격이 줄어드는가 (같은 gap 반복이 아닌가)             | 9     |
| 4   | 텍스트 · 아이콘 · 컨트롤이 하나의 grid/baseline에 정렬돼 있는가 (광학 보정 포함) | 12    |
| 5   | display와 body의 크기 · 무게 대비가 뚜렷한가 (400×600이 아니라 극단인가)         | 5     |
| 6   | accent가 한 화면의 5% 이하이고 primary action · 현재 위치에만 쓰였는가           | 1     |
| 7   | 중립색이 anchor hue로 틴트돼 있고 순수 회색 · 순수 검정이 없는가                 | 1     |
| 8   | 표면 구분이 한 가지 체계(간격 > 배경 > 그림자 > border)로 일관되는가             | 2 · 3 |
| 9   | 밀도가 청중 · 빈도에 맞는가 (온보딩 sparse · 운영 도구 dense)                    | 9     |
| 10  | 브라우저 표면(focus ring · selection · 스크롤바 · 숫자)이 토큰을 쓰는가          | 4 · 6 |

ko 브리프면 11번을 더한다: 한글 줄바꿈이 어절 단위이고 행간이 1.5 이상인가 (`typography-ko.md`).

`no`마다 **수정 1줄**을 적는다 — 무엇을 어느 값으로. "더 세련되게"는 수정이 아니다.

```md
## design-loop/r1/critique.md

gates: contrast 2 fail · overflow 0 · fonts 2 · keep-all 0.6 → fix first
A. brief: 7/10 (no: 3, 6, 9)
B. craft: 6/10 (no: 3, 5, 7, 10)
critical (A1 · A8 · B1 · B2): 3/4 (no: B2)
target: B2 — 이번 라운드가 고치려는 결함
fixes:

- A3 hero CTA가 fold 아래 → hero 높이 100svh→auto, CTA를 h1 직후로
- B3 섹션 gap 전부 32px → section 96 / group 32 / item 12
- B5 h1 600 / body 400 → h1 800 -0.02em / body 400
- B7 #6b7280 회색 → oklch(52% 0.02 <anchor h>)
- B10 focus ring 브라우저 기본 → --ring 토큰 2px offset 2px
```

## 3. 수정 → 재렌더 → 비교 → 모든 조건을 만족할 때만 채택

1. fixes를 전부 반영한다. 한 번에 한 항목씩 고치지 않는다 — 라운드가 비싸다.
2. `--out design-loop/r2`로 재렌더한다.
3. r1과 r2를 **나란히** 놓고 같은 체크리스트로 다시 답한다.
4. **채택 규칙** — 세 조건을 순서대로 본다. 통과 개수는 그중 하나일 뿐이다.

| #   | 조건                                                                                       | 위반하면      |
| --- | ------------------------------------------------------------------------------------------ | ------------- |
| 1   | **하드 게이트**: `gates.json`의 모든 항목이 통과한다. 미측정도 실패다                      | 무조건 반려   |
| 2   | **치명적 무퇴행**: task 문항(A1 · A8)과 시각 핵심 문항(B1 · B2)이 yes에서 no로 되지 않는다 | 무조건 반려   |
| 3   | **진전**: 겨눈 결함이 실제로 고쳐졌거나(그 문항이 no→yes) A+B 통과 수가 늘었다             | 반려(r1 유지) |

조건 3이 "**또는**"인 것이 핵심이다. 한 결함을 제대로 고쳐서 다른 문항 하나가 같이 무너졌다면
합계는 그대로지만 화면은 나아졌을 수 있다. 그때 수정을 버리는 것은 합계를 위해 결함을 지키는
것이다. 반대로 통과 수가 2 늘어도 조건 1·2를 깨면 반려다 — 총점에 숨은 치명적 회귀는 개선이 아니다.

채택 · 반려를 한 줄로 적는다: `r2 accept: gates 9/9→9/9, critical 4/4, target A3 no→yes, checks 14/20→16/20`.
"느낌이 낫다"는 채택 근거가 아니다.

## 4. 정지 규칙 — 한 요청 안에서 끝난다

- **첫 렌더 1회 + 보수 최대 2회**(= r1 · r2 · r3). 사용자에게 돌아가기 전에 끝난다.
  라운드 2–5에서 포화한다(UI2Code^N · Sketch2Code).
- 2라운드 연속 채택되지 않으면 정지한다.
- 게이트가 마지막 라운드 뒤에도 실패하면 **게이트를 완화하지 않고** Rationale의 "남은 결함"에
  적어 사용자에게 알린다. 물어보기 위해 멈추지 않는다([`one-shot.md`](one-shot.md)).

## 4-1. 실제 앱 vs 정적 하네스 — 무엇을 검증했는지 구분한다

| 렌더 대상                  | 적는 말                 | 무엇을 보장하나                                      |
| -------------------------- | ----------------------- | ---------------------------------------------------- |
| dev server · 실제 라우트   | `validated: actual-app` | 실제 데이터 · 실제 CSS · 실제 폰트 로딩으로 측정했다 |
| `design-loop/harness.html` | `validated: surrogate`  | 토큰과 마크업만 측정했다. 통합 결함은 모른다         |

surrogate로 돌았으면 Rationale에 그대로 적는다. 하네스가 통과했다고 앱이 통과한 것은 아니다 —
반대 순서로 말하면 그것이 과장이다.

## 5. 기록

- `design-loop/r<n>/{375,1280}-{light,dark}.png` · `metrics.json` · `critique.md`를 남긴다.
- Rationale 첫 줄에 적는다: `loop: r2 gates 9/9 critical 4/4 checks 14/20→18/20 validated: surrogate`.
  절대점수(`T4 H5 …`)는 쓰지 않는다.
- 마지막 라운드 뒤에도 `no`인 항목은 Rationale의 "검증 필요 가정"에 옮긴다.

## 6. Impeccable이 설치된 경우 (가산)

- 1단계의 `--impeccable`은 browser 엔진 결과만 게이트에 넣는다.
- `impeccable critique <target>`은 2단계의 **두 번째 의견**이다. 우리 체크리스트가 1순위이고,
  critique의 지적은 `fixes`에 증거로 인용한다. 채택 여부는 3단계 규칙으로 판정한다.
- `impeccable polish <target>`은 루프가 끝난 뒤 finisher로 **1회**. polish 뒤에도 3단계의 세 조건으로
  한 번 더 비교하고, 조건을 하나라도 어기면 되돌린다.
