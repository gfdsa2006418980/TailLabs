import { MERCENARIES } from './Content.ts';
import type { MercKind } from './Content.ts';
import { FIELD, mercPosition } from './Run.ts';
import type { DefenseRun, VisualEvent } from './Run.ts';
import { project, projectedCircle, unproject } from './Projection.ts';
import type { Viewport } from './Projection.ts';
import { burnSpeed } from './Burn.ts';
import { ANIMS, FRAMES } from './generated/sprites.ts';
import sheetUrl from './generated/tl003.png';

export interface Aim { slot: number; x: number; y: number; valid: boolean }

/** The field is drawn into a 240 px wide buffer and scaled up without smoothing: every mark lands on the pixel grid. */
const BUFFER_WIDTH = 240;
const PX = BUFFER_WIDTH / 480;           // buffer pixels per logical field unit
const WALL_SCALE = project(FIELD.wallX, 225, { width: 480, height: 600 }).scale;
/** Keyed by enemy kind; any kind without art falls back to the walker so new enemies never break drawing. */
const ENEMY_ART: Record<string, { anim: string; scale: number }> = {
  walker: { anim: 'zombie_walker', scale: 1 }, runner: { anim: 'zombie_runner', scale: 0.9 },
  armored: { anim: 'zombie_armored', scale: 1.05 }, brute: { anim: 'zombie_brute', scale: 1.15 }, elite: { anim: 'zombie_elite', scale: 1.3 },
  boss: { anim: 'zombie_boss', scale: 1.5 },
};
/** Muzzle pixel inside each mercenary sprite (sprite-local coordinates). */
const MUZZLE: Record<MercKind, [number, number]> = { rifle: [21, 1], flame: [20, 1], tesla: [21, 2] };
/** The right-hand slot is mirrored so every weapon points in towards the road. */
const FLIPPED_SLOT = 2;
const COLOR = {
  outline: '#121619', skyTop: '#a8a785', sky: '#93a27a', skyLow: '#7d8c68', haze: '#6d8160',
  field: '#2b3a31', fieldDark: '#1d2722', fieldLight: '#3b4d3f', road: '#4e4c3d', roadDark: '#3f3a2c', roadLight: '#5f5640',
  lane: '#bfae84', dirt: '#3f3a2c', sun: '#eadfbd', hp: '#d7d69c', hpBack: '#1d2722',
} as const;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number, density: number) => BAYER[(y & 3) * 4 + (x & 3)]! < density * 16;
/** Deterministic 0..1 noise per integer pair, so the background never shimmers between repaints. */
const hash = (x: number, y: number) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 3×5 digits for the burn multiplier. Rows are bit masks, high bit = left.
const GLYPHS: Record<string, number[]> = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 3, 1, 7], '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 1, 2, 2], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  '.': [0, 0, 0, 0, 2], 'x': [0, 5, 2, 5, 0],
};

