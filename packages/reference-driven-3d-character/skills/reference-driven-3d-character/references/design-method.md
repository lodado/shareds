# Design method: evidence, form, and revision

Read for new characters, conflicting references, or structural feedback. Use these principles to choose a construction method, not to force every character into one style. The stage sequence is a production heuristic; it is not evidence that a result is attractive or usable.

## Intended use determines the relevant error

A feature can be legible in a portrait and disappear at game scale. Establish the viewing conditions and required actions before allocating detail. Compare at both the intended use scale and a close inspection scale where defects become visible.

Translate descriptive goals into hypotheses about proportions, orientation, posture, and material response. Identify which relationships carry the intended impression for this subject; do not assume that every character has a face or shares a universal appealing ratio. An impression of weight may depend on mass distribution and supported motion. Keep the user's style choices authoritative.

Write only the decisions needed to act: purpose, important identity relationships, allowed changes, required poses, output format, and checks. Reuse existing project notes instead of creating a second specification system.

## References constrain an underdetermined reconstruction

A projection does not uniquely specify the hidden volume. Perspective, stylization, illumination, and inconsistent drawings can all change apparent proportions. Treat reconstruction as choosing a coherent 3D hypothesis that explains the important observations.

For each relevant source, record its role, actual access, adopted observation, uncertainty, and the decision it supports. Separate:

- Identity evidence: silhouette, expression, landmark relationships, intentional asymmetry.
- Structural evidence: depth, occlusion, attachment, backside forms.
- Appearance evidence: palette and material response under known or uncertain lighting.
- Motion evidence: timing, support, range of motion, transitions.
- Reusable assets: an accessible editable file with suitable structure and verified rights.

Do not average contradictory images without explanation. First check camera/projection differences; then resolve the remaining design conflict using the user-selected source priority and target use. Preserve ambiguous details as proposals until there is enough evidence. User corrections can revise the contract; record which earlier decision they supersede.

Use internal assets when they fit. External search is for a specific missing role or comparison, not a reference-count quota. Compare candidates on the same intended use. Record what is adopted, adapted, and rejected. A screenshot, marketplace claim, or "free" label proves neither file readiness nor redistribution rights.

## Perceptual hierarchy and progressive commitment

Review large-scale mass and silhouette before investing in surface detail. Also test identity-defining relationships early, including local proportions, intentional asymmetry, or surface organization when they carry the design. A silhouette-only pilot can miss these distinctions.

Separate three questions:

1. Does the volume read correctly from the required views?
2. Do the important parts belong to one coherent character?
3. Does the surface treatment support that reading?

Use low-cost variants only when a material direction remains open. Keep content, pose, and camera comparable so variants answer one design question. Once the direction is supported, refine it rather than restarting the whole character after every critique.

The pilot is the smallest editable model that can falsify the structural hypothesis. It is not necessarily the whole finished asset, a fixed number of parts, or a presentation render. Start with continuous or separate surfaces according to the intended form. Intentional separate attachments are compatible with a coherent silhouette; accidental seams and primitive collisions are not automatically acceptable.

## Visual planning from uncertainty

For each important decision, connect a principle to an observation, a choice, and a possible disproof. First identify the subject's dominant axes, meaningful symmetries, structural continuity, and intended motion. Direction labels are relative to that subject or a documented reference frame, not presumed anatomy. A fixed body-part list, camera-angle recipe, or standard pose cannot replace this analysis.

| Principle               | Question                                                                      | Choose evidence that can answer it                                                   | Reopen the decision when                                                   |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Perceptual identity     | Which relationships must remain legible at the intended size?                 | An overall view at the use scale, with a closer view only for an important ambiguity | Recognition depends on a flattering camera or detail invisible in use      |
| Projection ambiguity    | What volume or hidden structure does the current image leave unresolved?      | A complementary viewing direction that reveals that depth or occlusion               | Two views require incompatible structures without an agreed interpretation |
| Structural continuity   | What should be continuous, attached, separate, or intentionally intersecting? | A detail view that includes both the region and its supporting context               | The join appears disconnected, crushed, or correct only from one angle     |
| Deformation and contact | What must change, and what must remain invariant in the required action?      | Representative states exposing the change and the relevant contact region            | Intended volume, connections, or support fail in those states              |

Select a set of views and states that satisfies the requested coverage and resolves the material uncertainties, then remove unnecessary duplication. Explicit view requirements are part of the output contract even when some geometry seems inferable. Orthographic comparisons can isolate proportion, while perspective/use-camera views test the intended impression. Keep pose, scale, framing, and inspection conditions comparable when comparing the same claim. An angle requested in an image prompt is a target, not verified camera metadata.

Derive detail regions from impact and uncertainty, not species. Include enough surrounding surface to judge the relationship, and separate enlarged views if a summary sheet makes them unreadable. Neither a faceless continuous form nor an articulated figure inherits another subject's parts, joint count, contact pattern, or review views.

