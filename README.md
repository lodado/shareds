# shareds

**코딩 에이전트에 꽂아 쓰는 지식 샤드예요. 그동안 쌓은 개발 노하우를 스킬과 ESLint 프리셋으로 만들어 뒀어요.**

[![CI](https://github.com/lodado/shareds/actions/workflows/intergrate_workflow.yml/badge.svg?branch=main)](https://github.com/lodado/shareds/actions/workflows/intergrate_workflow.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENCE)
[![Node.js](https://img.shields.io/badge/Node.js-22.22_%7C_24.15%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9%2B-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![GitHub stars](https://img.shields.io/github/stars/lodado/shareds?style=social)](https://github.com/lodado/shareds/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/lodado/shareds)](https://github.com/lodado/shareds/issues)

[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-D97757?logo=claude&logoColor=white)](https://docs.anthropic.com/en/docs/claude-code)
[![Codex](https://img.shields.io/badge/Codex-skills-111111?logo=openai&logoColor=white)](https://github.com/openai/codex)
[![ESLint](https://img.shields.io/badge/ESLint-flat_config-4B32C3?logo=eslint&logoColor=white)](https://eslint.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)

[뭐가 들어 있어요](#뭐가-들어-있어요) · [스킬 꽂기](#스킬-꽂기) · [ESLint 쓰기](#eslint-쓰기) · [Oracle Design](#oracle-design-자세히) · [패키지](#패키지) · [개발](#개발)

---

사이버펑크 2077에 '샤드'라는 아이템이 있어요. 칩 하나 꽂으면 다른 사람 지식이 통째로 내 것이 돼요.
이 레포가 딱 그거예요. 테스트, 시각 QA, 시스템 설계, 에이전트 오케스트레이션을 스킬로 만들어 뒀어요.
코딩 에이전트에 꽂으면 바로 써요. 코드 품질 규칙은 ESLint 프리셋으로 따로 빼놨어요.

```text
쌓아둔 개발 지식  ──▶  Claude Code / Codex 스킬  ──▶  설계·구현·검증이 일정해져요
코드 품질 규칙    ──▶  조합형 ESLint 프리셋      ──▶  에디터랑 CI에서 바로 잡아줘요
```

## 뭐가 들어 있어요

| 영역      | 들어 있는 것                                                                  | 배포              |
| --------- | ----------------------------------------------------------------------------- | ----------------- |
| 코드 품질 | 조합형 ESLint 프리셋, 직접 만든 규칙                                          | npm               |
| 검증      | Oracle 계약, TDD, 행동 테스트, 브라우저·스크린샷                              | 에이전트 플러그인 |
| 설계      | 프론트엔드 시스템 패턴, Figma 제품·랜딩 디자인, 모바일 웹게임 기획·프로토타입 | 에이전트 플러그인 |
| 에이전트  | 워크플로 그래프 설계랑 실행                                                   | 에이전트 플러그인 |

## 스킬 한눈에 보기

스킬 이름을 누르면 사용 조건과 실행 절차를 볼 수 있어요. 플러그인 하나에 여러 스킬이 들어 있기도 해요.

| 스킬                                                                                                                    | 하는 일                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`eslint-setup`](packages/vibe-coding-helper/skills/eslint-setup/SKILL.md)                                              | 프로젝트에 맞는 ESLint 프리셋을 선택하고 설정해요.                              |
| [`frontend-oracle-design`](packages/frontend-oracle-design/skills/SKILL.md)                                             | 중·고위험 프론트엔드 작업의 동작 계약을 정하고 테스트·구현·리뷰를 진행해요.     |
| [`frontend-system-design`](packages/frontend-system-design/skills/SKILL.md)                                             | Oracle 설계에 검색·채팅·결제 같은 기능의 구현 선택지와 실패 대응을 보태요.      |
| [`test`](packages/test/skills/test/SKILL.md)                                                                            | 프론트엔드 동작과 회귀 오류를 확인하는 자동화 테스트를 작성·실행해요.           |
| [`frontend-visual-qa`](packages/frontend-visual-qa/skills/frontend-visual-qa/SKILL.md)                                  | 승인된 화면 기준과 실제 브라우저 동작을 비교해 시각적 오류를 찾아요.            |
| [`reference-driven-figma-design`](packages/frontend-interface-design/skills/reference-driven-figma-design/SKILL.md)     | 레퍼런스와 디자인 시스템을 바탕으로 편집 가능한 Figma 화면을 만들어요.          |
| [`reference-driven-3d-character`](packages/reference-driven-3d-character/skills/reference-driven-3d-character/SKILL.md) | 레퍼런스 기반 3D 캐릭터의 도안·모델·요청한 동작을 만들고 단계별로 검수해요.     |
| [`game-interface-design`](packages/game-interface-design/skills/game-interface-design/SKILL.md)                         | 게임 요청을 기획·Figma·Three.js 구현 중 맞는 스킬로 연결해요.                   |
| [`reference-driven-game-design`](packages/game-interface-design/skills/reference-driven-game-design/SKILL.md)           | 모바일 웹게임의 핵심 규칙·플레이 흐름·HUD·손맛·검증 계획을 기획해요.            |
| [`threejs-game-wireframe`](packages/game-interface-design/skills/threejs-game-wireframe/SKILL.md)                       | 기획을 받아 FSD·헤드리스 ECS 구조의 Three.js 프로토타입을 만들고 검증해요.      |
| [`ux-flow-diagram`](packages/ux-flow-diagram/skills/ux-flow-diagram/SKILL.md)                                           | 명시적으로 호출하면 Figma·코드·요구사항에서 근거 있는 사용자 흐름도를 추출해요. |
| [`agent-graph-engineering`](packages/agent-graph-engineering/skills/agent-graph-engineering/SKILL.md)                   | 여러 에이전트와 도구의 분기·병렬 작업·재시도를 그래프로 설계하고 실행해요.      |
| [`agent-memory-recall`](packages/agent-memory/skills/agent-memory-recall/SKILL.md)                                      | 현재 작업에 필요한 과거 기록을 Agent Memory에서 읽기 전용으로 찾아요.           |
| [`agent-memory-log`](packages/agent-memory/skills/agent-memory-log/SKILL.md)                                            | 요청한 작업 기록을 Obsidian Agent Memory에 저장해요.                            |
| [`agent-memory-todayilearned`](packages/agent-memory/skills/agent-memory-todayilearned/SKILL.md)                        | 요청한 배움을 날짜별 TIL 노트로 정리해요.                                       |
| [`agent-memory-generalize`](packages/agent-memory/skills/agent-memory-generalize/SKILL.md)                              | 작업 기록에서 다른 작업에도 쓸 수 있는 개념을 근거와 함께 추출해요.             |
| [`agent-memory-p0-rules`](packages/agent-memory/skills/agent-memory-p0-rules/SKILL.md)                                  | 규칙 후보의 근거와 범위를 검토해 수동 승격 여부를 판단해요.                     |
| [`agent-memory-maintenance`](packages/agent-memory/skills/agent-memory-maintenance/SKILL.md)                            | Agent Memory의 중복·오래된 기록·끊어진 링크를 점검하고 정비해요.                |

## 스킬 꽂기

Claude Code는 두 줄이면 끝나요.

```text
/plugin marketplace add lodado/shareds
/plugin install vibe-coding-helper@my-vibe-coding-helper
```

`vibe-coding-helper` 자리에 원하는 플러그인 이름을 넣으면 돼요.

```text
vibe-coding-helper
frontend-oracle-design
agent-graph-engineering
frontend-system-design
test
frontend-visual-qa
frontend-interface-design
reference-driven-3d-character
game-interface-design
ux-flow-diagram
agent-memory
```

패키지 안에 `.claude-plugin/plugin.json`이랑 `.codex-plugin/plugin.json`이 같이 들어 있어요.
둘 다 같은 `skills/` 디렉터리를 읽어요. 스킬 하나 만들면 두 에이전트가 같이 써요.

### UX Flow Diagram

[`ux-flow-diagram`](packages/ux-flow-diagram) runs only when explicitly invoked as
`$ux-flow-diagram`. It reads Figma Prototype reactions, bounded codebase traces,
requirements, or an existing Flow IR and produces evidence-aware JSON, Markdown,
and Mermaid. Ordinary design or coding requests do not activate it. It never
modifies Prototype connections; FigJam export requires a separate explicit request.

The Figma design skill separately creates approved Prototype connections while
building interactive designs and verifies them by reading the reactions back.

## ESLint 쓰기

**설정 기준:** 2026-09-23

ESLint 10 전용이에요. base 프리셋을 깔고, 그 위에 필요한 것만 얹으면 돼요.

```js
// eslint.config.mjs
import base from '@lodado/eslint-config'
import react from '@lodado/eslint-config/react'
import a11y from '@lodado/eslint-config/a11y'
import quality from '@lodado/eslint-config/quality'
import localRules from '@lodado/eslint-config/local-rules'

export default [...base, ...react, ...a11y, ...quality, ...localRules]
```

쓸 수 있는 프리셋이에요.

```text
.(base) react next a11y turbo local-rules testing query quality fsd strict-types functional hook-tiers interaction tailwind ai design
```

플러그인은 패키지 의존성으로 함께 설치되지만, **규칙은 해당 프리셋을 import해야 켜져요.**

- `base`: disable 사유·규칙명을 요구하고, 사용하지 않는 disable을 오류로 잡아요.
  타입은 통과하지만 결함을 숨기는 async·mutation 습관(`return Promise.resolve()`,
  불필요한 `await`, thenable 객체, 즉시 mutation)도 잡아요.
- `react`: ESLint React strict 위에 React Compiler 진단(purity·immutability·refs·
  static-components·error-boundaries·use-memo)과 exhaustive-deps를 오류로 검사해요.
  리스너·fetch·observer·타이머 누수는 경고해요.
- `tailwind`: Tailwind v4 클래스의 오타·충돌·중복을 잡아요. `eslint-plugin-better-tailwindcss`와
  `tailwindcss`를 따로 설치하고 CSS 진입 파일을 알려줘야 해요.
- `ai`: 타입 검사를 통과하는 AI 코드 결함을 잡아요. `.map(async)`, 로그 후 재throw,
  검증 없는 `JSON.parse`, auth 없는 라우트 같은 것들이에요. `eslint-plugin-ai-guard`를
  따로 설치해야 하고, 다른 프리셋이 더 정확히 잡는 룰은 꺼둬요.
- `design`: 디자인 시스템을 벗어난 값(`bg-[#1A5276]`, `p-[13px]`)이랑 dark mode·반응형
  누락, `'use client'`로 새어 나간 서버 코드·env를 잡아요. `@deslint/eslint-plugin`을
  따로 설치해야 하고, Tailwind 테마가 실제로 스케일을 정의한 레포에서만 의미 있어요.
- `strict-types`: 처리하지 않은 Promise, Promise 오용, `any`의 전파, 불필요한 조건,
  누락된 union 분기를 타입 정보로 검사해요.
- `functional`: `domain/`, `selectors/` 아래 TypeScript와 `*.pure.ts`
  계산 코드의 변경·I/O·시간/난수 접근을 제한해요. 테스트는 제외하며 `.mts`·`.cts`도 지원해요.
- `hook-tiers`: 파일 경로로 훅 계층을 판정해요. UI는 `hooks/use<Domain>/` 진입점만 부르고,
  도메인 훅은 마이크로 훅과 순수 함수를 조합만 하고, 마이크로 훅은 상태 소유 라이브러리를 하나만 연결해요.
  소유자가 하나뿐인 도메인은 마이크로 폴더 없이 도메인 훅이 그 소유자를 바로 써도 돼요.

`strict-types`와 `functional`은 tsconfig가 필요하고 선택해서 추가해요.
`next`는 `@next/eslint-plugin-next`만 담고 있어서 `react`·`a11y`와 순서 상관없이 합쳐요.
순수 영역 밖의 I/O·React 코드까지 금지하지 않으며, ESLint가 완전한 순수성을 증명하지는 않아요.

더 자세한 건 여기 있어요.

- 설정 방법: [`eslint-setup` 스킬](packages/vibe-coding-helper/skills/eslint-setup/SKILL.md)
- `quality`가 AI 코드에서 뭘 막는지: [SonarJS AI quality 규칙](packages/eslint-config/QUALITY.md)

> npm 배포는 아직이에요. 지금은 이 레포를 워크스페이스로 가져다 쓰면 돼요.

## Oracle Design 자세히

[`frontend-oracle-design`](packages/frontend-oracle-design)은 이 레포에서 제일 큰 스킬이에요.
한 줄로 말하면 **구현 생성기가 아니라 검증 하네스**예요.

에이전트한테 기능을 시키면 보통 이래요. 애매한 부분을 자기 마음대로 정해요.
테스트는 통과했다고 하는데 뭘 통과했는지 몰라요. 나중에 보면 요구사항이 슬쩍 바뀌어 있어요.

Oracle은 그걸 막아요. 정하지 않은 정책은 **정하기 전까진 진행 안 해요**.
승인된 계약은 파일로 잠그고, 실행 결과는 전부 원장에 남겨요.

### 어떻게 도나요

```text
  요청
   │
   ├─ Low ──▶ low-fast-path: 기존 레포 검증만
   │
   └─ Medium / High
          │
          ▼
      ① DEFINE     Outcome Brief·Source Registry·계약 행 작성 + 사용자 확인
          │
          ▼
      ② LOCK       승인한 카드와 정책 출처의 내용 지문 고정
          │
          ▼
      ③ PROVE      VALID_RED로 기능 부족 때문에 실패하는지 증명
          │
          ▼
      ④ BUILD      최소 구현, GREEN, 실행 증거와 ledger 기록
          │
          ▼
      ⑤ REVIEW     표준은 독립 리뷰 1명, High-risk는 독립 리뷰 2명과 join
          │
          ▼
      ⑥ CERTIFY    lock·증거·review receipt를 재검사해 REVIEW_VERIFIED

  옆 출구
  POLICY_GAP                   ──▶ 사람의 정책 결정 대기
  PRODUCT_DEFECT               ──▶ BUILD
  EVIDENCE_GAP/HARNESS_DEFECT  ──▶ 증거만 보정한 뒤 BUILD
  FAIL                         ──▶ 장부 전/후를 구분해 정지
```

이건 사람이 읽는 6단계 운영 화면이에요. 실제 Controller는 사용자 승인, 실패 증명과 구현,
시각 증거 대기, 표준/High-risk 리뷰, 장부 전후 정지를 별도 Node로 유지해요. 정확한
Node·Edge·fallback·terminal 수와 전체 그래프는
[패키지 README](packages/frontend-oracle-design/skills/README.md)가 원본 JSON에서 자동으로
생성합니다.

### 핵심 규칙 몇 개

- 정책 출처는 승인된 문서예요. 기존 코드나 현재 브라우저 동작은 증거일 뿐 근거가 아니에요
- 카드 승인 전에는 production 코드를 못 건드려요
- 정책이 바뀌면 잠긴 파일을 고치는 게 아니라 새 revision을 만들어요
- assertion 약화, `test.skip`, 임의 sleep은 금지예요
- 보고할 때 말로 풀지 않고 runId를 인용해요

### 끝나는 상태

| 상태                | 뜻                                                                            |
| ------------------- | ----------------------------------------------------------------------------- |
| `ORACLE_READY`      | 카드 잠갔어요. 구현 들어가도 돼요                                             |
| `IMPLEMENTED_GREEN` | 구현 검증은 통과했지만 시각 증거 대기면 여기서 재개해요. 최종 완료는 아니에요 |
| `REVIEW_VERIFIED`   | 리뷰 finding까지 반영하고 재통과했어요                                        |
| `NEEDS_DECISION`    | 결과를 바꾸는 정책이 미결이에요. 질문을 뱉어요                                |
| `FAIL`              | 환경·하네스 문제나 예산 소진으로 판정 불가예요                                |

### 무한 루프 방지

피드백은 원인별로 나눠서 예산을 써요. 예산 다 쓰면 `BUDGET_EXHAUSTED`로 멈춰요.

| 분류                 | 예산 | 처리                           |
| -------------------- | ---- | ------------------------------ |
| `POLICY_GAP`         | 2    | 질문 출력하고 `NEEDS_DECISION` |
| `HARNESS_DEFECT`     | 2    | 테스트 하네스만 보정해요       |
| `PRODUCT_DEFECT`     | 3    | `VALID_RED` 뒤에 구현을 고쳐요 |
| `EVIDENCE_GAP`       | -    | 잠긴 범위 안에서 매핑을 채워요 |
| `ENVIRONMENT_DEFECT` | -    | production 안 건드리고 `FAIL`  |
| `NON_ORACLE_OPINION` | -    | 기록만 하고 완료를 막지 않아요 |

### 딸린 스크립트

판정은 말이 아니라 스크립트가 해요.

```bash
oracle-verify.mjs   card | red | evidence | findings | review | scan
oracle-lock.mjs     create | verify
oracle-run.mjs      init | status | exec | transition | budget | review-packet | review-brief
generate-workflow-docs.mjs       README 그래프 요약 생성 | --check
```

`review-brief`는 현재 리뷰 근거에서 사용자 목표·차단 항목·미완료 증거·비차단 의견을 모은
읽기 전용 요약입니다. 원본 카드·리뷰 입력이나 승인 절차를 대체하지 않습니다.

혼자 다 하지는 않아요. 테스트 작성·판정은 [`test`](packages/test),
스크린샷이랑 브라우저는 [`frontend-visual-qa`](packages/frontend-visual-qa),
기능별 구현 선택지는 [`frontend-system-design`](packages/frontend-system-design)이 가져가요.

자세한 건 [스킬 문서](packages/frontend-oracle-design/skills/SKILL.md)에 있어요.

## 패키지

npm으로 나갈 것들이에요.

| 패키지                                                                    | 설명                             |
| ------------------------------------------------------------------------- | -------------------------------- |
| [`@lodado/eslint-config`](packages/eslint-config)                         | 필요한 것만 켜는 조합형 프리셋   |
| [`@lodado/eslint-plugin-local-rules`](packages/eslint-plugin-local-rules) | 여러 프로젝트에서 같이 쓰는 규칙 |

에이전트에 꽂는 플러그인이에요.

| 플러그인                                                                  | 설명                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`vibe-coding-helper`](packages/vibe-coding-helper)                       | ESLint 도입이랑 레포 컨벤션                                                                           |
| [`frontend-oracle-design`](packages/frontend-oracle-design)               | 위험도 기반 Oracle 계약, TDD, 근거, 리뷰                                                              |
| [`agent-graph-engineering`](packages/agent-graph-engineering)             | 에이전트 워크플로 그래프 설계랑 실행                                                                  |
| [`frontend-system-design`](packages/frontend-system-design)               | 잘 알려진 프론트엔드 문제의 설계 패턴                                                                 |
| [`test`](packages/test)                                                   | Oracle 기반 결정론적 행동 테스트                                                                      |
| [`frontend-visual-qa`](packages/frontend-visual-qa)                       | 스크린샷 비교랑 직접 브라우저 QA                                                                      |
| [`frontend-interface-design`](packages/frontend-interface-design)         | `$reference-driven-figma-design`: HCI·레퍼런스 비교 → 러프 와이어프레임 설명 → 편집 가능 Figma 디자인 |
| [`reference-driven-3d-character`](packages/reference-driven-3d-character) | 레퍼런스 해석, 형태·변형·동작 설계, 편집 가능한 3D 캐릭터의 단계별 제작·검증                          |
| [`game-interface-design`](packages/game-interface-design)                 | 모바일 웹게임 기획 → 선택형 Figma UI → FSD·ECS Three.js 그레이박스                                    |

## 개발

pnpm 워크스페이스랑 Turborepo로 굴러가요.

```bash
pnpm install
pnpm lint
pnpm test
pnpm changeset
```

`main`이랑 `dev`에 push하거나 PR 올리면 lint랑 test가 돌아요.
npm 릴리스는 조건이 두 개예요. 레포 변수 `ENABLE_NPM_RELEASE`가 `true`여야 하고, `@lodado/*`를 배포할 수 있는 `NPM_TOKEN`이 있어야 해요.

## 라이선스

[MIT](LICENCE) © [lodado](https://github.com/lodado)

## Agent Memory

[Agent Memory 패키지](packages/agent-memory/README.md)는 recall → 작업 → log → 선택적 TIL/generalize → 검토된 규칙 승격 루프를 제공합니다. 6개 스킬을 Claude, Codex, jcode, Cursor, 공용 `.agents` 경로에 설치할 수 있습니다. 기존 Vault를 재배치하거나 규칙을 자동 승격하지 않습니다.
