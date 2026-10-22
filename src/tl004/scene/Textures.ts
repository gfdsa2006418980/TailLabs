import type Phaser from 'phaser';
import type { MaterialId } from '../config/Materials.ts';
import { CRYSTAL_SHAPE } from '../sim/Level.ts';
import { INK, MATERIAL_COLORS } from './Palette.ts';

const OUTLINE = 4;
export const CRYSTAL_PAD = 6;

/** Small deterministic random source so a block always gets the same grain and cracks. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

function drawCracks(g: Phaser.GameObjects.Graphics, w: number, h: number, random: () => number): void {
  g.lineStyle(3, INK, 0.75);
  for (let crack = 0; crack < 2; crack++) {
    let x = w * (0.3 + random() * 0.4), y = h * (0.3 + random() * 0.4);
    const points = [{ x, y }];
    const longX = w >= h;
    for (let i = 0; i < 4; i++) {
      x += (longX ? (crack ? 1 : -1) * (w * 0.12) : (random() - 0.5) * w * 0.4);
      y += (longX ? (random() - 0.5) * h * 0.5 : (crack ? 1 : -1) * (h * 0.12));
      points.push({ x: Math.max(4, Math.min(w - 4, x)), y: Math.max(4, Math.min(h - 4, y)) });
    }
    g.strokePoints(points, false);
  }
}

/** Rectangular block texture: rounded storybook shape, single ink outline, material detail. */
export function blockTexture(scene: Phaser.Scene, material: Exclude<MaterialId, 'crystal'>, w: number, h: number, cracked: boolean): string {
  const key = `tl004-${material}-${w}x${h}${cracked ? '-cracked' : ''}`;
  if (scene.textures.exists(key)) return key;
  const colors = MATERIAL_COLORS[material];
  const random = seeded(hash(key.replace('-cracked', '')));
  const g = scene.make.graphics({}, false);
  const radius = Math.min(material === 'stone' ? 14 : 7, Math.min(w, h) / 3);
  if (material === 'glass') {
    g.fillStyle(colors.base, 0.55).fillRoundedRect(0, 0, w, h, radius);
    g.lineStyle(3, colors.light, 0.85);
    const long = Math.max(w, h);
    for (let i = 0; i < 2; i++) {
      const t = 0.25 + i * 0.3;
      if (w >= h) g.lineBetween(long * t, h - 5, long * t + h * 0.6, 5);
      else g.lineBetween(5, long * t + w * 0.6, w - 5, long * t);
    }
    g.lineStyle(3, colors.dark, 0.9).strokeRoundedRect(1.5, 1.5, w - 3, h - 3, radius);
  } else {
    g.fillStyle(colors.base, 1).fillRoundedRect(0, 0, w, h, radius);
    if (material === 'wood') {
      g.lineStyle(2, colors.dark, 0.55);
      const along = w >= h;
      const lanes = Math.max(1, Math.floor((along ? h : w) / 9));
      for (let i = 1; i <= lanes; i++) {
        const offset = ((along ? h : w) / (lanes + 1)) * i;
        const start = 6 + random() * 20, end = (along ? w : h) - 6 - random() * 20;
        if (along) g.lineBetween(start, offset, end, offset + (random() - 0.5) * 3);
        else g.lineBetween(offset, start, offset + (random() - 0.5) * 3, end);
      }
      if (Math.max(w, h) > 120) {
        g.fillStyle(colors.dark, 0.6);
        const kx = along ? w * (0.25 + random() * 0.5) : w / 2, ky = along ? h / 2 : h * (0.25 + random() * 0.5);
        g.fillEllipse(kx, ky, along ? 14 : 8, along ? 8 : 14);
      }
      g.fillStyle(colors.light, 0.7).fillRoundedRect(4, 3, w - 8, Math.max(3, Math.min(6, h * 0.18)), 3);
    } else {
      g.fillStyle(colors.light, 0.8).fillRoundedRect(6, 5, w - 12, Math.max(6, h * 0.16), radius / 2);
      g.fillStyle(colors.dark, 0.45);
      for (let i = 0; i < 3; i++) g.fillEllipse(w * (0.2 + random() * 0.6), h * (0.35 + random() * 0.5), 10 + random() * 14, 6 + random() * 8);
    }
    g.lineStyle(OUTLINE, INK, 1).strokeRoundedRect(OUTLINE / 2, OUTLINE / 2, w - OUTLINE, h - OUTLINE, radius);
  }
  if (cracked) drawCracks(g, w, h, seeded(hash(key)));
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** Crystal texture laid out so CRYSTAL_SHAPE's (0,0) sits at (27 + pad, 48 + pad). */
export function crystalTexture(scene: Phaser.Scene, cracked: boolean): string {
  const key = `tl004-crystal${cracked ? '-cracked' : ''}`;
  if (scene.textures.exists(key)) return key;
  const colors = MATERIAL_COLORS.crystal;
  const ox = 27 + CRYSTAL_PAD, oy = 48 + CRYSTAL_PAD;
  const points = CRYSTAL_SHAPE.map((p) => ({ x: p.x + ox, y: p.y + oy }));
  const g = scene.make.graphics({}, false);
  g.fillStyle(colors.base, 1).fillPoints(points, true);
  g.fillStyle(colors.light, 0.85).fillPoints([points[0], points[1], { x: ox + 4, y: oy - 2 }, points[5]], true);
  g.fillStyle(colors.dark, 0.5).fillPoints([{ x: ox, y: oy + 2 }, points[2], points[3]], true);
  g.lineStyle(2, colors.dark, 0.7);
  g.lineBetween(points[0].x, points[0].y, ox, oy + 2);
  g.lineBetween(points[5].x, points[5].y, ox, oy + 2);
  g.lineBetween(points[1].x, points[1].y, ox, oy + 2);
  g.lineStyle(OUTLINE, INK, 1).strokePoints(points, true, true);
  if (cracked) {
    g.lineStyle(3, INK, 0.85);
    g.strokePoints([{ x: ox - 14, y: oy - 20 }, { x: ox - 4, y: oy - 6 }, { x: ox - 10, y: oy + 6 }, { x: ox + 2, y: oy + 22 }], false);
  }
  g.generateTexture(key, 54 + CRYSTAL_PAD * 2, 94 + CRYSTAL_PAD * 2);
  g.destroy();
  return key;
}

export function glowTexture(scene: Phaser.Scene): string {
  const key = 'tl004-glow';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  for (let r = 64; r > 0; r -= 4) g.fillStyle(0xf3c8ff, 0.035 + (64 - r) * 0.0012).fillCircle(64, 64, r);
  g.generateTexture(key, 128, 128);
  g.destroy();
  return key;
}

export function debrisTexture(scene: Phaser.Scene, material: MaterialId): string {
  const key = `tl004-debris-${material}`;
  if (scene.textures.exists(key)) return key;
  const colors = MATERIAL_COLORS[material];
  const g = scene.make.graphics({}, false);
  const shard = [{ x: 3, y: 16 }, { x: 9, y: 2 }, { x: 19, y: 7 }, { x: 15, y: 18 }];
  g.fillStyle(colors.base, material === 'glass' ? 0.75 : 1).fillPoints(shard, true);
  g.lineStyle(2, material === 'glass' ? colors.dark : INK, 1).strokePoints(shard, true, true);
  g.generateTexture(key, 22, 21);
  g.destroy();
  return key;
}

export function puffTexture(scene: Phaser.Scene): string {
  const key = 'tl004-puff';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 0.9).fillCircle(16, 16, 14);
  g.lineStyle(2, INK, 0.25).strokeCircle(16, 16, 14);
  g.generateTexture(key, 32, 32);
  g.destroy();
  return key;
}

export function sparkTexture(scene: Phaser.Scene): string {
  const key = 'tl004-spark';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1).fillPoints([{ x: 12, y: 0 }, { x: 15, y: 9 }, { x: 24, y: 12 }, { x: 15, y: 15 }, { x: 12, y: 24 }, { x: 9, y: 15 }, { x: 0, y: 12 }, { x: 9, y: 9 }], true);
  g.generateTexture(key, 24, 24);
  g.destroy();
  return key;
}
