# 2026-09-22 검증 기록

`reference-driven-3d-character` 0.1.0의 패키지 검사와 적용 시험을 기록한다. 적용 시험에서는 초기 결과의 시각적 결함을 발견해 지침을 수정했다. 수정 후 결과는 피드백을 받은 재시험이며, 독립적인 첫 시도 성공으로 집계하지 않는다.

## 환경과 입력

- 실행 호스트: Codex native agent와 로컬 CLI. 적용 시험은 별도 문맥의 `verifier`, 판단 모의시험은 `critic` 역할을 사용했다. 역할명으로 실제 실행 모델 버전을 추정하지 않는다.
- 도구: Blender 5.2.1 LTS, Node.js 26.0.0, pnpm 9.0.6.
- 입력: 눈이 얼굴에서 떨어진 청록색 상자형 장난감 로봇의 정적 Blender 프로젝트. 몸통·발·색상은 보존하고 눈의 부착만 수정하도록 요청했다.
- 입력 위치: `/tmp/character-skill-pilot/input.blend`.
- 입력 SHA-256: `742dbeef28f88483a497ba22b8cd19f35847adfdf75101ddfc6b461bea2f95fd`. 시험 종료 후에도 같았다.
- 쓰기 범위: `/tmp/character-skill-pilot/run/`. 리깅·애니메이션·내보내기·게임 구현은 제외했다.

초기 `SKILL.md`의 SHA-256은 `ed45a2f3320bc0beac1f4c690bbded3afe4e512dd0e626836346e29b66786820`이었다. 수정 후 진입점과 참고 문서의 SHA-256은 다음과 같다.

| 파일                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `SKILL.md`                                | `47a0efb733a99111c73bc204026d1369c6e328b56d6fe37c6b071b65c25a1e9b` |
| `references/design-method.md`             | `6821b1b4e113619eb4baec5659503bd3511ca1b11450b9cecacc2562cd5b1ffa` |
| `references/motion-design.md`             | `b211e31ca4e9e25f11c01f115274a2014d1014b92972206f602ed01af25aa957` |
| `references/verification-and-delivery.md` | `42704779441d43588d4bf5e986e88d815df5f9cb0e81a77adaa6ee47f13c482d` |

## 실행한 검사

| 검사                         | 결과와 범위                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 패키지 계약                  | PASS. 단일 스킬·두 호스트 manifest, 마켓플레이스 등록, 패키지 내부 문서 링크를 검사하는 3개 테스트가 통과했다. 처음에는 미구현 상태에서 실패하는 것을 확인했다.       |
| 대상 패키지 ESLint·구문 검사 | PASS. `lint`와 테스트 파일의 `node --check`를 실행했다. 별도 TypeScript 소스는 없다.                                                                                  |
| 문서 형식·diff               | PASS. 패키지 Prettier 검사와 `git diff --check`를 실행했다.                                                                                                           |
| 저장소 전체 테스트           | PASS. 루트 `pnpm run test`가 종료 코드 0, Turbo 작업 12/12 성공으로 끝났다. 로그: `/tmp/character-skill-root-test.log`.                                               |
| 스킬 frontmatter             | PASS. 저장소에 이미 설치된 `js-yaml`로 실제 YAML을 파싱했다. `quick_validate.py`는 Python의 `yaml` 모듈 부재로 실행하지 못했으며, 해당 검증기 통과로 기록하지 않는다. |

계약 테스트는 에이전트의 미감이나 실제 제작 능력을 평가하지 않는다. 신규 의존성을 설치하지 않았다.

## 다른 캐릭터에 적용한 시험

### V1: 수치 통과 뒤 시각 판단을 정정

시험 에이전트에는 스킬과 입력, 사용자 요청을 주고 기대 수정 알고리즘은 주지 않았다. 눈을 얼굴 쪽으로 이동한 결과 최소 약 0.001m의 겹침이 생겼고, 에이전트는 부착 상태를 PASS로 보고했다.

