#!/usr/bin/env node

import { readFile, realpath } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { loadGraph, REFERENCE_PROFILES, referenceDependencies, referencePathFor, referenceProfile, splitDelivery, validateReferenceProfiles } from './generate-reference-bundles.mjs'

const POINTS = ['scope-decision', 'model-authoring', 'package-authoring', 'protocol-inspection']
const FACTS = ['architectureBoundaryChange', 'backendBoundaryChange', 'performanceClaim']
const LOADERS = ['agent', 'reviewer', 'script', 'graph-tooling']

function invalid(message) {
  throw new TypeError(`Invalid reference route: ${message}`)
}

function object(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid(`${label} must be an object`)
  }
}

function exactKeys(value, keys, label) {
  object(value, label)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)))
    invalid(`${label} has unknown or missing fields`)
}

function validateRoute(route) {
  exactKeys(route, ['at', 'if'], 'route')
  if (
    !Array.isArray(route.at) ||
    route.at.length === 0 ||
    new Set(route.at).size !== route.at.length ||
    route.at.some((point) => !POINTS.includes(point))
  ) {
    invalid('route.at needs unique known decision points')
  }
  if (typeof route.if === 'boolean') return
  exactKeys(route.if, ['eq'], 'predicate')
  const operands = route.if.eq
  if (
    !Array.isArray(operands) ||
    operands.length !== 2 ||
    !FACTS.includes(operands[0]) ||
    typeof operands[1] !== 'boolean'
  ) {
    invalid('eq needs a known fact and boolean literal')
  }
}

