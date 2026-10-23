import { canBreakthrough, compileTalents, coreById, coreConflicts, coreSlots, isCoreRevealed, isRevealed, talentById, talentCost } from './Talents.ts';

/** Cloudflare boundary: this DTO can never contain a Run. No cloud service is required to play. */
export interface TalentTree {
  tier: number; maxNodeLevel: number; nodes: Record<string, number>;
  unlockedCoreTalents: string[]; activeCoreTalents: string[];
  /** v2: the best stage ever cleared (opens core slots) and the highest danger level unlocked (0 = normal only). */
  bestStage?: number; danger?: number;
  /** Blueprint layout the node levels belong to (TREE_LAYOUT); older layouts are refunded on load. */
  layout?: number;
}
/** 2: the ten-branch, 52-node blueprint (2026-10-24). */
export const TREE_LAYOUT = 2;
/** Depth of every node of the old 47-node layout (layout 1), for its refund: cost = ceil(1.12^level × (1 + 0.35 × (depth − 1))). */
const LEGACY_DEPTH: Record<string, number> = {
  mercenary_damage: 0, kinetic_damage: 1, crit_rate: 2, crit_power: 3, pierce_training: 4, impact: 5, armor_breaker: 6, fire_dot: 1, slow_burn: 2,
  igniter: 3, firezone: 4, fuel_stock: 5, corrosion_power: 1, corrosion_time: 2, eroder: 3, toxic_residue: 4, bio_shield: 5, shock_power: 1,
  shock_time: 2, laser_focus: 3, coil_cooling: 4, stun_field: 5, attack_speed: 1, rifle_specialist: 2, flame_specialist: 3, tesla_specialist: 4,
  recruiter: 5, veteran: 6, active_skill_damage: 1, active_skill_haste: 2, skill_reach: 3, grenade_payload: 4, molotov_payload: 5, laser_width: 6,
  barricade_health: 1, repair_efficiency: 2, plating: 3, spikes: 4, builder: 5, field_medic: 6, economy_income: 1, wave_bonus: 2, bounty: 3,
  starting_funds: 4, logistics: 5, supply_line: 6, lucky: 7,
};
/** Talent points spent on old-layout node levels. */
export function legacyRefund(nodes: Record<string, number>) {
  let points = 0;
  for (const [id, level] of Object.entries(nodes)) {
    const base = 1 + 0.35 * Math.max(0, (LEGACY_DEPTH[id] ?? 1) - 1);
    for (let l = 0; l < level; l++) points += Math.ceil(1.12 ** l * base);
  }
  return points;
}
export interface MetaSave { version: 1; TalentPoints: number; TalentTreeJson: string; HighestClearedWave: number }
export interface MetaProgressionPort { load(): Promise<MetaSave>; save(meta: MetaSave): Promise<void> }
export const META_KEY = 'taillabs.tl003.meta.v1';
export const emptyTree = (): TalentTree => ({ tier: 1, maxNodeLevel: 10, nodes: {}, unlockedCoreTalents: [], activeCoreTalents: [], bestStage: 0, danger: 0, layout: TREE_LAYOUT });
export const emptyMeta = (): MetaSave => ({ version: 1, TalentPoints: 0, TalentTreeJson: JSON.stringify(emptyTree()), HighestClearedWave: 0 });
const nonnegativeInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
export function normalizeMeta(value: unknown): MetaSave {
  if (!value || typeof value !== 'object') return emptyMeta();
  const input = value as Partial<MetaSave>;
  if (input.version !== 1) return emptyMeta();
  let tree = emptyTree(), refund = 0;
  try {
    const raw = JSON.parse(input.TalentTreeJson ?? '{}');
    if (raw && typeof raw === 'object') {
      tree.tier = Math.max(1, nonnegativeInt(raw.tier));
      tree.maxNodeLevel = Math.max(10, nonnegativeInt(raw.maxNodeLevel));
      tree.bestStage = nonnegativeInt(raw.bestStage); tree.danger = nonnegativeInt(raw.danger);
      if (raw.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes)) {
        tree.nodes = Object.fromEntries(Object.entries(raw.nodes).filter(([k]) => /^[a-z_]+$/.test(k)).map(([k, v]) => [k, nonnegativeInt(v)]));
      }
      tree.unlockedCoreTalents = Array.isArray(raw.unlockedCoreTalents) ? [...new Set<string>(raw.unlockedCoreTalents.filter((v: unknown) => typeof v === 'string' && !!coreById(v)))] : [];
      // An older blueprint layout: every node level is refunded in full and the new tree starts empty (tier, cores and records kept).
      if (raw.layout !== TREE_LAYOUT) { refund = legacyRefund(tree.nodes); tree.nodes = {}; }
      tree.activeCoreTalents = Array.isArray(raw.activeCoreTalents) ? [...new Set<string>(raw.activeCoreTalents.filter((v: unknown) => typeof v === 'string' && tree.unlockedCoreTalents.includes(v)))].slice(0, 3) : [];
    }
  } catch { /* Corrupt mirror must not prevent a new run. */ }
  return { version: 1, TalentPoints: nonnegativeInt(input.TalentPoints) + refund, TalentTreeJson: JSON.stringify(tree), HighestClearedWave: nonnegativeInt(input.HighestClearedWave) };
}
export class LocalMetaMirror {
  value: MetaSave;
  persistent = true;
  inRun = false;
  private storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private settled = new WeakSet<object>();
  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage; this.value = emptyMeta();
    try { this.value = normalizeMeta(JSON.parse(storage?.getItem(META_KEY) ?? 'null')); }
    catch { this.persistent = false; }
    if (!storage) this.persistent = false;
  }
  get tree(): TalentTree { return JSON.parse(this.value.TalentTreeJson) as TalentTree; }
  get effects() { return compileTalents(this.tree); }
  refresh() {
    if (!this.storage || !this.persistent) return;
    try { this.value = normalizeMeta(JSON.parse(this.storage.getItem(META_KEY) ?? 'null')); }
    catch { this.persistent = false; }
  }
  private persist(value: MetaSave) {
    this.value = normalizeMeta(value);
    try { this.storage?.setItem(META_KEY, JSON.stringify(this.value)); }
    catch { this.persistent = false; }
  }
  beginRun() {
    if (this.inRun) return false;
    this.refresh(); this.inRun = true; return true;
  }
  buyTalent(id: string): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '戰鬥中。回營再分配戰功。' };
    this.refresh();
    const node = talentById(id), tree = this.tree;
    if (!node || !isRevealed(tree, node.id)) return { ok: false, message: '區域未偵察。先升級相鄰節點。' };
    const level = tree.nodes[node.id] ?? 0;
    if (level >= tree.maxNodeLevel) return { ok: false, message: '已達本階上限。晉階後再升。' };
    const cost = talentCost(level, node.id);
    if (this.value.TalentPoints < cost) return { ok: false, message: '戰功不足，再撐一場。' };
    tree.nodes[node.id] = level + 1;
    this.persist({ ...this.value, TalentPoints: this.value.TalentPoints - cost, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `${node.name}升至 Lv${level + 1}。${level === 0 ? '相鄰區域已偵察。' : '下一局生效。'}` };
  }
  // ---------- tactical cores: unlock with points, swap freely between runs, forget for a full refund ----------
  unlockCore(id: string): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '戰鬥中。回營再調整核心。' };
    this.refresh(); const core = coreById(id), tree = this.tree;
    if (!core || !isCoreRevealed(tree, id)) return { ok: false, message: '區域未偵察。先升級相鄰節點。' };
    if (tree.unlockedCoreTalents.includes(id)) return { ok: false, message: '此核心已解鎖。' };
    if (this.value.TalentPoints < core.cost) return { ok: false, message: `戰功不足，還差 ${core.cost - this.value.TalentPoints} ★。` };
    tree.unlockedCoreTalents.push(id);
    this.persist({ ...this.value, TalentPoints: this.value.TalentPoints - core.cost, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `${core.name}已解鎖。裝上槽位才生效。` };
  }
  forgetCore(id: string): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '戰鬥中。回營再調整核心。' };
    this.refresh(); const core = coreById(id), tree = this.tree;
    if (!core || !tree.unlockedCoreTalents.includes(id)) return { ok: false, message: '此核心未解鎖。' };
    tree.unlockedCoreTalents = tree.unlockedCoreTalents.filter(c => c !== id);
    tree.activeCoreTalents = tree.activeCoreTalents.filter(c => c !== id);
    this.persist({ ...this.value, TalentPoints: this.value.TalentPoints + core.cost, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `已遺忘${core.name}。退回 ${core.cost} 戰功。` };
  }
  equipCore(id: string): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '戰鬥中。回營再調整核心。' };
    this.refresh(); const core = coreById(id), tree = this.tree;
    if (!core || !tree.unlockedCoreTalents.includes(id)) return { ok: false, message: '先解鎖此核心。' };
    if (tree.activeCoreTalents.includes(id)) return { ok: false, message: '此核心已裝上。' };
    const conflicts = coreConflicts(tree, id);
    if (conflicts.length) return { ok: false, message: `與「${conflicts.map(c => coreById(c)!.name).join('、')}」互斥，先卸下。` };
    if (tree.activeCoreTalents.length >= coreSlots(tree)) return { ok: false, message: '此槽已滿，先卸下一個核心。' };
    tree.activeCoreTalents.push(id);
    this.persist({ ...this.value, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `${core.name}已裝上。下一局生效。` };
  }
  unequipCore(id: string): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '戰鬥中。回營再調整核心。' };
    this.refresh(); const tree = this.tree;
    if (!tree.activeCoreTalents.includes(id)) return { ok: false, message: '此核心未裝上。' };
    tree.activeCoreTalents = tree.activeCoreTalents.filter(c => c !== id);
    this.persist({ ...this.value, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `${coreById(id)?.name ?? '核心'}已卸下。` };
  }
  breakthrough(): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '戰鬥中。回營再晉階。' };
    this.refresh(); const tree = this.tree;
    if (!canBreakthrough(tree)) return { ok: false, message: `所有節點都達 Lv${tree.maxNodeLevel} 才能晉階。` };
    tree.tier++; tree.maxNodeLevel += 10;
    this.persist({ ...this.value, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `藍圖晉階 T${tree.tier}。節點上限 Lv${tree.maxNodeLevel}，等級全數保留。` };
  }
  /** Ends a run once: adds its points, records the best stage, and a full clear unlocks the next danger level. */
  settle(run: object, points: number, clearedWave: number, outcome: { victory?: boolean; danger?: number } = {}): boolean {
    if (this.settled.has(run)) return false;
    this.settled.add(run);
    this.inRun = false; this.refresh();
    const tree = this.tree;
    tree.bestStage = Math.max(tree.bestStage ?? 0, nonnegativeInt(clearedWave));
    if (outcome.victory) tree.danger = Math.max(tree.danger ?? 0, nonnegativeInt(outcome.danger ?? 0) + 1);
    this.persist({ ...this.value, TalentPoints: this.value.TalentPoints + nonnegativeInt(points), HighestClearedWave: Math.max(this.value.HighestClearedWave, nonnegativeInt(clearedWave)), TalentTreeJson: JSON.stringify(tree) });
    return true;
  }
}
