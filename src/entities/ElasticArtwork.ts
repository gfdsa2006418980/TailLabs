import Phaser from 'phaser';
import type { SerpentelaDefinition } from '../data/serpentelas';
import { SERPENTELA_SCALE } from '../data/serpentelas';
import { LocalElasticMesh } from '../systems/LocalElasticMesh';

const PADDING = 4;

/** A temporary canvas mesh deforms only the source pixels near an actual contact. */
export class ElasticArtwork {
  private readonly scene: Phaser.Scene;
  private readonly definition: SerpentelaDefinition;
  private readonly image: Phaser.GameObjects.Image;
  private readonly mesh: LocalElasticMesh;
  private readonly source: CanvasImageSource;
  private texture?: Phaser.Textures.CanvasTexture;
  private readonly textureKey: string;

  constructor(scene: Phaser.Scene, definition: SerpentelaDefinition, ownerId: number, parent: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.definition = definition;
    this.textureKey = `elastic-${ownerId}`;
    this.source = scene.textures.get(definition.texture).getSourceImage() as CanvasImageSource;
    this.mesh = new LocalElasticMesh(definition.width, definition.height);
    this.image = scene.add.image(-definition.center.x * SERPENTELA_SCALE, -definition.center.y * SERPENTELA_SCALE, definition.texture)
      .setOrigin(0, 0).setScale(SERPENTELA_SCALE);
    parent.add(this.image);
  }

  get isActive(): boolean { return this.mesh.isActive; }

  impact(x: number, y: number, normalX: number, normalY: number, speed: number, now: number): void {
    this.mesh.impact(x, y, normalX, normalY, speed, now);
  }

  update(delta: number): void {
    if (delta <= 0) return;
    if (!this.mesh.update(delta)) return;
    if (!this.mesh.isActive) { this.restoreOriginal(); return; }
    if (!this.texture) {
      const texture = this.scene.textures.createCanvas(this.textureKey, this.definition.width + PADDING * 2, this.definition.height + PADDING * 2);
      if (!texture) return;
      this.texture = texture;
      this.image.setTexture(this.textureKey).setPosition(
        -(this.definition.center.x + PADDING) * SERPENTELA_SCALE,
        -(this.definition.center.y + PADDING) * SERPENTELA_SCALE,
      );
    }
    const ctx = this.texture.context;
    ctx.clearRect(0, 0, this.texture.width, this.texture.height);
    const row = this.mesh.cells + 1;
    for (let y = 0; y < this.mesh.cells; y++) {
      for (let x = 0; x < this.mesh.cells; x++) {
        const topLeft = y * row + x;
        this.drawTriangle(ctx, topLeft, topLeft + 1, topLeft + row);
        this.drawTriangle(ctx, topLeft + 1, topLeft + row + 1, topLeft + row);
      }
    }
    this.texture.refresh();
  }

  private drawTriangle(ctx: CanvasRenderingContext2D, first: number, second: number, third: number): void {
    const a = this.mesh.nodes[first];
    const b = this.mesh.nodes[second];
    const c = this.mesh.nodes[third];
    const dx1 = b.x - a.x, dy1 = b.y - a.y;
    const dx2 = c.x - a.x, dy2 = c.y - a.y;
    const sx1 = b.restX - a.restX, sy1 = b.restY - a.restY;
    const sx2 = c.restX - a.restX, sy2 = c.restY - a.restY;
    const determinant = sx1 * sy2 - sx2 * sy1;
    const m11 = (dx1 * sy2 - dx2 * sy1) / determinant;
    const m12 = (dy1 * sy2 - dy2 * sy1) / determinant;
    const m21 = (dx2 * sx1 - dx1 * sx2) / determinant;
    const m22 = (dy2 * sx1 - dy1 * sx2) / determinant;
    const offsetX = a.x + PADDING - m11 * a.restX - m21 * a.restY;
    const offsetY = a.y + PADDING - m12 * a.restX - m22 * a.restY;
    // A tiny overlap avoids antialiased cracks between triangles.
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3;
    const ax = a.x - cx, ay = a.y - cy;
    const bx = b.x - cx, by = b.y - cy;
    const cxOffset = c.x - cx, cyOffset = c.y - cy;
    const aLength = Math.hypot(ax, ay) || 1;
    const bLength = Math.hypot(bx, by) || 1;
    const cLength = Math.hypot(cxOffset, cyOffset) || 1;
    const paX = a.x + ax * 0.25 / aLength + PADDING;
    const paY = a.y + ay * 0.25 / aLength + PADDING;
    const pbX = b.x + bx * 0.25 / bLength + PADDING;
    const pbY = b.y + by * 0.25 / bLength + PADDING;
    const pcX = c.x + cxOffset * 0.25 / cLength + PADDING;
    const pcY = c.y + cyOffset * 0.25 / cLength + PADDING;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(paX, paY); ctx.lineTo(pbX, pbY); ctx.lineTo(pcX, pcY); ctx.closePath(); ctx.clip();
    ctx.setTransform(m11, m12, m21, m22, offsetX, offsetY);
    ctx.drawImage(this.source, 0, 0);
    ctx.restore();
  }

  private restoreOriginal(): void {
    if (!this.texture) return;
    this.image.setTexture(this.definition.texture).setPosition(-this.definition.center.x * SERPENTELA_SCALE, -this.definition.center.y * SERPENTELA_SCALE);
    this.texture.destroy();
    this.texture = undefined;
  }

  destroy(): void { this.restoreOriginal(); }
}
