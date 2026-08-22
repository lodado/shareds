#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const NODE_KINDS = new Set(['agent', 'tool', 'gate', 'join', 'terminal'])
const DISPATCH_MODES = new Set(['one', 'all'])
const JOIN_MODES = new Set(['all', 'any'])

export class GraphValidationError extends Error {
  constructor(issues) {
    super(issues.map(({ code, message }) => `${code}: ${message}`).join('\n'))
    this.name = 'GraphValidationError'
    this.issues = issues
  }
}

export class TransitionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TransitionError'
    this.code = code
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isJsonPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function isRepoRelativeScope(scope) {
  const normalized = scope.replaceAll('\\', '/')
  return !isAbsolute(scope) && !win32.isAbsolute(scope) && !normalized.split('/').includes('..')
}

function isExclusionScope(scope) {
  return scope.startsWith('!')
}

function scopeSegments(scope) {
  return scope
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0)
}

// Pattern-intersection emptiness: '*' matches one segment, '**' matches zero or more.
function globsIntersect(a, b) {
  if (a.length === 0) return b.every((segment) => segment === '**')
  if (b.length === 0) return a.every((segment) => segment === '**')
  const [ha] = a
  const [hb] = b
  if (ha === '**') return globsIntersect(a.slice(1), b) || globsIntersect(a, b.slice(1))
  if (hb === '**') return globsIntersect(a, b.slice(1)) || globsIntersect(a.slice(1), b)
  if (ha === '*' || hb === '*' || ha === hb) return globsIntersect(a.slice(1), b.slice(1))
  return false
}

function scopesOverlap(left, right) {
  // Every scope owns its subtree, so compare with an implicit trailing '**'.
  return globsIntersect([...scopeSegments(left), '**'], [...scopeSegments(right), '**'])
}

function canWriteTogether(left, right) {
  // Exclusions narrow what the Controller lets a worker touch; the parallel-write
  // check stays conservative and only compares the positive scopes.
  const a = left.filter((scope) => !isExclusionScope(scope))
  const b = right.filter((scope) => !isExclusionScope(scope))
  return !a.some((leftScope) => b.some((rightScope) => scopesOverlap(leftScope, rightScope)))
}

function reachableFrom(starts, adjacency) {
  const visited = new Set()
  const queue = starts.filter(Boolean)

  while (queue.length > 0) {
    const current = queue.shift()
    if (visited.has(current)) continue
    visited.add(current)
    queue.push(...(adjacency.get(current) ?? []))
  }

  return visited
}

