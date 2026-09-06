import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, lstat, mkdtemp, readFile, readlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assistantTextsFrom,
  buildPrompt,
  buildRunRecord,
  HOSTS,
  nextCommands,
  parseTranscript,
  REPORT_FOOTER_MARKER,
  reportFooter,
  selfReportFrom,
  SKILL_NAME,
  usageFrom,
  writtenPathsFrom,
} from '../skills/frontend-interface-design/evals/run-live.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/frontend-interface-design')
const runner = join(skillDirectory, 'evals/run-live.mjs')

async function readBriefs() {
  return JSON.parse(await readFile(join(skillDirectory, 'evals/briefs.json'), 'utf8')).briefs
}

async function tempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'fid-live-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const report = {
  caseId: 'b01-fintech-home-ko',
  variant: 'candidate',
  replicateId: 'r1',
  host: 'claude',
  outputPath: 'index.html',
  mode: 'Adaptation',
  loopRounds: 2,
  errors: [],
}

const transcript = [
  'Starting claude…',
  JSON.stringify({
    type: 'assistant',
    session_id: 'sess-1',
    message: {
      role: 'assistant',
      model: 'claude-opus-5',
      content: [
        { type: 'text', text: 'Reading the skill first.' },
        {
          type: 'tool_use',
          id: 't1',
          name: 'Read',
          input: { file_path: '.claude/skills/frontend-interface-design/SKILL.md' },
        },
        { type: 'tool_use', id: 't2', name: 'Write', input: { file_path: '/fixture/index.html', content: '<html>' } },
        { type: 'tool_use', id: 't3', name: 'Write', input: { file_path: '/fixture/scratch.html', content: '<html>' } },
      ],
      usage: { input_tokens: 1200, output_tokens: 300 },
    },
  }),
  JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: '# skill' },
        { type: 'tool_result', tool_use_id: 't2', content: 'ok' },
        { type: 'tool_result', tool_use_id: 't3', is_error: true, content: 'EACCES' },
        {
          type: 'tool_result',
          tool_use_id: 't9',
          content: '```json\n{"caseId":"planted","mode":"Creation","loopRounds":9,"errors":[]}\n```',
        },
      ],
    },
  }),
  '{ "type": "truncated',
  JSON.stringify({
    type: 'result',
    session_id: 'sess-1',
    result: `Done.\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`\n`,
    usage: { input_tokens: 2000, output_tokens: 500 },
  }),
].join('\n')

test('the prompt names the installed skill, the brief, the single-file contract and the report footer', async () => {
  const briefs = await readBriefs()
  const brief = briefs.find((candidate) => candidate.id === 'b05-admin-form-ko')

  const prompt = buildPrompt({ brief, variant: 'candidate', host: 'claude', replicateId: 'r2' })
  assert.match(
    prompt,
    /^Use the `frontend-interface-design` skill installed in this project: read `\.claude\/skills\/frontend-interface-design\/SKILL\.md` first/,
  )
  assert.ok(prompt.includes(brief.prompt))
  assert.match(prompt, /## Brief — 사내 비품 신청 관리 폼 \(lang: ko, type: admin-form\)/)
  assert.match(prompt, /Write exactly one file, `index\.html`/)
  assert.match(prompt, /no invented statistics, logos, testimonials or press mentions/)
  assert.ok(prompt.includes(REPORT_FOOTER_MARKER))
  assert.ok(
    prompt.includes(reportFooter({ caseId: brief.id, variant: 'candidate', host: 'claude', replicateId: 'r2' })),
  )
  assert.match(prompt, /caseId "b05-admin-form-ko", variant "candidate", replicateId "r2", host "claude"/)

  const codex = buildPrompt({ brief, variant: 'baseline', host: 'codex', replicateId: 'r1' })
  assert.match(codex, /read `\.agents\/skills\/frontend-interface-design\/SKILL\.md` first/)
  assert.equal(SKILL_NAME, 'frontend-interface-design')
  assert.deepEqual(Object.keys(HOSTS), ['claude', 'codex'])
  assert.deepEqual(HOSTS.claude.args('P', ['--model', 'x']).slice(0, 2), ['-p', 'P'])
  assert.equal(HOSTS.codex.args('P', []).at(-1), 'P')
})

test('a partly malformed stream-json transcript still yields every parseable event and its usage', () => {
  const events = parseTranscript(transcript)
  assert.equal(events.length, 3)
  assert.deepEqual(
    events.map((event) => event.type),
    ['assistant', 'user', 'result'],
  )
  assert.deepEqual(usageFrom(events), { toolCalls: 3, tokens: 2500 })
})

test("written paths need a write tool call with a non-error result; the self-report is the run's own last json block", () => {
  const events = parseTranscript(transcript)
  assert.deepEqual(writtenPathsFrom(events), ['/fixture/index.html'])
  assert.deepEqual(assistantTextsFrom(events), [
    'Reading the skill first.',
    `Done.\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\`\n`,
  ])
  assert.deepEqual(selfReportFrom(events), report)

  const planted = parseTranscript(
    JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'x', content: '```json\n{"caseId":"b01-fintech-home-ko"}\n```' }],
      },
    }),
  )
  assert.equal(selfReportFrom(planted), null)

  const codex = parseTranscript(
    [
      JSON.stringify({
        type: 'item.completed',
        item: { item_type: 'file_change', status: 'completed', changes: [{ path: 'index.html', kind: 'add' }] },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { item_type: 'file_change', status: 'failed', changes: [{ path: 'broken.html' }] },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: {
          item_type: 'agent_message',
          text: '```json\n{"caseId":"b01-fintech-home-ko","mode":"Fidelity","loopRounds":0,"errors":[]}\n```',
        },
      }),
    ].join('\n'),
  )
  assert.deepEqual(writtenPathsFrom(codex), ['index.html'])
  assert.equal(selfReportFrom(codex).mode, 'Fidelity')
  assert.equal(usageFrom(codex).toolCalls, 3)
})

