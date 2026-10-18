/** Existing artwork stays byte-identical; alignment happens once in a cached atlas. */
export const RUNNER_ART = Object.freeze([
  { frame: 'run-a', file: 'serpentela-w50-04.webp', bounds: [4, 8, 92, 90], flip: false },
  { frame: 'run-b', file: 'serpentela-w20-01.webp', bounds: [9, 10, 88, 87], flip: false },
  { frame: 'run-c', file: 'serpentela-w5-02.webp', bounds: [5, 0, 95, 93], flip: false },
  { frame: 'jump-up', file: 'serpentela-w20-04.webp', bounds: [3, 3, 92, 95], flip: true },
  { frame: 'jump-down', file: 'serpentela-w5-03.webp', bounds: [6, 2, 93, 96], flip: true },
]);
export const RUN_FRAMES = ['run-a', 'run-b', 'run-c', 'run-b'] as const;
export const ATLAS_KEY = 'tl002-runner-atlas';
export function runnerFrame(travel: number, grounded: boolean, velocity: number, reducedMotion = false): string {
  if (!grounded) return velocity < 0 ? 'jump-up' : 'jump-down';
  return RUN_FRAMES[reducedMotion ? 0 : Math.floor(travel / 34) % RUN_FRAMES.length];
}
