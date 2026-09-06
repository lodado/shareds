#!/usr/bin/env node
// Runs the design briefs (briefs.json) against a real CLI host and appends one grader-ready JSON
// line per run to <out>/runs.jsonl. One fixture directory per (brief, variant, host, replicate)
// exposes the skill under test to the host (a symlink to --skill-dir) and receives the run's
// index.html. The split of authority mirrors frontend-oracle-design: toolCalls, tokens, runtimeMs,
// the exit code, written paths and the presence of index.html are observed from the transcript
// and the filesystem; mode and loopRounds are self-reported by the run's final fenced json block.
// Every line carries an `attestation` map that says which is which, and the raw self-report stays
// next to the transcript as self-report.json so a later read can tell where a number came from.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, appendFile, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const evalDirectory = dirname(fileURLToPath(import.meta.url))
const skillDirectory = dirname(evalDirectory)
const USAGE =
  'USAGE: run-live.mjs --host <claude|codex> --variant <name> --skill-dir <skill directory> --out <dir> [--replicates <k>] [--briefs id,id] [--briefs-file <briefs.json>] [--extra-args "<host args>"] [--dry-run]'
const WRITE_TOOL_NAMES = new Set(['write', 'write_file', 'writefile', 'edit', 'multiedit', 'create_file', 'file_write', 'save_file'])
const CODEX_CHANGE_ITEMS = new Set(['file_change', 'file_write', 'patch'])
const FENCED_JSON = /```json\b([\s\S]*?)```/g

export const SKILL_NAME = 'frontend-interface-design'
export const REPORT_FOOTER_MARKER = 'When you finish, emit one fenced ```json block as the last thing you write'
export const HOSTS = {
  claude: {
    command: 'claude',
    exposure: ['.claude/skills'],
    // --print + stream-json gives one JSON event per line; acceptEdits lets the run write index.html
    // without a permission prompt while every other permission keeps the default policy.
    args: (prompt, extra) => [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      ...extra,
    ],
  },
  codex: {
    command: 'codex',
    exposure: ['.agents/skills', '.codex/skills'],
    // codex exec --json streams item.* events; workspace-write lets it write index.html in cwd.
    args: (prompt, extra) => ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', ...extra, prompt],
  },
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function reportFooter({ caseId, variant, host, replicateId }) {
  return [
    `${REPORT_FOOTER_MARKER}, with exactly these fields:`,
    `caseId "${caseId}", variant "${variant}", replicateId "${replicateId}", host "${host}", outputPath (string), mode ("Fidelity" or "Adaptation" or "Creation"), loopRounds (integer, 0 when no render-and-fix loop ran), errors (string array).`,
    'Report what actually happened, never what the brief wants.',
  ].join('\n')
}

/** The prompt a host receives: use the installed skill, the brief, the single-file output contract, the report footer. */
export function buildPrompt({ brief, variant, host, replicateId }) {
  const skillPath = `${HOSTS[host].exposure[0]}/${SKILL_NAME}/SKILL.md`
  return [
    `Use the \`${SKILL_NAME}\` skill installed in this project: read \`${skillPath}\` first and follow its workflow end to end.`,
    '',
    `## Brief — ${brief.title} (lang: ${brief.lang}, type: ${brief.type})`,
    '',
    brief.prompt,
    '',
    '## Output contract',
    '',
    '- Write exactly one file, `index.html`, in the current working directory. It must be self-contained: all CSS inline in a <style> block, no JavaScript frameworks or external scripts, no build step, no other files.',
    '- The only external requests allowed are Google Fonts (fonts.googleapis.com, fonts.gstatic.com) and the Pretendard CDN (cdn.jsdelivr.net/gh/orioncactus/pretendard). Images, icons and scripts must be inline or omitted.',
    '- Do not ask questions. Make reasonable assumptions and state them in your final message.',
    '- Use placeholder content only: no invented statistics, logos, testimonials or press mentions.',
    '',
    reportFooter({ caseId: brief.id, variant, host, replicateId }),
    '',
  ].join('\n')
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

function roleOf(event) {
  if (typeof event?.message?.role === 'string') return event.message.role
  if (typeof event?.role === 'string') return event.role
  if (event?.type === 'assistant') return 'assistant'
  return null
}

function isRunOutputEvent(event, role) {
  if (role === 'user') return false
  return role === 'assistant' || event?.type === 'assistant' || event?.type === 'result'
}

/**
 * Text the run itself wrote, in order. Only assistant/agent text counts: a tool result or user
 * message that happens to contain a fenced json block is environment content, not the run's report.
 */
export function assistantTextsFrom(events) {
  const texts = []
  for (const event of events) {
    const role = roleOf(event)
    const content = event?.message?.content
    if (isRunOutputEvent(event, role) && Array.isArray(content)) {
      for (const block of content) if (block?.type === 'text' && typeof block.text === 'string') texts.push(block.text)
    }
    if (event?.type === 'result' && typeof event.result === 'string') texts.push(event.result)
    // Codex stream: the final agent message arrives as item.completed with item_type agent_message.
    if (event?.type !== 'item.completed') continue
    const item = event.item
    if (item?.item_type === 'agent_message' && typeof item.text === 'string') texts.push(item.text)
  }
  return texts
}

/** The last fenced json block across the run's own text, parsed; null when absent or malformed. */
export function lastFencedJson(texts) {
  const block = [...texts.join('\n').matchAll(FENCED_JSON)].at(-1)?.[1]
  if (!block) return null
  try {
    return JSON.parse(block)
  } catch {
    return null
  }
}

export function selfReportFrom(events) {
  return lastFencedJson(assistantTextsFrom(events))
}

function writePathOf(block) {
  const input = block?.input ?? block?.arguments ?? {}
  return input.file_path ?? input.path ?? input.filePath ?? input.file ?? null
}

/** Paths written by a write/edit tool call that came back without an error — observed, not narrated. */
export function writtenPathsFrom(events) {
  const pending = new Map()
  const confirmed = new Set()
  for (const event of events) {
    const content = event?.message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'tool_use' && WRITE_TOOL_NAMES.has(String(block.name ?? '').toLowerCase())) {
          const path = writePathOf(block)
          if (path && block.id) pending.set(block.id, path)
        }
        if (block?.type === 'tool_result' && block.tool_use_id && block.is_error !== true) {
          const path = pending.get(block.tool_use_id)
          if (path) confirmed.add(path)
        }
      }
    }
    if (event?.type !== 'item.completed') continue
    const item = event.item
    if (!item || !CODEX_CHANGE_ITEMS.has(String(item.item_type ?? '').toLowerCase()) || item.status === 'failed') continue
    for (const change of Array.isArray(item.changes) ? item.changes : [item]) {
      if (typeof change?.path === 'string') confirmed.add(change.path)
    }
  }
  return [...confirmed]
}

