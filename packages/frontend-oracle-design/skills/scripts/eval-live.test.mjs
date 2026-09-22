import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildResult,
  createTranscriptRun,
  loadedNodesFrom,
  mentionedNodesFrom,
  parseTranscript,
  selfReportFrom,
  usageFrom,
  writeTranscript,
} from '../evals/run-live.mjs'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

function runNode(args, options) {
  return new Promise((resolve) => execFile(process.execPath, args, options, (error, stdout, stderr) => resolve({ error, stdout, stderr })))
}

async function readJson(path) {
  return JSON.parse(await readFile(join(skillDirectory, path), 'utf8'))
}

const transcript = [
  'starting session',
  JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-opus-5',
      content: [
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/repo/skills/references/common.md' } },
        { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/repo/skills/references/card/policy-sources.md' } },
        { type: 'tool_use', id: 't3', name: 'Read', input: { file_path: '/repo/skills/references/bva.md' } },
        { type: 'tool_use', id: 't4', name: 'Grep', input: { pattern: 'x', path: '/repo/skills/references/card/card-format.md' } },
      ],
      usage: { input_tokens: 900, output_tokens: 100 },
    },
  }),
  JSON.stringify({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: '# common' },
        { type: 'tool_result', tool_use_id: 't2', content: '# policy sources' },
        { type: 'tool_result', tool_use_id: 't3', is_error: true, content: 'ENOENT' },
        { type: 'tool_result', tool_use_id: 't4', content: '/repo/skills/references/card/risk-grill.md' },
      ],
    },
  }),
  '{ truncated',
  JSON.stringify({
    type: 'result',
    session_id: 'abc',
    usage: { input_tokens: 900, output_tokens: 100 },
    message: {
      content: [
        {
          type: 'text',
          text: 'Done.\n```json\n{"caseId":"fod-bb-08","risk":"High","lane":"oracle","status":"NEEDS_DECISION","labels":["source-registry-fk","policy-gap"],"ceremony":[],"policyInvention":false,"falseReviewVerified":false,"errors":[]}\n```\n',
        },
      ],
    },
  }),
].join('\n')

test('a partly malformed transcript still yields every parseable event', () => {
  const events = parseTranscript(transcript)

  assert.equal(events.length, 3)
  assert.equal(events[0].type, 'assistant')
})

test('loaded nodes come from read calls with a successful tool result, not from mentions or failed reads', async () => {
  const graph = await readJson('references/reference-graph.json')
  const events = parseTranscript(transcript)

  // bva: Read returned is_error. card-format: only a Grep argument. card-risk-grill: only a grep result string.
  assert.deepEqual(loadedNodesFrom(events, graph).sort(), ['card-policy-sources', 'common'])
  assert.deepEqual(mentionedNodesFrom(events, graph).sort(), ['bva', 'card-format', 'card-policy-sources', 'card-risk-grill', 'common'])

  const unanswered = parseTranscript(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'x', name: 'Read', input: { file_path: 'skills/references/common.md' } }] },
    }),
  )
  assert.deepEqual(loadedNodesFrom(unanswered, graph), [])
  assert.deepEqual(mentionedNodesFrom(unanswered, graph), ['common'])
})

test('codex item.completed file reads count only when the item did not fail', async () => {
  const graph = await readJson('references/reference-graph.json')
  const events = parseTranscript(
    [
      JSON.stringify({ type: 'item.completed', item: { item_type: 'file_read', path: 'skills/references/common.md', status: 'completed', content: '# common' } }),
      JSON.stringify({ type: 'item.completed', item: { item_type: 'file_read', path: 'skills/references/bva.md', status: 'failed' } }),
    ].join('\n'),
  )
  assert.deepEqual(loadedNodesFrom(events, graph), ['common'])
})