export function validateGraph(graph) {
  const issues = []
  const addIssue = (code, message) => issues.push({ code, message })

  if (!isRecord(graph)) {
    throw new GraphValidationError([{ code: 'GRAPH_INVALID', message: 'graph must be an object' }])
  }

  for (const field of ['id', 'outcome', 'stopCondition', 'entry']) {
    if (!isNonEmptyString(graph[field])) addIssue('GRAPH_FIELD_INVALID', `${field} must be a non-empty string`)
  }

  // ponytail: one graph-wide maxSteps bounds every cycle; add per-cycle counters only when independent loops need them.
  if (!Number.isInteger(graph.maxSteps) || graph.maxSteps <= 0) {
    addIssue('MAX_STEPS_INVALID', 'maxSteps must be a positive integer')
  }

  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    addIssue('NODES_INVALID', 'nodes must be a non-empty array')
  }
  if (!Array.isArray(graph.edges)) addIssue('EDGES_INVALID', 'edges must be an array')
  if (!isStringArray(graph.terminals) || graph.terminals.length === 0) {
    addIssue('TERMINALS_INVALID', 'terminals must be a non-empty string array')
  }
  if (graph.context !== undefined && !isStringArray(graph.context)) {
    addIssue('GRAPH_CONTEXT_INVALID', 'context must be a string array of externally provided input fields')
  }
  if (graph.fallback !== undefined && !Array.isArray(graph.fallback)) {
    addIssue('FALLBACK_INVALID', 'fallback must be an array of { when, to } rules')
  }

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const fallback = Array.isArray(graph.fallback) ? graph.fallback : []
  const terminals = isStringArray(graph.terminals) ? graph.terminals : []
  const nodeById = new Map()

  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node)) {
      addIssue('NODE_INVALID', `nodes[${index}] must be an object`)
      continue
    }
    if (!isNonEmptyString(node.id)) {
      addIssue('NODE_ID_INVALID', `nodes[${index}].id must be a non-empty string`)
      continue
    }
    if (nodeById.has(node.id)) addIssue('NODE_ID_DUPLICATE', `${node.id} is declared more than once`)
    else nodeById.set(node.id, node)

    if (!NODE_KINDS.has(node.kind)) addIssue('NODE_KIND_INVALID', `${node.id}: unsupported kind ${node.kind}`)
    if (!isNonEmptyString(node.task)) addIssue('NODE_TASK_INVALID', `${node.id}: task must be a non-empty string`)
    if (!isStringArray(node.input)) addIssue('NODE_INPUT_INVALID', `${node.id}: input must be a string array`)
    if (!isStringArray(node.output)) addIssue('NODE_OUTPUT_INVALID', `${node.id}: output must be a string array`)
    if (!isStringArray(node.writeScope)) {
      addIssue('NODE_WRITE_SCOPE_INVALID', `${node.id}: writeScope must be a string array`)
    } else {
      for (const scope of node.writeScope) {
        const target = isExclusionScope(scope) ? scope.slice(1) : scope
        if (!isNonEmptyString(target) || !isRepoRelativeScope(target)) {
          addIssue('NODE_WRITE_SCOPE_OUTSIDE_REPO', `${node.id}: writeScope must stay inside the target repository`)
        }
      }
    }
    if (node.kind === 'agent' && !isNonEmptyString(node.owner)) {
      addIssue('NODE_OWNER_MISSING', `${node.id}: agent nodes require an owner role`)
    }
    if (node.retryLimit !== undefined && (!Number.isInteger(node.retryLimit) || node.retryLimit < 0)) {
      addIssue('NODE_RETRY_INVALID', `${node.id}: retryLimit must be a non-negative integer`)
    }
    if (node.dispatch !== undefined && !DISPATCH_MODES.has(node.dispatch)) {
      addIssue('NODE_DISPATCH_INVALID', `${node.id}: dispatch must be one or all`)
    }
    if (node.kind === 'join' && !JOIN_MODES.has(node.join)) {
      addIssue('NODE_JOIN_INVALID', `${node.id}: join nodes require join: all or any`)
    }
  }

  if (isNonEmptyString(graph.entry) && !nodeById.has(graph.entry)) {
    addIssue('ENTRY_UNKNOWN', `${graph.entry} does not identify a node`)
  }

  if (new Set(terminals).size !== terminals.length) {
    addIssue('TERMINAL_DUPLICATE', 'terminals must not contain duplicates')
  }
  for (const terminal of terminals) {
    const node = nodeById.get(terminal)
    if (!node) addIssue('TERMINAL_UNKNOWN', `${terminal} does not identify a node`)
    else if (node.kind !== 'terminal') addIssue('TERMINAL_KIND_INVALID', `${terminal} must have kind terminal`)
  }

  const adjacency = new Map([...nodeById.keys()].map((id) => [id, []]))
  const reverseAdjacency = new Map([...nodeById.keys()].map((id) => [id, []]))
  const outgoing = new Map([...nodeById.keys()].map((id) => [id, []]))
  const edgeSignatures = new Set()

  for (const [index, edge] of edges.entries()) {
    if (!isRecord(edge)) {
      addIssue('EDGE_INVALID', `edges[${index}] must be an object`)
      continue
    }

    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    if (!source) addIssue('EDGE_SOURCE_UNKNOWN', `edges[${index}] references unknown source ${edge.from}`)
    if (!target) addIssue('EDGE_TARGET_UNKNOWN', `edges[${index}] references unknown target ${edge.to}`)

    if (source && target) {
      adjacency.get(edge.from).push(edge.to)
      reverseAdjacency.get(edge.to).push(edge.from)
      outgoing.get(edge.from).push(edge)
    }

    const signature = JSON.stringify([edge.from, edge.to, edge.when])
    if (edgeSignatures.has(signature)) addIssue('EDGE_DUPLICATE', `edges[${index}] duplicates another edge`)
    else edgeSignatures.add(signature)

    if (edge.when === 'always') continue
    if (!isRecord(edge.when) || !isNonEmptyString(edge.when.field) || !Object.hasOwn(edge.when, 'equals')) {
      addIssue('EDGE_CONDITION_INVALID', `edges[${index}] must use always or { field, equals }`)
      continue
    }
    if (!isJsonPrimitive(edge.when.equals)) {
      addIssue('EDGE_CONDITION_INVALID', `edges[${index}].when.equals must be a JSON primitive`)
    }
    if (source && (!Array.isArray(source.output) || !source.output.includes(edge.when.field))) {
      addIssue(
        'EDGE_FIELD_UNDECLARED',
        `edges[${index}] reads ${edge.when.field}, which ${edge.from} does not declare as output`,
      )
    }
  }

  const fallbackSignatures = new Set()
  const fallbackTargets = []

  for (const [index, rule] of fallback.entries()) {
    if (!isRecord(rule)) {
      addIssue('FALLBACK_RULE_INVALID', `fallback[${index}] must be an object`)
      continue
    }
    if (!nodeById.has(rule.to)) {
      addIssue('FALLBACK_TARGET_UNKNOWN', `fallback[${index}] references unknown target ${rule.to}`)
    } else {
      fallbackTargets.push(rule.to)
    }
    if (!isRecord(rule.when) || !isNonEmptyString(rule.when.field) || !Object.hasOwn(rule.when, 'equals')) {
      addIssue('FALLBACK_CONDITION_INVALID', `fallback[${index}] must use { field, equals }`)
      continue
    }
    if (!isJsonPrimitive(rule.when.equals)) {
      addIssue('FALLBACK_CONDITION_INVALID', `fallback[${index}].when.equals must be a JSON primitive`)
    }
    const signature = JSON.stringify([rule.when.field, rule.when.equals])
    if (fallbackSignatures.has(signature)) {
      addIssue('FALLBACK_DUPLICATE', `fallback[${index}] repeats a condition another rule already claims`)
    } else fallbackSignatures.add(signature)
  }

  for (const terminal of terminals) {
    if ((outgoing.get(terminal) ?? []).length > 0) {
      addIssue('TERMINAL_HAS_EDGE', `${terminal} must not have outgoing edges`)
    }
  }

  // Fallback applies from every non-terminal node, so reachability must see those routes.
  const routeAdjacency = new Map([...adjacency].map(([id, targets]) => [id, [...targets]]))
  const reverseRouteAdjacency = new Map([...reverseAdjacency].map(([id, sources]) => [id, [...sources]]))
  for (const [id, node] of nodeById) {
    if (node.kind === 'terminal') continue
    for (const target of fallbackTargets) {
      routeAdjacency.get(id).push(target)
      reverseRouteAdjacency.get(target).push(id)
    }
  }

  if (nodeById.has(graph.entry)) {
    const reachable = reachableFrom([graph.entry], routeAdjacency)
    for (const id of nodeById.keys()) {
      if (!reachable.has(id)) addIssue('NODE_UNREACHABLE', `${id} is not reachable from ${graph.entry}`)
    }
  }

  const reachesTerminal = reachableFrom(
    terminals.filter((id) => nodeById.has(id)),
    reverseRouteAdjacency,
  )
  for (const id of nodeById.keys()) {
    if (!reachesTerminal.has(id)) {
      addIssue('TERMINAL_UNREACHABLE_FROM_NODE', `${id} has no path to a terminal`)
    }
  }

  const contextFields = new Set(isStringArray(graph.context) ? graph.context : [])
  for (const node of nodeById.values()) {
    if (!isStringArray(node.input)) continue
    // Only a fallback target may count the graph-wide route as a producer; every other node keeps
    // the strict explicit-edge check, or one fallback rule would satisfy every input in the graph.
    const reverse = fallbackTargets.includes(node.id) ? reverseRouteAdjacency : reverseAdjacency
    const producers = reachableFrom(reverse.get(node.id) ?? [], reverse)
    const available = new Set(contextFields)
    for (const producerId of producers) {
      const producer = nodeById.get(producerId)
      if (isStringArray(producer?.output)) for (const field of producer.output) available.add(field)
    }
    for (const field of node.input) {
      if (!available.has(field)) {
        addIssue(
          'NODE_INPUT_UNSATISFIED',
          `${node.id}: input ${field} is not produced by any upstream node output or declared graph context`,
        )
      }
    }
  }

  for (const source of nodes.filter((node) => isRecord(node) && node.dispatch === 'all')) {
    const targets = (outgoing.get(source.id) ?? [])
      .map(({ to }) => nodeById.get(to))
      .filter((node) => node?.kind === 'agent')

    for (let left = 0; left < targets.length; left += 1) {
      for (let right = left + 1; right < targets.length; right += 1) {
        const leftScope = isStringArray(targets[left].writeScope) ? targets[left].writeScope : []
        const rightScope = isStringArray(targets[right].writeScope) ? targets[right].writeScope : []
        if (!canWriteTogether(leftScope, rightScope)) {
          addIssue(
            'PARALLEL_WRITE_CONFLICT',
            `${source.id} fans out to overlapping writers ${targets[left].id} and ${targets[right].id}`,
          )
        }
      }
    }
  }

  if (issues.length > 0) throw new GraphValidationError(issues)
  return graph
}

