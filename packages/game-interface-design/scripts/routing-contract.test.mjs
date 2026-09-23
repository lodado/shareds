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

test('design skill no longer forbids the ECS handoff it now routes to', () => {
  const handoff = read('reference-driven-game-design/references/technical-handoff.md')
  const design = read('reference-driven-game-design/SKILL.md')
  assert.doesNotMatch(handoff, /No automatic ECS/)
  assert.doesNotMatch(design, /no compulsory ECS/)
  assert.match(handoff, /\(\.\.\/\.\.\/threejs-game-wireframe\/SKILL\.md\)/)
})
