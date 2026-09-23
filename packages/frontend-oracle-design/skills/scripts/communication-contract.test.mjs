import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package verification intentionally uses node --test.
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('briefs the test space before planning without replacing Draft approval', async () => {
  const [skill, space, graph] = await Promise.all([
    read('SKILL.md'),
    read('references/card/case-space.md'),
    read('references/reference-graph.json'),
  ])
  assert.match(skill, /before writing the plan or Draft, print the test-space briefing/)
  assert.match(space, /## Pre-plan test-space briefing/)
  assert.match(space, /does not replace Draft confirmation or authorize a lock/)
  const node = JSON.parse(graph).nodes.find(({ id }) => id === 'card-case-space')
  assert.match(node.when, /before writing the plan or Draft/)
})

test('explains dimension provenance without promoting implementation into policy', async () => {
  const space = await read('references/card/case-space.md')
  assert.match(space, /source ID and exact location/)
  assert.match(space, /file:line/)
  assert.match(space, /observations are investigation evidence, not approved policy/)
  assert.match(space, /Assumption/)
  assert.match(space, /Unknown is not excluded/)
})

test('separates Cartesian candidates, generated frames and executable tests', async () => {
  const space = await read('references/card/case-space.md')
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
    read('references/card/case-space.md'),
  ])
  assert.match(common, /not an extra approval gate/)
  assert.match(space, /added\/removed dimensions/)
  assert.match(space, /count delta/)
  assert.match(space, /residual risk/)
})

test('material implementation explanations cite applied guidance without adding ceremony', async () => {
  const [skill, decision] = await Promise.all([
    read('SKILL.md'),
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
