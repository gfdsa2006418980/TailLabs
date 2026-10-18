import Phaser from 'phaser';
import { preloadSerpentelas, SERPENTELAS } from '../data/serpentelas';
import { Serpentela, type VisibilityBounds } from '../entities/Serpentela';
import { SpawnSystem } from '../systems/SpawnSystem';
import { StickinessSystem } from '../systems/StickinessSystem';
import { RoundSession } from '../systems/RoundSession';
import { TowerCamera } from '../systems/TowerCamera';
import { TowerSupportSystem } from '../systems/TowerSupportSystem';
import { GameSounds } from '../systems/GameSounds';
import { GameUI } from '../ui/GameUI';
import { bindControls } from '../ui/controls';
import { subscribeLanguage, t } from '../ui/i18n';
import { createStageLayout, type StageLayout } from './StageConfig';
import { getRoundAssist, ROUND } from './RoundConfig';
import { CONTACT_TUNING_THRESHOLDS, CONTACT_TUNING_TIERS } from './PhysicsTuning';
import { performancePreferences } from '../systems/PerformancePreferences';
import { PlayClock } from '../systems/PlayClock';
import { canRescue, RescueSystem } from '../systems/RescueSystem';

const INK = 0x345442;
const FONT = '"Segoe UI", "Microsoft JhengHei", sans-serif';

export class GameScene extends Phaser.Scene {
  private spawner!: SpawnSystem;
  private guide!: Phaser.GameObjects.Graphics;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastDropAt = -Infinity;
  private stickiness!: StickinessSystem;
  private outlines!: Phaser.GameObjects.Graphics;
  private rescueHighlights!: Phaser.GameObjects.Graphics;
  private readonly rescue = new RescueSystem<Serpentela>();
  private rescueTouchIdentifier?: number;
  private rescueDangerVisible = false;
  private showOutlines = new URLSearchParams(location.search).get('outline') === '1';
  private round = new RoundSession();
  private ui!: GameUI;
  private paused = true;
  private hidden = false;
  private worldCamera!: Phaser.Cameras.Scene2D.Camera;
  private readonly towerCamera = new TowerCamera();
  private readonly towerSupport = new TowerSupportSystem();
  private readonly sounds = new GameSounds();
  private nextImage!: Phaser.GameObjects.Image;
  private nextLabel!: Phaser.GameObjects.Text;
  private nextTexture = '';
  private readonly pillarBodies: MatterJS.BodyType[] = [];
  private pillarVisual?: Phaser.GameObjects.Graphics;
  private lastHudAt = -Infinity;
  private guideVisible = false;
  private lastGuideX = Number.NaN;
  private lastGuideOffset = Number.NaN;
  private outlinesWereVisible = false;
  private touchId?: number;
  private layout!: StageLayout;
  private worldContainer!: Phaser.GameObjects.Container;
  private prewarmIndex = 0;
  private prewarmTexture?: Phaser.GameObjects.Image;
  private contactTuningTier = -1;
  private readonly playClock = new PlayClock();
  private idleHudTimer?: ReturnType<typeof setTimeout>;
  private readonly visibleBounds: VisibilityBounds = { left: 0, right: 0, top: 0, bottom: 0 };

  constructor() { super('GameScene'); }
  preload(): void {
    preloadSerpentelas(this);
    this.load.svg('magic-circle', `${import.meta.env.BASE_URL}assets/magic-circle.svg`);
  }

