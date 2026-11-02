/**
 * The `next:` command of a phase line (`oracle-run.mjs status --brief` and `guide`, `oracle-stage.mjs status --brief`),
 * one entry per command, matched on the first line of `status --brief`. oracle-step.mjs reads it to pick what it runs
 * or prints; the model replays (oracle-run-machine.cases.mjs, oracle-authoring-machine.cases.mjs) check this same table
 * against the delivery, review-lap and authoring models. Lines the replays never reach are not in the table:
 * `oracle-run.mjs status --brief` after `init`, the Contract profile's `advance --to` and `rewind --to DISCOVERING`, and
 * the transition example `guide --to` prints for a stop target (NEEDS_DECISION, FAIL).
 */
export const NEXT_LINES = Object.freeze({
  red: /· next: oracle-run\.mjs red --dir /,
  green: /· next: oracle-run\.mjs green --dir /,
  exec: /· next: oracle-run\.mjs exec --dir /,
  close: /· next: oracle-run\.mjs close --dir \S+ --packet /,
  guide: /· next: oracle-run\.mjs guide --dir \S+ --to /,
  report: /· next: oracle-run\.mjs close --dir \S+ --check-report /,
  begin: /· next: oracle-stage\.mjs begin --dir /,
  walk: /· next: oracle-cycle\.mjs walk --dir \S+(?: ·|$)/,
  walkReason: /· next: oracle-cycle\.mjs walk --dir \S+ --reason /,
  lock: /· next: oracle-lock\.mjs create /,
  extend: /· next: oracle-stage\.mjs extend --dir \S+ --approval /,
  init: /· next: oracle-run\.mjs init /,
  revise: /· next: NEEDS_DECISION: the user rewrites the sources/,
})

/** The NEXT_LINES key a phase line names, or the line itself when it names none or more than one. */
export function nextCommandOf(line) {
  const keys = Object.keys(NEXT_LINES).filter((key) => NEXT_LINES[key].test(line))
  return keys.length === 1 ? keys[0] : line
}

/** The command a phase line names, without the phase and the status fields after it. */
export function nextOf(line) {
  return /· next: (.*?)(?: · |$)/.exec(line.split('\n')[0])?.[1] ?? null
}
