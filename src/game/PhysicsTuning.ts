export const CONTACT_TUNING = {
  positionIterations: 8,
  velocityIterations: 6,
  constraintIterations: 2,
} as const;

/** Reduce solver work only after the round has built a large stack. */
export const CONTACT_TUNING_TIERS = [
  CONTACT_TUNING,
  { positionIterations: 6, velocityIterations: 4, constraintIterations: 2 },
  { positionIterations: 4, velocityIterations: 3, constraintIterations: 2 },
] as const;

export const CONTACT_TUNING_THRESHOLDS = [0, 40, 80] as const;

export const SERPENTELA_PHYSICS = {
  restitution: 0.12,
  friction: 0.55,
  frictionStatic: 1,
  frictionAir: 0.02,
  slop: 0.1,
  sleepThreshold: Infinity,
} as const;
