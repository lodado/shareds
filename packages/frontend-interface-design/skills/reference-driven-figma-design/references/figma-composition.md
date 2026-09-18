# Figma composition — translate structure into the existing system's language

Read first: [edit-contract](edit-contract.md), [taxonomy → reference → adaptation](taxonomy-reference-workflow.md).

Apply edit-contract's role/change-allowance table; verify transfer/override with `read-back` — failure isn't license to recreate. Validated-source structure may become a local derivative: record preservation, link state, token consistency, rationale. Full expansion only after the pilot passes review.

## 1. Canvas safety

New screens, major changes, wireframe requests: send the [HCI → reference → wireframe](hci-wireframe-workflow.md) pre-explanation before the first write, with sketch numbers linked to the source→target mapping; reuse originals instead of redrawing sketch boxes.

Confirm target file/page/frame/component set/variable collection/version on opening — never reuse IDs from names or memory.

- Never overwrite original templates or approved pages; work in a Working Page, duplicated frame, or Experiment Area.
- Record real page/frame IDs at each checkpoint.
- Prefer component instances/properties; avoid unnecessary detach.
- Editing published library components needs authorization separate from canvas editing.
- Destructive replace, library publish, external sharing need user approval.

## 2. PRD → design problem

Don't move PRD sentences into sections verbatim. Resolve each into: the question the visitor asks here, what they must understand or decide, what real content/evidence/action/assets exist.

Summarize each section as `show <protagonist> as <relationship> so the user gets an answer to <question>, then leads to <next action>`. Don't pack everything into one card.

## 3. Reference → Figma mapping

Map element by element before copying an external pattern, after the [component source gate](component-source-gate.md). Read actual names from Figma — an example name is not a real ID.

Map `screen/section → composite component → primitive`. Search the priority order for a fitting large unit first; before building, record original file/node, reuse unit, allowed changes, gaps; link the applied node after assembly. Check connected-library composites first — one reused button doesn't license redrawing the rest.

Priority: (1) existing component/variant, fit verified; (2) external component/frame via the source gate; (3) composition of existing primitives, rejection reason recorded; (4) new component/Experiment, within gate and approved scope. Don't redraw rectangle+text when an existing component fits; a new component starts as an Experiment, API constrained to real content.

## 4. One visual system

Keep as one system: typography, semantic color/mode, spacing/grid, radius/border/elevation, button/card/nav/form/icon language, screenshot treatment.

External reference contributes structure, not styling: section order, text/image proportion, screenshot crop, CTA-evidence adjacency, comparison/workflow relationships, rhythm. Reuse an external hero composition without its font, color, radius, glow. If reskinning loses the source's core hierarchy, redo the mapping.

## 5. Pilot

Map the whole page, build only ~3 sections on canvas: hero, strongest product/evidence section, workflow/explanation section — swap by PRD priority. Single-screen or partial edits: 1–3 sections/states within agreed scope.

Real-length copy, real screenshots, real brand assets; mark placeholders explicitly. Don't shrink an evidence screenshot into decoration. Check hierarchy/rhythm on the agreed device; build mobile in the same pilot if in scope — narrow screens re-decide order, crop, grouping, CTA priority, not scale-down.

Write PILOT_READY only after a real Figma preview and the readability check in [source gate §4](component-source-gate.md).

## 6. Full expansion

Extend scope keeping the pilot's visual system, rhythm, screenshot language.

- Vary each section's weight/density; don't repeat the same grid/center alignment.
- Cover needed states (hover/focus/open/selected/error/empty) and transitions per scope.
- Preview the real prototype — static frames don't verify interaction.
- Check wrapping, overflow, target size, contrast, focus order on desktop/mobile.

Keep node names role/state-revealing; no `Frame 123` or `Rectangle 54` in handoff-critical structure.
