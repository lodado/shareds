import { sha256, stableStringify } from './oracle-fs.mjs'

const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
const nodeFor = (observation, depth) => ({ observation, depth, children: new Map() })

function prefixTree(space) {
  if (space.complete !== true) fail('SPACE_INCOMPLETE', 'a finite automaton requires a completely enumerated Space')
  if (!Number.isSafeInteger(space.bound) || space.bound < 1 || !Array.isArray(space.cases) || space.cases.length === 0) {
    fail('SPACE_INVALID', 'Space needs a positive safe bound and at least the initial trace')
  }
  const root = nodeFor(space.initial, 0)
  for (const { trace, observations } of space.cases) {
    if (!Array.isArray(trace) || !Array.isArray(observations) || trace.length !== observations.length || trace.length > space.bound) {
      fail('SPACE_INVALID', 'each trace must fit the bound and have one observation per event')
    }
    let node = root
    for (let index = 0; index < trace.length; index += 1) {
      const event = trace[index]
      const key = stableStringify(event)
      const found = node.children.get(key)
      if (found && stableStringify(found.node.observation) !== stableStringify(observations[index])) {
        fail('SPACE_INCONSISTENT', 'one event prefix has contradictory observations')
      }
      if (!found) node.children.set(key, { key, event, node: nodeFor(observations[index], index + 1) })
      node = node.children.get(key).node
    }
  }
  return root
}

/**
 * A complete bounded Space is a prefix-closed, finite output language. Build its trie before merging
 * anything, then intern exact suffix signatures bottom-up. Equal signatures preserve observations,
 * enabled events and successor classes for every remaining suffix, not just one step of lookahead.
 * The bound is a verification boundary, never evidence that the underlying model has terminated.
 */
export function finiteAutomaton(space) {
  const root = prefixTree(space)
  // A canonical traversal makes class IDs independent of the order in which cases were listed.
  // Iterative traversal also avoids a second recursion limit on long, narrow spaces.
  const ordered = []
  const pending = [root]
  while (pending.length > 0) {
    const node = pending.pop()
    node.edges = [...node.children.values()].sort((left, right) => left.key < right.key ? -1 : Number(left.key > right.key))
    ordered.push(node)
    for (let index = node.edges.length - 1; index >= 0; index -= 1) pending.push(node.edges[index].node)
  }
  const classes = new Map()
  const states = []
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const node = ordered[index]
    const state = {
      observation: node.observation,
      boundary: node.depth === space.bound,
      edges: node.edges.map((edge) => ({ event: edge.event, to: edge.node.classId })),
    }
    const signature = stableStringify(state)
    if (!classes.has(signature)) {
      classes.set(signature, states.length)
      states.push(state)
    }
    node.classId = classes.get(signature)
  }
  const result = {
    version: 1,
    status: 'complete',
    scope: { kind: 'bounded-traces', bound: space.bound, outside: 'unverified' },
    prefixes: ordered.length,
    start: root.classId,
    states,
  }
  return { ...result, digest: sha256(stableStringify(result)) }
}

/** Cards bind the complete automaton by digest without embedding every state and edge in Markdown. */
export function automatonSummary(automaton) {
  const { states, ...summary } = automaton
  return { ...summary, states: states.length, transitions: states.reduce((count, state) => count + state.edges.length, 0) }
}
