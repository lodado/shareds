# Behavior catalog

Timing ranges are starting points; replace them with what your references show. `kind` is the value the trace
uses: `idle` (picked by the idle chooser), `social`, `play`, `defense` or `move`.

## Resting

- **sit** (`idle`): rump on the floor, chest up, front legs straight, hind legs folded; tail on the floor and,
  once settled, wrapped toward the front paws. Eyes soft, slightly narrowed; ears neutral. Runs look-arounds:
  an ear swivels, the head turns and holds 0.6–2 s. 4–12 s.
- **loaf** (`idle`): all four paws tucked under, body low and rounded, tail along the side. Eyes half closed;
  drifts into sleep when energy is low. 8–25 s.
- **sleep** (`idle`): loaf or curl with the head lowered, eyes closed, breathing slower and deeper. Ears still
  flick at sounds without waking. 15–60 s. Waking: eyes open in two steps, then usually yawn and stretch.
- **yawn** (`idle`): head tips up, the mouth opens slowly (0.5–0.8 s) to full, eyes shut, ears turn back a
  little; hold 0.3–0.6 s; close faster (0.2–0.4 s); a lick of the lips may follow.
- **stretch** (`idle`): front stretch first — forelegs reach forward along the floor, chest drops, rump stays
  up, 1–2.5 s; often a hind stretch after it: one step forward while a hind leg extends straight back for
  0.5–1 s.
- **groom** (`idle`): sitting or lying; bouts of quick tongue strokes on a raised front paw (a few per second),
  then the wet paw wipes from the cheek over the ear 2–4 times with the head tilted into it, then back to
  licking; or licks along the chest and flank. Eyes half closed. The order of body areas varies; mouth-grooming
  takes most of the time. 4–15 s. Also the usual displacement after a swat, a missed pounce or a startle.
- **knead** (`idle` or `social`): front paws push alternately into a soft surface, about 1–2 presses per
  second, eyes narrowed, often purring. 3–10 s.

## Moving

- **walk** (`move`): lateral sequence LH → LF → RH → RF, a quarter cycle apart, two or three feet down; calm
  cycle 0.8–1.2 s. Head level and steady; tail low-to-mid with a slow sway, or up when greeting.
- **trot** (`move`): diagonal pairs together (LH with RF, RH with LF), cycle 0.4–0.6 s, more bounce; purposeful
  or hurried, such as leaving after a swat.
- **run / flee** (`defense`): bounding — the body gathers and extends, the tail streams back as a counterweight,
  ears flat when fleeing; ends in `wary`.

## Social

- **approach** (`social`): walk toward the person with the tail straight up (the tip may hook), ears forward,
  eyes soft; ends with a rub or sitting close.
- **rub** (`social`): forehead or cheek pressed into the hand and slid along it; tail up, may quiver; purring;
  1–3 passes.
- **petted** (`social`): leans into the hand, tilts the head to steer the stroke, eyes narrow, purring builds
  after a few strokes, tail relaxed or up. Drains tolerance while it lasts.
- **blinkReply** (`social`): 1–3 half-blinks (0.2–0.3 s each), then the eyes narrow or close and hold 0.6–2 s,
  then open. Likely when relaxed, sometimes absent.
- **listen** (`social`): the ear nearest the sound turns, the head may follow, often nothing else. Comes over,
  tail up, only when relaxed and not tired.

## Overstimulation

- **warn** (`defense`): escalating signals while the petting continues — tail-tip flick → swish → lash or
  thump; ears sideways → flat; skin ripples along the back; head turns toward the hand; pupils dilate; body
  stiffens. At least 0.4 s of visible warning before a swat; stopping the strokes ends it.
- **swat** (`defense`): one front paw strikes toward the hand, fast out (0.1–0.2 s) and slower back, ears flat.
  Then `leave`.
- **leave** (`move`): walks or trots a short way off, tail low and twitching, then grooms or sits facing away.
  Tolerance refills over tens of seconds.

## Play and hunting

- **watch** (`play`): eyes and head lock on the toy, pupils dilate, ears and whiskers forward, body lowers a
  little, tail tip twitches.
- **stalk** (`play`): slow, low steps toward the toy, head forward and level; freezes mid-step when the toy
  jumps or comes at the cat; tail low and straight.
- **crouch** (`play`): rump gathered, hind feet treading (the wiggle), tail tip twitching, 0.3–1.5 s. The pounce
  comes when the toy pauses or moves away, not when it charges.
- **pounce** (`play`): explosive launch (≤ 0.1 s), short arc (0.3–0.5 s), front paws reaching, hind legs
  extended; lands front paws first, squashes, pins or bats. Energy drops with each one.
- **bat** (`play`): quick paw pats at the toy, 0.15–0.25 s each, sometimes alternating paws.
- **lose interest** (`idle`): after a few pounces, or once the toy has stayed hidden: sits, looks away, grooms
  or lies down.

## Defense

- **startle** (`defense`): within 0.12 s of a sudden stimulus — a flinch or hop, ears flat, pupils wide, tail
  and back fur puffed; freezes 0.3–1 s; then `wary`, or `flee` after a strong stimulus. Harmless repeats get
  weaker reactions (habituation); repeated pokes get stronger ones and end in a swat (sensitization).
- **wary** (`defense`): low posture, ears sideways, tail low with occasional flicks, eyes on the source; 2–6 s,
  then back to rest.
- **defensive arch** (`defense`, strong threat only): back arched high, side turned to the threat, legs stiff,
  fur and tail puffed, ears back, mouth open in a hiss.
