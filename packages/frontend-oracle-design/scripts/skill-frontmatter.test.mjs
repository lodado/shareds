import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import config from '../../../eslint.config.mjs'
import { SKILLS } from './installed-skill-acceptance.mjs'

// Reuse the repository's configured YAML parser, not a regex pretending to parse YAML.
// This is a packaging test, not a runtime dependency of the installed skills.
const { languageOptions: { parser } } = config.find(({ name }) => name === 'antfu/yaml/rules')

for (const name of SKILLS) {
  test(`${name} entry has host-readable YAML metadata`, async () => {
    const text = await readFile(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8')
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    assert.notEqual(match, null, 'SKILL.md must start with closed YAML frontmatter')
    const { ast } = parser.parseForESLint(match[1])
    assert.equal(ast.body.length, 1)
    assert.equal(ast.body[0].content.type, 'YAMLMapping')
    const entries = ast.body[0].content.pairs
    assert.equal(new Set(entries.map(({ key }) => key.value)).size, entries.length)
    const values = Object.fromEntries(entries.map(({ key, value }) => [key.value, value]))
    assert.equal(values.name?.value, name)
    assert.equal(typeof values.description?.value, 'string')
    assert.notEqual(values.description.value.trim(), '')
    assert.equal(values['allowed-tools']?.type, 'YAMLSequence')
    assert.deepEqual(values['allowed-tools'].entries.map(({ value }) => value), ['Bash'])
  })
}

test('the packaging parser rejects the colon-space regression and preserves a block scalar', () => {
  assert.throws(() => parser.parseForESLint('name: sample\ndescription: even with no code yet: bug reports\n'))
  const { ast } = parser.parseForESLint('name: sample\ndescription: >-\n  even with no code yet: bug reports\n')
  assert.equal(ast.body[0].content.pairs[1].value.value, 'even with no code yet: bug reports')
})
