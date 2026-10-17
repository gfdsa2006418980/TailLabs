/** Prototype balance values; keep the 500-piece main challenge as the default. */
export const ROUND = {
  target: 500,
  dropCooldownMs: 400,
  failGraceMs: 750,
  safeLeft: 120,
  safeRight: 400,
  fallLimit: 660,
  pointsPerPiece: 100,
  pointsPerHeight: 2,
  speedTargetMs: 600_000,
  speedPointsPerSecond: 10,
} as const;
