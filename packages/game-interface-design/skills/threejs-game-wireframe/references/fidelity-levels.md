# Fidelity levels

Pick the lowest level that answers the plan's current question. The level is recorded in the blueprint and the report.

| Level              | Question it answers                                      | Real                                                      | Simulated or absent                                                             | ECS                                 |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `LAYOUT_ONLY`      | Do the field, HUD and thumb zones fit the viewport?      | Three.js scene, camera, HUD placement, safe areas, resize | all rules                                                                       | N/A                                 |
| `FLOW_PROTOTYPE`   | Can a player move through start → play → result → retry? | screen and state transitions, real input handling         | round outcomes, timers, scores — each labeled `simulated` in UI code and report | optional; a state machine is enough |
| `PLAYABLE_GREYBOX` | Is the core choice readable and does failure feel fair?  | core rules, scoring, failure, restart, pause              | art, audio, meta systems, persistence                                           | required, headless                  |

Rules:

- `PLAYABLE_GREYBOX` is the default for "make it playable" or "build a prototype".
- "Only the layout" or "just the HUD placement" → `LAYOUT_ONLY`.
- "Clickable flow" or "screen transitions" → `FLOW_PROTOTYPE`.
- A `simulated` value never feeds a readiness claim. A flow prototype does not test fun.
- Raising the level later reuses the same slice: `LAYOUT_ONLY` ui → add `model/ecs` without moving files.
