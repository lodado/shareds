// Pure detectors for lint-guard. No Claude Code API here, so `node --test` can exercise them.

const CODE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i

// A diagnostic hidden instead of fixed. Each pattern runs against one added line.
const EVASIONS = [
  { id: 'eslint-disable', re: /eslint-disable/, hint: 'fix the cause of the diagnostic' },
  { id: 'ts-ignore', re: /@ts-(?:ignore|nocheck)\b/, hint: 'fix the type error' },
  { id: 'as-any', re: /\bas\s+any\b/, hint: 'give the value a real type' },
  { id: 'as-unknown-as', re: /\bas\s+unknown\s+as\b/, hint: 'narrow the value instead of asserting it' },
  { id: 'void-promise', re: /^\s*void\s+(?!0\b)[A-Za-z_$]/, hint: 'await or handle the promise' },
  {
    id: 'test-skip',
    re: /\b(?:it|test|describe)(?:\.\w+)*\.(?:skip|only|fixme)\b|\bx(?:it|describe)\s*\(/,
    hint: 'fix or delete the test only when its behavior is confirmed wrong',
  },
]

const MULTILINE = new Set(['as-any', 'as-unknown-as'])

// Waiting on the clock in a test guesses when state settles. `waitForTimeout` is always a guess.
// The rest have legitimate uses (fake timers, a negative assertion), so the user decides.
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:e2e|e2e-live|__tests__)\//i
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
// A line that loosens a gate: a rule turned off or down, a path ignored, a step that cannot fail.
// Adding one asks the user; removing one tightens the gate. Adding a check never asks.
// Rule options (`['error', { allow: [...] }]`, `max: 900`) can loosen in ways no word list covers,
// so any severity followed by an options object counts.
const GATE_LOOSENING =
  /["'](?:off|warn)["']|:\s*\[?\s*[01]\b|\[\s*(?:["'](?:error|warn)["']|[012])\s*,\s*\{|\b(?:ignore|allow|skip|except)\w*|\bexclude\b|passWithNoTests|\bbail\b|testTimeout|\.(?:skip|only)\b|--no-[\w-]+|\|\|\s*(?:true|:)|\bexit\s+0\b/
const TSCONFIG = /(?:^|\/)tsconfig[\w.-]*\.json$/
const TSCONFIG_WEAKENING =
  /"(?:strict|noImplicit\w+|strict\w+|noUnchecked\w+|noUnused\w+)"\s*:\s*false|"(?:exclude|skipLibCheck|checkJs)"/

const BYPASSES = [
  { id: 'no-verify', re: /\bgit\s+(?:commit|push|merge|rebase|cherry-pick|am)\b[^|;&\n]*--no-ve\w*/ },
  { id: 'commit-n', re: /\bgit\s+commit\b[^|;&\n]*\s-[A-Za-z]*n[A-Za-z]*(?=\s|$)/ },
  { id: 'husky-off', re: /\bHUSKY\s*=\s*0\b/ },
  { id: 'skip-hooks', re: /\b(?:SKIP|HUSKY_SKIP_HOOKS)\s*=/ },
  { id: 'hooks-path', re: /\bgit\b[^|;&\n]*\bcore\.hooksPath\b/ },
]
const SHELL_WRITE = /\bsed\s+-[A-Za-z]*i|\bperl\s+-[A-Za-z]*i|\btee\b|>>?\s*\S|\b(?:mv|cp|rm)\s/

// The id of the git hook bypass in a shell command, or null.
export const hookBypass = (command) => BYPASSES.find((entry) => entry.re.test(command ?? ''))?.id ?? null

export const isCodeFile = (path) => CODE_FILE.test(path ?? '')
export const isGateConfig = (path) => GATE_CONFIG.test(path ?? '')
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
  // A type assertion may break across lines (`as\n  any`), which no single-line pattern sees.
  const joined = lines.join('\n')
  for (const evasion of EVASIONS.filter((entry) => MULTILINE.has(entry.id))) {
    for (const match of joined.matchAll(new RegExp(evasion.re.source, 'g'))) {
      const line = joined.slice(0, match.index).split('\n').length
      if (!hits.some((hit) => hit.id === evasion.id && hit.line === line)) {
        hits.push({ id: evasion.id, hint: evasion.hint, line, text: lines[line - 1].trim() })
      }
    }
  }
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

const SIMPLE_ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 }

