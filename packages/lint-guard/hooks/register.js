import {
  describeHits,
  evasionsInDiff,
  evasionsInToolCall,
  isCodeFile,
  isGitCommit,
  slowTestReason,
  stagesInSameCommand,
  weakeningReason,
} from './detect.js'
import { diagnosticsInRanges, eslintUnavailable, formatDiagnostics, writtenRanges } from './lint.js'

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
const LINT_TIMEOUT_MS = 45_000

const EVASION_MESSAGE =
  'lint-guard: do not hide a diagnostic. Fix its cause. If an exception is truly needed, ask the user and let them approve it.'

// `git diff HEAD` also covers `git add . && git commit` in one command, where nothing is staged yet.
async function diffAgainstHead($) {
  const head = await $.process.run(['git', 'diff', 'HEAD', '-U0', '--no-color'])
  if (head.exitCode === 0) return head.stdout
  // First commit of a repository has no HEAD.
  const staged = await $.process.run(['git', 'diff', '--cached', '-U0', '--no-color'])
  if (staged.exitCode === 0) return staged.stdout
  throw new Error(staged.stderr.trim() || 'git diff failed')
}

const MAX_UNTRACKED = 200

// New files `git add` is about to stage are not in `git diff HEAD`; read them as all-added.
async function untrackedAsDiff($) {
  // NUL-separated: without -z git quotes unusual names, which would not open.
  const listed = await $.process.run(['git', 'ls-files', '-z', '--others', '--exclude-standard'])
  if (listed.exitCode !== 0) throw new Error(listed.stderr.trim() || 'git ls-files failed')
  const files = listed.stdout.split('\0').filter(isCodeFile)
  if (files.length > MAX_UNTRACKED) {
    throw new Error(
      `${files.length} untracked code files exceed the ${MAX_UNTRACKED} the guard reads; commit in smaller steps`,
    )
  }
  const parts = []
  for (const file of files) {
    const lines = (await $.fs.read(file)).split('\n')
    parts.push(`+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`))
  }
  return parts.join('\n')
}

async function guardToolCall($, e, next) {
  const hits = evasionsInToolCall(e)
  if (hits.length > 0) return { deny: `${EVASION_MESSAGE}\n${describeHits(hits)}` }

  if (e.tool === 'Bash' && isGitCommit(e.command)) {
    let diff
    try {
      diff = await diffAgainstHead($)
      if (stagesInSameCommand(e.command)) diff += `\n${await untrackedAsDiff($)}`
    } catch (error) {
      return { deny: `lint-guard: cannot inspect the diff before commit (${error.message})` }
    }
    const committed = evasionsInDiff(diff)
    if (committed.length > 0) return { deny: `${EVASION_MESSAGE}\n${describeHits(committed)}` }
  }
  const result = await next(e)
  return EDIT_TOOLS.has(e.tool) ? withLintFeedback($, e, result) : result
}

// Queues ESLint findings on the lines this call wrote for what Claude reads back. Never blocks:
// the edit already happened, and a lint that cannot run must not look like a clean file.
async function withLintFeedback($, e, result) {
  const path = e.file_path
  if (!isCodeFile(path)) return result
  try {
    const content = await $.fs.read(path)
    const ranges = writtenRanges(e, content)
    if (!ranges) return result
    const run = await $.process.run(['npx', '--no-install', 'eslint', '--format', 'json', '--no-warn-ignored', path], {
      timeoutMs: LINT_TIMEOUT_MS,
    })
    const messages = diagnosticsInRanges(run.stdout, ranges)
    if (!messages) {
      if (!eslintUnavailable(run.stderr)) addNote($, e, `lint-guard: ESLint did not run (${firstLine(run.stderr)})`)
      return result
    }
    if (messages.length > 0) addNote($, e, formatDiagnostics(path, messages))
    return result
  } catch (error) {
    addNote($, e, `lint-guard: lint feedback failed (${error.message})`)
    return result
  }
}

const firstLine = (text) => text.trim().split('\n')[0] || 'no output'

// Claude reads a tool's result from the `tool_result` row the session stores, not from what
// tool.call returns. A note is parked here by tool_use_id and joined to that row by session.append.
const pendingNotes = new Map()

function addNote($, e, note) {
  if (e.tool_use_id) pendingNotes.set(e.tool_use_id, note)
  else $.ui.toast(note)
}

async function joinNotes($, e, next) {
  if (e.door !== 'tool-result' || pendingNotes.size === 0) return next(e)
  const content = e.message.content.map((block) => {
    const note = block.type === 'tool_result' ? pendingNotes.get(block.tool_use_id) : undefined
    if (note === undefined) return block
    pendingNotes.delete(block.tool_use_id)
    return Array.isArray(block.content)
      ? { ...block, content: [...block.content, { type: 'text', text: note }] }
      : { ...block, content: `${block.content}\n\n${note}` }
  })
  return next({ ...e, message: { ...e.message, content } })
}

async function reviewPermission($, e, next) {
  const decision = await next(e)
  // Unlike tool.call, tool.check keeps the tool's arguments under `input`.
  const call = { tool: e.tool, ...e.input }
  const reason = weakeningReason(call) ?? slowTestReason(call)
  if (!reason || decision?.decision === 'deny') return decision
  $.ui.toast(`lint-guard: ${reason}`)
  return { decision: 'ask' }
}

export function register(on) {
  // A throwing hook is skipped by default, which would silently switch the guard off.
  // Fail closed for the calls it guards; other tools are never held up by a guard bug.
  on('tool.call', { tool: ['Edit', 'Write', 'MultiEdit', 'Bash'] }, guardToolCall).catch(async ($, e, next) => {
    if (next.called) return next(e)
    return { deny: `lint-guard failed (${next.error.kind}), so this ${e.tool} call was not run` }
  })
  // Same reasoning as above: if the review fails, ask the user rather than keep the earlier decision.
  on('tool.check', { tool: ['Edit', 'Write', 'MultiEdit', 'Bash'] }, reviewPermission).catch(async ($, e, next) => {
    // The review may fail after next(e) already answered; a deny from the rules still stands.
    const decided = await next(e)
    return decided?.decision === 'deny' ? decided : { decision: 'ask' }
  })
  on('session.append', joinNotes)
}
