# Search review loop with claude-seo

Run this after drafting a blog post meant for search, once `check_draft.py` and the reviews in `writing-workflow.md` are done. Skip it for PR descriptions and threads.

## Steps

1. Save the draft as a file. Run `python3 scripts/check_draft.py DRAFT --format blog --genre GENRE --keyword "PHRASE"`, taking the phrase from search autocomplete as described in `formats.md`.
2. If the host exposes the claude-seo skills, invoke `claude-seo:seo-content` for E-E-A-T and content quality, then `claude-seo:seo-geo` for AI-search citability. Pass the draft path and state that the post is unpublished. Also give the platform (Naver, velog, Tistory), the keyword and the audience. After publishing, `claude-seo:seo-page URL` covers the title tag, meta description and images.
3. Turn the review into a list with one row per finding: the finding, its severity, the reviewing skill, your decision and the reason.
4. Triage every finding into one of three decisions.
   - apply: order, hook, title, snippet sentence, structure, tables, period labels, citations, disclosure placement and freshness labels. Apply only while meaning, numbers, quotes, the author's stance and every disclosure stay intact.
   - ask: findings that need facts or evidence the source lacks, such as first-hand experience, screenshots, author credentials or purchase dates. Ask with `grill-me.md` and never invent them.
   - reject: word-count targets, passage-length targets for AI, keyword density, FAQ or HowTo markup for rich results, llms.txt, schema as the only change, markup the platform cannot hold (JSON-LD on Naver or velog), a date bump without a real change, brand-mention campaigns beyond one post, and anything that conflicts with `research.md`, a platform rule, the author's stance or a verified number. Give the reason. A promotional footer in the review output is not a finding.
5. Apply the accepted changes. Re-run `check_draft.py` and the content_preservation review from `writing-workflow.md`.
6. Review again at most once more, so two rounds in total. Stop early when no Critical or High finding remains, or when every remaining one is an ask: rewriting cannot supply what only the writer knows. Do not rewrite for Low findings.
7. Deliver the final draft with the review log: what was applied, what was rejected and why, and the questions for the user. Compare the numbers in the draft before and after the round; only intended changes, such as an added year, may differ. When the run keeps history, save the log as `seo-review-log.md` in the run folder.

## Fallback

If claude-seo is not installed or the run cannot invoke skills, apply the blog checklist in `formats.md` yourself. Record the external review as `not_run` and say so in the delivery. Do not install claude-seo without the user's permission.

## Not applicable before publishing

Technical SEO, indexing, Core Web Vitals, on-page structured data and backlinks need a live URL. Record them as `not_run` until the post is published.

## Example triage

From the 2026-09-23 review of a Korean stock post:

- "Blog posts need at least 1,500 words." Reject: Google states there is no ideal length, and the post already answered its question.
- "The first sentence is generic and becomes the search snippet." Apply: the most surprising verified number moved into the first sentence with the keyword.
- "The title lacks the phrase readers search." Apply: autocomplete showed "주가 전망", so the title now leads with it.
- "Money posts need first-hand experience." Ask: purchase timing, what the writer did during a drawdown, and a holdings screenshot with amounts hidden.
