#!/usr/bin/env node
// Runs the black-box corpus against a real CLI host and writes a grader-ready JSONL artifact.
// Split of authority: loadedNodes, toolCalls, tokens and runtimeMs are derived from the host's own
// transcript, and only the routing verdict (risk·lane·status·labels·ceremony) is self-reported by
// the run. `loadedNodes` counts a node only when a read tool call on its path has a non-error
// tool result — a path that is merely mentioned (grep output, prose) lands in `mentionedNodes`.
// Every result carries an `attestation` map that says, per field, whether the value was observed
// from the transcript, self-reported by the run, or left unreported. An unreported safety flag is
// never coerced to a silent `false`: it stays `false` for the schema and adds a FLAG_UNREPORTED error.
// The sidecar keeps the raw self-report next to the machine-derived record, so a later read can
// tell which number came from where.
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
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

const READ_TOOL_NAMES = new Set(['read', 'read_file', 'readfile', 'view', 'cat', 'file_read'])
const CODEX_TOOL_ITEM_TYPES = new Set([
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'collab_tool_call',
  'web_search',
  'file_read',
  'read_file',
])
const SELF_REPORTED_FLAGS = ['policyInvention', 'falseReviewVerified']

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

function nodeIdForPath(text, byPath) {
  if (typeof text !== 'string') return null
  const portable = text.replaceAll('\\', '/')
  for (const [path, id] of byPath) {
    if (portable === path || portable.endsWith(`/${path}`)) return id
  }
  return null
}

function readPathOf(block) {
  const input = block?.input ?? block?.arguments ?? {}
  return input.file_path ?? input.path ?? input.filePath ?? input.file ?? null
}

function itemTypeOf(item) {
  return String(item?.type || item?.item_type || '').toLowerCase()
}

function isCompleteReadRequest(block) {
  return [block, block?.input, block?.arguments].every(
    (input) => input?.offset == null && input?.limit == null && input?.start_line == null && input?.end_line == null,
  )
}

function hasCompleteToolResult(block) {
  const content = block.content
  const hasText = typeof content === 'string' ? content.length > 0 :
    Array.isArray(content) && content.length > 0 && content.every((part) => part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0)
  return hasText && block.is_error !== true && block.truncated !== true
}

/**
 * Node ids whose file was opened by a read tool call that came back without an error. A Claude
 * stream-json transcript pairs `tool_use` blocks with `tool_result` blocks by id; a Codex transcript
 * may contain legacy `file_read` items with status and content. Ranged/truncated/missing results
 * and shell commands cannot establish full reads. This observes host records, not byte equality.
 */
export function loadedNodesFrom(events, graph) {
  const byPath = graph.nodes.map((node) => [node.path, node.id])
  // A bundle is a deterministic pre-joined read of its nodes' bytes, so a successful bundle read
  // counts as reading every node it contains (bundleContract: same bytes, never a summary).
  for (const bundle of graph.bundles ?? []) byPath.push([`bundles/${bundle.id}.md`, bundle])
  const pendingReads = new Map()
  const confirmed = new Set()
  for (const event of events) {
    const content = event?.message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          event.type === 'assistant' && roleOf(event) === 'assistant' && event.is_error !== true &&
          block?.type === 'tool_use' &&
          READ_TOOL_NAMES.has(String(block.name ?? '').toLowerCase()) &&
          isCompleteReadRequest(block)
        ) {
          const id = nodeIdForPath(readPathOf(block), byPath)
          if (id && block.id) pendingReads.set(block.id, id)
        }
        if (event.type === 'user' && (!roleOf(event) || roleOf(event) === 'user') && event.is_error !== true && block?.type === 'tool_result' && block.tool_use_id && hasCompleteToolResult(block)) {
          const id = pendingReads.get(block.tool_use_id)
          if (typeof id === 'string') confirmed.add(id)
          else if (id) for (const node of id.nodes) confirmed.add(node)
        }
      }
    }
    if (event?.type !== 'item.completed') continue
    const item = event.item
    if (
      item && READ_TOOL_NAMES.has(itemTypeOf(item)) && item.status === 'completed' &&
      (!roleOf(event) || roleOf(event) === 'assistant') && (!item.role || item.role === 'assistant') &&
      isCompleteReadRequest(item) && hasCompleteToolResult(item)
    ) {
      const id = nodeIdForPath(item.path ?? item.file_path ?? null, byPath)
      if (typeof id === 'string') confirmed.add(id)
      else if (id) for (const node of id.nodes) confirmed.add(node)
    }
  }
  return [...confirmed]
}

/** Node ids whose path appears anywhere in the transcript — evidence of exposure, not of a read. */
export function mentionedNodesFrom(events, graph) {
  const byPath = graph.nodes.map((node) => [node.path, node.id])
  const found = new Set()
  walkStrings(events, (text) => {
    const id = nodeIdForPath(text, byPath)
    if (id) found.add(id)
  })
  return [...found]
}

