import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package verification intentionally uses node --test.
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared intake asks actual human axes and implementation uses current-profile decision guidance', async () => {
  const intake = await read('references/roles/intake.md')
  assert.match(intake, /controller-resolved profile/)
  assert.match(intake, /Before source inspection or any preliminary brief, read current-stage dependencies/)
  assert.match(intake, /record only actual answers/)
  assert.match(intake, /Never edit a model, target tests or product code, approve policy, change lock/)
  const space = await read('references/roles/space-discovery.md')
  assert.match(space, /A recommendation is not approval/)
  assert.match(space, /Changed axes return to confirmation/)
  assert.match(space, /NEEDS_DECISION/)
  assert.match(space, /never silently removes unknown combinations/)
  const implement = await read('references/roles/implement.md')
  assert.match(implement, /profile-safe implementation decision guidance at the actual boundary decision/)
  assert.match(implement, /Record responsibility assignment, alternatives and rationale/)
  assert.match(implement, /accepted VALID_RED/)
  assert.match(implement, /Never change expectations, policy, card, lock, sources or consumer tests/)
})

test('confirms the axes with the user before any Bend without replacing Draft approval', async () => {
  const [skill, space, frames, graph] = await Promise.all([
    read('references/roles/intake-formal.md'),
    read('references/roles/space-discovery-formal.md'),
    read('references/card/case-space-frames.md'),
    read('references/reference-graph.json'),
  ])
  assert.match(skill, /before writing the plan or Draft,[\s\S]{0,90}Space discovery/)
  assert.match(space, /Space discovery[\s\S]{0,60}before any Bend/)
  assert.match(space, /confirmed axes do not replace Draft confirmation or authorize\s+a lock/)
  // the counterexample question and the frozen record
  assert.match(space, /Case A:.*→ correct\s+Case B:.*→ bug/)
  assert.match(space, /SUFFICIENCY FAILURE/)
  assert.match(space, /sources\/space-discovery\.md/)
  assert.match(space, /A run where the user cannot answer ends `?NEEDS_DECISION`? with the first question/)
  // the legacy briefing stays for hand-written cards
  assert.match(frames, /## Pre-plan test-space briefing/)
  assert.match(frames, /does not replace Draft confirmation or authorize a lock/)
  const nodes = JSON.parse(graph).nodes
  assert.match(nodes.find(({ id }) => id === 'role-space-discovery').when, /after source investigation and before authoring/)
  assert.match(nodes.find(({ id }) => id === 'role-space-discovery-formal').when, /Formal source and axes investigation/)
  assert.match(nodes.find(({ id }) => id === 'card-case-space').when, /current-profile card or verification-artifact authoring/)
  assert.match(nodes.find(({ id }) => id === 'card-case-space-frames').when, /current-profile frame enumeration/)
  const formalSpace = await read('references/card/case-space.md')
  assert.match(formalSpace, /model package|projected card/)
  assert.match(frames, /legacy|hand-written/)
})

test('explains dimension provenance without promoting implementation into policy', async () => {
  const space = await read('references/card/case-space-frames.md')
  assert.match(space, /source ID and exact location/)
  assert.match(space, /file:line/)
  assert.match(space, /observations are investigation evidence, not approved policy/)
  assert.match(space, /Assumption/)
  assert.match(space, /Unknown is not excluded/)
})

test('separates Cartesian candidates, generated frames and executable tests', async () => {
  const space = await read('references/card/case-space-frames.md')
  assert.match(space, /2 × 3 × 2 = 12/)
  assert.match(space, /candidate combinations ≠ generated frames ≠ executable tests/)
  assert.match(space, /union of excluded combinations/)
  assert.match(space, /uncomputed/)
  assert.match(space, /zero dimensions/)
  assert.match(space, /\[error\][\s\S]*standalone/)
  assert.match(space, /Strength: 2[\s\S]*High[\s\S]*3/)
  assert.match(space, /Never silently reduce required high-risk combinations/)
  assert.match(space, /Do not multiply assertion criteria/)
})

test('provides five user-facing messages with evidence and uncertainty boundaries', async () => {
  const common = await read('references/common.md')
  for (const heading of ['Start', 'Progress', 'Decision', 'Failure', 'Completion']) {
    assert.match(common, new RegExp(`\\| ${heading}\\s+\\|`))
  }
  assert.match(common, /facts, assumptions, and recommendations/)
  assert.match(common, /Do not invent percentages or ETAs/)
  assert.match(common, /only when the stage, evidence, scope, or blocker changes/)
  assert.match(common, /runId/)
  assert.match(common, /IMPLEMENTED_GREEN[\s\S]*REVIEW_VERIFIED/)
  assert.match(common, /Low fast path/)
})

test('keeps progress informational and makes scope changes visible', async () => {
  const [common, space] = await Promise.all([
    read('references/common.md'),
    read('references/card/case-space-frames.md'),
  ])
  assert.match(common, /not an extra approval gate/)
  assert.match(space, /added\/removed dimensions/)
  assert.match(space, /count delta/)
  assert.match(space, /residual risk/)
})

test('material implementation explanations cite applied guidance without adding ceremony', async () => {
  const [skill, decision] = await Promise.all([
    read('references/roles/implement-formal.md'),
    read('references/delivery/implementation-decision.md'),
  ])
  assert.match(skill, /implementation-decision\.md#explain-material-choices/)
  assert.match(skill, /no earlier load or approval/)
  assert.match(decision, /choice.*current-code\s+rationale.*applied skill section/s)
  assert.match(decision, /heading anchor.*verified current lines/s)
  assert.match(decision, /actually inspected/)
  assert.match(decision, /file.*symbol.*commit\s+permalink/s)
  assert.match(decision, /structural facts.*interpretation/s)
  assert.match(decision, /Commercial use alone is not evidence/)
  assert.match(decision, /not product-policy authority/)
  assert.match(decision, /No mandatory external research/)
  assert.match(decision, /Trivial changes need no citation checklist/)
  assert.match(skill, /short illustrative type or code examples/)
  assert.match(decision, /type shape and call-site or operation example/)
  assert.match(decision, /existing symbols from proposed ones/)
  assert.match(decision, /not evidence of compilation or execution/)
  assert.match(decision, /do not authorize production edits before VALID_RED/)
})

test('the Space discovery interview keeps provenance and never confirms an axis for the user', async () => {
  const space = await read('references/roles/space-discovery-formal.md')
  assert.match(space, /source ID and exact location/)
  assert.match(space, /observations are investigation evidence, not approved policy/)
  assert.match(space, /Unknown is not excluded/)
  assert.match(space, /An axis that changes product policy is the user's to\s+confirm,\s+never the agent's/)
  assert.match(space, /added\/removed\s+dimensions/)
})

/** prettier가 산문을 다시 줄바꿈해도 살아남는 pin — 공백은 전부 `\s+`. */
const loose = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))