export function selectTransitions(graph, nodeId, output) {
  validateGraph(graph)

  const node = graph.nodes.find(({ id }) => id === nodeId)
  if (!node) throw new TransitionError('NODE_UNKNOWN', `${nodeId} does not identify a node`)
  if (!isRecord(output)) throw new TransitionError('OUTPUT_INVALID', 'node output must be an object')
  if (node.kind === 'terminal') return []

  const matched = graph.edges.filter(
    (edge) => edge.from === nodeId && (edge.when === 'always' || output[edge.when.field] === edge.when.equals),
  )

  if (matched.length === 0) {
    // A node-specific edge always wins, so a node can opt out of a graph-wide route by declaring its own.
    const rescued = (graph.fallback ?? []).filter((rule) => output[rule.when.field] === rule.when.equals)
    if (rescued.length > 1) {
      throw new TransitionError('AMBIGUOUS_TRANSITION', `${nodeId} output matches ${rescued.length} fallback rules`)
    }
    if (rescued.length === 1) return [rescued[0].to]
    throw new TransitionError('NO_TRANSITION', `${nodeId} output matches no edge or fallback rule`)
  }
  if ((node.dispatch ?? 'one') === 'one' && matched.length > 1) {
    throw new TransitionError('AMBIGUOUS_TRANSITION', `${nodeId} output matches ${matched.length} edges`)
  }

  return matched.map(({ to }) => to)
}

