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
  'references/card/interaction-sweep.md',
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
    /explicitly requests a graph-orchestrated delivery loop[\s\S]{0,60}`\$agent-graph-engineering`/,
  )
  assert.match(
    graphOrchestration,
    /subagent delegation is not\s*forced and only the agent.s discretionary choice is allowed/,
  )
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
      // review-finalize is the only node allowed to name one, and only to say it normalizes an
      // opinion-only verdict away instead of routing on it.
      if (source.id === 'review-finalize' && label === 'NON_ORACLE_OPINION') continue
      assert.doesNotMatch(source.task, new RegExp(label))
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

  assert.match(node('valid-red').task, /ALREADY_SATISFIED[^.]*modify production/)
  assert.match(node('implement-green').task, /ALREADY_SATISFIED[^.]*modify production/)
  assert.match(node('implement-green').task, /visual[^.]*pending[^.]*IMPLEMENTED_GREEN/)
  assert.match(node('implement-green').task, /IMPLEMENTED_GREEN[^.]*resume/)
  assert.match(node('implement-green').task, /IMPLEMENTED_GREEN exactly once/)
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
  assert.match(node('resume-implemented-green').task, /not record the IMPLEMENTED_GREEN transition again/)
  // The three together are the contract; the sentence may order them however it reads best.
  for (const token of ['oracle-run --adapter node-test', 'Playwright', 'schema-v3']) {
    assert.match(node('resume-implemented-green').task, new RegExp(token))
  }

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
  // 인용은 Verification 그룹이 단독 소유한다 — 별도 runs 필드는 같은 runId를 두 번 적게 만들었다
  assert.match(skill, /- <label> <runId> exit <n> <grade>/)
  assert.match(skill, /Cite each runId once/)
  assert.match(skill, /- Transitions <\.\.\.> — last state <\.\.\.>/)
  assert.match(skill, /- Budgets policy <n>\/2 · harness <n>\/2 · product <n>\/3 · ENV_DRIFT <presence>/)
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
  assert.match(visualDesign, /screenshot[\s\S]{0,80}direct browser/i)
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

  assert.equal(version, '0.38.0')
  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(JSON.parse(codexPluginJson).version, version)
  assert.equal(marketplaceVersion, version)
  assert.equal(marketplace.version, '0.38.0')
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
  assert.match(performance, /This is not product policy/)
  assert.match(performance, /Initial-load/)
  assert.match(performance, /Responsiveness/)
  assert.match(performance, /profiler/)
  assert.match(performance, /baseline/)
  assert.match(performance, /trade-off/)
  assert.match(performance, /Do Not Optimize Before Measuring/)
  assert.match(performance, /Change Only the Smallest Bottleneck/)
  assert.match(performance, /Do not force P95\/P99 measurement/)
  assert.match(performance, /`POLICY_GAP`[\s\S]{0,80}`NEEDS_DECISION`|`NEEDS_DECISION`[\s\S]{0,80}`POLICY_GAP`/)
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
  assert.match(implementationNode.task, /does not force a single·delegated·parallel implementation method/)
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
  assert.match(fsd, /`components`, `hooks`, and `utils` are not FSD segments/)
  assert.match(fsd, /ui\|model\|api\|lib\/__test__\//)
  assert.match(fsd, /do not deep import/i)
  assert.match(fsd, /steiger/)
  assert.match(fsd, /pnpm add -D steiger @feature-sliced\/steiger-plugin/)
  assert.match(fsd, /'fsd\/typo-in-layer-name': 'off'/)
  assert.match(fsd, /`@lodado\/eslint-config`/)
  assert.match(fsd, /NEEDS_DECISION/)
  assert.match(fsd, /Server [Cc]ode [Pp]lacement/)
  assert.match(fsd, /not pulled out to an `src\/server\/` root/)
  assert.match(fsd, /server-only/)
  assert.match(fsd, /Pages-first/)
  assert.match(fsd, /New adoption[\s\S]{0,10}widgets layer is discouraged/i)
  assert.match(fsd, /shared\/auth/)
  assert.match(fsd, /Cross-import resolution/)
  assert.match(fsd, /`_app\/`·`_pages\/`/)
  assert.match(fsd, /technical-role/)
  assert.match(architectureContract, /fsd\.md/)
  assert.match(architectureContract, /steiger/)
  assert.match(backend, /fsd\.md/)
  assert.match(backend, /Server [Cc]ode [Pp]lacement/)
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
  assert.match(frontendImplementation, /does not prove the responsibility cohesion/)
  assert.match(architectureContract, /orchestration-only/)
  assert.match(architectureContract, /target glob.*rule ID.*allow.*block.*lint command/s)
  assert.match(architectureContract, /hook-encapsulation/)
  assert.match(frontendImplementation, /UI[\s\S]{0,40}business logic/i)
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
  assert.match(visualDesign, /local[\s\S]*identity-shaping[\s\S]*explicit user confirmation/)
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
  assert.match(visualDesign, /visual baseline is not.*approved by the user/s)
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

  assert.match(changeability, /not product policy/)
  assert.match(changeability, /Oracle.*target repo.*installed version.*implementation heuristic/is)
  assert.match(changeability, /pre-implementation question/i)
  assert.match(changeability, /React implementation criteria/i)
  assert.match(changeability, /risk signal/i)
  assert.match(changeability, /Except: when|does not apply/i)
  assert.match(changeability, /Implementation Decision evidence/)
  assert.match(changeability, /Reviewer judgment criteria/)
  assert.match(changeability, /hidden side effect/i)
  assert.match(changeability, /Do not factor code out[\s\S]{0,30}merely/i)
  assert.match(changeability, /existing repo implementation[\s\S]*already installed dependency/i)
  assert.match(changeability, /Trade-offs between axes/)
  assert.match(changeability, /lifecycle behind vague automation/)
  assert.match(changeability, /handle only recoverable errors and propagate the rest/)
  assert.match(changeability, /pure transition core and thin adapter/)
  assert.match(changeability, /single runtime on future possibility alone/)
  assert.match(changeability, /hook returns only the values and intent actions[\s\S]{0,80}tuple\/object shape/i)
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
  assert.match(architectureContract, /not mapped to[\s\S]*card `O\*` row[\s\S]*POLICY_GAP/)
  assert.match(architectureContract, /rfc9457/)
  assert.match(architectureContract, /idempotent_requests/)
  assert.match(architectureContract, /next_page_token/)
  assert.match(architectureContract, /Do not create a repo-wide endpoint catalog/)
  assert.match(oracleCard, /Where each RADIO element is handled/)
  assert.match(oracleCard, /platform·device·offline·multilingual/)
  assert.match(oracleCard, /derive a draft schema from\s*the card rows/)
  assert.match(architectureContract, /### When there is no spec — deriving the schema from the card/)
  assert.match(architectureContract, /`Then`[\s\S]{0,40}observed result[\s\S]{0,60}render/i)
  assert.match(architectureContract, /Do not invent[\s\S]{0,20}response field/i)
  assert.match(architectureContract, /derived draft[\s\S]{0,80}`__docs__\/architecture\.md`/)
  assert.match(architectureContract, /schema (?:that )?exists only in (?:the )?conversation is not/i)
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
  assert.match(frontendImplementation, /## TypeScript Contract/)
  assert.match(frontendImplementation, /accessible name/)
  assert.match(frontendImplementation, /baseline/)
  assert.match(implementationLoop, /Type contract/)
  assert.match(implementationLoop, /Performance: claim/)
  assert.match(architecture, /## Exported Public API contract — conditional/)
  assert.match(review, /mandatory constraint/)
  assert.match(skill, /\*\*Outcome\*\* actor\/context/)
  assert.match(skill, /\*\*Evidence appendix\*\*/)
})

test('reports the state and its blocker first, and drops groups instead of padding them with N/A', async () => {
  const skill = await read('SKILL.md')
  const report = skill.slice(skill.indexOf('## Final report'))

  // 읽는 사람이 행동할 근거가 첫 두 줄에 온다
  assert.match(report, /\*\*Lead with the state and the blocker\.\*\*/)
  assert.match(report, /^Status: <state> — <what actually happened, one line>$/m)
  assert.match(report, /^Blocked: <code> — <what it prevents> · <what would clear it>$/m)
  assert.match(report, /A blocker discovered at the bottom of a long field is a reporting defect/)

  // 적용되지 않는 그룹은 N/A로 채우지 않고 통째로 뺀다
  assert.match(report, /Print a group only when it applies; drop it whole when it does not/)
  assert.match(report, /Never write a bare `N\/A`/)
  assert.match(report, /Applicability is fixed by\s+the table below, not by convenience/)
  for (const group of ['Architecture', 'Design, Design confirmation', 'External visual QA', 'Mutation']) {
    assert.ok(report.includes(`| ${group}`), `the omission table must declare when ${group} is printed`)
  }

  // runId 중복 인용과 잘림이 원래 양식의 실제 결함이었다
  assert.match(report, /Cite each runId once, and never truncate to fit a line/)
  assert.match(report, /A long value takes its own list item/)
  assert.doesNotMatch(report, /^runs:/m)
  assert.doesNotMatch(report, /^State machine:/m)
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
  assert.match(typeConstraints, /what no longer compiles/)
  assert.match(typeConstraints, /acceptance decision determinism/)
  assert.match(typeConstraints, /newly designed exported shared\/package API, the generic itself is not the goal/)
  assert.match(typeConstraints, /existing library generic.*not (?:a )?target/is)
  assert.match(typeConstraints, /generation itself remains non-deterministic/i)
  assert.doesNotMatch(typeConstraints, /같은\s+카드에서 같은 설계가 나온다/)
  assert.match(typeConstraints, /[Ss]hared API promotion delta/)
  assert.match(typeConstraints, /the call site first/)
  assert.match(typeConstraints, /representative valid call/i)
  assert.match(typeConstraints, /\.test-d\.tsx/)
  assert.match(typeConstraints, /State design ladder/)
  assert.match(typeConstraints, /State ownership is singular/)
  assert.match(typeConstraints, /capability/)
  assert.match(typeConstraints, /repackaged into a new `status` union/)
  assert.match(typeConstraints, /single `status` string literal discriminant/)
  assert.match(typeConstraints, /`POLICY_GAP`[\s\S]{0,80}`NEEDS_DECISION`|`NEEDS_DECISION`[\s\S]{0,80}`POLICY_GAP`/)
  assert.match(typeConstraints, /skipToken/)
  assert.match(typeConstraints, /early\s*return·guard chains/)
  assert.match(typeConstraints, /satisfies Record/)
  assert.doesNotMatch(typeConstraints, /switch-exhaustiveness-check|`switch`/)
  assert.match(typeConstraints, /only when it is installed or its adoption is approved/)
  assert.doesNotMatch(typeConstraints, /단순 toggle을 위해 XState/)

  // 과잉 타이핑도 미달만큼 FINDING이다 — 열린 key, 태그만 있는 union, 경계 밖 스키마
  assert.match(typeConstraints, /open domain such as an ID·branded string/)
  assert.match(typeConstraints, /Attach (?:a )?discriminant[\s\S]{0,20}diverging data/i)
  // 예시 하나만 있으면 그 모양이 기본값이 된다 — object union 옆에 literal union 대조쌍 유지
  assert.match(typeConstraints, /type PaymentBadge = 'unpaid' \| 'paid' \| 'refunded'/)
  assert.match(typeConstraints, /Decide first[\s\S]{0,30}two examples above[\s\S]{0,10}copy/i)
  assert.match(typeConstraints, /Create schemas only at boundaries/i)
  assert.match(typeConstraints, /Do not move the rules into code comments/i)
  assert.match(typeConstraints, /key is \*\*the branching union itself\*\*/)
  assert.match(typeConstraints, /label map is needed is not[\s\S]{0,20}grounds[\s\S]{0,20}tagged object/i)
  assert.match(typeConstraints, /\*\*One row is not one state\.\*\*/)
  assert.match(typeConstraints, /Fields follow the same[\s\S]{0,10}rule/i)
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
  assert.match(typeEnvironment, /[Oo]nce per repo/)
  assert.match(typeEnvironment, /Do not re-read.*every card/i)
  assert.match(typeEnvironment, /tsc --showConfig/)
  assert.match(typeEnvironment, /`strict`/)
  assert.match(typeEnvironment, /noUncheckedIndexedAccess/)
  assert.match(typeEnvironment, /exactOptionalPropertyTypes/)
  assert.match(typeEnvironment, /project-constraint/)
  assert.match(typeEnvironment, /Do not change the[\s\S]{0,20}tsconfig silently/i)
  assert.match(typeEnvironment, /NEEDS_DECISION/)

  // type-constraints는 환경 전제를 소유하지 않고 가리키기만 한다
  assert.match(typeConstraints, /not (?:a )?soundness proof but/)
  assert.match(typeConstraints, /type-environment\.md/)
  assert.doesNotMatch(typeConstraints, /noUncheckedIndexedAccess/)

  // 소비 지점 단언 금지와 계약 파일 보호
  assert.match(typeConstraints, /consumption loop needs[\s\S]{0,15}assertion[\s\S]{0,20}API shape[\s\S]{0,10}wrong/i)
  assert.match(typeConstraints, /disqualified from shared API promotion/)
  assert.match(typeConstraints, /deleted·weakened an `@ts-expect-error` case/)
  assert.match(typeConstraints, /contract file is the root of trust/)
})

test('prefers Suspense and Error Boundary over in-component loading branches', async () => {
  const [frontendImplementation, typeConstraints, subagentReview] = await Promise.all([
    readFrontend(),
    readTypes(),
    readReview(),
  ])

  assert.match(typeConstraints, /The default for loading·load failure is a boundary, not a component branch/)
  assert.match(typeConstraints, /frontend\/decisions\.md.*section 3/s)
  assert.doesNotMatch(typeConstraints, /경계로 올려 컴포넌트에서 제거할 수 있고/)
  assert.match(typeConstraints, /first query that runs unconditionally was branched inside/)

  assert.match(
    frontendImplementation,
    /Do not leave[\s\S]{0,10}branch inside[\s\S]{0,10}component[\s\S]{0,20}lifted[\s\S]{0,10}boundary/i,
  )
  assert.match(frontendImplementation, /startTransition/)
  assert.match(frontendImplementation, /narrow `throwOnError` to the no-data condition/)

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
  assert.match(graph.entryContract.loadConditionRule, /decision point, not the deliverable stage/)
  assert.match(graph.entryContract.loadConditionRule, /If applicability is ambiguous, load/)
  assert.match(graph.entryContract.loadConditionRule, /Whether to skip a load is not a judgment call/)
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
  assert.match(typeConstraints, /Do not choose a loading mechanism before reading the decision table/)
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

  assert.match(advancedContracts, /AI-authored public type contract rejectable by the compiler/)
  assert.match(advancedContracts, /One `@ts-expect-error` line per axis/)
  assert.match(advancedContracts, /runtime complement.*parser·guard·runtime test/)
})

test('scopes negative type witnesses to boundary axes and caps them as a design limit', async () => {
  const [typeConstraints, bva] = await Promise.all([readTypes(), read('references/bva.md')])

  // 축은 bva.md 한 곳이 소유한다 — 타입 문서는 이 API가 닫는 축만 고르라고 요구한다
  assert.match(bva, /## 5\. Type boundaries/)
  assert.match(bva, /Do not create a witness on an axis it does not close/)
  assert.match(typeConstraints, /for each boundary axis this API closes/)
  assert.match(typeConstraints, /axes and the count rule for type witnesses are owned by/)

  // 30은 채우는 목표가 아니라 분리 신호다
  assert.match(bva, /30 is not a target to fill but a design disqualification line/)
  assert.match(typeConstraints, /exceeds 30, do not write more cases but split the API/)
  assert.match(typeConstraints, /exceeds 30.*API split.*`FINDING`/is)

  // 축을 아예 선언하지 않는 우회를 오용 목록과 묶어 닫는다
  assert.match(typeConstraints, /misuse list[\s\S]*boundary axis[\s\S]*N\/A/i)
})

test('keeps client state data-only and hands actions back beside it', async () => {
  const [typeConstraints, frontendImplementation, subagentReview] = await Promise.all([
    readTypes(),
    readFrontend(),
    readReview(),
  ])

  // 1·2: 기존 query·framework 상태를 먼저 쓰고, 남는 것만 최소 data-only union으로 만든다
  assert.match(typeConstraints, /reuse existing query·framework state first/)
  assert.match(typeConstraints, /State holds only data/)

  // 3·4·6: 함수는 state에 넣지 않고 sibling으로 주며 없는 action은 만들지 않는다
  assert.match(typeConstraints, /Do not store functions such as `retry`·`submit`·`reset` in a state value/)
  assert.match(typeConstraints, /sibling of the hook.s return object/)
  assert.match(typeConstraints, /re-expose the query.s `refetch`/)
  assert.match(typeConstraints, /\(\) => undefined/)
  assert.match(typeConstraints, /no-action-in-state/)

  // 5: 잘못된 입력은 UI 동작·문구가 다를 때만 별도 상태다
  assert.match(typeConstraints, /into a \*\*separate state/)

  // 8: 카드의 State Model은 정책 표기이지 런타임 기계 지시가 아니다
  assert.match(typeConstraints, /Merely because[\s\S]{0,20}`## State Model`/)
  assert.match(typeConstraints, /Event union·transition function·transition command/)

  // 7: unmount·route 변경 뒤 도착한 응답은 타입이 아니라 런타임이 막는다
  assert.match(frontendImplementation, /response that arrives after unmount·route change/)
  assert.match(frontendImplementation, /AbortController/)
  assert.match(frontendImplementation, /apply the same defense to hand-built async/)
  assert.match(frontendImplementation, /returns state and actions as siblings/)

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
  const always = graph.reviewPoints.find((entry) => entry.when === 'always')
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
  assert.match(lane, /## Entry Conditions/)
  assert.match(lane, /## What (?:This |the )?Lane Does Not Do/)
  assert.match(lane, /## Promotion — Low Disqualification Conditions/)
  assert.match(lane, /Loading other reference nodes/)
  assert.match(lane, /not.{0,10}lane that skips verification/i)
  assert.match(lane, /immediately disqualif/i)

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
  assert.match(lane, /[Pp]rint the lane header (?:as|on) the first line/)
  assert.match(lane, /risk=Low lane=low-fast-path nodes=\[low-fast-path\]/)

  // 그래프가 진입 계약을 기계 판독 가능하게 선언한다
  assert.ok(graph.entryContract, 'reference-graph.json must declare entryContract')
  assert.match(graph.entryContract.firstToolCall, /Read exactly one lane entry node/)
  assert.match(graph.entryContract.responseHeader, /^risk=<Low\|Medium\|High> lane=/)
  assert.match(graph.entryContract.appliesTo, /explanation·plan-only requests/)
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

test('gates the draft card on a context-free read that collapses to one root and its first nail', async () => {
  const [skill, format, lock] = await Promise.all([
    read('SKILL.md'),
    read('references/card/card-format.md'),
    read('references/card/confirmation-lock.md'),
  ])

  // 게이트는 lock 이전에만 열린다 — 이후 수리는 새 revision이다
  assert.match(format, /## Cold-read gate/)
  assert.match(format, /After the lock, a repair is a new revision/)

  // 저자는 대화를 되돌릴 수 없으므로 무맥락 독자가 읽는다
  assert.match(format, /cannot un-see the conversation/)
  assert.match(format, /Pass \*\*the card bytes only\.\*\*/)
  assert.match(format, /No repo path, no conversation, no rationale, no intended reading/)
  assert.match(format, /forced guess is a card defect, not a reader failure/)

  // 독립 표면이 없으면 degrade — 같은 맥락 읽기는 fallback이지 목표가 아니다
  assert.match(format, /A same-context read is\s+the fallback, never the target/)

  // 합성은 목록이 아니라 root 하나와 최저가 반증 하나다
  assert.match(format, /## 3\. Single root — synthesis, not a list/)
  assert.match(format, /\*\*Root\*\*: the one assumption this card carries/)
  assert.match(format, /\*\*First nail\*\*: the cheapest observation that would falsify the root/)
  assert.match(format, /costs less than the delivery it pre-empts/)
  assert.match(format, /the root is a `POLICY_GAP`/)

  // 확인·lock 절차가 게이트를 선행 단계로 잠근다
  assert.match(lock, /3\. Run the cold-read gate in \[`card-format\.md`\]/)
  assert.match(lock, /semantic review is owned by the\s+cold-read gate/)
  assert.match(lock, /- The cold-read gate passed/)
  assert.match(lock, /a first nail that was\s+actually driven/)
  assert.doesNotMatch(lock, /adversarial self-review/)

  // SKILL의 Design-only 9단계가 같은 순서를 지시한다
  const designOnly = skill.slice(skill.indexOf('### Design-only'), skill.indexOf('### Delivery'))
  assert.match(designOnly, /9\. Before showing the Draft, run the cold-read gate/)
  assert.match(designOnly, /hand the card bytes alone to a context-free\s+reviewer/)
  assert.match(designOnly, /Drive that nail/)
})

test('sweeps new×inherited×runtime interactions into lintable dispositions instead of free recall', async () => {
  const [skill, sweep, format, verifier] = await Promise.all([
    read('SKILL.md'),
    read('references/card/interaction-sweep.md'),
    read('references/card/card-format.md'),
    read('scripts/oracle-verify.mjs'),
  ])

  // 스윕은 판정의 곱집합이지 테스트의 곱집합이 아니다 — 발견의 출력은 질문이다
  assert.match(sweep, /dispositions, never tests/)
  assert.match(sweep, /`POLICY_GAP` candidate routed through\s+`NEEDS_DECISION`/)
  assert.match(sweep, /covered\(O\*\/D\*\)/)
  assert.match(sweep, /impossible: <reason>/)
  assert.match(sweep, /needs-decision: <question>/)

  // 침묵은 셀로만 가능하다 — 빈 셀과 누락 정책은 기계가 잡는다
  assert.match(sweep, /An unasked question is invisible; an empty\s+cell fails lint/)
  assert.match(verifier, /sweep-cell-empty/)
  assert.match(verifier, /sweep-policy-missing/)
  assert.match(verifier, /sweep-disposition/)
  assert.match(verifier, /sweep-row-unknown/)

  // 승계 선언은 스윕을 통과해야 한다 — 리마운트×가상화류 결함의 규칙화
  assert.match(sweep, /"inherited without semantic change" is valid only when each inherited policy/)

  // 질문 은행은 escaped-bug 회고로 자란다
  assert.match(sweep, /StrictMode double-invoke/)
  assert.match(sweep, /mount-time side effects/)
  assert.match(sweep, /Growth rule: every defect found after lock/)

  // 카드 절차와 cold-read가 스윕을 소유한다
  assert.match(skill, /card\/interaction-sweep\.md/)
  assert.match(format, /interaction-sweep\.md/)
  assert.match(format, /### 2\. Five questions — per row/)
  assert.match(format, /share state, DOM, scroll, cache, or timing/)
})

test('locks machine-observable invariants and the bounded exploration authorization on the card', async () => {
  const repositoryDirectory = join(skillDirectory, '../../..')
  const [format, verifier, visualSkill] = await Promise.all([
    read('references/card/card-format.md'),
    read('scripts/oracle-verify.mjs'),
    readFile(join(repositoryDirectory, 'packages/frontend-visual-qa/skills/frontend-visual-qa/SKILL.md'), 'utf8'),
  ])

  // I* 행은 시나리오 없이 모든 journey에서 판정 가능한 것만 — 기계 관측만 자격이 있다
  assert.match(format, /## Invariants — optional/)
  assert.match(format, /only machine-observable\s+facts qualify/)
  assert.match(verifier, /invariant-policy-unknown/)
  assert.match(verifier, /invariant-basis/)
  assert.match(verifier, /invariant-id/)

  // 탐색 승인은 카드 필드로만 — 추측 실행 금지 원칙 유지
  assert.match(format, /Exploration authorization: approved \| declined/)
  assert.match(visualSkill, /## 6\. 탐색 phase/)
  assert.match(visualSkill, /`Exploration authorization: approved`가 있을 때만/)

  // 탐색의 판정 기준은 I*·implicit oracle뿐이고 출력은 verdict가 아니라 후보다
  assert.match(visualSkill, /`I\*` 불변식과 implicit oracle \*\*만\*\*/)
  assert.match(visualSkill, /`VERIFIED` 판정에 영향을 주지 않는다/)
  assert.match(visualSkill, /exploration\.md/)
  assert.match(visualSkill, /`PRODUCT_DEFECT` 후보/)
  assert.match(visualSkill, /`POLICY_GAP` 후보/)
})

test('anticipates escapes: deviation types, landmine fossils, premortem framing, drift signal, TWR evidence', async () => {
  const [sweep, sources, format, common, verifier, lock, twr] = await Promise.all([
    read('references/card/interaction-sweep.md'),
    read('references/card/policy-sources.md'),
    read('references/card/card-format.md'),
    read('references/common.md'),
    read('scripts/oracle-verify.mjs'),
    read('scripts/oracle-lock.mjs'),
    read('scripts/oracle-twr.mjs'),
  ])

  // 예지-1: STPA 4유형이 P*마다 강제되고 완전성은 카드 바이트만으로 lint된다
  assert.match(sweep, /## Deviation sweep — STPA unsafe-action types/)
  assert.match(sweep, /`P\* × 4 types`, derived from the card bytes alone/)
  assert.match(sweep, /stopped-early-applied-long/)
  assert.match(sweep, /StrictMode re-invocation and unmount are standing counterexamples/)
  assert.match(verifier, /deviation-type-missing/)
  assert.match(verifier, /deviation-policy-unknown/)

  // 예지-2: 회피용 옵션 = 업스트림 escape 화석, 인용 없는 회상은 기각
  assert.match(sources, /fossils of escapes upstream already paid for/)
  assert.match(sources, /Every landmine needs a citation/)
  assert.match(verifier, /landmine-citation-missing/)
  assert.match(verifier, /landmine-undispositioned/)

  // 예지-0: cold-read는 가능성이 아니라 확정 premortem으로 읽는다
  assert.match(format, /this card was locked and\s+shipped, and one defect escaped it/)
  assert.match(format, /a worry that cannot point at a location is discarded/i)

  // 예지-4: dep 버전은 lock에 고정되고 드리프트는 재스윕 지시로 보고된다
  assert.match(lock, /--dep/)
  assert.match(lock, /DEP_UNRESOLVED/)
  assert.match(verifier, /ASSUMPTION_DRIFT/)
  assert.match(verifier, /SOURCES_CURRENT/)
  assert.match(sources, /oracle-verify\.mjs sources --lock/)

  // 예지-3: TWR은 증거 입력이지 게이트가 아니다
  assert.match(common, /oracle-twr\.mjs/)
  assert.match(common, /never a gate/)
  assert.match(twr, /bug-fix 커밋만 시간 정규화 가중/)
})

test('enumerates the declared case space by machine and dispositions every generated frame', async () => {
  const repositoryDirectory = join(skillDirectory, '../../..')
  const [caseSpace, skill, verifier, frames, testSkill, visualSkill] = await Promise.all([
    read('references/card/case-space.md'),
    read('SKILL.md'),
    read('scripts/oracle-verify.mjs'),
    read('scripts/oracle-frames.mjs'),
    readFile(join(repositoryDirectory, 'packages/test/skills/test/SKILL.md'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/frontend-visual-qa/skills/frontend-visual-qa/SKILL.md'), 'utf8'),
  ])

  // 열거는 기계, LLM은 판정만 — 같은 카드 바이트는 같은 프레임 집합이다
  assert.match(frames, /같은 카드 바이트는 같은 ID 집합을 낸다/)
  assert.match(frames, /export const TAXONOMY_FAMILIES/)
  assert.match(caseSpace, /## Family taxonomy — imported, not invented/)
  assert.match(caseSpace, /derive choices from the repo's `browserslist`/)
  assert.match(verifier, /frame-undispositioned/)
  assert.match(verifier, /frame-unknown/)
  assert.match(verifier, /family-undispositioned/)
  assert.match(verifier, /case-space-too-wide/)

  // 조건부 완전성 명시 — 선언 공간 밖 커버리지 주장 금지
  assert.match(caseSpace, /Declared space ⊂ reality is not checkable/)

  // 카드 절차가 생성기 실행과 판정을 소유한다
  assert.match(skill, /card\/case-space\.md/)
  assert.match(skill, /oracle-frames\.mjs --oracle/)

  // $test: PATH 프레임 = 경로 테스트 열거, Order 차원은 fast-check 필수
  assert.match(testSkill, /`PATH\*` frames of `oracle-frames\.mjs` are the test\s+enumeration/)
  assert.match(testSkill, /sequence test is \*\*required\*\*, not optional/)
  assert.match(testSkill, /fc\.scheduler/)

  // 곱 → 테스트 다리: independent()는 커버리지가 아닌 독립성 주장, PATH·sequence는 evidence 키로 기계 검사
  assert.match(caseSpace, /`independent\(O5\):\s+<mechanism>`/)
  assert.match(caseSpace, /never\s+counted as coverage/)
  assert.match(caseSpace, /EVIDENCE_MISSING_PATH/)
  assert.match(caseSpace, /SEQUENCE_EVIDENCE_MISSING/)
  assert.match(verifier, /EVIDENCE_MISSING_PATH/)
  assert.match(verifier, /SEQUENCE_EVIDENCE_MISSING/)
  assert.match(verifier, /independent\(\) applies to F\* combination frames only/)
  assert.match(testSkill, /`\[PATH3\] <path label>`/)
  assert.match(testSkill, /Unreachability has exactly two forms/)
  assert.match(testSkill, /as `it\.each` rows of the owning row's test/)
  assert.match(testSkill, /SEQUENCE_EVIDENCE_MISSING/)

  // assertion 소유는 단일 — 실행 중복은 허용, 소유 중복은 결함
  assert.match(testSkill, /exactly one owning test/)
  assert.match(testSkill, /is that row's evidence/)
  assert.match(testSkill, /evidence mapping is N:1/)
  assert.match(testSkill, /never re-owns a row's expected values/)
  assert.match(testSkill, /one shared place per harness/)
  assert.match(caseSpace, /assertion ownership stays\s+single/)

  // visual-qa: webkit 매트릭스 — 축을 몰라도 관측면이 받는다 (L4)
  assert.match(visualSkill, /chromium과 \*\*webkit\*\* 두 engine/)
  assert.match(visualSkill, /축을 몰라도 불변식 위반은 관측면에 뜬다/)
})

test('keeps the runtime reference prose in sync with the graph that owns the load conditions', async () => {
  const [skill, graphSource] = await Promise.all([read('SKILL.md'), read('references/reference-graph.json')])
  const graph = JSON.parse(graphSource)

  // 정본은 그래프의 when, SKILL의 산문은 런타임 투영 — 지울 중복이 아니다
  assert.match(graph.description, /Each node's when is the canonical load condition/)
  assert.match(graph.description, /the copy is a projection, not a duplicate to delete/)
  assert.match(skill, /owns each node's `when` as the canonical load condition/)
  assert.match(skill, /a projection of the graph, kept in sync by\s+`skill-contract\.test\.mjs`/)

  // primary agent가 읽지 않는 노드는 명시적으로 위임 표시한다 — 조용한 opt-out 불가
  const delegated = graph.nodes.filter((node) => node.loader).map((node) => `${node.id}:${node.loader}`)
  assert.deepEqual(delegated.sort(), [
    'oracle-workflow-graph:graph-tooling',
    'review-checklist:reviewer',
    'types-review-criteria:reviewer',
  ])

  // 나머지 노드는 전부 SKILL 산문에 나타난다 — 그래프에만 추가하면 실패한다
  for (const node of graph.nodes) {
    if (node.loader) continue
    const relative = node.path.replace(/^references\//, '')
    assert.ok(skill.includes(relative), `SKILL.md must state the load condition for node ${node.id}`)
  }

  // reviewer 전용 노드는 primary agent 로딩 목록에 새지 않는다
  assert.doesNotMatch(skill, /\(references\/review-checklist\.md\)/)
})

test('reports the low lane in three lines instead of padding the oracle block with N/A', async () => {
  const [skill, lane] = await Promise.all([read('SKILL.md'), read('references/lanes/low-fast-path.md')])

  assert.match(skill, /The block below is the Oracle lane's report/)
  assert.match(skill, /The Low fast path reports three lines instead — changed\s+paths/)
  assert.match(skill, /Padding those fields with N\/A is a\s+report defect/)

  // lane 문서의 보고 절차와 같은 세 항목이다
  assert.match(lane, /Report the result: the changed paths, the verification commands run and their actual results, and\s+the risk reason/)
})

test('carves the disqualifying scope out of a mixed low-risk request instead of promoting all of it', async () => {
  const [lane, common, graphSource] = await Promise.all([
    read('references/lanes/low-fast-path.md'),
    read('references/common.md'),
    read('references/reference-graph.json'),
  ])
  const graph = JSON.parse(graphSource)
  const lowLane = graph.lanes.find((entry) => entry.id === 'low-fast-path')

  // 전체 승격은 아무도 요구하지 않은 행을 카드에 싣는다
  assert.match(lane, /### Carving the risky scope out — mixed requests/)
  assert.match(lane, /Promoting the whole request buys nothing/)

  // 승격 규칙이 예외를 먼저 가리킨다 — 순서대로 읽으면 이미 전체 승격한 뒤가 된다
  assert.match(lane, /read "Carving the risky scope out" below before promoting all of it/)
  assert.ok(
    lane.indexOf('read "Carving the risky scope out" below') < lane.indexOf('### Carving the risky scope out'),
    'the promotion rule must point at the carve-out before the reader acts on it',
  )

  // 세 조건 전부 성립할 때만 분리한다 — 하나라도 깨지면 전체 승격
  assert.match(lane, /Carve only when \*\*all three\*\* hold/)
  assert.match(lane, /a split that\s+shares a failure is worse than the ceremony it avoided/)
  assert.match(lane, /touches no state, no side effect, and no type/)
  assert.match(lane, /correct whichever way the carved-out policy is decided/)
  assert.match(lane, /separately verifiable and separately revertible/)

  // descope는 기록되고, 카드 Non-goals가 재병합을 막는다
  assert.match(lane, /^descope: /m)
  assert.match(lane, /registers the remainder under\s+Non-goals/)

  // 대조쌍이 분리 가능·불가를 각각 보여준다
  assert.match(lane, /\*\*Carve\.\*\*/)
  assert.match(lane, /\*\*Do not carve\.\*\*/)
  assert.match(lane, /the unresolved policy wearing a CSS costume/)

  // common과 그래프가 같은 조건을 반복한다
  assert.match(common, /escalate that part alone under the carve-out/)
  assert.match(common, /shares state, a side effect, or a type with the carved scope is never split/)

  // 조건은 별도 필드가 소유한다 — escalation은 도식 라벨이라 짧게 유지한다
  assert.ok(lowLane.carveOut, 'low lane must declare machine-readable carve-out conditions')
  assert.equal(lowLane.carveOut.requiresAll.length, 3)
  assert.match(lowLane.carveOut.otherwise, /promote the whole request/)
  assert.match(lowLane.carveOut.record, /registers the remainder under Non-goals/)
  assert.ok(lowLane.escalation.length < 160, 'escalation renders as a diagram edge label and must stay short')
})

test('states its own evidence with the reproduction commands and the unproven part', async () => {
  const readme = await read('README.md')
  const proof = readme.slice(readme.indexOf('## 증거'), readme.indexOf('## 워크플로우 그래프'))

  // 재현 명령이 없는 증거는 주장일 뿐이다
  assert.ok(proof.length > 0, 'README must carry an evidence section')
  assert.match(proof, /npm test/)
  assert.match(proof, /node skills\/evals\/grade-results\.mjs/)

  // 게이트가 실제로 무엇을 거부하는지 값으로 남긴다
  assert.match(proof, /AUTHORITATIVE_FULL_CORPUS/)
  assert.match(proof, /NON_AUTHORITATIVE_PARTIAL/)
  assert.match(proof, /EMPTY_RESULTS/)
  assert.match(proof, /BLANK_JSONL/)
  assert.match(proof, /falseReviewVerified/)

  // 증명하지 않은 것을 지우고 표만 남기면 이 스킬 자신의 기준을 어긴다
  assert.match(proof, /\*\*증명하지 않은 것\.\*\*/)
  assert.match(proof, /\*\*실제 모델 실행\s*결과가 아닙니다\.\*\*/)
  assert.match(proof, /성능 수치로 인용하지 마세요/)
})

test('closes every run with artifact-backed self-checks before the report is written', async () => {
  const skill = await read('SKILL.md')

  // 검증 절은 보고 양식보다 앞에 온다 — 보고는 검증 결과를 옮겨 적는 자리다
  const verifyIndex = skill.indexOf('## Verification — before the final report')
  assert.ok(verifyIndex > 0, 'SKILL.md must declare a pre-report verification block')
  assert.ok(verifyIndex < skill.indexOf('## Final report'))

  // 디스크에서 답할 수 없는 항목은 판단이 아니라 FAIL이다
  assert.match(skill, /cannot\s+be answered from artifacts on disk is a `FAIL`, not a judgment call/)

  // 네 항목은 각각 실제로 우회된 적이 있는 경로를 막는다
  assert.match(skill, /\*\*The lane header is true\.\*\*/)
  assert.match(skill, /not the nodes the procedure says should have been read/)
  assert.match(skill, /\*\*Every claim cites the ledger\.\*\*/)
  assert.match(skill, /\*\*The first nail was driven, not named\.\*\*/)
  assert.match(skill, /\*\*The recorded state agrees\.\*\*/)
  assert.match(skill, /On disagreement the artifact wins and the report is wrong/)
})

test('publishes the neighbour-skill coupling map with its deliberate strength differences', async () => {
  const [readme, skill] = await Promise.all([read('README.md'), read('SKILL.md')])

  // 결합 강도가 셋이고, 각 이웃이 어느 칸인지 문서가 소유한다
  assert.match(readme, /## 이웃 스킬과의 결합/)
  assert.match(readme, /\| `\$test` +\| hard — 없으면 `FAIL`/)
  assert.match(readme, /\| `\$frontend-visual-qa` +\| explicit-only/)
  assert.match(readme, /\| `\$agent-graph-engineering` +\| explicit-only/)
  assert.match(readme, /\| `\$frontend-system-design` +\| graceful — 없으면 진행/)

  // hard 결합의 근거는 취향이 아니라 증거 순환 방지다
  assert.match(readme, /증거가 순환합니다/)

  // SKILL의 실제 규칙이 지도와 어긋나지 않는다
  assert.match(skill, /invoke the\s+`\$test` skill by name; if it cannot be invoked, `FAIL`/)
  assert.match(skill, /only on explicit request, by invoking the\s+separate `\$frontend-visual-qa` skill by name/)
  assert.match(skill, /If the `frontend-system-design` skill is installed/)
})

test('keeps the boundary-value axes byte-identical with the sibling test skill', async () => {
  const [own, sibling, readme] = await Promise.all([
    read('references/bva.md'),
    readFile(join(skillDirectory, '../../test/skills/test/references/bva.md'), 'utf8'),
    read('README.md'),
  ])

  // 계약과 테스트가 같은 축을 쓰지 않으면 조용히 갈라진다 — 사본은 의도된 중복이다
  assert.equal(own, sibling, 'bva.md must stay byte-identical between frontend-oracle-design and test')
  assert.match(readme, /바이트 단위로 동일한 사본/)
  assert.match(readme, /사본을 없애지 말고/)
})
