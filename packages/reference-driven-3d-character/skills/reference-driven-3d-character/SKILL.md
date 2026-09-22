---
name: reference-driven-3d-character
description: Design, build, or refine editable 3D characters from reference images or existing assets, including requested rigging, motion, and export verification. Use for reference fidelity and structural character repairs; not image-only generation, general CAD, or game-system implementation.
allowed-tools:
  - Bash
---

# Reference-driven 3D character

Translate intended use and reference evidence into form, attachment, deformation, and motion decisions. Deliver the requested editable asset and distinguish observed results from proposals. Blender is a supported execution environment, not a mandatory MCP provider or a pinned API version.

## Scope and decision dependencies

Intended use → reference contract → reviewed visual proposal → structural design → reviewed native form → requested deformation and motion → verified delivery.

These are readiness dependencies. Research and small feasibility probes may overlap, but a successful probe does not approve the character's appearance. Reuse valid upstream decisions for local repairs. Reopen only the earliest affected decision and mark its dependent results stale until checked again.

Before editing, state the work type and preservation boundary:

- New design: derive a coherent character within the requested direction.
- Reference reconstruction: preserve the named source's identity; resolve contradictory views explicitly.
- Local repair: preserve unrelated appearance, behavior, topology interfaces, and ownership. Name what may change.

Static characters skip rigging and motion. Animation work does not imply game integration. Requested runtime integration verifies the asset there; combat, input, progression, deployment, purchases, and uploads are not implied. Preserve the user's requested native project format. A render or unexecuted script cannot substitute for a required editable project.

## Reading map

- New form, contradictory references, or structural feedback: read [design-method.md](references/design-method.md).
- Rigging, skinning, contact, locomotion, or transitions: read [motion-design.md](references/motion-design.md).
- Before judging a stage or delivering files: read [verification-and-delivery.md](references/verification-and-delivery.md).

