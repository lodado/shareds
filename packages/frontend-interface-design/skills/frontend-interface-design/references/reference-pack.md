# Reference Pack — "X처럼" 요청에 답하는 증거 단위

사용자가 **브랜드 이름 하나**로 UI를 요구할 때("오늘의집 UI처럼", "Vercel UI처럼") 쓰는 모드다.
이 모드의 규칙은 하나로 줄어든다: **이름은 증거가 아니다.** 팩이 있으면 팩의 관측값을 따르고,
없으면 없다고 말하고 계보로 내려간다. 이름만 보고 값을 지어내는 것은 이 skill의 가장 큰 결함이다.

산출물은 브리프와 방향 합의 뒤 **한 번의 자율 제작 흐름**으로 끝낸다. 중요한 미확정 정보는
질문으로 확정한다([`one-shot.md`](one-shot.md)). 위임받은 시각 선택만 직접 결정한다.

## 1. 팩이 무엇을 보증하나 — 세 가지 증거 등급

모든 값은 `evidence` 등급을 하나 달고 산다. 등급이 없는 값은 팩에 넣지 않는다.

| 등급         | 뜻                                                           | 만드는 법                                | 쓸 수 있는 말                   |
| ------------ | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------- |
| `observed`   | 그 URL을 그 날짜에 브라우저로 열어 계산한 값                 | `scripts/observe.mjs`가 낸 JSON          | "관측했다"                      |
| `estimated`  | observed 값에서 파생 · 반올림 · 토큰 스케일로 스냅한 값      | observed 값 + 파생 규칙 한 줄            | "관측값에서 유도했다"           |
| `unverified` | 공개 접근이 막혀 관측하지 못한, 도메인 지식 기반의 일반 패턴 | 관측 실패 기록(`accessNote`) + 근거 문장 | "브랜드 재현이 아니다"라고 먼저 |

`unverified` 팩은 **브랜드 충실도를 주장하지 않는다.** Rationale과 사용자 응답의 첫 줄에
"관측하지 못했다"가 들어간다. 관측이 막혔다고 값을 지어내면 그것이 조작이다.

## 2. 팩의 스키마 — `references/packs/<id>.json`

`scripts/pack.mjs --validate`가 강제하는 필드다. 하나라도 빠지면 팩은 로드되지 않는다.

```jsonc
{
  "id": "vercel-developer-platform", // 파일명과 같다
  "brand": "Vercel", // 사용자가 말한 이름 (매칭용 aliases 포함)
  "aliases": ["vercel", "버셀"],
  "task": "developer-platform-marketing", // 이 팩이 푸는 primary task
  "pages": ["landing"], // 관측한 페이지 종류
  "devices": ["mobile", "desktop"],
  "evidenceStatus": "observed", // observed | partial | unverified (팩 전체의 최저 등급)
  "provenance": [
    // observed/partial 팩은 최소 1개
    {
      "url": "https://vercel.com/",
      "observedAt": "2026-09-06",
      "device": "desktop",
      "viewportWidth": 1440,
      "theme": "dark",
      "httpStatus": 200,
      "method": "browser-observed"
    }
  ],
  "accessNote": null, // unverified/partial이면 왜 못 봤는지 한 줄
  "lineageFallback": "precision-tool", // 팩을 못 쓸 때 내려갈 계보
  "tokens": { "<name>": { "value": "...", "evidence": "observed", "note": "..." } },
  "layout": { "slots": [{ "id": "hero", "evidence": "observed", "note": "..." }] },
  "typeScale": [{ "role": "display", "value": "64px/450/-0.03em", "evidence": "observed" }],
  "components": { "<role>": { "pattern": "...", "evidence": "estimated" } },
  "responsive": [{ "breakpoint": 768, "change": "...", "evidence": "observed" }],
  "content": { "images": "...", "copy": "...", "evidence": "estimated" },
  "allowedModifications": ["..."], // 팩을 어겨도 되는 경우 (a11y · 접근성 · task)
  "forbidden": ["..."], // 절대 하지 않는 것 (로고 · 카피 · 에셋 복제)
  "primitives": [
    // 선택. 없으면 빈 배열
    {
      "name": "Geist",
      "kind": "font",
      "license": "OFL-1.1",
      "version": "...",
      "source": "https://github.com/vercel/geist-font",
      "verifiedAt": "2026-09-06",
      "dependencies": "none (webfont)"
    }
  ]
}
```

### 값 형식

- `tokens`의 값은 CSS로 바로 쓸 수 있는 문자열이다. 색은 관측한 `rgb()`를 그대로 두지 않고
  프로젝트 토큰 이름(`--bg` · `--fg` · `--accent` …)에 매핑한다. 이름은 exemplars의
  [`tokens.css`](../exemplars/tokens.css)를 따른다 — 새 이름을 만들지 않는다.
- `layout.slots[]`는 관측한 **밴드 순서**다. 픽셀 높이가 아니라 역할과 순서가 계약이다.
- `components.<role>.pattern`은 한 줄 문장이다. 코드가 아니다.

