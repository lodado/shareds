import assert from 'node:assert/strict'
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { gate } from './gate.mjs'
import { lint } from './lint.mjs'
import { act, anchor, newRun, screen } from './test-helpers.mjs'

/** O-0001 anchor on Home, O-0002 Settings opened (T-001), O-0003 a timed-out tap; G-0004 is a blocked payment. */
async function researchedRun() {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Settings', 'Profile', 'Pay now']))
  await act(
    root,
    runDir,
    { action: 'tap', label: 'Settings', id: 'btn-Settings' },
    screen('Settings', ['Notifications']),
  )
  await act(
    root,
    runDir,
    { action: 'tap', label: 'Notifications', id: 'btn-Notifications' },
    screen('Settings', ['Notifications']),
    { result: 'timeout' },
  )
  await act(root, runDir, { action: 'back' }, screen('Home', ['Settings', 'Profile', 'Pay now']))
  await gate(runDir, { action: 'tap', label: 'Pay now', role: 'button' })
  return runDir
}

const observed = (ref) => [{ kind: 'observation', ref }]
const documentEvidence = {
  kind: 'document',
  url: 'https://example.com/help',
  fetchedAt: '2026-10-26T09:00:00Z',
  appVersion: 'unknown',
  region: 'KR',
}
const policy = (extra) => ({
  id: 'POL-001',
  category: 'auth',
  statement: 'Five failures lock the account.',
  status: 'unknown',
  evidence: [],
  ...extra,
})
const feature = (extra) => ({
  id: 'AUTH-001',
  name: 'Login',
  status: 'observed',
  screenIds: ['S-002'],
  transitionIds: ['T-001'],
  evidence: observed('O-0002'),
  ...extra,
})

async function claims(runDir, { features = [], policies = [] }) {
  await writeFile(join(runDir, 'features.json'), JSON.stringify({ features }))
  await writeFile(join(runDir, 'policies.json'), JSON.stringify({ policies }))
  return lint(runDir)
}
const codes = (result) => result.errors.map((error) => error.code)

test('lint as a well-formed run with supported claims', async () => {
  const runDir = await researchedRun()
  const result = await claims(runDir, {
    features: [feature()],
    policies: [
      policy({ id: 'POL-001', status: 'observed', evidence: observed('O-0002'), featureIds: ['AUTH-001'] }),
      policy({ id: 'POL-002', status: 'documented', evidence: [documentEvidence], serverSide: true }),
      policy({ id: 'POL-003', status: 'inferred', basis: 'Same limit is shown on the sign-up screen.' }),
      policy({ id: 'POL-004', status: 'unknown' }),
    ],
  })
  assert.deepEqual(result, { ok: true, errors: [] })
})

test('lint as a run with no claim files', async () => {
  assert.deepEqual(await lint(await researchedRun()), { ok: true, errors: [] })
})

test('lint as an observed policy without observation evidence', async () => {
  const result = await claims(await researchedRun(), {
    policies: [policy({ status: 'observed', evidence: [documentEvidence] })],
  })
  assert.deepEqual(codes(result), ['CLAIM_UNSUPPORTED'])
  assert.match(result.errors[0].message, /needs observation evidence/)
})

test('lint as evidence that does not exist', async () => {
  const result = await claims(await researchedRun(), {
    policies: [policy({ status: 'observed', evidence: observed('O-0099') })],
  })
  assert.deepEqual(codes(result), ['EVIDENCE_REF_MISSING'])
})

test('lint as a blocked path cited as evidence', async () => {
  const result = await claims(await researchedRun(), {
    policies: [policy({ status: 'observed', evidence: observed('G-0004') })],
  })
  assert.equal(result.errors[0].code, 'EVIDENCE_REF_MISSING')
  assert.match(result.errors[0].message, /blocked paths are not evidence/)
})

test('lint as an observation that timed out', async () => {
  const result = await claims(await researchedRun(), {
    policies: [policy({ status: 'observed', evidence: observed('O-0003') })],
  })
  assert.equal(result.errors[0].code, 'EVIDENCE_NOT_SOLID')
  assert.match(result.errors[0].message, /timeout/)
})

test('lint as documented evidence missing its provenance', async () => {
  const bare = { kind: 'document', url: 'not-a-url', fetchedAt: 'yesterday' }
  const result = await claims(await researchedRun(), { policies: [policy({ status: 'documented', evidence: [bare] })] })
  assert.deepEqual(codes(result), ['EVIDENCE_INCOMPLETE', 'EVIDENCE_INCOMPLETE', 'EVIDENCE_INCOMPLETE'])
})

test('lint as code evidence without a version', async () => {
  const result = await claims(await researchedRun(), {
    policies: [policy({ status: 'code-backed', evidence: [{ kind: 'code', ref: 'a.kt#login' }] })],
  })
  assert.deepEqual(codes(result), ['EVIDENCE_INCOMPLETE'])
})

test('lint as an inference without a basis', async () => {
  const result = await claims(await researchedRun(), { policies: [policy({ status: 'inferred', basis: '  ' })] })
  assert.deepEqual(codes(result), ['CLAIM_UNSUPPORTED'])
})

