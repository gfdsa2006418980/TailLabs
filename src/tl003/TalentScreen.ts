import './talents.css';
import { formatNumber } from './Combat.ts';
import { LocalMetaMirror } from './Meta.ts';
import { TALENTS, TALENT_LINKS, canBreakthrough, deploymentStats, isRevealed, talentById, talentCost, talentLevel, talentMultiplier } from './Talents.ts';
import type { TalentId, PermanentEffects } from './Talents.ts';
import type { TalentTree } from './Meta.ts';
import { countUp, pop } from './Motion.ts';

const px = (name: string, size = 2) => `<i class="px-icon" data-icon="${name}" style="--px:${size}px" aria-hidden="true"></i>`;
const decimal = (value: number) => Number.isFinite(value) ? value < 1000 ? Number(value.toFixed(2)).toString() : formatNumber(value) : '∞';
/** Next-run numbers as icon + value; the two-character label is the only text. */
export function deploymentSummary(effects: PermanentEffects) {
  const stats = deploymentStats(effects);
  const cell = (icon: string, value: string, label: string) => `<div>${px(icon, 2)}<strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="deployment-stats" role="group" aria-label="下一局永久效果：開場步槍每秒傷害、拒馬生命、戰場收入倍率">${cell('icon_merc_rifle', decimal(stats.dps), '火力')}${cell('icon_fortify', decimal(stats.wallHealth), '拒馬')}${cell('icon_money', '×' + decimal(stats.income), '收入')}</div>`;
}
const revealedSet = (tree: TalentTree) => new Set(TALENTS.filter(t => isRevealed(tree, t.id)).map(t => t.id));

