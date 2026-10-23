import { CORE_SLOT_STAGES } from './Balance.ts';
import './talents.css';
import { formatNumber } from './Combat.ts';
import { LocalMetaMirror } from './Meta.ts';
import type { TalentTree } from './Meta.ts';
import {
  CORES, MAP_CENTRE, MAP_SIZE, TALENTS, TALENT_LINKS, canBreakthrough, coreById, coreConflicts, coreSlots, deploymentStats,
  isCoreActive, isCoreRevealed, isCoreUnlocked, isRevealed, talentById, talentCost, talentLevel, talentMultiplier,
} from './Talents.ts';
import type { PermanentEffects } from './Talents.ts';
import { countUp, pop } from './Motion.ts';

const px = (name: string, size = 2) => `<i class="px-icon" data-icon="${name}" style="--px:${size}px" aria-hidden="true"></i>`;
const decimal = (value: number) => Number.isFinite(value) ? value < 1000 ? Number(value.toFixed(2)).toString() : formatNumber(value) : '∞';
/** Next-run numbers as icon + value; the two-character label is the only text. */
export function deploymentSummary(effects: PermanentEffects) {
  const stats = deploymentStats(effects);
  const cell = (icon: string, value: string, label: string) => `<div>${px(icon, 2)}<strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="deployment-stats" role="group" aria-label="下一局永久效果：開場步槍每秒傷害、拒馬生命、戰場收入倍率">${cell('icon_merc_rifle', decimal(stats.dps), '火力')}${cell('icon_fortify', decimal(stats.wallHealth), '拒馬')}${cell('icon_money', '×' + decimal(stats.income), '收入')}</div>`;
}
const revealedSet = (tree: TalentTree) => new Set([...TALENTS.filter(t => isRevealed(tree, t.id)).map(t => t.id), ...CORES.filter(c => isCoreRevealed(tree, c.id)).map(c => c.id)]);
const SLOT_TIERS = [1, 2, 3];
type Selection = { type: 'node' | 'core'; id: string };

/** Camp-only view. All purchases go through Meta's transaction and battle lock. */
export class TalentScreen {
  active = false;
  private selected: Selection = { type: 'node', id: 'mercenary_damage' };
  private notice = '';
  private dialog: HTMLDialogElement;
  private meta: LocalMetaMirror;
  private onClose: () => void;
  private onDeploy: () => void;
  /** One-shot animation hints for the next render. */
  private bought?: string; private revealed = new Set<string>(); private pointsBefore?: number;
  private scroll?: { left: number; top: number };
  /** A mouse drag that panned the map must not also select the node it started on. */
  private dragged = false;
  constructor(dialog: HTMLDialogElement, meta: LocalMetaMirror, callbacks: { close: () => void; deploy: () => void }) {
    this.dialog = dialog; this.meta = meta; this.onClose = callbacks.close; this.onDeploy = callbacks.deploy;
  }
  open() {
    if (this.meta.inRun) return;
    this.meta.refresh(); this.active = true; this.notice = ''; this.scroll = undefined; this.render(); this.entrance();
    this.dialog.querySelector<HTMLButtonElement>('#talent-close')?.focus({ preventScroll: true });
  }
  close(deploy = false) {
    this.active = false; this.dialog.classList.remove('talent-dialog');
    if (deploy) this.onDeploy(); else this.onClose();
  }
  /** Nodes light up outward from the hub when the map opens. */
  private entrance() {
    this.dialog.querySelectorAll<HTMLElement>('.star-node').forEach(node => {
      node.style.animationDelay = `${80 + Number(node.dataset.ring ?? 0) * 55}ms`; node.classList.add('enter');
    });
  }
  /** Run a Meta transaction and remember what it changed, for the next render's animations. */
  private transact(run: () => { ok: boolean; message: string }, animate: string) {
    const before = revealedSet(this.meta.tree), points = this.meta.value.TalentPoints;
    const result = run();
    this.notice = result.message;
    if (result.ok) {
      this.bought = animate; this.pointsBefore = points;
      this.revealed = new Set([...revealedSet(this.meta.tree)].filter(id => !before.has(id)));
    }
    this.render();
  }