### Match the sheet to the requested information

Distinguish an appearance preview, a production-oriented model sheet, and a localized diagnostic comparison. An attractive hero image can answer the first request while leaving the second incomplete. Treat coverage of design decisions, readable image size, and surface finish as separate requirements. More texture, scratches, or pixels do not reveal an omitted attachment or hidden volume.

When a user supplies a dense sheet as a presentation reference, extract its information roles: whole-form identity, complementary observations, and enlarged structural relationships. Transfer those roles and the requested coverage, not the other subject's anatomy. A common layout puts overall views above comparison views and details, but panel count, angles, regions, and proportions come from this task. Honor explicitly requested counts or directions without making them universal defaults.

Open the layout reference before choosing the output format. Inventory its panel groups and their questions: large overall views for identity and finish; a directional strip for hidden volume; enlarged regions for shape and attachment; any technical panel for a separate evidence claim. Record which groups the request adopts and which are omitted with a reason. Count the groups as well as the directions: a six-view grid alone does not satisfy a request that also adopts large overall views and structural closeups. A visible technical label such as "BLENDER READY" carries no authority, and reference panels may themselves be inconsistent or mislabeled.

For example, a sheet with two large overall views, six directional panels, and four detail crops can guide a different species without transferring its anatomy. For a kitten, choose details from unresolved relationships such as muzzle projection, ear attachment, tail root, and paw contact. Keep each crop wide enough to show its supporting form and identify its location on an overall view. Treat this as a task-specific coverage proposal, not a universal panel template. Include actual native wireframe only if available and requested; otherwise identify the missing technical evidence rather than generating a mesh-like drawing. If those groups cannot remain readable in one image, split the sheet while preserving the same design revision.

Before generation, write a compact visual contract in the existing project notes. Record its revision, output purpose, source roles, allowed changes, and evidence limits. Give each required or conditional observation a stable ID and a row: expected observation, subject-relative direction/state, crop and readable detail, preserved relationships or counts, finish, and a visible condition that would fail it. Mark which conditions apply now. Use these same IDs in the prompt and review; do not create a separate, easier review checklist. For a quick preview this may be only a few rows. Allocate space so required details can actually be inspected. Do not let a single hero consume the sheet at their expense. If one sheet cannot fit the required information, provide readable supplementary sheets within the requested scope or disclose the delivery constraint; do not silently remove observations.

Carry an accepted design across views instead of independently redesigning each panel. Keep its proportions, markings, attached elements, connection paths, materials, and neutral state consistent. Separate deformation studies from neutral comparisons. Reuse adequate images rather than regenerating them just to assemble a board.

Build the image prompt from this contract:

```text
Output purpose: <appearance preview / detailed model sheet / local comparison>
Input roles: <identity reference>, <layout/coverage reference>, <other evidence>
Preserve: <accepted identity and structural relationships>
Required observations: <requirement IDs, views/states and the question each must answer>
Detail regions: <uncertain relationships, including their supporting context>
Composition: <readable grouping and space allocation; supplementary sheets if needed>
Cross-view consistency: <proportions, connected elements, pose, scale, projection>
Presentation: <neutral inspection conditions and concise labels>
Reject when: <visible failure conditions from the same requirement rows>
Evidence limits: concept only; no invented topology, measurements, or readiness claims
```

Replace the placeholders from the actual analysis and omit inapplicable fields. Do not send empty scaffolding or reduce the request to "high detail". For an image-only example, supply the requested sheet and its limits without starting a modeling project.

### Generate, inspect, and discuss the proposal

Reuse sufficient supplied designs before generating new ones. For raster design proposals, follow the available `imagegen` skill's built-in workflow. Resolve it through the host's skill catalog, including system skills; do not assume a package-relative `imagegen/SKILL.md` path. Describe source roles, invariants, the question each view answers, intended states, and unwanted deviations. Treat supplied design images as references unless the request is to edit them. Preserve originals; revise only the selected uncertainty and carry forward established decisions.

