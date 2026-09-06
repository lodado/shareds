#!/usr/bin/env node
// Validates Reference Packs and routes a user utterance ("오늘의집 UI처럼") to one pack, one mode
// and one evidence status — deterministically, so the run cannot talk itself into treating a brand
// name as evidence. Three commands:
//   --validate [<pack.json>...]   every pack, or the named ones; exit 1 on the first invalid pack
//   --route "<utterance>"         the routing decision as JSON on stdout
//   --list                        id, brand, task and evidence status of every pack
// No dependencies: packs are plain JSON next to references/.
import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
export const PACKS_DIRECTORY = join(dirname(scriptDirectory), 'references/packs')
const USAGE = 'USAGE: pack.mjs --validate [<pack.json>...] | --route "<utterance>" | --list [--packs <dir>]'

export const EVIDENCE_LEVELS = ['observed', 'estimated', 'unverified']
export const PACK_STATUSES = ['observed', 'partial', 'unverified']
const REQUIRED_FIELDS = [
  'id',
  'brand',
  'aliases',
  'task',
  'pages',
  'devices',
  'evidenceStatus',
  'provenance',
  'lineageFallback',
  'tokens',
  'layout',
  'typeScale',
  'components',
  'responsive',
  'content',
  'allowedModifications',
  'forbidden',
  'primitives',
]
const REQUIRED_PROVENANCE_FIELDS = ['url', 'observedAt', 'device', 'viewportWidth', 'method']
const REQUIRED_PRIMITIVE_FIELDS = ['name', 'kind', 'license', 'version', 'source', 'verifiedAt', 'dependencies']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HTTPS_URL = /^https:\/\//i
const UNPINNED_VERSIONS = new Set(['main', 'master', 'latest', 'head', 'next', ''])
const COLOR_VALUE = /^(?:oklch|oklab|rgba?|hsla?|#)/i
// exemplars/tokens.css owns the vocabulary. A pack that invents --bg next to the existing
// --background splits the token namespace, so packs may only name tokens that already exist, plus
// the two scale knobs a pack legitimately adds.
export const ALLOWED_EXTRA_TOKENS = new Set(['--radius-pill', '--space-unit'])
// A pack that says a value is observed is claiming someone loaded a page. Only these words may
// carry that claim, and only when provenance backs them.
const OBSERVED_METHODS = new Set(['browser-observed', 'screenshot-observed', 'user-supplied-source'])
const EVIDENCE_SECTIONS = ['tokens', 'layout', 'typeScale', 'components', 'responsive', 'content']

/** Token names defined in exemplars/tokens.css — the only names a pack may use. */
export async function tokenVocabulary(
  cssPath = join(dirname(scriptDirectory), 'exemplars/tokens.css'),
) {
  const css = await readFile(cssPath, 'utf8')
  return new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]))
}

/** Every `evidence` value inside a pack, with the path that carries it — the validator's raw material. */
export function evidenceEntries(pack) {
  const entries = []
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    if (typeof node.evidence === 'string') entries.push({ path, evidence: node.evidence })
    for (const [key, value] of Object.entries(node)) if (key !== 'evidence') walk(value, `${path}.${key}`)
  }
  for (const key of EVIDENCE_SECTIONS) walk(pack[key], key)
  return entries
}

/**
 * Paths that state a value but carry no evidence grade. `tokens` and `typeScale` entries are always
 * value-bearing, so an entry there without a grade is an ungraded claim.
 */
export function untaggedValues(pack) {
  const untagged = []
  for (const [name, token] of Object.entries(pack.tokens ?? {}))
    if (token && typeof token === 'object' && typeof token.evidence !== 'string') untagged.push(`tokens.${name}`)
  for (const [index, entry] of (Array.isArray(pack.typeScale) ? pack.typeScale : []).entries())
    if (entry && typeof entry === 'object' && typeof entry.evidence !== 'string')
      untagged.push(`typeScale[${index}]`)
  for (const [role, component] of Object.entries(pack.components ?? {}))
    if (component && typeof component === 'object' && typeof component.evidence !== 'string')
      untagged.push(`components.${role}`)
  const slots = pack.layout?.slots
  for (const [index, slot] of (Array.isArray(slots) ? slots : []).entries())
    if (slot && typeof slot === 'object' && typeof slot.evidence !== 'string') untagged.push(`layout.slots[${index}]`)
  return untagged
}

