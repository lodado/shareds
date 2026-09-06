import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  aggregate,
  gradeUnit,
  metricValue,
  renderMarkdown,
  resolveGates,
  winRates,
} from '../skills/frontend-interface-design/evals/grade-results.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const evalDirectory = join(packageDirectory, 'skills/frontend-interface-design/evals')
const grader = join(evalDirectory, 'grade-results.mjs')

async function readJson(name) {
  return JSON.parse(await readFile(join(evalDirectory, name), 'utf8'))
}

async function tempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fid-grade-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

/** A metrics.json that passes every default gate for a korean brief; override aggregate or source fields per test. */
function passingMetrics({ aggregate: aggregateOverrides = {}, source = {}, errors = [] } = {}) {
  return {
    schemaVersion: 1,
    lang: 'ko',
    errors,
    viewports: {},
    aggregate: {
      cells: 4,
      renderedCells: 4,
      contrastFailures: 0,
      horizontalOverflow: 0,
      emojiGlyphs: 0,
      tinyText: 0,
      smallTapTargets: 0,
      longLines: 0,
      textNodes: 50,
      hangulTextNodes: 30,
      contrastChecked: 50,
      contrastSkipped: 0,
      fontFamilies: ['Pretendard'],
      fontFamilyCount: 1,
      hangulKeepAllCoverage: 1,
      ...aggregateOverrides,
    },
    source:
      source === null ? null : { files: 1, literalValues: 1, tokenReferences: 40, literalRatio: 0.0244, ...source },
    impeccable: null,
  }
}

function judgment({
  briefId,
  host = 'claude',
  replicateId = 'r1',
  a = 'candidate',
  b = 'baseline',
  winner,
  positionBias = false,
  checkPass = { A: 7, B: 5 },
  errors = [],
}) {
  return {
    briefId,
    a: { dir: `/runs/${briefId}/${a}/${host}/${replicateId}`, variant: a, host, replicateId, caseId: briefId },
    b: { dir: `/runs/${briefId}/${b}/${host}/${replicateId}`, variant: b, host, replicateId, caseId: briefId },
    host,
    winner,
    checkPass,
    positionBias,
    errors,
  }
}

const briefsPromise = readJson('briefs.json').then((corpus) => corpus.briefs)
const gatesPromise = readJson('gates.json')

test('gates resolve from defaults, brief overrides keep the default kind, and whenLang gates follow the brief language', async () => {
  const [briefs, gates] = await Promise.all([briefsPromise, gatesPromise])
  const ko = briefs.find((brief) => brief.id === 'b01-fintech-home-ko')
  const en = briefs.find((brief) => brief.id === 'b02-saas-dashboard-en')

  const koGates = resolveGates(gates, ko)
  assert.deepEqual(koGates.errors, [])
  assert.deepEqual(koGates.gates.contrastFailures, { max: 0 })
  assert.deepEqual(koGates.gates.hangulKeepAllCoverage, { min: 0.95, whenLang: 'ko' })
  assert.deepEqual(koGates.gates.hangulTextNodes, { min: 1, whenLang: 'ko' })
  assert.deepEqual(koGates.gates.fontFamilyCount, { max: 2 })

  const enGates = resolveGates(gates, en)
  assert.equal(Object.hasOwn(enGates.gates, 'hangulKeepAllCoverage'), false)
  assert.equal(Object.hasOwn(enGates.gates, 'hangulTextNodes'), false)
  assert.deepEqual(enGates.gates.fontFamilyCount, { max: 3 })
  assert.deepEqual(enGates.gates.literalRatio, { max: 0.1 })

  const custom = resolveGates(
    {
      gates: { emojiGlyphs: 0, keepAll: { min: 0.9, whenLang: ['ko', 'ja'] }, broken: { whenLang: 'ko' }, worse: 'no' },
    },
    { id: 'x', lang: 'ja', gates: { emojiGlyphs: 2, keepAll: 0.5, extra: { min: 1 } } },
  )
  assert.deepEqual(custom.errors, ['INVALID_GATE:broken', 'INVALID_GATE:worse'])
  assert.deepEqual(custom.gates, {
    emojiGlyphs: { max: 2 },
    keepAll: { min: 0.5, whenLang: ['ko', 'ja'] },
    extra: { min: 1 },
  })
})

