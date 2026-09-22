# Verification and delivery

Read before judging a stage or handing off files. A valid mesh, an attractive render, and a correctly playing game asset require different evidence. Keep those claims separate.

## Choose evidence from the requirement

| Claim                     | Useful direct evidence                                       | What it does not prove                    |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Reference understood      | Source access, adopted observations, conflict rationale      | Editable source assets or usage rights    |
| Editable character exists | Reopened native scene with intended geometry and controls    | Likeness or animation quality             |
| Form fits the design      | Comparable views, landmarks, intended-use-size inspection    | Reliable deformation or consumer fidelity |
| Rig preserves the form    | Evaluated surfaces in required poses                         | Contact quality throughout an animation   |
| Contact is stable         | Persistent surface/contact samples through support and turns | All arbitrary runtime movement            |
| Motion loops              | Boundary pose/velocity plus repeated playback                | Start/stop transition quality             |
| Export is usable          | Clean reimport and source comparison                         | Correct behavior in an untested engine    |
| Runtime target works      | Exact delivered asset loaded and played in that consumer     | Performance at untested scene loads       |

Define tolerances from scale, viewing conditions, intended behavior, and target limitations before using them to judge results. Do not lower a threshold merely to pass a failing output. A justified contract change must be explicit, with the previous evidence no longer presented as satisfying the new claim.

Required identity failures remain failures even when other visual measurements pass. An overlap metric depends on segmentation, camera, registration, and lighting; report those assumptions and inspect the actual comparison.

## Controlled visual inspection

Record only comparison-relevant conditions: source/output revision, camera/projection, pose/time, scale, material setup, lighting, and render/display settings. Keep them stable for before/after diagnosis; use additional conditions deliberately to expose a suspected defect.

Inspect relevant orthographic or perspective views, including views revealing depth and occlusion. Compare at intended use size and at a close inspection scale. Neutral lighting and simplified materials can isolate shape; presentation lighting checks the final reading. Neither view substitutes for the other when both are needed.

For a repair, preserve the baseline and explain the visible difference. Inspect adjacent views/poses for regression. If no image or viewport can be inspected, mark visual review UNVERIFIED even if numerical checks pass. A generated concept image is design input, not proof of the scene's geometry.

For a requested model sheet, compare delivered panels with the planned required observations. Check that the viewing directions and crops answer their questions, details remain readable, and identity and structural relationships agree across views. Report missing, contradictory, or unreadable observations separately from surface polish. A high-resolution poster or an angle label cannot compensate for absent evidence. Supplementary sheets must preserve the same design revision.

## Visual reviews and evidence identity

Review A concerns the proposed appearance and structural interpretation; review B concerns the actual editable form pilot. At each applicable review, show the artifact, identify its revision and unresolved decisions, and record the user's answer or prior explicit delegation. A path without a displayed image, silence, or an agent's self-review is not user acceptance. Do not start downstream production while the applicable review is waiting; independent capability checks do not constitute production approval.

Compare native renders with the accepted design under conditions appropriate to the claim. Explain discrepancies caused by projection separately from genuine design departures. An intentional departure needs a recorded decision; do not silently redraw the accepted concept to fit a flawed model. Keep sketches, generated concepts, native renders, and consumer screenshots distinguishable.

Use actual native wireframe or evaluated geometry only where topology or continuity needs inspection. Distinguish the editable cage from a subdivided result, and reveal occluded geometry separately when necessary. A generated wire-like overlay proves neither mesh connectivity nor deformation readiness. Choose inspection regions from the structural question, with no required anatomy or fixed panel layout.

## Numerical checks proportional to the model

Check finite transforms, unintended negative/degenerate scale, actual evaluated bounds and triangle count, and required material/texture availability. Inspect duplicate faces, reversed normals, holes, accidental intersections, and thin features according to the intended surface structure. Open sheets or separate overlapping attachments can be deliberate; don't force every asset to become one watertight mesh.

For attachment, test the intended joining region and visually inspect its perimeter/profile. A negative minimum gap proves some intersection, not that the feature reads as integrated. Keep that geometric measurement separate from visual self-review and inspect the part in its required poses.

For deformation, inspect the chosen control range, attachment separation, and shape collapse. Where skinning and joints are used, check weight coverage/normalization and joint stability. Record the worst tested state and the relevant evaluated feature, not only a list of acceptable control settings.

For contact, track persistent material points or defined contact frames on the evaluated surface. Do not sort vertices anew in world space on each frame and accidentally change which point is being measured. Separate fixed contact from intended rolling, sliding, or contact transfer. Test the intended velocity or transfer behavior for moving contacts instead of demanding zero drift everywhere. Measure penetration, unintended drift, orientation when required, and loss of support; record worst time, region, and tolerance.

Inspect straight travel and turns independently. Sample between render frames when interpolation may hide a defect. Compare loop transforms and relevant velocities, not merely the existence of a repeated key. A selected sampling density is evidence about those samples, not proof over all continuous time.

## Safe regeneration and native replay

Keep source and working-copy identities explicit. Regeneration updates only owned objects or outputs; a broad name substring is not ownership. Reject ambiguous/unowned overwrite targets. Retain a baseline or recoverable backup and inspect the result before replacing a delivered artifact. Interrupted or failed generation stays separate from the last valid result.

Inspect object mode, selection, and active-object requirements before operators. Avoid applying transforms after binding without understanding the effect on stored motion. Never reset a user's open scene just because a script assumes a factory scene; use an isolated process or explicitly scoped copy.

Save, reopen, and confirm the requested default scene/range, geometry, controls, material sources, and stored animation. If independent playback is required, it must not rely on a live Python handler, timer, or temporary external file that the recipient does not have. Report exact application versions tested rather than promising untested compatibility.

## Transfer and revision identity

Verify source-native, exported, and runtime results separately. Include the expected clips and check their actual timestamps, orientation/units, skin connections, material/texture availability, and representative deformed feature locations. A format may convert material or geometry representations; inspect the meaningful result rather than expecting byte or topology identity.

After a change, follow the dependency chain:

```text
design decision → native geometry/rig/motion → previews/bakes → export → consumer copy
```

Mark affected descendants stale until regenerated or revalidated. Geometry changes can invalidate skinning or baked data; timing changes invalidate exported clips; presentation-only changes may leave geometry tests valid. Record the reason for any reused evidence. Do not reuse an old screenshot as proof of a new asset.

Use concrete paths and, when copies can be confused, hashes or another existing revision mechanism. No new asset database is required. A consumer's cached model must not be mistaken for the freshly exported one.

## Results and completion

For each applicable check, record expected behavior, inspected file/revision, actual observation, and PASS / FAIL / UNVERIFIED. An out-of-scope item has a skip reason and is not counted as passed. Aggregate completion requires every required deliverable and its checks; optional failures can be reported separately without hiding required gaps.

Report three independent facts:

- Technical verification: what was actually run, measured, reopened, or played.
- Visual self-review: what was inspected, what changed, and remaining design concerns.
- User acceptance: accepted, rejected, or not obtained, based only on a real response.

The user may reject an output whose numerical checks pass. Diagnose the rejection against the design contract; do not use the tests to overrule the user's visual judgment. A technical correction can be complete while broader artistic approval remains pending.

Hand off the editable file and open/play instructions, relevant controls, requested exports/previews, measurements with their tested scope, and remaining issues. If a required artifact cannot be produced, state the partial result and blocker. Never invent a path, render, measurement, license, independent review, or commercial-quality certification.
