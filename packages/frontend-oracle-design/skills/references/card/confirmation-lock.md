# Oracle Card — 사용자 확인·revision lock·run artifact

## Draft Oracle과 사용자 확인

새 카드나 의미가 바뀐 revision은 다음 직렬 gate를 반드시 거쳐 사용자에게 확인받는다.

1. production 수정 없이 외부 기준과 기존 revision 조사.
2. **Draft Oracle**과 semantic delta, 미결 질문 작성.
3. 전체 카드와 delta를 사용자에게 보여주고 재확인.
4. 승인되면 `User Confirmation`을 `approved`로 바꾸고 실제 응답 위치 기록.
5. 수정 요청이면 Draft를 고쳐 재확인.
6. 무응답·정책 충돌이면 `NEEDS_DECISION`.

기존 locked Oracle 범위 안의 구현·테스트 보정에는 새 카드를 만들지 않는다. 그러나
`Then`·`Never`·부작용·BVA·Design Intent·정책 출처 중 하나라도 의미가 바뀌면 잠긴
파일을 제자리에서 고치지 않고 새 경로에 Draft revision을 만든다. 새 revision도 사용자
확인 전에는 lint·lock·테스트·production 수정으로 넘어가지 않는다.

## 결정적 revision lock

사용자가 확인한 카드는 self-review 뒤 exact bytes를 파일로 저장하고 bundled script로
잠근다. Low fast path처럼 새 정책·카드가 없는 작업은 이 절차에 들어오지 않는다.

Design-only로 잠근 revision을 나중에 Delivery로 확장하며 architecture·backend 등 새
local source가 필요해지면 기존 lock에 덧붙이지 않는다. source delta를 사용자에게
보여주고 새 revision 경로에서 카드와 전체 source 집합을 한 번에 잠근다. 처음부터
Delivery가 요청됐으면 모든 source 승인을 마칠 때까지 lock을 미룬다.

대상 레포가 agent artifact 위치를 정하지 않았다면:

```text
<repo>/.ai/oracles/<oracle-id>/oracle.md
<repo>/.ai/oracles/<oracle-id>/oracle.lock.json
<repo>/.ai/oracles/<oracle-id>/run-state.json
<repo>/.ai/oracles/<oracle-id>/runs.jsonl
<repo>/.ai/oracles/<oracle-id>/.run-ids/ # 병렬 exec의 원자적 runId reservation
<repo>/.ai/oracles/<oracle-id>/evidence.json
```

### 카드 구조 lint

lock 전에 `oracle-verify.mjs card`로 구조적 최소선을 기계 확인한다. lint는 token·표
구조 검사일 뿐 semantic approval이 아니다 — 의미 심사는
[`card-format.md`](card-format.md)의 adversarial self-review 담당.

```bash
node <skill-dir>/scripts/oracle-verify.mjs card \
  --oracle .ai/oracles/<oracle-id>/oracle.md
```

검사 항목: 완전한 Outcome Brief, `Kind` 있는 Source Registry, 승인된 User Confirmation
존재, 모든 정책 줄의 stable ID·`(출처: …)`·적용 행, 정책 ID와 행 ID의 양방향 참조,
중복 없는 행 ID, `O*` 행의 `Then`·`Never`·부작용, `D*` 행의 계약·출처·증거 계층과
Source Registry 참조, 모호어 부재, 자동 추가 TC 7종의
실제 계약 행 또는 출처 있는 N/A 표기. `CARD_LINT_FAILED`는 lock 전에 카드를 고치라는
뜻이며, 검사를 우회하려고 문구만 바꾸지 않는다.

에이전트가 직접 실행하며 사용자에게 명령 실행을 요청하지 않는다. 승인된 로컬 명세
파일은 `--source`를 반복해 함께 잠근다. URL·Figma 같은 원격 기준은 정확한 version을
카드 bytes에 기록하고 외부 기준 게이트에서 다시 확인한다.

```bash
node <skill-dir>/scripts/oracle-lock.mjs create \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --source <local-approved-source>

node <skill-dir>/scripts/oracle-lock.mjs verify \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json
```

- `<skill-dir>`는 현재 host가 실제로 로드한 이 스킬의 디렉터리. home 경로 hardcode
  금지.
- 출력된 `sha256:<digest>`가 Oracle revision이다.
- `create`는 동일 bytes의 기존 lock에 idempotent, 변경된 카드·source의 기존 lock은
  덮어쓰지 않는다. 승인된 새 revision은 이전 artifact를 보존하고 새 경로에 생성.
- 모든 새 카드·revision은 카드 전문·delta를 확인받는다. digest는 확인된
  bytes의 식별자일 뿐 사용자 확인을 대신하지 않는다.