/** One runs.jsonl line: observed telemetry, self-reported mode/loopRounds, and an attestation map naming each. */
export function buildRunRecord({ brief, variant, host, replicateId, dir, events, runtimeMs, exitCode, outputExists }) {
  const report = selfReportFrom(events)
  const reported = report ?? {}
  const { toolCalls, tokens } = usageFrom(events)
  const errors = Array.isArray(reported.errors) ? reported.errors.map(String) : []
  if (!report) errors.push('NO_MACHINE_REPORT')
  if (report && reported.caseId !== brief.id) errors.push('CASE_ID_MISMATCH')
  if (!outputExists) errors.push('NO_OUTPUT')
  if (exitCode !== 0) errors.push(`HOST_EXIT_${exitCode}`)
  const attestation = {
    outputExists: 'observed',
    writtenPaths: 'observed',
    toolCalls: 'observed',
    tokens: 'observed',
    runtimeMs: 'observed',
    exitCode: 'observed',
    outputPath: typeof reported.outputPath === 'string' ? 'self-reported' : 'unreported',
    mode: typeof reported.mode === 'string' ? 'self-reported' : 'unreported',
    loopRounds: Number.isSafeInteger(reported.loopRounds) ? 'self-reported' : 'unreported',
  }
  if (report) {
    for (const field of ['mode', 'loopRounds']) if (attestation[field] === 'unreported') errors.push(`FLAG_UNREPORTED:${field}`)
  }
  return {
    record: {
      caseId: brief.id,
      lang: brief.lang,
      variant,
      host,
      replicateId,
      dir,
      outputPath: join(dir, 'index.html'),
      outputExists,
      writtenPaths: writtenPathsFrom(events),
      reportedOutputPath: typeof reported.outputPath === 'string' ? reported.outputPath : null,
      mode: typeof reported.mode === 'string' ? reported.mode : null,
      loopRounds: Number.isSafeInteger(reported.loopRounds) ? reported.loopRounds : null,
      toolCalls,
      tokens,
      runtimeMs,
      exitCode,
      model: events.find((event) => event?.message?.model)?.message?.model ?? events.find((event) => event?.model)?.model ?? null,
      sessionId: events.find((event) => event?.session_id)?.session_id ?? null,
      errors,
      attestation,
    },
    selfReported: report,
  }
}

