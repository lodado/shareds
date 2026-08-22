# shareds

사이버펑크 2077의 '샤드'에서 이름을 따왔어요. 칩 하나 꽂으면 다른 사람의 지식이
바로 내 것이 되잖아요. 그것처럼 제가 쌓아온 코딩 지식을 스킬로 만들어서, 코딩
에이전트에 꽂아 쓰는 레포예요.

ESLint 프리셋은 npm으로, 에이전트 스킬은 Claude Code / Codex 플러그인 마켓플레이스로
배포해요.

## 이런 게 들어 있어요

| 패키지                                                                    | 배포 방식                    | 설명                                         |
| ------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| [`@lodado/eslint-config`](packages/eslint-config)                         | npm (changesets)             | 조합형 ESLint 프리셋 — 필요한 것만 켜요      |
| [`@lodado/eslint-plugin-local-rules`](packages/eslint-plugin-local-rules) | npm (changesets)             | 커스텀 ESLint 규칙                           |
| [`vibe-coding-helper`](packages/vibe-coding-helper)                       | Claude Code / Codex 플러그인 | 에이전트와 공유하는 레포 컨벤션 스킬         |
| [`frontend-oracle-design`](packages/frontend-oracle-design)               | Claude Code / Codex 플러그인 | 위험도 기반 Oracle 계약, TDD, 리뷰           |
| [`agent-graph-engineering`](packages/agent-graph-engineering)             | Claude Code / Codex 플러그인 | 네이티브 에이전트 워크플로 그래프 설계·실행  |
| [`frontend-system-design`](packages/frontend-system-design)               | Claude Code / Codex 플러그인 | 잘 알려진 프론트엔드 문제의 Oracle 연계 패턴 |
| [`test`](packages/test)                                                   | Claude Code / Codex 플러그인 | Oracle 기반 결정론적 프론트엔드 행동 테스트  |
| [`frontend-visual-qa`](packages/frontend-visual-qa)                       | Claude Code / Codex 플러그인 | 스크린샷 비교와 직접 브라우저 QA             |

## ESLint 설정은 이렇게 써요

base 프리셋은 항상 켜져 있고, 나머지는 필요한 것만 골라서 조합해요.

```js
// .eslintrc.js
module.exports = {
  root: true,
  extends: [
    '@lodado/eslint-config',
    '@lodado/eslint-config/react',
    '@lodado/eslint-config/a11y',
    '@lodado/eslint-config/local-rules',
  ],
}
```

쓸 수 있는 프리셋: base(`.`), `react`, `next`, `a11y`, `turbo`, `local-rules`, `testing`, `query`.
자세한 안내는 [`eslint-setup` 스킬](packages/vibe-coding-helper/skills/eslint-setup/SKILL.md)에 있어요.

## 스킬은 이렇게 꽂아요

```
/plugin marketplace add lodado/shareds
/plugin install vibe-coding-helper@my-vibe-coding-helper
```

같은 패키지에 `.codex-plugin/plugin.json`이 들어 있어서, Codex도 동일한 `skills/`
디렉터리를 그대로 읽어요.

## 개발할 때는요

```bash
pnpm install
pnpm lint
pnpm test          # 프리셋 스모크 테스트
pnpm changeset     # 릴리스 기록
```

릴리스는 `main`에서 `.github/workflows/intergrate_workflow.yml`로 돌아가요. 릴리스
잡은 레포 변수 `ENABLE_NPM_RELEASE`가 `true`일 때만 실행되고, `@lodado/*` 패키지를
만들 수 있는 `NPM_TOKEN` 시크릿이 필요해요.
