import { normalizeFlow } from './normalize.mjs'

const text = (value) => typeof value === 'string' ? value : JSON.stringify(value)
const markdown = (value) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_[\]#|]/g, '\\$&').replace(/[\r\n]/g, ' ')
export const mermaidLabel = (value) => text(value).replace(/\p{Cc}/gu, ' ').replace(/["'()[\]:/&<>|;{}\\#]/g, (char) => `#${char.charCodeAt(0)};`)

function visible(edge, options) {
  if (edge.category === 'external') return options.includeExternalLinks !== false
  if (['component-state', 'scroll', 'variable-state'].includes(edge.category)) return options.includeComponentInteractions === true
  return true
}

export function renderMermaid(input, options = {}) {
  const ir = normalizeFlow(input)
  const selected = options.flowId ? ir.flows.find((flow) => flow.id === options.flowId) : undefined
  if (options.flowId && !selected) throw new Error(`Unknown flow: ${options.flowId}`)
  const interactions = ir.interactions.filter((interaction) => (!selected || selected.nodeIds.includes(interaction.from)) && ir.edges.some((edge) => edge.interactionId === interaction.id && visible(edge, options)))
  const targetIds = new Set(interactions.flatMap((interaction) => ir.edges.filter((edge) => edge.interactionId === interaction.id && visible(edge, options)).flatMap((edge) => edge.to ? [edge.to] : [])))
  const shown = ir.nodes.filter((node) => (!selected || selected.nodeIds.includes(node.id) || targetIds.has(node.id)) && (['screen', 'overlay', 'unknown'].includes(node.type) || targetIds.has(node.id)))
  const ids = new Map(shown.map((node, index) => [node.id, `n${index}`]))
  const lines = ['flowchart LR', '  %% Potential flow only; action order and conditions are preserved, not executed.']
  for (const node of shown) lines.push(`  ${ids.get(node.id)}["${mermaidLabel(node.name)}"]${node.type === 'overlay' ? ':::overlay' : ''}`)
  let sequenceId = 0
  function step(label, conditional = false) {
    const id = `a${sequenceId++}`
    lines.push(`  ${id}${conditional ? '{' : '['}"${mermaidLabel(label)}"${conditional ? '}' : ']'}`)
    return id
  }
  function link(from, to, label, inferred = false, target = false) {
    const dotted = inferred || target
    lines.push(`  ${from} ${dotted ? '-.->' : '-->'}|"${mermaidLabel(label)}"| ${to}`)
  }
  function destination(action) {
    if (ids.has(action.to)) return ids.get(action.to)
    if (action.type === 'back') return step('BACK — history dependent')
    if (action.type === 'close') return step('CLOSE — overlay stack dependent')
    if (action.resolution === 'missing') return step('Broken destination')
    if (action.resolution === 'out-of-scope') return step('Outside analyzed scope')
    return step('Unresolved destination')
  }
  function actionLabel(action) {
    if (action.type === 'set-variable') return `set-variable ${action.variable ?? '?'} = ${text(action.value)}`
    if (action.type === 'set-variable-mode') return `set-variable-mode ${action.collection ?? '?'} = ${action.mode ?? '?'}`
    return `${action.type} [${action.evidence}]`
  }
  function sequence(actions, previous, firstLabel = 'next') {
    let tails = previous
    for (const [index, action] of actions.entries()) {
      const id = step(actionLabel(action), action.type === 'conditional')
      for (const from of tails) link(from, id, index === 0 ? firstLabel : 'next action', action.evidence === 'inferred')
      if (action.type === 'conditional') {
        tails = action.branches.flatMap((branch) => {
          const label = branch.condition === null ? 'else' : `if ${text(branch.condition)}`
          if (branch.actions.length) return sequence(branch.actions, [id], label)
          const noOp = step('No-op branch')
          link(id, noOp, label)
          return [noOp]
        })
        if (!action.branches.some((branch) => branch.condition === null)) {
          const fallthrough = step('No explicit fallback')
          link(id, fallthrough, 'unmatched condition')
          tails.push(fallthrough)
        }
      } else {
        const category = { 'component-state': 'component-state', scroll: 'scroll', external: 'external' }[action.type] || 'product-navigation'
        const edge = { category }
        if ((action.to || ['back', 'close'].includes(action.type) || action.resolution) && visible(edge, options)) link(id, destination(action), `target [${action.evidence}]`, action.evidence === 'inferred', true)
        tails = [id]
      }
    }
    return tails
  }
  for (const interaction of interactions) {
    if (!ids.has(interaction.from)) continue
    const label = `${interaction.hotspot?.text || interaction.hotspot?.name || interaction.trigger.type} / ${interaction.trigger.type}`
    const action = interaction.actions[0]
    if (interaction.actions.length === 1 && action.type !== 'conditional' && (action.to || action.resolution || ['back', 'close'].includes(action.type))) {
      link(ids.get(interaction.from), destination(action), `${label} / ${action.type} [${action.evidence}]`, action.evidence === 'inferred')
    } else sequence(interaction.actions, [ids.get(interaction.from)], label)
  }
  lines.push('  classDef overlay fill:#fff3cd,stroke:#806000,stroke-dasharray:5 5')
  return `${lines.join('\n')}\n`
}

export function renderMarkdown(input) {
  const ir = normalizeFlow(input)
  const nodes = new Map(ir.nodes.map((node) => [node.id, node]))
  const lines = [
    `# UX Flow — ${ir.view === 'proposed' ? 'Proposed' : 'Current'}`, '',
    `Evidence mode: **${ir.mode}** · Coverage: **${ir.coverage.status}** · Source: ${markdown(ir.source.type)}`, '',
    'Connections describe a potential flow, not verified runtime behavior. Ordered actions and branch expressions are preserved without evaluating state.', '',
    '## Flows', '',
  ]
  for (const flow of ir.flows) {
    lines.push(`### ${markdown(flow.name)}`, '', `Starting point: ${flow.startingPoint ? markdown(nodes.get(flow.startingPoint).name) : 'Unknown; not guessed'}`, `Evidence: ${flow.evidence}`, `Members: ${flow.nodeIds.map((id) => markdown(nodes.get(id).name)).join(', ') || 'Not yet computed'}`, '')
    if (flow.statistics) lines.push(`Path observations: ${markdown(flow.statistics)}`, '')
  }
  function actions(items, indent = '') {
    for (const [index, action] of items.entries()) {
      lines.push(`${indent}- ${index + 1}. **${action.type}** [${action.evidence}] — evidence: ${action.evidenceRefs.map(markdown).join(', ')}`)
      if (action.to) lines.push(`${indent}  - Destination: ${markdown(nodes.get(action.to).name)}${action.resolution === 'out-of-scope' ? ' (outside scope)' : ''}`)
      if (action.resolution === 'missing' || action.resolution === 'unavailable') lines.push(`${indent}  - Destination resolution: **${action.resolution}**`)
      if (action.historyDependent) lines.push(`${indent}  - Depends on navigation history or overlay stack; no static target is invented.`)
      if (action.transition) lines.push(`${indent}  - Transition: ${markdown(action.transition)}`)
      if (action.url !== undefined) lines.push(`${indent}  - External URL (not fetched): ${markdown(action.url)}`)
      if (action.type === 'set-variable') lines.push(`${indent}  - Mutation: ${markdown(action.variable)} → ${markdown(action.value)}`)
      if (action.type === 'set-variable-mode') lines.push(`${indent}  - Mode: ${markdown(action.collection)} → ${markdown(action.mode)}`)
      if (action.type === 'conditional') for (const branch of action.branches) {
        lines.push(`${indent}  - **${branch.condition === null ? 'Else' : `If ${markdown(branch.condition)}`}**`)
        if (branch.actions.length) actions(branch.actions, `${indent}    `)
        else lines.push(`${indent}    - No-op; intent requires review.`)
      }
      if (action.type === 'unsupported') lines.push(`${indent}  - Unsupported semantics; opaque source payload remains in JSON.`)
    }
  }
  lines.push('## Screens and interactions', '')
  for (const node of ir.nodes) {
    lines.push(`### ${markdown(node.name)}`, '', `Type: ${node.type} · Evidence: ${node.evidence} · ID: ${markdown(node.id)}`, '')
    if (node.semantics) lines.push(`Semantic interpretation [inferred]: ${markdown(node.semantics)}`, '')
    for (const interaction of ir.interactions.filter((item) => item.from === node.id)) {
      lines.push(`#### ${markdown(interaction.hotspot?.name || interaction.id)}`, '', `Trigger: ${markdown(interaction.trigger)} · Evidence: ${interaction.evidence}`, '')
      actions(interaction.actions)
      lines.push('')
    }
  }
  lines.push('## Findings', '')
  if (!ir.issues.length) lines.push('No findings were recorded. This is not proof of complete UX coverage.', '')
  for (const issue of ir.issues) lines.push(`### ${issue.severity} — ${markdown(issue.title)}`, '', `Confidence: ${issue.confidence}`, '', `Observed: ${markdown(issue.observation)}`, '', `Interpretation: ${markdown(issue.interpretation)}`, '', `Recommendation: ${markdown(issue.recommendation)}`, '', `Evidence: ${issue.evidenceRefs.map(markdown).join(', ')}`, '')
  lines.push('## Statistics', '', markdown(ir.statistics), '', '## Coverage and limitations', '')
  for (const limitation of ir.coverage.limitations) lines.push(`- ${markdown(limitation)}`)
  lines.push('', '## Verification', '')
  if (!ir.verification.length) lines.push('No test/browser verification evidence supplied. Static code and prototype links are not runtime verification.')
  else for (const record of ir.verification) lines.push(`- ${markdown(record)}`)
  lines.push('', '## Evidence provenance', '')
  for (const entry of ir.evidence) lines.push(`- ${markdown(entry.id)} [${entry.level}; ${entry.sourceKind}]: ${markdown(entry.locator)}${entry.observation === undefined ? '' : ` — ${markdown(entry.observation)}`}`)
  return `${lines.join('\n')}\n`
}

export function compareFlows(beforeInput, afterInput) {
  const before = normalizeFlow(beforeInput)
  const after = normalizeFlow(afterInput)
  const sourceKey = (source) => source.file || source.root
  const sameScope = JSON.stringify([before.source.pageId, before.source.scope]) === JSON.stringify([after.source.pageId, after.source.scope])
  const automaticMatch = Boolean(sameScope && before.source.type === after.source.type && sourceKey(before.source) && sourceKey(before.source) === sourceKey(after.source))
  const summary = { automaticMatch, verificationReusable: false, before: { source: before.source, view: before.view, coverage: before.coverage }, after: { source: after.source, view: after.view, coverage: after.coverage }, limitations: [] }
  if (!automaticMatch) {
    summary.limitations.push('Sources lack matching stable identity. No name-based node matching was invented; supply an explicit source correspondence before comparing topology.')
    return summary
  }
  for (const key of ['nodes', 'edges', 'interactions']) {
    const previous = new Map(before[key].map((item) => [item.id, item]))
    const current = new Map(after[key].map((item) => [item.id, item]))
    const title = key[0].toUpperCase() + key.slice(1)
    const added = [...current.keys()].filter((id) => !previous.has(id))
    const removed = [...previous.keys()].filter((id) => !current.has(id))
    summary[`added${title}`] = before.coverage.status === 'complete' ? added : []
    summary[`removed${title}`] = after.coverage.status === 'complete' ? removed : []
    summary[`unconfirmedMissing${title}`] = after.coverage.status === 'complete' ? [] : removed
    summary[`newlyObserved${title}`] = added
    summary[`changed${title}`] = [...current.keys()].filter((id) => previous.has(id) && JSON.stringify(previous.get(id)) !== JSON.stringify(current.get(id)))
  }
  if (before.coverage.status !== 'complete' || after.coverage.status !== 'complete') summary.limitations.push('Incomplete extraction cannot establish absence: added/removed claims are limited to completely observed scopes.')
  summary.limitations.push('Matching source IDs are not proof of equivalent behavior. Previous verification is never automatically transferred; confirm scope, conditions and source revision.')
  return summary
}

export function renderComparisonMarkdown(comparison) {
  const lines = ['# UX Flow comparison', '', 'Differences are observations, not authorization to modify either source.', '']
  for (const [key, value] of Object.entries(comparison)) lines.push(`## ${markdown(key)}`, '', markdown(value), '')
  return `${lines.join('\n')}\n`
}