Read only the relevant branches. The image-generation branch uses the available `imagegen` skill/tool; focused interviewing may use `grill-me` when installed. Neither is required for reusing an adequate design or a scoped repair. Visual proposals and changed visual deliverables use the [adversarial visual review](references/verification-and-delivery.md#adversarial-visual-review) procedure. It requires a separate image-capable reviewer, not an orchestration framework; unavailable review remains UNVERIFIED. Consult current official tool documentation when implementation depends on unfamiliar or version-sensitive behavior.

## 0. Establish capability and a safe work area

Inspect the actual reference and existing project, not filenames or prior completion claims. Record available native read/write, script execution, rendering, animation, and export capabilities separately, with the installed application version.

For Blender, verify the animation/action API, material sockets, render engine identifiers, and exporter options needed by this task in the installed environment. Missing MCP does not block a working authorized CLI. If execution is unavailable, provide useful preparation or a runnable script, marking generation, rendering, and playback UNVERIFIED. If a required reference is inaccessible, do not claim likeness; request it and continue only independent preparation.

Choose a new project, explicit duplicate, or precisely owned collection. Preserve original files and unrelated objects. Read access is not permission to purchase, upload, share, overwrite user work, or accept a license. Separate reference-use rights from rights to modify and redistribute actual asset files.

Ready: evidence sources, writable scope, tool capabilities, and delivery gaps are known. Missing capabilities block only the work that depends on them.

## 1. Define intended use and reference authority

Record in the existing project notes:

- Use context: camera, viewing distance or screen size, required states, target consumer.
- Identity: the few shape and expression relationships that must survive.
- Sources: which reference governs each decision; observed facts, user decisions, proposals, and unknowns.
- Scope: allowed changes, preserved features, required outputs, exclusions, and acceptance checks.

Use a supplied design as design evidence, not mesh data. Classify additional references by purpose: identity, volume, material, motion, or reusable asset. Search only where evidence is missing. Choose reuse versus original modeling from actual file access, suitability, editability, and rights; preview quality alone is not adoption evidence.

When views disagree, identify the conflict and choose the interpretation supported by the user's priorities and use context. A universal front-view priority is inappropriate for some characters. Resolve direction-changing uncertainty with a focused question; do not re-interview settled decisions or turn routine reversible details into approval gates.

Ready: the target identity and required behavior are understandable, and remaining assumptions do not silently change them.

## 1a. Present a visual proposal before new production

For a new design or substantial redesign, choose the images from identity, hidden-volume uncertainty, structural relationships, required deformation, and contact. Explain what each view or detail would resolve. Derive subject axes and relevant states rather than imposing named body parts, a standard pose, fixed angles, or a six-view sheet. Read the visual-planning section of [design-method.md](references/design-method.md).

Distinguish an appearance preview from a detailed production-oriented model sheet. Honor requested information coverage and layout-reference density: plan readable whole-form, complementary-view, and structural-detail evidence before prompting. Minimalism removes redundancy, not requested views. Separate character-identity references from sheet-layout references; greater texture detail or image resolution cannot replace missing structural information.

Before generation, write the compact visual contract in existing notes and derive both the prompt and review checks from its requirement IDs. Reuse adequate supplied images and their recorded acceptance. Where a raster proposal is needed, load the installed `imagegen` instructions and use its default built-in tool. Inspect the result, then dispatch the original inputs and candidate to a separate reviewer using the linked procedure before calling it approval-ready. A required FAIL or UNVERIFIED permits a clearly labeled draft or correction, not a verified handoff or dependent production. Exact structural diagrams and mesh evidence belong to deterministic tools or the native scene. Missing image capability is a disclosed gap, not permission to invent a preview, silently skip review, or switch to a paid API.

Resolve remaining direction-changing choices one at a time against the displayed proposal. Use `grill-me` when available and requested; otherwise disclose its absence and ask a focused question with a recommendation and its consequences. Do not ask again for facts or preferences already settled.

Review A: record the displayed version, adopted decisions, remaining assumptions, and the user's acceptance before production modeling. Review B follows the native form pilot. These are the defaults for new or substantially changed design; explicit delegation of visual decisions can waive waiting, but is recorded as delegation, not user acceptance. A general request to build is not acceptance of an unseen design. Local repairs reuse valid decisions and review only affected relationships.

Ready: the visual contract's required checks and separate review pass for the displayed revision, and review A is resolved. Keep adopted generated images, contract, prompt/source roles, and review findings in the project; a tool-managed path alone is not the design record. Every regenerated candidate needs new visual checks; a prior image's PASS does not transfer.

## 2. Explain structural and motion design before production

Show a compact structural sketch or description: dominant masses, silhouette, identity-defining landmarks, continuity or attachment relationships, degrees of freedom, and required contact surfaces. Map the important choices back to reference evidence or an explicit proposal.

Choose representative views and states that can disprove the design. Include identity-critical relationships in the first pilot, even if surface detail is deferred. Design for required motion now without building the final controls before the form is reviewed.

Explain what will be preserved, the first experiment, and the evidence that would change the approach. This explanation is not user acceptance; retain the review decisions from Stage 1a.

Ready: there is a testable relationship between intended use, form, and required movement. A mesh primitive list alone is not structural design.

## 3. Build and review the form pilot

Build the lowest-cost editable geometry that resolves the important form decisions. Prioritize mass distribution, silhouette, identity, and structural relationships over ornament. Use continuous surfaces where the design calls for continuity; keep separate parts where identity, material, or deformation warrants it. Do not weld everything or accept accidental primitive intersections as finished structure.

Evaluate continuity and any attachments relative to the actual supporting surface, its normal/offset, and deformation ownership. Define the intended joining region and inspect its boundary from revealing views; one touching vertex does not establish a seated feature. Choose construction from the relationship, not memorized coordinates or one universal feature shape.

Render the actual geometry from the diagnostic views and states chosen for the design, with controlled lighting and at intended reading size. Compare to the accepted proposal and disclose necessary departures. Show actual native wireframe or deformation evidence where it resolves a structural question; generated topology-like lines are not mesh evidence. Use masks or landmark measurements where meaningful, but inspect the images too.

Fix the highest-impact cause, then compare the same view and state. Record what improved and what regressed. If the hypothesis does not explain the observations, return to source interpretation or structure rather than adding detail.

Review B: show the native pilot and obtain the applicable user acceptance before detailed construction or deformation work; retain explicit delegation or unaffected prior acceptance as defined in Stage 1a. Do not alter the accepted proposal silently to make a mismatch disappear.

Ready: identity-critical form and structural relationships pass visual self-review, supporting geometry checks are satisfied, and review B is resolved. File creation and silhouette overlap alone cannot pass this stage.

## 4. Add requested deformation

Use the motion reference to separate world placement, posture controls, and deformation. Select controls from required degrees of freedom, continuous versus articulated deformation, and contact behavior; do not assume a skeleton or joint count.

Assign rigid parts to stable owners and provide distributed deformation where continuity requires it. If using skinning, blend weights where needed and place pivots at physical attachments. Test the actual evaluated surfaces in representative and boundary states; automatic weighting is an initial operation, not validation.

Check unintended separation or penetration, unstable controls, invalid bindings, and transform assumptions. A rest-state attachment check does not prove attachment under deformation. Preserve working bindings; do not apply transforms indiscriminately after rigging.

Ready: required poses are controllable and preserve the reviewed form. Structural problems return to Stage 2 or 3; weighting problems stay here.

## 5. Build primary motion before secondary motion

Define phases, contacts, trajectory, cadence, and transition conditions for the actual motion type. Establish a stable rest state and a reusable cycle when requested. Separate world placement from local deformation; use stance/swing phases only where discrete stepping applies. For continuous contact, define which regions hold, release, roll, or intentionally slide.

Check contacts on evaluated geometry in the coordinate frame where they should remain invariant. When using an in-place cycle, combine it with its intended reference displacement when judging slip. Test turns and contact orientation separately from straight translation; test takeoff, landing, acceleration, stopping, and loop boundaries as applicable.

Only then add secondary motion justified by the intended weight, attention, or material response. Check that these additions preserve contact behavior and loop continuity. A scripted trajectory should become editable stored animation if the delivery contract requires independent playback.

Ready: the requested cycle, path, and transitions have separate visual and numerical evidence. Contact failure returns to the contact plan, rig, or geometry that caused it; decorative motion cannot repair it.

## 6. Refine materials for the intended use

Use simple materials during form review; refine material response once structure is sound. Keep a neutral inspection setup alongside presentation lighting. Check identity-defining features, material boundaries, highlights, and contact shadows in the intended use conditions.

Spend texture, geometry, shader, and draw-call budgets where visible and required. Set budgets from the target rather than one universal triangle count. Measure evaluated geometry and actual consumer behavior when claiming performance. File size alone does not establish runtime cost.

Ready: the presentation supports the identity without hiding unresolved geometry or deformation. Reopen the responsible earlier stage when lighting reveals a structural defect.

## 7. Reopen, transfer, and verify delivery

Save and reopen the native project in a fresh process or session. Confirm editable structure and the requested playback state. Export from a copy or separate bake action when conversion is needed; preserve the source rig and necessary parent hierarchy.

Reimport the delivered asset independently and compare orientation, scale, material/feature placement, deformation, clip names, durations, and loop behavior relevant to the request. When a target consumer is in scope, verify the exact copied artifact there too. A baked path's contact guarantee does not automatically transfer to arbitrary runtime turns or clip blending.

After a source correction, update or explicitly mark stale each dependent in-scope preview, animation, export, and consumer copy. Reuse unaffected evidence only with a stated reason. The user should not have to guess which file matches the reviewed render.

Ready: required files and observed evidence describe the same revision. Report required-but-unverified or failed work as incomplete, never as an average passing score.

## Handoff and stop conditions

Before calling a visual deliverable verified, apply the same adversarial review procedure to its final revision. Provide the actual editable project location first, followed by how to open/replay it, relevant controls/settings, observed checks, and remaining issues. For an image-only request, show the requested image with its review status and stop without modeling. Link previews and exports only if produced. Distinguish technical checks, visual self-review, separate review, and user acceptance; silence is not acceptance.

Use PASS / FAIL / UNVERIFIED per applicable check. Mark out-of-scope work with a skip reason, not PASS. These are evidence labels, not a runtime authority system. The skill does not physically prevent tool calls or certify artistic quality.

Stop when the requested scope has been verified or a genuine capability, authority, or unresolved direction blocks dependent work. Preserve useful partial results and state the gap. Do not add model training, paid generation, a new game, or a generic asset pipeline to make the task appear complete.
