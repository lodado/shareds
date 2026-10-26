import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const read = (path) => readFile(join(packageDirectory, path), 'utf8')
const skillFiles = ['SKILL.md', 'references/explore.md', 'references/claims.md']

test('keeps plugin release metadata versions aligned', async () => {
  const [packageJson, claude, codex, marketplace] = await Promise.all([
    read('package.json'),
    read('.claude-plugin/plugin.json'),
    read('.codex-plugin/plugin.json'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const entry = JSON.parse(marketplace).plugins.find(({ name }) => name === 'app-research')
  assert.equal(JSON.parse(claude).version, version)
  assert.equal(JSON.parse(codex).version, version)
  assert.equal(JSON.parse(codex).skills, './skills/')
  assert.equal(entry?.version, version)
  assert.equal(entry?.source, './packages/app-research')
})

test('is invoked explicitly and keeps the safety and honesty contract', async () => {
  const skill = await read('skills/app-research/SKILL.md')
  assert.match(skill, /^name: app-research$/m)
  assert.match(skill, /^disable-model-invocation: true$/m)
  assert.match(skill, /explicitly\s+invokes\s+`\$app-research`/)
  assert.match(skill, /Never\s+pay,\s+send\s+a\s+real\s+message,\s+delete\s+an\s+account,\s+give\s+legal\s+consent/)
  assert.match(skill, /Credentials\s+never\s+enter\s+a\s+run/)
  assert.match(skill, /Never\s+promote\s+an\s+inference\s+to\s+an\s+observed\s+fact/)
  assert.match(skill, /Never\s+present\s+it\s+as\s+a\s+share\s+of\s+the\s+whole\s+app/)
  assert.match(skill, /Gate\s+is\s+a\s+floor,\s+not\s+the\s+ceiling/)
  assert.match(skill, /`ux-flow-diagram`/)
})

test('is explicit-invocation only for the Codex interface too', async () => {
  const yaml = await read('skills/app-research/agents/openai.yaml')
  assert.match(yaml, /^policy:\n {2}allow_implicit_invocation: false$/m)
  assert.match(yaml, /\$app-research/)
})

test('documents every status that lint enforces', async () => {
  const claims = await read('skills/app-research/references/claims.md')
  const { POLICY_STATUSES, POLICY_CATEGORIES } = await import('../skills/app-research/scripts/lint.mjs')
  for (const status of POLICY_STATUSES) assert.match(claims, new RegExp(`\\|\\s+${status}\\s+\\|`))
  for (const category of POLICY_CATEGORIES) assert.match(claims, new RegExp(`\\b${category}\\b`))
})

test('documents every command the CLI accepts', async () => {
  const skill = await read('skills/app-research/SKILL.md')
  for (const command of ['init', 'observe', 'identify', 'next', 'gate', 'status', 'lint', 'render']) {
    assert.match(skill, new RegExp(`scripts/cli\\.mjs ${command} `))
  }
})

test('keeps skill documents English, host-neutral and free of source credits', async () => {
  for (const file of skillFiles) {
    const text = await read(`skills/app-research/${file}`)
    assert.doesNotMatch(text, /\p{Script=Hangul}/u, `${file} contains Hangul`)
    assert.doesNotMatch(text, /\b(codex|jcode|opencode)\b/i, `${file} names a host`)
    assert.doesNotMatch(text, /inspired by|based on|adapted from/i, `${file} credits a source`)
  }
})

test('ships only the files the skill references', async () => {
  assert.deepEqual((await readdir(join(packageDirectory, 'skills/app-research/references'))).sort(), [
    'claims.md',
    'explore.md',
  ])
  const skill = await read('skills/app-research/SKILL.md')
  assert.match(skill, /\(references\/explore\.md\)/)
  assert.match(skill, /\(references\/claims\.md\)/)
})
