---
name: bend-proof
description: 'Use only when writing, proving or repairing Bend files (MODEL.bend, LAWS.bend, PROOF.bend) from requirements: a state/event/transition machine, its cell laws, all-trace safety invariants, witnesses and ranking functions; or when a Bend proof fails or the laws look too weak to pin the model. Bend files only: a request that also fixes, builds or delivers product behavior goes to frontend-oracle-design, which calls this skill.'
allowed-tools:
  - Bash
---

# Bend Proof

## Entry

First read [bend-proof](../frontend-oracle-design/references/bend-proof.md) without offset or limit. Read
[model-patterns](../frontend-oracle-design/references/model-patterns.md) when the model has retries,
delays, staleness, error kinds, remounts, request counts, counters, collections or identities.
Scripts in `../frontend-oracle-design/scripts/`: `oracle-model.mjs` (`check`, `laws`, `prove`, `space`);
`ensure-bend.mjs` installs a missing Bend.

## Modes

- **Inside an Oracle run** the Formal author invokes this skill with the controller's approved sources,
  confirmed axes and package path, and writes only what that role allows. The reviewer reads
  bend-proof's checklist instead. Policy, approval, lock, stage and delivery rules stay with the
  controller and [bend-cross-verification](../frontend-oracle-design/references/bend-cross-verification.md).
- **Standalone** takes requirement text and a directory and writes `MODEL.bend`, `LAWS.bend` and
  `PROOF.bend` there. The person who asked approves `LAWS.bend`; no independent reading is claimed. If the
  files are sources of an Oracle lock, stop and return to `$frontend-oracle-design`: only `PROOF.bend` is
  free.

## Procedure

1. Collect the cells the requirement leaves open: ask the person (standalone) or return them to the
   controller before any Bend.
2. In an Oracle run the analyst's independent State Model comes from the controller; standalone has none.
3. Write the machine: states, events, a total `step`, the outcome in the state, the environment.
4. Translate each requirement sentence with bend-proof's table; keep the frame laws.
5. Check each file, run `laws` (counterexamples and free cells), then `prove --dir` (it generates
   finite cell proofs) and `space`.
6. Report each law's scope (cell, every trace, witness or rank) and what is not proven: the product is
   tested, not proven.

## Never

No card, lock, approval, stage transition, receipt, consumer test or production edit. Never narrow a
requirement to obtain a proof; a policy the source leaves open is `NEEDS_DECISION`.
