import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/frontend-interface-design')
const read = (relativePath) => readFile(join(skillDirectory, relativePath), 'utf8')

const section = (text, heading) => {
  const start = text.indexOf(heading)
  assert.notEqual(start, -1, `missing section: ${heading}`)
  const rest = text.slice(start + heading.length)
  const next = rest.search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next)
}

test('keeps the always-on skill short and limited to six core contracts', async () => {
  const skill = await read('SKILL.md')
  assert.ok(skill.split('\n').length <= 60, 'SKILL.md exceeds the 60-line always-on budget')
  assert.ok(Buffer.byteLength(skill, 'utf8') <= 9000, 'SKILL.md exceeds the 9KB UTF-8 budget')

  const contracts = section(skill, '## 핵심 계약')
    .split(/\n(?=\d+\. )/)
    .filter((line) => /^\d+\. /.test(line.trim()))
  assert.ok(contracts.length > 0, 'core contract section is empty')
  assert.ok(contracts.length <= 6, `found ${contracts.length} core contracts; maximum is 6`)
})

test('does not load one-shot as an always-on reference', async () => {
  const skill = await read('SKILL.md')
  const alwaysOn = section(skill, '## 참조 로드')
    .split('\n')
    .find((line) => /\|\s*상시\s*\|/.test(line))
  assert.ok(alwaysOn, 'reference-load table has no always-on row')
  assert.doesNotMatch(alwaysOn, /one-shot\.md/)
})

test('puts signature generation in art-direction rather than repeating it in craft', async () => {
  const [artDirection, craft] = await Promise.all([read('references/art-direction.md'), read('references/craft.md')])
  for (const cue of ['주인공', '표현의 중심', '말 대신 만든다', '같은 언어로 확장']) {
    assert.match(artDirection, new RegExp(cue), `art-direction missing signature cue: ${cue}`)
  }
  assert.doesNotMatch(craft, /브랜드 순간은 하나/)
})

test('removes the common font-family gate while retaining ten-question color-role review', async () => {
  const [gates, briefs] = await Promise.all([read('evals/gates.json'), read('evals/briefs.json')])
  const defaults = JSON.parse(gates)
  assert.equal(defaults.gates.fontFamilyCount, undefined)

  const { briefs: entries } = JSON.parse(briefs)
  assert.ok(entries.length > 0)
  for (const entry of entries) {
    assert.equal(entry.checklist?.length, 10, `${entry.id}: checklist must contain ten questions`)
    assert.ok(
      entry.checklist.some((question) => /색.*역할|브랜드.*정보.*행동|color role/i.test(question)),
      `${entry.id}: missing color-role question`,
    )
    assert.ok(
      !entry.checklist.some((question) => /accent.{0,20}5%|5%.{0,20}accent/i.test(question)),
      `${entry.id}: retains the old accent-area rule`,
    )
  }
})
