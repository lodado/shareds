import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

import functional from './functional.mjs'
import { OWNERS } from './hook-tiers.mjs'
import base from './index.mjs'
import localRules from './local-rules.js'

const configDir = path.dirname(fileURLToPath(import.meta.url))
// Agents learn these presets from the eslint-setup skill, so its tables must match the code.
const skill = fs.readFileSync(path.join(configDir, '../vibe-coding-helper/skills/eslint-setup/SKILL.md'), 'utf8')

const section = (heading) => {
  const start = skill.indexOf(`\n${heading}`)
  assert.notEqual(start, -1, heading)
  const end = skill.indexOf('\n#', start + heading.length + 1)
  return skill.slice(start, end === -1 ? undefined : end)
}

test('eslint-setup documents each local rule at the severity local-rules ships', () => {
  const shipped = Object.fromEntries(
    Object.entries(localRules[0].rules).map(([id, severity]) => [id.replace('@lodado/local-rules/', ''), severity]),
  )
  const documented = Object.fromEntries(
    [...section('## Local rules').matchAll(/^\| `([\w-]+)` +\| (error|warn|off) +\|/gm)].map(([, rule, severity]) => [rule, severity]),
  )
  assert.ok(Object.keys(documented).length > 0)
  for (const [rule, severity] of Object.entries(documented)) assert.equal(shipped[rule], severity, rule)
  for (const [rule, severity] of Object.entries(shipped)) {
    if (severity !== 'off') assert.equal(documented[rule], severity, `${rule} is on but not documented`)
  }
})

test('eslint-setup names only directories the functional preset covers', async () => {
  const eslint = new ESLint({ cwd: configDir, overrideConfigFile: true, overrideConfig: [...base, ...functional] })
  const directories = [...section('### Functional').matchAll(/`([\w-]+)\/`/g)].map(([, directory]) => directory)
  assert.ok(directories.length > 0)
  for (const directory of directories) {
    const config = await eslint.calculateConfigForFile(path.join(configDir, directory, 'sample.ts'))
    assert.equal(config.rules['functional/immutable-data']?.[0], 2, directory)
  }
})

test('eslint-setup lists every default hook-tiers owner', () => {
  const tiers = section('### Hook tiers')
  for (const owner of OWNERS) assert.ok(tiers.includes(`\`${owner}\``), owner)
})
