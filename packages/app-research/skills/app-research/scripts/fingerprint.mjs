import { createHash } from 'node:crypto'

// Snapshot contract: a tree of nodes `{ role, id?, label?, children? }` (or an array of root nodes).
// Common aliases are accepted so a device adapter only has to rename, not restructure.
const HEADING_ROLES = new Set(['heading', 'header', 'navigationbar', 'title', 'toolbar', 'actionbar'])
const TAP_ROLES = new Set([
  'button',
  'imagebutton',
  'link',
  'tab',
  'tabbutton',
  'menuitem',
  'cell',
  'switch',
  'checkbox',
  'radio',
])
const TYPE_ROLES = new Set(['textfield', 'textbox', 'searchfield', 'securetextfield', 'edittext', 'combobox'])
const LOADING_ROLES = new Set(['progressbar', 'activityindicator', 'spinner'])
const MAX_NODES = 20000

export const normalizeText = (value, { digits = false } = {}) => {
  const text = String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
  return digits ? text.replaceAll(/\d+/g, '#') : text
}

const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12)
const roleOf = (raw) =>
  String(raw ?? 'node')
    .split('.')
    .at(-1)
    .toLowerCase()
    .replace(/^xcuielementtype/, '') || 'node'

export function actionKey(action, role, id, label) {
  const target = id ? `#${normalizeText(id)}` : normalizeText(label)
  return `${action}:${normalizeText(role)}:${target}`
}

function normalize(raw, counter) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Snapshot node must be an object')
  counter.nodes += 1
  if (counter.nodes > MAX_NODES) throw new Error(`Snapshot exceeds ${MAX_NODES} nodes; capture a smaller scope.`)
  const children = raw.children ?? raw.nodes ?? []
  if (!Array.isArray(children)) throw new Error('Snapshot node children must be an array')
  const node = {
    role: roleOf(raw.role ?? raw.type ?? raw.class ?? raw.className),
    id: raw.id ?? raw.identifier ?? raw.resourceId ?? raw.testId,
    text: raw.label ?? raw.text ?? raw.name ?? raw.contentDescription,
    children: [],
  }
  if (node.id) counter.ids = true
  for (const child of children) {
    const normalized = normalize(child, counter)
    // A spinner appearing or disappearing is a loading state, not a different screen.
    if (LOADING_ROLES.has(normalized.role) && normalized.children.length === 0) counter.loading = true
    else node.children.push(normalized)
  }
  return node
}

/** Identical sibling subtrees are one repeated row, whether there is one or many: one token, one candidate set. */
function collapseRuns(kids) {
  const parts = []
  const state = []
  const candidates = []
  let i = 0
  while (i < kids.length) {
    let j = i
    while (j < kids.length && kids[j].token === kids[i].token) j += 1
    const run = j - i
    parts.push(`${kids[i].token}*`)
    state.push(...(run > 1 ? [`x${run}`] : kids[i].state))
    candidates.push(...kids[i].candidates)
    i = j
  }
  return { parts, state, candidates }
}

const actionOf = (role) => {
  if (TAP_ROLES.has(role)) return 'tap'
  return TYPE_ROLES.has(role) ? 'type' : undefined
}

function ownCandidate(node, firstText) {
  const action = actionOf(node.role)
  if (!action || !(firstText || node.id)) return []
  const label = firstText ?? ''
  return [
    {
      action,
      role: node.role,
      id: node.id ? String(node.id) : '',
      label,
      key: actionKey(action, node.role, node.id, label),
    },
  ]
}

function walk(node) {
  const kids = node.children.map(walk)
  const { parts, state, candidates } = collapseRuns(kids)
  const firstText = node.text ? String(node.text) : kids.find((kid) => kid.firstText)?.firstText
  const heading = HEADING_ROLES.has(node.role) ? firstText ?? '' : ''
  const idToken = node.id ? `#${normalizeText(node.id, { digits: true })}` : ''
  return {
    token: `${node.role}${idToken}(${parts.join(',')})`,
    state: [normalizeText(node.text, { digits: true }), ...state],
    candidates: [...ownCandidate(node, firstText), ...candidates],
    firstText,
    title: heading || kids.find((kid) => kid.title)?.title,
  }
}

function confidenceOf(counter, title) {
  if (counter.nodes < 4) return 'low'
  if (title || counter.ids) return 'high'
  return 'low'
}

/** Reduce one snapshot to a structural screen key, a text-level state key, and the actions it offers. */
export function fingerprint(raw) {
  const counter = { nodes: 0, ids: false, loading: false }
  const root = normalize(Array.isArray(raw) ? { role: 'root', children: raw } : raw, counter)
  const walked = walk(root)
  const title = normalizeText(walked.title, { digits: true })
  const seen = new Set()
  const candidates = walked.candidates.filter((candidate) => !seen.has(candidate.key) && seen.add(candidate.key))
  const stateParts = [...walked.state.filter(Boolean), ...(counter.loading ? ['#loading'] : [])]
  return {
    structureKey: hash(walked.token),
    screenKey: hash(`${walked.token}|${title}`),
    stateKey: hash(stateParts.join('\n')),
    title: walked.title ?? '',
    nodeCount: counter.nodes,
    loading: counter.loading,
    candidates,
    confidence: confidenceOf(counter, title),
  }
}
