#!/usr/bin/env node
// Runs the black-box corpus against a real CLI host and writes a grader-ready JSONL artifact.
// Split of authority: loadedNodes, toolCalls, tokens and runtimeMs are derived from the host's own
// transcript, and only the routing verdict (risk·lane·status·labels·ceremony) is self-reported by
// the run. The sidecar keeps the raw self-report next to the machine-derived record, so a later
// read can tell which number came from where.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const evalDirectory = dirname(fileURLToPath(import.meta.url))
const skillDirectory = dirname(evalDirectory)

const REPORT_FOOTER = [
  '',
  'When you finish, emit one fenced ```json block as the last thing you write, with exactly these',
  'fields: caseId, risk, lane, status, route (optional), labels (string array), ceremony (string',
  'array), policyInvention (boolean), falseReviewVerified (boolean), errors (string array).',
  'Report what actually happened, never what the corpus wants.',
].join('\n')

const HOSTS = {
  claude: { command: 'claude', args: (prompt) => ['-p', prompt, '--output-format', 'stream-json', '--verbose'] },
  codex: { command: 'codex', args: (prompt) => ['exec', '--json', prompt] },
}

function walkStrings(value, visit) {
  if (typeof value === 'string') return visit(value)
  if (Array.isArray(value)) {
    for (const entry of value) walkStrings(entry, visit)
    return
  }
  if (value && typeof value === 'object') for (const entry of Object.values(value)) walkStrings(entry, visit)
}

export function parseTranscript(stdout) {
  const events = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // A host interleaves progress lines with the event stream; those carry no evidence.
    }
  }
  return events
}

/** Node ids the run actually read, taken from every path string the transcript mentions. */
export function loadedNodesFrom(events, graph) {
  const byPath = graph.nodes.map((node) => [node.path, node.id])
  const found = new Set()
  walkStrings(events, (text) => {
    const portable = text.replaceAll('\\', '/')
    for (const [path, id] of byPath) {
      if (portable === path || portable.endsWith(`/${path}`)) found.add(id)
    }
  })
  return [...found]
}

/** Tool calls and tokens as the host counted them, not as the run described itself. */
export function usageFrom(events) {
  let toolCalls = 0
  let tokens = 0
  for (const event of events) {
    const content = event?.message?.content
    if (Array.isArray(content)) toolCalls += content.filter((block) => block?.type === 'tool_use').length
    if (event?.type === 'item.completed' && event?.item?.item_type) toolCalls += 1
    for (const usage of [event?.message?.usage, event?.usage, event?.info?.total_token_usage]) {
      if (!usage) continue
      tokens = Math.max(tokens, (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0))
    }
  }
  return { toolCalls, tokens }
}

/** The last fenced json block of the final text, which is where the footer asks the run to report. */
export function selfReportFrom(events) {
  const texts = []
  walkStrings(events, (text) => {
    if (text.includes('```json')) texts.push(text)
  })
  const block = [...(texts.at(-1) ?? '').matchAll(/```json\n([\s\S]*?)```/g)].at(-1)?.[1]
  if (!block) return null
  try {
    return JSON.parse(block)
  } catch {
    return null
  }
}

export function buildResult({ fixture, events, graph, runtimeMs }) {
  const report = selfReportFrom(events)
  const { toolCalls, tokens } = usageFrom(events)
  const reported = report ?? {}
  const errors = Array.isArray(reported.errors) ? [...reported.errors] : []
  if (!report) errors.push('NO_MACHINE_REPORT')
  return {
    result: {
      caseId: fixture.id,
      risk: reported.risk ?? null,
      lane: reported.lane ?? null,
      status: reported.status ?? null,
      ...(fixture.expected.route ? { route: reported.route ?? null } : {}),
      loadedNodes: loadedNodesFrom(events, graph),
      ceremony: Array.isArray(reported.ceremony) ? reported.ceremony : [],
      labels: Array.isArray(reported.labels) ? reported.labels : [],
      policyInvention: reported.policyInvention === true,
      falseReviewVerified: reported.falseReviewVerified === true,
      toolCalls,
      tokens,
      runtimeMs,
      errors,
    },
    selfReported: reported,
  }
}

function runHost(host, prompt, cwd) {
  const { command, args } = HOSTS[host]
  return new Promise((resolve, reject) => {
    const child = spawn(command, args(prompt), { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

function option(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

async function main() {
  const args = process.argv.slice(2)
  const host = option(args, '--host')
  const out = option(args, '--out')
  if (!HOSTS[host] || !out) {
    process.stderr.write(
      `USAGE: run-live.mjs --host <${Object.keys(HOSTS).join('|')}> --out <results.jsonl> [--corpus <file>] [--case <id>] [--repo <dir>]\n`,
    )
    process.exitCode = 2
    return
  }
  const only = option(args, '--case')
  const repo = option(args, '--repo') ?? process.cwd()
  // held-out.json runs through the same runner and the same artifact shape, but its escapes are
  // judged by reading the Draft against each assertion — the grader never scores it.
  const corpusFile = option(args, '--corpus') ?? 'blackbox-corpus.json'

  const [corpus, graph] = await Promise.all([
    readFile(join(evalDirectory, corpusFile), 'utf8').then(JSON.parse),
    readFile(join(skillDirectory, 'references/reference-graph.json'), 'utf8').then(JSON.parse),
  ])
  const cases = corpus.cases.filter((fixture) => !only || fixture.id === only)
  if (cases.length === 0) throw new Error(`NO_SUCH_CASE: ${only}`)

  const lines = []
  const runs = []
  for (const fixture of cases) {
    const prompt = `${fixture.prompt}\n${REPORT_FOOTER}`
    const startedAt = Date.now()
    const { code, stdout, stderr } = await runHost(host, prompt, repo)
    const runtimeMs = Date.now() - startedAt
    const events = parseTranscript(stdout)
    const { result, selfReported } = buildResult({ fixture, events, graph, runtimeMs })
    if (code !== 0) result.errors.push(`HOST_EXIT_${code}`)
    lines.push(JSON.stringify(result))
    runs.push({
      caseId: fixture.id,
      host,
      exitCode: code,
      promptSha256: createHash('sha256').update(prompt).digest('hex'),
      model: events.find((event) => event?.message?.model)?.message?.model ?? events.find((event) => event.model)?.model ?? null,
      sessionId: events.find((event) => event.session_id)?.session_id ?? null,
      runtimeMs,
      selfReported,
      stderr: stderr.slice(-2000),
    })
    process.stderr.write(`ran ${fixture.id} in ${runtimeMs}ms (exit ${code})\n`)
  }

  await writeFile(out, `${lines.join('\n')}\n`)
  await writeFile(
    `${out}.meta.json`,
    `${JSON.stringify({ host, corpus: corpus.name, startedAt: new Date().toISOString(), runs }, null, 2)}\n`,
  )
  const partial = cases.length === corpus.cases.length ? '' : ' --allow-partial'
  process.stdout.write(`wrote ${lines.length} results to ${out} — grade with grade-results.mjs${partial}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`EVAL_LIVE_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
