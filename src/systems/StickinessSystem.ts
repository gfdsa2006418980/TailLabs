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
  dampingRampMs: 750,
  stopSpeed: 0.06,
  stopAngularSpeed: 0.003,
  stillDurationMs: 450,
} as const;

interface StickyEntry {
  target: StickyTarget;
  contacts: Set<string>;
  firstContactAt?: number;
  stillSince?: number;
  frozen: boolean;
  dampingMs: number;
  suspended?: boolean;
  freshAfterRescue?: boolean;
}

/** Contact → challenge-specific delay → progressive damping → stable rest → static support. */
export class StickinessSystem {
  private entries = new Map<number, StickyEntry>();
  private supports = new Set<number>();
  private frozenTotal = 0;
  private delayMs: number = STICKINESS.delayMs;

  get frozenCount(): number { return this.frozenTotal; }

  setDelayMs(delayMs: number): void { this.delayMs = Math.max(0, delayMs); }

  addSupport(id: number): void { this.supports.add(id); }
  removeSupport(id: number): void { this.supports.delete(id); }

  track(target: StickyTarget): void {
    this.entries.set(target.id, { target, contacts: new Set(), frozen: false, dampingMs: 0 });
  }

  suspend(id: number): void {
    const entry = this.entries.get(id);
    if (!entry || entry.frozen) return;
    entry.suspended = true;
    entry.freshAfterRescue = true;
    entry.firstContactAt = undefined;
    entry.stillSince = undefined;
    entry.dampingMs = 0;
  }

  resume(id: number): void {
    const entry = this.entries.get(id);
    if (entry) { entry.suspended = false; entry.firstContactAt = undefined; }
  }

  beginContact(a: number, b: number, now: number, contactId = `${Math.min(a, b)}:${Math.max(a, b)}`): void {
    this.touch(a, b, now, contactId);
    this.touch(b, a, now, contactId);
  }

  endContact(a: number, b: number, contactId = `${Math.min(a, b)}:${Math.max(a, b)}`): void {
    this.removeContact(a, contactId);
    this.removeContact(b, contactId);
  }

  update(now: number, delta: number): boolean {
    let changed = false;
    for (const entry of this.entries.values()) {
      if (entry.frozen || entry.suspended) continue;
      if (entry.contacts.size === 0) { entry.stillSince = undefined; continue; }
      entry.firstContactAt ??= now;
      if (now - entry.firstContactAt < this.delayMs) {
        entry.stillSince = undefined;
        continue;
      }
      const elapsed = Math.min(delta, 50);
      entry.dampingMs += elapsed;
      // Gradually thicken the glue so gravity-induced rocking also comes to rest.
      const strength = 1 + (entry.dampingMs / STICKINESS.dampingRampMs) ** 2;
      const factor = Math.exp(-elapsed * strength / STICKINESS.dampingTimeMs);
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

  private removeContact(id: number, contactId: string): void {
    const entry = this.entries.get(id);
    entry?.contacts.delete(contactId);
    if (entry?.freshAfterRescue && !entry.contacts.size) entry.firstContactAt = undefined;
  }

  private touch(id: number, other: number, now: number, contactId: string): void {
    const entry = this.entries.get(id);
    if (!entry || entry.frozen || (!this.supports.has(other) && !this.entries.has(other))) return;
    entry.contacts.add(contactId);
    if (!entry.suspended) entry.firstContactAt ??= now;
  }
}
