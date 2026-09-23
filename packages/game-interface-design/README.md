# game-interface-design

**모바일 웹게임 기획·디자인·UI/UX를 위한 독립 스킬 패키지.**

기존 frontend-interface-design에 얹는 프롬프트가 아니다. 해당 패키지의 구조와 검증 계약을
분기하고 게임용 진입점·레퍼런스·스키마·예제·검사 코드를 별도로 구성했다.
기존 패키지를 설치하지 않아도 이 패키지 안의 파일만으로 절차를 읽고 실행할 수 있다.
게임 본체 코드를 구현하는 엔진이나 자동 QA 훅은 아니다.

## 바로 사용할 요청

호스트가 이 패키지를 로드한 뒤 다음처럼 요청한다. 실제 호스트별 설치/로딩은 이 배포에서 실행하지 않았다.

```text
$game-interface-design

세로형 모바일 웹게임을 기획해줘.
Three.js로 표현하고 한 손으로 플레이하는 작은 합치기 게임이야.
단순 복제가 아니라 배치 판단에서 차이가 나는 규칙을 제안해줘.

DELIVERY_MODE: PLAN_ONLY

핵심 규칙, 초보자/숙련자 판단, 첫 플레이, 실패·재시작,
HUD 와이어프레임, 손맛, 수익화 가설, 구현 인계와 검증 계획까지 작성해줘.
```

정식 이름은 `$reference-driven-game-design`이며 짧은 이름은 패키지 내부 별칭이다.
명시적인 스킬 호출 형식은 사용하는 호스트의 실제 설정을 따른다.

## 무엇이 달라졌나

| 범위        | 게임용 동작                                                  |
| ----------- | ------------------------------------------------------------ |
| 출발점      | 화면 목록보다 먼저 반복되는 선택·규칙·실패·숙련을 정함       |
| 기본 산출물 | 기획·플로우·와이어프레임·손맛·실험을 문서로 완성 가능        |
| 시각 설계   | 플레이 필드·HUD·조작·피드백을 분리하고 판정 가독성을 검토    |
| 상태        | 진행 상태와 hidden/user/ad 등 중단 이유를 분리               |
| 수익화      | 실제 채널 조건을 확인하기 전 확정하지 않음; 보상과 재개 분리 |
| 검증        | 계획/Figma/실제 게임/사용성/재미/사업성/승인을 별도 표시     |
| 자산        | 책 원문·유료 사전·폰트·게임 아트 미포함                      |

## 두 모드

`PLAN_ONLY`가 기본이다. Figma가 없어도 기획을 완료할 수 있다.

`FIGMA`는 실제 편집 가능한 HUD/메뉴/결과 화면과 프로토타입 연결까지 요청한다.
허용된 대상과 쓰기 권한이 필요하다. 접근이 없으면 해당 제작만 차단하고 독립 기획은 계속한다.
PLAN_ONLY 결과를 Figma 완료로 부르거나 Figma 연결을 실제 게임/재미 검증으로 부르지 않는다.

```text
$game-interface-design
위에서 확정한 게임 기획으로 플레이·정지·결과 화면을 제작해줘.
DELIVERY_MODE: FIGMA
FIGMA_TARGET: 실제로 편집 권한을 부여한 파일의 URL
REVIEW_WAIT: false
```

## 구성

```text
game-interface-design/
  .claude-plugin/plugin.json
  .codex-plugin/plugin.json
  skills/
    game-interface-design/SKILL.md
    reference-driven-game-design/
      SKILL.md
      agents/openai.yaml
      references/                # 게임 전용 단계별 지침
        figma/                   # 패키지 안으로 복제·이식한 검증 계약
      schemas/                   # 요청/결과 JSON Schema
      templates/                 # 5종 산출물 틀
      examples/merge-garden/     # 구체적인 합성 기획 예제
      evals/behavior-cases.json  # 에이전트 행동 평가 24개, 미실행
  scripts/                       # 정적 구조/결과 검사와 로컬 등록 보조
  tests/                         # 검사 코드의 회귀 테스트
  provenance.json
  FORK_NOTES.md
  VALIDATION.md
```

## 설치

shareds 레포의 `packages/game-interface-design`에 있고 루트 `.claude-plugin/marketplace.json`에 등록되어 있다.

## 로컬 검사

Node 22 이상. 모노레포 안에서는 루트 `pnpm install`, 단독 복사본에서는 패키지 루트에서 `npm install`.

```bash
cd packages/game-interface-design
node scripts/check-contract.mjs
node --test scripts/*.test.mjs
node scripts/validate-design.mjs \
  skills/reference-driven-game-design/examples/merge-garden/delivery.json
```

검사 범위: 매니페스트 일관성, 독립 진입점, 로컬 문서 링크, JSON Schema,
실제 예제 파일, 중복/끊긴 ID, 상태/행동/trace 연결, 완료·증거 선언,
파일 경로 안전성, 광고/중단 계약의 일부 명시적 조건이다.
원본 검증 문서 3개의 SHA-256 동일성도 확인한다(업스트림 Git blob SHA는 provenance.json에 기록).

검사하지 않는 것: 에이전트가 실제로 스킬을 준수하는지, Figma/API 접근,
실제 물리·입력·모바일 성능·재미·매출. 24개 행동 시나리오는 별도의 실제 실행이 필요하다.
통과한 JSON은 진실한 증거도, 강제 실행 훅도 아니다.

## 읽을 순서

`SKILL.md`는 짧은 라우터로 시작하고 단계에 필요한 지침만 읽는다.
예제를 보려면 `skills/reference-driven-game-design/examples/merge-garden/game-design.md`부터 연다.
예제는 실제로 테스트된 게임이나 수익화된 프로젝트가 아니다.

원본 출처/변경 매핑은 `FORK_NOTES.md`, 권리 정보는 `NOTICE.md`,
실행한 검사와 미실행 범위는 `VALIDATION.md`에 있다.