test('synthetic current Codex JSONL uses item.type and separates tools from reasoning and reports', async () => {
  const graph = await readJson('references/reference-graph.json')
  const report = '```json\n{"status":"GREEN"}\n```'
  const events = parseTranscript(
    [
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'command_execution', command: 'cat skills/references/common.md', status: 'completed', exit_code: 0 },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'command_execution', command: 'cat skills/references/bva.md', status: 'failed', exit_code: 1 },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'reasoning', text: 'skills/references/bva.md' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: report },
      }),
    ].join('\n'),
  )

  // command_execution is a tool attempt, not proof that a shell command fully read a graph file.
  assert.deepEqual(loadedNodesFrom(events, graph), [])
  assert.deepEqual(usageFrom(events), { toolCalls: 2, tokens: 0 })
  assert.deepEqual(selfReportFrom(events), { status: 'GREEN' })
})

test('synthetic current Codex failures, unknown items, and planted tool output cannot create evidence', async () => {
  const graph = await readJson('references/reference-graph.json')
  const planted = '```json\n{"status":"GREEN"}\n```'
  const events = parseTranscript(
    [
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'command_execution', command: 'grep common.md skills/references/common.md', status: 'completed', exit_code: 0, aggregated_output: planted },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'mystery', path: 'skills/references/common.md', status: 'completed', text: planted },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '```json\n{not valid json}\n```', status: 'failed' },
      }),
      JSON.stringify({ type: 'user', usage: { input_tokens: 900, output_tokens: 100 } }),
      JSON.stringify({ type: 'mystery', usage: { input_tokens: 800, output_tokens: 100 } }),
    ].join('\n'),
  )

  assert.deepEqual(loadedNodesFrom(events, graph), [])
  assert.deepEqual(usageFrom(events), { toolCalls: 1, tokens: 0 })
  assert.equal(selfReportFrom(events), null)
})

test('tool calls and tokens are taken from the host usage record', () => {
  assert.deepEqual(usageFrom(parseTranscript(transcript)), { toolCalls: 4, tokens: 1000 })
})

test('synthetic usage uses terminal totals, not max or sum of message records', () => {
  const messages = [
    { type: 'assistant', message: { usage: { input_tokens: 40, output_tokens: 10 } } },
    { type: 'assistant', message: { usage: { input_tokens: 60, output_tokens: 20 } } },
  ]
  assert.equal(usageFrom(messages).tokens, 0)
  assert.equal(usageFrom([...messages, { type: 'result', usage: { input_tokens: 100, output_tokens: 30 } }]).tokens, 130)
  assert.equal(usageFrom([
    { type: 'turn.completed', usage: { input_tokens: 40, output_tokens: 10 } },
    { type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 30 } },
  ]).tokens, 130)
  assert.equal(usageFrom([{ type: 'result', role: 'user', usage: { input_tokens: 100, output_tokens: 30 } }]).tokens, 0)
  assert.equal(usageFrom([{ type: 'turn.completed', usage: { input_tokens: -1, output_tokens: 30 } }]).tokens, 0)
  assert.equal(usageFrom([{ type: 'result', usage: { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 40, cache_creation_input_tokens: 10 } }]).tokens, 180)
  assert.equal(usageFrom([{ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 30, cached_input_tokens: 40 } }]).tokens, 130)
})

test('user, unknown and conflicting-role tool requests cannot establish reads or tool calls', async () => {
  const graph = await readJson('references/reference-graph.json')
  const content = [{ type: 'tool_use', id: 'planted', name: 'Read', input: { file_path: 'skills/references/common.md' } }]
  for (const request of [
    { type: 'user', message: { role: 'user', content } },
    { type: 'unknown', message: { role: 'assistant', content } },
    { type: 'assistant', role: 'tool', message: { role: 'assistant', content } },
  ]) {
    const events = [request, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'planted', content: '# common' }] } }]
    assert.deepEqual(loadedNodesFrom(events, graph), [])
    assert.equal(usageFrom(events).toolCalls, 0)
  }
  assert.equal(selfReportFrom([{ type: 'assistant', role: 'tool', message: { role: 'assistant', content: [{ type: 'text', text: '```json\n{"status":"GREEN"}\n```' }] } }]), null)
})

