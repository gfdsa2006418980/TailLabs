import type { LeaderboardEntry } from './LeaderboardSystem';

const API_URL = (import.meta.env.VITE_LEADERBOARD_API_URL ?? '').replace(/\/$/, '');

interface ApiEntry extends Omit<LeaderboardEntry, 'completed'> {
  completed: boolean | number;
}

export class SharedLeaderboard {
  private readonly pendingSaves = new Map<string, Promise<number | null>>();
  get enabled(): boolean { return API_URL.length > 0; }

  async top(target: number): Promise<LeaderboardEntry[]> {
    const response = await fetch(`${API_URL}/api/leaderboard?target=${target}`);
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
    const result = await response.json() as { entries?: ApiEntry[] };
    return (result.entries ?? []).map((entry) => ({ ...entry, completed: Boolean(entry.completed) }));
  }

  save(entry: LeaderboardEntry): Promise<number | null> {
    const previous = this.pendingSaves.get(entry.id) ?? Promise.resolve(null);
    const next = previous.catch(() => null).then(async () => {
      const response = await fetch(`${API_URL}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          playerName: entry.playerName,
          target: entry.target,
          placedCount: entry.placedCount,
          droppedCount: entry.droppedCount,
          elapsedMilliseconds: Math.round(entry.elapsedMilliseconds),
          maxHeight: Math.max(0, Math.floor(entry.maxHeight)),
        }),
      });
      if (!response.ok) throw new Error(`Leaderboard save failed (${response.status})`);
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
