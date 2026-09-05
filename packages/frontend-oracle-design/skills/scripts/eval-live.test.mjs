import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildResult, loadedNodesFrom, mentionedNodesFrom, parseTranscript, selfReportFrom, usageFrom } from '../evals/run-live.mjs'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

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
      JSON.stringify({ type: 'item.completed', item: { item_type: 'file_read', path: 'skills/references/common.md', status: 'completed' } }),
      JSON.stringify({ type: 'item.completed', item: { item_type: 'file_read', path: 'skills/references/bva.md', status: 'failed' } }),
    ].join('\n'),
  )
  assert.deepEqual(loadedNodesFrom(events, graph), ['common'])
})

test('tool calls and tokens are taken from the host usage record', () => {
  assert.deepEqual(usageFrom(parseTranscript(transcript)), { toolCalls: 4, tokens: 1000 })
})

test('the self-report is read from the last fenced json block', () => {
  assert.equal(selfReportFrom(parseTranscript(transcript)).status, 'NEEDS_DECISION')
  assert.equal(selfReportFrom(parseTranscript('no json here')), null)
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
  assert.deepEqual(silent.result.errors, ['NO_MACHINE_REPORT'])
  assert.equal(silent.result.status, null)
  assert.equal(silent.result.policyInvention, false)
  assert.equal(silent.result.attestation.policyInvention, 'unreported')
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
  assert.deepEqual(result.errors, ['FLAG_UNREPORTED:policyInvention'])
  assert.equal(result.replicateId, 'r2')
})