// git quotes a path with non-ASCII bytes, tabs or quotes as a C string: "b/\303\251.ts".
function diffPath(target) {
  const raw = target.endsWith('\t') ? target.slice(0, -1) : target
  if (!raw.startsWith('"')) return raw.replace(/^b\//, '')
  const inner = raw.slice(1, -1)
  const bytes = []
  for (let at = 0; at < inner.length; at += 1) {
    const octal = /^\\([0-3][0-7]{2})/.exec(inner.slice(at, at + 4))
    if (octal) {
      bytes.push(parseInt(octal[1], 8))
      at += 3
    } else if (inner[at] === '\\' && inner[at + 1] in SIMPLE_ESCAPES) {
      bytes.push(SIMPLE_ESCAPES[inner[at + 1]])
      at += 1
    } else {
      bytes.push(...Buffer.from(inner[at]))
    }
  }
  return Buffer.from(bytes).toString('utf8').replace(/^b\//, '')
}

// Added lines per file from `git diff -U0`, with the new-file line number of each.
export function parseDiff(diff) {
  const files = []
  let file = null
  let line = 0
  // Rows still owed to the current hunk. Inside a hunk every `+`/`-` row is content, even one
  // that reads `+++ b/other` (an added line `++ b/other`), so headers are only read outside it.
  let added = 0
  let removed = 0
  for (const row of diff.split('\n')) {
    if (added > 0 && row.startsWith('+')) {
      file?.added.push({ line, text: row.slice(1) })
      line += 1
      added -= 1
      continue
    }
    if (removed > 0 && row.startsWith('-')) {
      removed -= 1
      continue
    }
    if (row.startsWith('\\')) continue
    added = 0
    removed = 0
    if (row.startsWith('+++ ')) {
      const target = row.slice(4)
      file = target === '/dev/null' ? null : { path: diffPath(target), added: [] }
      if (file) files.push(file)
      continue
    }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row)
    if (hunk) {
      removed = hunk[1] === undefined ? 1 : Number(hunk[1])
      line = Number(hunk[2])
      added = hunk[3] === undefined ? 1 : Number(hunk[3])
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

// `FOO=1 git commit`, `env`, `sudo`, `time` and the like in front of the command.
const ASSIGNMENT = /^(?:[A-Za-z_]\w*=\S*\s+)+/
const WRAPPER = /^(?:(?:env|command|time|sudo|nice|nohup|exec|builtin)(?:\s+-\S+(?:\s+\d+)?)*\s+)+/
const GIT_COMMIT = /^git\s+(?:-{1,2}[\w-]+(?:=\S*)?(?:\s+(?!commit\b)\S+)?\s+)*commit\b/
const SHELL_C = /-c\s+(['"])([\s\S]*?)\1/g

export function isGitCommit(command = '') {
  const inner = [...command.matchAll(SHELL_C)].map((match) => match[2])
  return [command, ...inner].some((text) =>
    text.split(/[;&|()\n]+/).some((segment) => {
      let rest = segment.trim()
      for (let next = ''; next !== rest; ) {
        next = rest
        rest = rest.replace(ASSIGNMENT, '').replace(WRAPPER, '')
      }
      return GIT_COMMIT.test(rest)
    }),
  )
}

// `git add . && git commit` stages after the guard runs, so new untracked files must be read too.
export const stagesInSameCommand = (command = '') => /\bgit\b[^;&|\n]*\badd\b/.test(command)

// Lines an edit tool call takes out. A Write needs the file it replaces: `previous` is '' for a
// new file and undefined when it could not be read. null when the removed lines are unknown.
function removedByToolCall(e, previous) {
  if (e.tool === 'Edit') return addedLines(e.new_string, e.old_string)
  if (e.tool === 'MultiEdit') return (e.edits ?? []).flatMap((edit) => addedLines(edit.new_string, edit.old_string))
  if (e.tool === 'Write' && typeof previous === 'string') return addedLines(e.content, previous)
  return null
}

function gateLoosening(e, added, previous) {
  const loose = added.find((line) => GATE_LOOSENING.test(line))
  if (loose) return `adds "${loose.trim()}"`
  const removed = removedByToolCall(e, previous)
  if (!removed) return 'replaces a file it could not read first'
  // Brackets and blank lines move when a block is reshaped; they hold no check.
  const dropped = removed.find((line) => /\w/.test(line) && !GATE_LOOSENING.test(line))
  return dropped ? `removes "${dropped.trim()}"` : null
}

// Why a tool call should wait for the user, or null. Evasion is handled separately and denied.
export function weakeningReason(e, previous) {
  if (e.tool === 'Bash') {
    const command = e.command ?? ''
    const touched = GATE_CONFIG_IN_COMMAND.exec(command)
    if (touched && SHELL_WRITE.test(command)) return `shell command writes lint/test/hook configuration (${touched[0]})`
    return null
  }
  const written = addedByToolCall(e)
  if (!written?.path) return null
  if (GATE_CONFIG.test(written.path)) {
    const loosening = gateLoosening(e, written.lines, previous)
    return loosening ? `loosens lint/test/hook configuration (${written.path}): ${loosening}` : null
  }
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