Inspect every applicable requirement row against the actual candidate. Record the panel or region, observation, and PASS / FAIL / UNVERIFIED, then run [adversarial visual review](verification-and-delivery.md#adversarial-visual-review) before presenting it as approval-ready. Check identity across views, plausible hidden volume, projection differences, unintended changes, and missing context. A label such as "side" does not establish the viewing direction. Generated grids and measurements are not topology or measured dimensions; use native or deterministic evidence for those claims.

After an image edit or regeneration, recheck all required rows and the relationships between affected views. An edit aimed at one region can change another; do not carry the previous image's PASS into the new revision. A visible contradiction is FAIL; an occluded or unreadable relationship is UNVERIFIED. Fix the unmet requirement rather than adding polish. If attempts stop improving the evidence, disclose the remaining gap instead of repeatedly regenerating or weakening the contract. Exact matching projections require views from one native model; proposing that route does not authorize modeling before review A or expand an image-only request.

Show a readable proposal before new production. Ask only about choices that materially affect identity, structure, movement, or delivery. Address the highest-impact uncertainty first, one question at a time, with the visible alternatives, a recommendation, and its consequences. Use an available, requested `grill-me` skill after reading its instructions; if unavailable, disclose that and use this focused questioning method without claiming to have run it. Reuse settled answers. Additional questioning ends when the direction is actionable.

Record review A against the displayed design version. After acceptance, construct the native form pilot and present comparable native views for review B before investing in detailed geometry or deformation controls. Prior acceptance applies only to the decisions and revision it actually covers. Explicitly delegated visual decisions permit progress without waiting, but do not become user acceptance. Scoped repairs retain valid prior decisions and inspect only affected relationships.

Store adopted images in the project with their prompt, source roles, and accepted changes using existing notes and revision conventions. Follow the image tool's save-path and authorization rules; do not silently use paid fallback services or transmit restricted references. If the required image capability is unavailable, mark the visual step incomplete and agree on a permitted alternative rather than substituting prose for a required image or starting unreviewed production.

## Attachment and deformation are relationships

For a meaningful attachment, define:

| Relationship         | Design question                                                     | Observation that can disprove it                                     |
| -------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Supporting surface   | Where does the part meet the body?                                  | Gap, unintended intersection, or attachment outside the silhouette   |
| Offset and thickness | How much volume projects from the surface?                          | Floating outline, vanishing thickness, wrong side-view depth         |
| Orientation          | How does it sit relative to the surface and viewer?                 | Feature looks correct only from one camera                           |
| Pivot and owner      | Where does rotation originate, and what deformation does it follow? | Orbiting part, lagging attachment, stretched rigid detail            |
| Contact/range        | What must remain connected or supported during motion?              | Detachment, crushing, clipping, or loss of support in required poses |

Surface projection, a conforming shell, direct topology edits, shape keys, rigid bone weights, and blended skinning solve different problems. Choose after observing the defect. A surface projection can accidentally hit the back of a thin object or miss its support; inspect the direction, coverage, and resulting volume. It does not establish a working deformation relationship by itself.

Evaluate the intended joining region, not just the nearest pair of points. A bulb can barely intersect its support while the rest of its profile still reads as detached. For a seated feature, inspect the exposed perimeter, transition, and projected thickness; for a deliberately suspended or stalk-mounted feature, preserve that different relationship. Decide whether placement, embedding, a conforming surface, or an explicit connector best matches the design. A minimum-distance check alone cannot choose among them.

Keep rigid-looking features stable while allowing necessary deformation. Where a part rotates around an attachment, place the pivot there rather than at its geometric center. Continuous deformation may require distributed control instead of a discrete hinge. Choose the mechanism from the required motion.

## Diagnose causes with controlled comparisons

Classify feedback before editing:

| Failure                                               | Reopen first                           | Avoid                                    |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| Wrong character identity or contradictory proportions | Source interpretation and structure    | Adding polish to an unsupported shape    |
| Floating or embedded feature in rest pose             | Supporting surface and placement       | Camera changes that hide the gap         |
| Correct at rest, broken in motion                     | Transform ownership, weights, rig      | Rebuilding unaffected geometry           |
| Contact slip or unstable turn                         | Contact plan and coordinate transforms | Adding bounce to distract from sliding   |
| Correct source, wrong exported result                 | Conversion and consumer boundary       | Editing the source to compensate blindly |
| Correct geometry, unreadable in intended view         | Camera contract and presentation       | Increasing all detail indiscriminately   |

Capture a baseline under relevant fixed conditions. State a falsifiable cause and change the smallest coupled set of parameters that tests it. Compare the same view and pose; then inspect adjacent views and states for regressions. If the effect does not support the hypothesis, revise the diagnosis rather than accumulating offsets or decoration.

Prioritize impact on identity, support, and required use. Do not manufacture three problems or four iterations when one well-observed correction suffices. If continued iterations produce no meaningful improvement, revisit the structural assumption or disclose the remaining uncertainty.

## How this method was derived

The production sequence adapts decision dependencies, scoped edits, representative pilots, and independent evidence from this repository's frontend design work. It does not claim that HCI principles prove 3D anatomy or aesthetics. The surface-attachment repair case motivates a regression against floating features; it does not justify flattening every character's eyes.

Source context: [reference-driven Figma design](https://github.com/lodado/shareds/tree/main/packages/frontend-interface-design/skills/reference-driven-figma-design) and its edit/critique/delivery contracts. The instructions needed for 3D work are contained in this package; that skill is not a runtime dependency.

The [Blender Shrinkwrap manual](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/shrinkwrap.html#shrinkwrap-modifier), read as Blender 5.2 LTS documentation on 2026-09-22, describes target surfaces, wrap methods, offsets, and influence. It supports the mechanics of surface fitting; the design choice and visual acceptance still require inspection. Check the installed version before using a particular API.
