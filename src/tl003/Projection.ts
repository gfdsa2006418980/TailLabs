import { FIELD } from './Run.ts';

export interface Viewport { width: number; height: number }
/** Model X is distance from the spawn line. Model Y is position across the front. */
export function project(front: number, lateral: number, view: Viewport) {
  const depth = Math.max(0, (front + 20) / (FIELD.wallX + 20));
  const spread = view.width * (0.065 + depth * 0.375);
  return { x: view.width / 2 + (lateral - 225) / 165 * spread,
    y: view.height * (0.1 + 0.63 * depth ** 1.35), scale: 0.35 + depth * 1.05 };
}
export function unproject(screenX: number, screenY: number, view: Viewport) {
  const depth = Math.max(0, (screenY / view.height - 0.1) / 0.63) ** (1 / 1.35);
  const spread = view.width * (0.065 + depth * 0.375);
  const x = depth * (FIELD.wallX + 20) - 20;
  const y = 225 + (screenX - view.width / 2) / spread * 165;
  return { x, y, valid: x >= 0 && x <= FIELD.wallX && y >= 65 && y <= 390 && screenX >= 0 && screenX <= view.width && screenY >= 0 && screenY <= view.height };
}
export function projectedCircle(x: number, y: number, radius: number, view: Viewport) {
  return Array.from({ length: 49 }, (_, i) => {
    const a = i / 48 * Math.PI * 2;
    return project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, view);
  });
}
