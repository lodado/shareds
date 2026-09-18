// Source-independent IR validation; only normalizeFigma understands provider actions.
export const ACTION_TYPES = ['navigate', 'overlay', 'swap', 'scroll', 'component-state', 'back', 'close', 'external', 'set-variable', 'set-variable-mode', 'conditional', 'unsupported']
export const NODE_TYPES = ['screen', 'overlay', 'section', 'state', 'external', 'unknown']
export const LEVELS = ['exact', 'structural', 'inferred']
export const CATEGORIES = ['product-navigation', 'overlay', 'scroll', 'component-state', 'variable-state', 'external', 'unknown']

function requireValue(value, message) {
  if (!value) throw new Error(`Invalid Flow IR: ${message}`)
}

function indexById(items, label) {
  requireValue(Array.isArray(items), `${label} must be an array`)
  requireValue(items.length <= 50000, `${label} exceeds the record budget`)
  const result = new Map()
  for (const item of items) {
    requireValue(item && typeof item.id === 'string' && item.id.length && !result.has(item.id), `${label} IDs must be nonempty and unique`)
    result.set(item.id, item)
  }
  return result
}

export function walkActions(actions, visit, prefix = 'actions', branches = [], depth = 0) {
  requireValue(Array.isArray(actions) && depth < 64, 'invalid or excessively nested actions')
  for (const [index, action] of actions.entries()) {
    const path = `${prefix}.${index}`
    visit(action, path, branches)
    if (action.type === 'conditional') {
      requireValue(Array.isArray(action.branches), 'conditional branches must be an array')
      for (const [branchIndex, branch] of action.branches.entries()) {
        walkActions(branch.actions, visit, `${path}.branches.${branchIndex}.actions`, [...branches, { actionPath: path, index: branchIndex, condition: branch.condition ?? null }], depth + 1)
      }
    }
  }
}

