import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

async function read(relativePath) {
  return readFile(join(skillDirectory, relativePath), 'utf8')
}

const CARD_NODE_FILES = [
  'references/card/policy-sources.md',
  'references/card/risk-grill.md',
  'references/card/card-format.md',
  'references/card/confirmation-lock.md',
]
const DELIVERY_NODE_FILES = [
  'references/delivery/ledger.md',
  'references/delivery/red.md',
  'references/delivery/implementation-decision.md',
  'references/delivery/green-review.md',
]
const TYPES_NODE_FILES = [
  'references/types/state-ladder.md',
  'references/types/authoring.md',
  'references/types/api-surface.md',
  'references/types/review-criteria.md',
]

async function readAll(relativePaths) {
  const parts = await Promise.all(relativePaths.map(read))
  return parts.join('\n')
}

const readCard = () => readAll(CARD_NODE_FILES)
const readDelivery = () => readAll(DELIVERY_NODE_FILES)
const readTypes = () => readAll(TYPES_NODE_FILES)

test('runs the Oracle contract through the bundled deterministic workflow graph', async () => {
  const [skill, graphOrchestration, graphSource] = await Promise.all([
    read('SKILL.md'),
    read('references/graph-orchestration.md'),
    read('references/oracle-workflow.graph.json'),
  ])
  const graph = JSON.parse(graphSource)
  const verifier = join(
    skillDirectory,
    '../../agent-graph-engineering/skills/agent-graph-engineering/scripts/graph-verify.mjs',
  )
  const graphPath = join(skillDirectory, 'references/oracle-workflow.graph.json')
  const verified = spawnSync(process.execPath, [verifier, 'verify', '--graph', graphPath], { encoding: 'utf8' })

  assert.match(skill, /명시적으로 요청받은 경우에만.*`\$agent-graph-engineering`.*graph-orchestration\.md/s)
  assert.doesNotMatch(skill, /\.ai\/agent-graphs\/<oracle-id>\/graph\.json/)
  assert.match(
    graphOrchestration,
    /명시적으로 요청한 경우에만 설치된\s*\n?`\$agent-graph-engineering`을 이름으로 명시적으로 로드·호출/,
  )
  assert.match(graphOrchestration, /subagent 위임을 강제하지 않으며\s*\n?agent 재량 선택만 허용한다/)
  assert.match(graphOrchestration, /\.ai\/agent-graphs\/<oracle-id>\/graph\.json/)
  assert.match(graphOrchestration, /graph-verify\.mjs next/)
  assert.equal(graph.entry, 'draft-oracle')
  assert.deepEqual(graph.terminals, ['oracle-ready', 'review-verified', 'cancelled', 'failed'])
  assert.equal(verified.status, 0, verified.stderr)
  assert.equal(verified.stdout, 'GRAPH_VALID frontend-oracle-design\n')
})

test('routes already-satisfied red, blocked standard review and split reviewer samples to declared edges', async () => {
  const { selectTransitions } = await import(
    '../../../agent-graph-engineering/skills/agent-graph-engineering/scripts/graph-verify.mjs'
  )
  const graph = JSON.parse(await read('references/oracle-workflow.graph.json'))
  const node = (id) => graph.nodes.find((candidate) => candidate.id === id)

  assert.deepEqual(selectTransitions(graph, 'valid-red', { classification: 'INVALID_RED' }), ['draft-oracle'])
  assert.deepEqual(selectTransitions(graph, 'standard-review', { status: 'READY' }), ['review-decision'])
  assert.deepEqual(selectTransitions(graph, 'standard-review', { status: 'BLOCKED' }), ['evidence-repair'])

  assert.deepEqual(node('high-review-a').output, ['status', 'findingsA'])
  assert.deepEqual(node('high-review-b').output, ['status', 'findingsB'])
  assert.deepEqual(node('high-review-join').input, ['status', 'findingsA', 'findingsB'])
})

