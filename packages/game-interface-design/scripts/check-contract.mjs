#!/usr/bin/env node
// Offline package integrity and reference checks; not a model-behavior eval.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv/dist/2020.js'

import { validateReport } from './validate-design.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PLUGIN = 'game-interface-design'
const SKILLS = ['game-interface-design', 'reference-driven-game-design', 'threejs-game-wireframe']
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', '.test-tmp'])
const LINK = /\]\((?<inner>[^)]*)\)/g

export function walk(dir, predicate) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !IGNORED_DIRS.has(entry.name))
    .flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(full, predicate)
      return predicate(entry.name) ? [full] : []
    })
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

function frontmatter(text) {
  const body = /^---\n(?<body>[\s\S]*?)\n---\n/.exec(text)?.groups.body
  if (body === undefined) return null
  const field = (key) =>
    body
      .split('\n')
      .find((line) => line.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim()
      .replace(/^'|'$/g, '')
  return { name: field('name'), description: field('description') }
}

function marketplaceErrors(root, version) {
  // Inside the shareds monorepo the root marketplace entry must match; a standalone copy has none.
  const marketplace = path.join(root, '../../.claude-plugin/marketplace.json')
  if (!existsSync(marketplace)) return []
  const entry = readJson(marketplace).plugins.find((p) => p.name === PLUGIN)
  if (!entry) return ['marketplace entry missing']
  if (entry.version !== version) return ['marketplace version mismatch']
  return entry.source === `./packages/${PLUGIN}` ? [] : ['marketplace source mismatch']
}

function manifestErrors(root) {
  const [claude, codex, pkg] = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'package.json'].map((p) =>
    readJson(path.join(root, p)),
  )
  const errors = []
  if (!claude.version || claude.version !== codex.version || claude.version !== pkg.version) {
    errors.push('manifest version mismatch')
  }
  for (const m of [claude, codex]) if (m.name !== PLUGIN) errors.push(`wrong plugin name: ${m.name}`)
  if (codex.skills !== './skills/') errors.push('wrong local skills path')
  return [...errors, ...marketplaceErrors(root, claude.version)]
}

function skillErrors(root) {
  const skillFiles = readdirSync(path.join(root, 'skills'))
    .map((dir) => ({ dir, file: path.join(root, 'skills', dir, 'SKILL.md') }))
    .filter(({ file }) => existsSync(file))
  const errors = []
  for (const { dir, file } of skillFiles) {
    const text = readFileSync(file, 'utf8')
    const fm = frontmatter(text)
    if (fm?.name !== dir) errors.push(`skill name/directory mismatch: ${dir}`)
    if (!fm?.description) errors.push(`missing skill description: ${dir}`)
    if (text.includes('frontend-interface-design/') || text.includes('$frontend-interface-design')) {
      errors.push(`upstream runtime dependency in ${dir}`)
    }
  }
  const names = skillFiles.map(({ dir }) => dir).sort()
  if (names.join() !== [...SKILLS].sort().join()) errors.push(`unexpected skill entrypoints: ${names.join()}`)
  return errors
}

function linkErrors(root) {
  const realRoot = realpathSync(root)
  return walk(path.join(root, 'skills'), (n) => n.endsWith('.md')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(LINK)]
      .map((m) => m.groups.inner.trim().split(/\s/)[0])
      .filter((target) => !/^(?:https?:|mailto:|#)/.test(target))
      .map((target) => {
        const dest = path.resolve(path.dirname(file), target.split('#')[0])
        if (!dest.startsWith(realRoot + path.sep)) return `external local link ${target}`
        return existsSync(dest) ? null : `broken local link ${path.relative(root, file)} -> ${target}`
      })
      .filter(Boolean),
  )
}

function jsonErrors(root, ajv) {
  const errors = []
  for (const file of walk(root, (n) => n.endsWith('.json'))) {
    try {
      const data = readJson(file)
      if (file.endsWith('.schema.json') && !ajv.validateSchema(data)) {
        errors.push(`${path.relative(root, file)}: invalid schema`)
      }
    } catch (error) {
      errors.push(`${path.relative(root, file)}: ${error.message}`)
    }
  }
  return errors
}

function provenanceErrors(root) {
  return readJson(path.join(root, 'provenance.json'))
    .retained_reference_audit.filter(
      (row) =>
        createHash('sha256')
          .update(readFileSync(path.join(root, row.path)))
          .digest('hex') !== row.sha256,
    )
    .map((row) => `retained source hash mismatch ${row.path}`)
}

function exampleErrors(root, ajv) {
  const design = path.join(root, 'skills/reference-driven-game-design')
  const sample = path.join(design, 'examples/merge-garden')
  const validateRequest = ajv.compile(readJson(path.join(design, 'schemas/game-request.schema.json')))
  const requestErrors = validateRequest(readJson(path.join(sample, 'request.json')))
    ? []
    : validateRequest.errors.map((e) => `request${e.instancePath}: ${e.message}`)
  return [...requestErrors, ...validateReport(readJson(path.join(sample, 'delivery.json')), sample)]
}

export function checkPackage(root = ROOT) {
  const ajv = new Ajv({ strict: false, allErrors: true })
  return [
    ...manifestErrors(root),
    ...skillErrors(root),
    ...jsonErrors(root, ajv),
    ...linkErrors(root),
    ...provenanceErrors(root),
    ...exampleErrors(root, ajv),
  ]
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkPackage()
  for (const e of errors) console.log('FAIL:', e)
  process.exitCode = errors.length > 0 ? 1 : 0
  if (errors.length === 0) {
    console.log(
      'PASS: manifests, entrypoints, local Markdown links, JSON schemas, example and upstream reference hashes.',
    )
    console.log(
      'NOT RUN: Claude/Codex host loading, model-behavior scenarios, actual Figma editing or human playtests.',
    )
  }
}
