import Phaser from 'phaser';
import serpentelaData from '../data/serpentelas.generated.json';
import attackerData from './data/attackers.generated.json';
import levelData from './levels/levels.json';
import { PHYSICS, VIEW } from './config/Tuning.ts';
import { ABILITY_INFO, PARTNER_ABILITY } from './config/Abilities.ts';
import { CREDITS, OWNERS, SISHIKUAI } from './config/Credits.ts';
import { Sfx } from './audio/Sfx.ts';
import { Progress } from './rules/Progress.ts';
import type { KeyValueStore } from './rules/Progress.ts';
import { BattleScene } from './scene/BattleScene.ts';
import type { AttackerArt, BattleHooks, BattleResult } from './scene/BattleScene.ts';
import type { LevelData, ShapeDefinition, ShapeLibrary } from './sim/Level.ts';
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
const levelLabel = element('level-label');
const soundButton = element<HTMLButtonElement>('sound-button');
const restartButton = element<HTMLButtonElement>('restart-button');
const menuSelectButton = element<HTMLButtonElement>('menu-select-button');
const nextButton = element<HTMLButtonElement>('next-button');
const startPanel = element('start-panel');
const startButton = element<HTMLButtonElement>('start-button');
const installHint = element('install-hint');
const selectPanel = element('select-panel');
const selectTotal = element('select-total');
const levelGrid = element<HTMLOListElement>('level-grid');
const selectBack = element<HTMLButtonElement>('select-back');
const resultPanel = element('result-panel');
const resultLevel = element('result-level');
const resultTitle = element('result-title');
const resultScore = element('result-score');
const resultBest = element('result-best');
const resultNote = element('result-note');
const resultStarsLabel = element('result-stars-label');
const nextLevelButton = element<HTMLButtonElement>('next-level-button');
const retryButton = element<HTMLButtonElement>('retry-button');
const resultSelectButton = element<HTMLButtonElement>('result-select-button');
const menuButton = element<HTMLButtonElement>('menu-button');
const menuPanel = element('menu-panel');
const resumeButton = element<HTMLButtonElement>('resume-button');
const partnersButton = element<HTMLButtonElement>('partners-button');
const partnersPanel = element('partners-panel');
const partnersBack = element<HTMLButtonElement>('partners-back');
const partnerList = element<HTMLUListElement>('partner-list');
const creditsButton = element<HTMLButtonElement>('credits-button');
const creditsPanel = element('credits-panel');
const creditsList = element<HTMLDListElement>('credits-list');
const creditsBack = element<HTMLButtonElement>('credits-back');
const abilityHint = element<HTMLButtonElement>('ability-hint');
const abilityName = element('ability-name');

const levels = levelData.levels as LevelData[];
const levelIds = levels.map((level) => level.id);
const shapes: ShapeLibrary = {
  attackers: new Map<string, ShapeDefinition>(attackerData.definitions.map((d) => [d.id, d])),
  targets: new Map<string, ShapeDefinition>(serpentelaData.definitions.map((d) => [d.id, d])),
};
const attackerArt = new Map<string, AttackerArt>(attackerData.definitions.map((d) => [d.id, { name: d.name, textureScale: d.textureScale }]));
const attackerUrl = (id: string) => `${import.meta.env.BASE_URL}assets/attackers/${id}.webp`;
const targetUrl = (id: string) => `${import.meta.env.BASE_URL}assets/serpentelas/${id}.webp`;
const sfx = new Sfx();

/** localStorage, or nothing when the browser blocks it (private mode, disabled storage). */
function openStore(): KeyValueStore | undefined {
  try {
    const store = window.localStorage;
    store.getItem('taillabs.tl004.probe');
    return store;
  } catch {
    return undefined;
  }
}
const progress = new Progress(openStore());

/** Where the level select returns to with "返回". */
type SelectReturn = 'start' | 'menu' | 'result';

