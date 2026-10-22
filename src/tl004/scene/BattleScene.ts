import Phaser from 'phaser';
import { ATTACKER, FX, GRAVITY_PER_STEP, PHYSICS, SLING, STEP_MS, TARGET, WORLD } from '../config/Tuning.ts';
import type { MaterialId } from '../config/Materials.ts';
import { FixedStepper } from '../rules/FixedStepper.ts';
import { launchFromPull, predictPath, previewDots } from '../rules/Launch.ts';
import type { Launch, Vec } from '../rules/Launch.ts';
import { BattleSim, SLING_REST } from '../sim/BattleSim.ts';
import type { MatterKit, Piece, SimEngine, SimEvent } from '../sim/BattleSim.ts';
import type { LevelData, ShapeLibrary } from '../sim/Level.ts';
import type { Sfx } from '../audio/Sfx.ts';
import type { AbilityId } from '../config/Abilities.ts';
import { CameraRig } from './CameraRig.ts';
import type { Rect } from './CameraRig.ts';
import { CREAM, INK, ROSE, ROSE_BROWN } from './Palette.ts';
import { buildScenery, buildSling } from './Scenery.ts';
import type { SlingParts } from './Scenery.ts';
import { blockTexture, debrisTexture, puffTexture, sparkTexture } from './Textures.ts';

type BlockMaterial = Exclude<MaterialId, 'target'>;

export interface BattleResult { won: boolean; stars: number; score: number; bonuses: number[] }

export interface BattleHooks {
  sfx: Sfx;
  reducedMotion(): boolean;
  onScore(total: number): void;
  /** Partner ids still to fire, sling first. */
  onShots(ids: string[]): void;
  onSkipAvailable(available: boolean): void;
  /**
   * The ability the player can trigger right now by tapping, or undefined.
   * `hurry` is true once the partner has touched something and the short after-contact window is running.
   */
  onAbilityAvailable(ability: AbilityId | undefined, hurry: boolean): void;
  onResult(result: BattleResult): void;
}

/** Display data for a partner texture (from attackers.generated.json). */
export interface AttackerArt { name: string; textureScale: number }

export interface BattleConfig {
  /** Every level (textures for all of them load up front; they are small). The first one is shown at boot. */
  levels: readonly LevelData[];
  shapes: ShapeLibrary;
  attackerArt: ReadonlyMap<string, AttackerArt>;
  attackerUrl(id: string): string;
  targetUrl(id: string): string;
}

const BLOCK_DEBRIS: BlockMaterial[] = ['wood', 'stone', 'glass'];
const attackerKey = (id: string) => `atk-${id}`;
const targetKey = (id: string) => `tgt-${id}`;

function towerBounds(pieces: Iterable<Piece>): Rect {
  const rect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const piece of pieces) {
    if (piece.kind === 'attacker') continue;
    rect.minX = Math.min(rect.minX, piece.body.bounds.min.x); rect.maxX = Math.max(rect.maxX, piece.body.bounds.max.x);
    rect.minY = Math.min(rect.minY, piece.body.bounds.min.y); rect.maxY = Math.max(rect.maxY, piece.body.bounds.max.y);
  }
  return rect;
}

/** Rendering, input, camera and effects around one BattleSim. Never changes rules or physics timing. */
export class BattleScene extends Phaser.Scene {
  private readonly hooks: BattleHooks;
  private readonly config: BattleConfig;
  /** Level being played; create() builds it. */
  private level: LevelData;
  private sim!: BattleSim;
  private rig!: CameraRig;
  private stepper!: FixedStepper;
  private sling!: SlingParts;
  private bandBack!: Phaser.GameObjects.Graphics;
  private bandFront!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private trails!: Phaser.GameObjects.Graphics;
  private slingSprite!: Phaser.GameObjects.Image;
  private queue: Phaser.GameObjects.Image[] = [];
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private debris = new Map<BlockMaterial, Phaser.GameObjects.Particles.ParticleEmitter>();
  private puffs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private water!: Phaser.GameObjects.Particles.ParticleEmitter;
  private started = false;
  /** create() has finished; begin() before that is remembered and run at the end of create(). */
  private created = false;
  private pendingBegin = false;
  private paused = false;
  private slingReady = false;
  private hitStopUntil = 0;
  private slowUntil = 0;
  private slowUsedThisShot = false;
  private aim: Launch | undefined;
  private aimPointer: number | undefined;
  private keyAim = { angle: -0.6, power: 0.85 };
  private lastStretchBucket = -1;
  private recoil: { from: Vec; start: number } | undefined;
  private currentTrail: Vec[] = [];
  private lastTrail: Vec[] = [];
  private bonuses: number[] = [];
  private reported: { score: number; shots: string; skip: boolean; ability: AbilityId | undefined; hurry: boolean } = { score: -1, shots: '', skip: false, ability: undefined, hurry: false };
  private resultTimer: Phaser.Time.TimerEvent | undefined;

