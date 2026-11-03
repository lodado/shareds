import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { authoringMachineCases, CHILD_ENV } from './oracle-authoring-machine.cases.mjs'
import { deliveryMachineCases } from './oracle-run-machine.cases.mjs'
import { stepCases } from './oracle-step.cases.mjs'
import { installedBend } from './oracle-test-bend.mjs'

// The stage fixture models the authoring graph oracle-step.mjs evaluates and the lock that judges it. This test proves
// its laws with the kernel; the authoring cases replay its traces on the real commands.
const STAGE = fileURLToPath(new URL('../../../test-fixtures/stage/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
// the cell laws prove generates; PROOF.bend names a body for every other law (the witness traces among them)
const CELL_LAWS = ['run_counts', 'save_rounds', 'first_failing', 'first_failing_contract']

const oracleModel = (...args) =>
  spawnSync(process.execPath, [join(SCRIPTS, 'oracle-model.mjs'), ...args], { encoding: 'utf8', env: CHILD_ENV, maxBuffer: 1 << 26 })

test('[bend] the authoring graph laws are proven by the kernel: cells, witnesses, traces, and Graph.safe on every reached state', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const laws = [...(await readFile(join(STAGE, 'LAWS.bend'), 'utf8')).matchAll(/^law (\w+):/gm)].map((match) => match[1])
  const bodies = [...(await readFile(join(STAGE, 'PROOF.bend'), 'utf8')).matchAll(/^def Laws\.(\w+)\(\):/gm)].map((match) => match[1])
  assert.deepEqual(bodies, laws.filter((law) => !CELL_LAWS.includes(law)))
  const before = (await readdir(STAGE)).sort()
  const run = oracleModel('prove', '--dir', STAGE, '--timeout-ms', '300000')
  assert.equal(run.status, 0, run.stderr)
  const result = JSON.parse(run.stdout)
  assert.equal(result.status, 'proven', `${result.stdout}${result.stderr}`)
  assert.deepEqual(result.laws, laws)
  assert.deepEqual(result.cells, {
    generated: [
      { law: 'run_counts', cases: 20 },
      { law: 'save_rounds', cases: 10 },
      { law: 'first_failing', cases: 8 },
      { law: 'first_failing_contract', cases: 4 },
    ],
    skipped: [],
    temporaryCopy: true,
  })
  assert.deepEqual((await readdir(STAGE)).sort(), before)

  // 4,204 states of the type × 18 events; every law holds for every command in every state a trace reaches
  const reach = oracleModel('prove-reach', '--model', join(STAGE, 'MODEL.bend'), '--prefix', 'Graph', '--safe', 'safe', '--timeout-ms', '600000')
  assert.equal(reach.status, 0, reach.stderr)
  const reached = JSON.parse(reach.stdout)
  assert.equal(reached.status, 'proven', reach.stdout.slice(0, 2000))
  assert.deepEqual(
    { domain: reached.domain, reachable: reached.reachable, diameter: reached.diameter },
    { domain: { states: 4204, events: 18, cells: 75672 }, reachable: 728, diameter: 15 },
  )
})

// the Delivery run machine of oracle-run.mjs, proven and driven the same way
for (const args of deliveryMachineCases) test(...args)

// the authoring graph replayed on oracle-step.mjs and oracle-lock.mjs
for (const args of authoringMachineCases) test(...args)

// oracle-step.mjs, the driver over both: the shared next table, its stops, and real runs end to end
for (const args of stepCases) test(...args)
