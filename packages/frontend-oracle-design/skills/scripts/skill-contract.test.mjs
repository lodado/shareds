import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
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
const FRONTEND_NODE_FILES = [
  'references/frontend/decisions.md',
  'references/frontend/authoring.md',
  'references/frontend/quality.md',
]
const TYPES_NODE_FILES = [
  'references/types/state-ladder.md',
  'references/types/authoring.md',
  'references/types/api-surface.md',
  'references/types/advanced-contracts.md',
  'references/types/review-criteria.md',
]
const ADVANCED_TYPES_LOAD_CONDITION =
  'always with state-ladder during type work — loading unconditional, adoption via compiler witness packet gate'

async function readAll(relativePaths) {
  const parts = await Promise.all(relativePaths.map(read))
  return parts.join('\n')
}

const REVIEW_NODE_FILES = ['references/subagent-review.md', 'references/review-checklist.md']

const readCard = () => readAll(CARD_NODE_FILES)
const readReview = () => readAll(REVIEW_NODE_FILES)
const readDelivery = () => readAll(DELIVERY_NODE_FILES)
const readTypes = () => readAll(TYPES_NODE_FILES)
const readFrontend = () => readAll(FRONTEND_NODE_FILES)

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

  assert.match(skill, /explicitly requested.*`\$agent-graph-engineering`.*graph-orchestration\.md/s)
  assert.doesNotMatch(skill, /\.ai\/agent-graphs\/<oracle-id>\/graph\.json/)
  assert.match(
    graphOrchestration,
    /명시적으로 요청한 경우에만 설치된\s*`\$agent-graph-engineering`을 이름으로 명시적으로 로드·호출/,
  )
  assert.match(graphOrchestration, /subagent 위임을 강제하지 않으며\s*agent 재량 선택만 허용한다/)
  assert.match(graphOrchestration, /\.ai\/agent-graphs\/<oracle-id>\/graph\.json/)
  assert.match(graphOrchestration, /graph-verify\.mjs next/)
  assert.equal(graph.entry, 'draft-oracle')
  assert.deepEqual(graph.terminals, [
    'oracle-ready',
    'implemented-green',
    'review-verified',
    'run-stopped',
    'pre-ledger-stop',
    'cancelled',
  ])
  assert.equal(graph.nodes.length, 19)
  assert.equal(verified.status, 0, verified.stderr)
  assert.equal(verified.stdout, 'GRAPH_VALID frontend-oracle-design\n')
})

test('routes already-satisfied red, standard one-review and high two-review paths to declared edges', async () => {
  const { selectTransitions } = await import(
    '../../../agent-graph-engineering/skills/agent-graph-engineering/scripts/graph-verify.mjs'
  )
  const graph = JSON.parse(await read('references/oracle-workflow.graph.json'))
  const node = (id) => graph.nodes.find((candidate) => candidate.id === id)

  assert.deepEqual(selectTransitions(graph, 'valid-red', { classification: 'ALREADY_SATISFIED' }), ['implement-green'])
  assert.throws(
    () => selectTransitions(graph, 'valid-red', { classification: 'INVALID_RED' }),
    /NO_TRANSITION|matches no edge/,
  )
  assert.deepEqual(selectTransitions(graph, 'review-dispatch', { classification: 'STANDARD' }), ['primary-review'])
  assert.deepEqual(selectTransitions(graph, 'review-dispatch', { classification: 'HIGH' }), [
    'primary-review',
    'secondary-review',
  ])
  assert.deepEqual(selectTransitions(graph, 'primary-review', { classification: 'STANDARD_READY' }), [
    'review-finalize',
  ])
  assert.deepEqual(selectTransitions(graph, 'primary-review', { classification: 'STANDARD_BLOCKED' }), [
    'evidence-repair',
  ])
  assert.deepEqual(selectTransitions(graph, 'primary-review', { classification: 'HIGH_BLOCKED' }), ['high-review-join'])
  assert.deepEqual(selectTransitions(graph, 'secondary-review', { classification: 'HIGH_BLOCKED' }), [
    'high-review-join',
  ])
  assert.deepEqual(selectTransitions(graph, 'draft-oracle', { classification: 'FAIL' }), ['pre-ledger-stop'])
  assert.deepEqual(selectTransitions(graph, 'primary-review', { classification: 'FAIL' }), ['run-stopped'])

  assert.deepEqual(node('implement-green').kind, 'agent')
  assert.deepEqual(node('implement-green').output, ['classification', 'runId', 'artifacts', 'decision', 'error'])
  assert.deepEqual(node('review-dispatch').output, [
    'status',
    'classification',
    'reviewPacket',
    'reviewAssignments',
    'reviewDispatches',
    'runId',
    'decision',
    'error',
  ])
  assert.equal(node('review-dispatch').dispatch, 'all')
  assert.deepEqual(selectTransitions(graph, 'review-dispatch', { classification: 'FAIL' }), ['run-stopped'])
  assert.deepEqual(node('primary-review').output, [
    'classification',
    'findings',
    'findingsA',
    'runId',
    'decision',
    'error',
  ])
  assert.deepEqual(node('secondary-review').output, ['classification', 'findingsB', 'runId', 'decision', 'error'])
  assert.deepEqual(node('high-review-join').input, [
    'findingsA',
    'findingsB',
    'reviewPacket',
    'reviewAssignments',
    'reviewDispatches',
    'runId',
  ])
  assert.deepEqual(node('high-review-join').output, [
    'status',
    'classification',
    'findings',
    'reviewReceiptA',
    'reviewReceiptB',
    'runId',
    'decision',
    'error',
  ])
  assert.deepEqual(selectTransitions(graph, 'high-review-join', { status: 'BLOCKED' }), ['evidence-repair'])
  assert.deepEqual(selectTransitions(graph, 'high-review-join', { classification: 'FAIL' }), ['run-stopped'])
  assert.match(node('review-dispatch').task, /STANDARD.*primary assignment.*HIGH.*primary.*secondary/s)
  assert.match(node('high-review-join').task, /oracle-run\.mjs review-receipt/)
  assert.match(
    node('high-review-join').task,
    /packetSha256.*targetRevision.*previousDigest.*digest.*adapter node-test.*oracleSha256/s,
  )
  assert.deepEqual(node('review-finalize').input.slice(-2), ['reviewReceiptA', 'reviewReceiptB'])
  assert.match(node('review-finalize').task, /standard finding.*oracle-run\.mjs review-receipt/s)
  assert.match(node('review-finalize').task, /REVIEW_ACCEPTED.*REVIEW_VERIFIED/s)

  for (const source of graph.nodes.filter((candidate) => candidate.output?.includes('classification'))) {
    if (!/\bFAIL\b/.test(source.task)) continue
    const [targetId] = selectTransitions(graph, source.id, { classification: 'FAIL' })
    const target = node(targetId)
    assert.equal(target.kind, 'terminal', `${source.id} FAIL must route to a terminal`)
    assert.deepEqual(
      target.input.every((field) => source.output.includes(field)),
      true,
      source.id,
    )
  }
})