test('the request text is S1, so an empty repo never blocks intake or the Draft', async () => {
  const [common, entry, skill, intake, contract] = await Promise.all([
    read('references/common.md'),
    read('references/controller-entry-formal.md'),
    read('SKILL.md'),
    read('references/roles/intake.md'),
    read('../frontend-contract-design/SKILL.md'),
  ])
  assert.match(common, /### The request text is S1/)
  assert.match(common, loose('Intake registers it as `S1`'))
  assert.match(common, loose('for exactly what it states, nothing more. Anything the request does not state stays an Open question'))
  assert.match(common, loose('record `no code observation` in the Source Registry and continue intake and the Draft from `S1`'))
  // 멈춤은 Delivery의 실제 코드 부재, 또는 사용자가 지목한 문서를 못 읽고 요청도 그 결정을 말하지 않을 때만
  assert.match(common, loose('applies only when Delivery needs actual code that is not there'))
  assert.match(common, loose('a substitute brief is one built from guessed sources'))
  assert.match(entry, loose('A substitute brief is one built from guessed sources'))
  assert.match(entry, loose('never blocks intake or the Draft'))
  assert.match(skill, loose('an empty repo is `no code observation`, never a blocker'))
  assert.match(intake, loose('`no code observation`, not a missing source'))
  assert.match(contract, loose('one built from guessed sources'))
})

test('the first response carries axes, a provisional Draft and Open questions under one yes', async () => {
  const [common, entry, space, controller, author] = await Promise.all([
    read('references/common.md'),
    read('references/controller-entry-formal.md'),
    read('references/roles/space-discovery-formal.md'),
    read('references/roles/controller-formal.md'),
    read('references/roles/author-formal.md'),
  ])
  assert.match(common, /### First response — one message, one confirmation/)
  assert.match(common, loose('starts with the literal lane header line, even when it stops'))
  assert.match(common, loose('payment, permission, destructive or data-loss work is `risk=High`'))
  assert.match(common, loose('each of the eight input families declared'))
  assert.match(common, loose('a non-empty Never (never `—`) and a side-effect count'))
  assert.match(common, loose('each with at least two options and exactly one recommended'))
  assert.match(common, loose('a bare `yes` adopts every recommendation and confirms the axes and the Draft together'))
  assert.match(common, loose('Do not ask questions before this message'))
  assert.match(common, loose('Every row and policy line has a Source column or tag: `S1` only for what the request states'))
  assert.match(common, loose('It asks for nothing else: no code path, repository or document location'))
  assert.match(common, loose('and both release orders. Label it planned, not run'))
  assert.match(common, loose('Until the `yes` arrives the state is `NEEDS_DECISION`'))
  assert.match(common, loose('Outcome Brief with its `Risk:` line and the worst regression a false pass would ship'))
  assert.match(common, loose('split it out of an `S1` row into a row citing that question'))
  assert.match(common, /Interaction sweep:\n- pending × \{click,Enter,tap\} → covered\(R1\)/)
  assert.match(entry, loose('It is the literal first line of the first response even when that response stops'))
  // Bend는 여전히 yes 뒤에만; 증명이 찾은 것만 후속 질문
  assert.match(space, loose('Do not write World.bend, a state machine or a law before that `yes`'))
  assert.match(space, loose('Only what the proof finds comes back as a follow-up question'))
  assert.match(space, loose("ride the first response's provisional Draft, never a round of their own before it"))
  assert.doesNotMatch(space, /go out before the Draft/)
  assert.match(author, loose('only proof counterexamples and new axes return as follow-up questions'))
  // lock 승인은 그대로 실제 사람의 재확인
  assert.match(space, loose('the projected card is still re-presented and approved before lock'))
  assert.match(controller, loose('This re-presents the projected card after proof'))
  assert.doesNotMatch(controller, /answer kills a branch, including the discovery axes/)
})
