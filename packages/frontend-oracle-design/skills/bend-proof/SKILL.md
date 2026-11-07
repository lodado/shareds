---
name: bend-proof
description: 'Use only when writing, proving or repairing Bend files (MODEL.bend, LAWS.bend, PROOF.bend) from requirements: a state/event/transition machine, its cell laws, all-trace safety invariants, witnesses and ranking functions; or when a Bend proof fails or the laws look too weak to pin the model. Bend files only: a request that also fixes, builds or delivers product behavior goes to frontend-oracle-design, whose step 2 is this work.'
allowed-tools:
  - Bash
---

# Bend Proof

Read [bend-proof](../frontend-oracle-design/references/bend-proof.md) in full, and
[model-patterns](../frontend-oracle-design/references/model-patterns.md) when the model has time, retries, error
kinds, counters, collections or identities. Inside a frontend-oracle-design run, follow its
[step 2](../frontend-oracle-design/steps/2-proof.md) instead of this page.

Standalone, take the requirement text and a directory:

1. List what the requirement leaves open and ask the person before writing Bend.
2. Write `MODEL.bend` (states, events, a total `step`, `observe`, `next`), `LAWS.bend` (one law per requirement
   sentence, with the sentence in the comment above it) and `PROOF.bend`.
3. Run `node ../frontend-oracle-design/scripts/oracle-model.mjs` `check --file`, `laws` (counterexamples, free
   cells), `prove --dir`, `prove-reach` for a finite machine, and `space`.
4. Report each law's scope (cell, every trace, witness or rank) and what is not proven.

Never narrow a requirement to obtain a proof. A policy the requirement leaves open is a question for the person.
