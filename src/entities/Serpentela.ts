import Phaser from 'phaser';
import type { SerpentelaDefinition } from '../data/serpentelas';
import { SERPENTELA_SCALE } from '../data/serpentelas';
import type { StickyTarget } from '../systems/StickinessSystem';
import { SERPENTELA_PHYSICS } from '../game/PhysicsTuning';
import { compoundInertia } from '../systems/CompoundInertia';
import { ElasticArtwork } from './ElasticArtwork';
import { addSettleGlow } from './SettleGlow';
import { performancePreferences } from '../systems/PerformancePreferences';

export interface VisibilityBounds { left: number; right: number; top: number; bottom: number; }

export class Serpentela implements StickyTarget {
  readonly definition: SerpentelaDefinition;
  private readonly scene: Phaser.Scene;
  private readonly physics: Phaser.Physics.Matter.Image;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly artwork: ElasticArtwork;
  private frozenState = false;
  private grabbedState = false;
  private glow?: Phaser.GameObjects.Container;
  private glowTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, definition: SerpentelaDefinition, parent?: Phaser.GameObjects.Container, private readonly onStable?: () => void) {
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
  get isFrozen(): boolean { return this.frozenState; }
  get frozen(): boolean { return this.frozenState; }
  get grabbed(): boolean { return this.grabbedState; }
  get hasVisualActivity(): boolean { return this.artwork.isActive || !!this.glow; }
  get bounds(): MatterJS.IBound { return this.body.bounds; }
  get x(): number { return this.physics.x; }
  get leftExtent(): number { return (this.definition.center.x - this.definition.bounds.minX) * SERPENTELA_SCALE; }
  get rightExtent(): number { return (this.definition.bounds.maxX - this.definition.center.x) * SERPENTELA_SCALE; }
  get speed(): number { return Math.hypot(this.body.velocity.x, this.body.velocity.y); }
  get angularSpeed(): number { return Math.abs(this.body.angularVelocity); }

  moveTo(x: number, y: number): void { this.physics.setPosition(x, y); }

  containsPoint(x: number, y: number, padding = 0): boolean {
    if (this.scene.matter.query.point([this.body], { x, y }).length) return true;
    if (padding <= 0) return false;
    const bounds = this.body.bounds;
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dy = Math.max(bounds.min.y - y, 0, y - bounds.max.y);
    return Math.hypot(dx, dy) <= padding;
  }

  grab(): void {
    this.grabbedState = true;
    this.physics.setVelocity(0, 0).setAngularVelocity(0).setStatic(true).setCollidesWith(0);
    this.artwork.stopEffects();
    this.visual.setDepth(5);
    this.visual.parentContainer?.bringToTop(this.visual);
  }

  releaseFromRescue(): void {
    this.grabbedState = false;
    this.visual.setDepth(2);
    this.release();
  }

  setPlacementDimmed(dimmed: boolean): void { this.visual.setAlpha(dimmed ? 0.3 : 1); }

  drawRescueHighlight(graphics: Phaser.GameObjects.Graphics): void {
    const bounds = this.body.bounds;
    graphics.lineStyle(1.8, this.grabbedState ? 0x73966a : 0xc78d50, 0.85)
      .strokeEllipse((bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, bounds.max.x - bounds.min.x + 12, bounds.max.y - bounds.min.y + 12);
  }

  release(): void {
    this.physics.setStatic(false).setCollidesWith(0xffffffff).setAwake();
  }

  damp(factor: number): void {
    if (this.body.isSleeping) return;
    this.physics.setVelocity(this.body.velocity.x * factor, this.body.velocity.y * factor)
      .setAngularVelocity(this.body.angularVelocity * factor);
  }

  freeze(): void {
    if (this.frozenState) return;
    this.frozenState = true;
    this.physics.setVelocity(0, 0).setAngularVelocity(0).setStatic(true);
    this.visual.setPosition(this.body.position.x, this.body.position.y).setRotation(this.body.angle);
    this.artwork.stopEffects();
    const x = (this.definition.bounds.maxX - this.definition.center.x) * SERPENTELA_SCALE - 4;
    const y = (this.definition.bounds.minY - this.definition.center.y) * SERPENTELA_SCALE + 4;
    this.visual.add(this.scene.add.circle(x, y, 2.5, 0x73966a));
    this.flashGlow();
    this.onStable?.();
  }

  private flashGlow(): void {
    const saving = performancePreferences.powerSaving;
    const glow = addSettleGlow(this.scene, this.definition).setBlendMode(Phaser.BlendModes.ADD);
    const flash = this.scene.add.container(0, 0, [glow]).setScale(saving ? 1 : 0.96);
    this.glow = flash;
    this.visual.add(flash);
    this.glowTween = this.scene.tweens.add({
      targets: flash,
      alpha: { from: 0.95, to: 0 },
      scaleX: { from: saving ? 1 : 0.96, to: saving ? 1 : 1.1 },
      scaleY: { from: saving ? 1 : 0.96, to: saving ? 1 : 1.1 },
      duration: saving ? 180 : 340,
      ease: 'Cubic.Out',
      onComplete: () => { flash.destroy(); this.glow = undefined; this.glowTween = undefined; },
    });
  }

  impact(worldX: number, worldY: number, normalX: number, normalY: number, strength: number): void {
    // Settled pieces are static supports; deforming every support on impact
    // creates unnecessary mesh updates as the tower grows.
    if (this.frozenState || !this.visual.visible || performancePreferences.powerSaving) return;
    const dx = worldX - this.body.position.x;
    const dy = worldY - this.body.position.y;
    // Direct the contact impulse inward for either side of a collision pair.
    const sign = dx * normalX + dy * normalY > 0 ? -1 : 1;
    const cos = Math.cos(this.body.angle), sin = Math.sin(this.body.angle);
    const localX = (dx * cos + dy * sin) / SERPENTELA_SCALE + this.definition.center.x;
    const localY = (-dx * sin + dy * cos) / SERPENTELA_SCALE + this.definition.center.y;
    const nx = (normalX * cos + normalY * sin) * sign;
    const ny = (-normalX * sin + normalY * cos) * sign;
    this.artwork.impact(localX, localY, nx, ny, strength, this.scene.time.now);
  }

  sync(delta: number, view?: VisibilityBounds): void {
    if (view) {
      const bounds = this.body.bounds;
      this.visual.setVisible(bounds.max.x >= view.left && bounds.min.x <= view.right
        && bounds.max.y >= view.top && bounds.min.y <= view.bottom);
      if (!this.visual.visible && this.artwork.isActive) this.artwork.stopEffects();
    }
    if (this.frozenState && !this.artwork.isActive) return;
    const position = this.body.position;
    const angle = this.body.angle;
    if (this.visual.x !== position.x || this.visual.y !== position.y || this.visual.rotation !== angle) {
      this.visual.setPosition(position.x, position.y).setRotation(angle);
    }
    if (this.artwork.isActive) this.artwork.update(delta);
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
    this.glowTween?.remove(); this.glowTween = undefined;
    this.glow?.destroy(); this.glow = undefined;
    this.artwork.destroy();
    this.physics.destroy();
    this.visual.destroy();
  }

  applyPerformanceMode(): void { this.artwork.stopEffects(); }
}