리더가 재개방 렌더를 확인하니 눈 뒤쪽의 좁은 부분만 닿아 옆면에서 여전히 분리된 구형 부품처럼 보였다. 거리 검사는 통과했지만 자연스러운 부착이라는 시각 요구는 FAIL로 정정했다. 기존 결과는 `run/v1/`에 보존했다.

이에 설계·검수 지침에 의도한 접합 영역과 그 경계를 정의하고, 드러나는 시점에서 확인하도록 추가했다. 한 점의 접촉이나 음수 최소 거리만으로 부착을 판정하지 않도록 했다. 모든 눈을 납작하게 만드는 규칙은 추가하지 않았다.

### V2: 피드백을 반영한 한 차례 수정

에이전트는 갱신된 지침을 읽고 눈 흰자의 뒤쪽 면과 눈 부품의 위치만 수정했다. 새 프로세스에서 저장 파일을 다시 열어 정면·측면을 렌더했다. 측정한 왼쪽 눈의 뒤쪽 캡은 51개 정점으로 구성되며, 얼굴 지지면과의 Y 차이는 출력 정밀도에서 `0.000000..0.000000m`였다.

리더도 두 이미지를 확인했다. 옆면에서 눈 뒤쪽의 넓은 영역이 얼굴에 붙어 있고 정면의 표정·색상은 유지됐다. 제한된 부착 수정은 시각 자체 검수 PASS로 판정했다. 눈은 별도 부품으로 남아 경계가 보인다. 사용자 수용 여부는 UNVERIFIED다.

몸통·머리·발의 위치, 크기, 재질은 원본 상태와 같았고 애니메이션 오브젝트는 없었다. 입력에 있던 발의 공중 배치는 보존 범위여서 수정하지 않았다. 이 시험은 전체 캐릭터의 접지 검증이 아니다.

증거는 `/tmp/character-skill-pilot/run/`의 다음 파일에 있다.

- `character_repaired_v2.blend`
- `reopened_front_v2_fresh.png`, `reopened_side_v2_fresh.png`
- `reopened_state_v2.json`, `evidence_v2.txt`

## 기존 사례와 판단 모의시험

기존 닭 프로젝트에 원래 검증기를 읽기 전용으로 다시 실행했다. 눈·테두리·눈썹 부착 검사 6개를 포함한 42개 검사가 PASS였다. 결과는 `/tmp/character-skill-pilot/chicken-regression.json`과 같은 이름의 `.log`에 있다. 이는 기존 사례의 수치 회귀 검사이며 새 스킬로 그 모델을 만들었다는 증거는 아니다.

별도 비평 에이전트는 스킬만 읽고 다음 요청에 대한 판단을 모의시험했다.

- 실행 도구가 없는 사족보행 캐릭터 요청: 설계·스크립트 준비와 실제 생성·렌더·재생의 UNVERIFIED를 구분했다.
- 서로 다른 비율의 도면과 정적 모델 요청, MCP 없이 CLI만 있는 환경: 사용자가 정한 자료 우선순위와 정적 범위를 유지하고 CLI를 허용했다.
- 원본에는 있으나 GLB에서 Idle이 누락된 요청: 내보내기 요구를 FAIL로 분리하고 원본 보존·독립 재임포트를 요구했다.

세 응답에서 범위·증거 규칙의 모순은 발견하지 못했다. 실제 사족보행 모델링, 실행 불가 환경에서의 제작, 누락된 GLB 수정은 수행하지 않았다. 이 모의시험은 접합 영역 지침 추가 전에 진행했으며 해당 범위 판단 지침은 바뀌지 않았다.

## 남은 검증 범위

새로운 체형의 전체 리깅·걷기·방향 전환 제작, 실제 소비 환경에서의 애니메이션 재생, 호스트의 플러그인 설치·검색은 UNVERIFIED다. 전역 설치나 원격 배포는 수행하지 않았다. 한 번의 보조된 수정 시험으로 모델 간 우열, 첫 시도 성공률, 상업적 품질을 주장하지 않는다. 임시 경로의 증거 파일은 패키지에 포함되지 않으며 환경 정리 시 사라질 수 있다.

