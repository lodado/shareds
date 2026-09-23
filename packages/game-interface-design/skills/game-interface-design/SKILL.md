---
name: game-interface-design
description: 'Entry point for mobile-web game work: routes game planning and optional Figma game UI to reference-driven-game-design, and explicit build or prototype requests to threejs-game-wireframe. Use for game concepts, mechanics, player journeys, HUDs, feedback, replay, business hypotheses, or a local Three.js prototype of a planned game. Not a general SaaS UI skill.'
allowed-tools:
  - Bash
---

# Game Interface Design

Route once, then read and execute only the selected package-local skill. Do not load another plugin.

| Request                                                     | Mode                                 | Skill                                                                    |
| ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Plan, design, rules, flows, HUD wireframes, feel, business  | `PLAN_ONLY` (default)                | [Reference-Driven Game Design](../reference-driven-game-design/SKILL.md) |
| Editable Figma game UI or prototype links                   | `FIGMA` (needs an authorized target) | [Reference-Driven Game Design](../reference-driven-game-design/SKILL.md) |
| Build, implement, prototype, "make it playable" from a plan | `THREEJS_WIREFRAME`                  | [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md)            |

- A planning-only request stays `PLAN_ONLY`; do not start code.
- An explicit implementation request goes straight to `THREEJS_WIREFRAME` and reuses the existing plan. Do not rerun the full planning interview; fill gaps with labeled defaults.
- An implementation request with no plan at all: run only Stage 0–1 of game design (promise, core loop, failure, restart), then implement.
- Figma is not a prerequisite for `THREEJS_WIREFRAME`.
- Preserve the requested mode. Never report a plan as a playable build or a Figma file as a tested game.
