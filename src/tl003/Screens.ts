/**
 * Full-screen overlays: deployment, the level-up card choice and the battle report.
 * Text diet: icons and numbers on the surface, full rules one tap away (the card info button).
 */
import './screens.css';
import { formatNumber } from './Combat.ts';
import { MERCENARIES, RARITIES, SKILLS } from './Content.ts';
import type { MercKind, SkillId } from './Content.ts';
import type { UpgradeCard } from './Content.ts';
import { FRAMES } from './generated/sprites.ts';
import type { PermanentEffects } from './Talents.ts';
import { deploymentSummary } from './TalentScreen.ts';

export const px = (name: string, size = 2) => `<i class="px-icon" data-icon="${name}" style="--px:${size}px" aria-hidden="true"></i>`;
export const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** Category → small pixel icon shown on the card's colour band. */
const CATEGORY_ICON: Record<string, string> = {
  動能: 'icon_el_kinetic', 火焰: 'icon_el_fire', 毒素: 'icon_el_toxin', 電能: 'icon_el_electric', 冷凍: 'icon_el_cold', 爆裂: 'icon_el_blast',
  元素: 'icon_el_fire', 物理: 'icon_el_kinetic', 招募: 'icon_merc_rifle', 投擲物: 'icon_skill_grenade',
  傭兵: 'icon_merc_rifle', 經濟: 'icon_money', 防守: 'icon_fortify', 連動: 'icon_star', 質變: 'icon_star', 詛咒: 'icon_wave',
};

export function deployScreen(effects: PermanentEffects, talentPoints: number, bestWave: number, showTips: boolean, danger = { unlocked: 0, selected: 0 }) {
  const tips = [['icon_money', '擊殺賺錢'], ['icon_merc_cryo', '補給招募'], ['icon_skill_grenade', '拖曳投擲物'], ['icon_wave', '第 4 關屍王']];
  const levels = Array.from({ length: danger.unlocked + 1 }, (_, d) => d);
  return `<div class="screen deploy-screen">
    <div class="deploy-hero" aria-hidden="true"><span class="hero-glow"></span>${px('zombie_walker_0', 3)}${px('merc_rifle', 5)}${px('zombie_runner_1', 3)}</div>
    <h2 id="modal-title" class="logo"><span>無盡防線</span><small>THE LAST LINE</small></h2>
    ${deploymentSummary(effects)}
    ${showTips ? `<ul class="deploy-tips">${tips.map(([icon, label]) => `<li>${px(icon, 2)}<span>${label}</span></li>`).join('')}</ul>` : ''}
    <div class="screen-actions">
      ${danger.unlocked > 0 ? `<div class="danger-pick" role="group" aria-label="危險等級">${levels.map(d => `<button type="button" data-danger="${d}" aria-pressed="${d === danger.selected}">${d === 0 ? '一般' : '危險 ' + d}</button>`).join('')}</div>
      <p class="danger-note">${danger.selected === 0 ? '一般難度。' : `喪屍強度等於往後推 ${danger.selected * 10} 關，戰功 ×${danger.selected + 1}。`}</p>` : ''}
      <button id="start" class="primary go">部署 <span>▶</span></button>
      <button id="open-talents" class="camp-button">${px('icon_star', 2)}<b>指揮藍圖</b>${talentPoints > 0 ? `<span class="badge">${formatNumber(talentPoints)}</span>` : '<span></span>'}</button>
      ${bestWave > 0 ? `<p class="best">最佳 <b>第 ${bestWave} 關</b></p>` : ''}
      <button id="replay-briefing" class="briefing-button" type="button">▶ 作戰簡報</button>
    </div>
  </div>`;
}

