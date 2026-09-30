# Document save fixture

A skill tool fixture for the adequacy check of `frontend-oracle-design`. It fixes one small policy so
the chain from source text to a checked card can run end to end. It decides nothing for a real
application.

## Fixture policy

The source text the card cites as S1:

1. A change must not be committed when the editor lacks edit permission at the moment the server
   commits it.
2. The "Saved" acknowledgement must correspond to a committed save.
3. While the retention conditions hold, a reload must show the committed version.
4. Under normal conditions the save can complete.

Environment facts: permission is never regained while one save request is processed, and a reload
reads the server, so it never shows a version the server did not commit. One editor edits one
document with one request per attempt; concurrent editors, duplicate requests and other features are
outside this fixture, and no guarantee is claimed for them.

## Files

| File         | Role                                                                           | Locked     |
| ------------ | ------------------------------------------------------------------------------ | ---------- |
| `oracle.md`  | Oracle card: policies P1–P3, rows O1–O4, `## Terms`, `## Adequacy`             | card bytes |
| `World.bend` | world model: the `Save` record, assumptions A1–A2, goals G1–G4, row predicates | S2         |

`skills/scripts/oracle-adequacy.test.mjs` runs the checks on this card and on copies reverted to the
first draft: demo A (a coordinate that only knows the permission at submit, then a hidden commit) and
demo B (a card whose rows all pass while a goal fails). It checks the card against the declared world;
it is not a proof about any implementation and not a browser test.
