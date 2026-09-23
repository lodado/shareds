# game-interface-design

**모바일 웹게임을 기획하고, 필요하면 Figma UI를 만들고, 기획을 실제로 돌아가는 Three.js 프로토타입으로 옮기는 스킬 패키지.**

게임 경험과 규칙 → 플레이 여정 → 와이어프레임 → 시각 방향·손맛 → 최소 Three.js 구현 → FSD·ECS 경계 → 검증 증거까지 한 패키지 안에서 이어진다.
`frontend-interface-design`의 구조와 검증 계약을 분기했고, 다른 플러그인을 설치하지 않아도 동작한다.

## 스킬 세 개

| 스킬                           | 하는 일                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `game-interface-design`        | 진입점. 요청을 `PLAN_ONLY` · `FIGMA` · `THREEJS_WIREFRAME` 중 하나로 보낸다.                            |
| `reference-driven-game-design` | 핵심 규칙, 초보자/숙련자 판단, 첫 플레이, 실패·재시작, HUD 와이어프레임, 손맛, 수익화 가설, 구현 인계.  |
| `threejs-game-wireframe`       | 기획을 받아 로컬 Three.js 프로토타입을 만든다. 규칙은 FSD 페이지 슬라이스 안의 헤드리스 ECS가 계산한다. |

## 요청 예시

기획만:

```text
$game-interface-design
세로형 한 손 합치기 게임을 기획해줘. 코드는 아직 필요 없어.
```

Figma:

```text
$game-interface-design
확정한 기획으로 플레이·정지·결과 화면을 제작해줘.
DELIVERY_MODE: FIGMA
FIGMA_TARGET: 편집 권한을 준 파일 URL
```

구현:

```text
$game-interface-design
game-design.md 기준으로 플레이 가능한 Three.js 프로토타입을 만들어줘.
PLAN_SOURCE: ./design/game-design.md
TARGET_DIR: ./stack-proto
PROTOTYPE_LEVEL: PLAYABLE_GREYBOX
REVIEW_WAIT: false
```

구현 요청이면 기획 인터뷰를 처음부터 반복하지 않는다. 비어 있는 부분만 기본값으로 채우고 설계서(`wireframe-blueprint.md`)에 표시한다.
Figma는 구현의 선행 조건이 아니다.

## 구현 충실도

| 단계               | 실제                                    | 가짜/없음                           | ECS  |
| ------------------ | --------------------------------------- | ----------------------------------- | ---- |
| `LAYOUT_ONLY`      | Three.js 장면, 카메라, HUD 배치         | 규칙 전부                           | N/A  |
| `FLOW_PROTOTYPE`   | 화면 전환, 입력 흐름                    | 타이머·점수·결과 (`simulated` 표시) | 선택 |
| `PLAYABLE_GREYBOX` | 핵심 규칙, 점수, 실패, 재시작, 일시정지 | 아트, 사운드, 메타, 저장            | 필수 |

## 스타터

`skills/threejs-game-wireframe/starter/`는 Vite + TypeScript + Three.js + DOM HUD로 만든 Stack 그레이박스다.

- `src/pages/play/` 한 슬라이스. 규칙은 `model/ecs`, 렌더·HUD·입력은 `ui`, 수치는 `config`.
- 코어는 DOM·Three.js·시간·난수를 모른다. `tsconfig.core.json`이 DOM 없이 컴파일하고 경계 테스트가 import와 전역을 막는다.
- 고정 스텝, 일시정지 사유 집합, runId로 늦은 입력 차단, 같은 값이면 같은 참조인 HUD 스냅샷, 멱등 dispose.
- Steiger는 허용·위반 fixture로 실제로 잡는지까지 확인한다.

```bash
node scripts/create-wireframe.mjs ../my-game   # 비어 있지 않은 폴더면 거부
cd ../my-game && npm ci && npm run verify
```

`npm run verify` = typecheck → headless → Steiger → build → Playwright(모바일 Chromium).
의존성은 설치할 때 받는다. 폰트·아트·사운드는 들어 있지 않다.

## 패키지 검사

Node 22.18 이상. 모노레포 안에서는 루트 `pnpm install`, 압축을 푼 단독 복사본에서는 패키지 루트에서 `npm install`.

```bash
npm test                   # 계약·검증기·라우팅·스타터 헤드리스 테스트 (node --test)
npm run check              # 매니페스트, 진입점, 링크, 스키마, 예제, 원본 해시, 금지 파일
npm run validate:example   # 기획 예제 delivery.json
node scripts/validate-wireframe.mjs skills/threejs-game-wireframe/examples/stack-greybox/wireframe-report.json
npm run pack:zip           # 커밋된 상태만 dist/game-interface-design-<version>.zip 으로
```

검사기는 선언의 일관성만 본다. 명령이 실제로 실행됐는지, 재미·사용성·사업성은 확인하지 않는다.
실행한 검사와 실행하지 않은 범위는 `VALIDATION.md`, 원본과의 관계는 `FORK_NOTES.md`, 권리 정보는 `NOTICE.md`에 있다.

## 구성

```text
game-interface-design/
  .claude-plugin/plugin.json  .codex-plugin/plugin.json  package.json
  skills/
    game-interface-design/SKILL.md          라우터
    reference-driven-game-design/           기획 (references, schemas, templates, examples, evals)
    threejs-game-wireframe/
      SKILL.md
      references/                           fidelity, FSD, ECS·세션, 시간·수명, 렌더·입력, 검증
      templates/wireframe-blueprint.md
      schemas/wireframe-report.schema.json
      examples/stack-greybox/               실제 검증 결과로 채운 보고서
      evals/boundary-cases.json             라우팅 기대값 (미실행 루브릭)
      starter/                              Stack 그레이박스
  scripts/                                  검사기, 스캐폴드, 테스트
```