function referencePath(path) {
  if (typeof path !== 'string' || !path.startsWith('references/') || /[\\?#]/.test(path)) return false
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

function validateGraph(graph) {
  object(graph, 'graph')
  if (!Array.isArray(graph.nodes)) invalid('graph.nodes must be an array')
  const ids = new Set()
  for (const node of graph.nodes) {
    object(node, 'node')
    if (typeof node.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(node.id) || ids.has(node.id))
      invalid('node IDs must be unique identifiers')
    ids.add(node.id)
    if (!referencePath(node.path)) invalid(`invalid reference path for ${node.id}`)
    if (typeof node.when !== 'string' || !node.when.trim()) invalid(`${node.id} needs a descriptive load condition`)
    if (!LOADERS.includes(Object.hasOwn(node, 'loader') ? node.loader : 'agent'))
      invalid(`unknown loader for ${node.id}`)
    if (!Array.isArray(node.requires) || new Set(node.requires).size !== node.requires.length)
      invalid(`${node.id}.requires must be unique IDs`)
    if (Object.hasOwn(node, 'route')) validateRoute(node.route)
  }
  for (const node of graph.nodes) {
    if (node.requires.some((id) => !ids.has(id))) invalid(`unknown dependency for ${node.id}`)
  }
  // Validate unused nodes too: a false predicate must not hide malformed dependency wiring.
  try {
    validateReferenceProfiles(graph)
    for (const profile of REFERENCE_PROFILES) {
      const nodes = graph.nodes.filter((node) => (node.profiles ?? ['formal-bend/v1']).includes(profile)).map((node) => node.id)
      splitDelivery(graph, { id: 'route-validation', nodes, profile })
    }
  } catch (error) {
    invalid(error.message)
  }
  return ids
}

function audience(node) {
  if (node.loader === 'reviewer') return 'reviewer'
  if (node.loader === 'script' || node.loader === 'graph-tooling') return 'external'
  return 'agent'
}

function truth(predicate, facts) {
  if (typeof predicate === 'boolean') return predicate
  const [name, expected] = predicate.eq
  return facts[name] === 'unknown' ? 'unknown' : facts[name] === expected
}

export function routeReferences(graph, options) {
  object(options, 'request')
  if (Object.keys(options).some((key) => !['point', 'facts', 'include', 'profile'].includes(key)))
    invalid('request has unknown fields')
  const { point, facts = {}, include = [] } = options
  const profile = referenceProfile(options.profile)
  if (!POINTS.includes(point)) invalid('unknown decision point')
  object(facts, 'facts')
  for (const [name, value] of Object.entries(facts)) {
    if (!FACTS.includes(name) || (typeof value !== 'boolean' && value !== 'unknown'))
      invalid(`unknown fact or value ${JSON.stringify(name)}`)
  }
  const normalized = Object.fromEntries(FACTS.map((name) => [name, facts[name] ?? 'unknown']))
  const ids = validateGraph(graph)
  if (!Array.isArray(include) || include.some((id) => !ids.has(id))) invalid('include must name existing nodes')
  for (const id of include) {
    const node = graph.nodes.find((candidate) => candidate.id === id)
    if (!(node.profiles ?? ['formal-bend/v1']).includes(profile)) invalid(`wrong-profile include ${id}`)
  }
  const selected = new Map()
  const manualConditions = { agent: [], reviewer: [], external: [] }
  for (const node of graph.nodes) {
    if (!(node.profiles ?? ['formal-bend/v1']).includes(profile)) continue
    if (!node.route) {
      manualConditions[audience(node)].push({
        id: node.id,
        path: referencePathFor(node, profile),
        when: node.when,
        requires: referenceDependencies(node, profile),
        loader: node.loader ?? 'agent',
      })
      continue
    }
    if (!node.route.at.includes(point)) continue
    const result = truth(node.route.if, normalized)
    if (result !== false) selected.set(node.id, result === 'unknown' ? 'unknown' : 'matched')
  }
  for (const id of include) selected.set(id, 'manual')
  const { delivered } = splitDelivery(graph, { id: `route-${point}`, profile, nodes: [...selected.keys()] })
  const result = {
    schemaVersion: 1,
    authority: 'advisory',
    coverage: 'partial',
    point,
    facts: normalized,
    agent: [],
    reviewer: [],
    external: [],
    manualConditions,
  }
  for (const node of delivered) {
    result[audience(node)].push({
      id: node.id,
      path: referencePathFor(node, profile),
      reason: selected.get(node.id) ?? 'dependency',
      requires: referenceDependencies(node, profile),
    })
  }
  return result
}

export function renderReferenceRoute(result) {
  const lines = [
    'authority: advisory — facts are caller-supplied; this is not approval or a transition',
    `point: ${result.point}`,
    'coverage: partial — uncompiled conditions still apply; consult the SKILL reference catalog',
  ]
  for (const owner of ['agent', 'reviewer', 'external']) {
    const references = result[owner].map(({ id, path, reason }) => `${id} (${path}; ${reason})`)
    lines.push(`${owner}: ${references.join(', ') || 'none'}`)
    lines.push(`manual-${owner}: ${result.manualConditions[owner].map(({ id }) => id).join(', ') || 'none'}`)
  }
  lines.push(
    'unknown means load; manual conditions are not false. Use --include <id> to resolve their dependencies; --json includes their conditions.',
  )
  return `${lines.join('\n')}\n`
}

function argumentsOf(args) {
  const options = { include: [] }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--json' && !options.json) {
      options.json = true
      continue
    }
    if (!['--point', '--facts', '--include', '--profile'].includes(flag)) invalid(`unknown argument ${JSON.stringify(flag)}`)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) invalid(`${flag} needs a value`)
    index += 1
    const name = flag.slice(2)
    if (name === 'include') options.include.push(value)
    else if (Object.hasOwn(options, name)) invalid(`duplicate argument ${flag}`)
    else options[name] = value
  }
  return options
}

async function main() {
  const options = argumentsOf(process.argv.slice(2))
  const facts = options.facts ? JSON.parse(await readFile(options.facts, 'utf8')) : {}
  const result = routeReferences(await loadGraph(), { point: options.point, facts, include: options.include, profile: options.profile })
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderReferenceRoute(result))
}

if (process.argv[1] && (await realpath(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`REFERENCE_ROUTE_INVALID: ${error.message}\n`)
    process.exitCode = 1
  }
}
