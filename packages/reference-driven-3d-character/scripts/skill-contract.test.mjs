import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks use node --test, matching sibling skill packages.
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const name = 'reference-driven-3d-character'
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

it('publishes one shared skill through both host manifests', () => {
  assert.ok(existsSync(join(root, 'package.json')), 'the planned skill package must exist')
  const pkg = readJson('package.json')
  const claude = readJson('.claude-plugin/plugin.json')
  const codex = readJson('.codex-plugin/plugin.json')
  assert.equal(pkg.name, `@lodado/${name}-plugin`)
  assert.equal(pkg.private, true)
  for (const manifest of [claude, codex]) {
    assert.equal(manifest.name, name)
    assert.equal(manifest.version, pkg.version)
    assert.equal(manifest.skills, './skills/')
  }
  const entries = readdirSync(join(root, 'skills'), { recursive: true }).filter((file) => file.endsWith('SKILL.md'))
  assert.deepEqual(entries, [join(name, 'SKILL.md')])
  const entry = readFileSync(join(root, 'skills', entries[0]), 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(entry)?.[1]
  assert.ok(frontmatter, 'the discoverable entry needs YAML frontmatter')
  assert.equal(/^name: (.+)$/m.exec(frontmatter)?.[1], name)
  assert.ok(/^description: .+$/m.test(frontmatter), 'discovery needs a description')
})

it('registers exactly one matching local marketplace entry', () => {
  const marketplace = readJson('../../.claude-plugin/marketplace.json')
  const matches = marketplace.plugins.filter((plugin) => plugin.name === name)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].source, `./packages/${name}`)
  assert.equal(matches[0].version, readJson('package.json').version)
})

it('resolves package documentation links without an installed sibling skill', () => {
  assert.ok(existsSync(join(root, 'skills')), 'the shared skill directory must exist')
  const documents = readdirSync(root, { recursive: true }).filter(
    (file) => file.endsWith('.md') && !file.startsWith(`node_modules${sep}`),
  )
  for (const document of documents) {
    const path = join(root, document)
    const content = readFileSync(path, 'utf8')
    for (const match of content.matchAll(/\]\(([^()\s]+)\)/g)) {
      const target = match[1].split('#')[0]
      if (!target || /^https?:\/\//.test(target)) continue
      const resolved = resolve(dirname(path), decodeURIComponent(target))
      assert.ok(resolved.startsWith(root), `local reference must ship with the package: ${target}`)
      assert.ok(existsSync(resolved), `${document}: missing ${target}`)
    }
  }
})
