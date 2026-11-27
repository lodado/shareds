---
name: game-interface-design
description: 'Entry point for mobile-web game work: routes game planning and optional Figma game UI to reference-driven-game-design, explicit build, prototype, or existing game web UI polish requests to threejs-game-wireframe, pixel-art sprite animation (도트, 스프라이트) to pixel-sprite-animation, cat behavior and interaction (고양이 동작, 쓰다듬기 반응) to lifelike-cat-motion, a three.js scene rendered as pixel art (도트 디오라마) to pixel-art-diorama, a pixel-art object that turns (sprite stacking, 회전 도트 차·전함, baked direction sprites) to sprite-stacking, and a rigged 3D pixel character with painted heads and swappable parts (3D 픽셀 캐릭터, 파츠 조립) to voxel-character. Use for game concepts, mechanics, player journeys, HUDs, feedback, replay, business hypotheses, a local Three.js prototype of a planned game, animated pixel sprites, a cat character that moves and reacts like a real cat, a pixel-art 3D diorama, a rotatable or direction-baked pixel-art object, a voxel character and its workshop, or a read-only review of an existing game plan, UI, sprite spec, cat behavior diorama, sprite stack or voxel character. Not a general SaaS UI skill.'
allowed-tools:
  - Bash
---

# Game Interface Design

Route once, then read and execute only the selected package-local skill. Do not load another plugin
for routing; only the selected skill may hand work to an installed one where it names that hand-off.

| Request                                                                 | Mode                                 | Skill                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Plan, rules, levels/progression, flows, HUD wireframes, feel, business  | `PLAN_ONLY` (default)                | [Reference-Driven Game Design](../reference-driven-game-design/SKILL.md) |
| Editable Figma game UI or prototype links                               | `FIGMA` (needs an authorized target) | [Reference-Driven Game Design](../reference-driven-game-design/SKILL.md) |
| Build, implement, prototype, "make it playable" from a plan             | `THREEJS_WIREFRAME`                  | [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md)            |
| Refine an existing game web UI directly in code, without Figma          | `THREEJS_WIREFRAME`                  | [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md)            |
| Pixel-art sprite or effect animation, retiming an imported sprite sheet | `PIXEL_SPRITE`                       | [Pixel Sprite Animation](../pixel-sprite-animation/SKILL.md)             |
| Cat behavior and interaction: idle life, petting, toy play, startle     | `CAT_MOTION`                         | [Lifelike Cat Motion](../lifelike-cat-motion/SKILL.md)                   |
| A three.js scene rendered as pixel art: diorama, outlines, palette      | `PIXEL_DIORAMA`                      | [Pixel Art Diorama](../pixel-art-diorama/SKILL.md)                       |
| A pixel-art object that turns: sprite stack, baked direction sprites    | `SPRITE_STACK`                       | [Sprite Stacking](../sprite-stacking/SKILL.md)                           |
| A rigged 3D pixel character with painted heads and swappable parts      | `VOXEL_CHARACTER`                    | [Voxel Character](../voxel-character/SKILL.md)                           |

- A planning-only request stays `PLAN_ONLY`; do not start code.
- A sprite animation request goes to `PIXEL_SPRITE`; putting finished sprites into a playable prototype is `THREEJS_WIREFRAME`.
- A cat behavior, body-language or interaction request goes to `CAT_MOTION`; drawing its sprite frames stays `PIXEL_SPRITE`, and building a game around the cat is `THREEJS_WIREFRAME`.
- A 3D scene that should look like pixel art (a diorama, low-res outlines and palette, pixel crawl, a slow diorama) goes to `PIXEL_DIORAMA`; animating its sprites stays `PIXEL_SPRITE`, and turning it into a playable game loop is `THREEJS_WIREFRAME`.
- One pixel-art object that must turn or face many directions (a car, ship or prop as a sprite stack, realistic or franchise-styled, slice layers showing, baked direction sheets) goes to `SPRITE_STACK`; frame-by-frame animation of it stays `PIXEL_SPRITE`, and a whole 3D scene is `PIXEL_DIORAMA`.
- A character that walks, works and turns in 3D pixel art, built from swappable faces, headwear, coats and tools (a voxel body with painted heads, a character workshop or dress-up page, 3D 픽셀 캐릭터) goes to `VOXEL_CHARACTER`; a rigid object that only turns stays `SPRITE_STACK`, and hand-drawn frames stay `PIXEL_SPRITE`.
- An explicit implementation request goes straight to `THREEJS_WIREFRAME` and reuses the existing plan. Do not rerun the full planning interview; fill gaps with labeled defaults.
- A new game implementation request with no plan at all: run only Stage 0–1 of game design (promise, core loop, failure, restart), plus the optional level/progression contract when requested, then implement.
- Existing UI-only work reuses the current game as its plan; do not invent a new game or restart its planning interview.
- Figma is not a prerequisite for `THREEJS_WIREFRAME`.
- Web UI implementation uses the selected skill's package-local reference-driven code design workflow: observed references → semantic tokens → pilot → browser critique. Do not invoke the Figma skill for code delivery. Explicit greybox-only/layout-only/mechanics-only requests keep their narrower scope.
- A review request ("봐줘", "뭐가 문제야", critique, audit) goes to the skill that owns the artifact (plan or Figma game UI → Reference-Driven Game Design, running web UI → Three.js Game Wireframe, sprite spec → Pixel Sprite Animation, cat behavior or trace → Lifelike Cat Motion, diorama scene → Pixel Art Diorama, sprite stack → Sprite Stacking, voxel character or its workshop → Voxel Character) and stays read-only there. A URL, screenshot or file names the scope, not edit permission.
- Preserve the requested mode. Never report a plan as a playable build or a Figma file as a tested game.
