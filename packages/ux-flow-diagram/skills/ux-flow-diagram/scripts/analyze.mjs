import { normalizeFlow, walkActions } from './normalize.mjs'

const traversable = (edge) => edge.to && ['product-navigation', 'overlay'].includes(edge.category) && !edge.brokenDestination
const usable = (edge) => !edge.brokenDestination && edge.resolution !== 'unavailable' && (traversable(edge) || ['back', 'close', 'external'].includes(edge.action.type))

function adjacency(ir) {
  const outgoing = new Map(ir.nodes.map((node) => [node.id, []]))
  for (const edge of ir.edges) outgoing.get(edge.from).push(edge)
  return outgoing
}

function overlayEscapes(nodes, outgoing) {
  const reverse = new Map([...nodes.keys()].map((id) => [id, []]))
  const escaped = new Set()
  for (const [id, edges] of outgoing) {
    const settings = nodes.get(id).overlaySettings
    if (settings?.dismissOnOutsideClick === true || settings?.overlayBackgroundInteraction === 'CLOSE_ON_CLICK_OUTSIDE' || edges.some((edge) => usable(edge) && ['close', 'back', 'navigate', 'external'].includes(edge.action.type))) escaped.add(id)
    for (const edge of edges) if (traversable(edge) && edge.category === 'overlay') reverse.get(edge.to).push(id)
  }
  const queue = [...escaped]
  for (let index = 0; index < queue.length; index += 1) for (const previous of reverse.get(queue[index])) if (!escaped.has(previous)) {
    escaped.add(previous)
    queue.push(previous)
  }
  return escaped
}

function reachable(start, outgoing, budget) {
  const distance = new Map([[start, 0]])
  const queue = [start]
  let complete = true
  for (let i = 0; i < queue.length; i += 1) {
    for (const edge of outgoing.get(queue[i]) || []) {
      if (--budget.remaining < 0) { complete = false; break }
      if (traversable(edge) && !distance.has(edge.to)) {
        distance.set(edge.to, distance.get(queue[i]) + 1)
        queue.push(edge.to)
      }
    }
    if (!complete) break
  }
  return { distance, complete }
}

// Iterative SCC detection avoids recursive stack overflow on long prototype paths.
function components(outgoing) {
  const seen = new Set()
  const order = []
  const reverse = new Map([...outgoing.keys()].map((id) => [id, []]))
  const targets = new Map([...outgoing].map(([id, edges]) => [id, edges.filter(traversable).map((edge) => edge.to)]))
  for (const [id, next] of targets) for (const to of next) reverse.get(to).push(id)
  for (const root of outgoing.keys()) {
    if (seen.has(root)) continue
    const stack = [[root, false]]
    while (stack.length) {
      const [id, expanded] = stack.pop()
      if (expanded) { order.push(id); continue }
      if (seen.has(id)) continue
      seen.add(id)
      stack.push([id, true])
      for (const to of targets.get(id)) if (!seen.has(to)) stack.push([to, false])
    }
  }
  seen.clear()
  const result = []
  for (const root of order.reverse()) {
    if (seen.has(root)) continue
    const group = []
    const stack = [root]
    seen.add(root)
    while (stack.length) {
      const id = stack.pop()
      group.push(id)
      for (const previous of reverse.get(id)) if (!seen.has(previous)) { seen.add(previous); stack.push(previous) }
    }
    result.push(group)
  }
  return result
}

