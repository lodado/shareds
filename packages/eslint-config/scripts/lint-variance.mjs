#!/usr/bin/env node
/**
 * Measures how much K runs of the same prompt differ, and whether lint pins that down.
 *
 *   node scripts/lint-variance.mjs <observer eslint.config.mjs> <run-dir> <run-dir> ...
 *
 * Each run directory holds one agent run's source tree. For every axis the script computes the
 * number of distinct outcomes divided by K and the normalized entropy (0 = every run agrees,
 * 1 = every run differs). Suppressions are counted separately: a gate that lowers variance by
 * raising suppressions moved the variance into comments instead of removing it.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ESLint } from 'eslint'

const SOURCE = /\.[cm]?[jt]sx?$/u
const SUPPRESSION = /eslint-disable|@ts-(?:ignore|expect-error|nocheck)|\.(?:skip|only)\(/gu

const sourceFiles = (root) =>
  fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE.test(entry.name) && !entry.parentPath.includes('node_modules'))
    .map((entry) => path.join(entry.parentPath, entry.name))

/** What one run decided on each axis, as comparable strings. */
export function fingerprint(root, files, messages) {
  const sources = files.map((file) => fs.readFileSync(file, 'utf8'))
  const relative = files.map((file) => path.relative(root, file).replaceAll('\\', '/'))
  const count = (pattern) => sources.reduce((total, text) => total + (text.match(pattern)?.length ?? 0), 0)
  return {
    placement: relative.map((file) => path.posix.dirname(file)).sort().join(','),
    exports: `default:${count(/export default/gu)} named:${count(/export (?:const|function|class|type|interface) /gu)}`,
    state: `booleanUseState:${count(/useState\((?:true|false)\)/gu)} statusUnion:${count(/status: '[\w-]+' \|/gu)}`,
    requests: relative.filter((_, index) => /\bfetch\(|axios|ky\./u.test(sources[index])).sort().join(','),
    diagnostics: [...new Set(messages.map((message) => message.ruleId ?? 'fatal'))].sort().join(','),
    suppressions: String(count(SUPPRESSION)),
  }
}

/** 0 when every run agrees, 1 when every run differs. */
export function normalizedEntropy(values) {
  if (values.length < 2) return 0
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const entropy = [...counts.values()].reduce((sum, n) => sum - (n / values.length) * Math.log2(n / values.length), 0)
  return entropy / Math.log2(values.length)
}

export function summarize(prints) {
  const axes = Object.keys(prints[0] ?? {})
  return Object.fromEntries(
    axes.map((axis) => {
      const values = prints.map((print) => print[axis])
      return [axis, { distinct: new Set(values).size / values.length, entropy: normalizedEntropy(values) }]
    }),
  )
}

export async function measure(configFile, runs) {
  const prints = []
  for (const root of runs) {
    const files = sourceFiles(root)
    const eslint = new ESLint({ cwd: root, overrideConfigFile: configFile })
    const results = files.length ? await eslint.lintFiles(files) : []
    prints.push(fingerprint(root, files, results.flatMap((result) => result.messages)))
  }
  return { runs: runs.length, axes: summarize(prints), prints }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [configFile, ...runs] = process.argv.slice(2).map((value) => path.resolve(value))
  if (!configFile || runs.length < 2) {
    process.stderr.write('Usage: lint-variance <observer eslint.config.mjs> <run-dir> <run-dir> ...\n')
    process.exitCode = 2
  } else {
    process.stdout.write(`${JSON.stringify(await measure(configFile, runs), null, 2)}\n`)
  }
}
