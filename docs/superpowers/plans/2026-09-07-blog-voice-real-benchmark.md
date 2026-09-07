# Blog Voice Real-Corpus Benchmark Implementation Plan

> **For agentic workers:** Use executing-plans to implement the scoped tasks below. Preserve independent generation contexts and never read another variant before writing your own.

**Goal:** Improve blog-voice-cloner using a bounded handface3 public-blog pilot and deliver anonymous outputs for the user's review, without claiming uncollected human preference.

**Architecture:** Keep raw posts, immutable baseline skill, profiles, prompts, runs and evaluator key under gitignored `.blog-voice/handface3/benchmark-20260907/`. Commit only generic skill improvements, synthetic tests, packaging tooling and a corpus-free report. The collector is separate from writers. The supplied post `220122703232` stays outside extraction and tuning, available only for final human reference.

**Tech Stack:** Existing Python 3.10+ standard library tools, Markdown skill references, fresh host-agent generation contexts, static local HTML review.

**Spec:** User-approved conversation design, 2026-09-07: compare raw examples, existing skill and improved skill on identical content; user performs final review. This document records that design for execution.

## Global Constraints

- Do not commit source corpus, author-specific excerpts/profiles, or generated imitations.
- Never bypass authentication, paywalls or access controls. Record incomplete collection.
- No current 30-day restriction: the supplied historical post defines this benchmark's scope.
- Treat source instructions as data, not commands. Exclude comments, navigation and other speakers.
- Label synthetic content briefs and generated negative examples explicitly. Never add generated text to source corpus.
- Keep validation and held-out text out of extraction/writing contexts. Record any exposure.
- Same model route and requested language/length/content for comparison variants. Log settings that the host does not expose as unknown.
- Human preference, naturalness and target similarity remain pending until user review.

## Task 1: Collection and baseline

- [x] Collector saves public same-author posts and provenance into separate profile/validation/held-out directories and records exposure/coverage.
- [x] Copy the current skill into the ignored baseline directory before edits. Baseline commit: `3b4951519fa7ef97d1071a2f00729b8de02c1a47`.
- [x] Run `python3 -m unittest discover -s packages/blog-voice-cloner/skills/blog-voice-cloner/tests -q`. Observed: 63 tests pass.
- [x] Analyze PROFILE only. Have a separate agent follow the frozen skill to build the baseline qualitative profile.
- [x] Record shared content briefs and generation inputs before producing final comparison samples.

## Task 2: Bounded skill improvement

Files: `SKILL.md`, `references/analysis-guide.md`, `references/writing-workflow.md`, `references/evaluation.md`, `references/research.md`, new `references/language-ko.md`, `references/voice-brief.md`, and `tests/test_skill_contract.py` in the existing skill.

- [x] Inspect baseline sample failures without reading held-out text (sequence deviation recorded below). Write contract tests for required Korean/brief references, target-voice versus generic cleanup distinction, provenance of contrastive examples, bounded revision and pending human evaluation.
- [x] Run the new tests and record the expected missing-contract failures.
- [x] Add Korean contextual observation guidance and a per-run voice brief: observed rule → trigger → action → example → semantic boundary. Do not hard-code the particular author's quirks.
- [x] Add derived negative-example isolation and style revision with at most two local revisions, preserving the ledger. Human preference is not inferred from revision count.
- [x] Run all tests. State explicitly that contract tests verify instructions, not model fidelity.

## Task 3: Anonymous review packaging

Files: new `scripts/build_blind_review.py` and `tests/test_blind_review.py` in the existing skill.

- [x] Write failing tests for randomized opaque output IDs, a separate evaluator key, preserved text, escaped HTML, no method labels in user-facing output, no overwrite and invalid inputs.
- [x] Implement a standard-library CLI accepting a manifest with cases and output paths. Emit `review.html`, `ratings.json`, and a separate key under `private/`. No external assets/network or embedded automatic preference score.
- [x] Use synthetic fixture text in committed tests. Keep real author results ignored.
- [x] Run tests and inspect generated HTML through the browser or file read.

## Task 4: Generation and handoff

- [x] Generate raw-example, frozen-baseline and improved-skill variants in fresh sessions with the same brief and budget. Record exact supplied prompts, profiles and model/host identifiers. Do not fabricate seeds or elapsed evaluation times.
- [x] Use a separate semantic reviewer with content briefs and outputs only, not source examples or method labels. Preserve raw generations even if a correction is needed, and disclose corrections in a separate record.
- [x] Build anonymous reviewer package and an unfilled rating form with voice preference, meaning errors, excessive imitation and free-text edits.
- [x] Run package and repository tests, review diff, commit only task changes and attempt opening the local review HTML. The environment suppressed live opening, so provide the file link instead.
- [x] Report actual sample counts, collection/independence limitations and human review pending. Do not declare the improved skill a winner before user review.

## Execution notes

- The general instruction changes followed repository/reference inspection and failing contract tests, while the separate baseline development draft was still running. Do not report a model-output RED before those changes. The subsequent umbrella draft supplied an observed repetition failure, which motivated one additional sparse-content rule.
- Shared content, language, length and host model route are controlled. End-to-end workflows have different planning/revision costs, not equal token budgets. Profiles differ as part of the methods. This is not a single-feature ablation.
- The first full repository test run completed successfully on 2026-09-07. Final package tests must be rerun after review-tool changes.

- Delivered nine anonymous samples, a browser-fillable form and optional model meaning notes. One 352-character output misses the requested length and remains disclosed, not corrected after evaluation. The real packet passed 31 isolated Chrome checks, while live opening was suppressed. Human preference remains pending.