export function validateFlow(ir) {
  requireValue(ir?.schema_version === '1.0', 'unsupported schema_version')
  requireValue(['figma', 'codebase', 'requirements', 'ir'].includes(ir.source?.type), 'invalid source type')
  requireValue(['current', 'proposed'].includes(ir.view), 'view must be current or proposed')
  requireValue(ir.source.type !== 'requirements' || ir.view === 'proposed', 'requirements describe a proposed flow')
  requireValue(['exact', 'hybrid', 'inferred'].includes(ir.mode), 'invalid mode')
  requireValue(['complete', 'partial', 'unavailable'].includes(ir.coverage?.status), 'invalid coverage')
  requireValue(Array.isArray(ir.coverage.limitations) && ir.coverage.limitations.every((item) => typeof item === 'string'), 'coverage limitations must be strings')
  const nodes = indexById(ir.nodes, 'nodes')
  const evidence = indexById(ir.evidence, 'evidence')
  const interactions = indexById(ir.interactions, 'interactions')
  const edges = indexById(ir.edges, 'edges')
  indexById(ir.flows, 'flows')
  indexById(ir.issues, 'issues')
  for (const entry of evidence.values()) {
    requireValue(LEVELS.includes(entry.level) && ['figma', 'codebase', 'requirements', 'ir', 'test', 'browser'].includes(entry.sourceKind), 'invalid provenance')
    requireValue(typeof entry.locator === 'string' && entry.locator.length, 'evidence locator is required')
  }
  const checkRefs = (item, classified = true) => {
    requireValue(Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0 && item.evidenceRefs.every((ref) => evidence.has(ref)), 'missing evidence references')
    if (classified) {
      requireValue(LEVELS.includes(item.evidence), 'invalid evidence level')
      const levels = item.evidenceRefs.map((ref) => evidence.get(ref).level)
      if (item.evidence === 'exact') requireValue(levels.includes('exact') && !levels.includes('inferred'), 'inferred evidence cannot substantiate an exact claim')
      if (item.evidence === 'structural') requireValue(levels.some((level) => level !== 'inferred'), 'structural claim needs observed evidence')
    }
  }
  for (const node of nodes.values()) {
    requireValue(NODE_TYPES.includes(node.type) && typeof node.name === 'string', 'invalid node')
    checkRefs(node)
    if (node.semantics) {
      checkRefs(node.semantics)
      requireValue(node.semantics.evidence === 'inferred', 'semantic interpretation must be labeled inferred')
      for (const key of ['terminal', 'primaryValue']) requireValue(node.semantics[key] === undefined || typeof node.semantics[key] === 'boolean', `${key} must be boolean`)
      for (const key of ['purpose', 'state', 'role']) requireValue(node.semantics[key] === undefined || typeof node.semantics[key] === 'string', `${key} must be a string`)
      requireValue(node.semantics.requiredStates === undefined || (Array.isArray(node.semantics.requiredStates) && node.semantics.requiredStates.every((state) => typeof state === 'string')), 'requiredStates must contain strings')
    }
    requireValue(node.inScope === undefined || typeof node.inScope === 'boolean', 'inScope must be boolean')
    requireValue(node.overlaySettings?.dismissOnOutsideClick === undefined || typeof node.overlaySettings.dismissOnOutsideClick === 'boolean', 'outside dismissal must be boolean')
  }
  let count = 0
  const paths = new Map()
  for (const interaction of interactions.values()) {
    requireValue(nodes.has(interaction.from) && typeof interaction.trigger?.type === 'string', 'invalid interaction source/trigger')
    checkRefs(interaction)
    if (interaction.hotspot) for (const key of ['nodeId', 'name', 'text']) requireValue(interaction.hotspot[key] === undefined || typeof interaction.hotspot[key] === 'string', `hotspot.${key} must be a string`)
    const actions = new Map()
    walkActions(interaction.actions, (action, path) => {
      requireValue(++count <= 20000 && ACTION_TYPES.includes(action?.type), 'unknown action or action budget exceeded')
      checkRefs(action)
      if (interaction.evidence === 'exact') requireValue(action.evidence === 'exact', 'an exact interaction cannot contain inferred or structural actions')
      for (const key of ['url', 'variable', 'collection', 'mode']) requireValue(action[key] === undefined || action[key] === null || typeof action[key] === 'string', `${key} must be a string or null`)
      requireValue(action.historyDependent === undefined || typeof action.historyDependent === 'boolean', 'historyDependent must be boolean')
      if (action.resolution !== undefined) requireValue(['resolved', 'missing', 'out-of-scope', 'unavailable'].includes(action.resolution), 'invalid destination resolution')
      if (['navigate', 'overlay', 'swap', 'scroll', 'component-state'].includes(action.type)) {
        requireValue(action.resolution !== undefined, 'targeted action requires destination resolution')
        requireValue(!['resolved', 'out-of-scope'].includes(action.resolution) || Boolean(action.to), 'resolved action requires a target')
        requireValue(!['missing', 'unavailable'].includes(action.resolution) || !action.to, 'unresolved action cannot claim a target')
      }
      if (['back', 'close'].includes(action.type)) requireValue(action.historyDependent === true && !action.to, 'back/close require dynamic history, not a static destination')
      if (action.type === 'external') requireValue(typeof action.url === 'string', 'external action requires a URL string')
      if (action.type === 'set-variable') requireValue(Object.hasOwn(action, 'variable') && Object.hasOwn(action, 'value'), 'mutation requires variable and value (null if unknown)')
      if (action.type === 'set-variable-mode') requireValue(Object.hasOwn(action, 'collection') && Object.hasOwn(action, 'mode'), 'mode mutation requires collection and mode')
      if (action.to) requireValue(nodes.has(action.to), 'action references an absent node')
      if (action.type === 'conditional') requireValue(action.branches.every((branch) => Object.hasOwn(branch, 'condition')), 'branch condition must be explicit (null means else)')
      actions.set(path, action)
    })
    paths.set(interaction.id, actions)
  }
  const projected = projectEdges(ir.interactions)
  requireValue(projected.length === ir.edges.length, 'edge projection is incomplete or duplicated')
  const expectedEdges = new Map(projected.map((edge) => [`${edge.interactionId}/${edge.actionPath}`, edge]))
  const projectedKeys = new Set()
  for (const edge of edges.values()) {
    const projectionKey = `${edge.interactionId}/${edge.actionPath}`
    const expected = expectedEdges.get(projectionKey)
    requireValue(expected && !projectedKeys.has(projectionKey), 'duplicate or nonexistent projected action')
    projectedKeys.add(projectionKey)
    for (const key of ['category', 'resolution', 'evidence']) requireValue(edge[key] === expected[key], `projection ${key} disagrees with action`)
    requireValue(Boolean(edge.historyDependent) === Boolean(expected.historyDependent), 'projection history dependency disagrees with action')
    requireValue(Boolean(edge.brokenDestination) === Boolean(expected.brokenDestination), 'projection broken destination disagrees with action')
    requireValue(JSON.stringify(edge.branchPath) === JSON.stringify(expected.branchPath), 'projection loses branch ancestry')
    requireValue(JSON.stringify([...(edge.evidenceRefs || [])].sort()) === JSON.stringify([...expected.evidenceRefs].sort()), 'projection evidence disagrees with action')
    requireValue(nodes.has(edge.from) && (!edge.to || nodes.has(edge.to)), 'edge references an absent node')
    const interaction = interactions.get(edge.interactionId)
    const action = paths.get(edge.interactionId)?.get(edge.actionPath)
    requireValue(interaction && action && edge.from === interaction.from, 'edge has no matching interaction/action')
    requireValue(edge.action?.type === action.type && edge.to === action.to, 'edge projection disagrees with authoritative action')
    requireValue(CATEGORIES.includes(edge.category) && Array.isArray(edge.branchPath), 'invalid edge classification')
    requireValue(edge.brokenDestination === undefined || edge.brokenDestination === (action.resolution === 'missing'), 'invalid broken destination claim')
    checkRefs(edge)
  }
  const allActions = [...paths.values()].flatMap((actions) => [...actions.values()])
  const inferred = allActions.some((action) => action.evidence === 'inferred')
  const observed = allActions.some((action) => action.evidence !== 'inferred')
  requireValue(ir.mode !== 'exact' || !inferred, 'exact mode contains inferred edges')
  requireValue(ir.mode !== 'inferred' || !observed, 'inferred mode contains observed edges')
  requireValue(ir.mode !== 'hybrid' || (inferred && observed), 'hybrid requires both observed and inferred edges')
  for (const flow of ir.flows) {
    requireValue(typeof flow.name === 'string' && (!flow.startingPoint || nodes.has(flow.startingPoint)), 'invalid starting point')
    requireValue(Array.isArray(flow.nodeIds) && flow.nodeIds.every((id) => nodes.has(id)), 'invalid flow node membership')
    requireValue(Array.isArray(flow.edgeIds) && flow.edgeIds.every((id) => edges.has(id)), 'invalid flow edge membership')
    checkRefs(flow)
  }
  for (const issue of ir.issues) {
    requireValue(['low', 'medium', 'high'].includes(issue.severity) && ['low', 'medium', 'high'].includes(issue.confidence), 'invalid issue severity/confidence')
    requireValue(['type', 'title', 'observation', 'interpretation', 'recommendation'].every((key) => typeof issue[key] === 'string'), 'incomplete finding')
    requireValue(Array.isArray(issue.affectedNodes) && issue.affectedNodes.every((id) => nodes.has(id)), 'invalid finding nodes')
    checkRefs(issue, false)
  }
  requireValue(Array.isArray(ir.verification), 'verification must be an array')
  for (const record of ir.verification) {
    requireValue(['test', 'browser'].includes(record.kind) && ['verified', 'failed', 'stale', 'unverified'].includes(record.status), 'invalid verification record')
    requireValue(Array.isArray(record.path) && record.path.length > 0 && record.path.every((id) => nodes.has(id)), 'verification needs a concrete path')
    checkRefs(record, false)
    if (record.status === 'verified') {
      requireValue(ir.view === 'current' && ir.source.revision && record.sourceRevision === ir.source.revision, 'verified evidence is stale or has no source revision')
      requireValue(typeof record.conditions === 'string' && record.conditions.length > 0, 'verification needs execution conditions')
      requireValue(record.evidenceRefs.some((ref) => evidence.get(ref).sourceKind === record.kind), 'static evidence is not execution verification')
    }
  }
  requireValue(ir.statistics && typeof ir.statistics === 'object', 'statistics is required')
  return true
}

