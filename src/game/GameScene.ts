import Phaser from 'phaser';
import { preloadSerpentelas } from '../data/serpentelas';
import { SpawnSystem } from '../systems/SpawnSystem';
import { StickinessSystem } from '../systems/StickinessSystem';
import { RoundSession } from '../systems/RoundSession';
import { TowerCamera } from '../systems/TowerCamera';
import { GameUI } from '../ui/GameUI';
import { bindControls } from '../ui/controls';
import { STAGE } from './StageConfig';
import { ROUND } from './RoundConfig';

const INK = 0x345442;
const FONT = '"Segoe UI", "Microsoft JhengHei", sans-serif';

export class GameScene extends Phaser.Scene {
  private spawner!: SpawnSystem;
  private guide!: Phaser.GameObjects.Graphics;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastDropAt = -Infinity;
  private stickiness!: StickinessSystem;
  private outlines!: Phaser.GameObjects.Graphics;
  private showOutlines = new URLSearchParams(location.search).get('outline') === '1';
  private round = new RoundSession();
  private ui!: GameUI;
  private paused = true;
  private hidden = false;
  private worldCamera!: Phaser.Cameras.Scene2D.Camera;
  private readonly towerCamera = new TowerCamera();
  private nextImage!: Phaser.GameObjects.Image;
  private nextLabel!: Phaser.GameObjects.Text;
  private nextTexture = '';
  private platformId = 0;
  private lastHudAt = -Infinity;
  private touchId?: number;

  constructor() { super('GameScene'); }
  preload(): void { preloadSerpentelas(this); }