  constructor(hooks: BattleHooks, config: BattleConfig) {
    super({ key: 'battle' });
    this.hooks = hooks;
    this.config = config;
    this.level = config.levels[0];
  }

  preload(): void {
    const attackers = new Set(this.config.levels.flatMap((level) => level.shots));
    const targets = new Set(this.config.levels.flatMap((level) => level.blocks.flatMap((block) => (block.material === 'target' && block.shape ? [block.shape] : []))));
    for (const id of attackers) if (!this.textures.exists(attackerKey(id))) this.load.image(attackerKey(id), this.config.attackerUrl(id));
    for (const id of targets) if (!this.textures.exists(targetKey(id))) this.load.image(targetKey(id), this.config.targetUrl(id));
  }

  create(): void {
    this.sprites = new Map(); this.debris = new Map(); this.queue = [];
    this.started = false; this.paused = false; this.slingReady = false; this.aim = undefined; this.aimPointer = undefined;
    this.hitStopUntil = 0; this.slowUntil = 0; this.slowUsedThisShot = false; this.recoil = undefined;
    this.currentTrail = []; this.lastTrail = []; this.bonuses = []; this.reported = { score: -1, shots: '', skip: false, ability: undefined, hurry: false };
    this.stepper = new FixedStepper(STEP_MS, PHYSICS.maxStepsPerFrame);

    buildScenery(this);
    this.sling = buildSling(this);
    this.bandBack = this.add.graphics().setDepth(6);
    this.bandFront = this.add.graphics().setDepth(30);
    this.trails = this.add.graphics().setDepth(8);
    this.preview = this.add.graphics().setDepth(45);
    for (const material of BLOCK_DEBRIS) {
      this.debris.set(material, this.add.particles(0, 0, debrisTexture(this, material), {
        emitting: false, speed: { min: 160, max: 520 }, angle: { min: 195, max: 345 }, gravityY: 1300,
        lifespan: { min: 650, max: 1100 }, rotate: { start: 0, end: 540 }, scale: { start: 1.2, end: 0.7 }, alpha: { start: 1, end: 0 },
      }).setDepth(50));
    }
    this.puffs = this.add.particles(0, 0, puffTexture(this), {
      emitting: false, speed: { min: 30, max: 120 }, lifespan: 600, scale: { start: 1.3, end: 2.4 }, alpha: { start: 0.75, end: 0 },
    }).setDepth(49);
    this.sparks = this.add.particles(0, 0, sparkTexture(this), {
      emitting: false, speed: { min: 120, max: 380 }, lifespan: 520, scale: { start: 1.1, end: 0 }, tint: [0xffffff, 0xffe9a8, 0xffd9e0],
    }).setDepth(52);
    this.water = this.add.particles(0, 0, sparkTexture(this), {
      emitting: false, speed: { min: 160, max: 480 }, angle: { min: 200, max: 340 }, gravityY: 1400, lifespan: { min: 500, max: 800 },
      scale: { start: 1.5, end: 0.4 }, alpha: { start: 0.95, end: 0 }, tint: [0x7fd0ff, 0xbfeaff, 0x3a9ad9, 0xffffff],
    }).setDepth(51);

    const Matter = (Phaser.Physics.Matter as unknown as { Matter: MatterKit }).Matter;
    this.matter.world.autoUpdate = false;
    this.sim = new BattleSim(Matter, this.matter.world.engine as unknown as SimEngine, this.level, this.config.shapes);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.created = false; this.sim.destroy(); });

    const first = this.level.shots[0];
    this.slingSprite = this.add.image(SLING_REST.x, SLING_REST.y, attackerKey(first)).setDepth(20).setScale(this.attackerScale(first)).setVisible(false);
    this.syncSprites();
    this.rig = new CameraRig(this.cameras.main, towerBounds(this.sim.pieces.values()));
    this.rig.mode = 'tower';
    this.refreshQueue();
    this.bindInput();
    this.report();
    this.created = true;
    if (this.pendingBegin) this.begin();
  }

  /** Called when the player presses Start (or after a restart): tower fly-by, then the sling. */
  begin(): void {
    if (!this.created) { this.pendingBegin = true; return; }
    this.pendingBegin = false;
    this.started = true;
    this.time.delayedCall(900, () => { if (this.rig.mode === 'tower' && this.sim.phase === 'aiming') this.toAim(); });
  }

  /** Switch to another level and start it (fly-by, then the sling). */
  startLevel(level: LevelData): void {
    this.level = level;
    this.restartLevel();
  }

  /**
   * Restart the current level and start it as soon as the new create() finishes. While a create() is still
   * pending (boot or a restart in progress) it only asks for the start: that create() reads `this.level`.
   */
  restartLevel(): void {
    this.resultTimer?.remove();
    this.resultTimer = undefined;
    this.pendingBegin = true;
    if (!this.created) return;
    this.created = false;
    this.scene.restart();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.cancelAim();
  }

  next(): void { this.handle(this.sim.requestNext()); }

  /** Tap during flight (also the HUD hint button). */
  useAbility(): void {
    if (!this.started || this.paused) return;
    this.handle(this.sim.activateAbility());
  }

  private attackerScale(id: string): number {
    const art = this.config.attackerArt.get(id);
    if (!art) throw new Error(`Missing partner art: ${id}`);
    return art.textureScale;
  }

  private toAim(): void {
    this.rig.mode = 'aim';
    this.bringNextToSling();
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.hooks.sfx.unlock();
      if (!this.started || this.paused) return;
      // Tap anywhere while the partner is flying: use its ability.
      if (this.sim.canUseAbility) { this.useAbility(); return; }
      if (this.rig.mode === 'tower' && this.sim.phase === 'aiming') { this.toAim(); return; }
      // Start a pull only once the camera has stopped, so the sling does not drift under the finger.
      if (this.aimPointer !== undefined || !this.canAim() || !this.rig.settledOnAim) return;
      const rest = this.restOnScreen();
      if (Math.hypot(pointer.x - rest.x, pointer.y - rest.y) > SLING.touchRadius * this.cameras.main.height) return;
      this.aimPointer = pointer.id;
      this.updateAim(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.id === this.aimPointer) this.updateAim(pointer); });
    const release = (pointer: Phaser.Input.Pointer) => { if (pointer.id === this.aimPointer) this.release(); };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.on('keydown', (event: KeyboardEvent) => {
      // Space/Enter belong to the sling while playing; never let them also press a focused HUD button.
      if (this.started && !this.paused && (event.key === ' ' || event.key === 'Enter')) event.preventDefault();
      if (this.started && !this.paused && (event.key === ' ' || event.key === 'Enter') && this.sim.canUseAbility) { this.useAbility(); return; }
      if (!this.started || this.paused || !this.canAim()) return;
      const k = this.keyAim;
      if (event.key === 'ArrowUp') k.angle = Math.max(-1.45, k.angle - 0.025);
      else if (event.key === 'ArrowDown') k.angle = Math.min(0.6, k.angle + 0.025);
      else if (event.key === 'ArrowRight') k.power = Math.min(1, k.power + 0.03);
      else if (event.key === 'ArrowLeft') k.power = Math.max(0.15, k.power - 0.03);
      else if (event.key === ' ' || event.key === 'Enter') { if (this.aim) this.release(); return; }
      else return;
      event.preventDefault();
      this.setAim(launchFromPull(-Math.cos(k.angle) * k.power, -Math.sin(k.angle) * k.power, 1, SLING.maxLaunchSpeed));
    });
  }

  private canAim(): boolean {
    return this.sim.phase === 'aiming' && this.rig.mode === 'aim' && this.slingReady;
  }

  private restOnScreen(): Vec {
    const cam = this.cameras.main;
    return { x: (SLING_REST.x - cam.worldView.x) * cam.zoom, y: (SLING_REST.y - cam.worldView.y) * cam.zoom };
  }

  private updateAim(pointer: Phaser.Input.Pointer): void {
    const rest = this.restOnScreen();
    const full = SLING.dragScreen * this.cameras.main.height;
    this.setAim(launchFromPull(pointer.x - rest.x, pointer.y - rest.y, full, SLING.maxLaunchSpeed));
  }

  private setAim(launch: Launch): void {
    this.aim = launch;
    const bucket = Math.round(launch.power * 10);
    if (bucket !== this.lastStretchBucket) { this.lastStretchBucket = bucket; if (bucket > 0) this.hooks.sfx.stretch(launch.power); }
  }

  private cancelAim(): void {
    this.aim = undefined;
    this.aimPointer = undefined;
    this.lastStretchBucket = -1;
  }

  private release(): void {
    const aim = this.aim;
    this.cancelAim();
    if (!aim || aim.power < SLING.cancelPower || !this.canAim()) return;
    this.recoil = { from: this.pullWorld(aim), start: this.time.now };
    this.hooks.sfx.launch(aim.power);
    const id = this.sim.currentShapeId;
    if (id) this.hooks.sfx.wee(id, aim.power);
    this.lastTrail = this.currentTrail;
    this.currentTrail = [];
    this.slowUsedThisShot = false;
    this.slingSprite.setVisible(false);
    this.slingReady = false;
    this.handle(this.sim.launch(aim.vx, aim.vy));
  }

  /** Visual pull offset of the partner on the sling, in world px. */
  private pullWorld(aim: Launch): Vec {
    const length = Math.hypot(aim.vx, aim.vy) || 1;
    return { x: (-aim.vx / length) * aim.power * SLING.maxDrag, y: (-aim.vy / length) * aim.power * SLING.maxDrag };
  }

  private bringNextToSling(): void {
    const id = this.sim.currentShapeId;
    if (!id || this.sim.phase !== 'aiming') return;
    this.slingReady = false;
    this.slingSprite.setTexture(attackerKey(id)).setVisible(true).setRotation(0).setScale(this.attackerScale(id));
    const reduced = this.hooks.reducedMotion();
    this.slingSprite.setPosition(reduced ? SLING_REST.x : SLING.x - 150, reduced ? SLING_REST.y : WORLD.groundY - 48);
    this.refreshQueue(true);
    if (reduced) { this.slingReady = true; return; }
    this.tweens.add({ targets: this.slingSprite, x: SLING_REST.x, duration: 820, ease: 'Back.easeInOut' });
    this.tweens.add({ targets: this.slingSprite, y: SLING_REST.y - 90, duration: 410, ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({ targets: this.slingSprite, y: SLING_REST.y, duration: 410, ease: 'Sine.easeIn', onComplete: () => { this.slingReady = true; } }) });
  }

  /** Partners waiting on the grass behind the sling. */
  private refreshQueue(skipSling = false): void {
    for (const sprite of this.queue) { this.tweens.killTweensOf(sprite); sprite.destroy(); }
    this.queue = [];
    const first = this.sim.phase === 'aiming' ? this.sim.shotIndex + (skipSling || this.slingSprite.visible ? 1 : 0) : this.sim.shotIndex + 1;
    this.level.shots.slice(first).forEach((id, i) => {
      const scale = this.attackerScale(id) * 0.86;
      const sprite = this.add.image(SLING.x - 160 - i * 92, WORLD.groundY - 44, attackerKey(id)).setDepth(4).setScale(scale);
      if (!this.hooks.reducedMotion()) this.tweens.add({ targets: sprite, scaleY: scale * 0.95, scaleX: scale * 1.05, duration: 1200 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.queue.push(sprite);
    });
  }

  update(time: number, delta: number): void {
    const rate = this.hooks.reducedMotion() ? 1 : time < this.hitStopUntil ? 0 : time < this.slowUntil ? FX.slowMotionRate : 1;
    const steps = this.started && !this.paused ? this.stepper.advance(delta, rate) : 0;
    for (let i = 0; i < steps; i++) {
      this.handle(this.sim.step());
      const active = this.sim.activeAttackerId !== undefined ? this.sim.pieces.get(this.sim.activeAttackerId) : undefined;
      if (active && this.sim.stepCount % SLING.trailDotEvery === 0) this.currentTrail.push({ x: active.body.position.x, y: active.body.position.y });
    }
    this.syncSprites();
    this.updateCamera();
    this.drawSling(time);
    this.drawGuides();
    this.rig.update(this.paused ? 0 : delta);
    this.report();
  }

  private updateCamera(): void {
    const id = this.sim.activeAttackerId;
    const active = id !== undefined ? this.sim.pieces.get(id) : undefined;
    if (active) {
      this.rig.setFocus(active.body.position.x, active.body.position.y);
      if (this.rig.mode === 'follow' && this.sim.activeHasImpacted) this.rig.mode = 'watch';
    }
  }

  private syncSprites(): void {
    for (const [id, sprite] of this.sprites) {
      if (this.sim.pieces.has(id)) continue;
      this.tweens.killTweensOf(sprite);
      sprite.destroy();
      this.sprites.delete(id);
    }
    for (const piece of this.sim.pieces.values()) {
      let sprite = this.sprites.get(piece.id);
      if (!sprite) sprite = this.createSprite(piece);
      sprite.setPosition(piece.body.position.x, piece.body.position.y).setRotation(piece.body.angle);
    }
  }

  private createSprite(piece: Piece): Phaser.GameObjects.Image {
    let sprite: Phaser.GameObjects.Image;
    if (piece.kind === 'attacker') {
      const scale = this.attackerScale(piece.shapeId as string) * (piece.artScale ?? 1);
      sprite = this.add.image(0, 0, attackerKey(piece.shapeId as string)).setOrigin(piece.anchor.x / piece.w, piece.anchor.y / piece.h).setScale(scale).setDepth(20);
      sprite.setData('baseScale', scale);
    } else if (piece.kind === 'target') {
      sprite = this.add.image(0, 0, targetKey(piece.shapeId as string)).setOrigin(piece.anchor.x / piece.w, piece.anchor.y / piece.h).setScale(TARGET.scale).setDepth(11);
      sprite.setData('baseScale', TARGET.scale);
    } else {
      sprite = this.add.image(0, 0, blockTexture(this, piece.material as BlockMaterial, piece.w, piece.h, false)).setDepth(10);
    }
    this.sprites.set(piece.id, sprite);
    return sprite;
  }

  private handle(events: SimEvent[]): void {
    const reduced = this.hooks.reducedMotion();
    for (const event of events) {
      switch (event.type) {
        case 'impact': {
          this.hooks.sfx.impact(event.material, event.strength);
          if (event.attackerId !== undefined) {
            if (!reduced && event.strength >= FX.hitStopMinImpact) this.hitStopUntil = this.time.now + FX.hitStopMs;
            if (event.strength >= 12) this.squash(event.attackerId, event.strength);
          }
          if (!reduced && event.strength >= FX.shakeMinImpact) this.cameras.main.shake(140, 0.0035 * Math.min(1.6, event.strength / 40));
          if (event.strength >= 20) this.sparks.explode(Math.min(10, Math.round(event.strength / 6)), event.x, event.y);
          break;
        }
        case 'cracked': this.onCracked(event.id); break;
        case 'break': this.onBreak(event, reduced); break;
        case 'launch': this.rig.mode = 'follow'; this.refreshQueue(true); break;
        case 'ability': this.onAbility(event, reduced); break;
        case 'shotEnd': {
          if (event.chainBonus <= 0) break;
          const bounds = towerBounds(this.sim.pieces.values());
          this.popup((bounds.minX + bounds.maxX) / 2, bounds.minY - 80, `連鎖 +${event.chainBonus.toLocaleString()}`, 0xffd166);
          break;
        }
        case 'ready': this.rig.mode = 'aim'; this.bringNextToSling(); break;
        case 'bonus': this.bonuses.push(event.points); break;
        case 'won':
        case 'lost': {
          this.rig.mode = 'tower';
          const won = event.type === 'won';
          const stars = won ? event.stars : 0;
          this.resultTimer?.remove();
          this.resultTimer = this.time.delayedCall(1100, () => this.hooks.onResult({ won, stars, score: this.sim.score.total, bonuses: [...this.bonuses] }));
          break;
        }
      }
    }
  }

  /** Blocks show cracks. A 四十塊 takes damage the same way but shows no cracks (user decision). */
  private onCracked(id: number): void {
    const piece = this.sim.pieces.get(id);
    const sprite = this.sprites.get(id);
    if (!piece || !sprite || piece.kind === 'target') return;
    sprite.setTexture(blockTexture(this, piece.material as BlockMaterial, piece.w, piece.h, true));
  }

  private onBreak(event: Extract<SimEvent, { type: 'break' }>, reduced: boolean): void {
    this.puffs.explode(4, event.x, event.y);
    if (event.kind === 'target') {
      // The body stays in the simulation and flies off under physics; its sprite keeps following it, drawn in front.
      this.hooks.sfx.knockout();
      this.sparks.explode(16, event.x, event.y);
      this.sprites.get(event.id)?.setDepth(58);
    } else {
      const material = (event.material ?? 'wood') as BlockMaterial;
      this.debris.get(material)?.explode(9, event.x, event.y);
      this.hooks.sfx.shatter(material);
    }
    if (event.points > 0) this.popup(event.x, event.y - 40, event.kind === 'target' ? `打飛! +${event.points.toLocaleString()}` : event.points.toLocaleString(), event.kind === 'target' ? 0xffd166 : 0xffffff);
    if (!reduced && !this.slowUsedThisShot && this.sim.phase === 'flying' && this.sim.score.breaksThisShot >= FX.slowMotionMinBreaks) {
      this.slowUsedThisShot = true;
      this.slowUntil = this.time.now + FX.slowMotionMs;
    }
  }

  /** Visual and sound for each ability; the physics already happened in the simulation. */
  private onAbility(event: Extract<SimEvent, { type: 'ability' }>, reduced: boolean): void {
    this.hooks.sfx.ability(event.ability);
    const sprite = this.sprites.get(event.id);
    switch (event.ability) {
      case 'firework':
        this.sparks.explode(40, event.x, event.y);
        this.puffs.explode(10, event.x, event.y);
        if (!reduced) { this.cameras.main.shake(220, 0.008); this.hitStopUntil = this.time.now + FX.hitStopMs; }
        this.popup(event.x, event.y - 70, '砰!', 0xffd166);
        break;
      case 'dash':
        this.puffs.explode(5, event.x, event.y);
        sprite?.setTint(0xfff1b8);
        this.popup(event.x, event.y - 70, '衝!', 0xffffff);
        break;
      case 'split':
        this.puffs.explode(6, event.x, event.y);
        this.sparks.explode(10, event.x, event.y);
        break;
      case 'bounce':
        sprite?.setTint(0xffc59a);
        this.sparks.explode(8, event.x, event.y);
        this.popup(event.x, event.y - 70, '辣!', 0xff9a6b);
        break;
      case 'slam':
        sprite?.setTint(0xd8c8ff);
        if (sprite && !reduced) this.tweens.add({ targets: sprite, scaleX: (sprite.getData('baseScale') as number) * 1.25, scaleY: (sprite.getData('baseScale') as number) * 1.25, duration: 160, yoyo: true });
        this.popup(event.x, event.y - 70, '咚!', 0xffffff);
        break;
      case 'roll':
        sprite?.setTint(0xffe2a8);
        this.puffs.explode(8, event.x, event.y + 30);
        this.sparks.explode(10, event.x, event.y);
        this.popup(event.x, event.y - 70, '滾!', 0xffd166);
        break;
      case 'wave':
        sprite?.setTint(0xcdeeff);
        this.popup(event.x, event.y - 70, '嘩!', 0x8fd3ff);
        // A spray that runs forward and down through the water band, like a wave breaking over the tower.
        for (let i = 0; i < 7; i++) {
          const x = event.x + event.dir * i * 80, y = event.y + i * 40;
          if (reduced) { if (i % 2 === 0) this.water.explode(10, x, y); continue; }
          this.time.delayedCall(i * 45, () => this.water.explode(14, x, y));
        }
        if (!reduced) this.cameras.main.shake(180, 0.004);
        break;
    }
  }

  private popup(x: number, y: number, text: string, color: number): void {
    const label = this.add.text(x, y, text, {
      fontFamily: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "PingFang TC", system-ui, sans-serif', fontSize: '46px', fontStyle: '900',
      color: Phaser.Display.Color.IntegerToColor(color).rgba, stroke: '#332629', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(60).setScale(0.4);
    if (this.hooks.reducedMotion()) {
      label.setScale(1);
      this.tweens.add({ targets: label, alpha: 0, delay: 500, duration: 300, onComplete: () => label.destroy() });
      return;
    }
    this.tweens.add({ targets: label, scale: 1, duration: 520, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: y - 70, alpha: 0, delay: 380, duration: 520, ease: 'Cubic.easeIn', onComplete: () => label.destroy() });
  }

  private squash(id: number, strength: number): void {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
    this.hooks.sfx.squish();
    if (this.hooks.reducedMotion()) return;
    const base = sprite.getData('baseScale') as number;
    const amount = Math.min(0.32, strength / 120);
    this.tweens.killTweensOf(sprite);
    sprite.setScale(base * (1 + amount), base * (1 - amount));
    this.tweens.add({ targets: sprite, scaleX: base, scaleY: base, duration: 620, ease: 'Back.easeOut' });
  }

  private drawSling(time: number): void {
    const back = this.sling.backTip, front = this.sling.frontTip;
    let anchor: Vec = { x: SLING_REST.x - 30, y: SLING_REST.y + 8 };
    let thickness = 10;
    const id = this.sim.currentShapeId;
    const scale = id ? this.attackerScale(id) : 1;
    if (this.aim && this.slingSprite.visible) {
      const pull = this.pullWorld(this.aim);
      const x = SLING_REST.x + pull.x, y = SLING_REST.y + pull.y;
      const angle = Math.atan2(this.aim.vy, this.aim.vx);
      const stretch = 1 + 0.24 * this.aim.power;
      this.slingSprite.setPosition(x, y).setRotation(angle * this.aim.power).setScale(scale * stretch, scale / stretch);
      const len = Math.hypot(pull.x, pull.y) || 1;
      anchor = { x: x + (pull.x / len) * 34, y: y + (pull.y / len) * 34 };
      thickness = 10 - 4 * this.aim.power;
    } else if (this.recoil) {
      const t = (time - this.recoil.start) / 400;
      if (t >= 1) this.recoil = undefined;
      else {
        const ease = Phaser.Math.Easing.Elastic.Out(t, 1.1, 0.35);
        anchor = { x: SLING_REST.x - 30 + this.recoil.from.x * (1 - ease), y: SLING_REST.y + 8 + this.recoil.from.y * (1 - ease) };
      }
    } else if (this.slingSprite.visible && this.slingReady) {
      this.slingSprite.setPosition(SLING_REST.x, SLING_REST.y).setRotation(0).setScale(scale);
    }
    this.bandBack.clear().lineStyle(thickness, ROSE_BROWN, 1).lineBetween(back.x, back.y, anchor.x, anchor.y);
    this.bandFront.clear().lineStyle(thickness + 1, ROSE, 1).lineBetween(front.x, front.y, anchor.x, anchor.y);
    this.bandFront.lineStyle(2, INK, 0.6).lineBetween(front.x, front.y + thickness / 2, anchor.x, anchor.y + thickness / 2);
  }

  private drawGuides(): void {
    this.preview.clear();
    if (this.aim && this.aim.power >= SLING.cancelPower) {
      const path = predictPath(SLING_REST, this.aim.vx, this.aim.vy, GRAVITY_PER_STEP, ATTACKER.frictionAir, WORLD.groundY);
      previewDots(path, SLING.previewFraction, SLING.previewDotEvery).forEach((dot, i, all) => {
        const r = 9 - (i / all.length) * 4;
        this.preview.fillStyle(CREAM, 0.95).fillCircle(dot.x, dot.y, r);
        this.preview.lineStyle(3, INK, 0.55).strokeCircle(dot.x, dot.y, r);
      });
    }
    this.trails.clear();
    for (const point of this.lastTrail) this.trails.fillStyle(0xffffff, 0.35).fillCircle(point.x, point.y, 5);
    for (const point of this.currentTrail) this.trails.fillStyle(0xffffff, 0.75).fillCircle(point.x, point.y, 6);
  }

  private report(): void {
    const score = this.sim.score.total;
    if (score !== this.reported.score) { this.reported.score = score; this.hooks.onScore(score); }
    const over = this.sim.phase === 'won' || this.sim.phase === 'lost';
    const waiting = over ? [] : this.level.shots.slice(this.sim.phase === 'aiming' ? this.sim.shotIndex : this.sim.shotIndex + 1);
    const key = waiting.join(',');
    if (key !== this.reported.shots) { this.reported.shots = key; this.hooks.onShots(waiting); }
    const skip = this.sim.canSkip;
    if (skip !== this.reported.skip) { this.reported.skip = skip; this.hooks.onSkipAvailable(skip); }
    const ability = this.sim.canUseAbility ? this.sim.currentAbility : undefined;
    const hurry = ability !== undefined && this.sim.firstImpactStep !== undefined;
    if (ability !== this.reported.ability || hurry !== this.reported.hurry) {
      this.reported.ability = ability;
      this.reported.hurry = hurry;
      this.hooks.onAbilityAvailable(ability, hurry);
    }
  }
}
