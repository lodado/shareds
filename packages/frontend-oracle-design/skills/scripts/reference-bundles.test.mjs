import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { bundlePath, loadGraph, renderBundle, splitDelivery } from './generate-reference-bundles.mjs'

const skillDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFile(join(skillDirectory, relative), 'utf8')

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
    const { assumed } = splitDelivery(graph, bundle)
    const assumedIds = new Set(assumed.map((node) => node.id))
    for (const id of bundle.nodes) {
      if (assumedIds.has(id)) continue
      for (const dependency of byId.get(id).requires) {
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
      (candidate) => !(candidate.after ?? []).length && candidate.nodes.join() === bundle.nodes.join(),
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

test('SKILL.md documents bundles as an optional cache-stable read, not a new authority', async () => {
  const skill = await read('SKILL.md')
  assert.match(skill, /bundles\//)
  assert.match(skill, /node ids/)
})