test('owns repeated failure routes with fallback rules that node edges still override', async () => {
  const { selectTransitions } = await import(
    '../../../agent-graph-engineering/skills/agent-graph-engineering/scripts/graph-verify.mjs'
  )
  const graph = JSON.parse(await read('references/oracle-workflow.graph.json'))

  assert.deepEqual(
    graph.fallback.map(({ when, to }) => [when.equals, to]),
    [
      ['POLICY_GAP', 'run-stopped'],
      ['FAIL', 'run-stopped'],
      ['PRODUCT_DEFECT', 'implement-green'],
      ['EVIDENCE_GAP', 'evidence-repair'],
      ['HARNESS_DEFECT', 'evidence-repair'],
    ],
  )
  // valid-red keeps its HARNESS_DEFECT self-loop as a node edge that beats the fallback rule.
  assert.deepEqual(selectTransitions(graph, 'valid-red', { classification: 'HARNESS_DEFECT' }), ['valid-red'])
  assert.deepEqual(selectTransitions(graph, 'review-finalize', { classification: 'HARNESS_DEFECT' }), [
    'evidence-repair',
  ])
  assert.deepEqual(selectTransitions(graph, 'implement-green', { classification: 'PRODUCT_DEFECT' }), [
    'implement-green',
  ])
  assert.deepEqual(selectTransitions(graph, 'draft-oracle', { classification: 'FAIL' }), ['pre-ledger-stop'])
  assert.deepEqual(selectTransitions(graph, 'delivery-init', { classification: 'FAIL' }), ['run-stopped'])

  // ENVIRONMENT_DEFECT and NON_ORACLE_OPINION stay finding classifications but are not graph labels:
  // nodes report FAIL with the reason in the ledger, and review-finalize normalizes opinion-only
  // verdicts to REVIEW_ACCEPTED, so an unnormalized output fails loudly instead of routing.
  for (const source of graph.nodes) {
    for (const label of ['ENVIRONMENT_DEFECT', 'NON_ORACLE_OPINION']) {
      assert.doesNotMatch(source.task, new RegExp(`${label}(?!만)`))
    }
  }
  assert.throws(
    () => selectTransitions(graph, 'delivery-init', { classification: 'ENVIRONMENT_DEFECT' }),
    /NO_TRANSITION|matches no edge/,
  )
})

test('O12: workflow graph records transitions and preserves decision and failure payloads', async () => {
  const { selectTransitions } = await import(
    '../../../agent-graph-engineering/skills/agent-graph-engineering/scripts/graph-verify.mjs'
  )
  const graph = JSON.parse(await read('references/oracle-workflow.graph.json'))
  const node = (id) => graph.nodes.find((candidate) => candidate.id === id)
  const edge = (from, to, equals) =>
    graph.edges.find(
      (candidate) =>
        candidate.from === from &&
        candidate.to === to &&
        candidate.when?.field === 'classification' &&
        candidate.when.equals === equals,
    )

  for (const [source, target, classification] of [
    ['valid-red', 'implement-green', 'VALID_RED'],
    ['implement-green', 'review-dispatch', 'IMPLEMENTED_GREEN_STANDARD'],
    ['implement-green', 'review-dispatch', 'IMPLEMENTED_GREEN_HIGH'],
  ]) {
    assert.match(node(source).task, new RegExp(`oracle-run\\.mjs transition[^.]*${classification}`))
    assert.ok(edge(source, target, classification))
  }

  assert.match(node('valid-red').task, /ALREADY_SATISFIED[^.]*production[^.]*수정하지 않는다/)
  assert.match(node('implement-green').task, /ALREADY_SATISFIED[^.]*production[^.]*수정하지 않는다/)
  assert.match(node('implement-green').task, /visual[^.]*pending[^.]*IMPLEMENTED_GREEN/)
  assert.match(node('implement-green').task, /IMPLEMENTED_GREEN[^.]*resume/)
  assert.match(node('implement-green').task, /IMPLEMENTED_GREEN을 정확히 한 번/)
  assert.deepEqual(selectTransitions(graph, 'draft-oracle', { classification: 'POLICY_GAP' }), ['pre-ledger-stop'])
  assert.deepEqual(selectTransitions(graph, 'lock-oracle', { classification: 'POLICY_GAP' }), ['pre-ledger-stop'])
  assert.deepEqual(node('pre-ledger-stop').input, ['classification', 'decision', 'error'])
  assert.deepEqual(selectTransitions(graph, 'draft-oracle', { classification: 'RESUME_IMPLEMENTED_GREEN' }), [
    'resume-implemented-green',
  ])
  assert.deepEqual(selectTransitions(graph, 'resume-implemented-green', { classification: 'RESUME_STANDARD' }), [
    'review-dispatch',
  ])
  assert.deepEqual(selectTransitions(graph, 'resume-implemented-green', { classification: 'RESUME_HIGH' }), [
    'review-dispatch',
  ])
  assert.match(node('resume-implemented-green').task, /IMPLEMENTED_GREEN 전이를 다시 기록하지 않는다/)
  assert.match(node('resume-implemented-green').task, /oracle-run --adapter node-test.*Playwright.*schema-v3/s)

  const policyGapSources = graph.nodes.filter(
    (candidate) => candidate.output?.includes('classification') && /\bPOLICY_GAP\b/.test(candidate.task),
  )
  for (const source of policyGapSources) {
    assert.ok(source.output.includes('decision'), `${source.id} POLICY_GAP must preserve its decision evidence`)
    assert.ok(source.output.includes('error'), `${source.id} POLICY_GAP/FAIL must preserve its error evidence`)
    const expected = ['draft-oracle', 'lock-oracle'].includes(source.id) ? ['pre-ledger-stop'] : ['run-stopped']
    assert.deepEqual(selectTransitions(graph, source.id, { classification: 'POLICY_GAP' }), expected)
  }
  assert.deepEqual(node('run-stopped').input, ['classification', 'runId', 'decision', 'error'])

  assert.deepEqual(selectTransitions(graph, 'draft-oracle', { classification: 'FAIL' }), ['pre-ledger-stop'])
  assert.deepEqual(node('draft-oracle').output.includes('error'), true)
  assert.deepEqual(node('pre-ledger-stop').input, ['classification', 'decision', 'error'])
  assert.deepEqual(node('run-stopped').input, ['classification', 'runId', 'decision', 'error'])
})

