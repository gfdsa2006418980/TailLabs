import Phaser from 'phaser';
import manifest from '../data/serpentelas.generated.json';
import testTower from './levels/test-tower.json';
import { PHYSICS, VIEW } from './config/Tuning.ts';
import { Sfx } from './audio/Sfx.ts';
import { BattleScene } from './scene/BattleScene.ts';
import type { BattleHooks, BattleResult } from './scene/BattleScene.ts';
import type { LevelData, SerpentelaShape } from './sim/Level.ts';
import { enterLandscapeFullscreen, fitStage, platform, portraitQuery, reducedMotionQuery } from './platform/Platform.ts';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing TL004 element: ${id}`);
  return value as T;
}

const stage = element<HTMLDivElement>('stage');
const hud = element('hud');
const queue = element<HTMLOListElement>('queue');
const scoreLabel = element('score');
const soundButton = element<HTMLButtonElement>('sound-button');
const restartButton = element<HTMLButtonElement>('restart-button');
const nextButton = element<HTMLButtonElement>('next-button');
const startPanel = element('start-panel');
const startButton = element<HTMLButtonElement>('start-button');
const installHint = element('install-hint');
const resultPanel = element('result-panel');
const resultTitle = element('result-title');
const resultScore = element('result-score');
const resultStarsLabel = element('result-stars-label');
const retryButton = element<HTMLButtonElement>('retry-button');

const level = testTower as LevelData;
const shapes = new Map<string, SerpentelaShape>(manifest.definitions.map((d) => [d.id, d]));
const textureUrl = (id: string) => `${import.meta.env.BASE_URL}assets/serpentelas/${id}.webp`;
const sfx = new Sfx();

let started = false;
let resultOpen = false;
let rollFrame = 0;
let starTimers: number[] = [];

const hooks: BattleHooks = {
  sfx,
  reducedMotion: () => reducedMotionQuery.matches,
  onScore: (total) => { scoreLabel.textContent = total.toLocaleString('zh-TW'); },
  onShots: (ids) => {
    queue.replaceChildren(...ids.map((id, i) => {
      const item = document.createElement('li');
      const image = document.createElement('img');
      image.src = textureUrl(id); image.alt = ''; image.width = 44; image.height = 44;
      item.append(image);
      if (i === 0) item.classList.add('current');
      return item;
    }));
    queue.setAttribute('aria-label', `剩餘 ${ids.length} 隻蛇貂`);
  },
  onSkipAvailable: (available) => { nextButton.hidden = !available; },
  onResult: (result) => showResult(result),
};

const scene = new BattleScene(hooks, { level, shapes, textureUrl });

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  transparent: true,
  banner: false,
  scale: { mode: Phaser.Scale.EXPAND, width: VIEW.width, height: VIEW.height, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'matter',
    matter: { gravity: { x: 0, y: PHYSICS.gravityY }, enableSleeping: true, autoUpdate: false, debug: false },
  },
  input: { activePointers: 3 },
  scene: [scene],
});

// Phaser only re-reads the parent size inside its own step; read it now so the canvas follows the toolbar at once.
fitStage(stage, () => { game.scale.getParentBounds(); game.scale.refresh(); });

if (import.meta.env.DEV) (window as unknown as { tl004: unknown }).tl004 = { game, scene };

function updatePause(): void {
  scene.setPaused(!started || document.hidden || portraitQuery.matches || resultOpen);
}
document.addEventListener('visibilitychange', updatePause);
portraitQuery.addEventListener('change', updatePause);

if (platform.inApp) {
  installHint.textContent = '建議用 Safari 或 Chrome 開啟:點右上角「⋯」→「用瀏覽器開啟」,畫面會更大。';
  installHint.hidden = false;
} else if (platform.iOS && !platform.standalone) {
  installHint.textContent = 'iPhone 去掉網址列:點 Safari 的「分享」(iOS 26 起在「⋯」裡)→「加入主畫面」,再從主畫面開啟。';
  installHint.hidden = false;
}

startButton.addEventListener('click', () => {
  sfx.unlock();
  void enterLandscapeFullscreen();
  started = true;
  startPanel.hidden = true;
  hud.hidden = false;
  updatePause();
  scene.begin();
});

function restart(): void {
  sfx.unlock();
  cancelAnimationFrame(rollFrame);
  starTimers.forEach((timer) => window.clearTimeout(timer));
  starTimers = [];
  resultOpen = false;
  resultPanel.hidden = true;
  nextButton.hidden = true;
  scene.restartLevel();
  updatePause();
}
restartButton.addEventListener('click', restart);
retryButton.addEventListener('click', restart);
nextButton.addEventListener('click', () => { sfx.unlock(); scene.next(); });

// Keyboard play uses Space/Enter: drop focus from HUD buttons after a click so those keys never press them again.
for (const button of [startButton, restartButton, retryButton, nextButton, soundButton]) {
  button.addEventListener('click', () => button.blur());
}

soundButton.addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  soundButton.setAttribute('aria-pressed', String(sfx.muted));
  soundButton.setAttribute('aria-label', sfx.muted ? '開啟音效' : '關閉音效');
  soundButton.classList.toggle('muted', sfx.muted);
});

function showResult(result: BattleResult): void {
  resultOpen = true;
  updatePause();
  nextButton.hidden = true;
  resultTitle.textContent = result.won ? '過關!' : '水晶還在⋯';
  resultStarsLabel.textContent = `${result.stars} 顆星`;
  const stars = [...resultPanel.querySelectorAll<HTMLSpanElement>('.stars span')];
  stars.forEach((star) => star.classList.remove('lit'));
  resultScore.textContent = '0';
  resultPanel.hidden = false;
  sfx.result(result.won);
  const reduced = reducedMotionQuery.matches;
  stars.slice(0, result.stars).forEach((star, i) => {
    if (reduced) { star.classList.add('lit'); return; }
    starTimers.push(window.setTimeout(() => { star.classList.add('lit'); sfx.star(i); }, 450 + i * 180));
  });
  if (reduced) { resultScore.textContent = result.score.toLocaleString('zh-TW'); return; }
  const start = performance.now();
  const roll = (now: number) => {
    const t = Math.min(1, (now - start) / 1200);
    const eased = 1 - (1 - t) ** 3;
    resultScore.textContent = Math.round(result.score * eased).toLocaleString('zh-TW');
    if (t < 1) { if (Math.floor(t * 20) !== Math.floor(((now - 16 - start) / 1200) * 20)) sfx.tick(); rollFrame = requestAnimationFrame(roll); }
  };
  rollFrame = requestAnimationFrame(roll);
}
