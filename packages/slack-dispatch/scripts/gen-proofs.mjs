// Regenerates LAWS.bend and PROOF.bend of a formal model from the law list below.
// Usage: node scripts/gen-proofs.mjs machine|run
// PROOF.bend is a case split over every stage and event; the Lean kernel re-checks each case, so it is
// regenerated, never edited. MODEL.bend stays hand-written. Change a law here and in MODEL.bend together.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const bools = (n) => (n === 0 ? [[]] : ['True{}', 'False{}'].flatMap((b) => bools(n - 1).map((rest) => [b, ...rest])))
const ctor = (name, n) => bools(n).map((args) => `M.${name}{${args.join(', ')}}`)

const MODELS = {
  machine: {
    dir: 'src/machine/__test__/formal',
    prefix: 'Dispatch',
    purpose: 'the slack-dispatch item state machine',
    // Laws are stated over (stage, event) through the model's decide(); the item state only adds the last outcome.
    outcome: true,
    stages: [
      'Ingested',
      'Notified',
      'Planning',
      'Planned',
      'Implementing',
      'PrOpen',
      'Merged',
      'Skipped',
      'Declined',
      'Failed',
    ],
    msgs: [
      ...ctor('Triage', 2),
      ...bools(2).flatMap(([owner, fresh]) =>
        ['Assign', 'Plan'].map((card) => `M.Approve{${owner}, M.${card}{}, ${fresh}}`),
      ),
      ...ctor('Reject', 1),
      ...ctor('Revise', 1),
      ...ctor('PlanReady', 1),
      ...ctor('Built', 1),
      ...ctor('Merge', 3),
      ...ctor('Retry', 2),
      'M.Abort{}',
    ],
    laws: [
      ['finished_absorbs', 'a finished item ignores every later event'],
      [
        'refused_keeps',
        'a refused event never changes the stage (structural: it follows from how next_stage is built)',
      ],
      ['stayed_keeps', 'an accepted event that stays does not change the stage (structural, like refused_keeps)'],
      ['moved_is_legal', 'every move is a legal edge (the real law) and lands where the outcome says (structural)'],
      ['untrusted_refused', 'a sender that is not the owner is refused as not the owner, before anything else'],
      ['finished_refused', 'an event to a finished item from the owner is refused as finished'],
      ['wrong_stage_refused', 'an event the stage does not take is refused as the wrong stage'],
      ['stale_refused', 'a stale card or plan is refused as stale'],
      ['gate_refused', 'a merge or retry whose conditions are not met is refused as such'],
      ['implement_entry', 'Implementing is entered only from Planned by the owner approving the latest plan card'],
      ['planning_entry', 'Planning is entered only by a sure triage, an assign approval, a revise request or a retry'],
      ['planned_entry', 'Planned is entered only from Planning by a current plan'],
      ['notified_entry', 'Notified is entered only from Ingested when routing is not sure'],
      ['skip_entry', 'Skipped is entered only from Ingested when the thread is already handled'],
      ['pr_open_entry', 'PrOpen is entered only from Implementing by a successful build'],
      ['merge_entry', 'Merged is entered only from PrOpen by the owner with CI green and review applied'],
      ['declined_entry', 'Declined is entered only from an open stage by the owner rejecting'],
      ['fail_entry', 'Failed is entered only by an abort or a failed build of an Implementing item'],
      ['replay_idempotent', 'delivering the same event again to the result changes nothing'],
      ['triage_handled_skips', 'triage that finds the thread handled skips an Ingested item'],
      ['triage_confident_plans', 'triage with a sure route starts planning'],
      ['triage_unsure_notifies', 'triage with an unsure route asks the owner'],
      ['assign_advances', 'the owner approving the latest assign card moves Notified to Planning'],
      ['plan_advances', 'the owner approving the latest plan card moves Planned to Implementing'],
      ['revise_replans', 'the owner asking for a change moves Planned to Planning'],
      ['revise_restarts', 'the owner asking for a change while Planning is accepted and restarts the plan'],
      ['plan_ready_returns', 'a current plan moves Planning to Planned'],
      ['build_ok_opens_pr', 'a successful build moves Implementing to PrOpen'],
      ['build_failed_fails', 'a failed build moves Implementing to Failed'],
      ['reject_declines', 'the owner rejecting an open item declines it'],
      ['merge_when_ready', 'a ready merge request from the owner merges a PrOpen item'],
      ['abort_fails', 'an abort fails every item that can still fail'],
      ['retry_restarts', 'the owner retrying a Failed item within budget moves it to Planning'],
    ],
    witness: {
      name: 'merged_reachable',
      goal: 'Merged',
      trace: [
        'M.Triage{False{}, True{}}',
        'M.PlanReady{True{}}',
        'M.Revise{True{}}',
        'M.PlanReady{True{}}',
        'M.Approve{True{}, M.Plan{}, True{}}',
        'M.Built{True{}}',
        'M.Merge{True{}, True{}, True{}}',
      ],
    },
  },
  run: {
    dir: 'src/run/__test__/formal',
    prefix: 'RunLife',
    purpose: 'one script run',
    stages: ['Requested', 'Running', 'Succeeded', 'Failed', 'Rejected'],
    msgs: [...ctor('Start', 4), ...ctor('Finish', 2), 'M.Cancel{}'],
    laws: [
      ['terminal_absorbs', 'a decided run ignores every later event'],
      ['running_entry', 'a run starts only from Requested, when all four admission checks passed'],
      [
        'rejected_entry',
        'a run is rejected only from Requested, by a start request that failed a check or by a cancel before it started',
      ],
      ['succeeded_entry', 'a run succeeds only from Running, when the process exited cleanly with valid output'],
      ['failed_entry', 'a run fails only from Running, by a bad finish or a cancel'],
      ['replay_idempotent', 'delivering the same event again to the result changes nothing'],
      ['start_runs', 'an admitted request starts the run'],
      ['bad_start_rejects', 'a request that failed a check is rejected, never started'],
      ['finish_succeeds', 'a clean exit with valid output completes a running run'],
      ['cancel_fails', 'a cancel (timeout, budget) fails a running run'],
      ['bad_finish_fails', 'a running run whose process failed or whose output was invalid fails'],
      ['cancel_rejects_unstarted', 'a cancel before the run started rejects it, so it can never start later'],
    ],
    witness: {
      name: 'succeeded_reachable',
      goal: 'Succeeded',
      trace: ['M.Start{True{}, True{}, True{}, True{}}', 'M.Finish{True{}, True{}}'],
    },
  },
}

