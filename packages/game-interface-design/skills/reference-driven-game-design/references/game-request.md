# Game request contract

Normalize input with [request schema](../schemas/game-request.schema.json). Schema defaults describe suggestions; validation does not silently apply them.

Required: mode and a scoped game brief. Record idea, player/context, market, platform, renderer, team, controls, camera, orientation, source/brand authority, existing assets, excluded features and review-wait. Unknown is not none.

Missing idea → compare three different choice loops with cost, rule clarity, differentiation and falsifiable risks; choose a reversible proposal, not a fabricated user preference. Supplied idea → deepen that idea, do not replace it to satisfy the process.

For each requirement use `fact | user_decision | proposal | assumption | unknown`, a source/evidence locator, decision owner and affected artifacts. Avoid fake persona biographies.

Modes:

- PLAN_ONLY is a legitimate end product. It requires no Figma/MCP/account. Deliver concrete documents and a manifest.
- FIGMA adds actual authorized editable UI. Missing target or capability blocks Figma only. Preserve the requested mode and report incomplete Figma, not a silently completed plan.
- Neither mode authorizes playable-code generation, 3D model production, paid imports, deployment, purchase, publication, destructive updates or account changes.

For provided existing design choose preserve/change per area: ASSEMBLE, LOCALIZE, FIDELITY, RESKIN or REDESIGN. A game fork does not give permission to redesign a user's approved art.

Ask only for a truly unresolved material decision that cannot be inferred from provided sources. Prefer one scoped question while continuing independent work. For concept drafts, alternatives and labeled assumptions are sufficient; do not halt a whole plan on unspecified color or font.

Initial proposals: mobile web; one hand; portrait; fixed camera; small team; offline/local score for prototype; Three.js as rendering, not necessarily 3D physics. Confirm supplied constraints override proposals. No login/ads/store before the first meaningful action unless a documented policy requires it.

Checkpoint: experience promise, core decision, included/excluded scope, mode, authority, inventory and largest uncertainty. A written promise is not evidence of player demand.
