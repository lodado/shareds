# Research and selection — pick verifiable candidates, internal assets first

Read first: [taxonomy → reference → adaptation](taxonomy-reference-workflow.md).

## 1. Search order

Internal inventory first; missing composition → real-screen search, missing assets → component search. Don't send taxonomy IDs to every MCP or treat the doc as a search-term checklist.

1. Existing Component Catalog
2. Existing Figma Library
3. Existing Approved Patterns
4. Current file's templates/variables/components/variants
5. External Figma Library / Community / official UI Kit (real editable assets)
6. Gate-approved variation/recombination / local derivative of a verified source

Terminology, observed screens, and editable assets don't substitute for each other; asset import alone doesn't finish selection. Skip external search for a role only when the internal asset is **verified and no comparison was requested**; otherwise apply the [component source gate](component-source-gate.md). A filled search count isn't a pass.

## 2. Internal inventory

Read real structure with Figma tools. Same name isn't same role — verify the instance's component, property, variant, auto layout, variable binding.

## 3. Base Figma template selection

Internal assets cover the range → select `internal-default` as Visual Source of Truth, skip external search. Otherwise search Figma Community, official UI Kits, trusted template libraries, SaaS kits. Score 0–5 weighted: Content/Product fit (20), Visual/Brand fit (15), Structural quality — real Auto Layout/Variables/Components/Variants (20), Coverage (10), Responsive readiness (10), Editability (10), Adaptation cost (10), Access/Rights (5).

Compare the top 2–3; candidate count isn't a target. Inspect strong candidates' internal structure. Mark web-preview-only `preview-only`, internally inspected `structure-inspected`, duplicated/edited `editable-verified`. Prefer simple + well-structured over flashy + badly structured. The selected template becomes the Visual Source of Truth.

## 4. Section reference research

Find candidates for sections internal assets can't cover, plus any section the user asked to compare. Component-fit gaps need real comparison of 2+ candidates at the [source gate](component-source-gate.md); a composition table doesn't substitute.

Sections: Product Screenshot Hero, Developer Tool Hero, Workflow/Product Demo, Before/After/Comparison, Version History/Diff, Integrations/Technical Explanation, Evidence/CTA.

Per candidate: problem solved, focal point, hierarchy, density, product treatment (crop/frame/annotation/scale), CTA placement, responsive behavior, fit, adaptation cost, adopt/reject, evidence (real URL/file/page/frame + observed state).

Refero is the primary composition/hierarchy researcher — only a real connected Refero MCP or authenticated `styles.refero.design` session, access result recorded. No fit case, or state/interaction/responsive unverifiable → open the real service and library in Aside/Browser. A search snippet or static screenshot doesn't confirm interaction.

## 5. Reference selection

Compare on the same 0–5 scale: Content Fit, Information Hierarchy, Visual Hierarchy, Product Screenshot Compatibility, Responsive Behavior, Communication Effectiveness, Current Design System Compatibility, Existing Component Reusability, Adaptation Cost.

Scores aid judgment; a hard-constraint violation excludes a candidate regardless of total. Give the reason as which question which structure solves and how it maps to existing components, not "prettier."

## 6. Reference Log

Record per major section — column list in [taxonomy-reference-workflow.md](taxonomy-reference-workflow.md). Component changes add the [source gate's evidence row](component-source-gate.md#required-evidence-row) to the same log; no separate catalog.

Multiple references, one final visual system — the Reference Log keeps external design languages from mixing.
