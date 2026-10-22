import './style.css';
import './hud.css';
import './generated/sprites.css';
import { Battlefield } from './Battlefield.ts';
import type { Aim } from './Battlefield.ts';
import { Camera } from './Camera.ts';
import { MERCENARIES, MERC_KINDS } from './Content.ts';
import type { MercKind } from './Content.ts';
import { formatNumber, effectiveCooldown } from './Combat.ts';
import { DefenseRun } from './Run.ts';
import { LocalMetaMirror, META_KEY } from './Meta.ts';
import { TalentScreen } from './TalentScreen.ts';
import { choiceScreen, deployScreen, formatCount, resultScreen } from './Screens.ts';
import type { Report } from './Screens.ts';
import { countUp, motionReduced, pop, setReducedMotion } from './Motion.ts';
import { DefenseAudio, loadAudioPreferences, saveAudioPreferences } from './Audio.ts';
import type { Cue } from './Audio.ts';
import type { VisualEvent } from './Run.ts';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    muted: '<path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    hand: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4c0 4-2.5 7-6 7s-5-1.5-6.5-4L4 13.5a1.5 1.5 0 0 1 2.4-1.8L9 14"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${paths[name] ?? ''}</svg>`;
};
/** A frame of the pixel sprite sheet as an inline icon; size = screen pixels per art pixel. */
const px = (name: string, size = 2) => `<i class="px-icon" data-icon="${name}" style="--px:${size}px" aria-hidden="true"></i>`;
const ELEMENTS = [['kinetic', '動能', 'icon_el_kinetic'], ['fire', '火焰', 'icon_el_fire'], ['bio', '生化', 'icon_el_bio'], ['electric', '電能', 'icon_el_electric']] as const;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main class="stage" aria-labelledby="game-title">
  <h1 id="game-title" class="sr-only">無盡防線 TL003</h1>
  <canvas id="battlefield" aria-label="喪屍由畫面上方遠處逐漸逼近下方拒馬，傭兵在下方自動射擊。選取技能後可在戰場指定目標。" tabindex="0"></canvas>
  <header class="hud-top">
    <div class="hud-wall" aria-label="拒馬生命">${px('icon_fortify', 2)}<div class="hp-bar"><i id="wall-chip" class="hp-chip"></i><i id="wall-fill" class="hp-fill"></i><span id="wall-value">40</span></div></div>
    <div class="hud-clock" aria-label="堅守時間"><strong id="time">00:00</strong><span id="wave">W01</span></div>
    <div class="hud-money" id="money-box" aria-label="資金">${px('icon_money', 2)}<strong id="money">0</strong></div>
    <div class="hud-buttons"><button id="mute" class="icon-button" aria-label="音效開關" aria-pressed="false"></button><button id="pause" class="icon-button" aria-label="暫停遊戲" disabled>${icon('pause')}</button></div>
  </header>
  <div class="hud-xp" aria-label="戰術等級"><b id="level">1</b><div class="xp-track"><i id="xp-fill"></i></div></div>
  <div id="boss-banner" class="boss-banner" role="status" hidden>${px('icon_wave', 2)}<div><strong id="boss-title">屍王</strong><div class="boss-track"><i id="boss-fill"></i></div></div><span id="boss-detail"></span></div>
  <div id="toast" class="toast" aria-hidden="true"></div>
  <nav class="hud-bottom" aria-label="傭兵與防守">
    <button id="repair" class="side-action" aria-label="修復拒馬">${px('icon_repair', 2)}<span class="cost">${px('icon_money', 1)}<span id="repair-cost">6</span></span></button>
    <div class="squad">${MERC_KINDS.map((kind, index) => {
      const m = MERCENARIES[kind];
      return `<div class="unit" data-kind="${kind}" style="--merc-color:${m.color}">
        <button class="orb" id="skill-${kind}" aria-label="${m.name}：${m.skill}，按住拖曳至戰場" data-key="${index + 1}">
          <span class="orb-ring"></span><span class="orb-face">${px('icon_skill_' + kind, 3)}</span><span class="orb-portrait">${px('icon_merc_' + kind, 3)}</span>
          <span class="orb-level" id="level-${kind}">1</span><span class="orb-time" id="cooldown-${kind}"></span>
        </button>
        <button class="chip" id="buy-${kind}" aria-label="招募或升級${m.name}"><span class="chip-sign" id="buy-sign-${kind}">+</span>${px('icon_money', 1)}<span id="buy-label-${kind}"></span></button>
      </div>`;
    }).join('')}</div>
    <button id="fortify" class="side-action" aria-label="補強拒馬">${px('icon_fortify', 2)}<span class="cost">${px('icon_money', 1)}<span id="fortify-cost">10</span></span></button>
  </nav>
  <div id="drag-hint" class="drag-hint" hidden>${icon('hand')}</div>