test('O14: harness packages expose lint and provenance captures reproducibility inputs', async () => {
  const repositoryDirectory = join(skillDirectory, '../../..')
  const [rootPackageSource, oraclePackageSource, visualPackageSource, turboSource, runnerSource] = await Promise.all([
    readFile(join(repositoryDirectory, 'package.json'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/frontend-oracle-design/package.json'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/frontend-visual-qa/package.json'), 'utf8'),
    readFile(join(repositoryDirectory, 'turbo.json'), 'utf8'),
    read('scripts/oracle-run.mjs'),
  ])
  const rootPackage = JSON.parse(rootPackageSource)
  const oraclePackage = JSON.parse(oraclePackageSource)
  const visualPackage = JSON.parse(visualPackageSource)
  const turbo = JSON.parse(turboSource)

  for (const pkg of [oraclePackage, visualPackage]) {
    assert.equal(typeof pkg.scripts.lint, 'string')
    assert.notEqual(pkg.scripts.lint.trim(), '')
  }
  assert.equal(rootPackage.scripts.lint, 'turbo run lint')
  assert.ok(turbo.tasks.lint)
  assert.match(rootPackage.engines.node, /(?:\^|>=)\d+\.\d+\.\d+/)

  for (const field of ['commit', 'dirty', 'lockfile', 'packageManager', 'runtimeContextSha256']) {
    assert.match(runnerSource, new RegExp(`\\b${field}\\b`), `runner provenance must record ${field}`)
  }
})

test('O26: backs reported verification with a run ledger, machine transitions and counted budgets', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /scripts\/oracle-run\.mjs exec/)
  assert.match(skill, /append-only ledger and reports cite runIds instead of free-form claims/)
  assert.match(skill, /Never report an execution\s+that is not in the ledger as passing/)
  assert.match(skill, /recorded only via `scripts\/oracle-run\.mjs transition`/)
  assert.match(skill, /counted by `oracle-run\.mjs budget`/)
  assert.match(skill, /checked against actual run results with `scripts\/oracle-verify\.mjs evidence`/)
  assert.match(skill, /runs: cited ledger runIds/)
  assert.match(skill, /State machine: recorded transitions and last state/)
})

test('O27: lints the card structure and initializes run artifacts around the lock', async () => {
  const oracleCard = await readCard()

  assert.match(oracleCard, /oracle-verify\.mjs card/)
  assert.match(oracleCard, /CARD_LINT_FAILED/)
  assert.match(oracleCard, /auto-added TC/i)
  assert.match(oracleCard, /User Confirmation/)
  assert.match(oracleCard, /Draft Oracle/)
  assert.match(oracleCard, /new card.*revision.*user.*confirm/is)
  assert.match(oracleCard, /policy ID.*row ID.*bidirectional/is)
  assert.match(oracleCard, /oracle-run\.mjs init/)
  assert.match(oracleCard, /--required-label/)
  assert.match(oracleCard, /--harness-path/)
  assert.match(oracleCard, /--milestone/)
  assert.match(oracleCard, /exact relative\s+file path from the scan root/)
  assert.match(oracleCard, /run-state\.json/)
  assert.match(oracleCard, /runs\.jsonl/)
  assert.match(oracleCard, /`init` fails when the state file already exists/)
  assert.match(oracleCard, /`oracle-verify\.mjs card` lint and the revision lock verification pass/)
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
  assert.match(implementationLoop, /Low 1, Medium 2, High 3/)
  assert.match(implementationLoop, /TEST_WEAKENED/)
  assert.match(implementationLoop, /ENV_DRIFT/)
  assert.match(implementationLoop, /evidence\.json/)
  assert.match(implementationLoop, /oracle-verify\.mjs red/)
  assert.match(implementationLoop, /EVIDENCE_REQUIRED/)
  assert.match(implementationLoop, /REQUIRED_RUN_MISSING/)
  assert.match(implementationLoop, /oracle-verify\.mjs review/)
  assert.match(implementationLoop, /oracle-verify\.mjs evidence-scaffold/)
  assert.match(implementationLoop, /EVIDENCE_NOT_IN_RUN/)
  assert.match(implementationLoop, /EVIDENCE_UNVERIFIABLE/)
  assert.match(implementationLoop, /oracle-verify\.mjs scan/)
  assert.match(implementationLoop, /oracle:nondeterminism/)
  assert.match(implementationLoop, /Reporting a run that did not go through the ledger as evidence/)
  assert.match(implementationLoop, /--mutation-run/)
  assert.match(implementationLoop, /--mutation-row/)
  assert.match(implementationLoop, /MUTATION_EVIDENCE_REQUIRED/)
})

