import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const oracleReferences = join(
  repositoryDirectory,
  'packages/frontend-oracle-design/skills/frontend-oracle-design/references',
)
const sharedReferences = ['fsd.md', 'changeability.md', 'backend.md']
const agents = ['frontend-developer', 'backend-developer']

const read = (path) => readFile(join(packageDirectory, path), 'utf8')
const readAgent = (name) => read(`agents/${name}.md`)

const frontmatter = (markdown) => {
  const block = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ''
  return Object.fromEntries(block.split('\n').map((line) => line.split(/: (.*)/s).slice(0, 2)))
}

const headings = async () => {
  const texts = await Promise.all(sharedReferences.map((name) => read(`references/${name}`)))
  return texts.flatMap((text) => [...text.matchAll(/^#{1,4} (.+)$/gm)].map(([, heading]) => heading))
}

test('ships byte-identical copies of the frontend-oracle-design references', async () => {
  for (const name of sharedReferences) {
    const [bundled, canonical] = await Promise.all([
      read(`references/${name}`),
      readFile(join(oracleReferences, name), 'utf8'),
    ])
    assert.equal(bundled, canonical, `${name} must stay byte-identical with frontend-oracle-design`)
  }
})

test('declares each agent with a matching name, a scoped description and implementation tools', async () => {
  for (const name of agents) {
    const fields = frontmatter(await readAgent(name))

    assert.equal(fields.name, name)
    assert.match(fields.description, /Feature-Sliced Design/)
    assert.match(fields.description, /frontend-oracle-design skill/)
    assert.equal(fields.tools, 'Read, Edit, Write, Bash, Grep, Glob')
    assert.equal(fields.model, undefined, 'agents inherit the host model for design judgment')
  }
})

test('points only at shipped references through the plugin root', async () => {
  for (const name of agents) {
    const agent = await readAgent(name)
    const paths = [...agent.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+\.md)/g)].map(([, path]) => path)

    assert.ok(paths.length > 0)
    await Promise.all(paths.map((path) => access(join(packageDirectory, path))))
    assert.doesNotMatch(agent, /\.\.\/frontend-oracle-design/)
  }
})

test('cites reference sections that exist in the shipped copies', async () => {
  const known = await headings()

  for (const name of agents) {
    const cited = [...(await readAgent(name)).matchAll(/"([^"]+)"/g)].map(([, title]) => title.replace(/\s+/g, ' '))

    assert.ok(cited.length > 0)
    for (const title of cited) {
      assert.ok(
        known.some((heading) => heading.startsWith(title)),
        `${name} cites missing section "${title}"`,
      )
    }
  }
})

test('frontend-developer separates UI from business logic by FSD segment', async () => {
  const agent = await readAgent('frontend-developer')

  assert.match(agent, /Segments are only `ui`, `model`, `api`, `lib`, `config`/)
  assert.match(agent, /Never `components\/`, `hooks\/`,\s+`utils\/`/)
  assert.match(agent, /Start in the `pages` slice that uses it/)
  assert.match(agent, /one `index\.ts` per slice exporting only what\s+current outside consumers use/)
  assert.match(agent, /it does not compute prices, permissions or eligibility/)
  assert.match(agent, /Never hide the coupling behind a global event bus or shared store/)
})

test('backend-developer enforces three layers, Clean Architecture ports and DDD inside FSD', async () => {
  const agent = await readAgent('backend-developer')

  // 사용자 결정: 단순 조회도 service를 거친다 — backend.md의 전달용 service 금지 조항을 이 프로필이 덮는다
  assert.match(agent, /the service\s+layer is always present/)
  assert.match(agent, /controller → service → domain ← repository/)
  assert.match(agent, /`model` never imports `api`/)

  // 사용자 결정: port는 aggregate repository와 외부 시스템에만
  assert.match(agent, /Declare ports only for aggregate repositories and external systems/)
  assert.match(agent, /Do not add ports for in-process collaborators/)

  assert.match(agent, /One repository per aggregate root/)
  assert.match(agent, /Aggregates reference other aggregates by ID only/)
  assert.match(agent, /Never create a `src\/server\/` root/)
  assert.match(agent, /`import 'server-only'`/)
  assert.match(agent, /`index\.server\.ts`/)
})

test('keeps the plugin version consistent with the marketplace entry', async () => {
  const [packageJson, pluginJson, marketplaceJson] = await Promise.all([
    read('package.json'),
    read('.claude-plugin/plugin.json'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const entry = JSON.parse(marketplaceJson).plugins.find(({ name }) => name === 'developer-agents')

  assert.equal(JSON.parse(pluginJson).version, version)
  assert.equal(entry?.version, version)
  assert.equal(entry?.source, './packages/developer-agents')
})
