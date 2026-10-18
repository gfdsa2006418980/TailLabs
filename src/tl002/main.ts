import Phaser from 'phaser';
import { RunnerScene } from './RunnerScene';
import { RunnerLeaderboard } from './RunnerLeaderboard';
import { RUNNER } from './RunnerModel';
import type { RunnerModel } from './RunnerModel';
import { CoinFlightLayer } from './CoinFlightLayer';
import { RunnerCountdown } from './RunnerCountdown';
import { RunnerAudio } from './RunnerAudio';
import { RunnerMusic } from './RunnerMusic';
import { loadRunnerPreferences, saveRunnerPreferences } from './RunnerPreferences';
import type { RunnerLanguage } from './RunnerPreferences';
import { runnerText } from './RunnerLocale';
import { gateCueWindow, gateJudgement, gateProgress } from './RunnerGate';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing TL002 element: ${id}`);
  return value as T;
}

const stage = element<HTMLDivElement>('game');
const overlay = element('overlay');
const loading = element('loading');
const menuButton = element<HTMLButtonElement>('menu-button');
const menuDialog = element<HTMLDialogElement>('menu-dialog');
const menuContent = element('menu-main-content');
const creditsContent = element('credits-content');
const boardDialog = element<HTMLDialogElement>('board-dialog');
const distanceLabel = element('distance');
const scoreLabel = element('score');
const multiplierLabel = element('multiplier');
const countdownLabel = element('countdown-label');
const gateCue = element('gate-cue');
const gateLabel = element('gate-label');
const gateMarker = element('gate-marker');
let cueWindowSeconds = -1;
let gateTrackWidth = 246;
const musicTrack = element<HTMLAudioElement>('music-track');
const countdown = new RunnerCountdown();
const audio = new RunnerAudio();
const coinFx = new CoinFlightLayer(element('coin-fx'), element('coin-count'), element('coin-target'), () => audio.coin());
const panels = ['ready', 'result', 'pause', 'countdown'] as const;
type Panel = typeof panels[number];
let mode: Panel | 'playing' = 'ready';
let ready = false;
let resultTimer: ReturnType<typeof setTimeout> | undefined;
let lastEntryId: string | undefined;
let disposed = false;
let resumeAfterMenu = false;

let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Session scores still work. */ }
const preferences = loadRunnerPreferences(storage);
const board = new RunnerLeaderboard(storage);
const music = new RunnerMusic(musicTrack, preferences.musicEnabled, preferences.musicVolume / 100);
let best = board.best;
let language: RunnerLanguage = preferences.language;
audio.setMuted(!preferences.effectsEnabled);
audio.setVolume(preferences.effectsVolume / 100);

function t(key: Parameters<typeof runnerText>[1]): string { return runnerText(language, key); }

function savePreferences(): void { saveRunnerPreferences(storage, preferences); }

function applyLanguage(): void {
  document.documentElement.lang = language;
  document.title = `${t('title')} · TailLabs TL002`;
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n as Parameters<typeof runnerText>[1];
    node.textContent = t(key);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const key = node.dataset.i18nAria as Parameters<typeof runnerText>[1];
    node.setAttribute('aria-label', t(key));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === language));
  }
  renderSoundPreference();
  scoreLabel.innerHTML = `${scene.model.score.toLocaleString('en-US')}<small>${t('points')}</small>`;
  previousScore = scene.model.score;
  updateStorageNotice();
  if (boardDialog.open) renderBoard();
  scene?.setAccessibleLabel(t('canvasLabel'));
  renderGateFeedback();
}

function renderGateFeedback(): void {
  const reason = scene.model.gateFailure;
  const title = element('result-title');
  const titleKey = reason === 'early' ? 'gateEarly' : 'caught';
  title.dataset.i18n = titleKey;
  title.textContent = t(titleKey);
  const feedback = element('result-gate-feedback');
  feedback.hidden = reason !== 'late';
  feedback.textContent = reason === 'late' ? t('gateLate') : '';
}

function updateGateCue(model: RunnerModel): void {
  const gate = model.activeGate ?? model.gates.find((item) => item.opened && model.elapsed - item.openedAt! < 0.6);
  gateCue.hidden = mode !== 'playing' || model.phase !== 'running' || !gate;
  let state = 'none';
  if (gate) {
    if (gate.windowSeconds !== cueWindowSeconds) {
      const window = gateCueWindow(gate);
      gateCue.style.setProperty('--gate-window-left', `${window.left * 100}%`);
      gateCue.style.setProperty('--gate-window-width', `${window.width * 100}%`);
      gateCue.style.setProperty('--gate-early-left', `${window.earlyLeft * 100}%`);
      gateCue.style.setProperty('--gate-early-width', `${window.earlyWidth * 100}%`);
      gateCue.style.setProperty('--gate-late-left', `${window.lateLeft * 100}%`);
      gateCue.style.setProperty('--gate-late-width', `${window.lateWidth * 100}%`);
      cueWindowSeconds = gate.windowSeconds;
    }
    const judgement = gateJudgement(gate, model.elapsed);
    state = gate.opened ? 'open' : gate.pendingFailure ? 'missed' : judgement === 'safe' ? 'safe' : judgement === 'open' ? 'hit' : 'waiting';
    gateCue.dataset.state = state;
    const label = t(gate.opened ? 'gateOpen' : gate.pendingFailure === 'late' ? 'gateLate'
      : gate.pendingFailure === 'missed' ? 'gateMissed' : state === 'safe' ? 'gateSafe' : state === 'hit' ? 'gateNow' : 'gateWait');
    if (gateLabel.textContent !== label) gateLabel.textContent = label;
    gateMarker.style.transform = `translateX(${gateProgress(gate, model.elapsed) * gateTrackWidth}px)`;
  }
  stage.dataset.gateState = state;
  stage.dataset.gatesOpened = String(model.gatesOpened);
  stage.dataset.gateFailure = model.gateFailure ?? '';
  stage.dataset.gatePendingFailure = gate?.pendingFailure ?? '';
  stage.dataset.gateWindow = gate ? gate.windowSeconds.toFixed(4) : '';
}

function renderSoundPreference(): void {
  const setSwitch = (button: string, state: string, checked: boolean): void => {
    element(button).setAttribute('aria-checked', String(checked));
    element(state).textContent = checked ? t('on') : t('off');
  };
  setSwitch('music-toggle', 'music-state', preferences.musicEnabled);
  setSwitch('effects-toggle', 'effects-state', preferences.effectsEnabled);
  setSwitch('power-toggle', 'power-state', preferences.lowPower);
  element<HTMLInputElement>('music-volume').value = String(preferences.musicVolume);
  element<HTMLInputElement>('effects-volume').value = String(preferences.effectsVolume);
}

function updateStorageNotice(): void {
  element('board-storage-note').textContent = board.persistent ? t('localTopTen') : t('temporaryBoard');
}

function showPanel(panel?: Panel): void {
  mode = panel ?? 'playing';
  overlay.hidden = !panel;
  for (const name of panels) element(`${name}-panel`).hidden = name !== panel;
  overlay.classList.toggle('is-counting', panel === 'countdown');
}

function focusGame(): void { stage.querySelector('canvas')?.focus({ preventScroll: true }); }

function beginCountdown(): void {
  scene.setPaused(true); audio.setPaused(true);
  countdown.start(performance.now());
  countdownLabel.textContent = '2';
  showPanel('countdown');
  focusGame();
}

function startRun(): void {
  if (!ready || mode !== 'ready' || boardDialog.open || menuDialog.open || document.hidden) return;
  audio.unlock();
  clearTimeout(resultTimer);
  coinFx.reset(); scene.startRun();
  beginCountdown();
}

function returnToReady(): void {
  if (!ready) return;
  clearTimeout(resultTimer);
  countdown.cancel(); resumeAfterMenu = false;
  menuDialog.close(); boardDialog.close();
  audio.setPaused(true); coinFx.reset(); scene.resetToReady();
  showPanel('ready');
  element('start-button').focus({ preventScroll: true });
}

function pauseRun(): void {
  if (!ready || scene.model.phase !== 'running') return;
  countdown.cancel();
  scene.setPaused(true); audio.setPaused(true);
  showPanel('pause');
}

function resumeRun(): void {
  if (!ready || scene.model.phase !== 'running' || boardDialog.open || menuDialog.open || document.hidden) return;
  audio.unlock();
  beginCountdown();
}

function action(): void {
  if (!ready || boardDialog.open || menuDialog.open) return;
  if (mode === 'pause') resumeRun();
  else if (mode === 'playing') scene.model.jump();
  // Ready/results require their explicit button; countdown input is discarded.
}

function renderBoard(): void {
  const list = element('board-list');
  list.replaceChildren();
  const entries = board.top();
  best = entries[0]?.score ?? 0;
  if (!entries.length) {
    const empty = document.createElement('li'); empty.className = 'empty';
    empty.textContent = t('noRecords'); list.append(empty);
  }
  for (const entry of entries) {
    const row = document.createElement('li');
    if (entry.id === lastEntryId) row.className = 'current-entry';
    const score = document.createElement('span'); score.className = 'entry-score';
    score.textContent = `${entry.score.toLocaleString('en-US')} ${t('points')}`;
    const detail = document.createElement('span'); detail.className = 'entry-detail';
    detail.textContent = `${(entry.elapsedMilliseconds / 1000).toFixed(1)}s / ${entry.coins ?? 0} ${t('coins')} / ${entry.distance.toLocaleString('en-US')}m`;
    row.append(score, detail); list.append(row);
  }
  updateStorageNotice();
}

function openBoard(): void {
  resumeAfterMenu = false; menuDialog.close();
  pauseRun(); renderBoard();
  if (!boardDialog.open) boardDialog.showModal();
}

function openMenu(): void {
  if (menuDialog.open || boardDialog.open) return;
  showMenuPage(false);
  resumeAfterMenu = ready && scene.model.phase === 'running' && (mode === 'playing' || mode === 'countdown');
  pauseRun(); menuButton.setAttribute('aria-expanded', 'true'); menuDialog.showModal();
}

function showMenuPage(showCredits: boolean): void {
  menuContent.hidden = showCredits;
  creditsContent.hidden = !showCredits;
  const title = element<HTMLHeadingElement>('menu-title');
  title.dataset.i18n = showCredits ? 'credits' : 'menu';
  title.textContent = t(showCredits ? 'credits' : 'menu');
  element<HTMLButtonElement>(showCredits ? 'credits-back-button' : 'credits-button').focus({ preventScroll: true });
}

let previousDistance = -1, previousScore = -1, previousMultiplier = -1;
let statsTime = 0;
let lastSkyLabel = '';
function updateFrame(model: RunnerModel, dt: number): void {
  if (mode === 'countdown') {
    const label = countdown.label(performance.now());
    if (label) { if (countdownLabel.textContent !== label) countdownLabel.textContent = label; }
    else {
      scene.setPaused(false); audio.setPaused(false);
      showPanel(); music.afterCountdown(); focusGame();
    }
  }
  coinFx.update(dt, model);
  updateGateCue(model);
  if (model.distance !== previousDistance) {
    distanceLabel.innerHTML = `${model.distance.toLocaleString('en-US')}<small>m</small>`;
    previousDistance = model.distance;
  }
  if (model.score !== previousScore) {
    scoreLabel.innerHTML = `${model.score.toLocaleString('en-US')}<small>${t('points')}</small>`;
    previousScore = model.score;
  }
  if (model.multiplier !== previousMultiplier) {
    multiplierLabel.textContent = `×${model.multiplier.toFixed(2)}`;
    previousMultiplier = model.multiplier;
  }
  stage.dataset.phase = mode === 'countdown' ? 'countdown' : scene.paused ? 'paused' : model.phase;
  stage.dataset.countdown = mode === 'countdown' ? countdownLabel.textContent ?? '' : '';
  stage.dataset.grounded = String(model.motor.grounded);
  stage.dataset.jumpsUsed = String(model.motor.jumpsUsed);
  stage.dataset.runnerFrame = scene.currentArtFrame;
  stage.dataset.coins = String(model.coinsCollected);
  stage.dataset.score = String(model.score);
  stage.dataset.multiplier = String(model.multiplier);
  stage.dataset.elapsed = model.elapsed.toFixed(3);
  stage.dataset.audio = JSON.stringify(audio.snapshot());
  stage.dataset.platformLandings = String(model.platformLandings);
  // Readable diagnostics for the visible next challenge, also useful for TL002 acceptance.
  const next = [...model.obstacles, ...model.platforms].filter((item) => item.x + item.width > RUNNER.playerX - RUNNER.playerWidth / 2)
    .sort((a, b) => a.x - b.x)[0];
  stage.dataset.nextChallenge = next ? JSON.stringify({ kind: 'kind' in next ? next.kind : 'platform',
    seconds: (next.x - RUNNER.playerX - RUNNER.playerWidth / 2) / model.speed }) : '';
  if (lastSkyLabel !== scene.sky.label) { stage.dataset.sky = scene.sky.label; lastSkyLabel = scene.sky.label; }
  statsTime += dt;
  if (statsTime >= 0.5) {
    stage.dataset.performance = JSON.stringify({ ...scene.performanceSnapshot(), fxActive: coinFx.pool.activeCount,
      fxCapacity: coinFx.pool.slots.length, fxPeak: coinFx.pool.peak, fxOverflow: coinFx.pool.skippedAnimations });
    statsTime = 0;
  }
}

function endRun(model: RunnerModel): void {
  audio.collision(); countdown.cancel();
  const previousBest = best;
  lastEntryId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  board.save({ id: lastEntryId, distance: model.distance, score: model.score, multiplier: model.multiplier,
    elapsedMilliseconds: Math.round(model.elapsed * 1000), coins: model.coinsCollected, createdAt: new Date().toISOString() });
  best = board.best; updateStorageNotice();
  element('result-score').textContent = model.score.toLocaleString('en-US');
  element('result-multiplier').textContent = `×${model.multiplier.toFixed(2)}`;
  element('result-kicker').hidden = model.score <= previousBest;
  element('result-coins').textContent = model.coinsCollected.toLocaleString('en-US');
  element('result-distance').textContent = model.distance.toLocaleString('en-US');
  element('result-time').textContent = model.elapsed.toFixed(1);
  element('result-best').textContent = best.toLocaleString('en-US');
  renderGateFeedback();
  resultTimer = setTimeout(() => {
    if (disposed) return;
    audio.failure();
    showPanel('result');
    if (!boardDialog.open && !menuDialog.open) element('restart-button').focus({ preventScroll: true });
  }, 400);
}

// Local-only art preview; production always starts at daylight without a time offset.
const skyPreview = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('skyTime') ?? 0) : 0;
const scene = new RunnerScene({ frame: updateFrame, ended: endRun,
  collected: (coin, model) => coinFx.collect(coin, model), jumped: (air) => audio.jump(air) }, Number.isFinite(skyPreview) ? skyPreview : 0);
scene.setPowerSaving(preferences.lowPower);
scene.setAccessibleLabel(t('canvasLabel'));
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: stage,
  width: window.matchMedia('(max-width: 640px)').matches ? 680 : 960,
  height: RUNNER.height, backgroundColor: '#f4ead7', scene,
  fps: { target: preferences.lowPower ? 30 : 60, limit: preferences.lowPower ? 30 : 60 },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  input: { keyboard: false, mouse: false, touch: false }, audio: { noAudio: true },
});

applyLanguage();
renderSoundPreference();

function setFrameRate(lowPower: boolean): void {
  const loop = game.loop as unknown as {
    running: boolean; targetFps: number; fpsLimit: number; hasFpsLimit: boolean;
    _target: number; _limitRate: number; sleep(): void; wake(seamless?: boolean): void;
  };
  const fps = lowPower ? 30 : 60;
  if (loop.targetFps === fps && loop.fpsLimit === fps) return;
  const wasRunning = loop.running;
  if (wasRunning) loop.sleep();
  loop.targetFps = fps; loop.fpsLimit = fps; loop.hasFpsLimit = true;
  loop._target = 1000 / fps; loop._limitRate = 1000 / fps;
  if (wasRunning) loop.wake(true);
}

game.events.once('runner-ready', () => {
  ready = true; loading.hidden = true; showPanel('ready'); resizeGame();
});

function resizeGame(): void {
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const width = Math.round(Math.max(680, Math.min(1240, rect.width / rect.height * RUNNER.height)));
  if (game.scale.width !== width) game.scale.setGameSize(width, RUNNER.height);
  game.scale.refresh(); coinFx.measure(game.canvas, game.scale.width, RUNNER.height);
  // The cue has a fixed maximum width, so measurement does not depend on hidden state.
  gateTrackWidth = Math.max(0, Math.min(280, rect.width - 32) - 34);
}
const resizeObserver = new ResizeObserver(() => { if (ready) resizeGame(); });
resizeObserver.observe(stage);

const controls = new AbortController();
const signal = controls.signal;
element('start-button').addEventListener('click', startRun, { signal });
element('restart-button').addEventListener('click', returnToReady, { signal });
element('resume-button').addEventListener('click', resumeRun, { signal });
menuButton.addEventListener('click', openMenu, { signal });
element('close-menu-button').addEventListener('click', () => menuDialog.close(), { signal });
element('credits-button').addEventListener('click', () => showMenuPage(true), { signal });
element('credits-back-button').addEventListener('click', () => showMenuPage(false), { signal });
element('menu-return-button').addEventListener('click', () => {
  resumeAfterMenu = ready && scene.model.phase === 'running';
  audio.unlock(); menuDialog.close();
}, { signal });
element('menu-restart-button').addEventListener('click', returnToReady, { signal });
menuDialog.addEventListener('close', () => {
  menuButton.setAttribute('aria-expanded', 'false');
  const resume = resumeAfterMenu; resumeAfterMenu = false;
  if (resume) resumeRun();
}, { signal });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language]')) {
  button.addEventListener('click', () => {
    const next = button.dataset.language;
    if (next !== 'zh-Hant' && next !== 'en' && next !== 'ja') return;
    language = preferences.language = next;
    applyLanguage(); savePreferences();
  }, { signal });
}
element<HTMLInputElement>('music-volume').addEventListener('input', (event) => {
  preferences.musicVolume = Number((event.currentTarget as HTMLInputElement).value);
  music.setVolume(preferences.musicVolume / 100);
}, { signal });
element<HTMLInputElement>('music-volume').addEventListener('change', savePreferences, { signal });
element<HTMLInputElement>('effects-volume').addEventListener('input', (event) => {
  preferences.effectsVolume = Number((event.currentTarget as HTMLInputElement).value);
  audio.setVolume(preferences.effectsVolume / 100);
}, { signal });
element<HTMLInputElement>('effects-volume').addEventListener('change', savePreferences, { signal });
element('music-toggle').addEventListener('click', () => {
  preferences.musicEnabled = !preferences.musicEnabled;
  music.setEnabled(preferences.musicEnabled);
  renderSoundPreference(); savePreferences();
}, { signal });
element('effects-toggle').addEventListener('click', () => {
  audio.unlock(); preferences.effectsEnabled = !preferences.effectsEnabled;
  audio.setMuted(!preferences.effectsEnabled);
  renderSoundPreference(); savePreferences();
}, { signal });
element('power-toggle').addEventListener('click', () => {
  preferences.lowPower = !preferences.lowPower;
  scene.setPowerSaving(preferences.lowPower); setFrameRate(preferences.lowPower);
  renderSoundPreference(); savePreferences();
}, { signal });
element('board-button').addEventListener('click', openBoard, { signal });
element('result-board-button').addEventListener('click', openBoard, { signal });
element('close-board-button').addEventListener('click', () => boardDialog.close(), { signal });
for (const dialog of [menuDialog, boardDialog]) dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}, { signal });
stage.parentElement!.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
  event.preventDefault(); action();
}, { signal });
window.addEventListener('keydown', (event) => {
  if (boardDialog.open || menuDialog.open) return;
  if (event.code === 'Escape') { if (mode === 'playing' || mode === 'countdown') pauseRun(); return; }
  if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
  if (event.code === 'Space' && (event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
  event.preventDefault(); if (!event.repeat) action();
}, { signal });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); }, { signal });
window.addEventListener('blur', pauseRun, { signal });
window.addEventListener('scroll', () => { if (ready) coinFx.measure(game.canvas, game.scale.width, RUNNER.height); }, { signal, passive: true });
window.addEventListener('storage', () => { best = board.best; if (boardDialog.open) renderBoard(); }, { signal });

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true; clearTimeout(resultTimer); countdown.cancel(); controls.abort();
  resizeObserver.disconnect(); coinFx.destroy(); audio.destroy(); music.destroy();
  menuDialog.close(); boardDialog.close(); game.destroy(true);
});
