import './style.css';
import './hud.css';
import './generated/sprites.css';
import { Battlefield } from './Battlefield.ts';
import type { Aim } from './Battlefield.ts';
import { Camera } from './Camera.ts';
import { MERCENARIES, SKILLS } from './Content.ts';
import { formatNumber } from './Combat.ts';
import { DefenseRun } from './Run.ts';
import { LocalMetaMirror, META_KEY } from './Meta.ts';
import { TalentScreen } from './TalentScreen.ts';
import * as B from './Balance.ts';
import { cardIcon, choiceScreen, damageBreakdown, deployScreen, formatCount, resultScreen } from './Screens.ts';
import type { Report } from './Screens.ts';
import { countUp, motionReduced, pop, setReducedMotion } from './Motion.ts';
import { DefenseAudio, loadAudioPreferences, saveAudioPreferences } from './Audio.ts';
import type { Cue } from './Audio.ts';
import type { VisualEvent } from './Run.ts';
import { Coach, FALLEN_LINES, INTRO_LINES, playStory, storyScreen } from './Tutorial.ts';

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
const ELEMENTS = [['kinetic', '動能', 'icon_el_kinetic'], ['toxin', '毒素', 'icon_el_toxin'], ['blast', '爆裂', 'icon_el_blast'],
  ['fire', '火焰', 'icon_el_fire'], ['cold', '冷凍', 'icon_el_cold'], ['electric', '電能', 'icon_el_electric']] as const;
