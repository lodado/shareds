import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/test')
const repositoryDirectory = dirname(dirname(packageDirectory))

test('ships the frontend test contract with its required BVA reference', async () => {
  const [skill, bundledBva, oracleBva] = await Promise.all([
    readFile(join(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(join(skillDirectory, 'references/bva.md'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/frontend-oracle-design/skills/references/bva.md'), 'utf8'),
  ])

  assert.match(skill, /name: test/)
  assert.match(skill, /references\/bva\.md/)
  assert.match(skill, /VALID_RED 술어/)
  assert.equal(bundledBva, oracleBva)
})

test('runs visual locks as headless style tests without a direct browser loop', async () => {
  const skill = await readFile(join(skillDirectory, 'SKILL.md'), 'utf8')

  assert.match(skill, /headless.*`\*\.style\.(?:test|spec)/s)
  assert.match(skill, /별도 직접 브라우저.*실행하지 않는다/s)
  assert.doesNotMatch(skill, /BROWSER_VERIFIED|브라우저 루프/)
})
