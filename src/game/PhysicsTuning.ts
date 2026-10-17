export const CONTACT_TUNING = {
  positionIterations: 8,
  velocityIterations: 6,
  constraintIterations: 2,
} as const;

export const SERPENTELA_PHYSICS = {
  restitution: 0.12,
  friction: 0.55,
  frictionStatic: 1,
  frictionAir: 0.02,
  slop: 0.1,
  sleepThreshold: Infinity,
} as const;
