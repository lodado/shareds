# Reference-grade UI in one request — implementation report

Date: 2026-09-06 · Package: `packages/frontend-interface-design` (0.4.0) · Agent: Claude Opus (swarm worker)

This records the implementation worker's handoff. For subsequent coordinator fixes and final
verification, see [the independent review](reviews/2026-09-06-reference-ui-opus-review.md).

## What this changes

The skill could already build a competent screen from a lineage. It could not answer
"오늘의집 UI처럼" honestly: a brand name produced either invented values presented as that brand's,
or a generic screen that quietly ignored the request. This slice adds the missing middle — an
evidence-graded **Reference Pack** — and resolves the internal contradictions that made a
single-request delivery impossible.

The slice introduces the following contracts. Pack validation and CLI routing have executable
checks; adherence to the design and repair workflow still depends on the executing model:

1. **A brand name is never evidence.** Values reach a screen as `observed`, `estimated` or
   `unverified`, and the grade travels with the value.
2. **Scope fails closed.** A pack observed for one task, device and theme does not license a claim
   about another. Uncertainty narrows the scope; it never widens it.
3. **The loop finishes inside one request.** Render once, repair at most twice, and report what is
   still broken instead of stopping to ask.

## Real external sources observed

| Source                                      | Result                                                                           | Evidence                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `https://vercel.com/`                       | HTTP 200, observed at 1440×dark, 1440×light, 390×dark                            | `~/.jcode/scratch/reference-ui-review/observations/vercel-*.json` |
| `https://ohou.se/`, `https://ohou.se/store` | **HTTP 403** to plain fetch and to headless Chromium                             | recorded in the pack's `accessNote`                               |
| `vercel/geist-font` license                 | OFL-1.1 via GitHub license API                                                   | pack `primitives[0].verifiedVia`                                  |
| `orioncactus/pretendard` license            | OFL-1.1 (LICENSE text; API reports NOASSERTION because of four upstream notices) | pack `primitives[0].verifiedVia`                                  |

A browser `HEAD` returned 200 while the attempted page requests returned 403; this alone does not
establish the server's blocking policy. **The access restriction was not circumvented.** The Ohouse
pack therefore ships as `evidenceStatus: unverified`
and its summary opens with "NOT A BRAND REPRODUCTION". That is the honest answer, and the validator
makes it the only possible one: an unverified pack containing a single `observed` value fails.

No logo, mark, screenshot, copy or source code was copied from either site. The observer stores
aggregate values and structure only.

## Changed files

### New