export function normalizeFlow(input) {
  const ir = structuredClone(input)
  ir.issues ??= []
  ir.statistics ??= {}
  ir.verification ??= []
  validateFlow(ir)
  return ir
}

const navigation = { NAVIGATE: 'navigate', OVERLAY: 'overlay', SWAP: 'swap', SCROLL_TO: 'scroll', CHANGE_TO: 'component-state' }
const categories = { navigate: 'product-navigation', back: 'product-navigation', overlay: 'overlay', swap: 'overlay', close: 'overlay', scroll: 'scroll', 'component-state': 'component-state', external: 'external', 'set-variable': 'variable-state', 'set-variable-mode': 'variable-state' }

export function projectEdges(interactions) {
  const edges = []
  for (const interaction of interactions) walkActions(interaction.actions, (action, actionPath, branchPath) => {
    if (action.type === 'conditional') return
    const edge = { id: `${interaction.id}:${actionPath}`, from: interaction.from, interactionId: interaction.id, actionPath, branchPath, category: categories[action.type] || 'unknown', action: { type: action.type }, evidence: action.evidence, evidenceRefs: action.evidenceRefs }
    for (const key of ['to', 'resolution', 'historyDependent']) if (action[key] !== undefined) edge[key] = action[key]
    if (action.resolution) edge.brokenDestination = action.resolution === 'missing'
    edges.push(edge)
  })
  return edges
}