</main>
<div class="rotate-hint" aria-hidden="true"><div class="rotate-phone"></div><p>請將手機轉為直向</p></div>
<p id="announcement" class="sr-only" aria-live="polite"></p>
<dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => { const node = el(id); if (node.textContent !== value) node.textContent = value; };
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Memory-only fallback. */ }
const MOTION_KEY = 'taillabs.tl003.motion.v1', HINT_KEY = 'taillabs.tl003.hint.v1', TIPS_KEY = 'taillabs.tl003.tips.v1';
const readFlag = (key: string) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const writeFlag = (key: string, value: string) => { try { storage?.setItem(key, value); } catch { /* convenience only */ } };
let reducedMotion = readFlag(MOTION_KEY) === null ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false : readFlag(MOTION_KEY) === '1';
const meta = new LocalMetaMirror(storage);
const audioPreferences = loadAudioPreferences(storage);
const audio = new DefenseAudio(audioPreferences);
let run = new DefenseRun(undefined, meta.effects), aim: Aim | undefined;
/** Last pointer position while aiming: the aim is re-projected every frame because the camera moves. */
let aimClient: { x: number; y: number } | undefined;
const battlefield = new Battlefield(el<HTMLCanvasElement>('battlefield'));
const camera = new Camera();
const applyMotion = () => { camera.reducedMotion = battlefield.reducedMotion = reducedMotion; setReducedMotion(reducedMotion); document.documentElement.classList.toggle('reduce-motion', reducedMotion); };
applyMotion();
const dialog = el<HTMLDialogElement>('modal');
const talents = new TalentScreen(dialog, meta, {
  close: () => { if (run.phase === 'ready') newRun(); displayedPhase = ''; sync(); },
  deploy: () => startRun(),
});
let displayedPhase = '', previous = performance.now(), uiClock = 0, shownMoney = 0;
/** A pick can level up again at once: each level's choice is its own screen. */
let cuedRun: DefenseRun | undefined, cuedKey = '';
const phaseKey = () => run.phase === 'choice' ? `choice:${run.level}` : run.phase;
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function newRun() { run = new DefenseRun(undefined, meta.effects); camera.reset(); battlefield.clear(); shownMoney = 0; resetWatchers(); }
function reset() { meta.refresh(); aim = undefined; newRun(); displayedPhase = ''; sync(); }
function startRun() {
  if (!meta.beginRun()) return;
  writeFlag(TIPS_KEY, '1');
  aim = undefined; newRun(); run.start(); displayedPhase = ''; sync();
  battlefield.mercArrived(0);
}
battlefield.feedback.onCoin = () => { pop(el('money-box'), 1.14, 140); audio.play('coin'); };

