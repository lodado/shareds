---
name: reference-driven-game-design
description: 'Design mobile-web games from core play decisions through player journeys, HUDs, game feel, business hypotheses and a testable implementation handoff. Optionally produce editable Figma game UI. Use for casual/merge/stack/arcade game planning; not general product UI, game implementation, or an automatic claim of fun.'
allowed-tools:
  - Bash
metadata:
  short-description: Design meaningful play and verifiable game UX
---

# Reference-Driven Game Design

An **independent game-design fork**, not a wrapper around a frontend plugin.
All execution references live inside this skill. Read only the references needed for the current step.
Use the user's language for deliverables. Internal identifiers may stay in English.

## Scope and non-negotiables

- Deliver **specific rules, meaningful choices, player flows, HUDs, feedback and testable hypotheses**, not a feature catalog or a generic game dashboard.
- Default `PLAN_ONLY`: design documents, text wireframes, Mermaid source, evidence log and a structured delivery manifest. No Figma write permission is needed for this mode.
- `FIGMA`: the same design plus actual editable game UI and approved prototype connections in an authorized target. No permission/source → block only dependent Figma work, continue independent planning. Never silently downgrade a requested Figma delivery to a completed plan.
- Game code and playable prototypes belong to the package-local [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md) skill and need an explicit implementation request. 3D assets, external publication, purchases and production integrations require separate explicit scope. A Figma mock is not a game simulation.
- Confirmed facts, user decisions, agent proposals, assumptions and unknowns are different. No fake personas, references, metrics, playtests, permissions or node IDs.
- Reuse existing decisions. For missing reversible details, propose a labeled default. Do not interview indefinitely. Unresolved material rules remain provisional; never assume authority, purchase consent or policy.
- Separate **friction to remove** (confusing UI, repeated setup) from **challenge to keep** (timing, space, risk). A shortest-click path is not always the best game.
- No account/store/ad before first meaningful play by default. Monetization is not a substitute for the core loop. Scope exceptions need a reason.
- The metadata and checkers are contracts, **not runtime enforcement hooks**. Static checks and self-review cannot establish fun, usability or actual Figma behavior.

## Readiness and evidence

Keep independent dimensions in [delivery contract](references/game-delivery.md):
`planning`, `figma`, `playable`, `usability`, `fun`, `business`, `user_acceptance`.
A complete plan can coexist with untested fun. `FIGMA_READY` requires actual editable artifacts and readback; a token table cannot pass it.
Track issues by scope and severity. Unresolved in-scope blocking issues prevent that dimension's readiness; unrelated unknowns do not halt safe work.

Stable trace: `journey → rule/requirement → screen/state → transition/feedback → experiment`.
Reopen the earliest affected decision when evidence changes. Mark only its dependents stale.

## Stage 0 — Intake and constraints

Read [request contract](references/game-request.md) and [checkpoint protocol](references/checkpoint-protocol.md).
Inspect provided assets and existing game/repo before proposing replacements. Confirm mode, target, authority and preservation scope.
Default assumptions may be mobile web, portrait, one-handed, fixed camera, solo developer, Three.js visual layer; label them, never override supplied input.
If no game idea exists, compare at most three **different core decisions**, select one provisional concept and continue. No three reskins of one mechanic.
Write the experience promise, exclusions, hardest unproven assumption and source inventory. Start the Reference Log.

## Stage 1 — Core play and learning

Read [theory to decisions](references/theory-to-decisions.md) and [core loop](references/core-loop.md).
Define observation → prediction → choice → input → rule result → feedback → next choice.
Specify scoring/progression, failure, random information, simultaneous events, restart and novice/expert decisions.
Explain why the player might replay, plus a counterexample that would invalidate the fun hypothesis.
Do not invent precise book quotations, chapter numbers or universal fun formulas.
Ready: the proposed rules are coherent enough to simulate on paper and identify a falsifiable experiment; this is not a fun-test pass.

