import type Phaser from 'phaser';
import { SLING, WORLD } from '../config/Tuning.ts';
import { INK, ROSE, ROSE_BROWN, SCENERY } from './Palette.ts';

const LEFT = -3000, RIGHT = 7000;

/*
 * Everything here is static, so it is drawn once into textures and shown as images / tile sprites.
 * (Phaser re-tessellates Graphics shapes on every frame; as Graphics this backdrop cost more to draw
 * than all the blocks and partners together.)
 */

/** Hill bands repeat every HILL_TILE world px; they are baked at half resolution and drawn at 2×. */
const HILL_TILE = 4096;
const HILL_SCALE = 0.5;

/** Bake a Graphics drawing into a texture once (kept across level restarts). */
function bake(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, Math.ceil(width), Math.ceil(height));
  g.destroy();
  return key;
}

/**
 * One parallax hill band. The two waves use a whole number of cycles per tile so the tile repeats
 * seamlessly; `wavelength` is the approximate width of one hill.
 */
function hillLayer(scene: Phaser.Scene, name: string, color: number, baseY: number, amplitude: number, wavelength: number, phase: number, scroll: number, depth: number): void {
  const cycles = Math.max(1, Math.round(HILL_TILE / (2 * Math.PI * wavelength)));
  const ripples = Math.max(1, Math.round(HILL_TILE / (2 * Math.PI * wavelength * 0.37)));
  const heightAt = (x: number) => amplitude * (0.55 + 0.45 * Math.sin((2 * Math.PI * cycles * x) / HILL_TILE + phase))
    + amplitude * 0.25 * Math.sin((2 * Math.PI * ripples * x) / HILL_TILE + phase * 2);
  const top = baseY - amplitude * 1.3;
  const bottom = WORLD.groundY + 30;
  const key = bake(scene, `tl004-hill-${name}`, HILL_TILE * HILL_SCALE, (bottom - top) * HILL_SCALE, (g) => {
    const points = [{ x: 0, y: (bottom - top) * HILL_SCALE }];
    for (let x = 0; x <= HILL_TILE; x += 16) points.push({ x: x * HILL_SCALE, y: (baseY - heightAt(x) - top) * HILL_SCALE });
    points.push({ x: HILL_TILE * HILL_SCALE, y: (bottom - top) * HILL_SCALE });
    g.fillStyle(color, 1).fillPoints(points, true);
  });
  scene.add.tileSprite(LEFT, top, RIGHT - LEFT, bottom - top, key).setOrigin(0).setTileScale(1 / HILL_SCALE).setScrollFactor(scroll, 1).setDepth(depth);
}

/** Grass lip, dirt pebbles and the ink ground line, baked as one repeating strip. */
const GROUND_TILE = 1024;
const GROUND_TOP = WORLD.groundY - 30;
const GROUND_STRIP = 180;

function ground(scene: Phaser.Scene): void {
  const key = bake(scene, 'tl004-ground', GROUND_TILE, GROUND_STRIP, (g) => {
    const y = (worldY: number) => worldY - GROUND_TOP;
    g.fillStyle(SCENERY.dirt, 1).fillRect(0, y(WORLD.groundY), GROUND_TILE, GROUND_STRIP);
    g.fillStyle(SCENERY.dirtDark, 0.5);
    for (let i = 0; i < 5; i++) {
      const x = i * (GROUND_TILE / 5) + ((i * 37) % 90);
      g.fillEllipse(x, y(WORLD.groundY + 70 + ((i * 29) % 60)), 46, 14);
    }
    g.fillStyle(SCENERY.grass, 1).fillRect(0, y(WORLD.groundY - 6), GROUND_TILE, 30);
    g.fillStyle(SCENERY.grassDark, 1);
    const blades = 40, step = GROUND_TILE / blades;
    for (let i = 0; i < blades; i++) {
      const x = i * step;
      g.fillTriangle(x, y(WORLD.groundY - 4), x + 9, y(WORLD.groundY - 18 - ((i * 7) % 9)), x + 18, y(WORLD.groundY - 4));
    }
    g.lineStyle(4, INK, 0.9).lineBetween(0, y(WORLD.groundY + 24), GROUND_TILE, y(WORLD.groundY + 24));
  });
  scene.add.rectangle(LEFT, GROUND_TOP + GROUND_STRIP - 2, RIGHT - LEFT, 2400, SCENERY.dirt).setOrigin(0).setDepth(-10);
  scene.add.tileSprite(LEFT, GROUND_TOP, RIGHT - LEFT, GROUND_STRIP, key).setOrigin(0).setDepth(-10);
}