test('metricValue reads aggregate first, then source, and treats null or missing as absent', () => {
  const metrics = passingMetrics({ aggregate: { hangulKeepAllCoverage: null } })
  assert.equal(metricValue(metrics, 'contrastFailures'), 0)
  assert.equal(metricValue(metrics, 'literalRatio'), 0.0244)
  assert.equal(metricValue(metrics, 'hangulKeepAllCoverage'), null)
  assert.equal(metricValue(metrics, 'nope'), null)
  assert.equal(metricValue(passingMetrics({ source: null }), 'literalRatio'), null)
  assert.equal(metricValue(null, 'contrastFailures'), null)
})

test('a unit passes only when every gate holds; each failure names its gate and a missing metric fails closed', async () => {
  const [briefs, gates] = await Promise.all([briefsPromise, gatesPromise])
  const ko = briefs.find((brief) => brief.id === 'b01-fintech-home-ko')
  const en = briefs.find((brief) => brief.id === 'b02-saas-dashboard-en')

  const clean = gradeUnit({ metrics: passingMetrics(), brief: ko, gates })
  assert.equal(clean.pass, true)
  assert.deepEqual(clean.failures, [])
  assert.equal(clean.values.hangulKeepAllCoverage, 1)

  const failing = gradeUnit({
    metrics: passingMetrics({ aggregate: { contrastFailures: 2, hangulKeepAllCoverage: 0.9, fontFamilyCount: 3 } }),
    brief: ko,
    gates,
  })
  assert.equal(failing.pass, false)
  assert.deepEqual(
    failing.failures.map((failure) => [failure.gate, failure.code, failure.expected, failure.actual]),
    [
      ['contrastFailures', 'ABOVE_MAX', 0, 2],
      ['fontFamilyCount', 'ABOVE_MAX', 2, 3],
      ['hangulKeepAllCoverage', 'BELOW_MIN', 0.95, 0.9],
    ],
  )

  // b02 lifts fontFamilyCount to 3 and, being english, has no hangul gates at all.
  const overridden = gradeUnit({
    metrics: passingMetrics({ aggregate: { fontFamilyCount: 3, hangulTextNodes: 0, hangulKeepAllCoverage: null } }),
    brief: en,
    gates,
  })
  assert.equal(overridden.pass, true)

  const noSource = gradeUnit({ metrics: passingMetrics({ source: null }), brief: en, gates })
  assert.deepEqual(noSource.failures, [{ gate: 'literalRatio', code: 'MISSING_METRIC' }])

  const noHangul = gradeUnit({
    metrics: passingMetrics({ aggregate: { hangulTextNodes: 0, hangulKeepAllCoverage: null } }),
    brief: ko,
    gates,
  })
  assert.deepEqual(
    noHangul.failures.map((failure) => [failure.gate, failure.code]),
    [
      ['hangulKeepAllCoverage', 'MISSING_METRIC'],
      ['hangulTextNodes', 'BELOW_MIN'],
    ],
  )

  const rendererFailed = gradeUnit({
    metrics: passingMetrics({ errors: ['1280-dark: net::ERR_FAILED'] }),
    brief: ko,
    gates,
  })
  assert.deepEqual(
    rendererFailed.failures.map((failure) => failure.code),
    ['RENDER_ERRORS'],
  )

  const runFailed = gradeUnit({ metrics: passingMetrics(), brief: ko, gates, run: { errors: ['NO_MACHINE_REPORT'] } })
  assert.deepEqual(runFailed.failures, [{ code: 'RUN_ERRORS', errors: ['NO_MACHINE_REPORT'] }])

  const missing = gradeUnit({ metrics: null, brief: ko, gates, run: { errors: ['NO_OUTPUT', 'HOST_EXIT_1'] } })
  assert.deepEqual(
    missing.failures.map((failure) => failure.code),
    ['MISSING_METRICS', 'RUN_ERRORS'],
  )
})

