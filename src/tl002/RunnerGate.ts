import { MAX_SPEED_MULTIPLIER } from './RunnerScore.ts';

/** Seconds in simulation time: pausing/countdown never consumes the timing window. */
export const RHYTHM_GATE = Object.freeze({
  width: 72, height: 238, firstAfter: 10,
  leadSeconds: 2.35, cueSeconds: 2, targetBeforeArrival: 0.7,
  earlyFailureSeconds: 0.5,
  windowSecondsByMultiplier: Object.freeze([0.75, 0.5, 0.4, 0.3, 0.2]),
});
export interface RhythmGate {
  id: number; x: number; width: number; height: number;
  arrivalAt: number; opened: boolean; openedAt?: number;
  readonly windowSeconds: number;
  pendingFailure?: 'late' | 'missed';
}
/** Sample once when spawning a door, including the smooth speed ramps. */
export function gateWindowForMultiplier(multiplier: number): number {
  const speed = Number.isFinite(multiplier) ? Math.min(MAX_SPEED_MULTIPLIER, Math.max(1, multiplier)) : 1;
  const windows = RHYTHM_GATE.windowSecondsByMultiplier;
  const index = Math.floor(speed) - 1, fraction = speed - (index + 1);
  const from = windows[index], to = windows[Math.min(index + 1, windows.length - 1)];
  return from + (to - from) * fraction;
}
export type GateJudgement = 'safe' | 'early' | 'open' | 'late';
export function gateTarget(gate: RhythmGate): number { return gate.arrivalAt - RHYTHM_GATE.targetBeforeArrival; }
export function gateJudgement(gate: RhythmGate, seconds: number): GateJudgement {
  const offset = seconds - gateTarget(gate), half = gate.windowSeconds / 2;
  if (offset < -half - RHYTHM_GATE.earlyFailureSeconds - 1e-9) return 'safe';
  return offset < -half - 1e-9 ? 'early' : offset > half + 1e-9 ? 'late' : 'open';
}
/** The cue uses the same per-door interval as the simulation, as track fractions. */
export function gateCueWindow(gate: RhythmGate) {
  const left = 1 - (RHYTHM_GATE.targetBeforeArrival + gate.windowSeconds / 2) / RHYTHM_GATE.cueSeconds;
  const width = gate.windowSeconds / RHYTHM_GATE.cueSeconds;
  const earlyLeft = Math.max(0, left - RHYTHM_GATE.earlyFailureSeconds / RHYTHM_GATE.cueSeconds);
  const lateLeft = left + width;
  return { left, width, earlyLeft, earlyWidth: left - earlyLeft, lateLeft, lateWidth: 1 - lateLeft };
}
export function gateProgress(gate: RhythmGate, seconds: number): number {
  return Math.min(1, Math.max(0, (seconds - (gate.arrivalAt - RHYTHM_GATE.cueSeconds)) / RHYTHM_GATE.cueSeconds));
}
