/** Load official figma-use guidance, then pass buildExtractionCode(options) to use_figma.
 * One already-active page per invocation. Never switches pages or writes nodes.
 */
function boundedOptions(input) {
  const limits = { maxNodes: [5000, 20000], maxDepth: [100, 200], maxDestinations: [500, 2000], maxActions: [20000, 50000], maxActionDepth: [48, 60] }
  const options = {}
  for (const [key, [fallback, maximum]] of Object.entries(limits)) {
    const value = input[key] ?? fallback
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${key} must be an integer from 1 to ${maximum}`)
    options[key] = value
  }
  if (input.nodeId !== undefined) {
    if (typeof input.nodeId !== 'string' || !input.nodeId.length) throw new Error('nodeId must be a nonempty string')
    options.nodeId = input.nodeId
  }
  return options
}

function lineage(node) {
  const chain = []
  const seen = new Set()
  for (let current = node; current; current = current.parent) {
    if (seen.has(current) || chain.length > 256) throw new Error('Invalid or excessively deep node ancestry')
    chain.push(current)
    seen.add(current)
    if (['PAGE', 'CANVAS'].includes(current.type)) break
  }
  return chain
}

function identity(node) {
  const chain = lineage(node)
  const page = chain.find((item) => ['PAGE', 'CANVAS'].includes(item.type))
  const screen = [...chain].reverse().find((item) => ['FRAME', 'COMPONENT', 'INSTANCE'].includes(item.type))
  const section = chain.find((item) => item.type === 'SECTION')
  const record = { id: String(node.id), name: String(node.name ?? node.id), type: String(node.type ?? 'UNKNOWN') }
  if (node.parent?.id) record.parentId = String(node.parent.id)
  if (page) { record.page = String(page.name); record.pageId = String(page.id) }
  if (screen) record.screenId = String(screen.id)
  if (section) record.section = String(section.name)
  return { record, screen, page }
}

function serialize(value, budget, depth = 0, ancestors = new Set()) {
  if (++budget.count > budget.maximum || depth > budget.depth) throw new Error('Reaction serialization budget reached')
  if (value === undefined) return undefined
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return value
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Non-serializable prototype data')
  const next = new Set(ancestors).add(value)
  if (Array.isArray(value)) return value.map((item) => serialize(item, budget, depth + 1, next) ?? null)
  const result = Object.create(null)
  for (const key of Object.keys(value)) {
    const serialized = serialize(value[key], budget, depth + 1, next)
    if (serialized !== undefined) result[key] = serialized
  }
  return result
}

function destinationIds(reactions) {
  const ids = new Set()
  const stack = [reactions]
  while (stack.length) {
    const value = stack.pop()
    if (!value || typeof value !== 'object') continue
    if (value.type === 'NODE' && typeof value.destinationId === 'string') ids.add(value.destinationId)
    stack.push(...Object.values(value).filter((item) => item && typeof item === 'object'))
  }
  return ids
}

export async function extractFigma(figma, input = {}) {
  const options = boundedOptions(input)
  const page = figma.currentPage
  if (!page) throw new Error('Figma current page is unavailable')
  const result = {
    source: { type: 'figma', page: String(page.name), pageId: String(page.id), scope: { nodeId: options.nodeId || String(page.id) } },
    coverage: { status: 'complete', limitations: [] }, nodes: [], startingPoints: [], resolutions: {},
  }
  if (typeof figma.fileKey === 'string') result.source.file = figma.fileKey
  const partial = (message) => {
    if (result.coverage.status !== 'unavailable') result.coverage.status = 'partial'
    if (!result.coverage.limitations.includes(message)) result.coverage.limitations.push(message)
  }
  const budget = { count: 0, maximum: options.maxActions, depth: options.maxActionDepth }
  const records = new Map()
  const destinations = new Set()
  let reactionCapabilities = 0
  function addDescriptor(node, inScope = true) {
    if (records.has(String(node.id))) return records.get(String(node.id))
    if (records.size >= options.maxNodes) { partial('Node budget reached; remaining nodes were not read.'); return undefined }
    const { record } = identity(node)
    record.inScope = inScope
    records.set(record.id, record)
    result.nodes.push(record)
    return record
  }
  let root = page
  if (options.nodeId && options.nodeId !== String(page.id)) {
    try {
      if (typeof figma.getNodeByIdAsync !== 'function') throw new Error('Node lookup capability unavailable')
      root = await figma.getNodeByIdAsync(options.nodeId)
      if (!root || identity(root).page?.id !== page.id) throw new Error('Requested node is missing or outside the active page')
    } catch (error) {
      result.coverage.status = 'unavailable'
      partial(`Scope unavailable: ${error.message}`)
      return result
    }
  }
  const stack = [{ node: root, depth: 0 }]
  const visited = new Set()
  while (stack.length) {
    const { node, depth } = stack.pop()
    if (visited.has(String(node.id))) continue
    if (depth > options.maxDepth || visited.size >= options.maxNodes) { partial('Traversal depth/node budget reached.'); break }
    visited.add(String(node.id))
    let record
    try {
      record = addDescriptor(node)
      if (!record) break
      const { screen } = identity(node)
      if (screen && screen !== node) addDescriptor(screen)
      if ('reactions' in node) {
        reactionCapabilities += 1
        if (!Array.isArray(node.reactions)) throw new Error('Reaction property is not an accessible array')
        record.reactions = serialize(node.reactions, budget)
        for (const id of destinationIds(record.reactions)) destinations.add(id)
      }
      if (typeof node.characters === 'string') record.text = node.characters
      const overlay = node.overlaySettings ? serialize(node.overlaySettings, budget) : {}
      if ('overlayBackgroundInteraction' in node) overlay.overlayBackgroundInteraction = node.overlayBackgroundInteraction
      if (Object.keys(overlay).length) record.overlaySettings = overlay
    } catch (error) {
      if (record) record.reactionsUnavailable = true
      partial(`Node ${String(node.id)} could not be fully read: ${error.message}`)
    }
    try {
      if ('children' in node) {
        const children = node.children
        if (!Array.isArray(children)) throw new Error('Children are unavailable')
        const available = Math.max(0, options.maxNodes - visited.size - stack.length)
        if (children.length > available) partial('Child traversal budget reached.')
        for (let index = Math.min(children.length, available) - 1; index >= 0; index -= 1) stack.push({ node: children[index], depth: depth + 1 })
      }
    } catch (error) { partial(`Children of ${String(node.id)} unavailable: ${error.message}`) }
  }
  if (reactionCapabilities === 0) {
    result.coverage.status = 'unavailable'
    partial('No reaction-reading capability was exposed in the inspected scope; this is not evidence of zero reactions.')
  }
  try {
    if (!Array.isArray(page.flowStartingPoints)) throw new Error('flowStartingPoints unavailable')
    for (const start of page.flowStartingPoints) if (records.has(String(start.nodeId))) result.startingPoints.push({ nodeId: String(start.nodeId), name: String(start.name), provenance: 'flowStartingPoints' })
    const legacy = page.prototypeStartNodeId || page.prototypeStartNode?.id
    if (legacy && records.has(String(legacy)) && !result.startingPoints.some((start) => start.nodeId === String(legacy))) result.startingPoints.push({ nodeId: String(legacy), name: records.get(String(legacy)).name, provenance: 'legacy' })
  } catch (error) { partial(`Entry-point metadata incomplete: ${error.message}`) }
  let lookups = 0
  for (const id of destinations) {
    if (records.has(id)) continue
    if (lookups >= options.maxDestinations) { partial('Destination lookup budget reached.'); break }
    lookups += 1
    try {
      if (typeof figma.getNodeByIdAsync !== 'function') throw new Error('Node lookup unavailable')
      const destination = await figma.getNodeByIdAsync(id)
      if (!destination) { result.resolutions[id] = 'missing'; continue }
      const { screen } = identity(destination)
      if (screen && screen !== destination) addDescriptor(screen, false)
      if (!addDescriptor(destination, false)) result.resolutions[id] = 'unavailable'
    } catch (error) {
      result.resolutions[id] = 'unavailable'
      partial(`Destination ${id} unavailable: ${error.message}`)
    }
  }
  return result
}

export function buildExtractionCode(input = {}) {
  const options = boundedOptions(input)
  const helpers = [boundedOptions, lineage, identity, serialize, destinationIds]
  return `${helpers.map((helper) => helper.toString()).join('\n')}\n${extractFigma.toString()}\nreturn await extractFigma(figma, ${JSON.stringify(options)});`
}