/** `kind` picks the overlay style (screens.css); the first button gets focus unless `focusFirst` is false. */
function showModal(content: string, kind: string, focusFirst = true) {
  dialog.dataset.kind = kind; dialog.classList.remove('talent-dialog');
  el('modal-content').innerHTML = content; if (!dialog.open) dialog.showModal();
  if (focusFirst) dialog.querySelector<HTMLButtonElement>('button')?.focus();
  else { const title = el('modal-title'); title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
// ---------- level-up choice ----------
let choiceResolving = false;
function showChoice() {
  choiceResolving = false;
  showModal(choiceScreen(run.level, run.choices), 'choice', false);
  const screen = dialog.querySelector<HTMLElement>('.choice-screen')!, detail = el('pick-detail');
  // Input is locked while the cards fly in, so a tap meant for the battlefield can't pick one.
  screen.classList.add('locked'); setTimeout(() => screen.classList.remove('locked'), motionReduced() ? 0 : 660);
  const cards = [...dialog.querySelectorAll<HTMLElement>('.pick-card')];
  cards.forEach((card, i) => {
    card.style.setProperty('--tilt', `${(i - 1) * 4}deg`);
    const button = card.querySelector<HTMLButtonElement>('.pick')!, info = card.querySelector<HTMLButtonElement>('.pick-info')!;
    const show = () => {
      detail.textContent = run.choices[i]?.description ?? '';
      cards.forEach((other, j) => other.querySelector('.pick-info')!.setAttribute('aria-expanded', String(i === j)));
    };
    info.onclick = () => { if (info.getAttribute('aria-expanded') === 'true') { detail.textContent = ''; info.setAttribute('aria-expanded', 'false'); } else show(); };
    button.addEventListener('mouseenter', show); button.addEventListener('focus', () => { if (button.matches(':focus-visible')) show(); });
    button.onclick = () => resolveChoice(i);
  });
}
function resolveChoice(index: number) {
  const screen = dialog.querySelector<HTMLElement>('.choice-screen');
  const card = run.choices[index];
  if (!screen || !card || choiceResolving || screen.classList.contains('locked') || run.phase !== 'choice') return;
  choiceResolving = true; screen.classList.add('resolved'); audio.play('pick');
  dialog.querySelectorAll('.pick-card').forEach((node, i) => node.classList.add(i === index ? 'chosen' : 'dismissed'));
  const owner = run, level = run.level;
  setTimeout(() => {
    try {
      if (run !== owner || run.level !== level || run.phase !== 'choice') return;
      if (run.choose(card.id)) pop(el('level'), 1.6, 320);
      if (document.hidden || !document.hasFocus()) run.pause();
    } finally { choiceResolving = false; sync(); }
  }, motionReduced() ? 0 : 400);
}
// ---------- battle report ----------
/** One report per run: coming back from the star map shows it again without replaying the count-up. */
let report: { run: DefenseRun; data: Report } | undefined;
function showReport() {
  const first = report?.run !== run;
  if (first) {
    const previousBest = meta.value.HighestClearedWave;
    meta.settle(run, run.score, run.clearedWave);
    report = { run, data: {
      victory: run.phase === 'victory', elapsed: run.elapsed, kills: run.kills, income: run.totalEarnedMoney,
      points: run.score, timePoints: Math.floor(run.elapsed / 30), incomePoints: Math.floor(Math.log10(run.totalEarnedMoney + 1)),
      bestWave: meta.value.HighestClearedWave, previousBest, persistent: meta.persistent,
    } };
  }
  const data = report!.data;
  showModal(resultScreen(data), 'result');
  el('result-talents').onclick = () => talents.open();
  el('retry').onclick = reset;
  const points = el('result-points');
  if (!first) {
    dialog.querySelector('.result-screen')!.classList.add('settled');
    dialog.querySelectorAll<HTMLElement>('[data-count]').forEach(node => { node.textContent = formatCount(node.dataset.format)(Number(node.dataset.count)); });
    points.textContent = `+${data.points}`; return;
  }
  dialog.querySelectorAll<HTMLElement>('[data-count]').forEach((node, i) => {
    void countUp(node, 0, Number(node.dataset.count), { delay: 300 + i * 110, duration: 700, format: formatCount(node.dataset.format) });
  });
  void countUp(points, 0, data.points, { delay: 950, duration: Math.min(900, 200 + data.points * 60), format: v => `+${Math.round(v)}`, onTick: () => audio.play('coin') })
    .then(() => { if (!points.isConnected) return; pop(points, 1.3, 320); if (data.points > 0) audio.play('buy'); });
}
function pauseMenu() {
  const counts = ELEMENTS.map(([id, name, iconName]) => `<span class="${id}" title="${name}">${px(iconName, 2)}<b>${run.selectedCards.filter(c => c.category === name).length}</b></span>`).join('');
  const cards = run.selectedCards.length ? run.selectedCards.map(c => `<span title="${c.name}">${px('icon_card_' + c.id, 2)}</span>`).join('') : '<small>—</small>';
  showModal(`<div class="modal-kicker">暫停</div><h2 id="modal-title">暫停防守</h2>
    <div class="pause-build"><div class="pause-elements">${counts}</div><div class="pause-cards">${cards}</div></div>
    <div class="settings">
      <div class="setting"><span>音量</span><span class="volume-control"><button id="mute-menu" class="icon-button" type="button" aria-label="音效開關"></button><input id="volume" type="range" min="0" max="100" step="5" aria-label="音效音量"></span></div>
      <label class="setting"><span>減少畫面晃動</span><input id="motion" type="checkbox" ${reducedMotion ? 'checked' : ''}></label>
    </div>
    <button id="resume" class="primary">返回戰場 <span>→</span></button>`, 'pause');
  el('resume').onclick = () => { run.resume(); sync(); }; el('resume').focus();
  el('mute-menu').onclick = toggleMute;
  const volume = el<HTMLInputElement>('volume');
  volume.addEventListener('input', () => {
    audioPreferences.volume = Number(volume.value);
    if (audioPreferences.muted && audioPreferences.volume > 0) { audioPreferences.muted = false; audio.setMuted(false); }
    audio.unlock(); audio.setVolume(audioPreferences.volume); syncVolume();
  });
  volume.addEventListener('change', () => { saveAudioPreferences(audioPreferences, storage); audio.play('pick'); });
  el<HTMLInputElement>('motion').onchange = event => { reducedMotion = (event.currentTarget as HTMLInputElement).checked; writeFlag(MOTION_KEY, reducedMotion ? '1' : '0'); applyMotion(); };
  syncVolume();
}
function syncPhase() {
  if (talents.active) return;
  if (displayedPhase === phaseKey()) return;
  displayedPhase = phaseKey(); aim = undefined;
  if (cuedRun !== run || cuedKey !== displayedPhase) {
    cuedRun = run; cuedKey = displayedPhase;
    if (run.phase === 'choice') audio.play('levelUp');
    if (run.phase === 'over') audio.play('gameOver');
    if (run.phase === 'victory') audio.play('victory');
  }
  text('announcement', run.phase === 'choice' ? '戰術升級，請選擇一張強化。' : run.phase === 'over' ? '防線失守，本局結束。' : run.phase === 'running' ? '防守開始。' : '');
  if (run.phase === 'ready') {
    showModal(deployScreen(meta.effects, meta.value.TalentPoints, meta.value.HighestClearedWave, !readFlag(TIPS_KEY)), 'deploy');
    el('start').onclick = startRun;
    el('open-talents').onclick = () => talents.open();
  } else if (run.phase === 'choice') {
    showChoice();
  } else if (run.phase === 'paused') {
    pauseMenu();
  } else if (run.phase === 'over' || run.phase === 'victory') {
    showReport();
  } else if (dialog.open) dialog.close();
}

// ---------- HUD ----------
const wasReady: Record<MercKind, boolean> = { rifle: false, flame: false, tesla: false };
const wasAffordable: Record<MercKind, boolean> = { rifle: false, flame: false, tesla: false };
let shownWave = 0, shownLevel = 1;
function toast(html: string, tone = '') {
  const node = el('toast'); node.className = `toast ${tone}`; node.innerHTML = html;
  void node.offsetWidth; node.classList.add('show');
}
function sync() {
  syncPhase();
  el<HTMLButtonElement>('pause').disabled = run.phase !== 'running' && run.phase !== 'paused';
  audio.setPaused(run.phase === 'paused');
  const wallRatio = Math.max(0, run.wallHealth / run.wallMaxHealth);
  text('wall-value', formatNumber(Math.ceil(run.wallHealth)));
  el('wall-fill').style.width = `${100 * wallRatio}%`; el('wall-chip').style.width = `${100 * wallRatio}%`;
  el('wall-fill').closest('.hud-wall')!.classList.toggle('critical', wallRatio < 0.3);
  text('wave', `W${run.wave.toString().padStart(2, '0')}`); text('time', clock(run.elapsed));
  text('level', run.level.toString()); el('xp-fill').style.width = `${Math.min(100, run.xp / run.xpNeeded * 100)}%`;
  if (run.phase === 'running' && run.wave !== shownWave) {
    if (shownWave && run.wave > shownWave) toast(`<small>WAVE</small><b>${run.wave.toString().padStart(2, '0')}</b>`);
    shownWave = run.wave;
  }
  if (run.level !== shownLevel) { if (run.level > shownLevel) pop(el('level'), 1.5, 300); shownLevel = run.level; }
  syncBoss();
  for (const kind of MERC_KINDS) {
    const slot = run.mercenaries.findIndex(m => m.kind === kind), merc = run.mercenaries[slot];
    const buy = el<HTMLButtonElement>(`buy-${kind}`), skill = el<HTMLButtonElement>(`skill-${kind}`), unit = skill.parentElement!;
    const cost = merc ? run.upgradeCost(kind) : run.recruitCost(kind);
    const full = !merc && run.mercenaries.length >= 3;
    text(`level-${kind}`, run.levels[kind].toString());
    text(`buy-sign-${kind}`, merc ? '▲' : '+'); text(`buy-label-${kind}`, formatNumber(cost));
    const affordable = run.phase === 'running' && visibleMoney() >= cost && !full;
    buy.disabled = !affordable;
    if (affordable && !wasAffordable[kind]) pop(buy, 1.12, 220);
    wasAffordable[kind] = affordable;
    unit.classList.toggle('recruited', !!merc); unit.classList.toggle('locked', !merc);
    const total = effectiveCooldown(MERCENARIES[kind].cooldown, run.haste), ready = run.phase === 'running' && !!merc && merc.cooldown <= 0;
    skill.disabled = run.phase !== 'running' || (!merc && !affordable);
    skill.classList.toggle('ready', ready); skill.classList.toggle('aiming', !!merc && !!aim && aim.slot === slot);
    skill.style.setProperty('--cd', merc ? (merc.cooldown / total).toFixed(3) : '1');
    text(`cooldown-${kind}`, merc && merc.cooldown > 0 ? Math.ceil(merc.cooldown).toString() : '');
    if (ready && !wasReady[kind]) { if (shownWave) { pop(skill, 1.15, 260); audio.play('ready'); } maybeHint(skill); }
    wasReady[kind] = ready;
  }
  for (const action of ['repair', 'fortify'] as const) {
    const cost = action === 'repair' ? run.repairCost : run.fortifyCost;
    text(`${action}-cost`, formatNumber(cost));
    el<HTMLButtonElement>(action).disabled = run.phase !== 'running' || visibleMoney() < cost || (action === 'repair' && run.wallHealth >= run.wallMaxHealth);
  }
}
/** The run's money minus coins still flying in: what the counter shows and what buttons offer. */
const visibleMoney = () => Math.max(0, run.money - battlefield.feedback.pending);
/** Money counter ticks towards the visible money. */
function tickMoney(dt: number) {
  const target = visibleMoney();
  shownMoney = target < shownMoney ? target : shownMoney + (target - shownMoney) * (1 - Math.exp(-dt * 14));
  if (Math.abs(target - shownMoney) < 0.5) shownMoney = target;
  text('money', formatNumber(Math.floor(shownMoney + 1e-6)));
}
let bossAnnounced = 0;
function syncBoss() {
  const banner = el('boss-banner'), boss = run.boss, warning = run.bossWarning;
  const active = run.phase !== 'ready' && (boss !== undefined || warning !== undefined);
  if (banner.hidden === active) banner.hidden = !active;
  if (!active) return;
  banner.classList.toggle('incoming', !boss);
  if (boss) {
    text('boss-title', '屍王'); text('boss-detail', `${Math.ceil(100 * boss.hp / boss.maxHp)}%`);
    el('boss-fill').style.width = `${Math.max(0, 100 * boss.hp / boss.maxHp)}%`;
  } else {
    text('boss-title', '屍王逼近'); text('boss-detail', Math.ceil(warning!).toString()); el('boss-fill').style.width = '100%';
    // One screen-reader announcement per rush, not one per UI tick.
    if (bossAnnounced !== run.nextBossAt) { bossAnnounced = run.nextBossAt; text('announcement', '屍王即將帶隊衝鋒。'); }
  }
}
/** First ready skill ever: a hand drags from the button into the field, until the player casts once. */
function maybeHint(skill: HTMLElement) {
  if (readFlag(HINT_KEY) || run.phase !== 'running') return;
  const hint = el('drag-hint'), r = skill.getBoundingClientRect(), stage = el('battlefield').getBoundingClientRect();
  hint.style.left = `${r.left + r.width / 2 - stage.left}px`; hint.style.top = `${r.top + r.height / 2 - stage.top}px`; hint.hidden = false;
}
function hideHint() { if (!el('drag-hint').hidden) { el('drag-hint').hidden = true; writeFlag(HINT_KEY, '1'); } }

function cast(slot: number, x: number, y: number) { if (run.cast(slot, x, y)) hideHint(); }
el('pause').onclick = () => { if (run.phase === 'paused') run.resume(); else run.pause(); sync(); };
el('repair').onclick = () => { if (run.repair()) { audio.play('buy'); pop(el('wall-value'), 1.3, 220); } sync(); };
el('fortify').onclick = () => { if (run.fortify()) { audio.play('buy'); pop(el('wall-value'), 1.3, 220); } sync(); };
dialog.addEventListener('close', () => {
  if (talents.active) talents.close();
  else if (run.phase !== 'running') { displayedPhase = ''; sync(); }
});
dialog.addEventListener('cancel', e => { e.preventDefault(); if (talents.active) talents.close(); else if (run.phase === 'paused') { run.resume(); sync(); } });
window.addEventListener('storage', event => {
  if (event.key !== META_KEY && event.key !== null) return;
  meta.refresh(); if (talents.active) talents.render(); else if (run.phase === 'ready') reset();
});
function buyOrRecruit(kind: MercKind) {
  const had = run.mercenaries.some(m => m.kind === kind);
  if (had ? run.upgrade(kind) : run.recruit(kind)) {
    audio.play('buy'); const slot = run.mercenaries.findIndex(m => m.kind === kind);
    if (had) { battlefield.mercLeveled(slot); pop(el(`level-${kind}`), 1.6, 300); } else battlefield.mercArrived(slot);
    pop(el(`skill-${kind}`), 1.1, 200);
  }
  sync();
}
for (const kind of MERC_KINDS) {
  el(`buy-${kind}`).onclick = () => buyOrRecruit(kind);
  const button = el<HTMLButtonElement>(`skill-${kind}`); let down: { x: number; y: number; id: number } | undefined;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    const slot = run.mercenaries.findIndex(m => m.kind === kind);
    if (slot < 0) { buyOrRecruit(kind); return; }
    if (run.mercenaries[slot]!.cooldown > 0) return;
    event.preventDefault(); down = { x: event.clientX, y: event.clientY, id: event.pointerId }; button.setPointerCapture(event.pointerId);
    aim = { slot, ...battlefield.point(event.clientX, event.clientY) }; aimClient = { x: event.clientX, y: event.clientY };
  });
  button.addEventListener('pointermove', event => { if (down && aim && event.pointerId === down.id) { aimClient = { x: event.clientX, y: event.clientY }; Object.assign(aim, battlefield.point(event.clientX, event.clientY)); } });
  button.addEventListener('pointerup', event => {
    if (!down || event.pointerId !== down.id || !aim) return;
    const point = battlefield.point(event.clientX, event.clientY), wasClick = Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8;
    if (point.valid) { cast(aim.slot, point.x, point.y); aim = undefined; }
    else if (wasClick) { aim = { slot: aim.slot, x: 470, y: 235, valid: true }; aimClient = undefined; el('battlefield').focus(); }
    else aim = undefined;
    down = undefined; if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); sync();
  });
  button.addEventListener('pointercancel', () => { down = undefined; aim = undefined; sync(); });
  button.addEventListener('click', event => {
    if (event.detail !== 0 || button.disabled) return;
    const slot = run.mercenaries.findIndex(m => m.kind === kind);
    if (slot < 0) buyOrRecruit(kind);
    else if (run.mercenaries[slot]!.cooldown <= 0) { aim = { slot, x: 470, y: 235, valid: true }; el('battlefield').focus(); sync(); }
  });
}
el('battlefield').addEventListener('pointermove', event => { if (aim) { aimClient = { x: event.clientX, y: event.clientY }; Object.assign(aim, battlefield.point(event.clientX, event.clientY)); } });
el('battlefield').addEventListener('pointerup', event => { if (!aim) return; const point = battlefield.point(event.clientX, event.clientY); if (point.valid) cast(aim.slot, point.x, point.y); aim = undefined; sync(); });
window.addEventListener('keydown', event => {
  if (dialog.open) {
    const pick = ['1', '2', '3'].indexOf(event.key);
    if (pick >= 0 && !event.repeat && run.phase === 'choice' && !talents.active) { event.preventDefault(); resolveChoice(pick); }
    return;
  }
  if (event.key === 'Escape') { if (aim) aim = undefined; else run.pause(); sync(); return; }
  const index = ['1', '2', '3'].indexOf(event.key);
  if (index >= 0 && run.phase === 'running') { const kind = MERC_KINDS[index]!, slot = run.mercenaries.findIndex(m => m.kind === kind); if (slot >= 0 && run.mercenaries[slot]!.cooldown <= 0) aim = { slot, x: 470, y: 235, valid: true }; }
  if (aim && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ') { cast(aim.slot, aim.x, aim.y); aim = undefined; }
    else { aim.x = Math.max(0, Math.min(750, aim.x + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0))); aim.y = Math.max(65, Math.min(390, aim.y + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0))); }
  }
  sync();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { aim = undefined; run.pause(); sync(); } previous = performance.now(); });