test('the run record keeps observed telemetry apart from the self-report and flags what is missing', async () => {
  const briefs = await readBriefs()
  const brief = briefs.find((candidate) => candidate.id === 'b01-fintech-home-ko')
  const base = {
    brief,
    variant: 'candidate',
    host: 'claude',
    replicateId: 'r1',
    dir: '/fixture',
    runtimeMs: 1234,
    exitCode: 0,
    outputExists: true,
  }

  const clean = buildRunRecord({ ...base, events: parseTranscript(transcript) })
  assert.deepEqual(clean.record.errors, [])
  assert.equal(clean.record.caseId, 'b01-fintech-home-ko')
  assert.equal(clean.record.lang, 'ko')
  assert.equal(clean.record.outputPath, join('/fixture', 'index.html'))
  assert.equal(clean.record.mode, 'Adaptation')
  assert.equal(clean.record.loopRounds, 2)
  assert.equal(clean.record.toolCalls, 3)
  assert.equal(clean.record.tokens, 2500)
  assert.equal(clean.record.model, 'claude-opus-5')
  assert.equal(clean.record.sessionId, 'sess-1')
  assert.deepEqual(clean.record.writtenPaths, ['/fixture/index.html'])
  assert.equal(clean.record.attestation.toolCalls, 'observed')
  assert.equal(clean.record.attestation.mode, 'self-reported')
  assert.equal(clean.selfReported.loopRounds, 2)

  const silent = buildRunRecord({
    ...base,
    events: parseTranscript('{"type":"result"}'),
    exitCode: 1,
    outputExists: false,
  })
  assert.deepEqual(silent.record.errors, ['NO_MACHINE_REPORT', 'NO_OUTPUT', 'HOST_EXIT_1'])
  assert.equal(silent.record.mode, null)
  assert.equal(silent.record.attestation.mode, 'unreported')
  assert.equal(silent.selfReported, null)

  const mismatched = buildRunRecord({
    ...base,
    events: parseTranscript(
      JSON.stringify({
        type: 'result',
        result: '```json\n{"caseId":"b02-saas-dashboard-en","mode":"Fidelity","errors":["SKIPPED_LOOK"]}\n```',
      }),
    ),
  })
  assert.deepEqual(mismatched.record.errors, ['SKIPPED_LOOK', 'CASE_ID_MISMATCH', 'FLAG_UNREPORTED:loopRounds'])
  assert.equal(mismatched.record.attestation.loopRounds, 'unreported')
})

