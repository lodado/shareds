# Edit contract — preserve vs translate vs reinterpret

Component linkage success is no evidence of design fidelity or completeness.

## 1. Mode (allowed / preserve)

- **ASSEMBLE** — reorder, recompose frames / copy, style, images, component source, inner size.
- **LOCALIZE** — translation, font, line breaks, content height / composition, hierarchy, color, control shape.
- **FIDELITY** — reproduce named source, swap content and brand / layout, size, leading, spacing, color, ornament, interaction.
- **RESKIN** — approved visual attributes / structure, content, behavior.
- **REDESIGN** — approved composition redesign / out-of-scope sections, locked contracts.

Mode is a work type, not authority; new screens record REDESIGN scope. One mode per section; ASSEMBLE needing copy edits isolates the LOCALIZE basis first; an integration request is not grounds for redesign. `ㄱㄱ` approves the agreed scope.

One log row per target — file/page/node ID, mode, base source/version, preserve, allowed and forbidden changes, unresolved — links to `source_authority.locked_constraints` and `scope` ([request contract](request-contract.md)).

## 2. Source priority

FIDELITY's target governs color, type, spacing too — "don't copy external color/fonts" applies to structure references only. Locked brand vs named source unclear → confirm.

## 3. Writing and transfer recovery

- Write only in a recorded Working/Experiment location, baseline intact.
- Successful call ≠ proof: **read-back** properties and children, then look at the screen.
- Nested override refused → check source variant/property support; no detach, redraw, source edit.
- `Pasting…` stall → verify real node creation; while incomplete vs complete is indistinguishable, no re-paste, late nodes in the duplicate check. Retry once only with evidence the attempt ended and the target absent; else HOLD.
- Success = new node ID, component key/link, copy, size, style confirmed. No rebuilding another template around a failure.

## 4. Korean is not a reskin

Korean fonts map source size, leading, tracking, weight, role; no flattening headings into one style. Weight missing/mixed in API → read the real text style; a "Regular" name is not body weight. Pretendard/Noto without exact match → record substitute and gap (Semi Bold 600 ≠ Medium 500).

Menus/buttons: single-line fit, width, Hug→Fill, touch target. Body: content width, auto height, leading, parent growth; no clipping hidden by shrinking type. FIDELITY content swap changing height: record why. Not ASSEMBLE.

## 5. Four independent gates

- **Source gate** — source file/node/component key, applied node, reuse unit, link state.
- **Fidelity gate** — preserve/allowed vs real overrides on locked layout, type, color, spacing, not pixel identity; source and result side by side.
- **Content gate** — real features, images, links; placeholders and unlinked state marked.
- **Layout gate** — Korean line breaks, clipping, overlap; agreed widths, states, responsive.

## 6. Delivery, versions

Link source / previous review / improvement / rejected / delivery; desktop, mobile, prototype, integration each verified / unverified / out of scope. In-scope unresolved is INCOMPLETE.
