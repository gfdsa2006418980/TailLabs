import Phaser from 'phaser';
import { createOrbTexture } from '../entities/TestOrb';
import { SpawnSystem } from '../systems/SpawnSystem';
import { StickinessSystem } from '../systems/StickinessSystem';
import { bindControls, updateReadout } from '../ui/controls';
import { STAGE } from './StageConfig';

const INK = 0x345442;
const FONT = '"Segoe UI", "Microsoft JhengHei", sans-serif';

export class GameScene extends Phaser.Scene {
  private spawner!: SpawnSystem;
  private guide!: Phaser.GameObjects.Graphics;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastDropAt = -Infinity;
  private stickiness!: StickinessSystem;

  constructor() { super('GameScene'); }

  create(): void {
    this.lastDropAt = -Infinity;
    this.stickiness = new StickinessSystem();
    this.drawChamber();
    this.createPlatforms();
    createOrbTexture(this);
    this.spawner = new SpawnSystem(this);
    const onCollisionStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        this.stickiness.beginContact(a.id, b.id, this.time.now);
        const normal = pair.collision.normal;
        const strength = Math.abs((a.velocity.x - b.velocity.x) * normal.x
          + (a.velocity.y - b.velocity.y) * normal.y);
        this.spawner.getOrb(a.id)?.impact(normal.x, normal.y, strength);
        this.spawner.getOrb(b.id)?.impact(normal.x, normal.y, strength);
      }
    };
    const onCollisionEnd = (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => {
      for (const pair of event.pairs) this.stickiness.endContact(pair.bodyA.id, pair.bodyB.id);
    };
    this.matter.world.on('collisionstart', onCollisionStart);
    this.matter.world.on('collisionend', onCollisionEnd);
    this.guide = this.add.graphics().setDepth(0);
    this.cursors = this.input.keyboard?.createCursorKeys();
    const onMove = (pointer: Phaser.Input.Pointer) => this.spawner.moveTo(pointer.x);
    const onDrop = (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < 88 || pointer.y > 620) return;
      this.spawner.moveTo(pointer.x);
      this.drop();
    };
    const onKeyboardDrop = (event: KeyboardEvent) => {
      // Native buttons own Enter/Space when focused, preventing two drops per press.
      if (document.activeElement instanceof HTMLButtonElement) return;
      if (!event.repeat) this.drop();
    };
    this.input.on('pointermove', onMove);
    this.input.on('pointerdown', onDrop);
    this.input.keyboard?.on('keydown-SPACE', onKeyboardDrop);
    this.input.keyboard?.on('keydown-DOWN', onKeyboardDrop);
    const unbind = bindControls({
      move: (direction) => this.spawner.moveTo(this.spawner.x + direction * 28),
      drop: () => this.drop(),
      reset: () => {
        this.spawner.reset();
        this.stickiness.clear();
        this.lastDropAt = -Infinity;
        updateReadout(0, '準備好，放下第一隻');
      },
    });
    updateReadout(0, '準備好，放下第一隻');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbind();
      this.input.off('pointermove', onMove);
      this.input.off('pointerdown', onDrop);
      this.input.keyboard?.off('keydown-SPACE', onKeyboardDrop);
      this.input.keyboard?.off('keydown-DOWN', onKeyboardDrop);
      this.matter.world.off('collisionstart', onCollisionStart);
      this.matter.world.off('collisionend', onCollisionEnd);
    });
  }

  update(_time: number, delta: number): void {
    if (this.stickiness.update(this.time.now, delta)) this.refreshReadout();
    this.spawner.sync();
    const direction = Number(this.cursors?.right.isDown) - Number(this.cursors?.left.isDown);
    if (direction) this.spawner.moveTo(this.spawner.x + direction * Math.min(delta, 50) * 0.32);
    this.guide.clear().lineStyle(1, INK, 0.15);
    for (let y = STAGE.spawnY + 36; y < STAGE.platformY - 14; y += 14) {
      this.guide.lineBetween(this.spawner.x, y, this.spawner.x, y + 5);
    }
  }

  private drop(): void {
    if (this.time.now - this.lastDropAt < 220) return;
    this.lastDropAt = this.time.now;
    this.stickiness.track(this.spawner.drop());
    this.refreshReadout();
  }

  private refreshReadout(): void {
    updateReadout(this.spawner.count, `已黏住 ${this.stickiness.frozenCount} 隻`);
  }

  private createPlatforms(): void {
    this.matter.world.setBounds(30, 90, 460, 536, 32, true, true, false, true);
    // Keep the visible top fixed; extra depth below it prevents low-FPS tunnelling.
    const platform = this.matter.add.rectangle(STAGE.width / 2, STAGE.platformY + STAGE.platformDepth / 2, 280, STAGE.platformDepth, {
      isStatic: true,
      friction: 0.75,
      label: 'magic-circle-platform',
    });
    this.stickiness.addSupport(platform.id);
    const floor = this.matter.world.walls.bottom;
    if (floor) this.stickiness.addSupport(floor.id);
  }

  private drawChamber(): void {
    const art = this.add.graphics();
    art.lineStyle(1, INK, 0.07);
    for (let x = 30; x <= 490; x += 23) art.lineBetween(x, 90, x, 626);
    for (let y = 90; y <= 626; y += 23) art.lineBetween(30, y, 490, y);
    art.lineStyle(1, INK, 0.22);
    art.strokeRoundedRect(30, 90, 460, 536, 10);
    art.fillStyle(INK, 0.035).fillEllipse(260, STAGE.platformY + 10, 350, 100);
    art.lineStyle(1.5, INK, 0.4);
    art.strokeEllipse(260, STAGE.platformY + 10, 326, 78);
    art.strokeEllipse(260, STAGE.platformY + 10, 298, 59);
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6;
      art.fillStyle(INK, 0.6).fillCircle(260 + Math.cos(angle) * 155, STAGE.platformY + 10 + Math.sin(angle) * 34, 2);
    }
    art.fillStyle(INK).fillRoundedRect(120, STAGE.platformY, 280, 16, 5);
    art.fillStyle(0x76917a).fillRoundedRect(128, STAGE.platformY + 3, 264, 3, 1);
    art.fillStyle(INK, 0.1).fillRect(30, 626, 460, 1);
    const label = (x: number, y: number, text: string, size = 11, color = '#7c8b7e') =>
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: size, color });
    label(30, 23, '01 / DROP CHAMBER', 12, '#345442');
    label(30, 44, '召喚實驗室 · 測試圓球');
    art.lineStyle(1, INK, 0.2).strokeRoundedRect(386, 14, 104, 59, 6);
    label(398, 24, 'NEXT', 10);
    label(398, 43, '待接入', 12, '#98a095');
    label(222, 594, '魔 法 陣', 12, '#345442');
    label(30, 641, 'TL001 / ONE SMALL DROP AT A TIME', 9);
  }
}
