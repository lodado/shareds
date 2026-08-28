import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { bundlePath, loadGraph, renderBundle } from './generate-reference-bundles.mjs'

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
    for (const id of bundle.nodes) {
      const node = byId.get(id)
      assert.ok(node, `bundle ${bundle.id} declares unknown node ${id}`)
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
    for (const id of bundle.nodes) {
      for (const dependency of byId.get(id).requires) {
        assert.match(
          content,
          new RegExp(`<!-- node:${dependency} `),
          `bundle ${bundle.id} includes ${id} but not its required node ${dependency}`,
        )
      }
    }
  }
})

test('SKILL.md documents bundles as an optional cache-stable read, not a new authority', async () => {
  const skill = await read('SKILL.md')
  assert.match(skill, /bundles\//)
  assert.match(skill, /node ids/)
})
