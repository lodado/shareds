import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { bundlePath, loadGraph, referenceDependencies, referenceProfile, renderBundle, splitDelivery } from './generate-reference-bundles.mjs'

const skillDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFile(join(skillDirectory, relative), 'utf8')

// 번들 크기 상한(바이트, 0.103.0 크기를 1KB 단위로 올림) — 새 에이전트는 자기 역할 번들을 통째로 읽는다. 고칠 때마다 규칙이 붙기만
// 하면 읽기 비용이 계속 는다(0.91에서 243KB로 줄인 role-author가 0.101에 273KB로 돌아왔다). 상한을 올리려면 같은 커밋에서 다른
// 문장을 지우거나 EVALUATION.md에 이유를 남긴다.
const BUNDLE_BYTE_CAPS = {
  'contract-card-lane': 85000,
  'contract-delivery-lane': 28000,
  'contract-types-lane': 31000,
  'contract-frontend-lane': 58000,
  'contract-delivery-lane-continued': 3000,
  'contract-types-lane-continued': 6000,
  'contract-frontend-lane-continued': 33000,
  'role-intake': 106000,
  'role-author': 279000,
  'role-implement': 123000,
  'role-review': 62000,
  'contract-role-intake': 79000,
  'contract-role-author': 87000,
  'contract-role-implement': 72000,
  'contract-role-review': 45000,
  'card-lane': 138000,
  'delivery-lane': 47000,
  'types-lane': 100000,
  'frontend-lane': 86000,
  'delivery-lane-continued': 22000,
  'types-lane-continued': 75000,
  'frontend-lane-continued': 61000,
}

test('every bundle stays under its byte cap, so a new rule replaces text instead of only adding it', async () => {
  const graph = await loadGraph()
  assert.deepEqual(Object.keys(BUNDLE_BYTE_CAPS).sort(), graph.bundles.map((bundle) => bundle.id).sort(), 'every bundle has a cap and every cap a bundle')
  for (const bundle of graph.bundles) {
    const size = Buffer.byteLength(await readFile(bundlePath(bundle), 'utf8'))
    assert.ok(size <= BUNDLE_BYTE_CAPS[bundle.id], `bundle ${bundle.id} is ${size} bytes, over its ${BUNDLE_BYTE_CAPS[bundle.id]} cap — remove text elsewhere or record why the cap rises`)
  }
})

test('every declared bundle is on disk and byte-identical to its nodes', async () => {
  const graph = await loadGraph()
  assert.ok(Array.isArray(graph.bundles) && graph.bundles.length > 0, 'reference-graph.json must declare bundles')

  for (const bundle of graph.bundles) {
    assert.ok(bundle.when, `bundle ${bundle.id} must declare a load condition`)
    const expected = await renderBundle(graph, bundle)
    const actual = await readFile(bundlePath(bundle), 'utf8')
    assert.equal(actual, expected, `bundle ${bundle.id} is stale — regenerate it`)
  }
})

test('a bundle carries the full source bytes of every node it declares', async () => {
  const graph = await loadGraph()
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))

  for (const bundle of graph.bundles) {
    const content = await readFile(bundlePath(bundle), 'utf8')
    const { delivered } = splitDelivery(graph, bundle)
    for (const node of delivered) {
      const id = node.id
      assert.ok(byId.get(id), `bundle ${bundle.id} declares unknown node ${id}`)
      const source = (await read(node.path)).trimEnd()
      assert.ok(
        content.includes(source),
        `bundle ${bundle.id} does not contain the verbatim bytes of ${id} — a bundle may join nodes but never rewrite them`,
      )
      assert.match(content, new RegExp(`<!-- node:${id} `), `bundle ${bundle.id} must mark the ${id} boundary`)
    }
  }
})

test('bundle nodes resolve their requires edges inside the same bundle', async () => {
  const graph = await loadGraph()
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))

  for (const bundle of graph.bundles) {
    const content = await readFile(bundlePath(bundle), 'utf8')
    const { delivered, assumed } = splitDelivery(graph, bundle)
    const assumedIds = new Set(assumed.map((node) => node.id))
    for (const { id } of delivered) {
      for (const dependency of referenceDependencies(byId.get(id), bundle.profile)) {
        if (assumedIds.has(dependency)) continue
        assert.match(
          content,
          new RegExp(`<!-- node:${dependency} `),
          `bundle ${bundle.id} includes ${id} but not its required node ${dependency}`,
        )
      }
    }
  }
})

