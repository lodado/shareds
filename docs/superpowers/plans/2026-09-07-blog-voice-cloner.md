# Blog Voice Cloner Design and Implementation Plan

Approved in conversation on 2026-09-07 (Asia/Seoul).

## Goal and architecture

One portable Claude Code/Codex skill, Python 3.10+ standard-library tools, and separate author data under `.blog-voice/<slug>/`. No model fine tuning, server, database, automatic publishing, or background collection. The host agent performs permitted web collection and qualitative interpretation. Deterministic tools ingest local files, measure distributions, isolate document splits, check overlaps, and persist dated snapshots.

## Research before implementation

Inspected 2026-09-07:

- https://github.com/TaewoooPark/personal-humanizer-maker (README): deterministic measurement / interpretive axes / emission separation and meaning invariance are useful. Single-document profiling and numeric band convergence are not sufficient evidence of generalization or semantic correctness. Avoid baking author metrics into executable code.
- https://github.com/snowmays/style-alchemy/blob/main/README.en.md : portable editable profiles and core/genre separation are useful. README advertises signature phrases and power-verb substitutions, and lists overlap checking as roadmap. Prefer rhetorical decisions, not catchphrases or stronger assertion verbs.
- `authentic-style-writer`: searched exact name and combined variants with Wigolo. No identifiable implementation found. Unrelated brand/dictionary matches discarded. No claims about its architecture. Revisit if a canonical URL is supplied.
  These are documentation-level observations, not exhaustive source audits. No external implementation is copied.

## Deliverables and checks

1. `packages/blog-voice-cloner/skills/blog-voice-cloner/scripts/analyze_style.py`, optional parser helper, and `tests/test_analysis.py`.
   - Test first: md/txt/html blocks, stable IDs, injection inertness, duplicate grouping, split isolation, empty input, metric denominators.
   - Implement `load_documents(Path)`, `analyze_documents(docs)`, `split_documents(docs, seed=42)` and CLI `INPUT --output OUT`.
   - IDs refer to immutable document versions. Only profile evidence goes into extraction references. Under ten independent groups is exploratory, not reliable evaluation. Even larger samples require genre/coverage review.
2. `scripts/validate_style.py`, `tests/test_validation.py`.
   - Test first: shared Korean/English prose, novel prose, code/quote handling, invalid evidence, contaminated held-out references, literal changes.
   - Implement paragraph findings, configurable longest shared substring and token n-gram checks, profile evidence validation. Semantic correctness remains agent/human review, never a numerical guarantee.
3. `scripts/manage_voice.py`, `tests/test_storage.py`.
   - Test first: timestamp window boundaries, immutable imports, edits, path traversal, corrections, split continuity.
   - Implement init/import/snapshot/activate/correction. Collection times and publication times are distinct. Snapshots do not activate automatically. Preserve split history, quarantine cross-split duplicate conflicts.
4. `SKILL.md`, README, schemas/templates, taxonomy, writing workflow, collection protocol, evaluation protocol.
   - Compact entry point progressively loads relevant references. STYLE_REFERENCE and CONTENT_SOURCE remain separate. Fact ledger, role-aware planning, meaning review, over-imitation review, and correction classification are mandatory.
   - Same brief A generic/B few-shot/C profile/D profile+roles/E profile+roles+overrides sample evaluation. Blinded pairwise human form, no fabricated preference results.
5. Package manifest and Claude plugin registration, workspace lock entry, README discovery.
   - Run stdlib unittest suite through package command, packed/discovery contract checks, all CLI help, synthetic end-to-end workflow.
   - Record actual results and limitations. Commit only this feature's files.

## Data boundary

No raw influencer corpus is bundled or committed by default. `.blog-voice/` is ignored. Each profile includes source window and provenance. Only content independently supplied for the new article can support claims. User overrides never authorize semantic changes. Generated drafts do not become reference corpus automatically.

## Verification command

`python3 -m unittest discover -s packages/blog-voice-cloner/skills/blog-voice-cloner/tests -p 'test_*.py' -v`

## Acceptance limitations

Automated checks cannot establish copyright safety, identity equivalence, full meaning preservation, human preference, or complete website coverage. HTML is best effort. Korean segmentation and endings are labelled heuristics. No live influencer URL was supplied, so live collection acceptance remains unexecuted.
