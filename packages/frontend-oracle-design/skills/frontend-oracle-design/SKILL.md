---
name: frontend-oracle-design
description: 'Use for frontend behavior that can go wrong in state, order, count, permission or money when the user asks to fix, build, design or plan it, even with no code yet: double charge on double click, stale or out-of-order responses, submit after session expiry, tenant cache leaks, pagination, caching, destructive actions, payments, permissions or gates, and requests whose sources conflict (PRD vs legal memo); or an existing run under `.ai/oracles/<id>/`. Six steps: a 7-axis SPEC, a Bend proof, generated fast-check conformance tests, RED, GREEN, one review. Not for copy, tokens, isolated CSS, visual-only work, screenshot QA, or code structure and FSD placement (frontend-system-design).'
allowed-tools:
  - Bash
---

# Frontend Oracle Design

Six steps. Each has one document and one command of `scripts/fod.mjs`, run from the repository root as
`node <this skill>/scripts/fod.mjs <command> <id>` (Node 22.5 or newer). `status <id>` prints the step, the
document to read and the next command. Read only the current step's document.

| Step       | Read                                       | You write                               | Command                       |
| ---------- | ------------------------------------------ | --------------------------------------- | ----------------------------- |
| 1 Spec     | [steps/1-spec.md](steps/1-spec.md)         | `.ai/oracles/<id>/SPEC.md`              | `init`, `check`               |
| 2 Proof    | [steps/2-proof.md](steps/2-proof.md)       | `MODEL.bend`, `LAWS.bend`, `PROOF.bend` | `prove`, reading, `approve`   |
| 3 Generate | [steps/3-generate.md](steps/3-generate.md) | the adapter                             | `gen`                         |
| 4 RED      | [steps/4-red.md](steps/4-red.md)           | nothing in the product                  | `run red`                     |
| 5 GREEN    | [steps/5-green.md](steps/5-green.md)       | the product fix                         | `run green`                   |
| 6 Review   | [steps/6-review.md](steps/6-review.md)     | the report                              | a reviewer reruns `run green` |

## Rules

- Out of scope (copy, tokens, layout, visual-only, code structure): say which path fits — a plain edit, `$test`,
  `$frontend-visual-qa` or `$frontend-system-design` — and stop.
- The user approves once, after step 2, from one message that shows the rules, the 7 axes, what was proven and read, and
  the questions with their ★ recommendations. Run `approve` only after that answer. "Fix it" or "ship it" in
  the request is not approval of the spec.
- Two independent readings, one pass each: a reviewer reads the model before the approval message (step 2) and
  the delivery after GREEN (step 6).
- Every command reports all of its problems at once, each with a fix. Fix them all, then rerun the same command.
- Only the scripts write `proof.json`, `approval.json`, `gen.json`, `run.jsonl` and the generated tests. Never
  edit them by hand. They are plain files, so they record what happened but do not prove it: that is why the
  step 6 reviewer reruns `run green` instead of trusting `run.jsonl`.
- Design-only requests end at the approval message. Implementation requests continue to step 6.
- Without a shell (no way to run `fod.mjs`), write `SPEC.md` and the Bend files, say that `prove` did not run,
  send the approval message and stop.
- A source that is missing or conflicting is a question with a ★ recommendation, never a guess.
