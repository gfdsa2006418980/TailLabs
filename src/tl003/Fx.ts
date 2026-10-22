/**
 * Battlefield feedback drawn on the unlit overlay: floating damage numbers (merged per target,
 * capped) and coins that burst from a kill and fly into the money counter.
 * Times are real seconds; positions are battlefield buffer pixels.
 */
import { formatNumber } from './Combat.ts';

// 3×5 pixel glyphs. Rows are bit masks, high bit = left.
const GLYPHS: Record<string, number[]> = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 3, 1, 7], '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 2, 2], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  '.': [0, 0, 0, 0, 2], 'x': [0, 5, 2, 5, 0], '+': [0, 2, 7, 2, 0], 'k': [4, 5, 6, 5, 5], 'm': [0, 7, 7, 5, 5], 'b': [4, 4, 7, 5, 7],
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
};

/** Draws pixel text centred at x with its top at y; `size` is the pixel scale, outlined in dark ink. */
export function pixelText(c: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, size = 1, outline = '#0b0d0e') {
  const advance = 4 * size, width = value.length * advance - size;
  const left = Math.round(x - width / 2), top = Math.round(y);
  const paint = (dx: number, dy: number, fill: string) => {
    c.fillStyle = fill; let cx = left + dx;
    for (const ch of value) {
      const rows = GLYPHS[ch];
      if (rows) rows.forEach((bits, ry) => { for (let b = 0; b < 3; b++) if (bits & (4 >> b)) c.fillRect(cx + b * size, top + dy + ry * size, size, size); });
      cx += advance;
    }
  };
  if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] as const) paint(dx, dy, outline);
  paint(0, 0, color);
}

interface Popup { x: number; y: number; amount: number; age: number; target: number; big: boolean; color: string }
interface Coin { x: number; y: number; vx: number; vy: number; age: number; delay: number; sx: number; sy: number; flying: boolean; value: number }

const POPUP_LIFE = 0.7, MERGE_WINDOW = 0.12, MAX_POPUPS = 14, MAX_COINS = 48;
const BURST = 0.12, FLIGHT = 0.5;
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const easeInCubic = (t: number) => t * t * t;

export class Feedback {
  private popups: Popup[] = [];
  private coins: Coin[] = [];
  /** Money HUD position in buffer pixels; coins fly here. */
  coinTarget = { x: 200, y: 10 };
  /** Called once per coin that lands, with its share of the reward. */
  onCoin?: (value: number) => void;
  reducedMotion = false;

  clear() { this.popups = []; this.coins = []; }

  damage(x: number, y: number, amount: number, target: number, big: boolean) {
    const recent = this.popups.find(p => p.target === target && p.age < MERGE_WINDOW && p.big === big);
    if (recent) { recent.amount += amount; recent.age = Math.min(recent.age, 0.04); return; }
    if (this.popups.length >= MAX_POPUPS) {
      // Drop the oldest small number first; big skill hits always get a slot.
      const index = this.popups.findIndex(p => !p.big); if (index < 0 && !big) return;
      this.popups.splice(index < 0 ? 0 : index, 1);
    }
    this.popups.push({ x: x + (Math.random() - 0.5) * 6, y, amount, age: 0, target, big, color: big ? '#ffd884' : '#eadfbd' });
  }

  /** Bursts a few coins from a kill; the reward is split across them. */
  kill(x: number, y: number, reward: number) {
    const count = Math.max(1, Math.min(5, Math.round(Math.log2(1 + reward)))), room = MAX_COINS - this.coins.length;
    const n = Math.min(count, Math.max(1, room));
    if (room <= 0) { this.onCoin?.(reward); return; }
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, speed = 40 + Math.random() * 40;
      this.coins.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, delay: i * 0.035, sx: 0, sy: 0, flying: false, value: reward / n });
    }
  }

  update(dt: number) {
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter(p => p.age < POPUP_LIFE);
    for (const c of this.coins) {
      c.age += dt;
      if (!c.flying) {
        c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.9; c.vy = c.vy * 0.9 + 60 * dt;
        if (c.age >= BURST + c.delay) { c.flying = true; c.sx = c.x; c.sy = c.y; c.age = 0; }
      }
    }
    const landed = this.coins.filter(c => c.flying && c.age >= FLIGHT);
    for (const c of landed) this.onCoin?.(c.value);
    this.coins = this.coins.filter(c => !(c.flying && c.age >= FLIGHT));
  }

  draw(c: CanvasRenderingContext2D) {
    for (const p of this.popups) {
      const t = p.age / POPUP_LIFE, pop = this.reducedMotion ? 1 : p.age < 0.12 ? easeOutBack(p.age / 0.12) : 1;
      if (t > 0.7 && Math.floor(p.age * 30) % 2) continue;            // pixel-style fade: blink out
      const size = p.big ? 2 : 1, rise = (this.reducedMotion ? 6 : 14) * (1 - (1 - t) ** 2);
      const scale = Math.max(1, Math.round(size * (p.big ? pop : 1)));
      pixelText(c, formatNumber(Math.round(p.amount)), p.x, p.y - 14 - rise - (scale - 1) * 2, p.color, scale);
    }
    for (const coin of this.coins) {
      let x = coin.x, y = coin.y;
      if (coin.flying) {
        // Quadratic arc that swings out sideways before snapping into the counter.
        const t = easeInCubic(Math.min(1, coin.age / FLIGHT)), mx = (coin.sx + this.coinTarget.x) / 2 + (coin.sx < this.coinTarget.x ? -30 : 30), my = Math.min(coin.sy, this.coinTarget.y) + 20;
        x = (1 - t) ** 2 * coin.sx + 2 * (1 - t) * t * mx + t * t * this.coinTarget.x;
        y = (1 - t) ** 2 * coin.sy + 2 * (1 - t) * t * my + t * t * this.coinTarget.y;
      }
      const spin = Math.floor((coin.age + coin.delay) * 12) % 4, w = spin === 1 || spin === 3 ? 1 : spin === 2 ? 0 : 2;
      const rx = Math.round(x), ry = Math.round(y);
      c.fillStyle = '#0b0d0e'; c.fillRect(rx - w - 1, ry - 2, w * 2 + 3, 5);
      c.fillStyle = '#c8613a'; c.fillRect(rx - w, ry - 1, w * 2 + 1, 3);
      c.fillStyle = '#ffd884'; c.fillRect(rx - w, ry - 1, Math.max(1, w * 2), 2);
    }
  }
  /** Money still flying towards the counter (already earned in the run). */
  get pending() { return this.coins.reduce((sum, c) => sum + c.value, 0); }
}
