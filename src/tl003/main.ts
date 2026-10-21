import './style.css';
import { Battlefield } from './Battlefield.ts';
import type { Aim } from './Battlefield.ts';
import { MERCENARIES, MERC_KINDS } from './Content.ts';
import { formatNumber, effectiveCooldown } from './Combat.ts';
import { DefenseRun } from './Run.ts';
import { LocalMetaMirror, META_KEY } from './Meta.ts';
import { TalentScreen, deploymentSummary } from './TalentScreen.ts';
import { DefenseAudio, loadAudioPreferences, saveAudioPreferences } from './Audio.ts';
import type { Cue } from './Audio.ts';
import type { VisualEvent } from './Run.ts';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="M8 12h8m-4-4v8"/>',
    cross: '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="6"/>',
    grenade: '<path d="m10 6 1-3h5l2 4M8 8l8-2 4 9c1 4-4 8-8 6-4-2-7-9-4-13Z"/><path d="m7 12 11-3m-9 8 11-3"/>',
    flame: '<path d="M13 2c2 7-4 7-2 12 2-1 3-3 3-5 7 6 6 13-2 13C2 22 2 13 8 8c-1 5 2 4 2 2 0-3 0-5 3-8Z"/>',
    bolt: '<path d="m14 2-9 12h7l-2 8 10-13h-7l1-7Z"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    muted: '<path d="M4 9h4l5-4v14l-5-4H4V9Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.cross}</svg>`;
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main class="command" aria-labelledby="game-title">
  <header class="masthead"><div class="brand"><span class="brand-mark">T<span>l</span></span><div><span class="eyebrow">TAIL LABS / EXPERIMENT 003</span><h1 id="game-title">無盡防線<span>THE LAST LINE</span></h1></div></div><div class="header-actions"><span class="live-label"><i></i> 西側防衛區</span><div class="volume-control"><button id="mute" class="quiet-button" aria-label="音效開關" aria-pressed="false"></button><input id="volume" type="range" min="0" max="100" step="5" aria-label="音效音量"></div><button id="pause" class="quiet-button" aria-label="暫停遊戲" disabled>Ⅱ</button></div></header>
  <section class="telemetry" aria-label="本局狀態">
    <div class="wall-metric">${icon('shield')}<div><span class="label">拒馬完整度</span><strong id="wall-value">65 <small>/ 65</small></strong><div class="wall-track"><i id="wall-fill"></i></div></div></div>
    <div><span class="label">戰場資金</span><strong class="money"><span class="currency">¤</span> <span id="money">0</span></strong></div>
    <div><span class="label">屍潮 <span class="desktop-word">WAVE</span></span><strong id="wave">01 <small>/ 40</small></strong></div>
    <div><span class="label">堅守時間</span><strong id="time">00:00</strong></div>
    <div class="kill-metric"><span class="label">擊殺</span><strong id="kills">0</strong></div>
  </section>
  <section class="battle-wrap" aria-label="直式防守戰場">
    <canvas id="battlefield" width="480" height="660" aria-label="喪屍由畫面上方遠處逐漸逼近下方拒馬，傭兵在下方自動射擊。選取技能後可在戰場指定目標。" tabindex="0"></canvas>
    <div class="battle-top"><span><i></i><span id="battle-status">等待部署</span></span><span id="aim-hint">拖曳技能至戰場施放</span></div>
    <div id="boss-banner" class="boss-banner" role="status" hidden><strong id="boss-title">屍王衝鋒</strong><span id="boss-detail"></span><div class="boss-track"><i id="boss-fill"></i></div></div>
    <div class="battle-bottom"><span>敵軍由前方逼近 ↓</span><span>拒馬 ╱ 傭兵陣地</span></div>
  </section>
  <section class="tactics" aria-label="戰術經驗"><div><span class="eyebrow">戰術等級 <b id="level">01</b></span><span id="xp-label">0 / 3 XP</span></div><div class="xp-track"><i id="xp-fill"></i></div><span class="tactics-hint">擊殺取得經驗 · 升級三選一</span></section>
  <section class="squad-section" aria-label="傭兵與主動技能"><div class="section-heading"><h2>防守小隊 <span id="squad-count">1 / 3</span></h2><span>自動射擊 <b>·</b> 手動軍火</span></div><div class="squad">${MERC_KINDS.map((kind, index) => {
    const m = MERCENARIES[kind]; return `<article class="merc-card" data-kind="${kind}" style="--merc-color:${m.color}"><div class="merc-heading"><span class="unit-number">0${index + 1}</span><div><h3>${m.name} <span id="level-${kind}">Lv.1</span></h3><small>${m.role}</small></div><span class="unit-state" id="state-${kind}">待招募</span></div><div class="merc-actions"><button class="purchase" id="buy-${kind}"></button><button class="skill" id="skill-${kind}" aria-label="${m.skill}，按住拖曳至戰場" disabled>${icon(kind === 'rifle' ? 'grenade' : kind === 'flame' ? 'flame' : 'bolt')}<span><b>${m.skill}</b><small id="cooldown-${kind}">尚未招募</small></span><span class="key">${index + 1}</span></button></div></article>`;
  }).join('')}</div></section>
  <section class="support" aria-label="防守投資與屬性"><div class="wall-actions"><button id="repair">${icon('cross')} 修復 <span id="repair-cost">¤6</span></button><button id="fortify">${icon('shield')} 補強 <span id="fortify-cost">¤10</span></button></div><div class="elements"><span title="動能：直接傷害" class="kinetic">動能 <b id="tag-kinetic">0</b></span><span title="火焰：持續傷害" class="fire">火焰 <b id="tag-fire">0</b></span><span title="生化：降低敵人防禦" class="bio">生化 <b id="tag-bio">0</b></span><span title="電能：提高敵人受到的傷害" class="electric">電能 <b id="tag-electric">0</b></span></div></section>
  <footer><span id="build-summary">尚未取得戰術強化</span><span>TL003 <i>·</i> 垂直切片 v0.1</span></footer>
  <p id="announcement" class="sr-only" aria-live="polite"></p>
