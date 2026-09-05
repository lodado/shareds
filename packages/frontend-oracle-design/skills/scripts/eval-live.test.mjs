import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildResult, loadedNodesFrom, parseTranscript, selfReportFrom, usageFrom } from '../evals/run-live.mjs'

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
        { type: 'tool_use', name: 'Read', input: { file_path: '/repo/skills/references/common.md' } },
        { type: 'tool_use', name: 'Read', input: { file_path: '/repo/skills/references/card/policy-sources.md' } },
      ],
      usage: { input_tokens: 900, output_tokens: 100 },
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

  assert.equal(events.length, 2)
  assert.equal(events[0].type, 'assistant')
})

test('loaded nodes come from the paths the host actually read, not from the self-report', async () => {
  const graph = await readJson('references/reference-graph.json')

  assert.deepEqual(loadedNodesFrom(parseTranscript(transcript), graph).sort(), ['card-policy-sources', 'common'])
})

test('tool calls and tokens are taken from the host usage record', () => {
  assert.deepEqual(usageFrom(parseTranscript(transcript)), { toolCalls: 2, tokens: 1000 })
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

  const silent = buildResult({ fixture, events: parseTranscript('{"type":"result"}'), graph, runtimeMs: 7 })
  assert.deepEqual(silent.result.errors, ['NO_MACHINE_REPORT'])
  assert.equal(silent.result.status, null)
  assert.equal(silent.result.policyInvention, false)
})
