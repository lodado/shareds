# Compose the readable play experience

Map each wireframe/state to a verified source and expected behavior. Place the game field and major HUD/overlay regions before small decoration. Compose editable source frames/instances; respect overrides and ownership. Separate semantic HUDs from world concept imagery.

Use Auto Layout and appropriate Hug/Fill/Fixed rules, responsive text and constraints. Intentional absolute placement for a game field/effect is allowed with explicit bounds and input semantics. Do not hide actual overflow with arbitrary fixed clipping.

Prototype 1–3 representative states on the approved viewport before expansion. Include an active play situation, danger/failure and immediate replay when relevant. Real copy and approved content must fit; label non-production concept imagery.

Figma cannot establish moving occlusion, physics, input latency or browser event propagation. Mark those as runtime tasks. Do not pretend a drawn 3D world is an editable game model or a playable simulation.
