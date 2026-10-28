# Workflow G — Measurement & Prioritization

## Data contract

Use authorized Search Console, GA4, or supplied exports. Record property, export/source, extraction date, coverage period/timezone, filters, market/device/search type, dimensions, aggregation level, freshness, and known privacy/threshold/sampling limits. Redact personal data and secrets. Never assume analytics credentials or send exports to an external service without permission.

Start with a valid baseline. Prefer comparable periods of equal length and weekday mix; consider year-over-year seasonality if history exists. Mark launches, site changes, tracking changes, promotions, outages, and confirmed algorithm events on the timeline. A before/after movement alone does not establish causality.

## Metrics and safe arithmetic

| Metric                | Interpretation / guardrail                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impressions / Clicks  | Search Console counts within stated dimensions/search type; not total market demand or sessions                                                      |
| CTR                   | `sum(clicks) / sum(impressions)` for comparable rows, not a mean of row CTRs; denominator zero → N/A                                                 |
| Average Position      | A Search Console aggregate under its definition, not one live SERP rank; do not simply average page averages                                         |
| Indexed Pages         | Use the supplied indexing report/inspection scope; sitemap URL counts and site-search counts are not substitutes                                     |
| Organic Landing Pages | GA4 landing page scope and channel filter; distinguish organic sessions from all sessions                                                            |
| Engagement            | Use the actual GA4 definition and scope; not a direct measure of satisfaction or ranking quality                                                     |
| Key Events            | Name the configured business event and validation status; event counts may exceed sessions                                                           |
| Conversion Rate       | Define denominator explicitly, e.g. sessions with the chosen key event / eligible organic sessions; do not divide arbitrary event counts by sessions |
| Revenue / Outcomes    | Record currency, attribution basis, refunds/lag where available, and whether the outcome is observed revenue or lead value estimate                  |
| AI Search Visibility  | Exact report metric or bounded observed-citation sample; never infer missing AI clicks or conversions                                                |

Validate export columns/types, date coverage, duplicate rows, totals-versus-detail overlap, and metric units. Preserve missing values as missing, not zero. Avoid summing the same property total with its rows or joining many-to-many query/page exports as if they were one dataset. Reconcile GSC clicks and GA4 sessions as differently measured populations, not an expected identity.

For small samples report counts, uncertainty, and the inability to infer a stable effect. Do not invent confidence intervals or a universal minimum sample threshold. If calculating a statistical comparison, state the method/assumptions and use suitable independent/comparable observations. If a prior-period value is zero, percentage change is N/A; show absolute change instead.

## Current Google generative-AI reporting

Recheck official functionality at execution time, including the actual account/export schema. Do not freeze old advice that AI visibility cannot be separated from the Web report.

As checked on 2026-10-28, Google's [2026-06-03 announcement](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) describes separate Search Generative AI performance views for Search and Discover. An update dated 2026-08-31 states worldwide rollout. The documented views expose impressions with page, country, date, and (Search) device breakdowns; the data also contributes to overall performance. Do not add the AI view to overall totals or assume dedicated AI clicks, CTR, query, position, or conversion fields that the accessible report does not expose.

If the property/report/data is inaccessible, say `[Unavailable]` and request the relevant export; documented availability is not access to this user's data. Verify current UI/export fields and any official API support before proposing an automated extraction. An AI-powered report configuration assistant is not itself an AI traffic metric.

Use [Search Console getting started](https://developers.google.com/search/docs/monitor-debug/search-console-start), accessed 2026-10-28, to anchor first-party performance/indexing diagnosis. Consult linked current metric help when definitions matter rather than guessing fields.

For engagement interpretation consult [GA4 engagement rate and bounce rate](https://support.google.com/analytics/answer/12195621), accessed 2026-10-28. Engagement is based on qualifying sessions, not a subjective quality score; verify the property's actual event setup before diagnosing landing-page behavior.

## Diagnostic tree

| Pattern                       | Investigate                                                                   | Evidence required before concluding                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A: Few impressions            | Index eligibility, actual indexed state, relevant demand, intent mismatch     | Inspection/index reports, query scope, page coverage, demand evidence if available                            |
| B: Impressions but few clicks | Position mix, SERP features, titles/snippets, intent and device changes       | Comparable query/page cohorts, observed SERP, CTR numerator/denominator                                       |
| C: Clicks but few conversions | Landing relevance, CTA, product friction, broken/misconfigured measurement    | Organic landing sessions, event verification, conversion path evidence                                        |
| D: Traffic decline            | Period/seasonality, competitive changes, technical failures, tracking changes | Comparable dates, segmented deltas, deployment log and actual errors; do not blame an update without evidence |
| E: Only some content grows    | Distinct user task/value, distribution, indexing or demand shifts             | Growing vs stable cohorts; record possible causes as hypotheses and test reproducibility                      |

Separate finding → alternative explanations → recommendation → test. Use [the content priority rubric](content-strategy.md) only for page prioritization; incident severity and measurement reliability may override it.

## Measurement plan

| Goal / Main Event | KPI / Definition | Source / Filter | Baseline / Period | Proposed Target / Basis | Validation / Cadence | Owner |
| ----------------- | ---------------- | --------------- | ----------------- | ----------------------- | -------------------- | ----- |

Leave unavailable baselines/targets as N/A. Targets are proposals, not forecasts; agree business goals rather than inventing commitments. Suggested cadence: verify technical/event fixes immediately in a safe environment; review data quality and leading indicators weekly; review page cohorts and business outcomes monthly or after enough evidence accumulates. Adjust to the site's data volume and search latency. Report delayed or insufficient evidence instead of promising improvement in two weeks.
