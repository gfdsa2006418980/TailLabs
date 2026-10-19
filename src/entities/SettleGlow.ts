import type Phaser from 'phaser';
import { SERPENTELA_SCALE, type SerpentelaDefinition } from '../data/serpentelas';

const PADDING = 12;

/** One reusable raster outline per shape instead of per-frame Graphics triangulation. */
export function addSettleGlow(scene: Phaser.Scene, definition: SerpentelaDefinition): Phaser.GameObjects.Image {
  const key = 'settle-glow-' + definition.texture;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key,
      Math.ceil(definition.width * SERPENTELA_SCALE + PADDING * 2),
      Math.ceil(definition.height * SERPENTELA_SCALE + PADDING * 2));
    if (texture) {
      const ctx = texture.context;
      ctx.beginPath();
      definition.outline.forEach((point, index) => {
        const x = point.x * SERPENTELA_SCALE + PADDING, y = point.y * SERPENTELA_SCALE + PADDING;
        if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(239,217,218,0.12)'; ctx.fill();
      ctx.strokeStyle = 'rgba(189,130,138,0.28)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,249,248,0.92)'; ctx.lineWidth = 2; ctx.stroke();
      texture.refresh();
    }
  }
  return scene.add.image(
    -definition.center.x * SERPENTELA_SCALE - PADDING,
    -definition.center.y * SERPENTELA_SCALE - PADDING, key,
  ).setOrigin(0);
}
