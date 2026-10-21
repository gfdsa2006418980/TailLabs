import { canBreakthrough, compileTalents, isRevealed, talentById, talentCost } from './Talents.ts';

/** Cloudflare boundary: this DTO can never contain a Run. No cloud service is required to play. */
export interface TalentTree {
  tier: number; maxNodeLevel: number; nodes: Record<string, number>;
  unlockedCoreTalents: string[]; activeCoreTalents: string[];
}
export interface MetaSave { version: 1; TalentPoints: number; TalentTreeJson: string; HighestClearedWave: number }
export interface MetaProgressionPort { load(): Promise<MetaSave>; save(meta: MetaSave): Promise<void> }
export const META_KEY = 'taillabs.tl003.meta.v1';
export const emptyTree = (): TalentTree => ({ tier: 1, maxNodeLevel: 10, nodes: {}, unlockedCoreTalents: [], activeCoreTalents: [] });
export const emptyMeta = (): MetaSave => ({ version: 1, TalentPoints: 0, TalentTreeJson: JSON.stringify(emptyTree()), HighestClearedWave: 0 });
const nonnegativeInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
export function normalizeMeta(value: unknown): MetaSave {
  if (!value || typeof value !== 'object') return emptyMeta();
  const input = value as Partial<MetaSave>;
  if (input.version !== 1) return emptyMeta();
  let tree = emptyTree();
  try {
    const raw = JSON.parse(input.TalentTreeJson ?? '{}');
    if (raw && typeof raw === 'object') {
      tree.tier = Math.max(1, nonnegativeInt(raw.tier));
      tree.maxNodeLevel = Math.max(10, nonnegativeInt(raw.maxNodeLevel));
      if (raw.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes)) {
        tree.nodes = Object.fromEntries(Object.entries(raw.nodes).filter(([k]) => /^[a-z_]+$/.test(k)).map(([k, v]) => [k, nonnegativeInt(v)]));
      }
      tree.unlockedCoreTalents = Array.isArray(raw.unlockedCoreTalents) ? [...new Set<string>(raw.unlockedCoreTalents.filter((v: unknown) => typeof v === 'string'))] : [];
      tree.activeCoreTalents = Array.isArray(raw.activeCoreTalents) ? [...new Set<string>(raw.activeCoreTalents.filter((v: unknown) => typeof v === 'string' && tree.unlockedCoreTalents.includes(v)))].slice(0, 3) : [];
    }
  } catch { /* Corrupt mirror must not prevent a new run. */ }
  return { version: 1, TalentPoints: nonnegativeInt(input.TalentPoints), TalentTreeJson: JSON.stringify(tree), HighestClearedWave: nonnegativeInt(input.HighestClearedWave) };
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
    if (this.inRun) return { ok: false, message: '請在本局結束後投資天賦。' };
    this.refresh();
    const node = talentById(id), tree = this.tree;
    if (!node || !isRevealed(tree, node.id)) return { ok: false, message: '先對相鄰節點投入第 1 點，即可探索這個位置。' };
    const level = tree.nodes[node.id] ?? 0;
    if (level >= tree.maxNodeLevel) return { ok: false, message: '此節點已達本階上限，突破後可繼續提升。' };
    const cost = talentCost(level);
    if (this.value.TalentPoints < cost) return { ok: false, message: '天賦點不足，再守一局取得更多點數。' };
    tree.nodes[node.id] = level + 1;
    this.persist({ ...this.value, TalentPoints: this.value.TalentPoints - cost, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `${node.name}提升至 Lv.${level + 1}。${level === 0 ? '相鄰節點已揭露。' : '成長將在下一局生效。'}` };
  }
  breakthrough(): { ok: boolean; message: string } {
    if (this.inRun) return { ok: false, message: '請在本局結束後突破星盤。' };
    this.refresh(); const tree = this.tree;
    if (!canBreakthrough(tree)) return { ok: false, message: `任一節點達到 Lv.${tree.maxNodeLevel} 後即可突破。` };
    tree.tier++; tree.maxNodeLevel += 10;
    this.persist({ ...this.value, TalentTreeJson: JSON.stringify(tree) });
    return { ok: true, message: `星盤突破至第 ${tree.tier} 階，節點上限 Lv.${tree.maxNodeLevel}。既有等級完整保留。` };
  }
  settle(run: object, points: number, clearedWave: number): boolean {
    if (this.settled.has(run)) return false;
    this.settled.add(run);
    this.inRun = false; this.refresh();
    this.persist({ ...this.value, TalentPoints: this.value.TalentPoints + nonnegativeInt(points), HighestClearedWave: Math.max(this.value.HighestClearedWave, nonnegativeInt(clearedWave)) });
    return true;
  }
}
