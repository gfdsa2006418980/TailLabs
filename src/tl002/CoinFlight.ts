export interface Point { x: number; y: number }
interface ScreenRect { left: number; top: number; width: number; height: number }

/** Maps rendered canvas pixels into the DOM effect layer, including letterboxing.
 * Keep the two axes separate: a nonuniform canvas must never move a coin's origin. */
export class CoinFlightSpace {
  private x = 0;
  private y = 0;
  private scaleX = 1;
  private scaleY = 1;
  get size(): number { return Math.min(this.scaleX, this.scaleY); }

  measure(canvas: ScreenRect, layer: Pick<ScreenRect, 'left' | 'top'>, worldWidth: number, worldHeight: number): void {
    this.x = canvas.left - layer.left;
    this.y = canvas.top - layer.top;
    this.scaleX = canvas.width / worldWidth;
    this.scaleY = canvas.height / worldHeight;
  }

  project(x: number, y: number, out: Point): void {
    out.x = this.x + x * this.scaleX;
    out.y = this.y + y * this.scaleY;
  }

  remap(point: Point, next: CoinFlightSpace): void {
    next.project((point.x - this.x) / this.scaleX, (point.y - this.y) / this.scaleY, point);
  }
}

export type CoinStage = 'absorb' | 'bounce' | 'hover' | 'fly' | 'arrived';
export interface CoinPose { x: number; y: number; scale: number; rotation: number; stage: CoinStage }
export const COIN_FLIGHT_SECONDS = 1.05;
export const COIN_FX_CAPACITY = 32;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** All five stages share one allocation-free path sampler. Units are CSS pixels. */
export function coinFlightAt(seconds: number, start: Point, body: Point, target: Point, size = 1,
  out: CoinPose = { x: 0, y: 0, scale: 1, rotation: 0, stage: 'absorb' }): CoinPose {
  const time = Math.max(0, seconds);
  if (time < 0.14) {
    const t = (time / 0.14) ** 2;
    out.x = lerp(start.x, body.x, t); out.y = lerp(start.y, body.y, t);
    out.scale = size; out.rotation = 0; out.stage = 'absorb';
  } else if (time < 0.36) {
    const t = 1 - (1 - (time - 0.14) / 0.22) ** 3;
    out.x = body.x; out.y = body.y - 46 * size * t;
    out.scale = size * (1 + 0.18 * t); out.rotation = 240 * t; out.stage = 'bounce';
  } else if (time < 0.5) {
    const t = (time - 0.36) / 0.14;
    out.x = body.x; out.y = body.y - 46 * size - Math.sin(t * Math.PI) * 2 * size;
    out.scale = size * 1.18; out.rotation = 240; out.stage = 'hover';
  } else if (time < COIN_FLIGHT_SECONDS) {
    const t = smooth((time - 0.5) / 0.55), u = 1 - t;
    const y = body.y - 46 * size;
    out.x = u ** 3 * body.x + 3 * u * u * t * (body.x + 55 * size)
      + 3 * u * t * t * (target.x - 38 * size) + t ** 3 * target.x;
    out.y = u ** 3 * y + 3 * u * u * t * (y - 90 * size)
      + 3 * u * t * t * (target.y + 38 * size) + t ** 3 * target.y;
    out.scale = lerp(size * 1.18, 0.68, t); out.rotation = 240 + 300 * t; out.stage = 'fly';
  } else {
    out.x = target.x; out.y = target.y; out.scale = 0.68; out.rotation = 540; out.stage = 'arrived';
  }
  return out;
}

export interface CoinFlightSlot {
  active: boolean; time: number; value: number; size: number;
  start: Point; body: Point; pose: CoinPose;
}
export class CoinFlightPool {
  readonly slots: CoinFlightSlot[];
  settled = 0;
  skippedAnimations = 0;
  peak = 0;
  constructor(capacity = COIN_FX_CAPACITY) {
    this.slots = Array.from({ length: capacity }, () => ({
      active: false, time: 0, value: 1, size: 1,
      start: { x: 0, y: 0 }, body: { x: 0, y: 0 },
      pose: { x: 0, y: 0, scale: 1, rotation: 0, stage: 'absorb' },
    }));
  }
  get activeCount(): number { let count = 0; for (const slot of this.slots) if (slot.active) count++; return count; }
  spawn(start: Point, body: Point, size: number, value = 1): boolean {
    const slot = this.slots.find((item) => !item.active);
    if (!slot) { this.settled += value; this.skippedAnimations++; return false; }
    slot.active = true; slot.time = 0; slot.value = value; slot.size = size;
    slot.start.x = start.x; slot.start.y = start.y; slot.body.x = body.x; slot.body.y = body.y;
    this.peak = Math.max(this.peak, this.activeCount);
    return true;
  }
  advance(seconds: number, body: Point, target: Point, contacted?: () => void): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      if (slot.time < 0.14) { slot.body.x = body.x; slot.body.y = body.y; }
      const previousTime = slot.time;
      slot.time += Math.max(0, seconds);
      if (previousTime < 0.14 && slot.time >= 0.14) contacted?.();
      coinFlightAt(slot.time, slot.start, slot.body, target, slot.size, slot.pose);
      if (slot.pose.stage === 'arrived') { slot.active = false; this.settled += slot.value; }
    }
  }
  reset(): void {
    for (const slot of this.slots) slot.active = false;
    this.settled = 0; this.skippedAnimations = 0; this.peak = 0;
  }
}
