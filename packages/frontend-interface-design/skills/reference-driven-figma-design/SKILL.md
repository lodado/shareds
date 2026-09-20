---
name: reference-driven-figma-design
description: 'Define core journeys, requirements and wireframes, brand foundations and semantic tokens, then compose and verify editable Figma product or landing designs. Use for Figma-first design and appearance-preserving design-system refactors; not frontend implementation, design-to-code, or static-image-only delivery.'
metadata:
  short-description: Build editable Figma designs from verified references
---

# Reference-Driven Figma Design

Core journey → Requirements and wireframes → Brand, foundations, semantic tokens → UI composition and verification. Translate researched structure into the existing visual system; ship editable Figma.

Fix mode (ASSEMBLE / LOCALIZE / FIDELITY / RESKIN / REDESIGN) and per-section preserve/change scope before editing: [edit-contract.md](references/edit-contract.md). Verify linkage, fidelity, content, layout independently.

## Decision dependencies

Strategy → Scope → Structure → Skeleton → Surface are conceptual dependencies.
The four execution stages below are artifact-readiness checkpoints, not a rigid waterfall:
read-only discovery may overlap, but dependent outputs stay provisional until material
upstream decisions are resolved. Reuse verified decisions; do not repeat settled interviews.
Small structure-preserving edits reuse the existing journey and system with a recorded skip.
Later evidence reopens only the earliest affected stage; mark dependent artifacts stale and
reverify them. The independent `ux-flow-diagram` skill remains explicit-only, not an automatic step.

## Production method

Reference assembly = pull an editable source frame/component/instance and compose. Never redraw from a screenshot, replace UI with an image, or switch to code. Reference screenshots are comparison evidence; real product screenshots and content assets inside the source may stay. Source unobtainable → HOLD. Large assets first: [figma-composition.md](references/figma-composition.md). "한방에/알아서" (one-shot) = finish selection→assembly→edit→review internally; never waives verification.

## Explain HCI + rough wireframe before editing

New screen, major structure/behavior change, wireframe request → [hci-wireframe-workflow.md](references/hci-wireframe-workflow.md). **Before the first write to the target Figma**, show: numbered text wireframe, key states, adopt/reject rationale, user flow, Figma mapping. Explanation is not approval. Small structure-preserving edits reuse existing rationale.

Direction open → [visual-direction.md](references/visual-direction.md): compare options on one representative section, pick, expand. Same content/viewport/state across before/after; a wireframe explanation is not visual verification.

## Taxonomy → reference → adaptation

Before searching → [taxonomy-reference-workflow.md](references/taxonomy-reference-workflow.md). After INTERNAL_FIT, translate entry definition and fit/avoid into search intent; verify **taxonomy rationale / observed screen composition / actual editable asset** separately. Never draw off a keyword. Templates are a start, not a ceiling — on mismatch adapt other approved-scope sources; record source and link state.

## Output boundary

Editable frames, component instances, variables, auto layout in a real Figma file. No React, HTML/CSS, Next.js, Tailwind, design-to-code unless implementation is explicitly asked — even then completion here is the Figma handoff. PNG, docs, code, generated images never replace editable Figma.

## Component source gate

Pass [component-source-gate.md](references/component-source-gate.md) when a needed role, content, state, or device variant is missing, or comparison is requested.

- Gaps: **two or more distinct external sources**, compared on the same content. Search hits, screenshots, one library's variants don't count.
- No evidence → stop adoption, expansion, completion claims. "ㄱㄱ", "빨리", "한방에" are not waivers.
- `PILOT_READY`/`FIGMA_READY` and "verified" only after the gate plus review at real reading size; zoomed-out shots aren't evidence.

## Capability gate

Never infer capability from a product name. Read the provider's tool descriptions and companion skill first — `figma-use` when the official provider requires it, `figma-generate-design` for pages, `figma-generate-library` for components.

- Final production **requires Figma read/write**: file/page/frame/Variables/Components/Auto Layout, separate work area, reopen result. Never invent node IDs or versions.
- No write → BLOCKED, request permission. Research notes are never completion or a gate pass.
- Components prefer editable Figma Library/Community/UI Kit; composition prefers Refero. Thin results → Aside/Browser research.
- Preview, structure inspection, write permission are different evidence; never claim what you didn't access.

## Design authority

PRD / Product Requirements → approved Brand Direction → existing internal Design Assets → selected Figma Base Template → existing Figma Variables / Components → approved previous design patterns → Refero References → external References via Aside/Browser → new design decisions. Lower never overwrites higher.

**Visual System** (internal system + Figma Template) owns typography, color, spacing, grid, radius, borders, shadows, buttons, cards, navigation, forms, icons. **Composition** (Refero + external examples) supplies section structure, hierarchy, screenshot placement, text/image relationship, CTA. Never copy external color, font, radius, shadow with the structure; translate into current components and variables. Imported kits: reuse gate-adopted instances; record overrides and link state.

