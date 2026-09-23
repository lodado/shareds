# A small implementation contract, not an engine

Describe `input → commands/rules/simulation → rendering` and `domain events → HUD/audio/storage/analytics`, with platform services behind an explicit boundary. Explain ownership for frame data, run state, UI state and durable data. Small direct calls may be better than a global event bus.

Three.js choice: what visual benefit warrants it? Select 2D rules/physics vs constrained/full 3D from the actual decision space. Define camera, plane, coordinate transformation, visible/judged geometry and collision tolerances. Do not mandate a physics engine for simple overlap arithmetic.

Time model: authoritative progression, pause conditions, fixed-step or suitable alternative, timestep limits, render interpolation if useful, background recovery. A fixed-step simulation or shared random seed alone does not guarantee exact cross-device replays. Never re-score cosmetic animations.

Event table: ID, condition, payload, owner, consumers, run/request identity, duplication and ordering rules, durable side effects. Replay/reset must clean old gestures, listeners, timers and entities; late callbacks are matched to their originating run/request.

Web/mobile scope: warm/cold load, audio unlock, context loss, page lifecycle, screen resizing, browser back, touch cancellation, persistence failure, offline behavior only when promised. DOM overlay capture must not leak input into the game.

Budgets are hypotheses until measured: identify a device/browser/OS, resolution/DPR, network profile, assets, first-interaction load, frame-time distribution and degradation strategy. Low-quality mode may reduce shadows/effects but not invisible threats or essential timing. Use current official API docs for concrete implementation advice.

If competitive rankings are requested, separate local presentation from trusted score submission and anti-abuse design. Do not invent a server for a personal-best prototype. No multiplayer backend or general-purpose engine.

Implementation handoff goes to the package-local [Three.js Game Wireframe](../../threejs-game-wireframe/SKILL.md) skill. For a `PLAYABLE_GREYBOX`, its contract applies: core rules run in a headless ECS inside the play page's FSD `model` segment, with one documented system order. `LAYOUT_ONLY` needs no ECS. An existing repo keeps its framework and architecture; do not migrate a working project to FSD just to host a prototype. Name the intended fidelity level and the rules each headless test must cover.

Handoff ends with smallest playable slice, deterministic rule tests where possible, lifecycle integration tests and real-device feel/usability tasks. Planning artifacts are not implemented software.