/** Three columns: skill slot i on the orb, mercenary slot i on the chip under it. */
const SLOTS = [0, 1, 2] as const;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main class="stage" aria-labelledby="game-title">
  <h1 id="game-title" class="sr-only">無盡防線 TL003</h1>
  <canvas id="battlefield" aria-label="喪屍由畫面上方遠處逐漸逼近下方拒馬，傭兵在下方自動射擊。選取投擲物後可在戰場指定目標。" tabindex="0"></canvas>
  <header class="hud-top">
    <div class="hud-wall" aria-label="拒馬生命">${px('icon_fortify', 2)}<div class="hp-bar"><i id="wall-chip" class="hp-chip"></i><i id="wall-fill" class="hp-fill"></i><span id="wall-value">40</span></div></div>
    <div class="hud-clock" aria-label="本關剩餘時間與關卡"><strong id="time">00:00</strong><span id="wave">W01</span></div>
    <div class="hud-money" id="money-box" aria-label="資金">${px('icon_money', 2)}<strong id="money">0</strong></div>
    <div class="hud-buttons"><button id="speed" class="icon-button speed-button" aria-label="遊戲速度" aria-pressed="false">×1</button><button id="mute" class="icon-button" aria-label="音效開關" aria-pressed="false"></button><button id="pause" class="icon-button" aria-label="暫停遊戲" disabled>${icon('pause')}</button></div>
  </header>
  <div class="hud-xp" aria-label="戰術等級"><b id="level">1</b><div class="xp-track"><i id="xp-fill"></i></div><span id="dps" class="hud-dps" aria-label="本關每秒傷害"></span></div>
  <div id="boss-banner" class="boss-banner" role="status" hidden>${px('icon_wave', 2)}<div><strong id="boss-title">屍王</strong><div class="boss-track"><i id="boss-fill"></i></div></div><span id="boss-detail"></span></div>
  <div id="stage-bar" class="stage-bar" role="status" hidden><strong id="stage-title">第 1 關完成</strong><b id="stage-dps" class="stage-dps"></b><span id="stage-detail"></span><button id="next-stage" class="primary">下一關 ▶</button><button id="stage-abandon" class="quiet-button abandon">放棄本局，返回標題</button></div>
  <div id="toast" class="toast" aria-hidden="true"></div>
  <nav class="hud-bottom" aria-label="傭兵與防守">
    <button id="repair" class="side-action" aria-label="修復拒馬">${px('icon_repair', 2)}<span class="cost">${px('icon_money', 1)}<span id="repair-cost">6</span></span></button>
    <div class="squad">${SLOTS.map(slot => `<div class="unit" id="unit-${slot}" data-slot="${slot}">
        <button class="orb" id="skill-${slot}" aria-label="主動投擲物欄 ${slot + 1}，按住拖曳至戰場" data-key="${slot + 1}">
          <span class="orb-ring"></span><span class="orb-tag" aria-hidden="true">主動</span><span class="orb-face">${px('icon_skill_grenade', 3)}</span><span class="orb-empty">+</span>
          <span class="orb-time" id="cooldown-${slot}"></span>
        </button>
        <button class="chip" id="buy-${slot}" aria-label="升級傭兵欄 ${slot + 1}"><span class="chip-merc">${px('icon_merc_rifle', 1)}<b id="level-${slot}">1</b></span>${px('icon_money', 1)}<span id="buy-label-${slot}"></span></button>
      </div>`).join('')}</div>
    <button id="auto-upgrade" class="auto-toggle" aria-pressed="false" title="資金夠時自動升級最便宜的傭兵">自動升級</button>
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
const MOTION_KEY = 'taillabs.tl003.motion.v1', HINT_KEY = 'taillabs.tl003.hint.v1', TIPS_KEY = 'taillabs.tl003.tips.v1', SPEED_KEY = 'taillabs.tl003.speed.v1';
/** New-player guide: the opening briefing, the first fall, and the coach's finished steps. */
const DANGER_KEY = 'taillabs.tl003.danger.v1';
/** The danger level picked on the deploy screen, never above what the blueprint has unlocked. */
const selectedDanger = () => Math.min(meta.tree.danger ?? 0, Math.max(0, Number(readFlag(DANGER_KEY)) || 0));
const AUTO_PICK_KEY = 'taillabs.tl003.autopick.v1', AUTO_UPGRADE_KEY = 'taillabs.tl003.autoupgrade.v1';
const INTRO_KEY = 'taillabs.tl003.intro.v1', FALLEN_KEY = 'taillabs.tl003.fallen.v1', COACH_KEY = 'taillabs.tl003.coach.v1';
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
const coach = new Coach(storage, COACH_KEY);
/** Game time of the last coaching bubble, so steps never arrive back to back. */
let coachAt = -Infinity;
const talents = new TalentScreen(dialog, meta, {
  // Closing the blueprint goes back to the title (deploy screen); a finished run is left behind.
  close: () => { if (run.phase === 'ready' || run.phase === 'over' || run.phase === 'victory') reset(); else { displayedPhase = ''; sync(); } },
  deploy: () => startRun(),
});
let displayedPhase = '', previous = performance.now(), uiClock = 0, shownMoney = 0;
/** A pick can level up again at once: each level's choice is its own screen. */
let cuedRun: DefenseRun | undefined, cuedKey = '';
const phaseKey = () => run.phase === 'choice' ? `choice:${run.level}:${run.pendingPicks}:${run.picksLeft}:${run.choices.length}` : run.phase === 'intermission' ? `intermission:${run.stage}` : run.phase;
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function newRun() { run = new DefenseRun(undefined, meta.effects); camera.reset(); battlefield.clear(); shownMoney = 0; shownSquad = ''; coach.dismiss(); coachAt = -Infinity; resetWatchers(); }
function reset() { meta.refresh(); aim = undefined; newRun(); displayedPhase = ''; sync(); }
function startRun() {
  if (!meta.beginRun()) return;
  writeFlag(TIPS_KEY, '1');
  aim = undefined; newRun(); run.start(true, selectedDanger()); displayedPhase = ''; sync();
}
battlefield.feedback.onCoin = () => { pop(el('money-box'), 1.14, 140); audio.play('coin'); };

