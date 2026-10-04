# Oracle / Contract Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 모든 구현·리뷰 worker는 사용자가 요청한 Sol 모델을 사용한다.

**Goal:** Bend 필수 Oracle과 Bend 없는 Space 기반 Contract를 두 진입점으로 제공하고, 네 역할·중립 Space 검사·단일 Delivery 실행기를 공유한다.

**Architecture:** 같은 플러그인의 두 controller가 고정 프로필을 선택한다. 프로필은 authoring 전에 결정하고 승인 카드에서 lock/state/worker/review까지 묶는다. 공통 검수는 Bend 의존 없는 모듈로 추출하되 Formal의 모델 도출·증명·투영을 일반 프레임으로 대체하지 않는다.

**Tech Stack:** 기존 Node.js ESM, node:test, pnpm/Turbo, Markdown/JSON reference graph, 기존 Bend 및 TypeScript/type-fest/fast-check 경로. 새 런타임 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-04-oracle-contract-profiles-design.md`

**Status:** 계획 제안. 구현 미승인, runtime/skills 미변경. 기준 `2d57d6b` / `0.83.1`.

## Global Constraints

- 진입점: `frontend-oracle-design`와 `frontend-contract-design`.
- 고정 프로필 ID: `formal-bend/v1`와 `contract/v1`.
- 공유 역할: `oracle-intake`, `oracle-author`, `oracle-implement`, `oracle-review`.
- 같은 플러그인에서 총 여섯 개의 `SKILL.md`를 발견한다.
- 새 Contract는 **`Coverage: full-product`를 명시**한다.
- 기존 100,000 raw tuple 상한을 유지한다. 초과는 미완료이며 자동 sampling하지 않는다.
- 새 Contract v1의 t-way 지원은 이번 범위가 아니다.
- `--skip-bend`와 자동 프로필 하향 전환은 금지한다.
- `.ai/oracles` 또는 `oracle.md` 전역 이름 변경을 하지 않는다.
- Delivery 상태 그래프, append-only ledger, budgets, 단일 실행기를 유지한다.
- 기존 lock/card/ledger bytes는 자동 수정하지 않는다.
- 사용자 미추적 파일 다섯 개를 수정·stage·삭제하지 않는다.
- 계획 승인 전에는 아래 구현 명령을 실행하지 않는다.

## Review Focus

1. Contract 카드가 확인을 받으면서 bytes가 변해 무한 STAGE_STALE에 빠지는 경우: 승인 이후에 CHECKED hash를 고정한다. Task 3.
2. 공유 문서에는 Bend가 없지만 전이적 참조 또는 정적 import로 다시 유입되는 경우: closure 검사와 deny-formal-loader를 모두 사용한다. Tasks 4–6.
3. 목록 화면 전용 given schema 때문에 일반 toggle가 거부되는 경우: 새 Contract만 일반 schema를 사용하고 Legacy는 유지한다. Task 2.
4. 프로필 없는 과거 lock을 새 Contract의 승인으로 재사용하는 경우: explicit 요청과 legacy의 경계를 검사한다. Tasks 2–4, 6.
5. 모든 경우의 metadata만 비교하고 실제 제품 assertion을 실행하지 않는 경우: 결함 있는 제품의 실제 RED와 수정 후 GREEN을 관찰한다. Task 6.

---

## 0. 파일 구조와 소유권

아래 상대 경로의 기준:

- `P = packages/frontend-oracle-design`
- `C = P/skills/frontend-oracle-design`
- `S = C/scripts`
- `R = C/references`

이는 문서의 경로 축약이다. 셸 명령은 저장소 루트 기준 전체 경로를 사용한다.

| 경로                                                                                         | 처리            | 책임                                               |
| -------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------- |
| `S/oracle-space.mjs`                                                                         | 새 파일         | 중립 파싱·판정·Space 검수. Formal 모듈 import 없음 |
| `S/oracle-profile.mjs`                                                                       | 새 파일         | 두 프로필, controller 매핑, artifact 일치 확인     |
| `S/oracle-frames.mjs`                                                                        | 원칙적으로 보존 | 기존 full-product/t-way 열거와 ID                  |
| `S/oracle-verify.mjs`                                                                        | 수정            | 공통 검사 위임, 프로필별 lint, Formal import 지연  |
| `S/oracle-stage.mjs`, `S/oracle-lock.mjs`                                                    | 수정            | 프로필별 작성 단계·input hash·불변 lock            |
| `S/oracle-run.mjs`, `S/oracle-worker.mjs`                                                    | 수정            | required labels, profile-bound packet/acceptance   |
| `S/oracle-review-context.mjs`, `S/oracle-delivery-guidance.mjs`                              | 수정            | 올바른 profile/refs/report, blinded inputs 보존    |
| `S/oracle-protocol.mjs`, `R/delivery.protocol.json`                                          | 보존 우선       | 기존 Delivery topology/권한. 새 state 추가 금지    |
| `P/skills/frontend-contract-design/SKILL.md`                                                 | 새 파일         | Contract controller                                |
| 기존 controller와 네 role `SKILL.md`                                                         | 수정            | 공통 절차와 현재 profile 참조만 로드               |
| `R/contract/{requirements,space,authoring,review}.md`                                        | 새 파일 4개     | Contract 전용 절차                                 |
| `R/verification-common.md`                                                                   | 새 파일         | 공통 검증 의무와 applicability                     |
| `R/roles/{author-formal,author-closure-formal}.md`                                           | 새 파일 2개     | 기존 author의 Formal 전용 절차 이동                |
| `R/common.md`, `R/mandatory-verification.md`, `R/roles/*.md`                                 | 수정            | common의 unconditional Formal loading 제거         |
| `R/reference-graph.json`, `S/oracle-reference-route.mjs`, `S/generate-reference-bundles.mjs` | 수정            | profile-aware closure와 bundle                     |
| `R/oracle-workflow.graph.json`, 생성 workflow docs                                           | 수정            | profile dispatch 설명. Delivery edge 의미 보존     |
| `S/oracle-guard-hook.mjs`, `P/scripts/modular-*.test.mjs`                                    | 수정            | 두 controller와 네 specialist의 정확한 활성화      |
| `P/test-fixtures/contract-v1/`                                                               | 새 디렉터리     | 실제 제품 assertion을 실행하는 수용 fixture        |
| `P/scripts/{contract-profile,profile-reference-isolation,contract-public-runner}.test.mjs`   | 새 파일 3개     | 프로필·라우팅·실제 public runner 검증              |
| `S/oracle-space.test.mjs`                                                                    | 새 파일         | 공유 검사기의 독립 회귀                            |

`oracle-verify.mjs`는 Task 1의 추출 작업 이후 Runtime owner에게 명시적으로 인계한다. 동시에 여러 worker가 이 파일을 편집하지 않는다. 기존 `oracle-run.cases.mjs`도 Runtime owner만 편집한다.

## 1. 고정 인터페이스

### 프로필

`S/oracle-profile.mjs`가 소유하는 공개 API:

```ts
type ProfileId = 'contract/v1' | 'formal-bend/v1'
type Binding = { artifact: string; profile: ProfileId | null }
type Resolution =
  | { kind: 'explicit'; profile: ProfileId; controller: string }
  | { kind: 'legacy'; profile: null; controller: null }

function profileForController(skillName: string): ProfileId
function readCardProfile(cardText: string): ProfileId | null
function resolveProfileBinding(input: { requestedProfile?: ProfileId; bindings: Binding[] }): Resolution
```

Binding은 실제 읽은 artifact만 포함한다. 새 `begin`은 아직 카드가 없을 수 있으므로 요청 프로필만 사용한다. 기존 카드가 있는데 profile이 빠진 경우는 `profile:null` binding이며 새 explicit 요청과 일치하지 않는다.

오류 코드: `PROFILE_REQUIRED`, `PROFILE_UNKNOWN`, `PROFILE_DUPLICATE`, `PROFILE_CONTROLLER_UNKNOWN`, `PROFILE_MISMATCH`.

bare controller 또는 현재 플러그인의 `frontend-oracle-design:<controller>`만 정규화한다. 다른 namespace는 허용하지 않는다. 네 specialist 이름은 controller가 아니므로 이 함수로 프로필을 정하지 않는다.

### Space

`S/oracle-space.mjs`가 소유하는 API:

```ts
function auditIdCoverage(
  expectedIds: string[],
  actualIds: string[],
): {
  missing: string[]
  extra: string[]
  duplicate: string[]
}
function fullProductRecords(cardText: string): Array<object>
function auditFullProduct(
  cardText: string,
  generated: ReturnType<typeof generateFromDocument>,
  options?: { scenarioShape?: 'legacy' | 'contract' },
): object
```

`scenarioShape` 기본값은 `legacy`다. 프로필을 검증한 호출자만 `contract`를 넘긴다. 결과의 기존 필드와 의미를 보존한다: `N_raw`, `N_valid`, `N_excluded`, `N_unresolved`, `N_scenarios`, `N_executed_unique`, `N_passed_unique`, missing/extra/duplicate/malformed/stale-mapping, ready, execution, limitation.

공통 Markdown 파서·source/row/disposition 파서는 이 모듈로 옮기고 기존 호출자가 import한다. 이 모듈이 다시 `oracle-verify.mjs`를 import하는 순환 의존성을 만들지 않는다.

### 참조 라우터

```js
routeReferences(graph, {
  point: 'scope-decision',
  facts: {},
  include: ['role-intake'],
  profile: 'contract/v1',
})
```

기존 options에 `profile`만 추가한다. 모든 실행 packet은 이를 명시한다. 기존 저수준 router CLI의 인자 생략은 Formal 안내 호환으로만 유지하며 승인/실행 권한이 아니다.

모든 reference node에 `profiles` allowlist를 명시한다. profile과 맞지 않는 수동 include 또는 의존성은 오류다. `manualConditions`에도 다른 profile 내용을 내보내지 않는다.

---

## Task 1: 기존 동작을 바꾸지 않고 순수 Space 검사 추출

**Owner:** Space worker, 이후 Runtime owner에게 verify 파일 인계.
**Files:** Create `S/oracle-space.mjs`, `S/oracle-space.test.mjs`. Modify `S/oracle-verify.mjs`, `S/oracle-verify.test.mjs`. Existing test `S/oracle-frames.test.mjs`.
**Consumes:** 기존 카드 문법과 generateFromDocument 결과.
**Produces:** 위 Space API. 기존 공개 CLI 출력과 ID 유지.

- [ ] 현재 full-product public CLI의 JSON 결과와 기존 frames/verify 테스트를 기준으로 기록한다.
- [ ] 새 모듈 import가 실패하는 RED 테스트를 추가한다. 새 테스트는 다음 최소 관계를 고정한다.

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { generateFromDocument } from './oracle-frames.mjs'
import { auditFullProduct, auditIdCoverage } from './oracle-space.mjs'

const card = readFileSync(new URL('../../../test-fixtures/full-product/oracle.md', import.meta.url), 'utf8')
test('space audit preserves the existing 12-case contract', () => {
  const report = auditFullProduct(card, generateFromDocument(card))
  assert.equal(report.N_raw, 12)
  assert.equal(report.ready, true)
  assert.equal(report.execution, 'not-run')
  assert.equal(report.N_executed_unique, null)
})
test('coverage compares identities, not just counts', () => {
  assert.deepEqual(auditIdCoverage(['A', 'B'], ['A', 'A', 'C']), {
    missing: ['B'],
    extra: ['C'],
    duplicate: ['A'],
  })
})
```

- [ ] RED를 실행한다: `rtk test node --test packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-space.test.mjs`.
- [ ] `oracle-verify.mjs`의 중립 파서/판정, `fullProductRecords`, `sequenceFor`, `sequenceWitness`, `auditFullProduct`를 이동한다. 기준 위치는 247–404, 486–555, 684–852이며 실제 함수 경계로 옮긴다. 검증기는 아래 import로 대체한다.

```js
import { auditFullProduct, fullProductRecords } from './oracle-space.mjs'
```

- [ ] family/row/disposition 검사에서 공통 함수 호출을 연결한다. Formal proof, package regeneration, fs 기반 witness 검증을 단순 구조 검사로 대체하지 않는다.
- [ ] 다음 GREEN과 공개 CLI 결과의 동일성을 확인한다.

```bash
rtk test node --test packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-space.test.mjs packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-frames.test.mjs packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-verify.test.mjs
rtk proxy node packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-verify.mjs card --case-space --oracle packages/frontend-oracle-design/test-fixtures/full-product/oracle.md
```

- [ ] 이 단계의 변경 파일만 commit한다: `refactor(oracle): extract pure space audit`.

**Gate:** 기존 full-product 보고 내용·ID·legacy 오류 의미가 변하면 다음 단계로 가지 않는다.

## Task 2: 닫힌 프로필과 Contract 카드 문법

**Owner:** Runtime worker.
**Files:** Create `S/oracle-profile.mjs`, `P/scripts/contract-profile.test.mjs`. Modify `S/oracle-space.mjs`, `S/oracle-verify.mjs`, `S/oracle-space.test.mjs`.
**Consumes:** Task 1 Space API.
**Produces:** 고정 profile API, profile-bound card lint와 일반 Contract given schema.

- [ ] 아래 profile 충돌, 미지 값, 다른 namespace, 중복 Profile 섹션, legacy와 explicit 혼합 테스트를 작성한다.

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveProfileBinding,
  profileForController,
} from '../skills/frontend-oracle-design/scripts/oracle-profile.mjs'

test('contract entry never selects formal', () => {
  assert.equal(profileForController('frontend-contract-design'), 'contract/v1')
})
test('a requested profile cannot replace the locked profile', () => {
  assert.throws(
    () =>
      resolveProfileBinding({
        requestedProfile: 'contract/v1',
        bindings: [{ artifact: 'lock', profile: 'formal-bend/v1' }],
      }),
    { code: 'PROFILE_MISMATCH' },
  )
})
test('a legacy lock is not contract authorization', () => {
  assert.throws(
    () =>
      resolveProfileBinding({
        requestedProfile: 'contract/v1',
        bindings: [{ artifact: 'lock', profile: null }],
      }),
    { code: 'PROFILE_MISMATCH' },
  )
})
```

- [ ] RED: `rtk test node --test packages/frontend-oracle-design/scripts/contract-profile.test.mjs`.
- [ ] resolver는 고정 ID를 검사하고, explicit 값 하나가 있으면 모든 제공된 artifact의 profile과 일치시킨다. profile 없는 실제 과거 artifact만 있고 explicit 요청이 없을 때에만 `kind:legacy`를 반환한다. 빈 입력은 PROFILE_REQUIRED다.
- [ ] 새 Contract card lint는 full-product, finite/nonempty dimensions, source/constraint/row/disposition, 적용 가능한 type/temporal 의무를 검사한다. Formal Model/프로젝션 표식을 Contract 검증으로 처리하지 않는다.
- [ ] `auditFullProduct`의 Contract branch에서 given의 목록 전용 다섯 key 조건을 일반 nonempty record 조건으로 바꾼다. legacy branch는 그대로 둔다. 나머지 scenario/source/revision/sequence 검사는 유지한다.

```js
const givenIsRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const contractGiven = (value) => givenIsRecord(value) && Object.keys(value).length > 0
```

- [ ] toggle의 `{ enabled: false }` given은 Contract에서 통과하고 legacy에서는 기존 규칙대로 거부됨을 고정한다. JSON으로 파싱된 실제 상태값 `false`, `0`, 빈 문자열, `null`도 허용하고, given 전체가 빈 객체/배열/null인 경우는 거부하는 경계 테스트를 추가한다. 실제 동작의 정당성은 Task 6에서 별도 확인한다.
- [ ] GREEN: profile/space/verify 테스트를 실행하고 `feat(oracle): bind explicit verification profiles`로 해당 파일만 commit한다.

**Gate:** profile 지정만으로 source/approval/required evidence를 면제할 수 없어야 한다.

## Task 3: 같은 stage·lock 엔진에 Contract 작성 경로 연결

**Owner:** Runtime worker.
**Files:** Modify `S/oracle-stage.mjs`, `S/oracle-lock.mjs`, `S/oracle-verify.mjs`, `S/oracle-stage.test.mjs`, `S/oracle-lock.test.mjs`, `P/scripts/contract-profile.test.mjs`.
**Consumes:** Task 2 profile + card lint.
**Produces:** 가짜 package 없이 승인된 Contract를 immutable lock까지 진행.

- [ ] public stage CLI의 Contract begin/advance, 승인 전 CHECKED/lock 거부, 다른 profile의 stage 재사용, stage skip, 수정된 카드 bytes 거부 테스트를 작성하고 RED를 확인한다.
- [ ] 새 `--profile`을 begin/advance/create에 일치 확인용으로 추가한다. 새 stage record에는 verificationProfile과 profile-specific input hash를 둔다. 과거 stage record parser는 계속 읽되 새 프로필로 승격하지 않는다.
- [ ] stage의 다음 상태 선택을 profile별 고정 배열로 구현한다.

```js
const AUTHORING_STAGES = Object.freeze({
  'formal-bend/v1': ['DISCOVERING', 'MODELED', 'CHECKED', 'DRAFTED', 'ORACLE_READY'],
  'contract/v1': ['DISCOVERING', 'CHECKED', 'DRAFTED', 'ORACLE_READY'],
})
```

- [ ] `gate()`는 profile dispatch를 package import보다 먼저 한다. Contract CHECKED는 실제 사용자 확인 이후 완성된 카드에 strict Space 검사, DRAFTED는 같은 bytes의 전체 Contract lint다. Formal gate는 기존 package/Bend 경로를 그대로 사용한다.
- [ ] Contract는 DISCOVERING 동안 Draft/사전 검수/cold-read/사용자 확인을 수행한다. CHECKED 이후 전체 `oracle.md` hash를 고정한다. 승인란을 해시에서 빼거나, 정책 변경을 승인 메타데이터로 취급하는 새 예외를 만들지 않는다.
- [ ] `assertReadyToLock`의 package-less early return 전에 explicit Contract를 처리한다. Contract에는 DRAFTED와 같은 card bytes가 필요하다. lock은 전체 card/source hash와 verificationProfile을 묶는다.
- [ ] 기존 create/verify 멱등성과 파일 불변성을 보존한다. ORACLE_READY 직접 advance는 계속 거부한다.

```bash
rtk test node --test packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-stage.test.mjs packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-lock.test.mjs packages/frontend-oracle-design/scripts/contract-profile.test.mjs
```

- [ ] GREEN 후 `feat(oracle): gate contract authoring and locks`로 scoped commit한다.

**Gate:** Draft 사전 검사 성공을 승인 또는 lock 성공으로 취급하지 않는다.

## Task 4: 단일 Delivery의 profile·증거·worker·review 결합

**Owner:** Runtime worker. 이 단계 동안 run/cases 파일은 다른 worker가 편집하지 않는다.
**Files:** Modify `S/oracle-run.mjs`, `S/oracle-run.cases.mjs`, `S/oracle-worker.mjs`, `S/oracle-review-context.mjs`, `S/oracle-delivery-guidance.mjs`, `S/oracle-verify.mjs`. Tests include 기존 run shards, review/worker suites와 `P/scripts/contract-profile.test.mjs`.
**Consumes:** 승인 카드/lock/profile.
**Produces:** profile-bound init, required labels, worker/review artifacts, 정확한 보고.

- [ ] init에서 Contract 필수 label 누락, type/temporal 적용성 누락, profile tampering, stale packet, 잘못된 role activation을 거부하는 RED를 추가한다. 기존 negative cases를 삭제하거나 더 약하게 바꾸지 않는다.
- [ ] `init()`의 기존 formal/generated checks를 profile별로 실행한다. Contract의 필수 label은 `contract-cases:reported`, 타입 경계가 있으면 `type-contract:reported`, Async/Order가 있으면 `fast-check:reported`다. N/A는 승인된 조사 근거가 있을 때만 사용한다.
- [ ] Formal의 behavior/world 필수 stack은 그대로 보존한다. 새 explicit Formal은 package/proof/adequacy 의무를 빠뜨려 legacy branch로 넘어갈 수 없다.
- [ ] Formal 전용 모듈 import를 profile 해석 뒤로 이동한다. 공통 파서가 필요하면 Task 1 모듈에서 가져오고 Contract가 package/model/ensure-bend를 import하지 않도록 한다.
- [ ] run state, worker packet, review dispatch/receipt에 검증된 profile을 복사한다. 기존 signature/digest/provenance에 포함하고 locked card와 일치하는지 소비 시 다시 검사한다. 기존 signature·receipt가 단순 self-report로 대체되지 않는다.
- [ ] implementation worker의 성공한 `$test`와 `$oracle-implement` activation 요구를 유지한다. profile/controller/refs만 현재 실행에 맞게 바꾼다. 이를 모든 역할용 새 transport framework로 확대하지 않는다.
- [ ] completion/report에 profile, coverage, 실제 실행 수, Formal 검증 수행 여부를 추가한다. 기존 상태 이름은 바꾸지 않는다.
- [ ] 기존 run shard 회귀와 Task 2–3 테스트를 실행한다. 실제 CLI end-to-end는 Task 6의 필수 gate로 남긴다.

```bash
rtk test node --test packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-run.shard-1.test.mjs packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-run.shard-2.test.mjs packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-run.shard-3.test.mjs packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-run.shard-4.test.mjs
```

- [ ] GREEN 후 `feat(oracle): enforce profile-bound delivery`로 scoped commit한다.

**Gate:** Contract profile과 실제 products/cases 증거를 확인하기 전에는 GREEN/REVIEW_VERIFIED를 받을 수 없다. Formal 실패 시 fallback하지 않는다.

## Task 5: 두 진입점과 네 공유 역할의 문서·라우팅·hook

**Owner:** References/entries worker. Tasks 2–3 인터페이스가 고정된 뒤 Task 4와 병렬 가능.
**Files:** 위 파일 구조의 SKILL/reference/router/bundle/hook 파일. Modify `P/scripts/modular-skills.test.mjs`, `P/scripts/modular-guard.test.mjs`. Create `P/scripts/profile-reference-isolation.test.mjs`.
**Consumes:** profile API, 승인/잠금/Delivery의 고정 계약.
**Produces:** 여섯 discoverable skills, current-profile dependency closure와 정확한 hook 활성화.

- [ ] 여섯 entry 발견, 두 controller/네 specialist 구분, 24개 activation 양성 사례를 먼저 작성해 RED를 확인한다. `names.slice(1)`을 사용하지 않는다.

```js
const controllers = ['frontend-oracle-design', 'frontend-contract-design']
const specialists = ['oracle-intake', 'oracle-author', 'oracle-implement', 'oracle-review']
const names = [...controllers, ...specialists]
assert.equal(names.length * 2 * 2, 24)
```

- [ ] 새로운 Contract entry를 작성하고 기존 controller는 Formal에 고정한다. 네 공유 역할의 frontmatter와 본문은 두 controller를 지원하되 Bend 전용 절차를 갖지 않는다.
- [ ] common/roles/loading의 unconditional mandatory-verification 참조를 `verification-common`과 현재 profile의 requirements로 바꾼다. 원래 mandatory-verification은 Formal 전용으로 보존한다.
- [ ] `roles/author.md`와 author-closure는 공통 권한/출처/반환 형식만 소유한다. 기존 모델/투영/closure 실행은 author-formal과 author-closure-formal로 옮기고, Contract 절차는 contract/authoring으로 분리한다.
- [ ] graph node의 profiles를 명시한다. route selection, manualConditions, requires closure, reviewer-only nodes 모두 profile을 검사한다. shared node가 Formal-only node를 require하면 graph 검증에서 실패시킨다.
- [ ] manual `role-intake/author/implement/review` include는 선택한 profile의 해당 추가 절차를 포함한다. 현재 역할과 무관한 미래 단계는 자동 로드하지 않는다.
- [ ] 기존 Formal bundle 경로를 보존한다. Contract bundle은 `bundles/contract/`에 생성한다. Fresh delivery는 필요한 requires를 모두 포함하고 continuation-only 가정을 새 worker에 넘기지 않는다.
- [ ] 네 hook 경로/이벤트는 유지한다. 정확한 여섯 이름만 인식하고 잘못된 namespace, quoted tool result, OUT_OF_SCOPE/reset/reactivation negative를 보존한다. 활성 profile과 맞지 않는 lock은 쓰기 gate를 열지 않는다.

```bash
rtk test node --test packages/frontend-oracle-design/scripts/modular-skills.test.mjs packages/frontend-oracle-design/scripts/modular-guard.test.mjs packages/frontend-oracle-design/scripts/profile-reference-isolation.test.mjs
rtk proxy node packages/frontend-oracle-design/skills/frontend-oracle-design/scripts/oracle-reference-route.mjs --profile contract/v1 --point scope-decision --include role-intake --json
rtk pnpm --dir packages/frontend-oracle-design bundles:generate
rtk pnpm --dir packages/frontend-oracle-design bundles:check
```

- [ ] 4 roles × 2 profiles 전체 dependency closure, role별 controller, 실제 worker/review 입력을 검사한다. GREEN 후 `feat(oracle): add isolated contract skill routing`으로 commit한다.

**Gate:** 문서 단어 검색만으로 격리를 통과시키지 않는다. 실제 라우터 출력과 생성 bundle/packet까지 확인한다.

## Task 6: 실제 public runner로 두 프로필과 실패 경로 검증

**Owner:** Acceptance worker, product fixture만 편집. Runtime 오류는 Runtime owner에게 넘긴다.
**Files:** Create `P/test-fixtures/contract-v1/{oracle.md,policy.md,product.mjs,product.test.mjs,deny-formal-loader.mjs}`와 `P/scripts/contract-public-runner.test.mjs`. Extend 기존 formal fixtures/tests, 필요 시 sibling consumer tests.
**Consumes:** Tasks 1–5 통합 결과.
**Produces:** 프로필별 실제 CLI 실행 증거와 requirement→check 보고서.

- [ ] temporary git repository에 명시적 fixture 승인을 가진 Contract 카드와 결함 있는 실제 toggle 제품을 준비한다. 카드 metadata끼리 비교하는 시험을 제품 시험으로 취급하지 않는다.
- [ ] fixture의 초기 결함과 고칠 동작을 다음처럼 고정한다.

```js
// Initial defective product.mjs
export function toggle(enabled) {
  return enabled
}
```

```js
// Actual product.test.mjs assertions, not scenario metadata comparisons
import assert from 'node:assert/strict'
import test from 'node:test'
import { toggle } from './product.mjs'
test('disabled becomes enabled', () => assert.equal(toggle(false), true))
test('enabled becomes disabled', () => assert.equal(toggle(true), false))
```

- [ ] reporter에 실제 frame/scenario ID·tuple·revision을 연결한다. 최초 두 product assertions가 실패해야 한다. 허용된 수정은 `return !enabled`이며 oracle/test 기대값은 바꾸지 않는다.
- [ ] isolated HOME/PATH/cache와 네트워크 차단 환경에서 실행한다. 실제 설치 Bend 경로를 보지 못하게 하고, ESM loader는 ensure-bend/model/package/projection/discovery 같은 Formal 전용 모듈 import를 거부한다. 이 loader는 거짓 성공을 돌려주는 mock이 아니라 위반 시 실패하는 감시 장치다.
- [ ] public CLI를 spawnSync/execFile로 호출한다. 각 exit code, stdout, lock/hash, ledger의 실제 상태를 읽는다. root에서 script 절대 경로를 먼저 구한 뒤 fixture cwd로 이동한다.

```text
oracle-stage begin --profile contract/v1
oracle-frames --oracle <fixture card> --json
oracle-verify card --case-space --profile contract/v1
실제 fixture 승인 상태 확인
oracle-stage advance --to CHECKED --profile contract/v1
oracle-stage advance --to DRAFTED --profile contract/v1
oracle-lock create --profile contract/v1
oracle-run init --profile contract/v1 --required-label contract-cases:reported
oracle-run red --label contract-cases --adapter node-test
허용된 product.mjs 한 줄 수정
oracle-run exec --label contract-cases --adapter node-test
oracle-run green --label contract-cases --adapter node-test
기존 review dispatch/receipt/finalize gate
```

위는 test driver의 호출 순서다. driver는 실제 경로와 기존 CLI의 필수 oracle/dir/report/evidence/command 인자를 전달한다. Medium의 연속 두 GREEN pass, immutable evidence, 독립 review 규칙을 생략하지 않는다. 테스트 harness의 scripted receipt는 transport 테스트로만 분류한다.

- [ ] 다음 finite matrix를 각각 assertion으로 고정한다.

| 사례                                        | 기대 결과                                                        |
| ------------------------------------------- | ---------------------------------------------------------------- |
| toggle + no Bend                            | 실제 RED → scoped fix → GREEN, Formal import 0                   |
| async stale-search + no Bend                | 실제 순서/효과 assertion, positive-count property evidence       |
| typed boundary                              | 실제 compiler positive/negative witness와 type-contract evidence |
| boundary 없음                               | 조사 근거가 있는 N/A, dummy import 없음                          |
| Design-only                                 | 승인/lock 가능, consumer test·product diff 없음                  |
| Formal + 실제 Bend                          | 기존 model/proof/projection/Delivery 회귀 유지                   |
| Formal + Bend 차단                          | 실제 환경 실패, Contract fallback 없음                           |
| Contract + 필수 runner 차단                 | 실제 원인으로 실패, false GREEN 없음                             |
| 미정/누락/중복/오래된 Space                 | ready/lock 거부                                                  |
| profile/receipt/packet 변경                 | 거부, lock/ledger acceptance 불변                                |
| historical run                              | 원본 bytes 유지, 새 Contract로 간주하지 않음                     |
| pre-RED write/test weakening/stale snapshot | 기존 방어 유지                                                   |
| ALREADY_SATISFIED                           | 불필요한 제품 수정 없이 기존 경로 유지                           |

```bash
rtk test node --test packages/frontend-oracle-design/scripts/contract-public-runner.test.mjs
rtk pnpm --dir packages/frontend-oracle-design test
rtk pnpm --dir packages/frontend-oracle-design lint
rtk pnpm test
```

- [ ] source/runtime 회귀가 안정화되면 관련 consumer의 실제 `pnpm --dir <package> test`도 cache 없이 실행한다: `packages/test`, `packages/frontend-system-design`, `packages/frontend-visual-qa`, `packages/frontend-interface-design`.
- [ ] 실패 원인을 수정한 후 재실행한다. 테스트 수만 나열하지 않고 R1–R10마다 command/artifact/관찰 결과/한계를 적는다. `test(oracle): exercise contract and formal public flows`로 scoped commit한다.

**Gate:** fake model 호스트의 성공을 native skill activation, 필요한 문서 완독 또는 독립 판단의 성공으로 계산하지 않는다.

## Task 7: 배포와 실제 설치 호스트에서 수용 확인

**Owner:** Coordinator, 독립 Sol reviewer는 read-only.
**Files:** Modify `P/package.json`, `P/.claude-plugin/plugin.json`, `P/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json`, root/package README와 EVALUATION, 해당 eval corpus/생성 산출물. Create `docs/reviews/2026-10-04-oracle-contract-profiles-acceptance.md`.
**Consumes:** R1–R9의 통합 통과와 독립 리뷰.
**Produces:** 버전 일치, six-entry 설치 parity, native 경로 관찰.

- [ ] release 시 기준 버전이 아직 0.83.1이면 새 기능 버전 0.84.0을 네 metadata 위치에 함께 기록한다. 다른 작업이 버전을 올렸다면 충돌을 해결하고 contract test가 요구하는 새 버전을 일치시킨다.
- [ ] 모든 generator --check, 공개 lint/test, fresh consumer tests, 독립 리뷰를 통과시킨다. eval에서 profile 선택·잘못된 fallback·반복 실행·fresh-context를 추가하고 정답 기대값을 새 동작에 맞게 근거와 함께 갱신한다.
- [ ] 구현 commit을 push한 뒤에만 사용자 scope 설치를 갱신한다. 현재 marketplace root에 사용자 local work가 있으므로 불필요한 merge/cleanup을 하지 않는다.

```bash
rtk claude plugin marketplace update my-vibe-coding-helper
rtk claude plugin update frontend-oracle-design@my-vibe-coding-helper --scope user --json
rtk codex plugin add frontend-oracle-design@my-vibe-coding-helper --json
rtk rsync -a packages/frontend-oracle-design/skills/frontend-oracle-design/ "$HOME/.jcode/skills/frontend-oracle-design/"
rtk rsync -a packages/frontend-oracle-design/skills/frontend-contract-design/ "$HOME/.jcode/skills/frontend-contract-design/"
rtk rsync -a packages/frontend-oracle-design/skills/oracle-intake/ "$HOME/.jcode/skills/oracle-intake/"
rtk rsync -a packages/frontend-oracle-design/skills/oracle-author/ "$HOME/.jcode/skills/oracle-author/"
rtk rsync -a packages/frontend-oracle-design/skills/oracle-implement/ "$HOME/.jcode/skills/oracle-implement/"
rtk rsync -a packages/frontend-oracle-design/skills/oracle-review/ "$HOME/.jcode/skills/oracle-review/"
```

- [ ] --delete를 사용하지 않는다. plugin list와 실제 installed cache/manifest를 확인한다. marketplace source를 보여주는 details 출력만으로 설치 버전을 주장하지 않는다. 여섯 Jcode 디렉터리와 양쪽 plugin cache를 repository bytes와 비교하고 local-only data는 보존한다.
- [ ] 새 호스트 세션에서 두 entry를 실제 호출한다. 동일한 bounded read-only 요청으로 profile/controller/role activation, 필요한 참조 전체 본문, 순서, 올바른 safe stop을 확인한다. Contract trace에서 Formal 절차 읽기/실행이 있으면 실패다.
- [ ] 설치 호스트에서 fixture Delivery를 실행하는 native 수용 시험은 explicit fixture-only 작업으로 제한한다. 실제 assertions/locks/ledger를 사용하고 review는 새 독립 context로 수행한다. 승인이나 receipt를 모델의 말만으로 인정하지 않는다.
- [ ] 실제 호스트 권한·계정·신뢰 승인 또는 사용량 제약으로 native 시험이 막히면 외부 제약을 기록한다. 단위 테스트로 대체 완료하지 않는다. 테스트 완료 후 host 재시작 필요성을 안내한다.
- [ ] 수용 보고서에 실제 결과를 기록하고 docs commit/push를 마친다.

**Gate:** native read-only trace 성공은 전체 정책 품질이나 전체 Delivery 성공의 증거가 아니다. 실행한 범위만 보고한다.

## Sol swarm 실행 순서

```text
승인
  → Space Sol: Task 1
  → Runtime Sol: Tasks 2 → 3 → 4
                      ↘ References Sol: Task 5
  → Acceptance Sol: Task 6
  → 새 독립 Review Sol
  → Coordinator: Task 7
```

코디네이터는 interfaces/소유권/통합/commit/push를 관리한다. Runtime/References 병렬화는 Task 2–3 계약이 고정된 뒤에만 한다. worker는 하위 agent를 만들지 않는다. 각 작업의 RED/GREEN 로그와 handoff를 남긴다.

## 요구사항 추적과 현재 상태

| 요구사항 | 구현 Task     | 통과 근거                                             |
| -------- | ------------- | ----------------------------------------------------- |
| R1       | 5, 7          | 정확히 여섯 entry, 실제 설치 목록/parity              |
| R2       | 1, 4, 5, 6, 7 | import deny + graph/bundle/packet + native read trace |
| R3       | 1, 2, 6       | case 집합, disposition/revision negatives             |
| R4       | 2, 6          | toggle given schema + 실제 제품 assertions            |
| R5       | 2, 3, 4, 6    | cross-profile tamper 거부와 원본 hash                 |
| R6       | 3, 4, 6       | 승인/RED/lock write gate, Design-only diff            |
| R7       | 4, 6, 7       | 두 프로필 public runner + native scope별 증거         |
| R8       | 4, 6          | 환경 차단 시 프로필별 실제 결과                       |
| R9       | 2, 3, 4, 6    | legacy read/resume, 명시적 새 프로필 거부             |
| R10      | 5, 6, 7       | 생성물·공개 테스트·consumer·설치 경계                 |

현재 완료된 것은 설계 조사와 계획 작성뿐이다. 기존 CLI로 12개 프레임 생성과 구조 검수를 관찰했지만 새 Contract가 구현되었다는 증거가 아니다. 위 실행 단계는 아직 하나도 완료하지 않았다.

**승인 요청:** 두 진입점/네 공유 역할/단일 runtime, Contract v1 full-product 한정, 승인 이후 stage hash 고정, legacy 비승격이라는 범위가 맞는지 확인한 뒤 Sol swarm 구현을 시작한다.