## Execution status

- DISCOVERED — sources, permissions, assets, decisions separated
- NEEDS_INPUT — direction-changing decision open
- BRIEF_READY — contract and source hierarchy ready
- PILOT_READY — core pilot built and critiqued
- FIGMA_READY — full scope editable, reviewed, recorded
- INCOMPLETE — comps exist, gate unmet
- BLOCKED — permission, asset, or policy blocks progress

## Execution loop

**Intake and read-only inventory.** Normalize via [request-contract.md](references/request-contract.md).
Inspect the target, internal Catalog/Library, existing flows, tokens, assets, rights, and tool
capabilities first. Separate observed facts from proposals. Candidate discovery can start now;
base/template selection is not finalized before the journey and wireframe checkpoints.
At every stage, use the embedded user-facing interview in the request contract when a material
decision remains unresolved. Verified existing evidence can satisfy a checkpoint without new work.

### Stage 1 — Core journey

Define the primary user/context, trigger, entry, core task, completion condition, first-value
moment (activation) for first-time users, main path, recovery, policy boundaries, and exclusions. Link stable journey-step identifiers to the brief.
Ask about unresolved purpose or completion before dependent visual preferences.
Ready when no unresolved user, outcome, or policy decision would change the core flow.
See [hci-wireframe-workflow.md](references/hci-wireframe-workflow.md).

### Stage 2 — Requirements and wireframes

Translate the journey into screen purposes, required content, actions, states, acceptance checks,
and numbered low-fidelity wireframes. Explain success, back/cancel, error/retry, and focus intent
before the first target Figma write; a sketch is not user approval. Honor explicit review-wait.
Ready when important actions have a next state and recovery rule, with no material journey conflict.
UX is defined in these first two stages, then realized and verified in Stage 4.

### Stage 3 — Brand, foundations, and semantic tokens

Follow [foundations-brand-workflow.md](references/foundations-brand-workflow.md): preserve or
resolve brand authority → foundation sources → semantic roles → component contracts.
Select the base using [research-selection.md](references/research-selection.md); sufficient internal
assets mean `internal-default`. A refactor preserves existing appearance and behavior, not a redesign.
Before adoption, run the bounded import/copy preflight after explanation and any review-wait.
Read access is not import access. Map verified-fit internal → gate-adopted external → permitted primitive.
Ready means actual in-scope Figma Variables, Styles, editable components, and verified bindings,
not only a token table. Missing required source keeps dependent production blocked or incomplete.

### Stage 4 — UI composition and verification

Compose the wireframes with Stage 3 assets in a recorded Working Page / duplicated frame /
Experiment Area; preserve originals and avoid detach. Build a representative pilot with real copy
and assets (~3 sections; partial edits stay at 1–3), before expansion.
Via [critique-refinement.md](references/critique-refinement.md), fix the 3 highest-impact problems
over 2–4 iterations; verify Source/Fidelity/Content/Layout independently at real reading size.
**Prototype the approved flow.** For new or behavior-changing interactive work, attach the approved core success, error, cancel,
back, and overlay connections and reread reactions per [prototype-workflow.md](references/prototype-workflow.md).
Preserve existing connections; prototype evidence is not backend or usability proof.

Only after pilot verification, expand to the remaining agreed screens, widths, and states and
review again. Accumulate via [asset-learning.md](references/asset-learning.md):
Experiment → Real Page Usage → Visual Critique → Reuse Evaluation → Approved Pattern.
Hand off location, source trace, critique, prototype readback, Reference Log, and unverified scope
per [delivery-contract.md](references/delivery-contract.md). Preparation is not completed product UI.

## Autonomy and stop conditions

Decide reversible details inside approved scope. Follow [request-contract.md](references/request-contract.md)
§3 for material user decisions and technical blockers: normally one question per round, no total
question quota. Never infer approval from silence or fabricate missing policy. Stop dependent work
for unresolved scope, authority, permission, destructive changes, sharing, purchase, or license acceptance;
continue only independent safe work. A technical blocker does not reopen settled product questions.

## Completion gate

Prompt contract, not a runtime hook; does not physically block MCP calls. Self-review is not user approval or independent QA.

FIGMA_READY only when all hold.

- HCI pre-explanation applied → wireframe, states, rationale shown before editing and checked against the result; skips recorded.
- Every changed role: gate pass or reuse rationale logged.
- A real Figma URL with exact file/page/frame identifiers is deliverable.
- Result editable; component/variable/auto-layout verified; desktop/mobile and core states opened directly; affected-plane rationale linked.
- Hierarchy, composition, rhythm, emphasis, consistency critiqued.
- AI slop check passed with real re-review and recorded top fixes.
- Reference Log and Catalog changes persisted; no fake metrics, testimonials, product UI, or information you didn't access.

Report per [delivery-contract.md](references/delivery-contract.md); never hide unverified scope.
