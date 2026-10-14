// Pure detectors for lint-guard. No Claude Code API here, so `node --test` can exercise them.

const CODE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/

// A diagnostic hidden instead of fixed. Each pattern runs against one added line.
const EVASIONS = [
  { id: 'eslint-disable', re: /eslint-disable/, hint: 'fix the cause of the diagnostic' },
  { id: 'ts-ignore', re: /@ts-(?:ignore|nocheck)\b/, hint: 'fix the type error' },
  { id: 'as-any', re: /\bas\s+any\b/, hint: 'give the value a real type' },
  { id: 'as-unknown-as', re: /\bas\s+unknown\s+as\b/, hint: 'narrow the value instead of asserting it' },
  { id: 'void-promise', re: /^\s*void\s+(?!0\b)[A-Za-z_$]/, hint: 'await or handle the promise' },
  {
    id: 'test-skip',
    re: /\b(?:it|test|describe)\.(?:skip|only)\s*\(|\bx(?:it|describe)\s*\(/,
    hint: 'fix or delete the test only when its behavior is confirmed wrong',
  },
]

// Waiting on the clock in a test guesses when state settles. `waitForTimeout` is always a guess.
// The rest have legitimate uses (fake timers, a negative assertion), so the user decides.
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:e2e|e2e-live|__tests__)\//
const TEST_WAIT_DENIED = [
  {
    id: 'wait-for-timeout',
    re: /\bwaitForTimeout\s*\(/,
    hint: 'wait for an element or network condition, or release a deferred barrier',
  },
]
const TEST_WAIT_ASKED = [
  { id: 'wait-for', re: /\bwaitFor(?:ElementToBeRemoved)?\s*\(|\bwaitUntil\s*\(|expect\.poll\s*\(/ },
  { id: 'network-idle', re: /networkidle/ },
  { id: 'clock-wait', re: /\bsetTimeout\s*\(|\bsleep\s*\(/ },
  { id: 'raised-timeout', re: /\btestTimeout\b|\b(?:jest|vi|test)\.setTimeout\s*\(|\bvi\.setConfig\s*\(/ },
]

// Lint, test and hook configuration. Weakening these hides diagnostics for every file.
const GATE_CONFIG =
  /(?:^|\/)(?:eslint\.config\.[cm]?[jt]s|\.eslintrc(?:\.[\w]+)?|\.eslintignore|(?:vitest|jest)\.(?:config|workspace)[\w.-]*|\.lintstagedrc[\w.]*|lint-staged\.config[\w.]*|commitlint\.config[\w.]*|\.husky\/[^\s'"]+)$/
const GATE_CONFIG_IN_COMMAND =
  /eslint\.config\.[cm]?[jt]s|\.eslintrc|\.eslintignore|(?:vitest|jest)\.(?:config|workspace)|\.lintstagedrc|lint-staged\.config|commitlint\.config|\.husky\//
const TSCONFIG = /(?:^|\/)tsconfig[\w.-]*\.json$/
const TSCONFIG_WEAKENING =
  /"(?:strict|noImplicit\w+|strict\w+|noUnchecked\w+|noUnused\w+)"\s*:\s*false|"(?:exclude|skipLibCheck|checkJs)"/

const BYPASSES = [
  { id: 'no-verify', re: /\bgit\s+(?:commit|push|merge|rebase|cherry-pick|am)\b[^|;&\n]*--no-verify\b/ },
  { id: 'commit-n', re: /\bgit\s+commit\b[^|;&\n]*\s-[A-Za-z]*n[A-Za-z]*(?=\s|$)/ },
  { id: 'husky-off', re: /\bHUSKY\s*=\s*0\b/ },
  { id: 'skip-hooks', re: /\b(?:SKIP|HUSKY_SKIP_HOOKS)\s*=/ },
  { id: 'hooks-path', re: /\bgit\s+config\b[^|;&\n]*\bcore\.hooksPath\b/ },
]
const SHELL_WRITE = /\bsed\s+-[A-Za-z]*i|\bperl\s+-[A-Za-z]*i|\btee\b|>>?\s*\S|\b(?:mv|cp|rm)\s/

export const isCodeFile = (path) => CODE_FILE.test(path ?? '')
export const isTestFile = (path) => TEST_FILE.test(path ?? '')

// Lines of `next` that `previous` does not already contain, so an untouched
// pre-existing match in a large edit is not blamed on the agent. Duplicates count.
export function addedLines(previous, next) {
  const budget = new Map()
  for (const line of (previous ?? '').split('\n')) budget.set(line, (budget.get(line) ?? 0) + 1)
  const added = []
  for (const line of (next ?? '').split('\n')) {
    const left = budget.get(line) ?? 0
    if (left > 0) budget.set(line, left - 1)
    else added.push(line)
  }
  return added
}

export function findEvasions(lines, path = '') {
  const hits = []
  const rules = isTestFile(path) ? [...EVASIONS, ...TEST_WAIT_DENIED] : EVASIONS
  lines.forEach((text, index) => {
    for (const evasion of rules) {
      if (evasion.re.test(text)) hits.push({ id: evasion.id, hint: evasion.hint, line: index + 1, text: text.trim() })
    }
  })
  return hits
}

// Added lines per edit tool call; null when the call writes nothing this guard reads.
export function addedByToolCall(e) {
  const path = e.file_path ?? e.notebook_path
  if (e.tool === 'Write') return { path, lines: addedLines('', e.content) }
  if (e.tool === 'Edit') return { path, lines: addedLines(e.old_string, e.new_string) }
  if (e.tool === 'MultiEdit') {
    const lines = (e.edits ?? []).flatMap((edit) => addedLines(edit.old_string, edit.new_string))
    return { path, lines }
  }
  return null
}

export function evasionsInToolCall(e) {
  const written = addedByToolCall(e)
  if (!written || !isCodeFile(written.path)) return []
  return findEvasions(written.lines, written.path).map((hit) => ({ ...hit, file: written.path }))
}

// Added lines per file from `git diff -U0`, with the new-file line number of each.
export function parseDiff(diff) {
  const files = []
  let file = null
  let line = 0
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      const target = row.slice(4)
      file = target === '/dev/null' ? null : { path: target.replace(/^b\//, ''), added: [] }
      if (file) files.push(file)
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (file && row.startsWith('+') && !row.startsWith('+++')) {
      file.added.push({ line, text: row.slice(1) })
      line += 1
    }
  }
  return files
}

export function evasionsInDiff(diff) {
  return parseDiff(diff)
    .filter((file) => isCodeFile(file.path))
    .flatMap((file) =>
      findEvasions(
        file.added.map((entry) => entry.text),
        file.path,
      ).map((hit) => ({
        ...hit,
        file: file.path,
        line: file.added[hit.line - 1].line,
      })),
    )
}

export function isGitCommit(command) {
  return /(?:^|[;&|(]\s*|&&\s*)git\s+(?:-[Cc]\s+\S+\s+)*commit\b/.test(command ?? '')
}

// Why a tool call should wait for the user, or null. Evasion is handled separately and denied.
export function weakeningReason(e) {
  if (e.tool === 'Bash') {
    const command = e.command ?? ''
    const bypass = BYPASSES.find((entry) => entry.re.test(command))
    if (bypass) return `command skips git hooks (${bypass.id})`
    const touched = GATE_CONFIG_IN_COMMAND.exec(command)
    if (touched && SHELL_WRITE.test(command)) return `shell command writes lint/test/hook configuration (${touched[0]})`
    return null
  }
  const written = addedByToolCall(e)
  if (!written?.path) return null
  if (GATE_CONFIG.test(written.path)) return `edits lint/test/hook configuration (${written.path})`
  if (TSCONFIG.test(written.path) && written.lines.some((line) => TSCONFIG_WEAKENING.test(line))) {
    return `loosens TypeScript checking (${written.path})`
  }
  return null
}

// Waits in a test that the user should confirm: new lines only, test files only.
export function slowTestReason(e) {
  const written = addedByToolCall(e)
  if (!written || !isTestFile(written.path)) return null
  for (const line of written.lines) {
    const rule = TEST_WAIT_ASKED.find((entry) => entry.re.test(line))
    if (rule)
      return `test waits on the clock or raises a timeout (${rule.id}) in ${written.path}: prefer findBy*, a deferred barrier or fake timers`
  }
  return null
}

export function describeHits(hits) {
  return hits.map((hit) => `${hit.file}:${hit.line} ${hit.id} -> ${hit.hint}`).join('\n')
}
