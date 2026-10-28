# Workflow C — SERP Feature Analysis

## Observe before proposing

Inspect the actual result screen or a source explicitly exposing that screen's features. Record query, search engine/surface, country/language, device, timestamp/timezone, tool, personalization, and viewport/scroll coverage if known. Generic fetched result links do not establish the screen layout.

Check Organic Results, Paid Results, Featured Snippets, People Also Ask, AI Overviews, AI Mode, Image Results, Video Results, Local Pack, Shopping Results, Rich Results, Sitelinks, and any other observed feature. AI Mode is a distinct surface; an AI Overview observation does not prove an AI Mode citation.

Use statuses:

- **Observed:** visible in the captured sample; attach URL/screenshot/provider record and source ID.
- **Not observed in sampled view:** inspected but absent from that bounded view, not proof of global absence.
- **확인 불가 (Unable to verify):** screen/feature information inaccessible. Never turn a possible opportunity into an observation.

Describe placement and presentation, intent relationship, and the destination shown. If results change between observations, keep dated samples separate. Do not invent pixel prominence, CTR loss, zero-click rates, or AI inclusion from a screenshot.

## Opportunity, distinct from presence

For each feature assess intent fit, ability to create the required content, existing site assets, technical cost, and plausible incremental visits/conversions. State benefits qualitatively unless measured. Feature eligibility and useful content can justify a hypothesis even when presence is unknown, but say what must be verified first.

- Snippets / questions: concise accurate answers and supporting detail where useful; no promise of selection or bulk FAQ generation.
- Images / video: original relevant media, accessible supporting text, and a suitable landing page; evaluate the actual user task.
- Local / shopping: genuine business/product relevance and current official eligibility; configuring Business Profile or Merchant Center is a separate authorized action.
- Paid results: describe competition for attention, not an organic ranking opportunity or permission to run ads.
- Sitelinks / rich results: coherent navigation or eligible markup may help understanding/eligibility; neither commands display.
- AI surfaces: route to [GEO readiness](geo-readiness.md) only if asked or needed for the selected opportunity.

## Structured data gate

Candidates include Organization, BreadcrumbList, Product, SoftwareApplication, MobileApplication, VideoObject, and Article. These are candidates, not instructions to add all types. schema.org vocabulary existence is not proof that Google supports a rich result for it.

1. Match the candidate to the page's real main content and business identity.
2. Follow the current type-specific guide from [Google Search Appearance](https://developers.google.com/search/docs/appearance). Check eligibility/restrictions plus required and recommended properties; record the guide URL/date. A subtype such as MobileApplication may be governed by the software-app feature guide rather than a standalone feature.
3. Match facts to visible content. Reject invented reviews/ratings, prices, stock, author claims, or information absent from the page.
4. Inspect JSON-LD syntax, entity/URL consistency, and rendered availability. Use Rich Results Test if accessible; otherwise label feature validation unrun. Syntactic validity alone is not Google eligibility.
5. State that supported, valid markup does not guarantee a rich result. Organization markup does not imply a dedicated result for every page, and FAQ markup is not a general visibility shortcut.

These checks apply [Google's structured data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), accessed 2026-10-28. Recheck feature-specific support at analysis time; do not rely on a frozen catalogue.

## Deliverable

| Keyword | Feature | Observed Status | Opportunity | Required Content | Priority | Evidence |
| ------- | ------- | --------------- | ----------- | ---------------- | -------- | -------- |

Attach conditions, visual traits, intent fit, technical prerequisites, feasibility/cost, and the uncertainty behind each opportunity. Hand required format, eligibility constraints, and evidence IDs to the content brief; do not mark a roadmap task “achieve featured snippet.” Use a controllable task such as “publish a verified comparison table and monitor the sampled query.”