let started = false;
let resultOpen = false;
let menuOpen = false;
let selectOpen = false;
let selectReturn: SelectReturn = 'start';
let levelIndex = 0;
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
      image.src = attackerUrl(id); image.alt = ''; image.width = 44; image.height = 44;
      item.title = attackerArt.get(id)?.name ?? '';
      item.append(image);
      if (i === 0) item.classList.add('current');
      return item;
    }));
    queue.setAttribute('aria-label', `還有 ${ids.length} 位夥伴:${ids.map((id) => attackerArt.get(id)?.name ?? id).join('、')}`);
  },
  onSkipAvailable: (available) => { nextButton.hidden = !available; },
  onAbilityAvailable: (ability, hurry) => {
    abilityHint.hidden = !ability;
    abilityHint.classList.toggle('hurry', Boolean(ability) && hurry);
    if (ability) abilityName.textContent = ABILITY_INFO[ability].name;
  },
  onResult: (result) => showResult(result),
};

const scene = new BattleScene(hooks, { levels, shapes, attackerArt, attackerUrl, targetUrl });

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

if (import.meta.env.DEV) (window as unknown as { tl004: unknown }).tl004 = { game, scene, progress, levels, playLevel: (n: number) => playLevel(n - 1) };

function updatePause(): void {
  scene.setPaused(!started || document.hidden || portraitQuery.matches || resultOpen || menuOpen || selectOpen);
}
document.addEventListener('visibilitychange', updatePause);
portraitQuery.addEventListener('change', updatePause);

if (platform.inApp) {
  installHint.textContent = '建議用 Safari 或 Chrome 開啟:點右上角「⋯」→「用瀏覽器開啟」,畫面會更大。';
  installHint.hidden = false;
} else if (platform.iOS && !platform.standalone) {
  // Draw Safari's share button (a box with an arrow out of the top) so players can spot it.
  const shareIcon = '<svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M8.5 9.5H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.5"/><path d="M12 2.5v12"/><path d="M8.5 6 12 2.5 15.5 6"/></svg>';
  installHint.innerHTML = `iPhone 去掉網址列:點 Safari 的「${shareIcon}分享」(iOS 26 起在「⋯」裡)→「加入主畫面」,再從主畫面開啟。`;
  installHint.hidden = false;
}

// ---------- Level select ----------

function renderLevelGrid(): void {
  const firstOpen = levels.findIndex((level, i) => progress.isUnlocked(levelIds, i) && progress.stars(level.id) === 0);
  selectTotal.textContent = `★ ${progress.totalStars(levelIds)}/${levels.length * 3}`;
  levelGrid.replaceChildren(...levels.map((level, i) => {
    const unlocked = progress.isUnlocked(levelIds, i);
    const stars = progress.stars(level.id);
    const item = document.createElement('li');
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'level-tile';
    tile.dataset.index = String(i);
    const number = document.createElement('span');
    number.className = 'num';
    number.textContent = String(i + 1);
    const starRow = document.createElement('span');
    starRow.className = 'tile-stars';
    starRow.setAttribute('aria-hidden', 'true');
    if (unlocked) {
      for (let s = 0; s < 3; s++) {
        const star = document.createElement('span');
        star.textContent = '★';
        if (s < stars) star.className = 'lit';
        starRow.append(star);
      }
    } else {
      starRow.textContent = '🔒';
    }
    tile.append(number, starRow);
    if (!unlocked) {
      tile.classList.add('locked');
      tile.setAttribute('aria-disabled', 'true');
      tile.setAttribute('aria-label', `第 ${i + 1} 關 ${level.name},尚未解鎖`);
    } else {
      tile.setAttribute('aria-label', `第 ${i + 1} 關 ${level.name},${stars} 顆星`);
      tile.title = level.name;
    }
    if (i === firstOpen) tile.classList.add('next');
    item.append(tile);
    return item;
  }));
}

levelGrid.addEventListener('click', (event) => {
  const tile = (event.target as HTMLElement).closest<HTMLButtonElement>('.level-tile');
  if (!tile) return;
  const index = Number(tile.dataset.index);
  if (!progress.isUnlocked(levelIds, index)) { sfx.unlock(); sfx.tick(); return; }
  playLevel(index);
});

