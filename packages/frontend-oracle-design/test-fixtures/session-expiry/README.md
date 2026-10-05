# Session-expiry fixture

A skill tool fixture showing that time is a proof axis, not a scope-gate stop. It fixes one small
policy so a proven Bend relation can be projected onto a product that reads a clock. It decides nothing
for a real application.

## Fixture policy

1. A submit after the 30-minute session window ended issues 0 payment requests.
2. A submit inside the window issues exactly 1 payment request.

## Files

- `MODEL.bend`: `Session`/`Cmd` types, `Expire` as the event that ends the window, two relations
- `LAWS.bend`: the relations hold for every state and command of the model
- `PROOF.bend`: case split; `bend PROOF.bend --verdict` prints `ALL PROOFS CHECK`
- `session.mts`: the product; it reads an injected clock and owns `SESSION_MS`
- `session.mutants.mts`: a product that still pays at exactly `SESSION_MS` (`>` instead of `>=`)
- `session.adapter.mjs`: maps `Expire` to advancing the fake clock by `SESSION_MS`, never a sleep

`skills/scripts/oracle-projection.test.mjs` runs the chain: the dimension miner reports the clock as
an Async `timer / clock` candidate, Bend proves both laws, `emit state` generates the oracle test over
all 8 state·command pairs, the product passes and the off-by-one mutant fails.