/** The pack-level status implied by its values: the weakest evidence any value carries. */
export function impliedStatus(entries) {
  if (entries.length === 0) return 'unverified'
  if (entries.some((entry) => entry.evidence === 'unverified')) {
    return entries.every((entry) => entry.evidence === 'unverified') ? 'unverified' : 'partial'
  }
  return entries.some((entry) => entry.evidence === 'observed') ? 'observed' : 'partial'
}

/**
 * Returns the list of contract violations; empty means valid. The rules that matter are the ones
 * that stop a brand name from becoming evidence:
 *  - every value carries a known evidence grade,
 *  - `observed` anywhere requires at least one provenance entry with a real URL and a date,
 *  - an `unverified` pack must have zero observed values and must explain the access failure,
 *  - the declared status may not be stronger than the values justify,
 *  - a primitive may not be listed without a license, a version and a dependency answer.
 */
export function validatePack(pack, { fileName = null, vocabulary = null } = {}) {
  const problems = []
  const fail = (message) => problems.push(message)
  if (!pack || typeof pack !== 'object') return ['NOT_AN_OBJECT']

  for (const field of REQUIRED_FIELDS) if (pack[field] === undefined) fail(`MISSING_FIELD: ${field}`)
  if (problems.length > 0) return problems

  if (fileName && basename(fileName, '.json') !== pack.id) fail(`ID_FILENAME_MISMATCH: ${pack.id} vs ${fileName}`)
  if (!PACK_STATUSES.includes(pack.evidenceStatus)) fail(`UNKNOWN_STATUS: ${pack.evidenceStatus}`)
  if (!Array.isArray(pack.aliases) || pack.aliases.length === 0) fail('EMPTY_ALIASES')
  if (!Array.isArray(pack.provenance)) fail('PROVENANCE_NOT_ARRAY')
  if (typeof pack.lineageFallback !== 'string' || pack.lineageFallback.length === 0) fail('MISSING_LINEAGE_FALLBACK')
  if (!Array.isArray(pack.forbidden) || pack.forbidden.length === 0) fail('EMPTY_FORBIDDEN')
  if (!Array.isArray(pack.allowedModifications) || pack.allowedModifications.length === 0)
    fail('EMPTY_ALLOWED_MODIFICATIONS')

  const entries = evidenceEntries(pack)
  if (entries.length === 0) fail('NO_EVIDENCE_TAGGED_VALUES')
  for (const entry of entries)
    if (!EVIDENCE_LEVELS.includes(entry.evidence)) fail(`UNKNOWN_EVIDENCE: ${entry.path} = ${entry.evidence}`)

  // Every value-bearing entry must be graded. An ungraded { value } would otherwise be quoted as a
  // fact with nothing behind it, which is exactly the failure the pack format exists to prevent.
  for (const untagged of untaggedValues(pack)) fail(`UNTAGGED_VALUE: ${untagged} has a value but no evidence grade`)

  for (const [index, source] of (Array.isArray(pack.provenance) ? pack.provenance : []).entries()) {
    for (const field of REQUIRED_PROVENANCE_FIELDS) {
      const value = source?.[field]
      // Blank is not present: an empty url or a 0 viewport is a missing observation, not a source.
      if (value === undefined || value === null || value === '' || (field === 'viewportWidth' && !(value > 0)))
        fail(`PROVENANCE_MISSING_FIELD: [${index}].${field}`)
    }
    if (source?.url && !HTTPS_URL.test(source.url)) fail(`PROVENANCE_NOT_HTTPS: [${index}] ${source.url}`)
    if (source?.observedAt && !ISO_DATE.test(source.observedAt))
      fail(`PROVENANCE_BAD_DATE: [${index}] ${source.observedAt}`)
    if (source?.method && !OBSERVED_METHODS.has(source.method)) fail(`PROVENANCE_BAD_METHOD: [${index}] ${source.method}`)
    // A page that answered 403 or 500 was not observed. Recording the attempt is honest; calling it
    // provenance is not.
    if (source?.httpStatus !== undefined && !(source.httpStatus >= 200 && source.httpStatus < 300))
      fail(`PROVENANCE_NOT_OK_STATUS: [${index}] HTTP ${source.httpStatus} is not a successful observation`)
  }

  const observedValues = entries.filter((entry) => entry.evidence === 'observed')
  if (observedValues.length > 0 && (pack.provenance?.length ?? 0) === 0)
    fail(`OBSERVED_WITHOUT_PROVENANCE: ${observedValues.length} values claim observation with no source`)
  if (pack.evidenceStatus === 'unverified') {
    if (observedValues.length > 0)
      fail(`UNVERIFIED_PACK_CLAIMS_OBSERVATION: ${observedValues.map((entry) => entry.path).join(', ')}`)
    if (typeof pack.accessNote !== 'string' || pack.accessNote.length < 20)
      fail('UNVERIFIED_PACK_NEEDS_ACCESS_NOTE: say why the reference could not be observed')
  }
  const implied = impliedStatus(entries)
  if (PACK_STATUSES.indexOf(pack.evidenceStatus) < PACK_STATUSES.indexOf(implied))
    fail(`STATUS_OVERCLAIMS: declared ${pack.evidenceStatus} but values imply ${implied}`)
  // `partial` and `observed` both assert that someone loaded a page. Without provenance the status
  // is a claim about nothing, and the router would still hand out a reference-informed route.
  if (pack.evidenceStatus !== 'unverified' && (pack.provenance?.length ?? 0) === 0)
    fail(`STATUS_WITHOUT_PROVENANCE: ${pack.evidenceStatus} requires at least one provenance entry`)

  for (const [index, primitive] of (Array.isArray(pack.primitives) ? pack.primitives : []).entries()) {
    for (const field of REQUIRED_PRIMITIVE_FIELDS)
      if (!primitive?.[field]) fail(`PRIMITIVE_MISSING_FIELD: [${index}].${field}`)
    if (primitive?.source && !HTTPS_URL.test(primitive.source)) fail(`PRIMITIVE_NOT_HTTPS: [${index}]`)
    if (primitive?.version && UNPINNED_VERSIONS.has(String(primitive.version).toLowerCase()))
      fail(`PRIMITIVE_VERSION_NOT_PINNED: [${index}] "${primitive.version}" is a moving ref`)
  }

  // Themes: a pack that declares two themes must give both values for every colour token, or the
  // second theme is a claim with nothing behind it. Colour-ness is decided by the value, not the name.
  const themes = Array.isArray(pack.themes) ? pack.themes : null
  if (!themes || themes.length === 0) fail('MISSING_THEMES')
  const bothThemes = Boolean(themes?.includes('light') && themes?.includes('dark'))
  for (const [name, token] of Object.entries(pack.tokens ?? {})) {
    if (vocabulary && !vocabulary.has(name) && !ALLOWED_EXTRA_TOKENS.has(name))
      fail(`UNKNOWN_TOKEN_NAME: ${name} is not in exemplars/tokens.css`)
    if (bothThemes && COLOR_VALUE.test(String(token?.value ?? '')) && token?.light === undefined)
      fail(`MISSING_THEME_VALUE: ${name} declares a colour but no light value while the pack claims both themes`)
  }

  const slots = pack.layout?.slots
  if (!Array.isArray(slots) || slots.length === 0) fail('EMPTY_LAYOUT_SLOTS')
  else for (const [index, slot] of slots.entries()) if (!slot?.id) fail(`SLOT_MISSING_ID: [${index}]`)

  return problems
}

