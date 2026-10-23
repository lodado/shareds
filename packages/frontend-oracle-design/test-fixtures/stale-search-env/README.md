# Stale-search fixture with the environment in the state

The stale-search model with its environment kept in the model state (`open`: the issued ids that have no
answer yet) instead of being re-read from the history. It checks that the move keeps the oracle space (the same
cases and `spaceDigest` at bounds 3 to 5) and shows the lemma patterns of a safety law over every trace. This law
would also hold without the move; the move matters when a law holds only on traces the environment allows. It
decides nothing for a real application.

## Fixture policy

The stale-search policy, plus one law: after any sequence of events, the list never shows a result newer
than the latest request.

## Files

| File         | Role                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `MODEL.bend` | `Search{latest, shown, open}`; `observe` reads only `shown`; `next` is `enabled(run(h, init))` |
| `LAWS.bend`  | `shown_le_latest` over every trace                                                             |
| `PROOF.bend` | lemmas `le_succ` and `eq_le`, the computed-`Bool` split `respond_ok`, one induction `safe_run` |

`skills/frontend-oracle-design/scripts/oracle-model.test.mjs` proves the law and checks that
`enumerateSpace` gives the same cases and `spaceDigest` as `../stale-search/MODEL.bend` for bounds 3 to 5.
