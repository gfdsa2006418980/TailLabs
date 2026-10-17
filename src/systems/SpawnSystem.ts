import Phaser from 'phaser';
import { Serpentela } from '../entities/Serpentela';
import { SERPENTELAS } from '../data/serpentelas';
import type { SerpentelaDefinition } from '../data/serpentelas';
import { SerpentelaPicker } from './SerpentelaPicker';
import { DrawQueue } from './DrawQueue';
import type { StageLayout } from '../game/StageConfig';

export class SpawnSystem {
  private held?: Serpentela;
  private dropped: Serpentela[] = [];
  private orbs = new Map<number, Serpentela>();
  private readonly picker = new SerpentelaPicker(SERPENTELAS);
  private readonly pinned = SERPENTELAS.find((item) => item.id === new URLSearchParams(location.search).get('shape'));
  private queue!: DrawQueue<SerpentelaDefinition>;
  private spawnY: number;
  private lastX: number;

  constructor(private readonly scene: Phaser.Scene, private readonly parent: Phaser.GameObjects.Container, target: number, private readonly layout: StageLayout, private readonly onStable: () => void = () => undefined) {
    this.spawnY = layout.spawnY;
    this.lastX = layout.width / 2;
    this.reset(target);
  }
  get x(): number { return this.held?.x ?? this.lastX; }
  get count(): number { return this.dropped.length; }
  get next(): SerpentelaDefinition | undefined { return this.queue.next; }
  get current(): SerpentelaDefinition | undefined { return this.queue.current; }
  get pieces(): readonly Serpentela[] { return this.dropped; }
  get canRelease(): boolean {
    if (!this.held) return false;
    const held = this.held.body.bounds;
    return !this.dropped.some(({ body }) => held.min.x < body.bounds.max.x && held.max.x > body.bounds.min.x
      && held.min.y < body.bounds.max.y && held.max.y > body.bounds.min.y);
  }
  setSpawnY(y: number): void {
    if (this.spawnY === y) return;
    this.spawnY = y;
    this.held?.moveTo(this.x, y);
  }
  moveTo(x: number): void {
    if (!this.held) return;
    const nextX = Phaser.Math.Clamp(x, this.layout.safeLeft + this.held.leftExtent, this.layout.safeRight - this.held.rightExtent);
    if (nextX === this.lastX && this.held.body.position.y === this.spawnY) return;
    this.lastX = nextX;
    this.held.moveTo(this.lastX, this.spawnY);
  }
  drop(): Serpentela | undefined {
    if (!this.held || !this.canRelease) return;
    const dropped = this.held;
    dropped.release(); this.dropped.push(dropped);
    this.queue.consume(); this.held = undefined;
    if (this.queue.current) this.held = this.create(this.queue.current);
    this.updateName();
    return dropped;
  }
  getOrb(id: number): Serpentela | undefined { return this.orbs.get(id); }
  sync(delta: number): void { this.orbs.forEach((orb) => orb.sync(delta)); }
  drawOutlines(graphics: Phaser.GameObjects.Graphics): void { this.orbs.forEach((orb) => orb.drawOutline(graphics)); }
  reset(target: number): void {
    this.orbs.forEach((orb) => orb.destroy()); this.orbs.clear(); this.dropped = [];
    this.picker.reset(); this.spawnY = this.layout.spawnY; this.lastX = this.layout.width / 2;
    this.queue = new DrawQueue(() => this.pinned ?? this.picker.next(), target);
    this.held = this.queue.current ? this.create(this.queue.current) : undefined;
    this.updateName();
  }
  private create(definition: SerpentelaDefinition): Serpentela {
    const orb = new Serpentela(this.scene, this.lastX, this.spawnY, definition, this.parent, this.onStable);
    this.orbs.set(orb.id, orb);
    this.lastX = Phaser.Math.Clamp(this.lastX, this.layout.safeLeft + orb.leftExtent, this.layout.safeRight - orb.rightExtent);
    orb.moveTo(this.lastX, this.spawnY);
    return orb;
  }
  private updateName(): void {
    const label = document.querySelector('#current-shape');
    if (label) label.textContent = this.current ? `${this.pinned ? '試放' : '目前'}：${this.current.name}` : '已全部放下';
  }
}
