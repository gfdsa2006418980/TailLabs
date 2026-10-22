/**
 * Full-screen overlays: deployment, the level-up card choice and the battle report.
 * Text diet: icons and numbers on the surface, full rules one tap away (the card info button).
 */
import './screens.css';
import { formatNumber } from './Combat.ts';
import type { UpgradeCard } from './Content.ts';
import type { PermanentEffects } from './Talents.ts';
import { deploymentSummary } from './TalentScreen.ts';

export const px = (name: string, size = 2) => `<i class="px-icon" data-icon="${name}" style="--px:${size}px" aria-hidden="true"></i>`;
export const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

/** Category → small pixel icon shown on the card's colour band. */
const CATEGORY_ICON: Record<string, string> = {
  動能: 'icon_el_kinetic', 火焰: 'icon_el_fire', 生化: 'icon_el_bio', 電能: 'icon_el_electric',
  傭兵: 'icon_merc_rifle', 主動技能: 'icon_skill_rifle', 經濟: 'icon_money', 防守: 'icon_fortify',
};

export function deployScreen(effects: PermanentEffects, talentPoints: number, bestWave: number, showTips: boolean) {
  const tips = [['icon_money', '擊殺賺錢'], ['icon_card_kinetic', '升級三選一'], ['icon_skill_rifle', '拖曳技能'], ['icon_wave', '02:00 屍王']];
  return `<div class="screen deploy-screen">
    <div class="deploy-hero" aria-hidden="true"><span class="hero-glow"></span>${px('zombie_walker_0', 3)}${px('merc_rifle', 5)}${px('zombie_runner_1', 3)}</div>
    <h2 id="modal-title" class="logo"><span>無盡防線</span><small>THE LAST LINE</small></h2>
    ${deploymentSummary(effects)}
    ${showTips ? `<ul class="deploy-tips">${tips.map(([icon, label]) => `<li>${px(icon, 2)}<span>${label}</span></li>`).join('')}</ul>` : ''}
    <div class="screen-actions">
      <button id="start" class="primary go">部署 <span>▶</span></button>
      <button id="open-talents" class="camp-button">${px('icon_star', 2)}<b>天賦星盤</b>${talentPoints > 0 ? `<span class="badge">${formatNumber(talentPoints)}</span>` : '<span></span>'}</button>
      ${bestWave > 0 ? `<p class="best">最高 <b>W${bestWave.toString().padStart(2, '0')}</b></p>` : ''}
    </div>
  </div>`;
}

export function choiceScreen(level: number, cards: readonly UpgradeCard[]) {
  return `<div class="screen choice-screen">
    <div class="choice-head"><small>LEVEL UP</small><b id="modal-title">Lv ${level}<span class="sr-only">，選擇一張強化</span></b></div>
    <div class="pick-row">${cards.map((card, i) => `<div class="pick-card" style="--card-color:${card.color}">
      <button class="pick" data-card="${card.id}" aria-label="${card.name}：${card.short}。${card.description}">
        <span class="pick-band">${px(CATEGORY_ICON[card.category] ?? 'icon_el_kinetic', 1)}<span>${card.category}</span></span>
        <span class="pick-art">${px('icon_card_' + card.id, 4)}</span>
        <strong>${card.name}</strong>
        <span class="pick-stat">${card.short}</span>
        <kbd>${i + 1}</kbd>
      </button>
      <button class="pick-info" data-info="${i}" aria-label="${card.name}的完整說明" aria-expanded="false">i</button>
    </div>`).join('')}</div>
    <p class="pick-detail" id="pick-detail" aria-live="polite"></p>
  </div>`;
}

export interface Report {
  victory: boolean; elapsed: number; kills: number; income: number;
  points: number; timePoints: number; incomePoints: number;
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
      <span>天賦點</span><strong id="result-points">+0</strong>
      <small>時間 +${r.timePoints} · 收入 +${r.incomePoints}</small>
      ${record ? `<em class="new-best">新紀錄 W${r.bestWave.toString().padStart(2, '0')}</em>` : ''}
    </div>
    <div class="screen-actions">
      <button id="result-talents" class="primary go">投資天賦 <span>${px('icon_star', 1)} ${formatNumber(r.points)}</span></button>
      <button id="retry" class="camp-button"><b>再守一次</b><span>→</span></button>
      ${r.persistent ? '' : '<p class="best warn">瀏覽器無法保存，天賦點只留在此分頁</p>'}
    </div>
  </div>`;
}
export const formatCount = (format: string | undefined) => (v: number) => format === 'clock' ? clock(v) : format === 'number' ? formatNumber(Math.floor(v)) : Math.round(v).toString();