## Stage 2 — Player journey, state and wireframes

Read [player flow](references/player-flow.md) and [state contract](references/game-state.md).
Define the first meaningful play event, not tutorial dismissal. Draw separate proposed navigation and simulation/lifecycle diagrams as Mermaid **source**.
Specify success, failure, immediate replay, pause, cancellation and applicable recoveries. Distinguish screens from simulation states.
Create 1–3 representative **text wireframes with real UI copy**. Explain action order, next states, input ownership and reference rationale before any Figma write, including test imports.
If explicit review-wait exists, honor it. Explanation is not approval.
Ready: every primary action has a next state, feedback and recovery; game rules and navigation agree.

## Stage 3 — Reference, art direction and game feel

Read [reference research](references/reference-research.md), [visual system](references/game-visual-system.md), and [game feel](references/game-feel.md).
Separate observed game behavior, screen evidence, editable UI assets and licensed game assets.
Research rules/flow first; editable source comparisons apply to **Figma adoption**, not to original game-rule ideation.
Compare two genuine visual directions only if direction is open. Hold content, viewport and play state fixed. Reuse approved direction otherwise.
Specify world/HUD/control/feedback layers, collision readability, camera and occlusion. Define only pilot tokens/components.
Record action-level input/response/visual/audio/cancellation/reduced-effect feedback. Initial timings are tuning hypotheses, not measured latency.
Ready for planning: a concrete visual and feedback specification plus honest source gaps. It does not claim imported assets or playable feel.

## Stage 4 — Business, technical handoff and experiments

Read [business design](references/business-design.md), [technical handoff](references/technical-handoff.md), and [validation](references/playtest.md).
Separate momentary enjoyment, replay, return and monetization. Add at most one small meta-system unless scope justifies more.
Verify current platform rules only for the chosen channel using official sources; leave unverified policy provisional. Do not bake changing revenue shares into the skill.
Specify simulation, rendering, UI and platform responsibilities and the prototype fidelity level. No backend or framework migration; a playable greybox follows the headless ECS contract of the implementation skill.
Define device/performance assumptions, interruption contracts, event semantics, three high-risk experiments and metric denominators/cohorts.
Ready: a developer knows what to build/test next and which decisions are not validated.

## Stage 5 — Optional editable Figma pilot

Skip writes in PLAN_ONLY, recording `figma: not_requested`.
For FIGMA read the package-local [Figma workflow](references/figma/workflow.md) and linked contracts; no upstream plugin installation is required.
Verify the actual provider's tool descriptions and required companion guidance. Use a separate authorized area, preserve originals.
Source gate → import preflight → 1–3 representative screens/states → direct readable inspection → top-three targeted fixes → reread prototype connections → expand only after pilot checks.
Never present screenshots or a frame containing one full-screen image as editable UI. Concept art is allowed only as labeled world/background content, not a substitute for editable HUDs or unprovided production assets.
Successful tool writes, valid JSON, linked instances and visual quality are separate claims.

## Stage 6 — Self-review and delivery

Read [game delivery](references/game-delivery.md). Use the local [templates](templates/README.md).
Validate the manifest with `node scripts/validate-design.mjs <delivery.json>` from the package root. Record failure honestly; a validator's success is only a document-contract check.
Deliver selected concept, core decision, first meaningful action, key wireframes, artifacts and largest untested risk first.
Then report each evidence dimension, sources, unresolved blockers and the next smallest playable experiment.
Do not report a planning document as a tested game, a Figma navigation link as backend integration, or self-review as user approval.

## Context discipline

One owner makes final rule and direction decisions. Optional subagents receive bounded tasks and must return sources, findings and uncertainty; no subagent exists merely because a prompt mentions one.
At each checkpoint persist decisions/artifacts/open issues/next work, not private chain-of-thought.
Resume from that record and verify assumptions before expanding. No unbounded recursive refinement.
