# First play, replay and recovery

Define a first meaningful action (FMA) observable under actual rules: e.g. a self-placed item causes a merge. Tutorial dismissal, opening the page and saving settings are not substitutes. An FMA event is a proxy for delivered opportunity, not proof the player enjoyed it.

Storyboard roughly the first minute using proposed—not measured—timings. Each beat names visible content, player inference, input, consequence, emotion hypothesis, possible misunderstanding and next state. Use real copy and keep deferrable instructions off the main path.

Count screens/actions/waits from entry to FMA. Distinguish onboarding prerequisites from optional tours. Returning players should not repeat guidance unnecessarily. Describe how users can revisit instructions.

Prepare separate Mermaid source blocks for navigation and game/lifecycle state. A proposed flow diagram is not an extracted Figma graph. Do not call another flow-diagram plugin implicitly.

Cover entry, returning player, ordinary play, first failure, replay, pause/resume, back/cancel and relevant data/error cases. Avoid one-screen-per-state inflation. An overlay must declare input capture, focus, escape/back semantics, underlying simulation and data retention.

Representative wireframes: 1–3 critical states with numbers, actual headlines/buttons, HUD field values labeled sample, playfield/control zoning and next-action arrows. Each maps `J- → S- → R- → T- → F- → X-` as applicable.

Mobile review: thumb reach, finger occlusion of placement targets, short viewport, dynamic browser chrome, safe area, text growth, orientation changes and pointer cancellation. Never solve clipped content by silently dropping required information. World controls and menu targets have different constraints; apply verified current accessibility guidance when making normative size/contrast claims.

DOM menus and a canvas playfield need separate accessibility plans. Provide non-color signals, mute-compatible outcomes and reduced-effect alternatives. Do not declare a canvas game screen-reader accessible merely because the pause button has a label.

Readiness: the player knows the next action, sees its consequence, can recover, and reaches FMA before nonessential setup. The design remains a usability hypothesis until observed with players.