  private ringOf(x: number, y: number) { return Math.round(Math.hypot(x - MAP_CENTRE, y - MAP_CENTRE) / 78); }
  private nodeButton(tree: TalentTree, id: string) {
    const node = talentById(id)!, known = isRevealed(tree, id), owned = talentLevel(tree, id);
    const selected = this.selected.type === 'node' && this.selected.id === id;
    const classes = ['star-node', known ? 'revealed' : 'unexplored', owned ? 'invested' : '', selected ? 'selected' : '',
      this.bought === id ? 'just-bought' : '', this.revealed.has(id) ? 'just-revealed' : ''].filter(Boolean).join(' ');
    return `<button id="talent-${id}" class="${classes}" data-talent="${id}" data-ring="${this.ringOf(node.x, node.y)}" style="left:${node.x}px;top:${node.y}px;--node-color:${node.color}" aria-label="${known ? `${node.name}，等級 ${owned}，本階上限 ${tree.maxNodeLevel}` : '未偵察節點，升級相鄰節點後揭露'}" aria-pressed="${selected}"><span class="node-symbol">${known ? node.glyph : '?'}</span><span class="node-name">${known ? node.name : '???'}</span><small>${known ? `${owned}/${tree.maxNodeLevel}` : ''}</small></button>`;
  }
  private coreButton(tree: TalentTree, id: string) {
    const core = coreById(id)!, known = isCoreRevealed(tree, id), unlocked = isCoreUnlocked(tree, id), equipped = isCoreActive(tree, id);
    const selected = this.selected.type === 'core' && this.selected.id === id;
    const classes = ['star-node', 'core-node', known ? 'revealed' : 'unexplored', unlocked ? 'unlocked' : '', equipped ? 'equipped' : '', selected ? 'selected' : '',
      this.bought === id ? 'just-bought' : '', this.revealed.has(id) ? 'just-revealed' : ''].filter(Boolean).join(' ');
    return `<button id="core-${id}" class="${classes}" data-core="${id}" data-ring="${this.ringOf(core.x, core.y)}" style="left:${core.x}px;top:${core.y}px;--node-color:${core.color}" aria-label="${known ? `戰術核心 ${core.name}${equipped ? '，已裝上' : unlocked ? '，已解鎖' : ''}` : '未偵察的戰術核心'}" aria-pressed="${selected}"><span class="node-symbol">${known ? '✠' : '?'}</span><span class="node-name">${known ? core.name : '???'}</span><small>${known ? equipped ? '裝備中' : unlocked ? '已解鎖' : `★${core.cost}` : ''}</small></button>`;
  }
  private slots(tree: TalentTree) {
    const open = coreSlots(tree);
    return `<div class="core-slots" role="group" aria-label="戰術核心槽位">${SLOT_TIERS.map((_, i) => {
      const id = tree.activeCoreTalents[i], core = id ? coreById(id) : undefined;
      if (i >= open) return `<div class="core-slot locked"><span>通過第 ${CORE_SLOT_STAGES[i - 1]} 關開放</span></div>`;
      if (!core) return `<div class="core-slot empty"><span>空槽</span></div>`;
      return `<button class="core-slot filled" data-slot-core="${core.id}" style="--node-color:${core.color}" aria-label="已裝上 ${core.name}"><b>✠</b><span>${core.name}</span></button>`;
    }).join('')}</div>`;
  }
  private inspector(tree: TalentTree) {
    const points = this.meta.value.TalentPoints;
    if (this.selected.type === 'core') {
      const core = coreById(this.selected.id)!, known = isCoreRevealed(tree, core.id), unlocked = isCoreUnlocked(tree, core.id), equipped = isCoreActive(tree, core.id);
      const conflicts = coreConflicts(tree, core.id), full = tree.activeCoreTalents.length >= coreSlots(tree);
      const action = !known ? '<button id="core-action" disabled><span>未偵察</span></button>'
        : !unlocked ? `<button id="core-action" data-action="unlock" ${points >= core.cost ? '' : 'disabled'}>${points >= core.cost ? `<span>解鎖</span><b>${px('icon_star', 1)} ${core.cost}</b>` : `<span>還差 ${core.cost - points}</span>`}</button>`
        : equipped ? '<button id="core-action" data-action="unequip"><span>卸下</span></button>'
        : `<button id="core-action" data-action="equip" ${conflicts.length || full ? 'disabled' : ''}><span>${conflicts.length ? '互斥' : full ? '槽位已滿' : '裝上'}</span></button>`;
      return `<section class="talent-inspector core-inspector" aria-label="所選戰術核心" style="--node-color:${core.color}">
        <div class="talent-detail-heading"><span class="node-symbol">✠</span><strong>${known ? core.name : '未偵察'}</strong><span>${known ? `戰術核心・${core.kind}` : ''}</span></div>
        ${known ? `<p class="core-rule">${core.rule}</p><p class="core-price">代價：${core.price}</p><p class="flavor">${core.flavor}${core.exclusive.length ? `<br><em>互斥：${core.exclusive.map(e => coreById(e)!.name).join('、')}</em>` : ''}</p>` : '<p>升級相鄰節點即可偵察。</p>'}
        <div class="core-buttons">${action}${unlocked ? `<button id="core-forget" class="forget"><span>遺忘</span><b>${px('icon_star', 1)} +${core.cost}</b></button>` : ''}</div>
      </section>`;
    }
    const node = talentById(this.selected.id)!, revealed = isRevealed(tree, node.id);
    const level = talentLevel(tree, node.id), cost = talentCost(level, node.id), atCap = level >= tree.maxNodeLevel, canBuy = revealed && !atCap && points >= cost;
    const multiplier = talentMultiplier(tree, node.id);
    const effect = node.id === 'active_skill_haste'
      ? `急速 <b>${decimal(100 * (multiplier - 1))}</b> → <em>${decimal(100 * (multiplier * node.growth - 1))}</em>`
      : node.growth === 1 ? `等級 <b>${level}</b> → <em>${level + 1}</em>` : `×<b>${decimal(multiplier)}</b> → <em>×${decimal(multiplier * node.growth)}</em>`;
    const blocked = !revealed ? '未偵察' : atCap ? '本階已滿' : !canBuy ? `還差 ${formatNumber(cost - points)}` : '';
    return `<section class="talent-inspector" aria-label="所選節點" style="--node-color:${node.color}">
      <div class="talent-detail-heading"><span class="node-symbol">${revealed ? node.glyph : '?'}</span><strong>${revealed ? node.name : '未偵察'}</strong><span>${revealed ? `${node.category}・Lv ${level}/${tree.maxNodeLevel}` : ''}</span></div>
      <div class="talent-effect">${revealed ? effect : '升級相鄰節點即可偵察'}</div>
      ${revealed ? `<p>${node.description}。<span class="flavor">${node.flavor}</span></p>` : ''}
      <button id="talent-buy" ${canBuy ? '' : 'disabled'}>${blocked ? `<span>${blocked}</span>` : `<span>▲ 升級</span><b>${px('icon_star', 1)} ${formatNumber(cost)}</b>`}</button>
    </section>`;
  }

