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

export const ROUND_ASSIST = {
  10: { stickinessDelayMs: 3000, lightPillarHeightMultiplier: 0 },
  50: { stickinessDelayMs: 2500, lightPillarHeightMultiplier: 1.2 },
  100: { stickinessDelayMs: 2000, lightPillarHeightMultiplier: 1.4 },
  500: { stickinessDelayMs: 1500, lightPillarHeightMultiplier: 1.8 },
} as const;

export function getRoundAssist(target: number) {
  return ROUND_ASSIST[target as keyof typeof ROUND_ASSIST] ?? ROUND_ASSIST[ROUND.target];
}