  create(): void {
    this.layout = createStageLayout(this.scale.gameSize.width, this.scale.gameSize.height);
    this.stickiness = new StickinessSystem();
    const hud = this.add.container(0, 0);
    this.drawChamber(hud);
    const world = this.add.container(0, 0);
    this.worldContainer = world;
    this.cameras.main.ignore(world);
    this.worldCamera = this.cameras.add(this.layout.chamberLeft, this.layout.chamberTop, this.layout.chamberWidth, this.layout.chamberHeight)
      .setScroll(this.layout.chamberLeft, this.layout.chamberTop);
    this.worldCamera.ignore(hud);
    this.createPlatform(world);
    this.spawner = new SpawnSystem(this, world, this.round.target, this.layout, (piece) => {
      this.towerSupport.onFreeze(piece.id); this.sounds.playSettle();
    });
    this.guide = this.add.graphics(); world.add(this.guide);
    this.outlines = this.add.graphics(); world.add(this.outlines);
    this.rescueHighlights = this.add.graphics().setDepth(4); world.add(this.rescueHighlights);
    this.ui = new GameUI({
      start: (target) => this.startRound(target),
      restart: () => this.startRound(this.round.target),
      pause: (paused) => { this.paused = paused; this.touchId = undefined; this.refreshPaused(); },
    }, !new URLSearchParams(location.search).has('shape'), this.sounds);
    this.setPrewarming(true);
    this.refreshPaused();
    this.updatePreview();
    const unsubscribeLanguage = subscribeLanguage(() => {
      this.updatePreview();
      this.refreshControls();
      this.refreshReadout();
      this.requestFrame();
    });
    const unsubscribePerformance = performancePreferences.subscribe(() => this.applyPerformanceProfile());

    const onCollisionStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      const impacts = new Map<number, { x: number; y: number; nx: number; ny: number; strength: number }>();
      for (const pair of event.pairs) {
        const a = pair.bodyA.parent, b = pair.bodyB.parent;
        const pieceA = this.spawner.getOrb(a.id), pieceB = this.spawner.getOrb(b.id);
        if (pieceA?.grabbed || pieceB?.grabbed) continue;
        this.towerSupport.beginContact(a.id, b.id, pair.id);
        this.stickiness.beginContact(a.id, b.id, this.round.elapsedMilliseconds, pair.id);
        const normal = pair.collision.normal;
        // Phaser's event typings omit the count used by its bundled Matter version.
        const contactCount = (pair as typeof pair & { contactCount: number }).contactCount;
        const supports = pair.collision.supports;
        let supportX = 0, supportY = 0, supportTotal = 0;
        const supportLimit = Number.isFinite(contactCount) ? Math.min(supports.length, Math.max(0, contactCount)) : supports.length;
        for (let index = 0; index < supportLimit; index++) {
          const point = supports[index];
          if (!point) continue;
          supportX += point.x; supportY += point.y; supportTotal++;
        }
        const x = supportTotal ? supportX / supportTotal : (a.position.x + b.position.x) / 2;
        const y = supportTotal ? supportY / supportTotal : (a.position.y + b.position.y) / 2;
        const vx = a.velocity.x - a.angularVelocity * (y - a.position.y) - b.velocity.x + b.angularVelocity * (y - b.position.y);
        const vy = a.velocity.y + a.angularVelocity * (x - a.position.x) - b.velocity.y - b.angularVelocity * (x - b.position.x);
        const strength = Math.abs(vx * normal.x + vy * normal.y);
        const impactA = impacts.get(a.id);
        if (pieceA && strength > (impactA?.strength ?? -Infinity)) {
          impacts.set(a.id, { x, y, nx: normal.x, ny: normal.y, strength });
        }
        const impactB = impacts.get(b.id);
        if (pieceB && strength > (impactB?.strength ?? -Infinity)) {
          impacts.set(b.id, { x, y, nx: normal.x, ny: normal.y, strength });
        }
      }
      impacts.forEach((impact, id) => this.spawner.getOrb(id)?.impact(impact.x, impact.y, impact.nx, impact.ny, impact.strength));
    };
    const onCollisionEnd = (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => {
      for (const pair of event.pairs) {
        this.stickiness.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
        this.towerSupport.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
      }
    };
    const onCollisionActive = (event: Phaser.Physics.Matter.Events.CollisionActiveEvent) => {
      for (const pair of event.pairs) this.towerSupport.beginContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
    };
    this.matter.world.on('collisionstart', onCollisionStart);
    this.matter.world.on('collisionend', onCollisionEnd);
    this.matter.world.on('collisionactive', onCollisionActive);
    const toggle = document.querySelector<HTMLInputElement>('#outline-toggle');
    if (toggle) toggle.checked = this.showOutlines;
    const onToggle = () => { this.showOutlines = toggle?.checked ?? false; this.requestFrame(); };
    toggle?.addEventListener('change', onToggle);
    this.cursors = this.input.keyboard?.createCursorKeys();
    // Native dialog inputs and selects must retain their arrow/space behavior.
    this.input.keyboard?.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT']);
    const inChamber = (pointer: Phaser.Input.Pointer) => pointer.x >= this.layout.chamberLeft && pointer.x <= this.layout.chamberRight
      && pointer.y >= this.layout.chamberTop && pointer.y <= this.layout.chamberBottom;
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (this.rescue.active) { if (this.isPlaying) this.moveRescue(pointer); return; }
      if (!this.isPlaying || !inChamber(pointer) || (pointer.wasTouch && pointer.id !== this.touchId)) return;
      const point = this.worldCamera.getWorldPoint(pointer.x, pointer.y);
      if (!pointer.wasTouch) this.game.canvas.style.cursor = this.rescue.pick(this.spawner.movingPieces, point.x, point.y, this.layout, 7) ? 'grab' : '';
      this.spawner.moveTo(point.x);
    };
    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!this.isPlaying || !inChamber(pointer)) return;
      if (pointer.wasTouch && this.touchId !== undefined && this.touchId !== pointer.id) return;
      if (!pointer.wasTouch && pointer.button !== 0) return;
      if (this.rescue.active) return;
      const point = this.worldCamera.getWorldPoint(pointer.x, pointer.y);
      const caught = this.rescue.pick(this.spawner.movingPieces, point.x, point.y, this.layout, pointer.wasTouch ? 14 : 7);
      if (caught && this.rescue.begin(caught, pointer.id, point.x, point.y)) {
        if (pointer.wasTouch) this.touchId = pointer.id;
        this.rescueTouchIdentifier = pointer.wasTouch ? pointer.identifier : undefined;
        this.stickiness.suspend(caught.id);
        this.towerSupport.detach(caught.id);
        this.spawner.beginRescue(caught);
        this.round.resetEscapeTimer(caught.id);
        this.game.canvas.style.cursor = 'grabbing';
        this.refreshControls(); this.refreshReadout(); this.requestFrame();
        return;
      }
      this.spawner.moveTo(point.x);
      if (pointer.wasTouch) { if (this.touchId === undefined) this.touchId = pointer.id; } else this.drop();
    };
    const onUp = (pointer: Phaser.Input.Pointer) => {
      if (this.rescue.pointerId === pointer.id) {
        this.moveRescue(pointer); this.finishRescue(pointer.id); return;
      }
      if (!pointer.wasTouch || pointer.id !== this.touchId) return;
      this.touchId = undefined;
      if (inChamber(pointer)) this.drop();
    };
    const cancelTouch = (pointer: Phaser.Input.Pointer) => {
      if (this.rescue.pointerId === pointer.id) this.finishRescue(pointer.id, true);
      if (pointer.id === this.touchId) this.touchId = undefined;
    };
    const cancelPointer = () => {
      if (this.rescue.pointerId !== undefined) this.finishRescue(this.rescue.pointerId, true);
      this.touchId = undefined;
    };
    const cancelNativePointer = (event: PointerEvent) => { if (event.pointerType !== 'touch') cancelPointer(); };
    const cancelNativeTouch = (event: TouchEvent) => {
      if (this.rescue.active && !Array.from(event.changedTouches).some((touch) => touch.identifier === this.rescueTouchIdentifier)) return;
      cancelPointer();
    };
    const onKeyboardDrop = (event: KeyboardEvent) => {
      if (!this.isPlaying) return;
      if (document.querySelector('dialog[open]') || document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement) return;
      if (!event.repeat) { event.preventDefault(); this.drop(); }
    };
    const onKeyboardMove = (event: KeyboardEvent) => {
      if (this.isPlaying && !document.querySelector('dialog[open]') && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLSelectElement)) event.preventDefault();
    };
    this.input.on('pointermove', onMove);
    this.input.on('pointerdown', onDown);
    this.input.on('pointerup', onUp);
    this.input.on('pointerupoutside', cancelTouch);
    this.input.keyboard?.on('keydown-SPACE', onKeyboardDrop);
    this.input.keyboard?.on('keydown-DOWN', onKeyboardDrop);
    this.input.keyboard?.on('keydown-LEFT', onKeyboardMove);
    this.input.keyboard?.on('keydown-RIGHT', onKeyboardMove);
    const unbind = bindControls({
      move: (direction) => {
        if (this.isPlaying && !this.rescue.active) { this.spawner.moveTo(this.spawner.x + direction * 28); this.requestFrame(); }
      },
      drop: () => this.drop(),
    });
    const onVisibility = () => { this.hidden = document.hidden; this.touchId = undefined; this.refreshPaused(); };
    document.addEventListener('visibilitychange', onVisibility);
    // DOM events wake the loop after Phaser has received the input event.
    const wakePointer = () => { if (this.isPlaying) queueMicrotask(this.requestFrame); };
    const wakeKeyboard = (event: KeyboardEvent) => {
      if (this.isPlaying && ['ArrowLeft', 'ArrowRight', 'ArrowDown', ' '].includes(event.key)) queueMicrotask(this.requestFrame);
    };
    const wakeResize = () => queueMicrotask(this.requestFrame);
    const canvas = this.game.canvas;
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) canvas.addEventListener(event, wakePointer);
    canvas.addEventListener('pointercancel', cancelNativePointer);
    canvas.addEventListener('touchcancel', cancelNativeTouch);
    window.addEventListener('blur', cancelPointer);
    window.addEventListener('pointerup', wakePointer);
    window.addEventListener('keydown', wakeKeyboard); window.addEventListener('keyup', wakeKeyboard);
    this.scale.on(Phaser.Scale.Events.RESIZE, wakeResize);
    this.game.events.on(Phaser.Core.Events.POST_RENDER, this.afterRender);
    this.refreshControls();
    const matterWorld = this.matter.world;
    const cleanup = () => {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
      this.clearIdleHud();
      this.ui.destroy(); unbind(); unsubscribeLanguage(); unsubscribePerformance();
      this.input.off('pointermove', onMove); this.input.off('pointerdown', onDown);
      this.input.off('pointerup', onUp); this.input.off('pointerupoutside', cancelTouch);
      this.input.keyboard?.off('keydown-SPACE', onKeyboardDrop); this.input.keyboard?.off('keydown-DOWN', onKeyboardDrop);
      this.input.keyboard?.off('keydown-LEFT', onKeyboardMove); this.input.keyboard?.off('keydown-RIGHT', onKeyboardMove);
      matterWorld.off('collisionstart', onCollisionStart); matterWorld.off('collisionend', onCollisionEnd); matterWorld.off('collisionactive', onCollisionActive);
      toggle?.removeEventListener('change', onToggle); document.removeEventListener('visibilitychange', onVisibility);
      for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) canvas.removeEventListener(event, wakePointer);
      window.removeEventListener('pointerup', wakePointer);
      window.removeEventListener('keydown', wakeKeyboard); window.removeEventListener('keyup', wakeKeyboard);
      this.scale.off(Phaser.Scale.Events.RESIZE, wakeResize);
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.afterRender);
      canvas.removeEventListener('pointercancel', cancelNativePointer); canvas.removeEventListener('touchcancel', cancelNativeTouch);
      window.removeEventListener('blur', cancelPointer);
      if (this.rescue.pointerId !== undefined) this.rescue.release(this.rescue.pointerId);
      this.touchId = undefined;
      this.spawner.destroy(); this.stickiness.clear(); this.towerSupport.clear();
      this.sounds.destroy();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private get isPlaying(): boolean { return this.round.state === 'playing' && !this.paused && !this.hidden; }
  private refreshPaused(): void {
    if (!this.isPlaying && this.rescue.pointerId !== undefined) this.finishRescue(this.rescue.pointerId, true);
    this.playClock.setRunning(this.isPlaying, performance.now());
    this.refreshControls(); this.requestFrame();
  }
  private readonly requestFrame = (): void => {
    this.clearIdleHud();
    this.matter.world.enabled = this.isPlaying && !!this.spawner?.hasMovingPieces;
    if (this.hidden) { this.game.loop.sleep(); return; }
    if (!this.game.loop.running) {
      this.game.loop.resetDelta();
      Object.assign(this.matter.world.runner, { timeLastTick: 0, timeBuffer: 0 });
      this.game.loop.wake();
    }
  };
  private readonly afterRender = (): void => {
    if (!this.spawner || this.prewarmIndex < SERPENTELAS.length) return;
    this.matter.world.enabled = this.isPlaying && this.spawner.hasMovingPieces;
    const inputActive = !!this.rescue.active || this.touchId !== undefined || this.cursors?.left.isDown || this.cursors?.right.isDown;
    if (this.isPlaying && (this.spawner.hasMovingPieces || this.spawner.hasVisualActivity || !this.towerCamera.settled || inputActive)) return;
    this.game.loop.sleep();
    if (this.isPlaying && this.idleHudTimer === undefined) {
      this.idleHudTimer = setTimeout(() => {
        this.idleHudTimer = undefined;
        if (!this.isPlaying) return;
        this.round.elapsedMilliseconds += this.playClock.consume(performance.now());
        this.refreshReadout(); this.refreshControls();
        this.afterRender();
      }, performancePreferences.powerSaving ? 500 : 250);
    }
  };
  private clearIdleHud(): void {
    if (this.idleHudTimer !== undefined) clearTimeout(this.idleHudTimer);
    this.idleHudTimer = undefined;
  }
  private applyPerformanceProfile(): void {
    this.game.loop.sleep();
    this.game.loop.fpsLimit = performancePreferences.profile.frameRate;
    this.spawner.applyPerformanceMode();
    this.lastHudAt = -Infinity;
    this.requestFrame();
  }
  private refreshControls(): void {
    for (const id of ['move-left', 'move-right', 'drop-button']) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = !this.isPlaying || !this.round.remaining || !!this.rescue.active;
    }
    const drop = document.getElementById('drop-button') as HTMLButtonElement | null;
    if (drop && this.spawner) {
      const waiting = this.isPlaying && this.round.remaining > 0 && (!this.spawner.canRelease || performance.now() - this.lastDropAt < ROUND.dropCooldownMs);
      drop.disabled ||= waiting;
      const label = this.rescue.active ? t('rescueHolding') : !this.round.remaining ? t('dropWaitingFinal') : waiting ? t('dropWaiting') : t('drop');
      const text = document.getElementById('drop-label');
      if (text && text.textContent !== label) text.textContent = label;
    }
  }
  private startRound(target: number): void {
    if (this.rescue.pointerId !== undefined) this.finishRescue(this.rescue.pointerId, true);
    this.rescueDangerVisible = false; this.rescueHighlights.clear(); this.game.canvas.style.cursor = '';
    this.round = new RoundSession([10, 50, 100, 500].includes(target) ? target : ROUND.target);
    this.stickiness.setDelayMs(getRoundAssist(this.round.target).stickinessDelayMs);
    this.updateContactTuning(0);
    this.spawner.reset(this.round.target); this.stickiness.clear(); this.towerSupport.clear();
    this.updateLightPillars(this.round.target);
    // Flush the detector's references to the destroyed round before sleeping again.
    this.matter.world.step(1000 / 60);
    this.towerCamera.reset(); this.worldCamera.setScroll(this.layout.chamberLeft, this.layout.chamberTop);
    this.lastDropAt = -Infinity; this.lastHudAt = -Infinity; this.touchId = undefined;
    this.playClock.reset(performance.now());
    this.round.start(); this.paused = false;
    this.ui.setMode(this.round.target); this.updatePreview();
    this.refreshReadout(); this.refreshPaused();
  }
  update(_time: number, delta: number): void {
    if (!this.spawner) return;
    this.prewarmNextSerpentela();
    const elapsed = this.playClock.consume(performance.now());
    if (this.isPlaying) {
      this.stickiness.update(this.round.elapsedMilliseconds + elapsed, delta);
      const pieces = this.spawner.pieces;
      const ended = this.round.update(elapsed, pieces, this.layout.platformY, this.layout);
      this.updateContactTuning(pieces.length);
      const offset = this.towerCamera.update(this.towerSupport.top, delta, this.layout.chamberTop + this.layout.chamberHeight * 0.46);
      const cameraY = this.layout.chamberTop + offset;
      if (this.worldCamera.scrollX !== this.layout.chamberLeft || this.worldCamera.scrollY !== cameraY) this.worldCamera.setScroll(this.layout.chamberLeft, cameraY);
      this.spawner.setSpawnY(this.layout.spawnY + offset);
      if (ended) {
        const result = this.round.result();
        if (result.completed) this.sounds.playGameSuccess(); else this.sounds.playGameEnd();
        this.refreshPaused(); this.refreshReadout(); this.ui.finish(result);
      }
      const direction = Number(this.cursors?.right.isDown) - Number(this.cursors?.left.isDown);
      if (direction && !this.rescue.active && !document.querySelector('dialog[open]')) this.spawner.moveTo(this.spawner.x + direction * Math.min(delta, 50) * 0.32);
      if (performance.now() - this.lastHudAt > performancePreferences.profile.hudIntervalMs) {
        this.refreshReadout(); this.refreshControls(); this.lastHudAt = performance.now();
      }
    } else if (this.round.state === 'playing' && elapsed > 0) {
      this.round.elapsedMilliseconds += elapsed; this.refreshReadout();
    }
    const margin = 80;
    Object.assign(this.visibleBounds, {
      left: this.worldCamera.scrollX - margin, right: this.worldCamera.scrollX + this.worldCamera.width + margin,
      top: this.worldCamera.scrollY - margin, bottom: this.worldCamera.scrollY + this.worldCamera.height + margin,
    });
    this.spawner.sync(this.isPlaying ? delta : 0, this.visibleBounds);
    this.refreshRescueHighlights();
    if (this.showOutlines) {
      this.outlines.clear(); this.spawner.drawOutlines(this.outlines); this.outlinesWereVisible = true;
    } else if (this.outlinesWereVisible) {
      this.outlines.clear(); this.outlinesWereVisible = false;
    }
    this.refreshGuide();
  }
  private updateContactTuning(pieceCount: number): void {
    let tier = 0;
    for (let index = 1; index < CONTACT_TUNING_THRESHOLDS.length; index++) {
      if (pieceCount >= CONTACT_TUNING_THRESHOLDS[index]) tier = index;
    }
    if (tier === this.contactTuningTier) return;
    const tuning = CONTACT_TUNING_TIERS[tier];
    this.matter.world.engine.positionIterations = tuning.positionIterations;
    this.matter.world.engine.velocityIterations = tuning.velocityIterations;
    this.matter.world.engine.constraintIterations = tuning.constraintIterations;
    this.contactTuningTier = tier;
  }
  private prewarmNextSerpentela(): void {
    const definition = SERPENTELAS[this.prewarmIndex];
    if (!definition) return;
    if (!this.prewarmTexture) {
      // Keep each texture in the rendered scene for one frame so the renderer
      // uploads it before the player can encounter it during a round.
      this.prewarmTexture = this.add.image(this.layout.width / 2, this.layout.platformY - 100, definition.texture)
        .setDisplaySize(36, 36).setAlpha(0.01).setDepth(1);
      this.worldContainer.add(this.prewarmTexture);
      return;
    }

    this.prewarmTexture.destroy();
    this.prewarmTexture = undefined;
    // Build and discard one body per frame to warm Matter's polygon
    // decomposition path without stalling the first active drop.
    new Serpentela(this, this.layout.width / 2, this.layout.platformY, definition, this.worldContainer).destroy();
    this.prewarmIndex += 1;
    if (this.prewarmIndex >= SERPENTELAS.length) this.setPrewarming(false);
  }
  private setPrewarming(prewarming: boolean): void {
    const button = document.querySelector<HTMLButtonElement>('#start-button');
    if (!button) return;
    button.disabled = prewarming;
    if (prewarming) {
      button.setAttribute('aria-busy', 'true');
      button.title = '蛇貂預載中';
    } else {
      button.removeAttribute('aria-busy');
      button.removeAttribute('title');
    }
  }
  private refreshGuide(): void {
    const visible = this.round.state === 'playing' && this.round.remaining > 0 && !this.rescue.active;
    if (!visible) {
      if (this.guideVisible) this.guide.clear();
      this.guideVisible = false; this.lastGuideX = Number.NaN; this.lastGuideOffset = Number.NaN;
      return;
    }
    const x = this.spawner.x;
    const offset = this.towerCamera.offset;
    if (this.guideVisible && x === this.lastGuideX && offset === this.lastGuideOffset) return;
    this.guide.clear(); this.guide.lineStyle(1, INK, 0.15);
    for (let y = this.layout.spawnY + offset + 36; y < this.layout.chamberBottom + offset; y += 14) this.guide.lineBetween(x, y, x, y + 5);
    this.guideVisible = true; this.lastGuideX = x; this.lastGuideOffset = offset;
  }
  private drop(): void {
    const now = performance.now();
    if (!this.isPlaying || this.rescue.active || !this.round.remaining || now - this.lastDropAt < ROUND.dropCooldownMs) return;
    const piece = this.spawner.drop(); if (!piece) return;
    this.sounds.playDrop();
    this.round.elapsedMilliseconds += this.playClock.consume(now);
    this.round.recordDrop(); this.stickiness.track(piece); this.towerSupport.track(piece); this.lastDropAt = now;
    this.updatePreview(); this.refreshControls(); this.refreshReadout();
    this.requestFrame();
  }
  private updatePreview(): void {
    const next = this.spawner.next;
    this.nextImage.setVisible(!!next);
    if (next && next.texture !== this.nextTexture) { this.nextImage.setTexture(next.texture); this.nextTexture = next.texture; }
    this.nextLabel.setText(next ? t('next') : t('last'));
    if (!this.round.remaining) this.nextLabel.setText(t('allPlaced'));
    this.game.canvas.setAttribute('aria-label', t('gameAreaAria', {
      current: this.spawner.current ? t('serpentelaName') : t('allDropped'),
      next: next ? t('serpentelaName') : t('noNext'),
    }));
  }
  private refreshReadout(): void {
    const message = this.round.state === 'ready' ? t('ready')
      : this.round.state === 'completed' ? t('completedStatus')
        : this.round.state === 'failed' ? t('failedStatus')
          : this.rescue.active ? t('rescuing') : this.round.warning || this.rescueDangerVisible ? t('warning') : !this.round.remaining ? t('waitingFinal') : t('placedStable', { count: this.round.placedCount });
    const statusSymbol = this.round.warning ? '!' : this.round.state === 'ready' ? '○' : !this.round.remaining ? '…' : '✓';
    this.ui.render(this.round.remaining, this.round.elapsedMilliseconds, this.round.score, message, statusSymbol, this.round.placedCount, this.round.warning);
    const hint = document.querySelector<HTMLElement>('[data-i18n="controlHint"]');
    const text = t(this.rescue.active || this.rescueDangerVisible ? 'rescueHint' : 'controlHint');
    if (hint && hint.textContent !== text) hint.textContent = text;
  }

  private moveRescue(pointer: Phaser.Input.Pointer): void {
    const x = Phaser.Math.Clamp(pointer.x, this.layout.chamberLeft, this.layout.chamberRight);
    const y = Phaser.Math.Clamp(pointer.y, this.layout.chamberTop, this.layout.chamberBottom);
    const point = this.worldCamera.getWorldPoint(x, y);
    this.rescue.move(pointer.id, point.x, point.y);
  }

  private finishRescue(pointerId: number, returnToSpawn = false): void {
    const piece = this.rescue.active;
    if (!piece || this.rescue.pointerId !== pointerId) return;
    const solids = this.matter.world.getAllBodies().filter((body) => body !== piece.body && body.collisionFilter.mask !== 0);
    // A ghost-held body must not become dynamic inside the settled tower.
    const overlapping = this.matter.intersectBody(piece.body, solids).length > 0;
    if (returnToSpawn || overlapping) {
      const bounds = piece.body.bounds, position = piece.body.position;
      const left = position.x - bounds.min.x, right = bounds.max.x - position.x, bottom = bounds.max.y - position.y;
      const x = Phaser.Math.Clamp(position.x, this.layout.safeLeft + left + 2, this.layout.safeRight - right - 2);
      let top = this.layout.spawnY + this.towerCamera.offset;
      for (const body of solids) {
        if (body.bounds.max.x > x - left && body.bounds.min.x < x + right) top = Math.min(top, body.bounds.min.y - bottom - 10);
      }
      piece.moveTo(x, top);
    }
    this.rescue.release(pointerId);
    this.stickiness.resume(piece.id); this.spawner.endRescue(piece); this.round.resetEscapeTimer(piece.id);
    this.touchId = undefined; this.rescueTouchIdentifier = undefined;
    this.lastDropAt = performance.now(); this.game.canvas.style.cursor = '';
    this.refreshControls(); this.refreshReadout(); this.requestFrame();
  }

  private refreshRescueHighlights(): void {
    let danger = false;
    this.rescueHighlights.clear();
    if (this.isPlaying) {
      for (const piece of this.spawner.movingPieces) {
        if (!canRescue(piece, this.layout)) continue;
        piece.drawRescueHighlight(this.rescueHighlights); danger = true;
      }
      this.rescue.active?.drawRescueHighlight(this.rescueHighlights);
    }
    if (danger !== this.rescueDangerVisible) { this.rescueDangerVisible = danger; this.refreshReadout(); }
  }
  private createPlatform(parent: Phaser.GameObjects.Container): void {
    // An open platform: falling off the sides is now a real failure.
    const centerX = this.layout.width / 2;
    const platformWidth = this.layout.safeRight - this.layout.safeLeft;
    const platform = this.matter.add.rectangle(centerX, this.layout.platformY + this.layout.platformDepth / 2, platformWidth, this.layout.platformDepth, { isStatic: true, friction: 0.75, label: 'magic-circle-platform' });
    this.towerSupport.addFloor(platform.id);
    this.stickiness.addSupport(platform.id);
    this.updateLightPillars(this.round.target, parent);
    const circleHeight = Math.min(platformWidth * 0.43, Math.max(60, (this.layout.chamberBottom - this.layout.platformY - 12) * 2));
    const circle = this.add.image(centerX, this.layout.platformY + 12, 'magic-circle')
      .setDisplaySize(Math.min(platformWidth * 1.15, circleHeight * 3.7), circleHeight);
    parent.add(circle);
  }
  private updateLightPillars(target: number, parent?: Phaser.GameObjects.Container): void {
    for (const wall of this.pillarBodies) {
      this.matter.world.remove(wall);
      this.stickiness.removeSupport(wall.id);
    }
    this.pillarBodies.length = 0;
    this.pillarVisual?.destroy();
    this.pillarVisual = undefined;

    const scale = target === 10 ? 0 : target === 50 ? 0.5 : target === 500 ? 2 : 1;
    const heightMultiplier = getRoundAssist(target).lightPillarHeightMultiplier;
    const maxPillarHeight = Math.max(0, this.layout.platformY - this.layout.chamberTop);
    const pillarHeight = Math.min(this.layout.lightPillarHeight * scale * heightMultiplier, maxPillarHeight);
    if (!pillarHeight) return;

    const pillarWidth = this.layout.lightPillarWidth;
    const top = this.layout.platformY - pillarHeight;
    const bottom = this.layout.platformY;
    const pillars = this.add.graphics();
    this.pillarVisual = pillars;
    for (const x of [this.layout.safeLeft - pillarWidth / 2, this.layout.safeRight + pillarWidth / 2]) {
      const wall = this.matter.add.rectangle(x, (top + bottom) / 2, pillarWidth, pillarHeight, {
        isStatic: true, friction: 0.8, frictionStatic: 0.9, restitution: 0.05, label: 'magic-circle-light-pillar',
      });
      this.pillarBodies.push(wall);
      this.stickiness.addSupport(wall.id);
      pillars.lineStyle(pillarWidth * 1.85, 0x93ae93, 0.09).lineBetween(x, top, x, bottom);
      pillars.lineStyle(pillarWidth * 0.85, 0xc2b47d, 0.17).lineBetween(x, top + 3, x, bottom);
      pillars.lineStyle(pillarWidth * 0.3, 0xd8e8d1, 0.34).lineBetween(x, top + 6, x, bottom);
      pillars.lineStyle(1, 0xfffced, 0.72).lineBetween(x, top + 10, x, bottom - 2);
      pillars.fillStyle(0xc1b789, 0.32).fillEllipse(x, bottom, pillarWidth * 1.85, 7);
    }
    (parent ?? this.worldContainer).add(pillars);
  }
  private drawChamber(parent: Phaser.GameObjects.Container): void {
    const art = this.add.graphics(); parent.add(art);
    art.fillStyle(INK, 0.07);
    const dotStep = Math.max(22, Math.min(34, this.layout.width / 20));
    for (let x = this.layout.chamberLeft + dotStep / 2; x < this.layout.chamberRight; x += dotStep) {
      for (let y = this.layout.chamberTop + dotStep / 2; y < this.layout.chamberBottom; y += dotStep) art.fillCircle(x, y, 0.6);
    }
    art.lineStyle(1, INK, 0.11).strokeRoundedRect(this.layout.chamberLeft, this.layout.chamberTop, this.layout.chamberWidth, this.layout.chamberHeight, 14);
    const label = (x: number, y: number, text: string, size = 11, color = '#7c8b7e') => {
      const object = this.add.text(x, y, text, { fontFamily: FONT, fontSize: size, color }); parent.add(object); return object;
    };
    const previewWidth = 96;
    const previewHeight = 88;
    const previewRight = this.layout.chamberRight - 16;
    const previewLeft = previewRight - previewWidth;
    const previewTop = this.layout.chamberTop + 48;
    const previewCenter = previewLeft + previewWidth / 2;
    art.fillStyle(0xf1f0e5, 0.7).fillRoundedRect(previewLeft, previewTop, previewWidth, previewHeight, 12);
    this.nextLabel = label(previewCenter, previewTop + 9, t('next'), 14).setOrigin(0.5, 0).setStyle({ fontStyle: 'bold', align: 'center' });
    this.nextImage = this.add.image(previewCenter, previewTop + 58, 'serpentela-w50-01').setDisplaySize(38.25, 38.25); parent.add(this.nextImage);
    // Graphics commands otherwise rebuild and triangulate all 504 dots every frame.
    const backgroundKey = 'chamber-background-' + this.layout.width + 'x' + this.layout.height;
    if (!this.textures.exists(backgroundKey)) art.generateTexture(backgroundKey, this.layout.width, this.layout.height);
    parent.addAt(this.add.image(0, 0, backgroundKey).setOrigin(0), 0);
    art.destroy();
  }
}
