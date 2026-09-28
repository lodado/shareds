# Optional level and pressure progression

Use after core rules, before player-flow wireframes, when authored stages, learning order, spatial
challenges, or changing in-run pressure are in scope. Record `STAGED`, `ENDLESS`, or `N/A` with a reason.
A tiny single-loop prototype or UI-only polish may use N/A; do not invent a campaign or difficulty generator.
Reuse existing content and approved progression rather than restarting design.

## Contract per level or pressure band

Keep this in the existing game-design artifact. Use stable `L-` IDs linked to existing `R-` rules and
`X-` experiments; these are document-local links, not new manifest fields or readiness dimensions.

| Field                  | Required answer                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Learning objective     | What new judgment should the player demonstrate? What prior understanding does it require, and what observable action distinguishes understanding from luck?                                                            |
| Challenge and rhythm   | What is familiar, newly introduced, combined, tense, or a recovery opportunity? Introduce → practice → vary/combine → recover is a proposal, not a mandatory sequence.                                                  |
| Layout and metrics     | Initial objects/obstacles, coordinates or grid cells, units, usable bounds, movement/merge/collision rules, distance/speed/timing/clearance and their relationship. Record estimates separately from measurements.      |
| Routes and readability | Where applicable: entry/exit, main and alternate routes, connections, sightlines, landmarks and warnings. For a fixed-board puzzle use adjacency, reachable placements and free space instead; do not invent corridors. |
| Solvability            | Intended solution or survival strategy, alternatives, dead ends, recoverability, failure/reset, and any softlock risk. State what randomness can change.                                                                |
| Validation             | Expected confusion/failure point, player task, observed strategy, completion/failure evidence, and what result would change this design. Separate automated checks from human learning evidence.                        |

## Staged versus endless

STAGED: sketch the agreed learning sequence, then detail only the first representative level and one
meaningful variation before expanding. Example merge-game hypotheses: discover matching → notice isolated
small objects → reserve space using preview information → combine space management with chain merges.
Do not add preview or chain mechanics if the approved rules lack them. This is our adaptation, not a
source-prescribed curriculum or evidence that players learned it.

ENDLESS: use observable state such as board occupancy, available moves, object mix and recovery room
to define low/medium/high pressure. Do not force level numbers or assume elapsed time proves difficulty.
State entry/exit conditions and whether a band is descriptive or actually changes rules/spawns; descriptive
bands need no code. Rule-changing thresholds need explicit design scope, exact boundaries and tests;
avoid accidental oscillation. A pressure table is not a validated difficulty curve.

## Blockout and verification

PLAN_ONLY produces a dimensioned text/grid sketch and test plan, not playable geometry. Code or Figma
work still requires its own requested lane; a Figma navigation prototype is not a spatial/rules test.
When implementation is requested, build the smallest primitive blockout using the same movement,
collision, camera and input constraints as the intended game. Test placement, reachability, timing and
flow before final art. Do not let cosmetic geometry hide different judged geometry.

For authored deterministic challenges, walk through at least one legal solution and an intended failure;
record the setup, actions and outcome. For random content, record seed/initial state, sampling limits,
unwinnable cases and proposed safeguards. One winning seed does not prove all generated levels solvable;
endless games need a viable survival window, not an invented terminal solution. Safeguards that alter
approved randomness or rules remain proposals until resolved.

Playtest whether a player can act and explain/adapt the intended judgment without a leading hint.
Record hesitation, failure location/cause, route or placement strategy, recovery and transfer to the
variation. Separate author walkthrough, automated rule tests and observed player sessions. Keep unrun
learning/fun claims `not_run`; change only the earliest contradicted rule, layout or teaching assumption.
Hand off the level/band IDs, setup, units, source-backed rationale and checks through the existing blueprint.

## Evidence boundary

The Level Design Book (https://book.leveldesignbook.com/) informs the spatial workflow; it does not
validate this game's numerical tuning, merge-game curriculum, pressure bands or enjoyment. Source
observations and our adaptations must be separated in the Reference Log. Inspect the relevant page
before citing it as evidence for a current decision; unavailable sources stay explicitly unverified.

Pages inspected when authoring this contract (2026-09-28); this is not a fresh-check claim for later runs:

| Source                                                                        | Supported principle                                                                                | Application boundary                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Preproduction](https://book.leveldesignbook.com/process/preproduction)       | Specify what the player should learn, feel or do to guide scope.                                   | Our per-level learning row; not proof that a chosen curriculum works.                          |
| [Pacing](https://book.leveldesignbook.com/process/preproduction/pacing)       | Organize beats, information, intensity/recovery; teach/test/twist is one pattern.                  | Our challenge rhythm; not a mandatory linear difficulty ramp.                                  |
| [Critical path](https://book.leveldesignbook.com/process/layout/criticalpath) | Sketch intended main progression and major beats; ideal flow is not actual player behavior.        | Our route/strategy map; puzzle adjacency and recovery checks are adaptations.                  |
| [Metrics](https://book.leveldesignbook.com/process/blockout/metrics)          | Distinguish measured player/physics metrics from designer-selected building guidelines, then test. | Our units, clearance and rule constraints; no copied 3D dimensions or invented optimal tuning. |
| [Playtesting](https://book.leveldesignbook.com/process/blockout/playtesting)  | Set hypotheses/scope, observe behavior, collect notes/data and analyze.                            | Our learning/strategy checks; not observed success without an actual session.                  |

Example decision summary (illustrative, not a playtest result): "Keep the first blockout obstacle-free so
we can isolate whether the player understands merging. Basis: Preproduction's specific experience goal
and Playtesting's focused hypothesis; the obstacle-free setup is our proposal, not the book's prescription.
Trade-off: less early challenge. Check whether the player deliberately repeats the merge and transfers
that choice to one changed arrangement; no player session has run yet."
