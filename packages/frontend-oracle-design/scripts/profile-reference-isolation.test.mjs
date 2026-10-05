import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { bundlePath, loadGraph, referenceDependencies, renderBundle, splitDelivery } from '../skills/frontend-oracle-design/scripts/generate-reference-bundles.mjs'
import { renderReferenceBlock } from '../skills/frontend-oracle-design/scripts/generate-workflow-docs.mjs'
import { routeReferences } from '../skills/frontend-oracle-design/scripts/oracle-reference-route.mjs'

const formal = 'formal-bend/v1'
const contract = 'contract/v1'
const node = (id, profiles, requires = [], extra = {}) => ({ id, path: `references/${id}.md`, when: 'fixture only', profiles, requires, ...extra })
const fixture = () => ({ nodes: [node('common', [formal, contract]), node('formal', [formal], ['common']), node('contract', [contract], ['common']), node('role-author', [formal, contract], ['common'], { requiresByProfile: { [formal]: ['formal'], [contract]: ['contract'] } })] })

test('closed profile namespace rejects unknown and mixed requests', () => {
  for (const profile of ['contract', 'contract/v2', [formal, contract], `${formal},${contract}`]) {
    assert.throws(() => routeReferences(fixture(), { point: 'scope-decision', profile }), /profile/i)
  }
})

test('wrong-profile manual includes fail closed', () => {
  assert.throws(() => routeReferences(fixture(), { point: 'scope-decision', profile: contract, include: ['formal'] }), /profile/i)
})

test('unused unconditional shared to Formal dependency is rejected', () => {
  const graph = fixture()
  graph.nodes[0].requires = ['formal']
  assert.throws(() => routeReferences(graph, { point: 'scope-decision', profile: contract }), /profile/i)
})

test('same shared role resolves only selected profile with full fresh closure', () => {
  for (const profile of [formal, contract]) {
    const expected = ['common', profile === formal ? 'formal' : 'contract', 'role-author']
    const result = routeReferences(fixture(), { point: 'scope-decision', profile, include: ['role-author'] })
    assert.deepEqual(result.agent.map(({ id }) => id), expected)
    assert.deepEqual(result.agent.at(-1).requires, ['common', expected[1]])
    assert.deepEqual(result.manualConditions.agent.map(({ id }) => id), expected)
    assert.deepEqual(splitDelivery(fixture(), { id: 'fresh', profile, nodes: ['role-author'] }).assumed, [])
  }
  assert.deepEqual(routeReferences(fixture(), { point: 'scope-decision', include: ['role-author'] }), routeReferences(fixture(), { point: 'scope-decision', profile: formal, include: ['role-author'] }))
})

test('profile-mismatched continuation assumptions are rejected', () => {
  const graph = fixture()
  graph.bundles = [{ id: 'formal-parent', profile: formal, nodes: ['formal'] }]
  assert.throws(() => splitDelivery(graph, { id: 'contract-continuation', profile: contract, nodes: ['role-author'], after: ['formal-parent'] }), /profile/i)
})

const script = fileURLToPath(new URL('../skills/frontend-oracle-design/scripts/oracle-reference-route.mjs', import.meta.url))
const noBoundaries = { architectureBoundaryChange: false, backendBoundaryChange: false, performanceClaim: false }

