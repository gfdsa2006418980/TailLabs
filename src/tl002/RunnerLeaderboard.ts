import { legacyMultiplier, runnerScore } from './RunnerScore.ts';

export interface RunnerEntry {
  id: string;
  distance: number;
  elapsedMilliseconds: number;
  coins?: number;
  score?: number;
  multiplier?: number;
  createdAt: string;
}
export interface ScoredRunnerEntry extends RunnerEntry { score: number; multiplier: number }
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const RUNNER_BOARD_KEY = 'taillabs.tl002.leaderboard.v1';

export function compareRunnerEntries(a: RunnerEntry, b: RunnerEntry): number {
  return scored(b).score - scored(a).score || a.elapsedMilliseconds - b.elapsedMilliseconds
    || (b.coins ?? 0) - (a.coins ?? 0) || b.distance - a.distance
    || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function scored(entry: RunnerEntry): ScoredRunnerEntry {
  const multiplier = entry.multiplier ?? legacyMultiplier(entry.elapsedMilliseconds);
  return { ...entry, multiplier, score: runnerScore(entry.distance, entry.coins ?? 0, multiplier) };
}

function valid(value: unknown): value is RunnerEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as RunnerEntry;
  return typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 100
    && Number.isSafeInteger(row.distance) && row.distance >= 0
    && Number.isSafeInteger(row.elapsedMilliseconds) && row.elapsedMilliseconds >= 0
    && (row.coins === undefined || Number.isSafeInteger(row.coins) && row.coins >= 0)
    && (row.score === undefined || Number.isSafeInteger(row.score) && row.score >= 0)
    && (row.multiplier === undefined || Number.isFinite(row.multiplier) && row.multiplier >= 1 && row.multiplier <= 5)
    && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt));
}

export class RunnerLeaderboard {
  private entries: ScoredRunnerEntry[] = [];
  persistent: boolean;
  private readonly storage?: StorageLike;
  constructor(storage?: StorageLike) {
    this.storage = storage;
    this.persistent = !!storage;
    this.refresh();
  }

  private refresh(): void {
    if (!this.storage || !this.persistent) return;
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(RUNNER_BOARD_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return;
      const merged = new Map(this.entries.map((entry) => [entry.id, entry]));
      for (const row of parsed.slice(0, 100).filter(valid)) merged.set(row.id, scored(row));
      this.entries = [...merged.values()].sort(compareRunnerEntries).slice(0, 10);
    } catch { this.persistent = false; }
  }

  top(): ScoredRunnerEntry[] { this.refresh(); return this.entries.map((row) => ({ ...row })); }
  get best(): number { return this.top()[0]?.score ?? 0; }

  save(entry: RunnerEntry): number | undefined {
    if (!valid(entry)) return;
    this.refresh();
    this.entries = [...this.entries.filter((row) => row.id !== entry.id), scored(entry)]
      .sort(compareRunnerEntries).slice(0, 10);
    try {
      if (this.storage) {
        this.storage.setItem(RUNNER_BOARD_KEY, JSON.stringify(this.entries));
        this.persistent = true;
      }
    } catch { this.persistent = false; }
    const rank = this.entries.findIndex((row) => row.id === entry.id);
    return rank < 0 ? undefined : rank + 1;
  }
}
