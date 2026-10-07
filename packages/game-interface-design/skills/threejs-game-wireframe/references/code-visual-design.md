# Reference-driven web UI — code, not Figma

This package-local adapter uses the journey → wireframe → foundations → pilot → critique
method of `reference-driven-figma-design` (frontend-interface-design 1.8.4), not its output contract.
Do not invoke the Figma workflow, require editable source frames, or write to Figma for this lane.
No upstream plugin installation is required. Deliver real UI code and browser evidence, not a mockup image.

## 1. Preserve the game and inspect the host

Reuse the supplied journey, rules, states, art direction, and existing UI components. Inspect the actual
host framework, CSS/tokens, assets, and current screens before choosing a visual solution. Keep existing
React/DOM/R3F boundaries; no framework migration, new design-system library, or ECS rewrite for polish.
Do not change ECS rules, scoring, collision geometry, timing, input semantics, or lifecycle behavior.
For an existing UI-only request, skip core implementation stages and rerun relevant regression checks.

Explain a short numbered wireframe, primary action, key states, and preserve/change scope before editing.
Reuse existing wireframes when structure is unchanged; record the reuse. Respect `REVIEW_WAIT`.
The gameplay field remains dominant: HUD supports decisions, not a SaaS dashboard around a tiny canvas.

## 2. Inspect references, then choose one direction

Authority: supplied requirements → approved brand/art direction → existing code/tokens/assets →
observed references → new decisions. References inform composition, not permission to replace the brand.
Sufficient approved internal screens may be reused with a recorded rationale. Otherwise compare at least
two inspected references relevant to the changed role (game HUD, start menu, pause overlay, or results).
Use supplied captures, accessible real products, or available reference/browser tools; do not claim an
unopened search result as evidence. A supplied screenshot is evidence, not a license to copy its assets.

For each source record URL or local capture, observed hierarchy/composition, adopt/reject rationale,
and the target component. Separate observed facts from proposals; never fabricate sources or measurements.
If research is unavailable, continue safe implementation from existing assets and a labeled provisional
direction; record the gap and do not claim reference-verified design. Missing Figma access is irrelevant.

Direction open: compare two distinct small composition proposals on the same content, viewport, and game state;
select one within delegated scope, then code only that pilot. Color-swapped copies are not alternatives.
Direction locked or a narrow fix: reuse it, no mandatory exploration. Never call an agent choice user approval.

## 3. Bind foundations to actual code

Reuse existing semantic tokens; add only roles used by the pilot as CSS custom properties or the host's
existing theme mechanism. Keep one typography, spacing, color, radius, surface, and icon system.
Define a clear score/action/supporting-text hierarchy, deliberate whitespace, aligned edges, restrained
surfaces, and warning/success/disabled/focus roles with non-color cues. Use installed/system fonts and
licensed existing assets; do not fetch fonts, art, or new dependencies just to make the UI look expensive.

Map each changed component to its purpose, states, responsive behavior, input ownership, and token usage.
Use semantic DOM controls for HUD/menu interactions, visible keyboard focus, sufficient contrast, touch
targets, safe-area padding, and reduced-motion behavior. Decorative overlays must not steal gameplay input;
interactive overlays must prevent taps leaking into the game. Keep real copy and actual game data; retain
`simulated` labels at flow-prototype fidelity. CSS polish never proves that a simulated rule became real.
Menu, purchase, reset-progress and delete-save labels, error text and icon-button names follow
[product-copy.md](product-copy.md) unless the game's own content guide says otherwise; review findings cite its rule IDs.

## 4. Implement a representative pilot, inspect, then expand

Build one representative in-scope screen plus its most important changed state in the existing UI layer.
For new games, prefer the play screen plus an overlay; a menu-only request does not authorize changing gameplay UI.
Basic world geometry may remain greybox while the DOM HUD and menus receive deliberate visual design.
Open the running app and capture it at actual reading size. Compare reference and implementation for:
hierarchy, composition, rhythm, gameplay emphasis, consistency, and authentic game-specific content.
Remove unjustified card grids, pills, gradients, glow, glass, and decoration; this is not a style ban.

Fix at most the three highest-impact issues per round. Compare before/after on the same content, viewport,
and game state. Record capture paths, observed problem, changed component/tokens, preserved behavior,
and improvement or regression. One real critique → fix → recheck can suffice; use up to four rounds if
needed. A repeated composition failure reopens reference/layout choice, not another color tweak.
Expand to remaining in-scope screens only after the pilot has been visually checked. If browser access
is unavailable, deliver bounded code work and mark visual review `NOT_RUN` or `BLOCKED`, never verified.

## 5. Completion evidence

Inspect mobile at 320×568, a taller phone, and an agreed desktop width. Check start, play, pause, result,
and retry where in scope; record exclusions. Inspect overflow, long copy/scores, field visibility, overlay
occlusion, keyboard focus, touch input, and reduced motion. Rerun the existing behavior journey after polish.
A screenshot alone does not prove interaction, accessibility, performance, usability, or fun.

Keep the reference choices, token/component mapping, captures, top fixes, and remaining gaps in the existing
blueprint's Code visual design section, not a new parallel report system. Record visual review separately
as `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`, or `N/A` with evidence/reason; N/A is only for explicitly excluded
polish and never waives basic readability/accessibility. When `wireframe-report.json` applies, link that section
from `checks.browser.evidence` and put unresolved visual gaps in `open_risks`; do not add schema fields.
Browser interaction passing or `ready_to_run` does not establish visual approval. Report code delivered,
visual review, and unverified scope separately; no `FIGMA_READY` or polished-completion claim without evidence.
