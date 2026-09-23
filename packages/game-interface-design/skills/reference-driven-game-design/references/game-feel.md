# Action-to-feedback specification

For each core action produce:
`id | input/commit moment | validity | first response | rule result | visual | audio/haptic | timing/intensity | interruption/retrigger | reduced-effect alternative | experiment`.

Specify what the player can feel/see, not "add juice". Start with input intent and correctness. Animation duration is not input latency. The earliest acknowledgement, simulation commitment and cosmetic completion can be different moments; identify them.

Timing numbers are initial tuning proposals with ranges and rationale. Measure actual input-to-visible response on identified devices before reporting latency. Repeated-frame updates, event dispatch and audio unlock are implementation concerns with explicit verification tasks.

Make feedback causally informative: contact position, material behavior, score change and consequences must agree. Do not add screen shake, hit-stop, flashing or vibration universally. Explain whether a cosmetic pause alters simulation or only presentation and how it affects fairness.

Effects must be interruptible or queue according to a documented rule. Define overlapping successes, maximum effect density, audio concurrency and repeated input while an animation runs. Satisfying polish cannot conceal a failed or delayed command.

Mute must preserve outcomes. Reduced-motion/effect mode must preserve danger, timing windows and distinguishing cues. Haptics are optional with a no-haptic path; verify actual device/provider support rather than claiming universal availability.

Small experimental garden: keep one rule and level context fixed, change one or two feedback variables, observe input confidence, mistakes and replay. A Figma transition may communicate intended timing but cannot establish physical feel. Report design self-review and playable experiment separately.