/** Tool calls and tokens as the host counted them, not as the run described itself. */
export function usageFrom(events) {
  let toolCalls = 0
  for (const event of events) {
    const content = event?.message?.content
    if (event?.type === 'assistant' && roleOf(event) === 'assistant' && Array.isArray(content)) {
      toolCalls += content.filter((block) => block?.type === 'tool_use').length
    }
    if (event?.type === 'item.completed' && (!roleOf(event) || roleOf(event) === 'assistant') &&
      (!event.item?.role || event.item.role === 'assistant') && CODEX_TOOL_ITEM_TYPES.has(itemTypeOf(event.item))) toolCalls += 1
  }
  return { toolCalls, tokens: totalTokensFrom(events) ?? 0 }
}

function totalTokensFrom(events) {
  let tokens = null
  for (const event of events) {
    if (event?.type !== 'result' && event?.type !== 'turn.completed') continue
    if (roleOf(event) && roleOf(event) !== 'assistant') continue
    // Codex 0.155.1 emits ThreadTokenUsage.total, not a delta; Claude result totals one prompt.
    // Assistant message usage is not a run total. Never max/sum it into terminal usage.
    const usage = event.usage ?? event.info?.total_token_usage
    const counts = [usage?.input_tokens, usage?.output_tokens]
    if (event.type === 'result') counts.push(usage?.cache_read_input_tokens ?? 0, usage?.cache_creation_input_tokens ?? 0)
    tokens = null
    if (counts.every((count) => Number.isSafeInteger(count) && count >= 0)) {
      tokens = counts.reduce((sum, count) => sum + count, 0)
    }
  }
  return tokens
}

/**
 * The last fenced json block of the run's own output, which is where the footer asks the run to
 * report. Only assistant/agent text blocks count: a tool result or user message that happens to
 * contain a fenced json block is environment content, not the run's report.
 */
function roleOf(event) {
  if (typeof event?.message?.role === 'string' && typeof event?.role === 'string' && event.message.role !== event.role) return 'conflicting'
  if (typeof event?.message?.role === 'string') return event.message.role
  if (typeof event?.role === 'string') return event.role
  if (event?.type === 'assistant') return 'assistant'
  return null
}

function isRunOutputEvent(event, role) {
  if (role) return role === 'assistant' && (event?.type === 'assistant' || event?.type === 'result')
  return event?.type === 'assistant' || event?.type === 'result'
}

export function selfReportFrom(events) {
  const texts = []
  let terminalFailure = false
  for (const event of events) {
    if (
      event?.type === 'turn.failed' ||
      event?.type === 'error' ||
      event?.is_error === true ||
      (event?.type === 'result' && event.subtype && event.subtype !== 'success')
    ) {
      terminalFailure = true
    }
    const role = roleOf(event)
    const content = event?.message?.content
    if (isRunOutputEvent(event, role) && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      }
    }
    if (event?.type === 'result' && isRunOutputEvent(event, role) && event.is_error !== true && typeof event.result === 'string') {
      texts.push(event.result)
    }
    // Current Codex uses item.type; item_type remains a legacy input alias.
    if (event?.type !== 'item.completed') continue
    const item = event.item
    const itemRoleValid = !item?.role || item.role === 'assistant'
    const eventRoleValid = !role || role === 'assistant'
    if (
      itemTypeOf(item) === 'agent_message' &&
      (!eventRoleValid || !itemRoleValid || (item.status != null && item.status !== 'completed') || typeof item.text !== 'string')
    ) {
      terminalFailure = true
    }
    if (
      itemTypeOf(item) === 'agent_message' &&
      eventRoleValid &&
      itemRoleValid &&
      (item.status == null || item.status === 'completed') &&
      typeof item.text === 'string'
    ) {
      texts.push(item.text)
    }
  }
  const block = [...(texts.at(-1) ?? '').matchAll(/```json\n([\s\S]*?)```/g)].at(-1)?.[1]
  if (!block || terminalFailure) return null
  try {
    return JSON.parse(block)
  } catch {
    return null
  }
}