test('a continuation bundle omits exactly its after bundles\u2019 nodes and declares them in the header', async () => {
  const graph = await loadGraph()
  const continuations = graph.bundles.filter((bundle) => (bundle.after ?? []).length > 0)
  assert.ok(continuations.length > 0, 'graph must declare at least one continuation bundle')

  for (const bundle of continuations) {
    const content = await readFile(bundlePath(bundle), 'utf8')
    const { delivered, assumed } = splitDelivery(graph, bundle)
    assert.ok(delivered.length > 0, `continuation bundle ${bundle.id} must deliver at least one node`)
    assert.ok(
      assumed.length > 0,
      `continuation bundle ${bundle.id} must assume at least one node — otherwise it is not a continuation`,
    )

    // Assumed nodes appear in the header but never as embedded content.
    assert.match(content, /- Assumes already read \(via /, `bundle ${bundle.id} must declare its assumed nodes`)
    for (const node of assumed) {
      assert.doesNotMatch(
        content,
        new RegExp(`<!-- node:${node.id} `),
        `continuation bundle ${bundle.id} re-embeds assumed node ${node.id}`,
      )
      assert.ok(content.includes(node.id), `bundle ${bundle.id} header must list assumed node ${node.id}`)
    }

    // Base + continuation must equal the full lane node set: nothing lost, nothing extra.
    const baseIds = new Set()
    for (const afterId of bundle.after) {
      const base = graph.bundles.find((candidate) => candidate.id === afterId)
      assert.ok(base, `bundle ${bundle.id} declares unknown after bundle ${afterId}`)
      for (const node of splitDelivery(graph, base).delivered) baseIds.add(node.id)
      for (const node of splitDelivery(graph, base).assumed) baseIds.add(node.id)
    }
    const fullLane = graph.bundles.find(
      (candidate) => referenceProfile(candidate.profile) === referenceProfile(bundle.profile) && !(candidate.after ?? []).length && candidate.nodes.join() === bundle.nodes.join(),
    )
    assert.ok(fullLane, `continuation bundle ${bundle.id} must mirror a full lane bundle's node set`)
    for (const node of splitDelivery(graph, fullLane).delivered) {
      const covered = delivered.some((candidate) => candidate.id === node.id) || baseIds.has(node.id)
      assert.ok(
        covered,
        `node ${node.id} is in ${fullLane.id} but neither ${bundle.id} nor its after bundles deliver it`,
      )
    }
  }
})

test('entry bundles defer later phases and conditional architecture without dropping dependencies', async () => {
  const graph = await loadGraph()
  const delivered = (id) => splitDelivery(graph, graph.bundles.find((bundle) => bundle.id === id)).delivered.map((node) => node.id)
  assert.deepEqual(delivered('delivery-lane'), ['common', 'delivery-ledger'])
  assert.deepEqual(delivered('delivery-lane-continued'), ['delivery-ledger'])
  for (const id of ['frontend-lane', 'frontend-lane-continued']) {
    assert.ok(!delivered(id).includes('architecture-contract'))
    assert.ok(delivered(id).includes('frontend-authoring'))
  }
  const controllerNode = graph.nodes.find((node) => node.id === 'role-controller')
  const formalControllerNode = graph.nodes.find((node) => node.id === 'role-controller-formal')
  assert.equal(controllerNode.path, 'references/roles/controller.md')
  assert.deepEqual(controllerNode.profiles, ['formal-bend/v1', 'contract/v1'])
  assert.equal(formalControllerNode.path, 'references/roles/controller-formal.md')
  assert.deepEqual(formalControllerNode.profiles, ['formal-bend/v1'])
  const controller = await read(controllerNode.path)
  const formalController = await read(formalControllerNode.path)
  const reporting = await read('references/roles/reporting.md')
  assert.match(reporting, /status --json/)
  assert.match(formalController, /[Tt]ransition.*rechecks|[Tt]ransition.*repeats/s)
  assert.match(controller, /Re-run required verification on final bytes after findings\./)
  assert.match(controller, /Reviewer returns are not acceptance\./)
})

test('role loading documents bundles as an optional cache-stable read, not a new authority', async () => {
  const graph = await loadGraph()
  const loadingNode = graph.nodes.find((node) => node.id === 'role-loading')
  assert.equal(loadingNode.path, 'references/roles/loading.md')
  assert.deepEqual(loadingNode.profiles, ['formal-bend/v1', 'contract/v1'])
  const skill = await read(loadingNode.path)
  const readme = await read('README.md')
  assert.ok(readme.includes('[`reference-graph.json`](references/reference-graph.json)'))
  assert.match(readme, /`requiresByProfile`/)
  assert.match(readme, /profile은 `formal-bend\/v1` 또는 `contract\/v1`/)
  assert.match(readme, /Fresh specialist는 부모의 continuation bundle 가정을 상속하지 않고 전체 역할 closure를 읽습니다\./)
  for (const bundle of graph.bundles) {
    const relative = `bundles/${bundle.profile === 'contract/v1' ? 'contract/' : ''}${bundle.id}.md`
    assert.equal(bundlePath(bundle), join(skillDirectory, relative))
    assert.equal(await read(relative), await renderBundle(graph, bundle), `canonical bundle ${bundle.id} must remain a readable delivery copy`)
  }
  assert.match(skill, /--profile <resolved-profile> --point scope-decision --include <role-id>`/)
  assert.match(skill, /Read returned full same-profile dependency\s+closure with native Read without offset or limit\./)
  assert.match(skill, /Resolve that named graph node with the same explicit profile and current-stage applicability before reading\./)
  assert.match(skill, /Fresh workers cannot inherit a parent's continued-bundle assumptions\./)
  assert.match(skill, /Use continued bundles only for nodes actually read in the same context\./)
  assert.match(skill, /Report actual node IDs, not\s+bundle IDs\./)
  assert.match(skill, /Bundles are generated delivery copies, never authority\. Do not hand-edit them\./)
  assert.match(skill, /node IDs/)
})