/** `kind` picks the overlay style (screens.css); the first button gets focus unless `focusFirst` is false. */
function showModal(content: string, kind: string, focusFirst = true) {
  dialog.dataset.kind = kind; dialog.classList.remove('talent-dialog');
  el('modal-content').innerHTML = content; if (!dialog.open) dialog.showModal();
  if (focusFirst) dialog.querySelector<HTMLButtonElement>('button')?.focus();
  else { const title = el('modal-title'); title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
// ---------- story (telegraph) ----------
let stopStory: (() => void) | undefined;
/** Types the lines full screen, then runs `after`. */
function showStory(lines: readonly string[], kicker: string, done: string, after: () => void) {
  stopStory?.();
  showModal(storyScreen(kicker, done), 'story', false);
  stopStory = playStory(el('story'), lines, { reduced: reducedMotion, onTick: () => audio.play('type'), onDone: () => { stopStory = undefined; after(); } });
}
// ---------- level-up choice ----------
let choiceResolving = false, legendTimer: ReturnType<typeof setTimeout> | undefined;
const CHOICE_TIP = '<b>戰地補給：</b>每次升級從三張裡選一張。看到<b>「招募」</b>卡建議優先選：多一名傭兵就多一把槍。三格都滿之後，再挑投擲物和強化。';
function showChoice() {
  choiceResolving = false;
  const tip = coach.enabled && !coach.has('choice') ? CHOICE_TIP : undefined;
  const dps = run.choices.map(c => run.previewDps(c.id));
  showModal(choiceScreen(run.level, run.choices, run.canReroll ? { cost: run.rerollCost, affordable: run.money >= run.rerollCost } : undefined, run.picksLeft, tip, autoPick, run.pendingPicks, dps), 'choice', false);
  const autoBox = document.getElementById('auto-pick') as HTMLInputElement | null;
  if (autoBox) autoBox.onchange = () => { autoPick = autoBox.checked; writeFlag(AUTO_PICK_KEY, autoPick ? '1' : '0'); if (autoPick) pickBest(); };
  if (autoPick) pickBest();
  clearTimeout(legendTimer);
  if (run.choices.some(c => c.rarity === 'legendary')) legendTimer = setTimeout(() => { if (run.phase === 'choice') { audio.play('bossDown'); camera.shake(0.25); } }, motionReduced() ? 0 : 900);
  else if (run.choices.some(c => c.rarity === 'rare')) audio.play('ready');
  const rerollButton = document.getElementById('reroll');
  if (rerollButton) rerollButton.onclick = () => { if (!choiceResolving && !dialog.querySelector('.choice-screen.locked') && run.reroll()) { audio.play('buy'); showChoice(); } };
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
/** Auto pick: the highest rarity on offer (the leftmost among equals), once the cards have landed. */
let autoPick = readFlag(AUTO_PICK_KEY) === '1';
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
function pickBest() {
  const owner = run, level = run.level, left = run.pendingPicks;
  setTimeout(() => {
    if (!autoPick || run !== owner || run.phase !== 'choice' || run.level !== level || run.pendingPicks !== left) return;
    let best = 0;
    run.choices.forEach((c, i) => { if (RARITY_RANK[c.rarity ?? 'common']! > RARITY_RANK[run.choices[best]!.rarity ?? 'common']!) best = i; });
    resolveChoice(best);
  }, motionReduced() ? 0 : 700);
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
      if (run.choose(card.id)) { pop(el('level'), 1.6, 320); coach.complete('choice'); }
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
    meta.settle(run, run.score, run.clearedWave, { victory: run.phase === 'victory', danger: run.danger });
    report = { run, data: {
      victory: run.phase === 'victory', elapsed: run.elapsed, kills: run.kills, income: run.totalEarnedMoney,
      points: run.score, stages: run.clearedWave, danger: run.danger, breakdown: damageBreakdown(run.stats),
      bestWave: meta.value.HighestClearedWave, previousBest, persistent: meta.persistent,
    } };
    // The first time the line falls, the story picks up before the report (points are already saved).
    if (run.phase === 'over' && !readFlag(FALLEN_KEY)) {
      showStory(FALLEN_LINES, 'LAST TRANSMISSION', '加固防線', () => { writeFlag(FALLEN_KEY, '1'); presentReport(true); });
      return;
    }
  }
  presentReport(first);
}
function presentReport(first: boolean) {
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
/** Leaving a run early: a second tap confirms; the run is settled like a loss (points earned so far are kept). */
function bindAbandon(button: HTMLButtonElement) {
  let armed = false;
  button.onclick = () => {
    if (!armed) { armed = true; button.textContent = '確定放棄？已得戰功照樣結算'; button.classList.add('armed'); return; }
    meta.settle(run, run.score, run.clearedWave, { danger: run.danger }); report = undefined; reset();
  };
}
function pauseMenu() {
  const counts = ELEMENTS.map(([id, name, iconName]) => `<span class="${id}" title="${name}">${px(iconName, 2)}<b>${run.selectedCards.filter(c => c.category === name).length}</b></span>`).join('');
  const cards = run.selectedCards.length ? run.selectedCards.map(c => `<span title="${c.name}">${px(cardIcon(c.id), 2)}</span>`).join('') : '<small>—</small>';
  showModal(`<div class="modal-kicker">暫停</div><h2 id="modal-title">暫停防守</h2>
    <div class="pause-build"><div class="pause-elements">${counts}</div><div class="pause-cards">${cards}</div></div>
    <details class="pause-breakdown"><summary>本局傷害與控場</summary>${damageBreakdown(run.stats, 6)}</details>
    <div class="settings">
      <div class="setting"><span>音量</span><span class="volume-control"><button id="mute-menu" class="icon-button" type="button" aria-label="音效開關"></button><input id="volume" type="range" min="0" max="100" step="5" aria-label="音效音量"></span></div>
      <label class="setting"><span>減少畫面晃動</span><input id="motion" type="checkbox" ${reducedMotion ? 'checked' : ''}></label>
    </div>
    <button id="resume" class="primary">返回戰場 <span>→</span></button>
    <button id="abandon" class="quiet-button abandon">放棄本局，返回標題</button>`, 'pause');
  el('resume').onclick = () => { run.resume(); sync(); }; el('resume').focus();
  bindAbandon(el<HTMLButtonElement>('abandon'));
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
  text('announcement', run.phase === 'choice' ? '戰地補給到達，選擇一張。' : run.phase === 'intermission' ? `第 ${run.stage} 關完成。可以升級與補強，準備好就前往下一關。` : run.phase === 'over' ? '防線失守。本局結束。' : run.phase === 'running' ? `第 ${run.stage} 關開始。` : '');
  if (run.phase === 'ready') {
    const deploy = () => { displayedPhase = 'ready'; showModal(deployScreen(meta.effects, meta.value.TalentPoints, meta.tree.bestStage ?? meta.value.HighestClearedWave, !readFlag(TIPS_KEY), { unlocked: meta.tree.danger ?? 0, selected: selectedDanger() }), 'deploy'); bindDeploy(); };
    // First open: the briefing comes before the deploy screen.
    if (!readFlag(INTRO_KEY)) showStory(INTRO_LINES, 'INCOMING TRANSMISSION', '接受指揮', () => { writeFlag(INTRO_KEY, '1'); deploy(); });
    else deploy();
  } else if (run.phase === 'choice') {
    showChoice();
  } else if (run.phase === 'paused') {
    pauseMenu();
  } else if (run.phase === 'over' || run.phase === 'victory') {
    showReport();
  } else if (dialog.open) dialog.close();
}
function bindDeploy() {
  el('start').onclick = startRun;
  for (const b of dialog.querySelectorAll<HTMLButtonElement>('[data-danger]')) b.onclick = () => { writeFlag(DANGER_KEY, b.dataset.danger!); audio.play('pick'); displayedPhase = ''; sync(); };
  el('open-talents').onclick = () => talents.open();
  el('replay-briefing').onclick = () => showStory(INTRO_LINES, 'INCOMING TRANSMISSION', '返回', () => { displayedPhase = ''; sync(); });
}

// ---------- HUD ----------
/** Each column shows its skill on the orb and its mercenary on the chip; empty slots wait for a card. */
function applyUnitLook() {
  for (const slot of SLOTS) {
    const skill = run.skills[slot], merc = run.mercenaries[slot], unit = el(`unit-${slot}`);
    unit.style.setProperty('--merc-color', skill ? SKILLS[skill.id].color : '#5b6157');
    unit.style.setProperty('--chip-color', merc ? MERCENARIES[merc.kind].color : '#5b6157');
    unit.classList.toggle('no-skill', !skill); unit.classList.toggle('no-merc', !merc);
    unit.querySelector('.orb-face .px-icon')!.setAttribute('data-icon', skill ? 'icon_skill_' + skill.id : 'icon_skill_grenade');
    unit.querySelector('.chip-merc .px-icon')!.setAttribute('data-icon', merc ? 'icon_merc_' + merc.kind : 'icon_merc_rifle');
    el(`skill-${slot}`).setAttribute('aria-label', skill ? `${SKILLS[skill.id].name}，按住拖曳至戰場` : `主動投擲物欄 ${slot + 1}（空，從戰地補給取得）`);
    el(`buy-${slot}`).setAttribute('aria-label', merc ? `升級${MERCENARIES[merc.kind].name}` : `傭兵欄 ${slot + 1}（空，從戰地補給招募）`);
  }
}
/** What the columns currently show, so the look is only rebuilt when a card adds a mercenary or a skill. */
let shownSquad = '';
const wasReady = [false, false, false], wasAffordable = [false, false, false];
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
  text('wave', run.stage === 0 ? `1/${B.STAGE_COUNT}關` : run.endless ? `第${run.stage}關` : `${run.stage}/${B.STAGE_COUNT}關`); text('time', clock(Math.ceil(run.stageLeft)));
  text('level', run.level.toString());
  { let dealt = 0; for (const v of Object.values(run.stats.stage)) dealt += v; text('dps', run.phase === 'running' && run.stageTime > 1 ? `DPS ${formatNumber(dealt / run.stageTime)}` : ''); } el('xp-fill').style.width = `${Math.min(100, run.xp / run.xpNeeded * 100)}%`;
  if (run.phase === 'running' && run.wave !== shownWave) {
    if (shownWave && run.wave > shownWave) toast(run.bossStage ? `<small>STAGE ${run.wave.toString().padStart(2, '0')}</small><b>${run.superBossStage ? '超級屍王' : '屍王關'}</b>` : `<small>STAGE</small><b>${run.wave.toString().padStart(2, '0')}</b>`, run.bossStage ? 'danger' : '');
    shownWave = run.wave;
  }
  if (run.level !== shownLevel) { if (run.level > shownLevel) pop(el('level'), 1.5, 300); shownLevel = run.level; }
  syncBoss(); syncStageBar(); syncAutoUpgrade();
  const squad = run.mercenaries.map(m => m.kind).join() + '|' + run.skills.map(s => s.id).join();
  if (squad !== shownSquad) {
    // A recruit card drops the new mercenary into its slot.
    const before = shownSquad.split('|')[0]!.split(',').filter(Boolean).length;
    shownSquad = squad; applyUnitLook();
    for (let i = before; i < run.mercenaries.length && run.phase !== 'ready'; i++) battlefield.mercArrived(i);
  }
  for (const slot of SLOTS) {
    const merc = run.mercenaries[slot], skillSlot = run.skills[slot];
    const buy = el<HTMLButtonElement>(`buy-${slot}`), orb = el<HTMLButtonElement>(`skill-${slot}`);
    const cost = merc ? run.upgradeCost(merc.kind) : 0;
    text(`level-${slot}`, merc ? run.levels[merc.kind].toString() : '');
    text(`buy-label-${slot}`, merc ? formatNumber(cost) : '—');
    // A thin bar under the chip fills towards the next level milestone.
    const level = merc ? run.levels[merc.kind] : 0, next = nextMilestone(level), prev = [0, 10, 25, 50, 100].filter(m => m <= level).at(-1) ?? 0;
    buy.style.setProperty('--milestone', merc && next ? ((level - prev) / (next - prev)).toFixed(3) : '0');
    const affordable = shopOpen() && !!merc && visibleMoney() >= cost;
    buy.disabled = !affordable;
    if (affordable && !wasAffordable[slot]) pop(buy, 1.12, 220);
    wasAffordable[slot] = affordable;
    const total = skillSlot ? Math.max(1e-6, run.skillCooldown(skillSlot.id)) : 1, ready = run.phase === 'running' && !!skillSlot && skillSlot.cooldown <= 0;
    orb.disabled = run.phase !== 'running' || !skillSlot;
    orb.classList.toggle('ready', ready); orb.classList.toggle('aiming', !!skillSlot && !!aim && aim.slot === slot);
    orb.style.setProperty('--cd', skillSlot ? (skillSlot.cooldown / total).toFixed(3) : '1');
    text(`cooldown-${slot}`, skillSlot && skillSlot.cooldown > 0 ? Math.ceil(skillSlot.cooldown).toString() : '');
    if (ready && !wasReady[slot]) { if (shownWave) { pop(orb, 1.15, 260); audio.play('ready'); } maybeHint(orb); }
    wasReady[slot] = ready;
  }
  for (const action of ['repair', 'fortify'] as const) {
    const cost = action === 'repair' ? run.repairCost : run.fortifyCost;
    text(`${action}-cost`, formatNumber(cost));
    el<HTMLButtonElement>(action).disabled = !shopOpen() || (action === 'repair' && !run.canRepair) || (action === 'fortify' && !run.canFortify) || visibleMoney() < cost || (action === 'repair' && run.wallHealth >= run.wallMaxHealth);
  }
}
/** Money is spent in battle and in the rest between stages. */
const shopOpen = () => run.phase === 'running' || run.phase === 'intermission';
/** Auto upgrade: whenever the cheapest mercenary upgrade is affordable, buy it. */
let autoUpgrade = readFlag(AUTO_UPGRADE_KEY) === '1';
function syncAutoUpgrade() {
  const toggle = el('auto-upgrade');
  toggle.setAttribute('aria-pressed', String(autoUpgrade)); toggle.classList.toggle('on', autoUpgrade);
  if (!autoUpgrade || !shopOpen()) return;
  const kinds = run.mercenaries.map(m => m.kind).sort((a, b) => run.upgradeCost(a) - run.upgradeCost(b));
  const kind = kinds[0];
  if (kind && visibleMoney() >= run.upgradeCost(kind) && run.upgrade(kind)) { audio.play('buy'); pop(el(`buy-${run.mercenaries.findIndex(m => m.kind === kind)}`), 1.12, 220); }
}
el('auto-upgrade').onclick = () => { autoUpgrade = !autoUpgrade; writeFlag(AUTO_UPGRADE_KEY, autoUpgrade ? '1' : '0'); audio.play('pick'); sync(); };
/** The rest between stages: what comes next and the button that starts it. */
function syncStageBar() {
  const bar = el('stage-bar'), open = run.phase === 'intermission' && !talents.active;
  if (bar.hidden === open) bar.hidden = !open;
  if (!open) return;
  const next = run.stage + 1;
  text('stage-title', run.stage === 0 ? '出擊準備' : `第 ${run.stage} 關完成`);
  el('next-stage').textContent = run.stage === 0 ? '出擊 ▶' : '下一關 ▶';
  const growth = run.prevStageDps > 0 ? run.lastStageDps / run.prevStageDps - 1 : 0;
  text('stage-dps', run.stage > 0 ? `本關 DPS ${formatNumber(run.lastStageDps)}${run.prevStageDps > 0 ? `（比上一關 ${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(0)}%）` : ''}` : '');
  text('stage-detail', `下一關：第 ${next} 關・${next === B.STAGE_COUNT ? `${B.stageSeconds(next)} 秒後超級屍王來襲` : B.isBossStage(next) ? `${B.stageSeconds(next)} 秒後屍王來襲` : `撐過 ${B.stageSeconds(next)} 秒`}。花資金升級、補強，準備好就出發。`);
}
function nextStage() { if (run.nextStage()) { audio.play('pick'); displayedPhase = ''; sync(); } }
el('next-stage').onclick = nextStage;
bindAbandon(el<HTMLButtonElement>('stage-abandon'));
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
    text('boss-title', boss.superBoss ? '超級屍王' : '屍王'); text('boss-detail', `${Math.ceil(100 * boss.hp / boss.maxHp)}%`);
    el('boss-fill').style.width = `${Math.max(0, 100 * boss.hp / boss.maxHp)}%`;
  } else {
    text('boss-title', run.superBossStage ? '超級屍王逼近' : '屍王逼近'); text('boss-detail', Math.ceil(warning!).toString()); el('boss-fill').style.width = '100%';
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

function cast(slot: number, x: number, y: number) { if (run.cast(slot, x, y)) { hideHint(); coach.complete('skill'); } }
el('pause').onclick = () => { if (run.phase === 'paused') run.resume(); else run.pause(); sync(); };
el('repair').onclick = () => { if (run.repair()) { audio.play('buy'); pop(el('wall-value'), 1.3, 220); coach.complete('repair'); } sync(); };
el('fortify').onclick = () => { if (run.fortify()) { audio.play('buy'); pop(el('wall-value'), 1.3, 220); coach.complete('fortify'); } sync(); };
dialog.addEventListener('close', () => {
  if (talents.active) talents.close();
  else if (run.phase !== 'running') { displayedPhase = ''; sync(); }
});
dialog.addEventListener('cancel', e => { e.preventDefault(); if (talents.active) talents.close(); else if (run.phase === 'paused') { run.resume(); sync(); } });
window.addEventListener('storage', event => {
  if (event.key !== META_KEY && event.key !== null) return;
  meta.refresh(); if (talents.active) talents.render(); else if (run.phase === 'ready') reset();
});
/** Mercenary level milestones (spec §18) and their one-line announcements. */
const MILESTONES: Record<number, string> = { 10: '火力倍增', 25: '射速 ×1.5', 50: '火力 ×3', 100: '專精解鎖' };
const nextMilestone = (level: number) => [10, 25, 50, 100].find(m => m > level);
/** Upgrade the mercenary in a slot; every copy of a kind shares its level. */
function upgradeSlot(slot: number) {
  const merc = run.mercenaries[slot];
  if (merc && run.upgrade(merc.kind)) {
    audio.play('buy'); coach.complete('upgrade');
    run.mercenaries.forEach((m, i) => { if (m.kind === merc.kind) { battlefield.mercLeveled(i); pop(el(`level-${i}`), 1.6, 300); } });
    const milestone = MILESTONES[run.levels[merc.kind]];
    if (milestone) { toast(`<small>${MERCENARIES[merc.kind].name} Lv${run.levels[merc.kind]}</small><b>${milestone}</b>`, 'gold'); audio.play('levelUp'); camera.punch(0.03); }
  }
  sync();
}
const skillReady = (slot: number) => { const s = run.skills[slot]; return !!s && s.cooldown <= 0; };
for (const slot of SLOTS) {
  el(`buy-${slot}`).onclick = () => upgradeSlot(slot);
  const button = el<HTMLButtonElement>(`skill-${slot}`); let down: { x: number; y: number; id: number } | undefined;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    if (!skillReady(slot)) return;
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
    if (skillReady(slot)) { aim = { slot, x: 470, y: 235, valid: true }; el('battlefield').focus(); sync(); }
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
  if (run.phase === 'intermission' && (event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); nextStage(); return; }
  if (event.key === 'Escape') { if (aim) aim = undefined; else run.pause(); sync(); return; }
  const index = ['1', '2', '3'].indexOf(event.key);
  if (index >= 0 && run.phase === 'running' && skillReady(index)) aim = { slot: index, x: 470, y: 235, valid: true };
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
  if (event.kind === 'shot') return event.merc === 'tesla' || event.merc === 'signal' ? 'tesla' : 'rifle';
  if (event.kind === 'blast') return event.color === '#e6764b' ? 'molotov' : 'grenade';
  if (event.kind === 'flame' || event.kind === 'laser' || event.kind === 'kill') return event.kind;
  return undefined;
}
/** Turns this frame's new combat events and state changes into sound cues and camera moves. */
let ragedStage = -1;
function react(realDt: number) {
  if (watchedRun !== run) { watchedRun = run; lastWall = run.wallHealth; wasWarning = false; lastBossId = 0; wallLoss = 0; }
  for (const event of run.events) {
    if (heard.has(event)) continue;
    // Refraction side beams start at an enemy (x < 800): no extra laser sound or shake.
    heard.add(event); const cue = event.kind === 'laser' && (event.fromX ?? 0) < 800 ? undefined : cueFor(event); if (cue) audio.play(cue);
    // Only throwables shake the screen; auto attacks, chain blasts and ordinary kills never do (dizzying at high attack speed).
    if (event.kind === 'blast' && event.skill) {
      if (event.color === '#e6764b') { camera.shake(0.22); camera.punch(0.02); }
      else { camera.shake(0.45); camera.punch(0.045); camera.freeze(0.05); }
    } else if (event.kind === 'laser' && event.skill && (event.fromX ?? 0) >= 800) { camera.shake(0.3); camera.punch(0.03); camera.freeze(0.04); }
    else if (event.kind === 'kill' && event.enemy === 'boss') { camera.freeze(0.15); camera.slowMotion(0.3, 0.9); camera.shake(0.75); camera.flash(0.7); camera.punch(0.07); }
  }
  // The barricade loses health continuously while zombies chew on it: kick in bursts, not every frame.
  if (run.phase === 'running' && run.wallHealth < lastWall - 1e-6) wallLoss += lastWall - run.wallHealth;
  lastWall = run.wallHealth; wallKick += realDt;
  if (wallLoss > 0 && (wallLoss > run.wallMaxHealth * 0.04 || wallKick > 0.7)) {
    audio.play('wall'); camera.shake(Math.min(0.3, 0.08 + wallLoss / run.wallMaxHealth * 2)); camera.hurt(0.7); pop(el('wall-value'), 1.2, 160);
    wallLoss = 0; wallKick = 0;
  }
  // Overtime: once per stage, when the leftovers start to rage.
  const raging = run.phase === 'running' && run.overtime > 0;
  if (raging && ragedStage !== run.stage) { ragedStage = run.stage; audio.play('bossWarning'); toast('<small>OVERTIME</small><b>喪屍狂暴</b>', 'danger'); text('announcement', '加時：場上喪屍越咬越狠，快清場。'); }
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
// Game speed: only battle time runs faster; camera, UI motion and coins keep real time.
// Players get ×1 / ×2. ×16 is for testing only: the dev server, or the page opened with ?test.
const TEST_MODE = import.meta.env.DEV || new URLSearchParams(location.search).has('test');
const SPEEDS = TEST_MODE ? [1, 2, 16] : [1, 2];
let gameSpeed = SPEEDS.includes(Number(readFlag(SPEED_KEY))) ? Number(readFlag(SPEED_KEY)) : 1;
function syncSpeed() { const b = el('speed'); b.textContent = `×${gameSpeed}`; b.setAttribute('aria-pressed', String(gameSpeed > 1)); b.classList.toggle('fast', gameSpeed > 1); }
el('speed').onclick = () => { gameSpeed = SPEEDS[(SPEEDS.indexOf(gameSpeed) + 1) % SPEEDS.length]!; writeFlag(SPEED_KEY, String(gameSpeed)); syncSpeed(); pop(el('speed'), 1.2, 180); audio.play('pick'); };
syncSpeed();
// Browsers only allow audio after a user gesture; any tap or key unlocks it.
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => audio.unlock(), { capture: true });
el('toast').addEventListener('animationend', hideToast);
syncVolume();

function coinTarget() {
  const r = el('money-box').querySelector('.px-icon')!.getBoundingClientRect();
  battlefield.setCoinTarget(r.left + r.width / 2, r.top + r.height / 2);
}
/**
 * New-player coach: each step appears once, when its moment first comes up in a running battle, at
 * least a couple of game seconds after the previous one. Action steps wait for the highlighted control.
 */
function guide() {
  if (!coach.enabled || talents.active) return;
  // Click-to-aim needs the battlefield: step the bubble aside while aiming; the cast completes the step.
  if (coach.current === 'skill' && aim) { coach.dismiss(); return; }
  if (coach.holding || run.phase !== 'running' || dialog.open || run.elapsed - coachAt < 2) return;
  const offer = (...args: Parameters<Coach['offer']>) => { if (coach.offer(...args)) coachAt = run.elapsed; };
  const rifle = run.mercenaries[0];
  if (run.events.some(e => e.kind === 'shot' && e.merc))
    offer('shoot', '你的士兵會<b>自動射擊</b>進入射程的喪屍，不用操作。<br>每種傭兵射程不同：步槍手只打得到道路的下半段。');
  if (run.kills > 0)
    offer('kill', '擊倒喪屍會掉落<b>資金</b>（右上），並累積<b>經驗</b>（上方細條）。<br>每關結束後，累積的經驗會換成戰地補給讓你挑選。', { target: el('money-box') });
  if (coach.has('kill') && rifle && visibleMoney() >= run.upgradeCost(rifle.kind))
    offer('upgrade', '資金夠了！點<b>傭兵下方的按鈕</b>花資金升級，傷害會提高。', { target: el('buy-0'), act: true });
  if (run.canRepair && run.wallHealth < run.wallMaxHealth && visibleMoney() >= run.repairCost)
    offer('repair', '拒馬被咬了！點左下的<b>修復</b>補回生命。<br>拒馬被打穿，這座城就守不住了。', { target: el('repair'), act: true });
  if (coach.has('repair') && run.canFortify && visibleMoney() >= run.fortifyCost)
    offer('fortify', '右下的<b>補強</b>會提高拒馬的生命上限。<br>喪屍只會越來越多，記得持續加固。', { target: el('fortify'), act: true });
  if (coach.has('kill') && skillReady(0) && run.enemies.filter(e => e.x > 200).length >= 3)
    offer('skill', '按住<b>主動投擲物</b>拖到喪屍群上放開，就能丟出手榴彈。<br>之後的戰地補給還能換到其他投擲物。', { target: el('skill-0'), act: true });
  if (run.bossWarning !== undefined)
    offer('boss', '<b>屍王</b>要來了！它很耐打，拒馬撐不了幾秒。<br>集中火力、丟投擲物，必要時修補拒馬。', { target: el('boss-banner') });
}
function step(now: number) {
  const realDt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
  camera.lean(aim ? battlefield.offsetOf(aim.x, aim.y) : undefined);
  const view = camera.update(realDt, battlefield.size);
  battlefield.useCamera(view);
  if (!aim) aimClient = undefined;
  else if (aimClient) Object.assign(aim, battlefield.point(aimClient.x, aimClient.y));
  // A coaching bubble holds the battle until it is answered.
  if (!coach.holding) run.advance(realDt * view.timeScale * gameSpeed);
  uiClock += realDt; react(realDt); guide(); coach.place();
  if (uiClock >= 0.08 || displayedPhase !== phaseKey()) { sync(); uiClock = 0; }
  tickMoney(realDt); coinTarget();
  battlefield.draw(run, aim, view, realDt);
}
function frame(now: number) { step(now); requestAnimationFrame(frame); }
// Dev-only handle for visual QA in the browser console; stripped from production builds.
if (import.meta.env.DEV) Object.assign(window, { __tl003: { get run() { return run; }, camera, battlefield, step: () => step(performance.now()) } });
sync(); requestAnimationFrame(frame);