test('replicates with distinct ids give pass^k and pass@k; repeats without ids are DUPLICATE_CASE', async () => {
  const [briefs, gates] = await Promise.all([briefsPromise, gatesPromise])
  const unit = (caseId, host, variant, replicateId, metrics = passingMetrics()) => ({
    caseId,
    host,
    variant,
    replicateId,
    metrics,
    run: null,
  })

  const graded = aggregate({
    units: [
      unit('b01-fintech-home-ko', 'claude', 'candidate', 'r1'),
      unit('b01-fintech-home-ko', 'claude', 'candidate', 'r2', passingMetrics({ aggregate: { contrastFailures: 1 } })),
      unit('b01-fintech-home-ko', 'claude', 'candidate', 'r3'),
      unit('b01-fintech-home-ko', 'claude', 'baseline', 'r1', passingMetrics({ aggregate: { emojiGlyphs: 3 } })),
      unit(
        'b01-fintech-home-ko',
        'claude',
        'baseline',
        'r2',
        passingMetrics({ aggregate: { emojiGlyphs: 1, longLines: 2 } }),
      ),
    ],
    briefs: briefs.filter((brief) => brief.id === 'b01-fintech-home-ko'),
    gates,
  })
  assert.deepEqual(graded.errors, [])
  assert.deepEqual(graded.coverage, {
    briefs: 1,
    hosts: ['claude'],
    variants: ['baseline', 'candidate'],
    units: 5,
    missing: [],
  })

  const candidate = graded.groups.find((group) => group.variant === 'candidate')
  assert.equal(candidate.replicateCount, 3)
  assert.equal(candidate.passedReplicates, 2)
  assert.equal(candidate.passK, false)
  assert.equal(candidate.passAtK, true)
  assert.deepEqual(candidate.gateFailures, { contrastFailures: 1 })
  assert.deepEqual(
    candidate.replicates.map((replicate) => [replicate.replicateId, replicate.pass]),
    [
      ['r1', true],
      ['r2', false],
      ['r3', true],
    ],
  )

  const baseline = graded.groups.find((group) => group.variant === 'baseline')
  assert.equal(baseline.passK, false)
  assert.equal(baseline.passAtK, false)
  assert.deepEqual(baseline.gateFailures, { emojiGlyphs: 2, longLines: 1 })

  assert.deepEqual(graded.byHost.claude.candidate.replicateCounts, [3])
  assert.equal(graded.byHost.claude.candidate.passK, 0)
  assert.equal(graded.byHost.claude.candidate.passAtK, 1)
  assert.deepEqual(graded.byHost.claude.baseline.gateFailures, { emojiGlyphs: 2, longLines: 1 })
  assert.deepEqual(graded.byHost.claude.baseline.metrics.emojiGlyphs, { n: 2, min: 1, max: 3, mean: 2 })

  const duplicated = aggregate({
    units: [
      unit('b01-fintech-home-ko', 'codex', 'baseline', null),
      unit('b01-fintech-home-ko', 'codex', 'baseline', null),
    ],
    briefs: briefs.filter((brief) => brief.id === 'b01-fintech-home-ko'),
    gates,
  })
  assert.match(duplicated.errors[0], /^DUPLICATE_CASE:b01-fintech-home-ko\/codex\/baseline \(2 units/)
  const group = duplicated.groups[0]
  assert.equal(group.duplicate, true)
  assert.equal(group.passK, false)
  assert.equal(group.passAtK, false)
  assert.deepEqual(group.gateFailures, { DUPLICATE_CASE: 2 })

  const sameIds = aggregate({
    units: [
      unit('b01-fintech-home-ko', 'codex', 'baseline', 'r1'),
      unit('b01-fintech-home-ko', 'codex', 'baseline', 'r1'),
    ],
    briefs: briefs.filter((brief) => brief.id === 'b01-fintech-home-ko'),
    gates,
  })
  assert.equal(sameIds.groups[0].duplicate, true)

  const single = aggregate({
    units: [unit('b01-fintech-home-ko', 'codex', 'baseline', null)],
    briefs: briefs.filter((brief) => brief.id === 'b01-fintech-home-ko'),
    gates,
  })
  assert.equal(single.groups[0].duplicate, false)
  assert.equal(single.groups[0].passK, true)
})

test('hosts and variants are graded apart, and every brief × host × variant without results is a missing group', async () => {
  const [briefs, gates] = await Promise.all([briefsPromise, gatesPromise])
  const unit = (caseId, host, variant, metrics = passingMetrics()) => ({
    caseId,
    host,
    variant,
    replicateId: 'r1',
    metrics,
    run: null,
  })

  const graded = aggregate({
    units: [
      unit('b02-saas-dashboard-en', 'claude', 'candidate'),
      unit('b02-saas-dashboard-en', 'codex', 'candidate', passingMetrics({ aggregate: { horizontalOverflow: 1 } })),
      unit('b04-commerce-pdp-en', 'claude', 'baseline'),
      unit('b99-unknown', 'claude', 'baseline'),
      {
        caseId: 'b02-saas-dashboard-en',
        host: null,
        variant: 'candidate',
        replicateId: 'r1',
        metrics: passingMetrics(),
        source: 'stray/metrics.json',
      },
    ],
    briefs: briefs.filter((brief) => ['b02-saas-dashboard-en', 'b04-commerce-pdp-en'].includes(brief.id)),
    gates,
  })
  assert.deepEqual(graded.errors, ['UNKNOWN_CASE:b99-unknown', 'UNIDENTIFIED_UNIT:stray/metrics.json'])
  assert.deepEqual(graded.coverage.hosts, ['claude', 'codex'])
  assert.deepEqual(graded.coverage.variants, ['baseline', 'candidate'])
  assert.equal(graded.groups.length, 8)
  assert.deepEqual(graded.coverage.missing, [
    { caseId: 'b02-saas-dashboard-en', host: 'claude', variant: 'baseline' },
    { caseId: 'b02-saas-dashboard-en', host: 'codex', variant: 'baseline' },
    { caseId: 'b04-commerce-pdp-en', host: 'claude', variant: 'candidate' },
    { caseId: 'b04-commerce-pdp-en', host: 'codex', variant: 'baseline' },
    { caseId: 'b04-commerce-pdp-en', host: 'codex', variant: 'candidate' },
  ])
  assert.equal(graded.byHost.claude.candidate.passK, 0.5)
  assert.equal(graded.byHost.codex.candidate.passK, 0)
  assert.deepEqual(graded.byHost.codex.candidate.gateFailures, { horizontalOverflow: 1, MISSING_CASE: 1 })
  assert.equal(Object.hasOwn(graded.byHost, 'all'), false)

  const scoped = aggregate({
    units: [unit('b02-saas-dashboard-en', 'claude', 'candidate')],
    briefs,
    gates,
    hosts: ['claude'],
    variants: ['candidate'],
  })
  assert.equal(scoped.groups.length, 8)
  assert.equal(scoped.coverage.missing.length, 7)
})

test('win rates are computed per host from candidate-vs-baseline judgments and never pooled', () => {
  const result = winRates([
    judgment({ briefId: 'b01-fintech-home-ko', winner: 'A' }),
    judgment({ briefId: 'b02-saas-dashboard-en', winner: 'A', positionBias: false, checkPass: { A: 9, B: 6 } }),
    judgment({ briefId: 'b03-marketing-landing-ko', winner: 'tie', positionBias: true }),
    // Sides swapped on disk: A is the baseline here, so a B win is a candidate win.
    judgment({ briefId: 'b04-commerce-pdp-en', a: 'baseline', b: 'candidate', winner: 'B', checkPass: { A: 4, B: 8 } }),
    judgment({ briefId: 'b01-fintech-home-ko', host: 'codex', winner: 'B' }),
    judgment({ briefId: 'b02-saas-dashboard-en', host: 'codex', winner: 'tie' }),
  ])
  assert.deepEqual(result.errors, [])
  assert.deepEqual(Object.keys(result.byHost), ['claude', 'codex'])

  const claude = result.byHost.claude
  assert.deepEqual([claude.judged, claude.wins, claude.ties, claude.losses], [4, 3, 1, 0])
  assert.equal(claude.winRate, 1)
  assert.equal(claude.winRateWithTies, 0.875)
  assert.equal(claude.positionBias, 1)
  assert.deepEqual(claude.checkPass, { candidate: 7.75, baseline: 5 })
  assert.deepEqual(claude.byBrief['b04-commerce-pdp-en'], { wins: 1, ties: 0, losses: 0 })
  assert.deepEqual(claude.judgedBriefs, [
    'b01-fintech-home-ko',
    'b02-saas-dashboard-en',
    'b03-marketing-landing-ko',
    'b04-commerce-pdp-en',
  ])

  const codex = result.byHost.codex
  assert.deepEqual([codex.judged, codex.wins, codex.ties, codex.losses], [2, 0, 1, 1])
  assert.equal(codex.winRate, 0)
  assert.equal(codex.winRateWithTies, 0.25)
  assert.equal(Object.hasOwn(result, 'overall'), false)
  assert.equal(Object.hasOwn(result.byHost, 'all'), false)

  const onlyTies = winRates([judgment({ briefId: 'b01-fintech-home-ko', winner: 'tie' })])
  assert.equal(onlyTies.byHost.claude.winRate, null)
  assert.equal(onlyTies.byHost.claude.winRateWithTies, 0.5)

  const renamed = winRates([judgment({ briefId: 'b01-fintech-home-ko', a: 'v0.4.0', b: 'v0.3.0', winner: 'A' })], {
    candidate: 'v0.4.0',
    baseline: 'v0.3.0',
  })
  assert.equal(renamed.byHost.claude.wins, 1)
  assert.equal(renamed.byHost.claude.candidate, 'v0.4.0')
})

test('judgments that cannot be attributed are reported as errors instead of counted', () => {
  const crossHost = judgment({ briefId: 'b01-fintech-home-ko', winner: 'A' })
  crossHost.b.host = 'codex'
  const result = winRates([
    judgment({ briefId: 'b01-fintech-home-ko', winner: 'A' }),
    judgment({ briefId: 'b01-fintech-home-ko', winner: 'B' }),
    {
      ...judgment({ briefId: 'b02-saas-dashboard-en', winner: 'A' }),
      file: 'b02-claude-r1.json',
      errors: ['JUDGE_NO_JSON; HOST_EXIT_1'],
    },
    judgment({ briefId: 'b03-marketing-landing-ko', a: 'candidate', b: 'candidate', winner: 'A' }),
    judgment({ briefId: 'b04-commerce-pdp-en', a: 'candidate', b: 'other', winner: 'A' }),
    crossHost,
    { briefId: 'b05-admin-form-ko', a: {}, b: {}, winner: 'A' },
    {
      briefId: 'b06-content-reading-en',
      a: { variant: 'candidate', host: 'claude' },
      b: { variant: 'baseline', host: 'claude' },
      winner: 'C',
    },
    null,
  ])
  assert.deepEqual(result.errors, [
    'DUPLICATE_JUDGMENT:b01-fintech-home-ko/claude/r1',
    'JUDGMENT_ERRORS:b02-claude-r1.json: JUDGE_NO_JSON; HOST_EXIT_1',
    'UNEXPECTED_PAIR:b03-marketing-landing-ko/claude/r1: candidate vs candidate',
    'UNEXPECTED_PAIR:b04-commerce-pdp-en/claude/r1: candidate vs other',
    'CROSS_HOST_PAIR:b01-fintech-home-ko/claude/r1',
    'UNKNOWN_HOST:b05-admin-form-ko/?/?',
    'INVALID_WINNER:b06-content-reading-en/?/?',
    'INVALID_JUDGMENT:null',
  ])
  assert.deepEqual([result.byHost.claude.wins, result.byHost.claude.losses], [1, 0])

  // The judge host is the fallback when meta.json gave no generator host.
  const judgeHostOnly = winRates([
    {
      briefId: 'b01-fintech-home-ko',
      a: { variant: 'candidate' },
      b: { variant: 'baseline' },
      host: 'codex',
      winner: 'B',
    },
  ])
  assert.deepEqual(Object.keys(judgeHostOnly.byHost), ['codex'])
  assert.equal(judgeHostOnly.byHost.codex.losses, 1)
})

test('the cli grades a fixture tree, writes summary.json and summary.md per host, and is authoritative only for a full corpus', async (t) => {
  const briefs = await briefsPromise
  const root = await tempDirectory(t)
  const runs = join(root, 'runs.jsonl')
  const judgments = join(root, 'judgments')
  const outside = await tempDirectory(t)
  await writeFile(join(outside, 'metrics.json'), JSON.stringify(passingMetrics()))
  await mkdir(judgments, { recursive: true })

  const lines = []
  async function fixture({ caseId, variant, host, replicateId, metrics, meta = true, run = true }) {
    const dir = join(root, caseId, variant, host, replicateId)
    await mkdir(join(dir, '.claude/skills'), { recursive: true })
    // A symlinked exposure directory must never be walked for metrics.
    await symlink(outside, join(dir, '.claude/skills/frontend-interface-design'), 'dir')
    if (metrics) await writeFile(join(dir, 'metrics.json'), JSON.stringify(metrics))
    if (meta)
      await writeFile(join(dir, 'meta.json'), JSON.stringify({ caseId, variant, host, replicateId, lang: 'ko' }))
    if (run)
      lines.push(
        JSON.stringify({
          caseId,
          variant,
          host,
          replicateId,
          dir,
          outputExists: Boolean(metrics),
          errors: metrics ? [] : ['NO_OUTPUT'],
        }),
      )
  }
  await fixture({
    caseId: 'b01-fintech-home-ko',
    variant: 'candidate',
    host: 'claude',
    replicateId: 'r1',
    metrics: passingMetrics(),
  })
  await fixture({
    caseId: 'b01-fintech-home-ko',
    variant: 'candidate',
    host: 'claude',
    replicateId: 'r2',
    metrics: passingMetrics({ aggregate: { tinyText: 2 } }),
    meta: false,
  })
  await fixture({
    caseId: 'b01-fintech-home-ko',
    variant: 'baseline',
    host: 'claude',
    replicateId: 'r1',
    metrics: null,
  })
  await fixture({
    caseId: 'b01-fintech-home-ko',
    variant: 'baseline',
    host: 'claude',
    replicateId: 'r2',
    metrics: passingMetrics({ aggregate: { emojiGlyphs: 4 } }),
    meta: false,
    run: false,
  })
  await writeFile(runs, `${lines.join('\n')}\n`)
  await writeFile(
    join(judgments, 'b01-claude-r1.json'),
    JSON.stringify(judgment({ briefId: 'b01-fintech-home-ko', winner: 'A' })),
  )
  await writeFile(
    join(judgments, 'b01-claude-r2.json'),
    JSON.stringify(judgment({ briefId: 'b01-fintech-home-ko', replicateId: 'r2', winner: 'tie' })),
  )
  await writeFile(join(judgments, 'notes.json'), JSON.stringify({ note: 'not a judgment' }))
  const out = join(root, 'summary')

  const partial = spawnSync(
    process.execPath,
    [grader, '--runs', runs, '--metrics', root, '--judgments', judgments, '--out', out],
    { encoding: 'utf8' },
  )
  assert.equal(partial.status, 1, partial.stderr)
  assert.match(
    partial.stdout,
    /^NON_AUTHORITATIVE_PARTIAL — claude: baseline pass\^k 0%, candidate pass\^k 0%; winRate 100% \(1W 1T 0L\)/,
  )
  const summary = JSON.parse(await readFile(join(out, 'summary.json'), 'utf8'))
  assert.equal(summary.authoritative, false)
  assert.equal(summary.coverage.units, 4)
  assert.equal(summary.coverage.missing.length, 14)
  assert.equal(summary.judgments, 2)
  assert.deepEqual(summary.errors, [])
  const candidate = summary.groups.find(
    (group) => group.caseId === 'b01-fintech-home-ko' && group.variant === 'candidate',
  )
  assert.deepEqual(
    candidate.replicates.map((replicate) => [replicate.replicateId, replicate.pass]),
    [
      ['r1', true],
      ['r2', false],
    ],
  )
  assert.equal(candidate.passAtK, true)
  const baseline = summary.groups.find(
    (group) => group.caseId === 'b01-fintech-home-ko' && group.variant === 'baseline',
  )
  assert.deepEqual(baseline.gateFailures, { MISSING_METRICS: 1, RUN_ERRORS: 1, emojiGlyphs: 1 })
  assert.equal(summary.winRates.byHost.claude.winRateWithTies, 0.75)
  assert.equal(Object.hasOwn(summary.winRates.byHost, 'codex'), false)

  const markdown = await readFile(join(out, 'summary.md'), 'utf8')
  assert.match(markdown, /^# frontend-interface-design — harness summary/)
  assert.match(markdown, /## claude\n\n### Gates — pass\^k \/ pass@k per brief\n\n\| brief \| baseline \| candidate \|/)
  assert.match(
    markdown,
    /\| b01-fintech-home-ko \| pass\^k 0\/2 · pass@k no · emojiGlyphs×1, MISSING_METRICS×1, RUN_ERRORS×1 \| pass\^k 1\/2 · pass@k yes · tinyText×1 \|/,
  )
  assert.match(
    markdown,
    /\| baseline \| 0\/8 \(0%\) \| 0\/8 \(0%\) \| 2 \| MISSING_CASE×7, emojiGlyphs×1, MISSING_METRICS×1, RUN_ERRORS×1 \|/,
  )
  assert.match(markdown, /\| b02-saas-dashboard-en \| MISSING \| MISSING \|/)
  assert.match(
    markdown,
    /### Judge — candidate vs baseline\n\n\| judged \| wins \| ties \| losses \| winRate \| winRateWithTies \| positionBias \|/,
  )
  assert.match(markdown, /\| 2 \| 1 \| 1 \| 0 \| 100% \| 75% \| 0 \|/)
  assert.equal((markdown.match(/^## /gm) ?? []).length, 2, 'one host section plus errors')
  assert.equal(renderMarkdown(summary, briefs), markdown)

  // Every brief × host × variant present, no judgments requested → authoritative and exit 0.
  const full = await tempDirectory(t)
  for (const brief of briefs) {
    const dir = join(full, brief.id, 'baseline', 'codex', 'r1')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'metrics.json'),
      JSON.stringify(passingMetrics({ aggregate: { longLines: brief.lang === 'en' ? 1 : 0 } })),
    )
  }
  const complete = spawnSync(process.execPath, [grader, '--metrics', full, '--out', join(full, 'summary')], {
    encoding: 'utf8',
  })
  assert.equal(complete.status, 0, complete.stderr)
  assert.match(complete.stdout, /^AUTHORITATIVE_FULL_CORPUS — codex: baseline pass\^k 50%; no judgments/)
  const fullSummary = JSON.parse(await readFile(join(full, 'summary/summary.json'), 'utf8'))
  assert.equal(fullSummary.authoritative, true)
  assert.deepEqual(fullSummary.coverage.hosts, ['codex'])
  assert.deepEqual(fullSummary.byHost.codex.baseline.gateFailures, { longLines: 4 })

  const usage = spawnSync(process.execPath, [grader], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /^USAGE: grade-results\.mjs/)
})