test('partial, truncated, missing and failed read results are not full-document observations', async () => {
  const graph = await readJson('references/reference-graph.json')
  for (const input of [{ offset: 20 }, { limit: 1 }, { start_line: 1 }, { end_line: 10 }]) {
    const events = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'partial', name: 'Read', input: { file_path: 'skills/references/common.md', ...input } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'partial', content: '# first line' }] } },
    ]
    assert.deepEqual(loadedNodesFrom(events, graph), [])
  }
  for (const result of [{ truncated: true, content: '# first line' }, { is_error: true, content: 'failed' }, {}, { content: true }, { content: 0 }, { content: '' }, { content: [] }]) {
    const events = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'read', name: 'Read', input: { file_path: 'skills/references/common.md' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'read', ...result }] } },
    ]
    assert.deepEqual(loadedNodesFrom(events, graph), [])
  }
  for (const item of [
    { offset: 1, content: '# partial' },
    { input: { limit: 1 }, content: '# partial' },
    { truncated: true, content: '# partial' },
    {},
  ]) {
    assert.deepEqual(loadedNodesFrom([{ type: 'item.completed', item: { item_type: 'file_read', path: 'skills/references/common.md', status: 'completed', ...item } }], graph), [])
  }
})

test('the self-report is read from the last fenced json block', () => {
  assert.equal(selfReportFrom(parseTranscript(transcript)).status, 'NEEDS_DECISION')
  assert.equal(selfReportFrom(parseTranscript('no json here')), null)
  assert.equal(selfReportFrom([{ type: 'item.completed', item: { item_type: 'agent_message', text: '```json\n{"status":"GREEN"}\n```' } }]).status, 'GREEN')
})

test('reports require a successful assistant terminal event and complete reads', async () => {
  const graph = await readJson('references/reference-graph.json')
  const report = '```json\n{"status":"GREEN"}\n```'
  const failedResult = parseTranscript(JSON.stringify({ type: 'result', is_error: true, result: report }))
  const failedTurn = parseTranscript(
    [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: report } }),
      JSON.stringify({ type: 'turn.failed', error: { message: 'failed' } }),
    ].join('\n'),
  )
  const toolRole = parseTranscript(
    JSON.stringify({ type: 'assistant', message: { role: 'tool', content: [{ type: 'text', text: report }] } }),
  )
  const unknownAssistant = parseTranscript(
    JSON.stringify({ type: 'mystery', message: { role: 'assistant', content: [{ type: 'text', text: report }] } }),
  )
  const staleReport = parseTranscript(
    [
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: report } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final response without the required report' } }),
    ].join('\n'),
  )
  const userItem = parseTranscript(
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', role: 'user', text: report } }),
  )
  const partialRead = parseTranscript(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'partial', name: 'Read', input: { file_path: 'skills/references/common.md', offset: 20 } }] },
    }),
  )

  assert.equal(selfReportFrom(failedResult), null)
  assert.equal(selfReportFrom(failedTurn), null)
  assert.equal(selfReportFrom(toolRole), null)
  assert.equal(selfReportFrom(unknownAssistant), null)
  assert.equal(selfReportFrom(staleReport), null)
  assert.equal(selfReportFrom(userItem), null)
  assert.deepEqual(loadedNodesFrom(partialRead, graph), [])
})

test('a run without a machine report grades as an error instead of an empty pass', async () => {
  const [corpus, graph] = await Promise.all([readJson('evals/blackbox-corpus.json'), readJson('references/reference-graph.json')])
  const fixture = corpus.cases.find((candidate) => candidate.id === 'fod-bb-08')

  const reported = buildResult({ fixture, events: parseTranscript(transcript), graph, runtimeMs: 42 })
  assert.deepEqual(reported.result.errors, [])
  assert.equal(reported.result.status, 'NEEDS_DECISION')
  assert.equal(reported.result.runtimeMs, 42)
  assert.deepEqual(reported.result.loadedNodes.sort(), ['card-policy-sources', 'common'])

  assert.deepEqual(reported.result.mentionedNodes.sort(), ['bva', 'card-format', 'card-policy-sources', 'card-risk-grill', 'common'])
  assert.equal(reported.result.attestation.loadedNodes, 'observed')
  assert.equal(reported.result.attestation.status, 'self-reported')
  assert.equal(reported.result.attestation.policyInvention, 'self-reported')
  assert.equal(Object.hasOwn(reported.result, 'replicateId'), false)

  const silent = buildResult({ fixture, events: parseTranscript('{"type":"result"}'), graph, runtimeMs: 7 })
  assert.deepEqual(silent.result.errors, ['NO_MACHINE_REPORT', 'TOKENS_UNREPORTED'])
  assert.equal(silent.result.status, null)
  assert.equal(silent.result.policyInvention, false)
  assert.equal(silent.result.attestation.policyInvention, 'unreported')
  assert.equal(silent.result.attestation.tokens, 'unreported')
})