export function normalizeFigma(snapshot, { mode = 'auto' } = {}) {
  requireValue(['auto', 'exact', 'hybrid', 'inferred'].includes(mode), 'invalid requested mode')
  requireValue(snapshot?.source?.type === 'figma', 'a Figma snapshot is required')
  const raw = indexById(snapshot.nodes, 'snapshot nodes')
  requireValue(raw.size <= 20000, 'snapshot node budget exceeded')
  const ir = {
    schema_version: '1.0', source: structuredClone(snapshot.source), view: 'current', mode: 'inferred',
    coverage: structuredClone(snapshot.coverage), nodes: [], interactions: [], edges: [], flows: [], evidence: [], issues: [], statistics: {}, verification: [],
  }
  requireValue(ir.coverage && Array.isArray(ir.coverage.limitations), 'snapshot coverage is required')
  const evidenceIds = new Set()
  const evidence = (id, level, locator, observation) => {
    if (!evidenceIds.has(id)) { ir.evidence.push({ id, level, sourceKind: 'figma', locator, observation }); evidenceIds.add(id) }
    return id
  }
  const scopeRef = evidence('scope', 'structural', 'snapshot.coverage', ir.coverage)
  const included = new Map()
  function screenFor(node) {
    if (node?.screenId && raw.has(node.screenId)) return raw.get(node.screenId)
    let current = node
    let screen
    const seen = new Set()
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (['FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(current.type)) screen = current
      if (current.type === 'SECTION' || current.type === 'PAGE' || current.type === 'CANVAS') break
      current = raw.get(current.parentId)
    }
    return screen || node
  }
  function addNode(node, type = 'screen') {
    if (!included.has(node.id)) {
      const ref = evidence(`node:${node.id}`, 'structural', `nodes[${JSON.stringify(node.id)}]`, { name: node.name, type: node.type, parentId: node.parentId ?? null })
      const item = { id: node.id, sourceId: node.id, name: node.name || node.id, type, evidence: 'structural', evidenceRefs: [ref] }
      for (const key of ['page', 'section', 'inScope', 'overlaySettings']) if (node[key] !== undefined) item[key] = structuredClone(node[key])
      included.set(node.id, item)
      ir.nodes.push(item)
    }
    return included.get(node.id)
  }
  for (const node of raw.values()) {
    if (['FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(node.type) && screenFor(node)?.id === node.id) addNode(node, node.type.startsWith('COMPONENT') ? 'state' : 'screen')
  }
  let actionCount = 0
  function convert(actions, interaction, prefix = 'actions', depth = 0) {
    requireValue(Array.isArray(actions) && depth < 64, 'invalid or excessively nested prototype actions')
    return actions.map((input, index) => {
      requireValue(input && typeof input === 'object' && ++actionCount <= 20000, 'invalid prototype action or action budget exceeded')
      const path = `${prefix}.${index}`
      const ref = evidence(`${interaction.id}:${path}`, 'exact', `${interaction.sourceLocator}.${path}`, input)
      const common = { evidence: 'exact', evidenceRefs: [ref] }
      if (input.type === 'CONDITIONAL') {
        if (!Array.isArray(input.conditionalBlocks)) throw new Error('Conditional action has no conditionalBlocks array')
        return { ...common, type: 'conditional', branches: input.conditionalBlocks.map((branch, i) => ({ condition: structuredClone(branch.condition ?? null), actions: convert(branch.actions, interaction, `${path}.branches.${i}.actions`, depth + 1) })) }
      }
      let action
      if (input.type === 'NODE') {
        const type = navigation[input.navigation] || 'unsupported'
        const target = raw.get(input.destinationId)
        const targetNode = target && (['scroll', 'component-state'].includes(type) ? target : screenFor(target))
        let resolution = snapshot.resolutions?.[input.destinationId] || 'unavailable'
        if (input.destinationId === null) resolution = 'missing'
        if (targetNode) resolution = target.inScope === false ? 'out-of-scope' : 'resolved'
        action = { ...common, type, resolution, targetSourceId: input.destinationId ?? null, transition: structuredClone(input.transition ?? null) }
        if (targetNode) {
          const node = addNode(targetNode, { scroll: 'section', 'component-state': 'state' }[type] || 'screen')
          if (type === 'overlay' || type === 'swap') node.type = 'overlay'
          action.to = node.id
        }
        if (resolution === 'unavailable') {
          ir.coverage.status = ir.coverage.status === 'unavailable' ? 'unavailable' : 'partial'
          ir.coverage.limitations.push(`Destination ${String(input.destinationId)} could not be resolved.`)
        }
      } else if (input.type === 'BACK' || input.type === 'CLOSE') action = { ...common, type: input.type.toLowerCase(), historyDependent: true }
      else if (input.type === 'URL') {
        action = { ...common, type: 'external', url: input.url ?? '' }
        const id = `external:${interaction.id}:${path}`
        ir.nodes.push({ id, name: input.url || 'External destination', type: 'external', evidence: 'exact', evidenceRefs: [ref] })
        action.to = id
      } else if (input.type === 'SET_VARIABLE') action = { ...common, type: 'set-variable', variable: input.variableId ?? null, value: structuredClone(input.variableValue ?? null) }
      else if (input.type === 'SET_VARIABLE_MODE') action = { ...common, type: 'set-variable-mode', collection: input.variableCollectionId ?? null, mode: input.variableModeId ?? null }
      else action = { ...common, type: 'unsupported' }
      // Provider payload is opaque provenance, not a contract the analyzer interprets.
      action.payload = structuredClone(input)
      if (action.type === 'unsupported') {
        ir.coverage.status = ir.coverage.status === 'unavailable' ? 'unavailable' : 'partial'
        ir.coverage.limitations.push(`Unsupported action at ${interaction.sourceLocator}.${path}; preserved without execution.`)
      }
      return action
    })
  }
  for (const node of raw.values()) {
    if (node.inScope === false) continue
    requireValue(node.reactions === undefined || Array.isArray(node.reactions), 'reactions must be an array when available')
    for (const [index, reaction] of (node.reactions || []).entries()) {
      const sourceNode = screenFor(node)
      const isComponent = String(sourceNode.type).startsWith('COMPONENT')
      const screen = addNode(sourceNode, isComponent ? 'state' : 'screen')
      const id = `interaction:${node.id}:${index}`
      const locator = `nodes[${JSON.stringify(node.id)}].reactions.${index}`
      const ref = evidence(id, 'exact', locator, reaction)
      const interaction = { id, from: screen.id, trigger: structuredClone(reaction.trigger || { type: 'UNKNOWN' }), hotspot: { nodeId: node.id, name: node.name || node.id, ...(node.text ? { text: node.text } : {}) }, actions: [], evidence: 'exact', evidenceRefs: [ref] }
      if (!Array.isArray(reaction.actions)) {
        ir.coverage.status = 'partial'
        ir.coverage.limitations.push(`Reaction ${id} has no supported actions array.`)
      }
      interaction.actions = convert(reaction.actions || [], { ...interaction, sourceLocator: locator })
      ir.interactions.push(interaction)
    }
  }
  ir.edges = projectEdges(ir.interactions)
  for (const [index, start] of (snapshot.startingPoints || []).entries()) {
    const target = raw.get(start.nodeId)
    const level = start.evidence || 'exact'
    const ref = evidence(`start:${index}`, level, `startingPoints.${index}`, start)
    if (!target) {
      ir.coverage.status = 'partial'
      ir.coverage.limitations.push(`Starting point ${start.nodeId} is unresolved.`)
      continue
    }
    const screen = addNode(screenFor(target))
    ir.flows.push({ id: `flow:${index}:${start.nodeId}`, name: start.name || screen.name, startingPoint: screen.id, nodeIds: [], edgeIds: [], evidence: level, evidenceRefs: [ref] })
  }
  if (!ir.flows.length) ir.flows.push({ id: 'unassigned', name: 'Unassigned scope (entry point unknown)', nodeIds: ir.nodes.map((node) => node.id), edgeIds: ir.edges.map((edge) => edge.id), evidence: 'structural', evidenceRefs: [scopeRef] })
  ir.mode = ir.interactions.length ? 'exact' : 'inferred'
  if (!ir.interactions.length && ir.coverage.status === 'complete') ir.coverage.limitations.push('No prototype reactions detected. Switching to inference mode; no connections have been invented.')
  if (mode === 'exact' && (!ir.interactions.length || ir.coverage.status === 'unavailable')) throw new Error('Exact mode requires accessible prototype reactions.')
  if (mode === 'inferred' && ir.interactions.length) throw new Error('Inferred mode cannot replace observed prototype reactions.')
  if (mode === 'hybrid') throw new Error('Hybrid requires separately evidenced inferred connections; supply an enriched Flow IR.')
  ir.coverage.limitations = [...new Set(ir.coverage.limitations)]
  validateFlow(ir)
  return ir
}
