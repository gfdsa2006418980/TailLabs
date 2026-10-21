export type DeformationKind = 'jump' | 'doubleJump' | 'land';

const DEFORMATION_KEYS: Record<DeformationKind, readonly [number, number, number][]> = {
  jump: [[0, 1.20, 0.80], [0.055, 0.84, 1.22], [0.13, 1.05, 0.97], [0.24, 1, 1]],
  doubleJump: [[0, 1.28, 0.72], [0.045, 0.78, 1.24], [0.12, 1.07, 0.95], [0.24, 1, 1]],
  land: [[0, 1.25, 0.76], [0.07, 0.86, 1.18], [0.17, 1.04, 0.98], [0.3, 1, 1]],
};

/** Returns the runner's horizontal and vertical scale during a short squash/stretch pulse. */
export function deformationAt(kind: DeformationKind, age: number): [number, number] {
  const keys = DEFORMATION_KEYS[kind];
  if (age >= keys[keys.length - 1][0]) return [1, 1];
  for (let i = 1; i < keys.length; i++) {
    const [end, endX, endY] = keys[i], [start, startX, startY] = keys[i - 1];
    if (age > end) continue;
    const t = Math.max(0, Math.min(1, (age - start) / (end - start)));
    const eased = t * t * (3 - 2 * t);
    return [startX + (endX - startX) * eased, startY + (endY - startY) * eased];
  }
  return [1, 1];
}

export interface RunningMotion {
  frameTravel: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  shadowScale: number;
  shadowAlpha: number;
}

export const SCENERY_PARALLAX = Object.freeze({ houses: 0.10, bushes: 0.32, fence: 1, road: 1 });
export type SceneryLayer = keyof typeof SCENERY_PARALLAX;

/** Converts traveled distance into a layer's horizontal parallax offset. */
export function sceneryOffset(travel: number, layer: SceneryLayer): number {
  return Math.max(0, Number.isFinite(travel) ? travel : 0) * SCENERY_PARALLAX[layer];
}

/** Compresses the visible foreground toward the runner as speed rises. */
export function worldVisualScale(speedMultiplier: number): number {
  const speedLevel = Math.max(1, Math.min(5, Number.isFinite(speedMultiplier) ? speedMultiplier : 1));
  return 1 - (speedLevel - 1) * 0.125;
}

export function worldViewportRight(screenWidth: number, scale: number, anchorX: number): number {
  return anchorX + (screenWidth - anchorX) / scale;
}

export function worldViewportLeft(screenLeft: number, scale: number, anchorX: number): number {
  return anchorX + (screenLeft - anchorX) / scale;
}

export function worldCoordinateAtScale(value: number, anchor: number, scale: number): number {
  return anchor + (value - anchor) * scale;
}

/** Maps a screen-space target back into the scaled world around its camera anchor. */
export function worldCoordinateForScreenAtScale(value: number, anchor: number, scale: number): number {
  return anchor + (value - anchor) / scale;
}

/** A speed-linked four-foot bounding gait for the runner while its feet are grounded. */
export function runningMotion(elapsed: number, speedMultiplier: number): RunningMotion {
  const speedLevel = Math.max(1, Math.min(5, speedMultiplier));
  const cyclesPerSecond = 2.4 + (speedLevel - 1) * 0.35;
  const phase = ((Math.max(0, elapsed) * cyclesPerSecond) % 1) * Math.PI * 2;
  const flight = (1 - Math.cos(phase)) * 0.5;
  return {
    frameTravel: phase / (Math.PI * 2) * 136,
    offsetX: Math.sin(phase) * 1.5,
    offsetY: -flight * 5,
    scaleX: 0.97 + flight * 0.08,
    scaleY: 1.04 - flight * 0.08,
    shadowScale: 1 - flight * 0.22,
    shadowAlpha: 1 - flight * 0.2,
  };
}
