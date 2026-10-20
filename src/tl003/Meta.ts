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
  private storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private settled = new WeakSet<object>();
  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage; this.value = emptyMeta();
    try { this.value = normalizeMeta(JSON.parse(storage?.getItem(META_KEY) ?? 'null')); }
    catch { this.persistent = false; }
    if (!storage) this.persistent = false;
  }
  settle(run: object, points: number, clearedWave: number): boolean {
    if (this.settled.has(run)) return false;
    this.settled.add(run);
    this.value = normalizeMeta({ ...this.value, TalentPoints: this.value.TalentPoints + nonnegativeInt(points), HighestClearedWave: Math.max(this.value.HighestClearedWave, nonnegativeInt(clearedWave)) });
    try { this.storage?.setItem(META_KEY, JSON.stringify(this.value)); }
    catch { this.persistent = false; }
    return true;
  }
}
