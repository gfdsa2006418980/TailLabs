import Phaser from 'phaser';
import { RunnerModel, RUNNER, OBSTACLES } from './RunnerModel';
import type { CoinPickup, ObstacleKind } from './RunnerModel';
import { RUNNER_ART, ATLAS_KEY, runnerFrame } from './RunnerArt';
import { RunnerSky } from './RunnerSky';
import { RHYTHM_GATE, gateJudgement } from './RunnerGate';

export interface RunnerCallbacks {
  frame(model: RunnerModel, dt: number): void;
  ended(model: RunnerModel): void;
  collected(coin: CoinPickup, model: RunnerModel): void;
  jumped(air: boolean): void;
}
interface PooledView { image: Phaser.GameObjects.Image; seen: number }
const INK = 0x3c5142;

export class RunnerScene extends Phaser.Scene {
  readonly model = new RunnerModel();
  paused = false;
  sky!: RunnerSky;
  private runner!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private skyOffset: number;
  private frameId = 0;
  private views = new Map<number, PooledView>();
  private freeViews: PooledView[] = [];
  private createdViews = 0;
  private squash = 0;
  private hitTime = 0;
  private lastJumps = 0;
  private lastLandings = 0;
  private ended = false;
  private artFrame = '';
  private samples = new Float32Array(180);
  private sampleCount = 0;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private accessibleLabel = '蛇貂逃家了遊戲區，空白鍵、上方向鍵或輕點跳躍，空中再按一次二段跳';

