import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Static contract between the router, the skills and the routing rubric; model behavior is not executed here.
const SKILLS = fileURLToPath(new URL('../skills/', import.meta.url))
const read = (rel) => readFileSync(path.join(SKILLS, rel), 'utf8')
const cases = JSON.parse(read('threejs-game-wireframe/evals/boundary-cases.json'))

const MODES = new Set(['PLAN_ONLY', 'FIGMA', 'THREEJS_WIREFRAME'])
const LEVELS = new Set([null, 'LAYOUT_ONLY', 'FLOW_PROTOTYPE', 'PLAYABLE_GREYBOX'])
const ECS = new Set(['n/a', 'optional', 'required'])
const SKILL_FOR_MODE = {
  PLAN_ONLY: 'reference-driven-game-design',
  FIGMA: 'reference-driven-game-design',
  THREEJS_WIREFRAME: 'threejs-game-wireframe',
}
const ECS_FOR_LEVEL = { LAYOUT_ONLY: 'n/a', FLOW_PROTOTYPE: 'optional', PLAYABLE_GREYBOX: 'required' }

test('routing rubric is declared unexecuted and well formed', () => {
  assert.equal(cases.status, 'not_executed')
  assert.equal(new Set(cases.cases.map((c) => c.id)).size, cases.cases.length)
  for (const { id, expect, must_not: mustNot } of cases.cases) {
    assert.ok(MODES.has(expect.mode), id)
    assert.equal(expect.skill, SKILL_FOR_MODE[expect.mode], id)
    assert.ok(LEVELS.has(expect.level), id)
    assert.ok(ECS.has(expect.ecs), id)
    assert.equal(expect.level === null, expect.mode !== 'THREEJS_WIREFRAME', id)
    if (expect.level) assert.equal(expect.ecs, ECS_FOR_LEVEL[expect.level], id)
    assert.ok(mustNot.length > 0, id)
  }
  for (const level of ['LAYOUT_ONLY', 'FLOW_PROTOTYPE', 'PLAYABLE_GREYBOX']) {
    assert.ok(
      cases.cases.some((c) => c.expect.level === level),
      `no case covers ${level}`,
    )
  }
})

test('router names every mode and links both target skills', () => {
  const router = read('game-interface-design/SKILL.md')
  for (const mode of MODES) assert.match(router, new RegExp(`\`${mode}\``))
  for (const skill of new Set(Object.values(SKILL_FOR_MODE))) {
    assert.match(router, new RegExp(`\\(\\.\\./${skill}/SKILL\\.md\\)`))
    assert.ok(existsSync(path.join(SKILLS, skill, 'SKILL.md')))
  }
  assert.match(router, /Figma is not a prerequisite/)
})

