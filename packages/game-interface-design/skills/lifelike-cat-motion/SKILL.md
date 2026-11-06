---
name: lifelike-cat-motion
description: 'Make a 2D or 2.5D cat character move and react like a real cat (고양이 동작, 몸짓, 쓰다듬기·장난감·놀람 반응): a behavior model of mood, states and body-language channels built from real-cat photo and video references, timing for idle life, gaits and a limb skeleton with a gait solver, grooming, stretching, stalking and pouncing, and pointer or touch interactions, checked by a deterministic behavior-trace script. Use for idle animation that should feel alive, petting, play or startle interactions, retiming a stiff cat animation, or a read-only review of a cat behavior spec or trace; not pixel frame drawing, 3D rigging, or general UI motion.'
allowed-tools:
  - Bash
metadata:
  short-description: Reference-backed cat behavior, body language and interaction with a trace check
---

# Lifelike Cat Motion

A cat looks alive when its body says what it feels and its timing matches a real cat: long
stillness, quick precise moves, ears before head before body, warnings before a swat. This skill
turns a request into a behavior sheet backed by real references, builds the behavior in layers,
and checks a recorded behavior trace with a script. The script judges order and timing, not
charm; that still needs eyes on the result. Use the user's language for reports; trace keys stay
English. Commands run from this skill's folder: `node scripts/check-trace.mjs <trace.json>`.

## Request

Fill gaps with labeled defaults and record them in the report.

- `RENDERER`: SVG, Canvas, DOM, skeletal (Spine and similar) or sprite sheet. Default: what the project already uses.
- `VIEW`: side, 3/4, or isometric front/back sets, and what the rig can move: head, each ear, eyelids, pupils,
  mouth, tail curve, each leg, body pitch.
- `BEHAVIORS`: default pet set — sit, loaf, sleep, groom, yawn and stretch, walk, look and listen, petting with
  warnings, play (watch → stalk → crouch → pounce), startle.
- `INPUTS`: hover, stroke, tap, toy, call, slow blink, sudden noise; keyboard or button equivalents for each.
- `PERSONALITY`: boldness, sociability, playfulness, 0–1, default 0.5.

## Workflow

1. **References first.** For every behavior, collect at least two photos of real cats (key poses) and one
   video (timing). Step through the video and write down when each key pose happens and what the ears, eyes,
   tail and body do. Keep that list in the report, not in the code.
2. **Behavior sheet.** One entry per behavior: trigger and preconditions, key poses in order (anticipation →
   action → settle), timing ranges, channel presets, exits and cooldown ([catalog](references/behavior-catalog.md)).
   Check each entry against its references before building it.
3. **Map the rig.** List the channels the rig can show ([body language](references/body-language.md)). When a
   behavior needs a channel the rig lacks (ear rotation, eyelids, tail curve), add the control or drop the
   behavior; never fake one channel with another.
   For legs, build one shared skeleton and gait solver first ([limb rig and gait](references/limb-rig-and-gait.md)),
   then make each view or skin follow it. A view cut from an approved raster still moves by transforming its cut
   layers ([raster view rigging](references/raster-view-rigging.md)); rest must stay pixel-equal to the still.
4. **Build in layers.** Mood → state machine → channels → motion, with every input entering through appraisal
   ([interaction model](references/interaction-model.md), [motion and timing](references/motion-and-timing.md)).
   States set channel targets, channels ease toward them at their own speeds, and micro-motions run on
   independent random timers.
5. **Trace and check.** Log states, signals, stimuli, foot contacts and mood samples
   ([trace format](references/trace-check.md)), drive scripted scenarios through the same handlers as real
   input, and run `node scripts/check-trace.mjs <trace.json>` until it exits 0 with nothing listed as not
   exercised.
6. **Look.** Put a screenshot of each key pose beside its reference photo and fix silhouettes that do not read.
   Watch at full and quarter speed, and once with reduced motion on.

## Rules that make it read as a cat

- Stillness is the base state. Life comes from small, independent, irregular channels: breathing, single-ear
  flicks, tail-tip twitches, rare blinks, head turns that stop and hold.
- Attention travels ears → head → body. The ear nearest a sound turns first, the head follows 0.03–0.4 s later
  if the sound matters, the body turns last if at all. Ignoring is a normal answer.
- The head stays level while the body moves under it: walking, trotting, landing.
- Walk footfalls are a lateral sequence (left hind, left fore, right hind, right fore); a trot moves diagonal
  pairs together.
- Planted feet do not slip: the floor scrolls by the stride speed, and a foot is flat on it from touchdown to
  lift-off. A view along the walking axis takes short steps (about half), or the cat looks like it crawls.
- The tail lags the body, overshoots, and carries mood: up is friendly, low and still with a twitching tip is
  focused, lashing is irritated, puffed is scared.
- Every big move has anticipation: a crouch with hind-foot treading (the wiggle) before a pounce, a weight
  shift before a jump. Landings take the front paws first and absorb.
- Mood changes gradually. Only a startle may jump, and it starts within 0.12 s of its stimulus.
- Petting has a budget. Cheeks, the space between eyes and ears, and the chin drain it slowly; the tail base and
  belly drain it fast. When it runs low, show escalating warnings for at least 0.4 s before any swat; after the
  swat the cat leaves and often grooms.
- A slow blink is sometimes answered with half-blinks and then a long eye narrowing, never on cue every time.
- Durations vary by 20–30 % and come from variants; no idle action plays three times in a row.
- Reduced motion keeps every signal as a static pose and drops oscillation, jitter and leaps.

## Implementation notes

- Keep the behavior model renderer-free: plain data plus `update(dt)`; the renderer only reads channels.
- Use one seedable random source; scenario scripts call the same handlers as pointer and button events.
- Time comes from the model clock, not wall time, so tests can step frames.
- Keep the trace as an array of events for the check; cap its length outside tests.

## Review

A review request ("봐줘", why does it feel fake) stays read-only: findings ordered P0–P3, each with its
location, the real-cat behavior it contradicts, what the viewer notices and the smallest fix, without editing
until asked. Run the trace check when a trace exists and report its output as printed.

## Report

Behaviors built with the references used for each (links go in the report only), rig channels added, the
solver tests and rest-pose difference when legs were rigged, the scenario list, the `check-trace` output (rules checked, failures, not exercised), the pose screenshots compared,
reduced-motion behavior, and what still needs a human look, such as charm and readability at small sizes.
Never claim the cat feels alive on the strength of the check alone.