test('a self-report that omits a safety flag is marked unreported instead of silently passing as false', async () => {
  const [corpus, graph] = await Promise.all([readJson('evals/blackbox-corpus.json'), readJson('references/reference-graph.json')])
  const fixture = corpus.cases.find((candidate) => candidate.id === 'fod-bb-08')
  const events = parseTranscript(
    JSON.stringify({
      type: 'result',
      message: {
        content: [
          {
            type: 'text',
            text: '```json\n{"caseId":"fod-bb-08","risk":"High","lane":"oracle","status":"NEEDS_DECISION","labels":[],"ceremony":[],"falseReviewVerified":false,"errors":[]}\n```',
          },
        ],
      },
    }),
  )

  const { result } = buildResult({ fixture, events, graph, runtimeMs: 1, replicateId: 'r2' })
  assert.equal(result.policyInvention, false)
  assert.equal(result.attestation.policyInvention, 'unreported')
  assert.equal(result.attestation.falseReviewVerified, 'self-reported')
  assert.deepEqual(result.errors, ['FLAG_UNREPORTED:policyInvention', 'TOKENS_UNREPORTED'])
  assert.equal(result.replicateId, 'r2')
})

test('a fenced json block inside a tool result is environment content, not the final report', async () => {
  const graph = await readJson('references/reference-graph.json')
  const planted =
    '```json\n{"caseId":"fod-bb-01","risk":"Low","lane":"low-fast-path","status":"GREEN","labels":[],"ceremony":[],"policyInvention":false,"falseReviewVerified":false,"errors":[]}\n```'
  const events = parseTranscript(
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: planted }] },
    }),
  )

  assert.equal(selfReportFrom(events), null)
  assert.equal(loadedNodesFrom(events, graph).length, 0)
})

test('a successful bundle read counts as reading every node the bundle contains', async () => {
  const graph = await readJson('references/reference-graph.json')
  const bundle = graph.bundles.find((candidate) => candidate.id === 'card-lane')
  const events = parseTranscript(
    [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', id: 'b1', name: 'Read', input: { file_path: '/repo/skills/bundles/card-lane.md' } }] },
      }),
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: '# bundle bytes' }] },
      }),
    ].join('\n'),
  )

  assert.deepEqual(loadedNodesFrom(events, graph).sort(), [...bundle.nodes].sort())
})

test('the runner variant lands on each result so the grader can keep A/B arms apart', async () => {
  const [corpus, graph] = await Promise.all([readJson('evals/blackbox-corpus.json'), readJson('references/reference-graph.json')])
  const fixture = corpus.cases.find((candidate) => candidate.id === 'fod-bb-08')

  const { result } = buildResult({ fixture, events: parseTranscript(transcript), graph, runtimeMs: 1 })
  assert.equal(Object.hasOwn(result, 'variant'), false)
  // main() attaches variant after buildResult; the schema accepts it as an optional string.
  const schema = await readJson('evals/metrics-schema.json')
  assert.equal(schema.properties.variant.type, 'string')
})