const name = process.argv[2]
const model = MODELS[name]
if (!model) throw new Error(`usage: node scripts/gen-proofs.mjs ${Object.keys(MODELS).join('|')}`)
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', model.dir)
const { prefix, stages, msgs, laws, witness } = model

let lawsSrc = `import Base
import ./MODEL.bend as M

# Approved laws for ${model.purpose}. Each law is a relation of MODEL.bend that holds for every stage and
# every event. PROOF.bend proves them; they state the reference model, not the TS code.
`
for (const [lawName, doc] of laws) {
  lawsSrc += model.outcome
    ? `\n# ${doc}\nlaw ${lawName}:\n  for a: M.Stage\n  for m: M.Msg\n  {M.${prefix}.Q_${lawName}(a, m, M.${prefix}.next_stage(a, M.${prefix}.decide(a, m)), M.${prefix}.decide(a, m)) == True{} : Bool}\n`
    : `\n# ${doc}\nlaw ${lawName}:\n  for s: M.Stage\n  for m: M.Msg\n  {M.${prefix}.R_${lawName}(s, m, M.${prefix}.step(s, m)) == True{} : Bool}\n`
}
lawsSrc += `
# Witness: some trace from the initial stage ends ${
  witness.goal
}, so the laws above do not hold merely because nothing happens
law ${witness.name}:
  exs t: List<M.Msg>
  {${
    model.outcome
      ? `M.${prefix}.stage_of(M.${prefix}.run(t, M.${prefix}.init()))`
      : `M.${prefix}.run(t, M.${prefix}.init())`
  } == M.${witness.goal}{} : M.Stage}
`
writeFileSync(join(dir, 'LAWS.bend'), lawsSrc)

let proof = `import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

# Case split over every stage and event; the kernel re-checks each case.
# Generated by scripts/gen-proofs.mjs ${name} — regenerate, do not edit.
`
for (const [lawName] of laws) {
  proof += `\ndef Laws.${lawName}(s, m):\n  match s m:\n`
  for (const stage of stages) for (const msg of msgs) proof += `    case M.${stage}{} ${msg}:\n      {==}\n`
}
proof += `\ndef Laws.${witness.name}():\n  ([${witness.trace.join(', ')}], {==})\n`
writeFileSync(join(dir, 'PROOF.bend'), proof)

console.log(
  JSON.stringify({
    model: name,
    laws: laws.map(([n]) => n).concat(witness.name),
    casesPerLaw: stages.length * msgs.length,
  }),
)