function cloud(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Image {
  const s = size, left = 95 * s + 2, up = 69 * s + 2;
  const key = bake(scene, `tl004-cloud-${size}`, 180 * s + 4, 97 * s + 4, (g) => {
    g.fillStyle(SCENERY.cloud, 1);
    g.fillEllipse(left, up, 160 * s, 56 * s);
    g.fillEllipse(left - 50 * s, up - 18 * s, 90 * s, 70 * s);
    g.fillEllipse(left + 30 * s, up - 26 * s, 110 * s, 86 * s);
  });
  const image = scene.add.image(x, y, key).setScrollFactor(0.15, 0.6).setDepth(-50).setAlpha(0.9);
  return image.setOrigin(left / image.width, up / image.height);
}

/** Static storybook backdrop: clouds, three parallax hill bands, ground with grass lip. */
export function buildScenery(scene: Phaser.Scene): Phaser.GameObjects.Image[] {
  const clouds = [cloud(scene, 300, 180, 1.1), cloud(scene, 1300, 120, 0.8), cloud(scene, 2300, 220, 1.3), cloud(scene, 3300, 150, 0.9), cloud(scene, -700, 200, 1)];
  hillLayer(scene, 'far', SCENERY.hillFar, WORLD.groundY - 90, 260, 520, 0.4, 0.3, -40);
  hillLayer(scene, 'mid', SCENERY.hillMid, WORLD.groundY - 40, 170, 360, 1.7, 0.55, -30);
  hillLayer(scene, 'near', SCENERY.hillNear, WORLD.groundY + 10, 90, 240, 2.9, 0.8, -20);
  ground(scene);
  return clouds;
}

export interface SlingParts {
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  /** Where the bands attach on the back and front prongs. */
  backTip: { x: number; y: number };
  frontTip: { x: number; y: number };
}

/** Area around the sling that its two baked layers cover (world px). */
const SLING_BOX = { x: SLING.x - 50, y: SLING.y - 60, w: 100, h: WORLD.groundY - SLING.y + 76 };

/** Wooden Y-slingshot baked as two layers so the serpentela sits between the prongs. */
export function buildSling(scene: Phaser.Scene): SlingParts {
  const baseX = SLING.x - SLING_BOX.x, groundY = WORLD.groundY - SLING_BOX.y;
  const slingY = SLING.y - SLING_BOX.y;
  const forkY = slingY + 70;
  const wood = 0xb67d52, woodDark = 0x8a5a3a;
  const backKey = bake(scene, 'tl004-sling-back', SLING_BOX.w, SLING_BOX.h, (back) => {
    back.fillStyle(woodDark, 1).fillPoints([{ x: baseX - 10, y: forkY + 20 }, { x: baseX + 4, y: forkY + 20 }, { x: baseX + 34, y: slingY - 40 }, { x: baseX + 18, y: slingY - 46 }], true);
    back.lineStyle(4, INK, 1).strokePoints([{ x: baseX - 10, y: forkY + 20 }, { x: baseX + 4, y: forkY + 20 }, { x: baseX + 34, y: slingY - 40 }, { x: baseX + 18, y: slingY - 46 }], true, true);
    back.fillStyle(ROSE_BROWN, 1).fillCircle(baseX + 26, slingY - 40, 8);
  });
  const frontKey = bake(scene, 'tl004-sling-front', SLING_BOX.w, SLING_BOX.h, (front) => {
    // trunk
    front.fillStyle(wood, 1).fillRoundedRect(baseX - 16, forkY, 32, groundY - forkY + 6, 10);
    front.fillStyle(woodDark, 0.6).fillRoundedRect(baseX + 2, forkY + 10, 8, groundY - forkY - 16, 4);
    front.lineStyle(4, INK, 1).strokeRoundedRect(baseX - 16, forkY, 32, groundY - forkY + 6, 10);
    // front prong
    front.fillStyle(wood, 1).fillPoints([{ x: baseX - 4, y: forkY + 22 }, { x: baseX + 10, y: forkY + 22 }, { x: baseX - 22, y: slingY - 44 }, { x: baseX - 38, y: slingY - 38 }], true);
    front.lineStyle(4, INK, 1).strokePoints([{ x: baseX - 4, y: forkY + 22 }, { x: baseX + 10, y: forkY + 22 }, { x: baseX - 22, y: slingY - 44 }, { x: baseX - 38, y: slingY - 38 }], true, true);
    // band wrap
    front.fillStyle(ROSE, 1).fillCircle(baseX - 30, slingY - 40, 8);
    front.lineStyle(3, INK, 1).strokeCircle(baseX - 30, slingY - 40, 8);
  });
  const back = scene.add.image(SLING_BOX.x, SLING_BOX.y, backKey).setOrigin(0).setDepth(5);
  const front = scene.add.image(SLING_BOX.x, SLING_BOX.y, frontKey).setOrigin(0).setDepth(40);
  return { back, front, backTip: { x: SLING.x + 26, y: SLING.y - 40 }, frontTip: { x: SLING.x - 30, y: SLING.y - 40 } };
}

/** A straight band segment as a stretched 1×1 white texture (cheaper than redrawing a Graphics line). */
export function bandSegment(scene: Phaser.Scene, color: number, alpha: number, depth: number): Phaser.GameObjects.Image {
  const key = bake(scene, 'tl004-pixel', 2, 2, (g) => g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2));
  return scene.add.image(0, 0, key).setOrigin(0, 0.5).setTint(color).setAlpha(alpha).setDepth(depth);
}

/** Point a band segment from (x1, y1) to (x2, y2) with the given thickness. */
export function placeSegment(segment: Phaser.GameObjects.Image, x1: number, y1: number, x2: number, y2: number, thickness: number): void {
  segment.setPosition(x1, y1).setRotation(Math.atan2(y2 - y1, x2 - x1)).setDisplaySize(Math.hypot(x2 - x1, y2 - y1), thickness);
}
