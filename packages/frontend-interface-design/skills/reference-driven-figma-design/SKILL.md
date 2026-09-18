---
name: reference-driven-figma-design
description: 'Plan task flows with HCI, compare verified references, explain rough wireframes before Figma editing, then compose and critique editable Figma product or landing designs. Use for Figma-first design work; not frontend implementation, design-to-code, or static-image-only delivery.'
metadata:
  short-description: Build editable Figma designs from verified references
---

# Reference-Driven Figma Design

Understand → Research → Sketch & Explain → Map → Compose → Critique → Refine → Accumulate. Translate researched structure into the existing visual system; ship editable Figma.

Fix mode (ASSEMBLE / LOCALIZE / FIDELITY / RESKIN / REDESIGN) and per-section preserve/change scope before editing: [edit-contract.md](references/edit-contract.md). Verify linkage, fidelity, content, layout independently.

## Five planes

Strategy → Scope → Structure → Skeleton → Surface are decision dependencies, not waterfall gates: a result above an open decision is a hypothesis; reopen only the causing plane.

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

1. **Normalize.** Fit request to [request-contract.md](references/request-contract.md); never re-ask answered questions.
2. **Inspect internal first.** Target Figma, Catalog, Library, approved patterns, variables/components/variants.
3. **Model task, translate PRD.** HCI brief; per section: User Question, Communication Goal, Required Content, Evidence, Desired Action, Assets.
4. **Select base.** Compare per [research-selection.md](references/research-selection.md); internal system covers scope → `internal-default`.
5. **Research references.** Read-only: screens, behavior, source, rights.
6. **Sketch, explain, map.** Wireframe first; imports are writes. Map onto verified-fit internal → gate-adopted external → permitted primitive.
7. **Compose safely.** Preserve source; build in Working Page / duplicated frame / Experiment Area; avoid detach.
8. **Pilot first.** ~3 sections, real copy and assets; partial edits stay at 1–3.
9. **Critique and refine.** Find the causing plane; via [critique-refinement.md](references/critique-refinement.md) fix the 3 highest-impact problems over 2–4 iterations.
10. **Expand.** Full scope, desktop/mobile, required states, prototypes; review.
11. **Accumulate.** Per [asset-learning.md](references/asset-learning.md): Experiment → Real Page Usage → Visual Critique → Reuse Evaluation → Approved Pattern.
12. **Handoff.** Location, source trace, critique, Reference Log, unverified scope per [delivery-contract.md](references/delivery-contract.md).

## Autonomy and stop conditions

Decide detail — spacing, variant, section order — inside approved scope. Ask only on contradictory requirements, a fallback that changes the result, needed auth or permission, or destruction, sharing, purchase, license acceptance. Then per [request-contract.md](references/request-contract.md) §3: 1–3 questions max, each with a recommendation and its impact.

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
