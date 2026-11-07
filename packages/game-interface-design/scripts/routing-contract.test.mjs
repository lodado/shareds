import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkTrace, normalizeTrace } from '../skills/lifelike-cat-motion/scripts/check-trace.mjs'

// Static contract between the router, the skills and the routing rubric; model behavior is not executed here.
// The cat lane's trace checker is a plain script, so its rules run at the end of this file.
const SKILLS = fileURLToPath(new URL('../skills/', import.meta.url))
const read = (rel) => readFileSync(path.join(SKILLS, rel), 'utf8')
const cases = JSON.parse(read('threejs-game-wireframe/evals/boundary-cases.json'))

const MODES = new Set(['PLAN_ONLY', 'FIGMA', 'THREEJS_WIREFRAME', 'PIXEL_SPRITE', 'CAT_MOTION', 'PIXEL_DIORAMA'])
const LEVELS = new Set([null, 'LAYOUT_ONLY', 'FLOW_PROTOTYPE', 'PLAYABLE_GREYBOX'])
const ECS = new Set(['n/a', 'optional', 'required'])
const SKILL_FOR_MODE = {
  PLAN_ONLY: 'reference-driven-game-design',
  FIGMA: 'reference-driven-game-design',
  THREEJS_WIREFRAME: 'threejs-game-wireframe',
  PIXEL_SPRITE: 'pixel-sprite-animation',
  CAT_MOTION: 'lifelike-cat-motion',
  PIXEL_DIORAMA: 'pixel-art-diorama',
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
  for (const mode of MODES) assert.ok(cases.cases.some((c) => c.expect.mode === mode), `no case covers ${mode}`)
})

