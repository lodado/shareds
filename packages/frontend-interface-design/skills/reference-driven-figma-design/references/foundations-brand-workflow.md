# Brand, foundations, and semantic tokens — Stage 3

Read [request-contract.md](request-contract.md) for material decisions and
[edit-contract.md](edit-contract.md) for preserve/change authority. Journey and wireframe
readiness precede final system adoption; read-only source inventory can happen earlier.

## 1. Preserve identity before defining values

Choose reuse, refactor, or new-system work from the agreed scope and available sources.
A refactor preserves appearance and behavior: normalize names, aliases, bindings, and reuse
without silently changing color, typography, spacing, hierarchy, content, or interactions.
Record any permitted exception separately. Existing approved assets can satisfy this stage;
do not rebuild a system merely to follow the process.

When code tokens, Figma, a raster direction, or a library conflict, apply recorded authority;
if absent, ask which governs the affected choice. Record brand intent and concise use/avoid
rules, not invented branding. An approved image is not an editable asset or proof of exact
font/spacing values. Missing source is not redesign permission. Separately authorized
reconstruction remains unverified for exact fidelity and is not a pure refactor; the
no-screenshot-redraw rule still applies.

## 2. Import preflight before adoption

Read access is not import access. Follow [component-source-gate.md](component-source-gate.md)
before bulk adoption or token/component catalog expansion. Confirm rights, source identity,
maintenance owner, and whether the contract requires live-library linkage or a local snapshot.

After the required wireframe/candidate explanation and any explicit review-wait, test one
representative component in the recorded isolated Working/Experiment area. Verify actual
import/copy success, returned node IDs, editable child structure, component key/link status,
font availability, variable/style bindings, and fit with real pilot content and states.
Record cleanup or retention of the probe; remove only the probe nodes you created when safe.
Never mutate the external source library to test feasibility.

Failure to import a required source means HOLD/BLOCKED for adoption, not permission to switch
to detached local snapshots, another library, raw values, or hand-drawn substitutes. Ask only
when an alternative changes the agreed ownership/preserve contract; otherwise diagnose the
technical blocker without reopening settled product questions. Independent preparation may continue.

## 3. Define only what the pilot uses

Order: brand intent/preserved identity → foundation sources → semantic roles → component contracts.
Reuse existing scales rather than invent a complete palette or every possible mode.

- **Foundations:** sourced color, typography, spacing/layout, radius, elevation, icon and motion
  rules needed by the scoped pilot. Record accessibility constraints: readable contrast,
  focus visibility, non-color feedback, touch targets, and reduced motion where relevant.
- **Semantic tokens:** map primitive → role → use; for example, a sourced color may serve
  `text.primary`, `surface.default`, `action.primary`, or `feedback.error`. These are proposed
  role examples, not claims about existing code. Distinct meanings must not be merged simply
  because their current values match. Include only required states and modes.
- **Component contracts:** role, anatomy, content slots, properties/variants, interaction states,
  layout behavior, semantic bindings, and source ownership. Preserve linked instances where
  required; a documented local derivative must not be called a published library component.

## 4. Concrete Figma artifacts and verification

Production-design readiness requires real reused or created Figma Variables with valid aliases,
scopes, and required modes; actual Text Styles and effect Styles where used; and the pilot's
required editable component sources/instances. Record Foundations/Components locations and
real IDs, not invented identifiers. A Markdown token table alone is preparation, not a design system.

In the existing Reference Log/source trace, record each adopted token/style/component's source
locator/key, owner, local/remote identity, applied node IDs, and verification status. Read back
bindings on a representative component. Where mutation is authorized, change one in-scope
working token temporarily, verify propagation to its consumer, then restore and read back the
original value and binding. Preserve the baseline; never mutate a shared/external library merely
for this test. If propagation cannot be safely tested, record it as unverified, not passed.

Ready when material visual/ownership decisions are resolved, required sources are usable,
semantic bindings have real consumers, and scoped verification is complete. Missing required
assets or verification leaves Stage 3 partial/blocked. Planning-only requests can stop with
clearly labeled preparation; foundation documentation or even verified system assets alone
do not complete a requested screen refactor. Continue to the Stage 4 pilot before expansion.