- 테스트 작성, production 수정, 독립 리뷰, 완료 상태 발급 직전 `verify` 재실행.
  `oracle-run.mjs`의 `exec`·`transition`은 매 호출 같은 검증을 자동 수행.
- `ORACLE_CHANGED`·`SOURCE_CHANGED`면 기존 RED·GREEN·리뷰 증거를 폐기하고 변경 diff와
  카드 현재본을 제시해 `NEEDS_DECISION`으로 복귀.
- `LOCK_INVALID`·도구 부재·실행 불가는 결정론 판정 실패 → `FAIL`.
- mismatch 제거용 자동 재생성 금지. 재잠금은 source gate, Draft delta, 사용자 재확인,
  self-review를 다시 거친 뒤에만.
- Low risk로 카드를 생략했으면 lock N/A 사유를 남긴다. Medium/High에서 파일시스템·
  Node가 없으면 Design-only와 Delivery 모두 LLM 판정으로 대체하지 않고 `FAIL`.

SHA-256은 drift 검출 장치일 뿐 lockfile을 다시 쓸 수 있는 actor의 승인 권한을
보장하지 않는다. 강한 통제가 필요하면 CI human approval·CODEOWNERS·외부 서명을
추가한다. run ledger·상태 파일도 같은 한계.

### Run artifact 초기화

Delivery 진입 시 lock 직후 run ledger와 상태 파일을 만든다. Design-only로 끝나면
생성하지 않는다. `journal.md`는 예외다 — Grill부터 같은 디렉터리에 쌓이며 ledger와
별개로 단계 근거만 담는다.

```bash
node <skill-dir>/scripts/oracle-run.mjs init \
  --dir .ai/oracles/<oracle-id> \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --risk low|medium|high \
  --required-label behavior \
  --required-label lint \
  --harness-path vitest.config.ts \
  --milestone list:O1,O2 \
  --milestone detail:O3,O4
```

- `--required-label`: 대상 레포에서 실제 적용되는 targeted test, lint, typecheck,
  build label을 반복 선언. 최소 하나 필요, GREEN·리뷰 후 재검증에서 모두 재확인.
- `init`은 lock을 검증하고 현재 worktree digest를 `ORACLE_READY` 기준선으로 저장 —
  이후 TDD 순서 판정의 근거.
- `--scan-root` 기본값은 현재 작업 디렉터리. monorepo에서 범위를 좁힐 때만 명시.
- RED 전에 바꿔야 하는 config·setup·mock 배선은 `--harness-path`로 scan root 기준의
  정확한 상대 파일 경로를 반복 선언. glob·디렉터리·root 밖 경로 불허, 실제로 존재하고
  worktree snapshot에 포함되는 파일만.
- 큰 카드는 `--milestone <name>:O1,O2`를 반복해 겹치지 않는 test-owned 행을 묶는다.
  행은 Oracle에 존재해야 하고 두 milestone이 같은 행을 소유하지 않는다. 작은 카드에는
  선언하지 않는다.
- 상태 파일이 이미 있으면 `init`은 실패한다. 예산·기준선 초기화 목적 재실행 금지. 새
  revision은 새 `<oracle-id>` 디렉터리.

## 설계 종료 상태

### `ORACLE_READY`

- Outcome Brief 완성, Source Registry에 Kind·관할·위치·version·승인 상태 또는 N/A 사유
- 카드가 외부 기준의 상태·문구·interaction·부작용을 누락·왜곡하지 않음
- 모든 정책에 인정되는 출처
- `User Confirmation`이 `approved`이고 새 카드 또는 semantic delta를 승인한 실제
  사용자 응답 위치가 있음
- UI 시각 범위 기록, `local`·`identity-shaping`이면 승인된 Design Intent와 모든 `D*`
  행의 `Never`·출처·증거 계층 완성
- `local`·`identity-shaping`이면 Design Change Confirmation의 명시적 사용자 답변 위치
- `identity-shaping`이면 두 번의 설계 pass를 완료한 제안으로 확인받음
- 모든 행의 `Never`와 부작용 횟수 완성
- 자동 추가 TC 7종 추가 또는 N/A 사유
- adversarial self-review 통과
- `oracle-verify.mjs card` lint와 revision lock 검증이 통과함

### `NEEDS_DECISION`

미결 질문, 질문별 추천안과 근거, 카드 현재본을 출력한다. 이 상태에서는 테스트·구현을
진행하지 않는다. 잠긴 적이 있으면 마지막 SHA-256과 mismatch를 함께 출력한다. 카드
현재본은 다음 세션의 재개 자료다.
