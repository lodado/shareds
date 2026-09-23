# Critique and refinement — fix highest-impact problems, don't discard the whole thing

Reopen the real Figma canvas/preview right after the first draft. Node-creation response or success message is not visual review.

New screens or composition changes: comparison contract in [taxonomy → reference → adaptation](taxonomy-reference-workflow.md). Observed reference beside applied capture; record intentional deviations from source.

## 1. Six-axis critique

Classify cause with [five planes](request-contract.md) §3 first; no Surface polish over scope/flow/placement defects. Reopen only the cause and its dependents.

- **Hierarchy** — area/position/contrast/spacing agree with type size; key message reads strongest.
- **Composition** — each section answers User Question ↔ Required Content; reference's structural principle survives.
- **Rhythm** — deliberate emphasis/rest pacing, not identical density everywhere.
- **Product Emphasis** — real screenshot/demo not shrunk to decoration or buried under floating UI.
- **Consistency** — type/color/spacing/radius/surface/icon one system, no mixed reference languages.
- **Authenticity** — product's real content, not a generic AI SaaS template renamed.

## 2. AI-slop detection

Ground each in PRD, visual system, selected reference, or usability rationale; remove if ungrounded: excess cards/pills/gradients; meaningless glassmorphism/glow/floating UI; everything rounded or centered; repeated bento grids; meaningless charts; fake metrics/testimonials/logos; identical density across sections; fake product UI passed as real. Flags purposeless decoration, not a style ban.

## 3. Iteration method

Abstract feedback becomes a [selection-region before/after](visual-direction.md#3-targeted-feedback): target, problem, task impact, change/keep scope. Alternatives comparison only when direction is undecided.

Rejected for reference structure/pattern mismatch → back to source selection/mapping immediately, not after two rounds. No structural fix reported as font-size/card-height tweaks. Before/after in the same viewport/state; record changed node and observed difference. "Improved" = confirmed difference, not a save or tool success.

At most 3 highest-impact problems per round; don't pad. Touch only frames/components tied to those; don't regenerate the whole page. Loop: V1 → top 3 fixes; V2 → remaining high-impact fixes; V3 → polish; V4 only if needed. Prefer 2–4 meaningful iterations; a color tweak or unobserved resave doesn't count, and one real critique+fix+recheck can suffice. Same problem unimproved two rounds running → back to source selection/mapping/asset conditions.

## 4. Round record

Per round: page/frame + viewport/state inspected, problems and impact, chosen fixes, changed frame/component/variable, what was kept, improvement/regression vs. previous round, remaining unresolved. Canvas keeps final frame + concise history only, unless comparison copies were requested.

## 5. Completion gate

Not FIGMA_READY if: never reopened for review; an agreed desktop/mobile/state unreviewed; core product asset is a real-looking placeholder; hierarchy/content-fit failure covered by polish; no critique-and-recheck record; references' visual systems mixed.

Record `design-self-review: ready | incomplete | unreviewed`. `user-acceptance` is `accepted` only with a real user response; self-review never substitutes.
