import Phaser from 'phaser';
import type { SerpentelaDefinition } from '../data/serpentelas';
import { SERPENTELA_SCALE } from '../data/serpentelas';
import type { StickyTarget } from '../systems/StickinessSystem';
import { SERPENTELA_PHYSICS } from '../game/PhysicsTuning';
import { compoundInertia } from '../systems/CompoundInertia';
import { ElasticArtwork } from './ElasticArtwork';

export class Serpentela implements StickyTarget {
  readonly definition: SerpentelaDefinition;
  private readonly scene: Phaser.Scene;
  private readonly physics: Phaser.Physics.Matter.Image;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly artwork: ElasticArtwork;
  private frozen = false;
  hasLanded = false;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: SerpentelaDefinition, parent?: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.definition = definition;
    const vertices = definition.outline.map((p) => ({ x: p.x * SERPENTELA_SCALE, y: p.y * SERPENTELA_SCALE }));
    // Phaser includes poly-decomp: concave contours become convex compound parts.
    // Keep every part and its original position so tail/body concavities stay open.
    const body = scene.matter.add.fromVertices(x, y, vertices, {
      label: definition.id,
      ...SERPENTELA_PHYSICS,
    }, true, 0, 0);
    // Account for each convex part's distance from the compound mass centre.
    // Matter's default sum includes only each part's local inertia.
    scene.matter.body.setInertia(body, compoundInertia(body.position, body.parts.slice(1)));
    this.physics = scene.matter.add.image(x, y, definition.texture)
      .setExistingBody(body)
      .setStatic(true)
      .setCollidesWith(0)
      .setVisible(false);
    this.visual = scene.add.container(x, y).setDepth(2);
    parent?.add(this.visual);
    this.artwork = new ElasticArtwork(scene, definition, body.id, this.visual);
  }

  get body(): MatterJS.BodyType { return this.physics.body as MatterJS.BodyType; }
  get id(): number { return this.body.id; }
  get isFrozen(): boolean { return this.frozen; }
  get x(): number { return this.physics.x; }
  get leftExtent(): number { return (this.definition.center.x - this.definition.bounds.minX) * SERPENTELA_SCALE; }
  get rightExtent(): number { return (this.definition.bounds.maxX - this.definition.center.x) * SERPENTELA_SCALE; }
  get speed(): number { return Math.hypot(this.body.velocity.x, this.body.velocity.y); }
  get angularSpeed(): number { return Math.abs(this.body.angularVelocity); }

  moveTo(x: number, y: number): void { this.physics.setPosition(x, y); }

  release(): void {
    this.physics.setStatic(false).setCollidesWith(0xffffffff).setAwake();
  }

  damp(factor: number): void {
    if (this.body.isSleeping) return;
    this.physics.setVelocity(this.body.velocity.x * factor, this.body.velocity.y * factor)
      .setAngularVelocity(this.body.angularVelocity * factor);
  }

  freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    this.physics.setVelocity(0, 0).setAngularVelocity(0).setStatic(true);
    const x = (this.definition.bounds.maxX - this.definition.center.x) * SERPENTELA_SCALE - 4;
    const y = (this.definition.bounds.minY - this.definition.center.y) * SERPENTELA_SCALE + 4;
    this.visual.add(this.scene.add.circle(x, y, 2.5, 0x73966a));
  }

  impact(worldX: number, worldY: number, normalX: number, normalY: number, strength: number): void {
    const dx = worldX - this.body.position.x;
    const dy = worldY - this.body.position.y;
    // Direct the contact impulse inward for either side of a collision pair.
    const sign = dx * normalX + dy * normalY > 0 ? -1 : 1;
    const cos = Math.cos(this.body.angle), sin = Math.sin(this.body.angle);
    const localX = (dx * cos + dy * sin) / SERPENTELA_SCALE + this.definition.center.x;
    const localY = (-dx * sin + dy * cos) / SERPENTELA_SCALE + this.definition.center.y;
    const nx = (normalX * cos + normalY * sin) * sign;
    const ny = (-normalX * sin + normalY * cos) * sign;
    this.artwork.impact(localX, localY, nx, ny, strength * (this.frozen ? 0.65 : 1), this.scene.time.now);
  }

  sync(delta: number): void {
    this.visual.setPosition(this.body.position.x, this.body.position.y).setRotation(this.body.angle);
    this.artwork.update(delta);
  }

  drawOutline(graphics: Phaser.GameObjects.Graphics): void {
    const parts = this.body.parts.length > 1 ? this.body.parts.slice(1) : this.body.parts;
    graphics.lineStyle(0.6, 0x4a9b8a, 0.65);
    for (const part of parts) if (part.vertices) graphics.strokePoints(part.vertices, true);
    const angle = this.body.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    graphics.lineStyle(1.1, 0xd96c36, 0.95).beginPath();
    this.definition.outline.forEach((point, index) => {
      const localX = (point.x - this.definition.center.x) * SERPENTELA_SCALE;
      const localY = (point.y - this.definition.center.y) * SERPENTELA_SCALE;
      const x = this.body.position.x + localX * cos - localY * sin;
      const y = this.body.position.y + localX * sin + localY * cos;
      if (index === 0) graphics.moveTo(x, y); else graphics.lineTo(x, y);
    });
    graphics.closePath().strokePath();
  }

  destroy(): void {
    this.artwork.destroy();
    this.physics.destroy();
    this.visual.destroy();
  }
}