test('transcripts are opt-in, unique per invocation, and linked by case metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-eval-'))
  try {
    assert.equal(await createTranscriptRun(null), null)
    assert.deepEqual(await writeTranscript({ runDir: null, caseId: 'case', stdout: 'x', stderr: 'y' }), null)

    const first = await createTranscriptRun(join(root, 'transcripts'))
    const second = await createTranscriptRun(join(root, 'transcripts'))
    assert.notEqual(first, second)
    const link = await writeTranscript({ runDir: first, caseId: 'case/with spaces', replicateId: 'r1', stdout: 'raw out', stderr: 'raw err' })
    assert.deepEqual(link, {
      caseId: 'case/with spaces',
      replicateId: 'r1',
      stdout: 'Y2FzZS93aXRoIHNwYWNlcw/cjE/stdout.raw',
      stderr: 'Y2FzZS93aXRoIHNwYWNlcw/cjE/stderr.raw',
    })
    assert.equal(await readFile(join(first, link.stdout), 'utf8'), 'raw out')
    assert.equal(await readFile(join(first, link.stderr), 'utf8'), 'raw err')
    await assert.rejects(
      writeTranscript({ runDir: first, caseId: 'case/with spaces', replicateId: 'r1', stdout: 'changed', stderr: 'changed' }),
      { code: 'EEXIST' },
    )
    const traversal = await writeTranscript({ runDir: first, caseId: '..', replicateId: '..', stdout: 'safe', stderr: 'safe' })
    assert.ok(traversal.stdout.includes('Li4'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('main links fake-host transcripts, leaves opt-out untouched, and rejects a missing value', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-cli-'))
  try {
    const bin = join(root, 'bin')
    await mkdir(bin)
    const fake = join(bin, 'claude')
    await writeFile(fake, '#!/bin/sh\nprintf \'%s\\n\' \'{"type":"result","message":{"content":[{"type":"text","text":"```json\\n{\\"risk\\":\\"Low\\",\\"lane\\":\\"low-fast-path\\",\\"status\\":\\"GREEN\\",\\"labels":[],\\"ceremony":[],\\"policyInvention":false,\\"falseReviewVerified\\":false,\\"errors":[]}\\n```json"}]}}\'')
    await chmod(fake, 0o755)
    const runner = join(skillDirectory, 'evals/run-live.mjs')
    const base = ['--host', 'claude', '--case', 'fod-bb-01', '--corpus', 'blackbox-corpus.json']
    const plainOut = join(root, 'plain.jsonl')
    const plain = await runNode([runner, '--out', plainOut, ...base], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
    assert.equal(plain.error, null)
    assert.equal(await access(join(root, 'transcripts')).then(() => true, () => false), false)

    const out = join(root, 'with.jsonl')
    const transcriptDir = join(root, 'transcripts')
    const recorded = await runNode([runner, '--out', out, '--transcript-dir', transcriptDir, ...base], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
    assert.equal(recorded.error, null)
    const meta = JSON.parse(await readFile(`${out}.meta.json`, 'utf8'))
    assert.equal(meta.runs.length, 1)
    assert.match(meta.runs[0].transcript.runDir, /^transcripts\/run-/)
    assert.equal(await readFile(join(dirname(out), meta.runs[0].transcript.runDir, meta.runs[0].transcript.stdout), 'utf8').then((value) => value.includes('type')), true)

    const missing = await runNode([runner, '--host', 'claude', '--out', join(root, 'missing.jsonl'), '--transcript-dir', '--variant', 'candidate'], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
    assert.equal(missing.error?.code, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('manual adversarial fixtures stay ungraded and design-only', async () => {
  const corpus = await readJson('evals/adversarial-corpus.json')
  assert.equal(corpus.cases.every((fixture) => fixture.manualReviewOnly === true), true)
  const complete = await readJson('../test-fixtures/oracle-intent-readiness/complete/input.json')
  const completeCase = corpus.cases.find((fixture) => fixture.id === 'fod-adv-02')
  assert.deepEqual(completeCase.expected.requiredLabels, [])
  assert.match(complete.approvedSource, /exactly one POST/)
  assert.match(complete.approvedSource, /preserves the entered value/)
  assert.match(complete.draft, /one POST/)
  assert.match(complete.draft, /preserve the value on failure/)
})
