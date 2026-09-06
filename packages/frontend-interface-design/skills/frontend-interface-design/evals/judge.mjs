#!/usr/bin/env node
// Pairwise VLM judge for one brief. A and B are two run directories (index.html + <viewport>-<theme>.png
// from scripts/render.mjs). The host opens the screenshots with its own file tool, answers the
// brief's ten yes/no checklist questions per side and says which side belongs to the brief —
// never a numeric score ("VLM judges can rank but cannot score"). The pair is judged twice with
// positions swapped; a side wins only when it wins in both orderings, and positionBias records a
// disagreement between the orderings so a first-position preference is visible, not averaged away.
import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { assistantTextsFrom, parseTranscript, usageFrom } from './run-live.mjs'

const evalDirectory = dirname(fileURLToPath(import.meta.url))
const USAGE =
  'USAGE: judge.mjs --brief <id> --a <dir> --b <dir> --host <claude|codex> --out <json> [--with-code] [--dry-run] [--briefs-file <briefs.json>] [--viewports 375,1280] [--theme light|dark] [--a-variant <name>] [--b-variant <name>] [--extra-args "<host args>"]'
const SWAP = { A: 'B', B: 'A', tie: 'tie' }
const SIDES = ['A', 'B']
const FENCED_JSON = /```json\b([\s\S]*?)```/g
const MAX_INLINE_HTML = 60_000
const CHECKLIST_LENGTH = 10

export const DEFAULT_VIEWPORTS = [375, 1280]
export const HOSTS = {
  claude: {
    command: 'claude',
    // The screenshots are read by the host's own Read tool, which renders PNG files it opens.
    args: (prompt, _images, extra) => ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...extra],
  },
  codex: {
    command: 'codex',
    // codex exec attaches images up front with --image; the prompt still lists the paths.
    args: (prompt, images, extra) => [
      'exec',
      '--json',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      ...images.flatMap((image) => ['--image', image]),
      ...extra,
      prompt,
    ],
  },
}

/** The pairwise prompt: brief, screenshot paths per side, optional inline source, checklist, belonging question, JSON-only answer. */
export function buildPrompt({ brief, a, b }) {
  const sides = [
    ['A', a],
    ['B', b],
  ]
  const lines = [
    'You are the judge in a pairwise comparison of two implementations, A and B, of the same design brief.',
    'Compare; do not score. Numeric scores, ratings, percentages or point totals are forbidden anywhere in your answer.',
    'Judge what is on the screenshots. Do not favor the side shown first, and do not reward decoration the brief did not ask for.',
    '',
    `## Brief — ${brief.title} (lang: ${brief.lang}, type: ${brief.type})`,
    '',
    brief.prompt,
    '',
    `Audience: ${brief.audience}`,
    `Mood: ${brief.mood.join(' · ')}`,
    `Memorable element: ${brief.memorable}`,
    '',
    '## Screenshots — open every file with your file reading tool before answering',
    '',
    ...sides.flatMap(([label, side]) => side.screenshots.map((shot) => `${label} — ${shot.viewport}px: ${shot.path}`)),
  ]
  for (const [label, side] of sides) {
    if (!side.html) continue
    lines.push('', `## Source ${label} (index.html, may be truncated)`, '', '```html', side.html, '```')
  }
  lines.push(
    '',
    '## Checklist — answer every question for A and for B with true (yes, good) or false',
    '',
    ...brief.checklist.map((question, index) => `${index + 1}. ${question}`),
    '',
    '## Belonging',
    '',
    'Which side belongs to this brief rather than to a generic template? Answer "A", "B" or "tie". A tie is allowed only when you genuinely cannot tell the two apart.',
    '',
    '## Output',
    '',
    'Reply with ONLY one fenced ```json block, nothing before or after it, in exactly this shape (no numeric scores):',
    '',
    '```json',
    '{ "checks": { "A": [ten booleans in checklist order], "B": [ten booleans in checklist order] }, "belongs": "A" | "B" | "tie", "notes": ["at most three short bullets, no numbers"] }',
    '```',
    '',
  )
  return lines.join('\n')
}