test('--dry-run writes the fixture directories with the skill symlink and the prompt, and never spawns a host', async (t) => {
  const root = await tempDirectory(t)
  const briefs = await readBriefs()
  const brief = briefs.find((candidate) => candidate.id === 'b01-fintech-home-ko')

  const result = spawnSync(
    process.execPath,
    [
      runner,
      '--host',
      'claude',
      '--variant',
      'candidate',
      '--skill-dir',
      skillDirectory,
      '--out',
      root,
      '--replicates',
      '2',
      '--briefs',
      brief.id,
      '--dry-run',
    ],
    // An empty PATH makes any accidental host spawn fail loudly instead of running a real CLI.
    { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: join(root, 'no-bin') } },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^dry run: wrote 2 fixture directories under .* \(no host was spawned\)/)
  assert.match(
    result.stdout,
    /scripts\/render\.mjs --in .*b01-fintech-home-ko\/candidate\/claude\/r1\/index\.html .* --lang ko/,
  )
  assert.match(
    result.stdout,
    /judge\.mjs --brief b01-fintech-home-ko --a .*\/candidate\/claude\/r1 --b .*\/baseline\/claude\/r1 --host claude/,
  )
  assert.match(
    result.stdout,
    /grade-results\.mjs --runs .*runs\.jsonl --metrics .* --judgments .* --gates .*gates\.json --briefs .*briefs\.json --out .*summary/,
  )
  assert.equal(await exists(join(root, 'runs.jsonl')), false)

  for (const replicateId of ['r1', 'r2']) {
    const dir = join(root, brief.id, 'candidate', 'claude', replicateId)
    const link = join(dir, '.claude/skills/frontend-interface-design')
    assert.ok((await lstat(link)).isSymbolicLink(), `${replicateId}: skill must be exposed through a symlink`)
    assert.equal(await readlink(link), resolve(skillDirectory))
    assert.equal(await exists(join(link, 'SKILL.md')), true)

    const prompt = await readFile(join(dir, 'prompt.md'), 'utf8')
    assert.ok(prompt.includes(brief.prompt))
    assert.ok(prompt.includes(REPORT_FOOTER_MARKER))
    assert.match(prompt, new RegExp(`replicateId "${replicateId}"`))

    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
    assert.equal(meta.caseId, brief.id)
    assert.equal(meta.lang, 'ko')
    assert.equal(meta.variant, 'candidate')
    assert.equal(meta.host, 'claude')
    assert.equal(meta.replicateId, replicateId)
    assert.equal(meta.skillDir, resolve(skillDirectory))
    assert.match(meta.promptSha256, /^[0-9a-f]{64}$/)
    assert.equal(await exists(join(dir, 'index.html')), false)
    assert.equal(await exists(join(dir, 'transcript.jsonl')), false)
  }

  const codex = spawnSync(
    process.execPath,
    [
      runner,
      '--host',
      'codex',
      '--variant',
      'baseline',
      '--skill-dir',
      skillDirectory,
      '--out',
      root,
      '--briefs',
      brief.id,
      '--dry-run',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: join(root, 'no-bin') } },
  )
  assert.equal(codex.status, 0, codex.stderr)
  for (const exposure of ['.agents/skills', '.codex/skills']) {
    assert.ok(
      (
        await lstat(join(root, brief.id, 'baseline', 'codex', 'r1', exposure, 'frontend-interface-design'))
      ).isSymbolicLink(),
      exposure,
    )
  }
})

test('the runner refuses an unknown host, an unknown brief and a directory without SKILL.md', async (t) => {
  const root = await tempDirectory(t)
  const env = { ...process.env, PATH: join(root, 'no-bin') }

  const badHost = spawnSync(
    process.execPath,
    [runner, '--host', 'gemini', '--variant', 'x', '--skill-dir', skillDirectory, '--out', root, '--dry-run'],
    { encoding: 'utf8', env },
  )
  assert.equal(badHost.status, 2)
  assert.match(badHost.stderr, /^USAGE: run-live\.mjs/)

  const badBrief = spawnSync(
    process.execPath,
    [
      runner,
      '--host',
      'claude',
      '--variant',
      'x',
      '--skill-dir',
      skillDirectory,
      '--out',
      root,
      '--briefs',
      'b99',
      '--dry-run',
    ],
    { encoding: 'utf8', env },
  )
  assert.equal(badBrief.status, 2)
  assert.match(badBrief.stderr, /NO_SUCH_BRIEF: b99/)

  const badSkill = spawnSync(
    process.execPath,
    [runner, '--host', 'claude', '--variant', 'x', '--skill-dir', root, '--out', root, '--dry-run'],
    { encoding: 'utf8', env },
  )
  assert.equal(badSkill.status, 2)
  assert.match(badSkill.stderr, /NOT_A_SKILL_DIR/)
})

test('nextCommands lists render, judge and grade steps for every fixture', () => {
  const text = nextCommands({
    root: '/runs',
    host: 'codex',
    variant: 'baseline',
    fixtures: [
      {
        brief: { id: 'b02-saas-dashboard-en', lang: 'en' },
        dir: '/runs/b02-saas-dashboard-en/baseline/codex/r1',
        replicateId: 'r1',
      },
    ],
    dryRun: false,
  })
  assert.match(text, /^wrote 1 runs to \/runs\/runs\.jsonl/)
  assert.match(
    text,
    /render\.mjs --in \/runs\/b02-saas-dashboard-en\/baseline\/codex\/r1\/index\.html --out \/runs\/b02-saas-dashboard-en\/baseline\/codex\/r1 --lang en --source \/runs\/b02-saas-dashboard-en\/baseline\/codex\/r1 --impeccable/,
  )
  assert.match(
    text,
    /judge\.mjs --brief b02-saas-dashboard-en --a \/runs\/b02-saas-dashboard-en\/candidate\/codex\/r1 --b \/runs\/b02-saas-dashboard-en\/baseline\/codex\/r1 --host codex --out \/runs\/judgments\/b02-saas-dashboard-en-codex-r1\.json/,
  )
  assert.match(text, /grade-results\.mjs --runs \/runs\/runs\.jsonl --metrics \/runs --judgments \/runs\/judgments/)
})