for (const profile of [formal, contract]) {
  for (const role of ['intake', 'author', 'implement', 'review']) {
    test(`actual CLI fresh ${role} closure for ${profile}`, async () => {
      const graph = await loadGraph()
      const result = JSON.parse(execFileSync(process.execPath, [script, '--profile', profile, '--point', 'scope-decision', '--include', `role-${role}`, '--json'], { encoding: 'utf8' }))
      const routed = [...result.agent, ...result.reviewer, ...result.external]
      const ids = new Set(routed.map(({ id }) => id))
      const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]))
      assert.ok(ids.has(`role-${role}`))
      assert.ok(ids.has('verification-common'))
      assert.ok(ids.has(profile === formal ? 'mandatory-verification' : 'contract-requirements'))
      const roleProcedures = {
        [formal]: { intake: ['role-intake-formal', 'role-space-discovery-formal', 'role-case-space-inputs-formal'], author: ['role-author-formal', 'bend-cross-verification', 'adequacy', 'model-patterns', 'model-package-example', 'discovery'], implement: ['role-implement-formal'], review: ['role-review-formal'] },
        [contract]: { intake: ['contract-space'], author: ['contract-authoring', 'contract-space'], implement: ['contract-requirements'], review: ['contract-review'] },
      }
      for (const id of roleProcedures[profile][role]) assert.ok(ids.has(id), `missing current-role procedure ${id}`)
      assert.ok(!ids.has('role-controller'))
      assert.ok(!ids.has('role-reporting'))
      for (const entry of routed) {
        assert.ok(byId.get(entry.id).profiles.includes(profile), `${entry.id} mismatches ${profile}`)
        for (const dependency of referenceDependencies(byId.get(entry.id), profile)) assert.ok(ids.has(dependency), `missing ${dependency}`)
      }
      assert.ok(result.agent.every(({ id }) => byId.get(id).loader !== 'reviewer'))
      assert.ok(result.reviewer.every(({ id }) => byId.get(id).loader === 'reviewer'))
      if (role === 'review') assert.ok(result.reviewer.some(({ id }) => id === 'role-review'))
      else assert.equal(result.reviewer.length, 0)
      if (role === 'implement') {
        assert.ok(!ids.has('delivery-green-review'))
        assert.ok(!ids.has('role-author-closure'))
      }
      const fresh = splitDelivery(graph, { id: 'fresh-role', profile, nodes: [`role-${role}`] })
      assert.equal(fresh.assumed.length, 0)
      const exact = routeReferences(graph, { profile, point: 'scope-decision', facts: noBoundaries, include: [`role-${role}`] })
      assert.deepEqual(new Set([...exact.agent, ...exact.reviewer].map(({ id }) => id)), new Set(fresh.delivered.map(({ id }) => id)))
    })
    test(`generated full fresh ${role} bundle for ${profile}`, async () => {
      const graph = await loadGraph()
      const id = `${profile === contract ? 'contract-' : ''}role-${role}`
      const bundle = graph.bundles.find((candidate) => candidate.id === id)
      assert.equal(bundle.profile, profile)
      assert.equal(bundle.after, undefined, 'fresh role bundles must not inherit continuation reads')
      const actual = await readFile(bundlePath(bundle), 'utf8')
      assert.equal(actual, await renderBundle(graph, bundle))
      const embedded = [...actual.matchAll(/<!-- node:([a-z0-9-]+) path:/g)].map((match) => match[1])
      const routed = routeReferences(graph, { profile, point: 'scope-decision', facts: noBoundaries, include: [`role-${role}`] })
      assert.deepEqual(new Set(embedded), new Set([...routed.agent, ...routed.reviewer].map(({ id: nodeId }) => nodeId)))
      for (const nodeId of embedded) assert.ok(graph.nodes.find((candidate) => candidate.id === nodeId).profiles.includes(profile))
      assert.ok(!embedded.includes('role-controller'))
      assert.ok(!embedded.includes('role-reporting'))
    })
  }
}

test('actual canonical graph rejects Formal manual includes in Contract CLI', () => {
  for (const id of ['mandatory-verification', 'bend-cross-verification', 'model-patterns', 'model-package-example', 'adequacy', 'discovery', 'role-author-formal']) {
    assert.throws(() => execFileSync(process.execPath, [script, '--profile', contract, '--point', 'scope-decision', '--include', id, '--json'], { stdio: 'pipe' }), /wrong-profile/)
  }
})