## 3. 라우팅 — 이름에서 팩까지

```
사용자 발화 → normalize(브랜드 이름) → packs/*.json의 brand · aliases와 매칭
  ├ 매칭 O + evidenceStatus observed|partial → Reference-informed Adaptation
  │    task가 사용자 task와 다르면 layout은 버리고 tokens · typeScale만 채택(팩의 task 표기 필수)
  ├ 매칭 O + evidenceStatus unverified      → Unverified route: 계보 + 팩의 패턴 힌트,
  │    "브랜드 재현 아님"을 먼저 말한다
  └ 매칭 X                                   → 팩 없음. adaptation.md 계보 표로 간다.
                                              브랜드 이름을 근거로 값을 만들지 않는다
```

`scripts/pack.mjs --route "<발화>"`가 이 결정을 결정론적으로 돌려준다. 라우팅 결과의
`mode` · `packId` · `evidenceStatus`를 decision record에 그대로 적는다.

## 4. 새 레퍼런스를 관측할 때 (팩이 없고 URL · 스크린샷이 있을 때)

```bash
node <skill>/scripts/observe.mjs --url https://<public page> --device desktop --theme light \
  --out .design/observations/<name>.json
```

- **공개 페이지만.** 로그인 뒤 · 내부망 · 유료 벽은 대상이 아니다.
- 403 · 봇 차단 · 빈 SPA 껍데기면 스크립트가 exit 2로 멈춘다. **우회하지 않는다.** 그 레퍼런스는
  `unverified`이고, 사용자에게 스크린샷을 요청하거나 계보로 내려간다.
- 관측 JSON은 **집계값과 구조**만 담는다(폰트 가족 · 타입 스케일 · 색 역할 · radius · 간격 ·
  슬롯). 카피 · 이미지 URL · 로고 · CSS 원문은 담지 않는다. 그것을 가져오면 복제다.
- 스크린샷만 있으면 `estimated`가 상한이다. 스냅 규칙은 [`fidelity.md`](fidelity.md)와 같다.

## 5. 하나의 시각 시스템 — 섹션 출처는 여러 개

여러 팩의 전역 색 · 폰트 · 밀도를 그대로 겹치지 않는다. 사용자 소스와 선택된 방향을 기준으로
하나의 공통 토큰 시스템을 정한다. `pack.mjs --route`의 `packId` 하나는 기본 팩 식별자이지
섹션 레퍼런스 수의 제한이 아니다. 스크립트의 라우팅 결과를 다중 팩 응답으로 꾸미지 않는다.

다른 팩 · 템플릿의 구도와 정보 묶음도 섹션 역할에 맞으면 후보로 비교할 수 있다.
[`section-composition.md`](section-composition.md)에 출처 · 관측 범위 · 유지할 구성 · 조정할 스타일을
기록한다. 충돌하는 브랜드 방향은 [`art-direction.md`](art-direction.md)에서 먼저 정하며,
Fidelity 보존 범위의 색 · 타입 · 구도를 임의로 바꾸지 않는다.

open-source 프리미티브는 시각 권위가 아니라 **구현 재료**다. 쓰려면 네 가지를 팩의
`primitives[]`에 기록한다: 이름 · 라이선스(SPDX) · 버전 · 새 런타임 의존성 여부. 확인하지 못한
것은 쓰지 않는다. 라이브러리를 "혹시 몰라" 설치하지 않는다 — 실제로 쓰는 것만.

## 6. 절대 하지 않는 것

- 사용 권한이 없는 로고 · 사진 · 카피 · 소스 코드를 복제하지 않는다. 사용자 제공 권한이나
  라이선스가 허용하는 코드 · 자산은 출처 · 고정 버전 · 의무를 기록하고 재사용한다.
  팩의 관측 데이터는 **레이아웃 · 리듬 · 역할**의 기록이지 무단 자산 사본이 아니다.
- 브랜드 이름만 보고 색 · 폰트 · 간격을 "그 브랜드의 값"이라고 적지 않는다. 관측 없으면
  `unverified`다.
- 봇 차단 · 인증 벽을 우회하지 않는다. 막히면 막혔다고 적는다.
- 팩의 값이 대비 · 탭 타깃 · 반응형을 깨면 팩을 따르지 않는다. `allowedModifications`가
  그 목록이고, 이탈은 전부 기록한다.

## 7. 현재 팩

| id                          | brand    | task                         | evidence     | 비고                                                    |
| --------------------------- | -------- | ---------------------------- | ------------ | ------------------------------------------------------- |
| `vercel-developer-platform` | Vercel   | developer-platform-marketing | `observed`   | 2026-09-06 관측(desktop 1440 · mobile 390 · light/dark) |
| `ohouse-content-commerce`   | 오늘의집 | content-commerce-home        | `unverified` | ohou.se가 자동화 접근에 HTTP 403 — 관측 실패 기록       |