## 같은 날 후속 보강: 시각 설계와 구조 일반화

사전 설계안과 실제 3D 시제품의 확인을 분리하고, 구도·상세 영역·제어 방식을 정체성·구조적 불확실성·변형·접촉에서 선택하도록 수정했다. 위의 Blender 실행 결과와 이전 해시는 초기 리비전의 기록으로 보존한다. 이번 문서 수정에 그 실행 결과를 그대로 귀속하지 않는다.

최종 문서의 SHA-256:

| 파일                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `SKILL.md`                                | `8068b633aba3caf744e744628d685030865a946bdb34e75d131a8d3652f25369` |
| `references/design-method.md`             | `142a01c83cece781fe044aed6bb85cb603b709c076ed8a8321c2a344080a908e` |
| `references/motion-design.md`             | `8002ea3e143f3974d0d3dd1971de9bc9513b9de5527b6445fb1b12453f2df124` |
| `references/verification-and-delivery.md` | `1ee0430c517a1596c84698837180a40e06ec835c0ed16e73783bbfdfdf8b1c63` |

독립 문맥의 `verifier` 역할에 스킬과 세 요청만 주고 읽기 전용 판단 모의시험을 했다. 평가 시나리오의 기대 응답과 기존 계획은 전달하지 않았다.

| 요청                                                                  | 관찰한 판단                                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 얼굴·사지 없는 연속체를 설계하고 모델링 전에 보여 달라는 요청         | 연속적인 형상, 비대칭 무늬, 굽힘과 접촉에서 필요한 뷰를 선택했다. 설계안을 아직 보여주지 않았으므로 제작을 시작하지 않고 검토 A를 먼저 요구했다.                |
| 컨셉은 승인했으나 실제 시제품은 보지 않은 사람형의 제어·내보내기 요청 | 컨셉 승인과 실제 형태의 검토 B를 구분했다. 실제 시제품을 보여주고 확인 또는 명시적 위임을 받은 뒤 진행하도록 판단했다.                                          |
| 이미지 도구 없이 변형 중 벌어지는 국소 부착만 수정하는 요청           | 기존 디자인·동작과 보존 범위를 재사용했다. 전체 컨셉 재생성 대신 실제 실패 상태와 지지 표면을 검사하도록 판단했고 이미지 생성 부재를 차단 조건으로 삼지 않았다. |

세 요청에 대한 판단은 의도한 범위와 검토 순서를 유지했다. 실제 이미지 생성, 사용자 승인 대기 중의 도구 호출 통제, 새 체형의 모델링·변형 품질은 이 모의시험으로 검증하지 않았다. 모의시험 뒤에는 도구 관리 경로의 표현과 제자리 주기 사용 조건을 명확히 했다.

수정 전후 패키지 계약 테스트 3개를 실행했고, 대상 lint와 문서 형식 검사를 수행했다. Python 검증기는 기존과 같은 `yaml` 모듈 부재가 남아 있으며 frontmatter는 기존 `js-yaml`로 파싱한다. 이번 변경은 문서만 대상으로 하므로 초기 전체 저장소 테스트 결과를 새 실행 결과로 보고하지 않는다. 별도 코드·의존성·플러그인 등록 변경이나 이미지·Blender 생성 작업은 포함하지 않았다.

## 0.2.0: 상세 모델 시트의 정보 범위

군인 지렁이 예시를 본 사용자는 제공한 모델 시트에 비해 시점과 확대 정보가 부족하다고 지적했다. 이에 외형 예시와 상세 모델 시트를 구분하고, 요청한 관찰 범위·컷의 가독성·시점 간 일관성을 프롬프트와 검수에 연결했다. 부위·각도·시점 수는 보편 규칙으로 고정하지 않았다.

