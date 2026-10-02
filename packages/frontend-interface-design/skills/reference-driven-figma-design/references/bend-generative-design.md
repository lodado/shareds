# Bend generative design — interpret intent, generate composition, inspect the result

Use for new screens or authorized redesign where ambiguous visual intent needs a compositional
interpretation. This path belongs inside the existing four stages and [edit contract](edit-contract.md),
not a new mode. Small fixes, FIDELITY, and appearance-preserving refactors keep their existing path.
RESKIN may explore only authorized surface attributes; it cannot change structure or behavior.

The agent interprets intent and writes the grammar; **Bend generates the composition**; Figma
realizes it. Do not design first and add Bend explanations afterward. Executability does not
prove beauty, reference fit, permission, or user acceptance.

## 1. Interpret intent in context

Start with the Stage 1 task, actual content, audience, brand authority, and preserve/change
scope. Link important phrases to their interpretation in the existing brief/Reference Log:
source wording → task/context → affected region → basis → resolved/provisional decision.
Separate user decisions, observed sources, agent proposals, and unknowns.

Use [taxonomy interpretation](taxonomy-reference-workflow.md): read definitions and fit/avoid
notes, then inspect real screen composition and editable assets separately. A taxonomy term
is vocabulary, not visual evidence or copy permission. Keep dictionary source text local-only;
do not ship the snapshot or a bulk-translated dictionary in a model.

Do not translate “calm” directly to gray or “distinctive” directly to asymmetry. “Dense but
not cramped” may mean compact comparable rows with stronger grouping and a spacious detail
region, rather than reducing all spacing. Resolve material task/brand/authority ambiguity via
the existing interview; decide reversible details within delegated scope without another gate.

## 2. Derive axes, then couple them

During Stage 2, choose or derive only axes that change this task's design. There is no universal
axis count or aesthetic score. An axis may be categorical, ordered, or bounded; avoid invented
precision. Record in the existing log, not new request/delivery fields:

| Axis record          | Required meaning                                              |
| -------------------- | ------------------------------------------------------------- |
| Identity and domain  | What choice is controlled and which values mean what          |
| Scope                | Screen, section, list, title, or other affected region        |
| Basis                | Input phrase, taxonomy interpretation, observed reference     |
| Coupling             | What it constrains, complements, or conflicts with            |
| Realization          | Which structure, layout, token, or component property changes |
| Expected observation | What should visibly differ on the actual screen               |

Discard axes with no effect on output. The same density axis can have different scoped values
for list and detail. Other tasks may need persuasion order or tool/workspace balance instead.
In Stage 3, resolve permitted values and verified asset/token bindings; brand-locked values
are not exploration variables.

Write task-specific Bend types and a `generate(...)` function whose rules select, transform,
and combine composition. Give rules stable IDs and document conditions, affected regions,
precedence, and preserved constraints. For “calm, dense, distinctive,” one defensible grammar
compresses the list, strengthens alignment/grouping, and concentrates variation in the summary.
Do not average conflicting adjectives or silently drop one. Start with a small, inspectable
candidate set, not every combination or a general optimizer. Unresolved conflicts keep the
dependent candidate provisional.

## 3. Execute the model

Run from the skill directory with a reviewed local model and bindings inventory:

```sh
node scripts/design-grammar.mjs \
  --model assets/bend-design/research.bend \
  --args assets/bend-design/reading.json \
  --bindings assets/bend-design/bindings.json \
  --out /tmp/design-plan.json
```

Use `comparison.json` for the paired composition and `reading-mobile.json` for the example's
narrow-screen input. These are original sample content and **fixture locators**, not observed
references or verified Figma assets. Replace the inventory with inspected, authorized sources
before real production; the example is not a universal dashboard template.

- Supported baseline: local **Bend 2.0.34**; `--bend <binary>` selects the executable. Missing or
  unverified runtime means generation is not verified. Report it; do not auto-download a runtime.