</main>
<dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => { const node = el(id); if (node.textContent !== value) node.textContent = value; };
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Memory-only fallback. */ }
const meta = new LocalMetaMirror(storage);
const audioPreferences = loadAudioPreferences(storage);
const audio = new DefenseAudio(audioPreferences);
let run = new DefenseRun(undefined, meta.effects), aim: Aim | undefined;
const battlefield = new Battlefield(el<HTMLCanvasElement>('battlefield'));
const dialog = el<HTMLDialogElement>('modal');
const talents = new TalentScreen(dialog, meta, {
  close: () => { if (run.phase === 'ready') run = new DefenseRun(undefined, meta.effects); displayedPhase = ''; sync(); },
  deploy: () => startRun(),
});
let displayedPhase = '', previous = performance.now(), uiClock = 0;
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function reset() { meta.refresh(); aim = undefined; run = new DefenseRun(undefined, meta.effects); displayedPhase = ''; sync(); }
function startRun() {
  if (!meta.beginRun()) return;
  aim = undefined; run = new DefenseRun(undefined, meta.effects); run.start(); displayedPhase = ''; sync();
}

function showModal(content: string) {
  el('modal-content').innerHTML = content; if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('button')?.focus();
}
function syncPhase() {
  if (talents.active) return;
  if (displayedPhase === run.phase) return;
  displayedPhase = run.phase; aim = undefined;
  if (run.phase === 'choice') audio.play('levelUp');
  if (run.phase === 'over') audio.play('gameOver');
  if (run.phase === 'victory') audio.play('victory');
  text('announcement', run.phase === 'choice' ? '戰術升級，請選擇一張強化。' : run.phase === 'over' ? '防線失守，本局結束。' : run.phase === 'running' ? '防守開始。' : '');
  if (run.phase === 'ready') {
    showModal(`<div class="modal-kicker">TAIL LABS / TL003</div><div class="hero-emblem">${icon('shield')}</div><h2 id="modal-title">從一條破爛防線開始。</h2><p>傭兵自動開火，你決定如何守得更久。</p><div class="briefing"><span><b>01</b> 擊殺賺錢，招募最多 3 名傭兵</span><span><b>02</b> 累積經驗，三選一建立屬性戰術</span><span><b>03</b> 拖曳軍火至戰場，放手施放</span><span><b>04</b> 每 2 分鐘屍王帶隊衝鋒，用手榴彈擊退</span></div>${deploymentSummary(meta.effects)}<button id="start" class="primary">部署防線 <span>→</span></button><button id="open-talents" class="camp-button">天賦星盤 <span>${formatNumber(meta.value.TalentPoints)} 點可用 ↗</span></button><p class="fine-print">新兵首局約可堅守 2～3 分鐘，第一隻屍王在 02:00 出現。<br>本局進度不保存；重新整理會放棄本局。</p><div class="meta-strip">最高通關 Wave <b>${meta.value.HighestClearedWave}</b></div>`);
    el('start').onclick = startRun;
    el('open-talents').onclick = () => talents.open();
  } else if (run.phase === 'choice') {
    showModal(`<div class="modal-kicker">TACTICAL UPGRADE / LV.${run.level}</div><h2 id="modal-title">選擇你的下一步。</h2><p>戰鬥已暫停。選取一項，本局持續生效，可重複堆疊。</p><div class="choice-grid">${run.choices.map((card, i) => `<button class="choice" data-card="${card.id}" style="--card-color:${card.color}"><span class="choice-category">${card.category}<small>0${i + 1}</small></span>${icon(card.id === 'burn' || card.id === 'fire' ? 'flame' : card.id === 'shock' ? 'bolt' : 'cross')}<strong>${card.name}</strong><span class="choice-description">${card.description}</span><span class="choice-pick">選取強化 ↗</span></button>`).join('')}</div>`);
    dialog.querySelectorAll<HTMLButtonElement>('[data-card]').forEach(button => { button.onclick = () => { if (run.choose(button.dataset.card!)) audio.play('pick'); sync(); }; });
  } else if (run.phase === 'paused') {
    showModal('<div class="modal-kicker">DEFENSE ON HOLD</div><h2 id="modal-title">暫停防守</h2><p>傭兵、敵人與技能冷卻均已暫停。</p><button id="resume" class="primary">返回戰場 →</button>');
    el('resume').onclick = () => { run.resume(); sync(); };
  } else if (run.phase === 'over' || run.phase === 'victory') {
    meta.settle(run, run.score, run.clearedWave);
    showModal(`<div class="modal-kicker">${run.phase === 'victory' ? '40 WAVES / MILESTONE REACHED' : 'DEFENSE REPORT / LINE LOST'}</div><h2 id="modal-title">${run.phase === 'victory' ? '守住了二十分鐘。' : '防線失守。'}</h2><p>每一次堅守，都是下一次的起點。</p><div class="result-stats"><div><span>堅守時間</span><strong>${clock(run.elapsed)}</strong></div><div><span>本局擊殺</span><strong>${run.kills}</strong></div><div><span>累計收入</span><strong>¤${formatNumber(run.totalEarnedMoney)}</strong></div></div><div class="earned"><span>獲得天賦點</span><strong>+${run.score}</strong><small>累積 ${meta.value.TalentPoints} 點 · 投資永久成長</small></div><p class="score-note">時間分 ${Math.floor(run.elapsed / 30)} + 累計收入分 ${Math.floor(Math.log10(run.totalEarnedMoney + 1))} = ${run.score}<br>已花掉的戰場資金同樣計分。</p><button id="result-talents" class="primary">投資天賦，準備下一局 <span>↗</span></button><button id="retry" class="camp-button">直接再守一次 <span>→</span></button><p class="fine-print">${meta.persistent ? '天賦點已記錄在此瀏覽器。' : '瀏覽器無法保存，天賦點暫留於此分頁。'}<br>傭兵、資金與本局強化將重新開始。</p>`);
    el('result-talents').onclick = () => talents.open();
    el('retry').onclick = reset;
  } else if (dialog.open) dialog.close();
}
function sync() {
  syncPhase();
  el<HTMLButtonElement>('pause').disabled = run.phase !== 'running' && run.phase !== 'paused';
  audio.setPaused(run.phase === 'paused');
  text('wall-value', `${Math.ceil(run.wallHealth)} / ${Math.ceil(run.wallMaxHealth)}`);
  el('wall-fill').style.width = `${100 * run.wallHealth / run.wallMaxHealth}%`;
  el('wall-fill').classList.toggle('critical', run.wallHealth / run.wallMaxHealth < 0.3);
  text('money', formatNumber(run.money)); text('wave', `${run.wave.toString().padStart(2, '0')} / 40`);
  text('time', clock(run.elapsed)); text('kills', run.kills.toString()); text('level', run.level.toString().padStart(2, '0'));
  text('xp-label', `${run.xp} / ${run.xpNeeded} XP`); el('xp-fill').style.width = `${Math.min(100, run.xp / run.xpNeeded * 100)}%`;
  text('squad-count', `${run.mercenaries.length || 1} / 3`);
  text('battle-status', run.phase === 'ready' ? '等待部署' : run.phase === 'running' ? '防守進行中' : run.phase === 'over' ? '防線失守' : '戰鬥暫停');
  text('aim-hint', aim ? '放手施放 · 拖出戰場取消' : '拖曳技能至戰場施放');
  syncBoss();
  for (const kind of MERC_KINDS) {
    const merc = run.mercenaries.find(m => m.kind === kind), buy = el<HTMLButtonElement>(`buy-${kind}`), skill = el<HTMLButtonElement>(`skill-${kind}`);
    const cost = merc ? run.upgradeCost(kind) : run.recruitCost(kind);
    text(`level-${kind}`, `Lv.${run.levels[kind]}`); text(`state-${kind}`, merc ? '已部署' : '待招募');
    text(`buy-${kind}`, `${merc ? '升級' : '招募'} · ¤${formatNumber(cost)}`);
    buy.disabled = run.phase !== 'running' || run.money < cost || (!merc && run.mercenaries.length >= 3);
    skill.disabled = run.phase !== 'running' || !merc || merc.cooldown > 0;
    skill.classList.toggle('ready', !skill.disabled); skill.classList.toggle('aiming', !!merc && !!aim && run.mercenaries[aim.slot] === merc);
    text(`cooldown-${kind}`, !merc ? '尚未招募' : merc.cooldown > 0 ? `${merc.cooldown.toFixed(1)}s / ${effectiveCooldown(MERCENARIES[kind].cooldown, run.haste).toFixed(1)}s` : '就緒 · 拖曳施放');
    skill.style.setProperty('--cooldown', `${merc ? 100 * merc.cooldown / effectiveCooldown(MERCENARIES[kind].cooldown, run.haste) : 0}%`);
  }
  for (const action of ['repair', 'fortify'] as const) {
    const cost = action === 'repair' ? run.repairCost : run.fortifyCost;
    text(`${action}-cost`, `¤${formatNumber(cost)}`);
    el<HTMLButtonElement>(action).disabled = run.phase !== 'running' || run.money < cost || (action === 'repair' && run.wallHealth >= run.wallMaxHealth);
  }
  for (const [id, category] of [['kinetic', '動能'], ['fire', '火焰'], ['bio', '生化'], ['electric', '電能']]) text(`tag-${id}`, run.selectedCards.filter(c => c.category === category).length.toString());
  text('build-summary', run.selectedCards.length ? run.selectedCards.map(c => c.name).join(' / ') : '尚未取得戰術強化');
}
let bossAnnounced = 0;
function syncBoss() {
  const banner = el('boss-banner'), boss = run.boss, warning = run.bossWarning;
  const active = run.phase !== 'ready' && (boss !== undefined || warning !== undefined);
  banner.hidden = !active; if (!active) return;
  banner.classList.toggle('incoming', !boss);
  if (boss) {
    text('boss-title', '屍王來襲'); text('boss-detail', `${Math.ceil(100 * boss.hp / boss.maxHp)}%`);
    el('boss-fill').style.width = `${Math.max(0, 100 * boss.hp / boss.maxHp)}%`;
  } else {
    text('boss-title', '屍王衝鋒'); text('boss-detail', `${Math.ceil(warning!)} 秒後抵達`); el('boss-fill').style.width = '100%';
    // One screen-reader announcement per rush, not one per UI tick.
    if (bossAnnounced !== run.nextBossAt) { bossAnnounced = run.nextBossAt; text('announcement', '屍王即將帶隊衝鋒。'); }
  }
}
el('pause').onclick = () => { if (run.phase === 'paused') run.resume(); else run.pause(); sync(); };
el('repair').onclick = () => { if (run.repair()) audio.play('buy'); sync(); };
el('fortify').onclick = () => { if (run.fortify()) audio.play('buy'); sync(); };
dialog.addEventListener('cancel', e => { e.preventDefault(); if (talents.active) talents.close(); else if (run.phase === 'paused') { run.resume(); sync(); } });
window.addEventListener('storage', event => {
  if (event.key !== META_KEY && event.key !== null) return;
  meta.refresh(); if (talents.active) talents.render(); else if (run.phase === 'ready') reset();
});
for (const kind of MERC_KINDS) {
  el(`buy-${kind}`).onclick = () => { if (run.mercenaries.some(m => m.kind === kind) ? run.upgrade(kind) : run.recruit(kind)) audio.play('buy'); sync(); };
  const button = el<HTMLButtonElement>(`skill-${kind}`); let down: { x: number; y: number; id: number } | undefined;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault(); down = { x: event.clientX, y: event.clientY, id: event.pointerId }; button.setPointerCapture(event.pointerId);
    aim = { slot: run.mercenaries.findIndex(m => m.kind === kind), ...battlefield.point(event.clientX, event.clientY) };
  });
  button.addEventListener('pointermove', event => { if (down && aim && event.pointerId === down.id) Object.assign(aim, battlefield.point(event.clientX, event.clientY)); });
  button.addEventListener('pointerup', event => {
    if (!down || event.pointerId !== down.id || !aim) return;
    const point = battlefield.point(event.clientX, event.clientY), wasClick = Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8;
    if (point.valid) { run.cast(aim.slot, point.x, point.y); aim = undefined; }
    else if (wasClick) { aim = { slot: aim.slot, x: 470, y: 235, valid: true }; el('battlefield').focus(); }
    else aim = undefined;
    down = undefined; if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); sync();
  });
  button.addEventListener('pointercancel', () => { down = undefined; aim = undefined; sync(); });
  button.addEventListener('click', event => { if (event.detail === 0 && !button.disabled) { aim = { slot: run.mercenaries.findIndex(m => m.kind === kind), x: 470, y: 235, valid: true }; el('battlefield').focus(); sync(); } });
}
el('battlefield').addEventListener('pointermove', event => { if (aim) Object.assign(aim, battlefield.point(event.clientX, event.clientY)); });
el('battlefield').addEventListener('pointerup', event => { if (!aim) return; const point = battlefield.point(event.clientX, event.clientY); if (point.valid) run.cast(aim.slot, point.x, point.y); aim = undefined; sync(); });
window.addEventListener('keydown', event => {
  if (dialog.open) return;
  if (event.key === 'Escape') { if (aim) aim = undefined; else run.pause(); sync(); return; }
  const index = ['1', '2', '3'].indexOf(event.key);
  if (index >= 0 && run.phase === 'running') { const kind = MERC_KINDS[index]!, slot = run.mercenaries.findIndex(m => m.kind === kind); if (slot >= 0 && run.mercenaries[slot]!.cooldown <= 0) aim = { slot, x: 470, y: 235, valid: true }; }
  if (aim && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ') { run.cast(aim.slot, aim.x, aim.y); aim = undefined; }
    else { aim.x = Math.max(0, Math.min(750, aim.x + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0))); aim.y = Math.max(65, Math.min(390, aim.y + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0))); }
  }
  sync();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { aim = undefined; run.pause(); sync(); } previous = performance.now(); });