패키지, Claude/Codex manifest, 마켓플레이스의 해당 항목을 `0.2.0`으로 맞췄다. Codex의 설명과 기본 프롬프트에도 상세 시트와 시각 검토를 반영했다. 다른 마켓플레이스 항목이 바뀌지 않았음을 이전 스냅샷과 비교했다. `codex plugin list`에서는 로컬 소스가 발견되지만 플러그인은 미설치로 표시됐다. 설치·재설치·원격 배포는 수행하지 않았다.

- PASS: 패키지 계약 테스트 3개, 대상 lint, 문서 형식 검사, `git diff --check`.
- PASS: 루트 `pnpm run test`, 종료 코드 0, Turbo 작업 12/12 성공. 로그는 `/tmp/character-skill-020-root-test.log`에 있다.
- PASS: 기존 `js-yaml`로 실제 frontmatter 파싱. 패키지 계약 검사로 단일 스킬 경로, manifest·카탈로그 버전 일치, 로컬 문서 링크 확인.
- UNVERIFIED: 공식 `validate_plugin.py`는 `ModuleNotFoundError: No module named 'yaml'`로 실행되지 않았다. 의존성을 추가하지 않았고 대체 검사를 공식 검증기 통과로 보고하지 않는다.
- UNVERIFIED: 보강한 프롬프트로 새 상세 시트를 생성한 결과와 실제 Codex 설치 후 활성화. 추가한 정보 범위 시나리오는 아직 실행 결과가 아니다.

## Adversarial review trial and supplied layout reference

This follow-up changes the visual contract and review instructions, not a host execution barrier. The initial worktree was clean at `3f7b45c1e683dbb4459c24f5506c2fd97463472e`. Existing design, verification, and evaluation files remain the owners; no new runner, image generator, or policy ledger was added.

### Actual review observations

One separate native `vision` agent, invocation `01a0c7c5-a864-7240-a424-e458670ca5cc`, reviewed three existing kitten images. It received task-specific requests, explicit requirement rows, image paths, and the skill references, without the producer's initial verdict or the evaluation answer table. Later turns reused that reviewer; they are not independent samples or fresh contexts. The model version and complete history-isolation telemetry were not independently established.

| Candidate                    | SHA-256                                                            | Observed reviewer behavior                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: single appearance preview | `af7bcc2aca17e15de50b91171d56cf67be0184aa56dfdf1197cbf1102229f940` | Accepted the appearance-preview contract without demanding a turnaround or native model.                                                                                          |
| B: first six-view sheet      | `4ddc40abc38e5c1dc089bc410c885754ed3b8b8364e9e0afb0eab743d1a8ae3b` | Missed two unpadded paw-like shapes in the underside panel and passed the four-paw check. It also treated missing exact camera metadata as a blocker beyond the concept contract. |
| C: revised six-view sheet    | `0cbcf4cbe58f0963d15401b63f8b4c8117a3646041903479ba40148c528ee29f` | Returned a review, but its direction and consistency judgments were not independently validated. This is not a passing geometric control.                                         |

The files remain under the local generated-image directory `~/.codex/generated_images/01a0c75e-f391-77e0-bff3-803581b14b87/`, with filenames `exec-483ce9a7-8e25-4ecb-bb2b-703175631c2f.png`, `exec-e76399d4-b596-4287-b0e2-fe0699073710.png`, and `exec-344b779a-4121-40c3-a461-fc59da65d7d9.png`. They are not bundled fixtures.

A focused path-based re-review of B still missed the extra shapes. The leader then supplied B as a direct image attachment and identified the disputed region. The reviewer inventoried two upper unpadded curled shapes plus four padded soles and corrected V2 to FAIL. This was an assisted correction, not first-pass detection success. The reviewer reported that earlier visual tool calls had also returned pixels; the attachment change alone cannot be credited with the correction because the prompt also became more specific.

The trial exposed a real false-pass risk. The revised instructions require panel-level inventories, image-bearing input, contract-scoped evidence, and preservation of disagreements. Neither party's PASS may override a visible contradiction. The new procedure has not established a reliable defect-detection rate, and no automated image understanding is claimed.