| File                                                             | Purpose                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/.../scripts/observe.mjs`                                 | Observes one public page in a real browser and emits the design facts a pack may call `observed`. Reuses `render.mjs`'s Playwright resolution, so no new dependency. Exits 2 on 403/bot wall/empty SPA rather than degrading to a guess. Rejects credentialed URLs and private hosts. |
| `skills/.../scripts/pack.mjs`                                    | Validates packs and routes an utterance to one pack, one mode, one scope. `--validate`, `--route`, `--list`.                                                                                                                                                                          |
| `skills/.../references/reference-pack.md`                        | The pack contract: three evidence grades, the schema, routing, new-observation procedure, one visual authority, and what is never done.                                                                                                                                               |
| `skills/.../references/one-shot.md`                              | The precedence ladder, the no-questions rule, the lock/diversity resolution, per-component state scope, and family-based colour/font counting.                                                                                                                                        |
| `skills/.../references/packs/vercel-developer-platform.json`     | `observed`, 3 provenance entries, 38 graded values, raw observations retained.                                                                                                                                                                                                        |
| `skills/.../references/packs/ohouse-content-commerce.json`       | `unverified`, 0 provenance, access note, upgrade path, 25 graded values.                                                                                                                                                                                                              |
| `skills/.../exemplars/compositions/pack-developer-platform.html` | A composition built only from the observed pack. Literal ratio 0.000.                                                                                                                                                                                                                 |
| `scripts/pack.test.mjs`                                          | 12 tests over routing, provenance, evidence and fail-closed behaviour.                                                                                                                                                                                                                |

### Modified

| File                                                                          | Change                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md`                                                                    | Third mode (**Reference-informed**); rule 1 routes a named brand to the pack; rule 4 counts hue families and yields to an observed pack; rule 7 scopes states by component role; rule 8 and step 5 carry the new adoption rule; rule 11 adds "a brand name is not evidence"; steps 1–3 assume instead of asking. 137 lines / 9,850 chars, inside the 150 / 12,500 budget. |
| `references/adaptation.md`                                                    | Removed the macro-structure contradiction (§3 no longer claims the knobs own it, §6 keys the diversity rule on `locked`, §7 states the lock consequence). New §8 for reference-informed adaptation.                                                                                                                                                                       |
| `references/look.md`                                                          | Count-only adoption replaced by three ordered conditions: hard gates, critical no-regression, then progress **or** a genuinely fixed target defect. Bounded to first render + 2 repairs. New §4-1 separates `actual-app` from `surrogate` validation.                                                                                                                     |
| `references/fidelity.md`                                                      | (unchanged in this slice; the pack route is documented in `reference-pack.md`)                                                                                                                                                                                                                                                                                            |
| `evals/run-live.mjs`                                                          | Output contract now says "one deliverable page" and names `INTERNAL_ARTIFACTS` (`DESIGN.md`, `design-loop/`, `.design/`) as expected. The old "no other files" forbade the artifacts the skill mandates.                                                                                                                                                                  |
| `scripts/render.mjs`                                                          | `oklch(from var(--token) …)` and `oklch(from currentColor …)` are no longer counted as colour literals. They are token derivation; counting them made the gate report token discipline as a defect.                                                                                                                                                                       |
| `exemplars/tokens.css`                                                        | Added `--scrim` and `--backdrop` for values three components were hardcoding.                                                                                                                                                                                                                                                                                             |
| `exemplars/{primitives/button,primitives/dialog,compositions/app-shell}.html` | Use the two new tokens. app-shell literal ratio 0.055 → 0.044.                                                                                                                                                                                                                                                                                                            |
| `exemplars/README.md`                                                         | Documents the pack-built composition, its two recorded deviations and its measured loop result.                                                                                                                                                                                                                                                                           |
| `scripts/skill-contract.test.mjs`, `scripts/eval-run-live.test.mjs`           | Pins updated from removed text to the new behaviour contracts.                                                                                                                                                                                                                                                                                                            |

## Verification

Every command below was run in this session; the output quoted is the output observed.

```
$ npm test          # packages/frontend-interface-design
ℹ tests 70 · pass 69 · fail 0 · skipped 1      (was 55 / 54 / 0 / 1)

$ npm run lint
✖ 7 problems (0 errors, 7 warnings)            (3 errors introduced by this work, then fixed)
```

The 1 skipped test is the pre-existing real-browser render test, skipped when `FID_PLAYWRIGHT_DIR`
is unset. The 7 warnings are `no-complex-ternary` style advisories in `pack.mjs`; they are
warnings, not errors, and were left rather than restructuring working branch logic late in the slice.

### Real browser observation

```
$ node scripts/observe.mjs --url https://vercel.com/ --device desktop --theme dark --out …
observed https://vercel.com/ @1440px: 8 slots, 2 font families → …/vercel-desktop.json

$ node scripts/observe.mjs --url https://ohou.se/ --device desktop --out …
OBSERVE_FAILED: BLOCKED_OR_MISSING: HTTP 403 for https://ohou.se/     (exit 2)
```

### Routing, reproduced from the CLI

