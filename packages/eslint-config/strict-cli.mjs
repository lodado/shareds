#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { ESLint } from 'eslint'
import { verifyStrictProject } from './strict.mjs'

async function main() {
  const [, , policyFile] = process.argv
  if (!policyFile) throw new Error('Usage: lodado-check-architecture ./strict-policy.mjs')
  const { default: options } = await import(pathToFileURL(path.resolve(policyFile)).href)
  const eslint = new ESLint({ cwd: options.cwd })
  const files = await verifyStrictProject(eslint, options)
  const results = await eslint.lintFiles(files)
  const formatter = await eslint.loadFormatter('stylish')
  process.stdout.write(formatter.format(results))
  if (results.some((result) => result.fatalErrorCount)) process.exitCode = 2
  else if (results.some((result) => result.errorCount)) process.exitCode = 1
  else process.stdout.write(`Strict architecture: ${files.length} source files checked.\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
})
