/** One strongest burn per target. Duration is measured in unaccelerated burn seconds. */
export interface BurnState { burnPower: number; burnDuration: number; burnFlammability: number }
export const FLAMMABILITY_SPEED_PER_STACK = 0.25;
/**
 * At most ×4 burn speed (2026-10-22 balance): with ~100 cards a run, uncapped stacks reached 100–360
 * late (×25–×90) and made any burn a win regardless of enemy HP. Fire still kills bosses fastest.
 */
export const MAX_FLAMMABILITY = 12;
export function burnSpeed(state: BurnState) { return 1 + Math.min(MAX_FLAMMABILITY, Math.max(0, state.burnFlammability)) * FLAMMABILITY_SPEED_PER_STACK; }

/** Source/tag bonuses have already been snapshotted into power before comparison. */
export function applyBurn(state: BurnState, power: number, duration: number): void {
  if (!Number.isFinite(power) || !Number.isFinite(duration) || power <= 0 || duration <= 0) return;
  if (state.burnPower <= 0 || state.burnDuration <= 0) {
    state.burnPower = power; state.burnDuration = duration; state.burnFlammability = 0;
    return;
  }
  state.burnDuration = Math.max(state.burnDuration, duration);
  if (power > state.burnPower) state.burnPower = power;
  else state.burnFlammability = Math.min(MAX_FLAMMABILITY, state.burnFlammability + 1);
}

/** Acceleration spends the same damage budget faster; never bill beyond remaining duration. */
export function advanceBurn(state: BurnState, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || state.burnPower <= 0 || state.burnDuration <= 0) return 0;
  const consumed = Math.min(state.burnDuration, seconds * burnSpeed(state));
  const damage = state.burnPower * consumed;
  state.burnDuration = Math.max(0, state.burnDuration - consumed);
  if (state.burnDuration < 1e-9) { state.burnPower = 0; state.burnDuration = 0; state.burnFlammability = 0; }
  return damage;
}