test('unused controller and reviewer dependencies fail closed', () => {
  for (const [id, extra, message] of [['role-controller', {}, /Controller-only/], ['review-only', { loader: 'reviewer' }, /Reviewer-only/]]) {
    const graph = fixture()
    graph.nodes.push(node(id, [formal, contract], [], extra))
    graph.nodes[0].requires = [id]
    assert.throws(() => routeReferences(graph, { point: 'scope-decision', profile: contract }), message)
  }
})

test('canonical reviewer mode labels retain blind audience constraints', async () => {
  const graph = await loadGraph()
  const review = graph.nodes.find(({ id }) => id === 'role-review')
  assert.equal(review.loader, 'reviewer')
  for (const mode of ['cold-read', 'reverse-impossible', 'source-aware', 'delivery']) assert.ok(review.when.includes(mode))
  const body = await readFile(new URL('../skills/frontend-oracle-design/references/roles/review.md', import.meta.url), 'utf8')
  for (const mode of ['cold-read', 'reverse-impossible', 'source-aware', 'delivery']) assert.ok(body.toLowerCase().includes(mode))
  assert.match(body, /cold-read sees card bytes alone, not sources, implementation, author conclusions or Delivery\s+packets/)
  assert.match(body, /Reverse-impossible sees only impossible dispositions and the approved witness\/falsifier table/)
  assert.match(body, /Do not mix these contexts/)
  assert.match(body, /No product edits/)
  assert.match(body, /(?:policy\s+approval, lock changes, receipts or transitions|Never approve policy, change locks, issue receipts or perform transitions)/)
})

test('annotated graph requires explicit closed profiles on every node', () => {
  for (const profiles of [undefined, [], ['contract/v2'], [formal, formal], `${formal},${contract}`]) {
    const graph = fixture()
    if (profiles === undefined) delete graph.nodes[0].profiles
    else graph.nodes[0].profiles = profiles
    assert.throws(() => routeReferences(graph, { point: 'scope-decision', profile: contract }), /profiles/i)
  }
})

test('conditional dependencies reject wrong-profile, unknown namespace and unselected cycles', () => {
  const wrong = fixture()
  wrong.nodes.at(-1).requiresByProfile[contract] = ['formal']
  assert.throws(() => routeReferences(wrong, { point: 'scope-decision', profile: formal }), /wrong-profile/)
  const unknown = fixture()
  unknown.nodes.at(-1).requiresByProfile['custom-backend/v1'] = []
  assert.throws(() => routeReferences(unknown, { point: 'scope-decision' }), /profiles/i)
  const cycle = fixture()
  cycle.nodes.at(-1).requiresByProfile[contract] = ['role-author']
  assert.throws(() => routeReferences(cycle, { point: 'scope-decision', profile: formal }), /cycle/)
})

test('workflow profile routing leaves delivery topology and ledger edges unchanged', async () => {
  const graph = JSON.parse(await readFile(new URL('../skills/frontend-oracle-design/references/oracle-workflow.graph.json', import.meta.url), 'utf8'))
  const topology = { ...graph, nodes: graph.nodes.map(({ task, ...nodeData }) => nodeData) }
  assert.equal(createHash('sha256').update(JSON.stringify(topology)).digest('hex'), '9061750cd260097b7053384e8f1443ef33832d6b69d010622dec3633ee942903')
  const draft = graph.nodes.find(({ id }) => id === 'draft-oracle').task
  const delivery = graph.nodes.find(({ id }) => id === 'delivery-init').task
  for (const profile of [formal, contract]) assert.ok(draft.includes(profile) && delivery.includes(profile))
  for (const label of ['bend-proof:reported', 'bend-adequacy:reported', 'contract-cases:reported', 'type-contract:reported', 'fast-check:reported']) assert.ok(delivery.includes(label))
})

test('reference documentation labels conditional profile edges rather than unconditional Formal requirements', async () => {
  const rendered = renderReferenceBlock(await loadGraph())
  assert.ok(rendered.includes('role_author_formal -. "formal-bend/v1" .-> role_author'))
  assert.ok(rendered.includes('contract_authoring -. "contract/v1" .-> role_author'))
  assert.ok(!rendered.includes('role_author_formal --> role_author'))
  assert.ok(rendered.includes('requiresByProfile'))
})

