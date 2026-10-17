import Phaser from 'phaser';
import { TestOrb } from '../entities/TestOrb';
import { STAGE } from '../game/StageConfig';

/** Test-orb lifecycle. Weighted draws and Current/Next arrive in a later milestone. */
export class SpawnSystem {
  private held: TestOrb;
  private dropped: TestOrb[] = [];
  private orbs = new Map<number, TestOrb>();

  constructor(private readonly scene: Phaser.Scene) {
    this.held = this.create(STAGE.width / 2);
  }

  get x(): number { return this.held.x; }
  get count(): number { return this.dropped.length; }

  moveTo(x: number): void {
    this.held.moveTo(Phaser.Math.Clamp(x, STAGE.minX, STAGE.maxX), STAGE.spawnY);
  }

  drop(): TestOrb {
    const previousX = this.held.x;
    const dropped = this.held;
    dropped.release();
    this.dropped.push(dropped);
    this.held = this.create(previousX);
    return dropped;
  }

  getOrb(id: number): TestOrb | undefined { return this.orbs.get(id); }

  sync(): void { this.orbs.forEach((orb) => orb.sync()); }

  reset(): void {
    this.held.destroy();
    this.dropped.forEach((orb) => orb.destroy());
    this.dropped = [];
    this.orbs.clear();
    this.held = this.create(STAGE.width / 2);
  }

  private create(x: number): TestOrb {
    const orb = new TestOrb(this.scene, x, STAGE.spawnY);
    this.orbs.set(orb.id, orb);
    return orb;
  }
}
