import Phaser from 'phaser';
import type { StickyTarget } from '../systems/StickinessSystem';

const TEXTURE = 'test-orb';
export const ORB_RADIUS = 24;

export function createOrbTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 });
  graphics.fillStyle(0xe29862);
  graphics.fillCircle(32, 32, ORB_RADIUS);
  graphics.lineStyle(2, 0xa85b35);
  graphics.strokeCircle(32, 32, ORB_RADIUS);
  graphics.fillStyle(0xf7c79f, 0.75);
  graphics.fillEllipse(25, 23, 12, 7);
  graphics.fillStyle(0x423b30);
  graphics.fillCircle(26, 34, 2);
  graphics.fillCircle(38, 34, 2);
  graphics.lineStyle(1.5, 0x423b30);
  graphics.beginPath();
  graphics.arc(32, 37, 3, 0, Math.PI, false);
  graphics.strokePath();
  graphics.generateTexture(TEXTURE, 64, 64);
  graphics.destroy();
}

export class TestOrb implements StickyTarget {
  private readonly scene: Phaser.Scene;
  private readonly physics: Phaser.Physics.Matter.Image;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Image;
  private squashAngle = 0;
  private lastImpactAt = -Infinity;
  private frozen = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.physics = scene.matter.add.image(x, y, TEXTURE)
      .setCircle(ORB_RADIUS)
      .setStatic(true)
      .setCollidesWith(0)
      .setVisible(false);
    this.face = scene.add.image(0, 0, TEXTURE);
    // Only this visual container deforms. The Matter collider remains a circle.
    this.visual = scene.add.container(x, y, [this.face]).setDepth(2);
  }

  get body(): MatterJS.BodyType { return this.physics.body as MatterJS.BodyType; }
  get id(): number { return this.body.id; }
  get x(): number { return this.physics.x; }
  get speed(): number { return Math.hypot(this.body.velocity.x, this.body.velocity.y); }
  get angularSpeed(): number { return Math.abs(this.body.angularVelocity); }

  moveTo(x: number, y: number): void { this.physics.setPosition(x, y); }

  release(): void {
    this.physics.setStatic(false).setCollidesWith(0xffffffff)
      .setFriction(0.55).setFrictionStatic(1).setBounce(0.12).setAwake();
  }

  damp(factor: number): void {
    if (this.body.isSleeping) return;
    this.physics.setVelocity(this.body.velocity.x * factor, this.body.velocity.y * factor)
      .setAngularVelocity(this.body.angularVelocity * factor);
  }

  freeze(): void {
    this.frozen = true;
    this.physics.setVelocity(0, 0).setAngularVelocity(0).setStatic(true);
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setScale(1);
    this.visual.add(this.scene.add.circle(17, -17, 3, 0x73966a));
  }

  impact(normalX: number, normalY: number, strength: number): void {
    if (strength < 0.65 || this.scene.time.now - this.lastImpactAt < 100) return;
    this.lastImpactAt = this.scene.time.now;
    const amount = Phaser.Math.Clamp(strength * 0.014, 0.025, 0.14) * (this.frozen ? 0.65 : 1);
    this.squashAngle = Math.atan2(normalY, normalX) - Math.PI / 2;
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setScale(1);
    this.scene.tweens.chain({
      targets: this.visual,
      tweens: [
        { scaleX: 1 + amount, scaleY: 1 / (1 + amount), duration: 65, ease: 'Sine.Out' },
        { scaleX: 1 - amount * 0.45, scaleY: 1 / (1 - amount * 0.45), duration: 100, ease: 'Sine.InOut' },
        { scaleX: 1 + amount * 0.18, scaleY: 1 / (1 + amount * 0.18), duration: 100, ease: 'Sine.InOut' },
        { scaleX: 1, scaleY: 1, duration: 150, ease: 'Sine.Out' },
      ],
    });
  }

  sync(): void {
    this.visual.setPosition(this.physics.x, this.physics.y).setRotation(this.squashAngle);
    this.face.setRotation(this.physics.rotation - this.squashAngle);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.visual);
    this.physics.destroy();
    this.visual.destroy();
  }
}