test('same canonical ID selects physical profile variant before catalog and delivery', () => {
  const graph = fixture()
  graph.nodes.at(-1).pathsByProfile = { [contract]: 'references/contract/role-author.md' }
  const result = routeReferences(graph, { point: 'scope-decision', profile: contract, include: ['role-author'] })
  assert.equal(result.agent.at(-1).path, 'references/contract/role-author.md')
  assert.equal(result.manualConditions.agent.at(-1).path, 'references/contract/role-author.md')
  assert.equal(splitDelivery(graph, { id: 'fresh', profile: contract, nodes: ['role-author'] }).delivered.at(-1).path, 'references/contract/role-author.md')
  assert.equal(routeReferences(graph, { point: 'scope-decision', include: ['role-author'] }).agent.at(-1).path, 'references/role-author.md')
})

test('unused profile variants reject unsafe paths and unknown profiles', () => {
  for (const pathsByProfile of [{ [contract]: '../formal.md' }, { [contract]: 'references/../formal.md' }, { 'custom/v1': 'references/custom.md' }]) {
    const graph = fixture()
    graph.nodes.at(-1).pathsByProfile = pathsByProfile
    assert.throws(() => routeReferences(graph, { point: 'scope-decision', profile: formal }), /path|profile/i)
  }
})

// card-case-space-frames is intentionally shared: Contract uses the same hand-written t-way frame procedure.
test('all nineteen frozen Contract physical variants preserve canonical IDs and original Formal paths', async () => {
  const shared = (await loadGraph()).nodes.find((entry) => entry.id === 'card-case-space-frames')
  assert.equal(shared.pathsByProfile, undefined)
  assert.ok(shared.profiles.includes(contract))
  const variants = {
    'card-policy-sources': 'policy-sources', 'card-risk-grill': 'risk-grill', 'card-format': 'card-format',
    'card-interaction-sweep': 'interaction-sweep', 'card-case-space': 'case-space',
    'card-confirmation-lock': 'confirmation-lock', 'card-retro-metrics': 'retro-metrics', 'delivery-ledger': 'ledger',
    'delivery-red': 'red', 'delivery-green-review': 'green-review', 'delivery-implementation-decision': 'implementation-decision',
    'types-state-ladder': 'state-ladder', 'types-authoring': 'api-surface', 'types-api-surface': 'api-surface',
    'types-advanced-contracts': 'advanced-contracts', 'types-review-criteria': 'review-criteria',
    'frontend-decisions': 'decisions', 'frontend-authoring': 'decisions', 'frontend-quality': 'quality',
  }
  const graph = await loadGraph()
  const include = Object.keys(variants)
  for (const profile of [formal, contract]) {
    const result = routeReferences(graph, { profile, point: 'scope-decision', facts: noBoundaries, include })
    const delivered = [...result.agent, ...result.reviewer, ...result.external]
    const catalog = [...result.manualConditions.agent, ...result.manualConditions.reviewer, ...result.manualConditions.external]
    for (const [id, name] of Object.entries(variants)) {
      const original = graph.nodes.find((entry) => entry.id === id).path
      const expected = profile === contract ? `references/contract/${name}.md` : original
      assert.equal(delivered.find((entry) => entry.id === id).path, expected)
      assert.equal(catalog.find((entry) => entry.id === id).path, expected)
      if (profile === contract) assert.notEqual(expected, original)
      await readFile(new URL(`../skills/frontend-oracle-design/${expected}`, import.meta.url), 'utf8')
    }
  }
})

