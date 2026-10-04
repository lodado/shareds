import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- this contract intentionally runs with node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const plugin = fileURLToPath(new URL('../', import.meta.url))
const skills = join(plugin, 'skills')
const core = join(skills, 'frontend-oracle-design')
const ceilings = {
  'frontend-oracle-design': 140,
  'oracle-intake': 150,
  'oracle-author': 240,
  'oracle-implement': 180,
  'oracle-review': 180,
}
const names = Object.keys(ceilings)
const entryPath = (name) => join(skills, name, 'SKILL.md')

function entry(name) {
  assert.ok(existsSync(entryPath(name)), `${name} must be discoverable`)
  return readFileSync(entryPath(name), 'utf8')
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name)
    return item.isDirectory() ? files(path) : [path]
  })
}

function destinationAt(line, offset) {
  const rest = line.slice(offset).trimStart()
  if (rest.startsWith('<')) {
    const end = rest.indexOf('>')
    assert.ok(end > 0, 'angle-bracket Markdown destination must close')
    return rest.slice(1, end)
  }
  let depth = 0
  let end = 0
  while (end < rest.length) {
    const character = rest[end]
    if (/\s/.test(character) || (character === ')' && depth === 0)) break
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    end += 1
  }
  return rest.slice(0, end)
}

// Walk lines and balanced destinations instead of using an unbounded Markdown
// regex. Fenced examples are not navigation; reference definitions are links too.
function markdownDestinations(text) {
  const destinations = []
  let fence = ''
  for (const line of text.split('\n')) {
    const trimmed = line.trimStart()
    const marker = trimmed.match(/^`{3,}|^~{3,}/)?.[0]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''
    } else if (!fence) {
      for (const match of line.matchAll(/\]\(/g)) destinations.push(destinationAt(line, match.index + 2))
      const definition = trimmed.indexOf(']:')
      if (trimmed.startsWith('[') && definition > 0) destinations.push(destinationAt(trimmed, definition + 2))
    }
  }
  return destinations.filter(Boolean)
}

function localLinks(document, text) {
  const destinations = markdownDestinations(text)
  return destinations.filter((target) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)).map((target) => {
    const path = resolve(dirname(document), decodeURIComponent(target.split(/[?#]/)[0]))
    assert.ok(existsSync(path), `${relative(plugin, document)} links to missing local target: ${target}`)
    return path
  })
}

// Authority may live in a linked role reference, but never in an orphan file.
function roleContract(name) {
  const seen = new Set()
  const texts = []
  const visit = (path) => {
    if (seen.has(path)) return
    seen.add(path)
    const text = readFileSync(path, 'utf8')
    texts.push(text)
    for (const target of localLinks(path, text)) {
      if (target.endsWith('.md') && relative(join(core, 'references', 'roles'), target).split(/[\\/]/)[0] !== '..') visit(target)
    }
  }
  entry(name)
  visit(entryPath(name))
  return texts.join('\n')
}

function requires(text, patterns, owner) {
  for (const [meaning, pattern] of patterns) assert.match(text, pattern, `${owner}: ${meaning}`)
}

const denial = /\bno\b|\bnot\b|never|forbid|mustn't|cannot|may not|금지|불가|않/i

function forbids(text, subject, owner) {
  const clauses = text.split(/\n|(?<=[.!?])\s+/)
  assert.ok(clauses.some((clause) => denial.test(clause) && subject.test(clause)), `${owner}: explicit prohibition for ${subject}`)
}

test('Markdown link validation handles relative definitions and balanced paths without treating code as links', () => {
  const text = [
    '[nested](references/example(v1).md#heading "title")',
    '[space](<references/with space.md>)',
    '[reference]: references/defined.md "title"',
    '```md', '[example](not-a-real-file.md)', '```',
  ].join('\n')
  assert.deepEqual(markdownDestinations(text), [
    'references/example(v1).md#heading', 'references/with space.md', 'references/defined.md',
  ])
  assert.deepEqual(localLinks(entryPath('frontend-oracle-design'), '[remote](https://example.com) [here](#heading)'), [])
  assert.throws(
    () => localLinks(entryPath('frontend-oracle-design'), '[broken](references/missing-modular-link-fixture.md)'),
    /links to missing local target/,
  )
})

test('exactly five named skill entries are discoverable, with no flat duplicate', () => {
  for (const name of names) entry(name)
  assert.equal(existsSync(join(skills, 'SKILL.md')), false, 'flat SKILL.md must not remain discoverable')
  const discovered = files(skills).filter((path) => path.endsWith('/SKILL.md')).map((path) => relative(skills, path)).sort()
  assert.deepEqual(discovered, names.map((name) => `${name}/SKILL.md`).sort())
})

for (const [name, ceiling] of Object.entries(ceilings)) {
  test(`${name} has its exact discovery name, stays within ${ceiling} lines and has reachable links`, () => {
    const text = entry(name)
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    assert.ok(frontmatter, `${name}: YAML frontmatter is required`)
    assert.match(frontmatter[1], new RegExp(`^name: ${name}\\s*$`, 'm'))
    assert.ok(text.trimEnd().split(/\r?\n/).length <= ceiling, `${name}: entry exceeds ${ceiling} lines`)
    roleContract(name)
  })
}

test('controller links and explicitly invokes every sibling role and external test skill', () => {
  const text = entry('frontend-oracle-design')
  const targets = localLinks(entryPath('frontend-oracle-design'), text)
  for (const name of names.slice(1)) {
    assert.ok(targets.includes(entryPath(name)), `controller must link the actual ${name} entry`)
    assert.match(text, new RegExp(`\\$${name}\\b`), `controller must explicitly invoke $${name}`)
  }
  assert.match(text, /\$test\b/, 'target test writes require explicit $test invocation')
  requires(text, [
    ['human confirmation remains authoritative', /human[\s\S]{0,100}(?:confirm|approv)|(?:confirm|approv)[\s\S]{0,100}human|사용자[\s\S]{0,100}승인/i],
    ['independent review is required', /independent[\s\S]{0,100}review|독립[\s\S]{0,100}리뷰/i],
    ['budgets are shared', /shared[\s\S]{0,100}budget|budget[\s\S]{0,100}shared|공유[\s\S]{0,100}예산/i],
    ['runtime transitions remain controller-owned', /transition|전이/i],
  ], 'controller')
})

for (const name of names.slice(1)) {
  test(`${name} cannot bootstrap missing prerequisites or grant itself authority`, () => {
    const text = roleContract(name)
    requires(text, [
      ['states prerequisites', /prerequisit|precondition|선행|전제/i],
      ['defines returned artifacts or findings', /return|output|반환|산출/i],
      ['fresh workers load their own dependencies', /(?:fresh|own|independen|새|직접)[\s\S]{0,150}(?:load|dependenc|reference|context|로딩|참조)/i],
    ], name)
    const missing = /missing|absent|unavailable|without|없|누락/gi
    const controller = /controller|\$frontend-oracle-design/i
    assert.ok([...text.matchAll(missing)].some(({ index }) =>
      controller.test(text.slice(Math.max(0, index - 400), index + 400)),
    ), `${name}: missing prerequisites must route to the controller`)
    forbids(text, /approv|승인/i, name)
    forbids(text, /transition|전이/i, name)
  })
}

test('specialist write and evidence authority follows each bounded role', () => {
  const intake = roleContract('oracle-intake')
  requires(intake, [['source-bound discovery', /source|출처/i], ['discovery axes', /ax[ei]s|축/i]], 'intake')
  for (const subject of [/model|모델/i, /test|테스트/i, /product|제품/i]) forbids(intake, subject, 'intake')

  const author = roleContract('oracle-author')
  requires(author, [
    ['approved source inputs', /source|출처/i],
    ['model-first projection', /model[\s\S]{0,200}(?:project|generat)|모델[\s\S]{0,200}(?:투영|생성)/i],
    ['independent analyst', /independent[\s\S]{0,100}analyst|독립[\s\S]{0,100}분석/i],
    ['post-GREEN closure', /GREEN/],
  ], 'author')
  forbids(author, /lock|policy|잠금|정책/i, 'author')

  const implement = roleContract('oracle-implement')
  requires(implement, [['immutable lock prerequisite', /lock|잠금/i], ['accepted RED prerequisite', /VALID_RED/], ['zero-production alternative', /ALREADY_SATISFIED/]], 'implement')
  for (const subject of [/expect|기대/i, /policy|정책/i, /lock|잠금/i]) forbids(implement, subject, 'implement')
  const zeroProduction = [
    /zero[- ]production/i, /zero[\s\S]{0,60}(?:edit|change)/i, /no[\s\S]{0,60}production/i,
    /production[\s\S]{0,60}(?:zero|0)/i, /생산[\s\S]{0,60}0/,
  ]
  assert.ok(zeroProduction.some((pattern) => pattern.test(implement)), 'ALREADY_SATISFIED remains zero-production')

  const review = roleContract('oracle-review')
  requires(review, [
    ['independent context', /independent[\s\S]{0,100}context|독립[\s\S]{0,100}컨텍스트/i],
    ['blinded review inputs', /blind|cold[- ]read|블라인드/i],
    ['findings-only return', /findings|발견|지적/i],
  ], 'review')
  for (const subject of [/product|제품/i, /receipt|영수증/i]) forbids(review, subject, 'review')
})

test('one canonical runtime owns scripts, references, bundles and evals', () => {
  entry('frontend-oracle-design')
  for (const resource of ['scripts', 'references', 'bundles', 'evals']) {
    assert.ok(existsSync(join(core, resource)), `canonical ${resource} must exist`)
    assert.equal(existsSync(join(skills, resource)), false, `old flat ${resource} must not remain`)
    for (const name of names.slice(1)) assert.equal(existsSync(join(skills, name, resource)), false, `${name} must not duplicate ${resource}`)
  }
  for (const basename of ['oracle-run.mjs', 'oracle-reference-route.mjs', 'reference-graph.json']) {
    const matches = files(skills).filter((path) => path.endsWith(`/${basename}`))
    assert.deepEqual(matches, [join(core, basename.endsWith('.json') ? 'references' : 'scripts', basename)])
  }
})

test('real public reference CLI works from the relocated core with conservative unknown facts', () => {
  const script = join(core, 'scripts', 'oracle-reference-route.mjs')
  assert.ok(existsSync(script), 'public reference CLI must exist at the new canonical path')
  assert.ok(existsSync(join(core, 'scripts', 'oracle-run.mjs')), 'public runtime entry must exist at the new canonical path')
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const run = spawnSync(process.execPath, [script, '--point', 'scope-decision', '--json'], {
    cwd: plugin, env, encoding: 'utf8', timeout: 30_000,
  })
  assert.ifError(run.error)
  assert.equal(run.status, 0, run.stderr || run.stdout)
  const result = JSON.parse(run.stdout)
  assert.equal(result.schemaVersion, 1)
  assert.equal(result.authority, 'advisory')
  assert.equal(result.coverage, 'partial')
  assert.equal(result.point, 'scope-decision')
  assert.equal(result.facts.architectureBoundaryChange, 'unknown')
  assert.ok(result.agent.some((node) => node.reason === 'unknown'), 'unknown facts must conservatively select references')
  for (const bucket of ['agent', 'reviewer', 'external']) {
    assert.ok(Array.isArray(result[bucket]), `${bucket} delivery remains separate`)
    assert.ok(Array.isArray(result.manualConditions[bucket]), `${bucket} manual conditions remain explicit`)
    for (const node of [...result[bucket], ...result.manualConditions[bucket]]) {
      assert.ok(existsSync(resolve(core, node.path)), `CLI references must resolve from the new core: ${node.path}`)
    }
  }
})
