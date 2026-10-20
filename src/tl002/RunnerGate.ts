import { MAX_SPEED_MULTIPLIER } from './RunnerScore.ts';

/** Seconds in simulation time: pausing/countdown never consumes the timing window. */
export const RHYTHM_GATE = Object.freeze({
  width: 72, height: 238, firstAfter: 10,
  leadSeconds: 2.35, targetBeforeArrival: 0.7, delayFraction: 0.25,
  earlyFailureSeconds: 0.5,
  cueRevealDelaySeconds: 0.075,
  windowSecondsByMultiplier: Object.freeze([0.75, 0.5, 0.4, 0.3, 0.2]),
  cueLeadSecondsByMultiplier: Object.freeze([1, 0.9, 0.8, 0.7, 0.6]),
});
export interface RhythmGate {
  id: number; x: number; width: number; height: number;
  arrivalAt: number; opened: boolean; openedAt?: number;
  readonly windowSeconds: number; readonly cueLeadSeconds: number;
  pendingOpen?: boolean;
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
export function gateCueLeadForMultiplier(multiplier: number): number {
  const speed = Number.isFinite(multiplier) ? Math.min(MAX_SPEED_MULTIPLIER, Math.max(1, multiplier)) : 1;
  const leads = RHYTHM_GATE.cueLeadSecondsByMultiplier;
  const index = Math.floor(speed) - 1, fraction = speed - (index + 1);
  const from = leads[index], to = leads[Math.min(index + 1, leads.length - 1)];
  return from + (to - from) * fraction;
}
export type GateJudgement = 'safe' | 'early' | 'open' | 'late';
export function gateTarget(gate: RhythmGate): number {
  return gate.arrivalAt - RHYTHM_GATE.targetBeforeArrival + gate.windowSeconds * RHYTHM_GATE.delayFraction;
}
export function gateJudgement(gate: RhythmGate, seconds: number): GateJudgement {
  const offset = seconds - gateTarget(gate), half = gate.windowSeconds / 2;
  if (offset < -half - RHYTHM_GATE.earlyFailureSeconds - 1e-9) return 'safe';
  return offset < -half - 1e-9 ? 'early' : offset > half + 1e-9 ? 'late' : 'open';
}
export function gateCueStart(gate: RhythmGate): number {
  return gateTarget(gate) - gate.windowSeconds / 2 - gate.cueLeadSeconds;
}
/** The timing sweep begins just before the complete visual cue is revealed. */
export function gateCueVisibleAt(gate: RhythmGate): number {
  return gateCueStart(gate) + RHYTHM_GATE.cueRevealDelaySeconds;
}
/** The cue and its colored windows use the same per-door timeline as the simulation. */
export function gateCueWindow(gate: RhythmGate) {
  const cueStart = gateCueStart(gate), duration = gate.arrivalAt - cueStart;
  const left = (gateTarget(gate) - gate.windowSeconds / 2 - cueStart) / duration;
  const width = gate.windowSeconds / duration;
  const earlyLeft = Math.max(0, left - RHYTHM_GATE.earlyFailureSeconds / duration);
  const lateLeft = left + width;
  return { left, width, earlyLeft, earlyWidth: left - earlyLeft, lateLeft, lateWidth: 1 - lateLeft, duration };
}
export function gateProgress(gate: RhythmGate, seconds: number): number {
  const cueStart = gateCueStart(gate);
  return Math.min(1, Math.max(0, (seconds - cueStart) / (gate.arrivalAt - cueStart)));
}