test('keeps automatic routing narrow and leaves sibling concerns with their owners', async () => {
  const skill = await read('SKILL.md')
  const description = skill.match(/^description: ([^\n]+)$/m)?.[1] ?? ''

  assert.match(description, /medium|high/i)
  assert.match(description, /Do not auto-invoke/i)
  assert.match(description, /low-risk/i)
  assert.match(skill, /Low fast path.*loads no other reference nodes/s)
  assert.match(skill, /Oracle.*Outcome Brief.*Source Registry.*lock.*state transitions/s)
  assert.match(skill, /FSD.*do\s+not auto-invoke this skill on its own/s)
})

test('O29: gives reviewers raw run evidence and a validated finding schema', async () => {
  const subagentReview = await readReview()

  assert.match(subagentReview, /ledger\s*runId/)
  assert.match(subagentReview, /oracle-verify\.mjs findings/)
  assert.match(subagentReview, /--intersect/)
  assert.match(subagentReview, /\*\*two independent reviews with the same input\*\*/)
  assert.match(subagentReview, /critical.*high.*single.*blocking/s)
  assert.match(subagentReview, /medium.*low.*intersection/s)
  assert.match(subagentReview, /FINDINGS_INVALID/)
  assert.match(subagentReview, /does not cite a card row is demoted to `NON_ORACLE_OPINION`/)
  assert.match(subagentReview, /critical\/high finding\s+without a row.*stays\s+blocking/s)
  assert.match(subagentReview, /grade `reported`/)
})

test('O30: delegates screenshot and direct-browser execution to a separate skill', async () => {
  const [skill, visualDesign] = await Promise.all([read('SKILL.md'), read('references/visual-design.md')])

  assert.match(skill, /\$frontend-visual-qa/)
  assert.match(skill, /run only on explicit request.*by name/s)
  assert.match(visualDesign, /\$frontend-visual-qa/)
  assert.match(visualDesign, /screenshot.*직접 브라우저.*소유/s)
  assert.doesNotMatch(skill, /BROWSER_VERIFIED/)
})

test('requires automatic deterministic locking at delivery boundaries', async () => {
  const [skill, oracleCard] = await Promise.all([read('SKILL.md'), readCard()])

  assert.match(skill, /scripts\/oracle-lock\.mjs/)
  assert.match(skill, /revision lock is auto-verified immediately before each stage/)
  assert.match(oracleCard, /\.ai\/oracles\/<oracle-id>/)
  assert.match(oracleCard, /does not ask the user to run the command/)
  assert.match(oracleCard, /ORACLE_CHANGED/)
  assert.match(oracleCard, /SOURCE_CHANGED/)
  assert.match(oracleCard, /LOCK_INVALID/)
})

test('locks all approved Delivery sources once instead of extending an existing lock', async () => {
  const [skill, oracleCard, implementationLoop] = await Promise.all([read('SKILL.md'), readCard(), readDelivery()])

  assert.match(skill, /Delivery was known from the start, defer the\s+lock/)
  assert.match(skill, /architecture.*backend.*final lock once/s)
  assert.match(oracleCard, /Design-only.*Delivery.*new revision/s)
  assert.match(implementationLoop, /create the final lock\s+once/)
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
    readReview(),
  ])

  assert.match(skill, /\$frontend-visual-qa/)
  assert.doesNotMatch(skill, /browser-verification\.md|BROWSER_VERIFIED|브라우저 검증·자가개선/)
  assert.doesNotMatch(implementationLoop, /browser scenario|BROWSER_VERIFIED/)
  assert.match(subagentReview, /Oracle SHA-256/)
  assert.match(subagentReview, /last verify/)
  assert.match(subagentReview, /NON_ORACLE_OPINION/)
  await assert.rejects(read('references/browser-verification.md'), { code: 'ENOENT' })
})

test('generates reviewer input from raw locked artifacts without a hand-written conclusion', async () => {
  const [skill, subagentReview] = await Promise.all([read('SKILL.md'), readReview()])

  assert.match(skill, /oracle-run\.mjs review-packet/)
  assert.match(subagentReview, /oracle-run\.mjs review-packet/)
  assert.match(subagentReview, /review-input\.json/)
  assert.match(subagentReview, /lock manifest.*run state.*ledger.*evidence mapping.*git/s)
  assert.match(subagentReview, /Do not fix the packet by hand/)
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

  assert.equal(version, '0.30.0')
  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(JSON.parse(codexPluginJson).version, version)
  assert.equal(marketplaceVersion, version)
  assert.equal(marketplace.version, '0.30.0')
})

test('separates requested mechanism from intended outcome without letting the agent shrink scope', async () => {
  const oracleCard = await readCard()

  assert.match(oracleCard, /Requested mechanism check — separating mechanism from outcome/)
  assert.match(oracleCard, /Intended outcome/)
  assert.match(oracleCard, /Smallest reversible scope/)
  assert.match(oracleCard, /Deferred scope.*Non-goals/s)
  assert.match(oracleCard, /Scope reduction is finalized only by/)
  assert.match(oracleCard, /grounds for skipping a `mandatory-constraint`/)
  assert.match(oracleCard, /the requested mechanism is the smallest one that achieves the intended outcome/)
})

test('loads the performance reference only for measured performance claims', async () => {
  const [skill, performance, frontendImplementation] = await Promise.all([
    read('SKILL.md'),
    read('references/performance.md'),
    readFrontend(),
  ])

  assert.match(skill, /references\/performance\.md/)
  assert.match(skill, /performance requirement or improvement claim/)
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
  assert.match(performance, /frontend\/quality\.md/)
  assert.match(performance, /frontend\/decisions\.md/)
  assert.match(frontendImplementation, /performance\.md/)
})

test('records new dependency decisions and reviews them against real problems and context', async () => {
  const [implementationLoop, subagentReview] = await Promise.all([readDelivery(), readReview()])

  assert.match(implementationLoop, /- Dependency: .*framework\/library/)
  assert.match(implementationLoop, /cost and removal path; if none, N\/A/)
  assert.match(subagentReview, /Why was a new dependency·framework introduced\?/)
  assert.match(subagentReview, /rather than the technology name·popularity/)
  assert.match(subagentReview, /navigation·persistence·permission·payment·cross-unit/)
  assert.match(subagentReview, /actual route·user journey/)
})