// Low risk: static instruction routing, not executed model behavior or visual-quality evidence.
test('web UI polish stays code-first with reference and browser evidence', () => {
  const router = read('game-interface-design/SKILL.md')
  const skill = read('threejs-game-wireframe/SKILL.md')
  const visual = read('threejs-game-wireframe/references/code-visual-design.md')
  const blueprint = read('threejs-game-wireframe/templates/wireframe-blueprint.md')
  const verification = read('threejs-game-wireframe/references/verification.md')
  assert.match(router, /existing game web UI/)
  assert.match(skill, /\(references\/code-visual-design\.md\)/)
  assert.match(skill, /explicit greybox-only/)
  assert.match(visual, /Do not invoke the Figma workflow/)
  assert.match(visual, /two inspected references/)
  assert.match(visual, /same content, viewport, and game state/)
  assert.match(visual, /Do not change ECS rules/)
  assert.match(visual, /320×568/)
  assert.match(visual, /NOT_RUN/)
  assert.match(blueprint, /## Code visual design/)
  assert.match(verification, /\(code-visual-design\.md\)/)
})

// Low risk: static instruction routing, not executed review behavior.
test('review requests stay read-only in the skill that owns the artifact', () => {
  const router = read('game-interface-design/SKILL.md')
  const wireframe = read('threejs-game-wireframe/SKILL.md')
  const design = read('reference-driven-game-design/SKILL.md')
  assert.match(router, /A review request[^\n]*Reference-Driven Game Design[^\n]*Three\.js Game Wireframe[^\n]*stays read-only/)
  assert.match(router, /names the scope, not edit permission/)
  for (const [name, skill] of Object.entries({ wireframe, design })) assert.match(skill, /ordered P0–P3/, name)
  assert.match(wireframe, /edits nothing until the user asks/)
  assert.match(design, /changes no document or Figma node until the user asks/)
})

test('product copy rules ship byte-identical to the frontend-interface-design copy', () => {
  const copy = read('threejs-game-wireframe/references/product-copy.md')
  const source = path.join(SKILLS, '../../frontend-interface-design/skills/reference-driven-figma-design/references/product-copy.md')
  assert.equal(copy, readFileSync(source, 'utf8'))
  assert.match(read('threejs-game-wireframe/references/code-visual-design.md'), /\]\(product-copy\.md\)/)
  assert.match(copy, /^## copy\/destructive-verb-noun$/m)
})

test('wireframe skill states each level, its ECS duty and the default', () => {
  const skill = read('threejs-game-wireframe/SKILL.md')
  const levels = read('threejs-game-wireframe/references/fidelity-levels.md')
  assert.match(skill, /\| `PROTOTYPE_LEVEL`\s+\| `PLAYABLE_GREYBOX`\s+\|/)
  assert.match(skill, /`LAYOUT_ONLY` has no ECS \(N\/A\)/)
  assert.match(skill, /`FLOW_PROTOTYPE` labels every timer or fake result `simulated`/)
  for (const [level, ecs] of Object.entries({
    LAYOUT_ONLY: 'N/A',
    FLOW_PROTOTYPE: 'optional',
    PLAYABLE_GREYBOX: 'required',
  })) {
    const row = levels.split('\n').find((line) => line.startsWith(`| \`${level}\``)) ?? ''
    assert.ok(row.split('|').at(-2)?.trim().startsWith(ecs), level)
  }
})

test('wireframe skill links every reference it owns', () => {
  const skill = read('threejs-game-wireframe/SKILL.md')
  for (const ref of [
    'fidelity-levels',
    'fsd-game',
    'ecs-session',
    'time-lifecycle',
    'render-input-bridge',
    'verification',
  ]) {
    assert.match(skill, new RegExp(`\\(references/${ref}\\.md\\)`), ref)
  }
  assert.match(skill, /\(templates\/wireframe-blueprint\.md\)/)
  assert.match(skill, /\(starter\/README\.md\)/)
})

test('wireframe skill defines runtime GLB loading boundaries without changing the ECS contract', () => {
  const skill = read('threejs-game-wireframe/SKILL.md')
  const assets = read('threejs-game-wireframe/references/asset-loading.md')
  const bridge = read('threejs-game-wireframe/references/render-input-bridge.md')
  const lifecycle = read('threejs-game-wireframe/references/time-lifecycle.md')
  const verification = read('threejs-game-wireframe/references/verification.md')
  const blueprint = read('threejs-game-wireframe/templates/wireframe-blueprint.md')

  assert.match(skill, /\(references\/asset-loading\.md\)/)
  for (const term of [/current (?:screen|scene)/i, /GLB/i, /registry|resolver/i, /importing it must\s+not fetch|not fetch or parse/i]) {
    assert.match(assets, term)
  }
  for (const term of [/visible=false/i, /preloadAll/i, /useGLTF\.preload|useLoader\.preload/i, /full model URL/i]) {
    assert.match(assets, term)
  }
  for (const term of [/in.?flight.*(?:completed|reuse)|(?:completed|reuse).*in.?flight/i, /rejected.*(?:remove|retry)|failed Promise/i, /finite.*idle|bounded.*idle/i, /active.*(?:consumer|working).*not.*evict/i, /cache.*(?:separate|distinct).*dispose|dispose.*separate.*cache/i]) {
    assert.match(assets, term)
  }
  for (const term of [/GLTFLoader/i, /React\/?R3F/i, /Next\.js/i, /conditionally render/i, /useGLTF|useLoader/i, /top level/i, /Suspense/i, /retry/i, /dynamic import/i]) {
    assert.match(bridge, term)
  }
  for (const term of [/scene\/?selection.*generation|generation.*scene\/?selection/i, /runId/i, /stale|late result/i, /pending.*consumer/i, /dispose/i]) {
    assert.match(lifecycle, term)
  }
  for (const term of [/network/i, /parse/i, /production.*(?:build|asset)|(?:build|asset).*production/i, /service worker|precache/i, /inline.*(?:GLB|binary)|(?:GLB|binary).*inline/i, /cold.?cache/i]) {
    assert.match(verification, term)
  }
  for (const term of [/registry import/i, /concurrent|in.?flight/i, /duplicate/i, /retry/i, /selected.*(?:character|asset)/i]) {
    assert.match(verification, term)
  }
  assert.match(blueprint, /Screen\/scene\s+\|\s+Condition\s+\|\s+Required GLB\s+\|\s+Load trigger\s+\|\s+Fallback\s+\|\s+Cache\/disposal owner/)
})

test('runtime GLB guidance keeps existing report and ECS schema contracts explicit', () => {
  const skill = read('threejs-game-wireframe/SKILL.md')
  const verification = read('threejs-game-wireframe/references/verification.md')
  const schema = JSON.parse(read('threejs-game-wireframe/schemas/wireframe-report.schema.json'))
  assert.match(skill, /FSD|headless ECS|session/i)
  assert.match(skill, /GLB|asset/i)
  assert.match(verification, /NOT_RUN|PASS|FAIL/)
  assert.match(verification, /existing.*schema|schema.*(?:unchanged|existing)|no new fields/i)
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.checks.additionalProperties, false)
  assert.equal(schema.$defs.check.additionalProperties, false)
  assert.deepEqual(Object.keys(schema.$defs.check.properties).sort(), ['command', 'evidence', 'reason', 'status'])
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    ['checks', 'ecs', 'level', 'open_risks', 'plan_source', 'ready_to_run', 'schema_version', 'simulated', 'target_dir'].sort(),
  )
  assert.deepEqual(
    Object.keys(schema.properties.checks.properties).sort(),
    ['browser', 'build', 'business', 'device', 'fsd', 'fun', 'headless', 'install', 'lint', 'typecheck', 'usability'].sort(),
  )
})

