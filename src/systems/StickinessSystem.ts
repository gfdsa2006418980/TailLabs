export interface StickyTarget {
  readonly id: number;
  readonly speed: number;
  readonly angularSpeed: number;
  damp: (factor: number) => void;
  freeze: () => void;
}

export const STICKINESS = {
  delayMs: 3000,
  dampingTimeMs: 450,
  stopSpeed: 0.06,
  stopAngularSpeed: 0.003,
  stillDurationMs: 450,
} as const;

interface StickyEntry {
  target: StickyTarget;
  contacts: Set<number>;
  firstContactAt?: number;
  stillSince?: number;
  frozen: boolean;
}

/** Contact → 3-second grace → progressive damping → stable rest → static support. */
export class StickinessSystem {
  private entries = new Map<number, StickyEntry>();
  private supports = new Set<number>();
  private frozenTotal = 0;

  get frozenCount(): number { return this.frozenTotal; }

  addSupport(id: number): void { this.supports.add(id); }

  track(target: StickyTarget): void {
    this.entries.set(target.id, { target, contacts: new Set(), frozen: false });
  }

  beginContact(a: number, b: number, now: number): void {
    this.touch(a, b, now);
    this.touch(b, a, now);
  }

  endContact(a: number, b: number): void {
    this.entries.get(a)?.contacts.delete(b);
    this.entries.get(b)?.contacts.delete(a);
  }

  update(now: number, delta: number): boolean {
    let changed = false;
    const factor = Math.exp(-Math.min(delta, 50) / STICKINESS.dampingTimeMs);
    for (const entry of this.entries.values()) {
      if (entry.frozen || entry.firstContactAt === undefined) continue;
      if (entry.contacts.size === 0 || now - entry.firstContactAt < STICKINESS.delayMs) {
        entry.stillSince = undefined;
        continue;
      }
      entry.target.damp(factor);
      const stopped = entry.target.speed <= STICKINESS.stopSpeed
        && entry.target.angularSpeed <= STICKINESS.stopAngularSpeed;
      if (!stopped) {
        entry.stillSince = undefined;
        continue;
      }
      entry.stillSince ??= now;
      if (now - entry.stillSince < STICKINESS.stillDurationMs) continue;
      entry.target.freeze();
      entry.frozen = true;
      this.frozenTotal += 1;
      changed = true;
    }
    return changed;
  }

  clear(): void {
    this.entries.clear();
    this.frozenTotal = 0;
  }

  private touch(id: number, other: number, now: number): void {
    const entry = this.entries.get(id);
    if (!entry || entry.frozen || (!this.supports.has(other) && !this.entries.has(other))) return;
    entry.contacts.add(other);
    entry.firstContactAt ??= now;
  }
}
