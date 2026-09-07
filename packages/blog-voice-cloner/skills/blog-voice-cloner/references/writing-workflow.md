# Writing, review and correction contract

## Run artifacts

Create a fresh `.blog-voice/<author>/runs/<run-id>/` containing intent.json, content-source.md, ledger.json, voice-brief.json, plan.json, draft.md, review.json and final.md. Record profile version, model/host identifier if available, selected rule IDs, override IDs and example evidence IDs. Never overwrite a prior run. The final prose is user-facing, working records remain editable local files.

## 1. Intent and content extraction

Determine draft-new vs strict-rewrite, topic, audience, genre, desired length and allowed sources. If no active profile, request one or label exploratory use. If no content beyond a topic, ask for facts or permission to research rather than inventing an experience. Extract only authorized CONTENT_SOURCE. Preserve source passages for audit. STYLE_REFERENCE may not substantiate the ledger.

## 2. Fact / claim ledger

Use JSON with entries [{id, type, statement, source, protected_literals, qualifiers, relations, used_by}], plus top-level protected_literals for deterministic checks. IDs FACT-01, CLAIM-01, EXPERIENCE-01, QUOTE-01. type is fact/claim/experience/quote. source identifies a user note block or independently authorized research URL with access date. qualifiers record certainty, scope and conditions. relations record negation, causality versus association, comparison and antecedents. used_by lists final paragraph IDs. Quotes preserve exact wording and attribution. Opinions must be supplied as intended claims, not inferred from the reference author's opinions.

Example supplied claim: `With TTL 60 seconds, the cache may reduce repeated reads before expiration.`
Record protected literal `60`, condition `same key before expiry`, certainty `may`, and no claimed benchmark. A missing literal is a review warning, not proof of a changed fact. A present literal does not prove correct meaning.

## 3. Plan with style from the start

Build the small per-run brief described in `voice-brief.md` from existing evidence, before outlining. It names the applicable decisions and what each changes in THIS content. Missing genre support is not repaired by louder punctuation. Preserve ordinary author-supported endings, connectors and deliberate fragments instead of running a generic humanizer over them.

Plan [{section, role, ledger_ids, rule_ids, example_ids, intended_relation}]. First select information order and permitted section roles, then select supported rules and role examples. Match genre and rhetorical role before topic. Read only a few short examples for the current role. Do not draft generically and swap vocabulary later. Do not insert a counterargument, analogy, first-person story or recommendation unless content permits it. Strict rewrite adds no new substantive claims and retains required source order when requested.

## 4. Draft

Use ledger-supported material. Apply triggers rather than maximizing markers. Profile distribution ranges are soft guidance, not quotas. User overrides outrank reference style but remain below semantic correctness. An override asking for a stronger voice does not change 'may' to 'will'. Required technical names and citations remain intact.

Sparse content is not permission to pad. Preserve a necessary qualification where its claim appears, but do not repeatedly explain the same uncertainty or turn internal semantic safeguards into reader-facing disclaimers. Each paragraph should add a supported fact, relation or authorized reaction. If a requested length cannot be reached without repetition or invention, report the length/content constraint in the run review rather than pretending extra explanation is new information.

## 5. Independent passes

Review separately, preferably in fresh role contexts. The semantic reviewer receives CONTENT_SOURCE, ledger and draft, not author examples. The style reviewer receives the brief, selected rules/metrics, short PROFILE examples and draft, and checks both compliance and resemblance. A separate development evaluator may use VALIDATION, recording exposure and findings without feeding its wording into examples. HELD-OUT is used once after freezing, never for revisions. The leakage/overlap reviewer may inspect source material after generation but must not feed held-out wording back into drafting.

Required categories:

1. content_preservation: verify every ledger entry's meaning and every draft claim's source. Check numbers, names, dates, identifiers, citations, negation, logical relationships, causality, certainty, scope and conditions.
2. style_match: cite supported rule IDs and actual blocks. Distinguish deliberate exceptions.
3. over_imitation: compare marker distributions/context triggers, flag catchphrases and exaggerated quirks.
4. source_leakage: flag author-specific facts, experiences, opinions, quotations or anecdotes unsupported by ledger.
5. generic_ai_signals: identify unsupported abstract openings, filler, repetitive transitions, forced symmetrical sections and redundant summaries. A generic-looking phrase is not proof of AI origin.
6. target_voice_match: compare the draft's actual title, information order, local register, reader distance and rhythm with source-supported decisions. Rules may be satisfied while the result remains generic. Flag a `major_style_gap` with the affected blocks, evidence and a specific change. Do not penalize a genuine source trait just because a generic AI-cleanup list dislikes it. If the brief supplies no comparable genre or content, report that limit rather than fabricating author-like experiences.

Run validate_style.py for deterministic overlap/literal warnings. Keep those distinct from the six interpretive passes. Each pass records status not_run/review_required/passed, reviewer, evidence and findings. No aggregate similarity percentage. Finding shape: {block, category, rule, problem, suggestion, ledger_ids, evidence}. Revise until semantic blockers are resolved or explicitly report missing input. A failing content check blocks final delivery as verified prose even if style looks good.

For style gaps, allow at most two revision passes per run. Each pass applies concrete supported changes, preserves the previous draft, and rechecks meaning and overlap. Stop when actionable gaps are resolved, findings no longer improve, or the budget is reached. Record unresolved gaps as outcome `partial_match`; never inflate markers to force a pass. If no major gap exists, do not rewrite merely to use the budget. Model review remains provisional, and preference remains `human_review_pending` until the user evaluates anonymous samples. This budget is an operational limit, not research evidence of quality.

## 6. Correction learning

Preserve generated and edited versions and diff via manage_voice.py correction. Classify each change, not an entire mixed edit, as STYLE_CORRECTION / CONTENT_CORRECTION / PERSONAL_PREFERENCE / FACT_CORRECTION. Ambiguous edits remain unclassified pending clarification, do not call the command with a guessed class. Store mixed edits as separate classified records with the shared run ID in the reason, retaining the full original diff.

REFERENCE_STYLE is evidence from the author. USER_OVERRIDES is user-authorized preference. Only explicit persistent preference requests update user-overrides.json, with id, instruction, scope, source_correction, created_at and enabled. Preserve prior override versions in history before editing. Content/fact corrections update the affected run ledger, not author style. A single deletion of an analogy does not mean 'never use analogies'. Generated text is never automatically re-ingested.