/** Parses the judge's answer: the last fenced json block (or bare JSON), validated field by field. Throws JUDGE_* on anything missing. */
export function parseJudgeOutput(text) {
  if (typeof text !== 'string') throw new TypeError('JUDGE_NO_JSON')
  let block = [...text.matchAll(FENCED_JSON)].at(-1)?.[1] ?? null
  if (!block && text.trim().startsWith('{')) block = text.trim()
  if (!block) throw new Error('JUDGE_NO_JSON')
  let parsed
  try {
    parsed = JSON.parse(block)
  } catch {
    throw new Error('JUDGE_MALFORMED_JSON')
  }
  const checks = parsed?.checks
  for (const side of SIDES) {
    const list = checks?.[side]
    if (!Array.isArray(list) || list.length !== CHECKLIST_LENGTH || !list.every((value) => typeof value === 'boolean')) {
      throw new Error(`JUDGE_INVALID_CHECKS:${side}`)
    }
  }
  if (typeof parsed.belongs !== 'string' || !Object.hasOwn(SWAP, parsed.belongs)) throw new Error('JUDGE_INVALID_BELONGS')
  let notes = []
  if (Array.isArray(parsed.notes)) notes = parsed.notes.map(String).slice(0, 3)
  else if (typeof parsed.notes === 'string') notes = [parsed.notes]
  return { checks: { A: [...checks.A], B: [...checks.B] }, belongs: parsed.belongs, notes }
}

/** Maps a swapped-ordering answer (presented A = real B) back to the real sides. */
export function swapSides(result) {
  if (!result) return null
  return { checks: { A: result.checks.B, B: result.checks.A }, belongs: SWAP[result.belongs], notes: result.notes }
}

function passCount(result, side) {
  return result ? result.checks[side].filter(Boolean).length : null
}

function average(values) {
  const present = values.filter((value) => value !== null)
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null
}

/** The side both orderings picked; a tie, a missing answer or a disagreement yields 'tie'. */
function agreedWinner(votes) {
  const decisive = votes.every((vote) => vote === 'A' || vote === 'B')
  if (!decisive) return 'tie'
  if (votes[0] !== votes[1]) return 'tie'
  return votes[0]
}

/**
 * Combines the AB ordering (`first`, real sides) with the BA ordering (`second`, as answered with
 * presented labels). A side wins only when both orderings pick it; anything else is a tie.
 * positionBias is true when the two orderings disagree. checkPass averages the per-side pass counts.
 */
export function combineOrderings(first, second) {
  const mapped = swapSides(second)
  const votes = [first?.belongs ?? null, mapped?.belongs ?? null]
  const winner = agreedWinner(votes)
  const positionBias = votes[0] !== null && votes[1] !== null && votes[0] !== votes[1]
  return {
    winner,
    positionBias,
    votes,
    checkPass: {
      A: average([passCount(first, 'A'), passCount(mapped, 'A')]),
      B: average([passCount(first, 'B'), passCount(mapped, 'B')]),
    },
    mapped,
  }
}

