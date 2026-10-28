# Workflow A — Search Intent Analysis

## Classify the task, not just the words

Use these intent classes; allow a primary and a secondary intent rather than forcing a single label:

| Intent                   | User goal                                                      | Candidate landing page                                          |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Informational            | Understand a concept, learn a method, solve a question         | Explanation, tutorial, troubleshooting guide                    |
| Navigational             | Reach a particular brand, official site, or named service      | Official homepage, login/help destination, brand/product page   |
| Commercial Investigation | Compare alternatives, reviews, recommendations before choosing | Comparison, category guide, evidence-based review               |
| Transactional            | Buy, download, subscribe, book, or use a service               | Product, pricing, booking, signup, download, playable tool/game |

Modifiers are clues, not rules. A brand query can seek support or a purchase; “free” can seek immediate use, comparison, or eligibility information. Do not assume an informational article satisfies a query whose desired action is to play or download.

## Procedure

1. Preserve the original keyword and language; identify entities, modifiers, constraints, and the likely problem.
2. Under recorded search conditions, inspect actual results and their page types. Distinguish ads, organic pages, stores, videos, and other features.
3. Compare intent agreement across the sampled organic results, not just their titles. Report how many were observed and actually opened. Check whether mixed results represent different user tasks.
4. Infer the desired final action. State what would make the user satisfied without another search.
5. Recommend an expected content type and landing page type. Record mismatches between the site's offering and the task; do not steer every query to a sales page.
6. Mark primary/secondary intent, funnel stage (awareness/consideration/action/retention, if applicable), and business relevance (direct/assisted/weak/unknown) with reasons. Funnel stages are strategic judgments, not measured probabilities.

## Confidence

- **High:** multiple directly inspected results under known relevant conditions consistently support the classification; name the sample.
- **Medium:** mixed results or partial but relevant evidence; say what conflicts.
- **Low:** linguistic inference only, stale/mismatched conditions, or insufficient access. With no SERP observation, label `SERP 미검증` and do not claim High confidence.

Do not invent numeric confidence or conversion likelihood. A secondary intent can be “none observed” or “unresolved”; neither means no other intent exists.

## Output

| Keyword | Primary Intent | Secondary Intent | User Goal | Page Type | Confidence |
| ------- | -------------- | ---------------- | --------- | --------- | ---------- |

After the matrix, attach keyword-keyed notes containing Expected Content Type, Recommended Landing Page Type, Funnel Stage, Business Relevance, SERP Evidence IDs, sample conditions, and conflicts. Page Type in the matrix means the recommended landing page, not an observed fact.

Conclude with the dominant intent, high-business-relevance action clusters (not a promise of high conversion), informational-to-action internal-link opportunities, risks of targeting the wrong task, and keywords needing further research. Hand keyword/intent/page type/evidence IDs to competitor and content work; offline classification remains provisional downstream.

## Official guidance applied

[Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), accessed 2026-10-28: organize content for people and help users understand what a destination offers. The four intent classes and confidence rubric above are analytical heuristics, not a Google ranking taxonomy or score.
