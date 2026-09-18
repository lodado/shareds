# Taxonomy → reference → adaptation

Required contract for new screens, major structure changes, component alternatives. Role:
select, decompose, transform, and recombine observed design — not groundless creation. Chain:
internal fit → taxonomy search → apply to real screens/assets → comparison verification. Small
non-structural fixes (typos) reuse existing rationale, no re-survey. An internal screen already
fitting the new scope can itself be the screen evidence.

## 1. Dictionary interpretation integrity

Source text is **local-only**, redistribution license unconfirmed, never committed to Git or shipped in the
plugin package. [dictionary-sources.json](dictionary-sources.json) is MIT;
[resolve_dictionary.py](../scripts/resolve_dictionary.py) resolves `--path` /
`FIGMA_DESIGN_DICTIONARY` / `references/dictionary` under `CODEX_HOME`. `READY` → read
README.md/TOC.md first; `HOLD`/missing → INCOMPLETE, don't fabricate IDs/terms.

Per-file role:

- `layout-taxonomy.md`, `ux-taxonomy.md` — translate to CSS/Figma-only terms, find real
  states and editable assets
- `design-taxonomy.md` — route pattern branches by role to screen/component/interaction
  observation; don't add motion from an effect name alone
- `typography-taxonomy.md` — verify title/meta/body hierarchy, line length/wrap/leading
  against real content
- `visual-asset-taxonomy.md` — search brief only when a real asset need exists
- `ai-slop-taxonomy.md` — diagnostic; check decoration/nesting against evidence, don't
  blanket-ban a style name
- `generative-image-taxonomy.md`, `commercial-photographic-taxonomy.md` — conditional asset
  brief, only within an approved production scope
- `design-references-converted.md`, `design-movement-converted.md` — map IDs like
  `two-column-editorial`, `line-length-measure`, `visual-hierarchy`, `reflow-reorder` to real
  MCP file/page/frame URLs and screen/crop evidence

## 2. Translate keywords into search intent

Translate a taxonomy term into `user task + UI role + needed state/device` before searching —
not a fixed recipe, adapt per task. Example: a taxonomy entry naming a pattern becomes a
search like "settings form validation error mobile", not the taxonomy ID itself.

## 3. Separate screen evidence from component sources

Screen evidence (structure/behavior/visual observed on a real screen) and component source
(editable asset) are different claims — confirm both even when one Figma template happens to
supply both. Internal approved screens or the chosen template count if actually observed and
fitting.

1. **Screen evidence:** real URL/frame + observed date + confirmed state/device.
2. **Component evidence:** real editable component/variant/frame, source, reuse terms,
   connection state — see [component-source-gate](component-source-gate.md#required-evidence-row)
   for comparison requirements and exceptions.

Taxonomy entries aren't visual evidence; a UI-kit import isn't screen-construction evidence;
a screenshot isn't a component. Library name, thumbnail, or node creation alone doesn't pass
the gate. If internal evidence is thin, source construction from real screens in
Refero/Aside/Browser and editable assets from Figma Library/Community/official UI kits — don't
assume tool availability, check first. No observable evidence after a reasonable search →
leave the branch HOLD; don't improvise e.g. a generic hero-card-CTA combo as reference-based.
A source doesn't grant unconditional copy rights.

## 4. Scope active adaptation

Read ID/term definitions, fit/avoid notes, and URL/frame/crop key/node properties, then map
overrides/detach per [figma-composition](figma-composition.md). Keep a local derivative component
instead of detaching the original. Brand-fixed constraints and
accessibility requirements outrank generic taxonomy style suggestions.

## 5. Comparison pilot completion gate

1. Apply real content and agreed device/state to a representative section. Review not just
   isolated parts (cards, inputs) but **the screen composition they sit in**. Don't fabricate
   fit with fake photos/numbers/placeholder titles absent from the source.
2. Place the observed reference and the applied pilot's readable captures side by side. Use
   matching purpose/viewport, but record real content-length/language differences — don't
   target identical pixel counts or copy source decoration unconditionally.
3. Beyond text clipping/overlap, check hierarchy, proportion, information density against
   real CSS/content.

PASS/PILOT_READY/FIGMA_READY vs HOLD/INCOMPLETE follow
[delivery-contract](delivery-contract.md); self-review is not independent QA. This file is a
prompt execution contract; passing it does not mean real Figma execution or visual quality was
verified.