/** Camp-only view. All purchases go through Meta's transaction and battle lock. */
export class TalentScreen {
  active = false;
  private selected: TalentId = 'mercenary_damage';
  private notice = '';
  private dialog: HTMLDialogElement;
  private meta: LocalMetaMirror;
  private onClose: () => void;
  private onDeploy: () => void;
  /** One-shot animation hints for the next render: the node just bought and the nodes it revealed. */
  private bought?: TalentId; private revealed = new Set<string>(); private pointsBefore?: number;
  constructor(dialog: HTMLDialogElement, meta: LocalMetaMirror, callbacks: { close: () => void; deploy: () => void }) {
    this.dialog = dialog; this.meta = meta; this.onClose = callbacks.close; this.onDeploy = callbacks.deploy;
  }
  open() {
    if (this.meta.inRun) return;
    this.meta.refresh(); this.active = true; this.notice = ''; this.render(); this.entrance();
    this.dialog.querySelector<HTMLButtonElement>('#talent-close')?.focus();
  }
  close(deploy = false) {
    this.active = false; this.dialog.classList.remove('talent-dialog');
    if (deploy) this.onDeploy(); else this.onClose();
  }
  /** Nodes light up outward from the root when the map opens. */
  private entrance() {
    this.dialog.querySelectorAll<HTMLElement>('.talent-node').forEach(node => {
      const row = Number(node.dataset.row ?? 0);
      node.style.animationDelay = `${80 + row * 70}ms`; node.classList.add('enter');
    });
  }
  private buy() {
    const before = revealedSet(this.meta.tree), points = this.meta.value.TalentPoints;
    const result = this.meta.buyTalent(this.selected);
    this.notice = result.ok ? '' : result.message;
    if (result.ok) {
      this.bought = this.selected; this.pointsBefore = points;
      this.revealed = new Set([...revealedSet(this.meta.tree)].filter(id => !before.has(id)));
    }
    this.render('talent-buy');
  }
  render(focusId?: string) {
    if (!this.active) return;
    const scrollTop = this.dialog.querySelector<HTMLElement>('.talent-scroll')?.scrollTop ?? 0;
    const tree = this.meta.tree, node = talentById(this.selected)!, revealed = isRevealed(tree, node.id);
    const level = talentLevel(tree, node.id), cost = talentCost(level), atCap = level >= tree.maxNodeLevel;
    const points = this.meta.value.TalentPoints, canBuy = revealed && !atCap && points >= cost;
    const links = TALENT_LINKS.map(([a, b]) => {
      const from = talentById(a)!, to = talentById(b)!;
      const lit = talentLevel(tree, a) > 0 || talentLevel(tree, b) > 0;
      const fresh = this.revealed.has(a) || this.revealed.has(b);
      return `<line x1="${50 + from.column * 100}" y1="${36 + from.row * 72}" x2="${50 + to.column * 100}" y2="${36 + to.row * 72}" class="${lit ? 'explored' : ''} ${fresh ? 'fresh' : ''}"/>`;
    }).join('');
    const multiplier = talentMultiplier(tree, node.id);
    const effect = node.id === 'active_skill_haste'
      ? `急速 <b>${decimal(100 * (multiplier - 1))}</b> → <em>${decimal(100 * (multiplier * node.growth - 1))}</em>`
      : `×<b>${decimal(multiplier)}</b> → <em>×${decimal(multiplier * node.growth)}</em>`;
    const blocked = !revealed ? '未揭露' : atCap ? '本階已滿' : !canBuy ? `還差 ${formatNumber(cost - points)}` : '';
    const breakthrough = canBreakthrough(tree);
    this.dialog.classList.add('talent-dialog'); this.dialog.dataset.kind = 'talents';
    this.dialog.querySelector<HTMLElement>('#modal-content')!.innerHTML = `
      <header class="talent-heading"><button id="talent-close" class="quiet-button" aria-label="關閉天賦星盤">×</button><h2 id="modal-title">天賦星盤</h2><span class="talent-tier">T${tree.tier} · Lv ${tree.maxNodeLevel}</span><div class="talent-wallet" role="group" aria-label="可用天賦點">${px('icon_star', 2)}<strong id="talent-points">${formatNumber(points)}</strong></div></header>
      ${deploymentSummary(this.meta.effects)}
      <div class="talent-scroll" aria-label="可捲動的天賦星盤"><div class="talent-map"><svg class="talent-links" viewBox="0 0 300 288" preserveAspectRatio="none" aria-hidden="true">${links}</svg>${TALENTS.map(talent => {
        const known = isRevealed(tree, talent.id), owned = talentLevel(tree, talent.id);
        const classes = ['talent-node', known ? 'revealed' : 'unexplored', owned ? 'invested' : '', node.id === talent.id ? 'selected' : '',
          this.bought === talent.id ? 'just-bought' : '', this.revealed.has(talent.id) ? 'just-revealed' : ''].filter(Boolean).join(' ');
        return `<button id="talent-${talent.id}" class="${classes}" data-talent="${talent.id}" data-row="${talent.row}" style="left:${(50 + talent.column * 100) / 3}%;top:${(36 + talent.row * 72) / 288 * 100}%;--node-color:${talent.color}" aria-label="${known ? `${talent.name}，等級 ${owned}，本階上限 ${tree.maxNodeLevel}` : '未探索節點，投資相鄰節點後揭露'}" aria-pressed="${node.id === talent.id}"><span class="node-symbol">${known ? talent.glyph : '?'}</span><span class="node-name">${known ? talent.name : '???'}</span><small>${known ? `${owned}/${tree.maxNodeLevel}` : ''}</small></button>`;
      }).join('')}</div></div>
      <section class="talent-inspector" aria-label="所選天賦" style="--node-color:${node.color}">
        <div class="talent-detail-heading"><span class="node-symbol">${revealed ? node.glyph : '?'}</span><strong>${revealed ? node.name : '未探索'}</strong><span>${revealed ? `Lv ${level}/${tree.maxNodeLevel}` : ''}</span></div>
        <div class="talent-effect">${revealed ? effect : '投資相鄰節點即可揭露'}</div>
        ${revealed ? `<p>${node.description}</p>` : ''}
        <button id="talent-buy" ${canBuy ? '' : 'disabled'}>${blocked ? `<span>${blocked}</span>` : `<span>▲ 升級</span><b>${px('icon_star', 1)} ${formatNumber(cost)}</b>`}</button>
      </section>
      ${breakthrough ? `<button id="talent-breakthrough" class="talent-breakthrough">突破至第 ${tree.tier + 1} 階 <span>上限 +10 ↗</span></button>` : ''}
      <p id="talent-notice" class="talent-notice" role="status" aria-live="polite">${this.notice || (this.meta.persistent ? '' : '瀏覽器無法保存，成長只留在此分頁')}</p>
      <button id="talent-deploy" class="primary go">部署下一局 <span>▶</span></button>`;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector<HTMLElement>('.talent-scroll')!.scrollTop = scrollTop;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-talent]').forEach(button => {
      button.onclick = () => { this.selected = button.dataset.talent as TalentId; this.notice = ''; this.render(button.id); pop(this.dialog.querySelector('.talent-inspector'), 1.03, 160); };
    });
    this.dialog.querySelector<HTMLButtonElement>('#talent-buy')!.onclick = () => this.buy();
    const breakButton = this.dialog.querySelector<HTMLButtonElement>('#talent-breakthrough');
    if (breakButton) breakButton.onclick = () => { this.notice = this.meta.breakthrough().message; this.render('talent-deploy'); };
    this.dialog.querySelector<HTMLButtonElement>('#talent-close')!.onclick = () => this.close();
    this.dialog.querySelector<HTMLButtonElement>('#talent-deploy')!.onclick = () => this.close(true);
    if (this.pointsBefore !== undefined) {
      const wallet = this.dialog.querySelector<HTMLElement>('#talent-points')!;
      void countUp(wallet, this.pointsBefore, points, { duration: 350, format: v => formatNumber(Math.round(v)) });
      pop(wallet.parentElement, 1.15, 220);
    }
    this.bought = undefined; this.revealed = new Set(); this.pointsBefore = undefined;
    // Fall back to the selected node when the requested button is gone or disabled (e.g. points ran out).
    const target = focusId ? this.dialog.querySelector<HTMLButtonElement>(`#${focusId}`) : null;
    (target && !target.disabled ? target : this.dialog.querySelector<HTMLButtonElement>(`#talent-${this.selected}`))?.focus({ preventScroll: true });
  }
}