export function analyzeFlow(input, { maxTraversals = 250000 } = {}) {
  if (!Number.isSafeInteger(maxTraversals) || maxTraversals < 1) throw new Error('maxTraversals must be a positive integer')
  const ir = normalizeFlow(input)
  ir.issues = ir.issues.filter((issue) => issue.origin !== 'graph')
  const nodes = new Map(ir.nodes.map((node) => [node.id, node]))
  const outgoing = adjacency(ir)
  const canEscapeOverlay = overlayEscapes(nodes, outgoing)
  const interactionById = new Map(ir.interactions.map((interaction) => [interaction.id, interaction]))
  const budget = { remaining: maxTraversals }
  const reached = new Set()
  let complete = ir.coverage.status === 'complete'
  let conditionals = 0
  const add = (type, nodeIds, refs, observation, interpretation, recommendation, severity = 'medium', confidence = 'medium') => {
    ir.issues.push({ id: `graph:${ir.issues.length}:${type}`, origin: 'graph', type, title: type.split('-').join(' '), severity, confidence, affectedNodes: nodeIds, evidenceRefs: [...new Set(refs)], observation, interpretation, recommendation })
  }
  for (const flow of ir.flows) {
    if (!flow.startingPoint) continue
    const result = reachable(flow.startingPoint, outgoing, budget)
    complete &&= result.complete
    for (const id of result.distance.keys()) reached.add(id)
    flow.nodeIds = [...result.distance.keys()]
    flow.edgeIds = ir.edges.filter((edge) => result.distance.has(edge.from)).map((edge) => edge.id)
    flow.statistics = {
      shortestPaths: Object.fromEntries(result.distance),
      longestSimplePathEstimate: { value: null, reason: 'Not computed: general longest-simple-path search is exponential. Shortest paths describe the potential navigation projection, not executed paths.' },
      branchCount: 0, reachabilityComplete: result.complete, projection: 'potential',
    }
    for (const id of flow.nodeIds) {
      const node = nodes.get(id)
      if (node.semantics?.primaryValue && result.distance.get(id) > 0) {
        add('path-length-observation', [flow.startingPoint, id], [...flow.evidenceRefs, ...node.semantics.evidenceRefs], `${result.distance.get(id)} potential navigation transitions from ${flow.name} to ${node.name}.`, 'A shorter grouping may reduce interaction cost; constraints, conditions and history may change the executable route.', 'Compare alternatives against the same user goal; do not shorten the flow by deleting necessary policy or recovery.', 'low')
      }
    }
  }
  if (budget.remaining < 0) ir.coverage.limitations.push('Graph traversal budget reached; reachability findings are incomplete.')
  const hasEntry = ir.flows.some((flow) => flow.startingPoint)
  const screenNodes = ir.nodes.filter((node) => ['screen', 'overlay'].includes(node.type) && node.inScope !== false)
  const deadEnds = []
  const unreachable = []
  for (const node of screenNodes) {
    const edges = outgoing.get(node.id)
    const semantics = node.semantics || {}
    if (hasEntry && complete && !reached.has(node.id)) {
      unreachable.push(node.id)
      add('unreachable', [node.id], node.evidenceRefs, `${node.name} has no path from the captured starting points in the potential graph.`, 'This may be intentional documentation, a showcase, or an unmodeled entry—not necessarily a product defect.', 'Check the screen’s purpose and scope before adding a connection.', 'low')
    }
    if (reached.has(node.id) && !edges.some(usable)) {
      deadEnds.push(node.id)
      if (complete && !semantics.terminal) {
        const problematic = semantics.terminal === false || ['error', 'validation', 'permission-denied', 'offline'].includes(semantics.state)
        add(problematic ? 'missing-recovery-path' : 'structural-dead-end', [node.id], [...node.evidenceRefs, ...(semantics.evidenceRefs || [])], `${node.name} is potentially reachable but has no captured navigation, back, close, or external exit.`, problematic ? 'The supplied non-terminal/error interpretation suggests missing recovery.' : 'A success or intentionally terminal screen can validly end here.', problematic ? 'Consider retry, cancellation, or an alternative route appropriate to the task.' : 'Confirm terminal intent before treating this as a UX problem.', problematic ? 'medium' : 'low')
      }
    }
    if (!complete || !reached.has(node.id)) continue
    if (node.type === 'overlay' && !canEscapeOverlay.has(node.id)) {
      add('overlay-trap', [node.id], node.evidenceRefs, `${node.name} has no captured close/back/navigation or outside-dismiss behavior.`, 'The captured overlay may trap the user; external keyboard/history behavior was not executed.', 'Provide or verify an intentional escape path.')
    }
    if (['wizard', 'settings', 'destructive'].includes(semantics.role) && !edges.some((edge) => ['back', 'close'].includes(edge.action.type)) && !edges.some((edge) => /cancel|exit|back/i.test(interactionById.get(edge.interactionId)?.hotspot?.name || ''))) {
      add('missing-escape-path', [node.id], [...node.evidenceRefs, ...semantics.evidenceRefs], `${node.name} has no explicitly identified cancel/back/close/exit interaction.`, 'The supplied task interpretation may require an escape; labels alone cannot prove its absence.', 'Inspect the intended cancellation behavior and add it only within approved product policy.')
    }
    for (const state of semantics.requiredStates || []) {
      const related = new Set([node.id, ...edges.filter(traversable).map((edge) => edge.to)])
      const found = [...related].some((id) => nodes.get(id)?.semantics?.state === state)
      if (!found) add('potential-missing-state', [node.id], semantics.evidenceRefs, `The supplied task assessment requires ${state}; it is not identified on this screen or immediate navigation targets.`, 'An inline or deeper state may exist. This is a bounded semantic review, not proof of missing implementation.', `Inspect ${state} handling and document the evidence before proposing changes.`, 'medium', 'low')
    }
  }
  for (const edge of ir.edges) if (edge.brokenDestination) {
    add('broken-destination', [edge.from], edge.evidenceRefs, `Action ${edge.actionPath} in ${edge.interactionId} references a confirmed missing destination.`, 'The captured prototype cannot follow this target.', 'Reconnect the action to its intended existing target.', 'high', 'high')
  }
  for (const interaction of ir.interactions) {
    walkActions(interaction.actions, (action) => {
      if (action.type !== 'conditional') return
      conditionals += 1
      for (const flow of ir.flows) if (flow.nodeIds.includes(interaction.from) && flow.statistics) flow.statistics.branchCount += action.branches.length
      if (!action.branches.some((branch) => branch.condition === null)) {
        add('branch-completeness', [interaction.from], action.evidenceRefs, `Conditional in ${interaction.id} has no explicit fallback branch.`, 'No-op fallthrough may be intentional; missing recovery is a possibility, not a certainty.', 'Review false/unmatched conditions and explicitly document the intended outcome.', 'low')
      }
      for (const branch of action.branches) if (branch.actions.length === 0) {
        add('branch-no-op', [interaction.from], action.evidenceRefs, 'A conditional branch contains no actions.', 'The branch may intentionally do nothing.', 'Confirm whether a no-op or a recovery response is intended.', 'low', 'low')
      }
    })
  }
  const byLabel = new Map()
  for (const interaction of ir.interactions) {
    const label = (interaction.hotspot?.text || interaction.hotspot?.name || '').trim().toLowerCase()
    if (!label) continue
    const group = byLabel.get(label) || []
    for (const edge of outgoing.get(interaction.from)) if (edge.interactionId === interaction.id && ['product-navigation', 'overlay', 'external'].includes(edge.category)) group.push(edge)
    byLabel.set(label, group)
  }
  for (const [label, edges] of byLabel) if (new Set(edges.map((edge) => edge.action.type)).size > 1 && new Set(edges.map((edge) => edge.from)).size > 1) {
    add('navigation-consistency', [...new Set(edges.map((edge) => edge.from))], edges.flatMap((edge) => edge.evidenceRefs), `Interactions labeled ${JSON.stringify(label)} use different navigation semantics.`, 'Identical labels need not represent identical tasks.', 'Review whether the difference is intentional.', 'low', 'low')
  }
  if (complete) for (const group of components(outgoing)) {
    const groupSet = new Set(group)
    const looping = group.length > 1 || outgoing.get(group[0]).some((edge) => traversable(edge) && edge.to === group[0])
    const suspect = group.some((id) => ['onboarding', 'wizard'].includes(nodes.get(id).semantics?.role))
    const exits = group.some((id) => nodes.get(id).semantics?.terminal || outgoing.get(id).some((edge) => usable(edge) && (!edge.to || !groupSet.has(edge.to))))
    if (looping && suspect && !exits) add('accidental-loop', group, group.flatMap((id) => [...nodes.get(id).evidenceRefs, ...(nodes.get(id).semantics?.evidenceRefs || [])]), 'The interpreted wizard/onboarding component forms a cycle without a captured exit.', 'The loop may be accidental; ordinary navigation cycles are not defects.', 'Confirm the intended completion/escape transition.')
  }
  const reachabilityComplete = hasEntry && complete
  ir.statistics = {
    screens: screenNodes.length, interactions: ir.interactions.length, flows: ir.flows.length,
    exactEdges: ir.edges.filter((edge) => edge.evidence === 'exact').length,
    structuralEdges: ir.edges.filter((edge) => edge.evidence === 'structural').length,
    inferredEdges: ir.edges.filter((edge) => edge.evidence === 'inferred').length,
    unreachableNodes: reachabilityComplete ? unreachable.length : null,
    deadEnds: hasEntry ? deadEnds.length : null, conditionals,
    overlays: ir.nodes.filter((node) => node.type === 'overlay').length,
    brokenDestinations: ir.edges.filter((edge) => edge.brokenDestination).length,
    reachabilityComplete: hasEntry && complete, projection: 'potential',
  }
  ir.coverage.limitations = [...new Set(ir.coverage.limitations)]
  return ir
}
