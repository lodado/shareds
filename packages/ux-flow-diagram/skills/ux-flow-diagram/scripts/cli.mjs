import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { analyzeFlow } from './analyze.mjs'
import { validateInput } from './input.mjs'
import { normalizeFigma, normalizeFlow } from './normalize.mjs'
import { compareFlows, renderComparisonMarkdown, renderMarkdown, renderMermaid } from './render.mjs'

async function readJSON(path) {
  const { stat } = await import('node:fs/promises')
  if ((await stat(path)).size > 10 * 1024 * 1024) throw new Error('Input exceeds 10 MiB; split the extraction scope.')
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function main(args) {
  let request = validateInput({ source: 'ir' })
  if (args.at(-2) === '--request') {
    request = validateInput(await readJSON(args.at(-1)))
    args = args.slice(0, -2)
  }
  const [command, input, target, output] = args
  const arity = { validate: 2, compare: 4, normalize: 3, render: 3 }
  if (!Object.hasOwn(arity, command) || !input || args.length !== arity[command]) throw new Error('Usage: cli.mjs normalize <snapshot.json> <new-dir> | render <flow.json> <new-dir> | compare <before.json> <after.json> <new-dir> | validate <flow.json> [--request request.json]')
  if (request.outputs.figjam || request.outputs.proposedFlow) throw new Error('FigJam export and proposal authoring require the explicitly invoked agent workflow, not this local renderer. Render a separately authored proposal with these output flags off.')
  const data = await readJSON(input)
  if (command === 'validate') { normalizeFlow(data); return 'Valid Flow IR' }
  const files = {}
  if (command === 'compare') {
    const after = await readJSON(target)
    const result = compareFlows(data, after)
    if (request.outputs.json) files['comparison.json'] = `${JSON.stringify(result, null, 2)}\n`
    if (request.outputs.markdown) files['comparison.md'] = renderComparisonMarkdown(result)
    if (request.outputs.mermaid) {
      files['before.mmd'] = renderMermaid(data, request.options)
      files['after.mmd'] = renderMermaid(after, request.options)
    }
  } else {
    const result = analyzeFlow(command === 'normalize' ? normalizeFigma(data, request.analysis) : normalizeFlow(data))
    if (!request.outputs.critique) result.issues = []
    if (request.outputs.json) files['flow.json'] = `${JSON.stringify(result, null, 2)}\n`
    if (request.outputs.markdown) files['flow.md'] = renderMarkdown(result)
    if (request.outputs.mermaid) {
      files['flow.mmd'] = renderMermaid(result, request.options)
      for (const [index, flow] of result.flows.entries()) files[`flow-${index + 1}.mmd`] = renderMermaid(result, { ...request.options, flowId: flow.id })
    }
  }
  // The caller chooses a fresh directory. Never overwrite a source or previous report.
  const directory = resolve(command === 'compare' ? output : target)
  await mkdir(directory)
  for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content, { flag: 'wx' })
  return `Wrote ${Object.keys(files).length} artifacts to ${directory}`
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  try { process.stdout.write(`${await main(process.argv.slice(2))}\n`) }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
