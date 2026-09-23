# Game delivery contract

Use [request schema](../schemas/game-request.schema.json) and [delivery schema](../schemas/game-delivery.schema.json). These are local fork schemas, not modifications of the original frontend schemas.

## Readiness dimensions

- planning: DRAFT, PLAN_READY, INCOMPLETE, BLOCKED. PLAN_READY means a coherent scoped plan with rule/flow/feedback/experiments and no open planning blocker; not a tested game.
- figma: not_requested, PILOT_READY, FIGMA_READY, INCOMPLETE, BLOCKED, NEEDS_INPUT. PLAN_ONLY requires not_requested. FIGMA cannot be silently reported as not_requested.
- playable: not_requested, not_run, planned, tested.
- usability, fun, business: not_run, planned, observed. Observed is scoped evidence, not a universal success verdict.
- user_acceptance: not_obtained, accepted, rejected. Acceptance/rejection needs a real response reference.

## Artifacts

Five logical kinds: game_design, ux_flow, visual_feel, validation_handoff and reference_log. They may share a combined document path, but each kind has an ID and scope. Use relative files inside the delivery directory; do not overwrite user originals.

Each reference log source row may retain `source_trace.references` with source, selection_reason, scope, adoption and uncertainty. The manifest evidence list links to actual supporting locations. No mandatory remote tools for PLAN_ONLY; mark unavailable observations explicitly.

PLAN_READY requires all five artifact kinds complete, rules, state/flow, screens, feedback, at least one experiment and trace rows. It requires described recovery and next states, not a specific amount of text. Readiness cannot conceal open in-scope blocking issues or stale artifacts.

## Figma evidence

PILOT_READY/FIGMA_READY require actual Figma locations, declared source/structure/visual checks and supporting structure/visual evidence. Interaction scope also needs prototype readback and evidence. Static-only exceptions are explicit. FIGMA_READY cannot have an unresolved required branch or blocking Figma/rights issue. PILOT_READY is not full scope.

The validator verifies presence and consistency of declarations, not whether a URL was accessed, a screenshot inspected, or evidence is truthful. Never fabricate evidence to satisfy it.

## Non-Figma evidence

`playable: tested` requires a playable_test evidence locator; observed usability/fun/business require corresponding observation locators. Planned experiments are not observations. Real human/game/device tests remain separate from document checks. No human response → not_obtained.

## Validation

From package root:
`node scripts/validate-design.mjs path/to/delivery.json`

Install the listed dev requirements if JSON Schema support is absent. Validation includes files, local path safety, duplicate/dangling IDs, primary action coverage, trace references, readiness/evidence consistency and basic declared ad/lifecycle constraints. It does NOT execute a game, verify external links or run a model-behavior evaluation.

Run self-review of substantive quality after structural checks. Deliver the selected idea, concrete decisions, wireframes and artifact locations first, then evidence/assumptions/gaps. Preserve requested mode and actual verification boundaries.
