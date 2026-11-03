/**
 * oracle-cards.mjs — the card oracle-step.mjs prints above its `NEXT FOR YOU:` line: what the controller needs at that
 * position, so it reads no document before its first step call and none a card does not name.
 *
 * A card has two parts, both derived when it is printed. Its rules come from the rule tables: the package and Space
 * discovery rows whose fix line the position's checks judge (oracle-schema.mjs RULES, SPACE_RULES; each row is on one
 * card) and the refusal classes' prescriptions (oracle-run.mjs FIX_CLASSES). Its text is the blocks of the role
 * document the position needs, cut by heading and opening words: a block that is gone throws instead of printing stale
 * words, and a document edit shows in the next card. Nothing here restates a rule or a sentence.
 */
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIX_CLASSES } from './oracle-run.mjs'
import { RULES, SPACE_RULES } from './oracle-schema.mjs'
import { sectionLines } from './oracle-space.mjs'

const SKILL = fileURLToPath(new URL('..', import.meta.url))
/** A card's ceiling in UTF-8 bytes. */
export const CARD_MAX_BYTES = 4096

const FORMAL = 'references/roles/controller-formal.md'
const SPACE_IDS = SPACE_RULES.map(({ id }) => id)

/**
 * Each card: `space` and `rules` name rows of SPACE_RULES and RULES, `refusals` prints every FIX_CLASSES line, and
 * `text` names blocks of a document — a `##` section (`heading`), or the body under its title, and in it the blocks
 * (paragraphs and list items) that open with `starts`, or all of them. The rows a position's checks judge go on its
 * card: the request and the Space discovery interview decide intake's, the analyst's world the package's, the model
 * and its registries the model's, the projected card's fields the card's, and what Delivery closure reads after
 * GREEN the lock's (a locked package holds no todo).
 */
export const CARDS = Object.freeze({
  intake: {
    space: SPACE_IDS,
    rules: [
      'text', 'packageVersion', 'id', 'sources', 'self', 'requirements', 'intent.risk', 'intent.actor', 'intent.observableSuccess',
      'intent.nonGoals', 'intent.worstRegression', 'intent.reversibility', 'intent.openQuestions', 'holds', 'spaceDiscovery', 'families',
      'families.v1', 'asyncCells',
    ],
    text: [{ path: FORMAL, heading: '1. Intake' }],
  },
  package: {
    rules: ['world', 'terms', 'assumptions', 'goals', 'examples', 'hazards', 'contract.row', 'spaceVersion'],
    text: [{ path: FORMAL, heading: '2. Model' }],
  },
  model: {
    rules: ['crossCheck', 'behavior', 'metamorphic', 'operators', 'residue', 'axisOrigins', 'discoveryDecisions', 'aiRuns'],
    text: [{ path: FORMAL, heading: '2. Model', starts: ['Invoke $oracle-author', 'The model analyst is dispatched'] }],
  },
  card: {
    rules: ['policies', 'contract', 'notApplicable', 'typeContract'],
    text: [
      { path: FORMAL, heading: '2. Model', starts: ['States: DISCOVERING'] },
      { path: FORMAL, heading: '3. Card review and lock', starts: ['Before confirmation: no lock'] },
    ],
  },
  review: {
    text: [
      { path: FORMAL, heading: 'Phases', starts: ['Six phases group'] },
      { path: FORMAL, heading: '3. Card review and lock', starts: ['States: DRAFTED', '1. Before showing the Draft', '2. When', '3. Each review kind'] },
    ],
  },
  lock: {
    rules: ['product', 'faultModel', 'mutationThreshold'],
    text: [{ path: FORMAL, heading: '3. Card review and lock', starts: ['4. Show existing revisions', '5. Read', 'Before confirmation: no lock', 'If Delivery was known'] }],
  },
  decision: {
    text: [{ path: 'references/controller-entry-formal.md', heading: 'Controller authority and stop/resume', starts: ['Only existing scripts advance', "Use common.md's Feedback routing"] }],
  },
  init: { text: [{ path: FORMAL, heading: '4. RED', starts: ['States: ORACLE_READY', 'Right after entering Delivery', 'Step runs'] }] },
  red: { text: [{ path: FORMAL, heading: '4. RED', starts: ['Before tests/RED read', 'On Claude Code the PreToolUse hook'] }] },
  green: { text: [{ path: FORMAL, heading: '5. GREEN' }] },
  close: {
    text: [
      { path: FORMAL, heading: 'Phases', starts: ['Six phases group'] },
      { path: FORMAL, heading: '6. Review and close', starts: ['States: IMPLEMENTED_GREEN', 'Read [`delivery/green-review.md`]', 'Delivery review runs at most 2 rounds', 'With a model package'] },
    ],
  },
  report: {
    text: [
      { path: FORMAL, heading: '6. Review and close', starts: ['For RELATIONAL/JUDGMENT rows', '| State', 'Normal Delivery completion'] },
      { path: 'references/roles/reporting-formal.md', heading: 'Verification before the final report' },
    ],
  },
  done: { text: [{ path: 'references/roles/reporting.md', starts: ['Lead with actual state'] }] },
  refused: {
    refusals: true,
    text: [
      { path: FORMAL, heading: 'Phases', starts: ['A refusal prints its code'] },
      { path: 'references/verification-common.md', starts: ['Delivery uses one runtime'] },
    ],
  },
  // a Contract run reads only Contract and shared documents
  'contract-authoring': { text: [{ path: 'references/contract/confirmation-lock.md' }] },
  'contract-delivery': { text: [{ path: 'references/contract/ledger.md' }, { path: 'references/contract/red.md' }] },
  'contract-review': { text: [{ path: 'references/contract/green-review.md' }] },
  'contract-refused': { refusals: true, text: [{ path: 'references/verification-common.md', starts: ['Delivery uses one runtime'] }] },
})