/** Fixture directory <root>/<briefId>/<variant>/<host>/<replicateId> with the skill exposed the way the host discovers project skills. */
export async function createFixture({ root, brief, variant, host, replicateId, skillDir, prompt }) {
  const dir = join(root, brief.id, variant, host, replicateId)
  await mkdir(dir, { recursive: true })
  const target = resolve(skillDir)
  for (const exposure of HOSTS[host].exposure) {
    const parent = join(dir, exposure)
    await mkdir(parent, { recursive: true })
    const link = join(parent, SKILL_NAME)
    await rm(link, { force: true })
    await symlink(target, link, 'dir')
  }
  await writeFile(join(dir, 'prompt.md'), prompt)
  const meta = {
    caseId: brief.id,
    lang: brief.lang,
    variant,
    host,
    replicateId,
    skillDir: target,
    promptSha256: sha256(prompt),
    createdAt: new Date().toISOString(),
  }
  await writeFile(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  return { dir, meta }
}

function runHost(host, prompt, cwd, extra) {
  const { command, args } = HOSTS[host]
  return new Promise((done, reject) => {
    const child = spawn(command, args(prompt, extra), { cwd })
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
    child.on('close', (code) => done({ code, stdout, stderr }))
  })
}

function option(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

/** The exact commands that turn fixture directories into a graded report: render → judge → grade. */
export function nextCommands({ root, host, variant, fixtures, dryRun }) {
  const other = variant === 'baseline' ? 'candidate' : 'baseline'
  const render = join(skillDirectory, 'scripts/render.mjs')
  const lines = [
    dryRun
      ? `dry run: wrote ${fixtures.length} fixture directories under ${root} (no host was spawned)`
      : `wrote ${fixtures.length} runs to ${join(root, 'runs.jsonl')}`,
    'next:',
    '  # 1. render every run: screenshots + deterministic metrics next to its index.html',
    ...fixtures.map(
      ({ brief, dir }) => `  node ${render} --in ${join(dir, 'index.html')} --out ${dir} --lang ${brief.lang} --source ${dir} --impeccable`,
    ),
    `  # 2. judge ${variant} against ${other} per brief × host × replicate (both orderings, no scores)`,
    ...fixtures.map(
      ({ brief, replicateId }) =>
        `  node ${join(evalDirectory, 'judge.mjs')} --brief ${brief.id} --a ${join(root, brief.id, 'candidate', host, replicateId)} --b ${join(root, brief.id, 'baseline', host, replicateId)} --host ${host} --out ${join(root, 'judgments', `${brief.id}-${host}-${replicateId}.json`)}`,
    ),
    '  # 3. grade: gates per unit, pass^k / pass@k per (brief, host, variant), win rates per host',
    `  node ${join(evalDirectory, 'grade-results.mjs')} --runs ${join(root, 'runs.jsonl')} --metrics ${root} --judgments ${join(root, 'judgments')} --gates ${join(evalDirectory, 'gates.json')} --briefs ${join(evalDirectory, 'briefs.json')} --out ${join(root, 'summary')}`,
    '',
  ]
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const host = option(args, '--host')
  const variant = option(args, '--variant')
  const skillDir = option(args, '--skill-dir')
  const out = option(args, '--out')
  if (!HOSTS[host] || !variant || !skillDir || !out) {
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 2
    return
  }
  // pass^k needs k independent runs of the same brief; each gets its own replicateId so the grader
  // scores the brief on every replicate instead of treating the repeats as a duplicate case.
  const replicates = Number.parseInt(option(args, '--replicates') ?? '1', 10)
  if (!Number.isSafeInteger(replicates) || replicates < 1) throw new Error('INVALID_REPLICATES')
  const dryRun = args.includes('--dry-run')
  const briefsFile = option(args, '--briefs-file') ?? join(evalDirectory, 'briefs.json')
  const only = option(args, '--briefs')
  const selected = only
    ? only
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : null
  const extra = (option(args, '--extra-args') ?? '').split(/\s+/).filter(Boolean)
  const corpus = JSON.parse(await readFile(briefsFile, 'utf8'))
  const briefs = corpus.briefs.filter((brief) => !selected || selected.includes(brief.id))
  if (briefs.length === 0) throw new Error(`NO_SUCH_BRIEF: ${only}`)
  if (!(await exists(join(resolve(skillDir), 'SKILL.md')))) throw new Error(`NOT_A_SKILL_DIR: ${skillDir}`)
  const root = resolve(out)
  await mkdir(root, { recursive: true })

  const fixtures = []
  for (const brief of briefs) {
    for (let replicate = 1; replicate <= replicates; replicate += 1) {
      const replicateId = `r${replicate}`
      const prompt = buildPrompt({ brief, variant, host, replicateId })
      const { dir } = await createFixture({ root, brief, variant, host, replicateId, skillDir, prompt })
      fixtures.push({ brief, dir, replicateId })
      if (dryRun) continue
      await rm(join(dir, 'index.html'), { force: true })
      const startedAt = Date.now()
      const { code, stdout, stderr } = await runHost(host, prompt, dir, extra)
      const runtimeMs = Date.now() - startedAt
      await writeFile(join(dir, 'transcript.jsonl'), stdout)
      await writeFile(join(dir, 'stderr.txt'), stderr)
      const events = parseTranscript(stdout)
      const outputExists = await exists(join(dir, 'index.html'))
      const { record, selfReported } = buildRunRecord({
        brief,
        variant,
        host,
        replicateId,
        dir,
        events,
        runtimeMs,
        exitCode: code,
        outputExists,
      })
      await writeFile(join(dir, 'self-report.json'), `${JSON.stringify(selfReported, null, 2)}\n`)
      await writeFile(join(dir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`)
      await appendFile(join(root, 'runs.jsonl'), `${JSON.stringify(record)}\n`)
      process.stderr.write(`ran ${brief.id} ${replicateId} in ${runtimeMs}ms (exit ${code}, output ${outputExists ? 'yes' : 'NO'})\n`)
    }
  }
  process.stdout.write(nextCommands({ root, host, variant, fixtures, dryRun }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`EVAL_LIVE_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
