# 검증 결과

## 0.2.0 (2026-09-23, macOS, Node 26.7.0)

### 패키지

| 검사                                   | 결과 | 범위                                                                                   |
| -------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| `node --test scripts/*.test.mjs`       | PASS | 60개: 기획 검증기, 보고서 검증기, 라우팅 계약, 스캐폴드, 스타터 헤드리스(37) 실행 포함 |
| `node scripts/check-contract.mjs`      | PASS | 매니페스트 4곳 버전, 스킬 3개, 링크, 스키마, 예제, 원본 해시, 금지 파일                |
| `eslint scripts`                       | PASS | 레포 설정                                                                              |
| `validate-design.mjs` 기획 예제        | PASS | 문서 계약만                                                                            |
| `validate-wireframe.mjs` 스타터 보고서 | PASS | 선언 일관성만                                                                          |
| 검증기 변이 확인                       | PASS | 가드 하나씩 제거했을 때 테스트가 실패하는지 수동 확인                                  |

### 스타터 (`create-wireframe.mjs`로 만든 새 복사본에서)

| 검사                | 결과    | 근거                                                                          |
| ------------------- | ------- | ----------------------------------------------------------------------------- |
| `npm ci`            | PASS    | three 0.186.0, vite 8.3.0, typescript 5.9.3, steiger 0.6.0, playwright 1.63.0 |
| `npm run typecheck` | PASS    | 앱 + DOM lib 없는 코어                                                        |
| `npm test`          | PASS    | 37개. 코어에 `document`를 넣으면 `tsconfig.core.json`이 실패하는 것도 확인    |
| `npm run check:fsd` | PASS    | 위반 fixture에서 `fsd/forbidden-imports`, `fsd/no-public-api-sidestep` 검출   |
| `vite build`        | PASS    | 536 kB 청크 한 개(gzip 135 kB), 대부분 three.js. Vite 크기 경고 그대로 둠     |
| `npm run test:e2e`  | PASS    | Pixel 7 프로필 headless Chromium, 3개 시나리오, 연속 3회 통과                 |
| 화면 확인           | PASS    | 플레이 중 스크린샷에서 블록 적층·잘린 조각·이동 블록·HUD 확인                 |
| 실제 기기           | NOT_RUN | 실제 휴대폰 세션 없음                                                         |
| 사용성·재미·사업성  | NOT_RUN | 참가자·플레이테스트 없음                                                      |

### 배포 ZIP

`npm run pack:zip`(커밋된 상태만 `git archive`)으로 만든 `game-interface-design-0.2.0.zip`을 레포 밖 새 폴더에 풀어 확인했다.
176개 파일, node_modules·dist·.env·폰트 없음.

| 단계                                                         | 결과                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| 패키지 루트 `npm install` (ajv만)                            | PASS                                                         |
| `npm test`                                                   | PASS (60)                                                    |
| `npm run check` (marketplace 검사는 단독 복사본이라 생략)    | PASS                                                         |
| `npm run validate:example`                                   | PASS                                                         |
| `create-wireframe.mjs ../game` → `npm ci` → `npm run verify` | PASS (typecheck, headless 37, Steiger+fixture, build, e2e 3) |

### 리뷰 후 수정

코드 리뷰 에이전트가 재현한 결함 4건을 실패 테스트부터 쓰고 고쳤다. 고친 뒤 새 복사본에서 `npm run verify`를 다시 통과했다.

- WebGL context-lost로 멈췄을 때 HUD의 Resume 버튼이 아무것도 풀지 못함 → 스냅샷에 `userPaused`를 추가하고, 시스템 사유로 멈췄을 때는 버튼을 숨김
- resume 직후 restart하면 새 판의 첫 `advance`가 버려짐 → restart에서 `discardNextDelta`를 초기화
- 이동 폭보다 긴 한 스텝이 반사 후에도 범위를 벗어남 → 반사 뒤 clamp
- `validate-wireframe.mjs`가 FSD 실패나 lint 미실행 상태의 `ready_to_run: true`를 통과시킴 → lint·fsd는 PASS 또는 N/A여야 함

## 실행하지 않은 것

Claude/Codex 호스트 로딩, `behavior-cases.json` 24개와 `boundary-cases.json` 12개 행동 시나리오, 실제 Figma 편집,
실제 기기 입력 지연·프레임 시간, 사람 대상 플레이테스트.

## 0.1.0 → shareds 편입

Python 검사기와 unittest 36개를 Node `node:test` + Ajv 8로 옮겼다(등록 도우미 3개는 루트 marketplace 직접 등록으로 대체해 삭제).
유지한 원본 참조 3개는 업스트림 `85d39f7`의 Git blob SHA와 일치함을 확인하고 SHA-256으로 고정했다.