  constructor(private readonly callbacks: RunnerCallbacks, skyOffset = 0) {
    super('TL002Runner'); this.skyOffset = skyOffset;
  }
  preload(): void {
    for (const art of RUNNER_ART) this.load.image(`tl002-source-${art.frame}`, `${import.meta.env.BASE_URL}assets/serpentela/${art.file}`);
  }
  create(): void {
    this.makeAtlas(); this.makeObjectTextures();
    this.sky = new RunnerSky(this);
    this.model.viewportWidth = RUNNER.worldWidth;
    this.syncWorldView();
    this.shadow = this.add.ellipse(RUNNER.playerX, RUNNER.groundY + 4, 77, 10, 0x263544, 0.2).setDepth(2);
    this.runner = this.add.image(RUNNER.playerX, RUNNER.groundY, ATLAS_KEY, 'run-a').setOrigin(0.5, 112 / 128).setDepth(5);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this));
    this.game.canvas.setAttribute('aria-label', this.accessibleLabel);
    this.game.canvas.setAttribute('tabindex', '0'); this.game.canvas.setAttribute('role', 'application');
    this.game.events.emit('runner-ready');
  }

  private makeAtlas(): void {
    const texture = this.textures.createCanvas(ATLAS_KEY, 768, 128)!;
    const context = texture.getContext();
    for (let i = 0; i < RUNNER_ART.length; i++) {
      const art = RUNNER_ART[i], [left, top, right, bottom] = art.bounds;
      const width = right - left, height = bottom - top, scale = Math.min(88 / width, 84 / height);
      const source = this.textures.get(`tl002-source-${art.frame}`).getSourceImage() as CanvasImageSource;
      context.drawImage(source, left, top, width, height, i * 128 + 64 - width * scale / 2, 112 - height * scale, width * scale, height * scale);
      texture.add(art.frame, 0, i * 128, 0, 128, 128);
    }
    const x = 640;
    context.fillStyle = '#b88129'; context.beginPath(); context.arc(x + 16, 16, 12, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ffdd6e'; context.beginPath(); context.arc(x + 16, 15, 10, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#e6ae37'; context.lineWidth = 1.5; context.beginPath(); context.arc(x + 16, 15, 7, 0, Math.PI * 2); context.stroke();
    context.fillStyle = '#a86b24'; context.font = 'bold 13px sans-serif'; context.textAlign = 'center'; context.fillText('✦', x + 16, 20);
    texture.add('coin', 0, x, 0, 32, 32); texture.refresh();
    for (const art of RUNNER_ART) this.textures.remove(`tl002-source-${art.frame}`);
  }

  private makeObjectTextures(): void {
    for (const definition of OBSTACLES) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.translateCanvas(14, definition.height + 13);
      this.drawObstacle(g, definition.kind, definition.width, definition.height);
      g.generateTexture(`tl002-${definition.kind}`, definition.width + 28, definition.height + 20); g.destroy();
    }
    for (const height of [76, 100]) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x758977).fillRoundedRect(20, 10, 13, height, 3).fillRoundedRect(224, 10, 13, height, 3);
      g.fillStyle(0xc3a06b).fillRoundedRect(4, 4, 254, 15, 5);
      g.lineStyle(2, INK).strokeRoundedRect(4, 4, 254, 15, 5);
      g.fillStyle(0xf6d18b).fillRoundedRect(5, 3, 252, 5, 2);
      g.lineStyle(2, 0xf6f3d7).beginPath().moveTo(117, 11).lineTo(122, 7).lineTo(127, 11).strokePath();
      g.generateTexture(`tl002-platform-${height}`, 264, height + 18); g.destroy();
    }
    // Cached textures; opening only transforms the pooled door leaves.
    const frame = this.make.graphics({ x: 0, y: 0 });
    frame.fillStyle(0x344e43).fillRoundedRect(0, 0, 88, 15, 6)
      .fillRoundedRect(0, 0, 9, RHYTHM_GATE.height + 8, 4).fillRoundedRect(79, 0, 9, RHYTHM_GATE.height + 8, 4);
    frame.fillStyle(0x8ca88c).fillRoundedRect(15, 3, 58, 7, 3);
    frame.generateTexture('tl002-gate-frame', 88, RHYTHM_GATE.height + 8); frame.destroy();
    const leaf = this.make.graphics({ x: 0, y: 0 });
    leaf.fillStyle(0x718b75).fillRoundedRect(0, 0, 35, RHYTHM_GATE.height - 10, 3);
    leaf.lineStyle(2, 0xc3d2ad).strokeRoundedRect(4, 6, 27, RHYTHM_GATE.height - 24, 3);
    leaf.fillStyle(0xf9dc8d).fillCircle(17, 151, 5);
    leaf.lineStyle(3, 0xf5edcc).beginPath().moveTo(9, 106).lineTo(17, 99).lineTo(25, 106).strokePath();
    leaf.generateTexture('tl002-gate-leaf', 35, RHYTHM_GATE.height - 10); leaf.destroy();
  }

  private drawObstacle(g: Phaser.GameObjects.Graphics, kind: ObstacleKind, width: number, height: number): void {
    g.fillStyle(0x263c3d, 0.16).fillEllipse(width / 2, 3, width + 16, 10).lineStyle(3, INK);
    if (kind === 'box') {
      // Folded cardboard with two top flaps, a taped seam and a warm shaded side.
      g.fillStyle(0xb87843).fillRoundedRect(1, -height, width - 2, height, 4).strokeRoundedRect(1, -height, width - 2, height, 4);
      g.fillStyle(0xe2b77d).fillTriangle(3, -height + 2, width * 0.5, -height + 13, width * 0.5, -height + 2);
      g.fillStyle(0xd59d62).fillTriangle(width - 3, -height + 2, width * 0.5, -height + 13, width * 0.5, -height + 2);
      g.fillStyle(0xf0d7a6).fillRect(width * 0.46, -height + 2, 5, 21);
      g.fillStyle(0xc99160).fillRect(4, -height + 18, width - 8, 2);
    } else if (kind === 'cone') {
      // Reflective orange traffic cone and weighted rubber foot.
      g.fillStyle(0x49584e).fillRoundedRect(-2, -7, width + 4, 7, 3).lineStyle(2, INK).strokeRoundedRect(-2, -7, width + 4, 7, 3);
      g.fillStyle(0xe46f35).fillTriangle(width * 0.5, -height, 5, -8, width - 5, -8).lineStyle(3, INK);
      g.lineBetween(width * 0.5, -height, 5, -8).lineBetween(width * 0.5, -height, width - 5, -8);
      g.fillStyle(0xf8e5bd).fillTriangle(width * 0.27, -height * 0.46, width * 0.73, -height * 0.46, width * 0.82, -height * 0.28);
      g.fillStyle(0xf8e5bd).fillTriangle(width * 0.18, -height * 0.28, width * 0.82, -height * 0.28, width * 0.86, -height * 0.17);
    } else {
      // A compact roadside lamp: anchored post, curved neck and warm glowing head.
      const poleX = width * 0.39;
      g.fillStyle(0x53665a).fillRoundedRect(poleX - 5, -height + 38, 10, height - 38, 4).lineStyle(3, INK).strokeRoundedRect(poleX - 5, -height + 38, 10, height - 38, 4);
      g.fillStyle(0x738476).fillRoundedRect(poleX - 10, -9, 20, 9, 3).lineStyle(2, INK).strokeRoundedRect(poleX - 10, -9, 20, 9, 3);
      g.lineStyle(9, 0x53665a).beginPath().moveTo(poleX, -height + 44).lineTo(poleX, -height + 16).lineTo(width - 15, -height + 16).strokePath();
      g.lineStyle(3, INK).beginPath().moveTo(poleX, -height + 44).lineTo(poleX, -height + 16).lineTo(width - 15, -height + 16).strokePath();
      g.fillStyle(0x53665a).fillRoundedRect(width - 23, -height + 10, 22, 13, 4).lineStyle(2, INK).strokeRoundedRect(width - 23, -height + 10, 22, 13, 4);
      g.fillStyle(0xffdb77, 0.26).fillCircle(width - 12, -height + 27, 15);
      g.fillStyle(0xffe6a2).fillRoundedRect(width - 19, -height + 22, 14, 5, 3).lineStyle(1, 0xb88129).strokeRoundedRect(width - 19, -height + 22, 14, 5, 3);
    }
  }

  startRun(): void {
    this.model.start(); this.resetPresentation();
  }
  resetToReady(): void {
    this.model.reset(); this.resetPresentation();
  }
  private resetPresentation(): void {
    this.paused = false; this.ended = false; this.hitTime = 0; this.squash = 0;
    this.lastJumps = 0; this.lastLandings = 0; this.cameras.main.resetFX(); this.releaseViews();
  }
  setPaused(paused: boolean): void { this.paused = paused; this.model.clearInput(); }
  setAccessibleLabel(label: string): void {
    this.accessibleLabel = label;
    if (this.game?.canvas) this.game.canvas.setAttribute('aria-label', label);
  }
  setPowerSaving(enabled: boolean): void {
    this.reducedMotion = enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.runner) this.artFrame = '';
  }
  private syncWorldView(): void {
    const width = this.scale.width;
    // Keep both camera axes at the same scale so sprites, coins and scenery
    // retain their authored proportions. The world itself adapts to the
    // logical canvas width; spawn points and scenery follow that edge.
    this.cameras.main.setZoom(1, 1).setScroll(0, 0);
    this.model.viewportWidth = width;
    this.sky.resize(width);
  }
  private resize(): void { this.syncWorldView(); }
  private releaseViews(): void {
    for (const entry of this.views.values()) { entry.image.setVisible(false); this.freeViews.push(entry); }
    this.views.clear();
  }
  private show(id: number, key: string, frame: string | undefined, x: number, y: number, depth: number, originY: number): Phaser.GameObjects.Image {
    let entry = this.views.get(id);
    if (!entry) {
      entry = this.freeViews.pop();
      if (!entry) { entry = { image: this.add.image(0, 0, key, frame), seen: 0 }; this.createdViews++; }
      entry.image.setTexture(key, frame).setVisible(true).clearTint(); this.views.set(id, entry);
    }
    entry.seen = this.frameId;
    return entry.image.setPosition(x, y).setOrigin(frame ? 0.5 : 0, originY).setDepth(depth);
  }

  update(_time: number, delta: number): void {
    const begin = performance.now(), dt = Math.min(delta / 1000, 0.1), model = this.model;
    if (!this.paused) model.advance(dt);
    for (const pickup of model.pickups) this.callbacks.collected(pickup, model);
    model.pickups.length = 0;
    if (model.jumps !== this.lastJumps) {
      this.squash = -0.11; this.lastJumps = model.jumps; this.callbacks.jumped(model.motor.jumpsUsed > 1);
    }
    if (model.landings !== this.lastLandings) { this.squash = 0.14; this.lastLandings = model.landings; }
    if (model.phase === 'over' && !this.ended) {
      this.ended = true; if (!this.reducedMotion) this.cameras.main.shake(130, 0.004); this.callbacks.ended(model);
    }
    if (!this.paused) {
      this.squash *= Math.exp(-dt * 15);
      if (model.phase === 'over') this.hitTime = Math.min(0.5, this.hitTime + dt);
    }
    this.sky.update(model.elapsed + this.skyOffset, model.travel);
    this.drawWorld(); this.drawRunner(); this.callbacks.frame(model, this.paused ? 0 : dt);
    this.samples[this.sampleCount++ % this.samples.length] = performance.now() - begin;
  }

  private drawWorld(): void {
    this.frameId++;
    const width = this.model.viewportWidth;
    for (const obstacle of this.model.obstacles) {
      if (obstacle.x > width + 40) continue;
      this.show(obstacle.id, `tl002-${obstacle.kind}`, undefined, obstacle.x - 14, RUNNER.groundY + 7, 3, 1).setScale(1);
    }
    for (const platform of this.model.platforms) {
      if (platform.x > width + 40) continue;
      this.show(platform.id, `tl002-platform-${platform.height}`, undefined, platform.x - 7, RUNNER.groundY + 14, 2, 1).setScale(1);
    }
    for (const gate of this.model.gates) {
      if (gate.x > width + 100) continue;
      const opened = gate.opened ? this.reducedMotion ? 1 : Math.min(1, (this.model.elapsed - gate.openedAt!) / 0.16) : 0;
      const tint = gate.opened || (this.model.activeGate === gate && gateJudgement(gate, this.model.elapsed) === 'open')
        ? 0xc7ffb1 : 0xffffff;
      this.show(-gate.id * 3 - 1, 'tl002-gate-frame', undefined, gate.x - 8, RUNNER.groundY, 3, 1).setScale(1);
      for (let side = 0; side < 2; side++) {
        this.show(-gate.id * 3 - 2 - side, 'tl002-gate-leaf', undefined,
          gate.x + side * 35 + (side ? 1 : -1) * opened * 29, RUNNER.groundY - 1, 4, 1)
          .setScale(1 - opened * 0.85, 1).setTint(tint);
      }
    }
    for (const coin of this.model.coins) {
      if (coin.x < -30 || coin.x > width + 30) continue;
      const shimmer = this.reducedMotion ? 1 : 0.9 + Math.abs(Math.sin(this.model.elapsed * 3 + coin.id)) * 0.1;
      this.show(coin.id, ATLAS_KEY, 'coin', coin.x, coin.y, 4, 0.5).setScale(shimmer);
    }
    for (const coin of this.model.levelUpCoins) {
      if (coin.x < -30 || coin.x > width + 30) continue;
      const shimmer = this.reducedMotion ? 1 : 0.9 + Math.abs(Math.sin(this.model.elapsed * 3 + coin.id)) * 0.1;
      this.show(coin.id, ATLAS_KEY, 'coin', coin.x, coin.y, 4, 0.5).setScale(shimmer);
    }
    for (const [id, entry] of this.views) {
      if (entry.seen === this.frameId) continue;
      entry.image.setVisible(false); this.freeViews.push(entry); this.views.delete(id);
    }
  }

  private drawRunner(): void {
    const model = this.model, motor = model.motor;
    const frame = runnerFrame(model.phase === 'ready' ? 0 : model.travel, motor.grounded, motor.velocity, this.reducedMotion);
    if (frame !== this.artFrame) {
      this.runner.setFrame(frame).setFlipX(RUNNER_ART.find((art) => art.frame === frame)?.flip ?? false); this.artFrame = frame;
    }
    const bob = motor.grounded && model.phase === 'running' && !this.reducedMotion ? -Math.abs(Math.sin(model.travel * 0.07)) * 2 : 0;
    const crash = model.phase === 'over' ? this.hitTime : 0;
    this.runner.setPosition(RUNNER.playerX + crash * 36, RUNNER.groundY + motor.y + bob - Math.sin(crash * Math.PI * 2) * 17)
      .setRotation(crash ? crash * 2.4 : Phaser.Math.Clamp(motor.velocity / 7000, -0.08, 0.1)).setScale(1 + this.squash);
    const shadow = Math.max(0.35, 1 + motor.y / 300);
    this.shadow.setPosition(RUNNER.playerX, RUNNER.groundY + (motor.grounded ? motor.y : 0) + 4).setScale(shadow).setAlpha(shadow);
  }

  performanceSnapshot() {
    const length = Math.min(this.sampleCount, this.samples.length);
    const sorted = Array.from(this.samples.subarray(0, length)).sort((a, b) => a - b);
    return {
      updateP95Ms: Number((sorted[Math.floor(length * 0.95)] ?? 0).toFixed(3)),
      pooledWorldViews: this.createdViews, activeWorldViews: this.views.size,
      worldCoins: this.model.coins.length + this.model.levelUpCoins.length,
      levelUpCoins: this.model.levelUpCoins.length, sceneryBuilds: this.sky.builds,
      textures: this.textures.getTextureKeys().length,
    };
  }
  get currentArtFrame(): string { return this.artFrame; }
}
