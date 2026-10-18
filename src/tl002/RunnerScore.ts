export const BASE_SPEED = 320;
export const MAX_SPEED_MULTIPLIER = 5;

export const SPEED_STEP_SECONDS = 30;
export const SPEED_RAMP_MIN_SECONDS = 5;
export const SPEED_RAMP_MAX_SECONDS = 10;

/** Increase the target by +0.5 every 30 seconds, easing over 5–10 seconds. */
export function speedMultiplierAt(seconds: number, rampSeconds: readonly number[] = []): number {
  const time = Math.max(0, seconds);
  if (time < SPEED_STEP_SECONDS) return 1;
  const step = Math.min(8, Math.floor(time / SPEED_STEP_SECONDS));
  const startedAt = step * SPEED_STEP_SECONDS;
  const from = 1 + (step - 1) * 0.5;
  const to = Math.min(MAX_SPEED_MULTIPLIER, from + 0.5);
  const duration = Math.max(SPEED_RAMP_MIN_SECONDS, Math.min(SPEED_RAMP_MAX_SECONDS, rampSeconds[step - 1] ?? 7.5));
  const t = Math.min(1, Math.max(0, (time - startedAt) / duration));
  const eased = t * t * (3 - 2 * t);
  return from + (to - from) * eased;
}

/** Use the same two-decimal multiplier in the readout and score calculation. */
export function scoreMultiplier(speed: number): number {
  return Math.min(MAX_SPEED_MULTIPLIER, Math.max(1, Math.round(speed / BASE_SPEED * 100) / 100));
}

export function runnerScore(distance: number, coins: number, multiplier: number): number {
  return Math.floor((distance + coins) * Math.min(MAX_SPEED_MULTIPLIER, Math.max(1, multiplier)) + 1e-9);
}

/** Existing distance-only records came from the previous capped speed curve. */
export function legacyMultiplier(elapsedMilliseconds: number): number {
  return scoreMultiplier(Math.min(720, BASE_SPEED + 140 * Math.log1p(elapsedMilliseconds / 12000)));
}