function openSelect(from: SelectReturn): void {
  sfx.unlock();
  selectReturn = from;
  selectOpen = true;
  renderLevelGrid();
  startPanel.hidden = true;
  menuPanel.hidden = true;
  partnersPanel.hidden = true; creditsPanel.hidden = true;
  resultPanel.hidden = true;
  selectPanel.hidden = false;
  updatePause();
  (levelGrid.querySelector<HTMLButtonElement>('.level-tile.next') ?? levelGrid.querySelector<HTMLButtonElement>('.level-tile'))?.focus();
}

function closeSelect(): void {
  selectOpen = false;
  selectPanel.hidden = true;
  if (selectReturn === 'start') { startPanel.hidden = false; startButton.focus(); }
  else if (selectReturn === 'menu') openMenu();
  else { resultPanel.hidden = false; retryButton.focus(); }
  updatePause();
}
selectBack.addEventListener('click', closeSelect);

function setLevelLabel(): void {
  levelLabel.textContent = `第 ${levelIndex + 1} 關`;
  levelLabel.title = levels[levelIndex].name;
}

/** Start (or restart) a level from the select screen or the result panel. */
function playLevel(index: number): void {
  sfx.unlock();
  void enterLandscapeFullscreen();
  levelIndex = Math.max(0, Math.min(levels.length - 1, index));
  clearResult();
  menuOpen = false;
  menuPanel.hidden = true;
  partnersPanel.hidden = true; creditsPanel.hidden = true;
  selectOpen = false;
  selectPanel.hidden = true;
  startPanel.hidden = true;
  started = true;
  hud.hidden = false;
  menuButton.setAttribute('aria-expanded', 'false');
  scoreLabel.textContent = '0';
  setLevelLabel();
  scene.startLevel(levels[levelIndex]);
  updatePause();
}

startButton.addEventListener('click', () => openSelect('start'));

// ---------- In-game buttons ----------

function clearResult(): void {
  cancelAnimationFrame(rollFrame);
  starTimers.forEach((timer) => window.clearTimeout(timer));
  starTimers = [];
  resultOpen = false;
  resultPanel.hidden = true;
  nextButton.hidden = true;
}

function restart(): void {
  sfx.unlock();
  closeMenu();
  clearResult();
  scoreLabel.textContent = '0';
  scene.restartLevel();
  updatePause();
}
restartButton.addEventListener('click', restart);
retryButton.addEventListener('click', restart);
nextLevelButton.addEventListener('click', () => playLevel(levelIndex + 1));
resultSelectButton.addEventListener('click', () => openSelect('result'));
menuSelectButton.addEventListener('click', () => { menuOpen = false; menuPanel.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); openSelect('menu'); });
nextButton.addEventListener('click', () => { sfx.unlock(); scene.next(); });

// Keyboard play uses Space/Enter: drop focus from HUD buttons after a click so those keys never press them again.
for (const button of [startButton, restartButton, retryButton, nextButton, soundButton, menuButton, resumeButton, partnersButton, partnersBack, creditsButton, creditsBack, abilityHint, nextLevelButton, resultSelectButton, menuSelectButton, selectBack]) {
  button.addEventListener('click', () => button.blur());
}

soundButton.addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  soundButton.setAttribute('aria-pressed', String(sfx.muted));
  soundButton.textContent = sfx.muted ? '音效:關' : '音效:開';
});

abilityHint.addEventListener('click', () => { sfx.unlock(); scene.useAbility(); });