test('public protocol-inspection resolves ledger by current profile without physical Formal bypass', async () => {
  const graph = await loadGraph()
  const core = new URL('../skills/frontend-oracle-design/', import.meta.url)
  const inspect = JSON.parse(execFileSync(process.execPath, [script, '--profile', contract, '--point', 'protocol-inspection', '--json'], { encoding: 'utf8' }))
  const protocol = inspect.agent.find(({ id }) => id === 'delivery-protocol')
  assert.equal(protocol.path, 'references/delivery-protocol.md')
  const body = await readFile(new URL(protocol.path, core), 'utf8')
  assert.doesNotMatch(body, /\]\(delivery\/ledger\.md\)/, 'shared protocol must not bypass selected-profile ledger resolution')
  assert.match(body, /Read when inspecting or changing the executable delivery protocol/)
  assert.match(body, /\[`delivery-ledger`\]\(roles\/loading\.md\)/)
  assert.match(body, /same explicit profile and current-stage applicability before reading/)
  assert.match(body, /not this authoring manual/)
  const loader = await readFile(new URL('references/roles/loading.md', core), 'utf8')
  assert.match(loader, /--profile <resolved-profile> --point scope-decision --include <role-id> --json/)
  assert.match(loader, /Resolve that named graph node with the same explicit profile and current-stage applicability before reading/)
  for (const profile of [formal, contract]) {
    const resolved = JSON.parse(execFileSync(process.execPath, [script, '--profile', profile, '--point', 'scope-decision', '--include', 'delivery-ledger', '--json'], { encoding: 'utf8' }))
    const ledger = resolved.agent.find(({ id }) => id === 'delivery-ledger')
    assert.equal(ledger.path, profile === contract ? 'references/contract/ledger.md' : 'references/delivery/ledger.md')
    const ledgerBody = await readFile(new URL(ledger.path, core), 'utf8')
    if (profile === formal) {
      assert.match(ledgerBody, /ensure-bend\.mjs/)
      assert.match(ledgerBody, /bend-proof:reported/)
      assert.match(ledgerBody, /bend-adequacy:reported/)
    } else {
      assert.match(ledgerBody, /# Contract Delivery ledger/)
      assert.match(ledgerBody, /append-only ledger/)
      const pending = [new URL(protocol.path, core), new URL(ledger.path, core)]
      const seen = new Set()
      while (pending.length) {
        const url = pending.pop()
        if (seen.has(url.href)) continue
        seen.add(url.href)
        const source = await readFile(url, 'utf8')
        assert.doesNotMatch(source, /ensure-bend\.mjs|bend-proof:reported|bend-adequacy:reported|\]\([^)]*mandatory-verification\.md\)/, url.href)
        for (const [, link] of source.matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
          if (/^[a-z]+:|^#/.test(link)) continue
          const target = new URL(link, url)
          assert.ok(target.href.startsWith(core.href), `link escapes core: ${target.href}`)
          const relative = target.href.slice(core.href.length)
          const owners = graph.nodes.filter((entry) => entry.path === relative || Object.values(entry.pathsByProfile ?? {}).includes(relative))
          assert.ok(owners.some((entry) => entry.profiles.includes(contract) && (entry.pathsByProfile?.[contract] ?? entry.path) === relative), `wrong-profile physical link: ${relative}`)
          pending.push(target)
        }
      }
      assert.ok(seen.has(new URL('references/contract/requirements.md', core).href))
      assert.ok(!seen.has(new URL('references/delivery/ledger.md', core).href))
    }
  }
  for (const profile of [formal, contract]) {
    for (const role of ['intake', 'author', 'implement', 'review']) {
      const fresh = routeReferences(graph, { profile, point: 'scope-decision', facts: noBoundaries, include: [`role-${role}`] })
      assert.ok(![...fresh.agent, ...fresh.reviewer].some(({ id }) => id === 'delivery-protocol'))
    }
  }
})

test('CLI refuses unknown and duplicate profile arguments', () => {
  for (const args of [['--profile', 'contract'], ['--profile', `${formal},${contract}`], ['--profile', formal, '--profile', contract]]) {
    assert.throws(() => execFileSync(process.execPath, [script, '--point', 'scope-decision', ...args, '--json'], { stdio: 'pipe' }), /profile/)
  }
})