test('lint as a server-side rule confirmed from the client', async () => {
  const runDir = await researchedRun()
  const client = policy({ status: 'observed', evidence: observed('O-0002'), serverSide: true })
  assert.deepEqual(codes(await claims(runDir, { policies: [client] })), ['SERVER_SIDE_UNCONFIRMED'])
  const confirmed = { ...client, evidence: [...client.evidence, documentEvidence] }
  assert.equal((await claims(runDir, { policies: [confirmed] })).ok, true)
})

test('lint as unknown vocabulary', async () => {
  const result = await claims(await researchedRun(), { policies: [policy({ status: 'certain', category: 'vibes' })] })
  assert.deepEqual(codes(result), ['SCHEMA', 'SCHEMA'])
})

test('lint as claims pointing at things that are not there', async () => {
  const result = await claims(await researchedRun(), {
    features: [feature({ screenIds: ['S-009'], transitionIds: ['T-009'] })],
    policies: [policy({ featureIds: ['AUTH-009'] })],
  })
  assert.deepEqual(codes(result), ['GRAPH_DANGLING', 'GRAPH_DANGLING', 'GRAPH_DANGLING'])
})

test('lint as an observed feature without observations', async () => {
  const result = await claims(await researchedRun(), { features: [feature({ evidence: [] })] })
  assert.match(result.errors[0].message, /needs observation evidence/)
  assert.deepEqual(new Set(codes(result)), new Set(['CLAIM_UNSUPPORTED']))
  assert.equal(
    (
      await claims(await researchedRun(), {
        features: [feature({ evidence: [], status: 'inferred', basis: 'Seen in a store screenshot.' })],
      })
    ).ok,
    true,
  )
})

test('lint as malformed or duplicate ids', async () => {
  const result = await claims(await researchedRun(), {
    features: [feature(), feature({ name: ' ' })],
    policies: [policy({ id: 'POL-1' }), policy({ id: 'POL-002' }), policy({ id: 'POL-002' })],
  })
  assert.deepEqual(codes(result).sort(), ['DUPLICATE_ID', 'DUPLICATE_ID', 'SCHEMA', 'SCHEMA'].sort())
})

test('lint as evidence that is not an array', async () => {
  const result = await claims(await researchedRun(), { policies: [policy({ evidence: 'O-0001' })] })
  assert.equal(result.errors[0].code, 'SCHEMA')
})

test('lint as an evidence file removed from disk', async () => {
  const runDir = await researchedRun()
  await rm(join(runDir, 'snapshots/O-0002.json'))
  const result = await lint(runDir)
  assert.deepEqual(
    result.errors.map(({ code, where }) => [code, where]),
    [['EVIDENCE_PATH_MISSING', 'O-0002']],
  )
})

test('lint as an observation added without a gate receipt', async () => {
  const runDir = await researchedRun()
  const fake = {
    id: 'O-0099',
    anchor: false,
    gateId: null,
    screenId: 'S-001',
    action: { type: 'tap' },
    result: 'ok',
    snapshotPath: null,
    screenshotPath: null,
  }
  await appendFile(join(runDir, 'observations.jsonl'), `${JSON.stringify(fake)}\n`)
  assert.deepEqual(codes(await lint(runDir)), ['OBSERVATION_UNGATED'])
})

test('lint as an observation whose action differs from its receipt', async () => {
  const runDir = await researchedRun()
  const lines = (await readFile(join(runDir, 'observations.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  lines[1].action.type = 'swipe'
  await writeFile(join(runDir, 'observations.jsonl'), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  assert.deepEqual(codes(await lint(runDir)), ['OBSERVATION_UNGATED'])
})

test('lint as a receipt consumed twice', async () => {
  const runDir = await researchedRun()
  assert.deepEqual(codes(await lint(runDir)), [])
  const lines = (await readFile(join(runDir, 'observations.jsonl'), 'utf8')).trim().split('\n')
  const copy = { ...JSON.parse(lines[1]), id: 'O-0099' }
  await appendFile(join(runDir, 'observations.jsonl'), `${JSON.stringify(copy)}\n`)
  assert.deepEqual(codes(await lint(runDir)), ['GATE_REUSED'])
})

test('lint as a transition pointing at a deleted screen', async () => {
  const runDir = await researchedRun()
  const file = join(runDir, 'transitions.json')
  const data = JSON.parse(await readFile(file, 'utf8'))
  data.transitions[0].to = 'S-099'
  data.transitions[0].observationIds.push('O-0099')
  await writeFile(file, JSON.stringify(data))
  assert.deepEqual(codes(await lint(runDir)), ['INCONSISTENT_STATE', 'GRAPH_DANGLING'])
})

test('lint as a budget shrunk below the actions already taken', async () => {
  const runDir = await researchedRun()
  const file = join(runDir, 'run.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), maxActions: 1 }))
  assert.deepEqual(codes(await lint(runDir)), ['BUDGET_EXCEEDED'])
})