| Utterance                               | scope                                   | brandFidelityClaim |
| --------------------------------------- | --------------------------------------- | ------------------ |
| `Vercel 랜딩페이지처럼 만들어줘`        | `full`                                  | `true`             |
| `Vercel 랜딩페이지처럼 모바일 라이트로` | `tokens-only` (gap `pair:mobile/light`) | `false`            |
| `Vercel UI처럼 배포 현황 대시보드를`    | `tokens-only` (task mismatch)           | `false`            |
| `Vercel처럼 만들어줘`                   | `tokens-only` (task unknown)            | `false`            |
| `오늘의집 UI처럼 만들어줘`              | `pattern-hint`                          | `false`            |
| `예쁜 쇼핑몰 만들어줘`                  | `none` → lineage                        | `false`            |
| `오늘의집이랑 Vercel처럼 쇼핑 홈`       | picks Ohouse (task beats alias length)  | `false`            |

### The pack-built composition, rendered

```
r1: rendered 4/4 cells · contrast 0 · overflow 0 · fonts 2 · tiny 1 · tap 0 · long 1 · literal 0.00
r2: rendered 4/4 cells · contrast 0 · overflow 0 · fonts 2 · tiny 0 · tap 0 · long 0 · literal 0.00
```

Screenshots and metrics: `~/.jcode/scratch/reference-ui-review/pack-sample/{r1,r2}/`
(375 and 1280 × light and dark). Both r1 defects were real and both were fixed in one repair round:

- **tiny 1** — the pack's _observed_ 11px eyebrow. The accessibility floor outranks the reference
  (`one-shot.md` §1, level 2 over level 4), so 11px → 12px with the tracking kept. This is the
  precedence ladder doing its job on a real value, not a hypothetical.
- **long 1** — a 187-character line at 1232px. Measure capped at 68ch.

Both are recorded as deviations in the file's comment, which is what the contract requires.

Validation type: **surrogate** (static composition, not a running app). Under `look.md` §4-1 that
distinction must be stated rather than implied, so it is stated here.

## What is not done

- **Ohouse is unverified.** No Ohouse value is observed and the pack says so in three places. It
  becomes `observed` only when someone supplies screenshots or runs the observer from a context the
  site allows. The pack carries an explicit `upgradePath`.
- **No live model evaluation.** No paid generations were run; no `pass@k` or win-rate number exists
  for the new route. Fixture tests verify the tools, not model behaviour.
- **Coverage is narrow.** The Vercel pack observed one page at two widths and, for light theme,
  one width. Anything between 390px and 1440px is `estimated`, and the router treats an unobserved
  device/theme pair as a coverage gap.
- **`fintech-home.html` literal ratio is 0.107**, above the 0.1 gate, from nine literal `px` radii.
  Pre-existing, outside this slice's scope, now pinned by an exact-value test so it cannot drift
  silently in either direction. `marketing-hero.html` is 0.087, under the gate but for the same reason.
- **The coordinator separately measured `fintech-home.html` `smallTapTargets=1`** (a 22×28 '내역'
  control). Also pre-existing and untouched here.
- **The installed `~/.jcode` copy of the skill is stale** and was deliberately not updated.
- **7 lint warnings** remain in `pack.mjs`.

## Suggested next steps

1. Fix the two pre-existing exemplar defects (`fintech-home` radii and tap target) and tighten the
   pinned ratios to 0.
2. Add a third pack for a task the current two do not cover (a product surface, so the
   `tokens-only` transfer path has a same-task destination).
3. Run the live eval on two or three briefs with the new route to get a first honest number.
4. Teach `observe.mjs` to accept a screenshot as input, so a blocked reference can still reach
   `estimated` through a user-supplied source.

## Note on one correction

An earlier draft of the Vercel pack cited the most frequent button colour pair as the primary CTA.
It is not: the 6-occurrence pair is the _secondary_ treatment, and the primary is the 4-occurrence
inverted fill. This was caught in review, verified by reading the actual button labels in the
browser ("Sign Up" vs "Get a Demo"), and corrected. `observe.mjs` now emits
`{background, foreground, count}` instead of the ambiguous `"X on Y"` string that invited the
mistake, the pack records role attribution explicitly, and a test asserts that the primary is
identified by role rather than by frequency.