export function buildResult({ fixture, events, graph, runtimeMs, replicateId = null }) {
  const report = selfReportFrom(events)
  const { toolCalls, tokens } = usageFrom(events)
  const usageObserved = totalTokensFrom(events) !== null
  const reported = report ?? {}
  const errors = Array.isArray(reported.errors) ? [...reported.errors] : []
  if (!report) errors.push('NO_MACHINE_REPORT')
  const attestation = {
    risk: 'self-reported',
    lane: 'self-reported',
    status: 'self-reported',
    labels: 'self-reported',
    ceremony: 'self-reported',
    loadedNodes: 'observed',
    mentionedNodes: 'observed',
    toolCalls: 'observed',
    tokens: usageObserved ? 'observed' : 'unreported',
    runtimeMs: 'observed',
  }
  for (const flag of SELF_REPORTED_FLAGS) {
    if (typeof reported[flag] === 'boolean') {
      attestation[flag] = 'self-reported'
    } else {
      attestation[flag] = 'unreported'
      if (report) errors.push(`FLAG_UNREPORTED:${flag}`)
    }
  }
  if (!usageObserved) errors.push('TOKENS_UNREPORTED')
  return {
    result: {
      caseId: fixture.id,
      ...(replicateId === null ? {} : { replicateId }),
      risk: reported.risk ?? null,
      lane: reported.lane ?? null,
      status: reported.status ?? null,
      ...(fixture.expected.route ? { route: reported.route ?? null } : {}),
      loadedNodes: loadedNodesFrom(events, graph),
      mentionedNodes: mentionedNodesFrom(events, graph),
      ceremony: Array.isArray(reported.ceremony) ? reported.ceremony : [],
      labels: Array.isArray(reported.labels) ? reported.labels : [],
      policyInvention: reported.policyInvention === true,
      falseReviewVerified: reported.falseReviewVerified === true,
      toolCalls,
      tokens,
      runtimeMs,
      errors,
      attestation,
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

/**
 * Preserve host output only when explicitly requested. The unique invocation directory means a
 * repeated run never overwrites an earlier transcript, while case/replicate ids remain metadata.
 */
export async function createTranscriptRun(transcriptDir) {
  if (!transcriptDir) return null
  const root = resolve(transcriptDir)
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, 'run-'))
}

export async function writeTranscript({ runDir, caseId, replicateId, stdout, stderr }) {
  if (!runDir) return null
  const segment = (value) => Buffer.from(String(value)).toString('base64url')
  const caseDir = join(runDir, segment(caseId), segment(replicateId ?? 'r1'))
  await mkdir(caseDir, { recursive: true })
  await Promise.all([
    writeFile(join(caseDir, 'stdout.raw'), stdout, { flag: 'wx', mode: 0o600 }),
    writeFile(join(caseDir, 'stderr.raw'), stderr, { flag: 'wx', mode: 0o600 }),
  ])
  return {
    caseId,
    replicateId,
    stdout: relative(runDir, join(caseDir, 'stdout.raw')),
    stderr: relative(runDir, join(caseDir, 'stderr.raw')),
  }
}

function option(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  const value = args[index + 1]
  if (!value || value.startsWith('--')) return null
  return value
}

async function main() {
  const args = process.argv.slice(2)
  const host = option(args, '--host')
  const out = option(args, '--out')
  const transcriptDir = option(args, '--transcript-dir')
  if (!HOSTS[host] || !out) {
    process.stderr.write(
      `USAGE: run-live.mjs --host <${Object.keys(HOSTS).join('|')}> --out <results.jsonl> [--corpus <file>] [--case <id>] [--repo <dir>] [--replicates <n>] [--variant <name>] [--transcript-dir <dir>]\n`,
    )
    process.exitCode = 2
    return
  }
  if (args.includes('--transcript-dir') && !transcriptDir) {
    process.stderr.write('USAGE: --transcript-dir requires a directory value\n')
    process.exitCode = 2
    return
  }
  const only = option(args, '--case')
  const repo = option(args, '--repo') ?? process.cwd()
  // pass^k needs k independent runs of the same fixture; each gets its own replicateId so the grader
  // scores the fixture on every replicate instead of treating the repeats as a duplicate case.
  const replicates = Number.parseInt(option(args, '--replicates') ?? '1', 10)
  if (!Number.isSafeInteger(replicates) || replicates < 1) throw new Error('INVALID_REPLICATES')
  // A/B arm marker: results from different skill versions carry their arm so the grader never pools them.
  const variant = option(args, '--variant')
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
  const transcriptRunDir = await createTranscriptRun(transcriptDir)
  for (const fixture of cases) {
    for (let replicate = 1; replicate <= replicates; replicate += 1) {
      const replicateId = replicates === 1 ? null : `r${replicate}`
      const prompt = `${fixture.prompt}\n${REPORT_FOOTER}`
      const startedAt = Date.now()
      const { code, stdout, stderr } = await runHost(host, prompt, repo)
      const runtimeMs = Date.now() - startedAt
      const events = parseTranscript(stdout)
      const { result, selfReported } = buildResult({ fixture, events, graph, runtimeMs, replicateId })
      const transcript = await writeTranscript({ runDir: transcriptRunDir, caseId: fixture.id, replicateId, stdout, stderr })
      if (variant) result.variant = variant
      if (code !== 0) result.errors.push(`HOST_EXIT_${code}`)
      lines.push(JSON.stringify(result))
      runs.push({
        caseId: fixture.id,
        ...(variant ? { variant } : {}),
        ...(replicateId === null ? {} : { replicateId }),
        host,
        exitCode: code,
        promptSha256: createHash('sha256').update(prompt).digest('hex'),
        model: events.find((event) => event?.message?.model)?.message?.model ?? events.find((event) => event.model)?.model ?? null,
        sessionId: events.find((event) => event.session_id)?.session_id ?? null,
        runtimeMs,
        selfReported,
        attestation: result.attestation,
        stderr: stderr.slice(-2000),
        ...(transcript
          ? {
              transcript: {
                ...transcript,
                runDir: relative(dirname(resolve(out)), transcriptRunDir),
              },
            }
          : {}),
      })
      process.stderr.write(`ran ${fixture.id}${replicateId ? ` ${replicateId}` : ''} in ${runtimeMs}ms (exit ${code})\n`)
    }
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
