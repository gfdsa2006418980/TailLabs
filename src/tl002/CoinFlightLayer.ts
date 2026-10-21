import { CoinFlightPool, CoinFlightSpace } from './CoinFlight';
import { RUNNER } from './RunnerModel';
import { worldCoordinateAtScale } from './RunnerDeformation';
import type { CoinPickup, RunnerModel } from './RunnerModel';

/** One bounded DOM pool, driven by Phaser's existing frame loop. Only transforms
 * change per frame; layout is read on resize/scroll, never for each flying coin. */
export class CoinFlightLayer {
  readonly pool = new CoinFlightPool();
  private readonly nodes: HTMLSpanElement[];
  private readonly body = { x: 0, y: 0 };
  private readonly target = { x: 0, y: 0 };
  private readonly start = { x: 0, y: 0 };
  private space = new CoinFlightSpace();
  private nextSpace = new CoinFlightSpace();
  private shown = 0;
  private previousText = -1;
  private previousSettled = 0;
  private pulse = 0;
  private worldScale = 1;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly root: HTMLElement, private readonly counter: HTMLElement, private readonly icon: HTMLElement,
    private readonly contacted: () => void = () => undefined) {
    this.nodes = this.pool.slots.map(() => {
      const node = document.createElement('span'); node.className = 'flying-coin'; node.hidden = true;
      node.setAttribute('aria-hidden', 'true'); root.append(node); return node;
    });
  }
  measure(canvas: HTMLCanvasElement, worldWidth: number, worldHeight: number): void {
    const shell = this.root.getBoundingClientRect(), rect = canvas.getBoundingClientRect(), icon = this.icon.getBoundingClientRect();
    this.nextSpace.measure(rect, shell, worldWidth, worldHeight);
    // Keep in-flight origins and bounce anchors attached to the same world
    // positions when a phone rotates or the browser changes size mid-pickup.
    const factor = this.nextSpace.size / this.space.size;
    for (const slot of this.pool.slots) if (slot.active) {
      this.space.remap(slot.start, this.nextSpace);
      this.space.remap(slot.body, this.nextSpace);
      slot.size *= factor;
    }
    const previous = this.space;
    this.space = this.nextSpace;
    this.nextSpace = previous;
    this.target.x = icon.left - shell.left + icon.width / 2;
    this.target.y = icon.top - shell.top + icon.height / 2;
  }
  setWorldScale(scale: number): void {
    this.worldScale = Math.max(0.5, Math.min(1, scale));
  }
  private projectWorld(x: number, y: number, out: { x: number; y: number }): void {
    this.space.project(
      worldCoordinateAtScale(x, RUNNER.playerX, this.worldScale),
      worldCoordinateAtScale(y, RUNNER.groundY, this.worldScale), out,
    );
  }
  private locateBody(model: RunnerModel): void {
    this.projectWorld(RUNNER.playerX, RUNNER.groundY + model.motor.y - 38, this.body);
  }
  collect(coin: CoinPickup, model: RunnerModel): void {
    this.locateBody(model);
    this.projectWorld(coin.x, coin.y, this.start);
    if (this.reduced) { this.pool.settled += coin.value; this.contacted(); }
    else if (!this.pool.spawn(this.start, this.body, this.space.size * this.worldScale, coin.value)) this.contacted();
  }
  update(dt: number, model: RunnerModel): void {
    this.locateBody(model);
    this.pool.advance(dt, this.body, this.target, this.contacted);
    if (this.pool.settled !== this.previousSettled) { this.pulse = 0.24; this.previousSettled = this.pool.settled; }
    this.shown += (this.pool.settled - this.shown) * Math.min(1, dt * 18);
    if (Math.abs(this.pool.settled - this.shown) < 0.02) this.shown = this.pool.settled;
    const value = Math.floor(this.shown);
    if (value !== this.previousText) { this.counter.textContent = String(value); this.previousText = value; }
    this.pulse = Math.max(0, this.pulse - dt);
    this.icon.style.transform = `scale(${1 + Math.sin(this.pulse / 0.24 * Math.PI) * 0.18})`;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i], slot = this.pool.slots[i];
      if (!slot.active) { if (!node.hidden) node.hidden = true; continue; }
      node.hidden = false;
      const pose = slot.pose;
      node.style.transform = `translate3d(${pose.x - 11}px,${pose.y - 11}px,0) rotate(${pose.rotation}deg) scale(${pose.scale})`;
      if (node.dataset.stage !== pose.stage) node.dataset.stage = pose.stage;
    }
  }
  reset(): void {
    this.pool.reset(); this.shown = 0; this.previousSettled = 0; this.pulse = 0; this.previousText = 0;
    this.counter.textContent = '0'; this.icon.style.transform = '';
    for (const node of this.nodes) node.hidden = true;
  }
  destroy(): void { this.pool.reset(); for (const node of this.nodes) node.remove(); }
}
