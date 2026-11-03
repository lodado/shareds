/**
 * The `next:` command of a phase line (`oracle-run.mjs status --brief` and `guide`, `oracle-stage.mjs status --brief`),
 * one entry per command, matched on the first line of `status --brief`. oracle-step.mjs reads it to pick what it runs
 * or prints; the model replays (oracle-run-machine.cases.mjs, oracle-authoring-machine.cases.mjs) check this same table
 * against the delivery, review-lap and authoring models. Lines the replays never reach are not in the table:
 * `oracle-run.mjs status --brief` after `init`, and the transition example `guide --to` prints for a stop target
 * (NEEDS_DECISION, FAIL).
 */
export const NEXT_LINES = Object.freeze({
  red: /· next: oracle-run\.mjs red --dir /,
  green: /· next: oracle-run\.mjs green --dir /,
  exec: /· next: oracle-run\.mjs exec --dir /,
  close: /· next: oracle-run\.mjs close --dir \S+ --packet /,
  guide: /· next: oracle-run\.mjs guide --dir \S+ --to /,
  report: /· next: oracle-run\.mjs close --dir \S+ --check-report /,
  step: /· next: oracle-step\.mjs --dir \S+(?: ·|$)/,
  lock: /· next: oracle-lock\.mjs create /,
  stop: /· next: NEEDS_DECISION: (?:the same issues came back|a review ran its 2 rounds)/,
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
