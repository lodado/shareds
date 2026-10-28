# Workflow D — Content Strategy & Keyword Mapping

## Inputs and keyword research

Join keyword intent, sampled competitors/gaps, SERP feature requirements, current URL inventory, and the business conversion goal. Carry source IDs and uncertainty forward. If this is standalone planning, use supplied upstream results; investigate only necessary gaps. Without SERPs, present provisional clusters and a validation queue, not verified market demand.

Collect keywords from user inputs, the site's products/help content, supplied Search Console queries, observed SERP questions, and accessible authorized research tools. Label new brainstormed keywords `[Hypothesis]`. Deduplicate without erasing meaningful locale, product, or task differences.

Allow overlapping tags: Branded, Non-Branded, Informational, Commercial, Transactional, Long-Tail, Question-Based, Problem-Aware, and Solution-Aware. Navigational intent remains valid even though it is not one of these discovery tags. Long-tail describes specificity here, not a measured search volume. Record source, country/language, and date. Only include volume/KD when a real provider supplies them; keep provider scales and estimate periods explicit. Do not substitute autocomplete or a Trends index for absolute volume.

## Clustering decisions

1. Collect and normalize terms while preserving original queries.
2. Classify intent and the user's desired final action.
3. Group semantically related tasks as candidate clusters.
4. Compare organic URL overlap under matching search conditions. Record overlap/sample size and inspected page types; do not invent an overlap percentage from unobserved results.
5. Ask whether one page can fully serve the shared task. Similar wording alone is insufficient.
6. Split materially different tasks or page types; avoid a URL per minor keyword variant.
7. Select a primary keyword representing the page's main purpose and business fit, not an assumed highest volume.
8. Assign secondary keywords only when the same page can answer them naturally.

SERP overlap is supporting evidence, not a universal threshold. Different SERPs may reflect a mixed intent or context mismatch. Flag unstable clusters for validation rather than manufacturing precise grouping scores.

## URL mapping and cannibalization

Inspect existing URLs first: intent fit, content usefulness, indexability signals, actual performance when supplied, and conversion path. Prefer improving a suitable URL over adding a duplicate. Mark new URLs as proposed, not existing. Normalize trailing slashes/parameters only after checking site conventions; do not accidentally merge distinct product or language pages.

| Cluster | Primary Keyword | Secondary Keywords | Search Intent | Target URL | Page Type | Priority |
| ------- | --------------- | ------------------ | ------------- | ---------- | --------- | -------- |

Use [the keyword mapping CSV](../assets/keyword-mapping-template.csv) for exports. `status` is existing/proposed/refresh/consolidation-proposed/needs-validation, not completed implementation. Evidence cells identify intent/gap/feature sources and unknowns. Multiple secondary keywords may be separated by `;` inside a CSV cell.

Similar keywords on two pages are not sufficient proof of cannibalization. Compare their purpose and, where available, query-to-page performance over time. Recommend differentiation when tasks differ; consolidation only for genuinely redundant tasks. Before any authorized merge, plan redirect targets, internal-link/sitemap/canonical updates, retained useful content, and monitoring. Analysis never deletes or redirects pages.

## Content briefs and topic clusters

For each agreed priority page, fill [the content brief](../assets/content-brief-template.md). Include Page Objective, Audience, Primary Search Intent, Primary/Secondary Keywords, Target URL, Suggested Title, Meta Description, H1, H2/H3 outline, Key Questions, Unique Value Proposition, Evidence Requirements, Internal Links, Images/Videos, Structured Data Candidates, CTA, Primary Conversion Event, and Success Metrics.

Write natural titles/descriptions/headings that match the page. Do not repeat keywords mechanically, treat fixed character counts as a guarantee, or fabricate expert quotes/testing. Mark proposed metadata as drafts; actual titles/snippets may differ in search. Every differentiated claim needs an evidence requirement, source owner, or validation task.

Design pillar/supporting pages only where each serves a distinct useful task. List source URL → destination URL → reader need → descriptive anchor. Connect informational help to a genuinely useful next step, not compulsory sales funnels. Avoid thin doorway/location variants, mass AI FAQ pages, and copied competitor outlines.

## Priority rubric

This is a strategic heuristic, not a Google score, predicted rank, or measured ROI. Score each criterion 1–5 only with a reason and evidence; record N/A otherwise.

| Criterion                  | Weight | 1 / 3 / 5 anchors                                                                        |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Search Intent Fit          | 30%    | Mismatched / partially answers / fully serves observed task                              |
| Business Value             | 25%    | Weak connection / assisted value / directly supports the stated conversion goal          |
| Competitive Opportunity    | 20%    | No evidenced gap / useful gap / important unmet task with a credible differentiator      |
| Implementation Feasibility | 15%    | Major unresolved blockers / feasible with dependencies / ready with available capability |
| Resource Efficiency        | 10%    | High cost for limited reuse / manageable effort / substantial useful reuse at low effort |

Only when all five are supported, compute `0.30*fit + 0.25*value + 0.20*opportunity + 0.15*feasibility + 0.10*efficiency` on a 1–5 scale. At most one decimal is useful. If any criterion is N/A, leave the total N/A; do not impute zero or silently renormalize. A qualitative sequence with evidence is better than false precision. Feasibility measures ability to deliver; resource efficiency measures effort/reuse, avoiding double-counting.

P0 critical blockers override page scores (for example, verified accidental noindex on important public landing pages). P1 high impact, P2 medium impact, and P3 optional describe relative business priorities, with confidence and dependencies. Do not treat lack of AI-specific files as P0.

## Execution roadmap

Group tasks into Quick Wins (0–2 weeks), Short-Term (3–6 weeks), Mid-Term (7–12 weeks), and Long-Term (after 3 months). These are work horizons, not promised ranking dates.

| Task | Why | Expected Impact | Effort | Dependencies | KPI |
| ---- | --- | --------------- | ------ | ------------ | --- |

Include target URL/cluster, priority, owner or unassigned, evidence IDs, and a verification action. Describe expected impact directionally unless a transparent data-backed model exists. Distinguish acceptance criteria under team control from delayed search/business outcomes. Handoff the baseline, main conversion event, and review cadence to [measurement](measurement.md).
