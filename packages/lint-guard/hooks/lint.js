// Pure helpers for post-edit lint feedback. The Claude Code calls live in register.js.

const MAX_LINES = 15

// 1-based inclusive line ranges the call wrote, found in the file as it is now.
// null when the call cannot be located (it failed, or the file changed again).
export function writtenRanges(e, content) {
  if (e.tool === 'Write') return [[1, Infinity]]
  const texts = e.tool === 'MultiEdit' ? (e.edits ?? []).map((edit) => edit.new_string) : [e.new_string]
  const ranges = []
  for (const text of texts) {
    if (!text) continue
    const at = content.indexOf(text)
    if (at < 0) return null
    const start = content.slice(0, at).split('\n').length
    ranges.push([start, start + text.split('\n').length - 1])
  }
  return ranges.length > 0 ? ranges : null
}

const overlaps = (message, ranges) => {
  const first = message.line ?? 1
  const last = message.endLine ?? first
  return ranges.some(([from, to]) => first <= to && last >= from)
}

// ESLint JSON output -> diagnostics on the lines this call wrote. A parse error (no ruleId)
// breaks the whole file, so it is always kept.
export function diagnosticsInRanges(stdout, ranges) {
  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(report)) return null
  return report.flatMap((file) => file.messages ?? []).filter((message) => message.fatal || overlaps(message, ranges))
}

export function formatDiagnostics(path, messages) {
  const rows = messages.slice(0, MAX_LINES).map((message) => {
    const level = message.severity === 2 || message.fatal ? 'error' : 'warn'
    return `  ${path}:${message.line ?? 1}:${message.column ?? 1} ${level} ${message.message} (${
      message.ruleId ?? 'parse'
    })`
  })
  const hidden = messages.length - rows.length
  const more = hidden > 0 ? `\n  ...and ${hidden} more` : ''
  return `lint-guard: ESLint found ${
    messages.length
  } problem(s) on the lines you just wrote. Fix the cause, do not hide it.\n${rows.join('\n')}${more}`
}

// No ESLint or no config in this project is not a failure worth reporting.
export const eslintUnavailable = (stderr) =>
  /could not determine executable|not found|no eslint configuration|couldn't find an eslint\.config|could not find config|enoent|no such file/i.test(
    stderr,
  )