/** Longest shared ancestor of two directories — the cwd the judge runs in so both sides are readable. */
export function commonAncestor(first, second) {
  const left = resolve(first).split(sep)
  const right = resolve(second).split(sep)
  const shared = []
  for (let index = 0; index < Math.min(left.length, right.length) && left[index] === right[index]; index += 1) {
    shared.push(left[index])
  }
  return shared.length > 1 ? shared.join(sep) : sep
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function loadSide({ dir, viewports, theme, withCode, variant, dryRun }) {
  const directory = resolve(dir)
  const meta = await readJsonIfExists(join(directory, 'meta.json'))
  const screenshots = viewports.map((viewport) => ({ viewport, path: join(directory, `${viewport}-${theme}.png`) }))
  if (!dryRun) for (const shot of screenshots) await access(shot.path)
  let html = null
  if (withCode) {
    const source = await readFile(join(directory, 'index.html'), 'utf8')
    html = source.length > MAX_INLINE_HTML ? `${source.slice(0, MAX_INLINE_HTML)}\n<!-- truncated -->` : source
  }
  return {
    dir: directory,
    variant: variant ?? meta?.variant ?? null,
    host: meta?.host ?? null,
    replicateId: meta?.replicateId ?? null,
    caseId: meta?.caseId ?? null,
    screenshots,
    html,
  }
}

function runHost(host, prompt, images, cwd, extra) {
  const { command, args } = HOSTS[host]
  return new Promise((done, reject) => {
    const child = spawn(command, args(prompt, images, extra), { cwd })
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

async function judgeOrdering({ host, prompt, images, cwd, extra, order }) {
  const startedAt = Date.now()
  const { code, stdout, stderr } = await runHost(host, prompt, images, cwd, extra)
  const events = parseTranscript(stdout)
  const text = assistantTextsFrom(events).join('\n')
  let parsed = null
  let error = null
  try {
    parsed = parseJudgeOutput(text)
  } catch (failure) {
    error = failure.message
  }
  if (code !== 0) error = error ? `${error}; HOST_EXIT_${code}` : `HOST_EXIT_${code}`
  return {
    order,
    parsed,
    error,
    exitCode: code,
    runtimeMs: Date.now() - startedAt,
    ...usageFrom(events),
    model: events.find((event) => event?.message?.model)?.message?.model ?? null,
    text: text.slice(-4000),
    stderr: stderr.slice(-1000),
  }
}

function option(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

async function main() {
  const args = process.argv.slice(2)
  const briefId = option(args, '--brief')
  const aDir = option(args, '--a')
  const bDir = option(args, '--b')
  const host = option(args, '--host')
  const out = option(args, '--out')
  const dryRun = args.includes('--dry-run')
  if (!briefId || !aDir || !bDir || !HOSTS[host] || (!out && !dryRun)) {
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 2
    return
  }
  const withCode = args.includes('--with-code')
  const theme = option(args, '--theme') ?? 'light'
  const viewports = (option(args, '--viewports') ?? DEFAULT_VIEWPORTS.join(','))
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((width) => Number.isSafeInteger(width))
  const extra = (option(args, '--extra-args') ?? '').split(/\s+/).filter(Boolean)
  const briefsFile = option(args, '--briefs-file') ?? join(evalDirectory, 'briefs.json')
  const corpus = JSON.parse(await readFile(briefsFile, 'utf8'))
  const brief = corpus.briefs.find((candidate) => candidate.id === briefId)
  if (!brief) throw new Error(`NO_SUCH_BRIEF: ${briefId}`)
  const [a, b] = await Promise.all([
    loadSide({ dir: aDir, viewports, theme, withCode, variant: option(args, '--a-variant'), dryRun }),
    loadSide({ dir: bDir, viewports, theme, withCode, variant: option(args, '--b-variant'), dryRun }),
  ])
  const promptAB = buildPrompt({ brief, a, b })
  const promptBA = buildPrompt({ brief, a: b, b: a })
  if (dryRun) {
    process.stdout.write(`# ordering AB\n${promptAB}\n# ordering BA (presented A is real B)\n${promptBA}\n`)
    return
  }
  const cwd = commonAncestor(a.dir, b.dir)
  const imagesAB = [...a.screenshots, ...b.screenshots].map((shot) => shot.path)
  const first = await judgeOrdering({ host, prompt: promptAB, images: imagesAB, cwd, extra, order: 'AB' })
  const second = await judgeOrdering({ host, prompt: promptBA, images: [...imagesAB].reverse(), cwd, extra, order: 'BA' })
  const combined = combineOrderings(first.parsed, second.parsed)
  const strip = ({ dir, variant, host: generatorHost, replicateId, caseId }) => ({ dir, variant, host: generatorHost, replicateId, caseId })
  const judgment = {
    briefId,
    a: strip(a),
    b: strip(b),
    host,
    withCode,
    theme,
    viewports,
    orderings: [first, { ...second, mapped: combined.mapped }],
    winner: combined.winner,
    checkPass: combined.checkPass,
    positionBias: combined.positionBias,
    errors: [first.error, second.error].filter(Boolean),
    judgedAt: new Date().toISOString(),
  }
  await mkdir(dirname(resolve(out)), { recursive: true })
  await writeFile(resolve(out), `${JSON.stringify(judgment, null, 2)}\n`)
  process.stdout.write(
    `${briefId}: winner ${judgment.winner} (A ${a.variant ?? '?'} vs B ${b.variant ?? '?'}), checks A ${combined.checkPass.A ?? 'n/a'} / B ${combined.checkPass.B ?? 'n/a'}, positionBias ${judgment.positionBias}${judgment.errors.length ? `, errors ${judgment.errors.join('; ')}` : ''} → ${resolve(out)}\n`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`EVAL_JUDGE_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