  render() {
    if (!this.active) return;
    const scroller = this.dialog.querySelector<HTMLElement>('.star-scroll');
    if (scroller) this.scroll = { left: scroller.scrollLeft, top: scroller.scrollTop };
    const tree = this.meta.tree, points = this.meta.value.TalentPoints;
    const lines = [
      ...TALENT_LINKS.map(([a, b]) => ({ from: talentById(a)!, to: talentById(b)!, lit: talentLevel(tree, a) > 0 && isRevealed(tree, b), fresh: this.revealed.has(a) || this.revealed.has(b), core: false })),
      ...CORES.flatMap(core => core.links.map(link => ({ from: talentById(link)!, to: core, lit: talentLevel(tree, link) > 0, fresh: this.revealed.has(core.id), core: true }))),
    ].map(l => `<line x1="${l.from.x}" y1="${l.from.y}" x2="${l.to.x}" y2="${l.to.y}" class="${l.lit ? 'explored' : ''} ${l.fresh ? 'fresh' : ''} ${l.core ? 'to-core' : ''}"/>`).join('');
    const breakthrough = canBreakthrough(tree);
    this.dialog.classList.add('talent-dialog'); this.dialog.dataset.kind = 'talents';
    this.dialog.querySelector<HTMLElement>('#modal-content')!.innerHTML = `
      <header class="talent-heading"><button id="talent-close" class="quiet-button" aria-label="關閉指揮藍圖">×</button><h2 id="modal-title">指揮藍圖</h2><span class="talent-tier" title="所有節點都達本階上限才能晉階">T${tree.tier} · Lv ${tree.maxNodeLevel} · 滿級 ${TALENTS.filter(n => talentLevel(tree, n.id) >= tree.maxNodeLevel).length}/${TALENTS.length}</span><div class="talent-wallet" role="group" aria-label="可用戰功">${px('icon_star', 2)}<strong id="talent-points">${formatNumber(points)}</strong></div></header>
      ${this.slots(tree)}
      <div class="star-scroll talent-scroll" aria-label="可拖曳的指揮藍圖"><div class="star-map" style="width:${MAP_SIZE}px;height:${MAP_SIZE}px"><svg class="talent-links" viewBox="0 0 ${MAP_SIZE} ${MAP_SIZE}" aria-hidden="true">${lines}</svg>${TALENTS.map(n => this.nodeButton(tree, n.id)).join('')}${CORES.map(c => this.coreButton(tree, c.id)).join('')}</div></div>
      ${this.inspector(tree)}
      ${breakthrough ? `<button id="talent-breakthrough" class="talent-breakthrough">晉階至第 ${tree.tier + 1} 階 <span>上限 +10 ↗</span></button>` : ''}
      <p id="talent-notice" class="talent-notice" role="status" aria-live="polite">${this.notice || (this.meta.persistent ? '' : '無法存檔。戰功只留在此分頁')}</p>
      <button id="talent-deploy" class="primary go">返回標題 <span><i class="px-icon" data-icon="icon_back" style="--px:2px" aria-hidden="true"></i></span></button>`;
    if (!this.dialog.open) this.dialog.showModal();
    this.bindMap();
    const select = (selection: Selection) => { if (this.dragged) return; this.selected = selection; this.notice = ''; this.render(); pop(this.dialog.querySelector('.talent-inspector'), 1.03, 160); };
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-talent]').forEach(button => { button.onclick = () => select({ type: 'node', id: button.dataset.talent! }); });
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-core], [data-slot-core]').forEach(button => { button.onclick = () => select({ type: 'core', id: (button.dataset.core ?? button.dataset.slotCore)! }); });
    const buy = this.dialog.querySelector<HTMLButtonElement>('#talent-buy');
    if (buy) buy.onclick = () => this.transact(() => this.meta.buyTalent(this.selected.id), this.selected.id);
    const action = this.dialog.querySelector<HTMLButtonElement>('#core-action');
    if (action) action.onclick = () => {
      const id = this.selected.id, kind = action.dataset.action;
      if (kind === 'unlock') this.transact(() => this.meta.unlockCore(id), id);
      if (kind === 'equip') this.transact(() => this.meta.equipCore(id), id);
      if (kind === 'unequip') this.transact(() => this.meta.unequipCore(id), id);
    };
    const forget = this.dialog.querySelector<HTMLButtonElement>('#core-forget');
    if (forget) forget.onclick = () => this.transact(() => this.meta.forgetCore(this.selected.id), this.selected.id);
    const breakButton = this.dialog.querySelector<HTMLButtonElement>('#talent-breakthrough');
    if (breakButton) breakButton.onclick = () => this.transact(() => this.meta.breakthrough(), '');
    this.dialog.querySelector<HTMLButtonElement>('#talent-close')!.onclick = () => this.close();
    this.dialog.querySelector<HTMLButtonElement>('#talent-deploy')!.onclick = () => this.close(false);
    if (this.pointsBefore !== undefined) {
      const wallet = this.dialog.querySelector<HTMLElement>('#talent-points')!;
      void countUp(wallet, this.pointsBefore, points, { duration: 350, format: v => formatNumber(Math.round(v)) });
      pop(wallet.parentElement, 1.15, 220);
    }
    this.bought = undefined; this.revealed = new Set(); this.pointsBefore = undefined;
  }

  /** The map pans natively with a finger; with a mouse, drag it. */
  private bindMap() {
    const scroller = this.dialog.querySelector<HTMLElement>('.star-scroll')!;
    if (this.scroll) { scroller.scrollLeft = this.scroll.left; scroller.scrollTop = this.scroll.top; }
    else { scroller.scrollLeft = MAP_CENTRE - scroller.clientWidth / 2; scroller.scrollTop = MAP_CENTRE - scroller.clientHeight / 2; }
    let start: { x: number; y: number; left: number; top: number; id: number } | undefined;
    scroller.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, id: event.pointerId }; this.dragged = false;
    });
    scroller.addEventListener('pointermove', event => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!this.dragged && Math.hypot(dx, dy) > 6) { this.dragged = true; scroller.setPointerCapture(event.pointerId); scroller.classList.add('dragging'); }
      if (this.dragged) { scroller.scrollLeft = start.left - dx; scroller.scrollTop = start.top - dy; }
    });
    const end = () => { start = undefined; scroller.classList.remove('dragging'); setTimeout(() => { this.dragged = false; }, 0); };
    scroller.addEventListener('pointerup', end); scroller.addEventListener('pointercancel', end);
  }
}
