---
name: game-interface-design
description: 'Entry point for mobile-web game work: routes game planning and optional Figma game UI to reference-driven-game-design, and explicit build, prototype, or existing game web UI polish requests to threejs-game-wireframe. Use for game concepts, mechanics, player journeys, HUDs, feedback, replay, business hypotheses, a local Three.js prototype of a planned game, or a read-only review of an existing game plan or UI. Not a general SaaS UI skill.'
allowed-tools:
  - Bash
---

# Game Interface Design

Route once, then read and execute only the selected package-local skill. Do not load another plugin.

| Request                                                                | Mode                                 | Skill                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Plan, rules, levels/progression, flows, HUD wireframes, feel, business | `PLAN_ONLY` (default)                | [Reference-Driven Game Design](../reference-driven-game-design/SKILL.md) |
| Editable Figma game UI or prototype links                              | `FIGMA` (needs an authorized target) | [Reference-Driven Game Design](../reference-driven-game-design/SKILL.md) |
| Build, implement, prototype, "make it playable" from a plan            | `THREEJS_WIREFRAME`                  | [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md)            |
| Refine an existing game web UI directly in code, without Figma         | `THREEJS_WIREFRAME`                  | [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md)            |

- A planning-only request stays `PLAN_ONLY`; do not start code.
- An explicit implementation request goes straight to `THREEJS_WIREFRAME` and reuses the existing plan. Do not rerun the full planning interview; fill gaps with labeled defaults.
- A new game implementation request with no plan at all: run only Stage 0–1 of game design (promise, core loop, failure, restart), plus the optional level/progression contract when requested, then implement.
- Existing UI-only work reuses the current game as its plan; do not invent a new game or restart its planning interview.
- Figma is not a prerequisite for `THREEJS_WIREFRAME`.
- Web UI implementation uses the selected skill's package-local reference-driven code design workflow: observed references → semantic tokens → pilot → browser critique. Do not invoke the Figma skill for code delivery. Explicit greybox-only/layout-only/mechanics-only requests keep their narrower scope.
- A review request ("봐줘", "뭐가 문제야", critique, audit) goes to the skill that owns the artifact (plan or Figma game UI → Reference-Driven Game Design, running web UI → Three.js Game Wireframe) and stays read-only there. A URL, screenshot or file names the scope, not edit permission.
- Preserve the requested mode. Never report a plan as a playable build or a Figma file as a tested game.