export async function loadPacks(directory = PACKS_DIRECTORY, { validate = false } = {}) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()
  const packs = []
  const rejected = []
  const vocabulary = validate ? await tokenVocabulary() : null
  for (const fileName of names) {
    const pack = JSON.parse(await readFile(join(directory, fileName), 'utf8'))
    if (!validate) {
      packs.push({ fileName, pack })
      continue
    }
    // A pack that fails its own contract must not be routable: routing an invalid pack is how an
    // ungraded or unsourced value would reach a screen as if it were evidence.
    const problems = validatePack(pack, { fileName, vocabulary })
    if (problems.length === 0) packs.push({ fileName, pack })
    else rejected.push({ fileName, id: pack?.id ?? null, problems })
  }
  return validate ? { packs, rejected } : packs
}

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s.\-_·]/g, '')
}

/**
 * Task keywords in Korean and English. The classifier is deliberately small and conservative: it
 * exists so that "Vercel처럼 배포 현황 화면" is recognised as a product surface rather than silently
 * treated as the marketing landing page the pack observed. When nothing matches it returns null,
 * and null narrows the scope — it never widens it.
 */
export const TASK_KEYWORDS = [
  [
    'checkout',
    ['결제', '주문', '장바구니', 'checkout', 'cart', 'payment'],
  ],
  [
    'product-surface',
    ['대시보드', '배포현황', '현황', '관리자', '어드민', '콘솔', '설정', '테이블', '목록', 'dashboard', 'admin', 'console', 'settings', 'table'],
  ],
  ['content-commerce-home', ['커머스', '쇼핑', '상품', '피드', '스토어', 'commerce', 'shop', 'product', 'feed', 'store']],
  ['onboarding', ['온보딩', '회원가입', 'onboarding', 'signup']],
  [
    'developer-platform-marketing',
    ['랜딩', '소개페이지', '마케팅', '가격', 'landing', 'marketing', 'pricing', 'homepage'],
  ],
]

