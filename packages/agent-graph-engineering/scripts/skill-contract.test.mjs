import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const skillDirectory = join(packageDirectory, 'skills/agent-graph-engineering')

test('keeps plugin release metadata versions aligned', async () => {
  const [packageJson, claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    readFile(join(packageDirectory, 'package.json'), 'utf8'),
    readFile(join(packageDirectory, '.claude-plugin/plugin.json'), 'utf8'),
    readFile(join(packageDirectory, '.codex-plugin/plugin.json'), 'utf8'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const marketplaceVersion = JSON.parse(marketplaceJson).plugins.find(
    ({ name }) => name === 'agent-graph-engineering',
  )?.version

  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(JSON.parse(codexPluginJson).version, version)
  assert.equal(marketplaceVersion, version)
})

test('ships a discoverable graph contract and bundled deterministic controller', async () => {
  const [skill, contract] = await Promise.all([
    readFile(join(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(join(skillDirectory, 'references/graph-contract.md'), 'utf8'),
  ])

  assert.match(skill, /name: agent-graph-engineering/)
  assert.match(skill, /references\/graph-contract\.md/)
  assert.match(skill, /graph-verify\.mjs next/)
  assert.match(contract, /dispatch: one/)
  assert.doesNotMatch(`${skill}\n${contract}`, /Mastra|LangGraph|TODO/)
})
