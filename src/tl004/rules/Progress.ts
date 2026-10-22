/** Saved level results. Stored as one versioned JSON value in localStorage. */
export interface LevelRecord { stars: number; best: number }
export interface ProgressData { version: 1; levels: Record<string, LevelRecord> }

export const PROGRESS_KEY = 'taillabs.tl004.progress.v1';
const TEMP_KEY = `${PROGRESS_KEY}.writing`;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function empty(): ProgressData { return { version: 1, levels: {} }; }

function sanitize(raw: unknown): ProgressData {
  const data = empty();
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return data;
  const levels = (raw as { levels?: unknown }).levels;
  if (!levels || typeof levels !== 'object') return data;
  for (const [id, record] of Object.entries(levels as Record<string, unknown>)) {
    if (!record || typeof record !== 'object') continue;
    const stars = Number((record as LevelRecord).stars), best = Number((record as LevelRecord).best);
    if (!Number.isFinite(stars) || !Number.isFinite(best)) continue;
    data.levels[id] = { stars: Math.max(0, Math.min(3, Math.floor(stars))), best: Math.max(0, Math.floor(best)) };
  }
  return data;
}

/**
 * Player progress with crash-safe saving: write a temporary copy first, then the real key.
 * Works without storage (private mode): progress then lasts only for this page session.
 */
export class Progress {
  private data: ProgressData;
  private readonly store: KeyValueStore | undefined;
  /** False when saving failed (shown to the player). */
  persistent: boolean;

  constructor(store: KeyValueStore | undefined) {
    this.store = store;
    this.data = empty();
    this.persistent = Boolean(store);
    if (!store) return;
    try {
      const raw = store.getItem(PROGRESS_KEY) ?? store.getItem(TEMP_KEY);
      if (raw) this.data = sanitize(JSON.parse(raw));
    } catch {
      // Unreadable save: keep a copy for recovery and start fresh.
      try { const raw = store.getItem(PROGRESS_KEY); if (raw) store.setItem(`${PROGRESS_KEY}.broken`, raw); } catch { /* ignore */ }
      this.data = empty();
    }
  }

  record(levelId: string): LevelRecord | undefined { return this.data.levels[levelId]; }

  stars(levelId: string): number { return this.data.levels[levelId]?.stars ?? 0; }

  totalStars(levelIds: readonly string[]): number { return levelIds.reduce((sum, id) => sum + this.stars(id), 0); }

  /** Level 1 is always open; every other level opens once the previous one is cleared. */
  isUnlocked(levelIds: readonly string[], index: number): boolean {
    if (index <= 0) return true;
    return this.stars(levelIds[index - 1]) >= 1;
  }

  /** Keep the best score and best stars; returns whether either improved. */
  submit(levelId: string, score: number, stars: number): { newBest: boolean; moreStars: boolean } {
    const previous = this.data.levels[levelId] ?? { stars: 0, best: 0 };
    const next = { stars: Math.max(previous.stars, stars), best: Math.max(previous.best, score) };
    const result = { newBest: score > previous.best, moreStars: stars > previous.stars };
    if (result.newBest || result.moreStars || !this.data.levels[levelId]) {
      this.data.levels[levelId] = next;
      this.save();
    }
    return result;
  }

  private save(): void {
    if (!this.store) return;
    const text = JSON.stringify(this.data);
    try {
      this.store.setItem(TEMP_KEY, text);
      this.store.setItem(PROGRESS_KEY, text);
      this.store.removeItem(TEMP_KEY);
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
  }
}