/**
 * The first task whose keywords appear. Order matters and is deliberate: a sentence naming both a
 * transaction and a marketing page ('가격 결제 페이지') is a transaction, because getting that wrong
 * costs more. Returns null when nothing matches, and null always narrows the scope.
 */
export function inferTask(utterance) {
  const haystack = normalize(utterance)
  for (const [task, keywords] of TASK_KEYWORDS)
    if (keywords.some((keyword) => haystack.includes(normalize(keyword)))) return task
  return null
}

const DEVICE_KEYWORDS = [
  ['mobile', ['모바일', '핸드폰', '앱화면', '스마트폰', 'mobile', 'phone']],
  ['desktop', ['데스크톱', 'pc화면', 'desktop', 'laptop']],
]
const THEME_KEYWORDS = [
  ['dark', ['다크', '어둠', 'dark']],
  ['light', ['라이트', '밝은', 'light']],
]

function matchFirst(table, haystack) {
  for (const [value, keywords] of table)
    if (keywords.some((keyword) => haystack.includes(normalize(keyword)))) return value
  return null
}

/**
 * What the utterance asks for beyond the task: device and theme. A pack that never observed the
 * asked-for device or theme cannot claim to reproduce it, so these narrow the scope the same way an
 * unknown task does.
 */
export function requestedCoverage(utterance) {
  const haystack = normalize(utterance)
  return { device: matchFirst(DEVICE_KEYWORDS, haystack), theme: matchFirst(THEME_KEYWORDS, haystack) }
}

/** The (device, theme) pairs a pack actually observed, from its provenance. */
export function observedCoverage(pack) {
  const devices = new Set()
  const themes = new Set()
  const pairs = new Set()
  for (const source of Array.isArray(pack.provenance) ? pack.provenance : []) {
    if (source?.device) devices.add(source.device)
    if (source?.theme) themes.add(source.theme)
    if (source?.device && source?.theme) pairs.add(`${source.device}/${source.theme}`)
  }
  return { devices: [...devices], themes: [...themes], pairs: [...pairs] }
}

