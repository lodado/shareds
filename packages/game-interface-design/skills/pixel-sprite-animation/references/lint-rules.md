# Lint rules

`build` and `lint` exit 0 only with zero errors and zero unwaived warnings; otherwise 1 (2 for an
invalid spec, a missing spec file or a usage error). `build --draft` writes every output and the
report, prints `DRAFT`, and exits 0 whatever lint finds (still 2 for an invalid spec); it is for
Stage 2–3 iterations and never counts as delivery. Warnings can be waived with a reason; errors cannot.
Thresholds in parentheses can be overridden in `thresholds` only together with `thresholds.reason`
(`T0`).

Body rules read the frame's body only: pixels from `fx: true` layers and patches are ignored by `H5`,
`H6`, `H7`, `M4`, `M5`, `M6` and `M10`. `H1`, `H2` and `H8` read everything that is drawn.

## Hygiene

- `H1` error — a pixel uses a key missing from `palette`. Shown magenta in outputs.
- `H2` error — more distinct colors than the spec's top-level `maxColors` (default 16), effects
  included. Merge near-duplicates into ramps.
- `H3` error — a `rows` grid is not exactly canvas-sized: missing or extra rows, short or long columns.
- `H4` warning — drawn pixels fell outside the canvas; the message names each layer, op or patch and
  its count. A patch `"."` outside the canvas erases nothing and is not counted; a `flip` whose rect
  crosses the edge loses the drawn pixels it mirrors outside.
- `H5` warning — floating body pixels (all 8 neighbors transparent); smear/`fx` frames and `effect`
  sprites are exempt.
- `H6` warning, only when `outline` is set — over 10% of the body's silhouette edge is neither
  `outline` nor `outlineAlt`; `outline: false` parts and smear/`fx`/`flash`/`blank` frames are exempt.
- `H7` error, only when `baseline` is set — the lowest body pixel is not on `baseline` and the frame is
  not `airborne`/`fx`/`blank`. The message lists up to three offending pixels as `x,y=key`: the pixels
  below the baseline, or the lowest row when the body floats above it.
- `H8` error — empty frame without the `blank` tag.

## Motion

- `M1` error for `action` (warning for `idle`) — every frame has the same duration.
- `M2` error for `action` — phase order: anticipation (at least one, first) → travel/smear → impact →
  follow-through/hold → recovery → hold. Smears may sit anywhere between the first anticipation and
  the first impact (take-off and arrival smears), never after contact. Messages, each naming its frame
  where there is one:
  - `phase <phase> does not belong in an action` (idle, cycle or effect);
  - `no impact frame`;
  - `no anticipation before the first impact`;
  - `<phase> before the first anticipation`;
  - `anticipation after travel or smear`;
  - `<follow-through|recovery|hold> before the impact`;
  - `<anticipation|travel|smear> after the impact`;
  - `<phase> out of order after the impact` (the after-contact stages only move forward).
- `M3` error for `action` — player anticipation total above `startupMs` (100); enemy anticipation total
  below `telegraphMs` (300); `neutral` actors have no budget. Only anticipation counts; travel time is
  reported as `travelMs`. A response within 0.1 s reads as immediate; enemies must be readable.
- `M4` warning — more than `gap` (0.55) of the combined body silhouette changes between neighbors (and
  across the loop seam); smear, `fx`, `flash` and `blank` frames are exempt. Add an in-between frame, or
  a take-off/arrival smear.
- `M5` warning — the last anticipation and the first impact, and each pair of consecutive `key` frames,
  overlap by `keyIoU` (0.85) or more; the poses do not read as different.
- `M6` warning — a `squash`/`stretch` frame's body area differs by more than `volume` (25%) from the
  frame named in `volumeRef`, or from the first plain frame when there is none.
- `M7` warning — impact frame plus hitstop shows contact for under 60 ms.
- `M8` error — more than 3 flash starts in any second over two loops. A start is a run of `flash`
  frames, or `feel.flash` at contact; both at the same moment count once.
- `M9` warning — a frame is shorter than one logic tick or under the 20 ms GIF minimum. `lint.json`
  reports each frame's displayed duration at `fps`.
- `M10` warning — neighboring frames (smear/`fx`/`flash`/`blank` excluded) share less than `identity`
  (0.6) of their body color histogram: redraw drift or an image model changing the character.
- `M11` warning for a player `action` — travel and smear before the first impact add up to more than
  `contactMs` (250): the player already waited through the startup. Shorten the flight, or waive it for
  a deliberate lunge or jump.

`lint.json` and `feel.json` report `startupMs` (anticipation only), `travelMs` and `timeToContactMs`
(every frame before the first impact).

## Feel

- `F1` warning — hitstop outside 33–200 ms.
- `F2` error — hitstop without `scope` (`presentation` or `simulation`).
- `F3` error — shake not a whole number of pixels.
- `F4` error — hitstop, shake or flash without `feel.reduced`.

Invalid `feel.reduced` values stop the build as a spec error: each must be a whole number from 0 up to
its full counterpart.

## Records

- `L1` error — one of a frame's effective sources (its own `source`, its `base` chain's, or a placed
  part's) has no `sources` entry with a non-empty license; the message names where it came from. It
  checks that a license is written down, not what it allows; `L2` does that.
- `L2` — the class of each `sources` license, matched on whole words: `open` (CC0, public domain, PD,
  MIT, own or original work) passes unless a negation precedes it ("not CC0"); `attribution` (CC-BY,
  OGA-BY) passes only with an author and a url in the entry, else a warning; `copyleft` (CC-BY-SA, GPL
  versions, share-alike) is a warning, "copyleft — check before commercial release"; `generator`
  (generator, generated, subscription or a named generator) is a warning, "plan-dependent commercial
  terms"; `restricted` (NonCommercial, NoDerivatives) is an error, because a modified commercial game
  cannot use it; `unknown` (including all rights reserved, personal use, or plain "terms"/"plan") is an
  error. The finding's `frame` is the source's name, so `{ "rule": "L2", "frame": "<source name>", "reason": … }`
  waives one source's warning; a waiver without `frame` waives every `L2` warning.
- `T0` error — threshold override without `thresholds.reason`.
- `W0` error — waiver without a reason. `W1` error — waiver that matches no warning (delete it).

## What the gates cannot judge

Appeal, anatomy, readable faces, whether the smear follows the true arc, and whether the hit feels good
in the game. Those come from the contact-sheet checklist and a playtest, and are reported as judgment
or `NOT_RUN`, never as lint results.
