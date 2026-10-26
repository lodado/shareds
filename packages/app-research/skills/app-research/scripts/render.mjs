import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lint } from './lint.mjs'
import { blockedGates, FILES, handledKeys, loadRun, unexploredOf, usedActions } from './state.mjs'
import { readJson } from './store.mjs'

const CONFIRMED = new Set(['observed', 'documented', 'code-backed'])
const UNIDENTIFIED = new Set(['unidentified-target', 'unknown-target', 'ambiguous-target', 'context-required'])
// UI labels and claim text go into Markdown lines; a newline inside one would start a new block.
const inline = (text) =>
  String(text ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim()
const mermaidId = (id) => id.replaceAll(/\W/g, '')
const mermaidText = (text, max = 40) => {
  const clean = String(text ?? '')
    .replaceAll(/["[\]{}()<>|`]/g, "'")
    .replaceAll(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
const cell = (text) =>
  String(text ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
const screenName = (screen) => `${screen.id} ${inline(screen.title) || '(untitled)'}`
const targetName = (item) => inline(item.label || item.id)
const list = (items, empty = 'None.') => (items.length > 0 ? items : [empty])

export function coverage(state) {
  const handled = handledKeys(state)
  const candidates = state.screens.flatMap((screen) =>
    screen.candidates.map((candidate) => `${screen.id}|${candidate.key}`),
  )
  const consumed = new Set(
    state.gates.filter((gate) => gate.consumedBy).map((gate) => `${gate.screenId}|${gate.actionKey}`),
  )
  const unexplored = state.screens.flatMap((screen) =>
    unexploredOf(state, screen, handled).map((candidate) => ({ screen, candidate })),
  )
  return {
    screensDiscovered: state.screens.length,
    actionsDiscovered: candidates.length,
    actionsExecuted: candidates.filter((key) => consumed.has(key)).length,
    actionsBlocked: blockedGates(state).length,
    actionsUnexplored: unexplored.length,
    budget: { used: usedActions(state), max: state.run.maxActions },
    unexplored,
  }
}

function mermaidFlow(state) {
  const edgeLabel = (action, fallback) => mermaidText(`${action}: ${fallback}`, 32)
  const blocked = blockedGates(state)
  return [
    'flowchart LR',
    ...state.screens.map((screen) => `  ${mermaidId(screen.id)}["${mermaidText(screenName(screen))}"]`),
    ...state.transitions.map(
      (t) => `  ${mermaidId(t.from)} -->|"${edgeLabel(t.action.type, targetName(t.action))}"| ${mermaidId(t.to)}`,
    ),
    ...blocked.flatMap((gate, index) => [
      `  B${index + 1}["blocked: ${mermaidText(gate.category)}"]:::blocked`,
      `  ${mermaidId(gate.screenId)} -.->|"${edgeLabel(gate.action, targetName(gate))}"| B${index + 1}`,
    ]),
    ...(blocked.length > 0 ? ['  classDef blocked stroke-dasharray: 4 3,stroke:#b42318'] : []),
  ].join('\n')
}

function sitemap(state) {
  const children = (id) => state.screens.filter((screen) => screen.parent?.screenId === id)
  const render = (screen, level) => [
    `${'  '.repeat(level)}- ${screenName(screen)} (${screen.type}, depth ${screen.depth})`,
    ...children(screen.id).flatMap((child) => render(child, level + 1)),
  ]
  const roots = state.screens.filter((screen) => !screen.parent)
  return ['# Sitemap', '', ...roots.flatMap((screen) => render(screen, 0)), ''].join('\n')
}

const EVIDENCE_LABEL = {
  observation: (item) => item.ref,
  document: (item) => `${item.url} (fetched ${item.fetchedAt})`,
  code: (item) => item.ref,
}
const evidenceRef = (item) => EVIDENCE_LABEL[item.kind](item)
const evidenceList = (item) => (item.evidence ?? []).map(evidenceRef).join(', ') || 'none'

function featuresDoc(features) {
  const blocks = features.flatMap((feature) => [
    `## ${feature.id} ${inline(feature.name)}`,
    '',
    `- Status: ${feature.status}`,
    ...(feature.description ? [`- ${inline(feature.description)}`] : []),
    `- Screens: ${(feature.screenIds ?? []).join(', ') || 'none'}`,
    `- Transitions: ${(feature.transitionIds ?? []).join(', ') || 'none'}`,
    `- Evidence: ${evidenceList(feature)}`,
    '',
  ])
  return ['# Features', '', ...list(blocks, 'No features recorded.')].join('\n')
}

function policyLine(policy) {
  const parts = [`- **${policy.id}** [${policy.category}, ${policy.status}] ${inline(policy.statement)}`]
  if (policy.basis) parts.push(`basis: ${inline(policy.basis)}`)
  if ((policy.evidence ?? []).length > 0) parts.push(`evidence: ${evidenceList(policy)}`)
  return parts.join(' — ')
}

function policiesDoc(policies) {
  const section = (title, items) => [`## ${title}`, '', ...list(items.map(policyLine)), '']
  return [
    '# Policies',
    '',
    ...section(
      'Confirmed',
      policies.filter((policy) => CONFIRMED.has(policy.status)),
    ),
    ...section(
      'Inferred (not verified)',
      policies.filter((policy) => policy.status === 'inferred'),
    ),
    ...section(
      'Unknown',
      policies.filter((policy) => policy.status === 'unknown'),
    ),
  ].join('\n')
}

function unknownsDoc(state, policies, cov) {
  const blocked = blockedGates(state)
  const human = blocked.filter((gate) => gate.humanAction)
  const unidentified = blocked.filter((gate) => !gate.humanAction && UNIDENTIFIED.has(gate.category))
  const limited = blocked.filter((gate) => !gate.humanAction && !UNIDENTIFIED.has(gate.category))
  const lowConfidence = state.screens.filter((screen) => screen.confidence === 'low')
  const unknown = policies.filter((policy) => policy.status === 'unknown')
  return [
    '# Unknowns',
    '',
    '## Needs a person',
    '',
    ...list(
      human.map(
        (gate) => `- ${gate.screenId} ${gate.action} "${targetName(gate)}" (${gate.category}): ${gate.humanAction}`,
      ),
    ),
    '',
    '## Could not identify the target',
    '',
    ...list(
      unidentified.map(
        (gate) => `- ${gate.screenId} ${gate.action} "${targetName(gate)}" (${gate.category}): ${inline(gate.reason)}`,
      ),
    ),
    '',
    '## Stopped by a limit',
    '',
    ...list(limited.map((gate) => `- ${gate.screenId} ${gate.action} "${targetName(gate)}": ${inline(gate.reason)}`)),
    '',
    '## Discovered but not explored',
    '',
    ...list(
      cov.unexplored.map(({ screen, candidate }) => `- ${screen.id} ${candidate.action} "${targetName(candidate)}"`),
    ),
    '',
    '## Low-confidence screens',
    '',
    ...list(lowConfidence.map((screen) => `- ${screenName(screen)}: identity decided from a thin snapshot`)),
    '',
    '## Unknown policies',
    '',
    ...list(unknown.map((policy) => `- ${policy.id} ${inline(policy.statement)}`)),
    '',
  ].join('\n')
}

function coverageDoc(cov) {
  return [
    '# Coverage',
    '',
    'Measured against the screens and actions this run discovered. It is not the share of the whole app.',
    '',
    `- Screens discovered: ${cov.screensDiscovered}`,
    `- Actions discovered: ${cov.actionsDiscovered}`,
    `- Actions executed: ${cov.actionsExecuted}`,
    `- Actions blocked: ${cov.actionsBlocked}`,
    `- Actions discovered but not explored: ${cov.actionsUnexplored}`,
    `- Action budget used: ${cov.budget.used} of ${cov.budget.max}`,
    '',
  ].join('\n')
}

function evidenceDoc(state, policies, features) {
  const rows = state.observations.map((o) => {
    const action = cell(inline(`${o.action.type} ${o.action.label ?? ''}`))
    return `| ${o.id} | ${o.screenId} | ${action} | ${o.result} | ${o.snapshotPath} | ${o.screenshotPath ?? ''} |`
  })
  const external = [...policies, ...features].flatMap((item) =>
    (item.evidence ?? [])
      .filter((evidence) => evidence.kind !== 'observation')
      .map((evidence) => `- ${item.id}: ${evidence.kind} ${evidenceRef(evidence)}`),
  )
  return [
    '# Evidence index',
    '',
    '## Observations',
    '',
    '| ID | Screen | Action | Result | Snapshot | Screenshot |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Documents and code',
    '',
    ...list(external),
    '',
  ].join('\n')
}

function readme(state, cov) {
  const { run } = state
  const scope = run.scopeNote ? `${run.scope} (${run.scopeNote})` : run.scope
  return [
    `# Research: ${run.target}`,
    '',
    `- Run: ${run.runId} (${run.mode}, ${run.platform}, locale ${run.locale}, version ${run.targetVersion})`,
    `- Scope: ${scope}`,
    `- Screens: ${cov.screensDiscovered}, transitions: ${state.transitions.length}, observations: ${state.observations.length}`,
    `- Action budget used: ${cov.budget.used} of ${cov.budget.max}`,
    '',
    'Start with [unknowns.md](unknowns.md) and [coverage.md](coverage.md); then [ux-flow.md](ux-flow.md), [features.md](features.md) and [policies.md](policies.md).',
    '',
  ].join('\n')
}

function appSpec(state, features, policies, cov) {
  const unexplored = cov.unexplored.map(({ screen, candidate }) => ({ screenId: screen.id, actionKey: candidate.key }))
  const spec = {
    schemaVersion: 1,
    run: state.run,
    screens: state.screens,
    transitions: state.transitions,
    observations: state.observations,
    blocked: blockedGates(state),
    features,
    policies,
    coverage: { ...cov, unexplored },
  }
  return `${JSON.stringify(spec, null, 2)}\n`
}

function describeErrors(errors) {
  return errors.map((error) => `${error.code} ${error.where}: ${error.message}`).join('\n')
}

/** Builds app-spec.json and the markdown reports from the run files. Refuses a run that fails lint. */
export async function render(runDir) {
  const verdict = await lint(runDir)
  if (!verdict.ok)
    throw new Error(
      `Run fails lint (${verdict.errors.length} errors); fix them before rendering:\n${describeErrors(verdict.errors)}`,
    )
  const state = await loadRun(runDir)
  const { features } = await readJson(join(state.dir, FILES.features), { features: [] })
  const { policies } = await readJson(join(state.dir, FILES.policies), { policies: [] })
  const cov = coverage(state)
  const files = {
    'README.md': readme(state, cov),
    'sitemap.md': sitemap(state),
    'ux-flow.md': ['# UX flow', '', '```mermaid', mermaidFlow(state), '```', ''].join('\n'),
    'features.md': featuresDoc(features),
    'policies.md': policiesDoc(policies),
    'unknowns.md': unknownsDoc(state, policies, cov),
    'coverage.md': coverageDoc(cov),
    'evidence-index.md': evidenceDoc(state, policies, features),
    'app-spec.json': appSpec(state, features, policies, cov),
  }
  const outDir = join(state.dir, 'report')
  await mkdir(outDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) await writeFile(join(outDir, name), content)
  return { reportDir: outDir, files: Object.keys(files) }
}
