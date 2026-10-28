# Workflow E — Technical SEO Audit

## Evidence boundary

Inspect only relevant site URLs and repository files. Identify the site package/framework and actual version from manifest plus lockfile or installed metadata; a version range alone is not an exact version. Separate repository intent, HTTP response, initial HTML, rendered DOM, and Search Console index observations. None is a substitute for all the others. Do not infer production indexing from a local build or `site:` query counts.

Choose representative templates: homepage, primary landing/product/service, content detail, listing, dynamic route, locale alternative, and error page when applicable. Report sampling and inaccessible routes. Inspect scripts before running authorized local checks; discovery alone must not trigger builds, migrations, deployment, or analytics events.

## Crawl & indexing

- Fetch/inspect `robots.txt` and applicable user-agent rules; inspect both meta robots and `X-Robots-Tag` response headers. Note conflicting directives and intended private/nonindexable pages.
- `robots.txt` controls crawling, not reliable removal from search. To process `noindex`, Google must be able to crawl the URL. `noindex` in robots.txt is unsupported. Do not suggest blocking a page to make its noindex effective. Apply [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).
- Inspect XML sitemap endpoints, parseability, absolute preferred URLs, excluded/error/redirect URLs, and truthful `lastmod` if supplied. Sitemap submission is not proof of indexing.
- Compare canonical target, protocol, hostname, trailing slash, parameters, redirects, internal links, and sitemap URLs. A canonical is a signal, not a guaranteed directive; confirm the selected canonical via supplied Search Console data when available.
- Record actual 3xx chains/loops and intended destinations, real 4xx/5xx responses, and soft-error content returning 200. Do not report status codes from page text alone.
- Inspect duplicate URLs/faceted routes and indexable public pages. Distinguish intentional exclusions from broken discovery. Do not “fix” private or utility pages into the index.
- Compare critical text/links/metadata in initial HTML and rendered DOM; check blocked JavaScript/resources, delayed content, and client-only failures. JavaScript use is not itself an indexing defect.

## HTML & semantics

Check meaningful page-specific Title and Meta Description, heading hierarchy (H1–H6), semantic HTML, crawlable internal links and descriptive anchor text, useful image alt text, breadcrumbs, and appropriate structured data. Missing alt text is also an accessibility issue; decorative images may correctly use empty alt text. Do not label every additional H1 a critical ranking violation.

Link findings to the user task and actual output. Inspect JSON-LD content accuracy/escaping and visible-content agreement; feature-specific eligibility belongs in [SERP features](serp-features.md). A clean validator or a meta description is not a ranking guarantee.

## Performance & UX

Separate field data (real users, URL/origin scope, collection window, device, sample coverage) from lab diagnostics (test tool/version, conditions, run time). Never label Lighthouse as real-user Core Web Vitals or infer field INP from Total Blocking Time.

At the 75th percentile, good Core Web Vitals thresholds are LCP ≤2.5 seconds, INP ≤200 milliseconds, CLS ≤0.1. Use [web.dev's threshold definitions](https://web.dev/articles/defining-core-web-vitals-thresholds), checked 2026-10-28, and recheck if recommendations depend on current definitions. No field data means field status unavailable, not passing.

Inspect Largest Contentful Paint resources, interaction responsiveness, layout shifts, mobile layout/tap usability, image dimensions/encoding/loading, unnecessary JavaScript, render-blocking work, and keyboard/screen-reader barriers. Report measured bottlenecks separately from code-based performance hypotheses. No unsupported exact speed/traffic gain claims.

## International SEO

Inspect language-specific URLs and content, locale metadata, valid language/region hreflang codes, self/reciprocal alternates, and optional x-default where appropriate. Check canonical and hreflang consistency: each intended indexable language version needs a suitable canonical rather than all translations pointing to one language by default. Check redirect-by-IP/language barriers, inaccessible alternatives, and duplicate or incomplete translations. Use [Google localized-version guidance](https://developers.google.com/search/docs/specialty/international/localized-versions) when applying exact rules.

## Next.js specialization

Read version-matching official Next.js docs before version-specific advice. Current documentation may describe a newer release; if archived matching docs cannot be verified, say so and inspect the installed behavior rather than asserting an API.

- Distinguish App Router, Pages Router, mixed routing, and `src/` roots. For Pages Router inspect its head/document implementation; do not prescribe App Router APIs there.
- For App Router inspect static `metadata`, `generateMetadata`, inheritance/merging, `metadataBase`, canonical alternates, locale metadata, and dynamic route behavior where supported. Check `generateStaticParams` coverage/fallback behavior rather than treating it as required for every dynamic route.
- Inspect SSR/SSG/ISR or version-supported rendering/cache choices by page freshness, personalization, crawlability, and cost. Never prescribe SSR everywhere or force an unnecessary migration.
- Check `robots.ts`/`.js`/`.txt`, `sitemap.ts`/`.js`/`.xml`, `opengraph-image`, JSON-LD, dynamic routes, and important content dependent only on Client Components. OG images affect sharing presentation; do not sell them as a direct rank boost.
- Verify actual rendered HTML and metadata for representative production/local routes and consistent canonical URLs. Account for supported streaming behavior and bot handling before declaring metadata missing from a single partial response.

Official starting points (checked 2026-10-28; select the detected version): [Metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images), [generateMetadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots), [sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap).

## Finding and implementation contract

| ID  | URL / File:Line | Observed Issue | Evidence Layer | Severity / Scope | User / Search Impact | Proposed Fix | Verification |
| --- | --------------- | -------------- | -------------- | ---------------- | -------------------- | ------------ | ------------ |

P0: verified critical discovery/indexing or availability failure on intended public pages. P1: substantial discoverability/experience issue. P2: bounded improvement. P3: optional. A suspicion is a validation task with uncertainty, not a verified critical incident.

For explicit implementation only: explain affected files and reason; inspect callers/templates/tests; preserve existing user edits and URL contracts; make the smallest fix; run available targeted tests/build/type checks plus response/render checks relevant to it. Report each check as PASS, FAIL, NOT_RUN, or N/A with scope. Preserve validation/security/accessibility. Do not deploy, remove pages, submit indexing, or change external account settings unless explicitly requested. Otherwise provide recommendations without edits.

The [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), checked 2026-10-28, supports crawlable resources, helpful content and understandable site structure; it does not promise an indexing or ranking outcome from these checks.
