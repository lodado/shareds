import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildPrompt,
  combineOrderings,
  commonAncestor,
  parseJudgeOutput,
  swapSides,
} from '../skills/frontend-interface-design/evals/judge.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const briefsPath = join(packageDirectory, 'skills/frontend-interface-design/evals/briefs.json')

async function briefById(id) {
  const corpus = JSON.parse(await readFile(briefsPath, 'utf8'))
  return corpus.briefs.find((brief) => brief.id === id)
}

function side(directory, html = null) {
  return {
    dir: directory,
    variant: null,
    screenshots: [375, 1280].map((viewport) => ({ viewport, path: `${directory}/${viewport}-light.png` })),
    html,
  }
}

async function runWithTimeout(command, args, options, timeoutMs = 5000) {
  const child = spawn(command, args, { ...options, detached: true })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })
  return new Promise((resolveResult) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      // Kill only this detached process group; never enumerate unrelated PIDs.
      try {
        if (process.platform === 'win32') child.kill('SIGKILL')
        else process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveResult({ timedOut, code, stdout, stderr })
    })
  })
}

const checks = (trueCount) => Array.from({ length: 10 }, (_, index) => index < trueCount)

function answer({ a, b, belongs, notes = ['first-position bias check'] }) {
  return `Looking at both.\n\`\`\`json\n${JSON.stringify({ checks: { A: a, B: b }, belongs, notes })}\n\`\`\`\n`
}