test('O26: backs reported verification with a run ledger, machine transitions and counted budgets', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /scripts\/oracle-run\.mjs exec/)
  assert.match(skill, /append-only\s*\n?\s*ledger에 기록되고 보고는 자유 서술 대신 runId를 인용한다/)
  assert.match(skill, /ledger에 없는 실행을\s*\n?\s*통과로 보고하지 않는다/)
  assert.match(skill, /scripts\/oracle-run\.mjs transition`으로만 기록한다/)
  assert.match(skill, /oracle-run\.mjs budget`이 계수한다/)
  assert.match(skill, /scripts\/oracle-verify\.mjs evidence`로 실제/)
  assert.match(skill, /runs: 인용한 ledger runId/)
  assert.match(skill, /상태 기계: 기록된 전이와 마지막 상태/)
})

test('O27: lints the card structure and initializes run artifacts around the lock', async () => {
  const oracleCard = await readCard()

  assert.match(oracleCard, /oracle-verify\.mjs card/)
  assert.match(oracleCard, /CARD_LINT_FAILED/)
  assert.match(oracleCard, /자동 추가 TC.*실제 계약 행 또는 출처 있는 N\/A/s)
  assert.match(oracleCard, /User Confirmation/)
  assert.match(oracleCard, /Draft Oracle/)
  assert.match(oracleCard, /새 카드.*revision.*사용자.*확인/s)
  assert.match(oracleCard, /정책 ID.*행 ID.*양방향/s)
  assert.match(oracleCard, /oracle-run\.mjs init/)
  assert.match(oracleCard, /--required-label/)
  assert.match(oracleCard, /--harness-path/)
  assert.match(oracleCard, /--milestone/)
  assert.match(oracleCard, /정확한.*상대 파일 경로/s)
  assert.match(oracleCard, /run-state\.json/)
  assert.match(oracleCard, /runs\.jsonl/)
  assert.match(oracleCard, /상태 파일이 이미 있으면 `init`은 실패한다/)
  assert.match(oracleCard, /`oracle-verify\.mjs card` lint와 revision lock 검증이 통과함/)
})

test('O28: routes delivery runs through exec and gates GREEN on flakiness and test strength', async () => {
  const implementationLoop = await readDelivery()

  assert.match(implementationLoop, /oracle-run\.mjs exec/)
  assert.match(implementationLoop, /oracle-run\.mjs transition/)
  assert.match(implementationLoop, /PRODUCTION_TOUCHED_BEFORE_RED/)
  assert.match(implementationLoop, /HARNESS_BUDGET_REQUIRED/)
  assert.match(implementationLoop, /HARNESS_RED_REQUIRED/)
  assert.match(implementationLoop, /MILESTONE_RED_MISSING/)
  assert.match(implementationLoop, /red:<name>/)
  assert.match(implementationLoop, /FLAKINESS_GATE/)
  assert.match(implementationLoop, /Low 1회, Medium 2회, High 3회/)
  assert.match(implementationLoop, /TEST_WEAKENED/)
  assert.match(implementationLoop, /ENV_DRIFT/)
  assert.match(implementationLoop, /evidence\.json/)
  assert.match(implementationLoop, /oracle-verify\.mjs red/)
  assert.match(implementationLoop, /EVIDENCE_REQUIRED/)
  assert.match(implementationLoop, /REQUIRED_RUN_MISSING/)
  assert.match(implementationLoop, /oracle-verify\.mjs review/)
  assert.match(implementationLoop, /EVIDENCE_NOT_IN_RUN/)
  assert.match(implementationLoop, /EVIDENCE_UNVERIFIABLE/)
  assert.match(implementationLoop, /oracle-verify\.mjs scan/)
  assert.match(implementationLoop, /oracle:nondeterminism/)
  assert.match(implementationLoop, /ledger를 거치지 않은 실행을 증거로 보고/)
  assert.match(implementationLoop, /--mutation-run/)
  assert.match(implementationLoop, /--mutation-row/)
  assert.match(implementationLoop, /MUTATION_EVIDENCE_REQUIRED/)
})

test('keeps automatic routing narrow and leaves sibling concerns with their owners', async () => {
  const skill = await read('SKILL.md')
  const description = skill.match(/^description:\s*(.+)$/m)?.[1] ?? ''

  assert.match(description, /medium|high/i)
  assert.match(description, /Do not auto-invoke/i)
  assert.match(description, /low-risk/i)
  assert.match(skill, /Low fast path.*reference.*로드하지/s)
  assert.match(skill, /Oracle.*Outcome Brief.*Source Registry.*lock.*상태 전이/s)
  assert.match(skill, /FSD.*단독.*자동 호출하지 않는다/s)
})

test('O29: gives reviewers raw run evidence and a validated finding schema', async () => {
  const subagentReview = await read('references/subagent-review.md')

  assert.match(subagentReview, /ledger\s*\n?\s*runId/)
  assert.match(subagentReview, /oracle-verify\.mjs findings/)
  assert.match(subagentReview, /--intersect/)
  assert.match(subagentReview, /독립 리뷰를 2회\*\* 실행한다/)
  assert.match(subagentReview, /critical.*high.*단독.*blocking/s)
  assert.match(subagentReview, /medium.*low.*교집합/s)
  assert.match(subagentReview, /FINDINGS_INVALID/)
  assert.match(subagentReview, /medium\/low finding은 `NON_ORACLE_OPINION`으로 강등/)
  assert.match(subagentReview, /행이 없는 critical\/high.*blocking/s)
  assert.match(subagentReview, /grade가 `reported`인가/)
})

test('O30: delegates screenshot and direct-browser execution to a separate skill', async () => {
  const [skill, visualDesign] = await Promise.all([read('SKILL.md'), read('references/visual-design.md')])

  assert.match(skill, /\$frontend-visual-qa/)
  assert.match(skill, /명시적으로 요청.*호출/s)
  assert.match(visualDesign, /\$frontend-visual-qa/)
  assert.match(visualDesign, /screenshot.*직접 브라우저.*소유/s)
  assert.doesNotMatch(skill, /BROWSER_VERIFIED/)
})

test('requires automatic deterministic locking at delivery boundaries', async () => {
  const [skill, oracleCard] = await Promise.all([read('SKILL.md'), readCard()])

  assert.match(skill, /scripts\/oracle-lock\.mjs/)
  assert.match(skill, /각 단계 직전 revision lock을 자동 검증/)
  assert.match(oracleCard, /\.ai\/oracles\/<oracle-id>/)
  assert.match(oracleCard, /사용자에게 명령 실행을 요청하지 않는다/)
  assert.match(oracleCard, /ORACLE_CHANGED/)
  assert.match(oracleCard, /SOURCE_CHANGED/)
  assert.match(oracleCard, /LOCK_INVALID/)
})

test('locks all approved Delivery sources once instead of extending an existing lock', async () => {
  const [skill, oracleCard, implementationLoop] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    readDelivery(),
  ])

  assert.match(skill, /Delivery.*lock.*미룬다/s)
  assert.match(skill, /architecture.*backend.*final lock.*1회/s)
  assert.match(oracleCard, /Design-only.*Delivery.*새 revision/s)
  assert.match(implementationLoop, /모든 결과 변경.*final lock을 1회/s)
  assert.doesNotMatch(`${skill}\n${oracleCard}`, /add-source/)
})

test('keeps feedback routing and evidence tied to the locked revision', async () => {
  const [skill, implementationLoop] = await Promise.all([read('SKILL.md'), readDelivery()])

  for (const classification of [
    'POLICY_GAP',
    'EVIDENCE_GAP',
    'HARNESS_DEFECT',
    'PRODUCT_DEFECT',
    'ENVIRONMENT_DEFECT',
    'NON_ORACLE_OPINION',
  ]) {
    assert.match(skill, new RegExp(classification))
    assert.match(implementationLoop, new RegExp(classification))
  }

  assert.match(implementationLoop, /evidence manifest/)
  assert.match(implementationLoop, /revision mismatch/)
})

test('carries the locked revision through tests and review without owning visual QA', async () => {
  const [skill, implementationLoop, subagentReview] = await Promise.all([
    read('SKILL.md'),
    readDelivery(),
    read('references/subagent-review.md'),
  ])

  assert.match(skill, /\$frontend-visual-qa/)
  assert.doesNotMatch(skill, /browser-verification\.md|BROWSER_VERIFIED|브라우저 검증·자가개선/)
  assert.doesNotMatch(implementationLoop, /browser scenario|BROWSER_VERIFIED/)
  assert.match(subagentReview, /Oracle SHA-256/)
  assert.match(subagentReview, /마지막 verify/)
  assert.match(subagentReview, /NON_ORACLE_OPINION/)
  await assert.rejects(read('references/browser-verification.md'), { code: 'ENOENT' })
})

test('generates reviewer input from raw locked artifacts without a hand-written conclusion', async () => {
  const [skill, subagentReview] = await Promise.all([read('SKILL.md'), read('references/subagent-review.md')])

  assert.match(skill, /oracle-run\.mjs review-packet/)
  assert.match(subagentReview, /oracle-run\.mjs review-packet/)
  assert.match(subagentReview, /review-input\.json/)
  assert.match(subagentReview, /lock manifest.*run state.*ledger.*evidence mapping.*git diff/s)
  assert.match(subagentReview, /손으로 고치지 말고/)
  assert.match(subagentReview, /micro-hook·pure model source/)
})

test('keeps Oracle plugin release metadata versions aligned', async () => {
  const packageDirectory = dirname(skillDirectory)
  const repositoryDirectory = dirname(dirname(packageDirectory))
  const [packageJson, claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    readFile(join(packageDirectory, 'package.json'), 'utf8'),
    readFile(join(packageDirectory, '.claude-plugin/plugin.json'), 'utf8'),
    readFile(join(packageDirectory, '.codex-plugin/plugin.json'), 'utf8'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const marketplace = JSON.parse(marketplaceJson)
  const marketplaceVersion = marketplace.plugins.find(({ name }) => name === 'frontend-oracle-design')?.version

  assert.equal(version, '0.20.0')
  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(JSON.parse(codexPluginJson).version, version)
  assert.equal(marketplaceVersion, version)
  assert.equal(marketplace.version, '0.20.0')
})

test('separates requested mechanism from intended outcome without letting the agent shrink scope', async () => {
  const oracleCard = await readCard()

  assert.match(oracleCard, /Requested mechanism check — 수단과 결과 분리/)
  assert.match(oracleCard, /Intended outcome/)
  assert.match(oracleCard, /Smallest reversible scope/)
  assert.match(oracleCard, /Deferred scope.*Non-goals/s)
  assert.match(oracleCard, /scope 축소는 사용자의 명시적\s*\n?\s*승인으로만/)
  assert.match(oracleCard, /`mandatory-constraint`.*생략\s*\n?\s*근거로 쓰지 않는다/s)
  assert.match(oracleCard, /요청된 수단이 의도한 결과를 얻는 최소 수단인지/)
})

test('loads the performance reference only for measured performance claims', async () => {
  const [skill, performance, frontendImplementation] = await Promise.all([
    read('SKILL.md'),
    read('references/performance.md'),
    read('references/frontend-implementation.md'),
  ])

  assert.match(skill, /references\/performance\.md/)
  assert.match(skill, /성능 요구·개선 claim/)
  assert.match(performance, /제품 정책이 아니다/)
  assert.match(performance, /Initial-load/)
  assert.match(performance, /Responsiveness/)
  assert.match(performance, /profiler/)
  assert.match(performance, /baseline/)
  assert.match(performance, /trade-off/)
  assert.match(performance, /측정 전에는 최적화하지 않는다/)
  assert.match(performance, /가장 작은 병목만/)
  assert.match(performance, /P95\/P99 측정을 모든 프로젝트에 강제하지 않는다/)
  assert.match(performance, /`POLICY_GAP`으로 `NEEDS_DECISION`/)
  assert.match(performance, /frontend-implementation\.md/)
  assert.match(frontendImplementation, /performance\.md/)
})

test('records new dependency decisions and reviews them against real problems and context', async () => {
  const [implementationLoop, subagentReview] = await Promise.all([
    readDelivery(),
    read('references/subagent-review.md'),
  ])

  assert.match(implementationLoop, /- Dependency: 새로 도입·교체한 framework\/library/)
  assert.match(implementationLoop, /비용과 제거 경로; 없으면 N\/A/)
  assert.match(subagentReview, /왜 새 dependency·framework를 도입했는가\?/)
  assert.match(subagentReview, /기술 이름·인기가 아니라 실제 문제/)
  assert.match(subagentReview, /navigation·persistence·권한·결제·cross-unit/)
  assert.match(subagentReview, /diff 밖의 실제\s*\n?\s*route/)
})

test('reuses the repository network boundary and colocates approved MSW handlers', async () => {
  const [skill, implementationLoop, fsd] = await Promise.all([
    read('SKILL.md'),
    readDelivery(),
    read('references/fsd.md'),
  ])

  assert.match(skill, /이미 쓰는 network test 경계를 우선/)
  assert.match(skill, /MSW가 설치됐거나.*승인/s)
  assert.match(skill, /가장 가까운 곳에 두고/)
  assert.match(implementationLoop, /이미 쓰는 test boundary를 우선/)
  assert.match(implementationLoop, /dependency를 조용히 추가하지 않는다/)
  assert.match(implementationLoop, /fsd\.md/)
  assert.match(fsd, /<slice>\/api\/__mocks__\//)
  assert.match(fsd, /<slice>\/__mocks__\//)
})

test('explicitly invokes $test before writing frontend tests', async () => {
  const [skill, implementationLoop] = await Promise.all([read('SKILL.md'), readDelivery()])

  assert.match(skill, /테스트 파일을 작성하기 직전에 `\$test` 스킬을 이름으로 명시적으로 로드·호출/)
  assert.match(skill, /테스트 파일 작성 직전에 `\$test` 스킬을 명시적으로 호출/)
  assert.match(implementationLoop, /테스트 파일을 작성하기 직전에 설치된 `\$test` 스킬을 이름으로 명시적으로 로드·호출/)
  assert.match(implementationLoop, /파일을 참고만 하는 것으로 대체하지 않으며/)
})

test('batches delivery decisions without prescribing an implementation topology', async () => {
  const [implementationLoop, graphSource] = await Promise.all([
    readDelivery(),
    read('references/oracle-workflow.graph.json'),
  ])
  const graph = JSON.parse(graphSource)
  const implementationNode = graph.nodes.find((node) => node.id === 'implement-green')

  for (const intakeItem of ['policy', 'architecture', 'evidence', 'naming', 'review']) {
    assert.match(implementationLoop, new RegExp(intakeItem))
  }

  assert.match(implementationLoop, /read-only.*병렬/s)
  assert.match(implementationLoop, /모든.*결정.*뒤.*final lock.*1회/s)
  assert.match(implementationLoop, /`VALID_RED` 전.*production.*수정하지 않는다/s)
  assert.match(implementationLoop, /현재 agent.*직접.*위임.*병렬화.*강제하지 않는다/s)
  assert.equal(implementationNode.kind, 'gate')
  assert.equal(implementationNode.owner, undefined)
  assert.match(implementationNode.task, /단일·위임·병렬 구현 방식을 강제하지 않는다/)
  assert.match(implementationLoop, /targeted GREEN.*1회/s)
  assert.match(implementationLoop, /root test.*lint.*format.*독립 review.*병렬/s)
  assert.match(implementationLoop, /모든 결과.*합류.*final verify/s)
})

test('defines the FSD contract and wires it through loading, architecture, implementation, and review', async () => {
  const [skill, fsd, architectureContract, frontendImplementation, subagentReview, backend] = await Promise.all([
    read('SKILL.md'),
    read('references/fsd.md'),
    read('references/architecture-contract.md'),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
    read('references/backend.md'),
  ])

  assert.match(skill, /references\/fsd\.md/)
  assert.match(skill, /Feature-Sliced Design/)
  assert.match(skill, /제안·설계·리뷰하기 전/)
  assert.match(skill, /설치된 `\$test` 스킬을 이름으로 명시적으로 로드·호출/)
  assert.match(fsd, /app → pages → widgets → features → entities → shared/)
  assert.match(fsd, /`components`, `hooks`, `utils`는 FSD segment가 아니다/)
  assert.match(fsd, /ui\|model\|api\|lib\/__test__\//)
  assert.match(fsd, /deep import하지 않는다/)
  assert.match(fsd, /steiger/)
  assert.match(fsd, /pnpm add -D steiger @feature-sliced\/steiger-plugin/)
  assert.match(fsd, /'fsd\/typo-in-layer-name': 'off'/)
  assert.match(fsd, /`@lodado\/eslint-config`.*이미.*사용/s)
  assert.match(fsd, /NEEDS_DECISION/)
  assert.match(fsd, /Server 코드 배치/)
  assert.match(fsd, /`src\/server\/` 루트로 빼지 않는다/)
  assert.match(fsd, /server-only/)
  assert.match(fsd, /Pages-first/)
  assert.match(fsd, /widgets layer는 신규 채택을 비권장/)
  assert.match(fsd, /shared\/auth/)
  assert.match(fsd, /Cross-import 해결/)
  assert.match(fsd, /`_app\/`·`_pages\/`/)
  assert.match(fsd, /technical-role/)
  assert.match(architectureContract, /fsd\.md/)
  assert.match(architectureContract, /steiger/)
  assert.match(backend, /fsd\.md/)
  assert.match(backend, /Server 코드 배치/)
  assert.match(frontendImplementation, /fsd\.md/)
  assert.match(subagentReview, /fsd\.md/)
})

test('gates approved hook encapsulation and reviews UI/business responsibility boundaries', async () => {
  const [skill, architectureContract, frontendImplementation, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/architecture-contract.md'),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(skill, /Hook Encapsulation/)
  assert.match(frontendImplementation, /eslint-plugin-use-encapsulation/)
  assert.match(frontendImplementation, /use-encapsulation\/prefer-custom-hooks/)
  assert.match(frontendImplementation, /allow.*block/s)
  assert.match(frontendImplementation, /응집도.*증명하지/s)
  assert.match(architectureContract, /orchestration-only/)
  assert.match(architectureContract, /target glob.*rule ID.*allow.*block.*lint command/s)
  assert.match(architectureContract, /hook-encapsulation/)
  assert.match(frontendImplementation, /UI.*비즈니스 로직/s)
  assert.match(subagentReview, /micro-hook.*UI.*비즈니스 로직/s)
  assert.match(subagentReview, /trivial wrapper.*거대 hook/s)
  assert.doesNotMatch(subagentReview, /lint|hook-encapsulation|eslint-disable/)
})

test('keeps Oracle control while consuming optional system-design references', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /frontend-system-design/)
  assert.match(skill, /설치돼 있으면 Oracle intake와 제어권을 유지한 채/)
  assert.match(skill, /모든 선택은 정책 후보/)
  assert.match(skill, /POLICY_GAP.*NEEDS_DECISION/s)
  assert.match(skill, /구현 선택지이며 Oracle의 오케스트레이션/)
  assert.doesNotMatch(skill, /references\/(infinite-scroll|search-typeahead)\.md/)
})

test('loads visual design guidance only for UI-shaping work and carries its contract through delivery', async () => {
  const [skill, visualDesign, oracleCard, frontendImplementation, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/visual-design.md'),
    readCard(),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(skill, /references\/visual-design\.md/)
  assert.match(skill, /behavior-only/)
  assert.match(skill, /identity-shaping/)
  assert.match(skill, /Design Change Confirmation/)
  assert.match(visualDesign, /Design Proposal/)
  assert.match(visualDesign, /Design Intent/)
  assert.match(visualDesign, /Design Change Confirmation/)
  assert.match(visualDesign, /local[\s\S]*identity-shaping[\s\S]*명시적 사용자 확인/)
  assert.match(visualDesign, /HARD/)
  assert.match(visualDesign, /RELATIONAL/)
  assert.match(visualDesign, /JUDGMENT/)
  assert.match(oracleCard, /Design Intent/)
  assert.match(oracleCard, /Design Change Confirmation/)
  assert.match(frontendImplementation, /Design Intent/)
  assert.match(subagentReview, /designer/)
  assert.match(subagentReview, /출처 있는 미적 요구/)
  assert.match(subagentReview, /Design Change Confirmation/)
})

test('keeps visual policy in Oracle while delegating visual execution details', async () => {
  const visualDesign = await read('references/visual-design.md')

  assert.match(visualDesign, /HARD/)
  assert.match(visualDesign, /RELATIONAL/)
  assert.match(visualDesign, /JUDGMENT/)
  assert.match(visualDesign, /baseline.*사용자.*명시적 승인/s)
  assert.match(visualDesign, /\$frontend-visual-qa/)
  assert.doesNotMatch(visualDesign, /`\*\.style\.(?:test|spec)/)
  assert.doesNotMatch(visualDesign, /BROWSER_VERIFIED/)
})