  create(): void {
    this.stickiness = new StickinessSystem();
    const hud = this.add.container(0, 0);
    this.drawChamber(hud);
    const world = this.add.container(0, 0);
    this.cameras.main.ignore(world);
    this.worldCamera = this.cameras.add(30, 90, 460, 536).setScroll(30, 90);
    this.worldCamera.ignore(hud);
    this.createPlatform(world);
    this.spawner = new SpawnSystem(this, world, this.round.target);
    this.guide = this.add.graphics(); world.add(this.guide);
    this.outlines = this.add.graphics(); world.add(this.outlines);
    this.ui = new GameUI({
      start: (target) => this.startRound(target),
      restart: () => this.startRound(this.round.target),
      pause: (paused) => { this.paused = paused; this.touchId = undefined; this.refreshPaused(); },
    }, !new URLSearchParams(location.search).has('shape'));
    this.refreshPaused();

    const onCollisionStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      const impacts = new Map<number, { x: number; y: number; nx: number; ny: number; strength: number }>();
      for (const pair of event.pairs) {
        const a = pair.bodyA.parent, b = pair.bodyB.parent;
        const pieceA = this.spawner.getOrb(a.id), pieceB = this.spawner.getOrb(b.id);
        if (pieceA && (b.id === this.platformId || pieceB?.hasLanded)) pieceA.hasLanded = true;
        if (pieceB && (a.id === this.platformId || pieceA?.hasLanded)) pieceB.hasLanded = true;
        this.stickiness.beginContact(a.id, b.id, this.round.elapsedMilliseconds, pair.id);
        const normal = pair.collision.normal;
        // Phaser's event typings omit the count used by its bundled Matter version.
        const contactCount = (pair as typeof pair & { contactCount: number }).contactCount;
        const supports = pair.collision.supports.slice(0, contactCount).filter((point) => point != null);
        const x = supports.length ? supports.reduce((sum, point) => sum + point.x, 0) / supports.length : (a.position.x + b.position.x) / 2;
        const y = supports.length ? supports.reduce((sum, point) => sum + point.y, 0) / supports.length : (a.position.y + b.position.y) / 2;
        const vx = a.velocity.x - a.angularVelocity * (y - a.position.y) - b.velocity.x + b.angularVelocity * (y - b.position.y);
        const vy = a.velocity.y + a.angularVelocity * (x - a.position.x) - b.velocity.y - b.angularVelocity * (x - b.position.x);
        const strength = Math.abs(vx * normal.x + vy * normal.y);
        for (const body of [a, b]) if (this.spawner.getOrb(body.id) && strength > (impacts.get(body.id)?.strength ?? -Infinity)) {
          impacts.set(body.id, { x, y, nx: normal.x, ny: normal.y, strength });
        }
      }
      impacts.forEach((impact, id) => this.spawner.getOrb(id)?.impact(impact.x, impact.y, impact.nx, impact.ny, impact.strength));
    };
    const onCollisionEnd = (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => {
      for (const pair of event.pairs) this.stickiness.endContact(pair.bodyA.parent.id, pair.bodyB.parent.id, pair.id);
    };
    this.matter.world.on('collisionstart', onCollisionStart);
    this.matter.world.on('collisionend', onCollisionEnd);
    const toggle = document.querySelector<HTMLInputElement>('#outline-toggle');
    if (toggle) toggle.checked = this.showOutlines;
    const onToggle = () => { this.showOutlines = toggle?.checked ?? false; };
    toggle?.addEventListener('change', onToggle);
    this.cursors = this.input.keyboard?.createCursorKeys();
    // Native dialog inputs and selects must retain their arrow/space behavior.
    this.input.keyboard?.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT']);
    const inChamber = (pointer: Phaser.Input.Pointer) => pointer.x >= 30 && pointer.x <= 490 && pointer.y >= 90 && pointer.y <= 626;
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.isPlaying || !inChamber(pointer) || (pointer.wasTouch && pointer.id !== this.touchId)) return;
      this.spawner.moveTo(this.worldCamera.getWorldPoint(pointer.x, pointer.y).x);
    };
    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!this.isPlaying || !inChamber(pointer)) return;
      if (pointer.wasTouch && this.touchId !== undefined && this.touchId !== pointer.id) return;
      if (!pointer.wasTouch && pointer.button !== 0) return;
      this.spawner.moveTo(this.worldCamera.getWorldPoint(pointer.x, pointer.y).x);
      if (pointer.wasTouch) { if (this.touchId === undefined) this.touchId = pointer.id; } else this.drop();
    };
    const onUp = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch || pointer.id !== this.touchId) return;
      this.touchId = undefined;
      if (inChamber(pointer)) this.drop();
    };
    const cancelTouch = () => { this.touchId = undefined; };
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
      move: (direction) => { if (this.isPlaying) this.spawner.moveTo(this.spawner.x + direction * 28); },
      drop: () => this.drop(), reset: () => this.startRound(this.round.target),
    });
    const onVisibility = () => { this.hidden = document.hidden; this.touchId = undefined; this.refreshPaused(); };
    document.addEventListener('visibilitychange', onVisibility);
    this.refreshControls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ui.destroy(); unbind();
      this.input.off('pointermove', onMove); this.input.off('pointerdown', onDown);
      this.input.off('pointerup', onUp); this.input.off('pointerupoutside', cancelTouch);
      this.input.keyboard?.off('keydown-SPACE', onKeyboardDrop); this.input.keyboard?.off('keydown-DOWN', onKeyboardDrop);
      this.input.keyboard?.off('keydown-LEFT', onKeyboardMove); this.input.keyboard?.off('keydown-RIGHT', onKeyboardMove);
      this.matter.world.off('collisionstart', onCollisionStart); this.matter.world.off('collisionend', onCollisionEnd);
      toggle?.removeEventListener('change', onToggle); document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  private get isPlaying(): boolean { return this.round.state === 'playing' && !this.paused && !this.hidden; }
  private refreshPaused(): void { this.matter.world.enabled = this.isPlaying; this.refreshControls(); }
  private refreshControls(): void {
    for (const id of ['move-left', 'move-right', 'drop-button']) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) button.disabled = !this.isPlaying || !this.round.remaining;
    }
    const drop = document.getElementById('drop-button') as HTMLButtonElement | null;
    if (drop && this.spawner) {
      const waiting = this.isPlaying && this.round.remaining > 0 && (!this.spawner.canRelease || this.time.now - this.lastDropAt < ROUND.dropCooldownMs);
      drop.disabled ||= waiting;
      const label = !this.round.remaining ? '等待最後一隻停穩…' : waiting ? '稍等牠落下…' : '放下這一隻 ↓';
      if (drop.textContent !== label) drop.textContent = label;
    }
    const reset = document.getElementById('reset-button') as HTMLButtonElement | null;
    if (reset) reset.disabled = this.round.state !== 'playing' || this.paused;
  }
  private startRound(target: number): void {
    this.round = new RoundSession([10, 50, 100, 500].includes(target) ? target : ROUND.target);
    this.spawner.reset(this.round.target); this.stickiness.clear();
    this.towerCamera.reset(); this.worldCamera.setScroll(30, 90);
    this.lastDropAt = -Infinity; this.lastHudAt = -Infinity; this.touchId = undefined;
    this.round.start(); this.paused = false;
    this.ui.setMode(this.round.target); this.refreshPaused(); this.updatePreview();
    this.refreshReadout();
    document.querySelector('.game-progress')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  update(_time: number, delta: number): void {
    if (!this.spawner) return;
    if (this.isPlaying) {
      this.stickiness.update(this.round.elapsedMilliseconds + delta, delta);
      const pieces = this.spawner.pieces;
      const ended = this.round.update(delta, pieces.map((piece) => ({ id: piece.id, frozen: piece.isFrozen, bounds: piece.body.bounds })), STAGE.platformY);
      let top: number | undefined;
      for (const piece of pieces) if (piece.hasLanded && piece.body.bounds.max.x >= ROUND.safeLeft && piece.body.bounds.min.x <= ROUND.safeRight) top = Math.min(top ?? Infinity, piece.body.bounds.min.y);
      const offset = this.towerCamera.update(top, delta);
      this.worldCamera.setScroll(30, 90 + offset);
      this.spawner.setSpawnY(STAGE.spawnY + offset);
      if (ended) { this.refreshPaused(); this.refreshReadout(); this.ui.finish(this.round.result()); }
      const direction = Number(this.cursors?.right.isDown) - Number(this.cursors?.left.isDown);
      if (direction && !document.querySelector('dialog[open]')) this.spawner.moveTo(this.spawner.x + direction * Math.min(delta, 50) * 0.32);
      if (this.time.now - this.lastHudAt > 80) { this.refreshReadout(); this.refreshControls(); this.lastHudAt = this.time.now; }
    }
    this.spawner.sync(this.isPlaying ? delta : 0);
    this.outlines.clear(); if (this.showOutlines) this.spawner.drawOutlines(this.outlines);
    this.guide.clear();
    if (this.round.state === 'playing' && this.round.remaining) {
      this.guide.lineStyle(1, INK, 0.15);
      const offset = this.towerCamera.offset;
      for (let y = STAGE.spawnY + offset + 36; y < 620 + offset; y += 14) this.guide.lineBetween(this.spawner.x, y, this.spawner.x, y + 5);
    }
  }
  private drop(): void {
    if (!this.isPlaying || !this.round.remaining || this.time.now - this.lastDropAt < ROUND.dropCooldownMs) return;
    const piece = this.spawner.drop(); if (!piece) return;
    this.round.recordDrop(); this.stickiness.track(piece); this.lastDropAt = this.time.now;
    this.updatePreview(); this.refreshControls(); this.refreshReadout();
  }
  private updatePreview(): void {
    const next = this.spawner.next;
    this.nextImage.setVisible(!!next);
    if (next && next.texture !== this.nextTexture) { this.nextImage.setTexture(next.texture); this.nextTexture = next.texture; }
    this.nextLabel.setText(next ? '下一隻' : '最後一隻');
    if (!this.round.remaining) this.nextLabel.setText('全部放下');
    this.game.canvas.setAttribute('aria-label', `蛇貂落下實驗場。目前：${this.spawner.current?.name ?? '已全部放下'}；下一隻：${next?.name ?? '無'}`);
  }
  private refreshReadout(): void {
    const message = this.round.warning ? '小心，蛇貂快掉出去了' : !this.round.remaining ? '等最後的蛇貂停穩…' : `已放穩 ${this.round.placedCount} 隻`;
    this.ui.render(this.round.remaining, this.round.elapsedMilliseconds, this.round.score, message);
  }
  private createPlatform(parent: Phaser.GameObjects.Container): void {
    // An open platform: falling off the sides is now a real failure.
    const platform = this.matter.add.rectangle(260, STAGE.platformY + STAGE.platformDepth / 2, 280, STAGE.platformDepth, { isStatic: true, friction: 0.75, label: 'magic-circle-platform' });
    this.platformId = platform.id; this.stickiness.addSupport(platform.id);
    const art = this.add.graphics(); parent.add(art);
    art.fillStyle(INK, 0.035).fillEllipse(260, STAGE.platformY + 10, 350, 100);
    art.lineStyle(1.5, INK, 0.4).strokeEllipse(260, STAGE.platformY + 10, 326, 78).strokeEllipse(260, STAGE.platformY + 10, 298, 59);
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6;
      art.fillStyle(INK, 0.6).fillCircle(260 + Math.cos(angle) * 155, STAGE.platformY + 10 + Math.sin(angle) * 34, 2);
    }
    art.fillStyle(INK).fillRoundedRect(120, STAGE.platformY, 280, 16, 5);
    art.fillStyle(0x76917a).fillRoundedRect(128, STAGE.platformY + 3, 264, 3, 1);
    const label = this.add.text(222, 594, '魔 法 陣', { fontFamily: FONT, fontSize: 12, color: '#345442' }); parent.add(label);
  }
  private drawChamber(parent: Phaser.GameObjects.Container): void {
    const art = this.add.graphics(); parent.add(art);
    art.lineStyle(1, INK, 0.07);
    for (let x = 30; x <= 490; x += 23) art.lineBetween(x, 90, x, 626);
    for (let y = 90; y <= 626; y += 23) art.lineBetween(30, y, 490, y);
    art.lineStyle(1, INK, 0.22).strokeRoundedRect(30, 90, 460, 536, 10);
    const label = (x: number, y: number, text: string, size = 11, color = '#7c8b7e') => {
      const object = this.add.text(x, y, text, { fontFamily: FONT, fontSize: size, color }); parent.add(object); return object;
    };
    label(30, 23, '01 / DROP CHAMBER', 12, '#345442');
    label(30, 44, '把每一隻，都疊回來。');
    art.lineStyle(1, INK, 0.2).strokeRoundedRect(386, 8, 104, 73, 6);
    label(395, 17, 'NEXT', 9);
    this.nextLabel = label(395, 60, '下一隻', 9);
    this.nextImage = this.add.image(454, 43, 'serpentela-w50-01').setDisplaySize(51, 51); parent.add(this.nextImage);
    label(30, 641, 'TL001 / ONE SMALL DROP AT A TIME', 9);
  }
}