/** Cards without their own art yet borrow the closest existing icon. */
const ICON_ALIAS: Record<string, string> = {
  crit: 'kinetic', critDamage: 'kinetic', pierce: 'kinetic', burnTime: 'burn', acid: 'bio', coil: 'shock', training: 'speed',
  curse_powder: 'kinetic', curse_fuel: 'fire', curse_salvage: 'income', curse_battery: 'active', curse_contract: 'income', curse_stim: 'crit',
  airdrop: 'income', haggle: 'income', plating: 'wall', spikes: 'wall', phosphorus: 'burn', acidcore: 'bio', railgun: 'shock',
  chemfire: 'fire', overheat: 'shock', conductor: 'bio', frag: 'radius', double: 'active', hex: 'active', napalm: 'fire',
  inferno: 'radius', wildfire: 'burn', overload: 'shock', hifreq: 'haste', refract: 'shock',
};
/** Evolutions without art of their own show their throwable. */
const EVOLUTION_ICON: Record<string, string> = { crossfire: 'strafe', barrage: 'mortar', absolutezero: 'cryobomb', cascade: 'emp', nerve: 'gas', cluster: 'minefield', marksman: 'snipe' };
export const cardIcon = (id: string) => {
  // Recruit and skill cards show the mercenary portrait or the skill icon.
  if ((id.startsWith('merc_') || id.startsWith('skill_')) && FRAMES['icon_' + id]) return 'icon_' + id;
  if (EVOLUTION_ICON[id] && FRAMES['icon_skill_' + EVOLUTION_ICON[id]]) return 'icon_skill_' + EVOLUTION_ICON[id];
  return FRAMES['icon_card_' + id] ? 'icon_card_' + id : 'icon_card_' + (ICON_ALIAS[id] ?? 'kinetic');
};
const KIND_TAG: Record<string, string> = { synergy: '連動', evolution: '質變', curse: '詛咒', merc: '招募', skill: '主動' };
/** `tip`: the new-player guide's note for the first pick (HTML). */
export function choiceScreen(level: number, cards: readonly UpgradeCard[], reroll?: { cost: number; affordable: boolean }, picks = 1, tip?: string, autoPick = false, queued = 0, dps: readonly number[] = []) {
  const market = cards.length > 3 || picks > 1;
  return `<div class="screen choice-screen${market ? ' market' : ''}">
    <div class="choice-head"><small>${market ? 'BLACK MARKET' : 'FIELD SUPPLY'}</small><b id="modal-title">Lv ${level}<span class="sr-only">，戰地補給，選擇一張</span></b>${market ? `<span class="picks-left">再選 ${picks} 張</span>` : queued > 0 ? `<span class="picks-left">還有 ${queued} 次</span>` : ''}</div>
    ${tip ? `<p class="choice-tip">${tip}</p>` : ''}
    <div class="pick-row">${cards.map((card, i) => {
      const rarity = card.rarity ?? 'common', tag = KIND_TAG[card.kind ?? ''];
      return `<div class="pick-card rarity-${rarity}${card.kind && card.kind !== 'normal' ? ' kind-' + card.kind : ''}" style="--card-color:${card.color};--rarity:${RARITIES[rarity].color}">
      <button class="pick" data-card="${card.id}" aria-label="${RARITIES[rarity].name}${tag ? '・' + tag : ''}・${card.name}：${card.short}。${card.description}">
        <span class="pick-band">${px(CATEGORY_ICON[card.category] ?? 'icon_el_kinetic', 1)}<span>${tag ?? card.category}</span></span>
        <span class="pick-art">${px(cardIcon(card.id), 4)}</span>
        <strong>${card.name}</strong>
        <span class="pick-rarity">${RARITIES[rarity].name}</span>
        <span class="pick-stat">${card.short}</span>
        ${Math.abs(dps[i] ?? 0) >= 0.005 ? `<span class="pick-dps ${(dps[i] ?? 0) > 0 ? 'up' : 'down'}">面板 DPS ${(dps[i] ?? 0) > 0 ? '+' : ''}${((dps[i] ?? 0) * 100).toFixed(1)}%</span>` : ''}
        <kbd>${i + 1}</kbd>
      </button>
      <button class="pick-info" data-info="${i}" aria-label="${card.name}的完整說明" aria-expanded="false">i</button>
      ${rarity === 'legendary' ? '<span class="pick-cover" aria-hidden="true"><b>!</b></span>' : ''}
    </div>`;
    }).join('')}</div>
    <p class="pick-detail" id="pick-detail" aria-live="polite"></p>
    <div class="choice-foot">
      ${reroll ? `<button id="reroll" class="reroll" ${reroll.affordable ? '' : 'disabled'}>重抽（限 1 次）${reroll.cost === 0 ? '<b>免費</b>' : `${px('icon_money', 1)} ${formatNumber(reroll.cost)}`}</button>` : '<span class="reroll-used">本次已重抽</span>'}
      <label class="auto-pick"><input type="checkbox" id="auto-pick" ${autoPick ? 'checked' : ''}> 自動選最高稀有度</label>
    </div>
  </div>`;
}

