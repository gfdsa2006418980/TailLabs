import Phaser from 'phaser';
import { Serpentela } from '../entities/Serpentela';
import { SERPENTELAS } from '../data/serpentelas';
import { SerpentelaPicker } from './SerpentelaPicker';
import { STAGE } from '../game/StageConfig';

/** Spawn collision-shaped artwork; the gallery can pin one definition for inspection. */
export class SpawnSystem {
  private held: Serpentela;
  private dropped: Serpentela[] = [];
  private orbs = new Map<number, Serpentela>();
  private readonly picker = new SerpentelaPicker(SERPENTELAS);
  private readonly pinned = SERPENTELAS.find((item) => item.id === new URLSearchParams(location.search).get('shape'));

  constructor(private readonly scene: Phaser.Scene) {
    this.held = this.create(STAGE.width / 2);
  }

  get x(): number { return this.held.x; }
  get count(): number { return this.dropped.length; }

  moveTo(x: number): void {
    this.held.moveTo(Phaser.Math.Clamp(x, 34 + this.held.leftExtent, 486 - this.held.rightExtent), STAGE.spawnY);
  }

  drop(): Serpentela {
    const previousX = this.held.x;
    const dropped = this.held;
    dropped.release();
    this.dropped.push(dropped);
    this.held = this.create(previousX);
    return dropped;
  }

  getOrb(id: number): Serpentela | undefined { return this.orbs.get(id); }

  sync(delta: number): void { this.orbs.forEach((orb) => orb.sync(delta)); }

  drawOutlines(graphics: Phaser.GameObjects.Graphics): void {
    this.orbs.forEach((orb) => orb.drawOutline(graphics));
  }

  reset(): void {
    this.held.destroy();
    this.dropped.forEach((orb) => orb.destroy());
    this.dropped = [];
    this.orbs.clear();
    this.picker.reset();
    this.held = this.create(STAGE.width / 2);
  }

  private create(x: number): Serpentela {
    const definition = this.pinned ?? this.picker.next();
    const orb = new Serpentela(this.scene, x, STAGE.spawnY, definition);
    orb.moveTo(Phaser.Math.Clamp(x, 34 + orb.leftExtent, 486 - orb.rightExtent), STAGE.spawnY);
    this.orbs.set(orb.id, orb);
    const currentName = document.querySelector('#current-shape');
    if (currentName) currentName.textContent = `${this.pinned ? '試放' : '目前'}：${definition.name}`;
    return orb;
  }
}
