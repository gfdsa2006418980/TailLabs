import type { RunnerEntry } from './RunnerLeaderboard';
import type { RankingPage, RankingPeriod } from '../systems/LeaderboardPaging';

const API_URL = (import.meta.env.VITE_LEADERBOARD_API_URL ?? '').replace(/\/$/, '');

export interface SharedRunnerEntry extends RunnerEntry {
  playerName: string;
  coins: number;
  multiplier: number;
  score: number;
}

export class RunnerSharedLeaderboard {
  private readonly pendingSaves = new Map<string, Promise<number | null>>();
  get enabled(): boolean { return API_URL.length > 0; }

  async page(period: RankingPeriod, page = 1): Promise<RankingPage<SharedRunnerEntry>> {
    const response = await fetch(`${API_URL}/api/runner-leaderboard?period=${period}&page=${page}`);
    if (!response.ok) throw new Error(`Runner leaderboard request failed (${response.status})`);
    return await response.json() as RankingPage<SharedRunnerEntry>;
  }

  save(entry: RunnerEntry & { playerName: string }): Promise<number | null> {
    const previous = this.pendingSaves.get(entry.id) ?? Promise.resolve(null);
    const next = previous.catch(() => null).then(async () => {
      const response = await fetch(`${API_URL}/api/runner-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          playerName: entry.playerName,
          distance: entry.distance,
          elapsedMilliseconds: Math.round(entry.elapsedMilliseconds),
          coins: entry.coins ?? 0,
          multiplier: entry.multiplier ?? 1,
        }),
      });
      if (!response.ok) throw new Error(`Runner leaderboard save failed (${response.status})`);
      const result = await response.json() as { rank?: number | null };
      return result.rank ?? null;
    });
    this.pendingSaves.set(entry.id, next);
    void next.then(() => {
      if (this.pendingSaves.get(entry.id) === next) this.pendingSaves.delete(entry.id);
    }, () => {
      if (this.pendingSaves.get(entry.id) === next) this.pendingSaves.delete(entry.id);
    });
    return next;
  }
}