test('the judge prompt carries the brief, all ten checklist questions and every screenshot path, and forbids scores', async () => {
  const brief = await briefById('b03-marketing-landing-ko')
  const prompt = buildPrompt({
    brief,
    a: side('/runs/b03/candidate/claude/r1'),
    b: side('/runs/b03/baseline/claude/r1'),
  })

  assert.match(prompt, /## Brief — 독립 서점 구독 서비스 랜딩 \(lang: ko, type: marketing-landing\)/)
  assert.ok(prompt.includes(brief.prompt))
  for (const [index, question] of brief.checklist.entries())
    assert.ok(prompt.includes(`${index + 1}. ${question}`), `question ${index + 1}`)
  for (const path of [
    '/runs/b03/candidate/claude/r1/375-light.png',
    '/runs/b03/candidate/claude/r1/1280-light.png',
    '/runs/b03/baseline/claude/r1/375-light.png',
    '/runs/b03/baseline/claude/r1/1280-light.png',
  ]) {
    assert.ok(prompt.includes(path), path)
  }
  assert.match(prompt, /A — 375px: \/runs\/b03\/candidate/)
  assert.match(prompt, /B — 1280px: \/runs\/b03\/baseline/)
  assert.match(prompt, /Numeric scores, ratings, percentages or point totals are forbidden/)
  assert.match(prompt, /Compare; do not score/)
  assert.match(prompt, /"belongs": "A" \| "B" \| "tie"/)
  assert.doesNotMatch(prompt, /score (?:out of|from 1 to|between)/i)
  assert.doesNotMatch(prompt, /## Source/)

  const withCode = buildPrompt({ brief, a: side('/a', '<main>A</main>'), b: side('/b', '<main>B</main>') })
  assert.match(withCode, /## Source A \(index\.html, may be truncated\)\n\n```html\n<main>A<\/main>\n```/)
  assert.match(withCode, /## Source B/)
})

test('parseJudgeOutput takes the last fenced json block and validates every field', () => {
  const text = `${answer({ a: checks(3), b: checks(4), belongs: 'B' })}\nOn reflection:\n${answer({
    a: checks(8),
    b: checks(5),
    belongs: 'A',
    notes: 'one note',
  })}`
  const parsed = parseJudgeOutput(text)
  assert.equal(parsed.belongs, 'A')
  assert.deepEqual(parsed.checks.A, checks(8))
  assert.deepEqual(parsed.checks.B, checks(5))
  assert.deepEqual(parsed.notes, ['one note'])

  const bare = parseJudgeOutput(JSON.stringify({ checks: { A: checks(10), B: checks(0) }, belongs: 'tie' }))
  assert.equal(bare.belongs, 'tie')
  assert.deepEqual(bare.notes, [])
  assert.equal(
    parseJudgeOutput(answer({ a: checks(1), b: checks(1), belongs: 'A', notes: ['a', 'b', 'c', 'd'] })).notes.length,
    3,
  )

  assert.throws(() => parseJudgeOutput('no block here'), /JUDGE_NO_JSON/)
  assert.throws(() => parseJudgeOutput(null), /JUDGE_NO_JSON/)
  assert.throws(() => parseJudgeOutput('```json\n{ broken\n```'), /JUDGE_MALFORMED_JSON/)
  assert.throws(() => parseJudgeOutput('```json\n{ "belongs": "A" }\n```'), /JUDGE_INVALID_CHECKS:A/)
  assert.throws(
    () =>
      parseJudgeOutput(
        `\`\`\`json\n${JSON.stringify({ checks: { A: checks(10), B: checks(9).slice(0, 9) }, belongs: 'A' })}\n\`\`\``,
      ),
    /JUDGE_INVALID_CHECKS:B/,
  )
  assert.throws(
    () =>
      parseJudgeOutput(
        `\`\`\`json\n${JSON.stringify({ checks: { A: checks(10), B: [...checks(9), 'yes'] }, belongs: 'A' })}\n\`\`\``,
      ),
    /JUDGE_INVALID_CHECKS:B/,
  )
  assert.throws(
    () =>
      parseJudgeOutput(
        `\`\`\`json\n${JSON.stringify({ checks: { A: checks(10), B: checks(10) }, belongs: 'C' })}\n\`\`\``,
      ),
    /JUDGE_INVALID_BELONGS/,
  )
  assert.throws(
    () => parseJudgeOutput(`\`\`\`json\n${JSON.stringify({ checks: { A: checks(10), B: checks(10) } })}\n\`\`\``),
    /JUDGE_INVALID_BELONGS/,
  )
})

test('swapSides maps a swapped-ordering answer back to the real sides', () => {
  const swapped = swapSides({ checks: { A: checks(2), B: checks(7) }, belongs: 'A', notes: ['n'] })
  assert.deepEqual(swapped, { checks: { A: checks(7), B: checks(2) }, belongs: 'B', notes: ['n'] })
  assert.equal(swapSides({ checks: { A: [], B: [] }, belongs: 'tie', notes: [] }).belongs, 'tie')
  assert.equal(swapSides(null), null)
})

test('combineOrderings awards a winner only when both orderings agree and flags disagreement as position bias', () => {
  const realA = { checks: { A: checks(8), B: checks(4) }, belongs: 'A', notes: [] }
  // In the BA run the presented A is the real B, so "B" here means the real A again.
  const agreeing = combineOrderings(realA, { checks: { A: checks(4), B: checks(8) }, belongs: 'B', notes: [] })
  assert.equal(agreeing.winner, 'A')
  assert.equal(agreeing.positionBias, false)
  assert.deepEqual(agreeing.votes, ['A', 'A'])
  assert.deepEqual(agreeing.checkPass, { A: 8, B: 4 })
  assert.equal(agreeing.mapped.belongs, 'A')

  // The judge picked whichever side came first: a real-A vote, then a real-B vote.
  const biased = combineOrderings(realA, { checks: { A: checks(6), B: checks(6) }, belongs: 'A', notes: [] })
  assert.equal(biased.winner, 'tie')
  assert.equal(biased.positionBias, true)
  assert.deepEqual(biased.votes, ['A', 'B'])
  assert.deepEqual(biased.checkPass, { A: 7, B: 5 })

  const halfTie = combineOrderings(realA, { checks: { A: checks(5), B: checks(5) }, belongs: 'tie', notes: [] })
  assert.equal(halfTie.winner, 'tie')
  assert.equal(halfTie.positionBias, true)

  const bothTie = combineOrderings(
    { ...realA, belongs: 'tie' },
    { checks: { A: checks(5), B: checks(5) }, belongs: 'tie', notes: [] },
  )
  assert.equal(bothTie.winner, 'tie')
  assert.equal(bothTie.positionBias, false)

  const missing = combineOrderings(realA, null)
  assert.equal(missing.winner, 'tie')
  assert.equal(missing.positionBias, false)
  assert.deepEqual(missing.votes, ['A', null])
  assert.deepEqual(missing.checkPass, { A: 8, B: 4 })
  assert.deepEqual(combineOrderings(null, null).checkPass, { A: null, B: null })
})

test('commonAncestor is the deepest shared directory of both run directories', () => {
  assert.equal(commonAncestor('/runs/b01/candidate/claude/r1', '/runs/b01/baseline/claude/r1'), '/runs/b01')
  assert.equal(commonAncestor('/runs/x', '/runs/x'), '/runs/x')
  assert.equal(commonAncestor('/a/b', '/c/d'), '/')
})

test('judge closes fake host stdin so EOF-dependent CLIs do not hang', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Fake executable and process-group cleanup require POSIX')
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'fid-judge-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  const fakeHost = join(bin, 'codex')
  const aDir = join(root, 'a')
  const bDir = join(root, 'b')
  await mkdir(bin, { recursive: true })
  await mkdir(aDir, { recursive: true })
  await mkdir(bDir, { recursive: true })
  for (const directory of [aDir, bDir]) {
    for (const viewport of [375, 1280]) await writeFile(join(directory, `${viewport}-light.png`), 'fixture')
  }
  await writeFile(
    fakeHost,
    [
      '#!/usr/bin/env node',
      "let input = ''",
      "process.stdin.setEncoding('utf8')",
      "process.stdin.on('data', (chunk) => { input += chunk })",
      "process.stdin.on('end', () => {",
      '  const checks = { A: Array(10).fill(true), B: Array(10).fill(false) }',
      '  const fence = String.fromCharCode(96).repeat(3)',
      "  const text = fence + 'json\\n' + JSON.stringify({ checks, belongs: 'A', notes: [] }) + '\\n' + fence",
      "  process.stdout.write(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } }) + '\\n')",
      '})',
      'process.stdin.resume()',
      '',
    ].join('\n'),
  )
  await chmod(fakeHost, 0o755)
  const result = await runWithTimeout(
    process.execPath,
    [
      join(packageDirectory, 'skills/frontend-interface-design/evals/judge.mjs'),
      '--brief',
      'b03-marketing-landing-ko',
      '--a',
      aDir,
      '--b',
      bDir,
      '--host',
      'codex',
      '--out',
      join(root, 'judgment.json'),
    ],
    {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  assert.equal(result.timedOut, false, `fake host waited for stdin EOF: ${result.stderr}`)
  assert.equal(result.code, 0, `judge failed: ${result.stderr}`)
  const judgment = JSON.parse(await readFile(join(root, 'judgment.json'), 'utf8'))
  assert.deepEqual(judgment.errors, [])
  assert.equal(judgment.orderings.length, 2)
})
