# Typography — 한국어 화면 기본값

브리프 언어가 한국어이거나 화면에 한글이 있으면 이 파일이 라틴 폰트 조언(계보 파일의
페어링 · `visual-system.md` §3)보다 **앞선다**. 사다리 순서와는 무관하다 — 이건 취향이 아니라
렌더링 결함을 막는 규칙이다.

## 왜 따로 있나

Inter · Space Grotesk · Instrument Serif · Geist · Fraunces에는 한글이 없다. 한글 문자열은
Malgun Gothic(Windows) · Apple SD Gothic Neo(macOS · iOS) · Noto Sans CJK(Android)로 **조용히
fallback**되고, 굵기 · x-height · baseline이 다른 두 번째 가족이 한 문장 안에 섞인다. Pretendard
· Interop · Toss Product Sans는 정확히 이 불일치를 없애려고 만들어졌다 — Toss는 "국문과
동일한 두께로 맞추면 숫자, 영문이 너무 얇아 보여" 라틴과 숫자를 더 굵게 그렸다. 라틴 우선
스킬의 폰트 조언은 한국어 화면에서 전부 역효과다.

## 기본값 (복사해서 토큰 블록에 넣는다)

```css
/* 폰트: 한글 + 라틴이 한 가족인 것 하나 */
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');

:root {
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue',
    'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
}

html {
  font-family: var(--font-sans);
  font-synthesis: none; /* CJK 가짜 bold · italic 금지 */
  -webkit-font-smoothing: antialiased;
}

body {
  font-size: 16px; /* 본문 16–17px. 모바일 input도 16px 이상 */
  line-height: 1.6; /* 한글은 baseline이 낮아 1.5 미만이면 빽빽하다 */
  letter-spacing: -0.01em; /* em 단위, −0.02em 이하로 내리지 않는다 */
  word-break: keep-all; /* 어절 단위 줄바꿈 */
  overflow-wrap: break-word; /* 긴 URL · 좁은 셀의 overflow 방지 */
}

h1,
h2,
h3 {
  line-height: 1.3;
  letter-spacing: -0.02em;
  font-weight: 700;
  word-break: keep-all; /* 375px에서도 유지 — normal로 풀면 "정산\n을"처럼 음절이 끊긴다 */
  overflow-wrap: anywhere; /* 한 어절이 폭을 넘을 때만 어절 안에서 끊는다 */
  text-wrap: balance; /* keep-all 없이 balance를 쓰면 음절 중간에서 끊긴다 */
}

p,
li {
  text-wrap: pretty;
}

.num,
td,
time {
  font-variant-numeric: tabular-nums; /* 금액 · 데이터 */
}

:lang(en) {
  letter-spacing: 0; /* 라틴 전용 문자열은 음수 자간에서 과하게 좁아진다 */
}
```

## 규칙 표

| 항목          | 값                                                                                                      | 출처                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 가족          | 한글 완비 가족 1개가 본문. 라틴 display는 `unicode-range`로만                                           | Pretendard README · Interop · Toss TPS                        |
| 크기          | 본문 16–17px, 캡션 13px 이상                                                                            | KRDS 17/15/13 · TDS t5 17px                                   |
| 행간          | 본문 1.5–1.7(기본 1.6), 제목 1.25–1.35                                                                  | KRDS ≥150% · toss.im `line-height:1.6` 19회 · Remain 1.5–1.75 |
| 자간          | 본문 −0.01em, display −0.02em, 라틴 전용 0                                                              | toss.im `-.02em` 11회 · naver.com −0.3px · uxdev              |
| 굵기          | 400 · 500 · 600 · 700만. 300 이하 금지                                                                  | KRDS 400/700 · Toss(한글은 굵게 보인다)                       |
| 줄바꿈        | `keep-all` + `overflow-wrap: break-word`(본문) · `anywhere`(제목). 좁은 폭에서도 `normal`로 풀지 않는다 | MDN · toss.im keep-all 10회 · ryelle                          |
| 합성          | `font-synthesis: none`                                                                                  | MDN                                                           |
| 숫자          | 금액 · 표 · 시간은 `tabular-nums`                                                                       | toss.im `tnum` · Pretendard `tnum` 지원                       |
| 스케일(TDS형) | 30/40 · 26/35 · 22/31 · 20/29 · **17/25.5** · 15/22.5 · 13/19.5                                         | TDS typography 문서                                           |

## 라틴 display 폰트가 꼭 필요할 때

```css
@font-face {
  font-family: 'Display Latin';
  src: url('/fonts/display.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2074, U+20AC, U+2122;
  font-weight: 600 800;
}
h1 {
  font-family: 'Display Latin', var(--font-sans); /* 한글은 Pretendard가 받는다 */
}
```

- 라틴 굵기를 한글보다 **한 단계 올린다**(Toss · Interop의 교훈). 같은 굵기로 두면 라틴이
  가늘어 보인다.
- `unicode-range` 없이 라틴 폰트를 `font-family` 앞에 두면 한글이 시스템 폰트로 떨어진다.
  이것이 "AI가 만든 한국어 화면" 인상의 큰 부분이다.

## 대안 가족

| 상황               | 가족                  | 이유                                                  |
| ------------------ | --------------------- | ----------------------------------------------------- |
| 범용 UI            | Pretendard (Variable) | Inter 계열 라틴 + 본고딕 한글, 9 weights, OFL         |
| 고밀도 도구        | SUIT                  | 한글을 97%로 줄여 같은 폭에 더 많은 텍스트, OFL       |
| 숫자 · 데이터 중심 | Spoqa Han Sans Neo    | Lato 숫자, "숫자, 데이터 표현이 중요한 서비스에 추천" |
| 브랜드 · 마케팅    | Wanted Sans           | 기하학적 휴머니스트, OFL                              |
| 공공               | Pretendard GOV        | KRDS 지정                                             |

Toss Product Sans는 배포 불가 자산이다 — 쓰지 않는다. Noto Sans KR은 안전하지만 무겁고
라틴 옆에서 한글이 크고 낮게 앉는다.

## 게이트

`scripts/render.mjs --lang ko`가 `hangulKeepAllCoverage`를 계산한다. 0.95 미만이면 결함이다.
폰트 가족 수는 ko에서도 2 이하 — Pretendard + (선택) 라틴 display.