window.addEventListener('blur', () => { aim = undefined; run.pause(); sync(); });
// A portrait game on a phone held sideways: the rotate hint covers the screen (hud.css) and the battle pauses.
const sideways = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');
const onSideways = () => { if (sideways.matches) { aim = undefined; run.pause(); sync(); } };
sideways.addEventListener('change', onSideways); onSideways();

// ---------- sound + camera reactions to combat ----------
const heard = new WeakSet<VisualEvent>();
let watchedRun: DefenseRun | undefined, lastWall = 0, wallLoss = 0, wallKick = 0, wasWarning = false, lastBossId = 0;
function resetWatchers() { watchedRun = undefined; shownWave = 0; shownLevel = 1; hideToast(); }
function hideToast() { el('toast').classList.remove('show'); }
function cueFor(event: VisualEvent): Cue | undefined {
  if (event.kind === 'shot') return event.color === MERCENARIES.tesla.color ? 'tesla' : 'rifle';
  if (event.kind === 'blast') return event.color === '#e6764b' ? 'molotov' : 'grenade';
  if (event.kind === 'flame' || event.kind === 'laser' || event.kind === 'kill') return event.kind;
  return undefined;
}
/** Turns this frame's new combat events and state changes into sound cues and camera moves. */
function react(realDt: number) {
  if (watchedRun !== run) { watchedRun = run; lastWall = run.wallHealth; wasWarning = false; lastBossId = 0; wallLoss = 0; }
  for (const event of run.events) {
    if (heard.has(event)) continue;
    heard.add(event); const cue = cueFor(event); if (cue) audio.play(cue);
    if (event.kind === 'blast') {
      if (event.color === '#e6764b') { camera.shake(0.22); camera.punch(0.02); }
      else { camera.shake(0.45); camera.punch(0.045); camera.freeze(0.05); }
    } else if (event.kind === 'laser') { camera.shake(0.3); camera.punch(0.03); camera.freeze(0.04); }
    else if (event.kind === 'kill') {
      if (event.enemy === 'boss') { camera.freeze(0.15); camera.slowMotion(0.3, 0.9); camera.shake(0.75); camera.flash(0.7); camera.punch(0.07); }
      else if (event.enemy === 'elite') { camera.freeze(0.06); camera.shake(0.15); }
      else if (event.enemy === 'brute') camera.shake(0.06);
    }
  }
  // The barricade loses health continuously while zombies chew on it: kick in bursts, not every frame.
  if (run.phase === 'running' && run.wallHealth < lastWall - 1e-6) wallLoss += lastWall - run.wallHealth;
  lastWall = run.wallHealth; wallKick += realDt;
  if (wallLoss > 0 && (wallLoss > run.wallMaxHealth * 0.04 || wallKick > 0.7)) {
    audio.play('wall'); camera.shake(Math.min(0.3, 0.08 + wallLoss / run.wallMaxHealth * 2)); camera.hurt(0.7); pop(el('wall-value'), 1.2, 160);
    wallLoss = 0; wallKick = 0;
  }
  const warning = run.bossWarning !== undefined;
  if (warning && !wasWarning) { audio.play('bossWarning'); toast('<small>WARNING</small><b>屍王逼近</b>', 'danger'); }
  wasWarning = warning;
  const boss = run.boss;
  if (boss && boss.id !== lastBossId) {
    lastBossId = boss.id; audio.play('bossArrive');
    const at = battlefield.offsetOf(Math.max(60, boss.x), boss.y); camera.bossIntro(at.x, at.y);
    toast('<small>BOSS</small><b>屍王衝鋒</b>', 'danger boss');
  } else if (!boss && lastBossId && run.phase === 'running') { lastBossId = 0; audio.play('bossDown'); toast('<small>CLEAR</small><b>擊倒屍王</b>', 'gold'); }
}
function syncVolume() {
  const silent = audioPreferences.muted || audioPreferences.volume === 0;
  for (const id of ['mute', 'mute-menu']) {
    const mute = document.getElementById(id); if (!mute) continue;
    mute.innerHTML = icon(silent ? 'muted' : 'sound'); mute.setAttribute('aria-pressed', String(audioPreferences.muted));
    mute.title = audioPreferences.muted ? '開啟音效' : '關閉音效';
  }
  const volume = document.getElementById('volume') as HTMLInputElement | null;
  if (volume) { volume.value = String(audioPreferences.volume); volume.style.setProperty('--volume', `${audioPreferences.volume}%`); }
}
function toggleMute() {
  audioPreferences.muted = !audioPreferences.muted;
  if (!audioPreferences.muted && audioPreferences.volume === 0) audioPreferences.volume = 50;
  audio.unlock(); audio.setMuted(audioPreferences.muted); audio.setVolume(audioPreferences.volume);
  saveAudioPreferences(audioPreferences, storage); syncVolume(); audio.play('pick');
}
el('mute').onclick = toggleMute;
// Browsers only allow audio after a user gesture; any tap or key unlocks it.
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => audio.unlock(), { capture: true });
el('toast').addEventListener('animationend', hideToast);
syncVolume();

function coinTarget() {
  const r = el('money-box').querySelector('.px-icon')!.getBoundingClientRect();
  battlefield.setCoinTarget(r.left + r.width / 2, r.top + r.height / 2);
}
function step(now: number) {
  const realDt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
  camera.lean(aim ? battlefield.offsetOf(aim.x, aim.y) : undefined);
  const view = camera.update(realDt, battlefield.size);
  battlefield.useCamera(view);
  if (!aim) aimClient = undefined;
  else if (aimClient) Object.assign(aim, battlefield.point(aimClient.x, aimClient.y));
  run.advance(realDt * view.timeScale); uiClock += realDt; react(realDt);
  if (uiClock >= 0.08 || displayedPhase !== phaseKey()) { sync(); uiClock = 0; }
  tickMoney(realDt); coinTarget();
  battlefield.draw(run, aim, view, realDt);
}
function frame(now: number) { step(now); requestAnimationFrame(frame); }
// Dev-only handle for visual QA in the browser console; stripped from production builds.
if (import.meta.env.DEV) Object.assign(window, { __tl003: { get run() { return run; }, camera, battlefield, step: () => step(performance.now()) } });
sync(); requestAnimationFrame(frame);