/**
 * The card each position step can print shows, per profile: a failing graph node (package, model, card, confirmation),
 * intake (a blank folder), review (reviews to dispatch, no node failing), lock, decision (a NEEDS_DECISION stop), the
 * Delivery steps, refused (a refusal) and recover (step stopped without its own instruction: read what it names).
 */
export const POSITIONS = Object.freeze({
  'formal-bend/v1': Object.freeze({
    intake: 'intake', package: 'package', model: 'model', card: 'card', review: 'review', lock: 'lock', decision: 'decision',
    init: 'init', red: 'red', green: 'green', close: 'close', report: 'report', done: 'done', refused: 'refused', recover: 'refused',
  }),
  'contract/v1': Object.freeze({
    confirmation: 'contract-authoring', card: 'contract-authoring', review: 'contract-authoring', lock: 'contract-authoring',
    decision: 'contract-authoring', init: 'contract-delivery', red: 'contract-delivery', green: 'contract-review',
    close: 'contract-review', report: 'contract-review', done: 'contract-review', refused: 'contract-refused', recover: 'contract-refused',
  }),
})

/** The card a position shows; an unknown profile or position throws, so a new stop cannot print without its card. */
export function cardOf(profile, position) {
  const id = POSITIONS[profile]?.[position]
  if (!id) throw new Error(`no card for position ${position} of ${profile}`)
  return id
}

/** The card a rule table row is on (RULES or SPACE_RULES id), or null. */
export function cardOfRule(id) {
  return Object.keys(CARDS).find((card) => (CARDS[card].rules ?? []).includes(id) || (CARDS[card].space ?? []).includes(id)) ?? null
}

/** A card's rule lines, each with the table and row it comes from. */
export function cardRules(id) {
  const card = CARDS[id]
  if (!card) throw new Error(`no card ${id}`)
  const row = (table, rows, key) => {
    const found = rows.find((candidate) => candidate.id === key)
    if (!found) throw new Error(`card ${id}: ${table} has no row ${key}`)
    return found
  }
  return [
    ...(card.space ?? []).map((key) => {
      const { path, fix } = row('SPACE_RULES', SPACE_RULES, key)
      return { table: 'SPACE_RULES', id: key, line: `- ${path}: ${fix}` }
    }),
    ...(card.rules ?? []).map((key) => {
      const { path, fix } = row('RULES', RULES, key)
      return { table: 'RULES', id: key, line: `- ${path || 'every value'}: ${fix}` }
    }),
    ...(card.refusals ? Object.entries(FIX_CLASSES).map(([key, line]) => ({ table: 'FIX_CLASSES', id: key, line: `- [${key}] ${line}` })) : []),
  ]
}

/** A section's blocks: each paragraph, and each list item on its own (a numbered or bulleted line opens one). */
function blocksOf(lines) {
  const blocks = []
  let block = null
  for (const line of lines) {
    if (line.trim() === '') {
      block = null
      continue
    }
    if (!block || /^(?:\d+\.|-) /.test(line)) {
      block = []
      blocks.push(block)
    }
    block.push(line)
  }
  return blocks.map((lines) => lines.join('\n'))
}

/** Links as paths under the skill directory: a card is read in the terminal, away from the document's folder. */
function plainLinks(text, path) {
  return text.replaceAll(/\[([^\]]{1,200})\]\(([^)\s]{1,300})\)/g, (_, label, target) => {
    const [file, anchor] = target.split('#')
    const resolved = file === '' ? path : posix.normalize(posix.join(posix.dirname(path), file))
    if (resolved.startsWith('..')) return label
    const location = anchor ? `${resolved}#${anchor}` : resolved
    const where = `\`${location}\``
    return resolved.endsWith(label.replaceAll('`', '')) ? where : `${label} (${where})`
  })
}

/** The blocks one `text` entry names, in its order; each opening must name exactly one block. */
function fragment({ path, heading, starts }) {
  const lines = readFileSync(join(SKILL, path), 'utf8').split('\n')
  const body = heading ? sectionLines(lines, heading) : lines.slice(lines.findIndex((line) => line.startsWith('# ')) + 1)
  const blocks = blocksOf(body)
  if (blocks.length === 0) throw new Error(`${path} has no section ## ${heading}`)
  const where = heading ? `${path} § ${heading}` : path
  const chosen = (starts ?? []).map((start) => {
    const found = blocks.filter((block) => block.startsWith(start))
    if (found.length !== 1) throw new Error(`${where}: ${found.length} blocks open with "${start}"`)
    return found[0]
  })
  return (starts ? chosen : blocks).map((block) => plainLinks(block, path)).join('\n')
}

const built = new Map()

/** The card's text: a head line naming its sources, its rule lines, its blocks, and an end line. */
export function cardText(id) {
  if (built.has(id)) return built.get(id)
  const rules = cardRules(id)
  const sources = [...new Set(CARDS[id].text.map(({ path, heading }) => (heading ? `${path} § ${heading}` : path)))]
  const tables = [...new Set(rules.map(({ table }) => table))]
  const counted = rules.length > 0 ? [`${rules.length} rules from ${tables.join(', ')}`] : []
  const head = [...counted, `text from ${sources.join('; ')}`].join('; ')
  const text = [`CARD ${id}: ${head}`, ...rules.map(({ line }) => line), ...CARDS[id].text.map(fragment), `END CARD ${id}`].join('\n')
  built.set(id, text)
  return text
}