### Layout-reference inspection

The user then supplied `~/Downloads/KakaoTalk_Photo_2026-09-22-13-10-27.png`, SHA-256 `463c150c0120a380c303659fa421cbfc2ba8d7f249d9f5df6dcb687fa77a1390`. The leader opened the actual image. Its two large presentations, six-direction strip, four enlarged regions, and wireframe-style panel informed the coverage instructions and the local trial in [scenarios.md](scenarios.md). The image is layout evidence, not proof of correct camera axes or a Blender-ready mesh. No new kitten sheet, native model, or wireframe was produced in this follow-up.

The same visual reviewer received this reference as a direct attachment and independently identified those panel groups, the anatomy-transfer boundary, and the unsupported native-mesh claim. This was layout analysis in a reused context, not validation of a newly generated kitten. A separate native `critic` invocation, `01a0c7c2-a37a-7e02-83fb-5197e73bb53b`, reviewed the instruction changes and returned OKAY with no concrete blockers; that review does not establish visual detection accuracy.

### Checks and limits

- The new static routing test failed before the review-owner links and procedure existed, then passed with the other three package tests. It checks packaging and instruction routing, not visual behavior or forced execution.
- Targeted package tests: 4/4 PASS. Targeted ESLint, `node --check`, Prettier, and `git diff --check`: PASS. There is no package typecheck script or TypeScript source in this change.
- Root `pnpm run test`: exit 0, 12/12 Turbo tasks successful, 11 cached. Log: `/tmp/character-adversarial-root-test.log`. This is not a claim that all repository tests ran without cache.
- The final instruction revision still needs broader visual trials, including valid multi-view controls. Host-enforced dispatch, Claude/jcode reviewer integration, and end-to-end production handoff remain UNVERIFIED. Static tests do not close those gaps.

## 0.3.0: separate-context generation and review

At the user's request, a new native `designer` invocation (`01a0c7d0-3e7d-75d0-8fde-729ae389f8a9`) received the skill as a native skill input, the cute smooth kitten request, and the chicken layout-reference path. The host call used `fork_context: false`; the parent transcript and prior kitten verdicts were not supplied. Shared system instructions and environment still applied, and complete context-isolation telemetry was unavailable.

The designer reported loading the installed entry with SHA-256 `4d2269c6bf80c64b9872353b28b34a07a69cad059279402c4ce4ab90f856105d`, matching the leader's file check. It inspected the supplied reference and generated a 1536×1024 candidate at `~/.codex/generated_images/01a0c7d0-3e7d-75d0-8fde-729ae389f8a9/exec-d6912d86-60dc-4c93-acc6-401baaeee4f4.png`, SHA-256 `5d3f515e3e1c6d4a19c255c27d8853ee4ac653c86bfd629c055d661f844f5546`. The leader opened that actual image and verified its hash.

A new `vision` invocation (`01a0c7d7-110b-7d11-9fdc-28fc32de508e`) also used `fork_context: false`. It received the skill, scoped request, requirement rows, original reference, and candidate as direct image attachments, without the designer's self-review. It returned PASS for identity/finish, adopted layout groups, directional coverage, cross-view consistency/counts, detail evidence, and technical-claim limits. Its verdict was eligible for user review, not native-geometry verification. The lead displayed the image again when the user reported that the initial presentation was not visible.

The candidate has two large overall views, six directional panels, four detail crops, and a silhouette/color panel instead of invented wireframe evidence. No Blender model was built. This is one generated example and one separate visual judgment, not a measured reliability improvement or an infallible geometric control.

The designer reported failing to locate an auxiliary `imagegen/SKILL.md` path while successfully using the built-in image generator. The design reference now directs catalog lookup, including system skills, instead of assuming a package-relative path. That instruction clarification was not part of the earlier generation trial; its behavioral effect remains unmeasured. The entry, review procedure, and the independent trial do not establish host-enforced execution.