// The Controller appends node.completed before asking for the next transition,
// so the events ledger is the runtime state that bounds maxSteps and joins.
export function enforceRuntimeBounds(graph, nodeId, events) {
  if (!Array.isArray(events)) throw new TransitionError('EVENTS_INVALID', 'events must be an array')
  const completed = events.filter((event) => isRecord(event) && event.type === 'node.completed')

  if (completed.length >= graph.maxSteps) {
    throw new TransitionError(
      'MAX_STEPS_EXCEEDED',
      `${completed.length} completed node runs reach maxSteps ${graph.maxSteps}`,
    )
  }

  const node = graph.nodes.find(({ id }) => id === nodeId)
  if (node?.kind !== 'join') return

  const predecessors = [...new Set(graph.edges.filter(({ to }) => to === nodeId).map(({ from }) => from))]
  const done = new Set(completed.map((event) => event.node))
  const ready = node.join === 'any' ? predecessors.some((id) => done.has(id)) : predecessors.every((id) => done.has(id))
  if (!ready) {
    throw new TransitionError(
      'JOIN_NOT_READY',
      `${nodeId} requires ${node.join === 'any' ? 'at least one' : 'all'} of ${predecessors.join(', ')} to complete first`,
    )
  }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!['--graph', '--node', '--output', '--events'].includes(flag) || !value) {
      throw new TransitionError('USAGE', `invalid argument ${flag ?? ''}`.trim())
    }
    options[flag.slice(2)] = value
  }
  return options
}

async function readEventsFile(path) {
  let raw
  try {
    raw = await readFile(resolve(path), 'utf8')
  } catch (error) {
    throw new TransitionError('EVENTS_INVALID', `cannot read events: ${error.message}`)
  }
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch {
        throw new TransitionError('EVENTS_INVALID', `events line ${index + 1} is not valid JSON`)
      }
    })
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch (error) {
    throw new TransitionError('JSON_INVALID', `cannot read ${label}: ${error.message}`)
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)

  if (command === 'verify' && options.graph && !options.node && !options.output) {
    const graph = await readJson(options.graph, 'graph')
    validateGraph(graph)
    process.stdout.write(`GRAPH_VALID ${graph.id}\n`)
    return
  }

  if (command === 'next' && options.graph && options.node && options.output) {
    const [graph, output] = await Promise.all([readJson(options.graph, 'graph'), readJson(options.output, 'output')])
    const next = selectTransitions(graph, options.node, output)
    if (options.events) enforceRuntimeBounds(graph, options.node, await readEventsFile(options.events))
    process.stdout.write(`${JSON.stringify({ node: options.node, next })}\n`)
    return
  }

  throw new TransitionError(
    'USAGE',
    'use verify --graph <graph.json> or next --graph <graph.json> --node <id> --output <output.json> [--events <events.jsonl>]',
  )
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((error) => {
    if (error instanceof GraphValidationError) {
      process.stderr.write(`GRAPH_INVALID: ${error.message}\n`)
    } else if (error instanceof TransitionError) {
      process.stderr.write(`${error.code}: ${error.message}\n`)
    } else {
      process.stderr.write(`UNEXPECTED: ${error.message}\n`)
    }
    process.exitCode = 1
  })
}
