export interface Vec { x: number; y: number }

export interface Launch {
  /** Launch velocity in px per physics step. */
  vx: number;
  vy: number;
  /** 0–1 share of the maximum pull. */
  power: number;
  /** Clamped pull vector from the sling rest point to the held serpentela. */
  pull: Vec;
}

/** The serpentela flies opposite to the pull, with speed proportional to pull length. */
export function launchFromPull(dx: number, dy: number, maxDrag: number, maxSpeed: number): Launch {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { vx: 0, vy: 0, power: 0, pull: { x: 0, y: 0 } };
  const clamped = Math.min(length, maxDrag);
  const ux = dx / length, uy = dy / length;
  const power = clamped / maxDrag;
  return { vx: -ux * power * maxSpeed, vy: -uy * power * maxSpeed, power, pull: { x: ux * clamped, y: uy * clamped } };
}

/**
 * Mirrors Matter's Verlet step for a free body: velocity = previous × air factor + gravity, then move.
 * Returns one point per step until the path drops below groundY or maxSteps.
 */
export function predictPath(start: Vec, vx: number, vy: number, gravityPerStep: number, frictionAir: number, groundY: number, maxSteps = 600): Vec[] {
  const air = 1 - frictionAir;
  const points: Vec[] = [];
  let x = start.x, y = start.y, velocityX = vx, velocityY = vy;
  for (let i = 0; i < maxSteps; i++) {
    velocityX *= air;
    velocityY = velocityY * air + gravityPerStep;
    x += velocityX;
    y += velocityY;
    points.push({ x, y });
    if (y > groundY) break;
  }
  return points;
}

/** Preview dots: the first fraction of the full flight, sampled every few steps. */
export function previewDots(path: readonly Vec[], fraction: number, every: number): Vec[] {
  const count = Math.max(1, Math.floor(path.length * fraction));
  const dots: Vec[] = [];
  for (let i = every - 1; i < count; i += every) dots.push(path[i]);
  return dots;
}
