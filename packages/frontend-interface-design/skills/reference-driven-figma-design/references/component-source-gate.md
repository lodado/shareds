# Component source gate — go external first when thin

Precondition for component adoption/change. Separate visual language to preserve from swappable structure; judge in a separate comparison area before applying to the comp.

## 1. Judge fit by real structure

Name/cover/thumbnail aren't editable candidates. Distinguish `Figma Make` output from native Design; check child layers/`image fill` against target UI. Whole-board image in an editable outer frame isn't editable. Screenshot is screen evidence only, never an assembly candidate.

Per role record user task, real content, needed states, device/width. Read candidate file/page/node ID, type, parent, ancestor visibility, Auto Layout, font, properties — valid IDs only, never guessed from a name. Distinguish `FRAME`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE`; check instance main component; read Variant properties from the set.

External comparison **required** when internal structure fails role/content/state/device fit, fit is unverified (unverified ≠ fit), or the user asked for it. Verified internal fit + no request → reuse as `internal-fit`. Prohibited-import or exact-original instructions win — report conflict, hold what can't be met. No research for a trivial typo/spacing fix.

## 2. Explore → import → compare

[hci-wireframe-workflow](hci-wireframe-workflow.md) targets do steps 1–2 plus a read-only rights/original check first. **Steps 3–4 write to the target Figma** — only after wireframe/candidate evidence and any stated review-wait. Pre-check candidates are provisional, not PASS/`editable-verified`.

1. Confirm tools — Figma search covers accessible libraries only; use Aside/Browser for Community/official kits. Refero is visual reference only. Don't claim an unconnected MCP was called.
2. Find candidates from **two or more distinct sources** — same-library Variants/duplicates/recolors count as one. Record source/URL, result, limits.
3. Import/copy verified-rights accessible candidates. Linkable published component stays an instance; note a generic Community Frame as a copy. Unclear rights → refer only.
4. Compare baseline + external candidates at same real content/width/states. Preserve original, distinguish adjusted copy. Don't drop required conditions to fake fit.
5. Evaluate role/content/state/responsive/rights first, visual harmony/cost second. Fit approved font/color/spacing on the real imported instance/copy. Record main-component link, text/visibility override, local variant separately. Hidden image ≠ confirmed no-image Variant.

Stop once 2+ valid candidates support a decision under real-content comparison. One purposeful pass per source type; still thin → stop rules.

## 3. Pass and stop

- **PASS** — real comparison + evidence rows complete; internal can still win. New primitive combos need documented unfit reasons, not a redraw substituting for import.
- **INTERNAL_FIT** — §1 fit confirmed, no external request.
- **HOLD** — candidates/access/rights/comparison insufficient or a required state unmet. Stop applying/expanding that part, report `INCOMPLETE`. No Figma access → `BLOCKED`; user decision needed → `NEEDS_INPUT`.

Under HOLD continue independently safe work; ask once for access/exception. User **explicitly** picks a specific original under thin candidates → record decision + unverified scope, proceed in scope. "진행해/빨리/한방에" (go ahead/hurry/one-shot) are not exceptions and don't waive license, access, or quality review. Paid purchase, account change, library publish aren't executed on ordinary design-work approval.

## Required evidence row

Per role in the Reference Log, linked from `source_trace.references` `source`/`selection_reason`.

- role/gap — task, real content/state/width, internal fit/unfit reason
- candidates — distinct sources, URL/key/node ID, rights state, search attempts
- reuse type — linked instance / copied frame / local derivative + target ID
- comparison — original vs. adjusted copy's Figma location, readable captures, states/widths
- decision — PASS / INTERNAL_FIT / HOLD, reason, overrides, explicit exception if any
- applied — real location + remaining unverified scope; state if not yet applied

## 4. No expansion without pilot review

Test one representative original-based combo first: long titles/narrow width after `Hug→Fill` (alignment, wrap, parent height, footer overlap); icon swap leaves no stray `rotation` or `color override`. Nested overrides misbehaving → don't spread by duplication; prefer a fitting original Variant, or a `local derivative Variant` preserving `original layers` for the needed difference only, then re-verify. No indiscriminate detach/redraw.

Gate pass isn't a visual-quality pass.

- Don't treat a hidden desktop frame as a mobile Variant; re-verify links after reparent.
- Fix Auto Layout flow/Hug/Fill/Fixed and text reflow first; don't hide overflow via fixed parent height or manual `y` moves. Intentional absolute decoration is fine unless it blocks reading or interaction.
- Check the real input area/button baseline, not the outer label box.
- View full + readable partial captures directly; check transparent backgrounds against the real parent.
- Check overlap/clipping/overflow at boundaries, search rows, list end, footer; re-measure after fixing. No PILOT_READY/FIGMA_READY/done while any remains.

Execution contract, not a runtime hook blocking MCP calls; logs and self-judgment aren't independent QA or user approval.

## Stage 3 source feasibility

Before bulk adoption, run the representative import preflight in
[foundations-brand-workflow.md](foundations-brand-workflow.md). Read access is not import access.
The probe is a write: explain first, honor review-wait, and use only the recorded isolated
Working/Experiment area. Verify actual returned IDs, editable layers, links, fonts, bindings,
and real-content fit before expanding. Record cleanup. A required live-library contract cannot
silently become a local snapshot or alternate library when import fails; report HOLD/BLOCKED.
