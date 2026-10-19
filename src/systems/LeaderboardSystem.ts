import type { RoundResult } from './RoundSession.ts';
import { filterRankingPeriod } from './LeaderboardPaging.ts';
import type { RankingPeriod } from './LeaderboardPaging.ts';

export interface LeaderboardEntry extends RoundResult { id: string; playerName: string; createdAt: string; }
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const KEY = 'taillabs.tl001.leaderboard.v1';
const TARGETS = [10, 50, 100, 500];
const MAX_LEADERBOARD_ENTRIES = 100;
const MAX_STORED_ENTRIES = TARGETS.length * MAX_LEADERBOARD_ENTRIES * 2;
// LAN previews over HTTP may not expose crypto.randomUUID; this is a local record id.
export function recordId(uuid?: () => string): string { return uuid?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function playerName(value: string, anonymousName = '匿名飼主'): string { return Array.from(value.trim()).slice(0, 12).join('') || anonymousName; }
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (a.completed !== b.completed) return Number(b.completed) - Number(a.completed);
  if (a.completed) return b.score - a.score || a.elapsedMilliseconds - b.elapsedMilliseconds || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  return b.placedCount - a.placedCount || b.score - a.score || b.elapsedMilliseconds - a.elapsedMilliseconds || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
function valid(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as LeaderboardEntry;
  return typeof entry.id === 'string' && entry.id.length <= 100 && typeof entry.playerName === 'string'
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt))
    && typeof entry.completed === 'boolean' && TARGETS.includes(entry.target)
    && Number.isInteger(entry.placedCount) && entry.placedCount >= 0 && entry.placedCount <= entry.target
    && Number.isInteger(entry.droppedCount) && entry.droppedCount >= entry.placedCount && entry.droppedCount <= entry.target
    && (!entry.completed || entry.placedCount === entry.target)
    && ['score', 'elapsedMilliseconds', 'maxHeight', 'baseScore', 'heightBonus', 'speedBonus']
      .every((key) => Number.isFinite(entry[key as keyof RoundResult]) && Number(entry[key as keyof RoundResult]) >= 0 && Number(entry[key as keyof RoundResult]) <= 1e10);
}
export class LeaderboardSystem {
  private entries: LeaderboardEntry[] = [];
  persistent = true;
  private readonly storage?: StorageLike;
  constructor(storage?: StorageLike) {
    this.storage = storage;
    this.persistent = !!storage;
    this.refresh();
  }
  private refresh(): void {
    if (!this.storage || !this.persistent) return;
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(KEY) ?? '[]');
      if (Array.isArray(parsed)) {
        const unique = new Map<string, LeaderboardEntry>();
        for (const row of parsed.slice(0, MAX_STORED_ENTRIES).filter(valid)) unique.set(row.id, { ...row, playerName: playerName(row.playerName) });
        this.entries = [...unique.values()];
      }
    } catch { this.persistent = false; }
  }
  private sorted(target: number, period: RankingPeriod = 'history', now = Date.now()): LeaderboardEntry[] {
    return filterRankingPeriod(this.entries.filter((e) => e.target === target), period, now).sort(compareEntries).slice(0, MAX_LEADERBOARD_ENTRIES);
  }
  top(target: number, period: RankingPeriod = 'history', now = Date.now()): LeaderboardEntry[] { this.refresh(); return this.sorted(target, period, now); }
  save(entry: LeaderboardEntry): number | undefined {
    if (!valid(entry)) return;
    // Merge with the latest stored results when several game tabs are open.
    this.refresh();
    this.entries = this.entries.filter((e) => e.id !== entry.id);
    this.entries.push({ ...entry, playerName: playerName(entry.playerName) });
    const now = Date.now();
    this.entries = TARGETS.flatMap((target) => [...new Map(
      [...this.sorted(target), ...this.sorted(target, 'daily', now)].map((row) => [row.id, row])).values()]);
    try { if (this.storage) { this.storage.setItem(KEY, JSON.stringify(this.entries)); this.persistent = true; } else this.persistent = false; }
    catch { this.persistent = false; }
    const rank = this.sorted(entry.target).findIndex((e) => e.id === entry.id);
    return rank < 0 ? undefined : rank + 1;
  }
}
