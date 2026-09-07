# Korean blog voice pilot, 2026-09-07

## Scope and status

User-authorized single-author, historical public-blog pilot. This report contains no source passages, author-specific profile rules or generated imitations. Those artifacts are local and gitignored under `.blog-voice/handface3/benchmark-20260907/`.

Human target-voice preference, naturalness and editing effort: **human_review_pending**. Do not infer a winner from test counts, successful JSON validation or a model's self-review.

## Frozen design

- Six PROFILE posts, two separate validation posts, one user-supplied held-out post. The collector alone accessed the held-out text. Writers and the coordinator did not read its title/body. Final human review may use the supplied URL.
- Nine-document cross-split near-duplicate audit checked all 36 pairs (20 cross-split pairs) and found nine groups, zero near-duplicate groups at character-5-shingle Jaccard ≥0.8. The fixed 6/2/1 assignment was unchanged. Six independent groups within PROFILE, below the analyzer's ten-group threshold. Both profiles are explicitly exploratory, not activated as validated profiles. The archive offered 295 posts, but only this bounded historical sample was collected for evaluation. This is not a representative archive-wide study.
- Three synthetic briefs: fictional utility apps, a fictional book exchange, and a fictional narrator's note-taking retrospective. Identical factual input, Korean language and target body length of 650–900 non-whitespace characters for each method.
- Three methods: source examples only, frozen existing skill, and improved skill. One independent fresh writing context per method/case. Planned total: nine final texts, one sample per cell, no best-of-N selection.
- Baseline skill frozen at git commit `3b4951519fa7ef97d1071a2f00729b8de02c1a47` before changes. Both skill arms derive profiles from the same six sources. Source-only writers also receive verified title metadata. Improved analysis adds titles as real heading blocks with provenance, not invented evidence pointers.
- Host route: `OpenAI/gpt-6-astra`, inherited default max effort for all writing cells. Seed and temperature are not exposed. Token budgets are not equalized. This compares end-to-end workflows, including their planning/review behavior, not the isolated causal effect of one instruction. Model-produced profiles also differ, so this is not a profile-controlled ablation.

## Improvement rationale and sequence

Repository/reference inspection and failing instruction-contract tests motivated contextual Korean analysis, `title_craft`, a per-run voice brief, source-supported target resemblance review, and explicit pending human evaluation. Those general changes preceded completion of the separate baseline development draft. This was **not** a claim that all changes followed an observed model RED.

The separate development brief concerned rainy-day umbrella preparation and was never used as a final comparison case. Its single baseline draft repeated forecast uncertainty, umbrella-size tradeoffs and handling precautions. A provisional coordinator review led to the additional rule against padding sparse content or turning semantic safeguards into repetitive reader-facing disclaimers. Necessary qualifications must remain. This diagnosis is not a human verdict on author similarity. No final comparison output was used to tune the candidate before freezing.

Relevant external references and their evidence limits are documented in `../references/research.md`. They motivate hypotheses, not a claimed quality improvement on this author.

## Evidence boundaries

- Source cleaning excluded obvious dialogue and quoted lyrics. It cannot guarantee that every informational passage originated with the blogger.
- Validation observations are provisional model judgments and must not become PROFILE examples. Title rules cannot be independently judged from validation body-only input.
- The held-out article is a human style reference, not a same-content gold answer for the synthetic briefs.
- No wrong-author control, repeated generations, multiple model routes or human ratings were collected in this initial pilot. Author specificity and statistical superiority are untested.
- Fictional briefs and strict factual limits intentionally restrict first-person experiences, reported speech and unsupported reactions. A loss of resemblance under these restrictions is not automatically an extraction failure.
- Blind packaging hides method labels and paths, but phrasing can reveal workflow differences. A blank ratings file is not a completed evaluation.
- Contract/unit tests verify instruction presence, evidence validation and packaging behavior. They do not measure Korean voice fidelity, meaning preservation or legal safety.

## Execution evidence

- Frozen baseline suite: 63 tests passed.
- First modified suite: 83 tests passed before independent review changes.
- First full repository run: `pnpm test` passed, 9/9 Turbo tasks successful, no cache hits, plus 3 hook tests.
- Independent generic review reproduced two defects: non-heading title evidence was accepted and the report lacked `target_voice_match`. Both received failing regression tests and fixes. Fresh focused verification passed 31 tests and 24 additional API matrix checks.
- Final package, browser and generated-output checks follow after delivery packaging.