window.addEventListener('blur', () => { aim = undefined; run.pause(); sync(); });
// ---------- sound ----------
const heard = new WeakSet<VisualEvent>();
let heardRun: DefenseRun | undefined, lastWall = 0, wasWarning = false, lastBossId = 0;
function cueFor(event: VisualEvent): Cue | undefined {
  if (event.kind === 'shot') return event.color === MERCENARIES.tesla.color ? 'tesla' : 'rifle';
  if (event.kind === 'blast') return event.color === '#e6764b' ? 'molotov' : 'grenade';
  if (event.kind === 'flame' || event.kind === 'laser' || event.kind === 'kill') return event.kind;
  return undefined;
}
/** Turns this frame's new combat events and state changes into sound cues. */
function listen() {
  if (heardRun !== run) { heardRun = run; lastWall = run.wallHealth; wasWarning = false; lastBossId = 0; }
  for (const event of run.events) {
    if (heard.has(event)) continue;
    heard.add(event); const cue = cueFor(event); if (cue) audio.play(cue);
  }
  if (run.wallHealth < lastWall - 1e-6 && run.phase === 'running') audio.play('wall');
  lastWall = run.wallHealth;
  const warning = run.bossWarning !== undefined;
  if (warning && !wasWarning) audio.play('bossWarning');
  wasWarning = warning;
  const boss = run.boss;
  if (boss && boss.id !== lastBossId) { lastBossId = boss.id; audio.play('bossArrive'); }
  else if (!boss && lastBossId && run.phase === 'running') { lastBossId = 0; audio.play('bossDown'); }
}
function syncVolume() {
  const volume = el<HTMLInputElement>('volume'), mute = el<HTMLButtonElement>('mute');
  volume.value = String(audioPreferences.volume);
  volume.style.setProperty('--volume', `${audioPreferences.volume}%`);
  const silent = audioPreferences.muted || audioPreferences.volume === 0;
  mute.innerHTML = icon(silent ? 'muted' : 'sound'); mute.setAttribute('aria-pressed', String(audioPreferences.muted));
  mute.title = audioPreferences.muted ? '開啟音效' : '關閉音效';
}
el('mute').onclick = () => {
  audioPreferences.muted = !audioPreferences.muted;
  if (!audioPreferences.muted && audioPreferences.volume === 0) audioPreferences.volume = 50;
  audio.unlock(); audio.setMuted(audioPreferences.muted); audio.setVolume(audioPreferences.volume);
  saveAudioPreferences(audioPreferences, storage); syncVolume(); audio.play('pick');
};
el<HTMLInputElement>('volume').addEventListener('input', event => {
  audioPreferences.volume = Number((event.currentTarget as HTMLInputElement).value);
  if (audioPreferences.muted && audioPreferences.volume > 0) { audioPreferences.muted = false; audio.setMuted(false); }
  audio.unlock(); audio.setVolume(audioPreferences.volume); syncVolume();
});
el<HTMLInputElement>('volume').addEventListener('change', () => { saveAudioPreferences(audioPreferences, storage); audio.play('pick'); });
// Browsers only allow audio after a user gesture; any tap or key unlocks it.
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => audio.unlock(), { capture: true });
syncVolume();

function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
  run.advance(dt); uiClock += dt; listen();
  if (uiClock >= 0.08 || displayedPhase !== run.phase) { sync(); uiClock = 0; }
  battlefield.draw(run, aim); requestAnimationFrame(frame);
}
sync(); requestAnimationFrame(frame);
