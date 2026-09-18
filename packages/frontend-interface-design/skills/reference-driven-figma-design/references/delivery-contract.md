# Delivery contract — hand off editable Figma and its verified scope

Read first: [edit contract](edit-contract.md); Source/Fidelity/Content/Layout gates recorded separately. Handoffs keep `schemas/design-delivery.schema.json` fields. The [Reference Log](taxonomy-reference-workflow.md) links via `source_trace.references` (`source`/`selection_reason`).

## 1. Deliver first

Hand off after the [HCI pre-design](hci-wireframe-workflow.md) explanation: real Figma URL; file/page/frame IDs and final frame name; state PILOT_READY / FIGMA_READY / INCOMPLETE / BLOCKED; where to review desktop/mobile or prototype. Blocked build → prep results reported separately, never as the Figma result.

## 2. Source trace

Library linkage, actual reuse, and visual quality are separate claims; linkage success alone does not mean the whole screen was applied. Distinguish official libraries from team/local derivative assets; a system-like name is no proof, so mark unproven ones derivative/unverified.

Per assembly unit: source URL/node or component key → applied node, `linked instance / copied frame / local derivative`, kept links, changed overrides. A copied frame is not a linked instance. Component changes link [component source gate](component-source-gate.md) evidence rows to `source_trace.references`. Any HOLD blocks FIGMA_READY and any "done/verified" report.

Also: base template and structure-check depth, components/variables used, reference per section, principle taken, traits not copied, Experiment/Approved changes.

For interactive scope, record prototype readback separately from visual inspection: the changed hotspot, trigger, action/navigation type, destination, and branches that were not specified or could not be verified. Preserve existing reactions and do not claim backend or production behavior from a Figma prototype alone.

## 3. Critique trace

Per round: top issues and fixes, viewports/states checked, AI slop removed vs kept, unresolved and unreviewed.

`iteration_count` = real `rounds` length, each with its own version and observations. No problems → `top_issues`/`fixes` empty, `result` names the criteria reviewed. Never invent issues to fill rounds. Reconcile requested sections, viewports, states against the done list with tool results; schema validity is neither scope match nor observation.

## 4. Result states

- **FIGMA_READY** — editable Figma, full agreed scope, critique plus re-review after fixes, log entries. 2–4 rounds is guidance. No in-scope unresolved/unreviewed.
- **PILOT_READY** — agreed pilot only (usually 3; 1–3 small scope). Not full-page completion.
- **INCOMPLETE** — frames exist, asset/state/responsive/critique gates remain.
- **NEEDS_INPUT** — user decision changing direction required.
- **BLOCKED** — Figma write, source, permission, or paid/license approval missing.

## 5. Completion vs approval

Report separately: `technical` (read/write and structure checks), `design-self-review` (ready / incomplete / unreviewed), `user-acceptance` (accepted / rejected / not-obtained). FIGMA_READY is self-review, not user approval, usability testing, or frontend QA.

## 6. Forbidden handoffs

Invented Figma URL, node ID, component, or variable; PNG or HTML output called a "Figma mock"; static preview ahead of the link; unfinished pilot called full-page completion; code generation counted as delivery; fake metrics, testimonials, or logos.