export interface Report {
  victory: boolean; elapsed: number; kills: number; income: number;
  points: number; stages: number; danger: number; breakdown: string;
  bestWave: number; previousBest: number; persistent: boolean;
}
export function resultScreen(r: Report) {
  const record = r.bestWave > r.previousBest;
  return `<div class="screen result-screen ${r.victory ? 'victory' : ''}">
    <small class="result-kicker">${r.victory ? 'MISSION COMPLETE' : 'LINE BROKEN'}</small>
    <h2 id="modal-title" class="result-title">${r.victory ? '守住了' : '防線失守'}</h2>
    <div class="result-row">
      <div>${px('icon_time', 2)}<strong data-count="${r.elapsed}" data-format="clock">00:00</strong><span>堅守</span></div>
      <div>${px('icon_wave', 2)}<strong data-count="${r.kills}">0</strong><span>擊殺</span></div>
      <div>${px('icon_money', 2)}<strong data-count="${r.income}" data-format="number">0</strong><span>收入</span></div>
    </div>
    <div class="result-points">
      <span>戰功 ★</span><strong id="result-points">+0</strong>
      <small>通過 ${r.stages} 關${r.danger ? ` · 危險 ${r.danger}（×${r.danger + 1}）` : ''}</small>
      ${record ? `<em class="new-best">新紀錄 第 ${r.bestWave} 關</em>` : ''}
    </div>
    <details class="result-breakdown" open><summary>傷害與控場回測</summary>${r.breakdown}</details>
    <div class="screen-actions">
      <button id="result-talents" class="primary go">分配戰功 <span>${px('icon_star', 1)} ${formatNumber(r.points)}</span></button>
      <button id="retry" class="camp-button"><b>再守一次</b><span>→</span></button>
      ${r.persistent ? '' : '<p class="best warn">無法存檔。戰功只留在此分頁</p>'}
    </div>
  </div>`;
}
export const formatCount = (format: string | undefined) => (v: number) => format === 'clock' ? clock(v) : format === 'number' ? formatNumber(Math.floor(v)) : Math.round(v).toString();

/** What a damage source key (Run.damageSource) is called and coloured in the breakdowns. */
const SHARED_SOURCES: Record<string, [string, string]> = {
  burn: ['燃燒（持續）', '#e6764b'], frostbite: ['凍傷（冰凍爆發）', '#bfe8ff'], shockburst: ['電爆（麻痺爆發）', '#c7f5ff'],
  toxicburst: ['毒爆', '#a6c46a'], corpseblast: ['屍爆', '#d9a066'], thorns: ['拒馬反傷', '#b9bfb0'], other: ['其他', '#8a8f86'],
};
export function sourceLabel(key: string): [string, string] {
  if (key.startsWith('merc:')) { const m = MERCENARIES[key.slice(5) as MercKind]; if (m) return [m.name, m.color]; }
  if (key.startsWith('skill:')) { const s = SKILLS[key.slice(6) as SkillId]; if (s) return [s.name, s.color]; }
  return SHARED_SOURCES[key] ?? [key, '#8a8f86'];
}
export interface BattleStats { damage: Record<string, number>; control: Record<string, number>; toxinBursts: number }
/**
 * v2 recap: damage by source (largest first, bars by share) and control applied. "Control" adds up every zombie's
 * seconds, so 30 zombies frozen for 2 s count as 60 s.
 */
export function damageBreakdown(stats: BattleStats, limit = 8) {
  const entries = Object.entries(stats.damage).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const rows = total > 0 ? entries.slice(0, limit).map(([key, v]) => {
    const [label, color] = sourceLabel(key), share = 100 * v / total;
    return `<li style="--share:${share.toFixed(1)}%;--c:${color}"><span>${label}</span><b>${formatNumber(v)}</b><em>${share < 1 ? '<1' : share.toFixed(0)}%</em></li>`;
  }).join('') : '<li class="empty"><span>還沒有傷害紀錄</span></li>';
  const sec = (v: number | undefined) => `${formatNumber(Math.round(v ?? 0))} 秒`;
  return `<ol class="breakdown">${rows}</ol>
    <p class="control-recap">點燃 <b>${sec(stats.control.ignite)}</b> · 冰凍 <b>${sec(stats.control.chill)}</b> · 麻痺 <b>${sec(stats.control.shock)}</b> · 暈眩 <b>${sec(stats.control.stun)}</b> · 毒爆 <b>${formatNumber(stats.toxinBursts)}</b> 次<small>（控場秒數為所有喪屍合計）</small></p>`;
}
