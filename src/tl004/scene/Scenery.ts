import type Phaser from 'phaser';
import { SLING, WORLD } from '../config/Tuning.ts';
import { INK, ROSE, ROSE_BROWN, SCENERY } from './Palette.ts';

const LEFT = -3000, RIGHT = 7000;

function hillLayer(scene: Phaser.Scene, color: number, baseY: number, amplitude: number, wavelength: number, phase: number, scroll: number, depth: number): void {
  const g = scene.add.graphics().setScrollFactor(scroll, 1).setDepth(depth);
  const points: { x: number; y: number }[] = [{ x: LEFT, y: WORLD.groundY + 400 }];
  for (let x = LEFT; x <= RIGHT; x += 40) {
    const y = baseY - amplitude * (0.55 + 0.45 * Math.sin(x / wavelength + phase)) - amplitude * 0.25 * Math.sin(x / (wavelength * 0.37) + phase * 2);
    points.push({ x, y });
  }
  points.push({ x: RIGHT, y: WORLD.groundY + 400 });
  g.fillStyle(color, 1).fillPoints(points, true);
}

function cloud(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y }).setScrollFactor(0.15, 0.6).setDepth(-50);
  g.fillStyle(SCENERY.cloud, 0.9);
  g.fillEllipse(0, 0, 160 * size, 56 * size);
  g.fillEllipse(-50 * size, -18 * size, 90 * size, 70 * size);
  g.fillEllipse(30 * size, -26 * size, 110 * size, 86 * size);
  return g;
}

/** Static storybook backdrop: clouds, three parallax hill bands, ground with grass lip. */
export function buildScenery(scene: Phaser.Scene): Phaser.GameObjects.Graphics[] {
  const clouds = [cloud(scene, 300, 180, 1.1), cloud(scene, 1300, 120, 0.8), cloud(scene, 2300, 220, 1.3), cloud(scene, 3300, 150, 0.9), cloud(scene, -700, 200, 1)];
  hillLayer(scene, SCENERY.hillFar, WORLD.groundY - 90, 260, 520, 0.4, 0.3, -40);
  hillLayer(scene, SCENERY.hillMid, WORLD.groundY - 40, 170, 360, 1.7, 0.55, -30);
  hillLayer(scene, SCENERY.hillNear, WORLD.groundY + 10, 90, 240, 2.9, 0.8, -20);
  const ground = scene.add.graphics().setDepth(-10);
  ground.fillStyle(SCENERY.dirt, 1).fillRect(LEFT, WORLD.groundY, RIGHT - LEFT, 2400);
  ground.fillStyle(SCENERY.dirtDark, 0.5);
  for (let x = LEFT; x < RIGHT; x += 190) ground.fillEllipse(x + ((x * 7) % 90), WORLD.groundY + 70 + ((x * 13) % 60), 46, 14);
  ground.fillStyle(SCENERY.grass, 1).fillRect(LEFT, WORLD.groundY - 6, RIGHT - LEFT, 30);
  ground.fillStyle(SCENERY.grassDark, 1);
  for (let x = LEFT; x < RIGHT; x += 26) ground.fillTriangle(x, WORLD.groundY - 4, x + 9, WORLD.groundY - 18 - ((x * 3) % 9), x + 18, WORLD.groundY - 4);
  ground.lineStyle(4, INK, 0.9).lineBetween(LEFT, WORLD.groundY + 24, RIGHT, WORLD.groundY + 24);
  return clouds;
}

export interface SlingParts {
  back: Phaser.GameObjects.Graphics;
  front: Phaser.GameObjects.Graphics;
  /** Where the bands attach on the back and front prongs. */
  backTip: { x: number; y: number };
  frontTip: { x: number; y: number };
}

/** Wooden Y-slingshot drawn as two layers so the serpentela sits between the prongs. */
export function buildSling(scene: Phaser.Scene): SlingParts {
  const baseX = SLING.x, groundY = WORLD.groundY;
  const forkY = SLING.y + 70;
  const back = scene.add.graphics().setDepth(5);
  const front = scene.add.graphics().setDepth(40);
  const wood = 0xb67d52, woodDark = 0x8a5a3a;
  // trunk (front layer)
  front.fillStyle(wood, 1).fillRoundedRect(baseX - 16, forkY, 32, groundY - forkY + 6, 10);
  front.fillStyle(woodDark, 0.6).fillRoundedRect(baseX + 2, forkY + 10, 8, groundY - forkY - 16, 4);
  front.lineStyle(4, INK, 1).strokeRoundedRect(baseX - 16, forkY, 32, groundY - forkY + 6, 10);
  // back prong
  back.fillStyle(woodDark, 1).fillPoints([{ x: baseX - 10, y: forkY + 20 }, { x: baseX + 4, y: forkY + 20 }, { x: baseX + 34, y: SLING.y - 40 }, { x: baseX + 18, y: SLING.y - 46 }], true);
  back.lineStyle(4, INK, 1).strokePoints([{ x: baseX - 10, y: forkY + 20 }, { x: baseX + 4, y: forkY + 20 }, { x: baseX + 34, y: SLING.y - 40 }, { x: baseX + 18, y: SLING.y - 46 }], true, true);
  // front prong
  front.fillStyle(wood, 1).fillPoints([{ x: baseX - 4, y: forkY + 22 }, { x: baseX + 10, y: forkY + 22 }, { x: baseX - 22, y: SLING.y - 44 }, { x: baseX - 38, y: SLING.y - 38 }], true);
  front.lineStyle(4, INK, 1).strokePoints([{ x: baseX - 4, y: forkY + 22 }, { x: baseX + 10, y: forkY + 22 }, { x: baseX - 22, y: SLING.y - 44 }, { x: baseX - 38, y: SLING.y - 38 }], true, true);
  // band wraps
  back.fillStyle(ROSE_BROWN, 1).fillCircle(baseX + 26, SLING.y - 40, 8);
  front.fillStyle(ROSE, 1).fillCircle(baseX - 30, SLING.y - 40, 8);
  front.lineStyle(3, INK, 1).strokeCircle(baseX - 30, SLING.y - 40, 8);
  return { back, front, backTip: { x: baseX + 26, y: SLING.y - 40 }, frontTip: { x: baseX - 30, y: SLING.y - 40 } };
}