/**
 * The routing decision for one utterance. Modes:
 *  - `reference-informed-adaptation`: a pack with real provenance matched; its observed values lead.
 *  - `unverified-reference`: a pack matched but nothing in it was observed; say so before designing.
 *  - `lineage`: no pack matched. The brand name, if any, contributes nothing — adaptation.md decides.
 *
 * Scope fails closed. A pack is evidence about the task it observed, so `brandFidelityClaim` is
 * true only when the pack's task is the task at hand. When the task is unknown or different, the
 * route degrades to `tokens-only`: tokens, radius, spacing and the small type roles transfer, the
 * layout slots and the display scale do not. A marketing landing page is not evidence for a
 * deployment dashboard, and "no --task given" is not the same as "the tasks match".
 */
export function routeUtterance(utterance, packs, { task = null } = {}) {
  const haystack = normalize(utterance)
  const inferred = task ?? inferTask(utterance)
  let taskSource = 'unknown'
  if (task) taskSource = 'caller'
  else if (inferred) taskSource = 'inferred'
  const matches = packs
    .map(({ pack }) => {
      const needles = [pack.brand, ...(pack.aliases ?? [])].map(normalize).filter(Boolean)
      const hit = needles
        .filter((needle) => haystack.includes(needle))
        .sort((a, b) => b.length - a.length)
        .at(0)
      return hit ? { pack, matchedOn: hit } : null
    })
    .filter(Boolean)
    // When a sentence names two brands, the task decides which one is the visual authority — not
    // whichever alias happened to be longer. Alias length only breaks ties among equal task fits.
    .sort(
      (a, b) =>
        Number(b.pack.task === inferred) - Number(a.pack.task === inferred) || b.matchedOn.length - a.matchedOn.length,
    )

  if (matches.length === 0) {
    return {
      mode: 'lineage',
      packId: null,
      evidenceStatus: null,
      matchedOn: null,
      task: inferred,
      taskSource,
      taskMatch: null,
      scope: 'none',
      visualAuthority: 'lineage',
      brandFidelityClaim: false,
      candidates: [],
      note: 'No pack matched. A brand name alone is not evidence: pick a lineage with adaptation.md and tell the user the reference was not reproduced.',
    }
  }

  const { pack, matchedOn } = matches[0]
  const observedPack = pack.evidenceStatus !== 'unverified'
  // Unknown task is not a match. Only a task we actually know, and that the pack observed, unlocks
  // the full pack.
  const taskMatch = inferred === null ? null : pack.task === inferred
  const requested = requestedCoverage(utterance)
  const observed = observedCoverage(pack)
  // Asking for a device or theme the pack never loaded is a coverage gap. The values may still be a
  // reasonable starting point, but nothing about that combination was observed.
  const coverageGaps = []
  if (requested.device && !observed.devices.includes(requested.device)) coverageGaps.push(`device:${requested.device}`)
  if (requested.theme && !observed.themes.includes(requested.theme)) coverageGaps.push(`theme:${requested.theme}`)
  if (requested.device && requested.theme && !observed.pairs.includes(`${requested.device}/${requested.theme}`))
    coverageGaps.push(`pair:${requested.device}/${requested.theme}`)
  const fullScope = observedPack && taskMatch === true && coverageGaps.length === 0
  let scope = 'pattern-hint'
  if (observedPack) scope = fullScope ? 'full' : 'tokens-only'
  const reasons = []
  if (taskMatch === false) reasons.push(`task ${inferred} ≠ pack task ${pack.task}`)
  else if (taskMatch === null) reasons.push('task unknown')
  reasons.push(...coverageGaps.map((gap) => `not observed: ${gap}`))
  const scopeNote = {
    full: 'Use the whole pack: tokens, type scale and layout slots in order.',
    'tokens-only': `Scope reduced (${reasons.join('; ')}). Transfer tokens, radius, spacing rhythm and the ui/caption/eyebrow type roles. Do NOT transfer the layout slots, the display scale or the section order — see the pack's taskTransfer, and say which combination was never observed.`,
    'pattern-hint': 'Nothing in this pack was observed. Read it as a pattern hint only.',
  }[scope]
  return {
    mode: observedPack ? 'reference-informed-adaptation' : 'unverified-reference',
    packId: pack.id,
    packPath: `references/packs/${pack.id}.json`,
    evidenceStatus: pack.evidenceStatus,
    matchedOn,
    packTask: pack.task,
    task: inferred,
    taskSource,
    taskMatch,
    scope,
    scopeReasons: reasons,
    visualAuthority: observedPack ? pack.id : 'lineage',
    lineageFallback: pack.lineageFallback,
    // Only a full-scope observed pack — right task, and the asked-for device and theme actually
    // loaded — lets a run say it reproduced the brand's surface.
    brandFidelityClaim: fullScope,
    requested,
    coverage: {
      observedDevices: observed.devices,
      observedThemes: observed.themes,
      observedPairs: observed.pairs,
      gaps: coverageGaps,
      pages: pack.pages ?? [],
      note: pack.coverageNote ?? null,
    },
    // More than one pack may match a sentence naming two brands. One screen gets one visual
    // authority; the rest are recorded as "considered, not adopted".
    candidates: matches.map(({ pack: candidate }) => candidate.id),
    note: observedPack
      ? `Pack ${pack.id} carries provenance (${pack.provenance.length} source(s), ${pack.provenance[0]?.observedAt}). ${scopeNote}${
          taskSource === 'unknown' ? ' Pass --task to widen the scope once the task is known.' : ''
        }`
      : `Pack ${pack.id} was never observed (${
          pack.accessNote ? 'access note recorded' : 'no access note'
        }). Say "브랜드 재현이 아니다" first, then design with lineage ${pack.lineageFallback}.`,
  }
}

