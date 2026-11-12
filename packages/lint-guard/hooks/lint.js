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
  return report
    .flatMap((file) => file.messages ?? [])
    .filter((message) => !ignoredNotice(message))
    .filter((message) => message.fatal || overlaps(message, ranges))
}

// ESLint 8 has no --no-warn-ignored; it reports an explicitly passed ignored file as this rule-less warning.
const ignoredNotice = (message) => message.ruleId == null && !message.fatal && /^File ignored\b/.test(message.message ?? '')

// ESLint 8 reads a flat config only from the folder it starts in, so a monorepo session at the root lints a package
// file with the root eslintrc instead of the package's own config. Start where the package lint script would: the
// nearest folder above the file with a flat config, else the session folder.
const FROM_NEAREST_FLAT_CONFIG = `file=$2
case $file in /*) ;; *) file=$PWD/$file ;; esac
dir=\${file%/*}
while [ -n "$dir" ]; do
  for name in eslint.config.js eslint.config.mjs eslint.config.cjs eslint.config.ts eslint.config.mts eslint.config.cts; do
    if [ -f "$dir/$name" ]; then cd "$dir" && exec npx --no-install eslint --format json $1 "$file"; fi
  done
  dir=\${dir%/*}
done
exec npx --no-install eslint --format json $1 "$file"`

// --no-warn-ignored exists only in flat-config ESLint; eslintrc mode (ESLint 8) rejects it as an invalid option.
export const eslintArgs = (path, { legacy = false } = {}) => [
  'sh',
  '-c',
  FROM_NEAREST_FLAT_CONFIG,
  'lint-guard',
  legacy ? '' : '--no-warn-ignored',
  path,
]

export const rejectsWarnIgnored = (stderr) => /Invalid option '--(?:no-)?warn-ignored'/.test(stderr)

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