test('router names every mode and links every target skill', () => {
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

// Low risk: static instruction routing for the sprite lane; the harness itself is tested in pixel-sprite.test.mjs.
test('sprite requests route to the pixel lane, which owns its review and links its references', () => {
  const router = read('game-interface-design/SKILL.md')
  const pixel = read('pixel-sprite-animation/SKILL.md')
  assert.match(router, /A review request[^\n]*sprite spec → Pixel Sprite Animation[^\n]*stays read-only/)
  assert.match(router, /finished sprites into a playable prototype is `THREEJS_WIREFRAME`/)
  assert.match(pixel, /ordered P0–P3/)
  assert.match(pixel, /without editing until asked/)
  for (const ref of ['principles', 'timing-and-feel', 'spec-format', 'lint-rules', 'pipelines']) {
    assert.match(pixel, new RegExp(`\\(references/${ref}\\.md\\)`), ref)
  }
  assert.match(pixel, /\(examples\/knight-slash\/sprite\.json\)/)
  assert.match(pixel, /`BASE_DIFF` \(default\)/)
  assert.match(pixel, /Never claim fun without a playtest/)
})

// Low risk: static instruction routing for the cat lane; its trace checker is tested at the end of this file.
test('cat behavior requests route to the cat lane, which owns its review and links its references', () => {
  const router = read('game-interface-design/SKILL.md')
  const cat = read('lifelike-cat-motion/SKILL.md')
  assert.match(router, /A review request[^\n]*cat behavior or trace → Lifelike Cat Motion[^\n]*stays read-only/)
  assert.match(router, /drawing its sprite frames stays `PIXEL_SPRITE`/)
  assert.match(cat, /ordered P0–P3/)
  assert.match(cat, /without editing\s+until asked/)
  for (const ref of [
    'behavior-catalog',
    'body-language',
    'interaction-model',
    'motion-and-timing',
    'trace-check',
    'limb-rig-and-gait',
    'raster-view-rigging',
  ]) {
    assert.match(cat, new RegExp(`\\(references/${ref}\\.md\\)`), ref)
  }
  assert.match(cat, /`node scripts\/check-trace\.mjs <trace\.json>`/)
  assert.match(cat, /Never\s+claim\s+the\s+cat\s+feels\s+alive\s+on\s+the\s+strength\s+of\s+the\s+check\s+alone/)
})

// Low risk: static instruction routing for the diorama lane; the code it quotes is tested in the app it came from.
test('pixel-art 3D diorama requests route to the diorama lane, which owns its review and ships whole modules', () => {
  const router = read('game-interface-design/SKILL.md')
  const diorama = read('pixel-art-diorama/SKILL.md')
  assert.match(router, /A review request[^\n]*diorama scene → Pixel Art Diorama[^\n]*stays read-only/)
  assert.match(router, /animating its sprites stays `PIXEL_SPRITE`/)
  assert.match(diorama, /ordered\s+P0–P3/)
  assert.match(diorama, /without editing until asked/)
  assert.match(diorama, /NOT_RUN/)
  for (const ref of ['render-pipeline', 'camera', 'scene', 'simulation', 'draw-calls', 'verification', 'pitfalls']) {
    assert.match(diorama, new RegExp(`\\(references/${ref}\\.md\\)`), ref)
  }
  // each code block opens with its module path, so its relative imports resolve
  for (const ref of ['render-pipeline', 'camera', 'scene', 'simulation', 'draw-calls', 'verification']) {
    assert.match(read(`pixel-art-diorama/references/${ref}.md`), /^```\w*\n\/\/ (?:src|qa)\/\S+\.\w+$/m, ref)
  }
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

// Low risk: the cat lane's trace checker is a pure function over a JSON event list plus a file-reading CLI;
// each rule is pinned at its timing boundaries with synthetic traces.
const CHECK_TRACE = path.join(SKILLS, 'lifelike-cat-motion/scripts/check-trace.mjs')
const RULE_IDS = ['swat-warning', 'pounce-anticipation', 'blink-reply', 'startle-latency', 'mood-continuity', 'gait-footfalls', 'idle-variety', 'attention-chain']
const state = (t, name, kind = 'social') => ({ t, type: 'state', name, kind })
const signal = (t, name, cause) => ({ t, type: 'signal', name, cause })
const stimulus = (t, name) => ({ t, type: 'stimulus', name })
const contact = (t, foot, gait = 'walk') => ({ t, type: 'contact', foot, gait })
const mood = (t, valence, arousal = 0.2) => ({ t, type: 'mood', valence, arousal })
const clean = (checked = 1) => ({ checked, failures: [] })
function rule(events, id) {
  const { checked, failures } = checkTrace(events).rules.find((r) => r.id === id)
  return { checked, failures }
}

test('check-trace: a swat needs a warning signal between 4 s and 0.4 s before it', () => {
  const swat = (t) => state(t, 'swat', 'defense')
  assert.deepEqual(rule([signal(1, 'tailFlick'), swat(1.4)], 'swat-warning'), clean())
  assert.deepEqual(rule([signal(0, 'earsFlat'), swat(4)], 'swat-warning'), clean())
  const unwarned = ['swat at 1.40s has no warning signal 0.4–4 s before it']
  assert.deepEqual(rule([signal(1.01, 'tailFlick'), swat(1.4)], 'swat-warning').failures, unwarned)
  assert.deepEqual(rule([signal(1, 'wiggle'), swat(1.4)], 'swat-warning').failures, unwarned)
  assert.deepEqual(rule([signal(0, 'earsFlat'), swat(4.01)], 'swat-warning').failures, ['swat at 4.01s has no warning signal 0.4–4 s before it'])
})

test('check-trace: a pounce directly follows a crouch of at least 0.3 s that holds a wiggle', () => {
  const pounce = (t) => state(t, 'pounce', 'play')
  const crouch = [state(0, 'crouch', 'play'), signal(0.1, 'wiggle')]
  assert.deepEqual(rule([...crouch, pounce(0.3)], 'pounce-anticipation'), clean())
  assert.deepEqual(rule([...crouch, pounce(0.29)], 'pounce-anticipation').failures, ['crouch before the pounce at 0.29s lasted 0.29s, under 0.3 s'])
  assert.deepEqual(rule([state(0, 'crouch', 'play'), pounce(0.5)], 'pounce-anticipation').failures, ['crouch before the pounce at 0.50s has no wiggle'])
  assert.deepEqual(rule([state(0, 'stalk', 'play'), signal(0.1, 'wiggle'), pounce(0.5)], 'pounce-anticipation').failures, ['pounce at 0.50s does not follow a crouch'])
})

test('check-trace: a blink reply holds a half-blink, then an eye narrowing for at least 0.6 s', () => {
  const reply = [state(0, 'blinkReply'), signal(0.1, 'halfBlink'), signal(0.3, 'eyesNarrow')]
  assert.deepEqual(rule([...reply, signal(0.9, 'eyesOpen')], 'blink-reply'), clean())
  // With no eyesOpen the narrowing lasts until the next state.
  assert.deepEqual(rule([...reply, state(1, 'sit', 'idle')], 'blink-reply'), clean())
  assert.deepEqual(rule([...reply, signal(0.89, 'eyesOpen')], 'blink-reply').failures, ['blink reply at 0.00s holds the narrowing 0.59s, under 0.6 s'])
  const narrowFirst = [state(0, 'blinkReply'), signal(0.1, 'eyesNarrow'), signal(0.3, 'halfBlink'), signal(1, 'eyesOpen')]
  assert.deepEqual(rule(narrowFirst, 'blink-reply').failures, ['blink reply at 0.00s lacks a half-blink followed by an eye narrowing'])
})

test('check-trace: a startle starts within 0.12 s of a poke or noise and lasts at least 0.3 s', () => {
  const startle = (t) => state(t, 'startle', 'defense')
  const wary = (t) => state(t, 'wary', 'defense')
  assert.deepEqual(rule([stimulus(1, 'poke'), startle(1.12), wary(1.42)], 'startle-latency'), clean())
  assert.deepEqual(rule([stimulus(1, 'noise'), startle(1.05), wary(1.4)], 'startle-latency'), clean())
  assert.deepEqual(rule([stimulus(1, 'poke'), startle(1.13), wary(1.5)], 'startle-latency').failures, ['startle at 1.13s has no poke or noise within 0.12 s before it'])
  assert.deepEqual(rule([stimulus(1, 'stroke'), startle(1.05), wary(1.5)], 'startle-latency').failures, ['startle at 1.05s has no poke or noise within 0.12 s before it'])
  assert.deepEqual(rule([stimulus(1, 'poke'), startle(1.05), wary(1.34)], 'startle-latency').failures, ['startle at 1.05s lasts 0.29s, under 0.3 s'])
})

test('check-trace: with no stimulus in between, valence and arousal move at most 1.5 per second', () => {
  assert.deepEqual(rule([mood(0, -0.5), mood(1, 1)], 'mood-continuity'), clean())
  assert.deepEqual(rule([mood(0, -0.5), mood(1, 1.01)], 'mood-continuity').failures, ['valence moved 1.51/s between 0.00s and 1.00s with no stimulus'])
  assert.deepEqual(rule([mood(0, 0, 0), mood(0.5, 0, 0.8)], 'mood-continuity').failures, ['arousal moved 1.60/s between 0.00s and 0.50s with no stimulus'])
  // A stimulus in the gap may move the mood at any speed, so that gap is not checked.
  assert.deepEqual(rule([mood(0, -1), stimulus(0.1, 'poke'), mood(0.2, 1)], 'mood-continuity'), clean(0))
})

test('check-trace: mood samples require finite valence and arousal', () => {
  const invalidValence = { ...mood(0), valence: Number.NaN }
  const invalidArousal = { ...mood(0), arousal: Number.POSITIVE_INFINITY }
  const missingFields = { t: 0, type: 'mood' }
  for (const event of [invalidValence, invalidArousal, missingFields]) {
    assert.throws(() => normalizeTrace([event]), {
      name: 'TypeError',
      message: 'event 0 mood needs finite valence and arousal',
    })
  }
})

test('check-trace: walk footfalls run LH → LF → RH → RF and trot feet land in diagonal pairs', () => {
  const walk = ['LH', 'LF', 'RH', 'RF', 'LH'].map((foot, i) => contact(i * 0.25, foot))
  assert.deepEqual(rule(walk, 'gait-footfalls'), clean(4))
  assert.deepEqual(rule([contact(0, 'LH'), contact(0.25, 'RH')], 'gait-footfalls').failures, ['walk contact RH at 0.25s follows LH; expected LF'])
  // A pause of 2 s starts a new bout on any foot; 1.99 s does not.
  assert.deepEqual(rule([contact(0, 'LH'), contact(2, 'RH')], 'gait-footfalls'), clean(0))
  assert.deepEqual(rule([contact(0, 'LH'), contact(1.99, 'RH')], 'gait-footfalls').failures, ['walk contact RH at 1.99s follows LH; expected LF'])
  assert.deepEqual(rule([contact(0, 'LH', 'trot'), contact(0.06, 'RF', 'trot')], 'gait-footfalls'), clean(2))
  assert.deepEqual(rule([contact(0, 'LH', 'trot'), contact(0.07, 'RF', 'trot')], 'gait-footfalls').failures, [
    'trot contact LH at 0.00s has no RF contact within 0.06 s',
    'trot contact RF at 0.07s has no LH contact within 0.06 s',
  ])
})

test('check-trace: no three back-to-back idle states share a name', () => {
  const idle = (t, name) => state(t, name, 'idle')
  assert.deepEqual(rule([idle(0, 'sit'), idle(2, 'sit'), idle(4, 'groom')], 'idle-variety'), clean())
  assert.deepEqual(rule([idle(0, 'sit'), idle(2, 'sit'), idle(4, 'sit')], 'idle-variety').failures, ['idle state sit plays a third time in a row at 4.00s'])
  // Sitting again after each stroke is not repetition: another state breaks the run.
  assert.deepEqual(rule([idle(0, 'sit'), state(1, 'petted'), idle(2, 'sit'), state(3, 'petted'), idle(4, 'sit')], 'idle-variety'), clean(0))
})

test('check-trace: a head turn toward a call or noise comes 0.03–0.4 s after an ear turn with the same cause', () => {
  const ears = (t, cause = 'call') => signal(t, 'earsTurn', cause)
  const head = (t, cause = 'call') => signal(t, 'headTurn', cause)
  assert.deepEqual(rule([ears(0), head(0.03)], 'attention-chain'), clean())
  assert.deepEqual(rule([ears(0), head(0.4)], 'attention-chain'), clean())
  assert.deepEqual(rule([ears(0.01), head(0.03)], 'attention-chain').failures, ['head turn for call at 0.03s has no ear turn 0.03–0.4 s before it'])
  assert.deepEqual(rule([ears(0), head(0.41)], 'attention-chain').failures, ['head turn for call at 0.41s has no ear turn 0.03–0.4 s before it'])
  assert.deepEqual(rule([ears(0, 'noise'), head(0.2)], 'attention-chain').failures, ['head turn for call at 0.20s has no ear turn 0.03–0.4 s before it'])
  // The cat's own glances answer no stimulus, so they are not checked.
  assert.deepEqual(rule([head(0.2, 'self')], 'attention-chain'), clean(0))
})

test('check-trace: input is a time-ordered event list, bare or under "events"', () => {
  const sit = state(0, 'sit', 'idle')
  assert.deepEqual(normalizeTrace({ events: [sit] }), [sit])
  assert.deepEqual(normalizeTrace([sit]), [sit])
  const notAList = { name: 'TypeError', message: 'trace must be an array of events or { "events": [...] }' }
  assert.throws(() => normalizeTrace(null), notAList)
  assert.throws(() => normalizeTrace({ events: 'sit' }), notAList)
  const badEvent = { name: 'TypeError', message: 'event 0 needs a finite t and a type' }
  assert.throws(() => normalizeTrace([{ t: Number.NaN, type: 'state' }]), badEvent)
  assert.throws(() => normalizeTrace([{ t: 0 }]), badEvent)
  assert.throws(() => normalizeTrace([sit, state(-0.5, 'loaf', 'idle')]), { name: 'TypeError', message: 'event 1 goes back in time' })
})

test('check-trace: a rule with nothing to check passes but is listed as not exercised', () => {
  assert.deepEqual(checkTrace([]), { ok: true, events: 0, rules: RULE_IDS.map((id) => ({ id, ...clean(0) })), notExercised: RULE_IDS })
  const report = checkTrace([mood(0, 0), mood(1, 0.5)])
  assert.equal(report.ok, true)
  assert.deepEqual(report.notExercised, RULE_IDS.filter((id) => id !== 'mood-continuity'))
})

test('check-trace CLI exits 0 on a clean trace, 1 on a failing one and 2 on unusable input', (t) => {
  const scratch = path.join(SKILLS, '../.test-tmp')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'cat-trace-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const save = (name, text) => {
    writeFileSync(path.join(dir, name), text)
    return path.join(dir, name)
  }
  const run = (...args) => spawnSync(process.execPath, [CHECK_TRACE, ...args], { encoding: 'utf8' })

  const passing = run(save('passing.json', JSON.stringify({ events: [mood(0, 0), mood(1, 0.5)] })))
  assert.equal(passing.status, 0)
  assert.equal(JSON.parse(passing.stdout).ok, true)

  const failing = run(save('failing.json', JSON.stringify([mood(0, -1), mood(0.5, 1)])))
  assert.equal(failing.status, 1)
  assert.deepEqual(JSON.parse(failing.stdout).rules.find((r) => r.id === 'mood-continuity').failures, ['valence moved 4.00/s between 0.00s and 0.50s with no stimulus'])

  const usage = run()
  assert.equal(usage.status, 2)
  assert.equal(usage.stderr, 'usage: node scripts/check-trace.mjs <trace.json>\n')

  for (const target of [
    save('broken.json', '{'),
    save('invalid-mood.json', JSON.stringify([mood(0), { ...mood(1), arousal: null }])),
    path.join(dir, 'missing.json'),
  ]) {
    const unusable = run(target)
    assert.equal(unusable.status, 2, target)
    assert.equal(unusable.stdout, '', target)
    assert.match(unusable.stderr, /^check-trace: /, target)
  }
})
