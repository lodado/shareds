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

| 영역      | 들어 있는 것                                     | 배포              |
| --------- | ------------------------------------------------ | ----------------- |
| 코드 품질 | 조합형 ESLint 프리셋, 직접 만든 규칙             | npm               |
| 검증      | Oracle 계약, TDD, 행동 테스트, 브라우저·스크린샷 | 에이전트 플러그인 |
| 설계      | 프론트엔드 시스템 설계 패턴                      | 에이전트 플러그인 |
| 에이전트  | 워크플로 그래프 설계랑 실행                      | 에이전트 플러그인 |

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
```

패키지 안에 `.claude-plugin/plugin.json`이랑 `.codex-plugin/plugin.json`이 같이 들어 있어요.
둘 다 같은 `skills/` 디렉터리를 읽어요. 스킬 하나 만들면 두 에이전트가 같이 써요.

## ESLint 쓰기

base 프리셋을 깔고, 그 위에 필요한 것만 얹으면 돼요.

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
.(base)  react  next  a11y  turbo  local-rules  testing  query  quality  fsd  strict-types
```

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
                      ┌──────────────┐
  요청 ──────────────▶│  Risk 판정   │
                      └──────┬───────┘
                     Low     │     Medium / High
              ┌──────────────┴──────────────┐
              ▼                             ▼
     ┌─────────────────┐          ┌───────────────────┐
     │  low-fast-path  │          │   Oracle lane     │
     │  기존 검증만    │          │   카드부터 시작   │
     └─────────────────┘          └─────────┬─────────┘
                                            │
            ┌───────────────────────────────┘
            ▼
   ① Outcome Brief          목표랑 성공 기준을 먼저 적어요
            │                KPI 없으면 숫자 지어내지 않아요
            ▼
   ② Source Registry        PRD·수용 기준·피그마를 위치까지 고정해요
            │                product-policy / mandatory-constraint 로 분류해요
            ▼
   ③ 계약 행 (O*/D*)        Grill 질문이랑 경계값으로 행을 뽑아요
            │                애매하면 POLICY_GAP ──▶ NEEDS_DECISION
            ▼
   ④ 사용자 재확인          Draft 보여주고 승인받아요
            │                승인 전엔 lint·lock·테스트·구현 전부 금지
            ▼
   ⑤ revision lock          oracle-verify card ──▶ oracle-lock create
            │                이후 단계마다 lock 자동 검증해요
            ▼
   ⑥ VALID_RED              $test 로 테스트 먼저 써요
            │                실패 test 이름을 카드 행에 매핑해요
            ▼
   ⑦ GREEN                  그제서야 최소 구현을 해요
            │
            ▼
   ⑧ subagent 리뷰          독립 리뷰 finding 반영하고 전체 재실행
            │
            ▼
   REVIEW_VERIFIED

   모든 실행은 append-only ledger 에 runId 로 남아요
   ledger 에 없는 실행은 통과로 못 써요
```

### 핵심 규칙 몇 개

- 정책 출처는 승인된 문서예요. 기존 코드나 현재 브라우저 동작은 증거일 뿐 근거가 아니에요
- 카드 승인 전에는 production 코드를 못 건드려요
- 정책이 바뀌면 잠긴 파일을 고치는 게 아니라 새 revision을 만들어요
- assertion 약화, `test.skip`, 임의 sleep은 금지예요
- 보고할 때 말로 풀지 않고 runId를 인용해요

### 끝나는 상태

| 상태                | 뜻                                               |
| ------------------- | ------------------------------------------------ |
| `ORACLE_READY`      | 카드 잠갔어요. 구현 들어가도 돼요                |
| `IMPLEMENTED_GREEN` | 카드 테스트랑 레포 필수 검증이 실제로 통과했어요 |
| `REVIEW_VERIFIED`   | 리뷰 finding까지 반영하고 재통과했어요           |
| `NEEDS_DECISION`    | 결과를 바꾸는 정책이 미결이에요. 질문을 뱉어요   |
| `FAIL`              | 환경·하네스 문제나 예산 소진으로 판정 불가예요   |

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
oracle-run.mjs      init | status | exec | transition | budget | review-packet
```

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

| 플러그인                                                      | 설명                                     |
| ------------------------------------------------------------- | ---------------------------------------- |
| [`vibe-coding-helper`](packages/vibe-coding-helper)           | ESLint 도입이랑 레포 컨벤션              |
| [`frontend-oracle-design`](packages/frontend-oracle-design)   | 위험도 기반 Oracle 계약, TDD, 근거, 리뷰 |
| [`agent-graph-engineering`](packages/agent-graph-engineering) | 에이전트 워크플로 그래프 설계랑 실행     |
| [`frontend-system-design`](packages/frontend-system-design)   | 잘 알려진 프론트엔드 문제의 설계 패턴    |
| [`test`](packages/test)                                       | Oracle 기반 결정론적 행동 테스트         |
| [`frontend-visual-qa`](packages/frontend-visual-qa)           | 스크린샷 비교랑 직접 브라우저 QA         |

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