function option(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

async function main() {
  const args = process.argv.slice(2)
  const directory = option(args, '--packs') ?? PACKS_DIRECTORY
  if (args.includes('--route')) {
    const utterance = option(args, '--route')
    if (!utterance) throw new Error(USAGE)
    // Routing validates first: an invalid pack is not a reference, and the caller is told which one
    // was dropped instead of silently receiving a lineage route.
    const { packs, rejected } = await loadPacks(directory, { validate: true })
    const decision = routeUtterance(utterance, packs, { task: option(args, '--task') })
    process.stdout.write(`${JSON.stringify({ ...decision, rejectedPacks: rejected }, null, 2)}\n`)
    if (rejected.length > 0) {
      process.stderr.write(
        `${rejected.length} pack(s) failed validation and were not routable: ${rejected
          .map(({ fileName }) => fileName)
          .join(', ')}\n`,
      )
      process.exitCode = 1
    }
    return
  }
  if (args.includes('--list')) {
    const packs = await loadPacks(directory)
    for (const { pack } of packs)
      process.stdout.write(`${pack.id}\t${pack.brand}\t${pack.task}\t${pack.evidenceStatus}\n`)
    return
  }
  if (!args.includes('--validate')) throw new Error(USAGE)
  const named = args.filter((arg) => arg.endsWith('.json'))
  const targets = named.length
    ? await Promise.all(
        named.map(async (file) => ({ fileName: basename(file), pack: JSON.parse(await readFile(resolve(file), 'utf8')) })),
      )
    : await loadPacks(directory)
  let invalid = 0
  const vocabulary = await tokenVocabulary()
  for (const { fileName, pack } of targets) {
    const problems = validatePack(pack, { fileName, vocabulary })
    if (problems.length === 0) {
      process.stdout.write(`ok ${fileName} — ${pack.evidenceStatus}, ${evidenceEntries(pack).length} tagged values\n`)
      continue
    }
    invalid += 1
    process.stdout.write(`INVALID ${fileName}\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n`)
  }
  if (invalid > 0) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`PACK_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
