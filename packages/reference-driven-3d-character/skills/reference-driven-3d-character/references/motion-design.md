# Motion design: ownership, contact, and continuity

Read only for requested rigging, deformation, or motion. Derive degrees of freedom and contact behavior from the subject and intended action. Do not assume periodic stepping or even surface contact.

## Design the range before building the controls

List representative rest, motion, and transition states. Identify rigid regions, continuous deformation, any pivots, and contact requirements. Choose topology and controls from those relationships. Do not distort proportions solely to fit a generic skeleton; distributed deformation need not be represented as a set of visible hinges.

Separate world placement, posture controls, and deformation. A fixed-contact control must not inherit body motion as though it were a body attachment. Inspect the actual hierarchy and transform spaces; a skeletal implementation includes root, armature object, rest matrices, and constraints.

When using IK, verify the actual chain, a useful rest bend, pole position and angle, rotation ownership, and stretch behavior. Sweep the required range and inspect evaluated joints rather than approving the settings by name. Disable stretch when length preservation is part of the contract; intentional stretch needs its own limits.

When using skinning, weights must cover the intended vertices with finite, appropriate, normalized influences. Rigid details can follow one bone; blended weights belong where deformation continuity is needed. For other deformation methods, test their control range and continuity directly. Test the region and its supporting surface together. A stable control origin does not prove the evaluated surface behaves correctly.

## Express contact in the frame where it is invariant

Let `M(t)` map a control's local frame into world space. A fixed world contact point `p*` requires:

```text
p_local(t) = inverse(M(t)) × p*
```

This is a homogeneous point transformation, not a recipe for assigning a Blender pose bone's `location`. Account for the full parent/rest/constraint mapping when computing the actual control channels. Probe with a known point before generating the animation.

If a support must retain its orientation too, preserve a contact frame `C*`, not only one point:

```text
C_local(t) = inverse(M(t)) × C*
```

For rolling, sliding, or distributed contact, the active location or contact frame may change. Define the intended contact trajectory, velocity, and region transfer; a fixed-world-point constraint applies only where holding is intended. Check that behavior rather than exempting the whole interval from validation. Root rotation can change a locally animated support's world placement unless the contact plan compensates.

## Choose contact behavior before phase structure

Determine whether support is intermittent, continuous, intentionally moving, or absent. Identify the relevant contact regions and invariants before dividing motion into phases. A continuous deformation may transfer support along a surface without a discrete landing or swing. Preserve its intended volume, clearance, and contact law instead of assigning it a stepping gait.

For discrete stepping, define which support is active, where it lands, when it releases, and how it reaches the next support location. The phase plan must fit the reachable workspace and balance impression:

- Support: maintain the intended world contact and orientation within chosen tolerances.
- Transport: move toward the next landing with appropriate clearance and endpoint timing.
- Transition: shift support before releasing it; start and stop at valid contact states.

Choose phase proportions from the locomotion and intended weight. Double support, brief flight, or continuous rolling can each be valid; distinguish intended flight from accidental loss of support. Do not transplant one species' stance ratio or gait into another.

Smooth interpolation is useful only when its boundary velocities match the planned motion. A quintic easing curve has zero endpoint velocity and acceleration, which suits some fixed-world swing endpoints; it is not automatically correct for every local-space trajectory. Check contact, clearance, and velocity through the actual transformed result.

## Couple travel and phase

For repeatable locomotion, let `D` be the travel over one full cycle and `T` its duration. With discrete stepping, equivalent successive contacts of the same support can define that cycle. At the reference speed:

```text
v_reference = D / T
clip_rate = v_actual / v_reference
```

Include model scale and the clip's actual duration. Measure actual travel over the same time interval used by the animation mixer rather than assuming input intent equals movement. Changing speed requires a matching cadence or stride change; high speeds may need another gait rather than unlimited playback acceleration.

An in-place cycle removes reference world travel. A world-fixed support therefore moves backward in character space during forward translation. Judge slip only after composing the cycle with the intended reference travel, not against the stationary floor of an isolated in-place preview. For nonperiodic motion, synchronize trajectory and deformation directly rather than forcing a cycle-rate formula.

For a path, measure arc length or actual displacement. Uniform curve-parameter increments need not produce uniform speed. Use a continuous heading, plan future contacts in that direction, and retain existing support contacts through the turn. Do not duplicate translation in both the world root and armature/posture root.

## Close loops and transitions before adding lag

Match the cycle boundary pose and its relevant velocity. A duplicated endpoint key can define the boundary without being rendered twice in a loop. Distinguish stored action bounds, rendered frames, and exported clip time; inspect actual keys/timestamps instead of trusting labels or unused manual bounds.

Replay enough cycles to reveal an accumulating discontinuity. Inspect contacts from directions that reveal the relevant displacement as well as the delivery camera. Refine sampling around a suspected failure; a few attractive key states cannot establish continuity between them.

Start and stop in valid states of the chosen motion and contact model without teleporting a contact. For stepping, this includes completing the final landing; continuous contact requires a valid transition of its contact regions and deformation. Verify acceleration, deceleration, turns, and cycle-to-rest transitions independently where requested.

Add secondary motion only after primary deformation and travel work. Derive it from the intended weight, attention, or material response while preserving approved silhouette, contact, and loop conditions. Secondary motion uses coherent timing rather than unrelated oscillations added until the result looks busy.

## Bake without destroying the authoring rig

Keep the source controls and constraints editable. On an export copy or separate action, sample the evaluated result while its constraints still exist, convert using the correct sampled parent/rest transforms, and verify the baked pose against the source before removing unsupported dependencies.

Retain necessary non-deforming ancestors. Export only character-owned content and requested clips. Reimport into a clean environment and compare durations, motion, loop endpoints, and feature placement. Run the target consumer when requested; format support and a successful export operation do not establish fidelity.

Precomputed path contact and runtime clip blending have different guarantees. Report arbitrary-turn or blend limitations unless the runtime contact behavior was implemented and checked separately.

## Mechanism references

Read on 2026-09-22; Blender pages identified themselves as the 5.2 LTS Manual. These sources explain mechanisms, not aesthetic quality or a universal skeleton.

- [Bone Deform](https://docs.blender.org/manual/en/latest/animation/armatures/bones/properties/deform.html#deform): bone influence on geometry can be disabled independently of its control role. Naming and hierarchy remain design choices.
- [Inverse Kinematics](https://docs.blender.org/manual/en/latest/animation/constraints/tracking/ik_solver.html#inverse-kinematics-constraint): target, chain, pole, rotation, and stretch determine solver behavior.
- [Constraint spaces](https://docs.blender.org/manual/en/latest/animation/constraints/interface/common.html#space): target and owner spaces affect where values are read and applied.
- [glTF 2.0 animation](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations): core animation channels store translation, rotation, scale, and morph weights. Verifying evaluated motion in those channels is a portability strategy, not a claim that every exporter needs identical bake settings.