// Partner intro (蛇貂好朋友介紹), built from the same data the game uses, plus 四十塊 itself at the end.
function partnerCard(id: string, imageUrl: string, nameText: string, roleText: string, descriptionText: string): HTMLLIElement {
  const item = document.createElement('li');
  const image = document.createElement('img');
  image.src = imageUrl; image.alt = ''; image.width = 64; image.height = 64;
  const text = document.createElement('div');
  const name = document.createElement('h3'); name.textContent = nameText;
  const role = document.createElement('p'); role.className = 'ability-name'; role.textContent = roleText;
  const description = document.createElement('p'); description.textContent = descriptionText;
  text.append(name, role, description);
  const owner = OWNERS[id];
  if (owner) { const line = document.createElement('p'); line.className = 'owner'; line.textContent = `飼主:${owner}`; text.append(line); }
  item.append(image, text);
  return item;
}
partnerList.replaceChildren(
  ...attackerData.definitions.map((partner) => {
    const ability = ABILITY_INFO[PARTNER_ABILITY[partner.id]];
    return partnerCard(partner.id, attackerUrl(partner.id), partner.name, ability.name, ability.description);
  }),
  partnerCard(SISHIKUAI.id, targetUrl(SISHIKUAI.art), SISHIKUAI.name, SISHIKUAI.role, SISHIKUAI.description),
);

// 開發名單.
creditsList.replaceChildren(...CREDITS.flatMap(({ role, names }) => {
  const term = document.createElement('dt'); term.textContent = role;
  const detail = document.createElement('dd'); detail.textContent = names.join('、');
  return [term, detail];
}));

function openMenu(): void {
  menuOpen = true;
  menuPanel.hidden = false;
  partnersPanel.hidden = true; creditsPanel.hidden = true;
  menuButton.setAttribute('aria-expanded', 'true');
  updatePause();
  resumeButton.focus();
}
function closeMenu(): void {
  menuOpen = false;
  menuPanel.hidden = true;
  partnersPanel.hidden = true; creditsPanel.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  updatePause();
}
// The result panel and the level select have their own buttons; the menu would only stack under them.
menuButton.addEventListener('click', () => { sfx.unlock(); if (selectOpen || resultOpen) return; if (menuOpen) closeMenu(); else openMenu(); });
resumeButton.addEventListener('click', closeMenu);
partnersButton.addEventListener('click', () => { menuPanel.hidden = true; partnersPanel.hidden = false; partnersBack.focus(); });
creditsButton.addEventListener('click', () => { menuPanel.hidden = true; creditsPanel.hidden = false; creditsBack.focus(); });
creditsBack.addEventListener('click', () => { creditsPanel.hidden = true; menuPanel.hidden = false; resumeButton.focus(); });
partnersBack.addEventListener('click', () => { partnersPanel.hidden = true; creditsPanel.hidden = true; menuPanel.hidden = false; resumeButton.focus(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (selectOpen) { closeSelect(); return; }
  if (started && !resultOpen) { if (menuOpen) closeMenu(); else openMenu(); }
});

// ---------- Result ----------

function showResult(result: BattleResult): void {
  resultOpen = true;
  updatePause();
  nextButton.hidden = true;
  const level = levels[levelIndex];
  const previousBest = progress.record(level.id)?.best ?? 0;
  if (result.won) progress.submit(level.id, result.score, result.stars);
  const hasNext = levelIndex + 1 < levels.length;
  resultLevel.textContent = `第 ${levelIndex + 1} 關 · ${level.name}`;
  resultTitle.textContent = result.won ? (hasNext ? '四十塊被打爆了！' : '四十塊全都被打爆了，\n恭喜通關！') : '還有四十塊在外面晃...';
  resultStarsLabel.textContent = `${result.stars} 顆星`;
  const best = progress.record(level.id)?.best ?? 0;
  resultBest.textContent = result.won && result.score > previousBest && previousBest > 0 ? '新紀錄！' : best > 0 ? `最高分 ${best.toLocaleString('zh-TW')}` : '';
  resultNote.hidden = progress.persistent;
  nextLevelButton.hidden = !(result.won && hasNext);
  const stars = [...resultPanel.querySelectorAll<HTMLSpanElement>('.stars span')];
  stars.forEach((star) => star.classList.remove('lit'));
  resultScore.textContent = '0';
  resultPanel.hidden = false;
  (nextLevelButton.hidden ? retryButton : nextLevelButton).focus();
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