- The single local model exports `generate(...)` and may use `import Base` only. No IO, foreign,
  unsafe code, or remote imports. Review the AI-authored **Bend source** before invoking the
  runner; it compiles and immediately executes compiler-generated JavaScript in a temporary
  directory. There is no intervening JavaScript review gate. These limits are not a sandbox
  or permission to execute arbitrary untrusted code.
- `--args` is a JSON array in Bend's JavaScript representation: constructor values use
  `{"$":"Constructor"}`; numbers and strings use their native representation. Match the
  model's function signature rather than treating arbitrary natural language as an executable.
  Use `U32` for pixel values: this JSON bridge supports finite JSON numbers, strings, standard
  `List` values, and records. `Nat`/BigInt, functions, and effect values are unsupported.
- `--bindings` contains `assets` (`locator`, allowed `properties`), `tokens` (`kind`, `value`,
  `locator`), and `content` strings. Token kinds are `spacing` or `color`. These declarations
  are not proof that a source exists, is editable, or may be copied.

The runner compiles to temporary JavaScript, executes `generate` in a bounded child, converts
Bend lists/records, and validates the [DesignPlan schema](schemas/design-plan.schema.json),
IDs, references, and binding kinds. Output is `{schema_version, provenance, plan}`; provenance
records Bend version and model/arguments/bindings hashes. Keep that output with the model, and
link both plus the selected candidate in the existing Reference Log. Compilation is internal
generation work, not frontend implementation or delivery.

The plan holds `viewport`, `state`, scoped `axes`, and a `root` tree. `Stack` constructors
produce layout nodes with width, direction, gap/padding/surface references, and children;
`Asset` constructors produce source-backed nodes with width and content-property bindings.
Both carry stable IDs, roles, and axis/rule references. Use only supported composition fields,
not free-form tool commands. The renderer must not invent unknown node IDs or silently
reinterpret missing operations as a different design.

## 4. Realize and compare in Figma

Follow [composition](figma-composition.md) and its large-unit-first source gate. Generated
assembly does not waive editable-source inspection, reuse priority, licenses, or edit authority.
If a required asset cannot be obtained, keep that branch HOLD/BLOCKED; do not redraw it from a
screenshot. No Figma write means preparation only, not a completed design.

Use the recorded Working/Experiment area. Map each plan node to an actual Figma node and
token/component binding, then read back properties and inspect the screen. Unsupported
operations or unavailable bindings go back to the model. Record any intentional override and
reconcile it with the model before claiming agreement; no silent hand-tuned divergence.

For a representative pilot, hold content, viewport, state, and locked attributes constant.
Change one selected axis, regenerate, and check both the expected plan fields **and actual
Figma properties/captures**. Compare genuinely different strategies using
[visual direction](visual-direction.md), not color-swapped copies. A JSON diff alone does not
show a visual effect or an improvement.

## 5. Close the feedback loop and hand off

Use the existing [critique](critique-refinement.md) lenses and axis-specific expected effects.
Route an intent error to interpretation, a wrong scope/domain to its axis, a poor combination
to its rule, and plan/screen disagreement to realization or binding. Measured wrapping or
density issues inform the responsible values/rules. Regenerate only affected scope, preserve
unrelated decisions, and compare again under the same conditions.

Completion requires actual visual review as well as the causal axis → plan → Figma check.
Correct observed problems and recheck them; when none are found, record the criteria reviewed
without inventing a fix. Keep machine checks, observed visual quality, and actual user
preference separate; never invent an issue, a beauty score, or user acceptance to fill evidence.
Evaluation of the skill itself must also exercise a real feedback correction; an untested
feedback path stays a reported evaluation gap, not a reason to fabricate defects in a delivery.

Follow the existing [delivery contract](delivery-contract.md): editable Figma is still the
result; the executable model and selected plan are supporting artifacts. Record model/output
locations, provenance, axis/rule-to-node mapping, comparison, and unresolved scope in the
existing brief/Reference Log (`source_trace.references`), not new v1 fields or statuses.