export class Battlefield {
  private context: CanvasRenderingContext2D;
  private buffer = document.createElement('canvas');
  private pixels: CanvasRenderingContext2D;
  private background = document.createElement('canvas');
  private sheet = new Image();
  private flashSheet = document.createElement('canvas');
  private ready = false;
  private view: Viewport = { width: 480, height: 600 };
  private lastWall = -1; private wallShake = 0; private lastTime = 0;
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D unavailable');
    this.context = context; this.pixels = this.buffer.getContext('2d')!;
    canvas.style.imageRendering = 'pixelated';
    this.sheet.onload = () => {
      // A white copy of the sheet for the one-frame hit flash.
      this.flashSheet.width = this.sheet.width; this.flashSheet.height = this.sheet.height;
      const f = this.flashSheet.getContext('2d')!; f.drawImage(this.sheet, 0, 0);
      f.globalCompositeOperation = 'source-in'; f.fillStyle = '#fff3ce'; f.fillRect(0, 0, this.sheet.width, this.sheet.height);
      this.ready = true; this.view = { width: 480, height: 0 };
    };
    this.sheet.src = sheetUrl;
  }
  point(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const view = { width: 480, height: rect.height / rect.width * 480 };
    return unproject((clientX - rect.left) / rect.width * view.width, (clientY - rect.top) / rect.height * view.height, view);
  }

  // ---------- pixel helpers (buffer coordinates) ----------
  private dot(x: number, y: number, color: string) { this.pixels.fillStyle = color; this.pixels.fillRect(Math.round(x), Math.round(y), 1, 1); }
  private line(x0: number, y0: number, x1: number, y1: number, color: string, dash = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, i = 0; this.pixels.fillStyle = color;
    for (;;) {
      if (!dash || Math.floor(i / dash) % 2 === 0) this.pixels.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } i++;
    }
  }
  private text(value: string, x: number, y: number, color: string) {
    let cx = Math.round(x - (value.length * 4 - 1) / 2); this.pixels.fillStyle = color;
    for (const ch of value) {
      const rows = GLYPHS[ch];
      if (rows) rows.forEach((bits, ry) => { for (let b = 0; b < 3; b++) if (bits & (4 >> b)) this.pixels.fillRect(cx + b, Math.round(y) + ry, 1, 1); });
      cx += 4;
    }
  }
  /** Draws a sheet frame with its bottom-centre at (x, y), scaled and snapped to whole pixels. */
  private sprite(name: string, x: number, y: number, scale = 1, flash = false, ctx = this.pixels, flip = false) {
    const f = FRAMES[name]; if (!f || !this.ready) return { left: 0, top: 0, w: 0, h: 0 };
    const w = Math.max(1, Math.round(f[2] * scale)), h = Math.max(1, Math.round(f[3] * scale));
    const left = Math.round(x - w / 2), top = Math.round(y - h), image = flash ? this.flashSheet : this.sheet;
    if (flip) { ctx.save(); ctx.translate(left + w, top); ctx.scale(-1, 1); ctx.drawImage(image, f[0], f[1], f[2], f[3], 0, 0, w, h); ctx.restore(); }
    else ctx.drawImage(image, f[0], f[1], f[2], f[3], left, top, w, h);
    return { left, top, w, h };
  }
  private animFrame(name: string, seconds: number, loop = true) {
    const anim = ANIMS[name]!; const total = anim.ms.reduce((a, b) => a + b, 0);
    let t = seconds * 1000; t = loop ? ((t % total) + total) % total : Math.min(t, total - 1);
    for (let i = 0; i < anim.frames.length; i++) { t -= anim.ms[i]!; if (t < 0) return anim.frames[i]!; }
    return anim.frames[anim.frames.length - 1]!;
  }
  private at(front: number, lateral: number) { const p = project(front, lateral, this.view); return { x: p.x * PX, y: p.y * PX, scale: p.scale }; }

  // ---------- static background ----------
  private paintBackground() {
    const w = BUFFER_WIDTH, h = this.buffer.height;
    this.background.width = w; this.background.height = h;
    const c = this.background.getContext('2d')!, saved = this.pixels; this.pixels = c;
    const horizon = Math.round(this.at(0, 225).y);
    // Sky in dithered bands.
    for (let y = 0; y < horizon + 2; y++) for (let x = 0; x < w; x++) {
      const t = y / Math.max(1, horizon);
      const color = t < 0.35 ? (dither(x, y, t / 0.35) ? COLOR.sky : COLOR.skyTop) : t < 0.8 ? (dither(x, y, (t - 0.35) / 0.45) ? COLOR.skyLow : COLOR.sky) : COLOR.skyLow;
      c.fillStyle = color; c.fillRect(x, y, 1, 1);
    }
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy <= 36) this.dot(156 + dx, Math.max(4, horizon - 14) + dy, dx * dx + dy * dy > 25 ? COLOR.skyTop : COLOR.sun);
    this.sprite('skyline', w / 2, horizon + 3, 1, false, c);
    // Ground and the perspective road, one scanline at a time.
    for (let y = horizon; y < h; y++) {
      const ly = (y + 0.5) / PX, front = unproject(240, ly, this.view).x;
      const left = this.at(front, 65).x, right = this.at(front, 390).x, edgeL = this.at(front, 50).x, edgeR = this.at(front, 405).x;
      for (let x = 0; x < w; x++) {
        // Flat materials with sparse, hashed texture: no screen-door dithering on large areas.
        const n = hash(x, y);
        let color: string;
        if (x >= left && x <= right) color = n < 0.05 ? COLOR.roadDark : n > 0.975 ? COLOR.roadLight : COLOR.road;
        else if (x >= edgeL && x <= edgeR) color = n < 0.3 ? COLOR.roadDark : COLOR.dirt;
        else color = n < 0.06 ? COLOR.fieldLight : n > 0.93 ? COLOR.fieldDark : COLOR.field;
        c.fillStyle = color; c.fillRect(x, y, 1, 1);
      }
    }
    // Grass tufts on the verges and cracks across the asphalt.
    for (let i = 0; i < 140; i++) {
      const front = hash(i, 1) * (FIELD.wallX + 60), lateral = hash(i, 2) < 0.5 ? hash(i, 3) * 40 + 5 : 410 + hash(i, 3) * 45;
      const p = this.at(front, lateral); this.dot(p.x, p.y, COLOR.fieldLight); this.dot(p.x - 1, p.y + 1, COLOR.fieldLight); this.dot(p.x + 1, p.y + 1, COLOR.fieldLight);
    }
    for (let i = 0; i < 9; i++) {
      let front = 80 + hash(i, 7) * (FIELD.wallX - 120), lateral = 90 + hash(i, 8) * 270;
      for (let s = 0; s < 14; s++) {
        const p = this.at(front, lateral); this.dot(p.x, p.y, COLOR.roadDark);
        front += (hash(i, s + 20) - 0.3) * 10; lateral += (hash(i, s + 40) - 0.5) * 14;
      }
    }
    // Lane dashes and edge lines follow the projection.
    for (let front = 0; front < FIELD.wallX + 80; front += 2) {
      const a = this.at(front, 225); if (Math.floor(front / 40) % 2 === 0) { this.dot(a.x, a.y, COLOR.lane); if (a.scale > 1) this.dot(a.x + 1, a.y, COLOR.lane); }
      for (const lateral of [70, 385]) { const e = this.at(front, lateral); if (Math.floor(front / 12) % 3 !== 0) this.dot(e.x, e.y, COLOR.roadLight); }
    }
    // Props, far to near so nearer ones overlap.
    const props: [string, number, number][] = [
      ['crater', 220, 300], ['lamp_post', 90, 30], ['lamp_post', 300, 420], ['car_wreck', 365, 96], ['tire', 300, 150],
      ['barrel', 470, 412], ['barrel_tipped', 520, 40], ['crater', 560, 170], ['debris_a', 140, 260], ['debris_b', 250, 340],
      ['debris_c', 420, 230], ['debris_a', 610, 300], ['debris_b', 660, 120], ['debris_c', 520, 360], ['tire', 640, 395],
    ];
    for (const [name, front, lateral] of props.sort((a, b) => a[1] - b[1])) {
      const p = this.at(front, lateral); this.sprite(name, p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE), false, c);
    }
    for (const lateral of [38, 412]) for (let front = 40; front <= FIELD.wallX; front += 70) {
      const p = this.at(front, lateral); this.sprite('fence_post', p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE), false, c);
    }
    // Behind the barricade: packed dirt and sandbag nests under each mercenary slot.
    for (let slot = 0; slot < 3; slot++) { const m = mercPosition(slot), p = this.at(m.x + 12, m.y); this.sprite('sandbags', p.x - 13, p.y + 3, 1, false, c); this.sprite('sandbags', p.x + 13, p.y + 3, 1, false, c); }
    // Haze over the far field.
    for (let y = horizon; y < horizon + 14; y++) for (let x = 0; x < w; x++) if (dither(x, y, 0.5 * (1 - (y - horizon) / 14))) { c.fillStyle = COLOR.haze; c.fillRect(x, y, 1, 1); }
    this.pixels = saved;
  }

  // ---------- frame ----------
  draw(run: DefenseRun, aim: Aim | undefined) {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (w <= 0 || h <= 0) return;
    const bufferHeight = Math.max(1, Math.round(BUFFER_WIDTH * rect.height / rect.width));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.buffer.height !== bufferHeight || this.view.height !== bufferHeight / PX) {
      this.buffer.width = BUFFER_WIDTH; this.buffer.height = bufferHeight; this.view = { width: 480, height: bufferHeight / PX }; this.paintBackground();
    }
    const c = this.pixels, t = run.elapsed, dt = Math.max(0, t - this.lastTime); this.lastTime = t;
    c.imageSmoothingEnabled = false; c.drawImage(this.background, 0, 0);

    // Barricade shakes briefly whenever it loses health (aftershock: fast, decaying).
    if (this.lastWall >= 0 && run.wallHealth < this.lastWall - 1e-6) this.wallShake = 0.18;
    this.lastWall = run.wallHealth; this.wallShake = Math.max(0, this.wallShake - dt);

    for (const zone of run.zones) this.fireZone(zone.x, zone.y, zone.radius, t);
    for (const enemy of [...run.enemies].sort((a, b) => a.x - b.x)) {
      const art = ENEMY_ART[enemy.kind] ?? ENEMY_ART.walker!, p = this.at(enemy.x, enemy.y), s = p.scale / WALL_SCALE * art.scale;
      const shadowW = Math.max(2, Math.round(12 * s));
      c.fillStyle = '#12161970'; c.fillRect(Math.round(p.x - shadowW / 2), Math.round(p.y) - 1, shadowW, Math.max(1, Math.round(2 * s)));
      const box = this.sprite(this.animFrame(art.anim, t + enemy.id * 0.137), p.x, p.y + 1, s, enemy.hitFlash > 0);
      if (enemy.hp < enemy.maxHp && box.w) {
        const bw = Math.max(6, box.w - 2), bx = Math.round(p.x - bw / 2), by = box.top - 3;
        c.fillStyle = COLOR.hpBack; c.fillRect(bx, by, bw, 2); c.fillStyle = COLOR.hp; c.fillRect(bx, by, Math.max(1, Math.round(bw * Math.max(0, enemy.hp / enemy.maxHp))), 1);
        let sx = bx;
        for (const [active, color] of [[enemy.burnDuration > 0, '#ee9d4f'], [enemy.corrosionPower > 0, '#a3b47a'], [enemy.shockPower > 0, '#bff1ea']] as const)
          if (active) { c.fillStyle = color; c.fillRect(sx, by - 3, 2, 2); sx += 3; }
        if (enemy.burnDuration > 0 && enemy.burnFlammability > 0) this.text(`x${burnSpeed(enemy).toFixed(2)}`, p.x, by - 9, '#ffd884');
      }
      if (enemy.burnDuration > 0 && box.w) this.sprite(this.animFrame('fire', t + enemy.id * 0.21), p.x, box.top + box.h * 0.55, Math.max(0.5, s * 0.8));
    }

    const shake = this.wallShake > 0 ? Math.round(Math.sin(this.wallShake * 90) * 1.5) : 0;
    const broken = run.wallHealth / run.wallMaxHealth < 0.3;
    for (let lateral = 60; lateral <= 395; lateral += 18) {
      const p = this.at(FIELD.wallX + 4, lateral); this.sprite(broken && lateral % 54 === 6 ? 'barricade_broken' : 'barricade', p.x + shake, p.y + 3, 1);
    }

    for (let i = 0; i < 3; i++) {
      const merc = run.mercenaries[i], origin = mercPosition(i), p = this.at(origin.x, origin.y);
      if (!merc) { this.sprite('merc_slot', p.x, p.y, 1); continue; }
      const firing = run.events.some(e => (e.kind === 'shot' || e.kind === 'flame') && e.fromX === origin.x && e.fromY === origin.y && e.life > e.maxLife - 0.09);
      const breathe = Math.floor(t * 1.6 + i * 0.7) % 2;
      this.sprite(`merc_${merc.kind}${firing || (merc.kind === 'tesla' && run.events.some(e => e.kind === 'laser' && e.fromX === origin.x && e.life > e.maxLife - 0.2)) ? '_fire' : ''}`, p.x, p.y + breathe, 1, false, this.pixels, i === FLIPPED_SLOT);
    }

    for (const event of run.events) this.effect(run, event);
    if (aim) this.aim(run, aim);

    // Screen shake from fresh explosions.
    let quake = 0;
    for (const e of run.events) if (e.kind === 'blast') quake = Math.max(quake, (e.life / e.maxLife - 0.6) * 5);
    const ox = quake > 0 ? Math.round(Math.sin(t * 97) * quake) : 0, oy = quake > 0 ? Math.round(Math.cos(t * 71) * quake * 0.6) : 0;
    const d = this.context; d.setTransform(1, 0, 0, 1, 0, 0); d.imageSmoothingEnabled = false;
    const scale = w / BUFFER_WIDTH; d.fillStyle = COLOR.outline; d.fillRect(0, 0, w, h);
    d.drawImage(this.buffer, Math.round(ox * scale), Math.round(oy * scale), w, h);
  }

  private fireZone(x: number, y: number, radius: number, t: number) {
    const ring = projectedCircle(x, y, radius, this.view).map(p => ({ x: p.x * PX, y: p.y * PX }));
    const minX = Math.floor(Math.min(...ring.map(p => p.x))), maxX = Math.ceil(Math.max(...ring.map(p => p.x)));
    const minY = Math.floor(Math.min(...ring.map(p => p.y))), maxY = Math.ceil(Math.max(...ring.map(p => p.y)));
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const q = unproject(px / PX, py / PX, this.view), r = Math.hypot(q.x - x, q.y - y) / radius;
      if (r <= 1 && dither(px, py, 0.55 - r * 0.35)) this.dot(px, py, r > 0.8 ? '#87372f' : '#c8613a');
    }
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, rr = Math.sqrt((i + 0.5) / 8) * radius * 0.85, p = this.at(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      this.sprite(this.animFrame('fire', t + i * 0.13), p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE));
    }
  }

  private effect(run: DefenseRun, e: VisualEvent) {
    const progress = 1 - e.life / e.maxLife, end = this.at(e.x, e.y);
    if (e.kind === 'shot' || e.kind === 'flame' || e.kind === 'laser') {
      const slot = run.mercenaries.findIndex((_, i) => mercPosition(i).x === e.fromX && mercPosition(i).y === e.fromY);
      const merc = run.mercenaries[slot]; if (!merc) return;
      const p = this.at(e.fromX!, e.fromY!), f = FRAMES[`merc_${merc.kind}`]!, [mx, my] = MUZZLE[merc.kind];
      const left = Math.round(p.x - f[2] / 2), sx = slot === FLIPPED_SLOT ? left + f[2] - 1 - mx : left + mx, sy = Math.round(p.y - f[3]) + my;
      const ty = end.y - 8 * end.scale / WALL_SCALE;
      if (e.kind === 'shot') {
        // A short tracer travelling from the muzzle to the target.
        const a = Math.min(1, progress * 1.6), b = Math.min(1, progress * 1.6 + 0.35);
        this.line(sx + (end.x - sx) * a, sy + (ty - sy) * a, sx + (end.x - sx) * b, sy + (ty - sy) * b, merc.kind === 'tesla' ? '#bff1ea' : '#ffd884');
        if (progress < 0.35) this.sprite('muzzle', sx, sy + 3, 1);
        if (progress > 0.45) this.sprite(this.animFrame('hit', (progress - 0.45) * 0.3, false), end.x, ty + 3, 1);
      } else if (e.kind === 'flame') {
        for (let i = 0; i < 4; i++) { const k = Math.min(1, progress * 1.4 + i * 0.12); this.sprite(this.animFrame('fire', progress + i * 0.1), sx + (end.x - sx) * k, sy + (ty - sy) * k + 4, 0.5 + k * 0.5); }
      } else {
        const fade = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
        if (fade <= 0) return;
        const far = this.at(e.x, e.y);
        for (const [off, color] of [[-1, '#2b6470'], [1, '#2b6470'], [0, '#56aebb']] as const) this.line(sx + off, sy, far.x + off, far.y, color);
        this.line(sx, sy, far.x, far.y, fade > 0.5 ? '#bff1ea' : '#56aebb', progress < 0.3 ? 0 : 3);
        for (let i = 1; i < 6; i++) { const k = i / 6; this.sprite(this.animFrame('zap', progress + i * 0.07), sx + (far.x - sx) * k, sy + (far.y - sy) * k + 4, 1); }
      }
    } else if (e.kind === 'blast') {
      const ring = projectedCircle(e.x, e.y, e.radius * (0.4 + progress * 0.6), this.view);
      ring.forEach((p, i) => { if (i % 2 === 0) this.dot(p.x * PX, p.y * PX, progress < 0.5 ? '#ffd884' : '#87372f'); });
      const across = (this.at(e.x, e.y + e.radius).x - this.at(e.x, e.y - e.radius).x);
      this.sprite(this.animFrame('explosion', progress * 0.5, false), end.x, end.y + across * 0.25, Math.max(0.6, across / 25));
    } else if (e.kind === 'kill') {
      this.sprite(this.animFrame('death', progress * 0.4, false), end.x, end.y + 2, Math.max(0.5, end.scale / WALL_SCALE));
    } else {
      this.sprite(this.animFrame('hit', progress * 0.19, false), end.x, end.y - 6, 1);
    }
  }

  private aim(run: DefenseRun, aim: Aim) {
    const merc = run.mercenaries[aim.slot]; if (!merc) return;
    const def = MERCENARIES[merc.kind], color = aim.valid ? '#ffd884' : '#ee9d4f', r = def.radius * run.skillRange;
    if (merc.kind === 'tesla') {
      const origin = mercPosition(aim.slot), dx = aim.x - origin.x, dy = aim.y - origin.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const corners = [[origin.x - uy * r, origin.y + ux * r], [origin.x + ux * 1100 - uy * r, origin.y + uy * 1100 + ux * r], [origin.x + ux * 1100 + uy * r, origin.y + uy * 1100 - ux * r], [origin.x + uy * r, origin.y - ux * r]] as const;
      const pts = corners.map(([x, y]) => this.at(x, y));
      for (let i = 0; i < 4; i++) { const a = pts[i]!, b = pts[(i + 1) % 4]!; this.line(a.x, a.y, b.x, b.y, color, 2); }
    } else {
      const ring = projectedCircle(aim.x, aim.y, r, this.view);
      ring.forEach((p, i) => { if (i % 2 === 0) { this.dot(p.x * PX, p.y * PX, color); } });
    }
    const p = this.at(aim.x, aim.y);
    this.line(p.x - 4, p.y, p.x - 2, p.y, color); this.line(p.x + 2, p.y, p.x + 4, p.y, color);
    this.line(p.x, p.y - 4, p.x, p.y - 2, color); this.line(p.x, p.y + 2, p.x, p.y + 4, color);
  }
}
