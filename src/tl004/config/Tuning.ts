/**
 * TL004 feel and rule numbers. Gameplay timing is counted in physics steps,
 * never wall-clock time, so frame rate and visual effects cannot change scores.
 */
export const STEP_HZ = 60;
export const STEP_MS = 1000 / STEP_HZ;
export const steps = (seconds: number): number => Math.round(seconds * STEP_HZ);

/** 16:9 safe area. Scale.EXPAND extends the canvas beyond it on other ratios. */
export const VIEW = { width: 1920, height: 1080 } as const;

export const WORLD = {
  groundY: 940,
  killY: 1700,
  minX: -600,
  maxX: 4200,
} as const;

export const PHYSICS = {
  gravityY: 0.85,
  gravityScale: 0.001,
  positionIterations: 8,
  velocityIterations: 6,
  constraintIterations: 2,
  /** Hard speed cap in px per step. Below the thinnest plank (28 px), so nothing tunnels. */
  speedCap: 26,
  /** At most this many physics steps per rendered frame; extra time is dropped (game slows, rules stay exact). */
  maxStepsPerFrame: 4,
  /** Steps simulated at load so the tower starts in its settled pose, then everything sleeps. */
  presettleSteps: 240,
} as const;

/** Downward speed gained per step: gravity × scale × step². */
export const GRAVITY_PER_STEP = PHYSICS.gravityY * PHYSICS.gravityScale * STEP_MS * STEP_MS;

export const SERPENTELA = {
  /** Display and collider scale of the 96 px artwork (≈ 9% of the 1080 px safe height). */
  scale: 1,
  density: 0.002,
  friction: 0.6,
  frictionStatic: 0.9,
  frictionAir: 0.004,
  restitution: 0.22,
} as const;

export const SLING = {
  x: 420,
  y: 690,
  /** Rest point of the band, where the serpentela sits. */
  restOffsetY: -10,
  /** Visual pull of the serpentela in world px at full power. */
  maxDrag: 190,
  /** Full power is reached at this share of the screen height, so thumb travel is the same at any zoom. */
  dragScreen: 0.22,
  /** Releasing within this share of full pull cancels the shot. */
  cancelPower: 0.12,
  /** Touch can start anywhere within this fraction of the screen height around the sling. */
  touchRadius: 0.25,
  maxLaunchSpeed: 24,
  /** Preview shows this fraction of the predicted flight to the ground. */
  previewFraction: 0.35,
  previewDotEvery: 3,
  trailDotEvery: 3,
} as const;

export const SHOT = {
  settleSteps: steps(0.6),
  forceNextSteps: steps(8),
  /** The last shot waits longer before the level is judged lost. */
  forceLastSteps: steps(12),
  skipAfterSteps: steps(1.5),
  quietSpeed: 0.18,
  quietAngularSpeed: 0.006,
  /** Impacts below this strength make no sound or effect. */
  impactEventMin: 6,
} as const;

export const SCORE = {
  crystal: 5000,
  remainingShot: 10000,
  chainWindowSteps: steps(3),
  chainMinBreaks: 5,
  chainBonus: 0.2,
} as const;

export const FX = {
  hitStopMs: 60,
  hitStopMinImpact: 30,
  slowMotionMinBreaks: 8,
  slowMotionRate: 0.4,
  slowMotionMs: 600,
  shakeMinImpact: 26,
} as const;