test('reuses the repository network boundary and colocates approved MSW handlers', async () => {
  const [skill, implementationLoop, fsd] = await Promise.all([
    read('SKILL.md'),
    readDelivery(),
    read('references/fsd.md'),
  ])

  assert.match(skill, /network test boundary the repo already uses/)
  assert.match(skill, /MSW is installed or its adoption is\s+approved/)
  assert.match(skill, /at the nearest owner/)
  assert.match(implementationLoop, /prefer the test boundary the repo already uses/)
  assert.match(implementationLoop, /quietly add a dependency/i)
  assert.match(implementationLoop, /fsd\.md/)
  assert.match(fsd, /<slice>\/api\/__mocks__\//)
  assert.match(fsd, /<slice>\/__mocks__\//)
})

test('explicitly invokes $test before writing frontend tests', async () => {
  const [skill, implementationLoop] = await Promise.all([read('SKILL.md'), readDelivery()])

  assert.match(skill, /Immediately before writing test files, explicitly load and invoke the\s+`\$test` skill by name/)
  assert.match(skill, /Invoke the `\$test` skill explicitly right before writing test files/)
  assert.match(
    implementationLoop,
    /Immediately before writing a test file, explicitly load and invoke the installed `\$test` skill/,
  )
  assert.match(implementationLoop, /Do not substitute merely\s+referring to the file/)
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

  assert.match(implementationLoop, /read-only.*parallel/s)
  assert.match(implementationLoop, /create the final lock\s+once/)
  assert.match(implementationLoop, /Production is not modified before `VALID_RED`/)
  assert.match(implementationLoop, /does not force whether the subsequent.*current agent, delegated, or parallelized/s)
  assert.equal(implementationNode.kind, 'agent')
  assert.equal(implementationNode.owner, 'executor')
  assert.match(implementationNode.task, /단일·위임·병렬 구현 방식을 강제하지 않는다/)
  assert.match(implementationLoop, /targeted GREEN once/)
  assert.match(implementationLoop, /root test.*lint.*format.*independent review.*parallel/s)
  assert.match(implementationLoop, /all results.*join.*final verify/s)
})

test('defines the FSD contract and wires it through loading, architecture, implementation, and review', async () => {
  const [skill, fsd, architectureContract, frontendImplementation, subagentReview, backend] = await Promise.all([
    read('SKILL.md'),
    read('references/fsd.md'),
    read('references/architecture-contract.md'),
    readFrontend(),
    readReview(),
    read('references/backend.md'),
  ])

  assert.match(skill, /references\/fsd\.md/)
  assert.match(skill, /Feature-Sliced Design/)
  assert.match(skill, /before proposing, designing, or reviewing/)
  assert.match(skill, /load and invoke the installed `\$test` skill\s+by name/)
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
    readFrontend(),
    readReview(),
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
  assert.match(subagentReview, /micro-hook.*UI.*business logic/s)
  assert.match(subagentReview, /trivial wrapper.*giant hook/s)
  assert.doesNotMatch(subagentReview, /lint|hook-encapsulation|eslint-disable/)
})

test('keeps Oracle control while consuming optional system-design references', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /frontend-system-design/)
  assert.match(skill, /while keeping Oracle\s+intake and control/)
  assert.match(skill, /Every choice is a policy candidate/)
  assert.match(skill, /POLICY_GAP.*NEEDS_DECISION/s)
  assert.match(skill, /implementation options and never precede Oracle's orchestration/)
  assert.doesNotMatch(skill, /references\/(infinite-scroll|search-typeahead)\.md/)
})

test('loads visual design guidance only for UI-shaping work and carries its contract through delivery', async () => {
  const [skill, visualDesign, oracleCard, frontendImplementation, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/visual-design.md'),
    readCard(),
    readFrontend(),
    readReview(),
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
  assert.match(subagentReview, /sourced aesthetic requirement/)
  assert.match(subagentReview, /Design Change\s+Confirmation/)
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
  const [visualDesign, subagentReview] = await Promise.all([read('references/visual-design.md'), readReview()])

  assert.match(visualDesign, /`JUDGMENT`.*`designer`/s)
  assert.match(subagentReview, /`JUDGMENT` rows.*checked against/s)
  assert.match(subagentReview, /\$frontend-visual-qa.*artifact/s)
})

test('O1-O7: loads one detailed changeability reference before implementation decisions', async () => {
  const [skill, changeability, frontendImplementation, implementationLoop] = await Promise.all([
    read('SKILL.md'),
    read('references/changeability.md'),
    readFrontend(),
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
  assert.match(changeability, /미래 가능성만으로\s*단일 runtime에 adapter를 추가하지 않는다/)
  assert.match(changeability, /hook.*반환.*대상 레포.*관례/is)
  assert.doesNotMatch(changeability, /^## React 구현 교차 점검$/m)
  assert.doesNotMatch(changeability, /^## Implementation Decision 형식$/m)
  assert.doesNotMatch(changeability, /^## Reviewer 판정과 최소 수정$/m)
  assert.match(changeability, /frontend\/decisions\.md/)
  assert.match(changeability, /frontend\/authoring\.md/)
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
  const [changeability, subagentReview] = await Promise.all([read('references/changeability.md'), readReview()])

  for (const term of ['Readability', 'Predictability', 'Cohesion', 'Coupling', 'Simplicity']) {
    assert.match(changeability, new RegExp(`## ${term}`))
  }

  assert.match(subagentReview, /changeability\.md/)
  assert.match(subagentReview, /implementation-decision\.md/)
  assert.match(subagentReview, /review-packet[\s\S]*--decision/)
  assert.match(subagentReview, /changeabilityReview/)
  assert.match(subagentReview, /PASS\s*\|\s*FINDING\s*\|\s*N\/A/)
  assert.match(subagentReview, /hidden side effect/i)
  assert.match(subagentReview, /PRODUCT_DEFECT/)
  assert.match(subagentReview, /EVIDENCE_GAP/)
  assert.match(subagentReview, /POLICY_GAP/)
  assert.match(subagentReview, /NON_ORACLE_OPINION/)
  assert.match(subagentReview, /Decision Falsification Questions — Applicable Items Only/)
  for (const question of [
    'Why was the change taken to this scope',
    'Why is this state owned by a local or global owner',
    'If the requirement changes, where is it modified and how far does it propagate',
    'Why is this component·abstraction shared',
    'Why was the duplication left in',
    'Why is the complexity of this type·state model necessary',
    'Which errors does this boundary recover and what does it propagate upward',
    'Which contracts were not verified and why were they excluded',
    'Are there grounds for the performance problem or improvement claim',
    'What is the next priority',
  ]) {
    assert.match(subagentReview, new RegExp(question.replaceAll('?', '\\?')))
  }
  assert.match(subagentReview, /writing quality alone/)
  assert.match(subagentReview, /full refactor/i)
  assert.match(subagentReview, /minimal fix/i)
})

test('O2: 기존 Oracle Delivery gate를 유지한다', async () => {
  const [skill, oracleCard, implementationLoop] = await Promise.all([read('SKILL.md'), readCard(), readDelivery()])

  for (const contract of ['VALID_RED', 'oracle-lock.mjs', 'oracle-run.mjs', 'evidence.json']) {
    assert.match(`${skill}\n${oracleCard}\n${implementationLoop}`, new RegExp(contract.replace('.', '\\.')))
  }
})

test('pins document-driven stage journal and disk recall', async () => {
  const [skill, oracleCard] = await Promise.all([read('SKILL.md'), readCard()])

  assert.match(skill, /### Document-driven progress/)
  assert.match(skill, /re-read disk, not conversation memory/)
  assert.match(skill, /journal\.md.*append-only/s)
  assert.match(skill, /not duplicated into `implementation-decision\.md`/)
  assert.match(skill, /neither a\s+policy source nor a lock target.*card wins/s)
  assert.match(oracleCard, /journal\.md.*append/s)
  assert.match(oracleCard, /Do not leave answers only in the\s*conversation/)
  assert.match(oracleCard, /one-line format/)
  assert.match(oracleCard, /→ answer:.*→ adopted:.*→ rows:/)
  assert.match(oracleCard, /`journal\.md` is the exception/)
})

test('pins the system-design grill phases and the conditional API contract format', async () => {
  const [skill, oracleCard, architectureContract] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    read('references/architecture-contract.md'),
  ])

  assert.match(skill, /phase order.*one-question-at-a-time/s)
  assert.match(oracleCard, /an earlier answer kills a later branch/)
  assert.match(oracleCard, /3~5 per round, at most 2 rounds/)
  assert.match(oracleCard, /5 or fewer surviving questions remain after pruning, bundle the two rounds/)
  assert.match(oracleCard, /RADIO framework/)
  assert.match(oracleCard, /Example Mapping/)
  assert.match(oracleCard, /frontend-system-design.*into P4·P5 questions/s)
  assert.match(oracleCard, /one-question-at-a-time\s*interview.*without a round cap/s)
  assert.match(oracleCard, /Policy questions during Delivery still follow the 2 rounds of\s*`oracle-run\.mjs budget`/)
  assert.match(architectureContract, /## API contract/)
  assert.match(architectureContract, /Request parameters/)
  assert.match(architectureContract, /Request body/)
  assert.match(architectureContract, /Error codes/)
  assert.match(architectureContract, /O\*.*행에 매핑되지 않은.*POLICY_GAP/s)
  assert.match(architectureContract, /rfc9457/)
  assert.match(architectureContract, /idempotent_requests/)
  assert.match(architectureContract, /next_page_token/)
  assert.match(architectureContract, /카탈로그를 만들지 않는다/)
  assert.match(oracleCard, /Where each RADIO element is handled/)
  assert.match(oracleCard, /platform·device·offline·multilingual/)
  assert.match(oracleCard, /derive a draft schema from\s*the card rows/)
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
    readFrontend(),
    readDelivery(),
    read('references/architecture-contract.md'),
    readReview(),
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
  assert.match(skill, /Outcome: Actor\/context/)
  assert.match(skill, /Evidence appendix:/)
})

test('O8: 카드 schema version 분기와 migration을 추가하지 않는다', async () => {
  const [oracleCard, verifier] = await Promise.all([readCard(), read('scripts/oracle-verify.mjs')])

  assert.doesNotMatch(oracleCard, /Oracle-Card-Version/)
  assert.doesNotMatch(verifier, /ORACLE_CARD_VERSION|cardSchemaVersion/)
})

test('type-constraints: derives state contracts from card rows and narrows AI choice space', async () => {
  const [skill, oracleCard, frontendImplementation, typeConstraints, verifier] = await Promise.all([
    read('SKILL.md'),
    readCard(),
    readFrontend(),
    readTypes(),
    read('scripts/oracle-verify.mjs'),
  ])

  // State Model은 선택 섹션이다 — 부재를 lint로 강제하지 않고, 있을 때만 구조를 검증한다
  assert.doesNotMatch(verifier, /state-model-missing/)
  assert.doesNotMatch(verifier, /ASYNC_STATE_TOKENS/)
  assert.match(verifier, /state-model-row-unlinked/)
  assert.match(verifier, /state-model-row-unknown/)

  assert.match(skill, /references\/types\/state-ladder\.md/)
  assert.match(skill, /client\s+state·exported Props/)
  assert.match(skill, /shared\/package API·trust boundary/)
  assert.doesNotMatch(skill, /state-modeling\.md/)
  assert.match(skill, /existing query·router·form owns the state, do not create a new `status` union/)
  assert.match(oracleCard, /## State Model/)
  assert.match(oracleCard, /State Model — optional/)
  assert.match(oracleCard, /lint does not block on a missing section/)
  assert.match(oracleCard, /transition without a reference is an invented policy/)
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

  // 과잉 타이핑도 미달만큼 FINDING이다 — 열린 key, 태그만 있는 union, 경계 밖 스키마
  assert.match(typeConstraints, /ID·브랜드 문자열처럼 열린 도메인이면/)
  assert.match(typeConstraints, /discriminant는 갈라지는 데이터가 있을 때 붙인다/)
  // 예시 하나만 있으면 그 모양이 기본값이 된다 — object union 옆에 literal union 대조쌍 유지
  assert.match(typeConstraints, /type PaymentBadge = 'unpaid' \| 'paid' \| 'refunded'/)
  assert.match(typeConstraints, /위 두 예시 중 무엇을 베낄지 먼저 판정한다/)
  assert.match(typeConstraints, /스키마는 경계에만 만든다/)
  assert.match(typeConstraints, /규칙을 코드 주석으로 옮기지 않는다/)
  assert.match(typeConstraints, /key는 \*\*분기하는 union 그 자체\*\*다/)
  assert.match(typeConstraints, /라벨 맵이 필요하다는 사실은 태그 객체를 만들 근거가 아니다/)
  assert.match(typeConstraints, /\*\*행 하나가 상태 하나가 아니다\.\*\*/)
  assert.match(typeConstraints, /필드도 같은 규칙이다/)
})

test('type-environment: pins compiler environment once per repo and protects contract files', async () => {
  const [skill, typeConstraints, typeEnvironment] = await Promise.all([
    read('SKILL.md'),
    readTypes(),
    read('references/type-environment.md'),
  ])

  // 셋업 시 1회 로딩 — 매 카드마다 반복하지 않는다
  assert.match(skill, /references\/type-environment\.md/)
  assert.match(skill, /Once per\s+repo/)
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
    readFrontend(),
    readTypes(),
    readReview(),
  ])

  assert.match(typeConstraints, /로딩·로드 실패의 기본은 컴포넌트 분기가 아니라 경계다/)
  assert.match(typeConstraints, /frontend\/decisions\.md.*3절이 소유/s)
  assert.doesNotMatch(typeConstraints, /경계로 올려 컴포넌트에서 제거할 수 있고/)
  assert.match(typeConstraints, /무조건 실행되는 첫 조회의 loading·error를 경계로 올리지 않고/)

  assert.match(frontendImplementation, /경계로 올릴 수 있는 분기를 컴포넌트 안에 남기지 않는다/)
  assert.match(frontendImplementation, /startTransition/)
  assert.match(frontendImplementation, /throwOnError.*data 부재 조건으로 좁혀/s)

  assert.match(subagentReview, /types\/review-criteria\.md/)
})

test('reads load conditions at the decision point, not at the write stage', async () => {
  const [skill, typeConstraints, graphSource] = await Promise.all([
    read('SKILL.md'),
    readTypes(),
    read('references/reference-graph.json'),
  ])
  const graph = JSON.parse(graphSource)
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))

  // 범용 규칙 하나가 모든 노드의 when 해석을 소유한다
  assert.match(graph.entryContract.loadConditionRule, /산출물 시점이 아니라 결정 시점/)
  assert.match(graph.entryContract.loadConditionRule, /애매하면 로드한다/)
  assert.match(graph.entryContract.loadConditionRule, /로드를 건너뛸지는 판정 대상이 아니다/)
  assert.match(skill, /Read\s+`when` as the decision point, not the deliverable stage/)
  assert.match(skill, /If applicability is ambiguous, load\./)

  // 설계 단계에 필요한 노드를 쓰기 단계에만 gate하지 않는다 — 이전 실패 모드
  for (const id of ['frontend-decisions', 'frontend-authoring', 'changeability', 'fsd']) {
    assert.doesNotMatch(
      byId.get(id).when,
      /^(Delivery|production|VALID_RED)/,
      `${id} must not gate solely on the write stage`,
    )
  }

  // 판정표는 requires 엣지로 딸려온다 — 조건 해석 여지 자체를 없앤다
  assert.ok(byId.get('types-state-ladder').requires.includes('frontend-decisions'))
  assert.match(skill, /state-ladder\.md\).*frontend\/decisions\.md/)
  assert.match(typeConstraints, /판정표를 읽기 전에 로딩 수단을 고르지\s*않는다/)
})

test('always loads advanced compiler contracts with type work and keeps adoption witness-gated', async () => {
  const [skill, readme, advancedContracts, graphSource] = await Promise.all([
    read('SKILL.md'),
    read('README.md'),
    read('references/types/advanced-contracts.md'),
    read('references/reference-graph.json'),
  ])
  const graph = JSON.parse(graphSource)
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const advancedNode = byId.get('types-advanced-contracts')

  assert.equal(advancedNode?.path, 'references/types/advanced-contracts.md')
  assert.equal(advancedNode?.when, ADVANCED_TYPES_LOAD_CONDITION)
  assert.deepEqual(advancedNode?.requires, ['types-api-surface'])
  assert.equal(byId.get('types-state-ladder').requires.includes('types-advanced-contracts'), false)
  assert.ok(skill.includes(ADVANCED_TYPES_LOAD_CONDITION))
  assert.ok(readme.includes(ADVANCED_TYPES_LOAD_CONDITION))

  assert.match(advancedContracts, /AI가 만든 공개 타입 계약을 컴파일러로 거절 가능하게/)
  assert.match(advancedContracts, /타입 경계 축 중 이 타입이 닫는 축마다 한 줄 `@ts-expect-error`/)
  assert.match(advancedContracts, /runtime complement.*별도 parser·guard·runtime test/)
})

test('scopes negative type witnesses to boundary axes and caps them as a design limit', async () => {
  const [typeConstraints, bva] = await Promise.all([readTypes(), read('references/bva.md')])

  // 축은 bva.md 한 곳이 소유한다 — 타입 문서는 이 API가 닫는 축만 고르라고 요구한다
  assert.match(bva, /## 5\. 타입 경계/)
  assert.match(bva, /닫지 않는 축에는 witness를 만들지 않는다/)
  assert.match(typeConstraints, /이 API가 닫는 경계 축마다 witness를\s*둔다/)
  assert.match(typeConstraints, /타입 witness의 축과 개수 규칙은 \[`\.\.\/bva\.md`\]/)

  // 30은 채우는 목표가 아니라 분리 신호다
  assert.match(bva, /30은 채워야 할 목표가 아니라 표면이 너무 넓다는 설계 실격선이다/)
  assert.match(typeConstraints, /30개를 넘으면 케이스를\s*더 쓰지 말고 API를 나눈다/)
  assert.match(typeConstraints, /30개를 넘는데 API 분리를 검토하지 않았으면 `FINDING`이다/)

  // 축을 아예 선언하지 않는 우회를 오용 목록과 묶어 닫는다
  assert.match(typeConstraints, /오용 목록이 있는데 경계 축을 전부 N\/A로 적었으면 `FINDING`이다/)
})

test('keeps client state data-only and hands actions back beside it', async () => {
  const [typeConstraints, frontendImplementation, subagentReview] = await Promise.all([
    readTypes(),
    readFrontend(),
    readReview(),
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
  assert.match(typeConstraints, /UI 동작·문구가 실제로 다를 때만\s*별도 상태로 나눈다/)

  // 8: 카드의 State Model은 정책 표기이지 런타임 기계 지시가 아니다
  assert.match(typeConstraints, /카드에 `## State Model`이 있다는 사실만으로/)
  assert.match(typeConstraints, /Event union·전이 함수·transition command/)

  // 7: unmount·route 변경 뒤 도착한 응답은 타입이 아니라 런타임이 막는다
  assert.match(frontendImplementation, /unmount·route 변경 뒤 도착한 응답/)
  assert.match(frontendImplementation, /AbortController/)
  assert.match(frontendImplementation, /직접 만든 async 상태에도 같은 방어를\s*적용한다/)
  assert.match(frontendImplementation, /state와 action을 형제로 반환한다/)

  // 리뷰는 같은 계약으로 판정한다
  assert.match(subagentReview, /state union and action placement/)
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
    .map((entry) =>
      join(entry.parentPath ?? entry.path, entry.name).slice(join(skillDirectory, 'references').length + 1),
    )
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
    readReview(),
  ])

  assert.match(common, /## Authority priority/)
  assert.match(common, /## Policy sources/)
  assert.match(common, /## Feedback routing/)
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
    readReview(),
    read('references/reference-graph.json'),
    read('scripts/oracle-run.mjs'),
  ])
  const graph = JSON.parse(graphSource)
  const ids = new Set(graph.nodes.map((node) => node.id))

  assert.match(skill, /--review-point/)
  assert.match(subagentReview, /## Review Points — Delivered as File Links/)
  assert.match(subagentReview, /--review-point/)
  assert.match(subagentReview, /not pasted into the reviewer prompt/)
  assert.match(subagentReview, /only the path and the\s+SHA-256 digest are recorded/)
  assert.match(subagentReview, /types\/review-criteria\.md/)
  assert.match(subagentReview, /create findings from unrelated criteria/i)
  assert.match(runner, /review-point/)
  assert.match(runner, /REVIEW_POINT_INVALID/)

  // 판정 항목은 reviewer가 직접 읽는 노드가 소유한다 — primary agent 컨텍스트에 싣지 않는다
  const [process_, checklist] = await Promise.all([
    read('references/subagent-review.md'),
    read('references/review-checklist.md'),
  ])
  assert.match(process_, /The judgment items are owned by \[`review-checklist\.md`\]\(review-checklist\.md\)/)
  assert.doesNotMatch(process_, /Decision Falsification Questions/)
  assert.match(checklist, /Decision Falsification Questions — Applicable Items Only/)
  assert.match(checklist, /--review-point/)
  const always = graph.reviewPoints.find((entry) => entry.when === '항상')
  assert.ok(always.nodes.includes('review-checklist'), 'the checklist must always reach the reviewer')
  assert.match(subagentReview, /--review-point <skill-dir>\/references\/review-checklist\.md/)

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
  const entryIndex = skill.indexOf('## Entry — always first')
  assert.ok(entryIndex > 0, 'SKILL.md must declare the unconditional entry block')
  assert.ok(entryIndex < skill.indexOf('## Invariants'))
  assert.ok(entryIndex < skill.indexOf('## Mode selection'))
  assert.ok(entryIndex < skill.indexOf('## Reference loading'))

  assert.match(skill, /The first tool call is a Read of exactly one lane entry node/)
  assert.match(skill, /any other reference load all come after it/)
  assert.match(skill, /Print the lane header as the first line of the response.*without the\s+header is a violation/s)
  assert.match(skill, /risk=<Low\|Medium\|High> lane=<low-fast-path\|oracle> nodes=\[/)
  assert.match(skill, /only the nodes \*\*actually Read\*\*/)

  // 설명·플랜 전용 요청도 같은 절차 — 이전 실패 모드
  assert.match(skill, /only \*\*explain in words\*\*.*inside this\s+procedure too/s)
  assert.match(skill, /"Already known", "the spec is detailed enough", and "no code changes" are not\s+skip reasons/)

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
  const delivery = skill.slice(skill.indexOf('### Delivery'), skill.indexOf('## Feedback routing'))

  assert.match(
    designOnly,
    /1\. Read \[`common\.md`\][^\n]*\n\s*\[`card\/policy-sources\.md`\][^\n]* → write the `Outcome Brief`/,
  )
  assert.match(designOnly, /7\. Read \[`card\/risk-grill\.md`\]/)
  assert.match(designOnly, /\[`bva\.md`\]/)
  assert.match(designOnly, /\[`card\/card-format\.md`\]/)
  assert.match(designOnly, /10\. Read \[`card\/confirmation-lock\.md`\]/)
  assert.match(designOnly, /lane header's `risk` is finalized here/)
  assert.match(delivery, /read \[`delivery\/ledger\.md`\][\s\S]*\[`delivery\/red\.md`\]/)

  // 카탈로그 섹션은 실행 순서를 소유하지 않는다
  assert.match(skill, /inlined into each step of\s+"Mode selection" own execution order/)
})
