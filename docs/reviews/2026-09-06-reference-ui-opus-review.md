# Reference-based UI skill: Opus implementation review

Date: 2026-09-06

## Scope and provenance

- User-approved goal: one user request with internal render/repair (B), using observed reference patterns and compatible open-source primitives instead of unconstrained UI invention.
- Implementation worker: `claude-oauth:claude-opus-5`, reasoning effort `max`.
- Coordinator: independent review, public CLI checks, browser checks, final integration.
- Baseline revision: `2baf3ebc32fac6fa2a5abc07fa1d2e8ec6edfcf2`.
- Scope: `packages/frontend-interface-design`. Existing staged oracle deletions and unrelated user changes must remain untouched. Global installed skills are not updated automatically.

## Baseline observations

- Initial package suite: 54 passed, one browser test skipped because `FID_PLAYWRIGHT_DIR` was absent.
- Coordinator located existing cached Playwright and Chrome. Running `scripts/render.test.mjs` with those explicit paths passed all 10 tests, including real Korean text/contrast rendering.
- Actual existing app-shell render at 375/1280, light: contrast/overflow/tap failures zero, literal ratio 0.06.
- Actual existing fintech-home render at 375/1280, light: one too-small `내역` link (22×28), literal ratio 0.1279. These are pre-existing defects, not introduced by the new reference route.
- Baseline artifacts: `$JCODE_SCRATCH_DIR/reference-ui-review/baseline-app-shell/` and `baseline-fintech/`.

## Early review findings

These observations refer to an intermediate implementation, not the final outcome.

1. **Reference coverage must fail closed.** The public command `pack.mjs --route 'Vercel UI처럼 배포 현황 화면을 만들어줘'` initially returned `taskMatch: null` and `brandFidelityClaim: true`, despite the pack observing only the marketing homepage. Forwarded for correction and regression tests.
2. **Observed versus derived values.** Initial pack entries tagged approximate OKLCH conversions and inferred spacing/layout rules as observed. Derived values need separate labels and raw evidence pointers.
3. **Theme and token interoperability.** Initial Vercel tokens were dark-theme values with light values only in prose, and `--bg`/`--fg` differed from the existing `--background`/`--foreground` vocabulary. Forwarded for correction.
4. **Open-source versions.** A moving `main` branch is not a pinned implementation version. License verification alone does not freeze the reused artifact.
5. **Actual coverage matters more than labels.** The Vercel pack covers public marketing, not authenticated deployment UI. Ohouse access was reported blocked and its pack marked unverified. Neither should silently become an approved dashboard/commerce reference.

## Acceptance boundary

The coordinator prepared a separate Korean deployment-management brief at `$JCODE_SCRATCH_DIR/reference-ui-review/acceptance-brief.md`. It distinguishes task-matched reference evidence from generic fallback and requires the actual delivered page to render and its filter/detail controls to work.

A unit-test count or one successful smoke is not evidence that reference-grade UI is reliably achieved across lower-capability models. No human-calibrated acceptance rate or paired baseline-versus-candidate generation study has yet been established.

## Verified implementation and corrections

- Shipped reference routing and pack validation, explicit observed/estimated/unverified evidence, task/theme/device coverage, pinned font reuse metadata, a reference-backed marketing composition, and one-user-request/internal-repair instructions.
- Independent public CLI regressions now pass **10/10**: valid inventory, dashboard mismatch, unknown task, checkout precedence, uncovered mobile/light pricing, unverified Ohouse, task-based multi-brand selection, missing token evidence, absent provenance, and HTTP 403 provenance.
- The original ambiguous observer string `background on foreground` was replaced with structured fields. CTA colors were rechecked by semantic role instead of guessing from aggregate frequency.
- Coordinator corrections after the Opus handoff: source ownership precedence, license-permitted reuse rather than a blanket code-copy ban, `scope=full` requirement for layout transfer, all hard gates passing rather than merely non-increasing failure counts, and seven lint warnings removed. Regression assertions were observed failing before the corresponding contract corrections.
- Final package suite with existing Playwright and real Chrome: **71 passed, zero failed, zero skipped**. Package ESLint and `git diff --check` passed.
- The new `pack-developer-platform.html` rendered at **320/375/1280 × light/dark**, all six cells passing current mechanical gates with zero literal-style ratio. This is a reusable placeholder composition, not a shipped product or a fidelity score. Visual inspection found clean neutral typography and hierarchy, but a generic marketing scaffold rather than Vercel-level distinctive composition.
- Existing fintech-home's small `내역` hit target remains a documented baseline defect. Do not interpret the new composition's result as every existing example passing.
- CLI evidence: `$JCODE_SCRATCH_DIR/reference-ui-review/cli-final.json`. Final composition renders: `coordinator-pack-final/` under the same root.

## Follow-up priorities

| Priority | Improvement                                                                                 | Why lower-capability models need it                                                                 | Acceptance evidence                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | Collect task-matched official design-system/component pages and user-authorized screenshots | A marketing homepage cannot establish deployment-table or checkout anatomy                          | Each approved pattern has source, capture date, viewport/theme, task, screenshot, and explicit evidence limits                                                     |
| P0       | Promote small approved screen skeletons, not only tokens                                    | Colors alone still leave column proportions, density, grouping, and state layouts to the model      | At least list/detail, commerce home, and form/checkout examples with desktop/mobile screenshots and filled content                                                 |
| P1       | Deterministic pack-to-starter materialization                                               | Copying tokens and translating prose manually introduces avoidable decisions                        | One command emits compatible tokens and chosen skeleton, with rejected unknown slots and snapshot tests                                                            |
| P1       | Content and state contracts per skeleton                                                    | Long Korean labels, missing imagery, empty lists and failed requests change composition             | Fixtures cover short/long text, loading/empty/error/success, keyboard operation and responsive boundaries                                                          |
| P1       | Fixed-budget paired model evaluation                                                        | One Opus smoke does not predict a weaker model's first-request success                              | No-skill/current/candidate arms, immutable model+effort+skill revision, first/final screenshots, pass@1, reference acceptance, repair count, elapsed time and cost |
| P2       | Harden observation provenance and readiness                                                 | HTTP success and aggregate CSS frequency do not establish semantic role or a real loaded page       | Font readiness, challenge-page detection, final URL, structured role evidence, redirect/DNS-aware network restrictions if accepting arbitrary URLs                 |
| P2       | Real-project integration fixtures                                                           | Standalone HTML does not exercise existing tokens, routing, component ownership or build boundaries | Existing app with locked design system builds and preserves its public interactions after adaptation                                                               |

### Recommended next delivery slice

1. Use official Geist component documentation as the developer-controls source, while keeping Vercel marketing and dashboard coverage separate. The coordinator successfully observed and rendered `https://vercel.com/geist/introduction`; its source screenshot is available in `geist-source/1280-light.png`. This establishes source availability, not approval of a dashboard pack.
2. Obtain permitted Ohouse references before upgrading its unverified hint. If unavailable, offer a plainly named generic content-commerce pack rather than invented brand evidence.
3. Approve one list/detail skeleton and one content-commerce skeleton with real content and reference screenshots. Encode proportions, density, allowed substitutions, asset fallbacks, and responsive transforms.
4. Run a small screening evaluation on the actual intended weaker model: six held-out briefs × two generations × three arms = 36 generations. Expand repetitions and human calibration only after this identifies a meaningful candidate improvement. Do not present this screening sample as a statistically reliable universal success rate.
5. Only then broaden inventory. More brand names without task-level evidence would increase false confidence rather than UI quality.