test('requires independent design review for judgment while visual QA owns baseline execution', async () => {
  const [visualDesign, subagentReview] = await Promise.all([
    read('references/visual-design.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(visualDesign, /`JUDGMENT`.*`designer`/s)
  assert.match(subagentReview, /`JUDGMENT` 행.*승인 기준.*Design Intent/s)
  assert.match(subagentReview, /\$frontend-visual-qa.*artifact/s)
})

test('O1-O7: loads one detailed changeability reference before implementation decisions', async () => {
  const [skill, changeability, frontendImplementation, implementationLoop] = await Promise.all([
    read('SKILL.md'),
    read('references/changeability.md'),
    read('references/frontend-implementation.md'),
    readDelivery(),
  ])

  for (const term of ['Readability', 'Predictability', 'Cohesion', 'Coupling', 'Simplicity']) {
    assert.match(changeability, new RegExp(`## ${term}`))
  }

  assert.match(changeability, /제품 정책.*아니다/)
  assert.match(changeability, /Oracle.*대상 레포.*실제 설치 버전.*구현 휴리스틱/s)
  assert.match(changeability, /구현 전 질문/)
  assert.match(changeability, /React 구현 기준/)
  assert.match(changeability, /위험 신호/)
  assert.match(changeability, /적용하지 않는 경우/)
  assert.match(changeability, /Implementation Decision evidence/)
  assert.match(changeability, /Reviewer 판정 기준/)
  assert.match(changeability, /숨은 부작용/)
  assert.match(changeability, /반복.*이유만으로.*공통화/s)
  assert.match(changeability, /기존 레포.*기본 기능.*설치.*dependency.*최소/s)
  assert.match(changeability, /축 사이 trade-off/)
  assert.match(changeability, /내부 상태 전이와 lifecycle을 모호한 자동화로 숨기지 않는다/)
  assert.match(changeability, /복구 가능한 오류만 처리하고 나머지는 상위로 전파한다/)
  assert.match(changeability, /pure transition core와 얇은 adapter/)
  assert.match(changeability, /미래 가능성만으로\s*\n?\s*단일 runtime에 adapter를 추가하지 않는다/)
  assert.match(changeability, /hook.*반환.*대상 레포.*관례/is)
  assert.doesNotMatch(changeability, /^## React 구현 교차 점검$/m)
  assert.doesNotMatch(changeability, /^## Implementation Decision 형식$/m)
  assert.doesNotMatch(changeability, /^## Reviewer 판정과 최소 수정$/m)
  assert.match(changeability, /frontend-implementation\.md/)
  assert.match(changeability, /delivery\/implementation-decision\.md/)
  assert.match(changeability, /subagent-review\.md/)

  assert.match(skill, /references\/changeability\.md/)
  assert.match(frontendImplementation, /changeability\.md/)
  assert.doesNotMatch(frontendImplementation, /## 변경 용이성 렌즈/)
  assert.match(implementationLoop, /changeability\.md/)

  assert.match(implementationLoop, /\.ai\/oracles\/<oracle-id>\/implementation-decision\.md/)
  assert.match(implementationLoop, /Changeability/)
  assert.match(implementationLoop, /Side effects/)
  assert.match(implementationLoop, /Simplicity/)
  assert.match(implementationLoop, /material.*trade-off/s)
  assert.match(implementationLoop, /boilerplate/)
})

test('O8-O10: reviews with the same changeability reference without turning taste into a blocker', async () => {
  const [changeability, subagentReview] = await Promise.all([
    read('references/changeability.md'),
    read('references/subagent-review.md'),
  ])

  for (const term of ['Readability', 'Predictability', 'Cohesion', 'Coupling', 'Simplicity']) {
    assert.match(changeability, new RegExp(`## ${term}`))
  }

  assert.match(subagentReview, /changeability\.md/)
  assert.match(subagentReview, /implementation-decision\.md/)
  assert.match(subagentReview, /review-packet[\s\S]*--decision/)
  assert.match(subagentReview, /changeabilityReview/)
  assert.match(subagentReview, /PASS\s*\|\s*FINDING\s*\|\s*N\/A/)
  assert.match(subagentReview, /숨은 부작용/)
  assert.match(subagentReview, /PRODUCT_DEFECT/)
  assert.match(subagentReview, /EVIDENCE_GAP/)
  assert.match(subagentReview, /POLICY_GAP/)
  assert.match(subagentReview, /NON_ORACLE_OPINION/)
  assert.match(subagentReview, /Decision 반증 질문 — 적용 가능한 항목만/)
  for (const question of [
    '왜 이 범위까지 변경했는가',
    '왜 이 상태는 local 또는 global owner가 소유하는가',
    '요구가 바뀌면 어디를 수정하고 어디까지 전파되는가',
    '왜 이 component·abstraction을 공유하는가',
    '왜 중복을 남겼는가',
    '왜 이 type·state model의 복잡성이 필요한가',
    '이 경계는 어떤 오류를 복구하고 무엇을 상위로 전파하는가',
    '검증하지 않은 계약은 무엇이며 왜 제외했는가',
    '성능 문제나 개선 claim의 근거가 있는가',
    '다음 우선순위는 무엇인가',
  ]) {
    assert.match(subagentReview, new RegExp(question.replaceAll('?', '\\?')))
  }
  assert.match(subagentReview, /문장력만으로 finding을 만들지 않는다/)
  assert.match(subagentReview, /전면 리팩터링/)
  assert.match(subagentReview, /최소 수정/)
})

test('O2: 기존 Oracle Delivery gate를 유지한다', async () => {
  const [skill, oracleCard, implementationLoop] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    readDelivery(),
  ])

  for (const contract of ['VALID_RED', 'oracle-lock.mjs', 'oracle-run.mjs', 'evidence.json']) {
    assert.match(`${skill}\n${oracleCard}\n${implementationLoop}`, new RegExp(contract.replace('.', '\\.')))
  }
})

test('pins document-driven stage journal and disk recall', async () => {
  const [skill, oracleCard] = await Promise.all([read('SKILL.md'), readCard()])

  assert.match(skill, /### 문서 기준 진행/)
  assert.match(skill, /대화 기억이 아니라 disk를 재독/)
  assert.match(skill, /journal\.md.*append-only/s)
  assert.match(skill, /implementation-decision\.md.*중복 기록하지/s)
  assert.match(skill, /정책 출처도 lock 대상도 아니며.*카드가 이긴다/s)
  assert.match(oracleCard, /journal\.md.*append/s)
  assert.match(oracleCard, /답을 대화에만 남기지 않는다/)
  assert.match(oracleCard, /문답 항목은 한 줄 규격/)
  assert.match(oracleCard, /→ 답:.*→ 채택:.*→ 행:/)
  assert.match(oracleCard, /`journal\.md`는 예외다/)
})

test('pins the system-design grill phases and the conditional API contract format', async () => {
  const [skill, oracleCard, architectureContract] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    read('references/architecture-contract.md'),
  ])

  assert.match(skill, /phase.*순서.*1문1답/s)
  assert.match(oracleCard, /앞 답이 뒤 가지를 죽이는 순서/)
  assert.match(oracleCard, /라운드당 3~5개, 최대 2라운드/)
  assert.match(oracleCard, /RADIO framework/)
  assert.match(oracleCard, /Example Mapping/)
  assert.match(oracleCard, /frontend-system-design.*P4·P5 질문으로 변환/s)
  assert.match(oracleCard, /1문1답 인터뷰를 요청하면.*라운드 상한 없이/s)
  assert.match(oracleCard, /Delivery 중 정책 질문은 그대로[\s\S]*budget.*2라운드/)
  assert.match(architectureContract, /## API contract/)
  assert.match(architectureContract, /Request parameters/)
  assert.match(architectureContract, /Request body/)
  assert.match(architectureContract, /Error codes/)
  assert.match(architectureContract, /O\*.*행에 매핑되지 않은.*POLICY_GAP/s)
  assert.match(architectureContract, /rfc9457/)
  assert.match(architectureContract, /idempotent_requests/)
  assert.match(architectureContract, /next_page_token/)
  assert.match(architectureContract, /카탈로그를 만들지 않는다/)
  assert.match(oracleCard, /RADIO 각 요소의 처리 위치/)
  assert.match(oracleCard, /플랫폼·디바이스·offline·다국어/)
  assert.match(oracleCard, /카드 행에서 draft.*schema를 도출/s)
  assert.match(architectureContract, /### 스펙이 없을 때 — 카드에서 schema 도출/)
  assert.match(architectureContract, /`Then` 관찰 결과.*그려야 하는 것만/s)
  assert.match(architectureContract, /response 필드를 발명하지 않는다/)
  assert.match(architectureContract, /도출 draft는 소유 unit의 `__docs__\/architecture\.md`/)
  assert.match(architectureContract, /대화에만 있는 schema는 source가 아니다/)
})

test('O7: 조건부 품질 계약과 human-first 보고를 안내한다', async () => {
  const [skill, oracleCard, frontendImplementation, implementationLoop, architecture, review] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    read('references/frontend-implementation.md'),
    readDelivery(),
    read('references/architecture-contract.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(oracleCard, /## Outcome Brief/)
  assert.match(oracleCard, /mandatory-constraint/)
  assert.match(frontendImplementation, /## TypeScript 계약/)
  assert.match(frontendImplementation, /accessible name/)
  assert.match(frontendImplementation, /baseline run/)
  assert.match(implementationLoop, /Type contract/)
  assert.match(implementationLoop, /Performance: claim/)
  assert.match(architecture, /## Exported Public API 계약 — 조건부/)
  assert.match(review, /mandatory constraint/)
  assert.match(skill, /결과: Actor\/context/)
  assert.match(skill, /증거 부록:/)
})

test('O8: 카드 schema version 분기와 migration을 추가하지 않는다', async () => {
  const [oracleCard, verifier] = await Promise.all([
    readCard(),
    read('scripts/oracle-verify.mjs'),
  ])

  assert.doesNotMatch(oracleCard, /Oracle-Card-Version/)
  assert.doesNotMatch(verifier, /ORACLE_CARD_VERSION|cardSchemaVersion/)
})

test('type-constraints: derives state contracts from card rows and narrows AI choice space', async () => {
  const [skill, oracleCard, frontendImplementation, typeConstraints, verifier] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    read('references/frontend-implementation.md'),
    readTypes(),
    read('scripts/oracle-verify.mjs'),
  ])

  // State Model은 선택 섹션이다 — 부재를 lint로 강제하지 않고, 있을 때만 구조를 검증한다
  assert.doesNotMatch(verifier, /state-model-missing/)
  assert.doesNotMatch(verifier, /ASYNC_STATE_TOKENS/)
  assert.match(verifier, /state-model-row-unlinked/)
  assert.match(verifier, /state-model-row-unknown/)

  assert.match(skill, /references\/types\/state-ladder\.md/)
  assert.match(skill, /client state·exported Props/)
  assert.match(skill, /shared\/package API·trust boundary/)
  assert.doesNotMatch(skill, /state-modeling\.md/)
  assert.match(skill, /기존 query·router·form이\s+상태를 소유하면 새 `status` union을 만들지 않는다/)
  assert.match(oracleCard, /## State Model/)
  assert.match(oracleCard, /State Model — 선택 사항/)
  assert.match(oracleCard, /섹션이 없다고\s*\n?\s*lint가 막지 않는다/)
  assert.match(oracleCard, /참조 없는 전이는 발명된 정책이다/)
  assert.match(frontendImplementation, /types\/state-ladder\.md/)
  assert.match(frontendImplementation, /client state·/)
  assert.match(frontendImplementation, /exported Props·shared\/package API·trust boundary/)
  assert.doesNotMatch(frontendImplementation, /state-modeling\.md/)
  assert.match(typeConstraints, /무엇이 이제 컴파일되지 않는가/)
  assert.match(typeConstraints, /수용 판정 결정성/)
  assert.match(typeConstraints, /새로 설계하는 exported shared\/package API에서 generic 자체는 목표가 아니다/)
  assert.match(typeConstraints, /기존 library generic 사용은\s+대상이 아니다/)
  assert.match(typeConstraints, /생성 자체를 결정론화/)
  assert.doesNotMatch(typeConstraints, /같은\s+카드에서 같은 설계가 나온다/)
  assert.match(typeConstraints, /공용 API 승격 델타/)
  assert.match(typeConstraints, /호출부 먼저/)
  assert.match(typeConstraints, /generic 명시 없는 대표 정상 호출 1개/)
  assert.match(typeConstraints, /\.test-d\.tsx/)
  assert.match(typeConstraints, /상태 설계 사다리/)
  assert.match(typeConstraints, /상태 소유권은 하나다/)
  assert.match(typeConstraints, /capability/)
  assert.match(typeConstraints, /새 `status` union으로 재포장/)
  assert.match(typeConstraints, /단일 `status` 문자열 literal discriminant/)
  assert.match(typeConstraints, /`POLICY_GAP`으로 `NEEDS_DECISION`/)
  assert.match(typeConstraints, /skipToken/)
  assert.match(typeConstraints, /early return/)
  assert.match(typeConstraints, /satisfies Record/)
  assert.doesNotMatch(typeConstraints, /switch-exhaustiveness-check|`switch`/)
  assert.match(typeConstraints, /설치돼 있거나 도입이 승인된 경우만/)
  assert.doesNotMatch(typeConstraints, /단순 toggle을 위해 XState/)
})

test('type-environment: pins compiler environment once per repo and protects contract files', async () => {
  const [skill, typeConstraints, typeEnvironment] = await Promise.all([
    read('SKILL.md'),
    readTypes(),
    read('references/type-environment.md'),
  ])

  // 셋업 시 1회 로딩 — 매 카드마다 반복하지 않는다
  assert.match(skill, /references\/type-environment\.md/)
  assert.match(skill, /레포당 1회/)
  assert.match(typeEnvironment, /레포당 1회/)
  assert.match(typeEnvironment, /매 카드마다 다시 읽지 않는다/)
  assert.match(typeEnvironment, /tsc --showConfig/)
  assert.match(typeEnvironment, /`strict`/)
  assert.match(typeEnvironment, /noUncheckedIndexedAccess/)
  assert.match(typeEnvironment, /exactOptionalPropertyTypes/)
  assert.match(typeEnvironment, /project-constraint/)
  assert.match(typeEnvironment, /tsconfig를 조용히\s+바꾸지 않는다/)
  assert.match(typeEnvironment, /NEEDS_DECISION/)

  // type-constraints는 환경 전제를 소유하지 않고 가리키기만 한다
  assert.match(typeConstraints, /건전성 증명이 아니라 결정적 고효율 필터/)
  assert.match(typeConstraints, /type-environment\.md/)
  assert.doesNotMatch(typeConstraints, /noUncheckedIndexedAccess/)

  // 소비 지점 단언 금지와 계약 파일 보호
  assert.match(typeConstraints, /소비 루프에 단언이 필요하면 API 형태가 틀린 것이다/)
  assert.match(typeConstraints, /공용 API 승격 실격/)
  assert.match(typeConstraints, /`@ts-expect-error` 케이스를 삭제·약화/)
  assert.match(typeConstraints, /계약 파일은 검수의 신뢰 뿌리다/)
})

test('prefers Suspense and Error Boundary over in-component loading branches', async () => {
  const [frontendImplementation, typeConstraints, subagentReview] = await Promise.all([
    read('references/frontend-implementation.md'),
    readTypes(),
    read('references/subagent-review.md'),
  ])

  assert.match(typeConstraints, /로딩·로드 실패의 기본은 컴포넌트 분기가 아니라 경계다/)
  assert.match(typeConstraints, /frontend-implementation\.md.*3절이 소유/s)
  assert.doesNotMatch(typeConstraints, /경계로 올려 컴포넌트에서 제거할 수 있고/)
  assert.match(typeConstraints, /무조건 실행되는 첫 조회의 loading·error를 경계로 올리지 않고/)

  assert.match(frontendImplementation, /경계로 올릴 수 있는 분기를 컴포넌트 안에 남기지 않는다/)
  assert.match(frontendImplementation, /startTransition/)
  assert.match(frontendImplementation, /throwOnError.*data 부재 조건으로 좁혀/s)

  assert.match(subagentReview, /types\/review-criteria\.md/)
})

test('keeps client state data-only and hands actions back beside it', async () => {
  const [typeConstraints, frontendImplementation, subagentReview] = await Promise.all([
    readTypes(),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
  ])

  // 1·2: 기존 query·framework 상태를 먼저 쓰고, 남는 것만 최소 data-only union으로 만든다
  assert.match(typeConstraints, /기존 query·framework 상태를 최우선으로 재사용한다/)
  assert.match(typeConstraints, /상태는 데이터만 담는다/)

  // 3·4·6: 함수는 state에 넣지 않고 sibling으로 주며 없는 action은 만들지 않는다
  assert.match(typeConstraints, /retry`·`submit`·`reset` 같은 함수를 state 값에 저장하지 않는다/)
  assert.match(typeConstraints, /hook 반환 객체의 sibling/)
  assert.match(typeConstraints, /refetch`를 그대로 다시 노출한다/)
  assert.match(typeConstraints, /\(\) => undefined/)
  assert.match(typeConstraints, /no-action-in-state/)

  // 5: 잘못된 입력은 UI 동작·문구가 다를 때만 별도 상태다
  assert.match(typeConstraints, /UI 동작·문구가 실제로 다를 때만\s*\n?\s*별도 상태로 나눈다/)

  // 8: 카드의 State Model은 정책 표기이지 런타임 기계 지시가 아니다
  assert.match(typeConstraints, /카드에 `## State Model`이 있다는 사실만으로/)
  assert.match(typeConstraints, /Event union·전이 함수·transition command/)

  // 7: unmount·route 변경 뒤 도착한 응답은 타입이 아니라 런타임이 막는다
  assert.match(frontendImplementation, /unmount·route 변경 뒤 도착한 응답/)
  assert.match(frontendImplementation, /AbortController/)
  assert.match(frontendImplementation, /직접 만든 async 상태에도 같은 방어를\s*\n?\s*적용한다/)
  assert.match(frontendImplementation, /state와 action을 형제로 반환한다/)

  // 리뷰는 같은 계약으로 판정한다
  assert.match(subagentReview, /state union과 action 배치/)
})

test('declares every reference as a loadable graph node with resolvable edges', async () => {
  const { readdir } = await import('node:fs/promises')
  const [skill, graphSource] = await Promise.all([read('SKILL.md'), read('references/reference-graph.json')])
  const graph = JSON.parse(graphSource)
  const ids = graph.nodes.map((node) => node.id)

  assert.match(skill, /references\/reference-graph\.json/)
  assert.equal(graph.entry, 'common')
  assert.equal(new Set(ids).size, ids.length)

  for (const node of graph.nodes) {
    assert.ok(node.when, `node ${node.id} must declare a load condition`)
    assert.ok(Array.isArray(node.requires), `node ${node.id} must declare requires edges`)
    for (const dependency of node.requires) {
      assert.ok(ids.includes(dependency), `node ${node.id} requires unknown node ${dependency}`)
    }
    await read(node.path.replace(/^references\//, 'references/'))
  }

  const entries = await readdir(join(skillDirectory, 'references'), { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name).slice(join(skillDirectory, 'references').length + 1))
    .map((relative) => `references/${relative}`)
  const nodePaths = new Set(graph.nodes.map((node) => node.path))
  for (const file of files) {
    if (file === 'references/reference-graph.json') continue
    assert.ok(nodePaths.has(file), `${file} is not declared in reference-graph.json`)
  }
})

test('collects shared authority, policy sources, and feedback routing into one common file', async () => {
  const [skill, common, card, delivery, changeability, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/common.md'),
    readCard(),
    readDelivery(),
    read('references/changeability.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(common, /## 권위 우선순위/)
  assert.match(common, /## 정책 출처/)
  assert.match(common, /## 피드백 라우팅/)
  assert.match(common, /mandatory-constraint/)
  for (const classification of [
    'POLICY_GAP',
    'EVIDENCE_GAP',
    'HARNESS_DEFECT',
    'PRODUCT_DEFECT',
    'ENVIRONMENT_DEFECT',
    'NON_ORACLE_OPINION',
  ]) {
    assert.match(common, new RegExp(classification))
  }

  // canonical 정의는 common.md 하나가 소유하고, 나머지는 pointer와 단계 특칙만 남긴다
  assert.match(skill, /common\.md/)
  assert.match(card, /common\.md/)
  assert.match(delivery, /common\.md/)
  assert.match(changeability, /common\.md/)
  assert.match(subagentReview, /common\.md/)
  assert.doesNotMatch(changeability, /권위 순서: 1\)/)
  assert.doesNotMatch(subagentReview, /^1\. 보안·개인정보·법적·접근성/m)
})

test('passes review criteria to reviewers as file links, not pasted text', async () => {
  const [skill, subagentReview, graphSource, runner] = await Promise.all([
    read('SKILL.md'),
    read('references/subagent-review.md'),
    read('references/reference-graph.json'),
    read('scripts/oracle-run.mjs'),
  ])
  const graph = JSON.parse(graphSource)
  const ids = new Set(graph.nodes.map((node) => node.id))

  assert.match(skill, /--review-point/)
  assert.match(subagentReview, /## 리뷰 포인트 — 파일 링크로 전달/)
  assert.match(subagentReview, /--review-point/)
  assert.match(subagentReview, /본문을 복붙하지 않고/)
  assert.match(subagentReview, /경로와 SHA-256 digest만 기록/)
  assert.match(subagentReview, /types\/review-criteria\.md/)
  assert.match(subagentReview, /무관한 기준으로 finding을 만들지 않는다/)
  assert.match(runner, /review-point/)
  assert.match(runner, /REVIEW_POINT_INVALID/)

  assert.ok(Array.isArray(graph.reviewPoints), 'reference-graph.json must declare reviewPoints routing')
  for (const entry of graph.reviewPoints) {
    assert.ok(entry.when, 'each review point routing needs a condition')
    for (const node of entry.nodes) {
      assert.ok(ids.has(node), `review point routing references unknown node ${node}`)
    }
  }
})

test('routes the low fast path as an explicit exclusive lane in the graph', async () => {
  const [skill, lane, card, delivery, graphSource] = await Promise.all([
    read('SKILL.md'),
    read('references/lanes/low-fast-path.md'),
    readCard(),
    readDelivery(),
    read('references/reference-graph.json'),
  ])
  const graph = JSON.parse(graphSource)
  const ids = new Set(graph.nodes.map((node) => node.id))

  // lane 노드가 진입 조건·절차·승격 규칙을 소유한다
  assert.match(lane, /## 진입 조건/)
  assert.match(lane, /## 하지 않는 것/)
  assert.match(lane, /## 승격 — Low 실격 조건/)
  assert.match(lane, /다른 reference 노드는 로드하지 않는다/)
  assert.match(lane, /검증을 생략하는 lane이 아니다/)
  assert.match(lane, /즉시 Low 실격/)

  // 그래프가 lane 분기를 기계 판독 가능하게 선언한다
  assert.ok(Array.isArray(graph.lanes), 'reference-graph.json must declare lanes')
  const lowLane = graph.lanes.find((entry) => entry.id === 'low-fast-path')
  const oracleLane = graph.lanes.find((entry) => entry.id === 'oracle')
  assert.ok(lowLane, 'low-fast-path lane must exist')
  assert.equal(lowLane.exclusive, true)
  for (const node of lowLane.nodes) assert.ok(ids.has(node), `lane references unknown node ${node}`)
  assert.ok(lowLane.escalation, 'low lane must declare an escalation rule')
  assert.equal(oracleLane?.entry, 'common')

  // SKILL과 각 단계 문서가 lane 노드로 라우팅한다
  assert.match(skill, /lanes\/low-fast-path\.md/)
  assert.match(card, /lanes\/low-fast-path\.md/)
  assert.match(delivery, /lanes\/low-fast-path\.md/)
})

test('forces one entry-node read and a lane header before any other work', async () => {
  const [skill, lane, graphSource] = await Promise.all([
    read('SKILL.md'),
    read('references/lanes/low-fast-path.md'),
    read('references/reference-graph.json'),
  ])
  const graph = JSON.parse(graphSource)

  // 진입 블록이 다른 어떤 절차보다 앞에 온다
  const entryIndex = skill.indexOf('## 진입 — 무조건 먼저')
  assert.ok(entryIndex > 0, 'SKILL.md must declare the unconditional entry block')
  assert.ok(entryIndex < skill.indexOf('## 불변 규칙'))
  assert.ok(entryIndex < skill.indexOf('## 모드 선택'))
  assert.ok(entryIndex < skill.indexOf('## Reference 로딩'))

  assert.match(skill, /첫 tool call은 lane 진입 노드 1개를 Read 하는 것이다/)
  assert.match(skill, /repo 탐색·답변 작성·다른 도구 호출·다른\s*\n?\s*reference 로드는 전부 그 뒤에 온다/)
  assert.match(skill, /응답 첫 줄에 lane 헤더를 출력한다.*헤더 없이 본문을 쓰면 위반이다/s)
  assert.match(skill, /risk=<Low\|Medium\|High> lane=<low-fast-path\|oracle> nodes=\[/)
  assert.match(skill, /실제로 Read 한\*\* 노드만 적는다/)

  // 설명·플랜 전용 요청도 같은 절차 — 이전 실패 모드
  assert.match(skill, /말로 설명만\*\* 하는 요청도 이 절차 안이다/)
  assert.match(skill, /"이미 아는 내용"·\s*\n?\s*"명세가 충분히 상세함"·"코드를 안 고치니까"는 스킵 사유가 아니다/)

  // Low lane도 같은 헤더를 낸다
  assert.match(lane, /응답 첫 줄에 lane 헤더를 출력한다/)
  assert.match(lane, /risk=Low lane=low-fast-path nodes=\[low-fast-path\]/)

  // 그래프가 진입 계약을 기계 판독 가능하게 선언한다
  assert.ok(graph.entryContract, 'reference-graph.json must declare entryContract')
  assert.match(graph.entryContract.firstToolCall, /lane 진입 노드 1개 Read/)
  assert.match(graph.entryContract.responseHeader, /^risk=<Low\|Medium\|High> lane=/)
  assert.match(graph.entryContract.appliesTo, /설명·플랜 전용 요청/)
})

test('inlines the required reference reads into the mode steps instead of a separate section', async () => {
  const skill = await read('SKILL.md')
  const designOnly = skill.slice(skill.indexOf('### Design-only'), skill.indexOf('### Delivery'))
  const delivery = skill.slice(skill.indexOf('### Delivery'), skill.indexOf('## 피드백 라우팅'))

  assert.match(designOnly, /1\. \[`common\.md`\][^\n]*\n\s*\[`card\/policy-sources\.md`\][^\n]*를 읽는다 → `Outcome Brief`/)
  assert.match(designOnly, /7\. \[`card\/risk-grill\.md`\]/)
  assert.match(designOnly, /\[`bva\.md`\]/)
  assert.match(designOnly, /\[`card\/card-format\.md`\]/)
  assert.match(designOnly, /10\. \[`card\/confirmation-lock\.md`\]/)
  assert.match(designOnly, /lane 헤더의 `risk`를 여기서 확정한다/)
  assert.match(delivery, /\[`delivery\/ledger\.md`\][\s\S]*\[`delivery\/red\.md`\][^\n]*를\n?\s*읽는다/)

  // 카탈로그 섹션은 실행 순서를 소유하지 않는다
  assert.match(skill, /「모드 선택」의 각 단계에 인라인된 읽기 지시가 실행\s*\n?순서를 소유하며/)
})
