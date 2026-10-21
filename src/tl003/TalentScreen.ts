import './talents.css';
import { formatNumber } from './Combat.ts';
import { LocalMetaMirror } from './Meta.ts';
import { TALENTS, TALENT_LINKS, canBreakthrough, deploymentStats, isRevealed, talentById, talentCost, talentLevel, talentMultiplier } from './Talents.ts';
import type { TalentId, PermanentEffects } from './Talents.ts';

const decimal = (value: number) => Number.isFinite(value) ? value < 1000 ? Number(value.toFixed(2)).toString() : formatNumber(value) : '∞';
export function deploymentSummary(effects: PermanentEffects) {
  const stats = deploymentStats(effects);
  return `<div class="deployment-stats" aria-label="下一局永久效果"><div><span>開場步槍 DPS</span><strong>${decimal(stats.dps)}</strong></div><div><span>拒馬生命</span><strong>${decimal(stats.wallHealth)}</strong></div><div><span>戰場收入</span><strong>×${decimal(stats.income)}</strong></div></div>`;
}

/** Camp-only view. All purchases go through Meta's transaction and battle lock. */
export class TalentScreen {
  active = false;
  private selected: TalentId = 'mercenary_damage';
  private notice = '';
  private dialog: HTMLDialogElement;
  private meta: LocalMetaMirror;
  private onClose: () => void;
  private onDeploy: () => void;
  constructor(dialog: HTMLDialogElement, meta: LocalMetaMirror, callbacks: { close: () => void; deploy: () => void }) {
    this.dialog = dialog; this.meta = meta; this.onClose = callbacks.close; this.onDeploy = callbacks.deploy;
  }
  open() {
    if (this.meta.inRun) return;
    this.meta.refresh(); this.active = true; this.notice = ''; this.render();
    this.dialog.querySelector<HTMLButtonElement>('#talent-close')?.focus();
  }
  close(deploy = false) {
    this.active = false; this.dialog.classList.remove('talent-dialog');
    if (deploy) this.onDeploy(); else this.onClose();
  }
  render(focusId?: string) {
    if (!this.active) return;
    const scrollTop = this.dialog.querySelector<HTMLElement>('.talent-scroll')?.scrollTop ?? 0;
    const tree = this.meta.tree, node = talentById(this.selected)!, revealed = isRevealed(tree, node.id);
    const level = talentLevel(tree, node.id), cost = talentCost(level), atCap = level >= tree.maxNodeLevel;
    const canBuy = revealed && !atCap && this.meta.value.TalentPoints >= cost;
    const links = TALENT_LINKS.map(([a, b]) => {
      const from = talentById(a)!, to = talentById(b)!;
      const lit = talentLevel(tree, a) > 0 || talentLevel(tree, b) > 0;
      return `<line x1="${50 + from.column * 100}" y1="${36 + from.row * 72}" x2="${50 + to.column * 100}" y2="${36 + to.row * 72}" class="${lit ? 'explored' : ''}"/>`;
    }).join('');
    const multiplier = talentMultiplier(tree, node.id);
    const effect = node.id === 'active_skill_haste'
      ? `技能急速 ${decimal(100 * (multiplier - 1))} → ${decimal(100 * (multiplier * node.growth - 1))}`
      : `永久效果 ×${decimal(multiplier)} → ×${decimal(multiplier * node.growth)}`;
    const availability = !revealed ? '對相鄰節點投入第 1 點即可揭露。' : atCap ? '已達本階上限，突破後可繼續成長。'
      : !canBuy ? `還差 ${formatNumber(cost - this.meta.value.TalentPoints)} 點，下一場繼續累積。` : '本局外投資，下一局立即生效。';
    this.dialog.classList.add('talent-dialog');
    this.dialog.querySelector<HTMLElement>('#modal-content')!.innerHTML = `
      <header class="talent-heading"><div><span class="modal-kicker">PERMANENT PROGRESSION</span><h2 id="modal-title">天賦星盤</h2></div><div class="talent-wallet"><span>可用天賦點</span><strong id="talent-points">${formatNumber(this.meta.value.TalentPoints)}</strong></div><button id="talent-close" class="quiet-button" aria-label="關閉天賦星盤">×</button></header>
      ${deploymentSummary(this.meta.effects)}
      <div class="talent-tier"><span>第 ${tree.tier} 階 <b>·</b> 節點上限 Lv.${tree.maxNodeLevel}</span><span>第 1 點揭露相鄰節點</span></div>
      <div class="talent-scroll" aria-label="可捲動的天賦星盤"><div class="talent-map"><svg class="talent-links" viewBox="0 0 300 288" preserveAspectRatio="none" aria-hidden="true">${links}</svg>${TALENTS.map(talent => {
        const known = isRevealed(tree, talent.id), owned = talentLevel(tree, talent.id);
        return `<button id="talent-${talent.id}" class="talent-node ${known ? 'revealed' : 'unexplored'} ${owned ? 'invested' : ''} ${node.id === talent.id ? 'selected' : ''}" data-talent="${talent.id}" style="left:${(50 + talent.column * 100) / 3}%;top:${(36 + talent.row * 72) / 288 * 100}%;--node-color:${talent.color}" aria-label="${known ? `${talent.name}，等級 ${owned}，本階上限 ${tree.maxNodeLevel}` : '未探索節點，投資相鄰節點後揭露'}" aria-pressed="${node.id === talent.id}"><span class="node-symbol">${known ? talent.glyph : '?'}</span><span class="node-name">${known ? talent.name : '未探索'}</span><small>${known ? `${owned} / ${tree.maxNodeLevel}` : '—'}</small></button>`;
      }).join('')}</div></div>
      <section class="talent-inspector" aria-label="所選天賦"><div class="talent-detail-heading"><strong>${revealed ? node.name : '未探索節點'}</strong><span>${revealed ? `${node.category} · Lv.${level} / ${tree.maxNodeLevel}` : '?'}</span></div><p>${revealed ? node.description : '探索相鄰節點，逐步展開你的成長路線。'}</p><div class="talent-effect">${revealed ? effect : '投入第一點即可繼續探索。'}</div><div class="talent-purchase-row"><span>${availability}</span><button id="talent-buy" ${canBuy ? '' : 'disabled'}>${atCap ? '本階已滿' : `投入 1 級 · ${revealed ? formatNumber(cost) : '?'} 點`}</button></div></section>
      <div class="talent-breakthrough"><button id="talent-breakthrough" ${canBreakthrough(tree) ? '' : 'disabled'}>突破至第 ${tree.tier + 1} 階 ↗</button><span>${canBreakthrough(tree) ? '免費突破 · 所有節點上限 +10 · 等級保留' : `任一節點達到 Lv.${tree.maxNodeLevel} 可突破`}</span></div>
      <p id="talent-notice" class="talent-notice" role="status" aria-live="polite">${this.notice || (this.meta.persistent ? '投資結果會保存在此瀏覽器。' : '瀏覽器無法保存，成長暫留於此分頁。')}</p>
      <button id="talent-deploy" class="primary">套用成長，部署下一局 <span>→</span></button>`;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector<HTMLElement>('.talent-scroll')!.scrollTop = scrollTop;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-talent]').forEach(button => {
      button.onclick = () => { this.selected = button.dataset.talent as TalentId; this.notice = ''; this.render(button.id); };
    });
    this.dialog.querySelector<HTMLButtonElement>('#talent-buy')!.onclick = () => {
      this.notice = this.meta.buyTalent(this.selected).message; this.render(`talent-${this.selected}`);
    };
    this.dialog.querySelector<HTMLButtonElement>('#talent-breakthrough')!.onclick = () => {
      this.notice = this.meta.breakthrough().message; this.render('talent-breakthrough');
    };
    this.dialog.querySelector<HTMLButtonElement>('#talent-close')!.onclick = () => this.close();
    this.dialog.querySelector<HTMLButtonElement>('#talent-deploy')!.onclick = () => this.close(true);
    if (focusId) this.dialog.querySelector<HTMLButtonElement>(`#${focusId}`)?.focus({ preventScroll: true });
  }
}