test('design skill no longer forbids the ECS handoff it now routes to', () => {
  const handoff = read('reference-driven-game-design/references/technical-handoff.md')
  const design = read('reference-driven-game-design/SKILL.md')
  assert.doesNotMatch(handoff, /No automatic ECS/)
  assert.doesNotMatch(design, /no compulsory ECS/)
  assert.match(handoff, /\(\.\.\/\.\.\/threejs-game-wireframe\/SKILL\.md\)/)
})

// Low risk: static document contracts; these checks do not execute an agent or a game.
test('optional level design connects rules, content, blockout and observed learning', () => {
  const design = read('reference-driven-game-design/SKILL.md')
  const levels = read('reference-driven-game-design/references/level-progression.md')
  const template = read('reference-driven-game-design/templates/game-design.md')
  const implementation = read('threejs-game-wireframe/SKILL.md')
  assert.match(design, /\(references\/level-progression\.md\)/)
  assert.match(levels, /STAGED.*ENDLESS.*N\/A/)
  assert.match(levels, /Learning objective/)
  assert.match(levels, /Solvability/)
  assert.match(levels, /board occupancy/)
  assert.match(levels, /book\.leveldesignbook\.com/)
  assert.match(levels, /not a validated difficulty curve/)
  assert.match(template, /## Level or pressure progression/)
  assert.match(implementation, /level-progression\.md/)
})

test('both game lanes expose concise reference-backed decision summaries', () => {
  const checkpoint = read('reference-driven-game-design/references/checkpoint-protocol.md')
  const log = read('reference-driven-game-design/templates/reference-log.md')
  const implementation = read('threejs-game-wireframe/SKILL.md')
  const delivery = read('reference-driven-game-design/references/game-delivery.md')
  assert.match(checkpoint, /## User-facing decision summaries/)
  assert.match(checkpoint, /Decision.*Evidence.*Application.*Trade-off.*Validation/)
  assert.match(checkpoint, /not private chain-of-thought/)
  assert.match(log, /## Decision explanations/)
  assert.match(implementation, /checkpoint-protocol\.md/)
  assert.match(delivery, /decision summaries/)
})
