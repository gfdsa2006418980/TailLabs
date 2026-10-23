import { SKILLS } from './Content.ts';
import type { MercKind } from './Content.ts';
import { FIELD, METER_KINDS, meterThreshold, mercPosition } from './Run.ts';
import * as B from './Balance.ts';
import type { DefenseRun, VisualEvent } from './Run.ts';
import { project, projectedCircle, unproject } from './Projection.ts';
import type { Viewport } from './Projection.ts';
import { ANIMS, FRAMES } from './generated/sprites.ts';
import sheetUrl from './generated/tl003.png';
import normalUrl from './generated/tl003_n.png';
import { createCompositor } from './Lighting.ts';
import type { Atmosphere, Compositor, Layers, Light } from './Lighting.ts';
import { BASE_ZOOM } from './Camera.ts';
import type { CameraView } from './Camera.ts';
import { Feedback } from './Fx.ts';

export interface Aim { slot: number; x: number; y: number; valid: boolean }

/** The field is drawn into a 240 px wide buffer and scaled up without smoothing: every mark lands on the pixel grid. */
const BUFFER_WIDTH = 240;
const PX = BUFFER_WIDTH / 480;           // buffer pixels per logical field unit
const WALL_SCALE = project(FIELD.wallX, 225, { width: 480, height: 600 }).scale;
/** Keyed by enemy kind; any kind without art falls back to the walker so new enemies never break drawing. */
const ENEMY_ART: Record<string, { anim: string; scale: number }> = {
  walker: { anim: 'zombie_walker', scale: 1 }, runner: { anim: 'zombie_runner', scale: 0.95 },
  armored: { anim: 'zombie_armored', scale: 1.05 }, hazmat: { anim: 'zombie_hazmat', scale: 1.05 }, brute: { anim: 'zombie_brute', scale: 1 }, elite: { anim: 'zombie_elite', scale: 1.1 },
  boss: { anim: 'zombie_boss', scale: 1.25 },
};
/** Muzzle pixel inside each mercenary sprite (sprite-local coordinates). */
const MUZZLE: Record<MercKind, [number, number]> = {
  rifle: [21, 1], flame: [20, 1], tesla: [21, 2], gunner: [22, 1], sniper: [23, 1], cryo: [21, 1], grenadier: [21, 2], chemist: [21, 1], engineer: [21, 2], signal: [21, 2],
};
/** Mercenaries whose guns throw brass casings. */
const SHELLS = new Set<MercKind>(['rifle', 'gunner', 'sniper']);
/** Zombies in the far 40% of the road (small on screen) are drawn as a bare body: no shadow, eyes or status marks. */
/** Burning flames drawn per frame at most (2026-10-24, performance); the zombies nearest the barricade keep theirs. */
const MAX_FLAMES = 60;
const FAR_X = 0.4 * (FIELD.wallX + 20) - 20;
/** At most this many damage numbers start per frame; the rest of that frame's hits get none. */
const MAX_NEW_DAMAGE = 30;
/** Status meter colours under the health bar: 凍結、感電、暈眩. */
const METER_COLOR = { chill: '#9fd8f0', shock: '#bff1ea', stun: '#ffe9a8' , ignite: '#ee9d4f' } as const;
const ICE: readonly [number, number, number] = [0.6, 0.85, 1], TOXIC: readonly [number, number, number] = [0.6, 1, 0.35];
/** The right-hand slot is mirrored so every weapon points in towards the road. */
const FLIPPED_SLOT = 2;
const COLOR = {
  field: '#2b3a31', fieldDark: '#1d2722', fieldLight: '#3b4d3f', road: '#5a5848', roadDark: '#46412f', roadLight: '#6c634a',
  lane: '#d8c79a', dirt: '#4a4433', hp: '#d7d69c', hpBack: '#0b0d0e',
} as const;
type RGB = readonly [number, number, number];
const WARM: RGB = [1, 0.78, 0.5], FIRE: RGB = [1, 0.55, 0.22], CYAN: RGB = [0.45, 0.95, 1], MOON: RGB = [0.7, 0.82, 1];
/** Night look: cold moonlit ambient, warm haze towards the burning city on the horizon. */
const ATMOSPHERE = { ambient: [0.5, 0.56, 0.78] as RGB, fog: [0.26, 0.2, 0.24] as RGB };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dither = (x: number, y: number, density: number) => BAYER[(y & 3) * 4 + (x & 3)]! < density * 16;
/** Deterministic 0..1 noise per integer pair, so the background never shimmers between repaints. */
const hash = (x: number, y: number) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const canvas = (w = 1, h = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx = (c: HTMLCanvasElement) => { const x = c.getContext('2d', { willReadFrequently: false })!; x.imageSmoothingEnabled = false; return x; };
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

interface Targets { albedo?: CanvasRenderingContext2D; normal?: CanvasRenderingContext2D; emissive?: CanvasRenderingContext2D; overlay?: CanvasRenderingContext2D }

export class Battlefield {
  readonly feedback = new Feedback();
  private compositor: Compositor;
  private layers: Layers = { albedo: canvas(), normals: canvas(), emissive: canvas(), overlay: canvas() };
  private c: Required<Targets>;
  private bg = { albedo: canvas(), normals: canvas(), emissive: canvas() };
  private decals = canvas();
  private sheet = new Image(); private normalSheet = new Image();
  private flashSheet = canvas(); private normalFlipped = canvas();
  private loaded = 0;
  private view: Viewport = { width: 480, height: 600 };
  private camera: CameraView = { x: 0, y: 0, zoom: BASE_ZOOM, angle: 0, letterbox: 0, timeScale: 1, hurt: 0, flash: 0 };
  private seen = new WeakSet<VisualEvent>();
  private realTime = 0; private lastWall = -1; private wallShake = 0; private decalFade = 0;
  private arrivals = new Map<number, number>(); private levelUps = new Map<number, number>();
  private lights: Light[] = [];
  /** Corpses are pressed into the decal layer once their death animation has played. */
  private corpses: { name: string; x: number; y: number; scale: number; at: number }[] = [];
  private shells: { x: number; y: number; vx: number; vy: number; ground: number; age: number }[] = [];
  private bossSeen = new Map<number, number>();
  reducedMotion = false;
  constructor(private screen: HTMLCanvasElement) {
    this.compositor = createCompositor(screen, new URLSearchParams(location.search).has('canvas2d'));
    this.c = { albedo: ctx(this.layers.albedo), normal: ctx(this.layers.normals), emissive: ctx(this.layers.emissive), overlay: ctx(this.layers.overlay) };
    screen.style.imageRendering = 'pixelated';
    const done = () => { if (++this.loaded === 2) this.prepareSheets(); };
    this.sheet.onload = done; this.normalSheet.onload = done;
    this.sheet.onerror = this.normalSheet.onerror = () => console.error('TL003: sprite sheet failed to load; the battlefield cannot be drawn.');
    this.sheet.src = sheetUrl; this.normalSheet.src = normalUrl;
  }
  get webgl() { return this.compositor.webgl; }
  /** Buffer size in pixels (the camera works in these units). */
  get size() { return { width: this.layers.albedo.width, height: this.layers.albedo.height }; }
  private get ready() { return this.loaded >= 2 && this.flashSheet.width > 1; }
  private prepareSheets() {
    // A white copy of the sheet for the hit flash (drawn as light, so it reads in the dark).
    const { width, height } = this.sheet;
    this.flashSheet.width = width; this.flashSheet.height = height;
    const f = ctx(this.flashSheet); f.drawImage(this.sheet, 0, 0);
    f.globalCompositeOperation = 'source-in'; f.fillStyle = '#fff6dc'; f.fillRect(0, 0, width, height);
    // Mirrored sprites need their normals mirrored too: invert the red (x) channel.
    this.normalFlipped.width = width; this.normalFlipped.height = height;
    const n = this.normalFlipped.getContext('2d')!; n.drawImage(this.normalSheet, 0, 0);
    const data = n.getImageData(0, 0, width, height);
    for (let i = 0; i < data.data.length; i += 4) data.data[i] = 255 - data.data[i]!;
    n.putImageData(data, 0, 0);
    this.view = { width: 480, height: 0 };
  }

  // ---------- coordinates ----------
  /** Screen fraction (0..1) -> buffer pixels, through the current camera (mirrors the compositor). */
  private toBuffer(u: number, v: number) {
    const W = this.layers.albedo.width, H = this.layers.albedo.height, { x, y, zoom, angle } = this.camera;
    const cx = (u - 0.5) * W, cy = (v - 0.5) * H, cs = Math.cos(angle), sn = Math.sin(angle);
    return { x: (cx * cs - cy * sn) / zoom + W / 2 + x, y: (cx * sn + cy * cs) / zoom + H / 2 + y };
  }
  point(clientX: number, clientY: number) {
    const rect = this.screen.getBoundingClientRect();
    const b = this.toBuffer((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
    const view = { width: 480, height: rect.height / rect.width * 480 };
    const p = unproject(b.x / PX, b.y / PX, view);
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    return { ...p, valid: p.valid && inside };
  }
  /** Where coins fly: a client position (e.g. the money icon), mapped into the buffer. */
  setCoinTarget(clientX: number, clientY: number) {
    const rect = this.screen.getBoundingClientRect(); if (!rect.width) return;
    this.feedback.coinTarget = this.toBuffer((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
  }
  /** Buffer-pixel offset of a field point from the view centre (for camera leans and pans). */
  offsetOf(front: number, lateral: number) {
    const p = this.at(front, lateral);
    return { x: p.x - this.layers.albedo.width / 2, y: p.y - this.layers.albedo.height / 2 };
  }
  /** The camera for this frame; set before pointer mapping so aims match what is drawn. */
  useCamera(view: CameraView) { this.camera = view; }
  mercArrived(slot: number) { this.arrivals.set(slot, this.realTime); }
  mercLeveled(slot: number) { this.levelUps.set(slot, this.realTime); }
  clear() { this.feedback.clear(); this.arrivals.clear(); this.levelUps.clear(); this.corpses = []; this.shells = []; this.bossSeen.clear(); ctx(this.decals).clearRect(0, 0, this.decals.width, this.decals.height); this.lastWall = -1; }

  // ---------- pixel helpers (buffer coordinates) ----------
  private dot(c: CanvasRenderingContext2D, x: number, y: number, color: string) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
  private line(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, dash = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, i = 0; c.fillStyle = color;
    for (let guard = 0; guard < 2000; guard++) {
      if (!dash || Math.floor(i / dash) % 2 === 0) c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } i++;
    }
  }
  /** Draws a sheet frame with its bottom-centre at (x, y), scaled and snapped to whole pixels, into the given layers. */
  private sprite(name: string, x: number, y: number, scale: number, to: Targets, flip = false, flash = false) {
    const f = FRAMES[name]; if (!f || !this.ready) return { left: 0, top: 0, w: 0, h: 0 };
    const w = Math.max(1, Math.round(f[2] * scale)), h = Math.max(1, Math.round(f[3] * scale));
    const left = Math.round(x - w / 2), top = Math.round(y - h);
    const paint = (c: CanvasRenderingContext2D | undefined, image: CanvasImageSource) => {
      if (!c) return;
      if (flip) { c.save(); c.translate(left + w, top); c.scale(-1, 1); c.drawImage(image, f[0], f[1], f[2], f[3], 0, 0, w, h); c.restore(); }
      else c.drawImage(image, f[0], f[1], f[2], f[3], left, top, w, h);
    };
    paint(to.albedo, this.sheet); paint(to.normal, flip ? this.normalFlipped : this.normalSheet);
    paint(to.emissive, flash ? this.flashSheet : this.sheet); paint(to.overlay, this.sheet);
    return { left, top, w, h };
  }
  private lit() { return { albedo: this.c.albedo, normal: this.c.normal }; }
  private glow() { return { emissive: this.c.emissive }; }
  private animFrame(name: string, seconds: number, loop = true) {
    const anim = ANIMS[name]!; const total = anim.ms.reduce((a, b) => a + b, 0);
    let t = seconds * 1000; t = loop ? ((t % total) + total) % total : Math.min(t, total - 1);
    for (let i = 0; i < anim.frames.length; i++) { t -= anim.ms[i]!; if (t < 0) return anim.frames[i]!; }
    return anim.frames[anim.frames.length - 1]!;
  }
  private at(front: number, lateral: number) { const p = project(front, lateral, this.view); return { x: p.x * PX, y: p.y * PX, scale: p.scale }; }
  private light(x: number, y: number, radius: number, color: RGB, intensity: number, z = 10) {
    if (intensity > 0.01 && radius > 1) this.lights.push({ x, y, z, radius, color, intensity });
  }

  // ---------- static background ----------
  private paintBackground() {
    const w = BUFFER_WIDTH, h = this.layers.albedo.height;
    for (const c of [this.bg.albedo, this.bg.normals, this.bg.emissive, this.decals]) { c.width = w; c.height = h; }
    const a = ctx(this.bg.albedo), n = ctx(this.bg.normals), e = ctx(this.bg.emissive);
    const horizon = Math.round(this.at(0, 225).y);
    // Night sky, unlit: deep navy fading into the glow of the burning city.
    for (let y = 0; y < horizon + 2; y++) for (let x = 0; x < w; x++) {
      const t = y / Math.max(1, horizon);
      const color = t < 0.45 ? (dither(x, y, t / 0.45) ? '#121a2b' : '#0a0f1c') : t < 0.8 ? (dither(x, y, (t - 0.45) / 0.35) ? '#3a2430' : '#121a2b') : (dither(x, y, (t - 0.8) / 0.2) ? '#7a3424' : '#3a2430');
      a.fillStyle = color; a.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i, 91) * w), y = Math.floor(hash(i, 92) * horizon * 0.6);
      this.dot(a, x, y, hash(i, 93) > 0.85 ? '#eadfbd' : '#56626d');
    }
    // Moon with a soft halo (the halo is emissive so it blooms).
    const mx = 46, my = Math.max(8, Math.round(horizon * 0.32));
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= 20) this.dot(a, mx + dx, my + dy, (dx + 2) * (dx + 2) + (dy - 1) * (dy - 1) <= 3 || (dx - 2) * (dx - 2) + (dy + 2) * (dy + 2) <= 1 ? '#aeb8b4' : '#dfe4d8');
      else if (d <= 49 && dither(mx + dx, my + dy, 0.35)) this.dot(e, mx + dx, my + dy, '#5a6c7a');
    }
    // City skyline in silhouette, windows and fires glowing.
    const sky = FRAMES.skyline;
    if (sky) {
      const s = canvas(sky[2], sky[3]), sc = ctx(s); sc.drawImage(this.sheet, sky[0], sky[1], sky[2], sky[3], 0, 0, sky[2], sky[3]);
      const pixels = sc.getImageData(0, 0, sky[2], sky[3]);
      const left = Math.round(w / 2 - sky[2] / 2), top = horizon + 3 - sky[3];
      for (let y = 0; y < sky[3]; y++) for (let x = 0; x < sky[2]; x++) {
        const i = (y * sky[2] + x) * 4; if (pixels.data[i + 3]! < 128) continue;
        const bright = pixels.data[i]! > 150, far = y < sky[3] * 0.55;
        this.dot(a, left + x, top + y, far ? '#1a1620' : '#0e0f14');
        if (bright && hash(x, y) < 0.7) this.dot(e, left + x, top + y, hash(x, y + 9) < 0.3 ? '#ee9d4f' : '#c8613a');
      }
    }
    // Ground and the perspective road, one scanline at a time. Normals: flat, facing the viewer.
    n.fillStyle = '#8080ff'; n.fillRect(0, horizon, w, h - horizon);
    for (let y = horizon; y < h; y++) {
      const ly = (y + 0.5) / PX, front = unproject(240, ly, this.view).x;
      const left = this.at(front, 65).x, right = this.at(front, 390).x, edgeL = this.at(front, 50).x, edgeR = this.at(front, 405).x;
      for (let x = 0; x < w; x++) {
        const v = hash(x, y);
        let color: string;
        if (x >= left && x <= right) color = v < 0.05 ? COLOR.roadDark : v > 0.975 ? COLOR.roadLight : COLOR.road;
        else if (x >= edgeL && x <= edgeR) color = v < 0.3 ? COLOR.roadDark : COLOR.dirt;
        else color = v < 0.06 ? COLOR.fieldLight : v > 0.93 ? COLOR.fieldDark : COLOR.field;
        a.fillStyle = color; a.fillRect(x, y, 1, 1);
      }
    }
    // Grass tufts on the verges and cracks across the asphalt.
    for (let i = 0; i < 160; i++) {
      const front = hash(i, 1) * (FIELD.wallX + 60), lateral = hash(i, 2) < 0.5 ? hash(i, 3) * 40 + 5 : 410 + hash(i, 3) * 45;
      const p = this.at(front, lateral); this.dot(a, p.x, p.y, COLOR.fieldLight); this.dot(a, p.x - 1, p.y + 1, COLOR.fieldLight); this.dot(a, p.x + 1, p.y + 1, COLOR.fieldLight);
    }
    for (let i = 0; i < 10; i++) {
      let front = 80 + hash(i, 7) * (FIELD.wallX - 120), lateral = 90 + hash(i, 8) * 270;
      for (let s = 0; s < 14; s++) {
        const p = this.at(front, lateral); this.dot(a, p.x, p.y, COLOR.roadDark);
        front += (hash(i, s + 20) - 0.3) * 10; lateral += (hash(i, s + 40) - 0.5) * 14;
      }
    }
    // Lane dashes and edge lines follow the projection.
    for (let front = 0; front < FIELD.wallX + 80; front += 2) {
      const p = this.at(front, 225); if (Math.floor(front / 40) % 2 === 0) { this.dot(a, p.x, p.y, COLOR.lane); if (p.scale > 1) this.dot(a, p.x + 1, p.y, COLOR.lane); }
      for (const lateral of [70, 385]) { const q = this.at(front, lateral); if (Math.floor(front / 12) % 3 !== 0) this.dot(a, q.x, q.y, COLOR.roadLight); }
    }
    // Props, far to near so nearer ones overlap.
    const props: [string, number, number][] = [
      ['crater', 220, 300], ['lamp_post', 90, 30], ['lamp_post', 420, 422], ['car_wreck', 365, 96], ['tire', 300, 150],
      ['barrel', 470, 412], ['barrel_tipped', 520, 40], ['crater', 560, 170], ['debris_a', 140, 260], ['debris_b', 250, 340],
      ['debris_c', 420, 230], ['debris_a', 610, 300], ['debris_b', 660, 120], ['debris_c', 520, 360], ['tire', 640, 395],
    ];
    const to = { albedo: a, normal: n };
    for (const [name, front, lateral] of props.sort((p, q) => p[1] - q[1])) {
      const p = this.at(front, lateral); this.sprite(name, p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE), to);
    }
    for (const lateral of [38, 412]) for (let front = 40; front <= FIELD.wallX; front += 70) {
      const p = this.at(front, lateral); this.sprite('fence_post', p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE), to);
    }
    // Behind the barricade: sandbag nests under each mercenary slot.
    for (let slot = 0; slot < 3; slot++) { const m = mercPosition(slot), p = this.at(m.x + 12, m.y); this.sprite('sandbags', p.x - 13, p.y + 3, 1, to); this.sprite('sandbags', p.x + 13, p.y + 3, 1, to); }
  }

  /** Static and ambient lights: street lamps, the barricade floodlights, the city glow and a sweeping searchlight. */
  private sceneLights(t: number, run: DefenseRun) {
    const horizon = this.at(0, 225);
    this.light(horizon.x, horizon.y + 4, 150, FIRE, 0.55 + 0.06 * Math.sin(t * 1.7), 40);
    for (const [front, lateral, flicker] of [[90, 30, false], [420, 422, true]] as const) {
      const p = this.at(front, lateral), s = Math.max(0.5, p.scale / WALL_SCALE);
      const on = !flicker || Math.sin(t * 13) + Math.sin(t * 7.3) > -1.2;
      if (on) { this.light(p.x + 2 * s, p.y - 27 * s, 70 * s, WARM, 1.1, 30); this.dot(this.c.emissive, p.x + 2 * s, p.y - 27 * s, '#fff1c4'); }
    }
    for (const lateral of [55, 395]) { const p = this.at(FIELD.wallX + 14, lateral); this.light(p.x, p.y - 6, 150, WARM, 1.1, 60); }
    // The searchlight sweeps the road on game time (it is part of the model since core 探照獵殺 uses it);
    // its beam is a faint dithered wedge from the barricade.
    const light = run.searchlight, wide = light.radius > B.SEARCHLIGHT_RADIUS;
    const spot = this.at(light.x, light.y), origin = this.at(FIELD.wallX + 30, 225);
    const spotRadius = (30 + 24 * spot.scale) * light.radius / B.SEARCHLIGHT_RADIUS;
    this.light(spot.x, spot.y, spotRadius, MOON, wide ? 1.6 : 1.3, 40);
    this.beam(origin.x, origin.y - 10, spot.x, spot.y, spotRadius * 0.35);
    // With 探照獵殺 the lit area is a rule, so its edge is drawn.
    if (wide) projectedCircle(light.x, light.y, light.radius, this.view).forEach((p, i) => { if ((i + Math.floor(t * 6)) % 3 === 0) this.dot(this.c.emissive, p.x * PX, p.y * PX, '#dfe9ff'); });
    // Danger pulse at the horizon while a boss is announced.
    if (run.bossWarning !== undefined) this.light(horizon.x, horizon.y, 120, [1, 0.15, 0.1], 0.8 + 0.5 * Math.sin(t * 9), 30);
  }

  // ---------- frame ----------
  draw(run: DefenseRun, aim: Aim | undefined, camera: CameraView, realDt: number) {
    this.camera = camera; this.realTime += realDt;
    const rect = this.screen.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (w <= 0 || h <= 0) return;
    if (this.screen.width !== w || this.screen.height !== h) { this.screen.width = w; this.screen.height = h; }
    const bufferHeight = Math.max(1, Math.round(BUFFER_WIDTH * rect.height / rect.width));
    if (!this.ready) return;
    if (this.layers.albedo.height !== bufferHeight || this.view.height !== bufferHeight / PX) {
      for (const c of Object.values(this.layers)) { c.width = BUFFER_WIDTH; c.height = bufferHeight; }
      for (const c of Object.values(this.c)) c.imageSmoothingEnabled = false;
      this.view = { width: 480, height: bufferHeight / PX }; this.paintBackground();
    }
    const { albedo: A, normal: N, emissive: E, overlay: O } = this.c, t = run.elapsed, real = this.realTime;
    this.lights = [];
    A.drawImage(this.bg.albedo, 0, 0); A.drawImage(this.decals, 0, 0);
    N.clearRect(0, 0, BUFFER_WIDTH, bufferHeight); N.drawImage(this.bg.normals, 0, 0);
    E.clearRect(0, 0, BUFFER_WIDTH, bufferHeight); E.drawImage(this.bg.emissive, 0, 0);
    O.clearRect(0, 0, BUFFER_WIDTH, bufferHeight);
    this.sceneLights(real, run);

    // Fresh combat events: feedback numbers, coins, decals.
    const hits: VisualEvent[] = [];
    for (const e of run.events) {
      if (this.seen.has(e)) continue; this.seen.add(e);
      // Far up the road the horde stands packed at its spawn: numbers there piled into one blob over the HUD. Bosses still show.
      if (e.kind === 'hit' && e.amount && (e.x >= FAR_X || e.enemy === 'boss')) hits.push(e);
      if (e.kind !== 'kill' && e.kind !== 'shot' && e.kind !== 'blast') continue;
      const p = this.at(e.x, e.y);
      if (e.kind === 'kill') {
        // Far kills pay without a floating number or coin (they piled up over the HUD); the money still counts.
        if (e.amount && (e.x >= FAR_X || e.enemy === 'boss')) this.feedback.kill(p.x, p.y - 6 * p.scale, e.amount);
        const art = ENEMY_ART[e.enemy ?? ''] ?? ENEMY_ART.walker!, death = `${art.anim}_death`;
        if (ANIMS[death]) this.corpses.push({ name: ANIMS[death]!.frames.at(-1)!, x: p.x, y: p.y + 1, scale: p.scale / WALL_SCALE * art.scale, at: t + e.life });
      }
      if (e.kind === 'shot' && e.merc && SHELLS.has(e.merc) && !this.reducedMotion) this.ejectShell(run, e);
      if (e.kind === 'blast') this.scorch(e.x, e.y, e.radius * 0.5);
    }
    // Over the cap, keep crits, boss hits, skill hits and big numbers first.
    if (hits.length > MAX_NEW_DAMAGE) {
      const rank = (e: VisualEvent) => (e.crit ? 4 : 0) + (e.enemy === 'boss' ? 2 : 0) + (e.skill ? 1 : 0);
      hits.sort((a, b) => rank(b) - rank(a) || b.amount! - a.amount!); hits.length = MAX_NEW_DAMAGE;
    }
    for (const e of hits) { const p = this.at(e.x, e.y); this.feedback.damage(p.x, p.y - 4 * p.scale, e.amount!, e.target ?? 0, !!e.skill, !!e.crit, e.element); }
    // Game time: a death frozen by hit-stop, a card choice or a pause keeps its body standing.
    for (const corpse of this.corpses) if (t >= corpse.at) {
      const d = ctx(this.decals); d.globalAlpha = 0.85; this.sprite(corpse.name, corpse.x, corpse.y, corpse.scale, { albedo: d }); d.globalAlpha = 1;
    }
    this.corpses = this.corpses.filter(c => t < c.at);
    // Decals fade slowly so the road remembers the fight without filling up.
    this.decalFade += realDt;
    if (this.decalFade > 1) { this.decalFade = 0; const d = ctx(this.decals); d.globalCompositeOperation = 'destination-out'; d.fillStyle = 'rgba(0,0,0,0.025)'; d.fillRect(0, 0, BUFFER_WIDTH, bufferHeight); d.globalCompositeOperation = 'source-over'; }

    for (const zone of run.zones) {
      if (zone.kind === 'gas') this.gasZone(zone.x, zone.y, zone.radius, t, zone.remaining);
      else this.fireZone(zone.x, zone.y, zone.radius, t, zone.remaining, !zone.spread);
    }
    // 地雷陣: dark discs with a blinking red fuse light.
    for (const mine of run.mines) {
      const p = this.at(mine.x, mine.y);
      A.fillStyle = '#1d2016'; A.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 1, 5, 2);
      if (Math.floor(real * 3 + mine.x) % 2 === 0) { this.dot(E, p.x, p.y - 1, '#ff5a3c'); this.light(p.x, p.y - 1, 10, [1, 0.25, 0.15], 0.6, 4); }
    }
    let burningLights = 0;
    // Per-zombie rectangles are batched by colour (2026-10-24, performance): switching fillStyle for every bar and dot of
    // hundreds of zombies cost more than drawing them. Shadows go down first, under every body; bars and dots after all.
    const placed = [...run.enemies].sort((a, b) => a.x - b.x).map(enemy => ({ enemy, p: this.at(enemy.x, enemy.y) }));
    // Over MAX_FLAMES burning zombies, the farthest go without a flame sprite (the list runs far to near).
    let flameSkip = Math.max(0, placed.filter(({ enemy }) => (enemy.x >= FAR_X || enemy.kind === 'boss') && run.isBurning(enemy)).length - MAX_FLAMES);
    const barBacks: number[] = [], barFills = new Map<string, number[]>();
    const fillRect = (color: string, x: number, y: number, w: number, h: number) => { let list = barFills.get(color); if (!list) barFills.set(color, list = []); list.push(x, y, w, h); };
    A.fillStyle = '#0b0d0e90';
    for (const { enemy, p } of placed) {
      if (enemy.x < FAR_X && enemy.kind !== 'boss') continue;
      const art = ENEMY_ART[enemy.kind] ?? ENEMY_ART.walker!, s = p.scale / WALL_SCALE * art.scale * (enemy.superBoss ? B.SUPER_BOSS_SCALE : 1);
      const shadowW = Math.max(2, Math.round(12 * s));
      A.fillRect(Math.round(p.x - shadowW / 2), Math.round(p.y) - 1, shadowW, Math.max(1, Math.round(2 * s)));
    }
    for (const { enemy, p } of placed) {
      const art = ENEMY_ART[enemy.kind] ?? ENEMY_ART.walker!, s = p.scale / WALL_SCALE * art.scale * (enemy.superBoss ? B.SUPER_BOSS_SCALE : 1);
      const far = enemy.x < FAR_X && enemy.kind !== 'boss';
      const flash = enemy.hitFlash > 0, knock = flash && !this.reducedMotion ? -1 : 0;
      // At the barricade they claw and chew; the boss roars when it first appears.
      if (enemy.kind === 'boss' && !this.bossSeen.has(enemy.id)) this.bossSeen.set(enemy.id, real);
      const roaring = enemy.kind === 'boss' && real - this.bossSeen.get(enemy.id)! < 0.75 && ANIMS.zombie_boss_roar;
      const frozen = run.isFrozen(enemy), stunned = run.isStunned(enemy), paralyzed = run.isParalyzed(enemy);
      const chewing = enemy.x >= FIELD.wallX - 18.01 && !paralyzed && ANIMS[`${art.anim}_attack`];
      const anim = roaring ? 'zombie_boss_roar' : chewing ? `${art.anim}_attack` : art.anim;
      // Frozen zombies stop mid-stride: their animation clock stands still.
      const clock = roaring ? real - this.bossSeen.get(enemy.id)! : frozen ? enemy.id * 0.137 : t + enemy.id * 0.137;
      const name = this.animFrame(anim, clock, !roaring);
      // Far zombies skip the normal-map layer: they are small and dim, and it halves their cost.
      const box = this.sprite(name, p.x, p.y + 1 + knock, s, far ? { albedo: this.c.albedo } : this.lit());
      if (!far && ANIMS[`${anim}_eyes`]) this.sprite(this.animFrame(`${anim}_eyes`, clock, !roaring), p.x, p.y + 1 + knock, s, this.glow());
      if (flash && box.w) { E.globalAlpha = 0.85; this.sprite(name, p.x, p.y + 1 + knock, s, { emissive: E }, false, true); E.globalAlpha = 1; }
      if (enemy.kind === 'boss' && box.w) this.light(p.x, box.top + box.h * 0.3, 40 * s, [1, 0.2, 0.15], 0.5, 16);
      if (enemy.hp < enemy.maxHp && box.w) {
        const bw = Math.max(6, box.w - 2), bx = Math.round(p.x - bw / 2), by = box.top - 3;
        barBacks.push(bx - 1, by - 1, bw + 2, 3); fillRect(enemy.kind === 'boss' ? '#ff7a5c' : COLOR.hp, bx, by, Math.max(1, Math.round(bw * Math.max(0, enemy.hp / enemy.maxHp))), 1);
        if (!far) {
          let sx = bx;
          for (const [active, color] of [[run.isBurning(enemy), '#ee9d4f'], [enemy.toxin > 0, '#a6c46a'], [frozen, '#9fd8f0'], [paralyzed, '#bff1ea'], [stunned, '#ffe9a8']] as const)
            if (active) { fillRect(color, sx, by - 3, 2, 2); sx += 3; }
          // Build-up meters: one pixel row each under the health bar, filling towards the next control.
          let my = by + 2;
          for (const kind of METER_KINDS) {
            const m = enemy.meters[kind]; if (m.value <= 0) continue;
            const fill = Math.min(1, m.value / meterThreshold(enemy, kind, run.elapsed));
            barBacks.push(bx - 1, my, bw + 2, 2); fillRect(METER_COLOR[kind], bx, my, Math.max(1, Math.round(bw * fill)), 1); my += 2;
          }
        }
      }
      // Status effects only on near zombies (far ones are body-only); at most MAX_FLAMES burning sprites a frame.
      if (far) continue;
      if (run.isBurning(enemy) && box.w && flameSkip-- <= 0) {
        this.sprite(this.animFrame('fire', t + enemy.id * 0.21), p.x, box.top + box.h * 0.55, Math.max(0.5, s * 0.8), this.glow());
        if (burningLights++ < 10) this.light(p.x, box.top + box.h * 0.5, 22 * s + 6, FIRE, 0.7, 8);
      }
      if (frozen && box.w) { this.sprite('fx_ice', p.x, box.top + box.h * 0.75, Math.max(0.6, s * 1.2), this.glow()); this.light(p.x, box.top + box.h * 0.5, 18 * s + 6, ICE, 0.7, 8); }
      if (stunned && box.w && ANIMS.fx_stun) this.sprite(this.animFrame('fx_stun', real + enemy.id * 0.3), p.x, box.top - 1, Math.max(0.6, s), this.glow());
      if (enemy.toxin > 0 && box.w && Math.floor(real * 6 + enemy.id) % 4 === 0) this.dot(E, p.x + (hash(enemy.id, Math.floor(real * 6)) - 0.5) * box.w, box.top + box.h * 0.3, '#a4dc4c');
      const sparks = paralyzed ? 2 : enemy.meters.shock.value > 0 ? 5 : 0;
      if (sparks && box.w && Math.floor(real * 20 + enemy.id) % sparks === 0) this.dot(E, p.x + (hash(enemy.id, Math.floor(real * 20)) - 0.5) * box.w, box.top + hash(Math.floor(real * 20), enemy.id) * box.h, '#bff1ea');
    }
    // The batched bars: every dark back first, then each colour once.
    O.fillStyle = COLOR.hpBack; for (let i = 0; i < barBacks.length; i += 4) O.fillRect(barBacks[i]!, barBacks[i + 1]!, barBacks[i + 2]!, barBacks[i + 3]!);
    for (const [color, list] of barFills) { O.fillStyle = color; for (let i = 0; i < list.length; i += 4) O.fillRect(list[i]!, list[i + 1]!, list[i + 2]!, list[i + 3]!); }

    // Core 亡者徵召: raised corpses walk back up the road, lit by a sickly green glow.
    for (const ally of run.allies) {
      const p = this.at(ally.x, ally.y), s = p.scale / WALL_SCALE;
      const box = this.sprite(this.animFrame('zombie_walker', real * 1.4 + ally.id * 0.3), p.x, p.y + 1, s, this.lit(), true);
      if (box.w) { this.light(p.x, box.top + box.h * 0.4, 20 * s + 6, [0.55, 1, 0.45], 0.9, 8); this.dot(E, p.x, box.top + Math.round(box.h * 0.2), '#bff58a'); }
    }
    // Barricade: shakes briefly whenever it loses health (aftershock: fast, decaying).
    if (this.lastWall >= 0 && run.wallHealth < this.lastWall - 1e-6) this.wallShake = 0.18;
    this.lastWall = run.wallHealth; this.wallShake = Math.max(0, this.wallShake - realDt);
    const shake = this.wallShake > 0 && !this.reducedMotion ? Math.round(Math.sin(this.wallShake * 90) * 1.5) : 0;
    const broken = run.wallHealth / run.wallMaxHealth < 0.3;
    for (let lateral = 60; lateral <= 395; lateral += 18) {
      const p = this.at(FIELD.wallX + 4, lateral); this.sprite(broken && lateral % 54 === 6 ? 'barricade_broken' : 'barricade', p.x + shake, p.y + 3, 1, this.lit());
    }

    for (let i = 0; i < 3; i++) {
      const merc = run.mercenaries[i], origin = mercPosition(i), p = this.at(origin.x, origin.y);
      if (!merc) { this.sprite('merc_slot', p.x, p.y, 1, this.lit()); continue; }
      // Age of this mercenary's latest shot (or laser), to play the three-frame firing animation.
      let shotAge = Infinity;
      for (const e of run.events) if ((e.kind === 'shot' || e.kind === 'flame' || e.kind === 'laser') && e.fromX === origin.x && e.fromY === origin.y) shotAge = Math.min(shotAge, (e.maxLife - e.life) * (e.kind === 'laser' ? 0.4 : 1));
      const fireAnim = `merc_${merc.kind}_fire`, firing = shotAge < 0.15 && !!ANIMS[fireAnim];
      const breathe = Math.floor(real * 1.6 + i * 0.7) % 2, recoil = firing && shotAge < 0.05 && !this.reducedMotion ? 1 : 0;
      const arrived = this.arrivals.get(i), age = arrived === undefined ? 1 : (real - arrived) / 0.4;
      const drop = age < 1 && !this.reducedMotion ? -Math.round(36 * (1 - easeOutBack(Math.max(0, age)))) : 0;
      this.sprite(firing ? this.animFrame(fireAnim, shotAge, false) : `merc_${merc.kind}`, p.x, p.y + breathe + recoil + drop, 1, this.lit(), i === FLIPPED_SLOT);
      if (age >= 1 && age < 2.2 && arrived !== undefined) this.ring(E, p.x, p.y + 2, 4 + (age - 1) * 14, '#eadfbd', 1 - (age - 1) / 1.2);
      const leveled = this.levelUps.get(i), lv = leveled === undefined ? 1 : (real - leveled) / 0.6;
      if (lv < 1) {
        this.light(p.x, p.y - 14, 50, [1, 0.85, 0.45], 1.2 * (1 - lv), 16);
        for (let k = 0; k < 6; k++) { const a = k * 1.047 + lv * 3; this.dot(E, p.x + Math.cos(a) * (6 + lv * 10), p.y - 14 + Math.sin(a) * (6 + lv * 10) - lv * 10, '#ffd884'); }
      }
    }

    for (const event of run.events) this.effect(run, event);
    this.drawShells(realDt);
    if (aim) this.aim(run, aim);
    this.feedback.reducedMotion = this.reducedMotion;
    this.feedback.update(realDt); this.feedback.draw(O);

    const horizon = this.at(0, 225).y, wall = this.at(FIELD.wallX, 225).y;
    const atmosphere: Atmosphere = { ...ATMOSPHERE, horizon, wall };
    this.compositor.render(this.layers, this.lights, atmosphere, camera);
  }

  /** Brass casings fly out of the rifle, bounce once on the sandbags and fade. */
  private ejectShell(run: DefenseRun, e: VisualEvent) {
    const slot = run.mercenaries.findIndex((_, i) => mercPosition(i).x === e.fromX && mercPosition(i).y === e.fromY);
    if (slot < 0 || this.shells.length > 40) return;
    const p = this.at(e.fromX!, e.fromY!), side = slot === FLIPPED_SLOT ? -1 : 1;
    this.shells.push({ x: p.x + side * 5, y: p.y - 18, vx: side * (25 + Math.random() * 20), vy: -45 - Math.random() * 20, ground: p.y + 2, age: 0 });
  }
  private drawShells(dt: number) {
    for (const s of this.shells) {
      s.age += dt; s.vy += 220 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > s.ground) { s.y = s.ground; s.vy *= -0.35; s.vx *= 0.5; }
      if (s.age < 1.4 || Math.floor(s.age * 12) % 2) { this.dot(this.c.albedo, s.x, s.y, '#c9a24a'); this.dot(this.c.normal, s.x, s.y, '#8080ff'); }
    }
    this.shells = this.shells.filter(s => s.age < 2);
  }
  /** A faint dithered wedge of light from (x0, y0) widening to `width` at (x1, y1). */
  private beam(x0: number, y0: number, x1: number, y1: number, width: number) {
    const e = this.c.emissive, steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    const nx = -(y1 - y0) / (steps || 1), ny = (x1 - x0) / (steps || 1);
    e.fillStyle = '#7d93a3';
    for (let i = 0; i <= steps; i++) {
      const k = i / steps, half = 1 + width * k, cx = x0 + (x1 - x0) * k, cy = y0 + (y1 - y0) * k;
      for (let j = -half; j <= half; j += 1) {
        const x = Math.round(cx + nx * j), y = Math.round(cy + ny * j);
        if (dither(x, y, 0.14 * (1 - Math.abs(j) / (half + 1)) * (0.4 + 0.6 * k))) e.fillRect(x, y, 1, 1);
      }
    }
  }
  private ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
    if (alpha <= 0) return;
    c.globalAlpha = Math.min(1, alpha);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; this.dot(c, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.45, color); }
    c.globalAlpha = 1;
  }
  private scorch(x: number, y: number, radius: number) {
    const d = ctx(this.decals), ring = projectedCircle(x, y, radius, this.view).map(p => ({ x: p.x * PX, y: p.y * PX }));
    const minX = Math.floor(Math.min(...ring.map(p => p.x))), maxX = Math.ceil(Math.max(...ring.map(p => p.x)));
    const minY = Math.floor(Math.min(...ring.map(p => p.y))), maxY = Math.ceil(Math.max(...ring.map(p => p.y)));
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const q = unproject(px / PX, py / PX, this.view), r = Math.hypot(q.x - x, q.y - y) / radius;
      if (r <= 1 && dither(px, py, 0.7 - r * 0.6)) this.dot(d, px, py, r < 0.4 ? '#141210' : '#2a2620');
    }
  }

  /**
   * A fire area. `detailed` (the thrown molotov) gets the dithered burning floor, drawn as two batched colours; small
   * spread fires (延燒, dozens at a time late) only get three flames and a glow (2026-10-24, performance).
   */
  private fireZone(x: number, y: number, radius: number, t: number, remaining: number, detailed = true) {
    const fade = Math.min(1, remaining / 1.2);
    if (detailed) this.ditherFloor(x, y, radius, Math.floor(t * 8), 0.55, 0.35, 0.8, '#87372f', '#c8613a', 0.75 * fade);
    const flames = detailed ? 8 : 3;
    for (let i = 0; i < flames; i++) {
      const a = i * 2.4, rr = Math.sqrt((i + 0.5) / flames) * radius * 0.85, p = this.at(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      this.sprite(this.animFrame('fire', t + i * 0.13), p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE), this.glow());
    }
    const centre = this.at(x, y), across = this.at(x, y + radius).x - this.at(x, y - radius).x;
    this.light(centre.x, centre.y - 4, across * 0.9 + 10, FIRE, (1.1 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5.1)) * fade, 10);
  }
  private floorCache = new Map<string, number[]>();
  /** A dithered disc on the road, edge and core colours each set once (per-dot colour switches were the cost). */
  private ditherFloor(x: number, y: number, radius: number, shift: number, density: number, falloff: number, edgeAt: number, edge: string, core: string, alpha: number) {
    const ring = projectedCircle(x, y, radius, this.view).map(p => ({ x: p.x * PX, y: p.y * PX }));
    const minX = Math.floor(Math.min(...ring.map(p => p.x))), maxX = Math.ceil(Math.max(...ring.map(p => p.x)));
    const minY = Math.floor(Math.min(...ring.map(p => p.y))), maxY = Math.ceil(Math.max(...ring.map(p => p.y)));
    // The pixels inside the disc (and their distance from its centre) are worked out once per placement on screen;
    // only the flickering dither runs every frame (2026-10-24, performance).
    const key = `${x.toFixed(1)},${y.toFixed(1)},${radius.toFixed(1)},${minX},${minY},${maxX},${maxY}`;
    let disc = this.floorCache.get(key);
    if (!disc) {
      disc = [];
      for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
        const q = unproject(px / PX, py / PX, this.view), r = Math.hypot(q.x - x, q.y - y) / radius;
        if (r <= 1) disc.push(px, py, r);
      }
      if (this.floorCache.size > 48) this.floorCache.clear();
      this.floorCache.set(key, disc);
    }
    const edges: number[] = [], cores: number[] = [];
    for (let i = 0; i < disc.length; i += 3) {
      const px = disc[i]!, py = disc[i + 1]!, r = disc[i + 2]!;
      if (dither(px + shift, py, density - r * falloff)) (r > edgeAt ? edges : cores).push(px, py);
    }
    const E = this.c.emissive; E.globalAlpha = alpha;
    E.fillStyle = edge; for (let i = 0; i < edges.length; i += 2) E.fillRect(edges[i]!, edges[i + 1]!, 1, 1);
    E.fillStyle = core; for (let i = 0; i < cores.length; i += 2) E.fillRect(cores[i]!, cores[i + 1]!, 1, 1);
    E.globalAlpha = 1;
  }

  /** 毒氣彈: a slow, dithered purple-green cloud with puffs. */
  private gasZone(x: number, y: number, radius: number, t: number, remaining: number) {
    const fade = Math.min(1, remaining / 1.2);
    this.ditherFloor(x, y, radius, Math.floor(t * 3), 0.45, 0.3, 0.75, '#4a2a58', '#6a3f7c', 0.55 * fade);
    if (ANIMS.fx_toxic) for (let i = 0; i < 6; i++) {
      const a = i * 2.4 + t * 0.3, rr = Math.sqrt((i + 0.5) / 6) * radius * 0.8, p = this.at(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      this.sprite(this.animFrame('fx_toxic', t + i * 0.2), p.x, p.y, Math.max(0.5, p.scale / WALL_SCALE), this.glow());
    }
    const centre = this.at(x, y), across = this.at(x, y + radius).x - this.at(x, y - radius).x;
    this.light(centre.x, centre.y - 4, across * 0.8 + 10, TOXIC, 0.7 * fade, 10);
  }

  private effect(run: DefenseRun, e: VisualEvent) {
    const progress = 1 - e.life / e.maxLife, end = this.at(e.x, e.y), E = this.c.emissive;
    if (e.kind === 'freeze' || e.kind === 'stun' || e.kind === 'paralyze') {
      // A control just triggered: a ring that snaps outwards in the status colour.
      const color = e.kind === 'freeze' ? '#e8f8ff' : e.kind === 'stun' ? '#ffe9a8' : '#bff1ea', s = Math.max(0.6, end.scale / WALL_SCALE);
      this.ring(E, end.x, end.y - 8 * s, (4 + progress * 10) * s, color, 1 - progress);
      if (e.kind === 'paralyze') for (let i = 0; i < 3; i++) this.sprite(this.animFrame('zap', progress + i * 0.1), end.x + (i - 1) * 4 * s, end.y - 10 * s, s, this.glow());
      this.light(end.x, end.y - 8 * s, 26 * s + 8, e.kind === 'freeze' ? ICE : e.kind === 'stun' ? WARM : CYAN, 1.2 * (1 - progress), 8);
      return;
    }
    if (e.kind === 'toxic') {
      const across = (this.at(e.x, e.y + e.radius).x - this.at(e.x, e.y - e.radius).x);
      if (ANIMS.fx_toxic) this.sprite(this.animFrame('fx_toxic', progress * 0.5), end.x, end.y, Math.max(0.6, Math.min(2.5, across / 30)), this.glow());
      this.light(end.x, end.y - across * 0.2, across * 1.2 + 16, TOXIC, 1.2 * (1 - progress), 14);
      return;
    }
    if (e.kind === 'shot' || e.kind === 'flame' || e.kind === 'laser') {
      const slot = run.mercenaries.findIndex((_, i) => mercPosition(i).x === e.fromX && mercPosition(i).y === e.fromY);
      const merc = run.mercenaries[slot];
      if (!merc) {
        if (e.fromX === undefined) return;
        const from = this.at(e.fromX, e.fromY!), far = this.at(e.x, e.y), fade = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
        if (fade <= 0) return;
        // Refraction side beams and the strafe band start away from the squad; relay shots jump enemy to enemy.
        if (e.kind === 'laser') { this.line(E, from.x, from.y - 6, far.x, far.y, '#56aebb'); this.line(E, from.x, from.y - 6, far.x, far.y, e.color, 2); this.light(from.x, from.y - 6, 30, CYAN, fade, 10); }
        else if (e.kind === 'shot') { this.line(E, from.x, from.y - 6, far.x, far.y - 6, e.color); this.light(far.x, far.y - 6, 14, CYAN, fade, 6); }
        return;
      }
      const p = this.at(e.fromX!, e.fromY!), f = FRAMES[`merc_${merc.kind}`] ?? FRAMES.merc_rifle!, [mx, my] = MUZZLE[merc.kind];
      const left = Math.round(p.x - f[2] / 2), sx = slot === FLIPPED_SLOT ? left + f[2] - 1 - mx : left + mx, sy = Math.round(p.y - f[3]) + my;
      const ty = end.y - 8 * end.scale / WALL_SCALE;
      if (e.kind === 'shot') {
        const cool = merc.kind === 'tesla' || merc.kind === 'signal' || merc.kind === 'cryo', tint = cool ? (merc.kind === 'cryo' ? ICE : CYAN) : WARM;
        // v2: the gun's level shows: Lv10 a heavier tracer, Lv25 a bigger flash, Lv50 white-hot rounds and bigger hits.
        const level = run.levels[merc.kind], tier = level >= 50 ? 3 : level >= 25 ? 2 : level >= 10 ? 1 : 0;
        const a = Math.min(1, progress * 1.6), b = Math.min(1, progress * 1.6 + 0.35);
        const tracer = tier >= 3 ? '#fff6dc' : cool ? '#bff1ea' : merc.kind === 'chemist' ? '#a4dc4c' : '#ffd884';
        this.line(E, sx + (end.x - sx) * a, sy + (ty - sy) * a, sx + (end.x - sx) * b, sy + (ty - sy) * b, tracer, tier >= 1 ? 2 : 1);
        if (progress < 0.35) { this.sprite('muzzle', sx, sy + 3, tier >= 2 ? 1.4 : 1, this.glow()); this.light(sx, sy, 38 + tier * 10, tint, (1.3 + tier * 0.25) * (1 - progress / 0.35), 12); }
        if (progress > 0.45) { this.sprite(this.animFrame('hit', (progress - 0.45) * 0.3, false), end.x, ty + 3, tier >= 3 ? 1.5 : 1, this.glow()); this.light(end.x, ty, 16 + tier * 6, tint, 0.8, 6); }
      } else if (e.kind === 'flame') {
        for (let i = 0; i < 4; i++) { const k = Math.min(1, progress * 1.4 + i * 0.12); this.sprite(this.animFrame('fire', progress + i * 0.1), sx + (end.x - sx) * k, sy + (ty - sy) * k + 4, 0.5 + k * 0.5, this.glow()); }
        const k = Math.min(1, progress * 1.4); this.light(sx + (end.x - sx) * k, sy + (ty - sy) * k, 30, FIRE, 1, 8);
      } else {
        const fade = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
        if (fade <= 0) return;
        const far = this.at(e.x, e.y);
        for (const [off, color] of [[-1, '#2b6470'], [1, '#2b6470'], [0, '#56aebb']] as const) this.line(E, sx + off, sy, far.x + off, far.y, color);
        this.line(E, sx, sy, far.x, far.y, fade > 0.5 ? '#ffffff' : '#bff1ea', progress < 0.3 ? 0 : 3);
        for (let i = 1; i < 6; i++) { const k = i / 6; this.sprite(this.animFrame('zap', progress + i * 0.07), sx + (far.x - sx) * k, sy + (far.y - sy) * k + 4, 1, this.glow()); }
        for (let i = 0; i < 5; i++) { const k = i / 4; this.light(sx + (far.x - sx) * k, sy + (far.y - sy) * k, 44, CYAN, 1.3 * fade, 10); }
      }
    } else if (e.kind === 'blast') {
      const fire = e.color === '#e6764b';
      const ring = projectedCircle(e.x, e.y, e.radius * (0.4 + progress * 0.6), this.view);
      ring.forEach((p, i) => { if (i % 2 === 0) this.dot(E, p.x * PX, p.y * PX, progress < 0.5 ? '#ffd884' : '#87372f'); });
      const across = (this.at(e.x, e.y + e.radius).x - this.at(e.x, e.y - e.radius).x);
      this.sprite(this.animFrame('explosion', progress * 0.5, false), end.x, end.y + across * 0.25, Math.max(0.6, across / 25), this.glow());
      if (ANIMS.smoke && progress > 0.15) this.sprite(this.animFrame('smoke', (progress - 0.15) * 0.95, false), end.x, end.y + across * 0.1, Math.max(0.6, across / 27), this.lit());
      this.light(end.x, end.y - across * 0.2, across * 1.4 + 24, fire ? FIRE : [1, 0.7, 0.35], 1.5 * (1 - progress) ** 1.5, 18);
    } else if (e.kind === 'kill') {
      const art = ENEMY_ART[e.enemy ?? ''] ?? ENEMY_ART.walker!, death = `${art.anim}_death`;
      if (ANIMS[death]) this.sprite(this.animFrame(death, progress * 0.5, false), end.x, end.y + 1, end.scale / WALL_SCALE * art.scale, this.lit());
      else this.sprite(this.animFrame('death', progress * 0.4, false), end.x, end.y + 2, Math.max(0.5, end.scale / WALL_SCALE), this.lit());
    } else if (e.kind === 'hit' && ANIMS.blood) {
      const s = Math.max(0.6, end.scale / WALL_SCALE);
      this.sprite(this.animFrame('blood', progress * 0.22, false), end.x, end.y - 8 * s, s, this.lit());
    }
  }

  private aim(run: DefenseRun, aim: Aim) {
    const skill = run.skills[aim.slot]; if (!skill) return;
    const def = SKILLS[skill.id], color = aim.valid ? '#ffd884' : '#ee9d4f', r = def.radius * run.skillRange, O = this.c.overlay;
    const pulse = 0.65 + 0.35 * Math.sin(this.realTime * 10);
    O.globalAlpha = pulse;
    if (def.shape === 'band') {
      // The strafe sweeps the whole road between two depths.
      for (const depth of [aim.x - r, aim.x + r]) { const a = this.at(depth, 65), b = this.at(depth, 390); this.line(O, a.x, a.y, b.x, b.y, color, 2); }
    } else if (def.shape === 'beam') {
      const origin = mercPosition(aim.slot), dx = aim.x - origin.x, dy = aim.y - origin.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const corners = [[origin.x - uy * r, origin.y + ux * r], [origin.x + ux * 1100 - uy * r, origin.y + uy * 1100 + ux * r], [origin.x + ux * 1100 + uy * r, origin.y + uy * 1100 - ux * r], [origin.x + uy * r, origin.y - ux * r]] as const;
      const pts = corners.map(([x, y]) => this.at(x, y));
      for (let i = 0; i < 4; i++) { const a = pts[i]!, b = pts[(i + 1) % 4]!; this.line(O, a.x, a.y, b.x, b.y, color, 2); }
    } else {
      const ring = projectedCircle(aim.x, aim.y, r, this.view);
      ring.forEach((p, i) => { if ((i + Math.floor(this.realTime * 12)) % 2 === 0) this.dot(O, p.x * PX, p.y * PX, color); });
    }
    O.globalAlpha = 1;
    const p = this.at(aim.x, aim.y);
    this.line(O, p.x - 4, p.y, p.x - 2, p.y, color); this.line(O, p.x + 2, p.y, p.x + 4, p.y, color);
    this.line(O, p.x, p.y - 4, p.x, p.y - 2, color); this.line(O, p.x, p.y + 2, p.x, p.y + 4, color);
    if (aim.valid) this.light(p.x, p.y, 30, [1, 0.85, 0.5], 0.5, 10);
  }
}
