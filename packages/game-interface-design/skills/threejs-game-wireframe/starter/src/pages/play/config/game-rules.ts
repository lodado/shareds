// Tuning values are hypotheses until a playtest measures them.
export const GAME_RULES = {
  stepMs: 1000 / 60,
  // Longer stalls (tab switch, debugger) drop time instead of fast-forwarding the run.
  maxCatchUpSteps: 5,
  baseSize: 3,
  blockHeight: 0.5,
  travel: 4.5,
  startSpeed: 3,
  speedPerBlock: 0.12,
  perfectTolerance: 0.1,
  debrisGravity: 18,
  debrisFloor: -30,
} as const

export type GameRules = typeof GAME_RULES
